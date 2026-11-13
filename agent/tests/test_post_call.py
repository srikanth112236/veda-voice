"""Offline unit tests for Milestone M1c-b post-call processing and notification alerts."""

from agent.config import load_business_config
from agent.post_call import (
    ConsoleEmailDispatcher,
    PostCallAlert,
    build_post_call_alert,
    dispatch_post_call_notification,
)
from agent.records import CallRecord, MessagePayload, TranscriptEntry


def _make_dummy_record(
    urgency: str = "emergency",
    name: str = "Shrikant",
    phone: str = "+18217643770",
    address: str = "Los Angeles Road number two",
    issue: str = "Water pouring through the ceiling; suspected burst pipe.",
) -> CallRecord:
    """Helper to build a realistic CallRecord fixture."""
    message = MessagePayload(
        name=name,
        phone=phone,
        message=issue,
        urgency=urgency,
        phone_confirmed=True,
        address=address,
    )
    return CallRecord(
        call_id="call-test-999",
        dialed_number="+18005550199",
        caller_number=phone,
        started_at="2026-11-13T12:00:00Z",
        ended_at="2026-11-13T12:05:00Z",
        duration_s=300.0,
        outcome="message_taken",
        message=message,
        tags=[urgency],
        turn_count=10,
        latency_p50_ms=1200.0,
        latency_p95_ms=1800.0,
        transcript=[
            TranscriptEntry(
                role="assistant", text="How can I help you?", time="2026-11-13T12:00:05Z"
            ),
            TranscriptEntry(role="user", text=issue, time="2026-11-13T12:00:10Z"),
        ],
    )


def test_build_post_call_alert_emergency() -> None:
    """Verify emergency alert formatting, subject banner, and action items."""
    config = load_business_config("default")
    record = _make_dummy_record(urgency="emergency")
    alert = build_post_call_alert(record, config)

    assert isinstance(alert, PostCallAlert)
    assert "[🚨 EMERGENCY CALL]" in alert.subject
    assert "Shrikant" in alert.subject
    assert alert.urgency == "emergency"
    assert alert.caller_name == "Shrikant"
    assert alert.caller_phone == "+18217643770"
    assert alert.address == "Los Angeles Road number two"
    assert any("main utility shut-off" in item for item in alert.action_items)
    assert any("Dispatch emergency on-call technician" in item for item in alert.action_items)
    assert "WATER POURING THROUGH THE CEILING" in alert.plain_text.upper()
    assert "EMERGENCY ALERT" in alert.html_body


def test_build_post_call_alert_normal_inquiry() -> None:
    """Verify standard message taking has normal banner and standard action items."""
    config = load_business_config("default")
    record = _make_dummy_record(urgency="normal", issue="Need quote for faucet replacement")
    alert = build_post_call_alert(record, config)

    assert "[Call Summary]" in alert.subject
    assert alert.urgency == "normal"
    assert any("Review message and schedule follow-up" in item for item in alert.action_items)
    assert "NORMAL ALERT" in alert.html_body


def test_dispatch_post_call_notification_with_console_dispatcher() -> None:
    """Verify dispatch_post_call_notification completes successfully with ConsoleEmailDispatcher."""
    config = load_business_config("default")
    record = _make_dummy_record()
    dispatcher = ConsoleEmailDispatcher()

    success = dispatch_post_call_notification(record, config, dispatcher=dispatcher)
    assert success is True


class FailingDispatcher:
    """Dispatcher that deliberately raises an exception to test error handling."""

    def send_alert(self, alert: PostCallAlert) -> bool:
        raise ConnectionError("SMTP or API gateway unreachable")


def test_dispatch_post_call_notification_handles_exceptions_gracefully() -> None:
    """Verify dispatch does not raise exceptions when mail delivery fails."""
    config = load_business_config("default")
    record = _make_dummy_record()
    failing = FailingDispatcher()

    # Should not raise exception, but return False
    success = dispatch_post_call_notification(record, config, dispatcher=failing)
    assert success is False
