"""Automated Multi-Tenant Post-Call Ingestion Service for Native CRM.

Bridges phone conversations and voice triage telemetry into:
1. Contact profile creation & deduplication by E.164 phone number
2. Automated Kanban pipeline stage assignment
3. Activity timeline events with audio recording links and turn summaries
4. TCPA evidentiary verbal consent records
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.call import Call
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.outbound import ConsentRecord
from api.app.models.tenant import Tenant
from api.app.services.compliance import normalize_e164_phone

logger = logging.getLogger("vedavoice.services.crm_ingest")

STAGE_HIERARCHY: dict[str, int] = {
    "lost": 0,
    "new_lead": 1,
    "ai_called": 2,
    "qualified": 3,
    "booked": 4,
    "closed": 5,
}


def compute_call_stage(call: Call) -> str:
    """Determine appropriate CRM pipeline stage based on call outcome and triage telemetry."""
    outcome = (call.outcome or "").strip().lower()
    urgency = (call.urgency or "").strip().lower()

    if outcome in ("appointment_booked", "booked"):
        return "booked"
    if urgency in ("emergency", "urgent") or outcome in (
        "message_taken",
        "qualified",
        "transfer_completed",
    ):
        return "qualified"
    if (call.lead_score or 50.0) >= 75.0:
        return "qualified"
    if (
        outcome in ("abandoned", "no_answer", "busy", "failed", "unqualified")
        and (call.duration_s or 0.0) < 10.0
    ):
        return "lost"
    if (call.turn_count or 0) >= 2 or (call.duration_s or 0.0) >= 15.0:
        return "ai_called"
    return "new_lead"


def extract_caller_metadata(
    call: Call, payload_message: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Extract structured caller metadata from call message payload or transcript turns."""
    msg = payload_message or call.message or {}
    if not isinstance(msg, dict):
        msg = {}

    name = msg.get("name") or msg.get("customer_name") or msg.get("caller_name")
    email = msg.get("email") or msg.get("customer_email")
    address = msg.get("address") or msg.get("service_address") or msg.get("postal_code")
    service_req = msg.get("service_requested") or msg.get("service") or msg.get("service_type")
    summary = msg.get("summary") or msg.get("issue") or msg.get("message") or msg.get("notes")

    # If no summary in structured message, extract from first customer utterance
    if not summary and call.transcript:
        for turn in call.transcript:
            if isinstance(turn, dict):
                role = (turn.get("role") or "").lower()
                text = turn.get("text") or turn.get("content") or ""
                if role in ("caller", "user", "customer") and text.strip():
                    summary = text.strip()[:200]
                    break

    return {
        "name": str(name).strip() if name else None,
        "email": str(email).strip().lower() if email else None,
        "address": str(address).strip() if address else None,
        "service_requested": str(service_req).strip() if service_req else None,
        "summary": str(summary).strip() if summary else None,
    }


