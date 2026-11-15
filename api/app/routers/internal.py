"""Internal endpoints dedicated to LiveKit Voice Agent worker."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
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
from api.app.services.notifier import dispatch_call_notifications

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
    tags: list[str] = []
    message: dict[str, Any] | None = None
    transcript: list[dict[str, Any]] = []


def _build_tenant_config(tenant: Tenant, call_id: str = "") -> InternalTenantConfigResponse:
    profile = tenant.agent_profile
    token_claims: dict[str, Any] = {
        "sub": "livekit-agent",
        "role": "agent",
        "tenant_id": tenant.id,
    }
    if call_id:
        token_claims["call_id"] = call_id
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

    return InternalTenantConfigResponse(
        tenant_id=tenant.id,
        business_name=tenant.name,
        timezone=tenant.timezone,
        hours=tenant.hours,
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
        transfer_number=profile.transfer_number if profile else "",
        call_token=token,
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

    return _build_tenant_config(phone.tenant)


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

    direction = payload.direction.lower()
    is_outbound = direction == "outbound"

    # Concurrency calculations
    active_tenant_inbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id,
                Call.ended_at.is_(None),
                Call.direction == "inbound",
            )
        )
        or 0
    )

    active_tenant_outbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id,
                Call.ended_at.is_(None),
                Call.direction == "outbound",
            )
        )
        or 0
    )

    active_global_inbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.ended_at.is_(None),
                Call.direction == "inbound",
            )
        )
        or 0
    )

    active_global_outbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.ended_at.is_(None),
                Call.direction == "outbound",
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
        return CallStartResponse(
            allow=False,
            reason="tenant_concurrency_exceeded",
            overload_action="busy_callback_message",
            message=(
                f"All {tenant_cap} lines for {tenant.name} are currently occupied. We will call you back shortly."
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
    config = _build_tenant_config(tenant, payload.call_id)
    in_progress_call = Call(
        tenant_id=tenant.id,
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
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cross-tenant call completion forbidden",
            )
        tenant_id = existing_call.tenant_id
        call = existing_call
    else:
        # Backward compatibility if call was not registered via /calls/start
        tenant_id = None
        if token_tenant_id:
            tenant_id = token_tenant_id
        elif payload.dialed_number:
            phone = db.scalar(select(PhoneNumber).where(PhoneNumber.e164 == payload.dialed_number))
            if phone:
                tenant_id = phone.tenant_id

        if not tenant_id:
            fallback = db.scalar(
                select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
            )
            if fallback:
                tenant_id = fallback.id
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No tenant available to attribute call",
                )

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
    call.outcome = payload.outcome
    call.urgency = urgency
    call.turn_count = payload.turn_count
    call.latency_p50_ms = payload.latency_p50_ms
    call.latency_p95_ms = payload.latency_p95_ms
    call.turn_latencies_ms = payload.turn_latencies_ms
    call.transcript = payload.transcript
    call.message = payload.message
    call.tags = [t for t in payload.tags if t != "in_progress"]

    # Record minute usage in tenant subscription
    if call.tenant_id:
        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == call.tenant_id))
        if sub:
            billable_minutes = round(max(0.1, payload.duration_s / 60.0), 2)
            if sub.tier == "trial":
                sub.trial_minutes_used += billable_minutes
            else:
                sub.used_minutes_this_cycle += billable_minutes

            usage = UsageRecord(
                tenant_id=call.tenant_id,
                call_id=payload.call_id,
                duration_seconds=int(payload.duration_s),
                billable_minutes=billable_minutes,
            )
            db.add(usage)

    db.commit()

    # Enqueue instant owner alert (Email/SMS) as an asynchronous background task
    background_tasks.add_task(dispatch_call_notifications, payload.call_id)

    return {"status": "ok", "call_id": payload.call_id}


# ---------------------------------------------------------------------------
# Internal Voice Agent Calendar & Booking Endpoints (Milestone M3)
# ---------------------------------------------------------------------------


class CheckAvailabilityRequest(BaseModel):
    target_date: str  # YYYY-MM-DD
    duration_minutes: int = 60
    service_type: str = "general_appointment"


class HoldSlotRequest(BaseModel):
    start_iso: str
    duration_minutes: int = 60
    service_type: str = "general_appointment"
    customer_name: str = "Prospective Customer"
    customer_phone: str = ""


class BookSlotRequest(BaseModel):
    start_iso: str
    duration_minutes: int = 60
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    service_type: str = "general_appointment"
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
            db=db,
        )
        return {
            "status": "held",
            "booking_id": held.id,
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
            db=db,
        )
        return {
            "status": "confirmed",
            "booking_id": booking.id,
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
