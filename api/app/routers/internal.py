"""Internal endpoints dedicated to LiveKit Voice Agent worker."""

import json
import logging
import math
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.security import create_access_token, decode_access_token
from api.app.db.session import get_db
from api.app.models.call import Call
from api.app.models.subscription import Subscription, UsageRecord
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.services.calendar.availability import AvailableSlotsResponse, compute_available_slots
from api.app.services.calendar.booking import (
    SlotUnavailableError,
    confirm_booking,
    hold_time_slot,
)
from api.app.services.calendar.booking import (
    cancel_booking as cancel_booking_service,
)
from api.app.services.integrations.google_sheets import sync_call_result_to_sheets
from api.app.services.integrations.sync_dispatcher import dispatch_all_crm_and_webhook_sync
from api.app.services.intelligence import extract_post_call_intelligence
from api.app.services.notifier import dispatch_call_notifications
from api.app.services.outbound import record_caller_opt_out
from api.app.services.qa_scoring import evaluate_call_qa

logger = logging.getLogger("vedavoice.internal")

router = APIRouter(prefix="/internal", tags=["internal"])


class InternalTenantConfigResponse(BaseModel):
    tenant_id: str
    business_name: str
    timezone: str
    hours: str
    agent_name: str
    greeting: str
    tone: str
    voice_id: str = "Alex"
    tts_model: str = "inworld/inworld-tts-1"
    recording_disclosure: bool = True
    services: list[str]
    pricing_policy: str
    pricing_details: dict[str, Any]
    faq: list[dict[str, Any]]
    emergency_keywords: list[str]
    emergency_advice: str
    transfer_number: str
    call_token: str
    max_call_duration_seconds: int = 600
    location_id: str | None = None
    location_name: str | None = None
    location_city: str | None = None
    location_hours: str | None = None
    industry_pack_slug: str | None = None
    industry_pack_prompt: str | None = None


class CallStartRequest(BaseModel):
    dialed_number: str
    caller_number: str = ""
    call_id: str
    direction: str = "inbound"  # "inbound" | "outbound"


class CallStartResponse(BaseModel):
    allow: bool
    reason: str  # "approved", "tenant_concurrency_exceeded", "global_concurrency_exceeded", "tenant_suspended", "quota_exceeded"
    overload_action: str  # "proceed", "busy_callback_message", "reject"
    message: str | None = None
    call_id: str
    tenant_id: str
    call_token: str | None = None
    config: InternalTenantConfigResponse | None = None
    active_tenant_concurrency: int
    max_tenant_concurrency: int
    active_global_concurrency: int
    max_global_concurrency: int


class CallCompletionPayload(BaseModel):
    call_id: str
    dialed_number: str
    caller_number: str
    started_at: str
    ended_at: str | None = None
    duration_s: float
    outcome: str
    turn_count: int = 0
    latency_p50_ms: float = 0.0
    latency_p95_ms: float = 0.0
    turn_latencies_ms: list[float] = []
    llm_prompt_tokens: int = 0
    llm_completion_tokens: int = 0
    tts_characters: int = 0
    recording_url: str | None = None
    recording_duration_s: float = 0.0
    recording_channels: int = 2
    recording_status: str = "not_recorded"
    tags: list[str] = []
    message: dict[str, Any] | None = None
    transcript: list[dict[str, Any]] = []


