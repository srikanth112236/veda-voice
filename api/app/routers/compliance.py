"""Compliance Management, Consent Evidentiary Store, and State Rules API."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant, get_current_user
from api.app.db.session import get_db
from api.app.models.compliance import PlatformSuppression, StateRule
from api.app.models.outbound import ConsentRecord, OutboundDispatch, SuppressionRecord
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.compliance import normalize_e164_phone

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])


class RegisterConsentRequest(BaseModel):
    phone_number: str = Field(..., description="E.164 lead phone number")
    category: str = Field("C", description="B: Transactional, C: Speed-to-lead, D: Reactivation")
    seller_name: str = Field(..., description="Business name explicitly named on the consent form")
    ai_voice_disclosed: bool = Field(
        True, description="Whether artificial / AI voice was explicitly disclosed"
    )
    consent_text_id: str | None = None
    consent_text_body: str | None = None
    method: str = Field(
        "web_form", description="web_form, verbal_recorded, sms_reply, in_person, crm_import"
    )
    form_url: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None


class OptOutRequest(BaseModel):
    phone_number: str = Field(..., description="E.164 phone number requesting revocation")
    reason: str = Field("opt_out", description="opt_out, spoken_in_call, dtmf, crm_sync, manual")
    notes: str = Field("", description="Optional details or context")
    propagate_platform: bool = Field(
        True, description="Whether to add to cross-tenant marketing DND"
    )


@router.get("/state-rules")
def list_state_rules(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List US state-specific calling windows, attempt caps, and recording consent requirements."""
    rules = db.scalars(select(StateRule).order_by(StateRule.state.asc())).all()
    return [
        {
            "state": r.state,
            "window_start": r.window_start,
            "window_end": r.window_end,
            "max_attempts_24h": r.max_attempts_24h,
            "requires_state_dnc": r.requires_state_dnc,
            "all_party_recording": r.all_party_recording,
            "ai_disclosure_required": r.ai_disclosure_required,
            "notes": r.notes,
        }
        for r in rules
    ]


