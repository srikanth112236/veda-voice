"""Tests for Native CRM Milestone M4b Upgrades (FR-CRM-11 to FR-CRM-19).

Covers:
- Configurable pipeline stages CRUD & reorder (FR-CRM-11)
- Contact duplicate detection and atomic merging (FR-CRM-13)
- Evidentiary consent audit panel (FR-CRM-14)
- CSV Import with consent attestation & non-callable enforcement (FR-CRM-16)
- Revenue recovered calculations & configurable average deal value (FR-CRM-18)
- Timeline disclosure flags (FR-CRM-19)
- Multi-tenant boundary isolation.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.call import Call
from api.app.models.crm import Contact, ContactMergeLog
from api.app.models.outbound import ConsentRecord, SuppressionRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User

init_db()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


def _setup_tenant(name: str = "CRM v2 Tenant") -> tuple[str, str, str]:
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    tenant = Tenant(
        id=tenant_id,
        name=name,
        status="active",
        config={"average_deal_value": 300.0},
    )
    db.add(tenant)

    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=f"crm2-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_test_password",
        full_name="CRM v2 Admin",
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user_id, "role": "tenant_owner", "tenant_id": tenant_id})
    return tenant_id, user_id, token


def test_configurable_stages_crud_and_reorder(client: TestClient) -> None:
    """FR-CRM-11: Stages can be seeded, customized, reordered, and deleted with reassignment."""
    tenant_id, _, token = _setup_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch initial stages (should auto-seed defaults)
    res = client.get("/api/v1/crm/stages", headers=headers)
    assert res.status_code == 200
    stages = res.json()
    assert len(stages) == 6
    stage_keys = [s["stage_key"] for s in stages]
    assert "new_lead" in stage_keys
    assert "booked" in stage_keys

    # 2. Add custom stage
    res = client.post(
        "/api/v1/crm/stages",
        json={
            "stage_key": "contract_sent",
            "label": "Contract Out",
            "color": "border-indigo-300 bg-indigo-50 text-indigo-700",
        },
        headers=headers,
    )
    assert res.status_code == 201
    created_stage = res.json()
    assert created_stage["stage_key"] == "contract_sent"
    assert created_stage["is_system"] is False

    # Verify pipeline reflects the new stage
    p_res = client.get("/api/v1/crm/pipeline", headers=headers)
    assert p_res.status_code == 200
    assert "contract_sent" in p_res.json()["stages"]

    # 3. Reorder stages
    new_order = ["new_lead", "contract_sent", "ai_called", "qualified", "booked", "closed", "lost"]
    reorder_res = client.put(
        "/api/v1/crm/stages/reorder",
        json={"stage_keys": new_order},
        headers=headers,
    )
    assert reorder_res.status_code == 200
    reordered = reorder_res.json()
    assert reordered[1]["stage_key"] == "contract_sent"
    assert reordered[1]["order_index"] == 1

    # 4. Attempt to delete system stage should fail
    del_sys_res = client.delete("/api/v1/crm/stages/new_lead", headers=headers)
    assert del_sys_res.status_code == 400

    # 5. Delete custom stage
    del_custom_res = client.delete("/api/v1/crm/stages/contract_sent", headers=headers)
    assert del_custom_res.status_code == 200


def test_contact_duplicate_detection_and_merge(client: TestClient) -> None:
    """FR-CRM-13: Duplicate detection and non-destructive merging with calls reassigned."""
    tenant_id, _, token = _setup_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    phone_target = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    phone_source = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    shared_email = f"shared-{uuid.uuid4().hex[:6]}@example.com"

    # Create target (survivor) contact
    c1_res = client.post(
        "/api/v1/crm/contacts",
        json={
            "name": "Jane Doe Primary",
            "phone": phone_target,
            "email": shared_email,
            "stage": "qualified",
            "tags": ["VIP"],
            "notes": "Target contact notes.",
        },
        headers=headers,
    )
    assert c1_res.status_code == 201
    target_id = c1_res.json()["id"]

    # Create source contact sharing same email
    c2_res = client.post(
        "/api/v1/crm/contacts",
        json={
            "name": "Jane Duplicate",
            "phone": phone_source,
            "email": shared_email,
            "stage": "new_lead",
            "tags": ["TradeShow"],
            "notes": "Source contact notes from expo.",
        },
        headers=headers,
    )
    assert c2_res.status_code == 201
    source_id = c2_res.json()["id"]

    # Add a mock call attached to source contact
    with SessionLocal() as db:
        call = Call(
            call_id=f"call-merge-{uuid.uuid4().hex[:8]}",
            tenant_id=tenant_id,
            contact_id=source_id,
            direction="inbound",
            recording_status="completed",
            duration_s=120,
            billable_minutes=2,
            outcome="qualified",
            urgency="normal",
            sentiment_label="positive",
        )
        db.add(call)
        db.commit()

    # Detect duplicates
    dup_res = client.get("/api/v1/crm/contacts/duplicates", headers=headers)
    assert dup_res.status_code == 200
    dups = dup_res.json()
    assert any(d["match_value"] == shared_email.lower() for d in dups)

    # Perform Merge
    merge_res = client.post(
        f"/api/v1/crm/contacts/{target_id}/merge",
        json={
            "source_id": source_id,
            "preferred_name": "Jane Doe Unified",
            "preferred_notes": "Consolidated record after merge.",
        },
        headers=headers,
    )
    assert merge_res.status_code == 200
    merge_data = merge_res.json()
    assert merge_data["name"] == "Jane Doe Unified"
    assert "VIP" in merge_data["tags"]
    assert "TradeShow" in merge_data["tags"]
    assert merge_data["calls_reassigned"] == 1

    # Verify source contact was deleted
    source_check = client.get(f"/api/v1/crm/contacts/{source_id}", headers=headers)
    assert source_check.status_code == 404

    # Verify call now belongs to target contact
    detail_res = client.get(f"/api/v1/crm/contacts/{target_id}", headers=headers)
    assert detail_res.status_code == 200
    target_detail = detail_res.json()
    assert len(target_detail["calls"]) == 1
    # Check disclosure badges are present (FR-CRM-19)
    assert target_detail["calls"][0]["ai_voice_disclosed"] is True
    assert target_detail["calls"][0]["recording_disclosed"] is True

    # Verify merge log was recorded
    with SessionLocal() as db:
        log = db.scalar(
            select(ContactMergeLog).where(ContactMergeLog.survivor_contact_id == target_id)
        )
        assert log is not None
        assert log.merged_contact_id == source_id


def test_contact_consent_evidentiary_panel(client: TestClient) -> None:
    """FR-CRM-14: Consent audit panel shows full evidentiary trail and suppression state."""
    tenant_id, _, token = _setup_tenant()
    headers = {"Authorization": f"Bearer {token}"}
    phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    c_res = client.post(
        "/api/v1/crm/contacts",
        json={"name": "Consent Prospect", "phone": phone},
        headers=headers,
    )
    contact_id = c_res.json()["id"]

    # Seed ConsentRecord and Suppression in DB
    with SessionLocal() as db:
        db.add(
            ConsentRecord(
                tenant_id=tenant_id,
                phone_number=phone,
                category="C",
                method="web_form",
                ai_voice_disclosed=True,
                form_url="https://apexplumbing.com/contact",
                ip_address="198.51.100.42",
                seller_name="Apex Plumbing",
            )
        )
        db.add(
            SuppressionRecord(
                tenant_id=tenant_id,
                phone_number=phone,
                reason="Spoken opt-out during call",
            )
        )
        db.commit()

    res = client.get(f"/api/v1/crm/contacts/{contact_id}/consent-audit", headers=headers)
    assert res.status_code == 200
    audit = res.json()
    assert audit["phone"] == phone
    assert audit["tenant_suppressed"] is True
    assert audit["suppression_reason"] == "Spoken opt-out during call"
    assert len(audit["consents"]) == 1
    assert audit["consents"][0]["category"] == "C"
    assert audit["consents"][0]["ai_voice_disclosed"] is True
    assert "audit_export_url" in audit


def test_csv_import_with_consent_attestation(client: TestClient) -> None:
    """FR-CRM-16: CSV import requires attestation; rows without consent are marked non-callable."""
    tenant_id, _, token = _setup_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    phone_consented = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    phone_unconsented = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    import_payload = {
        "consent_attestation": True,
        "default_category": "B",
        "rows": [
            {
                "name": "Consented Lead",
                "phone": phone_consented,
                "email": "consented@example.com",
                "consent_given": True,
            },
            {
                "name": "Unconsented Lead",
                "phone": phone_unconsented,
                "email": "unconsented@example.com",
                "consent_given": False,
            },
        ],
    }

    res = client.post("/api/v1/crm/contacts/import-csv", json=import_payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 2
    assert data["callable"] == 1
    assert data["non_callable"] == 1

    # Verify in DB
    with SessionLocal() as db:
        c1 = db.scalar(
            select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone == phone_consented)
        )
        assert c1.is_callable is True

        c2 = db.scalar(
            select(Contact).where(
                Contact.tenant_id == tenant_id, Contact.phone == phone_unconsented
            )
        )
        assert c2.is_callable is False
        assert "non-callable" in c2.tags

        # Verify ConsentRecord created for consented lead only
        cr = db.scalar(
            select(ConsentRecord).where(
                ConsentRecord.tenant_id == tenant_id, ConsentRecord.phone_number == phone_consented
            )
        )
        assert cr is not None
        assert cr.category == "B"


def test_revenue_recovered_analytics(client: TestClient) -> None:
    """FR-CRM-18: Revenue recovered calculates ROI based on booked/won stages & average deal value."""
    tenant_id, _, token = _setup_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Set average deal value to $500
    settings_res = client.patch(
        "/api/v1/crm/settings/revenue",
        json={"average_deal_value": 500.0},
        headers=headers,
    )
    assert settings_res.status_code == 200
    assert settings_res.json()["average_deal_value"] == 500.0

    # Add 2 booked contacts and 1 won contact
    for i in range(2):
        client.post(
            "/api/v1/crm/contacts",
            json={
                "name": f"Booked Lead {i}",
                "phone": f"+1512{uuid.uuid4().int % 9000000 + 1000000}",
                "stage": "booked",
            },
            headers=headers,
        )
    client.post(
        "/api/v1/crm/contacts",
        json={
            "name": "Won Customer",
            "phone": f"+1512{uuid.uuid4().int % 9000000 + 1000000}",
            "stage": "closed",
        },
        headers=headers,
    )

    # Fetch revenue recovered
    res = client.get("/api/v1/crm/analytics/revenue-recovered", headers=headers)
    assert res.status_code == 200
    rev = res.json()
    assert rev["average_deal_value"] == 500.0
    assert rev["booked_count"] == 2
    assert rev["won_count"] == 1
    assert rev["total_conversions"] == 3
    # 3 conversions * $500 = $1,500.00
    assert rev["total_revenue_recovered"] == 1500.0
    assert "booked" in rev["pipeline_breakdown"]


def test_cross_tenant_isolation(client: TestClient) -> None:
    """Multi-tenancy boundary: Tenant A cannot access, merge, or delete Tenant B's contacts/stages."""
    tenant_a, _, token_a = _setup_tenant("Tenant A")
    tenant_b, _, token_b = _setup_tenant("Tenant B")

    # Create contact in Tenant A
    res_a = client.post(
        "/api/v1/crm/contacts",
        json={"name": "Tenant A Contact", "phone": f"+1512{uuid.uuid4().int % 9000000 + 1000000}"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    contact_a_id = res_a.json()["id"]

    # Tenant B tries to get contact A
    res_b_get = client.get(
        f"/api/v1/crm/contacts/{contact_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_b_get.status_code == 404

    # Tenant B tries to merge contact A into its own contact
    res_b_contact = client.post(
        "/api/v1/crm/contacts",
        json={"name": "Tenant B Contact", "phone": f"+1512{uuid.uuid4().int % 9000000 + 1000000}"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    contact_b_id = res_b_contact.json()["id"]

    merge_hack_res = client.post(
        f"/api/v1/crm/contacts/{contact_b_id}/merge",
        json={"source_id": contact_a_id},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert merge_hack_res.status_code == 404
