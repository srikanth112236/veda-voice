"""Multi-tenant Inbound Webhook & Sync Gateway for Instant Speed-to-Lead Ingestion.

Supports:
1. Universal Webhooks (WordPress CF7/WPForms, Webflow, Typeform, Zapier, Make).
2. Google Sheets Two-Way Inbound Row Sync.
3. Meta (Facebook / Instagram) Lead Ads Webhooks.
4. Tenant CSV Bulk Upload with DNC suppression filtering.
"""

from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.deps import get_current_user
from api.app.db.session import get_db
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.lead_form import Lead
from api.app.models.outbound import ConsentRecord, SuppressionRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.compliance import normalize_e164_phone
from api.app.services.integrations.google_sheets import (
    GoogleSheetWritebackData,
    execute_sheet_writeback,
    parse_raw_sheet_row,
    sync_call_result_to_sheets,
)
from api.app.services.outbound import trigger_speed_to_lead_outbound

logger = logging.getLogger("vedavoice.leads_gateway")

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


class WebhookLeadPayload(BaseModel):
    """Structured lead submission contract."""

    full_name: str | None = Field(None, description="Prospect full name")
    phone: str | None = Field(None, description="Callback phone number")
    email: str | None = Field(None, description="Prospect email address")
    service_requested: str | None = Field(None, description="Service needed")
    source: str = Field("website_webhook", description="Lead source or ad platform")
    consent_confirmed: bool = Field(
        True, description="Prior express written consent confirmed by user"
    )
    consent_timestamp: str | None = Field(None, description="ISO timestamp of consent submission")
    consent_text: str | None = Field(
        None, description="Verbatim agreement text consented to on form"
    )
    custom_data: dict[str, Any] = Field(
        default_factory=dict, description="Arbitrary webhook payload parameters"
    )


def extract_universal_lead_data(
    raw: dict[str, Any],
) -> tuple[str | None, str | None, str | None, str | None, bool, dict[str, Any]]:
    """Flexibly extract lead details from WordPress (CF7/WPForms), Webflow, Typeform, or plain JSON."""
    # 1. Typeform parser
    if "form_response" in raw and isinstance(raw["form_response"], dict):
        resp = raw["form_response"]
        answers = resp.get("answers", [])
        extracted_name = None
        extracted_phone = None
        extracted_email = None
        for ans in answers:
            t = ans.get("type")
            if t == "text" and not extracted_name:
                extracted_name = ans.get("text")
            elif t == "phone_number":
                extracted_phone = ans.get("phone_number")
            elif t == "email":
                extracted_email = ans.get("email")
        return extracted_name, extracted_phone, extracted_email, None, True, raw

    # 2. Webflow / WordPress / Flat dicts
    raw_data = raw.get("data")
    data_dict: dict[str, Any] = (
        raw_data if isinstance(raw_data, dict) else (dict(raw) if isinstance(raw, dict) else {})
    )
    fields = data_dict.get("fields")
    if isinstance(fields, dict):
        data_dict = {**data_dict, **fields}

    flat = {str(k).strip().lower(): v for k, v in data_dict.items()}

    # Name extraction
    name = (
        flat.get("full_name")
        or flat.get("name")
        or flat.get("your-name")
        or flat.get("customer_name")
        or flat.get("first_name")
        or (
            f"{flat.get('first_name', '')} {flat.get('last_name', '')}".strip()
            if "first_name" in flat or "last_name" in flat
            else None
        )
    )

    # Phone extraction
    phone = (
        flat.get("phone")
        or flat.get("phone_number")
        or flat.get("your-phone")
        or flat.get("mobile")
        or flat.get("telephone")
        or flat.get("tel")
        or ""
    )

    # Email extraction
    email = flat.get("email") or flat.get("your-email") or flat.get("email_address")

    # Service extraction
    service = (
        flat.get("service_requested")
        or flat.get("service")
        or flat.get("your-message")
        or flat.get("message")
        or flat.get("inquiry")
        or flat.get("notes")
    )

    consent_raw = flat.get("consent", flat.get("consent_confirmed", True))
    consent_confirmed = (
        consent_raw in (True, 1, "true", "True", "yes", "Yes", "1")
        if isinstance(consent_raw, bool | int | str)
        else True
    )

    return (
        str(name).strip() if name else None,
        str(phone).strip() if phone else None,
        str(email).strip() if email else None,
        str(service).strip() if service else None,
        consent_confirmed,
        raw,
    )