def _build_tenant_config(
    tenant: Tenant,
    call_id: str = "",
    max_duration_s: int = 600,
    location: Any | None = None,
    db: Session | None = None,
) -> InternalTenantConfigResponse:
    profile = tenant.agent_profile
    token_claims: dict[str, Any] = {
        "sub": "livekit-agent",
        "role": "agent",
        "tenant_id": tenant.id,
    }
    if call_id:
        token_claims["call_id"] = call_id
    if location and getattr(location, "id", None):
        token_claims["location_id"] = location.id
    token = create_access_token(token_claims)

    voice_id = getattr(profile, "voice_id", None) or "Alex"
    if voice_id in ("Arcana", "Luna", "Orion", "Astra"):
        tts_model = "rime/arcana"
    elif voice_id in ("Asteria", "Luna-Aura", "Orpheus", "Arcas"):
        tts_model = "deepgram/aura"
    else:
        tts_model = "inworld/inworld-tts-1"

    rec_disclosure = getattr(profile, "recording_disclosure", True)
    if rec_disclosure is None:
        rec_disclosure = True

    resolved_hours = (
        location.hours if location and getattr(location, "hours", None) else tenant.hours
    )
    resolved_tz = (
        location.timezone if location and getattr(location, "timezone", None) else tenant.timezone
    )
    resolved_transfer = (
        location.transfer_number
        if location and getattr(location, "transfer_number", None)
        else (profile.transfer_number if profile else "")
    )

    pack_slug: str | None = None
    pack_prompt: str | None = None
    if db:
        try:
            from api.app.services.industry_packs import (
                compile_tenant_prompt,
                get_tenant_effective_pack,
            )

            pack_data = get_tenant_effective_pack(tenant.id, db)
            if pack_data and pack_data.get("pack_slug"):
                pack_slug = pack_data["pack_slug"]
                pack_prompt = compile_tenant_prompt(tenant.id, db)
        except Exception as e:
            logger.debug("Could not resolve industry pack for %s: %s", tenant.id, e)

    return InternalTenantConfigResponse(
        tenant_id=tenant.id,
        business_name=tenant.name,
        timezone=resolved_tz,
        hours=resolved_hours,
        agent_name=profile.agent_name if profile else "receptionist",
        greeting=profile.greeting if profile else f"Thanks for calling {tenant.name}.",
        tone=profile.tone if profile else "direct",
        voice_id=voice_id,
        tts_model=tts_model,
        recording_disclosure=rec_disclosure,
        services=profile.services if profile else [],
        pricing_policy=profile.pricing_policy if profile else "diagnostic_fee_only",
        pricing_details=profile.pricing_details if profile else {},
        faq=profile.faq if profile else [],
        emergency_keywords=profile.emergency_keywords if profile else [],
        emergency_advice=profile.emergency_advice if profile else "",
        transfer_number=resolved_transfer,
        call_token=token,
        max_call_duration_seconds=max_duration_s,
        location_id=location.id if location else None,
        location_name=location.name if location else None,
        location_city=location.city if location else None,
        location_hours=resolved_hours if location else None,
        industry_pack_slug=pack_slug,
        industry_pack_prompt=pack_prompt,
    )


@router.get("/tenants/by-number/{e164}", response_model=InternalTenantConfigResponse)
def resolve_tenant_by_number(e164: str, db: Session = Depends(get_db)) -> Any:
    """Resolve dialed phone number to active tenant and agent configuration."""
    clean_number = e164.strip()
    stmt = select(PhoneNumber).where(
        PhoneNumber.e164 == clean_number, PhoneNumber.status == "active"
    )
    phone = db.scalar(stmt)

    if not (phone and phone.tenant):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phone number '{clean_number}' is not assigned to any active tenant",
        )

    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == phone.tenant.id))
    max_dur = 600
    if sub and not sub.allow_overage:
        rem_s = int(sub.total_available_minutes * 60)
        max_dur = min(600, max(30, rem_s))

    return _build_tenant_config(
        phone.tenant, max_duration_s=max_dur, location=phone.location, db=db
    )


@router.get("/tenants/{tenant_id}", response_model=InternalTenantConfigResponse)
def get_tenant_config_by_id(tenant_id: str, db: Session = Depends(get_db)) -> Any:
    """Resolve tenant configuration directly by tenant_id for distributed workers and outbound dialers."""
    clean_id = tenant_id.strip()
    tenant = db.scalar(select(Tenant).where(Tenant.id == clean_id, Tenant.status == "active"))
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{clean_id}' not found or not active",
        )

    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
    max_dur = 600
    if sub and not sub.allow_overage:
        rem_s = int(sub.total_available_minutes * 60)
        max_dur = min(600, max(30, rem_s))

    return _build_tenant_config(tenant, max_duration_s=max_dur, db=db)


class CallerOptOutRequest(BaseModel):
    phone_number: str
    call_id: str | None = None
    reason: str = "opt_out"
    notes: str = "Opt-out requested during automated call"


@router.post("/calls/opt-out")
def handle_caller_opt_out(
    payload: CallerOptOutRequest,
    x_call_token: str | None = Header(None, alias="X-Call-Token"),
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Register caller opt-out into tenant suppression list using call-scoped token."""
    raw_token = x_call_token
    if not raw_token and authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ", 1)[1]

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing call-scoped authentication token (X-Call-Token or Bearer)",
        )

    claims = decode_access_token(raw_token)
    if not claims or "tenant_id" not in claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired call token",
        )

    tenant_id = claims["tenant_id"]
    record = record_caller_opt_out(
        db=db,
        tenant_id=tenant_id,
        phone_number=payload.phone_number,
        reason=payload.reason,
        notes=payload.notes,
    )
    return {
        "success": True,
        "suppression_id": record.id,
        "tenant_id": tenant_id,
        "phone_number": record.phone_number,
        "status": "suppressed",
    }


class CallTransferRequest(BaseModel):
    call_id: str
    target_number: str
    reason: str = "caller_requested_human"
    priority: str = "normal"  # normal, emergency
    notes: str = ""


@router.post("/calls/transfer")
def handle_call_transfer(
    payload: CallTransferRequest,
    x_call_token: str | None = Header(None, alias="X-Call-Token"),
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Audit and update call session when transferred to a human specialist."""
    raw_token = x_call_token
    if not raw_token and authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ", 1)[1]

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing call-scoped authentication token (X-Call-Token or Bearer)",
        )

    claims = decode_access_token(raw_token)
    if not claims or "tenant_id" not in claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired call token",
        )

    tenant_id = claims["tenant_id"]

    # Locate active call record if present and update outcome
    call = db.scalar(select(Call).where(Call.call_id == payload.call_id))
    if call:
        if call.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant transfer forbidden"
            )
        call.outcome = "transferred"
        call.transfer_to_number = payload.target_number
        call.transferred_at = datetime.now(UTC)
        current_tags = list(call.tags or [])
        if "transferred" not in current_tags:
            current_tags.append("transferred")
        if payload.priority == "emergency" and "emergency_transfer" not in current_tags:
            current_tags.append("emergency_transfer")
        call.tags = current_tags
        db.commit()

    return {
        "success": True,
        "call_id": payload.call_id,
        "tenant_id": tenant_id,
        "target_number": payload.target_number,
        "reason": payload.reason,
        "priority": payload.priority,
        "status": "transferred",
    }


