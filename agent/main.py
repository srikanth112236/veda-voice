"""LiveKit Voice Agent entrypoint for Milestones M1a, M1b & M1c-a."""

import asyncio
import logging
import os
import time
from datetime import UTC, datetime
from typing import Annotated, Any

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    AgentStateChangedEvent,
    CloseEvent,
    ConversationItemAddedEvent,
    JobContext,
    MetricsCollectedEvent,
    UserStateChangedEvent,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.agents.llm import ChatMessage
from livekit.agents.metrics import EOUMetrics, LLMMetrics, TTSMetrics
from livekit.plugins import silero

from agent.config import get_agent_settings, load_business_config
from agent.post_call import dispatch_post_call_notification
from agent.prompts import build_system_prompt
from agent.records import CallRecord, FileCallStore, TranscriptEntry
from agent.safety import SafetyMonitor, SystemClock
from agent.telemetry import LatencyTracker, parse_sip_attributes, redact_phone
from agent.tools.message import MessageCollector, create_take_message_tool

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

    # Session state collectors
    tracker = LatencyTracker()
    message_collector = MessageCollector()
    call_store = FileCallStore()

    call_started_at = datetime.now(UTC).isoformat()
    call_start_mono = time.monotonic()
    sip_info: dict[str, str] = {
        "caller_number": "",
        "dialed_number": "",
        "call_id": "",
    }
    transcript_log: list[TranscriptEntry] = []
    recorded_tags: set[str] = set()
    call_outcome: str = "abandoned"  # Default if closed before resolution
    call_record_written = False

    # Initialize take_message tool bound to this session's collector
    take_message_tool = create_take_message_tool(message_collector)

    # Initialize AgentSession with VAD and LiveKit Inference model strings
    session: AgentSession = AgentSession(
        stt=settings.stt_model,
        llm=settings.llm_model,
        tts=settings.tts_model,
        vad=silero.VAD.load(),
        user_away_timeout=10.0,  # LiveKit inactivity detection fires user_state_changed at 10s
    )

    # Safety Monitor (Inactivity prompts + max call length)
    clock = SystemClock()

    async def monitor_say(text: str) -> None:
        try:
            await session.say(text, allow_interruptions=True)
        except Exception as e:
            logger.warning("Failed to speak safety monitor message: %s", e)

    async def monitor_end_call(reason: str) -> None:
        nonlocal call_outcome
        call_outcome = "ended_by_agent"
        if reason == "silence_timeout":
            recorded_tags.add("silence_timeout")
        elif reason == "max_duration_exceeded":
            recorded_tags.add("max_duration_exceeded")
        try:
            await ctx.room.disconnect()
        except Exception:
            pass

    safety_monitor = SafetyMonitor(
        clock=clock,
        max_duration_seconds=float(config.max_call_duration_seconds),
        warn_duration_seconds=float(config.max_call_duration_seconds - 60),
        say_callback=monitor_say,
        end_call_callback=monitor_end_call,
    )

    # Background periodic tick task for safety monitor
    async def safety_tick_loop() -> None:
        while not safety_monitor.ended:
            try:
                await asyncio.sleep(1.0)
                await safety_monitor.check_step()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in safety monitor tick: %s", e)

    safety_task = asyncio.create_task(safety_tick_loop())

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
            current_eou_delay_ms = m.end_of_utterance_delay * 1000.0
            current_llm_ttft_ms = 0.0
            current_llm_calls_this_turn = 0
            safety_monitor.on_user_activity()
        elif isinstance(m, LLMMetrics):
            current_llm_calls_this_turn += 1
            if current_llm_ttft_ms == 0.0 and m.ttft > 0:
                current_llm_ttft_ms = m.ttft * 1000.0
        elif isinstance(m, TTSMetrics):
            if m.audio_duration <= 0 or m.characters_count == 0 or m.ttfb <= 0:
                return

            tts_ttfb_ms = m.ttfb * 1000.0
            pipeline_latency_ms = round(current_eou_delay_ms + current_llm_ttft_ms + tts_ttfb_ms, 2)

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

            current_eou_delay_ms = 0.0
            current_llm_ttft_ms = 0.0
            current_llm_calls_this_turn = 0

    @session.on("agent_state_changed")
    def on_agent_state_changed(event: AgentStateChangedEvent) -> None:
        """Pause safety silence timer while agent is speaking or thinking."""
        is_busy = event.new_state in ("speaking", "thinking")
        safety_monitor.set_agent_busy(is_busy)

    @session.on("user_state_changed")
    def on_user_state_changed(event: UserStateChangedEvent) -> None:
        """User state changed from speaking/listening/away."""
        if event.new_state in ("speaking", "listening"):
            safety_monitor.on_user_activity()

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: ConversationItemAddedEvent) -> None:
        """Record transcript entry and tags."""
        item = event.item
        if isinstance(item, ChatMessage):
            text_str = item.text_content or ""
            transcript_log.append(
                TranscriptEntry(
                    role=item.role,
                    text=text_str,
                    time=datetime.now(UTC).isoformat(),
                )
            )
            # Scan for emergency keywords or spam in text
            low = text_str.lower()
            for kw in config.emergency_keywords:
                if kw in low:
                    recorded_tags.add("emergency")
            if "spam" in low or "robocall" in low:
                recorded_tags.add("spam")

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        """Log incoming participant details with phone numbers redacted."""
        nonlocal sip_info
        sip_info = parse_sip_attributes(participant.attributes)
        message_collector.caller_id_phone = sip_info["caller_number"]
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

    def write_shutdown_call_record(close_reason: str = "") -> None:
        """Persist final CallRecord to data/calls/ upon any session termination."""
        nonlocal call_record_written, call_outcome
        if call_record_written:
            return
        call_record_written = True

        ended_at = datetime.now(UTC).isoformat()
        duration_s = round(time.monotonic() - call_start_mono, 2)
        summary = tracker.summary()

        # Determine outcome
        if message_collector.latest_message is not None:
            call_outcome = "message_taken"
            if message_collector.latest_message.urgency == "emergency":
                recorded_tags.add("emergency")
            elif message_collector.latest_message.urgency == "urgent":
                recorded_tags.add("urgent")
        elif "spam" in recorded_tags:
            call_outcome = "ended_by_agent"
        elif close_reason in ("error", "failed"):
            call_outcome = "error"
        elif call_outcome == "abandoned" and duration_s > 15.0 and len(transcript_log) > 2:
            call_outcome = "info_provided"

        def _clean_str(val: Any) -> str:
            return str(val) if isinstance(val, str | int | float) else ""

        safe_call_id = _clean_str(sip_info.get("call_id")) or _clean_str(room_name) or "call"
        safe_dialed = _clean_str(sip_info.get("dialed_number"))
        safe_caller = _clean_str(sip_info.get("caller_number"))

        record = CallRecord(
            call_id=safe_call_id,
            dialed_number=safe_dialed,
            caller_number=safe_caller,
            started_at=call_started_at,
            ended_at=ended_at,
            duration_s=duration_s,
            outcome=call_outcome,
            message=message_collector.latest_message,
            message_history=message_collector.history,
            tags=sorted(recorded_tags),
            turn_count=int(summary["turn_count"]),
            latency_p50_ms=float(summary["pipeline_median_ms"]),
            latency_p95_ms=float(summary["pipeline_p95_ms"]),
            turn_latencies_ms=tracker.pipeline_latencies_ms,
            transcript=transcript_log,
        )

        try:
            saved_path = call_store.save_call_record(record)
            logger.info("Call record successfully stored at %s", saved_path)
            dispatch_post_call_notification(record, config)
        except Exception as e:
            logger.error("Failed to write call record or dispatch alert: %s", e)

    @session.on("close")
    def on_session_close(event: CloseEvent) -> None:
        """Handle session termination and persist call record."""
        safety_task.cancel()
        reason_str = str(event.reason) if event.reason else ""
        if event.error is not None:
            reason_str = "error"
        write_shutdown_call_record(close_reason=reason_str)

    # Register async shutdown hook on JobContext
    async def on_job_shutdown() -> None:
        write_shutdown_call_record("shutdown")

    ctx.add_shutdown_callback(on_job_shutdown)

    await ctx.connect()

    # Pre-connected participant check
    for participant in ctx.room.remote_participants.values():
        attrs: Any = getattr(participant, "attributes", {})
        sip_info = parse_sip_attributes(attrs)
        message_collector.caller_id_phone = sip_info["caller_number"]
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

    prompt = build_system_prompt(
        config,
        caller_phone=sip_info["caller_number"],
    )

    @function_tool(
        description="End the phone call cleanly when conversation is complete, caller says goodbye, or caller asks to hang up."
    )
    async def end_call_tool(
        reason: Annotated[
            str, "Reason the call is ending (e.g. 'completed', 'caller_goodbye', 'spam')"
        ] = "completed",
    ) -> str:
        nonlocal call_outcome
        logger.info("end_call tool invoked: reason=%s", reason)
        call_outcome = reason

        async def _delayed_disconnect() -> None:
            await asyncio.sleep(2.0)
            try:
                await ctx.room.disconnect()
            except Exception:
                pass

        asyncio.create_task(_delayed_disconnect())
        return f"Call ended: {reason}"

    agent = Agent(
        instructions=prompt,
        tools=[end_call_tool, take_message_tool],
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
