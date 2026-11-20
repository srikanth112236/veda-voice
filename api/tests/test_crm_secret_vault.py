"""Comprehensive Security Tests for Multi-Tenant CRM Secret Vault.

Tests:
1. Per-tenant cryptographic isolation (HKDF-SHA256 key derivation with tenant salt).
2. AES-256-GCM authenticated encryption and tamper-evident authentication tag check.
3. Dual-read backward compatibility (transparently reads modern v2:gcm: and legacy tokens).
4. Masked fingerprint generation (••••last4) for zero-leakage display.
5. End-to-end API response sanitization (no raw keys in response).
6. Outbox background worker JIT decryption and dispatch.
"""

from __future__ import annotations

import asyncio
import base64
import uuid
from datetime import UTC, datetime

import pytest
from cryptography.exceptions import InvalidTag
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import (
    compute_key_fingerprint,
    create_access_token,
    decrypt_crm_credentials,
    encrypt_crm_credentials,
    encrypt_token,
)
from api.app.db.session import SessionLocal
from api.app.main import _crm_outbox_sweeper_loop, app, init_db
from api.app.models.crm_sync import CRMConnection, CRMSyncOutbox
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.integrations.outbox_worker import process_outbox_batch

init_db()

client = TestClient(app)


def test_tenant_cryptographic_isolation() -> None:
    """Verify that credentials encrypted for Tenant A cannot be decrypted by Tenant B."""
    tenant_a = f"tenant-{uuid.uuid4().hex[:8]}"
    tenant_b = f"tenant-{uuid.uuid4().hex[:8]}"
    secret_key = "ghl_live_super_secret_key_998877"

    # Encrypt for Tenant A
    cipher_a, fp_a = encrypt_crm_credentials(tenant_a, "gohighlevel", secret_key)
    assert cipher_a.startswith("v2:gcm:")
    assert fp_a == "••••8877"

    # Successfully decrypt for Tenant A
    decrypted_a = decrypt_crm_credentials(tenant_a, "gohighlevel", cipher_a)
    assert decrypted_a == secret_key

    # Attempting to decrypt Tenant A's ciphertext using Tenant B's identity must fail
    with pytest.raises((ValueError, InvalidTag, PermissionError)):
        decrypt_crm_credentials(tenant_b, "gohighlevel", cipher_a)


def test_provider_domain_separation() -> None:
    """Verify that credentials encrypted for provider X cannot be decrypted under provider Y."""
    tenant_id = f"tenant-{uuid.uuid4().hex[:8]}"
    secret_token = "hubspot_token_abc_1234"

    cipher, _ = encrypt_crm_credentials(tenant_id, "hubspot", secret_token)

    # Valid under hubspot
    assert decrypt_crm_credentials(tenant_id, "hubspot", cipher) == secret_token

    # Invalid under pipedrive
    with pytest.raises((ValueError, InvalidTag, PermissionError)):
        decrypt_crm_credentials(tenant_id, "pipedrive", cipher)


def test_aes_256_gcm_tamper_evidence() -> None:
    """Verify that altering even a single bit in the ciphertext causes InvalidTag rejection."""
    tenant_id = f"tenant-{uuid.uuid4().hex[:8]}"
    secret = "pipedrive_api_token_5544332211"

    cipher, _ = encrypt_crm_credentials(tenant_id, "pipedrive", secret)
    parts = cipher.split(":", 4)
    bundle_b64 = parts[4] if len(parts) == 5 else cipher[7:]
    raw_bundle = bytearray(base64.b64decode(bundle_b64))

    # Flip the last byte of the ciphertext tag
    raw_bundle[-1] ^= 0x01
    tampered_bundle = base64.b64encode(raw_bundle).decode("utf-8")
    tampered_cipher = f"v2:gcm:{tenant_id}:pipedrive:{tampered_bundle}"

    # Must raise InvalidTag
    with pytest.raises(InvalidTag):
        decrypt_crm_credentials(tenant_id, "pipedrive", tampered_cipher)


def test_dual_read_legacy_backward_compatibility() -> None:
    """Verify that existing legacy Fernet tokens decrypt seamlessly without interruption."""
    tenant_id = f"tenant-{uuid.uuid4().hex[:8]}"
    legacy_secret = "legacy_zoho_auth_key_112233"

    # Simulate legacy Fernet ciphertext
    legacy_ciphertext = encrypt_token(legacy_secret)
    assert not legacy_ciphertext.startswith("v2:gcm:")

    # Dual-read must automatically decrypt legacy tokens
    decrypted = decrypt_crm_credentials(tenant_id, "zoho", legacy_ciphertext)
    assert decrypted == legacy_secret


def test_compute_key_fingerprint() -> None:
    """Verify fingerprint formatting for strings and OAuth token dictionaries."""
    assert compute_key_fingerprint("sk_live_12345678") == "••••5678"
    assert compute_key_fingerprint({"access_token": "bearer_token_9999"}) == "••••9999"
    assert compute_key_fingerprint({"api_key": "short"}) == "••••hort"
    assert compute_key_fingerprint("ab") == "••••"


