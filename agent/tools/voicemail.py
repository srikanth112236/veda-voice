"""Voice agent tool for Answering Machine Detection (AMD) and concise voicemail drop.

Adheres strictly to docs/IMPLEMENTATION.md Section 3.3 Goal 5:
Leaves a concise 12-second message and hangs up cleanly when an answering machine or beep is detected.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, cast

from livekit.agents import FunctionTool, function_tool

from agent.config import TenantConfig

logger = logging.getLogger("receptionist.tools.voicemail")


def create_voicemail_tool(
    config: TenantConfig,
    livekit_session: Any = None,
    room: Any = None,
    lead_name: str = "there",
    service_requested: str = "your requested service",
    on_voicemail_dropped: Any = None,
) -> FunctionTool:
    """Create a LiveKit function tool that executes an automated 12-second voicemail drop and disconnects."""

    @function_tool
    async def leave_voicemail_tool(
        detected_reason: Annotated[
            str,
            "Reason for voicemail detection e.g. 'beep_detected', 'answering_machine_greeting', 'voicemail_prompt'",
        ] = "beep_detected",
    ) -> str:
        """Call this function IMMEDIATELY when an answering machine, voicemail greeting, or beep is detected on an outbound call."""
        lead_display = lead_name.strip() if lead_name and lead_name.strip() else "there"
        service_display = (
            service_requested.strip()
            if service_requested and service_requested.strip()
            else "your inquiry"
        )

        voicemail_message = (
            f"Hi {lead_display}, this is {config.agent_name} with {config.business} following up on your request for {service_display}. "
            f"Please give us a call back at your earliest convenience. Have a wonderful day!"
        )

        logger.info(
            "Voicemail drop triggered for lead '%s' (reason: %s). Speaking 12-second drop.",
            lead_display,
            detected_reason,
        )

        # Notify callback to record outcome as 'voicemail_left'
        if on_voicemail_dropped and callable(on_voicemail_dropped):
            try:
                on_voicemail_dropped("voicemail_left")
            except Exception as e:
                logger.debug("on_voicemail_dropped callback failed: %s", e)

        # Speak concise message without allowing interruptions (answering machine cannot interrupt)
        if livekit_session and hasattr(livekit_session, "say"):
            try:
                await livekit_session.say(voicemail_message, allow_interruptions=False)
            except Exception as e:
                logger.debug("Failed to speak voicemail drop: %s", e)

        # Disconnect call cleanly
        if room and hasattr(room, "disconnect"):
            try:
                await room.disconnect()
            except Exception as e:
                logger.debug("Room disconnect warning during voicemail drop: %s", e)

        return f"Voicemail drop completed: {detected_reason}. Call ended."

    return cast(FunctionTool, leave_voicemail_tool)
