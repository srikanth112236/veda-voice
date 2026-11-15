"""Database models for calendar integrations and customer appointment bookings."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class TenantIntegration(Base):
    """External provider integration credentials (e.g. Google Calendar OAuth)."""

    __tablename__ = "tenant_integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(
        String(32), default="google_calendar", nullable=False
    )  # google_calendar, calcom, internal
    status: Mapped[str] = mapped_column(
        String(32), default="connected", nullable=False
    )  # connected, expired, disconnected
    calendar_id: Mapped[str] = mapped_column(String(255), default="primary", nullable=False)
    encrypted_tokens: Mapped[str] = mapped_column(Text, default="", nullable=False)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship("Tenant", foreign_keys=[tenant_id])


class Booking(Base):
    """Confirmed customer appointment or held time slot."""

    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "start_at", name="uq_tenant_booking_start_slot"),
        Index("ix_bookings_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    call_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_type: Mapped[str] = mapped_column(
        String(128), default="general_appointment", nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="confirmed", nullable=False
    )  # held, confirmed, completed, cancelled, no_show, rescheduled
    calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meet_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(128), unique=True, index=True, nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship("Tenant", foreign_keys=[tenant_id])
