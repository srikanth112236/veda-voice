"""Internal endpoints dedicated to LiveKit Voice Agent worker."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import get_db
from api.app.models.call import Call
from api.app.models.tenant import PhoneNumber, Tenant

router = APIRouter(prefix="/internal", tags=["internal"])


class InternalTenantConfigResponse(BaseModel):
    tenant_id: str
    business_name: str
    timezone: str
    hours: str
    agent_name: str
    greeting: str
    tone: str
    services: list[str]
    pricing_policy: str
    pricing_details: dict[str, Any]
    faq: list[dict[str, Any]]
    emergency_keywords: list[str]
    emergency_advice: str
    transfer_number: str
    call_token: str


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


@router.get("/tenants/by-number/{e164}", response_model=InternalTenantConfigResponse)
def resolve_tenant_by_number(e164: str, db: Session = Depends(get_db)) -> Any:
    """Resolve dialed phone number to active tenant and agent configuration."""
    clean_number = e164.strip()
    stmt = select(PhoneNumber).where(
        PhoneNumber.e164 == clean_number, PhoneNumber.status == "active"
    )
    phone = db.scalar(stmt)

    # Fallback to first active tenant if phone number is not found (useful for console mode / web calls)
    if not phone:
        fallback_tenant = db.scalar(
            select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
        )
        if not fallback_tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="No active tenant found"
            )
        tenant = fallback_tenant
    else:
        tenant = phone.tenant

    profile = tenant.agent_profile
    token = create_access_token({"sub": "livekit-agent", "role": "agent", "tenant_id": tenant.id})

    return InternalTenantConfigResponse(
        tenant_id=tenant.id,
        business_name=tenant.name,
        timezone=tenant.timezone,
        hours=tenant.hours,
        agent_name=profile.agent_name if profile else "receptionist",
        greeting=profile.greeting if profile else f"Thanks for calling {tenant.name}.",
        tone=profile.tone if profile else "direct",
        services=profile.services if profile else [],
        pricing_policy=profile.pricing_policy if profile else "diagnostic_fee_only",
        pricing_details=profile.pricing_details if profile else {},
        faq=profile.faq if profile else [],
        emergency_keywords=profile.emergency_keywords if profile else [],
        emergency_advice=profile.emergency_advice if profile else "",
        transfer_number=profile.transfer_number if profile else "",
        call_token=token,
    )


@router.post("/calls/complete")
def save_call_record_from_agent(
    payload: CallCompletionPayload,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Ingest completed call record from agent worker into database."""
    # Find matching tenant by dialed number or fallback
    tenant_id: str | None = None
    if payload.dialed_number:
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

    started_dt = _parse_iso(payload.started_at) or datetime.now(UTC)
    ended_dt = _parse_iso(payload.ended_at)

    call = Call(
        tenant_id=tenant_id,
        call_id=payload.call_id,
        caller_number=payload.caller_number,
        dialed_number=payload.dialed_number,
        started_at=started_dt,
        ended_at=ended_dt,
        duration_s=payload.duration_s,
        outcome=payload.outcome,
        urgency=urgency,
        turn_count=payload.turn_count,
        latency_p50_ms=payload.latency_p50_ms,
        latency_p95_ms=payload.latency_p95_ms,
        turn_latencies_ms=payload.turn_latencies_ms,
        transcript=payload.transcript,
        message=payload.message,
        tags=payload.tags,
    )
    db.add(call)
    db.commit()

    return {"status": "ok", "call_id": payload.call_id}
