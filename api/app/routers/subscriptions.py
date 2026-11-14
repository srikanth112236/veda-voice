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
from api.app.models.subscription import Coupon, Subscription
from api.app.models.tenant import Tenant
from api.app.models.user import User

router = APIRouter(prefix="/api/v1", tags=["subscriptions"])

# Tier minute definitions and monthly prices
TIER_PLANS: dict[str, dict[str, Any]] = {
    "starter": {"minutes": 1000, "price_usd": 299.00, "name": "Starter Plan"},
    "pro": {"minutes": 1200, "price_usd": 399.00, "name": "Professional Plan"},
    "enterprise": {"minutes": 1500, "price_usd": 499.00, "name": "Enterprise Scale Plan"},
}


class UpgradeSubscriptionRequest(BaseModel):
    tier: str = Field(..., description="Target tier: starter, pro, or enterprise")
    coupon_code: str | None = Field(
        None, description="Optional coupon code for discount/bonus minutes"
    )
    payment_method_id: str | None = Field(
        None, description="Stripe payment method token or test card"
    )


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


def _is_expired(dt: datetime | None) -> bool:
    if not dt:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return datetime.now(UTC) > dt


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
        "is_trial": sub.tier == "trial",
        "trial_days": sub.trial_days,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "trial_expired": sub.is_trial_expired,
        "trial_minutes_allocated": sub.trial_minutes_allocated,
        "trial_minutes_used": round(sub.trial_minutes_used, 2),
        "cycle_start_date": sub.cycle_start_date.isoformat(),
        "cycle_end_date": sub.cycle_end_date.isoformat(),
        "applied_coupon_code": sub.applied_coupon_code,
        "available_plans": [
            {
                "tier": "starter",
                "name": "Starter",
                "minutes": 1000,
                "price_usd": 299.00,
                "overage_usd": 0.20,
            },
            {
                "tier": "pro",
                "name": "Professional",
                "minutes": 1200,
                "price_usd": 399.00,
                "overage_usd": 0.20,
            },
            {
                "tier": "enterprise",
                "name": "Enterprise Scale",
                "minutes": 1500,
                "price_usd": 499.00,
                "overage_usd": 0.20,
            },
        ],
    }


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


@router.post("/subscriptions/cycle-renew")
def cycle_renewal_rollover(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Simulate or execute monthly billing renewal with 10% complimentary unused rollover."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    sub = get_or_create_subscription(db, user.tenant_id)
    if sub.tier == "trial":
        raise HTTPException(
            status_code=400, detail="Trial subscriptions do not cycle renew. Upgrade to paid tier."
        )

    # Rollover Rule 2: 10% of unused monthly plan minutes roll over as complimentary bonus minutes!
    unused_base_minutes = max(
        0.0, float(sub.monthly_included_minutes) - sub.used_minutes_this_cycle
    )
    complimentary_rollover_bonus = round(unused_base_minutes * 0.10, 2)

    sub.bonus_rollover_minutes += complimentary_rollover_bonus
    sub.used_minutes_this_cycle = 0.0
    sub.cycle_start_date = datetime.now(UTC)
    sub.cycle_end_date = datetime.now(UTC) + timedelta(days=30)

    db.commit()
    db.refresh(sub)

    return {
        "success": True,
        "message": f"Cycle renewed. 10% unused complimentary rollover added ({complimentary_rollover_bonus} minutes).",
        "new_bonus_rollover_minutes": round(sub.bonus_rollover_minutes, 2),
        "total_available_minutes": round(
            float(sub.monthly_included_minutes) + sub.bonus_rollover_minutes, 2
        ),
        "cycle_end_date": sub.cycle_end_date.isoformat(),
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
            }
        )
    return results


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


@router.post("/subscriptions/webhook")
def stripe_webhook_receiver(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Stripe webhook receiver handling automated subscription events."""
    event_type = payload.get("type", "unknown")
    event_data = payload.get("data", {}).get("object", {})

    if event_type == "invoice.payment_succeeded":
        customer_id = event_data.get("customer")
        if customer_id:
            sub = db.scalar(
                select(Subscription).where(Subscription.stripe_customer_id == customer_id)
            )
            if sub and sub.tier != "trial":
                unused = max(0.0, float(sub.monthly_included_minutes) - sub.used_minutes_this_cycle)
                sub.bonus_rollover_minutes += round(unused * 0.10, 2)
                sub.used_minutes_this_cycle = 0.0
                sub.cycle_start_date = datetime.now(UTC)
                sub.cycle_end_date = datetime.now(UTC) + timedelta(days=30)
                db.commit()

    return {"received": True, "event": event_type}
