"""Database models for multi-staff technicians, skill profiles, and dispatch territories (Milestone M10b)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.booking import Booking
    from api.app.models.location import Location
    from api.app.models.tenant import Tenant


class StaffMember(Base):
    """Technician or staff resource eligible for appointment dispatch and multi-calendar scheduling."""

    __tablename__ = "staff_members"
    __table_args__ = (
        Index("ix_staff_tenant_active", "tenant_id", "is_active"),
        Index("ix_staff_tenant_last_assigned", "tenant_id", "last_assigned_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    location_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    role: Mapped[str] = mapped_column(
        String(64), default="technician", nullable=False
    )  # e.g., technician, master_plumber, hvac_specialist, estimator

    # Skills supported (e.g. ["drain_cleaning", "water_heater", "hvac_repair", "leak_detection"])
    skills: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Territory postal/zip codes served (e.g. ["78701", "78702", "787*"])
    service_territory_zips: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Calendar integration details
    calendar_provider: Mapped[str] = mapped_column(
        String(32), default="internal", nullable=False
    )  # internal, google_calendar, microsoft_outlook
    calendar_id: Mapped[str] = mapped_column(String(255), default="primary", nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Custom working hours override dict: {"monday": {"start": "08:00", "end": "17:00"}, ...}
    working_hours: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Priority weighting for round-robin (higher weight = more frequent assignment)
    priority_weight: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Round-robin dispatch tracking
    last_assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    location: Mapped[Location | None] = relationship("Location", back_populates="staff_members")
    bookings: Mapped[list[Booking]] = relationship("Booking", back_populates="staff")
