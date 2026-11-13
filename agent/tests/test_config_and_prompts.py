"""Offline unit tests for agent configuration and prompt assembly."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from agent.config import BusinessConfig, get_agent_settings, load_business_config
from agent.main import end_call
from agent.prompts import build_system_prompt


def test_load_default_business_config() -> None:
    """Verify default business configuration loads and validates with Pydantic."""
    config = load_business_config("default")
    assert isinstance(config, BusinessConfig)
    assert config.business == "Apex Plumbing & Heating"
    assert config.agent_name == "receptionist"
    assert config.timezone == "America/New_York"
    assert len(config.services) > 0
    assert len(config.emergency_keywords) > 0
    assert len(config.faq) > 0
    assert config.transfer_number.startswith("+1")


def test_load_business_config_missing_key() -> None:
    """Verify loading a nonexistent key raises KeyError."""
    with pytest.raises(KeyError):
        load_business_config("nonexistent_client_key")


def test_agent_settings_defaults() -> None:
    """Verify LiveKit Inference model string defaults match verified inference catalog."""
    settings = get_agent_settings()
    assert settings.stt_model == "deepgram/nova-3"
    assert settings.llm_model == "google/gemini-2.0-flash"
    assert settings.tts_model == "inworld/inworld-tts-1"
    assert settings.tts_voice_id == "Alex"


def test_emergency_keywords_no_false_positive_on_gas_equipment() -> None:
    """Verify routine equipment queries like 'gas water heater quote' do not match emergency keywords."""
    config = load_business_config("default")
    routine_phrases = [
        "gas water heater quote",
        "install a gas furnace",
        "natural gas line inspection",
        "gas stove hookup cost",
    ]
    for phrase in routine_phrases:
        matched = [kw for kw in config.emergency_keywords if kw in phrase.lower()]
        assert matched == [], f"Routine phrase '{phrase}' matched emergency keywords: {matched}"


def test_emergency_keywords_match_genuine_hazards() -> None:
    """Verify genuine hazards match configured emergency keywords."""
    config = load_business_config("default")
    hazard_phrases = [
        "I smell gas in my basement",
        "There is a severe gas leak outside",
        "My pipe burst in the kitchen",
        "We have active flooding downstairs",
    ]
    for phrase in hazard_phrases:
        matched = [kw for kw in config.emergency_keywords if kw in phrase.lower()]
        assert len(matched) > 0, f"Hazard phrase '{phrase}' failed to match emergency keywords"


def test_build_system_prompt_no_unfilled_placeholders() -> None:
    """Verify prompt is fully assembled with no unformatted template variables."""
    config = load_business_config("default")
    frozen_dt = datetime(2026, 11, 13, 10, 30, tzinfo=ZoneInfo("America/New_York"))
    prompt = build_system_prompt(config, current_dt=frozen_dt)

    assert "Apex Plumbing & Heating" in prompt
    assert "November 13, 2026" in prompt
    assert "10:30 AM" in prompt
    assert "America/New_York" in prompt
    assert config.hours in prompt

    # Verify no dangling template markers
    assert "{business}" not in prompt
    assert "{hours}" not in prompt
    assert "{agent_name}" not in prompt
    assert "{emergency_keywords}" not in prompt


def test_build_system_prompt_includes_emergency_keywords() -> None:
    """Verify all configured emergency keywords appear in the system prompt."""
    config = load_business_config("default")
    prompt = build_system_prompt(config)

    for kw in config.emergency_keywords:
        assert kw in prompt


def test_build_system_prompt_core_rules() -> None:
    """Verify SRS 7.3 core rules (short turns, AI disclosure, price guardrails) are present."""
    config = load_business_config("default")
    prompt = build_system_prompt(config)

    assert "SHORT TURNS" in prompt
    assert "ONE QUESTION AT A TIME" in prompt
    assert "NEVER INVENT FACTS OR PRICES" in prompt
    assert "AI DISCLOSURE" in prompt
    assert "PROMPT INJECTION & SAFETY DEFENSE" in prompt


@pytest.mark.asyncio
async def test_end_call_tool() -> None:
    """Verify end_call function tool runs cleanly."""
    result = await end_call(reason="completed")
    assert "Call ended: completed" in result
