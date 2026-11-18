"""Tests for Call Transfer Endpoint and Cross-Tenant Security Boundary."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import PhoneNumber, Tenant

client = TestClient(app)


@pytest.fixture
def transfer_tenants() -> Any:
    """Fixture providing two isolated tenants with active calls."""
    db = SessionLocal()
    try:
        suffix_a = uuid.uuid4().hex[:6]
        tenant_a = Tenant(
            name=f"Transfer Plumbing {suffix_a}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant_a)
        db.flush()

        phone_a = PhoneNumber(
            tenant_id=tenant_a.id,
            e164=f"+1512888{uuid.uuid4().int % 9000 + 1000}",
            provider="twilio",
            status="active",
        )
        db.add(phone_a)

        suffix_b = uuid.uuid4().hex[:6]
        tenant_b = Tenant(
            name=f"Transfer HVAC {suffix_b}",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant_b)
        db.flush()

        phone_b = PhoneNumber(
            tenant_id=tenant_b.id,
            e164=f"+1512999{uuid.uuid4().int % 9000 + 1000}",
            provider="telnyx",
            status="active",
        )
        db.add(phone_b)
        db.commit()

        # Create active calls
        call_a = Call(
            tenant_id=tenant_a.id,
            call_id=f"call_a_{suffix_a}",
            caller_number="+15551112222",
            dialed_number=phone_a.e164,
            direction="inbound",
            outcome="in_progress",
        )
        call_b = Call(
            tenant_id=tenant_b.id,
            call_id=f"call_b_{suffix_b}",
            caller_number="+15553334444",
            dialed_number=phone_b.e164,
            direction="inbound",
            outcome="in_progress",
        )
        db.add_all([call_a, call_b])
        db.commit()

        token_a = create_access_token({"sub": "agent", "role": "agent", "tenant_id": tenant_a.id})
        token_b = create_access_token({"sub": "agent", "role": "agent", "tenant_id": tenant_b.id})

        yield {
            "tenant_a_id": tenant_a.id,
            "call_a_id": call_a.call_id,
            "token_a": token_a,
            "tenant_b_id": tenant_b.id,
            "call_b_id": call_b.call_id,
            "token_b": token_b,
        }
    finally:
        db.query(Call).filter(Call.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
        db.query(PhoneNumber).filter(PhoneNumber.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
        db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
        db.commit()
        db.close()


def test_transfer_call_authorized_success(transfer_tenants: dict[str, Any]) -> None:
    """Verify call transfer endpoint successfully records transfer audit and updates call outcome."""
    call_id = transfer_tenants["call_a_id"]
    token = transfer_tenants["token_a"]

    resp = client.post(
        "/api/v1/internal/calls/transfer",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "call_id": call_id,
            "target_number": "+15125559999",
            "reason": "caller_requested_human",
            "priority": "emergency",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["status"] == "transferred"
    assert data["target_number"] == "+15125559999"

    # Verify call outcome in database
    db = SessionLocal()
    try:
        call = db.query(Call).filter(Call.call_id == call_id).first()
        assert call is not None
        assert call.outcome == "transferred"
        assert "transferred" in (call.tags or [])
        assert "emergency_transfer" in (call.tags or [])
    finally:
        db.close()


def test_transfer_call_cross_tenant_rejected(transfer_tenants: dict[str, Any]) -> None:
    """Verify Tenant A's token cannot transfer Tenant B's call."""
    call_b_id = transfer_tenants["call_b_id"]
    token_a = transfer_tenants["token_a"]

    resp = client.post(
        "/api/v1/internal/calls/transfer",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "call_id": call_b_id,
            "target_number": "+15125559999",
            "reason": "unauthorized_hijack",
        },
    )
    assert resp.status_code == 403
    assert "Cross-tenant transfer forbidden" in resp.json()["detail"]


def test_transfer_call_unauthorized_token_missing() -> None:
    """Verify endpoint rejects request without call-scoped token."""
    resp = client.post(
        "/api/v1/internal/calls/transfer",
        json={"call_id": "call_123", "target_number": "+15125550000"},
    )
    assert resp.status_code == 401
