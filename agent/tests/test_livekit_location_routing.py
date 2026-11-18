from agent.config import TenantConfig
from agent.prompts import build_system_prompt


def test_agent_prompts_with_location_context():
    # Base tenant receptionist configuration with specific branch location details
    config = TenantConfig(
        tenant_id="tenant_loc_123",
        business="Texas Regional HVAC (Austin North Hub)",
        hours="Monday to Saturday, 7:00 AM to 7:00 PM CST",
        timezone="America/Chicago",
        greeting="Thanks for calling Texas Regional HVAC North Austin branch.",
        transfer_number="+15125550888",
    )

    prompt = build_system_prompt(config)
    assert "Texas Regional HVAC (Austin North Hub)" in prompt
    assert "Monday to Saturday, 7:00 AM to 7:00 PM CST" in prompt
    assert "America/Chicago" in prompt
    assert "+15125550888" in prompt or "connect you with our specialist" in prompt


def test_agent_prompts_with_explicit_branch_profile():
    config = TenantConfig(
        tenant_id="tenant_loc_456",
        business="Apex Plumbing & Heating",
        location_id="loc_austin_north",
        location_name="North Austin Branch",
        location_city="Austin",
        hours="Mon-Fri 8:00 AM - 6:00 PM",
        greeting="Thanks for calling Apex North Austin.",
    )
    prompt = build_system_prompt(config)
    assert "Assigned Branch Location: North Austin Branch in Austin" in prompt
