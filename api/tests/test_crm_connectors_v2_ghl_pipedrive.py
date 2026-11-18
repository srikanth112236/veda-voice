"""Unit and Integration Tests for Milestone M9b: GoHighLevel & Pipedrive Connectors v2.

Tests cover:
- GoHighLevel OAuth 2.0 flow, code exchange, sub-account location resolution, and token envelope encryption
- Pipedrive OAuth 2.0 flow, code exchange, company ID resolution, and token envelope encryption
- Transactional Outbox integration for GHL (contacts, notes) and Pipedrive (persons, activities)
- Cross-system entity idempotency links (CRMEntityLink)
- API key connection fallback with outbox compatibility
- Connector plan entitlement enforcement (crm.connectors.max)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token, decrypt_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.crm_sync import CRMConnection, CRMEntityLink
from api.app.models.entitlement import TenantEntitlementOverride
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.integrations.outbox_worker import (
    enqueue_crm_outbox,
    process_outbox_batch,
)

client = TestClient(app)


def _setup_test_tenant() -> tuple[str, str, str]:
    """Helper to provision an active tenant, tenant admin user, and JWT token."""
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    tenant = Tenant(
        id=tenant_id,
        name=f"CRM Test Tenant {uuid.uuid4().hex[:6]}",
        status="active",
    )
    db.add(tenant)

    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=f"crm-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw_test",
        full_name="CRM Admin",
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user_id, "role": "tenant_owner", "tenant_id": tenant_id})
    return tenant_id, user_id, token


# ===========================================================================
# 1. GOHIGHLEVEL OAUTH 2.0 FLOW & ENVELOPE ENCRYPTION
# ===========================================================================


def test_gohighlevel_oauth_flow_and_token_encryption() -> None:
    """Test GHL Marketplace OAuth authorization URL, code exchange, and locationId storage."""
    tenant_id, _, token = _setup_test_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Request OAuth authorization URL
    connect_res = client.get("/api/v1/integrations/gohighlevel/connect", headers=headers)
    assert connect_res.status_code == 200
    connect_data = connect_res.json()
    assert connect_data["success"] is True
    assert connect_data["provider"] == "gohighlevel"

    auth_url = connect_data["authorization_url"]
    parsed = urlparse(auth_url)
    params = parse_qs(parsed.query)
    assert "marketplace.gohighlevel.com" in parsed.netloc
    assert "state" in params
    state = params["state"][0]

    # 2. Simulate GHL OAuth Redirect Callback with mock authorization code
    callback_res = client.get(
        f"/api/v1/integrations/gohighlevel/callback?code=mock_code_ghl123&state={state}"
    )
    assert callback_res.status_code == 200
    callback_data = callback_res.json()
    assert callback_data["success"] is True
    assert callback_data["provider"] == "gohighlevel"
    assert callback_data["status"] == "connected"
    assert "loc_ghl_mock" in callback_data["location_id"]

    # 3. Verify connection in DB with envelope encryption
    with SessionLocal() as db:
        conn = db.scalar(
            select(CRMConnection).where(
                CRMConnection.tenant_id == tenant_id,
                CRMConnection.provider == "gohighlevel",
            )
        )
        assert conn is not None
        assert conn.status == "connected"
        assert conn.external_account_id == callback_data["location_id"]
        assert conn.token_ciphertext is not None

        # Verify envelope decryption recovers tokens and location metadata
        decrypted = decrypt_token(conn.token_ciphertext)
        assert isinstance(decrypted, dict)
        assert decrypted["access_token"] == "ghl_access_mock_code_ghl123"
        assert decrypted["locationId"] == "loc_ghl_mock_12345"


# ===========================================================================
# 2. PIPEDRIVE OAUTH 2.0 FLOW & ENVELOPE ENCRYPTION
# ===========================================================================


def test_pipedrive_oauth_flow_and_token_encryption() -> None:
    """Test Pipedrive OAuth authorization URL, code exchange, and company_id storage."""
    tenant_id, _, token = _setup_test_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Request OAuth authorization URL
    connect_res = client.get("/api/v1/integrations/pipedrive/connect", headers=headers)
    assert connect_res.status_code == 200
    connect_data = connect_res.json()
    assert connect_data["success"] is True
    assert connect_data["provider"] == "pipedrive"

    auth_url = connect_data["authorization_url"]
    parsed = urlparse(auth_url)
    params = parse_qs(parsed.query)
    assert "oauth.pipedrive.com" in parsed.netloc
    assert "state" in params
    state = params["state"][0]

    # 2. Simulate Pipedrive OAuth Redirect Callback
    callback_res = client.get(
        f"/api/v1/integrations/pipedrive/callback?code=mock_code_pd123&state={state}"
    )
    assert callback_res.status_code == 200
    callback_data = callback_res.json()
    assert callback_data["success"] is True
    assert callback_data["provider"] == "pipedrive"
    assert callback_data["status"] == "connected"
    assert callback_data["company_id"] == "987654"

    # 3. Verify connection in DB with envelope encryption
    with SessionLocal() as db:
        conn = db.scalar(
            select(CRMConnection).where(
                CRMConnection.tenant_id == tenant_id,
                CRMConnection.provider == "pipedrive",
            )
        )
        assert conn is not None
        assert conn.status == "connected"
        assert conn.external_account_id == "987654"

        decrypted = decrypt_token(conn.token_ciphertext)
        assert isinstance(decrypted, dict)
        assert decrypted["access_token"] == "pd_access_mock_code_pd123"


# ===========================================================================
# 3. TRANSACTIONAL OUTBOX: GOHIGHLEVEL SYNC (CONTACTS & NOTES)
# ===========================================================================


@pytest.mark.asyncio
async def test_gohighlevel_outbox_contact_upsert_and_call_logging() -> None:
    """Verify transactional outbox processes GHL contacts and call notes with entity idempotency."""
    tenant_id, _, token = _setup_test_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Connect GHL
    con_res = client.get("/api/v1/integrations/gohighlevel/connect", headers=headers)
    state = parse_qs(urlparse(con_res.json()["authorization_url"]).query)["state"][0]
    client.get(f"/api/v1/integrations/gohighlevel/callback?code=mock_ghl_sync&state={state}")

    internal_contact_id = str(uuid.uuid4())
    internal_call_id = f"call-{uuid.uuid4().hex[:8]}"

    # Enqueue contact upsert job
    with SessionLocal() as db:
        c_jobs = enqueue_crm_outbox(
            db=db,
            tenant_id=tenant_id,
            entity="contact",
            internal_id=internal_contact_id,
            op="upsert",
            payload={
                "name": "Jane GHL Lead",
                "phone": "+15125550299",
                "email": "jane@ghl-test.com",
                "tags": ["Qualified", "HVAC"],
            },
        )
        assert len(c_jobs) == 1
        db.commit()

    # Process outbox batch
    with SessionLocal() as db:
        res1 = await process_outbox_batch(db, batch_size=10, tenant_id=tenant_id)
        assert res1["succeeded"] == 1

        # Verify CRMEntityLink created
        link = db.scalar(
            select(CRMEntityLink).where(
                CRMEntityLink.tenant_id == tenant_id,
                CRMEntityLink.provider == "gohighlevel",
                CRMEntityLink.internal_id == internal_contact_id,
            )
        )
        assert link is not None
        assert "ghl_contact_" in link.external_id

    # Enqueue call log job linked to the contact
    with SessionLocal() as db:
        cl_jobs = enqueue_crm_outbox(
            db=db,
            tenant_id=tenant_id,
            entity="call",
            internal_id=internal_call_id,
            op="log_call",
            payload={
                "call_id": internal_call_id,
                "contact_id": internal_contact_id,
                "duration_s": 145,
                "outcome": "appointment_booked",
                "summary": "Customer requested HVAC diagnostic appointment for Thursday 2pm.",
                "recording_url": "https://storage.vedavoice.ai/recordings/test-ghl.mp3",
            },
        )
        assert len(cl_jobs) == 1
        db.commit()

    # Process call outbox job
    with SessionLocal() as db:
        res2 = await process_outbox_batch(db, batch_size=10, tenant_id=tenant_id)
        assert res2["succeeded"] == 1

        call_link = db.scalar(
            select(CRMEntityLink).where(
                CRMEntityLink.tenant_id == tenant_id,
                CRMEntityLink.provider == "gohighlevel",
                CRMEntityLink.internal_id == internal_call_id,
            )
        )
        assert call_link is not None
        assert "ghl_note_" in call_link.external_id


# ===========================================================================
# 4. TRANSACTIONAL OUTBOX: PIPEDRIVE SYNC (PERSONS & ACTIVITIES)
# ===========================================================================


@pytest.mark.asyncio
async def test_pipedrive_outbox_person_upsert_and_activity_logging() -> None:
    """Verify transactional outbox processes Pipedrive persons and activities."""
    tenant_id, _, token = _setup_test_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Connect Pipedrive
    con_res = client.get("/api/v1/integrations/pipedrive/connect", headers=headers)
    state = parse_qs(urlparse(con_res.json()["authorization_url"]).query)["state"][0]
    client.get(f"/api/v1/integrations/pipedrive/callback?code=mock_pd_sync&state={state}")

    internal_contact_id = str(uuid.uuid4())
    internal_call_id = f"call-{uuid.uuid4().hex[:8]}"

    # Enqueue contact upsert
    with SessionLocal() as db:
        enqueue_crm_outbox(
            db=db,
            tenant_id=tenant_id,
            entity="contact",
            internal_id=internal_contact_id,
            op="upsert",
            payload={
                "name": "Tom Pipedrive Lead",
                "phone": "+15125550388",
                "email": "tom@pipedrive-test.com",
            },
        )
        db.commit()

    with SessionLocal() as db:
        res1 = await process_outbox_batch(db, batch_size=10, tenant_id=tenant_id)
        assert res1["succeeded"] == 1

        person_link = db.scalar(
            select(CRMEntityLink).where(
                CRMEntityLink.tenant_id == tenant_id,
                CRMEntityLink.provider == "pipedrive",
                CRMEntityLink.internal_id == internal_contact_id,
            )
        )
        assert person_link is not None
        assert "pd_person_" in person_link.external_id

    # Enqueue call activity
    with SessionLocal() as db:
        enqueue_crm_outbox(
            db=db,
            tenant_id=tenant_id,
            entity="call",
            internal_id=internal_call_id,
            op="log_call",
            payload={
                "call_id": internal_call_id,
                "contact_id": internal_contact_id,
                "duration_s": 85,
                "outcome": "interested",
                "summary": "Customer inquired about pricing packages.",
                "recording_url": "https://storage.vedavoice.ai/recordings/test-pd.mp3",
            },
        )
        db.commit()

    with SessionLocal() as db:
        res2 = await process_outbox_batch(db, batch_size=10, tenant_id=tenant_id)
        assert res2["succeeded"] == 1

        activity_link = db.scalar(
            select(CRMEntityLink).where(
                CRMEntityLink.tenant_id == tenant_id,
                CRMEntityLink.provider == "pipedrive",
                CRMEntityLink.internal_id == internal_call_id,
            )
        )
        assert activity_link is not None
        assert "pd_activity_" in activity_link.external_id


# ===========================================================================
# 5. API KEY CONNECTION FALLBACK WITH ENVELOPE ENCRYPTION & OUTBOX
# ===========================================================================


@pytest.mark.asyncio
async def test_api_key_connection_syncs_to_outbox() -> None:
    """Verify connecting via Location API Key / Personal Token creates encrypted CRMConnection and works in outbox."""
    tenant_id, _, token = _setup_test_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Connect GHL via API key
    connect_payload = {
        "provider": "gohighlevel",
        "api_key_or_token": "mock_location_api_key_xyz",
        "config": {"location_id": "loc_agency_subaccount_99"},
    }
    res = client.post("/api/v1/integrations/crm", json=connect_payload, headers=headers)
    assert res.status_code == 200

    # Verify CRMConnection exists and is encrypted
    with SessionLocal() as db:
        conn = db.scalar(
            select(CRMConnection).where(
                CRMConnection.tenant_id == tenant_id,
                CRMConnection.provider == "gohighlevel",
            )
        )
        assert conn is not None
        assert conn.status == "connected"
        assert conn.external_account_id == "loc_agency_subaccount_99"

        dec = decrypt_token(conn.token_ciphertext)
        assert dec == "mock_location_api_key_xyz"

    # Test synthetic sync trigger
    test_sync_res = client.post("/api/v1/integrations/crm/gohighlevel/test-sync", headers=headers)
    assert test_sync_res.status_code == 200
    assert test_sync_res.json()["success"] is True

    # Process batch
    with SessionLocal() as db:
        proc_res = await process_outbox_batch(db, batch_size=10, tenant_id=tenant_id)
        assert proc_res["succeeded"] == 1


# ===========================================================================
# 6. CONNECTOR PLAN ENTITLEMENT GATING (crm.connectors.max)
# ===========================================================================


def test_crm_connectors_entitlement_gating() -> None:
    """Verify tenants with crm.connectors.max == 0 are blocked from connecting GHL and Pipedrive."""
    tenant_id, _, token = _setup_test_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Override crm.connectors.max to 0 (no external connectors allowed)
    with SessionLocal() as db:
        override = TenantEntitlementOverride(
            tenant_id=tenant_id,
            key="crm.connectors.max",
            value=0,
            reason="Restricted testing tier",
            created_at=datetime.now(UTC),
        )
        db.add(override)
        db.commit()

    # Attempt connecting GHL -> 403 Forbidden
    ghl_res = client.get("/api/v1/integrations/gohighlevel/connect", headers=headers)
    assert ghl_res.status_code == 403
    assert "crm.connectors.max" in ghl_res.json()["detail"]

    # Attempt connecting Pipedrive -> 403 Forbidden
    pd_res = client.get("/api/v1/integrations/pipedrive/connect", headers=headers)
    assert pd_res.status_code == 403
    assert "crm.connectors.max" in pd_res.json()["detail"]
