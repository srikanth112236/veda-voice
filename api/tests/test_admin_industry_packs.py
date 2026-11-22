"""Integration tests for Platform Admin Industry Packs Management Endpoints (Phase 1)."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import Tenant
from api.app.models.user import User

client = TestClient(app)


@pytest.fixture
def admin_auth_setup() -> dict[str, Any]:
    """Provide authenticated tokens for platform_admin and tenant_owner."""
    db: Session = SessionLocal()
    try:
        # 1. Platform Admin user
        admin = db.scalar(select(User).where(User.role == "platform_admin"))
        if not admin:
            admin = User(
                email="admin_packs_test@platform.internal",
                hashed_password=hash_password("SuperSecret123!"),
                role="platform_admin",
                full_name="Platform Admin Tester",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        admin_token = create_access_token(
            {"sub": admin.id, "role": "platform_admin", "tenant_id": None}
        )

        # 2. Regular Tenant & Tenant Owner
        tenant = db.scalar(select(Tenant).where(Tenant.name == "Pack Tenant Client"))
        if not tenant:
            tenant = Tenant(
                name="Pack Tenant Client",
                timezone="America/New_York",
                hours="Mon-Fri 08:00-18:00",
                status="active",
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        owner = db.scalar(select(User).where(User.email == "tenant_owner_packs@example.com"))
        if not owner:
            owner = User(
                email="tenant_owner_packs@example.com",
                hashed_password=hash_password("TenantPass123!"),
                role="tenant_owner",
                full_name="Tenant Client Owner",
                tenant_id=tenant.id,
                is_active=True,
            )
            db.add(owner)
            db.commit()
            db.refresh(owner)

        owner_token = create_access_token(
            {"sub": owner.id, "role": "tenant_owner", "tenant_id": tenant.id}
        )

        return {
            "admin_token": admin_token,
            "owner_token": owner_token,
            "tenant_id": tenant.id,
        }
    finally:
        db.close()


def test_admin_industry_packs_auth_enforcement(admin_auth_setup: dict[str, Any]) -> None:
    """Verify that only platform admins can access admin industry pack routes."""
    owner_headers = {"Authorization": f"Bearer {admin_auth_setup['owner_token']}"}

    # Tenant owner should be forbidden from accessing admin endpoints
    res_list = client.get("/api/v1/admin/industry-packs", headers=owner_headers)
    assert res_list.status_code == 403

    res_create = client.post(
        "/api/v1/admin/industry-packs",
        json={"slug": "forbidden_pack", "name": "Forbidden"},
        headers=owner_headers,
    )
    assert res_create.status_code == 403


def test_admin_list_industry_packs(admin_auth_setup: dict[str, Any]) -> None:
    """Verify platform admin can list all industry packs with full version breakdown."""
    admin_headers = {"Authorization": f"Bearer {admin_auth_setup['admin_token']}"}

    res = client.get("/api/v1/admin/industry-packs", headers=admin_headers)
    assert res.status_code == 200
    packs = res.json()
    assert len(packs) >= 4

    slugs = [p["slug"] for p in packs]
    assert "home_services" in slugs
    assert "dental_clinic" in slugs
    assert "legal_intake" in slugs
    assert "general" in slugs

    # Check structure of pack and versions
    home_pack = next(p for p in packs if p["slug"] == "home_services")
    assert home_pack["name"] == "Home Services (Plumbing, HVAC, Electrical)"
    assert len(home_pack["versions"]) >= 1
    v1 = home_pack["versions"][0]
    assert v1["version_semver"] == "1.0.0"
    assert v1["status"] == "published"
    assert "diagnostic_fee" in v1["prompt_vars_schema"]
    assert "tenant_adoption_count" in v1


def test_admin_create_and_update_pack_lifecycle(admin_auth_setup: dict[str, Any]) -> None:
    """Verify creating a new pack, updating metadata, and publishing a new version."""
    admin_headers = {"Authorization": f"Bearer {admin_auth_setup['admin_token']}"}
    pack_slug = f"vet_{uuid.uuid4().hex[:6]}"

    # 1. Create Pack
    create_payload = {
        "slug": pack_slug,
        "name": "Veterinary Clinic & Hospital",
        "description": "24/7 animal hospital triage, vaccination booking, and emergency protocol.",
        "category": "healthcare",
        "icon": "HeartHandshake",
        "is_active": True,
        "initial_version_semver": "1.0.0",
        "prompt_base": "You are the receptionist for {{clinic_name}}. Emergency triage: {{emergency_protocol}}.",
        "prompt_vars_schema": {
            "clinic_name": {"type": "string", "default": "Veda Pet Hospital"},
            "emergency_protocol": {
                "type": "string",
                "default": "Immediate toxic ingestion or trauma dispatch",
            },
        },
        "emergency_rules": {
            "keywords": ["toxic", "chocolate", "hit by car", "not breathing"],
            "safety_advice": "Please bring your pet directly to our emergency bay immediately.",
        },
        "requires_hipaa_baa": False,
    }
    create_res = client.post(
        "/api/v1/admin/industry-packs", json=create_payload, headers=admin_headers
    )
    assert create_res.status_code == 201
    data = create_res.json()
    assert data["success"] is True
    pack_id = data["id"]
    assert data["slug"] == pack_slug

    # 2. Conflict on duplicate slug
    dup_res = client.post(
        "/api/v1/admin/industry-packs", json=create_payload, headers=admin_headers
    )
    assert dup_res.status_code == 409

    # 3. Update pack metadata
    update_res = client.put(
        f"/api/v1/admin/industry-packs/{pack_id}",
        json={
            "name": "Veterinary Medical Center",
            "description": "Updated emergency hospital description",
        },
        headers=admin_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Veterinary Medical Center"

    # 4. Publish Version 1.1.0
    v11_res = client.post(
        f"/api/v1/admin/industry-packs/{pack_id}/versions",
        json={
            "version_semver": "1.1.0",
            "prompt_base": "Updated prompt base v1.1.0 for {{clinic_name}}.",
            "prompt_vars_schema": {
                "clinic_name": {"type": "string", "default": "Veda Pet Clinic v1.1"}
            },
            "emergency_rules": {
                "keywords": ["poison", "seizure"],
                "safety_advice": "Keep calm and bring pet in.",
            },
            "status": "published",
        },
        headers=admin_headers,
    )
    assert v11_res.status_code == 201
    assert v11_res.json()["version_semver"] == "1.1.0"

    # 5. Duplicate version rejected (immutability)
    dup_v_res = client.post(
        f"/api/v1/admin/industry-packs/{pack_id}/versions",
        json={"version_semver": "1.1.0", "prompt_base": "Duplicate version text"},
        headers=admin_headers,
    )
    assert dup_v_res.status_code == 409


def test_admin_assign_tenant_pack_and_tenants_listing(admin_auth_setup: dict[str, Any]) -> None:
    """Verify platform admin assigning a pack to a tenant and seeing it in the tenants table."""
    admin_headers = {"Authorization": f"Bearer {admin_auth_setup['admin_token']}"}
    tenant_id = admin_auth_setup["tenant_id"]

    # 1. Assign legal_intake pack to tenant
    assign_res = client.post(
        f"/api/v1/admin/tenants/{tenant_id}/pack",
        json={
            "pack_slug": "legal_intake",
            "version_semver": "1.0.0",
            "overrides": {"vars": {"firm_name": "Justice Law Group"}},
        },
        headers=admin_headers,
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["success"] is True

    # 2. Verify GET /admin/tenants reflects applied pack & version
    tenants_res = client.get("/api/v1/admin/tenants", headers=admin_headers)
    assert tenants_res.status_code == 200
    tenants = tenants_res.json()
    target_tenant = next((t for t in tenants if t["id"] == tenant_id), None)
    assert target_tenant is not None
    assert target_tenant["applied_pack_slug"] == "legal_intake"
    assert target_tenant["applied_pack_version"] == "1.0.0"


def test_admin_create_tenant_with_industry_pack(admin_auth_setup: dict[str, Any]) -> None:
    """Verify POST /admin/tenants applies specified industry pack on tenant creation."""
    admin_headers = {"Authorization": f"Bearer {admin_auth_setup['admin_token']}"}
    unique_email = f"dentist_{uuid.uuid4().hex[:6]}@example.com"

    req_body = {
        "name": "Downtown Family Dental",
        "owner_name": "Dr. Sarah Miller",
        "owner_email": unique_email,
        "owner_password": "SecurePassword123!",
        "timezone": "America/Chicago",
        "hours": "Mon-Fri 09:00-17:00",
        "industry_pack_slug": "general",
        "version_semver": "1.0.0",
    }
    create_res = client.post("/api/v1/admin/tenants", json=req_body, headers=admin_headers)
    assert create_res.status_code == 200
    data = create_res.json()
    assert data["name"] == "Downtown Family Dental"
    assert data["applied_pack_slug"] == "general"
    assert data["applied_pack_version"] == "1.0.0"


def test_public_onboarding_industry_packs_catalog(admin_auth_setup: dict[str, Any]) -> None:
    """Verify GET /api/v1/auth/industry-packs is unauthenticated and returns active packs with onboarding defaults."""
    # 1. Unauthenticated request should succeed
    res = client.get("/api/v1/auth/industry-packs")
    assert res.status_code == 200
    packs = res.json()
    assert len(packs) >= 4

    slugs = [p["slug"] for p in packs]
    assert "home_services" in slugs
    assert "dental_clinic" in slugs

    home_pack = next(p for p in packs if p["slug"] == "home_services")
    assert home_pack["name"] == "Home Services (Plumbing, HVAC, Electrical)"
    assert "emergency_keywords" in home_pack
    assert len(home_pack["emergency_keywords"]) > 0
    assert "diagnostic_fee" in home_pack["default_prompt_vars"]
    assert len(home_pack["services"]) > 0
    assert len(home_pack["faq"]) > 0
    assert "greeting" in home_pack

    # 2. Inactive packs should be excluded from public onboarding
    admin_headers = {"Authorization": f"Bearer {admin_auth_setup['admin_token']}"}
    hidden_slug = f"hidden_{uuid.uuid4().hex[:6]}"
    create_hidden = client.post(
        "/api/v1/admin/industry-packs",
        json={
            "slug": hidden_slug,
            "name": "Hidden Custom Pack",
            "is_active": False,
            "prompt_base": "Hidden pack prompt",
        },
        headers=admin_headers,
    )
    assert create_hidden.status_code == 201

    res_after = client.get("/api/v1/auth/industry-packs")
    assert res_after.status_code == 200
    after_slugs = [p["slug"] for p in res_after.json()]
    assert hidden_slug not in after_slugs
