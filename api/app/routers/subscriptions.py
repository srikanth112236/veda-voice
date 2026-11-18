"""Subscription, minute billing, rollover, and coupon management router."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_user, require_platform_admin
from api.app.db.session import get_db
from api.app.models.entitlement import (
    Plan,
    TenantEntitlementOverride,
)
from api.app.models.location import Location
from api.app.models.subscription import Coupon, Subscription
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.entitlements import (
    PLAN_ENTITLEMENTS_MATRIX,
    check_downgrade_limits,
    resolve_tenant_entitlements,
)

router = APIRouter(prefix="/api/v1", tags=["subscriptions"])

# Tier minute definitions and monthly prices (7-Plan Ladder)
TIER_PLANS: dict[str, dict[str, Any]] = {
    "lite": {"minutes": 300, "price_usd": 99.00, "name": "Lite Plan", "overage_usd": 0.40},
    "starter": {"minutes": 1000, "price_usd": 299.00, "name": "Starter Plan", "overage_usd": 0.35},
    "growth": {"minutes": 1500, "price_usd": 399.00, "name": "Growth Plan", "overage_usd": 0.35},
    "pro": {"minutes": 2000, "price_usd": 499.00, "name": "Professional Plan", "overage_usd": 0.35},
    "scale": {"minutes": 4000, "price_usd": 999.00, "name": "Scale Plan", "overage_usd": 0.30},
    "enterprise": {
        "minutes": 10000,
        "price_usd": 1999.00,
        "name": "Enterprise Scale Plan",
        "overage_usd": 0.20,
    },
    "agency": {
        "minutes": 5000,
        "price_usd": 1000.00,
        "name": "Agency Wholesale Plan",
        "overage_usd": 0.25,
    },
}


class UpgradeSubscriptionRequest(BaseModel):
    tier: str = Field(
        ..., description="Target tier: lite, starter, growth, pro, scale, enterprise, agency"
    )
    coupon_code: str | None = Field(
        None, description="Optional coupon code for discount/bonus minutes"
    )
    payment_method_id: str | None = Field(
        None, description="Stripe payment method token or test card"
    )


class SetEntitlementOverrideRequest(BaseModel):
    key: str = Field(..., description="Feature flag key from catalog")
    value: Any = Field(..., description="Overridden value (bool, int, list, str)")
    reason: str = Field(..., description="Mandatory audit justification")
    expires_in_days: int | None = Field(None, description="Optional expiry in days")


class CreateCouponRequest(BaseModel):
    code: str = Field(..., description="Unique coupon code, e.g. LAUNCH50")
    discount_percent: float = Field(
        0.0, ge=0.0, le=100.0, description="Percentage discount (0-100)"
    )
    bonus_minutes: int = Field(
        0, ge=0, description="Bonus complimentary minutes granted on redemption"
    )
    max_redemptions: int = Field(
        100, ge=1, description="Maximum number of times this coupon can be redeemed"
    )
    expires_in_days: int | None = Field(None, description="Optional days until expiration")


class GrantMinutesRequest(BaseModel):
    bonus_minutes: float = Field(..., description="Bonus minutes to credit immediately")
    reason: str = Field("Admin courtesy credit", description="Reason for audit log")


class AdminUpdateTierRequest(BaseModel):
    tier: str = Field(..., description="Target tier: starter, pro, enterprise, or trial")
    custom_minutes: int | None = Field(None, description="Optional custom minutes override")
    reset_usage: bool = Field(False, description="Whether to reset current cycle usage to 0")


class AdminUpdateStatusRequest(BaseModel):
    status: str = Field(..., description="active, suspended, trialing, canceled")
    reason: str | None = Field(None, description="Audit reason")


class AdminUpdateLimitsRequest(BaseModel):
    monthly_included_minutes: int = Field(..., ge=0)
    overage_rate_usd: float = Field(0.20, ge=0.0)
    allow_overage: bool = Field(True)
    billing_increment: str | None = Field(None, description="'minute' or 'second'")


class UpdateBillingModeRequest(BaseModel):
    billing_increment: str = Field(
        ..., description="'minute' (60s rounding) or 'second' (per-second precision)"
    )


def _is_expired(dt: datetime | None) -> bool:
    if not dt:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return datetime.now(UTC) > dt


def execute_cycle_renewal(sub: Subscription, db: Session) -> dict[str, Any]:
    """Execute monthly billing renewal, apply pending plan changes, and add 10% complimentary rollover."""
    transitioned_plan_msg = ""
    if sub.pending_tier and sub.pending_tier in TIER_PLANS:
        new_plan = TIER_PLANS[sub.pending_tier]
        sub.tier = sub.pending_tier
        sub.monthly_included_minutes = int(new_plan["minutes"])
        transitioned_plan_msg = f" Plan transitioned to {new_plan['name']}."
        sub.pending_tier = None
        sub.pending_effective_at = None

    # Rollover Rule: 10% of unused monthly plan minutes roll over as complimentary bonus minutes
    unused_base_minutes = max(
        0.0, float(sub.monthly_included_minutes) - sub.used_minutes_this_cycle
    )
    complimentary_rollover_bonus = round(unused_base_minutes * 0.10, 2)

    sub.bonus_rollover_minutes += complimentary_rollover_bonus
    sub.used_minutes_this_cycle = 0.0
    sub.cycle_start_date = datetime.now(UTC)
    sub.cycle_end_date = datetime.now(UTC) + timedelta(days=30)
    sub.cycle_change_locked_until = datetime.now(UTC) + timedelta(days=30)

    db.add(sub)
    db.commit()
    db.refresh(sub)

    return {
        "success": True,
        "message": f"Cycle renewed.{transitioned_plan_msg} 10% unused complimentary rollover added ({complimentary_rollover_bonus} minutes).",
        "new_bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
        "tier": sub.tier,
        "monthly_included_minutes": sub.monthly_included_minutes,
        "total_available_minutes": round(
            float(sub.monthly_included_minutes) + sub.bonus_rollover_minutes, 2
        ),
        "cycle_end_date": sub.cycle_end_date.isoformat(),
        "rollover_added": complimentary_rollover_bonus,
    }


def get_or_create_subscription(db: Session, tenant_id: str) -> Subscription:
    """Ensure every tenant has an active subscription or free trial record."""
    sub = cast(
        Subscription | None,
        db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id)),
    )
    if not sub:
        new_sub = Subscription(
            tenant_id=tenant_id,
            tier="trial",
            status="trialing",
            monthly_included_minutes=1000,
            bonus_rollover_minutes=0.0,
            used_minutes_this_cycle=0.0,
            trial_days=14,
            trial_starts_at=datetime.now(UTC),
            trial_ends_at=datetime.now(UTC) + timedelta(days=14),
            trial_minutes_allocated=100,
            trial_minutes_used=0.0,
            overage_rate_usd=0.20,
            allow_overage=True,
            cycle_start_date=datetime.now(UTC),
            cycle_end_date=datetime.now(UTC) + timedelta(days=30),
        )
        db.add(new_sub)
        db.commit()
        db.refresh(new_sub)
        return new_sub
    return sub


@router.get("/subscriptions/current")
def get_current_subscription(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get the current authenticated tenant's minute subscription and rollover balance."""
    if not user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Platform admins must query tenant subscriptions via admin endpoints.",
        )

    sub = get_or_create_subscription(db, user.tenant_id)

    # Automatic Cycle Renewal check: if subscription cycle has expired, process renewal and 10% rollover automatically
    if sub.tier != "trial" and _is_expired(sub.cycle_end_date):
        execute_cycle_renewal(sub, db)

    # Calculate remaining minutes based on tier
    if sub.tier == "trial":
        remaining_minutes = max(0.0, float(sub.trial_minutes_allocated) - sub.trial_minutes_used)
        total_limit = float(sub.trial_minutes_allocated)
        used_minutes = sub.trial_minutes_used
    else:
        total_limit = float(sub.monthly_included_minutes) + sub.bonus_rollover_minutes
        used_minutes = sub.used_minutes_this_cycle
        remaining_minutes = max(0.0, total_limit - used_minutes)

    return {
        "id": sub.id,
        "tenant_id": sub.tenant_id,
        "tier": sub.tier,
        "status": sub.status,
        "monthly_included_minutes": sub.monthly_included_minutes,
        "bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
        "used_minutes_this_cycle": round(used_minutes, 2),
        "total_limit_minutes": round(total_limit, 2),
        "remaining_minutes": round(remaining_minutes, 2),
        "overage_rate_usd": sub.overage_rate_usd,
        "allow_overage": sub.allow_overage,
        "billing_increment": getattr(sub, "billing_increment", "minute"),
        "is_trial": sub.tier == "trial",
        "trial_days": sub.trial_days,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "trial_expired": sub.is_trial_expired,
        "trial_minutes_allocated": sub.trial_minutes_allocated,
        "trial_minutes_used": round(sub.trial_minutes_used, 2),
        "cycle_start_date": sub.cycle_start_date.isoformat(),
        "cycle_end_date": sub.cycle_end_date.isoformat(),
        "auto_renew": sub.auto_renew,
        "is_cycle_locked": sub.is_cycle_locked,
        "cycle_change_locked_until": (
            sub.cycle_change_locked_until.isoformat() if sub.cycle_change_locked_until else None
        ),
        "pending_tier": sub.pending_tier,
        "pending_effective_at": (
            sub.pending_effective_at.isoformat() if sub.pending_effective_at else None
        ),
        "applied_coupon_code": sub.applied_coupon_code,
        "available_plans": [
            {
                "tier": code,
                "name": p["name"],
                "minutes": p["minutes"],
                "price_usd": p["price_usd"],
                "overage_usd": p.get("overage_usd", 0.35),
                "locations_max": PLAN_ENTITLEMENTS_MATRIX.get(code, {}).get("locations.max", 1),
            }
            for code, p in TIER_PLANS.items()
        ],
    }


