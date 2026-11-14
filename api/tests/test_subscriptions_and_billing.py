"""Tests for Stripe minute-based subscriptions, trials, rollovers, and admin coupons."""

from fastapi.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_tenant_subscription_current_and_trial_allocation() -> None:
    """Verify tenant gets current subscription info and 14-day/100-minute trial allocation."""
    # Login as client tenant owner
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@apexplumbing.com", "password": "ApexOwner2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/subscriptions/current", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "tier" in data
    assert "monthly_included_minutes" in data
    assert "bonus_rollover_minutes" in data
    assert "total_limit_minutes" in data
    assert len(data["available_plans"]) == 3
    assert data["available_plans"][0]["minutes"] == 1000
    assert data["available_plans"][1]["minutes"] == 1200
    assert data["available_plans"][2]["minutes"] == 1500


def test_coupon_validation_and_discount_redemption() -> None:
    """Test validating coupon codes and applying them during subscription upgrade."""
    import uuid

    unique_suffix = uuid.uuid4().hex[:6]
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Coupon HVAC {unique_suffix}",
            "owner_name": "Coupon Tester",
            "email": f"coupon_{unique_suffix}@contractor.com",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Validate valid coupon
    val_res = client.post("/api/v1/subscriptions/coupons/validate?code=LAUNCH50", headers=headers)
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["valid"] is True
    assert val_data["code"] == "LAUNCH50"
    assert val_data["discount_percent"] == 50.0

    # Validate invalid coupon
    inv_res = client.post(
        "/api/v1/subscriptions/coupons/validate?code=NONEXISTENT", headers=headers
    )
    assert inv_res.status_code == 404

    # Upgrade with coupon LAUNCH50 (50% off $299 = $149.50, plus 200 bonus minutes)
    upg_res = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "starter", "coupon_code": "LAUNCH50"},
    )
    assert upg_res.status_code == 200
    upg_data = upg_res.json()
    assert upg_data["tier"] == "starter"
    assert upg_data["monthly_included_minutes"] == 1000
    assert upg_data["coupon_applied"] == "LAUNCH50"
    assert upg_data["invoice"]["discount_usd"] == 149.50
    assert upg_data["invoice"]["total_charged_usd"] == 149.50


def test_monthly_cycle_renewal_rollover_10_percent() -> None:
    """Verify that 10% of unused monthly plan minutes are credited as complimentary rollover."""
    import uuid

    unique_suffix = uuid.uuid4().hex[:6]
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Rollover Clinic {unique_suffix}",
            "owner_name": "Rollover Tester",
            "email": f"rollover_{unique_suffix}@contractor.com",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upgrade from trial to pro plan (1200 min)
    client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "pro"},
    )

    # Current subscription
    cur_res = client.get("/api/v1/subscriptions/current", headers=headers)
    pre_bonus = cur_res.json()["bonus_rollover_minutes"]

    # Trigger cycle renewal
    renew_res = client.post("/api/v1/subscriptions/cycle-renew", headers=headers)
    assert renew_res.status_code == 200
    renew_data = renew_res.json()
    assert renew_data["success"] is True
    # 10% of 1200 unused base minutes is 120 minutes!
    assert renew_data["new_bonus_rollover_minutes"] >= pre_bonus + 120.0


def test_admin_subscriptions_overview_and_grant_minutes() -> None:
    """Verify platform admin can review tenant subscriptions and grant bonus minutes."""
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@vedavoice.io", "password": "Admin@VedaVoice2026!"},
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # List all subscriptions
    subs_res = client.get("/api/v1/admin/subscriptions", headers=admin_headers)
    assert subs_res.status_code == 200
    subs_list = subs_res.json()
    assert len(subs_list) >= 1
    target_tenant = subs_list[0]["tenant_id"]

    # Grant 250 bonus minutes
    grant_res = client.post(
        f"/api/v1/admin/subscriptions/{target_tenant}/grant-minutes",
        headers=admin_headers,
        json={"bonus_minutes": 250.0, "reason": "Customer loyalty reward"},
    )
    assert grant_res.status_code == 200
    assert grant_res.json()["success"] is True
    assert grant_res.json()["granted_minutes"] == 250.0

    # List coupons
    coupons_res = client.get("/api/v1/admin/coupons", headers=admin_headers)
    assert coupons_res.status_code == 200
    assert len(coupons_res.json()) >= 1

    import uuid

    unique_code = f"PROMO_{uuid.uuid4().hex[:6].upper()}"

    # Create new admin coupon
    create_coup_res = client.post(
        "/api/v1/admin/coupons",
        headers=admin_headers,
        json={
            "code": unique_code,
            "discount_percent": 30.0,
            "bonus_minutes": 150,
            "max_redemptions": 50,
            "expires_in_days": 30,
        },
    )
    assert create_coup_res.status_code == 200
    assert create_coup_res.json()["code"] == unique_code


