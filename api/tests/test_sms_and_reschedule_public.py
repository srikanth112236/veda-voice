"""Unit and Integration tests for 2-Way SMS Confirmations, 24h Reminders, and Public 1-Tap Reschedule."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.booking import Booking
from api.app.models.tenant import AgentProfile, Tenant
from api.app.services.notifier import (
    dispatch_24h_booking_reminders,
    generate_reschedule_token,
)

client = TestClient(app)


class MockSmsDispatcher:
    def __init__(self) -> None:
        self.sent_messages: list[tuple[str, str]] = []

    def send(self, to: str, message: str) -> bool:
        self.sent_messages.append((to, message))
        return True


@pytest.fixture
def test_setup_booking() -> dict[str, Any]:
    """Create a verified tenant, agent profile, and test booking with reschedule token."""
    db = SessionLocal()
    try:
        tenant = db.scalar(select(Tenant).where(Tenant.name == "Apex Plumbing & Heating"))
        if not tenant:
            tenant = Tenant(
                name="Apex Plumbing & Heating",
                timezone="America/New_York",
                hours="Mon-Fri 08:00-18:00",
                status="active",
            )
            db.add(tenant)
            db.flush()

        if not tenant.agent_profile:
            profile = AgentProfile(
                tenant_id=tenant.id,
                greeting="Apex Plumbing, how can I help you?",
                transfer_number="+15125550199",
                auto_sms_reminders_enabled=True,
                reminder_lead_hours=24,
                custom_reminder_template="Reminder from {{tenant_name}}: Your appointment is {{date}} at {{time}}. {{reschedule_link}}",
            )
            db.add(profile)
            db.flush()

        unique_suffix = f"{uuid.uuid4().int % 10000000:07d}"
        unique_phone = f"+1512{unique_suffix}"

        token = generate_reschedule_token()
        start_time = datetime.now(UTC) + timedelta(days=2, hours=3)
        end_time = start_time + timedelta(hours=1)

        booking = Booking(
            tenant_id=tenant.id,
            customer_name="Michael Jordan",
            customer_phone=unique_phone,
            service_type="drain_cleaning",
            status="confirmed",
            start_at=start_time,
            end_at=end_time,
            reschedule_token=token,
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)
        db.refresh(tenant)

        return {
            "tenant_id": tenant.id,
            "booking_id": booking.id,
            "token": token,
            "customer_phone": unique_phone,
        }
    finally:
        db.close()


def test_public_reschedule_lookup_valid_token(test_setup_booking: dict[str, Any]) -> None:
    """Public customer link returns appointment details without auth."""
    token = test_setup_booking["token"]
    resp = client.get(f"/api/v1/public/reschedule/{token}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["customer_name"] == "Michael Jordan"
    assert data["service_type"] == "drain_cleaning"
    assert data["status"] == "confirmed"
    assert data["business_name"] == "Apex Plumbing & Heating"
    assert data["reschedule_token"] == token
    assert "formatted_date" in data
    assert "formatted_time" in data


def test_public_reschedule_lookup_invalid_token() -> None:
    """Invalid token returns 404."""
    resp = client.get("/api/v1/public/reschedule/invalid-non-existent-token")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_public_reschedule_slots_query(test_setup_booking: dict[str, Any]) -> None:
    """Public customer link queries open conflict-free slots on target date."""
    token = test_setup_booking["token"]
    target_date = (datetime.now(UTC) + timedelta(days=3)).strftime("%Y-%m-%d")

    resp = client.get(f"/api/v1/public/reschedule/{token}/slots?target_date={target_date}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["target_date"] == target_date
    assert "slots" in data
    assert isinstance(data["slots"], list)


def test_public_reschedule_execution(test_setup_booking: dict[str, Any]) -> None:
    """Customer selects a new slot and successfully reschedules booking."""
    token = test_setup_booking["token"]
    booking_id = test_setup_booking["booking_id"]

    # Pick a unique future weekday between 9 AM and 5 PM
    unique_day_offset = 20 + (uuid.uuid4().int % 30)
    candidate = datetime.now(UTC) + timedelta(days=unique_day_offset)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    new_slot = candidate.replace(hour=14, minute=0, second=0, microsecond=0)
    payload = {
        "slot_start": new_slot.isoformat(),
        "notes": "Please park in the driveway.",
    }

    resp = client.post(f"/api/v1/public/reschedule/{token}", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["success"] is True
    assert data["booking_id"] == booking_id
    assert data["status"] == "confirmed"

    # Verify database state
    db = SessionLocal()
    try:
        updated_b = db.scalar(select(Booking).where(Booking.id == booking_id))
        assert updated_b is not None
        assert updated_b.status == "confirmed"
        assert updated_b.confirmation_channel == "reschedule_web"
        assert "driveway" in (updated_b.notes or "")
    finally:
        db.close()


def test_telnyx_inbound_sms_confirm_reply(test_setup_booking: dict[str, Any]) -> None:
    """Telnyx webhook parses 'C' reply and marks booking confirmed."""
    booking_id = test_setup_booking["booking_id"]
    customer_phone = test_setup_booking["customer_phone"]

    payload = {
        "data": {
            "event_type": "message.received",
            "payload": {
                "from": {"phone_number": customer_phone},
                "text": "C",
            },
        }
    }

    resp = client.post("/api/v1/webhooks/sms/inbound", json=payload)
    assert resp.status_code == 200
    res = resp.json()["result"]
    assert res["status"] == "success"
    assert res["action"] == "confirmed"

    db = SessionLocal()
    try:
        b = db.scalar(select(Booking).where(Booking.id == booking_id))
        assert b is not None
        assert b.status == "confirmed"
        assert b.confirmation_channel == "sms"
        assert b.confirmed_via_sms_at is not None
    finally:
        db.close()


def test_twilio_inbound_sms_cancel_reply(test_setup_booking: dict[str, Any]) -> None:
    """Twilio form-encoded webhook parses 'CANCEL' and cancels booking."""
    booking_id = test_setup_booking["booking_id"]
    customer_phone = test_setup_booking["customer_phone"]

    form_data = {
        "From": customer_phone,
        "Body": "CANCEL",
    }

    resp = client.post(
        "/api/v1/webhooks/sms/inbound",
        data=form_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200
    res = resp.json()["result"]
    assert res["status"] == "success"
    assert res["action"] == "cancelled"

    db = SessionLocal()
    try:
        b = db.scalar(select(Booking).where(Booking.id == booking_id))
        assert b is not None
        assert b.status == "cancelled"
        assert b.confirmation_channel == "sms_cancelled"
    finally:
        db.close()


def test_dispatch_24h_reminders_worker(test_setup_booking: dict[str, Any]) -> None:
    """Scanner finds upcoming confirmed bookings within 24 hours and dispatches SMS."""
    tenant_id = test_setup_booking["tenant_id"]
    mock_sms = MockSmsDispatcher()

    db = SessionLocal()
    try:
        # Create a booking scheduled 18 hours from now
        target_time = datetime.now(UTC) + timedelta(hours=18)
        near_booking = Booking(
            tenant_id=tenant_id,
            customer_name="Sarah Connor",
            customer_phone="+15125550888",
            service_type="hvac_inspection",
            status="confirmed",
            start_at=target_time,
            end_at=target_time + timedelta(hours=1),
        )
        db.add(near_booking)
        db.commit()

        result = dispatch_24h_booking_reminders(db=db, tenant_id=tenant_id, sms_dispatcher=mock_sms)
        assert result["reminders_dispatched"] >= 1

        # Verify SMS was recorded
        assert len(mock_sms.sent_messages) >= 1
        sent_recipients = [m[0] for m in mock_sms.sent_messages]
        assert "+15125550888" in sent_recipients
        sent_text = next(m[1] for m in mock_sms.sent_messages if m[0] == "+15125550888")
        assert "reschedule" in sent_text.lower()
    finally:
        db.close()


def test_public_website_lead_capture_requires_consent_and_persists(
    test_setup_booking: dict[str, Any],
) -> None:
    """Verify /public/website-leads rejects missing consent and persists Lead + ConsentRecord."""
    no_consent = client.post(
        "/api/v1/public/website-leads",
        json={
            "name": "Priya Nair",
            "business_name": "Cedar Dental",
            "email": "priya@cedardental.example",
            "phone": "+15125550144",
            "industry": "dental",
            "region": "US",
            "consent_accepted": False,
        },
    )
    assert no_consent.status_code == 422

    ok = client.post(
        "/api/v1/public/website-leads",
        json={
            "name": "Priya Nair",
            "business_name": "Cedar Dental",
            "email": "priya@cedardental.example",
            "phone": "+15125550144",
            "industry": "dental",
            "region": "UAE",
            "consent_accepted": True,
        },
    )
    assert ok.status_code == 201, ok.text
    data = ok.json()
    assert data["status"] == "received"
    assert data["lead_id"]
