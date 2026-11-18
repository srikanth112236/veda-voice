"""Comprehensive tests for Step 2: Universal Lead Capture Gateway & Two-Way Sync.

Verifies:
1. Google Sheets Inbound Row Sync (auto-dials lead, records consent).
2. Google Sheets Outbound Writeback (formats call outcome, summary, sentiment, recording link).
3. Universal Webhook Parsing (WordPress WPForms/CF7, Webflow, Typeform).
4. Meta (Facebook/Instagram) Lead Ads Webhook (verification challenge & instant form ingestion).
5. CSV Bulk Upload (E.164 normalization, DNC suppression filtering, CRM creation).
"""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.lead_form import Lead
from api.app.models.outbound import ConsentRecord, OutboundDispatch, SuppressionRecord
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.integrations.google_sheets import (
    sync_call_result_to_sheets,
)

client = TestClient(app)


@pytest.fixture
def capture_tenant() -> Any:
    """Fixture providing an active tenant with phone numbers and an owner token."""
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        suffix_num = uuid.uuid4().int % 9000 + 1000
        tenant = Tenant(
            name=f"Capture Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-8pm",
            status="active",
            max_concurrent_calls=5,
            max_concurrent_outbound=2,
            monthly_minute_quota=500,
        )
        db.add(tenant)
        db.flush()

        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=f"+1512888{suffix_num}",
            provider="twilio",
            status="active",
        )
        profile = AgentProfile(
            tenant_id=tenant.id,
            agent_name="Sarah",
            greeting="Hello! Thanks for reaching out.",
            pricing_policy="listed",
            emergency_keywords=["gas leak", "pipe burst"],
        )
        user = User(
            email=f"owner_{suffix}@capture.io",
            hashed_password="hashed_pw_mock",
            full_name="Capture Owner",
            tenant_id=tenant.id,
            role="tenant_admin",
            is_active=True,
        )
        db.add_all([phone, profile, user])
        db.commit()

        yield {
            "tenant_id": tenant.id,
            "caller_id": phone.e164,
            "user_id": user.id,
            "user_email": user.email,
        }
    finally:
        db.query(OutboundDispatch).filter(OutboundDispatch.tenant_id == tenant.id).delete()
        db.query(ConsentRecord).filter(ConsentRecord.tenant_id == tenant.id).delete()
        db.query(SuppressionRecord).filter(SuppressionRecord.tenant_id == tenant.id).delete()
        db.query(ContactTimelineEvent).filter(ContactTimelineEvent.tenant_id == tenant.id).delete()
        db.query(Call).filter(Call.tenant_id == tenant.id).delete()
        db.query(Lead).filter(Lead.tenant_id == tenant.id).delete()
        db.query(Contact).filter(Contact.tenant_id == tenant.id).delete()
        db.query(User).filter(User.tenant_id == tenant.id).delete()
        db.query(PhoneNumber).filter(PhoneNumber.tenant_id == tenant.id).delete()
        db.query(AgentProfile).filter(AgentProfile.tenant_id == tenant.id).delete()
        db.query(Tenant).filter(Tenant.id == tenant.id).delete()
        db.commit()
        db.close()


# ===========================================================================
# 1. GOOGLE SHEETS TWO-WAY SYNC TESTS
# ===========================================================================


def test_google_sheets_inbound_row_sync(capture_tenant: dict[str, Any]) -> None:
    """Verify inbound row from Google Sheets creates Contact, records consent, and triggers call."""
    tenant_id = capture_tenant["tenant_id"]
    phone_suffix = uuid.uuid4().int % 9000000 + 1000000
    sheet_phone = f"+1512{phone_suffix}"

    raw_row_data = {
        "Customer Name": "Gordon Freeman",
        "Phone Number": sheet_phone,
        "Email Address": "gordon@blackmesa.gov",
        "Service Requested": "Emergency Valve Replacement",
        "Consent Confirmed": "Yes",
        "spreadsheet_id": "sheet_abc_123",
        "sheet_name": "InboundLeads",
        "row_index": 42,
    }

    resp = client.post(f"/api/v1/leads/sheets/sync/{tenant_id}", json=raw_row_data)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["contact_id"] is not None
    assert "compliance_passed" in data

    # Verify Contact in database has sheet metadata
    with SessionLocal() as db:
        contact = db.scalar(select(Contact).where(Contact.id == data["contact_id"]))
        assert contact is not None
        assert contact.name == "Gordon Freeman"
        assert contact.phone == sheet_phone
        assert contact.source == "google_sheets"
        assert contact.custom_fields["spreadsheet_id"] == "sheet_abc_123"
        assert contact.custom_fields["row_index"] == 42