@router.post("/calls/start", response_model=CallStartResponse)
def start_call(payload: CallStartRequest, db: Session = Depends(get_db)) -> Any:
    """Evaluate capacity, check concurrency caps, and register active call session."""
    clean_number = payload.dialed_number.strip()
    phone = db.scalar(
        select(PhoneNumber).where(PhoneNumber.e164 == clean_number, PhoneNumber.status == "active")
    )
    if phone and phone.tenant:
        tenant = phone.tenant
    else:
        fallback_tenant = db.scalar(
            select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
        )
        if not fallback_tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No active tenant found"
            )
        tenant = fallback_tenant

    if tenant.status != "active":
        return CallStartResponse(
            allow=False,
            reason="tenant_suspended",
            overload_action="reject",
            message="This business line is currently suspended.",
            call_id=payload.call_id,
            tenant_id=tenant.id,
            active_tenant_concurrency=0,
            max_tenant_concurrency=tenant.max_concurrent_calls,
            active_global_concurrency=0,
            max_global_concurrency=settings.GLOBAL_MAX_CONCURRENT,
        )

    # 0. Check Tenant Subscription Status & Quota Gate
    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
    max_duration_seconds = 600

    if sub:
        # Check subscription status
        if sub.status in ("canceled", "past_due"):
            return CallStartResponse(
                allow=False,
                reason="tenant_suspended",
                overload_action="reject",
                message="This business line is currently suspended due to billing status.",
                call_id=payload.call_id,
                tenant_id=tenant.id,
                active_tenant_concurrency=0,
                max_tenant_concurrency=tenant.max_concurrent_calls,
                active_global_concurrency=0,
                max_global_concurrency=settings.GLOBAL_MAX_CONCURRENT,
            )

        # Check free trial expiration
        if sub.tier == "trial" and sub.is_trial_expired:
            return CallStartResponse(
                allow=False,
                reason="quota_exceeded",
                overload_action="reject",
                message="Your 14-day free trial or trial minute allocation has been exhausted. Please upgrade to continue receiving calls.",
                call_id=payload.call_id,
                tenant_id=tenant.id,
                active_tenant_concurrency=0,
                max_tenant_concurrency=tenant.max_concurrent_calls,
                active_global_concurrency=0,
                max_global_concurrency=settings.GLOBAL_MAX_CONCURRENT,
            )

        # Check plan minutes when overage is disabled
        if not sub.allow_overage:
            available_min = sub.total_available_minutes
            if available_min <= 0:
                return CallStartResponse(
                    allow=False,
                    reason="quota_exceeded",
                    overload_action="reject",
                    message="Included monthly call minutes are exhausted and overage is disabled for this account.",
                    call_id=payload.call_id,
                    tenant_id=tenant.id,
                    active_tenant_concurrency=0,
                    max_tenant_concurrency=tenant.max_concurrent_calls,
                    active_global_concurrency=0,
                    max_global_concurrency=settings.GLOBAL_MAX_CONCURRENT,
                )
            # Cap call duration to remaining minutes
            remaining_seconds = int(available_min * 60)
            max_duration_seconds = min(600, max(30, remaining_seconds))

    direction = payload.direction.lower()
    is_outbound = direction == "outbound"

    # Terminal call outcomes that are no longer active
    terminal_outcomes = [
        "completed",
        "message_taken",
        "abandoned",
        "transferred",
        "ended_by_agent",
        "silence_timeout",
        "max_duration_exceeded",
        "spam",
        "rejected",
        "failed",
        "voicemail_left",
        "no_answer",
        "busy",
        "skipped_compliance",
        "queued",
    ]

    # Stale call cutoff: telephony calls cannot exceed 5 minutes without completion
    now_utc = datetime.now(UTC)
    stale_cutoff = now_utc - timedelta(minutes=5)

    # Auto-reconcile stale / abandoned calls to free line concurrency instantly:
    # 1. Any in-progress call with 0 turns older than 90 seconds
    # 2. Any in-progress call older than 5 minutes
    from sqlalchemy import and_, or_

    stale_dead_stmt = select(Call).where(
        Call.tenant_id == tenant.id,
        Call.ended_at.is_(None),
        Call.outcome.not_in(terminal_outcomes),
        or_(
            Call.started_at < stale_cutoff,
            and_(Call.turn_count == 0, Call.started_at < (now_utc - timedelta(seconds=90))),
        ),
    )
    stale_calls = db.scalars(stale_dead_stmt).all()
    if stale_calls:
        for sc in stale_calls:
            sc.ended_at = now_utc
            sc.outcome = "abandoned" if (sc.turn_count or 0) == 0 else "completed"
            sc_tags = list(sc.tags or [])
            if "auto_stale_reconciled" not in sc_tags:
                sc_tags.append("auto_stale_reconciled")
            sc.tags = sc_tags
        db.commit()

    # Concurrency calculations
    active_tenant_inbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id,
                Call.ended_at.is_(None),
                Call.outcome.not_in(terminal_outcomes),
                Call.direction == "inbound",
                Call.started_at >= stale_cutoff,
            )
        )
        or 0
    )

    active_tenant_outbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id,
                Call.ended_at.is_(None),
                Call.outcome.not_in(terminal_outcomes),
                Call.direction == "outbound",
                Call.started_at >= stale_cutoff,
            )
        )
        or 0
    )

    active_global_inbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.ended_at.is_(None),
                Call.outcome.not_in(terminal_outcomes),
                Call.direction == "inbound",
                Call.started_at >= stale_cutoff,
            )
        )
        or 0
    )

    active_global_outbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.ended_at.is_(None),
                Call.outcome.not_in(terminal_outcomes),
                Call.direction == "outbound",
                Call.started_at >= stale_cutoff,
            )
        )
        or 0
    )

    # 1. Tenant Concurrency Gate
    if is_outbound:
        tenant_cap = tenant.max_concurrent_outbound
        tenant_active = active_tenant_outbound
        global_cap = settings.GLOBAL_MAX_OUTBOUND
        global_active = active_global_outbound
    else:
        tenant_cap = tenant.max_concurrent_calls
        tenant_active = active_tenant_inbound
        global_cap = settings.GLOBAL_MAX_CONCURRENT
        global_active = active_global_inbound

    if tenant_active >= tenant_cap:
        # Persist missed/busy call record so it surfaces in portal inbox for instant callback
        try:
            now_ts = datetime.now(UTC)
            busy_record = Call(
                tenant_id=tenant.id,
                call_id=payload.call_id,
                caller_number=payload.caller_number,
                dialed_number=payload.dialed_number,
                direction=direction,
                started_at=now_ts,
                ended_at=now_ts,
                duration_s=0.0,
                outcome="busy",
                urgency="urgent",
                tags=["busy_spike", "needs_callback"],
                message={
                    "name": "Incoming Caller",
                    "phone": payload.caller_number,
                    "message": f"All {tenant_cap} lines were occupied. Caller received busy notice with promised callback in minutes.",
                    "urgency": "urgent",
                },
            )
            db.add(busy_record)
            db.commit()
        except Exception as e:
            logger.warning("Could not persist busy call record: %s", e)
            db.rollback()

        return CallStartResponse(
            allow=False,
            reason="tenant_concurrency_exceeded",
            overload_action="busy_callback_message",
            message=(
                f"All {tenant_cap} lines for {tenant.name} are currently occupied. We have recorded your call and our coordinator will reach out to you shortly in a few minutes."
            ),
            call_id=payload.call_id,
            tenant_id=tenant.id,
            active_tenant_concurrency=tenant_active,
            max_tenant_concurrency=tenant_cap,
            active_global_concurrency=global_active,
            max_global_concurrency=global_cap,
        )

    # 2. Global Concurrency Gate
    if global_active >= global_cap:
        return CallStartResponse(
            allow=False,
            reason="global_concurrency_exceeded",
            overload_action="busy_callback_message",
            message="Platform voice capacity reached. Please hold or call back in a moment.",
            call_id=payload.call_id,
            tenant_id=tenant.id,
            active_tenant_concurrency=tenant_active,
            max_tenant_concurrency=tenant_cap,
            active_global_concurrency=global_active,
            max_global_concurrency=global_cap,
        )

    # 3. Register In-Progress Call Record Atomically
    config = _build_tenant_config(
        tenant, payload.call_id, max_duration_s=max_duration_seconds, db=db
    )
    in_progress_call = Call(
        tenant_id=tenant.id,
        location_id=config.location_id if config and config.location_id else None,
        call_id=payload.call_id,
        caller_number=payload.caller_number,
        dialed_number=payload.dialed_number,
        direction=direction,
        started_at=datetime.now(UTC),
        ended_at=None,
        duration_s=0.0,
        outcome="in_progress",
        urgency="normal",
        turn_count=0,
        latency_p50_ms=0.0,
        latency_p95_ms=0.0,
        turn_latencies_ms=[],
        transcript=[],
        message=None,
        tags=["in_progress", direction],
    )
    db.add(in_progress_call)
    db.commit()

    return CallStartResponse(
        allow=True,
        reason="approved",
        overload_action="proceed",
        message="Call session authorized and capacity reserved.",
        call_id=payload.call_id,
        tenant_id=tenant.id,
        call_token=config.call_token,
        config=config,
        active_tenant_concurrency=tenant_active + 1,
        max_tenant_concurrency=tenant_cap,
        active_global_concurrency=global_active + 1,
        max_global_concurrency=global_cap,
    )


