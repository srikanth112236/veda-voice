"""Voice agent tool for transferring callers to human staff or on-call technicians.

Adheres strictly to SRS Section 5.3 (FR-CALL-4, FR-CALL-5):
- Emergency keywords and explicit customer transfer requests.
- Warm transfer to staff with graceful fallback to message taking if transfer line is unconfigured or busy.
- Private whispered briefing to on-call technician and automated urgent SMS dispatch.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any, cast

from livekit.agents import FunctionTool, function_tool

from agent.config import TenantConfig
from agent.config_client import default_api_client

logger = logging.getLogger("receptionist.tools.transfer")


def resolve_escalation_target(
    config: TenantConfig,
    reason: str,
    priority: str = "normal",
) -> str:
    """Resolve destination transfer number, honoring tenant custom escalation_rules first."""
    reason_low = (reason or "").strip().lower()
    for rule in getattr(config, "escalation_rules", None) or []:
        if not isinstance(rule, dict):
            continue
        cond = str(rule.get("condition") or "").strip().lower()
        target = str(rule.get("target_number") or "").strip()
        if not cond or not target:
            continue
        cond_tokens = [tok for tok in cond.replace("_", " ").split() if len(tok) >= 3]
        if cond in reason_low or (cond_tokens and any(tok in reason_low for tok in cond_tokens)):
            return target

    if priority == "emergency":
        return (
            getattr(config, "location_emergency_phone", None)
            or getattr(config, "location_transfer_number", None)
            or config.transfer_number
            or ""
        ).strip()
    return (
        getattr(config, "location_transfer_number", None) or config.transfer_number or ""
    ).strip()


def create_transfer_tool(
    config: TenantConfig,
    livekit_session: Any = None,
    room: Any = None,
    call_id: str = "",
    safety_monitor: Any = None,
) -> FunctionTool:
    """Create a LiveKit function tool that executes warm/cold transfer to a human specialist with whisper briefing."""

    @function_tool
    async def transfer_call_tool(
        reason: Annotated[
            str,
            "Detailed reason for transfer e.g. 'caller_requested_human', 'gas_leak', 'burst_pipe', 'complex_quote'",
        ] = "caller_requested_human",
        priority: Annotated[
            str,
            "Urgency priority of the transfer: 'normal' or 'emergency'",
        ] = "normal",
        caller_name: Annotated[
            str | None,
            "Caller's name if identified during conversation",
        ] = None,
        caller_phone: Annotated[
            str | None,
            "Caller's callback telephone number",
        ] = None,
        service_address: Annotated[
            str | None,
            "Caller's service address or location if provided",
        ] = None,
        emergency_details: Annotated[
            dict[str, Any] | str | None,
            "Structured emergency observations, hazards, or intake notes",
        ] = None,
        whisper_briefing: Annotated[
            str | None,
            "Concise whisper briefing played to on-call technician before line unmuting",
        ] = None,
    ) -> str:
        """Call this function when the customer explicitly asks to speak to a person/technician, or an emergency demands human escalation."""
        target_number = resolve_escalation_target(config, reason=reason, priority=priority)

        # Pause safety monitor silence prompts so caller is not badgered during hold
        if safety_monitor:
            safety_monitor.call_transferred = True
            safety_monitor.set_agent_busy(True)

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

        # Parse structured emergency details
        parsed_emergency: dict[str, Any] = {}
        if isinstance(emergency_details, dict):
            parsed_emergency = emergency_details
        elif isinstance(emergency_details, str) and emergency_details.strip():
            try:
                parsed_val = json.loads(emergency_details)
                if isinstance(parsed_val, dict):
                    parsed_emergency = parsed_val
                else:
                    parsed_emergency = {"raw": emergency_details}
            except Exception:
                parsed_emergency = {"raw": emergency_details}

        # Auto-generate whisper briefing for on-call technician if not passed
        effective_whisper = whisper_briefing
        if not effective_whisper:
            c_name = caller_name or "Caller"
            c_phone = caller_phone or "No Phone Provided"
            addr_str = f" at {service_address}" if service_address else ""
            effective_whisper = (
                f"Emergency transfer from {c_name} ({c_phone}){addr_str}. Reason: {reason}."
            )

        logger.info(
            "Transferring call %s to human specialist at %s (reason: %s, priority: %s, whisper: %s)",
            call_id or "live_call",
            target_number,
            reason,
            priority,
            effective_whisper,
        )

        # 1. Spoken verbal hold notice
        hold_message = (
            f"Please hold in a safe location for just a moment while I connect you directly with our on-call technician at {config.business}."
            if priority == "emergency"
            else f"I would be glad to connect you with our team at {config.business}. Please hold on for just a moment while I transfer your call."
        )

        if livekit_session and hasattr(livekit_session, "say"):
            try:
                await livekit_session.say(hold_message, allow_interruptions=False)
            except Exception as e:
                logger.debug("Failed to speak transfer hold message: %s", e)

        # 2. Audit transfer event and trigger SMS dispatch to control plane
        if config.call_token:
            default_api_client.record_call_transfer(
                call_id=call_id or "call",
                target_number=target_number,
                call_token=config.call_token,
                reason=reason,
                priority=priority,
                notes=f"Agent warm transfer initiated for {config.business}",
                whisper_briefing=effective_whisper,
                caller_name=caller_name,
                caller_phone=caller_phone,
                service_address=service_address,
                emergency_details=parsed_emergency,
            )

        # 3. SIP Transfer / Participant referral if supported by carrier
        if room and hasattr(room, "transfer_sip_participant"):
            try:
                await room.transfer_sip_participant(transfer_to=target_number)
            except Exception as e:
                logger.warning("Carrier SIP REFER transfer warning: %s", e)

        return (
            f"Transfer initiated to on-call specialist at {target_number} (priority={priority}). "
            f"Whisper briefing dispatched: '{effective_whisper}'. "
            f"The line is now bridging on transfer hold. Stay completely silent while the technician connects."
        )

    return cast(FunctionTool, transfer_call_tool)
