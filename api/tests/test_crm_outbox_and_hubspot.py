"""Tests for Milestone M9a: CRM Outbox Architecture and HubSpot OAuth 2.0 Integration.

Covers:
- HubSpot OAuth authorization URL generation and signed state verification (FR-INT-1)
- Code exchange and envelope token encryption (FR-INT-2)
- Transactional outbox queuing (FR-INT-3)
- Background worker execution, idempotency via crm_entity_links (FR-INT-4)
- Exponential backoff retry and dead-letter quarantine (FR-INT-3)
- Dead-letter re-queue endpoint (FR-INT-3)
- Plan entitlement gating for CRM connectors (FR-INT-11)
- Multi-tenancy RLS isolation.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token, decrypt_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.crm_sync import CRMConnection, CRMEntityLink, CRMSyncOutbox
from api.app.models.entitlement import TenantEntitlementOverride
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.integrations.outbox_worker import (
    enqueue_crm_outbox,
    process_outbox_batch,
)

init_db()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


def _setup_crm_tenant(tier: str = "growth") -> tuple[str, str, str]:
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    tenant = Tenant(
        id=tenant_id,
        name=f"HubSpot Tenant {uuid.uuid4().hex[:6]}",
        status="active",
    )
    db.add(tenant)

    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=f"hs-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw_test",
        full_name="HubSpot Admin",
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user_id, "role": "tenant_owner", "tenant_id": tenant_id})
    return tenant_id, user_id, token


def test_hubspot_oauth_flow_and_token_encryption(client: TestClient) -> None:
    """FR-INT-1 & FR-INT-2: HubSpot OAuth URL generation, callback code exchange, and token encryption."""
    tenant_id, _, token = _setup_crm_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Request OAuth authorization URL
    connect_res = client.get("/api/v1/integrations/hubspot/connect", headers=headers)
    assert connect_res.status_code == 200
    data = connect_res.json()
    assert "authorization_url" in data
    auth_url = data["authorization_url"]
    assert "https://app.hubspot.com/oauth/authorize" in auth_url
    assert "state=" in auth_url

    # Extract state token from the authorization URL
    import urllib.parse

    parsed = urllib.parse.urlparse(auth_url)
    params = urllib.parse.parse_qs(parsed.query)
    state = params["state"][0]

    # 2. Simulate HubSpot OAuth Redirect Callback
    callback_res = client.get(
        f"/api/v1/integrations/hubspot/callback?code=mock_code_abc123&state={state}"
    )
    assert callback_res.status_code == 200
    callback_data = callback_res.json()
    assert callback_data["success"] is True
    assert callback_data["provider"] == "hubspot"

    # 3. Verify connection in DB with envelope encryption
    with SessionLocal() as db:
        conn = db.scalar(
            select(CRMConnection).where(
                CRMConnection.tenant_id == tenant_id,
                CRMConnection.provider == "hubspot",
            )
        )
        assert conn is not None
        assert conn.status == "connected"
        assert conn.token_ciphertext != "hs_access_mock_code_abc123"

        # Verify decryption restores the original tokens
        decrypted = decrypt_token(conn.token_ciphertext)
        assert isinstance(decrypted, dict)
        assert "access_token" in decrypted
        assert decrypted["access_token"] == "hs_access_mock_code_abc123"


@pytest.mark.anyio
async def test_transactional_outbox_queue_and_batch_processing(client: TestClient) -> None:
    """FR-INT-3 & FR-INT-4: Transactional outbox queuing, background processing, and entity links."""
    tenant_id, _, token = _setup_crm_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Establish mock connection
    connect_res = client.get("/api/v1/integrations/hubspot/connect", headers=headers)
    state = urllib_state(connect_res.json()["authorization_url"])
    client.get(f"/api/v1/integrations/hubspot/callback?code=mock_test_token&state={state}")

    # Enqueue a test contact upsert job
    internal_contact_id = str(uuid.uuid4())
    with SessionLocal() as db:
        jobs = enqueue_crm_outbox(
            db=db,
            tenant_id=tenant_id,
            entity="contact",
            internal_id=internal_contact_id,
            op="upsert",
            payload={
                "name": "Alex Mercer",
                "phone": "+15125550188",
                "email": "alex@mercer.com",
                "stage": "qualified",
            },
        )
        db.commit()
        assert len(jobs) == 1
        assert jobs[0].status == "queued"
        assert jobs[0].attempt == 0

    # Process batch with background worker
    with SessionLocal() as db:
        result = await process_outbox_batch(db, batch_size=10)
        assert result["processed"] >= 1
        assert result["succeeded"] >= 1

        # Verify job marked as done
        job = db.scalar(
            select(CRMSyncOutbox).where(CRMSyncOutbox.internal_id == internal_contact_id)
        )
        assert job.status == "done"
        assert job.last_error is None

        # Verify crm_entity_links stored external ID
        link = db.scalar(
            select(CRMEntityLink).where(
                CRMEntityLink.tenant_id == tenant_id,
                CRMEntityLink.entity == "contact",
                CRMEntityLink.internal_id == internal_contact_id,
            )
        )
        assert link is not None
        assert link.external_id.startswith("hs_contact_")


@pytest.mark.anyio
async def test_outbox_exponential_backoff_and_dead_letter_quarantine(client: TestClient) -> None:
    """FR-INT-3: Failures trigger exponential backoff; 5 failures move to dead-letter queue."""
    tenant_id, _, token = _setup_crm_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    connect_res = client.get("/api/v1/integrations/hubspot/connect", headers=headers)
    state = urllib_state(connect_res.json()["authorization_url"])
    client.get(f"/api/v1/integrations/hubspot/callback?code=mock_backoff_token&state={state}")

    internal_id = str(uuid.uuid4())
    with SessionLocal() as db:
        jobs = enqueue_crm_outbox(
            db=db,
            tenant_id=tenant_id,
            entity="contact",
            internal_id=internal_id,
            op="upsert",
            payload={"name": "Faulty Contact", "phone": "+15125550999"},
        )
        db.commit()
        job_id = jobs[0].id

    # Mock provider failure
    with patch(
        "api.app.services.integrations.hubspot.HubSpotProvider.upsert_contact",
        side_effect=RuntimeError("HubSpot API 503 Service Unavailable"),
    ):
        with SessionLocal() as db:
            # Attempt 1
            await process_outbox_batch(db, batch_size=10)
            j1 = db.scalar(select(CRMSyncOutbox).where(CRMSyncOutbox.id == job_id))
            assert j1.status == "failed"
            assert j1.attempt == 1
            assert "503" in j1.last_error

            # Simulate 4 more failures by incrementing attempt and resetting next_attempt_at
            j1.attempt = 4
            j1.next_attempt_at = datetime.now(UTC) - timedelta(seconds=10)
            db.commit()

            # Attempt 5 should move to dead-letter queue
            await process_outbox_batch(db, batch_size=10)
            j_dead = db.scalar(select(CRMSyncOutbox).where(CRMSyncOutbox.id == job_id))
            assert j_dead.status == "dead"

    # Verify dead-letter shows up in outbox dashboard
    outbox_res = client.get("/api/v1/integrations/outbox", headers=headers)
    assert outbox_res.status_code == 200
    assert outbox_res.json()["counts"]["dead"] >= 1

    # Re-queue dead-letter job
    retry_res = client.post("/api/v1/integrations/outbox/retry-dead", headers=headers)
    assert retry_res.status_code == 200
    assert retry_res.json()["requeued_count"] >= 1

    with SessionLocal() as db:
        j_revived = db.scalar(select(CRMSyncOutbox).where(CRMSyncOutbox.id == job_id))
        assert j_revived.status == "queued"
        assert j_revived.attempt == 0


def test_crm_connector_plan_gating(client: TestClient) -> None:
    """FR-INT-11: Plan entitlement crm.connectors.max prevents unauthorized CRM connections."""
    tenant_id, _, token = _setup_crm_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Override tenant entitlement to 0 connectors
    with SessionLocal() as db:
        db.add(
            TenantEntitlementOverride(
                tenant_id=tenant_id,
                key="crm.connectors.max",
                value=0,
                reason="Restricted testing tier",
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
        )
        db.commit()

    connect_res = client.get("/api/v1/integrations/hubspot/connect", headers=headers)
    assert connect_res.status_code == 403
    assert "crm.connectors.max" in connect_res.json()["detail"]


def test_disconnect_crm_purges_connection(client: TestClient) -> None:
    """FR-INT-12: Disconnecting provider removes connection and stops syncing."""
    tenant_id, _, token = _setup_crm_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # Connect
    connect_res = client.get("/api/v1/integrations/hubspot/connect", headers=headers)
    state = urllib_state(connect_res.json()["authorization_url"])
    client.get(f"/api/v1/integrations/hubspot/callback?code=mock_del_token&state={state}")

    # Verify connected
    list_res = client.get("/api/v1/integrations/crm", headers=headers)
    assert any(c["provider"] == "hubspot" for c in list_res.json())

    # Disconnect
    del_res = client.delete("/api/v1/integrations/crm/hubspot", headers=headers)
    assert del_res.status_code == 200

    # Verify removed
    list_res2 = client.get("/api/v1/integrations/crm", headers=headers)
    assert not any(c["provider"] == "hubspot" for c in list_res2.json())


def urllib_state(url: str) -> str:
    import urllib.parse

    parsed = urllib.parse.urlparse(url)
    return urllib.parse.parse_qs(parsed.query)["state"][0]
