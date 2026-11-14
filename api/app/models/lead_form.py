"""Multi-tenant Lead Form Builder and Lead records database models."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class LeadForm(Base):
    """Dynamic multi-tenant intake form schema."""

    __tablename__ = "lead_forms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # List of field configurations: name, label, type, required, options
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    # Action on submit: "call_triage" triggers 2s AI callback gate, "log_only" logs to inbox
    submit_action: Mapped[str] = mapped_column(String(32), default="call_triage", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="lead_forms")
    leads: Mapped[list["Lead"]] = relationship(
        "Lead", back_populates="form", cascade="all, delete-orphan"
    )


class Lead(Base):
    """Lead captured through dynamic intake forms or speed-to-lead ad webhooks."""

    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    form_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("lead_forms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    caller_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    caller_phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    urgency: Mapped[str] = mapped_column(String(32), default="normal", nullable=False)
    service_requested: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    custom_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False
    )  # pending, contacted, converted
    outbound_call_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="leads")
    form: Mapped["LeadForm | None"] = relationship("LeadForm", back_populates="leads")
