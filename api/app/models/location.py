"""Database models for Multi-Location Tenant Architecture (Milestone M11, FR-LOC-1 to 6)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.booking import Booking
    from api.app.models.call import Call
    from api.app.models.staff import StaffMember
    from api.app.models.tenant import PhoneNumber, Tenant


class Location(Base):
    """Physical branch, store, clinic, or dispatch service territory of a tenant."""

    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_tenant_location_code"),
        Index("ix_locations_tenant_active", "tenant_id", "is_active"),
        Index("ix_locations_tenant_postal", "tenant_id", "postal_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # e.g., "AUSTIN_NORTH", "DOWNTOWN"

    # Address & Contact details
    address_line1: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    address_line2: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    state: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    postal_code: Mapped[str] = mapped_column(String(16), default="", nullable=False, index=True)
    country: Mapped[str] = mapped_column(String(16), default="US", nullable=False)

    phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)
    hours: Mapped[str] = mapped_column(
        String(255), default="Monday to Friday, 8:00 AM to 6:00 PM", nullable=False
    )

    # Territory postal/zip codes served by this branch (e.g. ["78701", "78702", "787*"])
    service_territory_zips: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    # Location-specific transfer and emergency phone number
    transfer_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    emergency_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)

    # Custom settings / calendar configuration per location
    calendar_provider: Mapped[str] = mapped_column(String(32), default="internal", nullable=False)
    calendar_id: Mapped[str] = mapped_column(String(255), default="primary", nullable=False)

    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
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

    # Relationships
    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="locations")
    phone_numbers: Mapped[list[PhoneNumber]] = relationship(
        "PhoneNumber", back_populates="location"
    )
    staff_members: Mapped[list[StaffMember]] = relationship(
        "StaffMember", back_populates="location"
    )
    bookings: Mapped[list[Booking]] = relationship("Booking", back_populates="location")
    calls: Mapped[list[Call]] = relationship("Call", back_populates="location")
