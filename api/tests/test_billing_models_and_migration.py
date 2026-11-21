"""Unit tests for Phase 1: Database Migration & Billing Model Extensions.

Validates:
- Subscription model onboarding fee fields, topup minutes balance, and refund tracking fields.
- Total available minutes property factoring in base, rollover, and topup minutes.
- TopupOrder creation, persistence, and tenant relationship.
- RefundRequest creation, persistence, 50% usage gate flags, and tenant/subscription relationships.
"""

import uuid
from datetime import UTC, datetime

from api.app.db.session import SessionLocal
from api.app.models.subscription import RefundRequest, Subscription, TopupOrder
from api.app.models.tenant import Tenant


def test_subscription_onboarding_and_topup_defaults():
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Billing Model Test Tenant",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="starter",
            status="active",
            monthly_included_minutes=1000,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

        # Verify new Phase 1 fields defaults
        assert sub.onboarding_fee_usd == 0.0
        assert sub.onboarding_fee_paid is False
        assert sub.onboarding_fee_waived is False
        assert sub.topup_minutes_balance == 0.0
        assert sub.refund_status is None
        assert sub.refund_requested_at is None
        assert sub.refund_requested_usage_pct is None
        assert sub.refund_requested_amount_usd is None
        assert sub.refund_reason is None


def test_subscription_total_available_minutes_with_topup():
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Minute Calc Test Tenant",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="pro",
            status="active",
            monthly_included_minutes=2000,
            bonus_rollover_minutes=150.0,
            topup_minutes_balance=500.0,
            used_minutes_this_cycle=350.0,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)

        # Expected: 2000 + 150 + 500 - 350 = 2300.0
        assert sub.total_available_minutes == 2300.0


def test_topup_order_creation_and_relationship():
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Topup Test Tenant",
            status="active",
        )
        db.add(tenant)
        db.flush()

        order = TopupOrder(
            tenant_id=tenant.id,
            minutes=500,
            amount_usd=140.0,
            stripe_payment_intent_id="pi_test_topup_12345",
            status="completed",
        )
        db.add(order)
        db.commit()
        db.refresh(order)

        assert order.id is not None
        assert order.minutes == 500
        assert order.amount_usd == 140.0
        assert order.status == "completed"
        assert order.tenant.name == "Topup Test Tenant"
        assert len(tenant.topup_orders) >= 1


def test_refund_request_creation_and_relationship():
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(
            id=tenant_id,
            name="Refund Test Tenant",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="growth",
            status="active",
            monthly_included_minutes=1500,
            used_minutes_this_cycle=450.0,
            refund_status="requested",
            refund_requested_at=datetime.now(UTC),
            refund_requested_usage_pct=30.0,
            refund_requested_amount_usd=399.0,
            refund_reason="Service restructuring",
        )
        db.add(sub)
        db.flush()

        refund_req = RefundRequest(
            tenant_id=tenant.id,
            subscription_id=sub.id,
            cycle_used_minutes=450.0,
            cycle_base_minutes=1500,
            usage_pct=30.0,
            eligible=True,
            reason="Service restructuring and low seasonal call volume",
            status="pending",
        )
        db.add(refund_req)
        db.commit()
        db.refresh(refund_req)

        assert refund_req.id is not None
        assert refund_req.usage_pct == 30.0
        assert refund_req.eligible is True
        assert refund_req.status == "pending"
        assert refund_req.subscription.tier == "growth"
        assert refund_req.tenant.name == "Refund Test Tenant"
        assert len(sub.refund_requests) >= 1
