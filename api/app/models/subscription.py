"""Stripe minute-based subscriptions, free trials, rollover tracking, and admin coupon models."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.app.models.base import Base

if TYPE_CHECKING:
    from api.app.models.tenant import Tenant


class Subscription(Base):
    """Multi-tenant minute-based subscription with free trials and rollovers."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    # Tier: "trial", "starter" (1000 min), "pro" (1200 min), "enterprise" (1500 min)
    tier: Mapped[str] = mapped_column(String(32), default="trial", nullable=False)
    # Status: "trialing", "active", "past_due", "canceled"
    status: Mapped[str] = mapped_column(String(32), default="trialing", nullable=False)

    monthly_included_minutes: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    bonus_rollover_minutes: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    used_minutes_this_cycle: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Free Trial Configuration
    trial_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    trial_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=True
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC) + timedelta(days=14),
        nullable=True,
    )
    trial_minutes_allocated: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    trial_minutes_used: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Overage & Rates
    overage_rate_usd: Mapped[float] = mapped_column(Float, default=0.20, nullable=False)
    allow_overage: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Stripe Identifiers
    stripe_customer_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Cycle Dates
    cycle_start_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    cycle_end_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC) + timedelta(days=30),
        nullable=False,
    )

    applied_coupon_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationship
    tenant: Mapped["Tenant"] = relationship("Tenant", backref="subscription")

    @property
    def total_available_minutes(self) -> float:
        """Calculate total minutes available before overage."""
        if self.tier == "trial":
            return float(
                max(0.0, float(self.trial_minutes_allocated) - float(self.trial_minutes_used))
            )
        return float(
            max(
                0.0,
                (float(self.monthly_included_minutes) + float(self.bonus_rollover_minutes))
                - float(self.used_minutes_this_cycle),
            )
        )

    @property
    def is_trial_expired(self) -> bool:
        """Check if trial is past end date or out of minutes."""
        if self.tier != "trial":
            return False
        now = datetime.now(UTC)
        ends = self.trial_ends_at
        if ends:
            if ends.tzinfo is None:
                ends = ends.replace(tzinfo=UTC)
            if now > ends:
                return True
        if self.trial_minutes_used >= float(self.trial_minutes_allocated):
            return True
        return False


class Coupon(Base):
    """Admin-issued discount coupons and bonus minute codes."""

    __tablename__ = "coupons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    discount_percent: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False
    )  # e.g. 20.0 for 20% off
    bonus_minutes: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )  # e.g. 150 bonus minutes
    max_redemptions: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    times_redeemed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class UsageRecord(Base):
    """Minute usage record for telemetry and invoice generation."""

    __tablename__ = "usage_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    call_id: Mapped[str] = mapped_column(String(64), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    billable_minutes: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
