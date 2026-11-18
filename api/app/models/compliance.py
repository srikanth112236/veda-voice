"""US Telephony Compliance Models (State Rules, Versioned Consent Texts, Platform Suppression)."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class StateRule(Base):
    """Per-state US calling window, frequency caps, and recording consent rules."""

    __tablename__ = "state_rules"

    state: Mapped[str] = mapped_column(String(2), primary_key=True)  # e.g. "FL", "OK", "CA"
    window_start: Mapped[str] = mapped_column(
        String(5), default="08:00", nullable=False
    )  # HH:MM local
    window_end: Mapped[str] = mapped_column(
        String(5), default="20:00", nullable=False
    )  # HH:MM local
    max_attempts_24h: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. 3 in OK
    requires_state_dnc: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    all_party_recording: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_disclosure_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConsentText(Base):
    """Versioned legal consent copy presented on web forms, widgets, and verbal agreements."""

    __tablename__ = "consent_texts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )  # null = global platform standard text
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped["Tenant | None"] = relationship("Tenant")


class PlatformSuppression(Base):
    """Platform-wide DND suppression list across all tenants for marketing categories (C and D)."""

    __tablename__ = "platform_suppressions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    reason: Mapped[str] = mapped_column(String(64), default="opt_out", nullable=False)
    source_tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
