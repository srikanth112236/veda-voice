"""Unit tests for Supervisor Copilot (active call monitoring, supervisor whispers) and Post-Call Intelligence extraction."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.intelligence import extract_post_call_intelligence

client = TestClient(app)


@pytest.fixture
def copilot_setup():
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        tenant = Tenant(
            id=f"ten_copilot_{suffix}",
            name=f"Apex Plumbing Copilot Test {suffix}",
            timezone="America/Chicago",
            hours="8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        supervisor = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant.id,
            email=f"supervisor_{suffix}@apexplumbing.com",
            full_name="Apex Supervisor",
            role="admin",
            is_active=True,
            hashed_password="fakehashsecret",
        )
        db.add(supervisor)
        db.commit()
        db.refresh(supervisor)

        token = create_access_token(data={"sub": supervisor.id, "tenant_id": tenant.id})

        yield {"tenant": tenant, "supervisor": supervisor, "token": token, "db": db}
    finally:
        db.close()


def test_extract_post_call_intelligence_positive():
    transcript = [
        {"role": "caller", "text": "Hi, I would like to schedule a standard maintenance check."},
        {"role": "agent", "text": "I can certainly get a technician dispatched tomorrow at 10 AM."},
        {"role": "caller", "text": "That is wonderful, thank you so much! Please book that slot."},
    ]
    intel = extract_post_call_intelligence(transcript=transcript, outcome="booked")
    assert intel["sentiment_label"] in ("positive", "neutral")
    assert intel["lead_score"] >= 80.0
    assert intel["lost_reason"] is None
    assert intel["key_objections"] == []


def test_extract_post_call_intelligence_price_objection():
    transcript = [
        {"role": "caller", "text": "How much does a drain clear cost?"},
        {"role": "agent", "text": "Our standard diagnostic and clearing service starts at $249."},
        {"role": "caller", "text": "That's way too expensive, terrible price and waste of money."},
    ]
    intel = extract_post_call_intelligence(transcript=transcript, outcome="inquiry_resolved")
    assert intel["sentiment_label"] in ("frustrated", "negative")
    assert intel["lead_score"] < 50.0
    assert intel["lost_reason"] == "price_too_high"
    assert "pricing_high" in intel["key_objections"]


def test_get_live_active_calls_and_whisper_via_api(copilot_setup):
    db = copilot_setup["db"]
    tenant = copilot_setup["tenant"]
    token = copilot_setup["token"]
    supervisor = copilot_setup["supervisor"]
    headers = {"Authorization": f"Bearer {token}"}

    # Active call
    active_call = Call(
        id=f"call_live_{uuid.uuid4().hex[:6]}",
        call_id=f"livekit_room_live_{uuid.uuid4().hex[:6]}",
        tenant_id=tenant.id,
        caller_number="+15125550199",
        dialed_number="+15125550100",
        started_at=datetime.now(UTC) - timedelta(minutes=2),
        ended_at=None,
        outcome="in_progress",
        urgency="medium",
        turn_count=4,
        transcript=[
            {"role": "caller", "text": "Can you give me an estimate on a water heater install?"},
            {"role": "agent", "text": "Our technicians provide on-site exact quotes."},
        ],
        supervisor_whispers=[],
    )
    # Already ended call (should not show up in live active calls)
    ended_call = Call(
        id=f"call_ended_{uuid.uuid4().hex[:6]}",
        call_id=f"livekit_room_ended_{uuid.uuid4().hex[:6]}",
        tenant_id=tenant.id,
        caller_number="+15125550188",
        dialed_number="+15125550100",
        started_at=datetime.now(UTC) - timedelta(minutes=15),
        ended_at=datetime.now(UTC) - timedelta(minutes=10),
        outcome="booking_confirmed",
        urgency="low",
        turn_count=6,
    )
    db.add_all([active_call, ended_call])
    db.commit()

    # 1. Fetch live active calls via GET /api/v1/portal/copilot/active-calls
    resp = client.get("/api/v1/portal/copilot/active-calls", headers=headers)
    assert resp.status_code == 200, resp.text
    live_calls = resp.json()
    assert len(live_calls) == 1
    assert live_calls[0]["call_id"] == active_call.call_id
    assert (
        live_calls[0]["latest_user_utterance"]
        == "Can you give me an estimate on a water heater install?"
    )
    assert (
        live_calls[0]["latest_agent_utterance"] == "Our technicians provide on-site exact quotes."
    )
    assert live_calls[0]["whisper_count"] == 0

    # 2. Inject supervisor whisper via POST /api/v1/portal/calls/{call_id}/whisper
    whisper_payload = {"instruction": "Offer a 10% senior discount if they schedule today."}
    w_resp = client.post(
        f"/api/v1/portal/calls/{active_call.id}/whisper",
        json=whisper_payload,
        headers=headers,
    )
    assert w_resp.status_code == 200, w_resp.text
    w_data = w_resp.json()
    assert w_data["status"] == "whisper_dispatched"
    assert w_data["total_whispers"] == 1
    assert w_data["whisper"]["instruction"] == "Offer a 10% senior discount if they schedule today."
    assert w_data["whisper"]["supervisor_email"] == supervisor.email

    # 3. Verify whisper is reflected on live calls endpoint
    resp2 = client.get("/api/v1/portal/copilot/active-calls", headers=headers)
    assert resp2.status_code == 200
    refreshed_live_calls = resp2.json()
    assert len(refreshed_live_calls) == 1
    assert refreshed_live_calls[0]["whisper_count"] == 1
    assert (
        refreshed_live_calls[0]["supervisor_whispers"][0]["instruction"]
        == "Offer a 10% senior discount if they schedule today."
    )
