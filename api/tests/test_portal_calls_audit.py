"""Tests for Portal Calls Extensions: Summary extraction, Service requested, and Persistent Follow-up status."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.call import Call
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User

init_db()

client = TestClient(app)


@pytest.fixture
def portal_audit_setup() -> Any:
    """Fixture creating two tenants with sample calls having messages and transcripts."""
    db = SessionLocal()
    try:
        suffix_a = uuid.uuid4().hex[:6]
        tenant_a = Tenant(
            name=f"Plumbing Shop A {suffix_a}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant_a)
        db.flush()

        phone_a = PhoneNumber(
            tenant_id=tenant_a.id,
            e164=f"+1512444{uuid.uuid4().int % 9000 + 1000}",
            provider="twilio",
            status="active",
        )
        user_a = User(
            tenant_id=tenant_a.id,
            email=f"owner_{suffix_a}@example.com",
            hashed_password="hashed_pw",
            full_name="Bob A",
            role="tenant_owner",
            is_active=True,
        )
        db.add_all([phone_a, user_a])

        suffix_b = uuid.uuid4().hex[:6]
        tenant_b = Tenant(
            name=f"HVAC Shop B {suffix_b}",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant_b)
        db.flush()

        phone_b = PhoneNumber(
            tenant_id=tenant_b.id,
            e164=f"+1512555{uuid.uuid4().int % 9000 + 1000}",
            provider="livekit",
            status="active",
        )
        user_b = User(
            tenant_id=tenant_b.id,
            email=f"owner_{suffix_b}@example.com",
            hashed_password="hashed_pw",
            full_name="Alice B",
            role="tenant_owner",
            is_active=True,
        )
        db.add_all([phone_b, user_b])
        db.commit()

        # Call A1: Has structured message with summary and service_requested
        call_a1 = Call(
            tenant_id=tenant_a.id,
            call_id=f"call_a1_{suffix_a}",
            caller_number="+15125550101",
            dialed_number=phone_a.e164,
            duration_s=75.0,
            outcome="message_taken",
            urgency="emergency",
            turn_count=6,
            latency_p50_ms=850.0,
            started_at=datetime.now(UTC),
            is_followed_up=False,
            message={
                "name": "John Doe",
                "phone": "+15125550101",
                "address": "123 Main St",
                "summary": "Burst pipe flooding the kitchen under the sink",
                "service_requested": "Emergency Pipe Repair",
            },
            transcript=[
                {"role": "assistant", "text": "Hello, Apex Plumbing, how can I help you today?"},
                {"role": "caller", "text": "Help, my pipe just burst in the kitchen!"},
            ],
        )

        # Call A2: No message summary, should fall back to first caller turn
        call_a2 = Call(
            tenant_id=tenant_a.id,
            call_id=f"call_a2_{suffix_a}",
            caller_number="+15125550102",
            dialed_number=phone_a.e164,
            duration_s=42.0,
            outcome="quote_provided",
            urgency="normal",
            turn_count=4,
            latency_p50_ms=900.0,
            started_at=datetime.now(UTC),
            is_followed_up=True,
            message=None,
            transcript=[
                {"role": "assistant", "text": "Apex Plumbing, how may I assist?"},
                {"role": "caller", "text": "I would like a quote to replace my water heater."},
            ],
        )

        # Call B1: Tenant B call
        call_b1 = Call(
            tenant_id=tenant_b.id,
            call_id=f"call_b1_{suffix_b}",
            caller_number="+15125550199",
            dialed_number=phone_b.e164,
            duration_s=30.0,
            outcome="message_taken",
            urgency="urgent",
            turn_count=2,
            latency_p50_ms=750.0,
            started_at=datetime.now(UTC),
            is_followed_up=False,
            message={"summary": "AC blowing hot air", "service_requested": "AC Diagnostic"},
            transcript=[],
        )

        db.add_all([call_a1, call_a2, call_b1])
        db.commit()

        token_a = create_access_token(
            {"sub": user_a.id, "email": user_a.email, "tenant_id": tenant_a.id}
        )
        token_b = create_access_token(
            {"sub": user_b.id, "email": user_b.email, "tenant_id": tenant_b.id}
        )

        yield {
            "tenant_a": tenant_a,
            "tenant_b": tenant_b,
            "user_a": user_a,
            "user_b": user_b,
            "token_a": token_a,
            "token_b": token_b,
            "call_a1": call_a1,
            "call_a2": call_a2,
            "call_b1": call_b1,
        }
    finally:
        db.close()


def test_list_calls_returns_summary_and_followup(portal_audit_setup: dict[str, Any]) -> None:
    token_a = portal_audit_setup["token_a"]
    resp = client.get("/api/v1/portal/calls", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 2

    call_1 = next(c for c in data if c["call_id"] == portal_audit_setup["call_a1"].call_id)
    assert call_1["summary"] == "Burst pipe flooding the kitchen under the sink"
    assert call_1["service_requested"] == "Emergency Pipe Repair"
    assert call_1["is_followed_up"] is False

    # Call A2 fell back to caller utterance
    call_2 = next(c for c in data if c["call_id"] == portal_audit_setup["call_a2"].call_id)
    assert "water heater" in (call_2["summary"] or "").lower()
    assert call_2["is_followed_up"] is True


def test_get_call_detail_returns_summary_and_followup(portal_audit_setup: dict[str, Any]) -> None:
    token_a = portal_audit_setup["token_a"]
    call_id = portal_audit_setup["call_a1"].call_id
    resp = client.get(
        f"/api/v1/portal/calls/{call_id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"] == "Burst pipe flooding the kitchen under the sink"
    assert data["service_requested"] == "Emergency Pipe Repair"
    assert data["is_followed_up"] is False


def test_update_call_followup_toggles_persisted(portal_audit_setup: dict[str, Any]) -> None:
    token_a = portal_audit_setup["token_a"]
    call_id = portal_audit_setup["call_a1"].call_id

    # Toggle to True
    patch_resp = client.patch(
        f"/api/v1/portal/calls/{call_id}/followup",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"is_followed_up": True},
    )
    assert patch_resp.status_code == 200
    res_data = patch_resp.json()
    assert res_data["is_followed_up"] is True
    assert res_data["call_id"] == call_id

    # Verify persisted in GET detail
    get_resp = client.get(
        f"/api/v1/portal/calls/{call_id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["is_followed_up"] is True

    # Toggle back to False
    patch_resp2 = client.patch(
        f"/api/v1/portal/calls/{call_id}/followup",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"is_followed_up": False},
    )
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["is_followed_up"] is False


def test_update_call_followup_tenant_isolation(portal_audit_setup: dict[str, Any]) -> None:
    # Tenant B attempts to toggle Tenant A's call
    token_b = portal_audit_setup["token_b"]
    call_id_a = portal_audit_setup["call_a1"].call_id

    patch_resp = client.patch(
        f"/api/v1/portal/calls/{call_id_a}/followup",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"is_followed_up": True},
    )
    assert patch_resp.status_code == 404
