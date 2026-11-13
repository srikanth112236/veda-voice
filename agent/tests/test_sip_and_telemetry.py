"""Offline unit tests for SIP attribute parsing, phone number redaction, and pipeline latency calculation.

Runs 100% offline with zero network or API keys required.
"""

from agent.telemetry import (
    LatencyTracker,
    calculate_percentiles,
    parse_sip_attributes,
    redact_phone,
)
from agent.tools.latency_report import extract_metrics_from_text, format_report


def test_redact_phone_standard() -> None:
    """Test phone redaction preserves only last 4 digits."""
    assert redact_phone("+15551234567") == "***-***-4567"
    assert redact_phone("5551234567") == "***-***-4567"
    assert redact_phone("+44 20 7946 0958") == "***-***-0958"


def test_redact_phone_edge_cases() -> None:
    """Test redaction on short numbers, empty strings, and null inputs."""
    assert redact_phone(None) == "[unknown]"
    assert redact_phone("") == "[unknown]"
    assert redact_phone("   ") == "[unknown]"
    assert redact_phone("123") == "***"
    assert redact_phone("1234") == "***"
    assert redact_phone("abc") == "[redacted]"


def test_parse_sip_attributes() -> None:
    """Test extraction of LiveKit SIP attributes."""
    livekit_attrs = {
        "sip.phoneNumber": "+15551234567",
        "sip.trunkPhoneNumber": "+18005550199",
        "sip.callID": "call-abc-12345-xyz",
        "other.customAttribute": "ignored",
    }
    parsed = parse_sip_attributes(livekit_attrs)
    assert parsed["caller_number"] == "+15551234567"
    assert parsed["dialed_number"] == "+18005550199"
    assert parsed["call_id"] == "call-abc-12345-xyz"


def test_parse_sip_attributes_empty() -> None:
    """Test parsing when no SIP attributes are provided."""
    parsed = parse_sip_attributes(None)
    assert parsed == {"caller_number": "", "dialed_number": "", "call_id": ""}

    parsed_empty = parse_sip_attributes({})
    assert parsed_empty == {"caller_number": "", "dialed_number": "", "call_id": ""}


def test_calculate_percentiles() -> None:
    """Test median and p95 calculations."""
    # Empty list
    assert calculate_percentiles([]) == (0.0, 0.0)

    # Single value
    assert calculate_percentiles([500.0]) == (500.0, 500.0)

    # Odd count: 5 values [100, 200, 300, 400, 500] -> median 300, p95 500
    p50, p95 = calculate_percentiles([500.0, 100.0, 300.0, 200.0, 400.0])
    assert p50 == 300.0
    assert p95 == 500.0

    # Even count: 4 values [100, 200, 300, 400] -> median 250, p95 400
    p50, p95 = calculate_percentiles([100.0, 200.0, 300.0, 400.0])
    assert p50 == 250.0
    assert p95 == 400.0


def test_latency_tracker_pipeline_and_e2e() -> None:
    """Test LatencyTracker handles pipeline formula, e2e latency, and skips zero-speech turns."""
    tracker = LatencyTracker()
    initial_summary = tracker.summary()
    assert initial_summary["turn_count"] == 0
    assert initial_summary["total_llm_calls"] == 0
    assert initial_summary["pipeline_median_ms"] == 0.0

    # Skip invalid or zero speech turns
    tracker.record_turn(pipeline_latency_ms=0.0, library_e2e_ms=0.0, llm_calls=1)
    tracker.record_turn(pipeline_latency_ms=-10.0, library_e2e_ms=None, llm_calls=1)
    assert tracker.summary()["turn_count"] == 0

    # Record 3 valid turns:
    # Turn 1: EOU=100ms, TTFT=150ms, TTFB=200ms -> Pipeline = 450ms, Library e2e = 430ms
    # Turn 2: EOU=120ms, TTFT=180ms, TTFB=220ms -> Pipeline = 520ms, Library e2e = 510ms
    # Turn 3: EOU=80ms, TTFT=120ms, TTFB=150ms -> Pipeline = 350ms, Library e2e = 340ms
    tracker.record_turn(pipeline_latency_ms=450.0, library_e2e_ms=430.0, llm_calls=1)
    tracker.record_turn(pipeline_latency_ms=520.0, library_e2e_ms=510.0, llm_calls=2)
    tracker.record_turn(pipeline_latency_ms=350.0, library_e2e_ms=340.0, llm_calls=1)

    summary = tracker.summary()
    assert summary["turn_count"] == 3
    assert summary["total_llm_calls"] == 4
    # Pipeline sorted: [350, 450, 520] -> median 450.0, p95 520.0
    assert summary["pipeline_median_ms"] == 450.0
    assert summary["pipeline_p95_ms"] == 520.0
    # E2E sorted: [340, 430, 510] -> median 430.0, p95 510.0
    assert summary["e2e_median_ms"] == 430.0
    assert summary["e2e_p95_ms"] == 510.0


def test_latency_report_extraction_and_format() -> None:
    """Test regex extraction of pipeline, e2e, and llm_calls plus report formatting."""
    log_sample = """
    2026-11-13 10:00:00 INFO receptionist: pipeline_latency_ms=450.00 e2e_latency_ms=430.00 (eou_ms=100.00 ttft_ms=150.00 tts_ttfb_ms=200.00 llm_calls=1)
    2026-11-13 10:00:05 INFO receptionist: turn_latency_ms=520.00 e2e_latency_ms=510.00 (eou_ms=120.00 ttft_ms=180.00 tts_ttfb_ms=220.00 llm_calls=2)
    2026-11-13 10:00:10 INFO receptionist: {"pipeline_latency_ms": 350.00, "e2e_latency_ms": 340.00, "llm_calls": 1}
    """
    pipe, e2e, llm_calls = extract_metrics_from_text(log_sample)
    assert pipe == [450.00, 520.00, 350.00]
    assert e2e == [430.00, 510.00, 340.00]
    assert llm_calls == 4

    report = format_report(pipe, e2e, llm_calls)
    assert "Metric 1: Pipeline Latency = EOU Delay + LLM TTFT + TTS TTFB" in report
    assert "Metric 2: Library E2E Latency" in report
    assert "Spoken Turns Measured:    3" in report
    assert "Total LLM Invocations:    4" in report
    assert "Median (p50):           450.00 ms" in report
    assert "95th Percentile (p95):  520.00 ms" in report
