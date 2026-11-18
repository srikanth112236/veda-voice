"""Comprehensive Test Suite for Milestones M5c & M5d: Plans, 4-Tier Entitlements & Trial Abuse Controls.

Tests:
1. Public 7-Plan Catalog Endpoint (pricing, minutes, overage, entitlements matrix).
2. 4-Tier Entitlement Resolver (Plan -> Trial defaults -> Agency Overrides -> Hard Compliance).
3. Hard Compliance Non-Bypassability (Category E cold calling stripped from any tier/override).
4. Feature Flag Enforcement & Error Responses.
5. Trial Abuse Controls (Disposable email rejection, phone/card deduplication).
6. 14-Day / 100-Minute & 25-Outbound-Call Trial Limits in Compliance Gate.
7. Pre-Downgrade Gate (Excess resources block downgrade until cleared).
8. Admin Entitlement Overrides CRUD & Audit Tracking.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.entitlement import (
    TenantEntitlementOverride,
)
from api.app.models.subscription import Subscription
from api.app.models.tenant import PhoneNumber
from api.app.models.user import User
from api.app.services.compliance import evaluate_compliance_gate_v2
from api.app.services.entitlements import (
    check_tenant_entitlement,
    resolve_tenant_entitlements,
)

client = TestClient(app)


def _setup_test_tenant(tier: str = "trial") -> tuple[str, str, str, str]:
    """Helper to register a clean tenant and return (tenant_id, user_id, caller_phone, auth_token)."""
    unique = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"entitlements_{unique}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Entitlements Plumbing {unique}",
            "owner_name": "Entitlement Tester",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
        },
    )
    assert reg_res.status_code == 200
    data = reg_res.json()
    tenant_id = data["user"]["tenant_id"]
    user_id = data["user"]["id"]
    token = data["access_token"]

    if tier != "trial":
        with SessionLocal() as db:
            sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
            if sub:
                sub.tier = tier
                sub.status = "active"
                db.commit()

    return tenant_id, user_id, test_number, token


def _get_admin_token() -> str:
    """Helper to generate platform admin access token."""
    with SessionLocal() as db:
        admin_user = db.scalar(select(User).where(User.role == "platform_admin"))
        if not admin_user:
            admin_user = User(
                email="admin@vedavoice.com",
                full_name="Platform Admin",
                role="platform_admin",
                is_active=True,
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)
        return create_access_token({"sub": admin_user.id, "role": "platform_admin"})


def test_public_plans_catalog() -> None:
    """Milestone M5c: Public 7-plan catalog endpoint."""
    res = client.get("/api/v1/plans")
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) >= 5

    codes = [p["code"] for p in plans]
    assert "lite" in codes
    assert "starter" in codes
    assert "growth" in codes
    assert "pro" in codes
    assert "scale" in codes

    lite = next(p for p in plans if p["code"] == "lite")
    assert lite["price_usd"] == 99.0
    assert lite["included_minutes"] == 300
    assert lite["entitlements"]["crm.connectors.max"] == 1
    assert lite["entitlements"]["outbound.categories"] == ["B"]

    growth = next(p for p in plans if p["code"] == "growth")
    assert growth["price_usd"] == 399.0
    assert growth["included_minutes"] == 1500
    assert "C" in growth["entitlements"]["outbound.categories"]


def test_entitlement_resolver_4_tiers() -> None:
    """Milestone M5d: 4-Tier Entitlement Resolver logic."""
    tenant_id, _, _, token = _setup_test_tenant(tier="starter")

    with SessionLocal() as db:
        # Tier 1: Starter baseline
        ent1 = resolve_tenant_entitlements(db, tenant_id)
        assert ent1["numbers.max"] == 2
        assert ent1["calendar.round_robin"] is False
        assert ent1["outbound.categories"] == ["B"]

        # Tier 3: Add Agency Override for numbers.max and calendar.round_robin
        db.add(
            TenantEntitlementOverride(
                tenant_id=tenant_id,
                key="numbers.max",
                value=7,
                reason="Agency custom enterprise add-on",
            )
        )
        db.add(
            TenantEntitlementOverride(
                tenant_id=tenant_id,
                key="calendar.round_robin",
                value=True,
                reason="Multi-staff pilot grant",
            )
        )
        # Attempt to override with Category E (Cold calling) -> must be blocked by Tier 4
        db.add(
            TenantEntitlementOverride(
                tenant_id=tenant_id,
                key="outbound.categories",
                value=["B", "C", "D", "E"],
                reason="Prohibited cold call request",
            )
        )
        db.commit()

        # Resolve after overrides
        ent2 = resolve_tenant_entitlements(db, tenant_id)
        assert ent2["numbers.max"] == 7  # Override applied
        assert ent2["calendar.round_robin"] is True  # Override applied

        # Tier 4: Hard Compliance Constraint enforces cold calling prohibition
        assert "E" not in ent2["outbound.categories"]
        assert "B" in ent2["outbound.categories"]


def test_check_tenant_entitlement_helper() -> None:
    """Verify check_tenant_entitlement helper rejects actions exceeding plan limits."""
    tenant_id, _, _, _ = _setup_test_tenant(tier="starter")

    with SessionLocal() as db:
        # Starter has numbers.max = 2
        ok, err = check_tenant_entitlement(db, tenant_id, "numbers.max", requested_value=2)
        assert ok is True
        assert err is None

        # Requesting 3 numbers on Starter should be rejected
        fail, err_msg = check_tenant_entitlement(db, tenant_id, "numbers.max", requested_value=3)
        assert fail is False
        assert "Limit reached" in err_msg

        # Starter has calendar.round_robin = False
        fail_rr, err_rr = check_tenant_entitlement(db, tenant_id, "calendar.round_robin")
        assert fail_rr is False
        assert "not included" in err_rr


def test_trial_entitlements_endpoint() -> None:
    """Verify GET /api/v1/entitlements returns resolved limits and trial meters."""
    tenant_id, _, _, token = _setup_test_tenant(tier="trial")

    res = client.get("/api/v1/entitlements", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()

    assert data["tenant_id"] == tenant_id
    assert data["status"] == "trialing"
    assert data["trial"] is not None
    assert data["trial"]["trial_minutes_allocated"] == 100
    assert data["trial"]["trial_minutes_used"] == 0.0
    assert data["entitlements"]["crm.connectors.max"] == 4  # Growth-level feature in trial
    assert data["entitlements"]["numbers.max"] == 1  # 1 number in trial
    assert "usage_meters" in data


def test_trial_abuse_controls_disposable_email_and_phone() -> None:
    """FR-TRIAL-3 & 9: Verify disposable email domains and serial phone churn are blocked."""
    # 1. Disposable email domain rejection
    disp_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Scam Plumbing",
            "owner_name": "Bot User",
            "email": "bot@mailinator.com",
            "password": "Password123!",
            "phone_number": "+15125550991",
        },
    )
    assert disp_res.status_code == 400
    assert "Disposable and temporary" in disp_res.json()["detail"]

    # 2. Duplicate phone number rejection
    existing_t_id, _, test_phone, _ = _setup_test_tenant()
    dup_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Duplicate Plumbing",
            "owner_name": "Churn User",
            "email": f"unique_{uuid.uuid4().hex[:6]}@legitbusiness.com",
            "password": "Password123!",
            "phone_number": test_phone,
        },
    )
    assert dup_res.status_code in (400, 409)
    assert "already" in dup_res.json()["detail"].lower()


def test_trial_25_outbound_calls_limit_in_compliance_gate() -> None:
    """FR-TRIAL-5: Trialing tenants cannot place more than 25 outbound calls."""
    tenant_id, _, caller_id, _ = _setup_test_tenant(tier="trial")
    target_phone = "+15125550333"
    fixture_time = datetime(2026, 6, 15, 18, 0, tzinfo=UTC)

    with SessionLocal() as db:
        # Simulate 25 outbound calls completed
        for i in range(25):
            db.add(
                Call(
                    tenant_id=tenant_id,
                    call_id=f"trial-out-{i}-{uuid.uuid4().hex[:6]}",
                    caller_number=f"+15125551{i:03d}",
                    dialed_number=caller_id,
                    direction="outbound",
                    started_at=fixture_time - timedelta(minutes=10 + i),
                    ended_at=fixture_time - timedelta(minutes=9 + i),
                    outcome="completed",
                )
            )
        db.commit()

        # 26th outbound call attempt should be rejected by trial outbound limit
        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            from_phone=caller_id,
            category="B",
            has_consent=True,
            current_time=fixture_time,
        )
        assert res.passed is False
        assert res.reason == "trial_outbound_limit_reached"
        assert res.details["outbound_calls_count"] >= 25


def test_trial_expired_blocks_outbound() -> None:
    """FR-TRIAL-1: 100 minutes or 14 days expiration halts outbound calling."""
    tenant_id, _, caller_id, _ = _setup_test_tenant(tier="trial")
    fixture_time = datetime(2026, 6, 15, 18, 0, tzinfo=UTC)

    with SessionLocal() as db:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
        assert sub is not None
        sub.trial_minutes_used = 100.0  # Exhausted allocation
        db.commit()

        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550444",
            from_phone=caller_id,
            category="B",
            has_consent=True,
            current_time=fixture_time,
        )
        assert res.passed is False
        assert res.reason == "trial_expired"


def test_pre_downgrade_gate_detects_excess_resources() -> None:
    """FR-PLAN-2: Pre-downgrade check detects excess phone numbers or seats."""
    tenant_id, _, _, token = _setup_test_tenant(tier="growth")

    with SessionLocal() as db:
        # Growth allows 3 numbers, add 3 active numbers
        for _ in range(3):
            unique_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
            db.add(
                PhoneNumber(
                    tenant_id=tenant_id,
                    e164=unique_phone,
                    status="active",
                )
            )
        db.commit()

    # Attempt pre-downgrade check to 'lite' (which allows max 1 number)
    res = client.get(
        "/api/v1/subscriptions/check-downgrade?target_tier=lite",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["allowed"] is False
    assert len(data["excess_resources"]) >= 1
    assert data["excess_resources"][0]["resource"] == "phone_numbers"
    assert data["excess_resources"][0]["target_max"] == 1


def test_admin_entitlement_overrides_crud() -> None:
    """Admin CRUD for Tenant Entitlement Overrides (Tier 3)."""
    tenant_id, _, _, _ = _setup_test_tenant(tier="starter")
    admin_token = _get_admin_token()

    # 1. Put Override
    put_res = client.put(
        f"/api/v1/admin/tenants/{tenant_id}/entitlement-overrides",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "key": "seats.max",
            "value": 15,
            "reason": "Enterprise pilot expansion grant",
            "expires_in_days": 30,
        },
    )
    assert put_res.status_code == 200
    assert put_res.json()["key"] == "seats.max"
    assert put_res.json()["value"] == 15

    # 2. Get Overrides
    get_res = client.get(
        f"/api/v1/admin/tenants/{tenant_id}/entitlement-overrides",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert get_res.status_code == 200
    overrides = get_res.json()
    assert len(overrides) >= 1
    assert overrides[0]["key"] == "seats.max"

    # 3. Delete Override
    del_res = client.delete(
        f"/api/v1/admin/tenants/{tenant_id}/entitlement-overrides/seats.max",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Verify deleted
    get_res2 = client.get(
        f"/api/v1/admin/tenants/{tenant_id}/entitlement-overrides",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert len(get_res2.json()) == 0
