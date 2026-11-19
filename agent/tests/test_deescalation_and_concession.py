"""Tests for De-escalation, Value Stacking, and Concession Rule (Rule 18).

Validates:
1. Rule 18 is injected into system prompt.
2. Anti-repetition mandate forbids robotic "pricing is firm" repetitions.
3. Churn and walk-away interceptor triggers manager transfer / callback offering.
4. Supervisor whisper compliance instructs the agent to adopt real-time coachings.
"""

from agent.config import TenantConfig
from agent.prompts import build_system_prompt


def test_rule_18_deescalation_and_concession_present() -> None:
    """Verify Rule 18 is included in generated system prompt."""
    config = TenantConfig(
        tenant_id="tenant-apex-123",
        business="Apex Plumbing & Heating",
        hours="Mon-Fri 8am-6pm",
        timezone="America/Chicago",
        pricing_mode="listed",
        price_items=[
            {"service": "Standard Drain Clearing", "price": "$150"},
            {"service": "Diagnostic Inspection", "price": "$89"},
        ],
        greeting="Thanks for calling Apex Plumbing.",
        tools_enabled=["booking", "transfer", "take_message"],
    )

    prompt = build_system_prompt(config)

    # 1. Rule 18 header and content
    assert "DE-ESCALATION, VALUE STACKING & CHURN PREVENTION" in prompt
    assert "ANTI-REPETITION MANDATE" in prompt
    assert "PRICE OBJECTIONS & DISCOUNT REQUESTS" in prompt
    assert "CHURN & WALK-AWAY INTERCEPTOR" in prompt
    assert "SUPERVISOR WHISPER COMPLIANCE" in prompt

    # 2. Value stacking elements
    assert "licensed and insured technicians" in prompt
    assert "90-day" in prompt

    # 3. Pricing policy section guidance
    assert "DE-ESCALATION & VALUE STACKING" in prompt
    assert "NEVER say 'pricing is firm' or 'I cannot negotiate' repeatedly" in prompt
