"""LiveKit Voice Agent entrypoint for Milestones M1a & M1b."""

import logging
import os
import time
from typing import Annotated, Any

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    CloseEvent,
    JobContext,
    MetricsCollectedEvent,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.agents.metrics import EOUMetrics, TTSMetrics
from livekit.plugins import silero

from agent.config import get_agent_settings, load_business_config
from agent.prompts import build_system_prompt
from agent.telemetry import LatencyTracker, parse_sip_attributes, redact_phone

# Load local environment overrides first, then default environment file
load_dotenv(".env.local")
load_dotenv(".env")
logger = logging.getLogger("receptionist")

AGENT_NAME = "receptionist"


def get_agent_info() -> dict[str, str]:
    """Return basic agent metadata for verification."""
    config = load_business_config("default")
    return {
        "name": AGENT_NAME,
        "business": config.business,
        "status": "ready",
        "livekit_url": os.getenv("LIVEKIT_URL", "wss://<project>.livekit.cloud"),
    }


@function_tool(
    description="End the phone call cleanly when conversation is complete, caller says goodbye, or caller hangs up."
)
async def end_call(
    reason: Annotated[
        str, "Reason the call is ending (e.g. 'completed', 'caller_goodbye', 'spam')"
    ] = "completed",
) -> str:
    """End the call cleanly."""
    logger.info("end_call tool invoked: reason=%s", reason)
    return f"Call ended: {reason}"


async def entrypoint(ctx: JobContext) -> None:
    """Main worker entrypoint for LiveKit Agent session."""
    room_name = ctx.room.name
    logger.info("Starting receptionist agent in room %s", room_name)
    config = load_business_config("default")
    settings = get_agent_settings()
    prompt = build_system_prompt(config)

    # Initialize AgentSession with VAD and LiveKit Inference model strings
    session: AgentSession = AgentSession(
        stt=settings.stt_model,
        llm=settings.llm_model,
        tts=settings.tts_model,
        vad=silero.VAD.load(),
    )

    agent = Agent(
        instructions=prompt,
        tools=[end_call],
    )

    tracker = LatencyTracker()
    call_start_time = time.monotonic()
    pending_eou_delay_ms: float = 0.0

    @session.on("metrics_collected")
    def on_metrics_collected(event: MetricsCollectedEvent) -> None:
        """Track turn latency (end-of-speech to first audio frame)."""
        nonlocal pending_eou_delay_ms
        m = event.metrics
        if isinstance(m, EOUMetrics):
            # End of utterance detection delay in milliseconds
            pending_eou_delay_ms = m.end_of_utterance_delay * 1000.0
        elif isinstance(m, TTSMetrics):
            # Time to first byte of audio synthesized
            tts_ttfb_ms = m.ttfb * 1000.0
            turn_latency_ms = round(pending_eou_delay_ms + tts_ttfb_ms, 2)
            tracker.record_turn(turn_latency_ms)
            logger.info(
                "turn_latency_ms=%.2f (eou_ms=%.2f tts_ttfb_ms=%.2f speech_id=%s) [server-side pipeline latency, not including phone-network delay]",
                turn_latency_ms,
                pending_eou_delay_ms,
                tts_ttfb_ms,
                m.speech_id or "unknown",
            )
            # Reset pending EOU delay for next turn
            pending_eou_delay_ms = 0.0

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        """Log incoming participant details with phone numbers redacted."""
        sip_info = parse_sip_attributes(participant.attributes)
        caller_masked = redact_phone(sip_info["caller_number"])
        dialed_masked = redact_phone(sip_info["dialed_number"])
        logger.info(
            "Caller joined room %s: identity=%s caller=%s dialed=%s call_id=%s",
            room_name,
            participant.identity,
            caller_masked,
            dialed_masked,
            sip_info["call_id"] or "none",
        )

    @session.on("close")
    def on_session_close(event: CloseEvent) -> None:
        """Log call duration and end reason cleanly on termination."""
        duration_sec = round(time.monotonic() - call_start_time, 2)
        summary = tracker.summary()
        logger.info(
            "Call finished in room %s: duration=%.2fs reason=%s error=%s turns=%d latency_p50_ms=%.2f latency_p95_ms=%.2f",
            room_name,
            duration_sec,
            event.reason,
            event.error or "none",
            summary["count"],
            summary["median_ms"],
            summary["p95_ms"],
        )

    await ctx.connect()

    # If participant is already in room upon connect (standard in SIP dispatch), inspect attributes
    for participant in ctx.room.remote_participants.values():
        attrs: Any = getattr(participant, "attributes", {})
        sip_info = parse_sip_attributes(attrs)
        caller_masked = redact_phone(sip_info["caller_number"])
        dialed_masked = redact_phone(sip_info["dialed_number"])
        logger.info(
            "Pre-connected caller in room %s: identity=%s caller=%s dialed=%s call_id=%s",
            room_name,
            participant.identity,
            caller_masked,
            dialed_masked,
            sip_info["call_id"] or "none",
        )

    await session.start(agent, room=ctx.room)
    await session.say(config.greeting, allow_interruptions=True)


def main() -> None:
    """Run the LiveKit agent worker."""
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="receptionist",
        )
    )


if __name__ == "__main__":
    main()
