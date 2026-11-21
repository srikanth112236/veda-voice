"""Outbound calling and compliance database models."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.lead_form import Lead
    from api.app.models.tenant import Tenant


class SuppressionRecord(Base):
    """Do-Not-Call (DNC) and opt-out suppression list per tenant."""

    __tablename__ = "suppression_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    phone_number: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    reason: Mapped[str] = mapped_column(
        String(64), default="opt_out", nullable=False
    )  # opt_out, manual, dnc, carrier_complaint
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("ix_suppression_tenant_phone", "tenant_id", "phone_number", unique=True),
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", backref="suppression_records")


class OutboundDispatch(Base):
    """Tracks scheduled and dispatched outbound calls through compliance gate."""

    __tablename__ = "outbound_dispatches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    call_id: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    to_phone: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    from_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    purpose: Mapped[str] = mapped_column(
        String(64), default="call_triage", nullable=False
    )  # call_triage, appointment_reminder, follow_up
    lead_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(32), default="queued", nullable=False
    )  # queued, dispatched, completed, skipped_compliance, failed
    compliance_passed: Mapped[bool] = mapped_column(default=False, nullable=False)
    compliance_verdict: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    skip_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant: Mapped["Tenant"] = relationship("Tenant", backref="outbound_dispatches")
    lead: Mapped["Lead | None"] = relationship("Lead", backref="outbound_dispatches")


class ConsentRecord(Base):
    """Prior express written consent proof for automated calling compliance (TCPA / TSR)."""

    __tablename__ = "consent_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    phone_number: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(16), default="B", nullable=False)  # B, C, D
    consent_text_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("consent_texts.id", ondelete="SET NULL"), nullable=True
    )
    ai_voice_disclosed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    method: Mapped[str] = mapped_column(
        String(32), default="web_form", nullable=False
    )  # web_form, sms_reply, verbal_recorded, in_person, crm_import
    form_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    seller_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="lead_form", nullable=False)
    consent_confirmed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    consent_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_via: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revoked_at_call_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    retention_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC) + timedelta(days=5 * 365),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_consent_tenant_phone", "tenant_id", "phone_number"),)

    tenant: Mapped["Tenant"] = relationship("Tenant", backref="consent_records")


class VoiceCampaign(Base):
    """Voice campaign specification per SRS Section 6.5.

    Tracks tenant outbound campaigns (reminders, callbacks, speed-to-lead, reactivation)
    with execution windows, caps, retry policy, and real-time pause/resume control.
    """

    __tablename__ = "voice_campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str] = mapped_column(
        String(64), default="appointment_reminder", nullable=False
    )  # appointment_reminder, callback_scheduled, speed_to_lead, reactivation
    prompt_variant: Mapped[str] = mapped_column(String(128), default="default", nullable=False)
    caller_id_e164: Mapped[str] = mapped_column(String(32), nullable=False)
    schedule_window_start: Mapped[str] = mapped_column(String(5), default="09:00", nullable=False)
    schedule_window_end: Mapped[str] = mapped_column(String(5), default="18:00", nullable=False)
    max_attempts_per_contact: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    retry_interval_hours: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="draft", nullable=False
    )  # draft, scheduled, running, paused, completed
    total_contacts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_contacts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_contacts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_voice_campaigns_tenant_status", "tenant_id", "status"),)

    tenant: Mapped["Tenant"] = relationship("Tenant", backref="voice_campaigns")
    contacts: Mapped[list["CampaignContact"]] = relationship(
        "CampaignContact", back_populates="campaign", cascade="all, delete-orphan"
    )


class CampaignContact(Base):
    """Target contact row in a voice campaign with attempt history and compliance outcomes."""

    __tablename__ = "campaign_contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("voice_campaigns.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    phone_number: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(255), default="there", nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False
    )  # pending, calling, completed, skipped, failed
    attempts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_outcome: Mapped[str | None] = mapped_column(String(64), nullable=True)
    skip_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_call_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("ix_camp_contact_tenant_status", "tenant_id", "status"),
        Index("ix_camp_contact_campaign_phone", "campaign_id", "phone_number"),
    )

    campaign: Mapped["VoiceCampaign"] = relationship("VoiceCampaign", back_populates="contacts")
