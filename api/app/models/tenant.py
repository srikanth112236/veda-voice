"""Tenant, Agent Profile, and Phone Number database models."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.call import Call
    from api.app.models.location import Location
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
    max_concurrent_calls: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    max_concurrent_outbound: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    monthly_minute_quota: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    users: Mapped[list[User]] = relationship(
        "User", back_populates="tenant", cascade="all, delete-orphan"
    )
    agent_profile: Mapped[AgentProfile] = relationship(
        "AgentProfile", back_populates="tenant", uselist=False, cascade="all, delete-orphan"
    )
    phone_numbers: Mapped[list[PhoneNumber]] = relationship(
        "PhoneNumber", back_populates="tenant", cascade="all, delete-orphan"
    )
    calls: Mapped[list[Call]] = relationship(
        "Call", back_populates="tenant", cascade="all, delete-orphan"
    )
    locations: Mapped[list[Location]] = relationship(
        "Location", back_populates="tenant", cascade="all, delete-orphan"
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
    pricing_mode: Mapped[str] = mapped_column(
        String(32), default="no_quote", nullable=False
    )  # no_quote, listed, range
    price_items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    pricing_details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    faq: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    emergency_mode: Mapped[str] = mapped_column(
        String(64), default="priority_message", nullable=False
    )
    emergency_keywords: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    emergency_advice: Mapped[str] = mapped_column(Text, default="", nullable=False)
    approved_safety_script: Mapped[str] = mapped_column(Text, default="", nullable=False)
    transfer_number: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    service_area: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    service_cities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    after_hours_policy: Mapped[str] = mapped_column(
        String(64), default="take_message_all", nullable=False
    )
    out_of_area_policy: Mapped[str] = mapped_column(
        String(64), default="polite_decline", nullable=False
    )
    notification_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    notification_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    notify_on_all_calls: Mapped[bool] = mapped_column(default=True, nullable=False)
    notify_sms_on_emergency: Mapped[bool] = mapped_column(default=True, nullable=False)

    # 360° Profile & Conversational Customizations Suite
    bilingual_spanish_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    patience_cadence: Mapped[str] = mapped_column(String(32), default="balanced", nullable=False)
    silence_timeout_ms: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    speech_barge_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    adaptive_empathy: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    background_ambience: Mapped[str] = mapped_column(
        String(64), default="studio_clean", nullable=False
    )
    barred_phrases: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    intake_questions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    office_override_mode: Mapped[str] = mapped_column(String(32), default="normal", nullable=False)
    office_override_announcement: Mapped[str] = mapped_column(Text, default="", nullable=False)
    vip_returning_caller_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    vip_returning_greeting: Mapped[str] = mapped_column(Text, default="", nullable=False)
    mid_call_sms_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    disconnect_recovery_sms_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    disconnect_recovery_sms_text: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Calendar Scheduling & Buffer Time Protection Suite
    scheduling_mode: Mapped[str] = mapped_column(
        String(32), default="exact_time", nullable=False
    )  # exact_time | arrival_window
    arrival_window_hours: Mapped[int] = mapped_column(Integer, default=2, nullable=False)  # 2 | 4
    calendar_buffer_minutes: Mapped[int] = mapped_column(
        Integer, default=15, nullable=False
    )  # 15 | 20 | 30 | 45
    calendar_buffer_mode: Mapped[str] = mapped_column(
        String(32), default="after", nullable=False
    )  # after | both
    calendar_buffer_reason: Mapped[str] = mapped_column(
        String(64), default="travel_and_reset", nullable=False
    )
    auto_sms_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reminder_lead_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    custom_reminder_template: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Phase 1: Core Prompt Rules, Objections & Strict Grounding Suite
    custom_instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    do_rules: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    dont_rules: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    objection_handlers: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    strict_grounding: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    unknown_fallback_script: Mapped[str] = mapped_column(Text, default="", nullable=False)
    escalation_rules: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    post_call_auto_quote_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    post_call_followup_sms_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="agent_profile")


class PhoneNumber(Base):
    """Inbound phone number linked to a tenant or held in agency pool."""

    __tablename__ = "phone_numbers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    location_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    e164: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    provider: Mapped[str] = mapped_column(
        String(32), default="livekit", nullable=False
    )  # livekit, telnyx, twilio
    purpose: Mapped[str] = mapped_column(
        String(32), default="inbound_outbound", nullable=False
    )  # inbound_outbound, inbound, outbound
    label: Mapped[str] = mapped_column(String(64), default="Main Inbound Line", nullable=False)
    locality: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    region: Mapped[str] = mapped_column(String(16), default="US", nullable=False)
    trunk_id: Mapped[str] = mapped_column(
        String(64), default="ST_inbound_livekit_scale", nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # active, pool, released
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped[Tenant | None] = relationship("Tenant", back_populates="phone_numbers")
    location: Mapped[Location | None] = relationship("Location", back_populates="phone_numbers")