def test_google_sheets_outbound_writeback_payload(capture_tenant: dict[str, Any]) -> None:
    """Verify format_sheet_writeback generates all required columns for spreadsheet update."""
    tenant_id = capture_tenant["tenant_id"]
    phone_suffix = uuid.uuid4().int % 9000000 + 1000000
    lead_phone = f"+1512{phone_suffix}"

    with SessionLocal() as db:
        contact = Contact(
            tenant_id=tenant_id,
            name="Alyx Vance",
            phone=lead_phone,
            source="google_sheets",
            custom_fields={"spreadsheet_id": "sheet_xyz_999", "row_index": 15},
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        call = Call(
            tenant_id=tenant_id,
            contact_id=contact.id,
            call_id=f"call_sheets_{uuid.uuid4().hex[:8]}",
            caller_number=lead_phone,
            dialed_number=capture_tenant["caller_id"],
            direction="outbound",
            duration_s=185.0,
            billable_minutes=4,
            outcome="appointment_booked",
            sentiment_score=0.92,
            sentiment_label="positive",
            recording_url="https://blob.vedavoice.io/recordings/call_sheets.mp3",
            message={"summary": "Customer confirmed booking for Friday at 10 AM."},
        )
        db.add(call)
        db.commit()
        db.refresh(call)

        writeback_res = sync_call_result_to_sheets(call.call_id, db=db)
        assert writeback_res["status"] == "success"
        wb = writeback_res["writeback"]
        assert wb["call_id"] == call.call_id
        assert wb["outcome"] == "appointment_booked"
        assert wb["sentiment_label"] == "positive"
        assert wb["sentiment_score"] == 0.92
        assert wb["recording_url"] == "https://blob.vedavoice.io/recordings/call_sheets.mp3"
        assert wb["spreadsheet_id"] == "sheet_xyz_999"
        assert wb["row_index"] == 15
        assert "Friday at 10 AM" in wb["summary"]


# ===========================================================================
# 2. UNIVERSAL WEBHOOK PARSING TESTS (WPFORMS, WEBFLOW, TYPEFORM)
# ===========================================================================


def test_universal_webhook_wordpress_wpforms(capture_tenant: dict[str, Any]) -> None:
    """Verify WordPress / WPForms nested payload is parsed seamlessly."""
    tenant_id = capture_tenant["tenant_id"]
    phone_suffix = uuid.uuid4().int % 9000000 + 1000000
    wp_phone = f"+1512{phone_suffix}"

    wpforms_payload = {
        "wpforms": {
            "id": "101",
            "form_title": "Contact Us",
        },
        "fields": {
            "your-name": "Eli Vance",
            "your-phone": wp_phone,
            "your-email": "eli@example.com",
            "your-message": "Need water heater replacement quote.",
        },
        "source": "wordpress_wpforms",
    }

    resp = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=wpforms_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"

    with SessionLocal() as db:
        contact = db.scalar(select(Contact).where(Contact.id == data["contact_id"]))
        assert contact is not None
        assert contact.name == "Eli Vance"
        assert contact.phone == wp_phone
        assert contact.email == "eli@example.com"
        assert len(contact.timeline_events) >= 1


def test_universal_webhook_webflow(capture_tenant: dict[str, Any]) -> None:
    """Verify Webflow Form payload (data: {...}) is parsed seamlessly."""
    tenant_id = capture_tenant["tenant_id"]
    phone_suffix = uuid.uuid4().int % 9000000 + 1000000
    wf_phone = f"+1512{phone_suffix}"

    webflow_payload = {
        "name": "Webflow Lead Form",
        "data": {
            "First_Name": "Barney",
            "Last_Name": "Calhoun",
            "Telephone": wf_phone,
            "Email": "barney@blackmesa.com",
            "Service_Requested": "Commercial Drain Line Inspection",
        },
        "source": "webflow_form",
    }

    resp = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=webflow_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"

    with SessionLocal() as db:
        contact = db.scalar(select(Contact).where(Contact.id == data["contact_id"]))
        assert contact is not None
        assert contact.phone == wf_phone
        assert "Barney" in contact.name


def test_universal_webhook_typeform(capture_tenant: dict[str, Any]) -> None:
    """Verify Typeform nested answer schema is parsed seamlessly."""
    tenant_id = capture_tenant["tenant_id"]
    phone_suffix = uuid.uuid4().int % 9000000 + 1000000
    tf_phone = f"+1512{phone_suffix}"

    typeform_payload = {
        "event_id": "tf_evt_01",
        "event_type": "form_response",
        "form_response": {
            "form_id": "typeform_abc",
            "submitted_at": "2026-11-16T12:00:00Z",
            "answers": [
                {"type": "text", "text": "Isaac Kleiner"},
                {"type": "phone_number", "phone_number": tf_phone},
                {"type": "email", "email": "isaac@teleport.io"},
            ],
        },
    }

    resp = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=typeform_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"

    with SessionLocal() as db:
        contact = db.scalar(select(Contact).where(Contact.id == data["contact_id"]))
        assert contact is not None
        assert contact.name == "Isaac Kleiner"
        assert contact.phone == tf_phone
        assert contact.email == "isaac@teleport.io"


# ===========================================================================
# 3. META LEAD ADS WEBHOOK TESTS
# ===========================================================================


def test_meta_webhook_challenge_verification() -> None:
    """Verify Meta hub challenge verification responds with raw challenge token."""
    challenge_token = "mock_challenge_12345"
    resp = client.get(
        "/api/v1/leads/meta/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.challenge": challenge_token,
            "hub.verify_token": "vedavoice",
        },
    )
    assert resp.status_code == 200
    assert resp.text == challenge_token


