"""Test suite for manual appointment booking, conflict detection, and CRM linkage."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from starlette.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_manual_booking_lifecycle_and_conflict_detection() -> None:
    """Verify manual booking creation, slot conflict checking, and CRM linkage."""
    suffix = uuid.uuid4().hex[:6]
    email = f"cal_owner_{suffix}@test.com"
    phone_offset = uuid.uuid4().int % 9000000 + 1000000

    # 1. Register a fresh test tenant
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Apex Schedulers {suffix}",
            "owner_name": "Calendar Admin",
            "email": email,
            "password": "Password123!",
            "phone_number": f"+1512{phone_offset}",
        },
    )
    assert reg_res.status_code == 200, reg_res.text
    token = reg_res.json()["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # 2. Connect mock sandbox calendar
    sandbox_res = client.post("/api/v1/portal/calendar/connect-sandbox", headers=auth_header)
    assert sandbox_res.status_code == 200, sandbox_res.text

    # 3. Create a manual booking for tomorrow at 10:00 AM UTC
    tomorrow = datetime.now(UTC) + timedelta(days=1)
    start_time = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
    end_time = tomorrow.replace(hour=11, minute=0, second=0, microsecond=0)

    customer_phone = f"+1512{phone_offset + 1}"
    booking_res = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=auth_header,
        json={
            "customer_name": "Marcus Aurelius",
            "customer_phone": customer_phone,
            "customer_email": "marcus@rome.com",
            "service_type": "Water Heater Replacement",
            "start_at": start_time.isoformat(),
            "end_at": end_time.isoformat(),
            "notes": "Customer requested senior technician",
        },
    )
    assert booking_res.status_code == 200, booking_res.text
    b_data = booking_res.json()
    assert b_data["customer_name"] == "Marcus Aurelius"
    assert b_data["service_type"] == "Water Heater Replacement"
    assert b_data["status"] == "confirmed"
    assert b_data["contact_id"] is not None  # Linked to CRM!

    # 4. Attempt to create conflicting booking at overlapping time (10:30 - 11:30 AM)
    conflict_start = tomorrow.replace(hour=10, minute=30, second=0, microsecond=0)
    conflict_end = tomorrow.replace(hour=11, minute=30, second=0, microsecond=0)
    conflict_res = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=auth_header,
        json={
            "customer_name": "Seneca Younger",
            "customer_phone": f"+1512{phone_offset + 2}",
            "service_type": "Drain Cleaning",
            "start_at": conflict_start.isoformat(),
            "end_at": conflict_end.isoformat(),
        },
    )
    assert conflict_res.status_code == 409, conflict_res.text
    assert "conflicts with an existing booking" in conflict_res.json()["detail"]

    # 5. Invalid end time before start time returns 400
    invalid_res = client.post(
        "/api/v1/portal/calendar/bookings/manual",
        headers=auth_header,
        json={
            "customer_name": "Epictetus",
            "customer_phone": f"+1512{phone_offset + 3}",
            "service_type": "Inspection",
            "start_at": end_time.isoformat(),
            "end_at": start_time.isoformat(),  # end before start!
        },
    )
    assert invalid_res.status_code == 400

    # 6. Verify list_bookings returns contact_id
    list_res = client.get("/api/v1/portal/calendar/bookings", headers=auth_header)
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 1
    found = next((item for item in items if item["id"] == b_data["id"]), None)
    assert found is not None
    assert found["contact_id"] == b_data["contact_id"]
