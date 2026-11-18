"""Comprehensive tests for Step 3: Outbound Integrations Engine (HubSpot, Zoho, GHL, Pipedrive, Zapier).

Verifies:
1. HubSpotAdapter format contracts (Contacts v3 & Engagements/Calls v3 with audio recording).
2. ZohoAdapter format contracts (REST API v3 Contacts & Calls).
3. HighLevelAdapter format contracts (Contacts upsert & Notes with sentiment).
4. PipedriveAdapter format contracts (Persons & Activities with durations).
5. HMAC-SHA256 payload signing for Zapier and Make webhooks.
6. Unified dispatch_all_crm_and_webhook_sync orchestrator.
7. Multi-tenant Integrations REST API (list, connect CRM, disconnect, webhook subscriptions).
"""

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.call import Call
from api.app.models.crm import Contact, CRMIntegration, WebhookSubscription
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.integrations.gohighlevel import HighLevelAdapter
from api.app.services.integrations.hubspot import HubSpotAdapter
from api.app.services.integrations.pipedrive import PipedriveAdapter
from api.app.services.integrations.sync_dispatcher import dispatch_all_crm_and_webhook_sync
from api.app.services.integrations.webhooks import sign_webhook_payload
from api.app.services.integrations.zoho import ZohoAdapter

init_db()
client = TestClient(app)


@pytest.fixture
def integration_tenant() -> Any:
    """Fixture providing an active tenant and authenticated user token."""
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        tenant = Tenant(
            id=str(uuid.uuid4()),
            name=f"Integration Tenant {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        user = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant.id,
            email=f"crm_owner_{suffix}@test.io",
            hashed_password="pw_hash_mock",
            full_name="CRM Owner",
            role="tenant_admin",
            is_active=True,
        )
        db.add_all([tenant, user])
        db.commit()

        token = create_access_token(
            data={"sub": user.id, "role": "tenant_admin", "tenant_id": tenant.id}
        )

        yield {
            "tenant_id": tenant.id,
            "user_id": user.id,
            "token": token,
            "headers": {"Authorization": f"Bearer {token}"},
        }
    finally:
        db.query(WebhookSubscription).filter(WebhookSubscription.tenant_id == tenant.id).delete()
        db.query(CRMIntegration).filter(CRMIntegration.tenant_id == tenant.id).delete()
        db.query(Call).filter(Call.tenant_id == tenant.id).delete()
        db.query(Contact).filter(Contact.tenant_id == tenant.id).delete()
        db.query(User).filter(User.tenant_id == tenant.id).delete()
        db.query(Tenant).filter(Tenant.id == tenant.id).delete()
        db.commit()
        db.close()


# ===========================================================================
# 1. INDIVIDUAL CRM ADAPTER CONTRACT TESTS
# ===========================================================================


def test_hubspot_adapter_contracts() -> None:
    """Verify HubSpotAdapter correctly maps contacts and call logs."""
    adapter = HubSpotAdapter(access_token="pat-na1-mock-token", portal_id="123456")
    contact = Contact(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        name="Bruce Wayne",
        phone="+15125550199",
        email="bruce@wayneenterprises.com",
        stage="qualified",
    )
    call = Call(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        call_id="call_hubspot_001",
        caller_number="+15125550199",
        dialed_number="+18005550100",
        duration_s=140.0,
        outcome="appointment_booked",
        sentiment_label="positive",
        sentiment_score=0.85,
        recording_url="https://storage.vedavoice.io/audio/call_001.mp3",
        message={"summary": "Customer confirmed technician visit."},
    )

    contact_res = adapter.sync_contact(contact)
    assert contact_res["status"] == "success"
    assert contact_res["endpoint"] == "/crm/v3/objects/contacts"
    props = contact_res["payload"]["properties"]
    assert props["firstname"] == "Bruce"
    assert props["lastname"] == "Wayne"
    assert props["phone"] == "+15125550199"

    call_res = adapter.log_call(call, contact)
    assert call_res["status"] == "success"
    assert call_res["endpoint"] == "/crm/v3/objects/calls"
    call_props = call_res["payload"]["properties"]
    assert call_props["hs_call_duration"] == "140000"
    assert call_props["hs_call_recording_url"] == "https://storage.vedavoice.io/audio/call_001.mp3"
    assert "POSITIVE (+0.85)" in call_props["hs_call_body"]


