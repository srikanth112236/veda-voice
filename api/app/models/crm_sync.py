"""Transactional CRM Outbox and Entity Link Database Models per SRS Addendum v1.1 Section 3.6."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class CRMConnection(Base):
    """External CRM connection and encrypted OAuth credentials per tenant."""

    __tablename__ = "crm_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # hubspot, zoho, gohighlevel, pipedrive
    status: Mapped[str] = mapped_column(
        String(32), default="connected", nullable=False
    )  # connected, error, revoked, disconnected
    external_account_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )  # portal_id, org_id
    region_meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    token_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)  # Envelope encrypted
    field_map: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("ix_crm_conn_tenant_provider", "tenant_id", "provider", unique=True),)

    tenant: Mapped[Tenant] = relationship("Tenant", backref="crm_oauth_connections")
    outbox_jobs: Mapped[list[CRMSyncOutbox]] = relationship(
        "CRMSyncOutbox", back_populates="connection", cascade="all, delete-orphan"
    )


class CRMEntityLink(Base):
    """Idempotency cross-reference between internal native entities and external CRM IDs."""

    __tablename__ = "crm_entity_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    entity: Mapped[str] = mapped_column(String(32), nullable=False)  # contact, call, booking, task
    internal_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index(
            "ix_entity_links_lookup", "tenant_id", "provider", "entity", "internal_id", unique=True
        ),
        Index("ix_entity_links_reverse", "tenant_id", "provider", "external_id"),
    )

    tenant: Mapped[Tenant] = relationship("Tenant", backref="crm_entity_links")


class CRMSyncOutbox(Base):
    """Transactional outbox queue for resilient background CRM sync with exponential backoff."""

    __tablename__ = "crm_sync_outbox"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    connection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("crm_connections.id", ondelete="CASCADE"), index=True, nullable=False
    )
    entity: Mapped[str] = mapped_column(String(32), nullable=False)  # contact, call, booking, task
    internal_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    op: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # upsert, log_call, log_booking, create_task, set_stage
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    attempt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default="queued", nullable=False
    )  # queued, in_progress, done, failed, dead
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (
        Index("ix_crm_outbox_poll", "status", "next_attempt_at"),
        Index("ix_crm_outbox_tenant_status", "tenant_id", "status"),
    )

    tenant: Mapped[Tenant] = relationship("Tenant", backref="crm_outbox_jobs")
    connection: Mapped[CRMConnection] = relationship("CRMConnection", back_populates="outbox_jobs")