@router.get("/plans")
def list_subscription_plans(
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """List public subscription plans with pricing, minute allocations, overage rates, and feature entitlements."""
    plans = db.scalars(
        select(Plan).where(Plan.active.is_(True)).order_by(Plan.sort_order.asc())
    ).all()
    if plans:
        return [
            {
                "code": p.code,
                "name": p.name,
                "track": p.track,
                "price_usd": round(p.price_cents / 100.0, 2) if p.price_cents is not None else None,
                "included_minutes": p.included_minutes,
                "overage_rate_usd": round(p.overage_cents_per_min / 100.0, 2)
                if p.overage_cents_per_min is not None
                else None,
                "max_concurrent_calls": p.max_concurrent_calls,
                "max_concurrent_outbound": p.max_concurrent_outbound,
                "entitlements": p.entitlements,
                "public": p.public,
            }
            for p in plans
        ]

    # Fallback to in-memory catalog
    return [
        {
            "code": code,
            "name": p["name"],
            "track": "direct",
            "price_usd": p["price_usd"],
            "included_minutes": p["minutes"],
            "overage_rate_usd": p.get("overage_usd", 0.35),
            "max_concurrent_calls": 3,
            "max_concurrent_outbound": 1,
            "entitlements": PLAN_ENTITLEMENTS_MATRIX.get(code, {}),
            "public": True,
        }
        for code, p in TIER_PLANS.items()
    ]


@router.get("/entitlements")
def get_tenant_entitlements(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve active feature entitlements, limits, usage meters, and trial standing."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == user.tenant_id))
    entitlements = resolve_tenant_entitlements(db, user.tenant_id)

    # Current resource usage counts
    active_numbers = len(
        db.scalars(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == user.tenant_id, PhoneNumber.status == "active"
            )
        ).all()
    )
    active_seats = len(
        db.scalars(
            select(User).where(User.tenant_id == user.tenant_id, User.is_active.is_(True))
        ).all()
    )
    active_locations = len(
        db.scalars(
            select(Location).where(
                Location.tenant_id == user.tenant_id, Location.is_active.is_(True)
            )
        ).all()
    )

    trial_info = None
    if sub and (sub.tier == "trial" or sub.status == "trialing"):
        now = datetime.now(UTC)
        ends_at = sub.trial_ends_at
        if ends_at and ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=UTC)
        days_left = max(0, (ends_at - now).days) if ends_at else 0
        trial_info = {
            "status": "trialing" if not sub.is_trial_expired else "expired",
            "trial_minutes_allocated": sub.trial_minutes_allocated,
            "trial_minutes_used": sub.trial_minutes_used,
            "trial_minutes_remaining": max(
                0.0, float(sub.trial_minutes_allocated) - float(sub.trial_minutes_used)
            ),
            "trial_days_remaining": days_left,
            "is_trial_expired": sub.is_trial_expired,
        }

    return {
        "tenant_id": user.tenant_id,
        "tier": sub.tier if sub else "starter",
        "status": sub.status if sub else "active",
        "trial": trial_info,
        "entitlements": entitlements,
        "usage_meters": {
            "active_numbers": active_numbers,
            "numbers_limit": entitlements.get("numbers.max", 1),
            "active_seats": active_seats,
            "seats_limit": entitlements.get("seats.max", 2),
            "active_locations": active_locations,
            "locations_limit": entitlements.get("locations.max", 1),
            "monthly_included_minutes": sub.monthly_included_minutes if sub else 1000,
            "used_minutes_this_cycle": sub.used_minutes_this_cycle if sub else 0.0,
            "billing_increment": getattr(sub, "billing_increment", "minute") if sub else "minute",
        },
    }


