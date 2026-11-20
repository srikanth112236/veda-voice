"""Tests for Phase 1: Post-Call CRM Ingestion Bridge."""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.call import Call
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.outbound import ConsentRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.crm_ingest import upsert_crm_contact_from_call

init_db()


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def tenant_fixture(db_session):
    t_id = str(uuid.uuid4())
    tenant = Tenant(
        id=t_id,
        name="Apex Emergency Plumbing",
        status="active",
    )
    db_session.add(tenant)

    user = User(
        id=str(uuid.uuid4()),
        tenant_id=t_id,
        email=f"owner-{uuid.uuid4().hex[:6]}@apexplumbing.test",
        hashed_password="pw",
        full_name="Bob Owner",
        role="tenant_owner",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()

    token = create_access_token({"sub": user.id, "role": "tenant_owner", "tenant_id": t_id})
    agent_token = create_access_token({"sub": "agent-worker", "role": "agent", "tenant_id": t_id})
    return {"tenant_id": t_id, "user_token": token, "agent_token": agent_token}


def test_upsert_crm_contact_from_new_call(db_session, tenant_fixture):
    tenant_id = tenant_fixture["tenant_id"]
    call_id = f"test-call-{uuid.uuid4().hex[:8]}"

    call = Call(
        tenant_id=tenant_id,
        call_id=call_id,
        caller_number="+15125559901",
        dialed_number="+18005550199",
        direction="inbound",
        started_at=datetime.now(UTC),
        duration_s=65.0,
        outcome="message_taken",
        urgency="emergency",
        turn_count=6,
        tags=["emergency_burst", "basement_flood"],
        lead_score=85.0,
        recording_url="https://blob.example.com/audio/call-01.wav",
        message={
            "customer_name": "Alice Cooper",
            "summary": "Main waterline ruptured in basement, active water flooding.",
            "address": "123 Maple St, Austin TX",
            "service_requested": "Emergency pipe burst",
        },
    )
    db_session.add(call)
    db_session.commit()

    contact = upsert_crm_contact_from_call(
        db=db_session,
        tenant_id=tenant_id,
        call=call,
        payload_message=call.message,
    )
    db_session.commit()

    assert contact is not None
    assert contact.name == "Alice Cooper"
    assert contact.phone == "+15125559901"
    assert contact.stage == "qualified"  # Because emergency + message_taken
    assert contact.lead_score == 85.0
    assert "emergency" in contact.tags
    assert "Emergency pipe burst" in contact.tags
    assert contact.custom_fields.get("service_address") == "123 Maple St, Austin TX"

    # Check call linkage
    db_session.refresh(call)
    assert call.contact_id == contact.id

    # Check timeline event
    timeline = db_session.scalars(
        select(ContactTimelineEvent).where(ContactTimelineEvent.contact_id == contact.id)
    ).all()
    assert len(timeline) == 1
    assert timeline[0].event_type == "call"
    assert "65s" in timeline[0].title
    assert timeline[0].payload.get("recording_url") == "https://blob.example.com/audio/call-01.wav"

    # Check TCPA consent record
    consent = db_session.scalar(
        select(ConsentRecord).where(
            ConsentRecord.tenant_id == tenant_id,
            ConsentRecord.phone_number == "+15125559901",
        )
    )
    assert consent is not None
    assert consent.method == "verbal_recorded"
    assert consent.ai_voice_disclosed is True


def test_upsert_crm_contact_stage_hierarchy(db_session, tenant_fixture):
    tenant_id = tenant_fixture["tenant_id"]
    phone = "+15125559902"

    # 1. First call: Booked appointment
    call1 = Call(
        tenant_id=tenant_id,
        call_id=f"call-1-{uuid.uuid4().hex[:6]}",
        caller_number=phone,
        direction="inbound",
        outcome="appointment_booked",
        duration_s=120.0,
    )
    db_session.add(call1)
    db_session.commit()
    contact1 = upsert_crm_contact_from_call(db_session, tenant_id, call1)
    db_session.commit()
    assert contact1.stage == "booked"

    # 2. Second call from same caller: Follow-up question (turn_count=2, completed)
    # Should NOT downgrade stage from 'booked' to 'ai_called'
    call2 = Call(
        tenant_id=tenant_id,
        call_id=f"call-2-{uuid.uuid4().hex[:6]}",
        caller_number=phone,
        direction="inbound",
        outcome="completed",
        turn_count=3,
        duration_s=30.0,
    )
    db_session.add(call2)
    db_session.commit()
    contact2 = upsert_crm_contact_from_call(db_session, tenant_id, call2)
    db_session.commit()

    assert contact2.id == contact1.id
    assert contact2.stage == "booked"  # Stage preserved!


def test_internal_complete_endpoint_ingests_contact(tenant_fixture):
    agent_token = tenant_fixture["agent_token"]
    user_token = tenant_fixture["user_token"]
    call_id = f"endpoint-call-{uuid.uuid4().hex[:8]}"

    with TestClient(app) as client:
        # Complete call via internal agent endpoint
        payload = {
            "call_id": call_id,
            "caller_number": "+15125558877",
            "dialed_number": "+18005550199",
            "started_at": datetime.now(UTC).isoformat(),
            "duration_s": 45.0,
            "outcome": "message_taken",
            "turn_count": 4,
            "tags": ["water_heater"],
            "recording_url": "https://storage.azure.com/audio/test.wav",
            "message": {
                "name": "David Miller",
                "summary": "Water heater is making loud banging noises.",
                "service": "Water heater inspection",
            },
            "transcript": [
                {"role": "assistant", "text": "Thanks for calling Apex."},
                {"role": "caller", "text": "Hi, my water heater is making loud banging noises."},
            ],
        }

        resp = client.post(
            "/api/v1/internal/calls/complete",
            json=payload,
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert resp.status_code == 200

        # Query native CRM contacts via portal/tenant API
        crm_resp = client.get(
            "/api/v1/crm/contacts",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert crm_resp.status_code == 200
        data = crm_resp.json()
        contacts = data.get("contacts", [])
        matched = [c for c in contacts if c["phone"] == "+15125558877"]
        assert len(matched) == 1
        assert matched[0]["name"] == "David Miller"
        assert matched[0]["stage"] == "qualified"
        assert matched[0]["call_count"] >= 1

        # Query pipeline stages
        pipe_resp = client.get(
            "/api/v1/crm/pipeline",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert pipe_resp.status_code == 200
        stages = pipe_resp.json().get("stages", {})
        assert len(stages.get("qualified", [])) >= 1


def test_calendar_booking_flow_links_crm_contact_and_advances_stage(tenant_fixture, db_session):
    tenant_id = tenant_fixture["tenant_id"]
    user_token = tenant_fixture["user_token"]
    call_id = f"booking-call-{uuid.uuid4().hex[:8]}"

    # Pre-register in-progress call
    call = Call(
        tenant_id=tenant_id,
        call_id=call_id,
        caller_number="+15125557788",
        direction="inbound",
        outcome="in_progress",
    )
    db_session.add(call)
    db_session.commit()

    agent_call_token = create_access_token(
        {
            "sub": "livekit-agent",
            "role": "agent",
            "tenant_id": tenant_id,
            "call_id": call_id,
        }
    )

    with TestClient(app) as client:
        # Book slot via internal agent API
        book_payload = {
            "start_iso": "2026-11-26T14:00:00-05:00",
            "duration_minutes": 60,
            "customer_name": "Benjamin Franklin",
            "customer_phone": "+15125557788",
            "customer_email": "ben@franklin.test",
            "service_type": "drain_clearing",
            "notes": "Basement floor drain backing up.",
            "postal_code": "02108",
        }

        resp = client.post(
            "/api/v1/internal/calendar/book",
            json=book_payload,
            headers={"Authorization": f"Bearer {agent_call_token}"},
        )
        assert resp.status_code == 200
        booking_data = resp.json()
        assert booking_data["status"] == "confirmed"

        # Verify contact in CRM has stage 'booked'
        contact = db_session.scalar(
            select(Contact).where(
                Contact.tenant_id == tenant_id,
                Contact.phone == "+15125557788",
            )
        )
        assert contact is not None
        assert contact.name == "Benjamin Franklin"
        assert contact.stage == "booked"
        assert "appointment_booked" in contact.tags
        assert "drain_clearing" in contact.tags

        # Verify call is linked and marked appointment_booked
        db_session.refresh(call)
        assert call.contact_id == contact.id
        assert call.outcome == "appointment_booked"

        # Verify timeline event
        timeline = db_session.scalars(
            select(ContactTimelineEvent).where(
                ContactTimelineEvent.contact_id == contact.id,
                ContactTimelineEvent.event_type == "booking_created",
            )
        ).all()
        assert len(timeline) >= 1
        assert "Appointment Booked" in timeline[0].title

        # Verify revenue recovered analytics
        rev_resp = client.get(
            "/api/v1/crm/analytics/revenue-recovered",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert rev_resp.status_code == 200
        rev_data = rev_resp.json()
        assert rev_data["booked_count"] >= 1
        assert rev_data["total_conversions"] >= 1
        assert rev_data["total_revenue_recovered"] >= 250.0
