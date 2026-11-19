"""Test LiveKit WebRTC Supervision, Barge-In, and Takeover endpoints."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import Tenant
from api.app.models.user import User


@pytest.fixture
def supervisor_client() -> tuple[TestClient, str, str, str]:
    """Create test client with authenticated tenant supervisor user and active call."""
    db: Session = SessionLocal()
    suffix = uuid.uuid4().hex[:6]

    # Create tenant
    tenant = Tenant(
        name=f"Supervision Apex {suffix}",
        timezone="America/New_York",
        hours="Mon-Fri 8am-5pm",
        status="active",
    )
    db.add(tenant)
    db.flush()

    # Create supervisor user
    user = User(
        email=f"supervisor-{suffix}@vedavoice.io",
        hashed_password="hashed_pw_test",
        full_name="Alex Supervisor",
        role="tenant_owner",
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Create active call
    call_id = f"supervision-call-{suffix}"
    call = Call(
        tenant_id=tenant.id,
        call_id=call_id,
        dialed_number="+18005550199",
        caller_number="+15125550144",
        direction="inbound",
        outcome="in_progress",
        started_at=datetime.now(UTC),
    )
    db.add(call)
    db.commit()

    token = create_access_token(
        {
            "sub": user.id,
            "role": user.role,
            "tenant_id": tenant.id,
            "email": user.email,
        }
    )

    client = TestClient(app)
    return client, token, call_id, tenant.id


def test_get_supervision_token_success(supervisor_client: tuple[TestClient, str, str, str]) -> None:
    """Verify supervisor can obtain a LiveKit room token with proper grants."""
    client, token, call_id, _ = supervisor_client

    resp = client.post(
        f"/api/v1/portal/calls/{call_id}/supervision-token",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "token" in data
    assert data["room_name"] == call_id
    assert "supervisor-" in data["identity"]
    assert "wss://" in data["livekit_url"]


def test_barge_in_activation(supervisor_client: tuple[TestClient, str, str, str]) -> None:
    """Verify supervisor can activate barge-in on an active call."""
    client, token, call_id, _ = supervisor_client

    resp = client.post(
        f"/api/v1/portal/calls/{call_id}/barge-in",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["action"] == "barge_in"


def test_takeover_activation(supervisor_client: tuple[TestClient, str, str, str]) -> None:
    """Verify supervisor can take over an active call session."""
    client, token, call_id, _ = supervisor_client

    resp = client.post(
        f"/api/v1/portal/calls/{call_id}/takeover",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["action"] == "takeover"


def test_end_active_call_by_supervisor(supervisor_client: tuple[TestClient, str, str, str]) -> None:
    """Verify supervisor can manually end and dismiss a call, releasing concurrency immediately."""
    client, token, call_id, tenant_id = supervisor_client

    resp = client.post(
        f"/api/v1/portal/calls/{call_id}/end",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["call_id"] == call_id

    # Verify DB call record is now ended
    db: Session = SessionLocal()
    call = db.scalar(select(Call).where(Call.call_id == call_id))
    assert call is not None
    assert call.ended_at is not None
    assert call.outcome == "ended_by_supervisor"


def test_livekit_webhook_participant_left_reconciliation() -> None:
    """Verify LiveKit Webhook participant_left marks caller session as completed."""
    db: Session = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    room_name = f"room-webhook-{suffix}"

    tenant = Tenant(
        name=f"Webhook Apex {suffix}",
        timezone="America/New_York",
        status="active",
    )
    db.add(tenant)
    db.flush()

    call = Call(
        tenant_id=tenant.id,
        call_id=room_name,
        caller_number="+15125550999",
        dialed_number="+18005550199",
        direction="inbound",
        outcome="in_progress",
        started_at=datetime.now(UTC),
    )
    db.add(call)
    db.commit()

    client = TestClient(app)
    payload = {
        "event": "participant_left",
        "room": {"name": room_name, "sid": f"RM_{suffix}"},
        "participant": {"identity": "caller-123", "attributes": {}},
    }
    resp = client.post("/api/v1/internal/livekit/webhook", json=payload)
    assert resp.status_code == 200

    # Verify DB record is completed
    db.expire_all()
    reconciled_call = db.scalar(select(Call).where(Call.call_id == room_name))
    assert reconciled_call is not None
    assert reconciled_call.ended_at is not None
    assert reconciled_call.outcome == "completed"
    assert "webhook_reconciled" in (reconciled_call.tags or [])
