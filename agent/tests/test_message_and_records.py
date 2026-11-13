"""Offline unit tests and LLM-marked test scenarios for Milestone M1c-a.

Covers:
- take_message validation, confirmation rejection, correction history
- CallRecord and FileCallStore atomic writing
- SafetyMonitor silence stages (10s, 20s, 30s) and max duration (9min warn, 10min hangup) with SimulatedClock
- Abrupt caller hangup / shutdown record saving (C14 path)
- LLM scenario stubs marked with @pytest.mark.llm: C7, C11, C13, C14, T1, T2, T4, T15
"""

import asyncio
import json
from pathlib import Path

import pytest

from agent.records import (
    CallRecord,
    FileCallStore,
    MessagePayload,
    TranscriptEntry,
)
from agent.safety import SafetyMonitor, SimulatedClock
from agent.tools.message import (
    MessageCollector,
    create_take_message_tool,
    validate_and_normalize_phone,
)

# ---------------------------------------------------------------------------
# 1. Phone validation & take_message unit tests
# ---------------------------------------------------------------------------


def test_validate_and_normalize_phone() -> None:
    """Test validation and normalization of US and E.164 phone numbers."""
    valid, num = validate_and_normalize_phone("+15551234567")
    assert valid is True
    assert num == "+15551234567"

    valid, num = validate_and_normalize_phone("555-123-4567")
    assert valid is True
    assert num == "+15551234567"

    valid, num = validate_and_normalize_phone("(555) 123-4567")
    assert valid is True
    assert num == "+15551234567"

    valid, _ = validate_and_normalize_phone("12345")
    assert valid is False

    valid, _ = validate_and_normalize_phone("")
    assert valid is False


@pytest.mark.asyncio
async def test_take_message_phone_confirmed_rejection() -> None:
    """Test take_message rejects call when phone_confirmed is False."""
    collector = MessageCollector(caller_id_phone="+15551234567")
    tool = create_take_message_tool(collector)

    result = await tool(
        name="Alice Smith",
        phone="+15551234567",
        message="Leaking bathroom pipe",
        urgency="urgent",
        phone_confirmed=False,
    )
    assert "REJECTED" in result
    assert "not confirmed" in result
    assert collector.latest_message is None


@pytest.mark.asyncio
async def test_take_message_success_and_correction_history() -> None:
    """Test take_message success and updating correction history (C13 path)."""
    collector = MessageCollector(caller_id_phone="+15551234567")
    tool = create_take_message_tool(collector)

    # Initial message
    res1 = await tool(
        name="Bob Jones",
        phone="555-222-3333",
        message="Drain clogged",
        urgency="normal",
        phone_confirmed=True,
    )
    assert "SUCCESS" in res1
    assert collector.latest_message is not None
    assert collector.latest_message.phone == "+15552223333"
    assert len(collector.history) == 0

    # Caller corrects phone number to 555-444-5555
    res2 = await tool(
        name="Bob Jones",
        phone="555-444-5555",
        message="Drain clogged in main bath",
        urgency="normal",
        phone_confirmed=True,
    )
    assert "SUCCESS" in res2
    assert collector.latest_message.phone == "+15554445555"
    assert len(collector.history) == 1
    assert collector.history[0].phone == "+15552223333"


@pytest.mark.asyncio
async def test_take_message_emergency_urgency() -> None:
    """Test take_message with emergency urgency returns safety guidance."""
    collector = MessageCollector()
    tool = create_take_message_tool(collector)

    res = await tool(
        name="Charlie",
        phone="+15559998888",
        message="Water pipe burst in basement",
        urgency="emergency",
        phone_confirmed=True,
    )
    assert "SUCCESS" in res
    assert "written down your details" in res
    assert "911" in res
    assert collector.latest_message is not None
    assert collector.latest_message.urgency == "emergency"


# ---------------------------------------------------------------------------
# 2. CallRecord and FileCallStore atomic write tests
# ---------------------------------------------------------------------------


