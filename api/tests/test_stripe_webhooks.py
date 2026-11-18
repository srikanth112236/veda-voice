"""Tests for Automated Stripe Webhook Synchronization.

Validates:
1. invoice.payment_succeeded executes monthly renewal and credits 10% complimentary rollover.
2. invoice.payment_failed marks subscription as past_due.
3. customer.subscription.deleted marks subscription as canceled.
4. checkout.session.completed activates subscription with chosen tier and connects customer/sub IDs.
"""

import uuid

from fastapi.testclient import TestClient

from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.subscription import Subscription
from api.app.models.tenant import Tenant

client = TestClient(app)


def setup_function() -> None:
    init_db()


def test_stripe_webhook_invoice_payment_succeeded_with_rollover() -> None:
    """Verify invoice.payment_succeeded triggers 10% complimentary rollover and resets cycle."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    cust_id = f"cus_test_{suffix}"

    try:
        tenant = Tenant(
            name=f"Stripe Webhook Plumbing {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.flush()

        # Starter tier (1000 min), 400 min used -> 600 min unused -> 60 min rollover
        sub = Subscription(
            tenant_id=tenant.id,
            tier="starter",
            status="active",
            monthly_included_minutes=1000,
            used_minutes_this_cycle=400.0,
            bonus_rollover_minutes=0.0,
            stripe_customer_id=cust_id,
        )
        db.add(sub)
        db.commit()

        # Dispatch Stripe Webhook
        res = client.post(
            "/api/v1/subscriptions/webhook",
            json={
                "type": "invoice.payment_succeeded",
                "data": {
                    "object": {
                        "customer": cust_id,
                        "subscription": f"sub_{suffix}",
                        "billing_reason": "subscription_cycle",
                    }
                },
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["received"] is True
        assert data["event"] == "invoice.payment_succeeded"
        assert data["action"] == "cycle_renewed_with_rollover"

        # Verify DB state
        db.refresh(sub)
        assert sub.status == "active"
        assert sub.used_minutes_this_cycle == 0.0
        assert sub.bonus_rollover_minutes == 60.0  # 10% of 600 unused minutes

    finally:
        db.close()


def test_stripe_webhook_invoice_payment_failed() -> None:
    """Verify invoice.payment_failed marks tenant subscription as past_due."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    cust_id = f"cus_failed_{suffix}"

    try:
        tenant = Tenant(
            name=f"Failed Payment Tenant {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="starter",
            status="active",
            stripe_customer_id=cust_id,
        )
        db.add(sub)
        db.commit()

        res = client.post(
            "/api/v1/subscriptions/webhook",
            json={
                "type": "invoice.payment_failed",
                "data": {
                    "object": {
                        "customer": cust_id,
                    }
                },
            },
        )
        assert res.status_code == 200
        assert res.json()["action"] == "marked_past_due"

        db.refresh(sub)
        assert sub.status == "past_due"

    finally:
        db.close()


def test_stripe_webhook_customer_subscription_deleted() -> None:
    """Verify customer.subscription.deleted marks subscription as canceled."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    cust_id = f"cus_del_{suffix}"

    try:
        tenant = Tenant(
            name=f"Canceled Sub Tenant {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="pro",
            status="active",
            stripe_customer_id=cust_id,
        )
        db.add(sub)
        db.commit()

        res = client.post(
            "/api/v1/subscriptions/webhook",
            json={
                "type": "customer.subscription.deleted",
                "data": {
                    "object": {
                        "customer": cust_id,
                    }
                },
            },
        )
        assert res.status_code == 200
        assert res.json()["action"] == "marked_canceled"

        db.refresh(sub)
        assert sub.status == "canceled"

    finally:
        db.close()


def test_stripe_webhook_checkout_session_completed() -> None:
    """Verify checkout.session.completed activates subscription to chosen tier."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    new_cust_id = f"cus_checkout_{suffix}"
    new_sub_id = f"sub_checkout_{suffix}"

    try:
        tenant = Tenant(
            name=f"Checkout Tenant {suffix}",
            timezone="America/New_York",
            status="active",
        )
        db.add(tenant)
        db.flush()

        # Starts on trial
        sub = Subscription(
            tenant_id=tenant.id,
            tier="trial",
            status="trialing",
            trial_minutes_allocated=100,
        )
        db.add(sub)
        db.commit()

        res = client.post(
            "/api/v1/subscriptions/webhook",
            json={
                "type": "checkout.session.completed",
                "data": {
                    "object": {
                        "client_reference_id": tenant.id,
                        "customer": new_cust_id,
                        "subscription": new_sub_id,
                        "metadata": {"tier": "pro"},
                    }
                },
            },
        )
        assert res.status_code == 200
        assert res.json()["action"] == "checkout_activated"

        db.refresh(sub)
        assert sub.status == "active"
        assert sub.tier == "pro"
        assert sub.monthly_included_minutes in (1200, 2000)
        assert sub.stripe_customer_id == new_cust_id
        assert sub.stripe_subscription_id == new_sub_id

    finally:
        db.close()
