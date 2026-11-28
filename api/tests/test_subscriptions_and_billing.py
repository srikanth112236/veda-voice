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
    assert len(data["available_plans"]) >= 3


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
    # Starter plan includes dynamic onboarding fee between $199 and $299 for first-time paid activation
    assert (
        upg_data["invoice"]["total_charged_usd"]
        == 149.50 + upg_data["invoice"]["onboarding_fee_usd"]
    )
    assert 199.0 <= upg_data["invoice"]["onboarding_fee_usd"] <= 299.0


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
    import uuid

    unique_suffix = uuid.uuid4().hex[:6]
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Admin Overview Corp {unique_suffix}",
            "owner_name": "Overview Tester",
            "email": f"admin_ov_{unique_suffix}@contractor.com",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200

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
    matching_subs = [s for s in subs_list if unique_suffix in s.get("tenant_name", "")]
    target_tenant = matching_subs[0]["tenant_id"] if matching_subs else subs_list[0]["tenant_id"]

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

    # 3. Selecting a lower tier (downgrade) mid-cycle schedules it for the next renewal
    down_sched = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "lite"},
    )
    assert down_sched.status_code == 200
    sched_data = down_sched.json()
    assert sched_data["scheduled"] is True
    assert sched_data["pending_tier"] == "lite"
    assert "scheduled for your next cycle renewal" in sched_data["message"].lower()

    # 4. Check current subscription reflects pending tier
    cur_res = client.get("/api/v1/subscriptions/current", headers=headers)
    assert cur_res.status_code == 200
    assert cur_res.json()["pending_tier"] == "lite"
    assert cur_res.json()["tier"] == "starter"  # Still on current tier until renewal!

    # 5. Cycle renewal applies the pending tier
    renew_res = client.post("/api/v1/subscriptions/cycle-renew", headers=headers)
    assert renew_res.status_code == 200
    renew_data = renew_res.json()
    assert renew_data["tier"] == "lite"
    assert renew_data["monthly_included_minutes"] in (300, 500)


def test_admin_master_subscription_override_and_status_controls() -> None:
    """Verify Agency Admin has master control to override tier, status, and minute limits."""
    import uuid

    unique_suffix = uuid.uuid4().hex[:6]
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Admin Control Corp {unique_suffix}",
            "owner_name": "Admin Tester",
            "email": f"admin_ctrl_{unique_suffix}@contractor.com",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200

    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@vedavoice.io", "password": "Admin@VedaVoice2026!"},
    )
    assert admin_login.status_code == 200
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # Find the newly created target tenant in admin subscriptions
    subs_res = client.get("/api/v1/admin/subscriptions", headers=admin_headers)
    matching_subs = [s for s in subs_res.json() if unique_suffix in s.get("tenant_name", "")]
    target_tenant = (
        matching_subs[0]["tenant_id"] if matching_subs else subs_res.json()[0]["tenant_id"]
    )

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


def test_branch_plan_downgrade_guard() -> None:
    """Verify that multi-location tenants cannot downgrade to single-location plans without removing excess branches."""
    import uuid

    from api.app.db.session import SessionLocal
    from api.app.models.location import Location

    suffix = uuid.uuid4().hex[:6]
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Multi-Branch Corp {suffix}",
            "owner_name": "Branch Tester",
            "email": f"branch_{suffix}@multilocation.com",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Retrieve tenant ID
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    tenant_id = me_res.json()["tenant_id"]

    # Upgrade to Scale tier (allows up to 25 branches)
    upg_scale = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "scale"},
    )
    assert upg_scale.status_code == 200

    # Create 3 active locations for this tenant
    with SessionLocal() as db:
        for idx in range(3):
            loc = Location(
                tenant_id=tenant_id,
                name=f"Branch {idx + 1}",
                code=f"BRANCH_{suffix[:4]}_{idx + 1}",
                city="Austin",
                state="TX",
                postal_code=f"7870{idx + 1}",
                is_active=True,
            )
            db.add(loc)
        db.commit()

    # Pre-downgrade check to Starter (allows max 1 location) -> should report allowed=False
    chk_res = client.get(
        "/api/v1/subscriptions/check-downgrade?target_tier=starter", headers=headers
    )
    assert chk_res.status_code == 200
    chk_data = chk_res.json()
    assert chk_data["allowed"] is False
    assert any(e["resource"] == "locations" for e in chk_data["excess_resources"])

    # Attempt to downgrade to starter -> must be blocked with HTTP 400
    down_res = client.post(
        "/api/v1/subscriptions/upgrade",
        headers=headers,
        json={"tier": "starter"},
    )
    assert down_res.status_code == 400
    assert "Resource limits exceeded" in down_res.json()["detail"]
    assert "locations" in down_res.json()["detail"].lower()


