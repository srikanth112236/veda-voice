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
    turn_latencies_ms: list[float] = Field(default_factory=list)
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
