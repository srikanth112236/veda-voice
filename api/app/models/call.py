"""Call records and analytics database model."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.crm import Contact
    from api.app.models.location import Location
    from api.app.models.tenant import Tenant


class Call(Base):
    """Historical phone conversation record with telemetry and transcripts."""

    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    location_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    call_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    caller_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    dialed_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    direction: Mapped[str] = mapped_column(String(16), default="inbound", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_s: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    billable_minutes: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    llm_prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    llm_completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tts_characters: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_cogs_usd: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    outcome: Mapped[str] = mapped_column(String(64), default="abandoned", nullable=False)
    urgency: Mapped[str] = mapped_column(String(32), default="normal", nullable=False)
    turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_p50_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    latency_p95_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    eou_p50_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    eou_p95_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ttft_p50_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ttft_p95_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ttfb_p50_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ttfb_p95_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    turn_latencies_ms: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)
    transcript: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    message: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    recording_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    recording_duration_s: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    recording_channels: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    recording_status: Mapped[str] = mapped_column(
        String(32), default="not_recorded", nullable=False
    )
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    sentiment_label: Mapped[str] = mapped_column(String(32), default="neutral", nullable=False)
    lead_score: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    lost_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    key_objections: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    supervisor_whispers: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    barge_in_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    takeover_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    transfer_to_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    transferred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transferred_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    whisper_briefing: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_alert_dispatched: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    emergency_recipient_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    qa_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    qa_rubric: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    qa_flags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    csat_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    csat_rationale: Mapped[str | None] = mapped_column(String(512), nullable=True)
    qa_reviewed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    qa_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_followed_up: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="calls")
    location: Mapped["Location | None"] = relationship("Location", back_populates="calls")
    contact: Mapped["Contact | None"] = relationship("Contact", back_populates="calls")
