"""Agency and Tenant Audit Trail ORM models."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class AgencyAuditLog(Base):
    """Immutable audit record for platform admin impersonation and sensitive agency actions."""

    __tablename__ = "agency_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    actor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(64), nullable=False)
    is_impersonated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    impersonator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    impersonator_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False, index=True
    )

    __table_args__ = (
        Index("ix_agency_audit_tenant_action", "tenant_id", "action"),
        Index("ix_agency_audit_created_at_desc", created_at.desc()),
    )

    tenant: Mapped["Tenant | None"] = relationship("Tenant", backref="agency_audit_logs")
