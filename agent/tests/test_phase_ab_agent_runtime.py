"""Tests for Agent Runtime Phase A & B: Smart Geofencing Tools & Hyper-Local System Prompt."""

import uuid

import pytest

from agent.config import TenantConfig
from agent.prompts import build_system_prompt
from agent.tools.territory import create_territory_tools
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.models.location import Location
from api.app.models.tenant import Tenant


def test_system_prompt_synthesizes_hyperlocal_knowledge_and_geofencing():
    """Verify that build_system_prompt injects parking, fees, licenses, neighborhoods, and branch FAQs."""
    cfg = TenantConfig(
        tenant_id="tenant-prompt-test",
        business="Lone Star Comfort Air",
        hours="Mon-Fri 8am-6pm",
        greeting="Thanks for calling Lone Star Comfort Air.",
        location_id="loc-domain-1",
        location_name="Domain Branch",
        location_city="Austin",
        location_address="11000 Domain Dr, Austin, TX 78758",
        location_territory_zips=["78758", "78759"],
        location_service_neighborhoods=["The Domain", "Arboretum", "Great Hills"],
        location_service_cities=["Austin", "Round Rock"],
        location_parking="Free parking in Orange Garage level 2",
        location_diagnostic_fee="$89 diagnostic inspection",
        location_license="TACLA008811C",
        location_extended_dispatch_surcharge="$40 extended area fee",
        location_faq_overrides=[
            {
                "question": "Do you offer emergency after-hours dispatch?",
                "answer": "Yes, our on-call tech handles after-hours emergencies within 45 minutes.",
            }
        ],
    )

    prompt = build_system_prompt(cfg)

    # Assert branch knowledge section
    assert "Domain Branch" in prompt
    assert "11000 Domain Dr" in prompt
    assert "The Domain, Arboretum, Great Hills" in prompt
    assert "Austin, Round Rock" in prompt
    assert "Free parking in Orange Garage level 2" in prompt
    assert "$89 diagnostic inspection" in prompt
    assert "TACLA008811C" in prompt
    assert "$40 extended area fee" in prompt
    assert "BRANCH LOCAL FAQS & POLICIES (Domain Branch):" in prompt
    assert "emergency after-hours dispatch" in prompt
    assert "within 45 minutes" in prompt


@pytest.mark.asyncio
async def test_agent_lookup_service_territory_tool():
    """Verify that lookup_service_territory LiveKit tool executes in-call territory validation."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Tool Test AC", status="active")
        loc = Location(
            tenant_id=tenant_id,
            name="Westlake Service Hub",
            code="WST",
            postal_code="78746",
            service_territory_zips=["78746", "78731"],
            service_neighborhoods=["Westlake Hills", "Rollingwood"],
            service_cities=["Westlake"],
            diagnostic_fee="$99 diagnostic fee",
            is_primary=True,
            is_active=True,
        )
        db.add_all([tenant, loc])
        db.commit()

        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant_id,
                "call_id": "test-call-geo",
            }
        )

        tools = create_territory_tools(call_token=call_token, caller_phone="+15125550199")
        tool_map = {t.__name__: t for t in tools}
        lookup_tool = tool_map["lookup_service_territory"]

        # 1. Test neighborhood lookup
        res_text = await lookup_tool(location_query="Westlake Hills near the high school")
        assert "TERRITORY CONFIRMED" in res_text
        assert "Westlake Service Hub" in res_text
        assert "$99 diagnostic fee" in res_text

        # 2. Test postal code lookup
        res_zip = await lookup_tool(location_query="78746")
        assert "TERRITORY CONFIRMED" in res_zip
