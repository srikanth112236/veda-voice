"""Unit and integration tests for Phase 2: Control Plane Server & API Layer.

Verifies:
1. Subscription location quota enforcement (HTTP 402 on limit reached).
2. Location staff management (GET, POST, PATCH duty_status).
3. Location-specific availability checking and off-duty technician filtering.
4. Onboarding automatic creation of primary location and auto-application of industry pack.
5. HIPAA BAA gating on healthcare packs.
6. Safe fallback for incomplete industry packs.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.industry_pack import IndustryPack, IndustryPackVersion, TenantPackApplication
from api.app.models.location import Location
from api.app.models.subscription import Subscription
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.industry_packs import compile_tenant_prompt, seed_default_industry_packs

client = TestClient(app)


def _create_test_tenant(db: Session, max_locations: int = 1, hipaa_signed: bool = False):
    tenant_id = str(uuid.uuid4())
    tenant = Tenant(
        id=tenant_id,
        name=f"Phase 2 Test {tenant_id[:6]}",
        timezone="America/New_York",
        hours="Monday to Friday, 8:00 AM to 6:00 PM EST",
        status="active",
    )
    db.add(tenant)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        email=f"owner-{tenant_id[:6]}@example.com",
        hashed_password="hash",
        full_name="Owner Test",
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)

    sub = Subscription(
        tenant_id=tenant.id,
        tier="starter",
        status="active",
        max_locations=max_locations,
        hipaa_baa_signed=hipaa_signed,
    )
    db.add(sub)
    db.commit()
    db.refresh(tenant)
    db.refresh(user)

    token = create_access_token({"sub": user.id, "role": user.role, "tenant_id": tenant.id})
    return tenant, user, token


def test_subscription_location_quota_enforcement():
    with SessionLocal() as db:
        tenant, user, token = _create_test_tenant(db, max_locations=1)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create first location (allowed)
        payload1 = {
            "name": "Branch 1",
            "code": "BR1",
            "address_line1": "123 Main St",
            "city": "Austin",
            "state": "TX",
            "postal_code": "78701",
        }
        res1 = client.post("/portal/locations", json=payload1, headers=headers)
        assert res1.status_code == 201
        assert "id" in res1.json()

        # 2. Attempt to create second location (blocked by quota)
        payload2 = {
            "name": "Branch 2",
            "code": "BR2",
            "address_line1": "456 Oak St",
            "city": "Dallas",
            "state": "TX",
            "postal_code": "75001",
        }
        res2 = client.post("/portal/locations", json=payload2, headers=headers)
        assert res2.status_code == 402
        assert "limit of 1 location(s) reached" in res2.json()["detail"]


def test_location_staff_and_duty_status_management():
    with SessionLocal() as db:
        tenant, user, token = _create_test_tenant(db, max_locations=3)
        headers = {"Authorization": f"Bearer {token}"}

        # Create branch
        res_loc = client.post(
            "/portal/locations",
            json={
                "name": "North Branch",
                "code": "NORTH",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78758",
            },
            headers=headers,
        )
        assert res_loc.status_code == 201
        loc_id = res_loc.json()["id"]

        # Add technician
        staff_payload = {
            "name": "Dave Technician",
            "email": "dave@example.com",
            "phone": "+15125550144",
            "role": "technician",
            "skills": ["hvac_repair", "water_heater"],
            "duty_status": "on_duty",
        }
        res_staff = client.post(
            f"/portal/locations/{loc_id}/staff", json=staff_payload, headers=headers
        )
        assert res_staff.status_code == 201
        staff_data = res_staff.json()
        assert staff_data["name"] == "Dave Technician"
        assert staff_data["duty_status"] == "on_duty"
        assert staff_data["location_id"] == loc_id
        staff_id = staff_data["id"]

        # List staff at location
        res_list = client.get(f"/portal/locations/{loc_id}/staff", headers=headers)
        assert res_list.status_code == 200
        assert len(res_list.json()) == 1
        assert res_list.json()[0]["id"] == staff_id

        # Update duty status to off_duty
        res_patch = client.patch(
            f"/portal/locations/{loc_id}/staff/{staff_id}/status",
            json={"duty_status": "off_duty"},
            headers=headers,
        )
        assert res_patch.status_code == 200
        assert res_patch.json()["duty_status"] == "off_duty"


def test_location_availability_with_duty_status():
    with SessionLocal() as db:
        tenant, user, token = _create_test_tenant(db, max_locations=2)
        headers = {"Authorization": f"Bearer {token}"}

        # Create branch
        res_loc = client.post(
            "/portal/locations",
            json={
                "name": "South Branch",
                "code": "SOUTH",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78704",
            },
            headers=headers,
        )
        loc_id = res_loc.json()["id"]

        # Add on-duty technician
        client.post(
            f"/portal/locations/{loc_id}/staff",
            json={
                "name": "Active Tech",
                "email": "active@example.com",
                "skills": ["plumbing"],
                "duty_status": "on_duty",
            },
            headers=headers,
        )

        future_date = (datetime.now(UTC) + timedelta(days=2)).strftime("%Y-%m-%d")
        res_avail = client.get(
            f"/portal/locations/{loc_id}/availability?target_date={future_date}&service_type=plumbing",
            headers=headers,
        )
        assert res_avail.status_code == 200
        slots = res_avail.json().get("slots", [])
        assert len(slots) > 0


def test_onboarding_auto_primary_location_and_pack():
    rnd = uuid.uuid4().hex[:6]
    signup_email = f"signup-{rnd}@example.com"
    fresh_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    payload = {
        "business_name": "Lone Star Electrical",
        "owner_name": "Hank Hill",
        "email": signup_email,
        "password": "Password123!",
        "niche": "electrical",
        "address_line1": "888 Voltage Way",
        "city": "Arlen",
        "state": "TX",
        "postal_code": "73301",
        "phone_number": fresh_phone,
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 200
    tenant_id = res.json()["user"]["tenant_id"]

    with SessionLocal() as db:
        # Verify primary location created
        locations = db.scalars(select(Location).where(Location.tenant_id == tenant_id)).all()
        assert len(locations) == 1
        hq = locations[0]
        assert hq.is_primary is True
        assert hq.code == "HQ"
        assert hq.address_line1 == "888 Voltage Way"

        # Verify phone number bound to location
        phone = db.scalar(select(PhoneNumber).where(PhoneNumber.tenant_id == tenant_id))
        assert phone is not None
        assert phone.location_id == hq.id

        # Verify home_services pack applied (since electrical maps to home_services)
        applied = db.scalar(
            select(TenantPackApplication).where(TenantPackApplication.tenant_id == tenant_id)
        )
        assert applied is not None
        assert applied.pack.slug == "home_services"


def test_hipaa_baa_gate_for_medical_pack():
    with SessionLocal() as db:
        seed_default_industry_packs(db)
        tenant, user, token = _create_test_tenant(db, hipaa_signed=False)
        headers = {"Authorization": f"Bearer {token}"}

        # Attempt to apply dental_clinic pack without signed BAA (requires_hipaa_baa: True)
        res = client.post(
            "/api/v1/portal/industry-packs/apply",
            json={"pack_slug": "dental_clinic"},
            headers=headers,
        )
        assert res.status_code == 403
        assert "HIPAA Business Associate Agreement (BAA) is required" in res.json()["detail"]

        # Now sign BAA on subscription
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
        sub.hipaa_baa_signed = True
        db.commit()

        # Apply again -> should succeed
        res_success = client.post(
            "/api/v1/portal/industry-packs/apply",
            json={"pack_slug": "dental_clinic"},
            headers=headers,
        )
        assert res_success.status_code == 200
        assert res_success.json()["success"] is True


def test_incomplete_pack_safe_fallback():
    with SessionLocal() as db:
        tenant, user, token = _create_test_tenant(db)

        # Create an incomplete draft pack directly in DB
        incomplete_pack = IndustryPack(
            slug=f"incomplete-{uuid.uuid4().hex[:6]}",
            name="Incomplete Draft Pack",
            description="Testing fallback behavior",
            category="custom",
        )
        db.add(incomplete_pack)
        db.flush()

        incomplete_ver = IndustryPackVersion(
            pack_id=incomplete_pack.id,
            version_semver="0.1.0",
            status="published",
            validation_status="incomplete",
            prompt_base="",  # Empty prompt base
            emergency_rules={},  # Empty emergency rules
        )
        db.add(incomplete_ver)
        db.flush()

        app_rec = TenantPackApplication(
            tenant_id=tenant.id,
            pack_id=incomplete_pack.id,
            version_id=incomplete_ver.id,
            overrides={},
        )
        db.add(app_rec)
        db.commit()

        # Compile prompt -> MUST not fail and MUST inject fallback
        compiled = compile_tenant_prompt(tenant.id, db)
        assert len(compiled) > 50
        assert "professional, helpful customer receptionist" in compiled
        assert "Emergency Triggers:" in compiled
