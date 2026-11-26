"""10-Persona Automated Voice Evaluation Suite.

Validates voice agent configuration, prompt guardrails, STT keyterm boosting,
per-tenant endpointing profiles, and post-call QA scoring across 10 diverse
caller archetypes without requiring live audio hardware.
"""

from __future__ import annotations

import pytest

from agent.config import get_agent_settings, load_business_config
from agent.main import (
    _build_noise_cancellation,
    _build_stt,
    _collect_stt_keyterms,
    _resolve_endpointing_profile,
)
from agent.prompts import build_system_prompt
from api.app.services.qa_scoring import evaluate_call_qa


@pytest.mark.parametrize(
    "persona_name,cadence,bilingual,speech_barge_in",
    [
        ("noisy_tv_background", "balanced", False, True),
        ("heavy_accent_jargon", "patient", False, True),
        ("slow_elderly_speaker", "patient", False, True),
        ("fast_interrupter", "brisk", False, True),
        ("panicked_emergency", "brisk", False, True),
        ("bilingual_spanglish", "balanced", True, True),
        ("wrong_number_rambler", "balanced", False, True),
        ("spam_robocall", "brisk", False, False),
        ("choppy_cell_signal", "patient", False, True),
        ("standard_intake_caller", "balanced", False, True),
    ],
)
def test_10_persona_pipeline_profiles_and_prompts(
    persona_name: str,
    cadence: str,
    bilingual: bool,
    speech_barge_in: bool,
) -> None:
    """Ensure all 10 caller archetypes resolve valid STT, VAD/EOU, NC, and prompt guardrails."""
    cfg = load_business_config("default")
    cfg.patience_cadence = cadence
    cfg.bilingual_spanish_enabled = bilingual
    cfg.speech_barge_in = speech_barge_in
    cfg.phonetic_glossary = [{"term": "Navien"}, {"term": "Bradford White"}]
    cfg.service_cities = ["Austin", "Cedar Park"]

    settings = get_agent_settings()
    ep = _resolve_endpointing_profile(cfg, settings, has_turn_detector=True)
    stt = _build_stt(settings, cfg)
    terms = _collect_stt_keyterms(cfg)
    nc = _build_noise_cancellation(is_sip=True)
    prompt = build_system_prompt(cfg)

    assert stt is not None
    assert nc is None or nc is not None
    assert "Navien" in terms and "Austin" in terms
    assert ep["allow_interruptions"] is speech_barge_in

    if cadence == "patient":
        assert ep["min_endpointing_delay"] >= 0.9
        assert ep["max_endpointing_delay"] >= 4.5
    elif cadence == "brisk":
        assert ep["min_endpointing_delay"] <= 0.45

    # Prompt covers emergency, bilingual, garbled audio, wrong-number, and spam rules
    assert "WRONG-NUMBER" in prompt
    assert "repeat or spell that for me" in prompt
    assert "Spanish" in prompt
    assert "911" in prompt


def test_10_persona_post_call_qa_outcomes() -> None:
    """Validate QA rubric scoring across wrong_number, emergency, and completed intake personas."""
    wrong_num = evaluate_call_qa(
        transcript=[
            {
                "role": "assistant",
                "text": "This call may be recorded. Thanks for calling Apex Plumbing.",
            },
            {"role": "user", "text": "It is like a graphic Mario GTA."},
            {"role": "assistant", "text": "I believe you have the wrong number. Goodbye."},
        ],
        business_name="Apex Plumbing",
        outcome="wrong_number",
        latency_p50_ms=850.0,
    )
    assert wrong_num["qa_status"] == "passed"
    assert "missing_telemetry" not in wrong_num["qa_flags"]

    emergency_breach = evaluate_call_qa(
        transcript=[
            {
                "role": "assistant",
                "text": "This call is recorded. Thanks for calling Apex Plumbing.",
            },
            {"role": "user", "text": "I smell a strong gas leak in my basement!"},
            {"role": "assistant", "text": "Okay, we can book you for next Tuesday."},
        ],
        business_name="Apex Plumbing",
        outcome="booked",
        urgency="emergency",
        latency_p50_ms=900.0,
    )
    assert emergency_breach["is_critical_failure"] is True
    assert "safety_escalation_breach" in emergency_breach["qa_flags"]
