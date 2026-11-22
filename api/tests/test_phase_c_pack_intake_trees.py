"""Unit and integration tests for Phase C: Industry Pack Dynamic Intake Trees & Structured CRM Extraction."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.models.booking import Booking
from api.app.models.crm import ContactTimelineEvent
from api.app.models.industry_pack import IndustryPack, IndustryPackVersion
from api.app.models.tenant import AgentProfile, Tenant
from api.app.models.user import User
from api.app.routers.internal import BookSlotRequest, confirm_appointment_booking
from api.app.services.calendar.booking import confirm_booking
from api.app.services.crm_ingest import link_booking_to_crm
from api.app.services.industry_packs import (
    apply_pack_to_tenant,
    compile_tenant_prompt,
    get_tenant_effective_pack,
    seed_default_industry_packs,
)


@pytest.fixture
def db_session():
    with SessionLocal() as db:
        yield db


def test_seed_default_industry_packs_populates_intake_schemas(db_session):
    """Verify that all 4 launch industry pack blueprints contain typed intake schemas."""
    seeded = seed_default_industry_packs(db_session)
    assert len(seeded) >= 4

    for slug in ("home_services", "dental_clinic", "legal_intake", "general"):
        pack = db_session.scalar(select(IndustryPack).where(IndustryPack.slug == slug))
        assert pack is not None
        version = db_session.scalar(
            select(IndustryPackVersion).where(IndustryPackVersion.pack_id == pack.id)
        )
        assert version is not None
        assert version.intake_schema is not None
        assert "title" in version.intake_schema
        assert "fields" in version.intake_schema
        assert len(version.intake_schema["fields"]) >= 3

        # Verify field structure
        first_field = version.intake_schema["fields"][0]
        assert "key" in first_field
        assert "label" in first_field
        assert "type" in first_field
        assert "required" in first_field
        assert "prompt" in first_field


def test_compile_tenant_prompt_injects_intake_tree(db_session):
    """Verify compile_tenant_prompt appends the intake tree instructions to conversational prompt."""
    seed_default_industry_packs(db_session)

    tenant_id = f"ten_pack_c_{uuid.uuid4().hex[:8]}"
    tenant = Tenant(id=tenant_id, name="Peak Plumbing Co", status="active", hours="8AM-5PM")
    db_session.add(tenant)
    db_session.commit()

    try:
        apply_pack_to_tenant(tenant_id=tenant_id, pack_slug="home_services", db=db_session)

        pack_data = get_tenant_effective_pack(tenant_id, db_session)
        assert pack_data["pack_slug"] == "home_services"
        assert "intake_schema" in pack_data
        assert pack_data["intake_schema"]["title"] == "Home Services Trade Triage"

        compiled_prompt = compile_tenant_prompt(tenant_id, db_session)
        assert "HOME SERVICES TRADE TRIAGE PROTOCOL:" in compiled_prompt
        assert "trade_type" in compiled_prompt
        assert "urgency_level" in compiled_prompt
        assert "intake_details" in compiled_prompt
    finally:
        db_session.rollback()


def test_confirm_booking_persists_intake_details_and_crm_timeline(db_session):
    """Verify booking confirmation stores structured intake details and logs a CRM intake timeline event."""
    seed_default_industry_packs(db_session)

    tenant_id = f"ten_intake_{uuid.uuid4().hex[:8]}"
    tenant = Tenant(id=tenant_id, name="Austin Premier Dental", status="active", hours="8AM-5PM")
    db_session.add(tenant)

    user = User(
        id=f"usr_{uuid.uuid4().hex[:8]}",
        tenant_id=tenant_id,
        email=f"doc_{uuid.uuid4().hex[:6]}@austindental.test",
        hashed_password="test-pw-hash",
        full_name="Dr. Sarah Austin",
        role="tenant_admin",
    )
    db_session.add(user)

    profile = AgentProfile(
        id=f"prof_{uuid.uuid4().hex[:8]}",
        tenant_id=tenant_id,
        agent_name="Receptionist Sarah",
        services=["General Cleaning", "Emergency Toothache Extraction"],
    )
    db_session.add(profile)
    db_session.commit()

    intake_data = {
        "patient_status": "new_patient",
        "pain_severity": "severe_emergency",
        "insurance_carrier": "Delta Dental PPO",
        "chief_complaint": "Severe throbbing lower left molar pain since last night",
    }

    start_dt = datetime.now(UTC) + timedelta(days=1)
    booking = confirm_booking(
        tenant_id=tenant_id,
        slot_start=start_dt,
        duration_minutes=45,
        customer_name="John Doe",
        customer_phone="+15125550188",
        customer_email="johndoe@example.test",
        service_type="emergency_toothache",
        intake_details=intake_data,
        db=db_session,
    )

    assert booking.id is not None
    assert booking.intake_details == intake_data

    # Link to CRM
    contact = link_booking_to_crm(
        db=db_session,
        tenant_id=tenant_id,
        booking=booking,
        customer_phone="+15125550188",
        customer_name="John Doe",
        customer_email="johndoe@example.test",
        service_type="emergency_toothache",
        intake_details=intake_data,
    )
    db_session.commit()

    assert contact.custom_fields.get("intake_details") == intake_data

    # Verify CRM Timeline Event
    events = db_session.scalars(
        select(ContactTimelineEvent).where(
            ContactTimelineEvent.contact_id == contact.id,
            ContactTimelineEvent.event_type == "appointment_intake",
        )
    ).all()
    assert len(events) == 1
    intake_event = events[0]
    assert intake_event.title == "Intake Triage Questionnaire Completed"
    assert intake_event.payload == intake_data
    assert "severe_emergency" in intake_event.description


def test_internal_confirm_appointment_booking_endpoint_flow(db_session):
    """Verify internal /calendar/book endpoint accepts and forwards intake_details cleanly."""
    tenant_id = f"ten_endpoint_{uuid.uuid4().hex[:8]}"
    tenant = Tenant(id=tenant_id, name="Vanguard Law", status="active", hours="9AM-5PM")
    db_session.add(tenant)
    db_session.commit()

    call_token = create_access_token(
        {
            "sub": "livekit-agent",
            "role": "agent",
            "tenant_id": tenant_id,
            "call_id": "call_123",
        }
    )
    auth_header = f"Bearer {call_token}"

    intake_payload = {
        "practice_area": "Personal Injury",
        "incident_date": "2026-11-15",
        "adverse_party": "Acme Trucking Inc",
        "upcoming_court_deadlines": "None yet",
    }

    start_iso = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    req = BookSlotRequest(
        start_iso=start_iso,
        duration_minutes=60,
        customer_name="Alice Smith",
        customer_phone="+15125550199",
        customer_email="alice@example.test",
        service_type="case_evaluation",
        notes="Rear-ended at traffic light",
        intake_details=intake_payload,
    )

    res = confirm_appointment_booking(
        payload=req,
        authorization=auth_header,
        db=db_session,
    )
    assert res["status"] == "confirmed"
    booking_id = res["booking_id"]

    saved_booking = db_session.scalar(select(Booking).where(Booking.id == booking_id))
    assert saved_booking is not None
    assert saved_booking.intake_details == intake_payload
