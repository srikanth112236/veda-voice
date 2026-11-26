"""Database models for tenant-to-customer quotes/estimates and service invoices."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


def _generate_public_token() -> str:
    return secrets.token_urlsafe(24)


class CustomerQuote(Base):
    """Customer-facing service estimate or quote scoped to a tenant."""

    __tablename__ = "customer_quotes"
    __table_args__ = (
        Index("ix_customer_quotes_tenant_status", "tenant_id", "status"),
        Index("ix_customer_quotes_tenant_contact", "tenant_id", "contact_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    booking_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quote_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tax_rate_bps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="draft", nullable=False
    )  # draft | sent | approved | declined | expired | converted
    public_token: Mapped[str] = mapped_column(
        String(64), default=_generate_public_token, unique=True, nullable=False, index=True
    )
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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


class CustomerInvoice(Base):
    """Customer-facing service invoice scoped to a tenant."""

    __tablename__ = "customer_invoices"
    __table_args__ = (
        Index("ix_customer_invoices_tenant_status", "tenant_id", "status"),
        Index("ix_customer_invoices_tenant_contact", "tenant_id", "contact_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contact_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    quote_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("customer_quotes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    booking_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    invoice_number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line_items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tax_rate_bps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amount_paid_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="USD", nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="draft", nullable=False
    )  # draft | issued | paid | overdue | void
    public_token: Mapped[str] = mapped_column(
        String(64), default=_generate_public_token, unique=True, nullable=False, index=True
    )
    payment_link_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
