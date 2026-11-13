"""Tenant, Agent Profile, and Phone Number database models."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.call import Call
    from api.app.models.user import User


class Tenant(Base):
    """Business client tenant."""

    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York", nullable=False)
    hours: Mapped[str] = mapped_column(
        String(255), default="Monday to Friday, 8:00 AM to 6:00 PM EST", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # active, suspended, trial
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    users: Mapped[list["User"]] = relationship(
        "User", back_populates="tenant", cascade="all, delete-orphan"
    )
    agent_profile: Mapped["AgentProfile"] = relationship(
        "AgentProfile", back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    phone_numbers: Mapped[list["PhoneNumber"]] = relationship(
        "PhoneNumber", back_populates="tenant", cascade="all, delete-orphan"
    )
    calls: Mapped[list["Call"]] = relationship(
        "Call", back_populates="tenant", cascade="all, delete-orphan"
    )


class AgentProfile(Base):
    """Custom voice persona, knowledge base, pricing rules, and emergency protocols."""

    __tablename__ = "agent_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    agent_name: Mapped[str] = mapped_column(String(64), default="receptionist", nullable=False)
    greeting: Mapped[str] = mapped_column(
        Text,
        default="Thanks for calling. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
        nullable=False,
    )
    tone: Mapped[str] = mapped_column(
        String(32), default="direct", nullable=False
    )  # direct, warm, formal
    voice_id: Mapped[str] = mapped_column(String(64), default="Alex", nullable=False)
    recording_disclosure: Mapped[bool] = mapped_column(default=True, nullable=False)
    phonetic_glossary: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    services: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    pricing_policy: Mapped[str] = mapped_column(
        String(64), default="diagnostic_fee_only", nullable=False
    )
    pricing_details: Mapped[dict[str, str]] = mapped_column(JSON, default=dict, nullable=False)
    faq: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list, nullable=False)
    emergency_keywords: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    emergency_advice: Mapped[str] = mapped_column(Text, default="", nullable=False)
    transfer_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="agent_profile")


class PhoneNumber(Base):
    """Inbound phone number linked to a tenant."""

    __tablename__ = "phone_numbers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    e164: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    provider: Mapped[str] = mapped_column(
        String(32), default="livekit", nullable=False
    )  # livekit, telnyx, twilio
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # active, reserved, released
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="phone_numbers")
