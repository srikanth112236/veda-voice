"""Tests for Bilingual Language Adaptation, Active Listening, and Transfer Prompt Rules."""

from agent.config import TenantConfig
from agent.prompts import build_system_prompt


def test_bilingual_and_active_listening_rules_present() -> None:
    """Verify prompt contains dynamic Spanish adaptation and active listening instructions."""
    config = TenantConfig(
        tenant_id="t-bilingual",
        business="Sol Plumbing",
        hours="Mon-Fri 8am-5pm",
        timezone="America/Chicago",
        services=["Plumbing Repair"],
        agent_name="Carlos",
        greeting="Hola, gracias por llamar a Sol Plumbing.",
        transfer_number="+15125557777",
    )

    prompt = build_system_prompt(config)

    # 1. Dynamic bilingual adaptation
    assert "DYNAMIC BILINGUAL ADAPTATION (ENGLISH & SPANISH)" in prompt
    assert "¿Habla español?" in prompt
    assert "Español por favor" in prompt
    assert "evacúe el edificio inmediatamente" in prompt

    # 2. Active listening & conversational pacing
    assert "ACTIVE LISTENING & CONVERSATIONAL PACING" in prompt
    assert "I understand" in prompt

    # 3. Human transfer & specialist escalation
    assert "HUMAN TRANSFER & SPECIALIST ESCALATION (TOOL: transfer_call_tool)" in prompt
    assert "+15125557777" not in prompt  # Internal instruction, number is held by tool
    assert "transfer_call_tool" in prompt


def test_transfer_prompt_omitted_when_unconfigured() -> None:
    """Verify transfer section is omitted when no transfer number and not in tools_enabled."""
    config = TenantConfig(
        tenant_id="t-no-transfer",
        business="Simple Trades",
        hours="Mon-Fri 8am-5pm",
        timezone="America/New_York",
        services=["Handyman"],
        agent_name="Alex",
        greeting="Hello!",
        transfer_number="",
        tools_enabled=["take_message", "end_call"],
    )

    prompt = build_system_prompt(config)
    assert "HUMAN TRANSFER & SPECIALIST ESCALATION" not in prompt
    assert "transfer_call_tool" not in prompt
    # Core bilingual and active listening rules remain present
    assert "DYNAMIC BILINGUAL ADAPTATION" in prompt
    assert "ACTIVE LISTENING & CONVERSATIONAL PACING" in prompt
