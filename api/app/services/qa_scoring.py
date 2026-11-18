"""Automated Post-Call Quality Assurance (QA) and Predictive CSAT Scoring Engine.

Implements Milestone M7b per SRS Section 6.2 and FR-ANL-1 to 8:
- 5-part rubric evaluation:
  1. Greeting Adherence (20 pts)
  2. Legal & Recording Disclosure (20 pts)
  3. Information Extraction Completeness (25 pts)
  4. Emergency & Safety Escalation Protocol (20 pts)
  5. Tone, Politeness & Conversational Efficiency (15 pts)
- Critical QA failure detection and flagging
- Predictive Customer Satisfaction (CSAT 1.0 - 5.0 stars) modeling
"""

from __future__ import annotations

import re
from typing import Any

# Disclosure keywords
_DISCLOSURE_PATTERNS = re.compile(
    r"\b(recorded|recording|monitored|quality assurance|training purposes|ai assistant|virtual receptionist|automated assistant|ai receptionist)\b",
    re.I,
)

# Polite markers
_POLITE_PATTERNS = re.compile(
    r"\b(please|thank you|thanks|happy to help|glad to assist|certainly|absolutely|my pleasure|welcome)\b",
    re.I,
)

# Rude or unhelpful markers
_UNPROFESSIONAL_PATTERNS = re.compile(
    r"\b(shut up|not my problem|i don't care|deal with it|whatever|stupid|stop talking)\b",
    re.I,
)

# Emergency keywords
_EMERGENCY_PATTERNS = re.compile(
    r"\b(burst|bursting|flooding|flood|gas smell|gas leak|smoke|fire|sparking|sewage backup|electric shock|hazard|danger|immediate danger)\b",
    re.I,
)

# Emergency safety & escalation response markers
_EMERGENCY_RESPONSE_PATTERNS = re.compile(
    r"\b(transfer|technician|dispatch|immediately|emergency specialist|shut off|main valve|evacuate|safety|right away)\b",
    re.I,
)


