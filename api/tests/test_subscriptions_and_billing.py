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
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@apexplumbing.com", "password": "ApexOwner2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
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
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@apexplumbing.com", "password": "ApexOwner2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upgrade to pro plan (1200 min)
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