def upsert_crm_contact_from_call(
    db: Session,
    tenant_id: str,
    call: Call,
    payload_message: dict[str, Any] | None = None,
) -> Contact | None:
    """Upsert caller into Native CRM Contact table and attach ContactTimelineEvent."""
    if not tenant_id:
        logger.warning("Cannot upsert CRM contact without tenant_id for call %s", call.call_id)
        return None

    raw_phone = call.caller_number or ""
    phone = normalize_e164_phone(raw_phone)
    if not phone:
        if raw_phone and raw_phone.strip():
            # Retain non-standard or browser caller identifier
            clean_str = re.sub(r"[^\w+]", "", raw_phone.strip())
            phone = (
                clean_str
                if len(clean_str) >= 4
                else f"+1000{abs(hash(call.call_id or call.id)) % 10000000:07d}"
            )
        else:
            # Deterministic pseudo-E.164 phone key for anonymous web calls
            phone = f"+1000{abs(hash(call.call_id or call.id)) % 10000000:07d}"

    # 1. Look up existing contact for tenant
    contact = db.scalar(
        select(Contact).where(
            Contact.tenant_id == tenant_id,
            Contact.phone == phone,
        )
    )

    metadata = extract_caller_metadata(call, payload_message)
    caller_name = metadata["name"]
    caller_email = metadata["email"]
    service_address = metadata["address"]
    service_req = metadata["service_requested"]
    summary = metadata["summary"]

    # Fallback name if none extracted
    if not caller_name:
        if (
            contact
            and contact.name
            and contact.name not in ("Unknown Lead", "Prospective Lead", "")
        ):
            caller_name = contact.name
        else:
            digits = "".join(ch for ch in phone if ch.isdigit())
            caller_name = f"Caller ({digits[-4:]})" if len(digits) >= 4 else "Prospective Lead"

    # 2. Stage calculation respecting hierarchy
    call_stage = compute_call_stage(call)
    final_stage = call_stage
    if contact and contact.stage:
        curr_rank = STAGE_HIERARCHY.get(contact.stage, 1)
        new_rank = STAGE_HIERARCHY.get(call_stage, 1)
        # Avoid downgrading high-value stages unless explicitly booked
        if curr_rank > new_rank and call_stage != "booked":
            final_stage = contact.stage
        else:
            final_stage = call_stage

    # 3. Tags aggregation
    tags_set = set(contact.tags or []) if contact else set()
    for t in call.tags or []:
        if t and t not in ("in_progress", "active"):
            tags_set.add(str(t).strip())
    if service_req:
        tags_set.add(service_req)
    if (call.urgency or "").lower() == "emergency":
        tags_set.add("emergency")
    elif (call.urgency or "").lower() == "urgent":
        tags_set.add("urgent")
    if (call.outcome or "").lower() in ("appointment_booked", "booked"):
        tags_set.add("appointment_booked")

    # 4. Custom fields & Notes aggregation
    custom_fields = dict(contact.custom_fields or {}) if contact else {}
    if service_address:
        custom_fields["service_address"] = service_address
    if service_req:
        custom_fields["service_requested"] = service_req
    custom_fields["last_call_id"] = call.call_id
    custom_fields["last_outcome"] = call.outcome
    custom_fields["last_call_duration_s"] = call.duration_s

    call_time = call.started_at or datetime.now(UTC)
    time_prefix = call_time.strftime("%Y-%m-%d %H:%M")
    note_line = f"[{time_prefix}] Call ({int(call.duration_s)}s): {summary or call.outcome}"
    if contact and contact.notes:
        notes = f"{contact.notes}\n{note_line}".strip()
    else:
        notes = note_line

    lead_score = float(call.lead_score or 50.0)
    now_dt = datetime.now(UTC)

    # 5. Insert or Update Contact
    if contact:
        contact.name = caller_name
        if caller_email and not contact.email:
            contact.email = caller_email
        contact.stage = final_stage
        contact.tags = sorted(tags_set)
        contact.custom_fields = custom_fields
        contact.notes = notes
        contact.lead_score = max(float(contact.lead_score or 50.0), lead_score)
        contact.last_contact_at = call.ended_at or now_dt
        contact.updated_at = now_dt
    else:
        source = "inbound_call" if call.direction == "inbound" else "outbound_call"
        if "webrtc" in (call.caller_number or "").lower():
            source = "website_form"

        contact = Contact(
            tenant_id=tenant_id,
            name=caller_name,
            phone=phone,
            email=caller_email,
            source=source,
            stage=final_stage,
            tags=sorted(tags_set),
            custom_fields=custom_fields,
            notes=notes,
            lead_score=lead_score,
            is_callable=True,
            first_contact_at=call.started_at or now_dt,
            last_contact_at=call.ended_at or now_dt,
            created_at=now_dt,
            updated_at=now_dt,
        )
        db.add(contact)
        db.flush()

    # Link call to contact
    call.contact_id = contact.id

    # 6. Timeline Event Creation (Idempotent by call_id)
    existing_events = db.scalars(
        select(ContactTimelineEvent).where(
            ContactTimelineEvent.tenant_id == tenant_id,
            ContactTimelineEvent.contact_id == contact.id,
            ContactTimelineEvent.event_type == "call",
        )
    ).all()
    already_recorded = any(
        (ev.payload or {}).get("call_id") == call.call_id for ev in existing_events
    )

    if not already_recorded:
        event_title = (
            f"Voice Call ({int(call.duration_s)}s) - {call.outcome.replace('_', ' ').title()}"
        )
        timeline_event = ContactTimelineEvent(
            tenant_id=tenant_id,
            contact_id=contact.id,
            event_type="call",
            title=event_title,
            description=summary
            or f"Call completed with outcome '{call.outcome}'. Urgency: {call.urgency}.",
            payload={
                "call_id": call.call_id,
                "direction": call.direction,
                "duration_s": call.duration_s,
                "billable_minutes": call.billable_minutes,
                "outcome": call.outcome,
                "urgency": call.urgency,
                "recording_url": call.recording_url,
                "sentiment_label": call.sentiment_label,
                "sentiment_score": call.sentiment_score,
                "lead_score": call.lead_score,
                "qa_score": call.qa_score,
                "service_requested": service_req,
                "service_address": service_address,
                "turn_count": call.turn_count,
            },
            created_at=call.started_at or now_dt,
        )
        db.add(timeline_event)

    # 7. Record Verbal TCPA Consent Proof for Inbound Call
    if call.direction == "inbound":
        existing_consent = db.scalar(
            select(ConsentRecord).where(
                ConsentRecord.tenant_id == tenant_id,
                ConsentRecord.phone_number == contact.phone,
            )
        )
        if not existing_consent:
            tenant_obj = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
            seller_name = tenant_obj.name if tenant_obj else "Our Business"
            consent_proof = ConsentRecord(
                tenant_id=tenant_id,
                phone_number=contact.phone,
                category="B",  # Transactional/Inquiry consent
                ai_voice_disclosed=True,
                method="verbal_recorded",
                source="inbound_call",
                seller_name=seller_name,
            )
            db.add(consent_proof)

    logger.info(
        "Successfully bridged call %s to CRM Contact %s (%s) in stage '%s'",
        call.call_id,
        contact.id,
        contact.name,
        contact.stage,
    )
    return contact


