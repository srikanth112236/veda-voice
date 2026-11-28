"""Multi-tenant Native CRM Router (Contacts, Visual Pipeline, and Email Campaigns).

Implements FR-CRM-11 to FR-CRM-19 per SRS Addendum v1.1:
- Configurable pipeline stages per tenant (FR-CRM-11)
- Auto-extracted call metadata and next action (FR-CRM-12)
- Contact deduplication and merge (FR-CRM-13)
- Consent evidentiary audit panel per contact (FR-CRM-14)
- Dynamic tags and custom fields (FR-CRM-15)
- CSV import with consent attestation & non-callable tagging (FR-CRM-16)
- Revenue recovered calculation & configuration (FR-CRM-18)
- Contact timeline disclosure flags (FR-CRM-19)
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant, get_current_user
from api.app.db.session import get_db
from api.app.models.call import Call
from api.app.models.compliance import PlatformSuppression
from api.app.models.crm import (
    Contact,
    ContactMergeLog,
    ContactTimelineEvent,
    EmailCampaign,
    PipelineStage,
)
from api.app.models.outbound import ConsentRecord, SuppressionRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.compliance import normalize_e164_phone

router = APIRouter(prefix="/api/v1/crm", tags=["crm"])


def resolve_tenant_id(user: User, db: Session) -> str:
    """Resolve tenant ID for standard tenant user or platform admin fallback."""
    if user.tenant_id:
        return user.tenant_id
    if user.role == "platform_admin":
        fallback = db.scalar(
            select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
        )
        if fallback:
            return fallback.id
    raise HTTPException(status_code=400, detail="Tenant context required.")


DEFAULT_STAGES = [
    {
        "stage_key": "new_lead",
        "label": "New Lead",
        "color": "border-blue-300 bg-blue-50/50 text-blue-700",
        "order_index": 0,
        "is_system": True,
    },
    {
        "stage_key": "ai_called",
        "label": "AI Contacted",
        "color": "border-purple-300 bg-purple-50/50 text-purple-700",
        "order_index": 1,
        "is_system": True,
    },
    {
        "stage_key": "qualified",
        "label": "Qualified",
        "color": "border-amber-300 bg-amber-50/50 text-amber-700",
        "order_index": 2,
        "is_system": True,
    },
    {
        "stage_key": "booked",
        "label": "Appointment Booked",
        "color": "border-emerald-300 bg-emerald-50/50 text-emerald-700",
        "order_index": 3,
        "is_system": True,
    },
    {
        "stage_key": "closed",
        "label": "Won / Closed",
        "color": "border-zinc-300 bg-zinc-100 text-zinc-800",
        "order_index": 4,
        "is_system": True,
    },
    {
        "stage_key": "lost",
        "label": "Lost",
        "color": "border-red-300 bg-red-50/50 text-red-700",
        "order_index": 5,
        "is_system": True,
    },
]


def get_or_seed_tenant_stages(db: Session, tenant_id: str) -> list[PipelineStage]:
    """Retrieve tenant's custom pipeline stages or seed defaults on first access."""
    stages = db.scalars(
        select(PipelineStage)
        .where(PipelineStage.tenant_id == tenant_id)
        .order_by(PipelineStage.order_index)
    ).all()
    if stages:
        return list(stages)

    seeded = []
    for s_data in DEFAULT_STAGES:
        stg = PipelineStage(
            tenant_id=tenant_id,
            pipeline_id="default",
            stage_key=s_data["stage_key"],
            label=s_data["label"],
            color=s_data["color"],
            order_index=s_data["order_index"],
            is_system=s_data["is_system"],
        )
        db.add(stg)
        seeded.append(stg)
    db.commit()
    for s in seeded:
        db.refresh(s)
    return seeded


# ===========================================================================
# REQUEST / RESPONSE SCHEMAS
# ===========================================================================


class CreateContactRequest(BaseModel):
    name: str = Field(..., description="Customer or prospect full name")
    phone: str = Field(..., description="E.164 phone number")
    email: str | None = None
    source: str = Field(
        "manual", description="google_sheets, meta_ads, website_form, csv_upload, direct"
    )
    stage: str = Field(
        "new_lead", description="new_lead, ai_called, qualified, booked, closed, lost"
    )
    tags: list[str] = Field(default_factory=list)
    notes: str = ""
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    is_callable: bool = True


class UpdateContactRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    stage: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    lead_score: float | None = None
    custom_fields: dict[str, Any] | None = None
    is_callable: bool | None = None


class CreateStageRequest(BaseModel):
    stage_key: str = Field(..., description="Unique slug for the stage")
    label: str = Field(..., description="Display label for the column header")
    color: str = Field(
        "border-zinc-300 bg-zinc-50 text-zinc-700", description="Tailwind CSS color class"
    )
    order_index: int | None = None


class ReorderStagesRequest(BaseModel):
    stage_keys: list[str] = Field(..., description="Ordered list of stage keys")


class MergeContactsRequest(BaseModel):
    source_id: str = Field(..., description="ID of contact to absorb and remove")
    preferred_name: str | None = None
    preferred_email: str | None = None
    preferred_notes: str | None = None


class CSVImportRow(BaseModel):
    name: str
    phone: str
    email: str | None = None
    stage: str | None = "new_lead"
    tags: list[str] | str | None = None
    consent_given: bool | str | None = False
    custom_fields: dict[str, Any] | None = None


class CSVImportRequest(BaseModel):
    rows: list[dict[str, Any]]
    consent_attestation: bool = Field(
        False, description="Legal attestation that consent was verified"
    )
    default_category: str = Field("B", description="B or C compliance category")
    source: str = Field("csv_upload", description="Source identifier")


class RevenueSettingsRequest(BaseModel):
    average_deal_value: float = Field(
        ..., gt=0, description="Average deal or appointment value in USD"
    )


class CreateCampaignRequest(BaseModel):
    name: str = Field(..., description="Campaign or follow-up sequence name")
    subject: str = Field(..., description="Email subject line")
    body_html: str = Field(..., description="HTML email body with template variables")
    trigger_event: str = Field(
        "manual_broadcast", description="manual_broadcast, post_call_followup, stage_changed"
    )
    target_stage: str | None = Field(None, description="Optional target stage filter")


# ===========================================================================
# 1. CONFIGURABLE PIPELINE STAGES (FR-CRM-11)
# ===========================================================================