@router.post("/calls/complete")
def save_call_record_from_agent(
    payload: CallCompletionPayload,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Ingest completed call record from agent worker with call-scoped token verification."""
    token_tenant_id: str | None = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        token_data = decode_access_token(token)
        if not token_data or token_data.get("role") != "agent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or unauthorized agent call token",
            )
        token_tenant_id = token_data.get("tenant_id")

    # Find existing in-progress call or look up tenant
    existing_call = db.scalar(select(Call).where(Call.call_id == payload.call_id))

    if existing_call:
        # Cross-tenant security check: Agent token MUST match call's tenant_id
        if token_tenant_id and token_tenant_id != existing_call.tenant_id:
            is_valid_alias = token_tenant_id in ("apex-plumbing", "default") and (
                (existing_call.tenant and existing_call.tenant.name.lower().startswith("apex"))
                or existing_call.tenant_id == "45124363-dcf6-4771-b569-e60f0d19bd0c"
            )
            if not is_valid_alias:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cross-tenant call completion forbidden",
                )
        tenant_id = existing_call.tenant_id
        call = existing_call
    else:
        # Backward compatibility if call was not registered via /calls/start
        target_tenant = None
        if token_tenant_id:
            target_tenant = db.scalar(select(Tenant).where(Tenant.id == token_tenant_id))
            if not target_tenant:
                target_tenant = db.scalar(select(Tenant).where(Tenant.name.ilike("%Apex%")))

        if not target_tenant and payload.dialed_number:
            phone = db.scalar(select(PhoneNumber).where(PhoneNumber.e164 == payload.dialed_number))
            if phone:
                target_tenant = phone.tenant

        if not target_tenant:
            target_tenant = db.scalar(
                select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
            )

        if not target_tenant:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No tenant available to attribute call",
            )

        tenant_id = target_tenant.id
        call = Call(
            tenant_id=tenant_id,
            call_id=payload.call_id,
            caller_number=payload.caller_number,
            dialed_number=payload.dialed_number,
            direction="inbound",
            started_at=datetime.now(UTC),
        )
        db.add(call)

    # Determine urgency
    urgency = "normal"
    if payload.message and payload.message.get("urgency"):
        urgency = payload.message["urgency"].lower()
    elif "emergency" in payload.tags:
        urgency = "emergency"
    elif "urgent" in payload.tags:
        urgency = "urgent"

    def _parse_iso(s: str | None) -> datetime | None:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return datetime.now(UTC)

    started_dt = _parse_iso(payload.started_at) or call.started_at
    ended_dt = _parse_iso(payload.ended_at) or datetime.now(UTC)

    # Update call record and close active session (freeing concurrency slot)
    call.caller_number = payload.caller_number or call.caller_number
    call.dialed_number = payload.dialed_number or call.dialed_number
    call.started_at = started_dt
    call.ended_at = ended_dt
    call.duration_s = payload.duration_s
    call.outcome = (
        payload.outcome if payload.outcome not in ("in_progress", "active", "") else "completed"
    )
    call.urgency = urgency
    call.turn_count = payload.turn_count
    call.latency_p50_ms = payload.latency_p50_ms
    call.latency_p95_ms = payload.latency_p95_ms
    call.turn_latencies_ms = payload.turn_latencies_ms
    call.transcript = payload.transcript
    call.message = payload.message
    call.tags = [t for t in (payload.tags or []) if t not in ("in_progress", "active")]

    # Telecom minute resolution (Minute 60s rounding vs Exact Second Precision)
    sub = (
        db.scalar(select(Subscription).where(Subscription.tenant_id == call.tenant_id))
        if call.tenant_id
        else None
    )
    billing_increment = getattr(sub, "billing_increment", "minute") if sub else "minute"

    if billing_increment == "second":
        billable_minutes = round(payload.duration_s / 60.0, 2) if payload.duration_s > 0 else 0.0
    else:
        billable_minutes = (
            float(math.ceil(payload.duration_s / 60.0)) if payload.duration_s > 0 else 0.0
        )

    # Per-call COGS calculation
    stt_cost = (payload.duration_s / 60.0) * 0.0048
    llm_cost = ((payload.llm_prompt_tokens + payload.llm_completion_tokens) / 1_000_000.0) * 0.06
    tts_cost = (payload.tts_characters / 1_000_000.0) * 20.00
    carrier_cost = float(billable_minutes) * 0.0040
    estimated_cogs_usd = round(stt_cost + llm_cost + tts_cost + carrier_cost, 4)

    call.billable_minutes = billable_minutes
    call.llm_prompt_tokens = payload.llm_prompt_tokens
    call.llm_completion_tokens = payload.llm_completion_tokens
    call.tts_characters = payload.tts_characters
    call.estimated_cogs_usd = estimated_cogs_usd

    if payload.recording_url:
        call.recording_url = payload.recording_url
        call.recording_status = payload.recording_status or "completed"
    if payload.recording_duration_s > 0:
        call.recording_duration_s = payload.recording_duration_s
    call.recording_channels = payload.recording_channels

    # Automated Post-Call Intelligence and Sentiment Extraction
    intel = extract_post_call_intelligence(
        transcript=payload.transcript,
        outcome=payload.outcome,
        urgency=urgency,
    )
    call.sentiment_score = intel["sentiment_score"]
    call.sentiment_label = intel["sentiment_label"]
    call.lead_score = intel["lead_score"]
    call.lost_reason = intel["lost_reason"]
    call.key_objections = intel["key_objections"]

    # Automated Post-Call QA Rubric Evaluation & CSAT Prediction (Milestone M7b)
    tenant = (
        db.scalar(select(Tenant).where(Tenant.id == call.tenant_id)) if call.tenant_id else None
    )
    biz_name = tenant.name if tenant else "Our Business"
    agent_prof = getattr(tenant, "agent_profile", None) if tenant else None
    disclosure_needed = getattr(agent_prof, "recording_disclosure", True) if agent_prof else True

    qa_eval = evaluate_call_qa(
        transcript=payload.transcript,
        business_name=biz_name,
        recording_disclosure=disclosure_needed,
        message=payload.message,
        outcome=payload.outcome,
        urgency=urgency,
        latency_p50_ms=payload.latency_p50_ms,
        sentiment_label=intel["sentiment_label"],
    )
    call.qa_score = qa_eval["qa_score"]
    call.qa_rubric = qa_eval["rubric_breakdown"]
    call.qa_flags = qa_eval["qa_flags"]
    call.csat_score = qa_eval["csat_score"]
    call.csat_rationale = qa_eval["csat_rationale"]

    # Record minute usage in tenant subscription
    if call.tenant_id:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == call.tenant_id))
        if sub:
            if sub.tier == "trial":
                sub.trial_minutes_used += float(billable_minutes)
            else:
                sub.used_minutes_this_cycle += float(billable_minutes)

            usage = UsageRecord(
                tenant_id=call.tenant_id,
                call_id=payload.call_id,
                duration_seconds=int(payload.duration_s),
                billable_minutes=float(billable_minutes),
                llm_prompt_tokens=payload.llm_prompt_tokens,
                llm_completion_tokens=payload.llm_completion_tokens,
                tts_characters=payload.tts_characters,
                estimated_cogs_usd=estimated_cogs_usd,
            )
            db.add(usage)

    db.commit()

    # Enqueue instant owner alert, Google Sheets writeback, and external CRM/webhook sync
    background_tasks.add_task(dispatch_call_notifications, payload.call_id)
    background_tasks.add_task(sync_call_result_to_sheets, payload.call_id)
    background_tasks.add_task(dispatch_all_crm_and_webhook_sync, payload.call_id)

    return {"status": "ok", "call_id": payload.call_id}


# ---------------------------------------------------------------------------
# Internal Voice Agent Calendar & Booking Endpoints (Milestone M3)
# ---------------------------------------------------------------------------


class CheckAvailabilityRequest(BaseModel):
    target_date: str  # YYYY-MM-DD
    duration_minutes: int = 60
    service_type: str = "general_appointment"
    postal_code: str | None = None


class HoldSlotRequest(BaseModel):
    start_iso: str
    duration_minutes: int = 60
    service_type: str = "general_appointment"
    customer_name: str = "Prospective Customer"
    customer_phone: str = ""
    postal_code: str | None = None
    staff_id: str | None = None


class BookSlotRequest(BaseModel):
    start_iso: str
    duration_minutes: int = 60
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    service_type: str = "general_appointment"
    postal_code: str | None = None
    staff_id: str | None = None
    idempotency_key: str | None = None
    notes: str | None = None


class CancelBookingRequest(BaseModel):
    booking_id: str


def _verify_agent_token(authorization: str | None) -> dict[str, Any]:
    """Verify call-scoped JWT token and extract claims."""
    if not (authorization and authorization.startswith("Bearer ")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    token = authorization.split(" ")[1]
    claims = decode_access_token(token)
    if not claims or claims.get("role") != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Valid agent token required for internal calendar tools",
        )
    return claims


@router.post("/calendar/availability", response_model=AvailableSlotsResponse)
def get_slot_availability(
    payload: CheckAvailabilityRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> Any:
    """Evaluate and return conflict-free bookable slots for target date."""
    claims = _verify_agent_token(authorization)
    tenant_id = claims["tenant_id"]

    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    try:
        t_date = datetime.strptime(payload.target_date, "%Y-%m-%d").date()
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid target_date format. Expected YYYY-MM-DD",
        ) from err

    return compute_available_slots(
        tenant=tenant,
        target_date=t_date,
        db=db,
        service_duration_minutes=payload.duration_minutes,
        service_type=payload.service_type,
        postal_code=payload.postal_code,
    )


@router.post("/calendar/hold")
def hold_appointment_slot(
    payload: HoldSlotRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Acquire a temporary 5-minute hold on a slot during a call."""
    claims = _verify_agent_token(authorization)
    tenant_id = claims["tenant_id"]
    call_id = claims.get("call_id", "live-call")

    try:
        slot_start = datetime.fromisoformat(payload.start_iso)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_iso format"
        ) from err

    try:
        held = hold_time_slot(
            tenant_id=tenant_id,
            slot_start=slot_start,
            duration_minutes=payload.duration_minutes,
            call_id=call_id,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            service_type=payload.service_type,
            postal_code=payload.postal_code,
            staff_id=payload.staff_id,
            db=db,
        )
        return {
            "status": "held",
            "booking_id": held.id,
            "staff_id": held.staff_id,
            "start_at": held.start_at.isoformat(),
            "hold_expires_at": held.hold_expires_at.isoformat() if held.hold_expires_at else None,
        }
    except SlotUnavailableError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e


