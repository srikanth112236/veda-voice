"""Unit and integration tests for Milestone M4c: Industry Packs Engine (FR-PACK-1 to 7)."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.compliance import evaluate_compliance_gate_v2
from api.app.services.industry_packs import (
    apply_pack_to_tenant,
    compile_tenant_prompt,
)

client = TestClient(app)


def test_industry_pack_catalog_and_details() -> None:
    """Verify listing industry pack blueprints and retrieving pack specifications."""
    db: Session = SessionLocal()
    tenant_id = f"pack-test-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Pack Test Co",
            timezone="America/Chicago",
            status="active",
        )
        user = User(
            id=user_id,
            email=f"admin-{uuid.uuid4().hex[:6]}@packtest.com",
            hashed_password="pw",
            role="tenant_owner",
            tenant_id=tenant_id,
            full_name="Pack Test Admin",
            is_active=True,
        )
        db.add_all([tenant, user])
        db.commit()

        token = create_access_token({"sub": user_id})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. List catalog
        res = client.get("/api/v1/portal/industry-packs", headers=headers)
        assert res.status_code == 200
        packs = res.json()
        assert len(packs) >= 4
        slugs = [p["slug"] for p in packs]
        assert "home_services" in slugs
        assert "dental_clinic" in slugs
        assert "legal_intake" in slugs
        assert "general" in slugs

        # 2. Get pack details
        res_detail = client.get("/api/v1/portal/industry-packs/home_services", headers=headers)
        assert res_detail.status_code == 200
        data = res_detail.json()
        assert data["slug"] == "home_services"
        assert len(data["appointment_types"]) >= 3
        assert len(data["emergency_rules"]["keywords"]) >= 4
        assert len(data["test_scenarios"]) == 10
    finally:
        db.close()


def test_apply_pack_and_tenant_prompt_compilation() -> None:
    """Verify applying an industry pack, updating custom overrides, and compiling effective prompts."""
    db: Session = SessionLocal()
    tenant_id = f"pack-test-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Smile Pros Dental",
            timezone="America/Chicago",
            status="active",
        )
        user = User(
            id=user_id,
            email=f"dentist-{uuid.uuid4().hex[:6]}@smilepros.com",
            hashed_password="pw",
            role="tenant_owner",
            tenant_id=tenant_id,
            full_name="Dr. Smile Admin",
            is_active=True,
        )
        db.add_all([tenant, user])
        db.commit()

        token = create_access_token({"sub": user_id})
        headers = {"Authorization": f"Bearer {token}"}

        # Apply Dental Clinic Pack
        res_apply = client.post(
            "/api/v1/portal/industry-packs/apply",
            json={"pack_slug": "dental_clinic"},
            headers=headers,
        )
        assert res_apply.status_code == 200
        assert res_apply.json()["success"] is True

        # Verify Current Applied Pack
        res_curr = client.get("/api/v1/portal/industry-packs/current", headers=headers)
        assert res_curr.status_code == 200
        curr_data = res_curr.json()
        assert curr_data["pack_slug"] == "dental_clinic"

        # Update Custom Overrides
        res_override = client.put(
            "/api/v1/portal/industry-packs/overrides",
            json={
                "vars": {"practice_name": "Smile Pros Austin", "cleaning_copay": "$20"},
                "emergency_keywords": ["jaw shattered", "knocked out tooth"],
                "custom_safety_script": "Please apply direct pressure and head to the emergency room immediately.",
            },
            headers=headers,
        )
        assert res_override.status_code == 200
        assert "jaw shattered" in res_override.json()["overrides"]["emergency_keywords"]

        # Verify effective compilation
        compiled = compile_tenant_prompt(tenant_id, db)
        assert "Smile Pros Austin" in compiled
        assert "Please apply direct pressure" in compiled
        assert "knocked out tooth" in compiled
    finally:
        db.close()


def test_industry_pack_category_narrowing_gate_v2() -> None:
    """Verify that an applied industry pack enforces outbound category narrowing in Compliance Gate v2."""
    db: Session = SessionLocal()
    tenant_id = f"pack-test-{uuid.uuid4().hex[:8]}"

    try:
        phone_num = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
        tenant = Tenant(
            id=tenant_id,
            name="Dental Clinic Strict",
            timezone="America/Chicago",
            status="active",
        )
        phone = PhoneNumber(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            e164=phone_num,
            status="active",
        )
        db.add_all([tenant, phone])
        db.commit()

        # Apply dental clinic pack (restricted to category B transactional care reminders only)
        apply_pack_to_tenant(
            tenant_id=tenant_id,
            pack_slug="dental_clinic",
            db=db,
        )

        # Outbound call with Category A (marketing) should be blocked by pack policy
        decision_cat_a = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550199",
            from_phone=phone_num,
            category="A",
        )
        assert decision_cat_a.passed is False
        assert decision_cat_a.reason == "industry_pack_category_prohibited"

        # Outbound call with Category B (transactional reminder) should not be blocked by category
        decision_cat_b = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550199",
            from_phone=phone_num,
            category="B",
            has_consent=True,
        )
        assert decision_cat_b.reason != "industry_pack_category_prohibited"
    finally:
        db.close()


def test_industry_pack_10_scenario_evaluation() -> None:
    """Verify executing the automated 10-scenario QA evaluator for an applied industry pack."""
    db: Session = SessionLocal()
    tenant_id = f"pack-test-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Home Services QA",
            timezone="America/Chicago",
            status="active",
        )
        user = User(
            id=user_id,
            email=f"qa-{uuid.uuid4().hex[:6]}@homeqa.com",
            hashed_password="pw",
            role="tenant_owner",
            tenant_id=tenant_id,
            full_name="QA Lead",
            is_active=True,
        )
        db.add_all([tenant, user])
        db.commit()

        token = create_access_token({"sub": user_id})
        headers = {"Authorization": f"Bearer {token}"}

        # Apply home services pack
        client.post(
            "/api/v1/portal/industry-packs/apply",
            json={"pack_slug": "home_services"},
            headers=headers,
        )

        # Run automated 10-scenario QA runner
        res_test = client.post("/api/v1/portal/industry-packs/test", headers=headers)
        assert res_test.status_code == 200
        report = res_test.json()
        assert report["total_scenarios"] == 10
        assert report["passed_scenarios"] == 10
        assert report["score_pct"] == 100.0
        assert report["status"] == "passed"
        assert len(report["scenarios"]) == 10
    finally:
        db.close()
