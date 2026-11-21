"""Unit tests for Phase 3: Real-Time LiveKit Voice Agent Runtime.

Verifies:
1. Location-aware system prompt synthesis (branch name, territory zips, address, and transfer number).
2. In-call booking tool output human-readable technician assignment confirmation.
3. Outbound dialer branch DID selection and industry pack script resolution.
"""

import uuid
from unittest.mock import patch

import pytest

from agent.config import TenantConfig
from agent.outbound.dialer import resolve_outbound_branch_and_script
from agent.prompts import build_system_prompt
from agent.tools.booking import create_booking_tools
from api.app.db.session import SessionLocal
from api.app.models.location import Location
from api.app.models.tenant import Tenant
from api.app.services.industry_packs import apply_pack_to_tenant, seed_default_industry_packs


def test_location_aware_system_prompt():
    config = TenantConfig(
        tenant_id="tenant-123",
        business="Apex Plumbing Pros",
        hours="Monday to Friday, 8:00 AM to 6:00 PM EST",
        greeting="Thanks for calling Apex Plumbing Pros.",
        location_id="loc-456",
        location_name="Downtown Austin Hub",
        location_city="Austin",
        location_address="100 Congress Ave, Austin, TX 78701",
        location_territory_zips=["78701", "78702", "78703"],
        location_transfer_number="+15125550199",
        location_emergency_phone="+15125550911",
        industry_pack_slug="home_services",
        industry_pack_prompt="Home services protocol active.",
    )

    prompt = build_system_prompt(config)
    assert "Downtown Austin Hub" in prompt
    assert "78701, 78702, 78703" in prompt
    assert "100 Congress Ave" in prompt
    assert "+15125550199" in prompt
    assert "+15125550911" in prompt
    assert "INDUSTRY PRACTICE PROTOCOL (HOME_SERVICES)" in prompt


@pytest.mark.asyncio
async def test_booking_tool_includes_technician_name():
    tools = create_booking_tools(call_token="mock-token", caller_phone="+15125550100")
    tool_map = {t.__name__: t for t in tools}
    book_tool = tool_map["book_appointment_tool"]

    mock_response = {
        "status": "confirmed",
        "booking_id": "book-789",
        "staff_id": "staff-001",
        "staff_name": "Dave Miller",
        "meet_link": "https://meet.google.com/xyz",
    }

    with patch("agent.tools.booking.book_appointment", return_value=mock_response):
        # Directly invoke underlying function tool or coroutine
        res = await book_tool(
            start_iso="2026-11-25T10:00:00-05:00",
            customer_name="Alice Customer",
            customer_phone="+15125550100",
            service_type="water_heater",
        )
        assert "Appointment confirmed for Alice Customer" in res
        assert "Dave Miller assigned" in res
        assert "Booking ID: book-789" in res


def test_resolve_outbound_branch_and_script():
    with SessionLocal() as db:
        seed_default_industry_packs(db)
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Texas Trade Specialists",
            status="active",
        )
        db.add(tenant)
        db.flush()

        loc1 = Location(
            tenant_id=tenant.id,
            name="Austin Branch",
            code="ATX",
            phone="+15125550111",
            service_territory_zips=["78701", "78702"],
            is_primary=True,
            is_active=True,
        )
        db.add(loc1)

        loc2 = Location(
            tenant_id=tenant.id,
            name="Dallas Branch",
            code="DFW",
            phone="+12145550222",
            service_territory_zips=["75001", "75002"],
            is_primary=False,
            is_active=True,
        )
        db.add(loc2)
        db.commit()

        apply_pack_to_tenant(tenant.id, "home_services", db=db)

        # Resolve for Austin zip
        caller_id, loc_id, script = resolve_outbound_branch_and_script(tenant.id, "78701", db)
        assert caller_id == "+15125550111"
        assert loc_id == loc1.id
        assert len(script) > 0

        # Resolve for Dallas zip
        caller_id_dfw, loc_id_dfw, script_dfw = resolve_outbound_branch_and_script(
            tenant.id, "75001", db
        )
        assert caller_id_dfw == "+12145550222"
        assert loc_id_dfw == loc2.id