def test_zoho_adapter_contracts() -> None:
    """Verify ZohoAdapter correctly formats v3 Contacts and Calls."""
    adapter = ZohoAdapter(auth_token="1000.mock.token", domain="https://www.zohoapis.com")
    contact = Contact(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        name="Tony Stark",
        phone="+15125550188",
        email="tony@stark.com",
        source="meta_lead_ad",
        stage="ai_called",
        tags=["VIP"],
    )
    call = Call(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        call_id="call_zoho_001",
        caller_number="+15125550188",
        direction="inbound",
        duration_s=95.0,
        outcome="quote_requested",
        sentiment_label="positive",
        sentiment_score=0.75,
        recording_url="https://storage.vedavoice.io/audio/call_zoho.mp3",
    )

    contact_res = adapter.sync_contact(contact)
    assert contact_res["status"] == "success"
    data = contact_res["payload"]["data"][0]
    assert data["First_Name"] == "Tony"
    assert data["Last_Name"] == "Stark"
    assert data["Phone"] == "+15125550188"

    call_res = adapter.log_call(call, contact)
    assert call_res["status"] == "success"
    c_data = call_res["payload"]["data"][0]
    assert c_data["Call_Type"] == "Inbound"
    assert c_data["Call_Result"] == "quote_requested"
    assert "https://storage.vedavoice.io/audio/call_zoho.mp3" in c_data["Description"]


def test_gohighlevel_adapter_contracts() -> None:
    """Verify HighLevelAdapter formats /contacts/upsert and notes."""
    adapter = HighLevelAdapter(api_key="ghl_mock_key_xyz", location_id="loc_abc_123")
    contact = Contact(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        name="Peter Parker",
        phone="+15125550177",
        email="peter@dailybugle.com",
        source="website_webhook",
        tags=["HVAC Repair"],
    )
    call = Call(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        call_id="call_ghl_001",
        duration_s=120.0,
        outcome="appointment_booked",
        sentiment_label="positive",
        sentiment_score=0.90,
        recording_url="https://storage.vedavoice.io/audio/call_ghl.mp3",
        message={"summary": "Scheduled furnace tune up."},
    )

    contact_res = adapter.sync_contact(contact)
    assert contact_res["status"] == "success"
    payload = contact_res["payload"]
    assert payload["firstName"] == "Peter"
    assert payload["lastName"] == "Parker"
    assert payload["locationId"] == "loc_abc_123"

    call_res = adapter.log_call(call, contact)
    assert call_res["status"] == "success"
    assert "POSITIVE (+0.90)" in call_res["payload"]["body"]
    assert "https://storage.vedavoice.io/audio/call_ghl.mp3" in call_res["payload"]["body"]


def test_pipedrive_adapter_contracts() -> None:
    """Verify PipedriveAdapter formats /v1/persons and /v1/activities."""
    adapter = PipedriveAdapter(api_token="pipe_token_123", company_domain="apexplumbing")
    contact = Contact(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        name="Clark Kent",
        phone="+15125550166",
        email="clark@planet.com",
    )
    call = Call(
        id=str(uuid.uuid4()),
        tenant_id="t1",
        call_id="call_pipe_001",
        duration_s=210.0,
        outcome="completed",
        sentiment_label="neutral",
        sentiment_score=0.10,
        recording_url="https://storage.vedavoice.io/audio/call_pipe.mp3",
        started_at=datetime(2026, 11, 16, 14, 30, tzinfo=UTC),
        ended_at=datetime(2026, 11, 16, 14, 33, 30, tzinfo=UTC),
    )

    contact_res = adapter.sync_contact(contact)
    assert contact_res["status"] == "success"
    assert contact_res["payload"]["name"] == "Clark Kent"
    assert contact_res["payload"]["phone"][0]["value"] == "+15125550166"

    call_res = adapter.log_call(call, contact)
    assert call_res["status"] == "success"
    act = call_res["payload"]
    assert act["type"] == "call"
    assert act["duration"] == "03:30"
    assert act["due_date"] == "2026-11-16"
    assert "NEUTRAL (+0.10)" in act["note"]