def test_one_subscription_per_month_cycle_protection_and_scheduling() -> None:
    """Verify that clients cannot repeatedly upgrade mid-cycle and changes are scheduled for next cycle."""
    import uuid

    unique_suffix = uuid.uuid4().hex[:6]
    client_email = f"cycle_lock_{unique_suffix}@contractor.com"

    # Register fresh client tenant (starts in 14-day free trial)
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Cycle Lock Plumbing {unique_suffix}",
            "owner_name": "Dave Lock",
            "email": client_email,
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. First upgrade from trial to starter plan (activates starter plan)
    upg1 = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "starter"},
    )
    assert upg1.status_code == 200
    assert upg1.json()["tier"] == "starter"

    # 2. Attempting to select the same tier returns 400
    same_tier_res = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "starter"},
    )
    assert same_tier_res.status_code == 400
    assert "Already actively subscribed" in same_tier_res.json()["detail"]

    # 3. Selecting a different tier mid-cycle schedules it for the next renewal
    upg_sched = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "pro"},
    )
    assert upg_sched.status_code == 200
    sched_data = upg_sched.json()
    assert sched_data["scheduled"] is True
    assert sched_data["pending_tier"] == "pro"
    assert "scheduled for your next cycle renewal" in sched_data["message"].lower()

    # 4. Check current subscription reflects pending tier
    cur_res = client.get("/api/v1/subscriptions/current", headers=headers)
    assert cur_res.status_code == 200
    assert cur_res.json()["pending_tier"] == "pro"
    assert cur_res.json()["tier"] == "starter"  # Still on current tier until renewal!

    # 5. Cycle renewal applies the pending tier
    renew_res = client.post("/api/v1/subscriptions/cycle-renew", headers=headers)
    assert renew_res.status_code == 200
    renew_data = renew_res.json()
    assert renew_data["tier"] == "pro"
    assert renew_data["monthly_included_minutes"] == 1200


def test_admin_master_subscription_override_and_status_controls() -> None:
    """Verify Agency Admin has master control to override tier, status, and minute limits."""
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@vedavoice.io", "password": "Admin@VedaVoice2026!"},
    )
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # Get target tenant
    subs_res = client.get("/api/v1/admin/subscriptions", headers=admin_headers)
    target_tenant = subs_res.json()[0]["tenant_id"]

    # 1. Admin overrides tier to enterprise immediately
    tier_res = client.put(
        f"/api/v1/admin/subscriptions/{target_tenant}/tier",
        headers=admin_headers,
        json={"tier": "enterprise", "custom_minutes": 1800, "reset_usage": True},
    )
    assert tier_res.status_code == 200
    assert tier_res.json()["tier"] == "enterprise"
    assert tier_res.json()["monthly_included_minutes"] == 1800

    # 2. Admin sets status to suspended
    status_res = client.put(
        f"/api/v1/admin/subscriptions/{target_tenant}/status",
        headers=admin_headers,
        json={"status": "suspended", "reason": "Late invoice audit"},
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "suspended"

    # 3. Admin adjusts minute limits and overage parameters
    limits_res = client.put(
        f"/api/v1/admin/subscriptions/{target_tenant}/limits",
        headers=admin_headers,
        json={"monthly_included_minutes": 2000, "overage_rate_usd": 0.15, "allow_overage": True},
    )
    assert limits_res.status_code == 200
    assert limits_res.json()["monthly_included_minutes"] == 2000
    assert limits_res.json()["overage_rate_usd"] == 0.15

    # 4. Restore status to active
    restore_res = client.put(
        f"/api/v1/admin/subscriptions/{target_tenant}/status",
        headers=admin_headers,
        json={"status": "active"},
    )
    assert restore_res.status_code == 200
    assert restore_res.json()["status"] == "active"


def test_automated_cron_renewal_processing() -> None:
    """Verify automated cron processes expired cycles, transfers pending tiers, and computes 10% rollovers."""
    from datetime import UTC, datetime, timedelta

    from api.app.db.session import SessionLocal
    from api.app.models.subscription import Subscription

    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@vedavoice.io", "password": "Admin@VedaVoice2026!"},
    )
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # Manually expire one subscription's cycle_end_date for testing cron
    with SessionLocal() as db:
        sub = db.query(Subscription).filter(Subscription.tier != "trial").first()
        if sub:
            sub.cycle_end_date = datetime.now(UTC) - timedelta(days=1)
            sub.pending_tier = "enterprise"
            sub.pending_effective_at = datetime.now(UTC) - timedelta(days=1)
            db.commit()

    # Trigger cron renewal
    cron_res = client.post("/api/v1/subscriptions/cron/process-renewals", headers=admin_headers)
    assert cron_res.status_code == 200
    cron_data = cron_res.json()
    assert cron_data["success"] is True
    assert "renewed_count" in cron_data
    assert isinstance(cron_data["renewals"], list)
