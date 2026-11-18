"""Tests for Voice Agent Human Transfer Tool and Message Fallback."""

import pytest

from agent.config import TenantConfig
from agent.tools.transfer import create_transfer_tool
from api.app.core.security import create_access_token


class MockLiveKitSession:
    def __init__(self) -> None:
        self.spoken_phrases: list[str] = []

    async def say(self, text: str, allow_interruptions: bool = True) -> None:
        self.spoken_phrases.append(text)


class MockRoom:
    def __init__(self) -> None:
        self.transferred_to: str | None = None

    async def transfer_sip_participant(self, transfer_to: str) -> None:
        self.transferred_to = transfer_to


@pytest.mark.asyncio
async def test_transfer_tool_happy_path() -> None:
    """Verify warm transfer speaks reassurance, notifies control plane, and initiates SIP transfer."""
    token = create_access_token({"sub": "agent", "role": "agent", "tenant_id": "tenant-test-123"})
    config = TenantConfig(
        tenant_id="tenant-test-123",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-5pm",
        timezone="America/New_York",
        services=["Plumbing"],
        agent_name="Sarah",
        greeting="Hello!",
        transfer_number="+15125559876",
        call_token=token,
    )

    session = MockLiveKitSession()
    room = MockRoom()

    tool = create_transfer_tool(
        config=config,
        livekit_session=session,
        room=room,
        call_id="call-live-1",
    )

    result = await tool(reason="caller_requested_human", priority="normal")
    assert "Transfer initiated to specialist at +15125559876" in result
    assert len(session.spoken_phrases) == 1
    assert (
        "Please hold on for just a moment while I transfer your call" in session.spoken_phrases[0]
    )
    assert room.transferred_to == "+15125559876"


@pytest.mark.asyncio
async def test_transfer_tool_emergency_reassurance() -> None:
    """Verify emergency transfer speaks urgent priority hold message."""
    config = TenantConfig(
        tenant_id="tenant-test-123",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-5pm",
        timezone="America/New_York",
        services=["Plumbing"],
        agent_name="Sarah",
        greeting="Hello!",
        transfer_number="+15125559876",
    )
    session = MockLiveKitSession()
    room = MockRoom()

    tool = create_transfer_tool(
        config=config,
        livekit_session=session,
        room=room,
        call_id="call-live-2",
    )

    result = await tool(reason="emergency_gas_leak", priority="emergency")
    assert "Transfer initiated to specialist" in result
    assert "on-call specialist" in session.spoken_phrases[0]


@pytest.mark.asyncio
async def test_transfer_tool_fallback_when_unconfigured() -> None:
    """Verify graceful fallback to message taking when transfer_number is empty (FR-CALL-5)."""
    config = TenantConfig(
        tenant_id="tenant-test-123",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-5pm",
        timezone="America/New_York",
        services=["Plumbing"],
        agent_name="Sarah",
        greeting="Hello!",
        transfer_number="",  # Not configured
    )
    session = MockLiveKitSession()
    room = MockRoom()

    tool = create_transfer_tool(
        config=config,
        livekit_session=session,
        room=room,
        call_id="call-live-3",
    )

    result = await tool(reason="caller_requested_human")
    assert "Our direct transfer line is currently not available" in result
    assert "confirm your name and callback number" in result
    assert len(session.spoken_phrases) == 0  # Reassurance was returned directly as tool response
    assert room.transferred_to is None
