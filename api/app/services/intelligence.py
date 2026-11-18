"""Automated Post-Call Intelligence and Sentiment Extraction Service.

Analyzes conversational transcripts to extract sentiment, lead scoring (1-100),
lost opportunity root causes, and customer objections for the Supervisor Copilot.
"""

from __future__ import annotations

import re
from typing import Any

# Sentiment lexicon
_POSITIVE_WORDS = {
    "great",
    "thanks",
    "thank",
    "awesome",
    "perfect",
    "appreciate",
    "helpful",
    "good",
    "excellent",
    "wonderful",
    "glad",
    "yes",
    "definitely",
    "sounds good",
    "confirm",
}
_NEGATIVE_WORDS = {
    "unacceptable",
    "terrible",
    "bad",
    "angry",
    "frustrated",
    "ridiculous",
    "horrible",
    "scam",
    "waste",
    "complaint",
    "rude",
    "no",
    "never",
    "hate",
    "slow",
    "expensive",
}
_URGENT_WORDS = {
    "emergency",
    "burst",
    "leak",
    "leaking",
    "gas",
    "flooding",
    "flood",
    "now",
    "asap",
    "immediately",
    "hazard",
    "smoke",
    "fire",
    "danger",
    "urgent",
}

# Objection patterns
_OBJECTION_PATTERNS = [
    (
        re.compile(
            r"\b(too expensive|too much|high price|cannot afford|out of my budget|cheaper)\b", re.I
        ),
        "pricing_high",
    ),
    (
        re.compile(r"\b(call (someone else|another)|look around|shop around|check other)\b", re.I),
        "shopping_competitors",
    ),
    (
        re.compile(
            r"\b(too late|too far away|too long|cannot wait|schedule doesn't work|no availability)\b",
            re.I,
        ),
        "timing_unavailable",
    ),
    (
        re.compile(r"\b(outside|out of (area|range|territory)|too far)\b", re.I),
        "outside_service_area",
    ),
    (
        re.compile(r"\b(don't need|no thanks|not interested|stop calling|remove me)\b", re.I),
        "not_interested",
    ),
]


def extract_post_call_intelligence(
    transcript: list[dict[str, Any]],
    outcome: str = "completed",
    urgency: str = "normal",
) -> dict[str, Any]:
    """Extract sentiment, lead scoring, lost opportunity reasons, and customer objections."""
    if not transcript:
        # Default baseline if no transcript
        base_score = 75.0 if outcome in ("booked", "appointment_booked") else 50.0
        return {
            "sentiment_score": 0.0,
            "sentiment_label": "neutral",
            "lead_score": base_score,
            "lost_reason": None
            if outcome in ("booked", "appointment_booked")
            else "insufficient_data",
            "key_objections": [],
        }

    # Aggregate caller utterances
    caller_texts: list[str] = []
    all_texts: list[str] = []
    for turn in transcript:
        txt = str(turn.get("text", "")).strip()
        role = str(turn.get("speaker", turn.get("role", ""))).lower()
        if txt:
            all_texts.append(txt)
            if role in ("caller", "user", "customer"):
                caller_texts.append(txt)

    combined_caller = (
        " ".join(caller_texts).lower() if caller_texts else " ".join(all_texts).lower()
    )
    tokens = re.findall(r"\b\w+\b", combined_caller)

    # 1. Sentiment Analysis
    pos_count = sum(1 for t in tokens if t in _POSITIVE_WORDS)
    neg_count = sum(1 for t in tokens if t in _NEGATIVE_WORDS)
    urg_count = sum(1 for t in tokens if t in _URGENT_WORDS)

    total_sentiment_tokens = pos_count + neg_count
    if total_sentiment_tokens > 0:
        raw_sentiment = (pos_count - neg_count) / float(total_sentiment_tokens)
    else:
        raw_sentiment = 0.0

    if urg_count >= 2 or urgency == "emergency":
        sentiment_label = "urgent"
    elif raw_sentiment > 0.2:
        sentiment_label = "positive"
    elif raw_sentiment < -0.2:
        sentiment_label = "frustrated"
    else:
        sentiment_label = "neutral"

    # 2. Key Objections & Lost Reason Detection
    objections: list[str] = []
    lost_reason: str | None = None

    for pattern, label in _OBJECTION_PATTERNS:
        if pattern.search(combined_caller):
            if label not in objections:
                objections.append(label)

    if outcome in ("booked", "appointment_booked", "confirmed"):
        lost_reason = None
    elif "outside_service_area" in objections:
        lost_reason = "outside_coverage_area"
    elif "pricing_high" in objections:
        lost_reason = "price_too_high"
    elif "timing_unavailable" in objections:
        lost_reason = "no_availability"
    elif "not_interested" in objections:
        lost_reason = "declined_service"
    elif outcome in ("abandoned", "silence_timeout"):
        lost_reason = "caller_abandoned"
    elif outcome in ("message_taken", "transferred"):
        lost_reason = None  # Still active pipeline
    else:
        lost_reason = "unqualified"

    # 3. Lead Score Calculation (1 to 100)
    score = 50.0

    if outcome in ("booked", "appointment_booked"):
        score += 40.0
    elif outcome in ("message_taken", "transferred"):
        score += 25.0
    elif outcome in ("abandoned", "failed", "spam"):
        score -= 30.0

    # Address / Zip code mentioned (+15)
    if re.search(
        r"\b(street|st|road|rd|avenue|ave|lane|ln|drive|dr|circle|ct|austin|texas|tx|\d{5})\b",
        combined_caller,
    ):
        score += 15.0

    # Phone number mentioned / confirmed (+10)
    if re.search(r"\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+1\d{10})\b", combined_caller):
        score += 10.0

    # Objections penalty
    score -= len(objections) * 8.0

    # Sentiment adjustments
    if sentiment_label == "positive":
        score += 10.0
    elif sentiment_label == "frustrated":
        score -= 15.0

    bounded_lead_score = round(max(1.0, min(100.0, score)), 1)

    return {
        "sentiment_score": round(raw_sentiment, 2),
        "sentiment_label": sentiment_label,
        "lead_score": bounded_lead_score,
        "lost_reason": lost_reason,
        "key_objections": objections,
    }