def link_booking_to_crm(
    db: Session,
    tenant_id: str,
    booking: Any,
    customer_phone: str,
    customer_name: str | None = None,
    customer_email: str | None = None,
    service_type: str = "general_appointment",
    call_id: str | None = None,
    postal_code: str | None = None,
) -> Contact:
    """Link confirmed appointment booking to CRM Contact and advance pipeline stage to 'booked'."""
    raw_phone = customer_phone or ""
    phone = normalize_e164_phone(raw_phone)
    if not phone:
        clean_str = re.sub(r"[^\w+]", "", raw_phone.strip())
        phone = (
            clean_str
            if len(clean_str) >= 4
            else f"+1000{abs(hash(str(getattr(booking, 'id', '')))) % 10000000:07d}"
        )

    contact = db.scalar(
        select(Contact).where(
            Contact.tenant_id == tenant_id,
            Contact.phone == phone,
        )
    )

    now_dt = datetime.now(UTC)
    clean_name = (customer_name or "").strip()
    if not clean_name:
        clean_name = (
            contact.name
            if contact and contact.name not in ("Unknown Lead", "Prospective Lead", "")
            else f"Customer ({phone[-4:] if len(phone) >= 4 else 'New'})"
        )

    tags_set = set(contact.tags or []) if contact else set()
    tags_set.add("appointment_booked")
    if service_type:
        tags_set.add(service_type)

    custom_fields = dict(contact.custom_fields or {}) if contact else {}
    custom_fields["last_booking_id"] = str(getattr(booking, "id", ""))
    booking_start = getattr(booking, "start_at", now_dt)
    custom_fields["last_booking_time"] = (
        booking_start.isoformat() if hasattr(booking_start, "isoformat") else str(booking_start)
    )
    if postal_code:
        custom_fields["service_address"] = postal_code

    start_str = (
        booking_start.strftime("%A, %B %d at %I:%M %p")
        if hasattr(booking_start, "strftime")
        else str(booking_start)
    )
    note_line = (
        f"[{now_dt.strftime('%Y-%m-%d %H:%M')}] Appointment Booked for {start_str} ({service_type})"
    )
    notes = f"{contact.notes}\n{note_line}".strip() if contact and contact.notes else note_line

    if contact:
        contact.name = clean_name
        if customer_email and not contact.email:
            contact.email = customer_email
        contact.stage = "booked"  # Advance stage to booked
        contact.tags = sorted(tags_set)
        contact.custom_fields = custom_fields
        contact.notes = notes
        contact.lead_score = max(float(contact.lead_score or 50.0), 90.0)
        contact.last_contact_at = now_dt
        contact.updated_at = now_dt
    else:
        contact = Contact(
            tenant_id=tenant_id,
            name=clean_name,
            phone=phone,
            email=customer_email,
            source="inbound_call",
            stage="booked",
            tags=sorted(tags_set),
            custom_fields=custom_fields,
            notes=notes,
            lead_score=90.0,
            is_callable=True,
            first_contact_at=now_dt,
            last_contact_at=now_dt,
            created_at=now_dt,
            updated_at=now_dt,
        )
        db.add(contact)
        db.flush()

    # Link call if call_id provided
    if call_id:
        call = db.scalar(select(Call).where((Call.call_id == call_id) | (Call.id == call_id)))
        if call:
            call.contact_id = contact.id
            call.outcome = "appointment_booked"
            call_tags = set(call.tags or [])
            call_tags.add("appointment_booked")
            call.tags = sorted(call_tags)

    # Timeline event
    service_label = service_type.replace("_", " ").title()
    staff_id = getattr(booking, "staff_id", None)
    meet_link = getattr(booking, "meet_link", None)
    timeline_event = ContactTimelineEvent(
        tenant_id=tenant_id,
        contact_id=contact.id,
        event_type="booking_created",
        title=f"Appointment Booked: {service_label}",
        description=(
            f"Confirmed appointment on {start_str}. "
            f"Staff: {staff_id or 'Assigned tech'}. "
            f"Meet link: {meet_link or 'On-site dispatch'}."
        ),
        payload={
            "booking_id": str(getattr(booking, "id", "")),
            "call_id": call_id,
            "start_at": (
                booking_start.isoformat()
                if hasattr(booking_start, "isoformat")
                else str(booking_start)
            ),
            "end_at": (
                booking.end_at.isoformat()
                if hasattr(getattr(booking, "end_at", None), "isoformat")
                else ""
            ),
            "service_type": service_type,
            "meet_link": meet_link,
            "postal_code": postal_code,
        },
        created_at=now_dt,
    )
    db.add(timeline_event)

    # Ensure TCPA consent record exists
    existing_consent = db.scalar(
        select(ConsentRecord).where(
            ConsentRecord.tenant_id == tenant_id,
            ConsentRecord.phone_number == contact.phone,
        )
    )
    if not existing_consent:
        tenant_obj = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
        seller_name = tenant_obj.name if tenant_obj else "Our Business"
        consent_proof = ConsentRecord(
            tenant_id=tenant_id,
            phone_number=contact.phone,
            category="B",
            ai_voice_disclosed=True,
            method="verbal_recorded",
            source="inbound_call",
            seller_name=seller_name,
        )
        db.add(consent_proof)

    logger.info(
        "Linked booking %s to CRM Contact %s (%s) - stage set to 'booked'",
        getattr(booking, "id", ""),
        contact.id,
        contact.name,
    )
    return contact
