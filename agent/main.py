"""LiveKit Voice Agent entrypoint for Milestones M1a, M1b, M1c & M2-lite."""

import asyncio
import json
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

from agent.config import get_agent_settings, load_business_config, resolve_tenant
from agent.config_client import default_api_client
from agent.post_call import dispatch_post_call_notification
from agent.prompts import build_outbound_system_prompt, build_system_prompt
from agent.records import CallRecord, FileCallStore, TranscriptEntry, sync_call_record_to_api
from agent.safety import SafetyMonitor, SystemClock
from agent.telemetry import LatencyTracker, parse_sip_attributes, redact_phone
from agent.tools.booking import create_booking_tools
from agent.tools.knowledge import create_knowledge_tools
from agent.tools.message import MessageCollector, create_take_message_tool
from agent.tools.opt_out import create_opt_out_tool
from agent.tools.transfer import create_transfer_tool
from agent.tools.voicemail import create_voicemail_tool

# Load local environment overrides first, then default environment file
load_dotenv(".env.local")
load_dotenv(".env")
logger = logging.getLogger("receptionist")

AGENT_NAME = "receptionist"


def get_agent_info(dialed_number: str = "") -> dict[str, str]:
    """Return basic agent metadata for verification."""
    config = resolve_tenant(dialed_number) if dialed_number else load_business_config("default")
    return {
        "name": AGENT_NAME,
        "tenant_id": config.tenant_id,
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
    """Main worker entrypoint for LiveKit Agent session with multi-tenant resolution."""
    room_name = ctx.room.name
    logger.info("Starting receptionist agent in room %s", room_name)
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

    # Check pre-connected participant attributes if available
    attrs: dict[str, Any] = {}
    for participant in ctx.room.remote_participants.values():
        attrs = getattr(participant, "attributes", {}) or {}
        sip_info = parse_sip_attributes(attrs)
        break

    # Resolve tenant config from dialed number or participant attributes
    dialed_number = (
        sip_info["dialed_number"]
        or (attrs.get("dialed_number") if isinstance(attrs, dict) else "")
        or (attrs.get("phone_number") if isinstance(attrs, dict) else "")
    )
    tenant_hint = attrs.get("tenant_id") if isinstance(attrs, dict) else ""

    if dialed_number:
        config = resolve_tenant(dialed_number)
    elif tenant_hint:
        try:
            config = load_business_config(tenant_hint)
        except Exception:
            config = load_business_config("default")
    else:
        logger.info(
            "Direct session without dialed number; defaulting to active business config (Apex Plumbing)"
        )
        config = load_business_config("default")

    message_collector.tenant_id = config.tenant_id
    message_collector.caller_id_phone = sip_info["caller_number"]
    logger.info(
        "Resolved tenant '%s' (%s) for dialed number '%s'",
        config.tenant_id,
        config.business,
        redact_phone(dialed_number or config.numbers[0] if config.numbers else "[default]"),
    )

    # Distributed HTTP call-start handshake (capacity check, quota gate, and call token)
    start_handshake = default_api_client.start_call_session(
        dialed_number=dialed_number or (config.numbers[0] if config.numbers else ""),
        caller_number=sip_info.get("caller_number", ""),
        call_id=room_name or sip_info.get("call_id") or "call",
    )
    if start_handshake and start_handshake.get("allow") is False:
        rejection_msg = (
            start_handshake.get("message")
            or f"All lines for {config.business} are currently busy. We have recorded your call and our coordinator will reach out to you shortly in a few minutes. Goodbye!"
        )
        logger.warning(
            "Call rejected by control plane for tenant '%s': reason=%s message=%s",
            config.tenant_id,
            start_handshake.get("reason"),
            rejection_msg,
        )
        try:
            # Connect briefly to speak the busy callback notice before terminating call
            await ctx.connect()
            busy_session: AgentSession = AgentSession(tts=settings.tts_model)
            await busy_session.start(room=ctx.room, agent=Agent(instructions=""))
            await busy_session.say(rejection_msg, allow_interruptions=False)
            await asyncio.sleep(0.5)
        except Exception as e:
            logger.warning("Could not speak rejection notice: %s", e)
        try:
            await ctx.room.disconnect()
        except Exception:
            pass
        return

    if start_handshake and start_handshake.get("call_token"):
        config.call_token = start_handshake["call_token"]
    if start_handshake and start_handshake.get("config"):
        raw_cfg = start_handshake["config"]
        if isinstance(raw_cfg, dict):
            if "max_call_duration_seconds" in raw_cfg:
                config.max_call_duration_seconds = raw_cfg["max_call_duration_seconds"]
            if raw_cfg.get("location_id"):
                config.location_id = raw_cfg["location_id"]
                config.location_name = raw_cfg.get("location_name")
                config.location_city = raw_cfg.get("location_city")
                if raw_cfg.get("location_hours"):
                    config.hours = raw_cfg["location_hours"]
            if raw_cfg.get("industry_pack_slug"):
                config.industry_pack_slug = raw_cfg["industry_pack_slug"]
            if raw_cfg.get("industry_pack_prompt"):
                config.industry_pack_prompt = raw_cfg["industry_pack_prompt"]

    # Fallback local signed token generation for local dev / direct dispatch
    if not config.call_token:
        try:
            from api.app.core.security import create_access_token

            config.call_token = create_access_token(
                {
                    "sub": "livekit-agent",
                    "role": "agent",
                    "tenant_id": config.tenant_id,
                    "call_id": sip_info.get("call_id") or room_name or "call",
                }
            )
            logger.info("Generated local signed call token for tenant '%s'", config.tenant_id)
        except Exception as e:
            logger.warning("Could not generate fallback local call token: %s", e)

    # Initialize take_message tool bound to this session's collector
    take_message_tool = create_take_message_tool(message_collector)

    # Initialize AgentSession with tuned VAD and LiveKit Inference model strings
    session: AgentSession = AgentSession(
        stt=settings.stt_model,
        llm=settings.llm_model,
        tts=settings.tts_model,
        vad=silero.VAD.load(
            min_silence_duration=settings.vad_min_silence_duration,
            prefix_padding_duration=settings.vad_prefix_padding_duration,
        ),
        user_away_timeout=10.0,
    )

    # Safety Monitor (Inactivity prompts + max call length)
    clock = SystemClock()

    async def monitor_say(text: str) -> None:
        # Avoid speaking silence warning over active user speech
        if getattr(session, "user_state", None) == "speaking":
            safety_monitor.on_user_activity()
            return
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

    max_dur = float(config.max_call_duration_seconds)
    warn_dur = max(30.0, max_dur - 60.0) if max_dur > 60.0 else (max_dur + 1.0)
    safety_monitor = SafetyMonitor(
        clock=clock,
        max_duration_seconds=max_dur,
        warn_duration_seconds=warn_dur,
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
            p_tok = getattr(m, "prompt_tokens", 0) or 0
            c_tok = getattr(m, "completion_tokens", 0) or 0
            tracker.record_tokens(p_tok, c_tok)
        elif isinstance(m, TTSMetrics):
            chars_cnt = getattr(m, "characters_count", 0) or 0
            tracker.record_tts_characters(chars_cnt)
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
                eou_delay_ms=current_eou_delay_ms,
                llm_ttft_ms=current_llm_ttft_ms,
                tts_ttfb_ms=tts_ttfb_ms,
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
        """Record transcript entry and broadcast live turn to supervisors in real time."""
        nonlocal call_outcome
        item = event.item
        if isinstance(item, ChatMessage):
            text_str = item.text_content or ""
            entry_time = datetime.now(UTC).isoformat()
            transcript_log.append(
                TranscriptEntry(
                    role=item.role,
                    text=text_str,
                    time=entry_time,
                )
            )

            # 1. Publish real-time turn packet over LiveKit room data channel
            try:
                data_packet = json.dumps(
                    {
                        "type": "transcript_turn",
                        "call_id": room_name,
                        "role": item.role,
                        "text": text_str,
                        "time": entry_time,
                    }
                ).encode("utf-8")
                asyncio.create_task(
                    ctx.room.local_participant.publish_data(data_packet, reliable=True)
                )
            except Exception as d_err:
                logger.debug("LiveKit data channel publish notice: %s", d_err)

            # 2. Asynchronously notify control plane API for database sync and WebSocket streaming
            canonical_call_id = sip_info.get("call_id") or room_name
            api_base = getattr(default_api_client, "base_url", None)
            if api_base:

                async def _sync_turn_to_api(t_role: str, t_text: str, t_time: str) -> None:
                    try:
                        import urllib.request

                        turn_body = json.dumps(
                            {
                                "call_id": canonical_call_id,
                                "role": t_role,
                                "text": t_text,
                                "time": t_time,
                            }
                        ).encode("utf-8")
                        req = urllib.request.Request(
                            f"{api_base}/api/v1/internal/calls/{canonical_call_id}/turn",
                            data=turn_body,
                            headers={
                                "Content-Type": "application/json",
                                "Accept": "application/json",
                            },
                            method="POST",
                        )
                        urllib.request.urlopen(req, timeout=1.5)
                    except Exception as s_err:
                        logger.debug("Turn API broadcast notice: %s", s_err)

                asyncio.create_task(_sync_turn_to_api(item.role, text_str, entry_time))

            # Auto-disconnect watchdog: when assistant delivers goodbye, cleanly terminate room after TTS finishes
            if item.role in ("assistant", "agent"):
                low_text = text_str.lower()
                goodbye_triggers = (
                    "goodbye",
                    "good-bye",
                    "have a great day",
                    "have a wonderful day",
                    "bye now",
                )
                if any(trigger in low_text for trigger in goodbye_triggers):
                    if call_outcome not in ("spam", "transferred"):
                        call_outcome = "completed"
                    logger.info(
                        "Assistant delivered goodbye closing phrase; scheduling graceful room disconnect in 2.5s"
                    )

                    async def _delayed_goodbye_disconnect() -> None:
                        await asyncio.sleep(2.5)
                        try:
                            await ctx.room.disconnect()
                        except Exception as disc_err:
                            logger.debug("Delayed goodbye disconnect notice: %s", disc_err)

                    asyncio.create_task(_delayed_goodbye_disconnect())

            # Scan for emergency keywords or spam in text
            low = text_str.lower()
            for kw in config.emergency.keywords:
                if kw in low:
                    recorded_tags.add("emergency")
            if "spam" in low or "robocall" in low:
                recorded_tags.add("spam")

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        """Log incoming participant details with phone numbers redacted and resolve tenant."""
        nonlocal sip_info, config
        sip_info = parse_sip_attributes(participant.attributes)
        config = resolve_tenant(sip_info["dialed_number"])
        message_collector.tenant_id = config.tenant_id
        message_collector.caller_id_phone = sip_info["caller_number"]
        caller_masked = redact_phone(sip_info["caller_number"])
        dialed_masked = redact_phone(sip_info["dialed_number"])
        logger.info(
            "Caller joined room %s: identity=%s caller=%s dialed=%s call_id=%s tenant=%s",
            room_name,
            participant.identity,
            caller_masked,
            dialed_masked,
            sip_info["call_id"] or "none",
            config.tenant_id,
        )

    @ctx.room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket) -> None:
        """Handle real-time data channel messages including supervisor whisper coaching."""
        try:
            raw_data = data_packet.data.decode("utf-8")
            payload = json.loads(raw_data)
        except Exception:
            return

        msg_type = payload.get("type") or payload.get("action")
        if msg_type in ("supervisor_whisper", "whisper"):
            instruction = payload.get("instruction", "").strip()
            if instruction:
                supervisor_tag = payload.get("supervisor_email") or "Supervisor"
                logger.info(
                    "Received supervisor whisper from %s in room %s: '%s'",
                    supervisor_tag,
                    room_name,
                    instruction,
                )
                try:
                    coaching_text = (
                        f'[SUPERVISOR COACHING WHISPER from {supervisor_tag}]: "{instruction}". '
                        "Adopt this coaching immediately in your next response to the caller."
                    )
                    session.history.add_message(role="system", content=coaching_text)
                    logger.info("Supervisor whisper successfully injected into LLM chat context.")
                except Exception as ctx_err:
                    logger.warning(
                        "Failed to inject supervisor whisper into chat context: %s", ctx_err
                    )

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant) -> None:
        """Trigger immediate session disconnect when caller hangs up."""
        caller_identity = getattr(participant, "identity", "")
        logger.info("Participant disconnected: %s from room %s", caller_identity, room_name)
        # Check if any non-agent callers remain
        remaining_callers = [
            p
            for p in ctx.room.remote_participants.values()
            if not getattr(p, "identity", "").startswith("agent-")
            and not getattr(p, "identity", "").startswith("supervisor-")
            and getattr(p, "identity", "") != caller_identity
        ]
        if not remaining_callers:
            logger.info(
                "All remote callers left room %s. Disconnecting session cleanly.", room_name
            )
            asyncio.create_task(ctx.room.disconnect())

    def write_shutdown_call_record(close_reason: str = "") -> None:
        """Persist final CallRecord to data/calls/<tenant_id>/ upon any session termination."""
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

        # Canonical call_id matches the room_name registered during /calls/start
        safe_call_id = _clean_str(room_name) or _clean_str(sip_info.get("call_id")) or "call"
        if sip_info.get("call_id"):
            recorded_tags.add(f"sip_call_id:{sip_info['call_id']}")
        safe_dialed = _clean_str(sip_info.get("dialed_number"))
        safe_caller = _clean_str(sip_info.get("caller_number"))

        record = CallRecord(
            tenant_id=config.tenant_id,
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
            llm_prompt_tokens=int(summary.get("prompt_tokens", 0)),
            llm_completion_tokens=int(summary.get("completion_tokens", 0)),
            tts_characters=int(summary.get("tts_characters", 0)),
            transcript=transcript_log,
        )

        try:
            saved_path = call_store.save_call_record(record, tenant_id=config.tenant_id)
            logger.info(
                "Call record successfully stored at %s for tenant %s", saved_path, config.tenant_id
            )
            # Sync call record and billable minutes to live PostgreSQL database immediately
            synced = sync_call_record_to_api(record, config.call_token)
            logger.info("Call record API sync result: %s for call_id=%s", synced, record.call_id)
            # Dispatch post-call notification asynchronously so teardown does not block
            asyncio.create_task(asyncio.to_thread(dispatch_post_call_notification, record, config))
        except Exception as e:
            logger.error("Failed to write call record: %s", e)

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
        attrs = getattr(participant, "attributes", {}) or {}
        sip_info = parse_sip_attributes(attrs)
        p_dialed = (
            sip_info["dialed_number"]
            or (attrs.get("dialed_number") if isinstance(attrs, dict) else "")
            or (attrs.get("phone_number") if isinstance(attrs, dict) else "")
        )
        p_tenant = attrs.get("tenant_id") if isinstance(attrs, dict) else ""
        if p_dialed:
            config = resolve_tenant(p_dialed)
        elif p_tenant:
            try:
                config = load_business_config(p_tenant)
            except Exception:
                config = load_business_config("default")
        else:
            config = load_business_config("default")

        message_collector.tenant_id = config.tenant_id
        message_collector.caller_id_phone = sip_info["caller_number"]
        caller_masked = redact_phone(sip_info["caller_number"])
        dialed_masked = redact_phone(
            p_dialed or (config.numbers[0] if config.numbers else "[default]")
        )
        logger.info(
            "Pre-connected caller in room %s: identity=%s caller=%s dialed=%s call_id=%s tenant=%s",
            room_name,
            participant.identity,
            caller_masked,
            dialed_masked,
            sip_info["call_id"] or "none",
            config.tenant_id,
        )
        break

    # Check if outbound speed-to-lead call
    metadata_raw = getattr(ctx.job, "metadata", "") or ""
    outbound_meta: dict[str, Any] = {}
    if metadata_raw:
        try:
            outbound_meta = json.loads(metadata_raw)
        except Exception:
            pass

    is_outbound = (
        room_name.startswith("out-")
        or outbound_meta.get("direction") == "outbound"
        or outbound_meta.get("purpose") == "call_triage"
    )

    if is_outbound:
        prompt = build_outbound_system_prompt(
            config,
            lead_name=str(
                outbound_meta.get("caller_name") or outbound_meta.get("lead_name") or "there"
            ),
            service_requested=str(
                outbound_meta.get("service_requested") or "your requested service"
            ),
            source=str(outbound_meta.get("source") or "online inquiry"),
            caller_phone=sip_info["caller_number"],
        )
    else:
        prompt = build_system_prompt(
            config,
            caller_phone=sip_info["caller_number"],
        )

    @function_tool(
        description="Mandatory tool to cleanly disconnect and terminate the phone call when conversation is finished, caller says goodbye, or caller says that is all they need."
    )
    async def end_call_tool(
        reason: Annotated[
            str, "Reason the call is ending (e.g. 'completed', 'caller_goodbye', 'spam')"
        ] = "completed",
    ) -> str:
        nonlocal call_outcome
        logger.info("end_call tool invoked: reason=%s", reason)
        call_outcome = reason

        async def _graceful_tool_disconnect() -> None:
            await asyncio.sleep(2.0)
            try:
                await ctx.room.disconnect()
            except Exception:
                pass

        asyncio.create_task(_graceful_tool_disconnect())
        return f"Call ended cleanly: {reason}"

    # Tools enabled per tenant config
    active_tools: list[Any] = [end_call_tool]
    if "take_message" in config.tools_enabled:
        active_tools.append(take_message_tool)

    # Attach calendar booking tools if booking is enabled
    if any(
        b in config.tools_enabled
        for b in ("booking", "book_appointment", "check_availability", "calendar")
    ):
        if config.call_token:
            booking_tools = create_booking_tools(
                config.call_token,
                caller_phone=sip_info.get("caller_number", ""),
            )
            active_tools.extend(booking_tools)

    # Attach knowledge base RAG tool (Milestone M10a)
    if config.call_token:
        knowledge_tools = create_knowledge_tools(config.call_token)
        active_tools.extend(knowledge_tools)

    # Attach opt-out tool for DNC compliance if call token is available
    if config.call_token:
        opt_out_tool = create_opt_out_tool(
            call_token=config.call_token,
            phone_number=sip_info.get("caller_number", ""),
        )
        active_tools.append(opt_out_tool)

    # Attach human transfer tool if configured or enabled
    if bool(config.transfer_number) or ("transfer" in config.tools_enabled):
        transfer_tool = create_transfer_tool(
            config=config,
            livekit_session=session,
            room=ctx.room,
            call_id=sip_info.get("call_id") or room_name,
            safety_monitor=safety_monitor,
        )
        active_tools.append(transfer_tool)

    # Attach automated voicemail drop tool for outbound calls
    if is_outbound:

        def _set_voicemail_outcome(outcome_val: str) -> None:
            nonlocal call_outcome
            call_outcome = outcome_val

        vm_tool = create_voicemail_tool(
            config=config,
            livekit_session=session,
            room=ctx.room,
            lead_name=str(
                outbound_meta.get("caller_name") or outbound_meta.get("lead_name") or "there"
            ),
            service_requested=str(
                outbound_meta.get("service_requested") or "your requested service"
            ),
            on_voicemail_dropped=_set_voicemail_outcome,
        )
        active_tools.append(vm_tool)

    # Initialize Voice Agent
    agent = Agent(
        instructions=prompt,
        tools=active_tools,
    )

    # Start session with greeting
    await session.start(
        room=ctx.room,
        agent=agent,
    )

    greeting_text = config.greeting
    if config.recording_disclosure and "recorded" not in greeting_text.lower():
        greeting_text = f"This call may be recorded for quality assurance. {greeting_text}"

    logger.info("Speaking greeting for tenant '%s': '%s'", config.tenant_id, greeting_text)
    await session.say(greeting_text, allow_interruptions=True)


def run_app() -> None:
    """CLI runner for LiveKit agent."""
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=AGENT_NAME,
        )
    )


if __name__ == "__main__":
    run_app()
