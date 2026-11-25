"""Call record models and CallStore storage interface (FileCallStore).

Persists one JSON file per call atomically to data/calls/<tenant_id>/<utc_timestamp>_<call_id>.json.
Adheres strictly to tenant isolation requirements.
"""

import json
import logging
import os
import re
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, Field

logger = logging.getLogger("receptionist.records")

# Safe characters for file names
_SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9_\-\.]")


class TranscriptEntry(BaseModel):
    """Single turn transcript entry."""

    role: str
    text: str
    time: str
    interrupted: bool = False
    latency_ms: float | None = None


class MessagePayload(BaseModel):
    """Payload collected by the take_message tool."""

    tenant_id: str = "default"
    name: str
    phone: str
    message: str
    urgency: str
    phone_confirmed: bool = True
    address: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())


class CallRecord(BaseModel):
    """Complete record of a phone conversation."""

    tenant_id: str = "default"
    call_id: str
    dialed_number: str
    caller_number: (
        str  # Full number for callback, kept strictly in data/calls/<tenant_id> (git-ignored)
    )
    started_at: str
    ended_at: str
    duration_s: float
    outcome: str  # message_taken, info_provided, ended_by_agent, abandoned, error
    message: MessagePayload | None = None
    message_history: list[MessagePayload] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    turn_count: int = 0
    latency_p50_ms: float = 0.0
    latency_p95_ms: float = 0.0
    eou_p50_ms: float = 0.0
    eou_p95_ms: float = 0.0
    ttft_p50_ms: float = 0.0
    ttft_p95_ms: float = 0.0
    ttfb_p50_ms: float = 0.0
    ttfb_p95_ms: float = 0.0
    turn_latencies_ms: list[float] = Field(default_factory=list)
    llm_prompt_tokens: int = 0
    llm_completion_tokens: int = 0
    tts_characters: int = 0
    recording_url: str | None = None
    recording_duration_s: float = 0.0
    recording_channels: int = 2
    recording_status: str = "not_recorded"
    transcript: list[TranscriptEntry] = Field(default_factory=list)


class CallStore(Protocol):
    """Interface for persisting call records."""

    def save_call_record(self, record: CallRecord, tenant_id: str | None = None) -> Path:
        """Persist a call record and return the path where it is saved."""
        ...


class FileCallStore:
    """Saves one JSON record per call atomically to disk under storage_dir/<tenant_id>/."""

    def __init__(self, storage_dir: Path | str = "data/calls") -> None:
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def save_call_record(self, record: CallRecord, tenant_id: str | None = None) -> Path:
        """Atomically write record to storage_dir/<tenant_id>/<utc_timestamp>_<sanitized_call_id>.json."""
        tid = tenant_id or record.tenant_id or "unassigned"
        safe_tid = _SAFE_FILENAME_PATTERN.sub("_", os.path.basename(tid))
        if not safe_tid or safe_tid.strip(".") == "":
            safe_tid = "unassigned"

        base_storage = self.storage_dir.resolve()
        target_dir = (self.storage_dir / safe_tid).resolve()

        # Enforce containment within storage_dir to eliminate any directory traversal attempt
        try:
            target_dir.relative_to(base_storage)
        except ValueError:
            raise ValueError(f"Path traversal detected in tenant identifier: {tid}") from None

        target_dir.mkdir(parents=True, exist_ok=True)

        timestamp_str = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        raw_id = record.call_id or "unknown"
        safe_id = _SAFE_FILENAME_PATTERN.sub("_", os.path.basename(raw_id))
        if not safe_id or safe_id.strip(".") == "":
            safe_id = "unknown"
        target_filename = f"{timestamp_str}_{safe_id}.json"
        target_path = target_dir / target_filename

        data = record.model_dump()
        payload = json.dumps(data, indent=2)

        # Write to temporary file in same directory and atomic replace
        with tempfile.NamedTemporaryFile(
            mode="w",
            dir=target_dir,
            delete=False,
            encoding="utf-8",
            suffix=".tmp",
        ) as tmp:
            tmp.write(payload)
            tmp_path = Path(tmp.name)

        os.replace(tmp_path, target_path)
        logger.info("Saved call record to %s for tenant %s", target_path, safe_tid)
        return target_path


