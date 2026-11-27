"""Offline unit tests for Phase 4 per-location AI override merging in agent prompt."""

from datetime import datetime
from zoneinfo import ZoneInfo

from agent.config import TenantConfig
from agent.config_client import parse_tenant_config_from_dict
from agent.prompts import build_system_prompt


def test_build_system_prompt_merges_branch_ai_overrides() -> None:
    """Verify branch greeting, instructions, pricing mode, and services override tenant defaults."""
    cfg = TenantConfig(
        tenant_id="t-branch-1",
        business="Metro Plumbing",
        hours="Mon-Fri 8am-6pm",
        greeting="Thanks for calling Metro Plumbing.",
        services=["General Plumbing"],
        location_name="Austin North",
        location_greeting_override="Welcome to Metro Plumbing Austin North!",
        location_custom_instructions_override="Offer same-day slab leak inspection.",
        location_pricing_mode_override="listed",
        location_services_override=["Slab Leak Detection", "Hydro-Jetting"],
    )

    dt = datetime(2026, 11, 27, 10, 0, tzinfo=ZoneInfo("America/New_York"))
    prompt = build_system_prompt(cfg, current_dt=dt)

    assert "Slab Leak Detection" in prompt
    assert "Hydro-Jetting" in prompt
    assert "BRANCH AI OVERRIDES (Austin North):" in prompt
    assert "Welcome to Metro Plumbing Austin North!" in prompt
    assert "Offer same-day slab leak inspection." in prompt
    assert "Branch Pricing Mode Override: listed" in prompt


def test_parse_api_config_hydrates_location_ai_overrides() -> None:
    """Verify parse_tenant_config_from_dict maps branch AI override fields."""
    payload = {
        "tenant_id": "t-1",
        "business_name": "Metro Plumbing",
        "hours": "Mon-Fri 8am-6pm",
        "greeting": "Hi",
        "services": ["Plumbing"],
        "faq": [],
        "emergency_keywords": [],
        "emergency_advice": "",
        "location_name": "Dallas HQ",
        "location_greeting_override": "Dallas HQ speaking",
        "location_custom_instructions_override": "Prioritize commercial calls",
        "location_pricing_mode_override": "range",
        "location_services_override": ["Commercial Grease Trap"],
    }
    cfg = parse_tenant_config_from_dict(payload)
    assert cfg.location_greeting_override == "Dallas HQ speaking"
    assert cfg.location_custom_instructions_override == "Prioritize commercial calls"
    assert cfg.location_pricing_mode_override == "range"
    assert cfg.location_services_override == ["Commercial Grease Trap"]
