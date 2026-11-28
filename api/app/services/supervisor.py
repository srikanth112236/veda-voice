"""Real-Time Live Call Supervision, Barge-In & Human Handoff Engine.

Implements Milestone M7a per SRS Section 6.2 & SRS Addendum v1.1:
- Real-time WebSocket event streaming to supervisor console
- Supervisor whisper coaching injected into active conversation context
- Live barge-in conferencing and supervisor takeover
- SIP REFER / human specialist warm transfer fallback
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import WebSocket
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.models.call import Call
from api.app.models.crm import ContactTimelineEvent
from api.app.models.user import User

logger = logging.getLogger("vedavoice.services.supervisor")


class SupervisorConnectionManager:
    """In-memory active supervisor WebSocket connection and event dispatch hub."""

    def __init__(self) -> None:
        # Map of call_id -> set of active WebSockets
        self._call_subscribers: dict[str, set[WebSocket]] = {}
        # Map of tenant_id -> set of tenant-wide active WebSockets
        self._tenant_subscribers: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect_call(self, call_id: str, websocket: WebSocket) -> None:
        """Register a supervisor socket to receive live updates for a specific call."""
        await websocket.accept()
        if call_id not in self._call_subscribers:
            self._call_subscribers[call_id] = set()
        self._call_subscribers[call_id].add(websocket)
        logger.info("Supervisor connected to live call stream: %s", call_id)

    def disconnect_call(self, call_id: str, websocket: WebSocket) -> None:
        """Unregister supervisor socket from call stream."""
        if call_id in self._call_subscribers:
            self._call_subscribers[call_id].discard(websocket)
            if not self._call_subscribers[call_id]:
                del self._call_subscribers[call_id]
        logger.info("Supervisor disconnected from call stream: %s", call_id)

    async def _deliver_local(self, call_id: str, event_data: dict[str, Any]) -> None:
        subscribers = list(self._call_subscribers.get(call_id, []))
        if not subscribers:
            return

        dead_sockets: list[WebSocket] = []
        for ws in subscribers:
            try:
                await ws.send_json(event_data)
            except Exception as err:
                logger.warning("Failed to send to supervisor websocket: %s", err)
                dead_sockets.append(ws)

        for dead in dead_sockets:
            self.disconnect_call(call_id, dead)

    async def broadcast_call_event(self, call_id: str, event_data: dict[str, Any]) -> None:
        """Broadcast live event to local sockets and Redis pub/sub channel when configured."""
        if settings.REDIS_URL:
            try:
                import importlib

                redis_async = importlib.import_module("redis.asyncio")
                client = redis_async.from_url(settings.REDIS_URL)
                try:
                    await client.publish(
                        f"vedavoice:call:{call_id}",
                        json.dumps(event_data, default=str),
                    )
                finally:
                    await client.aclose()
            except Exception as err:
                logger.debug("Redis pub/sub publish skipped (%s); falling back to local", err)

        await self._deliver_local(call_id, event_data)


supervisor_manager = SupervisorConnectionManager()


def handle_supervisor_action(
    db: Session,
    call: Call,
    action: str,
    payload: dict[str, Any],
    user: User,
) -> dict[str, Any]:
    """Execute supervisor intervention (whisper, barge_in, takeover, transfer) atomically."""
    now = datetime.now(UTC)
    norm_action = action.lower().strip()

    from api.app.services.audit import log_action_for_user

    log_action_for_user(
        db,
        user,
        action=f"supervisor.{norm_action}",
        resource_type="call",
        resource_id=call.call_id,
        tenant_id=call.tenant_id,
        details=payload or {},
    )

    if norm_action == "whisper":
        instruction = payload.get("instruction", "").strip()
        if not instruction:
            raise ValueError("Instruction is required for whisper action.")

        whispers = list(call.supervisor_whispers or [])
        new_whisper = {
            "timestamp": now.isoformat(),
            "supervisor_id": user.id,
            "supervisor_email": user.email,
            "instruction": instruction,
        }
        whispers.append(new_whisper)
        call.supervisor_whispers = whispers
        db.commit()

        event = {
            "event": "whisper_dispatched",
            "call_id": call.call_id,
            "whisper": new_whisper,
            "total_whispers": len(whispers),
        }
        return {"status": "success", "action": "whisper", "data": event}

    elif norm_action == "barge_in":
        desired_state = payload.get("active") if "active" in payload else (not call.barge_in_active)
        call.barge_in_active = bool(desired_state)
        db.commit()

        event = {
            "event": "barge_in_activated" if call.barge_in_active else "barge_in_deactivated",
            "call_id": call.call_id,
            "supervisor_id": user.id,
            "supervisor_email": user.email,
            "barge_in_active": call.barge_in_active,
            "timestamp": now.isoformat(),
        }
        return {"status": "success", "action": "barge_in", "data": event}

    elif norm_action == "takeover":
        call.takeover_active = True
        call.outcome = "supervisor_takeover"
        db.commit()

        event = {
            "event": "takeover_activated",
            "call_id": call.call_id,
            "supervisor_id": user.id,
            "supervisor_email": user.email,
            "timestamp": now.isoformat(),
        }
        return {"status": "success", "action": "takeover", "data": event}

    elif norm_action == "transfer":
        transfer_to = payload.get("transfer_to") or payload.get("phone_number")
        if not transfer_to:
            raise ValueError("Transfer destination number is required.")

        reason = payload.get("reason", "supervisor_manual_transfer")
        call.outcome = "transferred"
        call.transfer_to_number = transfer_to
        call.transferred_at = now
        call.transferred_by = user.id

        # Update contact timeline if contact exists
        if call.contact_id:
            timeline_event = ContactTimelineEvent(
                tenant_id=call.tenant_id,
                contact_id=call.contact_id,
                event_type="call_transferred",
                title="Call Transferred to Human Specialist",
                description=f"Transferred to {transfer_to}. Reason: {reason}.",
                payload={
                    "call_id": call.call_id,
                    "transferred_by": user.id,
                    "transfer_to": transfer_to,
                    "reason": reason,
                },
            )
            db.add(timeline_event)

        db.commit()

        event = {
            "event": "call_transferred",
            "call_id": call.call_id,
            "transfer_to": transfer_to,
            "reason": reason,
            "transferred_by": user.email,
            "timestamp": now.isoformat(),
        }
        return {"status": "success", "action": "transfer", "data": event}

    elif norm_action == "listen":
        event = {
            "event": "supervisor_listening",
            "call_id": call.call_id,
            "supervisor_id": user.id,
            "timestamp": now.isoformat(),
        }
        return {"status": "success", "action": "listen", "data": event}

    else:
        raise ValueError(
            f"Unsupported supervisor action '{action}'. Valid: listen, whisper, barge_in, takeover, transfer."
        )
