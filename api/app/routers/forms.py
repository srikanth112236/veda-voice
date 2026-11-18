"""Multi-tenant Lead Form Builder and Public Lead Intake Router."""

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_user
from api.app.db.session import get_db
from api.app.models.lead_form import Lead, LeadForm
from api.app.models.outbound import ConsentRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.compliance import normalize_e164_phone
from api.app.services.outbound import trigger_speed_to_lead_outbound

router = APIRouter(prefix="/api/v1/forms", tags=["forms"])


class FormFieldConfig(BaseModel):
    name: str = Field(..., description="Unique field identifier e.g. caller_name, service_address")
    label: str = Field(..., description="User-facing input label")
    type: str = Field("text", description="text, tel, email, select, or textarea")
    required: bool = Field(False, description="Whether the field is mandatory")
    options: list[str] = Field(
        default_factory=list, description="Dropdown options if type is select"
    )
    placeholder: str = Field("", description="Input placeholder text")


class CreateLeadFormRequest(BaseModel):
    title: str = Field(..., description="Form title e.g. Emergency Plumbing Service Request")
    description: str = Field("", description="Subheading or instructions for customer")
    fields: list[FormFieldConfig] = Field(..., description="Ordered list of form fields")
    submit_action: str = Field("call_triage", description="call_triage or log_only")


class UpdateLeadFormRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    fields: list[FormFieldConfig] | None = None
    submit_action: str | None = None
    is_active: bool | None = None


class PublicFormSubmitRequest(BaseModel):
    caller_name: str | None = None
    caller_phone: str = Field(..., description="Customer callback telephone number")
    urgency: str = Field("normal", description="normal, urgent, or emergency")
    service_requested: str | None = None
    service_address: str | None = None
    custom_data: dict[str, Any] = Field(
        default_factory=dict, description="Arbitrary custom field key-values"
    )


class UpdateLeadStatusRequest(BaseModel):
    status: str = Field(..., description="pending, contacted, dispatched, or converted")


# ================= TENANT-SCOPED FORM BUILDER MANAGEMENT =================


@router.get("")
def list_tenant_forms(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all lead intake forms configured for the authenticated tenant."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    forms = db.scalars(
        select(LeadForm)
        .where(LeadForm.tenant_id == user.tenant_id)
        .order_by(desc(LeadForm.created_at))
    ).all()

    return [
        {
            "id": f.id,
            "tenant_id": f.tenant_id,
            "title": f.title,
            "description": f.description,
            "fields": f.fields,
            "submit_action": f.submit_action,
            "is_active": f.is_active,
            "total_leads_captured": len(f.leads),
            "created_at": f.created_at.isoformat(),
        }
        for f in forms
    ]


@router.post("")
def create_tenant_form(
    req: CreateLeadFormRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a new custom lead intake form for the authenticated tenant."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    form = LeadForm(
        tenant_id=user.tenant_id,
        title=req.title,
        description=req.description,
        fields=[field.model_dump() for field in req.fields],
        submit_action=req.submit_action,
        is_active=True,
    )
    db.add(form)
    db.commit()
    db.refresh(form)

    return {
        "id": form.id,
        "title": form.title,
        "description": form.description,
        "fields": form.fields,
        "submit_action": form.submit_action,
        "public_url": f"/forms/{form.id}",
    }


