"""Tests for Emergency & Safety First-Response Rules (Rule 5).

Validates:
1. Gas leak evacuation and electrical switch restrictions.
2. Electrical hazard protection (water near breaker panels / standing water).
3. Biohazard protection (raw sewage and blackwater backup).
4. Water heater overheating / steam relief valve blowout warning.
5. Emergency-to-action transition rule (moving to scheduling/transfer once safe).
"""

from agent.config import EmergencyConfig, TenantConfig
from agent.prompts import build_system_prompt


def test_emergency_and_safety_first_response_rules() -> None:
    """Verify all critical hazard protocols are present in system prompt."""
    config = TenantConfig(
        tenant_id="t-emergency-test",
        business="Apex Plumbing & Heating",
        hours="Mon-Fri 8am-6pm",
        timezone="America/Chicago",
        greeting="Thanks for calling Apex.",
        emergency=EmergencyConfig(
            keywords=["gas leak", "burst pipe", "flooding"],
            approved_safety_script="Locate and shut off the main water valve immediately.",
        ),
        tools_enabled=["booking", "transfer", "take_message"],
    )

    prompt = build_system_prompt(config)

    # 1. Life & gas threats
    assert "EMERGENCY & SAFETY FIRST-RESPONSE" in prompt
    assert "evacuate the building immediately" in prompt
    assert "call 911" in prompt

    # 2. Electrical hazards
    assert "water near breaker panel" in prompt
    assert "NEVER to touch standing water or electrical panels" in prompt

    # 3. Biohazards
    assert "raw sewage or blackwater backup" in prompt
    assert "keeping children and pets completely away" in prompt

    # 4. Steam / water heater blowout
    assert "steam blowing from relief valve" in prompt
    assert "staying clear of boiling discharge pipes" in prompt

    # 5. Smooth transition
    assert "EMERGENCY TRANSITION" in prompt
    assert "smoothly transition to immediate emergency booking or manager escalation" in prompt