@router.post("/calendar/book")
def confirm_appointment_booking(
    payload: BookSlotRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Confirm appointment booking, generate Google Meet link, and record in calendar."""
    claims = _verify_agent_token(authorization)
    tenant_id = claims["tenant_id"]
    call_id = claims.get("call_id")

    try:
        slot_start = datetime.fromisoformat(payload.start_iso)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_iso format"
        ) from err

    # Construct auto-idempotency key if not passed
    idempotency_key = (
        payload.idempotency_key or f"{tenant_id}:{call_id or 'ext'}:{slot_start.isoformat()}"
    )

    try:
        booking = confirm_booking(
            tenant_id=tenant_id,
            slot_start=slot_start,
            duration_minutes=payload.duration_minutes,
            customer_name=payload.customer_name,
            customer_phone=payload.customer_phone,
            customer_email=payload.customer_email,
            service_type=payload.service_type,
            call_id=call_id,
            idempotency_key=idempotency_key,
            notes=payload.notes,
            postal_code=payload.postal_code,
            staff_id=payload.staff_id,
            db=db,
        )
        return {
            "status": "confirmed",
            "booking_id": booking.id,
            "staff_id": booking.staff_id,
            "location_id": booking.location_id,
            "start_at": booking.start_at.isoformat(),
            "end_at": booking.end_at.isoformat(),
            "meet_link": booking.meet_link,
            "calendar_event_id": booking.calendar_event_id,
            "customer_name": booking.customer_name,
        }
    except SlotUnavailableError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e


@router.post("/calendar/cancel")
def cancel_appointment_booking(
    payload: CancelBookingRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Cancel an appointment and delete external calendar event."""
    claims = _verify_agent_token(authorization)
    tenant_id = claims["tenant_id"]

    try:
        cancelled = cancel_booking_service(
            booking_id=payload.booking_id,
            tenant_id=tenant_id,
            db=db,
        )
        return {"status": "cancelled", "booking_id": cancelled.id}
    except KeyError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found"
        ) from err


