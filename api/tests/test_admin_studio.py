"""Tests for 4-Layer Admin Studio Configuration & White-Label Terminology Engine."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from api.app.core.security import create_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import AgentProfile, Tenant
from api.app.models.user import User

client = TestClient(app)


def _create_admin_and_tenant_tokens() -> tuple[str, str, str]:
    suffix = uuid.uuid4().hex[:8]
    with SessionLocal() as db:
        tenant = Tenant(
            name=f"Studio Test Clinic {suffix}",
            timezone="America/New_York",
            hours="9am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        admin_user = User(
            email=f"studio-admin-{suffix}@vedavoice.io",
            hashed_password=hash_password("AdminPass123!"),
            full_name="Studio Admin",
            role="platform_admin",
            is_active=True,
        )
        tenant_user = User(
            email=f"studio-tenant-{suffix}@clinic.com",
            hashed_password=hash_password("TenantPass123!"),
            full_name="Clinic Owner",
            role="tenant_user",
            tenant_id=tenant.id,
            is_active=True,
        )
        db.add(admin_user)
        db.add(tenant_user)
        db.commit()

        admin_tok = create_access_token({"sub": admin_user.id, "role": "platform_admin"})
        tenant_tok = create_access_token(
            {"sub": tenant_user.id, "role": "tenant_user", "tenant_id": tenant.id}
        )
        return admin_tok, tenant_tok, tenant.id


def test_studio_admin_endpoints_reject_tenant_user() -> None:
    _, tenant_tok, tenant_id = _create_admin_and_tenant_tokens()
    headers = {"Authorization": f"Bearer {tenant_tok}"}

    assert client.get("/api/v1/admin/studio/presets", headers=headers).status_code == 403
    assert (
        client.get(f"/api/v1/admin/studio/tenants/{tenant_id}", headers=headers).status_code == 403
    )
    assert (
        client.put(
            f"/api/v1/admin/studio/tenants/{tenant_id}",
            json={"studio": {"terminology": {"brand_name": "Hack"}}},
            headers=headers,
        ).status_code
        == 403
    )


def test_studio_4_layer_inheritance_and_portal_read() -> None:
    admin_tok, tenant_tok, tenant_id = _create_admin_and_tenant_tokens()
    admin_headers = {"Authorization": f"Bearer {admin_tok}"}
    tenant_headers = {"Authorization": f"Bearer {tenant_tok}"}

    # 1. Apply 'dental' industry preset (Layer 2)
    preset_resp = client.post(
        f"/api/v1/admin/studio/tenants/{tenant_id}/apply-preset",
        json={"preset_slug": "dental"},
        headers=admin_headers,
    )
    assert preset_resp.status_code == 200
    resolved = preset_resp.json()["resolved"]
    assert resolved["terminology"]["professional_plural"] == "Dentists"
    assert resolved["terminology"]["customer_singular"] == "Patient"
    assert resolved["enabled_pages"]["campaigns"] is False

    # 2. Apply client override (Layer 1) on top of 'dental' preset
    update_resp = client.put(
        f"/api/v1/admin/studio/tenants/{tenant_id}",
        json={
            "industry_preset": "dental",
            "studio": {
                "terminology": {"professional_plural": "Oral Surgeons", "brand_name": "SmileCare"},
                "theme": {"accent_signal": "#0ea5e9"},
            },
        },
        headers=admin_headers,
    )
    assert update_resp.status_code == 200

    # 3. Tenant reads resolved config via /api/v1/portal/studio
    portal_resp = client.get("/api/v1/portal/studio", headers=tenant_headers)
    assert portal_resp.status_code == 200
    p_resolved = portal_resp.json()["resolved"]
    # Layer 1 wins over Layer 2
    assert p_resolved["terminology"]["professional_plural"] == "Oral Surgeons"
    assert p_resolved["terminology"]["brand_name"] == "SmileCare"
    assert p_resolved["theme"]["accent_signal"] == "#0ea5e9"
    # Layer 2 ('dental') preserved where not overridden
    assert p_resolved["terminology"]["customer_singular"] == "Patient"
    assert p_resolved["enabled_pages"]["campaigns"] is False
    # Layer 4 (Platform default) preserved where not overridden
    assert p_resolved["enabled_pages"]["dashboard"] is True


def test_studio_voice_defaults_sync_to_agent_profile() -> None:
    admin_tok, _, tenant_id = _create_admin_and_tenant_tokens()
    admin_headers = {"Authorization": f"Bearer {admin_tok}"}

    with SessionLocal() as db:
        db.add(
            AgentProfile(
                tenant_id=tenant_id,
                agent_name="receptionist",
                greeting="Old greeting",
                tone="direct",
                services=["General"],
                pricing_policy="diagnostic_fee_only",
            )
        )
        db.commit()

    resp = client.put(
        f"/api/v1/admin/studio/tenants/{tenant_id}",
        json={
            "industry_preset": "legal",
            "studio": {
                "terminology": {"brand_name": "Apex Law"},
                "voice_defaults": {
                    "tone": "formal",
                    "greeting_template": "Welcome to {brand_name} Intake.",
                    "emergency_keywords": ["subpoena", "arrested"],
                    "custom_system_instructions": "Always ask for case type.",
                },
            },
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200

    with SessionLocal() as db:
        prof = db.query(AgentProfile).filter(AgentProfile.tenant_id == tenant_id).first()
        assert prof is not None
        assert prof.tone == "formal"
        assert prof.greeting == "Welcome to Apex Law Intake."
        assert prof.emergency_keywords == ["subpoena", "arrested"]
        assert prof.custom_instructions == "Always ask for case type."


def test_studio_plan_overrides_enforced_by_entitlements() -> None:
    from api.app.services.entitlements import check_tenant_entitlement

    admin_tok, _, tenant_id = _create_admin_and_tenant_tokens()
    admin_headers = {"Authorization": f"Bearer {admin_tok}"}

    resp = client.put(
        f"/api/v1/admin/studio/tenants/{tenant_id}",
        json={
            "studio": {
                "plan_overrides": {
                    "crm_connectors_max": 5,
                    "max_phone_numbers": 3,
                    "outbound_campaigns_enabled": True,
                }
            }
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200

    with SessionLocal() as db:
        ok_crm, _ = check_tenant_entitlement(db, tenant_id, "crm.connectors.max", 5)
        too_many_crm, _ = check_tenant_entitlement(db, tenant_id, "crm.connectors.max", 6)
        ok_nums, _ = check_tenant_entitlement(db, tenant_id, "numbers.max", 3)
        ok_out, _ = check_tenant_entitlement(db, tenant_id, "outbound.enabled")
        assert ok_crm is True
        assert too_many_crm is False
        assert ok_nums is True
        assert ok_out is True
