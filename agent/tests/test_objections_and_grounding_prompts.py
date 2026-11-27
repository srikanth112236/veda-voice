"""Offline unit tests for Phase 1 prompt rules, objections, strict grounding, and config hydration."""

from datetime import datetime
from zoneinfo import ZoneInfo

from agent.config import TenantConfig
from agent.config_client import parse_tenant_config_from_dict
from agent.prompts import build_system_prompt


def test_build_system_prompt_includes_phase1_customizations() -> None:
    """Verify custom instructions, do/don't rules, objections, escalation, and strict grounding render."""
    cfg = TenantConfig(
        tenant_id="tenant-dental-1",
        business="BrightSmile Dental",
        hours="Mon-Fri 8am-5pm",
        greeting="Thanks for calling BrightSmile Dental.",
        custom_instructions="Always ask if the caller is a new or returning patient.",
        do_rules=["Mention Tuesday senior discount", "Confirm insurance provider"],
        dont_rules=["Never book root canals on Fridays"],
        objection_handlers=[
            {
                "trigger": "Why is the exam $99?",
                "response": "It includes digital X-rays and a full treatment plan.",
                "action": "offer_quote",
            }
        ],
        strict_grounding=True,
        unknown_fallback_script="Let me have our treatment coordinator confirm that for you.",
        escalation_rules=[
            {
                "condition": "caller mentions billing dispute",
                "target_number": "+15125550199",
                "label": "Billing Manager",
            }
        ],
    )

    dt = datetime(2026, 11, 27, 10, 0, tzinfo=ZoneInfo("America/New_York"))
    prompt = build_system_prompt(cfg, current_dt=dt)

    assert "CUSTOM OPERATIONAL INSTRUCTIONS:" in prompt
    assert "Always ask if the caller is a new or returning patient." in prompt
    assert "ALWAYS DO:" in prompt
    assert "- Mention Tuesday senior discount" in prompt
    assert "NEVER DO:" in prompt
    assert "- Never book root canals on Fridays" in prompt
    assert "OBJECTION & TOUGH-CALLER PLAYBOOK:" in prompt
    assert 'If caller says/asks "Why is the exam $99?"' in prompt
    assert "[Next Action: offer_quote]" in prompt
    assert "CUSTOM ESCALATION TRIGGERS:" in prompt
    assert "When caller mentions billing dispute -> transfer/route to Billing Manager" in prompt
    assert "STRICT GROUNDING MODE (ZERO HALLUCINATION):" in prompt
    assert "Let me have our treatment coordinator confirm that for you." in prompt
    assert "UNIVERSAL INDUSTRY COMPLIANCE GUARDRAILS:" in prompt


def test_parse_api_config_hydrates_phase1_fields() -> None:
    """Verify parse_api_config_to_tenant_config maps all Phase 1 fields cleanly."""
    api_payload = {
        "tenant_id": "t-123",
        "business_name": "Summit Legal",
        "hours": "Mon-Fri 9am-5pm",
        "greeting": "Hello Summit Legal.",
        "tone": "formal",
        "pricing_policy": "diagnostic_fee_only",
        "services": ["Consultation"],
        "faq": [],
        "emergency_keywords": [],
        "emergency_advice": "",
        "custom_instructions": "Screen for conflict of interest first.",
        "do_rules": ["Collect opposing party name"],
        "dont_rules": ["Never give legal advice"],
        "objection_handlers": [
            {
                "trigger": "Free consult?",
                "response": "Initial 15-min intake is free.",
                "action": "answer",
            }
        ],
        "strict_grounding": True,
        "unknown_fallback_script": "An attorney will confirm during your consultation.",
        "escalation_rules": [
            {
                "condition": "active court deadline today",
                "target_number": "+15125550122",
                "label": "Senior Partner",
            }
        ],
    }

    cfg = parse_tenant_config_from_dict(api_payload, dialed_number="+15125550100")
    assert cfg.custom_instructions == "Screen for conflict of interest first."
    assert cfg.do_rules == ["Collect opposing party name"]
    assert cfg.dont_rules == ["Never give legal advice"]
    assert len(cfg.objection_handlers) == 1
    assert cfg.strict_grounding is True
    assert cfg.unknown_fallback_script == "An attorney will confirm during your consultation."
    assert len(cfg.escalation_rules) == 1
