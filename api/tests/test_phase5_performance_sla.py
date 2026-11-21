"""Phase 5: Automated Verification & Performance SLAs Benchmark Suite.

Verifies strict SLAs:
1. Slot availability calculation SLA: < 400ms
2. In-call booking execution roundtrip SLA: < 800ms
3. Prompt compilation and variable synthesis SLA: < 150ms
4. Location geofence lookup SLA: < 50ms
5. Full End-to-End Lifecycle: Onboarding -> Primary Branch -> Pack Compilation -> Staff Dispatch -> In-Call Tool
"""

import time
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from agent.config import TenantConfig
from agent.prompts import build_system_prompt
from agent.tools.booking import create_booking_tools
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.location import Location
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import compute_available_slots
from api.app.services.industry_packs import compile_tenant_prompt, seed_default_industry_packs
from api.app.services.locations import resolve_location_for_caller

client = TestClient(app)


def test_sla_slot_availability_calculation():
    """Verify that multi-staff slot calculation evaluates in under 400ms."""
    with SessionLocal() as db:
        seed_default_industry_packs(db)
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="SLA Benchmark Plumbing",
            timezone="America/New_York",
            hours="Monday to Friday, 8:00 AM to 6:00 PM EST",
            status="active",
        )
        db.add(tenant)
        db.flush()

        loc = Location(
            tenant_id=tenant.id,
            name="Austin Hub",
            code="ATX",
            service_territory_zips=["78701", "78702", "78703"],
            timezone="America/Chicago",
            is_primary=True,
            is_active=True,
        )
        db.add(loc)
        db.flush()

        # Add 3 technicians with skills
        for i in range(3):
            staff = StaffMember(
                tenant_id=tenant.id,
                location_id=loc.id,
                name=f"Technician {i+1}",
                email=f"tech{i+1}_{tenant_id[:4]}@example.com",
                skills=["water_heater", "plumbing"],
                duty_status="on_duty",
                is_active=True,
            )
            db.add(staff)
        db.commit()

        target_date = (datetime.now(UTC) + timedelta(days=2)).date()

        # Measure computation latency
        t0 = time.perf_counter()
        res = compute_available_slots(
            tenant=tenant,
            target_date=target_date,
            db=db,
            service_type="water_heater",
            postal_code="78701",
            location_id=loc.id,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert len(res.slots) > 0
        assert elapsed_ms < 400.0, f"Slot availability exceeded 400ms SLA: took {elapsed_ms:.2f}ms"


def test_sla_prompt_compilation_and_synthesis():
    """Verify that prompt compilation and token assembly completes in under 150ms."""
    with SessionLocal() as db:
        seed_default_industry_packs(db)
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Fast Prompt Heating",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.commit()

        from api.app.services.industry_packs import apply_pack_to_tenant

        apply_pack_to_tenant(tenant.id, "home_services", db=db)

        t0 = time.perf_counter()
        compiled_prompt = compile_tenant_prompt(tenant.id, db)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert "Fast Prompt Heating" in compiled_prompt
        assert elapsed_ms < 150.0, f"Prompt compilation exceeded 150ms SLA: took {elapsed_ms:.2f}ms"


def test_sla_location_geofence_resolution():
    """Verify that location routing resolution completes in under 50ms."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Multi Branch Enterprise",
            status="active",
        )
        db.add(tenant)
        db.flush()

        # Seed 5 branch locations
        for i, code in enumerate(["ATX", "DFW", "HOU", "SAT", "ELP"]):
            loc = Location(
                tenant_id=tenant.id,
                name=f"Branch {code}",
                code=code,
                service_territory_zips=[f"787{i:02d}", f"787{i+1:02d}"],
                is_active=True,
            )
            db.add(loc)
        db.commit()

        t0 = time.perf_counter()
        resolved = resolve_location_for_caller(tenant.id, db, postal_code="78700")
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert resolved is not None
        assert resolved.code == "ATX"
        assert elapsed_ms < 50.0, f"Location resolve exceeded 50ms SLA: took {elapsed_ms:.2f}ms"


@pytest.mark.asyncio
async def test_sla_in_call_booking_tool_roundtrip():
    """Verify that booking tool execution completes within 800ms."""
    with SessionLocal() as db:
        seed_default_industry_packs(db)
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="SLA Booking Electric",
            status="active",
        )
        db.add(tenant)
        db.flush()

        loc = Location(
            tenant_id=tenant.id,
            name="Main Branch",
            code="MAIN",
            is_primary=True,
            is_active=True,
        )
        db.add(loc)

        staff = StaffMember(
            tenant_id=tenant.id,
            location_id=loc.id,
            name="Alex Electrician",
            email=f"alex_{tenant_id[:4]}@example.com",
            skills=["panel_upgrade"],
            duty_status="on_duty",
            is_active=True,
        )
        db.add(staff)
        db.commit()

        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant.id,
                "call_id": "test-call-sla",
                "location_id": loc.id,
            }
        )

        tools = create_booking_tools(call_token=call_token, caller_phone="+15125550199")
        tool_map = {t.__name__: t for t in tools}
        book_tool = tool_map["book_appointment_tool"]

        future_slot = (
            (datetime.now(UTC) + timedelta(days=1)).replace(hour=10, minute=0, second=0).isoformat()
        )

        t0 = time.perf_counter()
        res_text = await book_tool(
            start_iso=future_slot,
            customer_name="Benchmark Customer",
            customer_phone="+15125550199",
            service_type="panel_upgrade",
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert "Appointment confirmed" in res_text
        assert "Alex Electrician assigned" in res_text
        assert elapsed_ms < 800.0, f"Booking tool exceeded 800ms SLA: took {elapsed_ms:.2f}ms"


def test_full_end_to_end_lifecycle():
    """Comprehensive E2E Test:
    1. Public signup registers tenant with address and electrical niche.
    2. Primary Location 'HQ' is auto-created and bound to phone number.
    3. Home Services industry pack is auto-applied and variables compiled.
    4. Client adds a technician to HQ and marks them On Duty.
    5. Real-time availability endpoint returns open slots in <400ms.
    6. System prompt is synthesized with branch address and territory zip codes.
    """
    rnd = uuid.uuid4().hex[:6]
    signup_email = f"e2e-{rnd}@example.com"
    fresh_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    # 1. Onboarding
    res_reg = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Lone Star Power Pro",
            "owner_name": "Hank Hill",
            "email": signup_email,
            "password": "SecurePassword123!",
            "niche": "electrical",
            "address_line1": "400 Electric Way",
            "city": "Austin",
            "state": "TX",
            "postal_code": "78701",
            "service_territory_zips": ["78701", "78702", "78703"],
            "phone_number": fresh_phone,
        },
    )
    assert res_reg.status_code == 200
    reg_data = res_reg.json()
    token = reg_data["access_token"]
    tenant_id = reg_data["user"]["tenant_id"]
    headers = {"Authorization": f"Bearer {token}"}

    with SessionLocal() as db:
        # 2. Verify Primary Location
        hq = db.scalar(
            select(Location).where(Location.tenant_id == tenant_id, Location.is_primary.is_(True))
        )
        assert hq is not None
        assert hq.code == "HQ"
        assert hq.address_line1 == "400 Electric Way"

        # 3. Add Technician to HQ via API
        res_tech = client.post(
            f"/api/v1/portal/locations/{hq.id}/staff",
            json={
                "name": "Dale Gribble",
                "email": f"dale_{rnd}@example.com",
                "role": "licensed_journeyman",
                "skills": ["breaker_box", "panel_triage"],
                "duty_status": "on_duty",
            },
            headers=headers,
        )
        assert res_tech.status_code == 201

        # 4. Check Availability via Location Endpoint
        future_date = (datetime.now(UTC) + timedelta(days=2)).strftime("%Y-%m-%d")
        t0 = time.perf_counter()
        res_avail = client.get(
            f"/api/v1/portal/locations/{hq.id}/availability?target_date={future_date}",
            headers=headers,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        assert res_avail.status_code == 200
        assert len(res_avail.json()["slots"]) > 0
        assert elapsed_ms < 400.0

        # 5. Synthesize System Prompt for LiveKit Voice Agent
        cfg = TenantConfig(
            tenant_id=tenant_id,
            business="Lone Star Power Pro",
            hours="Monday to Friday, 8:00 AM to 6:00 PM EST",
            greeting="Thanks for calling Lone Star Power Pro.",
            location_id=hq.id,
            location_name=hq.name,
            location_city=hq.city,
            location_address=hq.address_line1,
            location_territory_zips=hq.service_territory_zips,
            industry_pack_slug="home_services",
            industry_pack_prompt=compile_tenant_prompt(tenant_id, db),
        )
        prompt = build_system_prompt(cfg)
        assert "Lone Star Power Pro" in prompt
        assert "HQ" in prompt or "Headquarters" in prompt
        assert "400 Electric Way" in prompt
        assert "78701, 78702, 78703" in prompt
        assert "Emergency Triggers:" in prompt
