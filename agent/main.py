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
    ConversationItemAddedEvent,
    JobContext,
    MetricsCollectedEvent,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.agents.llm import ChatMessage
from livekit.agents.metrics import EOUMetrics, LLMMetrics, TTSMetrics
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

    # Per-turn metric accumulator state
    current_eou_delay_ms: float = 0.0
    current_llm_ttft_ms: float = 0.0
    current_llm_calls_this_turn: int = 0

    @session.on("metrics_collected")
    def on_metrics_collected(event: MetricsCollectedEvent) -> None:
        """Track turn stages: EOU delay, LLM TTFT, and TTS TTFB."""
        nonlocal current_eou_delay_ms, current_llm_ttft_ms, current_llm_calls_this_turn
        m = event.metrics
        if isinstance(m, EOUMetrics):
            # End of utterance detection delay in milliseconds
            current_eou_delay_ms = m.end_of_utterance_delay * 1000.0
            # Reset LLM call tracking for this incoming turn
            current_llm_ttft_ms = 0.0
            current_llm_calls_this_turn = 0
        elif isinstance(m, LLMMetrics):
            # Record LLM invocation and time to first token
            current_llm_calls_this_turn += 1
            if current_llm_ttft_ms == 0.0 and m.ttft > 0:
                current_llm_ttft_ms = m.ttft * 1000.0
        elif isinstance(m, TTSMetrics):
            # Skip turns that produce no speech or have invalid audio
            if m.audio_duration <= 0 or m.characters_count == 0 or m.ttfb <= 0:
                return

            tts_ttfb_ms = m.ttfb * 1000.0
            # Sum full pipeline latency: EOU + LLM TTFT + TTS TTFB
            pipeline_latency_ms = round(current_eou_delay_ms + current_llm_ttft_ms + tts_ttfb_ms, 2)

            # Retrieve library's calculated e2e_latency if present on early assistant metrics
            lib_e2e_ms: float | None = None
            early_metrics = getattr(session, "_early_assistant_metrics", None)
            if (
                isinstance(early_metrics, dict)
                and "e2e_latency" in early_metrics
                and early_metrics["e2e_latency"] is not None
            ):
                lib_e2e_ms = round(float(early_metrics["e2e_latency"]) * 1000.0, 2)

            llm_calls = max(1, current_llm_calls_this_turn)
            tracker.record_turn(
                pipeline_latency_ms=pipeline_latency_ms,
                library_e2e_ms=lib_e2e_ms,
                llm_calls=llm_calls,
            )

            logger.info(
                "turn_latency_ms=%.2f pipeline_latency_ms=%.2f e2e_latency_ms=%s (eou_ms=%.2f ttft_ms=%.2f tts_ttfb_ms=%.2f llm_calls=%d speech_id=%s) [server-side pipeline latency (EOU + LLM TTFT + TTS TTFB), not including phone-network delay]",
                pipeline_latency_ms,
                pipeline_latency_ms,
                f"{lib_e2e_ms:.2f}" if lib_e2e_ms is not None else "none",
                current_eou_delay_ms,
                current_llm_ttft_ms,
                tts_ttfb_ms,
                llm_calls,
                m.speech_id or "unknown",
            )

            # Reset turn tracking for the next utterance
            current_eou_delay_ms = 0.0
            current_llm_ttft_ms = 0.0
            current_llm_calls_this_turn = 0

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: ConversationItemAddedEvent) -> None:
        """Inspect assistant conversation items to log library e2e latency if available."""
        item = event.item
        if isinstance(item, ChatMessage) and item.role == "assistant":
            m = getattr(item, "metrics", {}) or {}
            if "e2e_latency" in m and m["e2e_latency"] is not None:
                e2e_val_ms = round(float(m["e2e_latency"]) * 1000.0, 2)
                logger.info(
                    "assistant_speech_finalized: speech_id=%s e2e_ms=%.2f chars=%d",
                    item.id,
                    e2e_val_ms,
                    len(item.text_content or ""),
                )

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
            "Call finished in room %s: duration=%.2fs reason=%s error=%s turns=%d llm_calls=%d pipe_p50_ms=%.2f pipe_p95_ms=%.2f e2e_p50_ms=%.2f e2e_p95_ms=%.2f",
            room_name,
            duration_sec,
            event.reason,
            event.error or "none",
            summary["turn_count"],
            summary["total_llm_calls"],
            summary["pipeline_median_ms"],
            summary["pipeline_p95_ms"],
            summary["e2e_median_ms"],
            summary["e2e_p95_ms"],
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
