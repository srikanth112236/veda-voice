"""Unit tests for Milestone M7a: Live Call Supervision, Barge-In & Human Transfer.

Validates:
1. Real-time bi-directional WebSocket connection and JWT authentication handshake.
2. Strict multi-tenant isolation guarding call supervision streams.
3. Silent supervisor whisper coaching injection.
4. Live audio barge-in conferencing toggle.
5. Supervisor takeover of active agent sessions.
6. Warm specialist transfer with contact timeline auditing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.tenant import Tenant
from api.app.models.user import User

client = TestClient(app)


@pytest.fixture
def supervision_setup():
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        tenant_a = Tenant(
            id=f"ten_m7a_a_{suffix}",
            name=f"Austin HVAC Services {suffix}",
            timezone="America/Chicago",
            hours="8am-6pm",
            status="active",
        )
        tenant_b = Tenant(
            id=f"ten_m7a_b_{suffix}",
            name=f"Dallas Electricians {suffix}",
            timezone="America/Chicago",
            hours="8am-6pm",
            status="active",
        )
        db.add_all([tenant_a, tenant_b])
        db.commit()

        user_a = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_a.id,
            email=f"supervisor_a_{suffix}@austinhvac.com",
            full_name="Austin Supervisor",
            role="admin",
            is_active=True,
            hashed_password="fakehashedsecret",
        )
        user_b = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_b.id,
            email=f"supervisor_b_{suffix}@dallaselectric.com",
            full_name="Dallas Supervisor",
            role="admin",
            is_active=True,
            hashed_password="fakehashedsecret",
        )
        db.add_all([user_a, user_b])
        db.commit()

        # Contact associated with call
        contact = Contact(
            id=str(uuid.uuid4()),
            tenant_id=tenant_a.id,
            name="Alice Customer",
            phone="+15125550144",
            email="alice@example.com",
            stage="lead",
        )
        db.add(contact)
        db.commit()

        # Active in-progress call for tenant A
        call_a = Call(
            id=f"call_m7a_{suffix}",
            call_id=f"room_m7a_{suffix}",
            tenant_id=tenant_a.id,
            contact_id=contact.id,
            caller_number="+15125550144",
            dialed_number="+15125550100",
            started_at=datetime.now(UTC) - timedelta(minutes=1),
            ended_at=None,
            outcome="in_progress",
            urgency="high",
            turn_count=3,
            transcript=[
                {"role": "caller", "text": "My AC unit is blowing hot air."},
                {
                    "role": "assistant",
                    "text": "I can help with that. What is the brand of your unit?",
                },
                {"role": "caller", "text": "It is a Carrier unit installed last year."},
            ],
            barge_in_active=False,
            takeover_active=False,
            supervisor_whispers=[],
        )
        db.add(call_a)
        db.commit()

        token_a = create_access_token(data={"sub": user_a.id, "tenant_id": tenant_a.id})
        token_b = create_access_token(data={"sub": user_b.id, "tenant_id": tenant_b.id})

        yield {
            "db": db,
            "tenant_a": tenant_a,
            "tenant_b": tenant_b,
            "user_a": user_a,
            "user_b": user_b,
            "contact": contact,
            "call_a": call_a,
            "token_a": token_a,
            "token_b": token_b,
        }
    finally:
        try:
            # Clean up timeline events first to respect foreign keys
            db.query(ContactTimelineEvent).filter(
                ContactTimelineEvent.contact_id == contact.id
            ).delete()
            db.delete(call_a)
            db.delete(contact)
            db.delete(user_a)
            db.delete(user_b)
            db.delete(tenant_a)
            db.delete(tenant_b)
            db.commit()
        except Exception:
            db.rollback()
        db.close()


def test_supervisor_websocket_handshake_and_snapshot(supervision_setup):
    """Test connecting to live call WebSocket stream with JWT token and receiving initial call snapshot."""
    call = supervision_setup["call_a"]
    token = supervision_setup["token_a"]

    with client.websocket_connect(
        f"/api/v1/portal/calls/{call.call_id}/stream?token={token}"
    ) as websocket:
        initial_event = websocket.receive_json()
        assert initial_event["event"] == "call_snapshot"
        assert initial_event["call_id"] == call.call_id
        assert initial_event["caller_number"] == "+15125550144"
        assert initial_event["barge_in_active"] is False
        assert initial_event["takeover_active"] is False
        assert len(initial_event["transcript"]) == 3


def test_supervisor_websocket_rejects_missing_or_invalid_token(supervision_setup):
    """Test that unauthorized WebSocket connection attempts are immediately closed with 1008 policy violation."""
    call = supervision_setup["call_a"]

    # No token
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(f"/api/v1/portal/calls/{call.call_id}/stream"):
            pass
    assert exc.value.code == 1008

    # Malformed token
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(
            f"/api/v1/portal/calls/{call.call_id}/stream?token=invalid.token"
        ):
            pass
    assert exc.value.code == 1008


def test_supervisor_websocket_multi_tenant_isolation(supervision_setup):
    """Test that supervisor from tenant B cannot connect to live call stream of tenant A."""
    call_a = supervision_setup["call_a"]
    token_b = supervision_setup["token_b"]  # Supervisor from different tenant

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(
            f"/api/v1/portal/calls/{call_a.call_id}/stream?token={token_b}"
        ):
            pass
    assert exc.value.code == 1008


def test_supervisor_whisper_coaching_rest(supervision_setup):
    """Test dispatching supervisor coach whisper via REST endpoint."""
    call = supervision_setup["call_a"]
    token = supervision_setup["token_a"]
    db = supervision_setup["db"]

    resp = client.post(
        f"/api/v1/portal/calls/{call.call_id}/whisper",
        headers={"Authorization": f"Bearer {token}"},
        json={"instruction": "Offer $50 first-time diagnostic discount immediately."},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "whisper_dispatched"
    assert data["action"] == "whisper"
    assert (
        data["data"]["whisper"]["instruction"]
        == "Offer $50 first-time diagnostic discount immediately."
    )
    assert data["whisper"]["instruction"] == "Offer $50 first-time diagnostic discount immediately."

    # Verify persisted in database
    db.refresh(call)
    assert len(call.supervisor_whispers) == 1
    assert (
        call.supervisor_whispers[0]["instruction"]
        == "Offer $50 first-time diagnostic discount immediately."
    )


def test_supervisor_barge_in_rest(supervision_setup):
    """Test enabling live audio barge-in via REST endpoint."""
    call = supervision_setup["call_a"]
    token = supervision_setup["token_a"]
    db = supervision_setup["db"]

    resp = client.post(
        f"/api/v1/portal/calls/{call.call_id}/barge-in",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["action"] == "barge_in"

    db.refresh(call)
    assert call.barge_in_active is True


def test_supervisor_takeover_rest(supervision_setup):
    """Test supervisor takeover via REST endpoint."""
    call = supervision_setup["call_a"]
    token = supervision_setup["token_a"]
    db = supervision_setup["db"]

    resp = client.post(
        f"/api/v1/portal/calls/{call.call_id}/takeover",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["action"] == "takeover"

    db.refresh(call)
    assert call.takeover_active is True
    assert call.outcome == "supervisor_takeover"


def test_supervisor_transfer_rest_and_contact_timeline(supervision_setup):
    """Test specialist human transfer via REST endpoint, updating call record and contact timeline."""
    call = supervision_setup["call_a"]
    token = supervision_setup["token_a"]
    contact = supervision_setup["contact"]
    db = supervision_setup["db"]

    resp = client.post(
        f"/api/v1/portal/calls/{call.call_id}/transfer",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "transfer_to": "+15125550999",
            "reason": "complex_quote",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["action"] == "transfer"
    assert data["data"]["transfer_to"] == "+15125550999"

    db.refresh(call)
    assert call.outcome == "transferred"
    assert call.transfer_to_number == "+15125550999"
    assert call.transferred_at is not None

    # Verify contact timeline event was generated
    events = (
        db.query(ContactTimelineEvent)
        .filter(
            ContactTimelineEvent.contact_id == contact.id,
            ContactTimelineEvent.event_type == "call_transferred",
        )
        .all()
    )
    assert len(events) == 1
    assert "Transferred to +15125550999" in events[0].description
    assert events[0].payload["transfer_to"] == "+15125550999"


def test_supervisor_websocket_bidirectional_actions(supervision_setup):
    """Test sending actions over active WebSocket stream and receiving broadcast events."""
    call = supervision_setup["call_a"]
    token = supervision_setup["token_a"]
    db = supervision_setup["db"]

    with client.websocket_connect(
        f"/api/v1/portal/calls/{call.call_id}/stream?token={token}"
    ) as websocket:
        # Read initial snapshot
        init = websocket.receive_json()
        assert init["event"] == "call_snapshot"

        # 1. Send whisper over WebSocket
        websocket.send_json(
            {
                "action": "whisper",
                "payload": {"instruction": "Offer priority weekend booking."},
            }
        )
        event1 = websocket.receive_json()
        assert event1["event"] == "whisper_dispatched"
        assert event1["whisper"]["instruction"] == "Offer priority weekend booking."

        # 2. Send barge_in over WebSocket
        websocket.send_json({"action": "barge_in"})
        event2 = websocket.receive_json()
        assert event2["event"] == "barge_in_activated"
        assert event2["call_id"] == call.call_id

        # 3. Send transfer over WebSocket
        websocket.send_json(
            {
                "action": "transfer",
                "payload": {"transfer_to": "+15125550888", "reason": "emergency_pipe_burst"},
            }
        )
        event3 = websocket.receive_json()
        assert event3["event"] == "call_transferred"
        assert event3["transfer_to"] == "+15125550888"

    db.refresh(call)
    assert call.barge_in_active is True
    assert call.outcome == "transferred"
    assert call.transfer_to_number == "+15125550888"