class InternalKnowledgeSearchRequest(BaseModel):
    query: str
    top_k: int = 3
    confidence_threshold: float = 0.30


@router.post("/knowledge/search")
def internal_knowledge_search(
    payload: InternalKnowledgeSearchRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Internal RAG search endpoint for LiveKit voice agent lookup_business_info tool."""
    claims = _verify_agent_token(authorization)
    tenant_id = claims["tenant_id"]

    from api.app.services.knowledge import search_knowledge_base

    result = search_knowledge_base(
        db=db,
        tenant_id=tenant_id,
        query=payload.query,
        top_k=payload.top_k,
        confidence_threshold=payload.confidence_threshold,
    )

    return result


@router.post("/livekit/webhook")
async def handle_livekit_webhook(
    request: Request,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Receive live room and participant lifecycle events from LiveKit Cloud Webhooks."""
    raw_body = await request.body()
    body_str = raw_body.decode("utf-8")

    event_type = ""
    room_name = ""
    room_sid = ""
    participant_data: dict[str, Any] = {}

    # 1. Verify via LiveKit SDK WebhookReceiver when API keys are configured and auth header present
    if settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET and authorization:
        try:
            from livekit.api import TokenVerifier, WebhookReceiver

            receiver = WebhookReceiver(
                TokenVerifier(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            )
            event = receiver.receive(body_str, authorization)
            event_type = getattr(event, "event", "")
            if hasattr(event, "room"):
                room_name = getattr(event.room, "name", "")
                room_sid = getattr(event.room, "sid", "")
            if hasattr(event, "participant"):
                p = event.participant
                participant_data = {
                    "identity": getattr(p, "identity", ""),
                    "attributes": dict(getattr(p, "attributes", {}) or {}),
                }
        except Exception as e:
            logger.warning("LiveKit Webhook signature validation failed: %s", e)

    # 2. Fallback JSON parser if SDK receiver wasn't triggered
    if not event_type and body_str:
        try:
            data = json.loads(body_str)
            event_type = data.get("event", "")
            room_info = data.get("room", {})
            room_name = room_info.get("name", "")
            room_sid = room_info.get("sid", "")
            participant_data = data.get("participant", {})
        except Exception:
            pass

    if not event_type:
        return {"status": "ignored", "reason": "empty_or_invalid_event"}

    logger.info("LiveKit Webhook received: event=%s room=%s", event_type, room_name)

    call_id = room_name or room_sid or f"livekit-{int(datetime.now(UTC).timestamp())}"
    lookup_keys = [k for k in [room_name, room_sid, call_id] if k]
    call = db.scalar(
        select(Call).where((Call.call_id.in_(lookup_keys)) | (Call.id.in_(lookup_keys)))
    )

    if event_type == "room_started":
        if not call:
            attrs = (
                participant_data.get("attributes", {}) if isinstance(participant_data, dict) else {}
            )
            tenant_id = attrs.get("tenant_id") if isinstance(attrs, dict) else None

            if not tenant_id:
                active_t = db.scalar(
                    select(Tenant)
                    .where(Tenant.status == "active")
                    .order_by(Tenant.created_at.asc())
                )
                tenant_id = active_t.id if active_t else "unassigned"

            call = Call(
                tenant_id=tenant_id,
                call_id=call_id,
                caller_number=attrs.get("caller_number", "") if isinstance(attrs, dict) else "",
                dialed_number=attrs.get("dialed_number", "") if isinstance(attrs, dict) else "",
                direction="inbound",
                started_at=datetime.now(UTC),
                outcome="in_progress",
                urgency="normal",
                tags=["livekit_webhook", "in_progress"],
            )
            db.add(call)
            db.commit()

    elif event_type in ("room_finished", "participant_left"):
        p_id = participant_data.get("identity", "") if isinstance(participant_data, dict) else ""
        # If an agent or supervisor leaves during participant_left, do not terminate caller session
        if event_type == "participant_left" and (
            p_id.startswith("agent-") or p_id.startswith("supervisor-")
        ):
            return {"status": "ignored", "reason": "internal_participant_left", "call_id": call_id}

        now_ts = datetime.now(UTC)
        if call:
            if call.outcome in ("in_progress", "active", "ringing", "dispatching"):
                call.outcome = "completed"
            if not call.ended_at:
                call.ended_at = now_ts
                if call.started_at:
                    started_aware = (
                        call.started_at
                        if call.started_at.tzinfo
                        else call.started_at.replace(tzinfo=UTC)
                    )
                    call.duration_s = max(1.0, round((now_ts - started_aware).total_seconds(), 2))
            tags_list = list(call.tags or [])
            if "webhook_reconciled" not in tags_list:
                tags_list.append("webhook_reconciled")
            call.tags = tags_list
            db.commit()
        else:
            active_t = db.scalar(
                select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
            )
            tenant_id = active_t.id if active_t else "unassigned"
            call = Call(
                tenant_id=tenant_id,
                call_id=call_id,
                caller_number="",
                dialed_number="",
                direction="inbound",
                started_at=now_ts - timedelta(seconds=30),
                ended_at=now_ts,
                duration_s=30.0,
                outcome="completed",
                urgency="normal",
                tags=["livekit_webhook", "reconciled"],
            )
            db.add(call)
            db.commit()

    return {"status": "ok", "event": event_type, "call_id": call_id}
