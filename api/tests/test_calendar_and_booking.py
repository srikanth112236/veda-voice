"""Comprehensive tests for CalendarProvider, Google Meet integration, availability engine, and double-booking guard (Milestone M3)."""

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from starlette.testclient import TestClient

from agent.tools.booking import (
    book_appointment,
    cancel_appointment,
    check_availability,
    hold_slot,
)
from api.app.core.security import create_access_token, decrypt_token, encrypt_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import compute_available_slots
from api.app.services.calendar.base import Interval
from api.app.services.calendar.booking import (
    SlotUnavailableError,
    confirm_booking,
)
from api.app.services.calendar.google import MockSandboxCalendarProvider

client = TestClient(app)


def _next_weekday(weekday: int) -> date:
    """Return the next strictly future date matching Python weekday (0=Mon..6=Sun)."""
    today = date.today()
    days_ahead = (weekday - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


def test_envelope_encryption_roundtrip() -> None:
    """Verify envelope encryption encrypts and decrypts refresh tokens faithfully."""
    plain_token = "ya29.a0ARrdaM-fake-refresh-token-from-google-oauth-12345"
    encrypted = encrypt_token(plain_token)
    assert encrypted != plain_token
    assert len(encrypted) > 20

    decrypted = decrypt_token(encrypted)
    assert decrypted == plain_token


def test_envelope_encryption_invalid_data() -> None:
    """Verify invalid ciphertext fails decryption with ValueError."""
    with pytest.raises(ValueError, match="Failed to decrypt token"):
        decrypt_token("invalid-garbage-ciphertext-string")


def test_availability_engine_operating_hours_and_buffers() -> None:
    """Verify availability engine generates slots within business hours and applies buffers."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Clockwork Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        # Choose a future Monday
        future_monday = _next_weekday(0)

        response = compute_available_slots(
            tenant=tenant,
            target_date=future_monday,
            db=db,
            service_duration_minutes=60,
            buffer_minutes=15,
        )

        assert response.tenant_id == tenant.id
        assert response.available_count > 0

        # Check first slot starts at 8:00 AM Eastern
        first_slot = response.slots[0]
        assert "08:00:00" in first_slot.start_iso
        assert first_slot.display_time == "8:00 AM"

        # Check second slot reflects 60m duration + 15m buffer = 9:15 AM
        second_slot = response.slots[1]
        assert "09:15:00" in second_slot.start_iso
        assert second_slot.display_time == "9:15 AM"

    finally:
        db.close()


def test_availability_engine_sunday_closed() -> None:
    """Verify availability engine returns 0 slots on Sundays."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Sunday Closed HVAC {suffix}",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        # Future Sunday date
        sunday = _next_weekday(6)
        response = compute_available_slots(tenant=tenant, target_date=sunday, db=db)
        assert response.available_count == 0
        assert len(response.slots) == 0
    finally:
        db.close()


def test_availability_engine_filters_external_google_calendar_busy_blocks() -> None:
    """Verify Google Calendar free_busy intervals remove conflicting slots from availability."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Busy Electric {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        tz = ZoneInfo("America/New_York")
        target_date = _next_weekday(1)  # Future Tuesday

        # Mock an external Google Calendar event from 10:00 AM to 11:30 AM
        sandbox_provider = MockSandboxCalendarProvider()
        sandbox_provider.busy_blocks.append(
            Interval(
                start=datetime.combine(target_date, datetime.min.time(), tzinfo=tz).replace(
                    hour=10, minute=0
                ),
                end=datetime.combine(target_date, datetime.min.time(), tzinfo=tz).replace(
                    hour=11, minute=30
                ),
            )
        )

        response = compute_available_slots(
            tenant=tenant,
            target_date=target_date,
            db=db,
            service_duration_minutes=60,
            buffer_minutes=0,
            custom_provider=sandbox_provider,
        )

        slot_dict = {s.display_time: s.is_available for s in response.slots}

        # 8:00 AM and 9:00 AM should be available
        assert slot_dict.get("8:00 AM") is True
        assert slot_dict.get("9:00 AM") is True
        # 10:00 AM and 11:00 AM overlap the external Google Calendar event, so unavailable
        assert slot_dict.get("10:00 AM") is False
        assert slot_dict.get("11:00 AM") is False
        # 12:00 PM should be available again
        assert slot_dict.get("12:00 PM") is True

    finally:
        db.close()


def test_double_booking_concurrency_prevention() -> None:
    """Verify that two simultaneous booking attempts for the same slot result in double-booking rejection."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Anti-Collision Plumbing {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.commit()

        tz = ZoneInfo("America/New_York")
        slot_time = datetime(2026, 12, 1, 14, 0, tzinfo=tz)

        # 1. First caller confirms booking
        booking1 = confirm_booking(
            tenant_id=tenant.id,
            slot_start=slot_time,
            duration_minutes=60,
            customer_name="Alice Smith",
            customer_phone="+15125550101",
            service_type="drain_cleaning",
            call_id="call-1",
            db=db,
        )
        assert booking1.status == "confirmed"
        assert booking1.customer_name == "Alice Smith"

        # 2. Second caller attempts to book the exact same slot concurrently
        with pytest.raises(SlotUnavailableError, match="already booked"):
            confirm_booking(
                tenant_id=tenant.id,
                slot_start=slot_time,
                duration_minutes=60,
                customer_name="Bob Jones",
                customer_phone="+15125550102",
                service_type="drain_cleaning",
                call_id="call-2",
                db=db,
            )

    finally:
        db.close()


def test_idempotent_booking_returns_same_record() -> None:
    """Verify that sending the same idempotency_key returns existing booking without creating duplicates."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    idempotency_key = f"idemp-{suffix}-test"
    try:
        tenant = Tenant(
            name=f"Idempotent Drains {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.commit()

        tz = ZoneInfo("America/New_York")
        slot_time = datetime(2026, 12, 2, 10, 0, tzinfo=tz)

        first_call = confirm_booking(
            tenant_id=tenant.id,
            slot_start=slot_time,
            duration_minutes=60,
            customer_name="Charlie Brown",
            customer_phone="+15125550199",
            idempotency_key=idempotency_key,
            db=db,
        )

        second_call = confirm_booking(
            tenant_id=tenant.id,
            slot_start=slot_time,
            duration_minutes=60,
            customer_name="Charlie Brown",
            customer_phone="+15125550199",
            idempotency_key=idempotency_key,
            db=db,
        )

        assert first_call.id == second_call.id
        assert second_call.customer_name == "Charlie Brown"

    finally:
        db.close()


def test_google_meet_link_injection_on_booking() -> None:
    """Verify that booking with GoogleCalendarProvider injects Google Meet link."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Video Consultations {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.commit()

        sandbox = MockSandboxCalendarProvider()
        tz = ZoneInfo("America/New_York")
        slot_time = datetime(2026, 12, 3, 11, 0, tzinfo=tz)

        booking = confirm_booking(
            tenant_id=tenant.id,
            slot_start=slot_time,
            duration_minutes=45,
            customer_name="Dave Wilson",
            customer_phone="+15125550188",
            customer_email="dave@example.com",
            service_type="video_inspection",
            custom_provider=sandbox,
            db=db,
        )

        assert booking.status == "confirmed"
        assert booking.meet_link is not None
        assert "meet.google.com" in booking.meet_link
        assert booking.calendar_event_id is not None
        assert booking.calendar_event_id in sandbox.events

    finally:
        db.close()


def test_portal_google_calendar_oauth_and_status() -> None:
    """Verify portal calendar status, connect URL, and mock OAuth callback."""
    suffix = uuid.uuid4().hex[:6]
    email = f"cal_owner_{suffix}@test.com"

    # Register tenant
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"OAuth Cal Corp {suffix}",
            "owner_name": "Cal Owner",
            "email": email,
            "password": "Password123!",
            "phone_number": f"+1512{uuid.uuid4().int % 9000000 + 1000000}",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]

    headers = {"Authorization": f"Bearer {token}"}

    # 1. Initially disconnected
    status_res = client.get("/api/v1/portal/calendar/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["is_connected"] is False

    # 2. Get connect OAuth URL
    connect_res = client.get("/api/v1/portal/calendar/connect", headers=headers)
    assert connect_res.status_code == 200
    assert "accounts.google.com" in connect_res.json()["auth_url"]
    signed_state = connect_res.json()["state"]
    assert signed_state

    # 3. Simulate OAuth callback with mock code
    callback_res = client.get(
        f"/api/v1/portal/calendar/callback?code=mock_code_12345&state={signed_state}"
    )
    assert callback_res.status_code == 200
    assert callback_res.json()["status"] == "connected"

    # 4. Status should now be connected
    status_after = client.get("/api/v1/portal/calendar/status", headers=headers)
    assert status_after.status_code == 200
    assert status_after.json()["is_connected"] is True
    assert status_after.json()["provider"] == "google_calendar"

    # 5. Disconnect
    disc_res = client.post("/api/v1/portal/calendar/disconnect", headers=headers)
    assert disc_res.status_code == 200
    assert disc_res.json()["status"] == "disconnected"


def test_voice_agent_calendar_tools_flow() -> None:
    """Verify agent tools check availability, hold, book, and cancel via internal API."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Agent Tool Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        # Generate call-scoped agent token
        call_id = f"live-agent-call-{suffix}"
        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant.id,
                "call_id": call_id,
            }
        )

        target_date_str = _next_weekday(2).isoformat()  # Future Wednesday

        # 1. Agent checks availability
        avail = check_availability(call_token=call_token, target_date=target_date_str)
        assert avail["tenant_id"] == tenant.id
        assert avail["available_count"] > 0
        first_open_slot = avail["slots"][0]["start_iso"]

        # 2. Agent holds slot for caller
        hold_res = hold_slot(
            call_token=call_token,
            start_iso=first_open_slot,
            customer_name="George Washington",
            customer_phone="+15125550199",
        )
        assert hold_res["status"] == "held"
        booking_id = hold_res["booking_id"]

        # 3. Agent confirms appointment booking
        book_res = book_appointment(
            call_token=call_token,
            start_iso=first_open_slot,
            customer_name="George Washington",
            customer_phone="+15125550199",
            customer_email="george@example.com",
            service_type="main_drain_inspection",
        )
        assert book_res["status"] == "confirmed"
        assert book_res["customer_name"] == "George Washington"

        # 4. Agent cancels booking
        cancel_res = cancel_appointment(call_token=call_token, booking_id=booking_id)
        assert cancel_res["status"] == "cancelled"

    finally:
        db.close()