def test_file_call_store_atomic_write(tmp_path: Path) -> None:
    """Test FileCallStore writes a single JSON file atomically."""
    store = FileCallStore(storage_dir=tmp_path)
    record = CallRecord(
        call_id="call-test-1234",
        dialed_number="+18005550199",
        caller_number="+15551234567",
        started_at="2026-11-13T10:00:00Z",
        ended_at="2026-11-13T10:02:00Z",
        duration_s=120.0,
        outcome="message_taken",
        message=MessagePayload(
            name="Alice",
            phone="+15551234567",
            message="Need quote",
            urgency="normal",
        ),
        tags=["quote"],
        turn_count=4,
        latency_p50_ms=450.0,
        latency_p95_ms=520.0,
        turn_latencies_ms=[400.0, 450.0, 500.0, 520.0],
        transcript=[
            TranscriptEntry(role="user", text="Hello", time="2026-11-13T10:00:05Z"),
            TranscriptEntry(role="assistant", text="Hi", time="2026-11-13T10:00:06Z"),
        ],
    )

    saved_path = store.save_call_record(record)
    assert saved_path.exists()
    assert saved_path.suffix == ".json"

    # Verify content
    data = json.loads(saved_path.read_text(encoding="utf-8"))
    assert data["call_id"] == "call-test-1234"
    assert data["caller_number"] == "+15551234567"
    assert data["outcome"] == "message_taken"
    assert data["message"]["name"] == "Alice"
    assert len(data["turn_latencies_ms"]) == 4


def test_abrupt_hangup_simulation(tmp_path: Path) -> None:
    """Simulate C14 path: caller hangs up mid-conversation, shutdown writes partial record."""
    store = FileCallStore(storage_dir=tmp_path)
    partial_record = CallRecord(
        call_id="call-abrupt-c14",
        dialed_number="+18005550199",
        caller_number="+15559876543",
        started_at="2026-11-13T10:00:00Z",
        ended_at="2026-11-13T10:00:25Z",
        duration_s=25.0,
        outcome="abandoned",
        message=None,
        tags=["abandoned"],
        turn_count=2,
        transcript=[
            TranscriptEntry(
                role="assistant",
                text="Thanks for calling",
                time="2026-11-13T10:00:01Z",
            ),
            TranscriptEntry(
                role="user",
                text="Hi I need to...",
                time="2026-11-13T10:00:10Z",
            ),
        ],
    )
    saved = store.save_call_record(partial_record)
    assert saved.exists()
    data = json.loads(saved.read_text(encoding="utf-8"))
    assert data["outcome"] == "abandoned"
    assert len(data["transcript"]) == 2


# ---------------------------------------------------------------------------
# 3. Safety Monitor & Inactivity Tests (SimulatedClock)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_safety_monitor_silence_stages() -> None:
    """Test silence progression: 10s prompt 1, 20s prompt 2, 30s hangup."""
    spoken: list[str] = []
    ended_reasons: list[str] = []

    async def mock_say(text: str) -> None:
        spoken.append(text)

    async def mock_end(reason: str) -> None:
        ended_reasons.append(reason)

    clock = SimulatedClock(start_time=100.0)
    monitor = SafetyMonitor(
        clock=clock,
        max_duration_seconds=600.0,
        warn_duration_seconds=540.0,
        say_callback=mock_say,
        end_call_callback=mock_end,
    )

    # 1. At 5 seconds: no action
    clock.advance(5.0)
    action = await monitor.check_step()
    assert action is None
    assert len(spoken) == 0

    # 2. At 10 seconds: prompt 1
    clock.advance(5.0)
    action = await monitor.check_step()
    assert action == "prompted_silence_1"
    assert len(spoken) == 1
    assert "Are you still there" in spoken[0]

    # 3. At 20 seconds: prompt 2
    clock.advance(10.0)
    action = await monitor.check_step()
    assert action == "prompted_silence_2"
    assert len(spoken) == 2
    assert "still on the line" in spoken[1]

    # 4. At 30 seconds: hangup
    clock.advance(10.0)
    action = await monitor.check_step()
    assert action == "hung_up_silence"
    assert monitor.ended is True
    assert ended_reasons == ["silence_timeout"]


