"""Tests for Milestone M10b: Multi-Staff Calendar Scheduling & Round-Robin Booking (FR-CAL-9 to 15)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.booking import Booking
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.calendar.base import ExternalEvent
from api.app.services.calendar.dispatch import (
    assign_technician_round_robin,
    filter_eligible_staff,
    matches_territory,
)
from api.app.services.calendar.microsoft import MicrosoftOutlookProvider

client = TestClient(app)


def test_territory_matching_rules() -> None:
    """Verify territory zip code matching with exact matches, wildcards, and 3-digit prefixes."""
    assert matches_territory("78701", ["78701", "78702"]) is True
    assert matches_territory("78704", ["78701", "78702"]) is False
    assert matches_territory("78704", ["787*"]) is True
    assert matches_territory("78759", ["787"]) is True
    assert matches_territory("90210", []) is True  # Empty means all areas


def test_staff_portal_crud_and_metrics() -> None:
    """Verify tenant portal endpoints for listing, creating, updating, and deleting staff members."""
    db: Session = SessionLocal()
    tenant_id = f"staff-test-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    try:
        tenant = Tenant(
            id=tenant_id, name="Austin Master Plumbers", timezone="America/Chicago", status="active"
        )
        db.add(tenant)
        user = User(
            id=user_id,
            tenant_id=tenant_id,
            email=f"owner_{uuid.uuid4().hex[:6]}@austinplumbing.com",
            hashed_password="hash",
            full_name="Austin Owner",
            role="business_owner",
            is_active=True,
        )
        db.add(user)
        db.commit()

        token = create_access_token(
            {"sub": user_id, "role": "business_owner", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create Staff Technician
        create_res = client.post(
            "/api/v1/portal/calendar/staff",
            headers=headers,
            json={
                "name": "Sarah Connor",
                "email": "sarah@austinplumbing.com",
                "phone": "+15125550111",
                "role": "master_plumber",
                "skills": ["water_heater", "emergency_gas"],
                "service_territory_zips": ["78701", "78702", "787*"],
                "priority_weight": 2,
                "is_active": True,
            },
        )
        assert create_res.status_code == 201
        created_data = create_res.json()
        assert created_data["name"] == "Sarah Connor"
        assert created_data["role"] == "master_plumber"
        assert "water_heater" in created_data["skills"]
        staff_id = created_data["id"]

        # 2. List Staff
        list_res = client.get("/api/v1/portal/calendar/staff", headers=headers)
        assert list_res.status_code == 200
        staff_items = list_res.json()
        assert len(staff_items) == 1
        assert staff_items[0]["id"] == staff_id

        # 3. Update Staff
        update_res = client.put(
            f"/api/v1/portal/calendar/staff/{staff_id}",
            headers=headers,
            json={"priority_weight": 3, "role": "lead_master_plumber"},
        )
        assert update_res.status_code == 200
        assert update_res.json()["priority_weight"] == 3
        assert update_res.json()["role"] == "lead_master_plumber"

        # 4. Delete Staff
        del_res = client.delete(f"/api/v1/portal/calendar/staff/{staff_id}", headers=headers)
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True

        # Verify deletion in list
        list_after = client.get("/api/v1/portal/calendar/staff", headers=headers)
        assert len(list_after.json()) == 0

    finally:
        db.query(StaffMember).filter(StaffMember.tenant_id == tenant_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_skill_and_territory_dispatch_simulation() -> None:
    """Verify dispatch preview simulation accurately filters technicians based on trade and postal code."""
    db: Session = SessionLocal()
    tenant_id = f"sim-test-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    try:
        tenant = Tenant(
            id=tenant_id, name="Metro HVAC & Trades", timezone="America/Chicago", status="active"
        )
        db.add(tenant)
        user = User(
            id=user_id,
            tenant_id=tenant_id,
            email=f"manager_{uuid.uuid4().hex[:6]}@metrohvac.com",
            hashed_password="hash",
            full_name="Operations Manager",
            role="business_owner",
            is_active=True,
        )
        db.add(user)

        # Tech A: HVAC specialist covering 787* (Austin)
        tech_a = StaffMember(
            tenant_id=tenant_id,
            name="Alice HVAC",
            email="alice@metrohvac.com",
            role="hvac_specialist",
            skills=["ac_repair", "heat_pump", "furnace"],
            service_territory_zips=["787*"],
            priority_weight=1,
            is_active=True,
        )
        db.add(tech_a)

        # Tech B: Plumber covering 786* (Round Rock)
        tech_b = StaffMember(
            tenant_id=tenant_id,
            name="Bob Plumber",
            email="bob@metrohvac.com",
            role="master_plumber",
            skills=["drain_cleaning", "tankless_flush"],
            service_territory_zips=["786*"],
            priority_weight=1,
            is_active=True,
        )
        db.add(tech_b)
        db.commit()

        token = create_access_token(
            {"sub": user_id, "role": "business_owner", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {token}"}

        # Query 1: AC repair in 78701 -> Must match Alice only
        sim1 = client.post(
            "/api/v1/portal/calendar/dispatch/preview",
            headers=headers,
            json={"service_type": "ac_repair", "postal_code": "78701"},
        )
        assert sim1.status_code == 200
        data1 = sim1.json()
        assert data1["eligible_technicians_count"] == 1
        assert data1["chosen_technician"]["name"] == "Alice HVAC"

        # Query 2: Drain cleaning in 78664 -> Must match Bob only
        sim2 = client.post(
            "/api/v1/portal/calendar/dispatch/preview",
            headers=headers,
            json={"service_type": "drain_cleaning", "postal_code": "78664"},
        )
        assert sim2.status_code == 200
        data2 = sim2.json()
        assert data2["eligible_technicians_count"] == 1
        assert data2["chosen_technician"]["name"] == "Bob Plumber"

    finally:
        db.query(StaffMember).filter(StaffMember.tenant_id == tenant_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_round_robin_fair_rotation() -> None:
    """Verify that multiple successive bookings rotate evenly between eligible technicians."""
    db: Session = SessionLocal()
    tenant_id = f"rr-test-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id, name="Round Robin Plumbing", timezone="America/Chicago", status="active"
        )
        db.add(tenant)

        # 3 technicians with identical skills and territories
        tech1 = StaffMember(
            tenant_id=tenant_id,
            name="Tech 1 Alpha",
            email="tech1@rr.com",
            skills=["drain_snaking"],
            service_territory_zips=["78701"],
            priority_weight=1,
            is_active=True,
            last_assigned_at=None,
        )
        tech2 = StaffMember(
            tenant_id=tenant_id,
            name="Tech 2 Bravo",
            email="tech2@rr.com",
            skills=["drain_snaking"],
            service_territory_zips=["78701"],
            priority_weight=1,
            is_active=True,
            last_assigned_at=None,
        )
        tech3 = StaffMember(
            tenant_id=tenant_id,
            name="Tech 3 Charlie",
            email="tech3@rr.com",
            skills=["drain_snaking"],
            service_territory_zips=["78701"],
            priority_weight=1,
            is_active=True,
            last_assigned_at=None,
        )
        db.add_all([tech1, tech2, tech3])
        db.commit()

        slot_time = datetime(2026, 11, 20, 10, 0, tzinfo=UTC)

        # Allocation 1: should pick Tech 1
        eligible = filter_eligible_staff(tenant_id, "drain_snaking", "78701", db)
        picked1 = assign_technician_round_robin(eligible, slot_time, db)
        assert picked1 is not None

        # Allocation 2 (different slot): should rotate to a different technician
        slot_time2 = datetime(2026, 11, 20, 14, 0, tzinfo=UTC)
        picked2 = assign_technician_round_robin(eligible, slot_time2, db)
        assert picked2 is not None
        assert picked2.id != picked1.id

        # Allocation 3: should pick the 3rd technician
        slot_time3 = datetime(2026, 11, 20, 16, 0, tzinfo=UTC)
        picked3 = assign_technician_round_robin(eligible, slot_time3, db)
        assert picked3 is not None
        assert picked3.id not in (picked1.id, picked2.id)

        # Allocation 4: now all 3 have been assigned once, cycle loops back to least recently assigned
        slot_time4 = datetime(2026, 11, 21, 9, 0, tzinfo=UTC)
        picked4 = assign_technician_round_robin(eligible, slot_time4, db)
        assert picked4 is not None
        assert picked4.id == picked1.id

    finally:
        db.query(StaffMember).filter(StaffMember.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_internal_agent_booking_with_dispatch() -> None:
    """Verify internal voice agent booking endpoint automatically assigns technician and records postal code."""
    db: Session = SessionLocal()
    tenant_id = f"agent-bk-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id, name="Agent Dispatch Co", timezone="America/Chicago", status="active"
        )
        db.add(tenant)

        tech = StaffMember(
            tenant_id=tenant_id,
            name="Dan Dispatch",
            email="dan@dispatch.com",
            skills=["water_heater"],
            service_territory_zips=["78704"],
            priority_weight=1,
            is_active=True,
        )
        db.add(tech)
        db.commit()

        agent_token = create_access_token(
            {"sub": "call-dispatch-99", "role": "agent", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {agent_token}"}

        # 1. Check availability with postal code
        from datetime import date, timedelta

        future_day = date.today() + timedelta(days=3)
        while future_day.weekday() >= 5:
            future_day += timedelta(days=1)

        avail_res = client.post(
            "/api/v1/internal/calendar/availability",
            headers=headers,
            json={
                "target_date": future_day.isoformat(),
                "duration_minutes": 60,
                "service_type": "water_heater",
                "postal_code": "78704",
            },
        )
        assert avail_res.status_code == 200
        avail_data = avail_res.json()
        assert avail_data["available_count"] > 0
        slot_start = avail_data["slots"][0]["start_iso"]

        # 2. Book appointment with postal code
        book_res = client.post(
            "/api/v1/internal/calendar/book",
            headers=headers,
            json={
                "start_iso": slot_start,
                "duration_minutes": 60,
                "customer_name": "Marcus Vance",
                "customer_phone": "+15125550888",
                "service_type": "water_heater",
                "postal_code": "78704",
                "notes": "No hot water since yesterday morning.",
            },
        )
        assert book_res.status_code == 200
        booking_data = book_res.json()
        assert booking_data["status"] == "confirmed"
        assert booking_data["staff_id"] == tech.id

        # Verify in DB
        booking_id = booking_data["booking_id"]
        saved_booking = db.scalar(select(Booking).where(Booking.id == booking_id))
        assert saved_booking is not None
        assert saved_booking.staff_id == tech.id
        assert saved_booking.postal_code == "78704"

    finally:
        db.query(Booking).filter(Booking.tenant_id == tenant_id).delete()
        db.query(StaffMember).filter(StaffMember.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_microsoft_outlook_calendar_provider() -> None:
    """Verify MicrosoftOutlookProvider correctly implements CalendarProvider interface and generates events."""
    provider = MicrosoftOutlookProvider(
        refresh_token="mock-refresh-token",
        access_token="mock-ms-access-token",
        token_expiry=datetime.now(UTC) + timedelta(hours=1),
    )

    now = datetime.now(UTC)
    evt = ExternalEvent(
        title="Diagnostic Visit",
        start=now + timedelta(days=1),
        end=now + timedelta(days=1, hours=1),
        description="Customer HVAC maintenance.",
        attendee_emails=["customer@client.com"],
    )

    # 1. Create Event
    created = provider.create_event("technician@vedavoice.io", evt)
    assert created.id is not None
    assert created.meet_link is not None
    assert "teams.microsoft.com" in created.meet_link or "https://" in created.meet_link

    # 2. Free / Busy Query
    intervals = provider.free_busy("technician@vedavoice.io", now, now + timedelta(days=2))
    assert isinstance(intervals, list)

    # 3. Delete Event
    deleted = provider.delete_event("technician@vedavoice.io", created.id)
    assert deleted is True


def test_cross_tenant_isolation_staff() -> None:
    """Verify Tenant A cannot access, view, or dispatch Tenant B's staff members."""
    db: Session = SessionLocal()
    tenant_a = f"tenant-a-{uuid.uuid4().hex[:6]}"
    tenant_b = f"tenant-b-{uuid.uuid4().hex[:6]}"
    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())

    try:
        t_a = Tenant(id=tenant_a, name="Tenant Alpha", timezone="America/New_York", status="active")
        t_b = Tenant(id=tenant_b, name="Tenant Beta", timezone="America/Chicago", status="active")
        db.add_all([t_a, t_b])

        u_a = User(
            id=user_a,
            tenant_id=tenant_a,
            email=f"a_{uuid.uuid4().hex[:4]}@a.com",
            hashed_password="h",
            full_name="User A",
            role="business_owner",
            is_active=True,
        )
        u_b = User(
            id=user_b,
            tenant_id=tenant_b,
            email=f"b_{uuid.uuid4().hex[:4]}@b.com",
            hashed_password="h",
            full_name="User B",
            role="business_owner",
            is_active=True,
        )
        db.add_all([u_a, u_b])

        staff_a = StaffMember(
            tenant_id=tenant_a, name="Alpha Tech", email="alpha@a.com", is_active=True
        )
        staff_b = StaffMember(
            tenant_id=tenant_b, name="Beta Tech", email="beta@b.com", is_active=True
        )
        db.add_all([staff_a, staff_b])
        db.commit()

        token_b = create_access_token(
            {"sub": user_b, "role": "business_owner", "tenant_id": tenant_b}
        )
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Tenant B lists staff -> must only see Beta Tech
        list_res = client.get("/api/v1/portal/calendar/staff", headers=headers_b)
        assert list_res.status_code == 200
        names = [s["name"] for s in list_res.json()]
        assert "Beta Tech" in names
        assert "Alpha Tech" not in names

        # Tenant B attempts update on Tenant A's staff -> 404
        up_res = client.put(
            f"/api/v1/portal/calendar/staff/{staff_a.id}",
            headers=headers_b,
            json={"role": "hacked"},
        )
        assert up_res.status_code == 404

        # Tenant B attempts delete on Tenant A's staff -> 404
        del_res = client.delete(f"/api/v1/portal/calendar/staff/{staff_a.id}", headers=headers_b)
        assert del_res.status_code == 404

    finally:
        db.query(StaffMember).filter(StaffMember.tenant_id.in_([tenant_a, tenant_b])).delete()
        db.query(User).filter(User.id.in_([user_a, user_b])).delete()
        db.query(Tenant).filter(Tenant.id.in_([tenant_a, tenant_b])).delete()
        db.commit()
        db.close()
