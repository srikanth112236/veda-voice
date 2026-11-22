"""Integration tests verifying Client Portal reflection and voice runtime for Platform Admin Industry Packs (Phase 4)."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User

client = TestClient(app)


@pytest.fixture
def portal_reflection_setup() -> dict[str, Any]:
    """Setup platform admin and a test client tenant for portal reflection testing."""
    db: Session = SessionLocal()
    try:
        # 1. Platform Admin user
        admin = db.scalar(select(User).where(User.role == "platform_admin"))
        if not admin:
            admin = User(
                email="admin_reflection@platform.internal",
                hashed_password=hash_password("SuperSecret123!"),
                role="platform_admin",
                full_name="Platform Admin Reflection",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        admin_token = create_access_token(
            {"sub": admin.id, "role": "platform_admin", "tenant_id": None}
        )

        # 2. Client Tenant
        tenant_name = f"Spine Care Clinic {uuid.uuid4().hex[:4]}"
        tenant = Tenant(
            name=tenant_name,
            timezone="America/Chicago",
            hours="Mon-Fri 08:30-17:30",
            status="active",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        # 3. Dedicated inbound phone number
        test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=test_number,
            provider="livekit",
            status="active",
        )
        db.add(phone)

        # 4. Tenant Owner
        owner_email = f"chiro_owner_{uuid.uuid4().hex[:6]}@spinecare.com"
        owner = User(
            email=owner_email,
            hashed_password=hash_password("ChiroPass123!"),
            role="tenant_owner",
            full_name="Dr. Alex Rivera",
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
            "tenant_name": tenant.name,
            "phone_number": test_number,
        }
    finally:
        db.close()


def test_end_to_end_portal_and_runtime_reflection(portal_reflection_setup: dict[str, Any]) -> None:
    """Verify admin pack creation -> tenant assignment -> portal inspection -> prompt compilation -> live call config."""
    admin_headers = {"Authorization": f"Bearer {portal_reflection_setup['admin_token']}"}
    client_headers = {"Authorization": f"Bearer {portal_reflection_setup['owner_token']}"}
    tenant_id = portal_reflection_setup["tenant_id"]
    phone_number = portal_reflection_setup["phone_number"]

    pack_slug = f"chiro_{uuid.uuid4().hex[:6]}"

    # Step 1: Platform Admin creates the new industry pack
    create_pack_res = client.post(
        "/api/v1/admin/industry-packs",
        json={
            "slug": pack_slug,
            "name": "Chiropractic & Spine Wellness",
            "description": "Spine care triage, adjustment intake, and red-flag neurological safety checks.",
            "category": "medical_healthcare",
            "icon": "Activity",
            "is_active": True,
            "initial_version_semver": "1.0.0",
            "prompt_base": "You are the receptionist for {{practice_name}}. Specialty: {{spine_focus}}.",
            "prompt_vars_schema": {
                "practice_name": {"type": "string", "default": "Elevate Chiropractic"},
                "spine_focus": {
                    "type": "string",
                    "default": "Postural Correction & Spinal Decompression",
                },
            },
            "emergency_rules": {
                "keywords": ["loss of bowel", "saddle anesthesia", "radiating numbness"],
                "safety_advice": "Please proceed to an emergency department immediately for urgent neurological evaluation.",
            },
            "appointment_types": [
                {
                    "id": "initial_eval",
                    "title": "Comprehensive Spinal Exam",
                    "duration_minutes": 45,
                    "fee": "$95",
                },
                {
                    "id": "routine_adjustment",
                    "title": "Standard Adjustment",
                    "duration_minutes": 15,
                    "fee": "$55",
                },
            ],
            "intake_schema": {
                "title": "Spine Intake",
                "fields": [
                    {
                        "key": "pain_location",
                        "label": "Pain Location",
                        "type": "select",
                        "options": ["Cervical / Neck", "Lumbar / Lower Back"],
                        "required": True,
                    },
                ],
            },
            "requires_hipaa_baa": False,
        },
        headers=admin_headers,
    )
    assert create_pack_res.status_code == 201
    pack_id = create_pack_res.json()["id"]

    # Step 2: Platform Admin publishes updated version 1.1.0 with enhanced prompt blueprint
    publish_v11_res = client.post(
        f"/api/v1/admin/industry-packs/{pack_id}/versions",
        json={
            "version_semver": "1.1.0",
            "prompt_base": (
                "You are the clinical voice assistant for {{practice_name}}. "
                "Our clinic focuses on {{spine_focus}}. "
                "Always screen for acute neurological red flags before booking."
            ),
            "prompt_vars_schema": {
                "practice_name": {"type": "string", "default": "Elevate Spine Care v1.1"},
                "spine_focus": {
                    "type": "string",
                    "default": "Integrated Sports & Spine Rehabilitation",
                },
            },
            "emergency_rules": {
                "keywords": ["loss of bowel", "saddle anesthesia", "sudden foot drop"],
                "safety_advice": "Seek emergency medical attention immediately for acute cord compression.",
            },
            "intake_schema": {
                "title": "Spine Intake v1.1",
                "fields": [
                    {
                        "key": "pain_location",
                        "label": "Pain Location",
                        "type": "select",
                        "options": ["Neck", "Lower Back"],
                        "required": True,
                    },
                    {
                        "key": "pain_scale_1_10",
                        "label": "Pain Severity",
                        "type": "text",
                        "required": False,
                    },
                ],
            },
            "status": "published",
        },
        headers=admin_headers,
    )
    assert publish_v11_res.status_code == 201

    # Step 3: Platform Admin assigns version 1.1.0 to the client tenant
    assign_res = client.post(
        f"/api/v1/admin/tenants/{tenant_id}/pack",
        json={"pack_slug": pack_slug, "version_semver": "1.1.0"},
        headers=admin_headers,
    )
    assert assign_res.status_code == 200
    assert assign_res.json()["success"] is True

    # Step 4: Client Portal Reflection - GET /portal/industry-packs/current
    current_res = client.get("/api/v1/portal/industry-packs/current", headers=client_headers)
    assert current_res.status_code == 200
    current_data = current_res.json()
    assert current_data["pack_slug"] == pack_slug
    assert current_data["version_semver"] == "1.1.0"
    assert "Spine Intake v1.1" in str(current_data["intake_schema"])

    # Step 5: Client Portal Customization - PUT /portal/industry-packs/overrides
    overrides_res = client.put(
        "/api/v1/portal/industry-packs/overrides",
        json={
            "vars": {"practice_name": "Rivera Family Chiropractic & Spine"},
            "emergency_keywords": ["severe head trauma"],
            "custom_safety_script": "Please call 911 or head to the nearest trauma center right away.",
        },
        headers=client_headers,
    )
    assert overrides_res.status_code == 200
    assert overrides_res.json()["success"] is True

    # Step 6: Client Portal Prompt Preview - POST /portal/industry-packs/preview-prompt
    preview_res = client.post(
        "/api/v1/portal/industry-packs/preview-prompt",
        json={
            "pack_slug": pack_slug,
            "vars": {"practice_name": "Rivera Family Chiropractic & Spine"},
            "emergency_keywords": ["severe head trauma"],
            "custom_safety_script": "Please call 911 or head to the nearest trauma center right away.",
        },
        headers=client_headers,
    )
    assert preview_res.status_code == 200
    compiled_preview = preview_res.json()["compiled_prompt"]
    assert "Rivera Family Chiropractic & Spine" in compiled_preview
    assert "severe head trauma" in compiled_preview

    # Step 7: Client Portal Sandbox Interactive Turn - POST /portal/industry-packs/sandbox/turn
    sandbox_res = client.post(
        "/api/v1/portal/industry-packs/sandbox/turn",
        json={
            "pack_slug": pack_slug,
            "message": "I was just in an accident and have severe head trauma and neck pain",
            "vars": {"practice_name": "Rivera Family Chiropractic & Spine"},
            "emergency_keywords": ["severe head trauma"],
            "custom_safety_script": "Please call 911 or head to the nearest trauma center right away.",
        },
        headers=client_headers,
    )
    assert sandbox_res.status_code == 200
    sandbox_data = sandbox_res.json()
    assert sandbox_data["detected_emergency"] is True
    assert sandbox_data["emergency_trigger"] == "severe head trauma"

    # Step 8: Live Call Runtime Reflection - GET /internal/tenants/{tenant_id}
    call_config_res = client.get(f"/api/v1/internal/tenants/{tenant_id}")
    assert call_config_res.status_code == 200
    cfg = call_config_res.json()
    assert cfg["industry_pack_slug"] == pack_slug
    assert "Rivera Family Chiropractic & Spine" in cfg["industry_pack_prompt"]
    assert cfg["industry_pack_intake_schema"]["title"] == "Spine Intake v1.1"

    # Also verify resolution by E.164 phone number for inbound carrier SIP trunk
    by_num_res = client.get(f"/api/v1/internal/tenants/by-number/{phone_number}")
    assert by_num_res.status_code == 200
    cfg_num = by_num_res.json()
    assert cfg_num["industry_pack_slug"] == pack_slug
    assert "Rivera Family Chiropractic & Spine" in cfg_num["industry_pack_prompt"]
