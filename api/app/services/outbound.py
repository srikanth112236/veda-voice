"""Outbound call scheduling and LiveKit SIP dispatch service."""

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.call import Call
from api.app.models.compliance import PlatformSuppression
from api.app.models.outbound import ConsentRecord, OutboundDispatch, SuppressionRecord
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.services.compliance import (
    ComplianceGateResult,
    evaluate_compliance_gate_v2,
    normalize_e164_phone,
)
from api.app.services.notifier import TwilioSmsDispatcher

logger = logging.getLogger("vedavoice.outbound")


def record_caller_opt_out(
    db: Session,
    tenant_id: str,
    phone_number: str,
    reason: str = "opt_out",
    notes: str = "Opt-out requested during automated call",
) -> SuppressionRecord:
    """Record caller into tenant suppression list immediately and revoke active consents."""
    norm_phone = normalize_e164_phone(phone_number)
    now = datetime.now(UTC)

    # 1. Update or create tenant suppression
    existing = db.scalar(
        select(SuppressionRecord).where(
            SuppressionRecord.tenant_id == tenant_id,
            SuppressionRecord.phone_number == norm_phone,
        )
    )
    if existing:
        existing.reason = reason
        existing.notes = notes
        record = existing
    else:
        record = SuppressionRecord(
            tenant_id=tenant_id,
            phone_number=norm_phone,
            reason=reason,
            notes=notes,
            created_at=now,
        )
        db.add(record)

    # 2. Revoke all active consents for this number
    active_consents = db.scalars(
        select(ConsentRecord).where(
            ConsentRecord.tenant_id == tenant_id,
            ConsentRecord.phone_number == norm_phone,
            ConsentRecord.revoked_at.is_(None),
        )
    ).all()
    for c in active_consents:
        c.revoked_at = now
        c.revoked_via = reason

    # 3. Cancel queued dispatches
    queued = db.scalars(
        select(OutboundDispatch).where(
            OutboundDispatch.tenant_id == tenant_id,
            OutboundDispatch.to_phone == norm_phone,
            OutboundDispatch.status == "queued",
        )
    ).all()
    for d in queued:
        d.status = "skipped_compliance"
        d.skip_reason = f"Revocation: {reason}"

    # 4. Add to cross-tenant platform suppression for marketing categories
    plat_supp = db.scalar(
        select(PlatformSuppression).where(PlatformSuppression.phone_number == norm_phone)
    )
    if not plat_supp:
        db.add(
            PlatformSuppression(
                phone_number=norm_phone,
                reason=reason,
                source_tenant_id=tenant_id,
                created_at=now,
            )
        )

    db.commit()
    db.refresh(record)
    logger.info(
        "Caller %s added to suppression list for tenant %s (sub-60s sync complete)",
        norm_phone,
        tenant_id,
    )
    return record


def trigger_speed_to_lead_outbound(
    db: Session,
    tenant_id: str,
    to_phone: str,
    lead_id: str | None = None,
    caller_name: str | None = None,
    service_requested: str | None = None,
    category: str = "C",
    has_consent: bool | None = True,
    current_time: datetime | None = None,
) -> tuple[OutboundDispatch, ComplianceGateResult]:
    """Execute compliance gate v2 and dispatch outbound speed-to-lead triage call."""
    now = current_time or datetime.now(UTC)
    norm_to = normalize_e164_phone(to_phone)

    # 1. Select tenant's active caller ID
    caller_phone = db.scalar(
        select(PhoneNumber).where(
            PhoneNumber.tenant_id == tenant_id,
            PhoneNumber.status == "active",
        )
    )
    from_phone = caller_phone.e164 if caller_phone else ""

    # 2. Evaluate 10-point compliance gate v2
    compliance = evaluate_compliance_gate_v2(
        db=db,
        tenant_id=tenant_id,
        to_phone=norm_to,
        from_phone=from_phone,
        category=category,
        purpose="call_triage",
        has_consent=has_consent,
        current_time=now,
    )

    call_id = f"out-{tenant_id[:8]}-{uuid.uuid4().hex[:8]}"

    if not compliance.passed:
        logger.warning(
            "Outbound triage for lead %s blocked by compliance gate: %s",
            lead_id,
            compliance.reason,
        )

        # Operational best practice: After-hours holding queue (scheduled for 8:05 AM in lead's timezone)
        is_after_hours = compliance.reason == "outside_calling_window"
        dispatch_status = "queued_after_hours" if is_after_hours else "skipped_compliance"

        sched_dt: datetime | None = None
        if is_after_hours and "scheduled_for" in compliance.details:
            try:
                sched_dt = datetime.fromisoformat(compliance.details["scheduled_for"])
            except Exception:
                pass

        dispatch = OutboundDispatch(
            tenant_id=tenant_id,
            call_id=call_id,
            to_phone=norm_to,
            from_phone=from_phone,
            purpose="call_triage",
            lead_id=lead_id,
            status=dispatch_status,
            compliance_passed=False,
            compliance_verdict=compliance.to_dict(),
            skip_reason=compliance.reason,
            created_at=now,
            scheduled_for=sched_dt,
        )
        db.add(dispatch)
        db.commit()
        db.refresh(dispatch)

        # Dispatch immediate transactional holding SMS if submitted after hours
        if is_after_hours:
            tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
            tenant_name = tenant.name if tenant else "Our team"
            lead_name_str = caller_name.strip() if caller_name and caller_name.strip() else "there"
            service_str = service_requested.strip() if service_requested else "your inquiry"
            sms_body = (
                f"Hi {lead_name_str}, we received your after-hours request for {service_str} at {tenant_name}. "
                f"Our coordinator will call you first thing at 8:05 AM!"
            )
            try:
                TwilioSmsDispatcher().send(norm_to, sms_body)
                logger.info("Sent after-hours holding SMS to %s for tenant %s", norm_to, tenant_id)
            except Exception as e:
                logger.warning("Failed to send after-hours holding SMS: %s", e)

        return dispatch, compliance

    # 3. Compliance Passed: Create OutboundDispatch record
    dispatch = OutboundDispatch(
        tenant_id=tenant_id,
        call_id=call_id,
        to_phone=norm_to,
        from_phone=from_phone,
        purpose="call_triage",
        lead_id=lead_id,
        status="dispatched",
        compliance_passed=True,
        compliance_verdict=compliance.to_dict(),
        created_at=now,
        dispatched_at=now,
    )
    db.add(dispatch)

    # 4. Create initial Call session record
    outbound_call = Call(
        tenant_id=tenant_id,
        call_id=call_id,
        caller_number=norm_to,
        dialed_number=from_phone,
        direction="outbound",
        started_at=now,
        outcome="queued",
        tags=["speed_to_lead", "outbound_triage"],
        message={
            "lead_id": lead_id,
            "caller_name": caller_name,
            "service_requested": service_requested,
            "purpose": "call_triage",
        },
    )
    db.add(outbound_call)
    db.commit()
    db.refresh(dispatch)

    logger.info(
        "Outbound speed-to-lead call %s dispatched to %s for tenant %s",
        call_id,
        norm_to,
        tenant_id,
    )
    return dispatch, compliance