# ===========================================================================
# 2. HMAC-SHA256 WEBHOOK SIGNING TESTS (ZAPIER / MAKE)
# ===========================================================================


def test_hmac_webhook_signing() -> None:
    """Verify sign_webhook_payload produces deterministic HMAC-SHA256 digest."""
    secret = "webhook_secret_key_12345"
    payload = json.dumps({"event": "call.completed", "call_id": "test_1"}).encode("utf-8")

    sig = sign_webhook_payload(payload, secret)
    assert sig is not None
    assert len(sig) == 64

    # Verify matching verification
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    assert sig == expected


# ===========================================================================
# 3. UNIFIED DISPATCHER TEST
# ===========================================================================


def test_dispatch_all_crm_and_webhook_sync(integration_tenant: dict[str, Any]) -> None:
    """Verify unified dispatcher queries tenant CRMs and webhooks on call completion."""
    tenant_id = integration_tenant["tenant_id"]

    with SessionLocal() as db:
        # Register HubSpot integration
        crm = CRMIntegration(
            tenant_id=tenant_id,
            provider="hubspot",
            status="connected",
            api_key_or_token="mock_hubspot_token",
            config={"portal_id": "999"},
        )
        db.add(crm)

        # Register Call
        call = Call(
            tenant_id=tenant_id,
            call_id="call_dispatch_test",
            caller_number="+15125550199",
            duration_s=60.0,
            outcome="appointment_booked",
            sentiment_label="positive",
            sentiment_score=0.88,
        )
        db.add(call)
        db.commit()

        dispatch_res = dispatch_all_crm_and_webhook_sync(call.call_id, db=db)
        assert dispatch_res["status"] == "success"
        crm_syncs = dispatch_res["results"]["crm_syncs"]
        assert len(crm_syncs) == 1
        assert crm_syncs[0]["provider"] == "hubspot"


# ===========================================================================
# 4. MULTI-TENANT REST API INTEGRATION TESTS
# ===========================================================================


def test_tenant_integrations_rest_api(integration_tenant: dict[str, Any]) -> None:
    """Verify authenticated tenant can connect, list, and disconnect CRMs and webhooks."""
    headers = integration_tenant["headers"]

    # 1. Connect HubSpot
    connect_res = client.post(
        "/api/v1/integrations/crm",
        headers=headers,
        json={
            "provider": "hubspot",
            "api_key_or_token": "pat-na1-mock-123",
            "config": {"portal_id": "888123"},
        },
    )
    assert connect_res.status_code == 200
    assert connect_res.json()["success"] is True
    assert connect_res.json()["provider"] == "hubspot"

    # 2. Connect GoHighLevel
    ghl_res = client.post(
        "/api/v1/integrations/crm",
        headers=headers,
        json={
            "provider": "gohighlevel",
            "api_key_or_token": "ghl_token_456",
            "config": {"location_id": "loc_test_789"},
        },
    )
    assert ghl_res.status_code == 200

    # 3. Register Zapier Webhook
    hook_res = client.post(
        "/api/v1/integrations/webhooks",
        headers=headers,
        json={
            "target_url": "https://hooks.zapier.com/hooks/catch/123/abc",
            "events": ["call.completed"],
            "secret": "my_zapier_secret",
        },
    )
    assert hook_res.status_code == 201
    webhook_id = hook_res.json()["id"]

    # 4. List all integrations
    list_res = client.get("/api/v1/integrations", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    crm_providers = [c["provider"] for c in data["crms"]]
    assert "hubspot" in crm_providers
    assert "gohighlevel" in crm_providers
    assert len(data["webhooks"]) >= 1

    # 5. Disconnect HubSpot
    del_crm = client.delete("/api/v1/integrations/crm/hubspot", headers=headers)
    assert del_crm.status_code == 200

    # 6. Delete Webhook
    del_hook = client.delete(f"/api/v1/integrations/webhooks/{webhook_id}", headers=headers)
    assert del_hook.status_code == 200
