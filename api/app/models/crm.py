"""Multi-tenant Native CRM database models for contacts, timeline events, and email campaigns."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.call import Call
    from api.app.models.tenant import Tenant


class Contact(Base):
    """Customer or lead profile in tenant native CRM."""

    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), default="Unknown Lead", nullable=False)
    phone: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    source: Mapped[str] = mapped_column(
        String(64), default="direct", nullable=False
    )  # google_sheets, meta_ads, website_form, csv_upload, inbound_call, manual
    stage: Mapped[str] = mapped_column(
        String(32), default="new_lead", nullable=False
    )  # new_lead, ai_called, qualified, booked, closed, lost
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    custom_fields: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    lead_score: Mapped[float] = mapped_column(Float, default=50.0, nullable=False)
    is_callable: Mapped[bool] = mapped_column(default=True, nullable=False)
    first_contact_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    last_contact_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("ix_contacts_tenant_phone", "tenant_id", "phone", unique=True),
        Index("ix_contacts_tenant_stage", "tenant_id", "stage"),
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="crm_contacts")
    calls: Mapped[list["Call"]] = relationship(
        "Call", back_populates="contact", cascade="all, delete-orphan"
    )
    timeline_events: Mapped[list["ContactTimelineEvent"]] = relationship(
        "ContactTimelineEvent", back_populates="contact", cascade="all, delete-orphan"
    )


class ContactTimelineEvent(Base):
    """Activity timeline event associated with a CRM contact."""

    __tablename__ = "contact_timeline_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    contact_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # call, email_sent, form_submitted, stage_changed, note_added, booking_created
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_timeline_tenant_contact", "tenant_id", "contact_id", "created_at"),)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="crm_timeline_events")
    contact: Mapped["Contact"] = relationship("Contact", back_populates="timeline_events")


class EmailCampaign(Base):
    """Email campaign or automated follow-up sequence."""

    __tablename__ = "email_campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_event: Mapped[str] = mapped_column(
        String(64), default="manual", nullable=False
    )  # manual_broadcast, post_call_followup, stage_changed
    target_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), default="active", nullable=False
    )  # active, draft, paused, archived
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_campaigns_tenant_status", "tenant_id", "status"),)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="crm_campaigns")


class CRMIntegration(Base):
    """External CRM connection credentials and sync configuration."""

    __tablename__ = "crm_integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # hubspot, zoho, gohighlevel, pipedrive
    status: Mapped[str] = mapped_column(
        String(32), default="connected", nullable=False
    )  # connected, disconnected, error
    api_key_or_token: Mapped[str] = mapped_column(Text, default="", nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_crm_tenant_provider", "tenant_id", "provider", unique=True),)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="external_crm_integrations")


class WebhookSubscription(Base):
    """Outbound webhook trigger subscriptions for Zapier, Make, and external platforms."""

    __tablename__ = "webhook_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    target_url: Mapped[str] = mapped_column(String(512), nullable=False)
    secret: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    events: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_webhooks_tenant_active", "tenant_id", "is_active"),)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="webhook_subscriptions")


class PipelineStage(Base):
    """Configurable pipeline stages per tenant."""

    __tablename__ = "crm_pipeline_stages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    pipeline_id: Mapped[str] = mapped_column(String(64), default="default", nullable=False)
    stage_key: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    color: Mapped[str] = mapped_column(
        String(128), default="border-zinc-300 bg-zinc-50 text-zinc-700", nullable=False
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_system: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("ix_crm_stages_tenant_key", "tenant_id", "pipeline_id", "stage_key", unique=True),
        Index("ix_crm_stages_tenant_order", "tenant_id", "order_index"),
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", backref="crm_pipeline_stages")


class ContactMergeLog(Base):
    """Audit record for deduplication and merged contacts."""

    __tablename__ = "contact_merge_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    survivor_contact_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    merged_contact_id: Mapped[str] = mapped_column(String(36), nullable=False)
    merged_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    merged_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    merged_by_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_merge_logs_tenant_survivor", "tenant_id", "survivor_contact_id"),)

    tenant: Mapped["Tenant"] = relationship("Tenant", backref="contact_merge_logs")
    survivor_contact: Mapped["Contact"] = relationship("Contact", backref="merge_history")
