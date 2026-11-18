"""Tests for Native CRM API endpoints (Contacts, Visual Pipeline, and Email Campaigns)."""

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.tenant import Tenant
from api.app.models.user import User

init_db()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def crm_tenant() -> dict[str, str]:
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    tenant = Tenant(
        id=tenant_id,
        name="CRM Test Tenant",
        status="active",
    )
    db.add(tenant)

    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=f"crm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="fake_hashed_pw",
        full_name="CRM Manager",
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user_id, "role": "tenant_owner", "tenant_id": tenant_id})
    return {"tenant_id": tenant_id, "user_id": user_id, "token": token}


def test_crm_pipeline_empty(client: TestClient, crm_tenant: dict[str, str]) -> None:
    res = client.get(
        "/api/v1/crm/pipeline",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "stages" in data
    assert "new_lead" in data["stages"]
    assert "ai_called" in data["stages"]
    assert "qualified" in data["stages"]
    assert "booked" in data["stages"]
    assert "closed" in data["stages"]
    assert data["total"] == 0


def test_crm_contact_crud_and_pipeline_progression(
    client: TestClient, crm_tenant: dict[str, str]
) -> None:
    # 1. Create Contact
    create_payload = {
        "name": "Sarah Connor",
        "phone": "+15125559090",
        "email": "sarah@skynet.test",
        "source": "website_form",
        "stage": "new_lead",
        "tags": ["Interested", "High Priority"],
        "notes": "Requested HVAC emergency quote",
        "custom_fields": {"budget": "$1500"},
    }
    create_res = client.post(
        "/api/v1/crm/contacts",
        json=create_payload,
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert create_res.status_code == 201
    contact_data = create_res.json()
    contact_id = contact_data["id"]
    assert contact_data["name"] == "Sarah Connor"

    # 2. Check Pipeline has contact in 'new_lead'
    pipe_res = client.get(
        "/api/v1/crm/pipeline",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert pipe_res.status_code == 200
    pipe_data = pipe_res.json()
    assert pipe_data["counts"]["new_lead"] == 1
    assert pipe_data["stages"]["new_lead"][0]["id"] == contact_id

    # 3. Transition stage (Drag and Drop simulation)
    patch_res = client.patch(
        f"/api/v1/crm/contacts/{contact_id}",
        json={"stage": "qualified", "tags": ["Interested", "Qualified Lead"]},
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["stage"] == "qualified"

    # 4. Detail view contains timeline
    detail_res = client.get(
        f"/api/v1/crm/contacts/{contact_id}",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["stage"] == "qualified"
    assert len(detail["timeline"]) >= 2  # Created + Stage change events

    # 5. Delete Contact
    del_res = client.delete(
        f"/api/v1/crm/contacts/{contact_id}",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert del_res.status_code == 200

    # 6. Verify 404 after delete
    get_res = client.get(
        f"/api/v1/crm/contacts/{contact_id}",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert get_res.status_code == 404


def test_crm_email_campaigns_and_broadcast(client: TestClient, crm_tenant: dict[str, str]) -> None:
    # 1. Create a campaign
    camp_payload = {
        "name": "Post-Call Demo Follow-up",
        "subject": "Thanks for speaking with VedaVoice AI",
        "body_html": "<p>Hi {{name}}, here is your link to schedule a demo.</p>",
        "trigger_event": "stage_changed",
        "target_stage": "qualified",
    }
    camp_res = client.post(
        "/api/v1/crm/campaigns",
        json=camp_payload,
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert camp_res.status_code == 201
    campaign_id = camp_res.json()["id"]

    # 2. List campaigns
    list_res = client.get(
        "/api/v1/crm/campaigns",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 3. Trigger broadcast
    send_res = client.post(
        f"/api/v1/crm/campaigns/{campaign_id}/send",
        headers={"Authorization": f"Bearer {crm_tenant['token']}"},
    )
    assert send_res.status_code == 200
    assert send_res.json()["success"] is True