def _process_inbound_lead(
    db: Session,
    tenant: Tenant,
    full_name: str | None,
    raw_phone: str,
    email: str | None = None,
    service_requested: str | None = None,
    source: str = "webhook",
    consent_confirmed: bool = True,
    consent_text: str | None = None,
    custom_data: dict[str, Any] | None = None,
    auto_dial: bool = True,
) -> dict[str, Any]:
    """Core lead intake processing pipeline: consent, CRM contact upsert, compliance check & call dispatch."""
    norm_phone = normalize_e164_phone(raw_phone)
    if not norm_phone:
        raise HTTPException(status_code=422, detail="Invalid phone number provided.")

    now = datetime.now(UTC)
    extra_data = custom_data or {}

    # 1. Record Prior Express Written Consent proof with 5-year retention and AI disclosure
    consent_rec = ConsentRecord(
        tenant_id=tenant.id,
        phone_number=norm_phone,
        source=source,
        consent_confirmed=consent_confirmed,
        consent_text=consent_text or f"Agreed to automated AI phone contact from {tenant.name}.",
        category="C",
        ai_voice_disclosed=True,
        method="web_form" if ("form" in source or "web" in source) else "webhook",
        seller_name=tenant.name,
        created_at=now,
        retention_until=now + timedelta(days=5 * 365),
    )
    db.add(consent_rec)

    # 2. Upsert Contact in Native CRM
    contact = db.scalar(
        select(Contact).where(
            Contact.tenant_id == tenant.id,
            Contact.phone == norm_phone,
        )
    )
    is_callable = consent_confirmed
    tags = ["non-callable"] if not is_callable else []
    if not contact:
        contact = Contact(
            tenant_id=tenant.id,
            name=full_name or "New Lead",
            phone=norm_phone,
            email=email,
            source=source,
            stage="new_lead",
            is_callable=is_callable,
            tags=tags,
            custom_fields=extra_data,
            first_contact_at=now,
            last_contact_at=now,
        )
        db.add(contact)
        db.flush()
    else:
        if full_name:
            contact.name = full_name
        if email:
            contact.email = email
        contact.last_contact_at = now
        contact.is_callable = is_callable
        if not is_callable and "non-callable" not in (contact.tags or []):
            contact.tags = list(set((contact.tags or []) + ["non-callable"]))
        contact.custom_fields = {**(contact.custom_fields or {}), **extra_data}

    # Record Timeline Event on Contact
    timeline_event = ContactTimelineEvent(
        tenant_id=tenant.id,
        contact_id=contact.id,
        event_type="form_submitted",
        title=f"Lead Ingested from {source.replace('_', ' ').title()}",
        description=f"Inquired regarding {service_requested or 'general service'}.",
        payload={
            "source": source,
            "service": service_requested,
            "consent_confirmed": consent_confirmed,
            **extra_data,
        },
    )
    db.add(timeline_event)

    # 3. Record Lead submission
    lead = Lead(
        tenant_id=tenant.id,
        caller_name=full_name,
        caller_phone=norm_phone,
        service_requested=service_requested,
        status="pending",
        outbound_call_triggered=False,
        custom_data={
            "source": source,
            "email": email,
            "consent_confirmed": consent_confirmed,
            "consent_text": consent_rec.consent_text,
            "contact_id": contact.id,
            "auto_dial": auto_dial,
            **extra_data,
        },
    )
    db.add(lead)
    db.flush()

    if not auto_dial:
        lead.outbound_call_triggered = False
        lead.status = "queued"
        db.commit()
        db.refresh(lead)
        return {
            "status": "success",
            "lead_id": lead.id,
            "contact_id": contact.id,
            "auto_dial": False,
            "compliance_passed": True,
            "message": "Lead ingested successfully. Auto-dial was disabled.",
        }

    # 4. Evaluate 10-Point Compliance Gate & Dispatch Outbound Call
    dispatch, compliance = trigger_speed_to_lead_outbound(
        db=db,
        tenant_id=tenant.id,
        to_phone=norm_phone,
        lead_id=lead.id,
        caller_name=full_name,
        service_requested=service_requested,
        category="C",
        has_consent=consent_confirmed,
    )

    lead.outbound_call_triggered = compliance.passed
    lead.custom_data = {
        **(lead.custom_data or {}),
        "compliance_verdict": compliance.to_dict(),
        "dispatch_id": dispatch.id,
    }

    if compliance.passed:
        contact.stage = "ai_called"

    db.commit()
    db.refresh(lead)

    return {
        "status": "success",
        "lead_id": lead.id,
        "contact_id": contact.id,
        "dispatch_id": dispatch.id,
        "call_id": dispatch.call_id,
        "compliance_passed": compliance.passed,
        "compliance_reason": compliance.reason,
        "message": (
            "Speed-to-lead outbound call dispatched successfully."
            if compliance.passed
            else f"Speed-to-lead call blocked by compliance gate: {compliance.reason}"
        ),
        "details": compliance.details,
    }


