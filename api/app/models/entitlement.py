"""Models for Plans, Feature Flags, Tenant Entitlement Overrides, and Trial Abuse Controls."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant
    from api.app.models.user import User


class Plan(Base):
    """Platform subscription plan catalog defining limits, pricing, and feature entitlements."""

    __tablename__ = "plans"

    code: Mapped[str] = mapped_column(
        String(32), primary_key=True
    )  # lite, starter, growth, pro, scale, enterprise, agency
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    track: Mapped[str] = mapped_column(
        String(32), default="direct", nullable=False
    )  # direct, enterprise, agency
    price_cents: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # null = custom contract
    included_minutes: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # null = contracted
    overage_cents_per_min: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # null = contracted
    max_concurrent_calls: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_concurrent_outbound: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    entitlements: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stripe_price_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FeatureFlag(Base):
    """Catalog of all documented platform feature flags and limits."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(
        String(64), primary_key=True
    )  # e.g. "crm.native", "outbound.categories"
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # bool, int, enum, list
    description: Mapped[str] = mapped_column(Text, nullable=False)
    default_value: Mapped[Any] = mapped_column(JSON, nullable=False)
    compliance_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class TenantEntitlementOverride(Base):
    """Agency-granted tenant entitlement overrides with audit tracking and expiration."""

    __tablename__ = "tenant_entitlement_overrides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    key: Mapped[str] = mapped_column(
        String(64), ForeignKey("feature_flags.key", ondelete="CASCADE"), nullable=False
    )
    value: Mapped[Any] = mapped_column(JSON, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    granted_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    __table_args__ = (Index("idx_tenant_entitlement_key", "tenant_id", "key", unique=True),)

    tenant: Mapped[Tenant] = relationship("Tenant")
    user: Mapped[User | None] = relationship("User")


class TrialAbuseRecord(Base):
    """Tracks historical trial redeemer identities (card fingerprint, phone, domain) to prevent serial churn."""

    __tablename__ = "trial_abuse_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    card_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    email_domain: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    outbound_calls_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
