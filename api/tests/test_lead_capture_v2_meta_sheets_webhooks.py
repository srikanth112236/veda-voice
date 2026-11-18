"""Unit & Integration Tests for Milestone M9c: Inbound Lead Capture & Ingestion Engine.

Tests cover:
- Universal Form Webhook: multipart/form-data, application/x-www-form-urlencoded, and JSON ingestion
- Webhook secret token authentication gate (X-VedaVoice-Secret and query param)
- Auto-dial control flag (immediate dispatch vs silent queueing)
- Meta Lead Ads Webhook: verification handshake (hub.challenge)
- Meta HMAC-SHA256 signature validation (X-Hub-Signature-256)
- Google Sheets Two-Way Sync: inbound row ingestion, compliance gate, and post-call writeback
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.config import settings
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.crm import Contact
from api.app.models.lead_form import Lead
from api.app.models.outbound import ConsentRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User

client = TestClient(app)


def _setup_lead_tenant(webhook_secret: str | None = None) -> tuple[str, str, str]:
    """Helper to provision a test tenant with optional webhook secret."""
    db = SessionLocal()
    tenant_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    config = {}
    if webhook_secret:
        config["webhook_secret"] = webhook_secret

    tenant = Tenant(
        id=tenant_id,
        name=f"Lead Intake Tenant {uuid.uuid4().hex[:6]}",
        status="active",
        config=config,
    )
    db.add(tenant)

    user = User(
        id=user_id,
        tenant_id=tenant_id,
        email=f"intake-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="hashed_pw_test",
        full_name="Lead Intake Admin",
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)
    db.commit()

    token = create_access_token({"sub": user_id, "role": "tenant_owner", "tenant_id": tenant_id})
    return tenant_id, user_id, token


# ===========================================================================
# 1. UNIVERSAL FORM WEBHOOK: MULTI-FORMAT & SMART EXTRACTION
# ===========================================================================


def test_universal_webhook_multipart_and_urlencoded_ingestion() -> None:
    """Verify endpoint ingests multipart/form-data (CF7/WPForms) and urlencoded forms."""
    tenant_id, _, _ = _setup_lead_tenant()

    # 1. Multipart/form-data (e.g. Contact Form 7 with file or standard form)
    multipart_data = {
        "your-name": "Sarah Connor",
        "your-phone": "+15125550788",
        "your-email": "sarah@resistance.com",
        "your-message": "Emergency furnace repair needed immediately.",
        "consent": "yes",
    }
    resp1 = client.post(
        f"/api/v1/leads/webhook/{tenant_id}",
        data=multipart_data,  # sends as application/x-www-form-urlencoded / multipart
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["status"] == "success"
    assert "lead_id" in data1
    assert "contact_id" in data1

    # Verify contact created with normalized phone
    with SessionLocal() as db:
        c1 = db.scalar(select(Contact).where(Contact.id == data1["contact_id"]))
        assert c1 is not None
        assert c1.name == "Sarah Connor"
        assert c1.phone == "+15125550788"
        assert c1.email == "sarah@resistance.com"
        assert c1.is_callable is True

        # Verify 5-year consent record logged
        consent = db.scalar(
            select(ConsentRecord).where(
                ConsentRecord.tenant_id == tenant_id,
                ConsentRecord.phone_number == "+15125550788",
            )
        )
        assert consent is not None
        assert consent.category == "C"
        assert consent.ai_voice_disclosed is True


def test_universal_webhook_tenant_secret_authentication() -> None:
    """Verify webhook secret verification when configured on tenant."""
    secret_key = "veda_sec_topsecret123"
    tenant_id, _, _ = _setup_lead_tenant(webhook_secret=secret_key)

    payload = {"name": "Bob Smith", "phone": "+15125550899"}

    # 1. Reject without secret
    res_no_sec = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=payload)
    assert res_no_sec.status_code == 401
    assert "Webhook secret mismatch" in res_no_sec.json()["detail"]

    # 2. Allow with X-VedaVoice-Secret header
    res_header = client.post(
        f"/api/v1/leads/webhook/{tenant_id}",
        json=payload,
        headers={"X-VedaVoice-Secret": secret_key},
    )
    assert res_header.status_code == 200
    assert res_header.json()["status"] == "success"

    # 3. Allow with ?secret= query parameter
    res_query = client.post(
        f"/api/v1/leads/webhook/{tenant_id}?secret={secret_key}",
        json={"name": "Alice Query", "phone": "+15125550911"},
    )
    assert res_query.status_code == 200
    assert res_query.json()["status"] == "success"


def test_universal_webhook_auto_dial_flag_control() -> None:
    """Verify auto_dial=False ingests lead into CRM without triggering immediate outbound call."""
    tenant_id, _, _ = _setup_lead_tenant()

    payload = {
        "name": "Silent Lead",
        "phone": "+15125550922",
        "service": "General consultation",
        "auto_dial": False,
    }
    res = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["auto_dial"] is False

    with SessionLocal() as db:
        lead = db.scalar(select(Lead).where(Lead.id == data["lead_id"]))
        assert lead is not None
        assert lead.outbound_call_triggered is False
        assert lead.status == "queued"


# ===========================================================================
# 2. META (FACEBOOK / INSTAGRAM) LEAD ADS WEBHOOK
# ===========================================================================


def test_meta_webhook_verification_handshake() -> None:
    """Verify Meta webhook challenge verification handshake."""
    # 1. Valid handshake
    res = client.get(
        "/api/v1/leads/meta/webhook?hub.mode=subscribe&hub.challenge=1158201244&hub.verify_token=vedavoice_meta_verify_token"
    )
    assert res.status_code == 200
    assert res.text == "1158201244"

    # 2. Invalid verify token
    res_bad = client.get(
        "/api/v1/leads/meta/webhook?hub.mode=subscribe&hub.challenge=1158201244&hub.verify_token=invalid_token"
    )
    assert res_bad.status_code == 403
    assert "token mismatch" in res_bad.json()["detail"].lower()


def test_meta_webhook_hmac_sha256_signature_validation() -> None:
    """Verify Meta webhook signature enforcement and lead ingestion."""
    tenant_id, _, _ = _setup_lead_tenant()
    test_secret = "test_meta_app_secret_9988"

    payload = {
        "object": "page",
        "entry": [
            {
                "id": "10023456789",
                "time": 1700000000,
                "changes": [
                    {
                        "field": "leadgen",
                        "value": {
                            "leadgen_id": "meta_lead_776655",
                            "page_id": "10023456789",
                            "tenant_id": tenant_id,
                            "field_data": [
                                {"name": "full_name", "values": ["Rachel Green"]},
                                {"name": "phone_number", "values": ["+15125550933"]},
                                {"name": "email", "values": ["rachel@centralperk.com"]},
                            ],
                        },
                    }
                ],
            }
        ],
    }
    raw_bytes = json.dumps(payload).encode("utf-8")

    # Compute valid HMAC-SHA256 signature
    valid_sig = (
        "sha256=" + hmac.new(test_secret.encode("utf-8"), raw_bytes, hashlib.sha256).hexdigest()
    )

    # 1. Request with invalid signature when secret is configured
    original_secret = settings.META_APP_SECRET
    try:
        settings.META_APP_SECRET = test_secret

        res_bad_sig = client.post(
            "/api/v1/leads/meta/webhook",
            content=raw_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb",
            },
        )
        assert res_bad_sig.status_code == 403
        assert "Invalid Meta webhook signature" in res_bad_sig.json()["detail"]

        # 2. Request with valid signature
        res_good = client.post(
            "/api/v1/leads/meta/webhook",
            content=raw_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": valid_sig,
            },
        )
        assert res_good.status_code == 200
        data = res_good.json()
        assert data["status"] == "success"
        assert data["processed_count"] == 1

        # Verify contact created with source meta_lead_ad
        with SessionLocal() as db:
            c = db.scalar(select(Contact).where(Contact.phone == "+15125550933"))
            assert c is not None
            assert c.name == "Rachel Green"
            assert c.source == "meta_lead_ad"
    finally:
        settings.META_APP_SECRET = original_secret


# ===========================================================================
# 3. GOOGLE SHEETS 2-WAY SYNC & POST-CALL WRITEBACK
# ===========================================================================


def test_google_sheets_inbound_and_post_call_writeback() -> None:
    """Verify Google Sheets row ingestion and post-call telemetry writeback."""
    tenant_id, _, token = _setup_lead_tenant()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Ingest row from Google Sheets
    sheet_payload = {
        "Name": "Dwight Schrute",
        "Phone": "+15125550944",
        "Email": "dwight@dundermifflin.com",
        "Service": "Paper distribution inquiry",
        "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        "sheet_name": "InboundLeads",
        "row_index": 7,
        "writeback_url": "mock_apps_script_writeback_endpoint",
        "auto_dial": False,  # Queue silently for writeback test
    }
    sync_res = client.post(f"/api/v1/leads/sheets/sync/{tenant_id}", json=sheet_payload)
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["status"] == "success"

    # 2. Simulate completed Call record linked to this contact
    contact_id = sync_data["contact_id"]
    call_id = f"call-sheet-{uuid.uuid4().hex[:8]}"
    with SessionLocal() as db:
        test_call = Call(
            id=str(uuid.uuid4()),
            call_id=call_id,
            tenant_id=tenant_id,
            contact_id=contact_id,
            caller_number="+15125550944",
            recording_status="completed",
            duration_s=180.5,
            billable_minutes=4,
            outcome="appointment_booked",
            sentiment_label="positive",
            sentiment_score=0.85,
            recording_url="https://storage.vedavoice.ai/recordings/test-sheet.mp3",
            message={"summary": "Dwight confirmed appointment for beet harvest consultation."},
            started_at=datetime.now(UTC),
            ended_at=datetime.now(UTC),
        )
        db.add(test_call)
        db.commit()

    # 3. Trigger Google Sheets Writeback
    wb_res = client.post(f"/api/v1/leads/sheets/writeback/{call_id}", headers=headers)
    assert wb_res.status_code == 200
    wb_data = wb_res.json()
    assert wb_data["success"] is True
    assert wb_data["delivered"] is True
    assert wb_data["writeback"]["outcome"] == "appointment_booked"
    assert wb_data["writeback"]["sentiment_label"] == "positive"
    assert wb_data["writeback"]["duration_s"] == 180.5
    assert (
        wb_data["writeback"]["recording_url"]
        == "https://storage.vedavoice.ai/recordings/test-sheet.mp3"
    )
    assert "Dwight confirmed appointment" in wb_data["writeback"]["summary"]