def test_api_crm_connect_and_list_zero_leakage() -> None:
    """Verify that POST and GET endpoints never leak plaintext keys and return safe fingerprints."""
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    tenant = Tenant(
        id=tenant_id,
        name=f"Vault Test Tenant {uuid.uuid4().hex[:6]}",
        status="active",
    )
    db.add(tenant)

    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=f"vault-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="pw",
        full_name="Vault Admin",
        role="tenant_admin",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user_id, "tenant_id": tenant_id, "role": "tenant_admin"})
    headers = {"Authorization": f"Bearer {token}"}

    raw_api_key = "super_confidential_ghl_key_4433"

    # 1. Connect CRM via API
    resp = client.post(
        "/api/v1/integrations/crm",
        json={
            "provider": "gohighlevel",
            "api_key_or_token": raw_api_key,
            "config": {"location_id": "loc_12345"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["key_fingerprint"] == "••••4433"
    # Plaintext key MUST NOT appear anywhere in response JSON
    assert raw_api_key not in resp.text

    # 2. Check Database record: stored ciphertext must be modern v2:gcm:
    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == "gohighlevel",
        )
    )
    assert conn is not None
    assert conn.token_ciphertext.startswith("v2:gcm:")
    assert conn.key_fingerprint == "••••4433"
    assert raw_api_key not in conn.token_ciphertext

    # 3. List integrations via API
    list_resp = client.get("/api/v1/integrations", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    crms = list_data.get("crms", [])
    ghl_item = next((c for c in crms if c["provider"] == "gohighlevel"), None)
    assert ghl_item is not None
    assert ghl_item["key_fingerprint"] == "••••4433"
    # Plaintext key MUST NOT appear anywhere in list response
    assert raw_api_key not in list_resp.text

    db.close()


@pytest.mark.asyncio
async def test_outbox_worker_jit_decryption() -> None:
    """Verify outbox worker decrypts credentials JIT using tenant vault."""
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    raw_token = "mock_outbox_hubspot_token_7766"

    # Ensure parent tenant exists for foreign key constraint
    tenant = Tenant(
        id=tenant_id,
        name=f"Outbox Tenant {uuid.uuid4().hex[:6]}",
        status="active",
    )
    db.add(tenant)
    db.flush()

    # Store encrypted connection
    ciphertext, fingerprint = encrypt_crm_credentials(tenant_id, "hubspot", raw_token)
    conn = CRMConnection(
        tenant_id=tenant_id,
        provider="hubspot",
        status="connected",
        external_account_id="portal_test_99",
        token_ciphertext=ciphertext,
        key_fingerprint=fingerprint,
        field_map={},
        settings={},
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(conn)
    db.flush()

    # Enqueue a test outbox job
    job = CRMSyncOutbox(
        tenant_id=tenant_id,
        connection_id=conn.id,
        entity="contact",
        internal_id=f"contact-{uuid.uuid4().hex[:6]}",
        op="upsert",
        payload={"name": "Alice Vault", "phone": "+15125550188"},
        attempt=0,
        next_attempt_at=datetime.now(UTC),
        status="queued",
        created_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()

    # Process outbox batch
    results = await process_outbox_batch(db, batch_size=10, tenant_id=tenant_id)
    assert results["succeeded"] >= 1

    db.refresh(job)
    assert job.status == "done"

    db.close()


@pytest.mark.asyncio
async def test_crm_outbox_sweeper_cycle_auto_retries() -> None:
    """Verify Gap #1: Automated outbox sweeper cycle picks up and processes pending retry jobs."""
    from api.app.main import run_crm_outbox_sweeper_cycle

    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    raw_token = "mock_sweeper_ghl_key_1122"

    tenant = Tenant(
        id=tenant_id,
        name=f"Sweeper Tenant {uuid.uuid4().hex[:6]}",
        status="active",
    )
    db.add(tenant)
    db.flush()

    ciphertext, fingerprint = encrypt_crm_credentials(tenant_id, "gohighlevel", raw_token)
    conn = CRMConnection(
        tenant_id=tenant_id,
        provider="gohighlevel",
        status="connected",
        external_account_id="loc_sweeper_test",
        token_ciphertext=ciphertext,
        key_fingerprint=fingerprint,
        field_map={},
        settings={"location_id": "loc_sweeper_test"},
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(conn)
    db.flush()

    job_id = str(uuid.uuid4())
    # Enqueue outbox job with past next_attempt_at (simulating retry eligibility)
    job = CRMSyncOutbox(
        id=job_id,
        tenant_id=tenant_id,
        connection_id=conn.id,
        entity="contact",
        internal_id=f"contact-{uuid.uuid4().hex[:6]}",
        op="upsert",
        payload={"name": "Sweeper Contact", "phone": "+15125550177"},
        attempt=1,
        next_attempt_at=datetime.now(UTC),
        status="failed",
        last_error="Simulated 429 rate limit backoff",
        created_at=datetime.now(UTC),
    )
    db.add(job)
    db.commit()
    db.close()

    # Execute automated sweeper cycle
    cycle_res = await run_crm_outbox_sweeper_cycle(batch_size=50)
    assert cycle_res["processed"] >= 1
    assert cycle_res["succeeded"] >= 1

    # Verify job transitioned from failed -> done
    with SessionLocal() as db_check:
        db_job = db_check.scalar(select(CRMSyncOutbox).where(CRMSyncOutbox.id == job_id))
        assert db_job is not None
        assert db_job.status == "done"


@pytest.mark.asyncio
async def test_crm_outbox_sweeper_loop_lifecycle() -> None:
    """Verify Gap #1: Background sweeper loop runs and terminates cleanly when stop_event is signaled."""
    stop_event = asyncio.Event()
    # Start loop with very short interval (0.05s) for fast unit test execution
    sweeper_task = asyncio.create_task(_crm_outbox_sweeper_loop(stop_event, interval_seconds=0.05))

    # Let the loop tick at least once
    await asyncio.sleep(0.1)

    # Signal stop
    stop_event.set()
    await asyncio.wait_for(sweeper_task, timeout=1.0)
    assert sweeper_task.done()