@pytest.mark.asyncio
async def test_safety_monitor_timer_pauses_when_agent_busy() -> None:
    """Test silence timer does not advance when agent is busy speaking/thinking."""
    spoken: list[str] = []
    clock = SimulatedClock(start_time=100.0)
    monitor = SafetyMonitor(
        clock=clock,
        max_duration_seconds=600.0,
        say_callback=lambda t: spoken.append(t) or asyncio.sleep(0),  # type: ignore
    )

    # Agent becomes busy at t=105
    clock.advance(5.0)
    monitor.set_agent_busy(True)

    # Clock advances 20s while busy
    clock.advance(20.0)
    action = await monitor.check_step()
    assert action is None
    assert len(spoken) == 0

    # Agent finishes at t=125
    monitor.set_agent_busy(False)
    clock.advance(5.0)  # Only 5s of user idle time
    action = await monitor.check_step()
    assert action is None
    assert len(spoken) == 0


@pytest.mark.asyncio
async def test_safety_monitor_max_duration() -> None:
    """Test max duration warning near 9 mins and hangup at 10 mins."""
    spoken: list[str] = []
    ended_reasons: list[str] = []

    clock = SimulatedClock(start_time=0.0)
    monitor = SafetyMonitor(
        clock=clock,
        max_duration_seconds=600.0,
        warn_duration_seconds=540.0,
        say_callback=lambda t: spoken.append(t) or asyncio.sleep(0),  # type: ignore
        end_call_callback=lambda r: ended_reasons.append(r) or asyncio.sleep(0),  # type: ignore
    )

    # Advance to 541 seconds -> Warn caller
    clock.advance(541.0)
    action = await monitor.check_step()
    assert action == "warned_duration"
    assert len(spoken) == 1
    assert "maximum allowed time" in spoken[0]

    # Advance past 600 seconds -> Hangup
    clock.advance(60.0)
    action = await monitor.check_step()
    assert action == "hung_up_max_duration"
    assert ended_reasons == ["max_duration_exceeded"]


# ---------------------------------------------------------------------------
# 4. LLM-Marked Scenario Test Stubs (Not run by offline unit test suite)
# Scenarios: C7, C11, C13, C14, T1, T2, T4, T15
# ---------------------------------------------------------------------------


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_c7_refuses_name_or_number() -> None:
    """Scenario C7: Caller refuses to give name or number; takes minimal message without pressure."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_c11_sales_or_robocall() -> None:
    """Scenario C11: Telemarketer/sales call ends politely under 30s with spam tag."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_c13_detail_correction_mid_call() -> None:
    """Scenario C13: Caller corrects details mid-call; record stores final version and history."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_c14_abrupt_caller_hangup() -> None:
    """Scenario C14: Caller hangs up mid-conversation; partial record saved with outcome abandoned."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_t1_burst_pipe_emergency() -> None:
    """Scenario T1: Burst pipe emergency collects emergency details without false promises."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_t2_gas_smell_evacuation() -> None:
    """Scenario T2: Gas smell advises immediate evacuation and 911, gives zero repair advice."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_t4_routine_water_heater_quote() -> None:
    """Scenario T4: Routine quote collects name, phone, address, and issue details."""
    pytest.skip("LLM scenario test: run with real agent session")


@pytest.mark.llm
@pytest.mark.asyncio
async def test_scenario_t15_booking_request_unconfirmed() -> None:
    """Scenario T15: Caller asks to book time; agent clarifies booking cannot be made directly."""
    pytest.skip("LLM scenario test: run with real agent session")
