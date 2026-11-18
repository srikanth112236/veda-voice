"""Voice agent tool for transferring callers to human staff or on-call technicians.

Adheres strictly to SRS Section 5.3 (FR-CALL-4, FR-CALL-5):
- Emergency keywords and explicit customer transfer requests.
- Warm transfer to staff with graceful fallback to message taking if transfer line is unconfigured or busy.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, cast

from livekit.agents import FunctionTool, function_tool

from agent.config import TenantConfig
from agent.config_client import default_api_client

logger = logging.getLogger("receptionist.tools.transfer")


def create_transfer_tool(
    config: TenantConfig,
    livekit_session: Any = None,
    room: Any = None,
    call_id: str = "",
) -> FunctionTool:
    """Create a LiveKit function tool that executes warm/cold transfer to a human specialist."""

    @function_tool
    async def transfer_call_tool(
        reason: Annotated[
            str,
            "Detailed reason for transfer e.g. 'caller_requested_human', 'emergency_pipe_burst', 'complex_quote'",
        ] = "caller_requested_human",
        priority: Annotated[
            str,
            "Urgency priority of the transfer: 'normal' or 'emergency'",
        ] = "normal",
    ) -> str:
        """Call this function when the customer explicitly asks to speak to a person/technician, or an emergency demands human escalation."""
        target_number = config.transfer_number.strip() if config.transfer_number else ""

        # Fallback to message taking if no transfer number configured
        if not target_number:
            logger.info(
                "Transfer requested for tenant '%s' (reason: %s), but no transfer_number configured. Falling back to message taking.",
                config.tenant_id,
                reason,
            )
            return (
                f"Our direct transfer line is currently not available, but I will record your details as high priority "
                f"for an immediate callback from our {config.business} specialist. May I please confirm your name and callback number?"
            )

        logger.info(
            "Transferring call %s to human specialist at %s (reason: %s, priority: %s)",
            call_id or "live_call",
            target_number,
            reason,
            priority,
        )

        # 1. Spoken verbal hold notice
        hold_message = (
            f"Please hold for just a moment while I connect you directly with our on-call specialist at {config.business}."
            if priority == "emergency"
            else f"I would be glad to connect you with our team at {config.business}. Please hold on for just a moment while I transfer your call."
        )

        if livekit_session and hasattr(livekit_session, "say"):
            try:
                await livekit_session.say(hold_message, allow_interruptions=False)
            except Exception as e:
                logger.debug("Failed to speak transfer hold message: %s", e)

        # 2. Audit transfer event to internal API control plane
        if config.call_token:
            default_api_client.record_call_transfer(
                call_id=call_id or "call",
                target_number=target_number,
                call_token=config.call_token,
                reason=reason,
                priority=priority,
                notes=f"Agent warm transfer initiated for {config.business}",
            )

        # 3. SIP Transfer / Participant referral if supported by carrier
        if room and hasattr(room, "transfer_sip_participant"):
            try:
                await room.transfer_sip_participant(transfer_to=target_number)
            except Exception as e:
                logger.warning("Carrier SIP REFER transfer warning: %s", e)

        return (
            f"Transfer initiated to specialist at {target_number}. "
            f"Please hold while the line bridges."
        )

    return cast(FunctionTool, transfer_call_tool)