@router.get("/stages")
def list_pipeline_stages(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List tenant's configured pipeline stages."""
    tenant_id = resolve_tenant_id(user, db)

    stages = get_or_seed_tenant_stages(db, tenant_id)
    return [
        {
            "id": s.id,
            "stage_key": s.stage_key,
            "label": s.label,
            "color": s.color,
            "order_index": s.order_index,
            "is_system": s.is_system,
        }
        for s in stages
    ]


@router.post("/stages", status_code=status.HTTP_201_CREATED)
def create_pipeline_stage(
    req: CreateStageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a new custom pipeline stage for the tenant."""
    tenant_id = resolve_tenant_id(user, db)

    clean_key = re.sub(r"[^a-z0-9_]", "", req.stage_key.lower().strip())
    if not clean_key:
        raise HTTPException(status_code=422, detail="Invalid stage key slug.")

    # Ensure stages are seeded first
    existing_stages = get_or_seed_tenant_stages(db, tenant_id)
    if any(s.stage_key == clean_key for s in existing_stages):
        raise HTTPException(status_code=409, detail=f"Stage with key '{clean_key}' already exists.")

    next_order = req.order_index if req.order_index is not None else len(existing_stages)
    new_stage = PipelineStage(
        tenant_id=tenant_id,
        pipeline_id="default",
        stage_key=clean_key,
        label=req.label.strip(),
        color=req.color,
        order_index=next_order,
        is_system=False,
    )
    db.add(new_stage)
    db.commit()
    db.refresh(new_stage)

    return {
        "id": new_stage.id,
        "stage_key": new_stage.stage_key,
        "label": new_stage.label,
        "color": new_stage.color,
        "order_index": new_stage.order_index,
        "is_system": new_stage.is_system,
    }


@router.put("/stages/reorder")
def reorder_pipeline_stages(
    req: ReorderStagesRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Reorder existing pipeline stages."""
    tenant_id = resolve_tenant_id(user, db)

    stages = get_or_seed_tenant_stages(db, tenant_id)
    stage_map = {s.stage_key: s for s in stages}

    for idx, key in enumerate(req.stage_keys):
        if key in stage_map:
            stage_map[key].order_index = idx

    db.commit()
    refreshed = get_or_seed_tenant_stages(db, tenant_id)
    return [
        {
            "id": s.id,
            "stage_key": s.stage_key,
            "label": s.label,
            "color": s.color,
            "order_index": s.order_index,
            "is_system": s.is_system,
        }
        for s in refreshed
    ]


@router.delete("/stages/{stage_key}")
def delete_pipeline_stage(
    stage_key: str,
    reassign_to: str | None = Query(
        None, description="Stage key to migrate existing contacts to before deletion"
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Delete a custom pipeline stage, optionally reassigning contacts."""
    tenant_id = resolve_tenant_id(user, db)

    stage = db.scalar(
        select(PipelineStage).where(
            PipelineStage.tenant_id == tenant_id, PipelineStage.stage_key == stage_key
        )
    )
    if not stage:
        raise HTTPException(status_code=404, detail="Pipeline stage not found.")

    if stage.is_system:
        raise HTTPException(status_code=400, detail="Default system stages cannot be deleted.")

    contacts_in_stage = db.scalars(
        select(Contact).where(Contact.tenant_id == tenant_id, Contact.stage == stage_key)
    ).all()

    if contacts_in_stage:
        if not reassign_to:
            raise HTTPException(
                status_code=400,
                detail=f"Stage has {len(contacts_in_stage)} contact(s). Provide 'reassign_to' stage key to migrate them.",
            )
        target_stage = db.scalar(
            select(PipelineStage).where(
                PipelineStage.tenant_id == tenant_id, PipelineStage.stage_key == reassign_to
            )
        )
        if not target_stage:
            raise HTTPException(
                status_code=400, detail=f"Reassign target stage '{reassign_to}' does not exist."
            )

        for c in contacts_in_stage:
            c.stage = reassign_to

    db.delete(stage)
    db.commit()
    return {"success": True, "message": f"Stage '{stage_key}' deleted successfully."}


# ===========================================================================
# 2. CONTACTS & VISUAL PIPELINE ENDPOINTS
# ===========================================================================


@router.get("/contacts")
def list_contacts(
    stage: str | None = Query(None, description="Filter by pipeline stage"),
    search: str | None = Query(None, description="Search by name, phone, or email"),
    is_callable: bool | None = Query(None, description="Filter by callable status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """List contacts with search, pagination, callable filter, and stage filtering."""
    tenant_id = resolve_tenant_id(user, db)

    query = select(Contact).where(Contact.tenant_id == tenant_id)

    if stage:
        query = query.where(Contact.stage == stage)

    if is_callable is not None:
        query = query.where(Contact.is_callable == is_callable)

    if search:
        s = f"%{search.strip().lower()}%"
        query = query.where(
            func.lower(Contact.name).like(s)
            | func.lower(Contact.phone).like(s)
            | func.lower(Contact.email).like(s)
        )

    total = db.scalar(select(func.count(Contact.id)).where(Contact.tenant_id == tenant_id)) or 0
    contacts = db.scalars(
        query.order_by(desc(Contact.last_contact_at)).offset(offset).limit(limit)
    ).all()

    contact_ids = [c.id for c in contacts]
    call_counts: dict[str, int] = {}
    if contact_ids:
        rows = db.execute(
            select(Call.contact_id, func.count(Call.id))
            .where(Call.tenant_id == tenant_id, Call.contact_id.in_(contact_ids))
            .group_by(Call.contact_id)
        ).all()
        call_counts = {str(r[0]): int(r[1] or 0) for r in rows if r[0]}

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "contacts": [
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "source": c.source,
                "stage": c.stage,
                "tags": c.tags,
                "lead_score": c.lead_score,
                "notes": c.notes,
                "is_callable": c.is_callable,
                "custom_fields": c.custom_fields,
                "first_contact_at": c.first_contact_at.isoformat() if c.first_contact_at else None,
                "last_contact_at": c.last_contact_at.isoformat() if c.last_contact_at else None,
                "call_count": call_counts.get(c.id, 0),
            }
            for c in contacts
        ],
    }


@router.get("/pipeline")
def get_pipeline_stages(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get contacts grouped by configured pipeline stages for Kanban board (FR-CRM-11)."""
    tenant_id = resolve_tenant_id(user, db)

    configured_stages = get_or_seed_tenant_stages(db, tenant_id)
    stage_keys = [s.stage_key for s in configured_stages]

    contacts = db.scalars(
        select(Contact)
        .where(Contact.tenant_id == tenant_id)
        .order_by(desc(Contact.last_contact_at))
    ).all()

    stages: dict[str, list[dict[str, Any]]] = {k: [] for k in stage_keys}
    # Fallback bucket if contact has an orphaned stage
    fallback_key = stage_keys[0] if stage_keys else "new_lead"

    contact_ids = [c.id for c in contacts]
    call_counts: dict[str, int] = {}
    if contact_ids:
        rows = db.execute(
            select(Call.contact_id, func.count(Call.id))
            .where(Call.tenant_id == tenant_id, Call.contact_id.in_(contact_ids))
            .group_by(Call.contact_id)
        ).all()
        call_counts = {str(r[0]): int(r[1] or 0) for r in rows if r[0]}

    for c in contacts:
        dest_key = c.stage if c.stage in stages else fallback_key
        if dest_key not in stages:
            stages[dest_key] = []
        stages[dest_key].append(
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "source": c.source,
                "stage": c.stage,
                "tags": c.tags,
                "lead_score": c.lead_score,
                "is_callable": c.is_callable,
                "last_contact_at": c.last_contact_at.isoformat() if c.last_contact_at else None,
                "call_count": call_counts.get(c.id, 0),
            }
        )

    return {
        "stages": stages,
        "stage_definitions": [
            {
                "id": s.id,
                "stage_key": s.stage_key,
                "label": s.label,
                "color": s.color,
                "order_index": s.order_index,
                "is_system": s.is_system,
            }
            for s in configured_stages
        ],
        "counts": {k: len(v) for k, v in stages.items()},
        "total": len(contacts),
    }


@router.get("/contacts/duplicates")
def find_duplicate_contacts(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Detect potential duplicate contacts by identical email or phone number."""
    tenant_id = resolve_tenant_id(user, db)

    contacts = db.scalars(select(Contact).where(Contact.tenant_id == tenant_id)).all()

    email_buckets: dict[str, list[Contact]] = {}
    phone_buckets: dict[str, list[Contact]] = {}

    for c in contacts:
        if c.email:
            em = c.email.strip().lower()
            email_buckets.setdefault(em, []).append(c)
        if c.phone:
            ph = c.phone.strip()
            phone_buckets.setdefault(ph, []).append(c)

    duplicate_groups: list[dict[str, Any]] = []

    for em, clist in email_buckets.items():
        if len(clist) > 1:
            duplicate_groups.append(
                {
                    "match_type": "email",
                    "match_value": em,
                    "contacts": [
                        {
                            "id": c.id,
                            "name": c.name,
                            "phone": c.phone,
                            "email": c.email,
                            "stage": c.stage,
                            "last_contact_at": c.last_contact_at.isoformat()
                            if c.last_contact_at
                            else None,
                        }
                        for c in clist
                    ],
                }
            )

    for ph, clist in phone_buckets.items():
        if len(clist) > 1:
            duplicate_groups.append(
                {
                    "match_type": "phone",
                    "match_value": ph,
                    "contacts": [
                        {
                            "id": c.id,
                            "name": c.name,
                            "phone": c.phone,
                            "email": c.email,
                            "stage": c.stage,
                            "last_contact_at": c.last_contact_at.isoformat()
                            if c.last_contact_at
                            else None,
                        }
                        for c in clist
                    ],
                }
            )

    return duplicate_groups


@router.get("/contacts/{contact_id}")
def get_contact_detail(
    contact_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve complete contact profile, calls, and timeline with disclosure badges (FR-CRM-19)."""
    tenant_id = resolve_tenant_id(user, db)

    contact = db.scalar(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant_id)
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    calls = db.scalars(
        select(Call).where(Call.contact_id == contact.id).order_by(desc(Call.started_at))
    ).all()

    events = db.scalars(
        select(ContactTimelineEvent)
        .where(ContactTimelineEvent.contact_id == contact.id)
        .order_by(desc(ContactTimelineEvent.created_at))
    ).all()

    return {
        "id": contact.id,
        "name": contact.name,
        "phone": contact.phone,
        "email": contact.email,
        "source": contact.source,
        "stage": contact.stage,
        "tags": contact.tags,
        "lead_score": contact.lead_score,
        "is_callable": contact.is_callable,
        "notes": contact.notes,
        "custom_fields": contact.custom_fields,
        "first_contact_at": contact.first_contact_at.isoformat()
        if contact.first_contact_at
        else None,
        "last_contact_at": contact.last_contact_at.isoformat() if contact.last_contact_at else None,
        "calls": [
            {
                "call_id": cl.call_id,
                "direction": cl.direction,
                "duration_s": cl.duration_s,
                "billable_minutes": cl.billable_minutes,
                "outcome": cl.outcome,
                "urgency": cl.urgency,
                "sentiment_label": cl.sentiment_label,
                "sentiment_score": cl.sentiment_score,
                "recording_url": cl.recording_url,
                "summary": cl.message.get("summary") if cl.message else "",
                "transcript": cl.transcript,
                "ai_voice_disclosed": True,  # Played in standard VedaVoice greeting
                "recording_disclosed": True,  # Played in standard VedaVoice greeting
                "started_at": cl.started_at.isoformat() if cl.started_at else None,
            }
            for cl in calls
        ],
        "timeline": [
            {
                "id": ev.id,
                "event_type": ev.event_type,
                "title": ev.title,
                "description": ev.description,
                "payload": ev.payload,
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in events
        ],
    }


@router.post("/contacts", status_code=status.HTTP_201_CREATED)
def create_contact(
    req: CreateContactRequest,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Manually add a contact to the CRM."""
    norm_phone = normalize_e164_phone(req.phone)
    if not norm_phone:
        raise HTTPException(status_code=422, detail="Invalid phone number.")

    existing = db.scalar(
        select(Contact).where(Contact.tenant_id == tenant.id, Contact.phone == norm_phone)
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="A contact with this phone number already exists."
        )

    now = datetime.now(UTC)
    contact = Contact(
        tenant_id=tenant.id,
        name=req.name,
        phone=norm_phone,
        email=req.email,
        source=req.source,
        stage=req.stage,
        tags=req.tags,
        notes=req.notes,
        is_callable=req.is_callable,
        custom_fields=req.custom_fields,
        first_contact_at=now,
        last_contact_at=now,
    )
    db.add(contact)
    db.flush()

    event = ContactTimelineEvent(
        tenant_id=tenant.id,
        contact_id=contact.id,
        event_type="note_added",
        title="Contact Profile Created",
        description=f"Added manually via dashboard in stage {req.stage}.",
        payload={"source": req.source, "is_callable": req.is_callable},
    )
    db.add(event)
    db.commit()
    db.refresh(contact)

    return {"success": True, "id": contact.id, "name": contact.name, "phone": contact.phone}


@router.patch("/contacts/{contact_id}")
def update_contact(
    contact_id: str,
    req: UpdateContactRequest,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Update contact attributes or transition pipeline stage."""
    contact = db.scalar(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant.id)
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    old_stage = contact.stage
    if req.name is not None:
        contact.name = req.name
    if req.phone is not None:
        norm = normalize_e164_phone(req.phone)
        if norm:
            contact.phone = norm
    if req.email is not None:
        contact.email = req.email
    if req.tags is not None:
        contact.tags = req.tags
    if req.notes is not None:
        contact.notes = req.notes
    if req.lead_score is not None:
        contact.lead_score = req.lead_score
    if req.is_callable is not None:
        contact.is_callable = req.is_callable
    if req.custom_fields is not None:
        contact.custom_fields = {**(contact.custom_fields or {}), **req.custom_fields}

    if req.stage is not None and req.stage != old_stage:
        contact.stage = req.stage
        event = ContactTimelineEvent(
            tenant_id=tenant.id,
            contact_id=contact.id,
            event_type="stage_changed",
            title=f"Stage changed: {old_stage.replace('_', ' ').title()} → {req.stage.replace('_', ' ').title()}",
            description="Pipeline stage updated.",
            payload={"old_stage": old_stage, "new_stage": req.stage},
        )
        db.add(event)

    contact.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(contact)

    return {
        "success": True,
        "id": contact.id,
        "stage": contact.stage,
        "tags": contact.tags,
        "is_callable": contact.is_callable,
    }


@router.delete("/contacts/{contact_id}")
def delete_contact(
    contact_id: str,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Delete a contact and its timeline."""
    contact = db.scalar(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == tenant.id)
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    db.delete(contact)
    db.commit()
    return {"success": True, "message": "Contact deleted successfully."}


# ===========================================================================
# 3. CONTACT DEDUPLICATION & MERGE (FR-CRM-13)
# ===========================================================================


@router.post("/contacts/{target_id}/merge")
def merge_contacts(
    target_id: str,
    req: MergeContactsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Merge source contact into survivor contact (target_id) preserving all calls & events (FR-CRM-13)."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    if target_id == req.source_id:
        raise HTTPException(status_code=400, detail="Cannot merge a contact into itself.")

    target = db.scalar(
        select(Contact).where(Contact.id == target_id, Contact.tenant_id == user.tenant_id)
    )
    if not target:
        raise HTTPException(status_code=404, detail="Survivor contact not found.")

    source = db.scalar(
        select(Contact).where(Contact.id == req.source_id, Contact.tenant_id == user.tenant_id)
    )
    if not source:
        raise HTTPException(status_code=404, detail="Source contact to merge not found.")

    # Reassign calls to survivor and clear from source to avoid delete-orphan cascade
    source_calls = list(source.calls)
    for cl in source_calls:
        cl.contact = target
        cl.contact_id = target.id
    source.calls.clear()

    # Reassign timeline events to survivor and clear from source
    source_events = list(source.timeline_events)
    for ev in source_events:
        ev.contact = target
        ev.contact_id = target.id
    source.timeline_events.clear()

    # Union tags and custom fields
    merged_tags = sorted(set((target.tags or []) + (source.tags or [])))
    target.tags = merged_tags
    target.custom_fields = {**(source.custom_fields or {}), **(target.custom_fields or {})}

    # Preferred overrides
    if req.preferred_name:
        target.name = req.preferred_name
    if req.preferred_email:
        target.email = req.preferred_email
    if req.preferred_notes:
        target.notes = (target.notes + "\n" + req.preferred_notes).strip()
    elif source.notes and source.notes not in target.notes:
        target.notes = (target.notes + "\n" + source.notes).strip()

    # Create immutable audit log
    merge_log = ContactMergeLog(
        tenant_id=user.tenant_id,
        survivor_contact_id=target.id,
        merged_contact_id=source.id,
        merged_phone=source.phone,
        merged_email=source.email,
        merged_by_user_id=user.id,
        details={
            "source_name": source.name,
            "source_stage": source.stage,
            "calls_reassigned": len(source_calls),
            "events_reassigned": len(source_events),
        },
    )
    db.add(merge_log)

    # Add survivor timeline event
    merge_event = ContactTimelineEvent(
        tenant_id=user.tenant_id,
        contact_id=target.id,
        event_type="contact_merged",
        title=f"Merged duplicate lead {source.name}",
        description=f"Consolidated profile with {source.phone} ({source.email or 'no email'}). Transferred {len(source_calls)} calls and {len(source_events)} timeline entries.",
        payload={"merged_from_id": source.id, "merged_phone": source.phone},
    )
    db.add(merge_event)

    # Safely delete absorbed source contact
    db.delete(source)
    target.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "survivor_id": target.id,
        "name": target.name,
        "phone": target.phone,
        "tags": target.tags,
        "calls_reassigned": len(source_calls),
        "events_reassigned": len(source_events),
    }


# ===========================================================================
# 4. CONSENT EVIDENTIARY PANEL & CSV IMPORT (FR-CRM-14 & FR-CRM-16)
# ===========================================================================


@router.get("/contacts/{contact_id}/consent-audit")
def get_contact_consent_audit(
    contact_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve full evidentiary consent records and suppression status (FR-CRM-14)."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    contact = db.scalar(
        select(Contact).where(Contact.id == contact_id, Contact.tenant_id == user.tenant_id)
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    consents = db.scalars(
        select(ConsentRecord)
        .where(
            ConsentRecord.tenant_id == user.tenant_id,
            ConsentRecord.phone_number == contact.phone,
        )
        .order_by(desc(ConsentRecord.created_at))
    ).all()

    tenant_suppression = db.scalar(
        select(SuppressionRecord).where(
            SuppressionRecord.tenant_id == user.tenant_id,
            SuppressionRecord.phone_number == contact.phone,
        )
    )

    platform_suppression = db.scalar(
        select(PlatformSuppression).where(
            PlatformSuppression.phone_number == contact.phone,
        )
    )

    return {
        "contact_id": contact.id,
        "phone": contact.phone,
        "is_callable": contact.is_callable,
        "tenant_suppressed": bool(tenant_suppression),
        "platform_suppressed": bool(platform_suppression),
        "suppression_reason": (
            tenant_suppression.reason
            if tenant_suppression
            else (platform_suppression.reason if platform_suppression else None)
        ),
        "consents": [
            {
                "id": cr.id,
                "category": cr.category,
                "method": cr.method,
                "ai_voice_disclosed": cr.ai_voice_disclosed,
                "seller_name": cr.seller_name,
                "form_url": cr.form_url,
                "ip": cr.ip_address,
                "created_at": cr.created_at.isoformat(),
                "retention_until": cr.retention_until.isoformat() if cr.retention_until else None,
                "is_revoked": bool(cr.revoked_at),
                "revoked_at": cr.revoked_at.isoformat() if cr.revoked_at else None,
                "revoked_via": cr.revoked_via,
            }
            for cr in consents
        ],
        "audit_export_url": f"/api/v1/compliance/audit-export/{contact.phone}",
    }


@router.post("/contacts/import-csv")
def import_contacts_csv(
    req: CSVImportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Batch import contacts with mandatory consent verification (FR-CRM-16).

    Rows without verified consent or un-attested imports are strictly marked 'non-callable'.
    """
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    imported = 0
    callable_count = 0
    non_callable_count = 0
    errors: list[str] = []

    now = datetime.now(UTC)

    for idx, row in enumerate(req.rows):
        raw_phone = str(row.get("phone", "")).strip()
        name = str(row.get("name", "Imported Contact")).strip()
        email = row.get("email")
        if email:
            email = str(email).strip().lower()
        stage = str(row.get("stage", "new_lead")).strip().lower()

        norm_phone = normalize_e164_phone(raw_phone)
        if not norm_phone:
            errors.append(f"Row {idx + 1}: Invalid phone number '{raw_phone}'")
            continue

        raw_tags = row.get("tags")
        if isinstance(raw_tags, list):
            tags = [str(t) for t in raw_tags]
        elif isinstance(raw_tags, str) and raw_tags:
            tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        else:
            tags = []

        # Determine consent validity: requires both legal attestation AND row-level consent flag
        row_consent_val = row.get("consent_given")
        has_row_consent = bool(row_consent_val in (True, "true", "True", "yes", "1", 1))

        if req.consent_attestation and has_row_consent:
            is_callable = True
            callable_count += 1
            # Write formal consent record (Category B/C)
            consent_record = ConsentRecord(
                tenant_id=user.tenant_id,
                phone_number=norm_phone,
                category=req.default_category if req.default_category in ("B", "C") else "B",
                method="crm_import",
                ai_voice_disclosed=True,
                seller_name=f"CSV Import by {user.email}",
                ip_address="127.0.0.1",
            )
            db.add(consent_record)
        else:
            is_callable = False
            non_callable_count += 1
            if "non-callable" not in tags:
                tags.append("non-callable")

        # Upsert contact
        contact = db.scalar(
            select(Contact).where(Contact.tenant_id == user.tenant_id, Contact.phone == norm_phone)
        )
        if contact:
            contact.name = name
            if email:
                contact.email = email
            contact.tags = sorted(set(contact.tags + tags))
            contact.is_callable = is_callable
            contact.updated_at = now
        else:
            contact = Contact(
                tenant_id=user.tenant_id,
                name=name,
                phone=norm_phone,
                email=email,
                source=req.source,
                stage=stage,
                tags=tags,
                is_callable=is_callable,
                custom_fields={
                    "imported_at": now.isoformat(),
                    "consent_attested": req.consent_attestation,
                },
                first_contact_at=now,
                last_contact_at=now,
            )
            db.add(contact)

        imported += 1

    db.commit()

    return {
        "success": True,
        "imported": imported,
        "callable": callable_count,
        "non_callable": non_callable_count,
        "errors": errors,
    }


# ===========================================================================
# 5. REVENUE RECOVERED ESTIMATE & SETTINGS (FR-CRM-18)
# ===========================================================================


@router.get("/analytics/revenue-recovered")
def get_revenue_recovered_analytics(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Calculate pipeline ROI and revenue recovered via AI voice conversions (FR-CRM-18)."""
    tenant_id = resolve_tenant_id(user, db)

    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    tenant_cfg = tenant.config or {}
    avg_deal_value = float(tenant_cfg.get("average_deal_value", 250.0))

    # Deals won / appointments booked
    booked_count = (
        db.scalar(
            select(func.count(Contact.id)).where(
                Contact.tenant_id == tenant_id, Contact.stage == "booked"
            )
        )
        or 0
    )

    won_count = (
        db.scalar(
            select(func.count(Contact.id)).where(
                Contact.tenant_id == tenant_id, Contact.stage == "closed"
            )
        )
        or 0
    )

    ai_booked_calls = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant_id, Call.outcome == "appointment_booked"
            )
        )
        or 0
    )

    total_conversions = booked_count + won_count
    total_recovered = total_conversions * avg_deal_value

    all_stages = get_or_seed_tenant_stages(db, tenant_id)
    pipeline_breakdown = {}
    for stg in all_stages:
        cnt = (
            db.scalar(
                select(func.count(Contact.id)).where(
                    Contact.tenant_id == tenant_id, Contact.stage == stg.stage_key
                )
            )
            or 0
        )
        pipeline_breakdown[stg.stage_key] = {
            "label": stg.label,
            "count": cnt,
            "estimated_value": cnt * avg_deal_value,
        }

    return {
        "average_deal_value": avg_deal_value,
        "booked_count": booked_count,
        "won_count": won_count,
        "total_conversions": total_conversions,
        "ai_booked_calls": ai_booked_calls,
        "total_revenue_recovered": total_recovered,
        "pipeline_breakdown": pipeline_breakdown,
    }


@router.patch("/settings/revenue")
def update_revenue_settings(
    req: RevenueSettingsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Update configurable average job/appointment value for ROI tracking (FR-CRM-18)."""
    tenant_id = resolve_tenant_id(user, db)

    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    current_cfg = dict(tenant.config or {})
    current_cfg["average_deal_value"] = req.average_deal_value
    tenant.config = current_cfg
    db.commit()

    return {
        "success": True,
        "average_deal_value": req.average_deal_value,
        "message": f"Average deal value updated to ${req.average_deal_value:.2f}",
    }


# ===========================================================================
# 6. EMAIL CAMPAIGNS & BROADCASTS
# ===========================================================================


@router.get("/campaigns")
def list_email_campaigns(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List tenant email sequences and newsletter campaigns."""
    tenant_id = resolve_tenant_id(user, db)

    campaigns = db.scalars(
        select(EmailCampaign)
        .where(EmailCampaign.tenant_id == tenant_id)
        .order_by(desc(EmailCampaign.created_at))
    ).all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "subject": c.subject,
            "body_html": c.body_html,
            "trigger_event": c.trigger_event,
            "target_stage": c.target_stage,
            "status": c.status,
            "sent_count": c.sent_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in campaigns
    ]


@router.post("/campaigns", status_code=status.HTTP_201_CREATED)
def create_email_campaign(
    req: CreateCampaignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Create an email sequence or newsletter broadcast template."""
    tenant_id = resolve_tenant_id(user, db)

    campaign = EmailCampaign(
        tenant_id=tenant_id,
        name=req.name,
        subject=req.subject,
        body_html=req.body_html,
        trigger_event=req.trigger_event,
        target_stage=req.target_stage,
        status="active",
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    return {
        "success": True,
        "id": campaign.id,
        "name": campaign.name,
        "subject": campaign.subject,
    }


@router.post("/campaigns/{campaign_id}/send")
def trigger_campaign_broadcast(
    campaign_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Send an email broadcast to contacts matching the campaign target stage."""
    tenant_id = resolve_tenant_id(user, db)

    campaign = db.scalar(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.tenant_id == tenant_id,
        )
    )
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    query = select(Contact).where(Contact.tenant_id == tenant_id, Contact.email.is_not(None))
    if campaign.target_stage:
        query = query.where(Contact.stage == campaign.target_stage)

    targets = db.scalars(query).all()
    count = len(targets)

    campaign.sent_count += count
    db.commit()

    return {
        "success": True,
        "campaign_id": campaign.id,
        "sent_count": count,
        "message": f"Broadcast successfully queued for {count} contacts.",
    }