# ===========================================================================
# 1. UNIVERSAL WEBHOOK ENDPOINT (WORDPRESS, WEBFLOW, TYPEFORM, ZAPIER)
# ===========================================================================


@router.post("/webhook/{tenant_id}", status_code=status.HTTP_200_OK)
async def ingest_lead_webhook(
    tenant_id: str,
    request: Request,
    secret: str | None = Query(None),
    auto_dial: bool = Query(True),
    db: Session = Depends(get_db),
    x_vedavoice_secret: str | None = Header(None, alias="X-VedaVoice-Secret"),
) -> dict[str, Any]:
    """Universal Webhook Ingestion endpoint supporting WPForms, CF7, Webflow, Typeform, and JSON."""
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    if tenant.status != "active":
        raise HTTPException(status_code=403, detail="Tenant account is suspended or inactive.")

    # Secret verification if configured on tenant
    configured_secret = (tenant.config or {}).get("webhook_secret")
    if configured_secret:
        client_secret = x_vedavoice_secret or secret
        if client_secret != configured_secret:
            raise HTTPException(status_code=401, detail="Unauthorized: Webhook secret mismatch.")

    # Multi-format content parsing (JSON, form-urlencoded, or multipart/form-data)
    content_type = request.headers.get("content-type", "").lower()
    raw_payload: dict[str, Any] = {}
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        try:
            form = await request.form()
            raw_payload = dict(form)
        except Exception:
            body = await request.body()
            from urllib.parse import parse_qs

            parsed = parse_qs(body.decode("utf-8"))
            raw_payload = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
    else:
        body = await request.body()
        try:
            raw_payload = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload received.") from None

    name, phone, email, service, consent, extra = extract_universal_lead_data(raw_payload)

    if not phone:
        raise HTTPException(
            status_code=422,
            detail="Could not detect phone number in webhook payload. Required field: phone, telephone, or mobile.",
        )

    # Check auto_dial preference
    auto_dial_val = raw_payload.get("auto_dial", auto_dial)
    should_auto_dial = (
        auto_dial_val in (True, "true", "True", 1, "1", "yes", "Yes")
        if isinstance(auto_dial_val, bool | str | int)
        else True
    )

    return _process_inbound_lead(
        db=db,
        tenant=tenant,
        full_name=name,
        raw_phone=phone,
        email=email,
        service_requested=service,
        source=raw_payload.get("source", "website_webhook"),
        consent_confirmed=consent,
        consent_text=raw_payload.get("consent_text"),
        custom_data=extra,
        auto_dial=should_auto_dial,
    )


# ===========================================================================
# 2. GOOGLE SHEETS TWO-WAY INBOUND ROW SYNC & WRITEBACK
# ===========================================================================


