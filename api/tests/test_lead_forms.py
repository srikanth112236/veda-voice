"""Tests for Multi-Tenant Lead Form Builder, Public Submissions, and Leads Inbox."""

import uuid

from fastapi.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_tenant_form_crud_lifecycle() -> None:
    """Verify tenant owner can create, list, inspect, and update custom intake forms."""
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@apexplumbing.com", "password": "ApexOwner2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a custom lead form
    create_res = client.post(
        "/api/v1/forms",
        headers=headers,
        json={
            "title": "HVAC Seasonal Inspection Request",
            "description": "Book a spring furnace & air conditioning tune-up.",
            "fields": [
                {
                    "name": "caller_name",
                    "label": "Full Customer Name",
                    "type": "text",
                    "required": True,
                    "placeholder": "John Doe",
                },
                {
                    "name": "caller_phone",
                    "label": "Mobile Phone",
                    "type": "tel",
                    "required": True,
                    "placeholder": "+1 (512) 555-0199",
                },
                {
                    "name": "system_age",
                    "label": "Age of HVAC Unit",
                    "type": "select",
                    "required": False,
                    "options": ["Under 5 years", "5-10 years", "Over 10 years"],
                },
            ],
            "submit_action": "call_triage",
        },
    )
    assert create_res.status_code == 200
    form_id = create_res.json()["id"]
    assert create_res.json()["title"] == "HVAC Seasonal Inspection Request"

    # 2. List forms
    list_res = client.get("/api/v1/forms", headers=headers)
    assert list_res.status_code == 200
    forms = list_res.json()
    assert any(f["id"] == form_id for f in forms)

    # 3. Update form
    update_res = client.put(
        f"/api/v1/forms/{form_id}",
        headers=headers,
        json={"title": "HVAC & Heat Pump Spring Inspection Request"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "HVAC & Heat Pump Spring Inspection Request"


def test_public_form_schema_and_lead_submission() -> None:
    """Verify public visitor can view form schema and submit a lead without authentication."""
    # First get or create a form as tenant
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@apexplumbing.com", "password": "ApexOwner2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    forms_res = client.get("/api/v1/forms", headers=headers)
    assert forms_res.status_code == 200
    form_id = forms_res.json()[0]["id"]

    # Public schema lookup (no auth header)
    pub_res = client.get(f"/api/v1/forms/{form_id}/public")
    assert pub_res.status_code == 200
    pub_schema = pub_res.json()
    assert "title" in pub_schema
    assert "fields" in pub_schema
    assert len(pub_schema["fields"]) >= 1

    # Public form submission (simulating website visitor)
    test_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    sub_res = client.post(
        f"/api/v1/forms/{form_id}/submit",
        json={
            "caller_name": "Marcus Vance",
            "caller_phone": test_phone,
            "urgency": "urgent",
            "service_requested": "Water Heater Leaking",
            "service_address": "804 Lavaca St, Austin, TX",
            "custom_data": {"referral_code": "YELP2026", "preferred_time": "morning"},
        },
    )
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert sub_data["success"] is True
    assert "lead_id" in sub_data
    assert "call_triage_triggered" in sub_data

    # Verify lead appears in tenant leads inbox
    leads_res = client.get("/api/v1/forms/leads/all", headers=headers)
    assert leads_res.status_code == 200
    leads = leads_res.json()
    found = next((item for item in leads if item["id"] == sub_data["lead_id"]), None)
    assert found is not None
    assert found["caller_name"] == "Marcus Vance"
    assert found["caller_phone"] == test_phone
    assert found["custom_data"]["referral_code"] == "YELP2026"

    # Update lead status to contacted
    status_res = client.post(
        f"/api/v1/forms/leads/{found['id']}/status",
        headers=headers,
        json={"status": "contacted"},
    )
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "contacted"
