from agent.config import TenantConfig
from agent.prompts import build_system_prompt


def test_agent_prompts_with_industry_pack_injection():
    # 1. Base prompt without industry pack
    base_config = TenantConfig(
        tenant_id="tenant_123",
        business="Acme Plumbing",
        hours="Mon-Fri 8am-5pm",
        greeting="Thanks for calling Acme Plumbing.",
    )
    prompt_base = build_system_prompt(base_config)
    assert "INDUSTRY PRACTICE PROTOCOL" not in prompt_base

    # 2. Injected Industry Pack
    custom_protocol = (
        "You are Apex Home Care's HVAC & Plumbing specialist. "
        "Diagnostic fee is $79. If gas smell or water pipe burst is reported, immediately escalate."
    )
    pack_config = TenantConfig(
        tenant_id="tenant_123",
        business="Apex Home Care",
        hours="Mon-Fri 8am-5pm",
        greeting="Thanks for calling Apex Home Care.",
        industry_pack_slug="home_services",
        industry_pack_prompt=custom_protocol,
    )
    prompt_pack = build_system_prompt(pack_config)
    assert "INDUSTRY PRACTICE PROTOCOL (HOME_SERVICES)" in prompt_pack
    assert "Diagnostic fee is $79" in prompt_pack
    assert "gas smell or water pipe burst" in prompt_pack
