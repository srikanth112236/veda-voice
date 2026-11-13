"""Call records and analytics database model."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class Call(Base):
    """Historical phone conversation record with telemetry and transcripts."""

    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    call_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    caller_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    dialed_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_s: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    outcome: Mapped[str] = mapped_column(String(64), default="abandoned", nullable=False)
    urgency: Mapped[str] = mapped_column(String(32), default="normal", nullable=False)
    turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    latency_p50_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    latency_p95_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    turn_latencies_ms: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)
    transcript: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    message: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="calls")
