"""Tests for Call Recording Metadata, Dual-Channel Stereo Schema, and Portal Playback API."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User

client = TestClient(app)


@pytest.fixture
def recording_tenants() -> Any:
    """Fixture providing two isolated tenants with recorded calls."""
    db = SessionLocal()
    try:
        suffix_a = uuid.uuid4().hex[:6]
        tenant_a = Tenant(
            name=f"Audio Tenant A {suffix_a}",
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
            full_name="Owner A",
            role="tenant_owner",
            is_active=True,
        )
        db.add_all([phone_a, user_a])

        suffix_b = uuid.uuid4().hex[:6]
        tenant_b = Tenant(
            name=f"Audio Tenant B {suffix_b}",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant_b)
        db.flush()

        phone_b = PhoneNumber(
            tenant_id=tenant_b.id,
            e164=f"+1512555{uuid.uuid4().int % 9000 + 1000}",
            provider="telnyx",
            status="active",
        )
        user_b = User(
            tenant_id=tenant_b.id,
            email=f"owner_{suffix_b}@example.com",
            hashed_password="hashed_pw",
            full_name="Owner B",
            role="tenant_owner",
            is_active=True,
        )
        db.add_all([phone_b, user_b])
        db.commit()

        # Call with dual-channel recording for Tenant A
        call_a = Call(
            tenant_id=tenant_a.id,
            call_id=f"rec_call_{suffix_a}",
            caller_number="+15551112222",
            dialed_number=phone_a.e164,
            direction="inbound",
            outcome="completed",
            duration_s=85.0,
            recording_url="https://storage.vedavoice.internal/recordings/call_a.wav",
            recording_duration_s=85.0,
            recording_channels=2,
            recording_status="completed",
        )
        db.add(call_a)
        db.commit()

        token_a = create_access_token(
            {"sub": user_a.id, "role": "tenant_owner", "tenant_id": tenant_a.id}
        )
        token_b = create_access_token(
            {"sub": user_b.id, "role": "tenant_owner", "tenant_id": tenant_b.id}
        )

        yield {
            "tenant_a_id": tenant_a.id,
            "call_a_id": call_a.call_id,
            "token_a": token_a,
            "tenant_b_id": tenant_b.id,
            "token_b": token_b,
        }
    finally:
        db.query(Call).filter(Call.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
        db.query(User).filter(User.id.in_([user_a.id, user_b.id])).delete()
        db.query(PhoneNumber).filter(PhoneNumber.tenant_id.in_([tenant_a.id, tenant_b.id])).delete()
        db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete()
        db.commit()
        db.close()


def test_portal_get_call_recording_success(recording_tenants: dict[str, Any]) -> None:
    """Verify tenant owner can fetch call recording metadata and stereo dual-channel configuration."""
    call_id = recording_tenants["call_a_id"]
    token = recording_tenants["token_a"]

    resp = client.get(
        f"/api/v1/portal/calls/{call_id}/recording",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["has_recording"] is True
    assert data["recording_url"] == "https://storage.vedavoice.internal/recordings/call_a.wav"
    assert data["recording_duration_s"] == 85.0
    assert data["recording_channels"] == 2  # Stereo dual-channel
    assert data["recording_status"] == "completed"


def test_portal_get_call_recording_cross_tenant_rejected(recording_tenants: dict[str, Any]) -> None:
    """Verify Tenant B cannot access Tenant A's call recording."""
    call_a_id = recording_tenants["call_a_id"]
    token_b = recording_tenants["token_b"]

    resp = client.get(
        f"/api/v1/portal/calls/{call_a_id}/recording",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Call record not found"
