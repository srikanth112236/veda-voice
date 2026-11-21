"""Unit tests for Phase D: Voice Agent Warm Transfer Tool, On-Call Branch Routing, and Whisper Briefing."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from agent.config import TenantConfig
from agent.tools.transfer import create_transfer_tool


@pytest.mark.asyncio
async def test_transfer_tool_routes_to_branch_emergency_phone():
    """Verify transfer_call_tool routes to location_emergency_phone for emergency priority."""
    config = TenantConfig(
        tenant_id="ten_austin",
        business="Austin Apex Comfort",
        hours="8am-5pm",
        greeting="Hello from Apex",
        transfer_number="+18005550100",  # default tenant transfer
        location_transfer_number="+15125550200",  # branch transfer
        location_emergency_phone="+15125550999",  # branch emergency line
        call_token="mock-token-xyz",
    )

    mock_api = MagicMock()
    mock_session = MagicMock()
    mock_session.say = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("agent.tools.transfer.default_api_client.record_call_transfer", mock_api)

        transfer_tool = create_transfer_tool(
            config=config,
            livekit_session=mock_session,
            call_id="call_test_d1",
        )

        res = await transfer_tool(
            reason="active_gas_smell",
            priority="emergency",
            caller_name="George Clark",
            caller_phone="+15125550888",
            service_address="701 Brazos St, Austin TX",
        )

        assert "+15125550999" in res
        assert "priority=emergency" in res
        assert "George Clark" in res
        assert "active_gas_smell" in res

        # Verify verbal hold notice delivered to caller
        assert mock_session.say.called
        spoken_msg = mock_session.say.call_args[0][0]
        assert "safe location" in spoken_msg.lower()
        assert "on-call technician" in spoken_msg.lower()

        # Verify API client audit called with emergency parameters
        assert mock_api.called
        api_args = mock_api.call_args[1]
        assert api_args["target_number"] == "+15125550999"
        assert api_args["priority"] == "emergency"
        assert api_args["caller_name"] == "George Clark"
        assert "701 Brazos St" in api_args["service_address"]
        assert "George Clark" in api_args["whisper_briefing"]


@pytest.mark.asyncio
async def test_transfer_tool_normal_priority_routes_to_branch_transfer():
    """Verify transfer_call_tool routes to location_transfer_number for standard human requests."""
    config = TenantConfig(
        tenant_id="ten_austin",
        business="Austin Apex Comfort",
        hours="8am-5pm",
        greeting="Hello from Apex",
        transfer_number="+18005550100",
        location_transfer_number="+15125550200",
        location_emergency_phone="+15125550999",
        call_token="mock-token-xyz",
    )

    mock_api = MagicMock()
    mock_session = MagicMock()
    mock_session.say = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("agent.tools.transfer.default_api_client.record_call_transfer", mock_api)

        transfer_tool = create_transfer_tool(
            config=config,
            livekit_session=mock_session,
            call_id="call_test_d2",
        )

        res = await transfer_tool(
            reason="caller_requested_human",
            priority="normal",
            caller_name="Emily Davis",
        )

        assert "+15125550200" in res
        assert "priority=normal" in res

        # Verify verbal hold notice
        assert mock_session.say.called
        spoken_msg = mock_session.say.call_args[0][0]
        assert "glad to connect you" in spoken_msg.lower()

        # Verify target is standard branch transfer
        api_args = mock_api.call_args[1]
        assert api_args["target_number"] == "+15125550200"
        assert api_args["priority"] == "normal"
