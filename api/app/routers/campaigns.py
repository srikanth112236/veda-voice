"""Portal & Internal router for Voice Campaigns and Outbound Dialer Management."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.outbound import CampaignContact, VoiceCampaign
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.services.campaign_runner import (
    handle_campaign_contact_outcome,
    run_campaign_step,
)
from api.app.services.compliance import normalize_e164_phone

logger = logging.getLogger("vedavoice.campaigns_router")
router = APIRouter(prefix="/portal/campaigns", tags=["campaigns"])


class ContactInput(BaseModel):
    phone_number: str
    recipient_name: str = "Customer"
    contact_id: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class CreateCampaignRequest(BaseModel):
    name: str
    purpose: str = "appointment_reminder"  # appointment_reminder, callback_scheduled, speed_to_lead, reactivation
    prompt_variant: str = "default"
    caller_id_e164: str | None = None
    schedule_window_start: str = "09:00"
    schedule_window_end: str = "18:00"
    max_attempts_per_contact: int = 3
    retry_interval_hours: int = 3
    contacts: list[ContactInput] = Field(default_factory=list)


class ContactOutcomeRequest(BaseModel):
    outcome: str  # answered_booked, answered_confirmed, answered_rescheduled, answered_declined, answered_opt_out, voicemail_left, no_answer, busy, failed


@router.get("")
def list_campaigns(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all voice campaigns for the authenticated tenant."""
    campaigns = db.scalars(
        select(VoiceCampaign)
        .where(VoiceCampaign.tenant_id == tenant.id)
        .order_by(VoiceCampaign.created_at.desc())
    ).all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "purpose": c.purpose,
            "status": c.status,
            "caller_id": c.caller_id_e164,
            "total_contacts": c.total_contacts,
            "completed_contacts": c.completed_contacts,
            "successful_contacts": c.successful_contacts,
            "created_at": c.created_at.isoformat(),
            "updated_at": c.updated_at.isoformat(),
        }
        for c in campaigns
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_campaign(
    payload: CreateCampaignRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create a new outbound voice campaign with target contact list."""
    # Resolve caller ID (verify tenant owns number)
    caller_phone = None
    if payload.caller_id_e164:
        norm_cid = normalize_e164_phone(payload.caller_id_e164)
        caller_phone = db.scalar(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == tenant.id,
                PhoneNumber.e164 == norm_cid,
                PhoneNumber.status == "active",
            )
        )
    if not caller_phone:
        caller_phone = db.scalar(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == tenant.id,
                PhoneNumber.status == "active",
            )
        )
    if not caller_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant has no active registered caller ID phone number.",
        )

    now = datetime.now(UTC)
    campaign = VoiceCampaign(
        tenant_id=tenant.id,
        name=payload.name,
        purpose=payload.purpose,
        prompt_variant=payload.prompt_variant,
        caller_id_e164=caller_phone.e164,
        schedule_window_start=payload.schedule_window_start,
        schedule_window_end=payload.schedule_window_end,
        max_attempts_per_contact=payload.max_attempts_per_contact,
        retry_interval_hours=payload.retry_interval_hours,
        status="draft",
        total_contacts=len(payload.contacts),
        completed_contacts=0,
        successful_contacts=0,
        created_at=now,
        updated_at=now,
    )
    db.add(campaign)
    db.flush()

    for item in payload.contacts:
        norm_to = normalize_e164_phone(item.phone_number)
        contact_row = CampaignContact(
            campaign_id=campaign.id,
            tenant_id=tenant.id,
            contact_id=item.contact_id,
            phone_number=norm_to,
            recipient_name=item.recipient_name,
            status="pending",
            attempts_count=0,
            metadata_json=item.metadata_json,
            created_at=now,
        )
        db.add(contact_row)

    db.commit()
    db.refresh(campaign)

    return {
        "id": campaign.id,
        "name": campaign.name,
        "purpose": campaign.purpose,
        "status": campaign.status,
        "total_contacts": campaign.total_contacts,
        "caller_id": campaign.caller_id_e164,
        "created_at": campaign.created_at.isoformat(),
    }


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get campaign details and status breakdown."""
    campaign = db.scalar(
        select(VoiceCampaign).where(
            VoiceCampaign.id == campaign_id,
            VoiceCampaign.tenant_id == tenant.id,
        )
    )
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    contacts = db.scalars(
        select(CampaignContact)
        .where(CampaignContact.campaign_id == campaign_id)
        .order_by(CampaignContact.created_at.asc())
    ).all()

    return {
        "id": campaign.id,
        "name": campaign.name,
        "purpose": campaign.purpose,
        "status": campaign.status,
        "caller_id": campaign.caller_id_e164,
        "total_contacts": campaign.total_contacts,
        "completed_contacts": campaign.completed_contacts,
        "successful_contacts": campaign.successful_contacts,
        "contacts": [
            {
                "id": c.id,
                "phone_number": c.phone_number,
                "recipient_name": c.recipient_name,
                "status": c.status,
                "attempts_count": c.attempts_count,
                "last_outcome": c.last_outcome,
                "skip_reason": c.skip_reason,
                "next_attempt_at": c.next_attempt_at.isoformat() if c.next_attempt_at else None,
            }
            for c in contacts
        ],
    }


@router.post("/{campaign_id}/pause")
def pause_campaign(
    campaign_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Immediately pause a running voice campaign."""
    campaign = db.scalar(
        select(VoiceCampaign).where(
            VoiceCampaign.id == campaign_id,
            VoiceCampaign.tenant_id == tenant.id,
        )
    )
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    campaign.status = "paused"
    campaign.updated_at = datetime.now(UTC)
    db.commit()

    return {"id": campaign.id, "status": campaign.status, "message": "Campaign paused immediately"}


@router.post("/{campaign_id}/resume")
def resume_campaign(
    campaign_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Resume a paused or draft voice campaign."""
    campaign = db.scalar(
        select(VoiceCampaign).where(
            VoiceCampaign.id == campaign_id,
            VoiceCampaign.tenant_id == tenant.id,
        )
    )
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    campaign.status = "running"
    campaign.updated_at = datetime.now(UTC)
    db.commit()

    return {"id": campaign.id, "status": campaign.status, "message": "Campaign resumed"}


@router.post("/{campaign_id}/run")
def trigger_campaign_run(
    campaign_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Trigger a dialer run batch for eligible contacts in the campaign."""
    campaign = db.scalar(
        select(VoiceCampaign).where(
            VoiceCampaign.id == campaign_id,
            VoiceCampaign.tenant_id == tenant.id,
        )
    )
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    result = run_campaign_step(campaign_id=campaign_id, db=db)
    return result


@router.post("/{campaign_id}/contacts/{contact_id}/outcome")
def update_contact_outcome(
    campaign_id: str,
    contact_id: str,
    payload: ContactOutcomeRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Record call outcome for a campaign contact (e.g. from post-call webhook or agent event)."""
    contact = db.scalar(
        select(CampaignContact).where(
            CampaignContact.id == contact_id,
            CampaignContact.campaign_id == campaign_id,
            CampaignContact.tenant_id == tenant.id,
        )
    )
    if not contact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    result = handle_campaign_contact_outcome(
        db=db,
        campaign_contact_id=contact_id,
        outcome=payload.outcome,
    )
    return result
