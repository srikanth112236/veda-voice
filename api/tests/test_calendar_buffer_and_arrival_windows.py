"""Automated tests for Calendar Buffer Time Protection & Dispatch Arrival Windows.

Verifies:
1. Calendar settings GET and PATCH (/api/v1/portal/calendar/settings).
2. Buffer Time Protection (15–45 min customizable buffers between appointments for travel or room reset).
3. Availability calculation with Buffer Protection (slots colliding with buffer envelope marked unavailable).
4. Arrival Window Support: 2-hour and 4-hour dispatch windows generation and booking.
5. Manual booking validation enforcing buffer time protection unless explicitly bypassed with emergency override.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from starlette.testclient import TestClient

from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.booking import Booking
from api.app.models.tenant import AgentProfile, Tenant
from api.app.services.calendar.availability import compute_available_slots

client = TestClient(app)


def _get_auth_tenant() -> tuple[dict, str]:
    """Register a fresh tenant and return auth header and tenant_id."""
    init_db()
    unique = datetime.now(UTC).strftime("%H%M%S%f")
    email = f"operator_{unique}@precisionbuffer{unique}.com"
    phone = f"+1512{unique[:7]}"

    resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Precision Dispatch {unique}",
            "owner_name": "Dave Buffer",
            "email": email,
            "password": "BufferPass123!",
            "phone_number": phone,
        },
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    tenant_id = resp.json()["user"]["tenant_id"]
    return {"Authorization": f"Bearer {token}"}, tenant_id


def test_calendar_settings_lifecycle() -> None:
    """Test GET and PATCH /api/v1/portal/calendar/settings."""
    headers, tenant_id = _get_auth_tenant()

    # 1. GET default settings
    get_res = client.get("/api/v1/portal/calendar/settings", headers=headers)
    assert get_res.status_code == 200, get_res.text
    data = get_res.json()
    assert data["scheduling_mode"] in ("exact_time", "arrival_window")
    assert data["arrival_window_hours"] in (2, 4)
    assert data["calendar_buffer_minutes"] in (15, 20, 30, 45)

    # 2. PATCH settings to 30 min buffer and 2-hr arrival windows
    patch_res = client.patch(
        "/api/v1/portal/calendar/settings",
        headers=headers,
        json={
            "scheduling_mode": "arrival_window",
            "arrival_window_hours": 2,
            "calendar_buffer_minutes": 30,
            "calendar_buffer_mode": "both",
            "calendar_buffer_reason": "travel_and_transit",
        },
    )
    assert patch_res.status_code == 200, patch_res.text
    updated = patch_res.json()
    assert updated["scheduling_mode"] == "arrival_window"
    assert updated["arrival_window_hours"] == 2
    assert updated["calendar_buffer_minutes"] == 30
    assert updated["calendar_buffer_mode"] == "both"
    assert updated["calendar_buffer_reason"] == "travel_and_transit"

    # 3. Test invalid buffer minutes validation
    bad_res = client.patch(
        "/api/v1/portal/calendar/settings",
        headers=headers,
        json={"calendar_buffer_minutes": 55},
    )
    assert bad_res.status_code == 400


def test_buffer_protection_window_enforcement() -> None:
    """Verify that buffer time protects appointments so candidate slots overlapping [end, end + buffer] are unavailable."""
    headers, tenant_id = _get_auth_tenant()

    with SessionLocal() as db_session:
        tenant = db_session.scalar(select(Tenant).where(Tenant.id == tenant_id))
        assert tenant is not None

        # Set 30 min buffer
        profile = db_session.scalar(select(AgentProfile).where(AgentProfile.tenant_id == tenant_id))
        if profile:
            profile.calendar_buffer_minutes = 30
            profile.calendar_buffer_mode = "after"
            profile.calendar_buffer_reason = "travel_time"
            profile.scheduling_mode = "exact_time"
            db_session.commit()

        # Target date: next Wednesday
        today = date.today()
        days_ahead = (2 - today.weekday() + 7) % 7
        if days_ahead == 0:
            days_ahead = 7
        target_date = today + timedelta(days=days_ahead)

        # Insert an existing booking: 10:00 AM to 11:00 AM
        start_dt = datetime.combine(target_date, time(10, 0), tzinfo=UTC)
        end_dt = datetime.combine(target_date, time(11, 0), tzinfo=UTC)

        b = Booking(
            tenant_id=tenant_id,
            customer_name="Existing Customer",
            customer_phone="+15125550100",
            service_type="Plumbing Repair",
            start_at=start_dt,
            end_at=end_dt,
            status="confirmed",
        )
        db_session.add(b)
        db_session.commit()

        # Compute slots with 30-min buffer
        slots_res = compute_available_slots(
            tenant=tenant,
            target_date=target_date,
            db=db_session,
            service_duration_minutes=60,
            buffer_minutes=30,
            scheduling_mode="exact_time",
        )

        slot_map = {s.display_time: s.is_available for s in slots_res.slots}
        # 11:00 AM immediately follows the 10:00-11:00 booking, so 30-min buffer envelope [11:00-11:30] makes it unavailable
        assert "11:00 AM" in slot_map
        assert slot_map["11:00 AM"] is False
        # 12:30 PM is well past the buffer envelope, so it is available
        assert "12:30 PM" in slot_map
        assert slot_map["12:30 PM"] is True


def test_arrival_window_generation() -> None:
    """Verify arrival window mode generates discrete 2-hour or 4-hour dispatch arrival windows."""
    headers, tenant_id = _get_auth_tenant()

    with SessionLocal() as db_session:
        tenant = db_session.scalar(select(Tenant).where(Tenant.id == tenant_id))
        assert tenant is not None

        today = date.today()
        days_ahead = (3 - today.weekday() + 7) % 7
        if days_ahead == 0:
            days_ahead = 7
        target_date = today + timedelta(days=days_ahead)

        # 1. 2-Hour Arrival Windows
        res_2hr = compute_available_slots(
            tenant=tenant,
            target_date=target_date,
            db=db_session,
            service_duration_minutes=60,
            buffer_minutes=30,
            scheduling_mode="arrival_window",
            arrival_window_hours=2,
        )
        assert res_2hr.available_count > 0
        first_window = res_2hr.slots[0]
        assert first_window.is_arrival_window is True
        assert "2-Hr Arrival Window" in first_window.display_time
        assert first_window.window_start_iso is not None
        assert first_window.window_end_iso is not None

        # 2. 4-Hour Arrival Windows
        res_4hr = compute_available_slots(
            tenant=tenant,
            target_date=target_date,
            db=db_session,
            service_duration_minutes=60,
            buffer_minutes=30,
            scheduling_mode="arrival_window",
            arrival_window_hours=4,
        )
        assert res_4hr.available_count > 0
        first_4hr = res_4hr.slots[0]
        assert first_4hr.is_arrival_window is True
        assert "4-Hr Arrival Window" in first_4hr.display_time


def test_manual_booking_buffer_conflict_and_emergency_override() -> None:
    """Verify manual booking endpoint rejects slots that violate buffer time unless bypass_buffer=True."""
    headers, tenant_id = _get_auth_tenant()

    # Configure 30-min buffer
    client.patch(
        "/api/v1/portal/calendar/settings",
        headers=headers,
        json={"calendar_buffer_minutes": 30, "calendar_buffer_mode": "after"},
    )

    future_dt = datetime.now(UTC) + timedelta(days=5)
    start_1 = future_dt.replace(hour=10, minute=0, second=0, microsecond=0)
    end_1 = start_1 + timedelta(minutes=60)

    # 1. Book first appointment 10:00 - 11:00
    res1 = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=headers,
        json={
            "customer_name": "First Customer",
            "customer_phone": "+15125550201",
            "service_type": "HVAC Diagnostic",
            "start_at": start_1.isoformat(),
            "end_at": end_1.isoformat(),
        },
    )
    assert res1.status_code == 200, res1.text

    # 2. Attempt to book at 11:15 (only 15m after 11:00, violates 30m buffer) -> 409 Conflict!
    start_2 = start_1 + timedelta(minutes=75)  # 11:15 AM
    end_2 = start_2 + timedelta(minutes=60)

    res2_fail = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=headers,
        json={
            "customer_name": "Second Customer",
            "customer_phone": "+15125550202",
            "service_type": "HVAC Repair",
            "start_at": start_2.isoformat(),
            "end_at": end_2.isoformat(),
            "bypass_buffer": False,
        },
    )
    assert res2_fail.status_code == 409
    assert "violates buffer time protection" in res2_fail.json()["detail"]

    # 3. Emergency Override (bypass_buffer=True) -> 200 OK!
    res2_override = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=headers,
        json={
            "customer_name": "Second Customer Emergency",
            "customer_phone": "+15125550202",
            "service_type": "Emergency Pipe Burst",
            "start_at": start_2.isoformat(),
            "end_at": end_2.isoformat(),
            "bypass_buffer": True,
        },
    )
    assert res2_override.status_code == 200, res2_override.text
    booking_data = res2_override.json()
    assert booking_data["customer_name"] == "Second Customer Emergency"