@router.post("/sheets/sync/{tenant_id}", status_code=status.HTTP_200_OK)
async def ingest_google_sheets_row(
    tenant_id: str,
    request: Request,
    auto_dial: bool = Query(True),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Ingest a new row from Google Sheets and immediately trigger speed-to-lead outbound call."""
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    if tenant.status != "active":
        raise HTTPException(status_code=403, detail="Tenant account is suspended or inactive.")

    content_type = request.headers.get("content-type", "").lower()
    raw_payload: dict[str, Any] = {}
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        raw_payload = dict(form)
    else:
        body = await request.body()
        try:
            raw_payload = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload.") from None

    row = parse_raw_sheet_row(raw_payload)
    if not row.phone:
        raise HTTPException(status_code=422, detail="Missing phone column in spreadsheet row.")

    auto_dial_val = raw_payload.get("auto_dial", auto_dial)
    should_auto_dial = (
        auto_dial_val in (True, "true", "True", 1, "1", "yes", "Yes")
        if isinstance(auto_dial_val, bool | str | int)
        else True
    )

    return _process_inbound_lead(
        db=db,
        tenant=tenant,
        full_name=row.full_name,
        raw_phone=row.phone,
        email=row.email,
        service_requested=row.service_requested,
        source="google_sheets",
        consent_confirmed=row.consent_confirmed,
        consent_text="Agreed to automated AI phone call from Google Sheet row intake.",
        custom_data={
            "spreadsheet_id": row.spreadsheet_id,
            "sheet_name": row.sheet_name,
            "row_index": row.row_index,
            **row.custom_columns,
        },
        auto_dial=should_auto_dial,
    )


@router.post("/sheets/writeback/{call_id}", status_code=status.HTTP_200_OK)
async def trigger_sheets_writeback(
    call_id: str,
    writeback_url: str | None = Query(
        None, description="Destination Google Apps Script Webhook URL"
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Execute two-way post-call writeback of summary, recording, duration & sentiment to client Google Sheet."""
    res = sync_call_result_to_sheets(call_id=call_id, db=db)
    if res.get("status") != "success":
        raise HTTPException(
            status_code=404, detail=res.get("message", "Failed to prepare writeback data.")
        )

    writeback_data = GoogleSheetWritebackData.model_validate(res["writeback"])
    target_url = writeback_url or (res["writeback"].get("custom_columns") or {}).get(
        "writeback_url"
    )
    delivered = await execute_sheet_writeback(writeback_data, writeback_url=target_url)
    return {
        "success": True,
        "delivered": delivered,
        "call_id": call_id,
        "writeback": res["writeback"],
    }


# ===========================================================================
# 3. META (FACEBOOK & INSTAGRAM) LEAD ADS WEBHOOK
# ===========================================================================


@router.get("/meta/webhook")
def verify_meta_webhook(
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
) -> PlainTextResponse:
    """Meta Webhook Verification handshake."""
    expected_tokens = {
        settings.META_VERIFY_TOKEN,
        "vedavoice_meta_verify_token",
        "vedavoice",
    }
    if hub_mode == "subscribe" and hub_verify_token in expected_tokens:
        return PlainTextResponse(hub_challenge, status_code=200)
    raise HTTPException(status_code=403, detail="Verification token mismatch.")


@router.post("/meta/webhook")
async def ingest_meta_lead_ad(
    request: Request,
    tenant_id: str | None = Query(None),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Receive instant lead notification from Facebook/Instagram Lead Ads with HMAC-SHA256 signature verification."""
    body = await request.body()

    # FR-INT-7: Meta HMAC-SHA256 signature verification
    if x_hub_signature_256 or settings.META_APP_SECRET:
        secret = settings.META_APP_SECRET or "vedavoice_meta_secret"
        expected = "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        if not x_hub_signature_256 or not hmac.compare_digest(x_hub_signature_256, expected):
            raise HTTPException(status_code=403, detail="Invalid Meta webhook signature.")

    try:
        data = json.loads(body.decode("utf-8")) if body else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON.") from None

    target_tenant = None
    if tenant_id:
        target_tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))

    entries = data.get("entry", [])
    if not entries:
        # Support flat test payload format
        if "phone_number" in data or "phone" in data:
            if not target_tenant:
                target_tenant = db.scalar(
                    select(Tenant)
                    .where(Tenant.status == "active")
                    .order_by(Tenant.created_at.asc())
                )
            if not target_tenant:
                raise HTTPException(status_code=400, detail="No active tenant found.")
            res = _process_inbound_lead(
                db=db,
                tenant=target_tenant,
                full_name=data.get("full_name") or data.get("name") or "Meta Ad Lead",
                raw_phone=data.get("phone_number") or data.get("phone", ""),
                email=data.get("email"),
                source="meta_lead_ad",
                consent_confirmed=True,
                consent_text="Agreed to automated AI phone contact via Meta Instant Form.",
                custom_data={"leadgen_id": data.get("leadgen_id", "direct")},
            )
            return {"status": "success", "processed_count": 1, "leads": [res]}
        return {"status": "ok", "message": "No entry items"}

    results = []
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            val = change.get("value", {})
            leadgen_id = val.get("leadgen_id")
            page_id = val.get("page_id")
            entry_tenant_id = val.get("tenant_id") or tenant_id

            tenant = target_tenant
            if entry_tenant_id and not tenant:
                tenant = db.scalar(select(Tenant).where(Tenant.id == entry_tenant_id))
            if not tenant:
                tenant = db.scalar(
                    select(Tenant)
                    .where(Tenant.status == "active")
                    .order_by(Tenant.created_at.asc())
                )

            if not tenant:
                logger.warning("No active tenant found to handle Meta leadgen %s", leadgen_id)
                continue

            field_data = val.get("field_data", [])
            extracted: dict[str, str] = {}
            for field_item in field_data:
                f_name = field_item.get("name")
                f_vals = field_item.get("values", [])
                if f_name and f_vals:
                    extracted[f_name] = f_vals[0]

            name = extracted.get("full_name") or extracted.get("name") or "Meta Ad Lead"
            phone = extracted.get("phone_number") or extracted.get("phone") or ""
            email = extracted.get("email")

            if not phone:
                phone = val.get("phone") or val.get("phone_number") or ""
            if not email:
                email = val.get("email")
            if not name or name == "Meta Ad Lead":
                name = val.get("name") or val.get("full_name") or name

            if phone:
                res = _process_inbound_lead(
                    db=db,
                    tenant=tenant,
                    full_name=name,
                    raw_phone=phone,
                    email=email,
                    source="meta_lead_ad",
                    consent_confirmed=True,
                    consent_text="Agreed to automated AI phone contact via Meta Instant Form.",
                    custom_data={"leadgen_id": leadgen_id, "page_id": page_id},
                )
                results.append(res)

    return {"status": "success", "processed_count": len(results), "leads": results}


# ===========================================================================
# 4. CSV BULK UPLOAD (REACTIVATION & COLD CAMPAIGNS)
# ===========================================================================


@router.post("/csv-upload", status_code=status.HTTP_200_OK)
async def upload_leads_csv(
    request: Request,
    auto_dial: bool = Query(
        False, description="Whether to enqueue compliant outbound calls immediately"
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Upload CSV contact list with automatic E.164 normalization, DNC suppression filtering, and CRM creation."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    tenant = db.scalar(select(Tenant).where(Tenant.id == user.tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    raw_bytes = await request.body()
    content_type = request.headers.get("content-type", "")

    # Handle multipart/form-data boundary without requiring external python-multipart
    if "multipart/form-data" in content_type and b"\r\n\r\n" in raw_bytes:
        parts = raw_bytes.split(b"\r\n\r\n", 1)
        body_part = parts[1]
        # Remove trailing boundary delimiter
        if b"\r\n--" in body_part:
            body_part = body_part.split(b"\r\n--")[0]
        text_content = body_part.decode("utf-8-sig", errors="replace")
    elif "application/json" in content_type:
        try:
            json_body = json.loads(raw_bytes.decode("utf-8"))
            text_content = json_body.get("csv_content") or json_body.get("csv_text") or ""
        except Exception:
            text_content = ""
    else:
        # Raw CSV text
        try:
            text_content = raw_bytes.decode("utf-8-sig")
        except Exception:
            text_content = raw_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(text_content))

    total_rows = 0
    imported_contacts = 0
    suppressed_skipped = 0
    invalid_phone_skipped = 0
    contact_ids: list[str] = []

    # Pre-load tenant's suppression list for fast in-memory filtering
    suppressed_phones = set(
        db.scalars(
            select(SuppressionRecord.phone_number).where(SuppressionRecord.tenant_id == tenant.id)
        ).all()
    )

    now = datetime.now(UTC)

    for row in reader:
        total_rows += 1
        name, phone, email, service, consent, extra = extract_universal_lead_data(row)

        if not phone:
            invalid_phone_skipped += 1
            continue

        norm_phone = normalize_e164_phone(phone)
        if not norm_phone:
            invalid_phone_skipped += 1
            continue

        if norm_phone in suppressed_phones:
            suppressed_skipped += 1
            continue

        # Check existing contact to avoid duplicate inserts
        contact = db.scalar(
            select(Contact).where(
                Contact.tenant_id == tenant.id,
                Contact.phone == norm_phone,
            )
        )
        if not contact:
            contact = Contact(
                tenant_id=tenant.id,
                name=name or "Imported Lead",
                phone=norm_phone,
                email=email,
                source="csv_upload",
                stage="new_lead",
                custom_fields=extra,
                notes=service or "",
                first_contact_at=now,
                last_contact_at=now,
            )
            db.add(contact)
            db.flush()
            contact_ids.append(contact.id)
            imported_contacts += 1
        else:
            if name and contact.name in ("Unknown Lead", "Imported Lead"):
                contact.name = name
            if email and not contact.email:
                contact.email = email
            contact.last_contact_at = now

        # If auto_dial requested, trigger campaign outbound call through Gate v2 (Category D)
        if auto_dial:
            trigger_speed_to_lead_outbound(
                db=db,
                tenant_id=tenant.id,
                to_phone=norm_phone,
                caller_name=name,
                service_requested=service,
                category="D",
                has_consent=None,  # Gate v2 verifies stored consent in DB
            )

    db.commit()

    return {
        "success": True,
        "total_rows": total_rows,
        "imported_contacts": imported_contacts,
        "suppressed_skipped": suppressed_skipped,
        "invalid_phone_skipped": invalid_phone_skipped,
        "contact_ids": contact_ids,
    }
