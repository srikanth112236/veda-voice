"""Tests for Outbound Voicemail Drop and Answering Machine Detection (AMD) Tool."""

import pytest

from agent.config import TenantConfig
from agent.tools.voicemail import create_voicemail_tool


class MockLiveKitSession:
    def __init__(self) -> None:
        self.spoken_phrases: list[tuple[str, bool]] = []

    async def say(self, text: str, allow_interruptions: bool = True) -> None:
        self.spoken_phrases.append((text, allow_interruptions))


class MockRoom:
    def __init__(self) -> None:
        self.disconnected = False

    async def disconnect(self) -> None:
        self.disconnected = True


@pytest.mark.asyncio
async def test_voicemail_tool_drop_execution() -> None:
    """Verify voicemail tool speaks concise message, records outcome, and disconnects room."""
    config = TenantConfig(
        tenant_id="tenant-vm-123",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-5pm",
        timezone="America/New_York",
        services=["Plumbing"],
        agent_name="Sarah",
        greeting="Hello!",
    )

    session = MockLiveKitSession()
    room = MockRoom()
    outcome_captured: str | None = None

    def on_dropped(val: str) -> None:
        nonlocal outcome_captured
        outcome_captured = val

    tool = create_voicemail_tool(
        config=config,
        livekit_session=session,
        room=room,
        lead_name="John Connor",
        service_requested="Water Heater Replacement",
        on_voicemail_dropped=on_dropped,
    )

    result = await tool(detected_reason="carrier_beep_detected")
    assert "Voicemail drop completed" in result
    assert outcome_captured == "voicemail_left"

    # Spoken without allowing interruptions so machine audio does not cut agent off
    assert len(session.spoken_phrases) == 1
    spoken_text, allow_interrupt = session.spoken_phrases[0]
    assert allow_interrupt is False
    assert "John Connor" in spoken_text
    assert "Apex Plumbing" in spoken_text
    assert "Water Heater Replacement" in spoken_text
    assert "call back at your earliest convenience" in spoken_text

    # Room disconnected cleanly
    assert room.disconnected is True