@router.get("/{form_id}")
def get_tenant_form(
    form_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Get full details of a specific lead form."""
    form = db.scalar(
        select(LeadForm).where(LeadForm.id == form_id, LeadForm.tenant_id == user.tenant_id)
    )
    if not form:
        raise HTTPException(status_code=404, detail="Form not found.")

    return {
        "id": form.id,
        "tenant_id": form.tenant_id,
        "title": form.title,
        "description": form.description,
        "fields": form.fields,
        "submit_action": form.submit_action,
        "is_active": form.is_active,
        "created_at": form.created_at.isoformat(),
    }


@router.put("/{form_id}")
def update_tenant_form(
    form_id: str,
    req: UpdateLeadFormRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Update fields or settings of a lead intake form."""
    form = db.scalar(
        select(LeadForm).where(LeadForm.id == form_id, LeadForm.tenant_id == user.tenant_id)
    )
    if not form:
        raise HTTPException(status_code=404, detail="Form not found.")

    if req.title is not None:
        form.title = req.title
    if req.description is not None:
        form.description = req.description
    if req.fields is not None:
        form.fields = [f.model_dump() for f in req.fields]
    if req.submit_action is not None:
        form.submit_action = req.submit_action
    if req.is_active is not None:
        form.is_active = req.is_active

    db.commit()
    db.refresh(form)
    return {"success": True, "id": form.id, "title": form.title}


@router.delete("/{form_id}")
def delete_tenant_form(
    form_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Delete a lead intake form."""
    form = db.scalar(
        select(LeadForm).where(LeadForm.id == form_id, LeadForm.tenant_id == user.tenant_id)
    )
    if not form:
        raise HTTPException(status_code=404, detail="Form not found.")

    db.delete(form)
    db.commit()
    return {"success": True, "message": "Form deleted successfully."}


# ================= PUBLIC FORM RENDERING & SUBMISSION =================


@router.get("/{form_id}/public")
def get_public_form_schema(
    form_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Public endpoint to fetch form title, description, and fields for embedding."""
    form = db.scalar(select(LeadForm).where(LeadForm.id == form_id, LeadForm.is_active.is_(True)))
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or has been deactivated.")

    tenant = db.scalar(select(Tenant).where(Tenant.id == form.tenant_id))

    return {
        "form_id": form.id,
        "business_name": tenant.name if tenant else "Service Provider",
        "title": form.title,
        "description": form.description,
        "fields": form.fields,
        "submit_action": form.submit_action,
    }


@router.post("/{form_id}/submit")
def submit_public_lead_form(
    form_id: str,
    req: PublicFormSubmitRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Public submission endpoint that records a lead and triggers triage gate."""
    form = db.scalar(select(LeadForm).where(LeadForm.id == form_id, LeadForm.is_active.is_(True)))
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or has been deactivated.")

    now = datetime.now(UTC)
    norm_phone = normalize_e164_phone(req.caller_phone)
    tenant = db.scalar(select(Tenant).where(Tenant.id == form.tenant_id))
    seller_name = tenant.name if tenant else "Service Provider"

    # Evidentiary consent record with 5-year retention and AI voice disclosure (Milestone M5b)
    consent_record = ConsentRecord(
        tenant_id=form.tenant_id,
        phone_number=norm_phone,
        source=f"web_form_{form.id}",
        consent_confirmed=True,
        consent_text=f"By submitting, user authorized {seller_name} and its automated AI voice system to contact them regarding their inquiry.",
        category="C",
        ai_voice_disclosed=True,
        method="web_form",
        form_url=f"/forms/{form.id}",
        seller_name=seller_name,
        created_at=now,
        retention_until=now + timedelta(days=5 * 365),
    )
    db.add(consent_record)
    db.flush()

    # Create Lead record
    lead = Lead(
        tenant_id=form.tenant_id,
        form_id=form.id,
        caller_name=req.caller_name,
        caller_phone=norm_phone,
        urgency=req.urgency.lower(),
        service_requested=req.service_requested,
        service_address=req.service_address,
        custom_data=req.custom_data,
        status="pending",
        outbound_call_triggered=False,
    )

    # If form specifies call_triage, trigger speed-to-lead outbound through compliance gate
    compliance_reason = "not_requested"
    if form.submit_action == "call_triage":
        dispatch, compliance = trigger_speed_to_lead_outbound(
            db=db,
            tenant_id=form.tenant_id,
            to_phone=lead.caller_phone,
            lead_id=lead.id,
            caller_name=lead.caller_name,
            service_requested=lead.service_requested,
            category="C",
            has_consent=True,
        )
        lead.outbound_call_triggered = compliance.passed
        compliance_reason = compliance.reason
        lead.custom_data = {
            **(lead.custom_data or {}),
            "compliance_verdict": compliance.to_dict(),
            "dispatch_id": dispatch.id,
        }

    db.add(lead)
    db.commit()
    db.refresh(lead)

    return {
        "success": True,
        "lead_id": lead.id,
        "message": (
            "Your service inquiry has been received! Our automated AI coordinator will connect with you in ~2 seconds."
            if lead.outbound_call_triggered
            else "Your service inquiry has been recorded. Our team will follow up shortly."
        ),
        "call_triage_triggered": lead.outbound_call_triggered,
        "compliance_reason": compliance_reason,
    }


# ================= LEADS INBOX =================


@router.get("/leads/all")
def list_captured_leads(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all leads captured for the authenticated tenant."""
    if not user.tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context required.")

    leads = db.scalars(
        select(Lead).where(Lead.tenant_id == user.tenant_id).order_by(desc(Lead.created_at))
    ).all()

    return [
        {
            "id": lead.id,
            "form_id": lead.form_id,
            "caller_name": lead.caller_name or "Website Visitor",
            "caller_phone": lead.caller_phone,
            "urgency": lead.urgency,
            "service_requested": lead.service_requested,
            "service_address": lead.service_address,
            "custom_data": lead.custom_data,
            "status": lead.status,
            "outbound_call_triggered": lead.outbound_call_triggered,
            "created_at": lead.created_at.isoformat(),
        }
        for lead in leads
    ]


@router.post("/leads/{lead_id}/status")
def update_lead_status(
    lead_id: str,
    req: UpdateLeadStatusRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Update lead status (contacted, converted, etc.)."""
    lead = db.scalar(select(Lead).where(Lead.id == lead_id, Lead.tenant_id == user.tenant_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")

    lead.status = req.status
    db.commit()
    return {"success": True, "lead_id": lead.id, "status": lead.status}