def test_minute_vs_second_telecom_billing_mode() -> None:
    """Verify telephony billing supports both standard 60-second rounding and per-second precision."""
    import uuid

    from api.app.db.session import SessionLocal
    from api.app.models.call import Call
    from api.app.models.tenant import PhoneNumber

    suffix = uuid.uuid4().hex[:6]
    dialed_num = f"+1800{suffix[:7].ljust(7, '0')}"
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Precision Telecom {suffix}",
            "owner_name": "Telecom Tester",
            "email": f"telecom_{suffix}@telecom.com",
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    tenant_id = me_res.json()["tenant_id"]

    # Assign dedicated dialed number to this tenant
    with SessionLocal() as db:
        pn = PhoneNumber(
            tenant_id=tenant_id,
            e164=dialed_num,
            status="active",
        )
        db.add(pn)
        db.commit()

    from api.app.core.config import settings

    internal_headers = {"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY}

    # 1. Test 60-second minute rounding mode (default)
    call_id_1 = f"call_min_{uuid.uuid4().hex[:8]}"
    start_res = client.post(
        "/api/v1/internal/calls/start",
        headers=internal_headers,
        json={
            "call_id": call_id_1,
            "caller_number": "+15125551234",
            "dialed_number": dialed_num,
            "direction": "inbound",
        },
    )
    assert start_res.status_code == 200
    call_token_1 = start_res.json()["call_token"]

    # End call with duration 75.0s (in 60s rounding, this rounds up to 2.0 billable minutes)
    end_res_1 = client.post(
        "/api/v1/internal/calls/complete",
        headers={"Authorization": f"Bearer {call_token_1}"},
        json={
            "call_id": call_id_1,
            "caller_number": "+15125551234",
            "dialed_number": dialed_num,
            "started_at": "2026-11-17T12:00:00Z",
            "duration_s": 75.0,
            "outcome": "completed",
            "tags": [],
            "transcript": [{"role": "user", "content": "Hello"}],
        },
    )
    assert end_res_1.status_code == 200

    with SessionLocal() as db:
        c1 = db.query(Call).filter(Call.call_id == call_id_1).first()
        assert c1 is not None
        assert c1.billable_minutes == 2.0

    # 2. Switch billing mode to 'second' precision
    mode_res = client.patch(
        "/api/v1/subscriptions/billing-mode",
        headers=headers,
        json={"billing_increment": "second"},
    )
    assert mode_res.status_code == 200
    assert mode_res.json()["billing_increment"] == "second"

    # End a second call with duration 75.0s (in second precision, 75s / 60s = 1.25 billable minutes)
    call_id_2 = f"call_sec_{uuid.uuid4().hex[:8]}"
    start_res_2 = client.post(
        "/api/v1/internal/calls/start",
        headers=internal_headers,
        json={
            "call_id": call_id_2,
            "caller_number": "+15125551234",
            "dialed_number": dialed_num,
            "direction": "inbound",
        },
    )
    assert start_res_2.status_code == 200
    call_token_2 = start_res_2.json()["call_token"]

    end_res_2 = client.post(
        "/api/v1/internal/calls/complete",
        headers={"Authorization": f"Bearer {call_token_2}"},
        json={
            "call_id": call_id_2,
            "caller_number": "+15125551234",
            "dialed_number": dialed_num,
            "started_at": "2026-11-17T12:05:00Z",
            "duration_s": 75.0,
            "outcome": "completed",
            "tags": [],
            "transcript": [{"role": "user", "content": "Second precision call"}],
        },
    )
    assert end_res_2.status_code == 200

    with SessionLocal() as db:
        c2 = db.query(Call).filter(Call.call_id == call_id_2).first()
        assert c2 is not None
        assert c2.billable_minutes == 1.25


def test_subscription_quote_and_refund_eligibility_api_v1() -> None:
    """Verify that quote and refund-eligibility endpoints are cleanly accessible under /api/v1/."""
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@apexplumbing.com", "password": "ApexOwner2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test quote endpoint under /api/v1/subscriptions/quote
    quote_res = client.get("/api/v1/subscriptions/quote?tier=starter", headers=headers)
    assert quote_res.status_code == 200
    q = quote_res.json()
    assert q["tier"] == "starter"
    assert q["base_price_usd"] == 299.0
    assert "onboarding_fee_usd" in q
    assert "total_due_today_usd" in q
    assert q["included_minutes"] == 1000

    # 2. Test refund-eligibility endpoint under /api/v1/subscriptions/refund-eligibility
    refund_res = client.get("/api/v1/subscriptions/refund-eligibility", headers=headers)
    assert refund_res.status_code == 200
    r = refund_res.json()
    assert "eligible" in r
    assert "usage_pct" in r
    assert "monthly_included_minutes" in r
    assert "policy_terms" in r

    # 3. Test topup-packs endpoint under /api/v1/subscriptions/topup-packs
    packs_res = client.get("/api/v1/subscriptions/topup-packs", headers=headers)
    assert packs_res.status_code == 200
    packs = packs_res.json()
    assert len(packs) >= 4