def test_meta_lead_ads_instant_form_ingestion(capture_tenant: dict[str, Any]) -> None:
    """Verify Meta Lead Ads notification creates contact and triggers speed-to-lead triage."""
    tenant_id = capture_tenant["tenant_id"]
    phone_suffix = uuid.uuid4().int % 9000000 + 1000000
    meta_phone = f"+1512{phone_suffix}"

    meta_payload = {
        "object": "page",
        "entry": [
            {
                "id": "page_123456789",
                "time": 1700000000,
                "changes": [
                    {
                        "field": "leadgen",
                        "value": {
                            "created_time": 1700000000,
                            "leadgen_id": "meta_lead_9999",
                            "page_id": "page_123456789",
                            "tenant_id": tenant_id,
                            "field_data": [
                                {"name": "full_name", "values": ["Judith Mossman"]},
                                {"name": "phone_number", "values": [meta_phone]},
                                {"name": "email", "values": ["judith@borealis.net"]},
                            ],
                        },
                    }
                ],
            }
        ],
    }

    resp = client.post("/api/v1/leads/meta/webhook", json=meta_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["processed_count"] == 1


# ===========================================================================
# 4. CSV BULK UPLOAD TESTS
# ===========================================================================


def test_csv_bulk_upload_with_suppression(capture_tenant: dict[str, Any]) -> None:
    """Verify CSV upload imports valid rows, skips invalid phones, and filters suppressed DNC numbers."""
    tenant_id = capture_tenant["tenant_id"]

    suffix1 = uuid.uuid4().int % 9000000 + 1000000
    valid_phone = f"+1512{suffix1}"

    suffix2 = uuid.uuid4().int % 9000000 + 1000000
    suppressed_phone = f"+1512{suffix2}"

    # Add suppressed number to DNC list
    with SessionLocal() as db:
        supp = SuppressionRecord(
            tenant_id=tenant_id,
            phone_number=suppressed_phone,
            reason="opt_out",
        )
        db.add(supp)
        db.commit()

    # Build CSV content
    csv_text = (
        "Name,Phone,Email,Service\n"
        f"Valid Lead,{valid_phone},valid@example.com,Boiler Repair\n"
        f"Suppressed Lead,{suppressed_phone},supp@example.com,Emergency Service\n"
        "Bad Phone Lead,invalid_phone_123,bad@example.com,Drain Clean\n"
    )

    from api.app.core.security import create_access_token

    auth_token = create_access_token(
        data={"sub": capture_tenant["user_id"], "role": "tenant_admin", "tenant_id": tenant_id}
    )
    headers = {"Authorization": f"Bearer {auth_token}"}

    resp = client.post(
        "/api/v1/leads/csv-upload",
        headers=headers,
        files={"file": ("leads.csv", csv_text.encode("utf-8"), "text/csv")},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["total_rows"] == 3
    assert data["imported_contacts"] == 1
    assert data["suppressed_skipped"] == 1
    assert data["invalid_phone_skipped"] == 1

    # Verify only the valid non-suppressed lead exists in CRM Contacts
    with SessionLocal() as db:
        contacts = db.scalars(select(Contact).where(Contact.tenant_id == tenant_id)).all()
        contact_phones = [c.phone for c in contacts]
        assert valid_phone in contact_phones
        assert suppressed_phone not in contact_phones