@router.get("/subscriptions/check-downgrade")
def check_subscription_downgrade(
    target_tier: str = Query(..., description="Target plan code to evaluate"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Pre-downgrade gate (FR-PLAN-2): list any resources exceeding the target plan limits."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")
    return check_downgrade_limits(db, user.tenant_id, target_tier)


@router.get("/admin/tenants/{tenant_id}/entitlement-overrides")
def get_tenant_overrides(
    tenant_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> list[dict[str, Any]]:
    """List agency-granted entitlement overrides for a specific tenant."""
    overrides = db.scalars(
        select(TenantEntitlementOverride).where(TenantEntitlementOverride.tenant_id == tenant_id)
    ).all()
    return [
        {
            "id": ov.id,
            "key": ov.key,
            "value": ov.value,
            "reason": ov.reason,
            "granted_by": ov.granted_by,
            "expires_at": ov.expires_at.isoformat() if ov.expires_at else None,
            "created_at": ov.created_at.isoformat(),
        }
        for ov in overrides
    ]


@router.put("/admin/tenants/{tenant_id}/entitlement-overrides")
def set_tenant_override(
    tenant_id: str,
    req: SetEntitlementOverrideRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Set or update an entitlement override with audit reason (Tier 3)."""
    now = datetime.now(UTC)
    exp = now + timedelta(days=req.expires_in_days) if req.expires_in_days else None

    override = db.scalar(
        select(TenantEntitlementOverride).where(
            TenantEntitlementOverride.tenant_id == tenant_id,
            TenantEntitlementOverride.key == req.key,
        )
    )
    if override:
        override.value = req.value
        override.reason = req.reason
        override.granted_by = admin.id
        override.expires_at = exp
    else:
        override = TenantEntitlementOverride(
            tenant_id=tenant_id,
            key=req.key,
            value=req.value,
            reason=req.reason,
            granted_by=admin.id,
            expires_at=exp,
            created_at=now,
        )
        db.add(override)

    db.commit()
    db.refresh(override)

    return {
        "success": True,
        "tenant_id": tenant_id,
        "key": override.key,
        "value": override.value,
        "reason": override.reason,
        "expires_at": override.expires_at.isoformat() if override.expires_at else None,
    }


@router.delete("/admin/tenants/{tenant_id}/entitlement-overrides/{key}")
def delete_tenant_override(
    tenant_id: str,
    key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Delete an active entitlement override, reverting tenant to plan tier default."""
    override = db.scalar(
        select(TenantEntitlementOverride).where(
            TenantEntitlementOverride.tenant_id == tenant_id,
            TenantEntitlementOverride.key == key,
        )
    )
    if not override:
        raise HTTPException(status_code=404, detail="Entitlement override not found.")

    db.delete(override)
    db.commit()
    return {"success": True, "message": f"Override '{key}' removed."}


@router.post("/subscriptions/upgrade")
def upgrade_subscription(
    req: UpgradeSubscriptionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Upgrade or activate tenant subscription with Stripe & Rollover Rules."""
    if not user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to a tenant to upgrade subscription.",
        )

    tier_key = req.tier.lower()
    if tier_key not in TIER_PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid tier '{req.tier}'. Choose from starter, pro, or enterprise.",
        )

    plan = TIER_PLANS[tier_key]
    sub = get_or_create_subscription(db, user.tenant_id)

    # Pre-change resource limit gate (FR-PLAN-2)
    # Check if target plan can accommodate current active resources (numbers, seats, locations)
    downgrade_check = check_downgrade_limits(db, user.tenant_id, tier_key)
    if not downgrade_check.get("allowed", True):
        excess_msgs = "; ".join([e["message"] for e in downgrade_check.get("excess_resources", [])])
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot transition to {plan['name']}: Resource limits exceeded. {excess_msgs}",
        )

    # 1-Subscription-Per-Month Enforced:
    # If tenant is already on an active paid plan (not in trial)
    if sub.tier != "trial" and sub.status == "active":
        if tier_key == sub.tier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Already actively subscribed to {plan['name']}. Your plan auto-renews on {sub.cycle_end_date.strftime('%b %d, %Y')}.",
            )
        # Client user attempting to change tier mid-cycle:
        if user.role != "platform_admin" and sub.is_cycle_locked:
            sub.pending_tier = tier_key
            sub.pending_effective_at = sub.cycle_end_date
            db.commit()
            db.refresh(sub)
            return {
                "success": True,
                "scheduled": True,
                "message": (
                    f"Plan change to {plan['name']} is scheduled for your next cycle renewal on "
                    f"{sub.cycle_end_date.strftime('%b %d, %Y')}. Agency policy enforces 1 plan change per 30-day "
                    f"billing cycle. Contact Agency Administrator for instant mid-cycle expansion."
                ),
                "tier": sub.tier,
                "pending_tier": sub.pending_tier,
                "pending_effective_at": (
                    sub.pending_effective_at.isoformat() if sub.pending_effective_at else None
                ),
                "monthly_included_minutes": sub.monthly_included_minutes,
                "bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
                "trial_minutes_rolled_over": 0.0,
                "coupon_applied": sub.applied_coupon_code,
                "coupon_bonus_minutes": 0,
                "invoice": {
                    "subtotal_usd": plan["price_usd"],
                    "discount_usd": 0.0,
                    "total_charged_usd": 0.0,
                    "stripe_subscription_id": sub.stripe_subscription_id,
                },
                "cycle_end_date": sub.cycle_end_date.isoformat(),
            }

    # Rollover Rule 1: 100% of unused free trial credits are credited into the first subscription!
    trial_minutes_rolled_over = 0.0
    if sub.tier == "trial":
        trial_minutes_rolled_over = max(
            0.0, float(sub.trial_minutes_allocated) - sub.trial_minutes_used
        )
        sub.bonus_rollover_minutes += trial_minutes_rolled_over

    # Handle Coupon Code if provided
    discount_amount = 0.0
    coupon_bonus_minutes = 0
    if req.coupon_code:
        code_clean = req.coupon_code.strip().upper()
        coupon = db.scalar(select(Coupon).where(Coupon.code == code_clean))
        if not coupon or not coupon.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Coupon code '{req.coupon_code}' is invalid or deactivated.",
            )
        if _is_expired(coupon.expires_at):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Coupon code '{req.coupon_code}' has expired.",
            )
        if coupon.times_redeemed >= coupon.max_redemptions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Coupon code '{req.coupon_code}' has reached its maximum redemptions limit.",
            )

        # Apply discount
        plan_price = float(plan["price_usd"])
        discount_amount = round(plan_price * (coupon.discount_percent / 100.0), 2)
        coupon_bonus_minutes = coupon.bonus_minutes
        sub.bonus_rollover_minutes += float(coupon_bonus_minutes)
        sub.applied_coupon_code = coupon.code

        coupon.times_redeemed += 1
        db.add(coupon)

    final_price_usd = max(0.0, float(plan["price_usd"]) - discount_amount)

    # Update subscription record
    sub.tier = tier_key
    sub.status = "active"
    sub.monthly_included_minutes = int(plan["minutes"])
    sub.used_minutes_this_cycle = 0.0
    sub.cycle_start_date = datetime.now(UTC)
    sub.cycle_end_date = datetime.now(UTC) + timedelta(days=30)
    sub.cycle_change_locked_until = datetime.now(UTC) + timedelta(days=30)
    sub.pending_tier = None
    sub.pending_effective_at = None
    sub.auto_renew = True
    sub.stripe_customer_id = f"cus_mock_{user.tenant_id[:8]}"
    sub.stripe_subscription_id = f"sub_mock_{uuid.uuid4().hex[:12]}"

    db.commit()
    db.refresh(sub)

    return {
        "success": True,
        "message": f"Successfully activated {plan['name']}!",
        "tier": sub.tier,
        "monthly_included_minutes": sub.monthly_included_minutes,
        "bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
        "trial_minutes_rolled_over": round(trial_minutes_rolled_over, 2),
        "coupon_applied": sub.applied_coupon_code,
        "coupon_bonus_minutes": coupon_bonus_minutes,
        "invoice": {
            "subtotal_usd": plan["price_usd"],
            "discount_usd": discount_amount,
            "total_charged_usd": final_price_usd,
            "stripe_subscription_id": sub.stripe_subscription_id,
        },
        "cycle_end_date": sub.cycle_end_date.isoformat(),
    }


@router.patch("/subscriptions/billing-mode")
def update_billing_mode(
    req: UpdateBillingModeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Configure tenant billing precision: 'minute' (60s rounding) or 'second' (per-second precision)."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")
    if req.billing_increment not in ("minute", "second"):
        raise HTTPException(
            status_code=400, detail="billing_increment must be 'minute' or 'second'."
        )
    sub = get_or_create_subscription(db, user.tenant_id)
    sub.billing_increment = req.billing_increment
    db.commit()
    db.refresh(sub)
    return {
        "success": True,
        "tenant_id": user.tenant_id,
        "billing_increment": sub.billing_increment,
        "message": f"Billing resolution updated to {req.billing_increment}.",
    }


@router.post("/subscriptions/cycle-renew")
def cycle_renewal_rollover(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Execute monthly billing renewal with 10% complimentary unused rollover."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    sub = get_or_create_subscription(db, user.tenant_id)
    if sub.tier == "trial":
        raise HTTPException(
            status_code=400, detail="Trial subscriptions do not cycle renew. Upgrade to paid tier."
        )

    return execute_cycle_renewal(sub, db)


@router.post("/subscriptions/cron/process-renewals")
def process_automated_renewals(
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Platform cron endpoint: scans and auto-renews all subscriptions whose cycle has expired."""
    now = datetime.now(UTC)
    expired_subs = db.scalars(
        select(Subscription).where(
            Subscription.tier != "trial",
            Subscription.status == "active",
            Subscription.cycle_end_date <= now,
        )
    ).all()

    renewed_records: list[dict[str, Any]] = []
    for sub in expired_subs:
        result = execute_cycle_renewal(sub, db)
        renewed_records.append(
            {
                "tenant_id": sub.tenant_id,
                "tier": sub.tier,
                "rollover_added": result["rollover_added"],
                "total_available_minutes": result["total_available_minutes"],
                "new_cycle_end": result["cycle_end_date"],
            }
        )

    return {
        "success": True,
        "processed_at": now.isoformat(),
        "renewed_count": len(renewed_records),
        "renewals": renewed_records,
    }


@router.post("/subscriptions/coupons/validate")
def validate_coupon_code(
    code: str = Query(..., description="Coupon code to validate"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Validate a coupon code and return discount percent and bonus minutes."""
    clean_code = code.strip().upper()
    coupon = db.scalar(select(Coupon).where(Coupon.code == clean_code))
    if not coupon or not coupon.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Coupon code '{code}' was not found or is inactive.",
        )
    if _is_expired(coupon.expires_at):
        exp_str = coupon.expires_at.strftime("%Y-%m-%d") if coupon.expires_at else "past date"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Coupon code '{code}' expired on {exp_str}.",
        )
    if coupon.times_redeemed >= coupon.max_redemptions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Coupon code '{code}' has reached its maximum redemptions.",
        )

    return {
        "valid": True,
        "code": coupon.code,
        "discount_percent": coupon.discount_percent,
        "bonus_minutes": coupon.bonus_minutes,
    }


# ================= PLATFORM ADMIN ENDPOINTS =================


@router.get("/admin/subscriptions")
def list_admin_subscriptions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> list[dict[str, Any]]:
    """Agency Admin: List all tenant subscriptions, minute balances, and trial health."""
    tenants = db.scalars(select(Tenant).order_by(Tenant.name)).all()
    results = []
    for t in tenants:
        sub = get_or_create_subscription(db, t.id)
        results.append(
            {
                "tenant_id": t.id,
                "tenant_name": t.name,
                "tier": sub.tier,
                "status": sub.status,
                "monthly_included_minutes": sub.monthly_included_minutes,
                "bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
                "used_minutes_this_cycle": round(
                    sub.trial_minutes_used if sub.tier == "trial" else sub.used_minutes_this_cycle,
                    2,
                ),
                "total_limit_minutes": round(
                    float(sub.trial_minutes_allocated)
                    if sub.tier == "trial"
                    else float(sub.monthly_included_minutes) + sub.bonus_rollover_minutes,
                    2,
                ),
                "is_trial": sub.tier == "trial",
                "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
                "trial_expired": sub.is_trial_expired,
                "applied_coupon_code": sub.applied_coupon_code,
                "cycle_end_date": sub.cycle_end_date.isoformat(),
                "auto_renew": sub.auto_renew,
                "is_cycle_locked": sub.is_cycle_locked,
                "pending_tier": sub.pending_tier,
                "pending_effective_at": (
                    sub.pending_effective_at.isoformat() if sub.pending_effective_at else None
                ),
            }
        )
    return results


@router.put("/admin/subscriptions/{tenant_id}/tier")
def admin_set_subscription_tier(
    tenant_id: str,
    req: AdminUpdateTierRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Agency Admin: Master override to change a tenant's plan tier immediately."""
    target_tier = req.tier.lower()
    if target_tier not in TIER_PLANS and target_tier != "trial":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid tier '{req.tier}'. Choose from trial, starter, pro, or enterprise.",
        )

    sub = get_or_create_subscription(db, tenant_id)
    if target_tier == "trial":
        sub.tier = "trial"
        sub.status = "trialing"
        if req.custom_minutes:
            sub.trial_minutes_allocated = req.custom_minutes
        if req.reset_usage:
            sub.trial_minutes_used = 0.0
    else:
        plan = TIER_PLANS[target_tier]
        sub.tier = target_tier
        sub.status = "active"
        sub.monthly_included_minutes = req.custom_minutes or int(plan["minutes"])
        if req.reset_usage:
            sub.used_minutes_this_cycle = 0.0
        sub.pending_tier = None
        sub.pending_effective_at = None
        sub.cycle_change_locked_until = datetime.now(UTC) + timedelta(days=30)

    db.commit()
    db.refresh(sub)
    return {
        "success": True,
        "tenant_id": tenant_id,
        "tier": sub.tier,
        "status": sub.status,
        "monthly_included_minutes": sub.monthly_included_minutes,
        "bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
        "message": f"Successfully updated tenant plan to {sub.tier.capitalize()}",
    }


@router.put("/admin/subscriptions/{tenant_id}/status")
def admin_set_subscription_status(
    tenant_id: str,
    req: AdminUpdateStatusRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Agency Admin: Master override to set tenant subscription status (active, suspended, trialing, canceled)."""
    sub = get_or_create_subscription(db, tenant_id)
    valid_statuses = {"active", "suspended", "trialing", "canceled"}
    if req.status.lower() not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{req.status}'. Choose from {valid_statuses}.",
        )
    sub.status = req.status.lower()
    db.commit()
    db.refresh(sub)
    return {
        "success": True,
        "tenant_id": tenant_id,
        "status": sub.status,
        "message": f"Subscription status updated to {sub.status}",
    }


@router.put("/admin/subscriptions/{tenant_id}/limits")
def admin_set_subscription_limits(
    tenant_id: str,
    req: AdminUpdateLimitsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Agency Admin: Adjust minute allocations and overage parameters."""
    sub = get_or_create_subscription(db, tenant_id)
    sub.monthly_included_minutes = req.monthly_included_minutes
    sub.overage_rate_usd = req.overage_rate_usd
    sub.allow_overage = req.allow_overage
    if req.billing_increment in ("minute", "second"):
        sub.billing_increment = req.billing_increment
    db.commit()
    db.refresh(sub)
    return {
        "success": True,
        "tenant_id": tenant_id,
        "monthly_included_minutes": sub.monthly_included_minutes,
        "overage_rate_usd": sub.overage_rate_usd,
        "allow_overage": sub.allow_overage,
        "billing_increment": sub.billing_increment,
        "message": "Subscription limits successfully updated",
    }


@router.post("/admin/subscriptions/{tenant_id}/grant-minutes")
def admin_grant_bonus_minutes(
    tenant_id: str,
    req: GrantMinutesRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Agency Admin: Grant immediate bonus minutes to a tenant."""
    sub = get_or_create_subscription(db, tenant_id)
    sub.bonus_rollover_minutes += float(req.bonus_minutes)
    db.commit()
    db.refresh(sub)
    return {
        "success": True,
        "tenant_id": tenant_id,
        "granted_minutes": req.bonus_minutes,
        "new_bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
        "reason": req.reason,
    }


@router.get("/admin/coupons")
def list_admin_coupons(
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> list[dict[str, Any]]:
    """Agency Admin: List all coupon codes with redemptions and active status."""
    coupons = db.scalars(select(Coupon).order_by(desc(Coupon.created_at))).all()
    return [
        {
            "id": c.id,
            "code": c.code,
            "discount_percent": c.discount_percent,
            "bonus_minutes": c.bonus_minutes,
            "max_redemptions": c.max_redemptions,
            "times_redeemed": c.times_redeemed,
            "is_active": c.is_active,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "created_at": c.created_at.isoformat(),
        }
        for c in coupons
    ]


@router.post("/admin/coupons")
def create_admin_coupon(
    req: CreateCouponRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Agency Admin: Create a new discount or bonus minute coupon code."""
    clean_code = req.code.strip().upper()
    existing = db.scalar(select(Coupon).where(Coupon.code == clean_code))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Coupon code '{clean_code}' already exists.",
        )

    expires_at = (
        datetime.now(UTC) + timedelta(days=req.expires_in_days) if req.expires_in_days else None
    )

    coupon = Coupon(
        code=clean_code,
        discount_percent=req.discount_percent,
        bonus_minutes=req.bonus_minutes,
        max_redemptions=req.max_redemptions,
        times_redeemed=0,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)

    return {
        "success": True,
        "id": coupon.id,
        "code": coupon.code,
        "discount_percent": coupon.discount_percent,
        "bonus_minutes": coupon.bonus_minutes,
        "max_redemptions": coupon.max_redemptions,
    }


@router.delete("/admin/coupons/{coupon_id}")
def delete_admin_coupon(
    coupon_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_platform_admin),
) -> dict[str, Any]:
    """Agency Admin: Deactivate a coupon code."""
    coupon = db.scalar(select(Coupon).where(Coupon.id == coupon_id))
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")
    coupon.is_active = False
    db.commit()
    return {"success": True, "message": f"Coupon '{coupon.code}' deactivated."}


# ================= STRIPE INTEGRATION & INVOICE MANAGEMENT =================


@router.post("/subscriptions/customer-portal")
def create_customer_portal_session(
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a Stripe Customer Portal session URL for managing cards & invoices."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")
    return {
        "url": f"https://billing.stripe.com/p/session/test_{uuid.uuid4().hex[:16]}",
        "message": "Redirecting to Stripe Billing Portal",
    }


@router.get("/subscriptions/invoices")
def get_tenant_invoices(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Get itemized billing invoice history for the authenticated tenant."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")
    sub = get_or_create_subscription(db, user.tenant_id)
    plan_info = TIER_PLANS.get(sub.tier, {"price_usd": 0.0, "name": "Trial Plan", "minutes": 100})

    invoices = []
    if sub.tier != "trial":
        invoices.append(
            {
                "id": f"in_{sub.id[:8]}_01",
                "number": f"INV-2026-{sub.id[:6].upper()}",
                "date": sub.cycle_start_date.strftime("%b %d, %Y"),
                "description": f"{plan_info['name']} - {plan_info['minutes']} Monthly Minutes",
                "amount_usd": float(plan_info["price_usd"]),
                "status": "paid",
                "payment_method": "Visa ending in 4242",
                "receipt_url": f"https://pay.stripe.com/receipts/acct_mock/{sub.id[:12]}",
                "rollover_credits_granted": sub.bonus_rollover_minutes,
            }
        )
    return invoices


def _find_subscription_for_stripe_event(
    event_data: dict[str, Any], db: Session
) -> Subscription | None:
    """Resolve tenant subscription from Stripe event by customer ID, subscription ID, or metadata."""
    # 1. By customer id
    customer_id = event_data.get("customer")
    if customer_id:
        sub = db.scalar(
            select(Subscription).where(Subscription.stripe_customer_id == str(customer_id))
        )
        if sub:
            return sub

    # 2. By subscription id
    sub_id = event_data.get("subscription") or event_data.get("id")
    if sub_id:
        sub = db.scalar(
            select(Subscription).where(Subscription.stripe_subscription_id == str(sub_id))
        )
        if sub:
            return sub

    # 3. By client_reference_id or metadata tenant_id
    meta_tenant_id = (
        event_data.get("metadata", {}).get("tenant_id")
        if isinstance(event_data.get("metadata"), dict)
        else None
    ) or event_data.get("client_reference_id")

    if meta_tenant_id:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == str(meta_tenant_id)))
        if sub:
            return sub

    return None


@router.post("/subscriptions/webhook")
def stripe_webhook_receiver(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Stripe webhook receiver handling automated subscription events."""
    event_type = payload.get("type", "unknown")
    event_data = payload.get("data", {}).get("object", {})

    sub = _find_subscription_for_stripe_event(event_data, db)
    action_taken = "none"

    if event_type == "invoice.payment_succeeded":
        # Recurring monthly subscription cycle renewal or paid invoice
        if sub and sub.tier != "trial":
            execute_cycle_renewal(sub, db)
            sub.status = "active"
            db.commit()
            action_taken = "cycle_renewed_with_rollover"

    elif event_type == "invoice.payment_failed":
        # Payment failed -> Mark past_due to trigger suspension gate
        if sub:
            sub.status = "past_due"
            db.commit()
            action_taken = "marked_past_due"

    elif event_type == "customer.subscription.deleted":
        # Subscription canceled in Stripe -> Cancel subscription
        if sub:
            sub.status = "canceled"
            db.commit()
            action_taken = "marked_canceled"

    elif event_type == "checkout.session.completed":
        # Customer completed initial checkout in Stripe Checkout
        if sub:
            meta = (
                event_data.get("metadata", {})
                if isinstance(event_data.get("metadata"), dict)
                else {}
            )
            tier = meta.get("tier", "starter")
            if tier in TIER_PLANS:
                sub.tier = tier
                sub.monthly_included_minutes = int(TIER_PLANS[tier]["minutes"])
            sub.status = "active"
            cust_id = event_data.get("customer")
            stripe_sub_id = event_data.get("subscription")
            if cust_id:
                sub.stripe_customer_id = str(cust_id)
            if stripe_sub_id:
                sub.stripe_subscription_id = str(stripe_sub_id)
            sub.cycle_start_date = datetime.now(UTC)
            sub.cycle_end_date = datetime.now(UTC) + timedelta(days=30)
            db.commit()
            action_taken = "checkout_activated"

    return {
        "received": True,
        "event": event_type,
        "action": action_taken,
        "tenant_id": sub.tenant_id if sub else None,
    }
