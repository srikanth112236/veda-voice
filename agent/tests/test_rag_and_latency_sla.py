"""Tests for Semantic FAQ RAG and Latency SLA Compliance Guardrails."""

from agent.config import FAQItem
from agent.rag import rank_and_filter_faqs
from agent.telemetry import LatencyTracker


def test_rag_filters_top_faqs_based_on_query_context() -> None:
    """Verify rank_and_filter_faqs prioritizes relevant FAQs when catalog is large."""
    faqs = [
        FAQItem(
            question="How do I unclog a toilet?",
            answer="Use a plunger or auger.",
            category="drain_cleaning",
        ),
        FAQItem(
            question="Do you repair tankless water heaters?",
            answer="Yes, all major brands.",
            category="water_heaters",
        ),
        FAQItem(
            question="What are your standard business hours?",
            answer="Mon-Fri 8am-5pm.",
            category="hours",
        ),
        FAQItem(
            question="Are you licensed and insured?",
            answer="Yes, master license #12345.",
            category="credentials",
        ),
        FAQItem(
            question="Do you service commercial grease traps?",
            answer="Yes, commercial contracts.",
            category="commercial",
        ),
        FAQItem(
            question="How much does a water heater flush cost?",
            answer="Starts at $149.",
            category="water_heaters",
        ),
        FAQItem(
            question="Do you offer emergency gas leak repairs?",
            answer="Call 911 immediately.",
            category="safety",
        ),
        FAQItem(
            question="Do you provide HVAC duct cleaning?",
            answer="No, plumbing only.",
            category="services",
        ),
    ]

    # Query context about water heaters
    filtered = rank_and_filter_faqs(faqs, query_context="tankless water heater leak", max_faqs=3)

    assert len(filtered) == 3
    # Top results must be the water heater FAQs
    questions = [f.question for f in filtered]
    assert "Do you repair tankless water heaters?" in questions
    assert "How much does a water heater flush cost?" in questions


def test_rag_returns_all_when_under_threshold() -> None:
    """Verify rank_and_filter_faqs returns all items without truncation when catalog is small."""
    faqs = [
        FAQItem(question="What are your hours?", answer="8am-5pm"),
        FAQItem(question="Where are you located?", answer="Austin, TX"),
    ]

    filtered = rank_and_filter_faqs(faqs, query_context="anything", max_faqs=5)
    assert len(filtered) == 2


def test_latency_sla_compliance_pass() -> None:
    """Verify check_sla_compliance returns compliant when all 3 stages meet telephony targets."""
    tracker = LatencyTracker()
    # 5 turns with excellent latencies
    for _ in range(5):
        tracker.record_turn(
            pipeline_latency_ms=700.0,
            eou_delay_ms=350.0,  # <= 750ms target
            llm_ttft_ms=220.0,  # <= 350ms target
            tts_ttfb_ms=130.0,  # <= 250ms target
        )

    sla = tracker.check_sla_compliance()
    assert sla["compliant"] is True
    assert len(sla["breaches"]) == 0
    assert sla["bottleneck_stage"] is None


def test_latency_sla_compliance_detects_llm_bottleneck() -> None:
    """Verify check_sla_compliance flags LLM inference breach and isolates bottleneck."""
    tracker = LatencyTracker()
    for _ in range(5):
        tracker.record_turn(
            pipeline_latency_ms=1350.0,
            eou_delay_ms=300.0,
            llm_ttft_ms=900.0,  # Spiked: 900ms > 350ms target
            tts_ttfb_ms=150.0,
        )

    sla = tracker.check_sla_compliance()
    assert sla["compliant"] is False
    assert any("LLM TTFT" in b for b in sla["breaches"])
    assert sla["bottleneck_stage"] == "LLM_INFERENCE"
