"""User and role authentication models."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class User(Base):
    """User account with role-based access for platform admins and tenant staff."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(32), default="tenant_owner", nullable=False
    )  # platform_admin, tenant_owner, tenant_manager, tenant_staff

    # Multi-location access scoping (empty list = access to all tenant locations)
    location_ids: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    tenant: Mapped["Tenant | None"] = relationship("Tenant", back_populates="users")

    # Transient runtime attributes for agency impersonation sessions
    __allow_unmapped__ = True
    is_impersonated: bool = False
    impersonator_id: str | None = None
    impersonator_email: str | None = None
    session_id: str | None = None
