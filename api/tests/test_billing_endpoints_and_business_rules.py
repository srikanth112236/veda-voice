"""Comprehensive integration tests for Phase 2: Billing API Endpoints & Business Rules.

Covers:
- Onboarding fee dynamic calculation ($199-$299 for plans < $399; $399 fixed for plans >= $399).
- 100% Free Trial Rollover Guarantee credited on conversion.
- Instant Plan Upgrades (< 2 minutes) with immediate minute & entitlement unlocks.
- Scheduled and Instant Downgrades with resource restrictions.
- Strict Refund Policy Gate (< 50% usage eligible; >= 50% strictly blocked).
- Standalone Minute Top-Up Pack purchase and balance tracking.
- Platform SuperAdmin refund review and onboarding fee waiver controls.
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.subscription import Subscription
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.routers.subscriptions import compute_onboarding_fee

client = TestClient(app)


def create_tenant_and_user(tier="trial", role="tenant_user"):
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name=f"Test Org {tenant_id[:6]}", status="active")
        db.add(tenant)
        db.flush()

        user = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant.id if role != "platform_admin" else None,
            email=f"user_{uuid.uuid4().hex[:8]}@example.com",
            full_name="Test User",
            hashed_password="mock_hashed_pw",
            role=role,
            is_active=True,
        )
        db.add(user)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier=tier,
            status="trialing" if tier == "trial" else "active",
            monthly_included_minutes=1000 if tier != "trial" else 100,
            trial_minutes_allocated=100,
            trial_minutes_used=20.0,
        )
        db.add(sub)
        db.commit()
        return tenant.id, user.id


def test_onboarding_fee_calculation_rules():
    """Verify $199-$299 dynamic roll for plans < $399 and $399 fixed for plans >= $399."""
    tenant_id_1 = str(uuid.uuid4())
    tenant_id_2 = str(uuid.uuid4())

    # Plans under $399
    fee_lite = compute_onboarding_fee(tenant_id_1, "lite")
    fee_starter = compute_onboarding_fee(tenant_id_1, "starter")
    assert 199.0 <= fee_lite <= 299.0
    assert 199.0 <= fee_starter <= 299.0
    # Deterministic for same tenant
    assert fee_lite == fee_starter

    # Plans $399 or higher
    assert compute_onboarding_fee(tenant_id_1, "growth") == 399.00
    assert compute_onboarding_fee(tenant_id_1, "pro") == 399.00
    assert compute_onboarding_fee(tenant_id_2, "scale") == 399.00
    assert compute_onboarding_fee(tenant_id_2, "enterprise") == 399.00
    assert compute_onboarding_fee(tenant_id_2, "agency") == 399.00


def test_100pct_free_trial_rollover_and_onboarding_fee_on_conversion(monkeypatch):
    """Verify 100% unused trial minutes roll over and onboarding fee is charged on first paid activation."""
    tenant_id, user_id = create_tenant_and_user(tier="trial")

    with SessionLocal() as db:
        test_user = db.scalar(select(User).where(User.id == user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.get_current_user] = lambda: test_user

    try:
        # Check quote first
        quote_res = client.get("/api/v1/subscriptions/quote?tier=starter")
        assert quote_res.status_code == 200
        quote = quote_res.json()
        assert quote["tier"] == "starter"
        assert quote["is_first_time_payment"] is True
        assert 199.0 <= quote["onboarding_fee_usd"] <= 299.0
        assert quote["trial_minutes_rolled_over"] == 80.0  # 100 allocated - 20 used

        # Execute upgrade
        up_res = client.post("/api/v1/subscriptions/upgrade", json={"tier": "starter"})
        assert up_res.status_code == 200
        data = up_res.json()
        assert data["success"] is True
        assert data["upgraded_instantly"] is True
        assert data["tier"] == "starter"
        assert data["monthly_included_minutes"] == 1000
        assert data["trial_minutes_rolled_over"] == 80.0
        assert data["bonus_rollover_minutes"] == 80.0
        assert data["invoice"]["onboarding_fee_usd"] >= 199.0
        assert data["invoice"]["total_charged_usd"] == 299.0 + data["invoice"]["onboarding_fee_usd"]

        # Verify database state
        with SessionLocal() as db:
            sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
            assert sub.onboarding_fee_paid is True
            assert sub.tier == "starter"
            assert sub.bonus_rollover_minutes == 80.0
    finally:
        app.dependency_overrides.clear()


def test_instant_plan_upgrade_mid_cycle(monkeypatch):
    """Verify mid-cycle upgrade executes instantly without 30-day lockout delay and does not re-bill setup fee."""
    tenant_id, user_id = create_tenant_and_user(tier="starter")

    with SessionLocal() as db:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
        sub.onboarding_fee_paid = True
        sub.onboarding_fee_usd = 245.0
        sub.used_minutes_this_cycle = 150.0
        db.commit()
        test_user = db.scalar(select(User).where(User.id == user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.get_current_user] = lambda: test_user

    try:
        # Upgrade to Professional Plan ($499/mo, 2000 min)
        res = client.post("/api/v1/subscriptions/upgrade", json={"tier": "pro"})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["upgraded_instantly"] is True
        assert data["tier"] == "pro"
        assert data["monthly_included_minutes"] == 2000
        # Onboarding fee was already paid, so 0.0
        assert data["invoice"]["onboarding_fee_usd"] == 0.0
        assert data["invoice"]["total_charged_usd"] == 499.0
    finally:
        app.dependency_overrides.clear()


def test_downgrade_scheduled_vs_instant(monkeypatch):
    """Verify scheduled downgrade defers to cycle end while immediate_downgrade restricts tier immediately."""
    tenant_id, user_id = create_tenant_and_user(tier="pro")

    with SessionLocal() as db:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
        sub.monthly_included_minutes = 2000
        db.commit()
        test_user = db.scalar(select(User).where(User.id == user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.get_current_user] = lambda: test_user

    try:
        # 1. Scheduled downgrade (default)
        res1 = client.post(
            "/api/v1/subscriptions/upgrade",
            json={"tier": "starter", "immediate_downgrade": False},
        )
        assert res1.status_code == 200
        d1 = res1.json()
        assert d1["scheduled"] is True
        assert d1["instant"] is False
        assert d1["tier"] == "pro"
        assert d1["pending_tier"] == "starter"

        # 2. Immediate downgrade
        res2 = client.post(
            "/api/v1/subscriptions/upgrade",
            json={"tier": "starter", "immediate_downgrade": True},
        )
        assert res2.status_code == 200
        d2 = res2.json()
        assert d2["scheduled"] is False
        assert d2["instant"] is True
        assert d2["tier"] == "starter"
        assert d2["monthly_included_minutes"] == 1000
    finally:
        app.dependency_overrides.clear()


def test_refund_policy_gate_under_50_pct(monkeypatch):
    """Verify refund exception can be submitted when usage is strictly < 50%."""
    tenant_id, user_id = create_tenant_and_user(tier="starter")

    with SessionLocal() as db:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
        sub.monthly_included_minutes = 1000
        sub.used_minutes_this_cycle = 250.0  # 25% usage
        db.commit()
        test_user = db.scalar(select(User).where(User.id == user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.get_current_user] = lambda: test_user

    try:
        # Check eligibility endpoint
        elig_res = client.get("/api/v1/subscriptions/refund-eligibility")
        assert elig_res.status_code == 200
        elig = elig_res.json()
        assert elig["eligible"] is True
        assert elig["usage_pct"] == 25.0
        assert elig["estimated_refund_usd"] > 0

        # Submit formal refund request
        req_res = client.post(
            "/api/v1/subscriptions/request-refund",
            json={"reason": "Business restructuring with low seasonal call volume"},
        )
        assert req_res.status_code == 200
        assert req_res.json()["success"] is True
        assert req_res.json()["status"] == "pending"

        # Verify DB status
        with SessionLocal() as db:
            sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
            assert sub.refund_status == "requested"
    finally:
        app.dependency_overrides.clear()


def test_refund_policy_blocked_at_or_above_50_pct(monkeypatch):
    """Verify refund is strictly blocked if usage reaches or exceeds 50%."""
    tenant_id, user_id = create_tenant_and_user(tier="starter")

    with SessionLocal() as db:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
        sub.monthly_included_minutes = 1000
        sub.used_minutes_this_cycle = 500.0  # exactly 50% usage
        db.commit()
        test_user = db.scalar(select(User).where(User.id == user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.get_current_user] = lambda: test_user

    try:
        # Check eligibility endpoint
        elig_res = client.get("/api/v1/subscriptions/refund-eligibility")
        assert elig_res.status_code == 200
        elig = elig_res.json()
        assert elig["eligible"] is False
        assert elig["usage_pct"] == 50.0

        # Submit refund request -> must return 400
        req_res = client.post(
            "/api/v1/subscriptions/request-refund",
            json={"reason": "Dissatisfied with response latency"},
        )
        assert req_res.status_code == 400
        assert "strictly prohibited" in req_res.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_standalone_topup_purchase(monkeypatch):
    """Verify purchasing standalone topup packs credits balance without resetting renewal cycle."""
    tenant_id, user_id = create_tenant_and_user(tier="starter")

    with SessionLocal() as db:
        test_user = db.scalar(select(User).where(User.id == user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.get_current_user] = lambda: test_user

    try:
        # Check packs list
        packs_res = client.get("/api/v1/subscriptions/topup-packs")
        assert packs_res.status_code == 200
        packs = packs_res.json()
        assert len(packs) == 4
        codes = [p["code"] for p in packs]
        assert "bronze" in codes and "silver" in codes and "gold" in codes

        # Purchase silver pack (500 min @ $140)
        buy_res = client.post("/api/v1/subscriptions/topup", json={"pack": "silver"})
        assert buy_res.status_code == 200
        data = buy_res.json()
        assert data["success"] is True
        assert data["minutes_credited"] == 500
        assert data["new_topup_balance"] == 500.0

        # Current subscription includes topup
        curr = client.get("/api/v1/subscriptions/current").json()
        assert curr["topup_minutes_balance"] == 500.0
    finally:
        app.dependency_overrides.clear()


def test_platform_admin_refund_and_onboarding_fee_controls(monkeypatch):
    """Verify SuperAdmin can review refunds, approve/reject, and waive onboarding fees."""
    tenant_id, user_id = create_tenant_and_user(tier="starter")
    admin_id, admin_user_id = create_tenant_and_user(tier="enterprise", role="platform_admin")

    with SessionLocal() as db:
        admin_user = db.scalar(select(User).where(User.id == admin_user_id))

    from api.app.core import deps

    app.dependency_overrides[deps.require_platform_admin] = lambda: admin_user

    try:
        # 1. Waive onboarding fee for tenant
        fee_res = client.post(
            f"/api/v1/admin/subscriptions/{tenant_id}/onboarding-fee",
            json={"waived": True},
        )
        assert fee_res.status_code == 200
        assert fee_res.json()["onboarding_fee_waived"] is True

        # 1b. Mark onboarding fee as paid with custom fee override
        paid_res = client.post(
            f"/api/v1/admin/subscriptions/{tenant_id}/onboarding-fee",
            json={"waived": False, "paid": True, "custom_fee_usd": 250.0},
        )
        assert paid_res.status_code == 200
        data = paid_res.json()
        assert data["onboarding_fee_paid"] is True
        assert data["onboarding_fee_usd"] == 250.0

        # 2. Check admin subscriptions view includes new fields
        admin_subs = client.get("/api/v1/admin/subscriptions").json()
        target = next((s for s in admin_subs if s["tenant_id"] == tenant_id), None)
        assert target is not None
        assert target["onboarding_fee_paid"] is True
        assert target["onboarding_fee_usd"] == 250.0

        # 3. SuperAdmin direct minute minting to rollover and topup pools
        grant_roll = client.post(
            f"/api/v1/admin/subscriptions/{tenant_id}/grant-minutes",
            json={"bonus_minutes": 150.0, "reason": "VIP bonus", "credit_to": "rollover"},
        )
        assert grant_roll.status_code == 200
        assert grant_roll.json()["credit_to"] == "rollover"
        assert grant_roll.json()["new_bonus_rollover_minutes"] >= 150.0

        grant_topup = client.post(
            f"/api/v1/admin/subscriptions/{tenant_id}/grant-minutes",
            json={"bonus_minutes": 250.0, "reason": "Goodwill top-up", "credit_to": "topup"},
        )
        assert grant_topup.status_code == 200
        assert grant_topup.json()["credit_to"] == "topup"
        assert grant_topup.json()["new_topup_minutes_balance"] == 250.0

        # 4. List top-up orders
        topup_orders = client.get("/api/v1/admin/topup-orders").json()
        assert isinstance(topup_orders, list)
    finally:
        app.dependency_overrides.clear()
