"""Offline unit tests for SIP attribute parsing, phone number redaction, and latency calculation.

Runs 100% offline with zero network or API keys required.
"""

from agent.telemetry import (
    LatencyTracker,
    calculate_percentiles,
    parse_sip_attributes,
    redact_phone,
)
from agent.tools.latency_report import extract_latencies_from_text, format_report


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


def test_latency_tracker() -> None:
    """Test LatencyTracker summary accumulation."""
    tracker = LatencyTracker()
    assert tracker.summary() == {"count": 0, "median_ms": 0.0, "p95_ms": 0.0}

    # Record 10 turns
    for val in [250.0, 300.0, 320.0, 350.0, 380.0, 400.0, 410.0, 450.0, 490.0, 800.0]:
        tracker.record_turn(val)

    summary = tracker.summary()
    assert summary["count"] == 10
    # Values: [250, 300, 320, 350, 380, 400, 410, 450, 490, 800]
    # mid = (380 + 400) / 2 = 390.0
    assert summary["median_ms"] == 390.0
    assert summary["p95_ms"] == 800.0


def test_latency_report_extraction_and_format() -> None:
    """Test regex extraction and report formatting."""
    log_sample = """
    2026-11-13 10:00:00 INFO receptionist: turn_latency_ms=340.50 (eou_ms=120.00 tts_ttfb_ms=220.50)
    2026-11-13 10:00:05 INFO receptionist: turn_latency_ms=410.25 (eou_ms=150.00 tts_ttfb_ms=260.25)
    2026-11-13 10:00:10 INFO receptionist: {"turn_latency_ms": 520.00}
    """
    extracted = extract_latencies_from_text(log_sample)
    assert extracted == [340.50, 410.25, 520.00]

    report = format_report(extracted)
    assert "server-side pipeline latency, not including phone-network delay" in report
    assert "Sample Count (Turns): 3" in report
    assert "Median (p50):         410.25 ms" in report
    assert "95th Percentile (p95): 520.00 ms" in report
