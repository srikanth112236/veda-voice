"""Unit and integration tests for Phase E: Pack Customization Studio & Live Sandbox endpoints.

Validates:
1. POST /api/v1/portal/industry-packs/preview-prompt
   - Variable substitution preview without database mutations
   - Custom emergency trigger compilation
   - Dynamic intake tree schema markdown compilation
2. POST /api/v1/portal/industry-packs/sandbox/turn
   - Conversational greeting & fee inquiry simulation
   - Life safety emergency detection, safety guidance injection & on-call routing
   - Real-time intake triage field extraction
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import Tenant
from api.app.models.user import User


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_context():
    with SessionLocal() as db:
        t_id = f"ten_e_{uuid.uuid4().hex[:8]}"
        u_id = f"usr_e_{uuid.uuid4().hex[:8]}"
        tenant = Tenant(
            id=t_id,
            name="Apex Comfort Studio Co",
            status="active",
            hours="8AM-5PM",
        )
        user = User(
            id=u_id,
            tenant_id=t_id,
            email=f"owner_{uuid.uuid4().hex[:6]}@apexstudio.test",
            hashed_password="test-password-hash",
            full_name="Studio Operator",
            role="tenant_admin",
        )
        db.add(tenant)
        db.add(user)
        db.commit()

        token = create_access_token(data={"sub": u_id, "tenant_id": t_id, "role": "tenant_admin"})
        headers = {"Authorization": f"Bearer {token}"}
        yield {"headers": headers, "tenant_id": t_id, "user_id": u_id}


def test_preview_prompt_compilation(client, auth_context):
    """Test previewing prompt compilation with custom variables, emergency rules and intake tree."""
    payload = {
        "pack_slug": "home_services",
        "vars": {
            "business_name": "Apex HVAC Pros",
            "specialties": "Heat pumps, boilers, emergency plumbing",
            "diagnostic_fee": "$99 standard trip fee",
            "emergency_phone": "+18005559999",
        },
        "emergency_keywords": ["sewage backup", "gas smell"],
        "custom_safety_script": "Evacuate the premises and keep 50 feet away.",
    }

    resp = client.post(
        "/api/v1/portal/industry-packs/preview-prompt",
        json=payload,
        headers=auth_context["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["pack_slug"] == "home_services"
    assert "Apex HVAC Pros" in data["compiled_prompt"]
    assert "Heat pumps, boilers, emergency plumbing" in data["compiled_prompt"]
    assert "sewage backup" in data["emergency_triggers"]
    assert "gas smell" in data["emergency_triggers"]
    assert data["safety_advice"] == "Evacuate the premises and keep 50 feet away."
    assert data["intake_tree_active"] is True
    assert data["fields_count"] >= 3
    assert (
        "# HOME SERVICES TRADE TRIAGE PROTOCOL:" in data["compiled_prompt"]
        or "PROTOCOL:" in data["compiled_prompt"]
    )


def test_sandbox_conversational_turn_greeting_and_fee(client, auth_context):
    """Test conversational sandbox turns for standard greeting and fee queries."""
    # 1. Greeting
    resp = client.post(
        "/api/v1/portal/industry-packs/sandbox/turn",
        json={
            "pack_slug": "home_services",
            "message": "Hello, good morning!",
            "history": [],
            "vars": {"business_name": "Apex HVAC Pros"},
        },
        headers=auth_context["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "Apex HVAC Pros" in data["reply"]
    assert data["detected_emergency"] is False
    assert data["turn_count"] == 1

    # 2. Fee inquiry
    resp_fee = client.post(
        "/api/v1/portal/industry-packs/sandbox/turn",
        json={
            "pack_slug": "home_services",
            "message": "How much is your diagnostic fee?",
            "history": [{"role": "user", "text": "Hello"}],
            "vars": {"business_name": "Apex HVAC Pros", "diagnostic_fee": "$79 dispatch fee"},
        },
        headers=auth_context["headers"],
    )
    assert resp_fee.status_code == 200, resp_fee.text
    fee_data = resp_fee.json()
    assert "$79 dispatch fee" in fee_data["reply"]
    assert fee_data["detected_emergency"] is False
    assert fee_data["turn_count"] == 2


def test_sandbox_emergency_detection_and_safety_routing(client, auth_context):
    """Test sandbox detects life safety emergencies and provides immediate guidance + on-call routing."""
    resp = client.post(
        "/api/v1/portal/industry-packs/sandbox/turn",
        json={
            "pack_slug": "home_services",
            "message": "Help! There is an urgent gas leak in our basement right now!",
            "history": [],
            "vars": {
                "business_name": "Apex Emergency Dispatch",
                "emergency_phone": "+18005559111",
            },
            "emergency_keywords": ["gas leak"],
            "custom_safety_script": "Please leave the building immediately and do not touch light switches.",
        },
        headers=auth_context["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["detected_emergency"] is True
    assert data["emergency_trigger"] == "gas leak"
    assert "Please leave the building immediately" in data["safety_advice"]
    assert data["escalated_to"] == "+18005559111"
    assert "urgent emergency regarding gas leak" in data["reply"]
    assert "Apex Emergency Dispatch" in data["reply"]


def test_sandbox_intake_triage_extraction(client, auth_context):
    """Test sandbox extracts structured intake triage values into structured JSON."""
    resp = client.post(
        "/api/v1/portal/industry-packs/sandbox/turn",
        json={
            "pack_slug": "home_services",
            "message": "I need help with residential plumbing. It is an urgent situation with water leaking.",
            "history": [],
            "vars": {"business_name": "Apex Plumbing"},
        },
        headers=auth_context["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "extracted_intake" in data
    extracted = data["extracted_intake"]
    # Should extract trade_type or property_type based on options match
    assert (
        extracted.get("trade_type") == "Plumbing" or extracted.get("property_type") == "Residential"
    )