@router.post("/consents", status_code=status.HTTP_201_CREATED)
def register_consent(
    req: RegisterConsentRequest,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Capture prior express written consent with complete legal evidentiary record."""
    norm_phone = normalize_e164_phone(req.phone_number)
    if not norm_phone:
        raise HTTPException(status_code=422, detail="Invalid E.164 phone number.")

    now = datetime.now(UTC)
    five_years_later = now + timedelta(days=5 * 365)

    consent_record = ConsentRecord(
        tenant_id=tenant.id,
        phone_number=norm_phone,
        category=req.category.upper(),
        consent_text_id=req.consent_text_id,
        ai_voice_disclosed=req.ai_voice_disclosed,
        method=req.method,
        form_url=req.form_url,
        seller_name=req.seller_name or tenant.name,
        source=req.method,
        consent_confirmed=True,
        consent_text=req.consent_text_body
        or "Prior express written consent authorized for AI voice calling.",
        ip_address=req.ip_address,
        user_agent=req.user_agent,
        retention_until=five_years_later,
        created_at=now,
    )
    db.add(consent_record)

    # If phone was on tenant suppression, remove it since explicit new consent was captured
    existing_suppression = db.scalar(
        select(SuppressionRecord).where(
            SuppressionRecord.tenant_id == tenant.id,
            SuppressionRecord.phone_number == norm_phone,
        )
    )
    if existing_suppression:
        db.delete(existing_suppression)

    db.commit()
    db.refresh(consent_record)

    return {
        "success": True,
        "consent_id": consent_record.id,
        "phone_number": consent_record.phone_number,
        "category": consent_record.category,
        "retention_until": consent_record.retention_until.isoformat(),
    }


@router.post("/opt-out")
def process_revocation_and_opt_out(
    req: OptOutRequest,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Immediate revocation (<60s target): creates suppression, revokes consent, updates platform DND."""
    norm_phone = normalize_e164_phone(req.phone_number)
    if not norm_phone:
        raise HTTPException(status_code=422, detail="Invalid E.164 phone number.")

    now = datetime.now(UTC)

    # 1. Add / update tenant suppression record
    suppression = db.scalar(
        select(SuppressionRecord).where(
            SuppressionRecord.tenant_id == tenant.id,
            SuppressionRecord.phone_number == norm_phone,
        )
    )
    if not suppression:
        suppression = SuppressionRecord(
            tenant_id=tenant.id,
            phone_number=norm_phone,
            reason=req.reason,
            notes=req.notes or f"Revocation registered via {req.reason}",
            created_at=now,
        )
        db.add(suppression)
    else:
        suppression.reason = req.reason
        suppression.notes = req.notes or suppression.notes

    # 2. Mark active consents as revoked
    active_consents = db.scalars(
        select(ConsentRecord).where(
            ConsentRecord.tenant_id == tenant.id,
            ConsentRecord.phone_number == norm_phone,
            ConsentRecord.revoked_at.is_(None),
        )
    ).all()
    for c in active_consents:
        c.revoked_at = now
        c.revoked_via = req.reason

    # 3. Cancel any queued outbound dispatches
    queued_dispatches = db.scalars(
        select(OutboundDispatch).where(
            OutboundDispatch.tenant_id == tenant.id,
            OutboundDispatch.to_phone == norm_phone,
            OutboundDispatch.status == "queued",
        )
    ).all()
    for d in queued_dispatches:
        d.status = "skipped_compliance"
        d.skip_reason = f"Revoked / Opted out via {req.reason}"

    # 4. Optional cross-tenant platform suppression for marketing
    if req.propagate_platform:
        plat_supp = db.scalar(
            select(PlatformSuppression).where(PlatformSuppression.phone_number == norm_phone)
        )
        if not plat_supp:
            db.add(
                PlatformSuppression(
                    phone_number=norm_phone,
                    reason=req.reason,
                    source_tenant_id=tenant.id,
                    created_at=now,
                )
            )

    db.commit()

    return {
        "success": True,
        "phone_number": norm_phone,
        "revoked_at": now.isoformat(),
        "consents_revoked": len(active_consents),
        "dispatches_cancelled": len(queued_dispatches),
        "dispatches_canceled": len(queued_dispatches),
        "platform_suppressed": req.propagate_platform,
    }


@router.get("/audit-export/{phone_number}")
def get_compliance_audit_export(
    phone_number: str,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """1-Click evidentiary compliance export for TCPA defense."""
    norm_phone = normalize_e164_phone(phone_number)
    if not norm_phone:
        raise HTTPException(status_code=422, detail="Invalid phone number.")

    consents = db.scalars(
        select(ConsentRecord)
        .where(ConsentRecord.tenant_id == tenant.id, ConsentRecord.phone_number == norm_phone)
        .order_by(desc(ConsentRecord.created_at))
    ).all()

    suppressions = db.scalars(
        select(SuppressionRecord).where(
            SuppressionRecord.tenant_id == tenant.id, SuppressionRecord.phone_number == norm_phone
        )
    ).all()

    dispatches = db.scalars(
        select(OutboundDispatch)
        .where(OutboundDispatch.tenant_id == tenant.id, OutboundDispatch.to_phone == norm_phone)
        .order_by(desc(OutboundDispatch.created_at))
    ).all()

    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "phone_number": norm_phone,
        "exported_at": datetime.now(UTC).isoformat(),
        "has_active_consent": any(c.consent_confirmed and not c.revoked_at for c in consents),
        "is_suppressed": len(suppressions) > 0,
        "consents": [
            {
                "id": c.id,
                "category": c.category,
                "seller_name": c.seller_name,
                "ai_voice_disclosed": c.ai_voice_disclosed,
                "method": c.method,
                "form_url": c.form_url,
                "ip_address": c.ip_address,
                "user_agent": c.user_agent,
                "created_at": c.created_at.isoformat(),
                "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
                "revoked_via": c.revoked_via,
                "retention_until": c.retention_until.isoformat(),
            }
            for c in consents
        ],
        "suppression_history": [
            {
                "reason": s.reason,
                "notes": s.notes,
                "created_at": s.created_at.isoformat(),
            }
            for s in suppressions
        ],
        "gate_dispatch_verdicts": [
            {
                "call_id": d.call_id,
                "purpose": d.purpose,
                "status": d.status,
                "compliance_passed": d.compliance_passed,
                "compliance_verdict": d.compliance_verdict,
                "skip_reason": d.skip_reason,
                "created_at": d.created_at.isoformat(),
            }
            for d in dispatches
        ],
    }


@router.get("/status")
def get_tenant_compliance_standing(
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Retrieve tenant compliance standing and 24h complaint rate."""
    day_ago = datetime.now(UTC) - timedelta(days=1)
    recent_complaints = (
        db.scalar(
            select(func.count(SuppressionRecord.id)).where(
                SuppressionRecord.tenant_id == tenant.id,
                SuppressionRecord.reason.in_(["opt_out", "carrier_complaint", "complaint"]),
                SuppressionRecord.created_at >= day_ago,
            )
        )
        or 0
    )

    is_auto_paused = recent_complaints >= 3
    return {
        "tenant_id": tenant.id,
        "tenant_status": tenant.status,
        "outbound_allowed": tenant.status == "active" and not is_auto_paused,
        "complaints_past_24h": recent_complaints,
        "complaint_threshold": 3,
        "is_auto_paused": is_auto_paused,
        "kill_switch_active": is_auto_paused,
    }