def evaluate_call_qa(
    transcript: list[dict[str, Any]],
    business_name: str = "Our Business",
    recording_disclosure: bool = True,
    message: dict[str, Any] | None = None,
    outcome: str = "completed",
    urgency: str = "normal",
    latency_p50_ms: float = 1200.0,
    sentiment_label: str = "neutral",
) -> dict[str, Any]:
    """Execute comprehensive automated post-call QA rubric evaluation and predictive CSAT calculation."""
    flags: list[str] = []
    rubric_breakdown: dict[str, Any] = {}

    # Separate agent vs caller utterances
    agent_texts: list[str] = []
    caller_texts: list[str] = []

    for turn in transcript:
        txt = str(turn.get("text", "")).strip()
        role = str(turn.get("speaker", turn.get("role", ""))).lower()
        if not txt:
            continue
        if role in ("agent", "assistant", "system"):
            agent_texts.append(txt)
        elif role in ("caller", "user", "customer"):
            caller_texts.append(txt)

    combined_agent = " ".join(agent_texts).lower()
    combined_caller = " ".join(caller_texts).lower()
    first_agent_turn = agent_texts[0].lower() if agent_texts else ""
    first_two_agent_turns = " ".join(agent_texts[:2]).lower() if agent_texts else ""

    # -------------------------------------------------------------
    # 1. Greeting Adherence (Weight: 20 pts)
    # -------------------------------------------------------------
    greeting_score = 0.0
    norm_business = business_name.lower().strip()
    business_tokens = [w for w in re.findall(r"\w+", norm_business) if len(w) > 2]

    has_business_name = False
    if norm_business and norm_business in first_two_agent_turns:
        has_business_name = True
    elif any(token in first_two_agent_turns for token in business_tokens):
        has_business_name = True

    has_standard_greeting = bool(
        re.search(
            r"\b(hello|hi|thanks for calling|thank you for calling|good morning|good afternoon|how (can|may) i (help|assist))\b",
            first_agent_turn,
        )
    )

    if has_business_name and has_standard_greeting:
        greeting_score = 20.0
    elif has_business_name or has_standard_greeting:
        greeting_score = 15.0
    elif agent_texts:
        greeting_score = 5.0
        flags.append("missing_greeting")
    else:
        greeting_score = 0.0
        flags.append("missing_greeting")

    rubric_breakdown["greeting"] = {
        "score": greeting_score,
        "max_score": 20.0,
        "passed": greeting_score >= 15.0,
        "business_name_stated": has_business_name,
        "greeting_stated": has_standard_greeting,
    }

    # -------------------------------------------------------------
    # 2. Legal & Recording Disclosure (Weight: 20 pts)
    # -------------------------------------------------------------
    disclosure_score = 20.0
    if recording_disclosure:
        has_disclosure = bool(_DISCLOSURE_PATTERNS.search(first_two_agent_turns))
        if has_disclosure:
            disclosure_score = 20.0
        else:
            disclosure_score = 0.0
            flags.append("missing_disclosure")

    rubric_breakdown["disclosure"] = {
        "score": disclosure_score,
        "max_score": 20.0,
        "passed": disclosure_score == 20.0,
        "required": recording_disclosure,
    }

    # -------------------------------------------------------------
    # 3. Information Extraction Completeness (Weight: 25 pts)
    # -------------------------------------------------------------
    data_score = 0.0
    msg = message or {}
    captured_name = bool(
        msg.get("name") or re.search(r"\b(name is|this is|i'm|i am) ([a-z]+)\b", combined_caller)
    )
    captured_phone = bool(
        msg.get("phone")
        or re.search(r"\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+1\d{10})\b", combined_caller)
    )
    captured_address = bool(
        msg.get("address")
        or re.search(
            r"\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|circle|ct|austin|texas|tx|\d{5})\b",
            combined_caller,
        )
    )
    captured_issue = bool(msg.get("message") or len(caller_texts) >= 1)

    if captured_name:
        data_score += 6.0
    if captured_phone:
        data_score += 8.0
    else:
        # If call is completed / booked / message taken, missing phone is a critical failure
        if outcome in ("booked", "appointment_booked", "message_taken"):
            flags.append("missing_caller_phone")

    if captured_address:
        data_score += 6.0
    if captured_issue:
        data_score += 5.0

    if data_score < 12.0 and len(transcript) >= 4:
        flags.append("incomplete_caller_details")

    rubric_breakdown["data_collection"] = {
        "score": data_score,
        "max_score": 25.0,
        "passed": data_score >= 17.0,
        "captured_name": captured_name,
        "captured_phone": captured_phone,
        "captured_address": captured_address,
        "captured_issue": captured_issue,
    }

    # -------------------------------------------------------------
    # 4. Emergency & Safety Escalation Protocol (Weight: 20 pts)
    # -------------------------------------------------------------
    safety_score = 20.0
    is_emergency = bool(urgency == "emergency" or _EMERGENCY_PATTERNS.search(combined_caller))

    if is_emergency:
        escalated_properly = bool(
            _EMERGENCY_RESPONSE_PATTERNS.search(combined_agent)
            or outcome in ("transferred", "emergency_transferred")
        )
        if escalated_properly:
            safety_score = 20.0
        else:
            safety_score = 0.0
            flags.append("safety_escalation_breach")

    rubric_breakdown["safety_escalation"] = {
        "score": safety_score,
        "max_score": 20.0,
        "passed": safety_score == 20.0,
        "emergency_detected": is_emergency,
    }

    # -------------------------------------------------------------
    # 5. Tone, Politeness & Conversational Efficiency (Weight: 15 pts)
    # -------------------------------------------------------------
    tone_score = 10.0
    if _POLITE_PATTERNS.search(combined_agent):
        tone_score += 3.0

    if _UNPROFESSIONAL_PATTERNS.search(combined_agent):
        tone_score -= 8.0
        flags.append("unprofessional_tone")

    # Latency efficiency
    if latency_p50_ms <= 1500:
        tone_score += 2.0
    elif latency_p50_ms > 2500:
        tone_score -= 3.0

    bounded_tone_score = max(0.0, min(15.0, tone_score))
    rubric_breakdown["tone_and_manner"] = {
        "score": bounded_tone_score,
        "max_score": 15.0,
        "passed": bounded_tone_score >= 10.0,
    }

    # -------------------------------------------------------------
    # Total QA Score Calculation (0 - 100)
    # -------------------------------------------------------------
    raw_total_score = (
        greeting_score + disclosure_score + data_score + safety_score + bounded_tone_score
    )
    overall_qa_score = round(max(0.0, min(100.0, raw_total_score)), 1)

    is_critical_failure = any(
        f in flags
        for f in ("safety_escalation_breach", "missing_disclosure", "missing_caller_phone")
    )
    if is_critical_failure:
        qa_status = "failed"
    elif overall_qa_score >= 85.0:
        qa_status = "passed"
    elif overall_qa_score >= 70.0:
        qa_status = "satisfactory"
    else:
        qa_status = "needs_review"

    # -------------------------------------------------------------
    # Predictive CSAT Modeling (1.0 to 5.0 Stars)
    # -------------------------------------------------------------
    csat = 4.2  # baseline
    rationales: list[str] = []

    if outcome in ("booked", "appointment_booked", "confirmed"):
        csat += 0.6
        rationales.append("Appointment booked successfully")
    elif outcome in ("message_taken", "transferred"):
        csat += 0.3
        rationales.append("Intake message captured and routed")
    elif outcome in ("abandoned", "failed"):
        csat -= 1.4
        rationales.append("Call disconnected or unfulfilled")

    if sentiment_label == "positive":
        csat += 0.3
        rationales.append("Positive customer sentiment detected")
    elif sentiment_label in ("frustrated", "negative"):
        csat -= 1.1
        rationales.append("Customer expressed frustration or friction")

    if latency_p50_ms > 2200:
        csat -= 0.3
        rationales.append("High voice latency observed")

    if overall_qa_score >= 90.0:
        csat += 0.2
    elif overall_qa_score < 60.0:
        csat -= 0.8
        rationales.append("Poor QA compliance score")

    if is_critical_failure:
        csat = min(csat, 2.0)
        rationales.append("Critical QA protocol breach triggered")

    bounded_csat = round(max(1.0, min(5.0, csat)), 1)
    csat_rationale = "; ".join(rationales) if rationales else "Standard conversational baseline"

    return {
        "qa_score": overall_qa_score,
        "qa_status": qa_status,
        "qa_flags": flags,
        "is_critical_failure": is_critical_failure,
        "rubric_breakdown": rubric_breakdown,
        "csat_score": bounded_csat,
        "csat_rationale": csat_rationale,
    }
