"""Tests for Phase 1 core prompt rules, objections, and strict grounding APIs."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User

init_db()
client = TestClient(app)


@pytest.fixture
def two_tenants() -> Any:
    """Create two isolated tenants with users and a DID for Tenant A."""
    db = SessionLocal()
    try:
        suf = uuid.uuid4().hex[:6]
        t_a = Tenant(
            name=f"Beacon Dental {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-17:00",
            status="active",
        )
        t_b = Tenant(
            name=f"Apex Legal {suf}",
            timezone="America/Chicago",
            hours="Mon-Fri 09:00-17:00",
            status="active",
        )
        db.add_all([t_a, t_b])
        db.flush()

        u_a = User(
            tenant_id=t_a.id,
            email=f"dentist_{suf}@example.com",
            full_name="Dr. Dentist",
            hashed_password="hashed",
            role="owner",
            is_active=True,
        )
        u_b = User(
            tenant_id=t_b.id,
            email=f"lawyer_{suf}@example.com",
            full_name="Atty. Lawyer",
            hashed_password="hashed",
            role="owner",
            is_active=True,
        )
        p_a = AgentProfile(tenant_id=t_a.id)
        p_b = AgentProfile(tenant_id=t_b.id)
        did_a = PhoneNumber(
            tenant_id=t_a.id,
            e164=f"+1512555{uuid.uuid4().int % 10000:04d}",
            status="active",
        )
        db.add_all([u_a, u_b, p_a, p_b, did_a])
        db.commit()

        tok_a = create_access_token({"sub": u_a.id, "tenant_id": t_a.id, "role": "owner"})
        tok_b = create_access_token({"sub": u_b.id, "tenant_id": t_b.id, "role": "owner"})
        yield {
            "t_a": t_a.id,
            "t_b": t_b.id,
            "did_a": did_a.e164,
            "headers_a": {"Authorization": f"Bearer {tok_a}"},
            "headers_b": {"Authorization": f"Bearer {tok_b}"},
        }
    finally:
        db.close()


def test_portal_profile_phase1_customization_crud_and_isolation(
    two_tenants: dict[str, Any],
) -> None:
    """Verify Phase 1 prompt rules, objections, and strict grounding save, read, and isolate."""
    payload = {
        "custom_instructions": "Always ask whether caller is a new or returning patient first.",
        "do_rules": ["Mention same-day emergency dental slots.", "Confirm insurance carrier name."],
        "dont_rules": ["Never book root canals on Fridays.", "Never quote exact surgical fees."],
        "objection_handlers": [
            {
                "trigger": "Why is the exam fee $89?",
                "response": "The $89 exam includes a full digital scan and treatment plan.",
                "action": "offer_quote",
            }
        ],
        "strict_grounding": True,
        "unknown_fallback_script": "Let me have our front desk coordinator verify that for you.",
        "escalation_rules": [
            {
                "condition": "caller requests billing dispute or refund",
                "target_number": "+15125550101",
                "label": "Office Manager",
            }
        ],
    }

    put_resp = client.put("/api/v1/portal/profile", json=payload, headers=two_tenants["headers_a"])
    assert put_resp.status_code == 200, put_resp.text
    data = put_resp.json()
    assert data["custom_instructions"] == payload["custom_instructions"]
    assert data["do_rules"] == payload["do_rules"]
    assert data["dont_rules"] == payload["dont_rules"]
    assert data["objection_handlers"] == payload["objection_handlers"]
    assert data["strict_grounding"] is True
    assert data["unknown_fallback_script"] == payload["unknown_fallback_script"]
    assert data["escalation_rules"] == payload["escalation_rules"]

    get_a = client.get("/api/v1/portal/profile", headers=two_tenants["headers_a"])
    assert get_a.status_code == 200
    assert get_a.json()["strict_grounding"] is True

    # Tenant B must remain isolated with default empty values
    get_b = client.get("/api/v1/portal/profile", headers=two_tenants["headers_b"])
    assert get_b.status_code == 200
    b_data = get_b.json()
    assert b_data["custom_instructions"] == ""
    assert b_data["do_rules"] == []
    assert b_data["dont_rules"] == []
    assert b_data["objection_handlers"] == []
    assert b_data["strict_grounding"] is False
    assert b_data["escalation_rules"] == []