def sync_call_record_to_api(
    record: CallRecord,
    call_token: str = "",
    api_base_url: str | None = None,
) -> bool:
    """Post completed CallRecord to the control plane /api/v1/internal/calls/complete.

    Persists call details, transcripts, latencies, and updates tenant subscription minutes.
    Falls back gracefully to in-process execution in testing environments.
    """
    import urllib.error
    import urllib.request

    targets: list[str] = []
    is_test = bool(os.getenv("PYTEST_CURRENT_TEST") or os.getenv("TESTING"))
    if api_base_url:
        targets.append(api_base_url.rstrip("/"))
    elif is_test:
        targets.append("http://127.0.0.1:8000")
    else:
        main_url = os.getenv("API_BASE_URL", "").rstrip("/")
        prod_url = os.getenv("PROD_API_URL", "").rstrip("/")
        # If PROD_API_URL is specified and main_url is localhost, prioritize prod_url to prevent slow fallback
        if prod_url:
            targets.append(prod_url)
        if main_url and main_url not in targets:
            targets.append(main_url)
        prod_fallback = "https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io"
        if prod_fallback not in targets:
            targets.append(prod_fallback)
        if not targets:
            targets.append("http://127.0.0.1:8000")

    # Ensure a valid token if not explicitly provided
    token = call_token
    if not token and record.tenant_id and record.tenant_id != "unassigned":
        try:
            from api.app.core.security import create_access_token

            token = create_access_token(
                {
                    "sub": "livekit-agent",
                    "role": "agent",
                    "tenant_id": record.tenant_id,
                    "call_id": record.call_id,
                }
            )
        except Exception:
            token = ""

    payload = {
        "call_id": record.call_id,
        "dialed_number": record.dialed_number,
        "caller_number": record.caller_number,
        "started_at": record.started_at,
        "ended_at": record.ended_at,
        "duration_s": record.duration_s,
        "outcome": record.outcome,
        "turn_count": record.turn_count,
        "latency_p50_ms": record.latency_p50_ms,
        "latency_p95_ms": record.latency_p95_ms,
        "eou_p50_ms": record.eou_p50_ms,
        "eou_p95_ms": record.eou_p95_ms,
        "ttft_p50_ms": record.ttft_p50_ms,
        "ttft_p95_ms": record.ttft_p95_ms,
        "ttfb_p50_ms": record.ttfb_p50_ms,
        "ttfb_p95_ms": record.ttfb_p95_ms,
        "turn_latencies_ms": record.turn_latencies_ms,
        "tags": record.tags,
        "llm_prompt_tokens": record.llm_prompt_tokens,
        "llm_completion_tokens": record.llm_completion_tokens,
        "tts_characters": record.tts_characters,
        "message": record.message.model_dump() if record.message else None,
        "transcript": [t.model_dump() for t in record.transcript],
    }

    synced_any = False
    for base_url in targets:
        url = f"{base_url}/api/v1/internal/calls/complete"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}" if token else "",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "LiveKit-Agent-Worker/1.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if resp.status == 200:
                    logger.info(
                        "Successfully synced call record %s to control plane API at %s",
                        record.call_id,
                        base_url,
                    )
                    synced_any = True
        except Exception as e:
            logger.debug(
                "HTTP call to %s failed (%s); trying fallback",
                url,
                e,
            )

    if synced_any:
        return True

    # In-process fallback when running in tests or within same Python interpreter
    try:
        from fastapi import BackgroundTasks

        from api.app.db.session import SessionLocal
        from api.app.routers.internal import (
            CallCompletionPayload,
            save_call_record_from_agent,
        )

        with SessionLocal() as db:
            bg = BackgroundTasks()
            auth_header = f"Bearer {token}" if token else None
            completion_payload = CallCompletionPayload.model_validate(payload)
            res = save_call_record_from_agent(
                payload=completion_payload,
                background_tasks=bg,
                authorization=auth_header,
                db=db,
            )
            if res.get("status") == "ok":
                logger.info("In-process synced call record %s to database", record.call_id)
                return True
    except Exception as inner_e:
        logger.warning("Failed to sync call record %s to live DB: %s", record.call_id, inner_e)

    return False
