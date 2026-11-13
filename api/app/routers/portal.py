"""Tenant business client portal endpoints strictly scoped to current tenant."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, Tenant

router = APIRouter(prefix="/portal", tags=["portal"])


class CallListItem(BaseModel):
    id: str
    call_id: str
    caller_number: str
    dialed_number: str
    started_at: datetime
    duration_s: float
    outcome: str
    urgency: str
    turn_count: int
    latency_p50_ms: float
    caller_name: str | None = None
    service_address: str | None = None


class CallDetailResponse(BaseModel):
    id: str
    call_id: str
    caller_number: str
    dialed_number: str
    started_at: datetime
    ended_at: datetime | None
    duration_s: float
    outcome: str
    urgency: str
    turn_count: int
    latency_p50_ms: float
    latency_p95_ms: float
    turn_latencies_ms: list[float]
    transcript: list[dict[str, Any]]
    message: dict[str, Any] | None
    tags: list[str]


class TenantDashboardStats(BaseModel):
    total_calls: int
    emergency_calls: int
    messages_taken: int
    median_latency_ms: float
    tenant_name: str
    phone_numbers: list[str]


class UpdateAgentProfileRequest(BaseModel):
    business_name: str | None = None
    agent_name: str | None = None
    hours: str | None = None
    greeting: str | None = None
    tone: str | None = None
    voice_id: str | None = None
    recording_disclosure: bool | None = None
    phonetic_glossary: list[dict[str, str]] | None = None
    services: list[str] | None = None
    pricing_policy: str | None = None
    faq: list[dict[str, str]] | None = None
    emergency_keywords: list[str] | None = None
    emergency_advice: str | None = None
    transfer_number: str | None = None


class AgentProfileResponse(BaseModel):
    business_name: str
    agent_name: str = "receptionist"
    timezone: str
    hours: str
    greeting: str
    tone: str
    voice_id: str = "Alex"
    recording_disclosure: bool = True
    phonetic_glossary: list[dict[str, str]] = Field(default_factory=list)
    services: list[str]
    pricing_policy: str
    faq: list[dict[str, str]]
    emergency_keywords: list[str]
    emergency_advice: str
    transfer_number: str


@router.get("/dashboard", response_model=TenantDashboardStats)
def get_dashboard_stats(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Dashboard KPIs for the authenticated tenant."""
    total_calls = db.scalar(select(func.count(Call.id)).where(Call.tenant_id == tenant.id)) or 0
    emergency_calls = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id, Call.urgency == "emergency"
            )
        )
        or 0
    )
    messages_taken = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id, Call.outcome == "message_taken"
            )
        )
        or 0
    )
    median_lat = (
        db.scalar(
            select(func.avg(Call.latency_p50_ms)).where(
                Call.tenant_id == tenant.id, Call.latency_p50_ms > 0
            )
        )
        or 0.0
    )
    phone_numbers = [p.e164 for p in tenant.phone_numbers if p.status == "active"]

    return TenantDashboardStats(
        total_calls=total_calls,
        emergency_calls=emergency_calls,
        messages_taken=messages_taken,
        median_latency_ms=round(float(median_lat), 2),
        tenant_name=tenant.name,
        phone_numbers=phone_numbers,
    )


@router.get("/calls", response_model=list[CallListItem])
def list_calls(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    urgency: str | None = Query(None, description="Filter by urgency: normal, urgent, emergency"),
    outcome: str | None = Query(None, description="Filter by outcome"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Any:
    """List calls strictly scoped to current tenant."""
    query = select(Call).where(Call.tenant_id == tenant.id)
    if urgency:
        query = query.where(Call.urgency == urgency)
    if outcome:
        query = query.where(Call.outcome == outcome)

    query = query.order_by(Call.started_at.desc()).limit(limit).offset(offset)
    calls = db.scalars(query).all()

    results = []
    for c in calls:
        caller_name = c.message.get("name") if c.message else None
        service_address = c.message.get("address") if c.message else None

        results.append(
            CallListItem(
                id=c.id,
                call_id=c.call_id,
                caller_number=c.caller_number,
                dialed_number=c.dialed_number,
                started_at=c.started_at,
                duration_s=c.duration_s,
                outcome=c.outcome,
                urgency=c.urgency,
                turn_count=c.turn_count,
                latency_p50_ms=c.latency_p50_ms,
                caller_name=caller_name,
                service_address=service_address,
            )
        )
    return results


@router.get("/calls/{call_id}", response_model=CallDetailResponse)
def get_call_detail(
    call_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve full call transcript and details strictly for this tenant."""
    stmt = select(Call).where(Call.id == call_id, Call.tenant_id == tenant.id)
    call = db.scalar(stmt)
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    return CallDetailResponse(
        id=call.id,
        call_id=call.call_id,
        caller_number=call.caller_number,
        dialed_number=call.dialed_number,
        started_at=call.started_at,
        ended_at=call.ended_at,
        duration_s=call.duration_s,
        outcome=call.outcome,
        urgency=call.urgency,
        turn_count=call.turn_count,
        latency_p50_ms=call.latency_p50_ms,
        latency_p95_ms=call.latency_p95_ms,
        turn_latencies_ms=call.turn_latencies_ms,
        transcript=call.transcript,
        message=call.message,
        tags=call.tags,
    )


@router.get("/profile", response_model=AgentProfileResponse)
def get_agent_profile(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve business profile and agent rules."""
    profile = tenant.agent_profile
    if not profile:
        profile = AgentProfile(tenant_id=tenant.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return AgentProfileResponse(
        business_name=tenant.name,
        agent_name=getattr(profile, "agent_name", "receptionist") or "receptionist",
        timezone=tenant.timezone,
        hours=tenant.hours,
        greeting=profile.greeting,
        tone=profile.tone,
        voice_id=getattr(profile, "voice_id", None) or "Alex",
        recording_disclosure=True
        if getattr(profile, "recording_disclosure", None) is None
        else bool(profile.recording_disclosure),
        phonetic_glossary=getattr(profile, "phonetic_glossary", None) or [],
        services=profile.services,
        pricing_policy=profile.pricing_policy,
        faq=profile.faq,
        emergency_keywords=profile.emergency_keywords,
        emergency_advice=profile.emergency_advice,
        transfer_number=profile.transfer_number,
    )


@router.put("/profile", response_model=AgentProfileResponse)
def update_agent_profile(
    req: UpdateAgentProfileRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Update business profile and receptionist behavior."""
    if req.business_name:
        tenant.name = req.business_name
    if req.hours:
        tenant.hours = req.hours

    profile = tenant.agent_profile
    if not profile:
        profile = AgentProfile(tenant_id=tenant.id)
        db.add(profile)

    if req.agent_name is not None:
        profile.agent_name = req.agent_name
    if req.greeting is not None:
        profile.greeting = req.greeting
    if req.tone is not None:
        profile.tone = req.tone
    if req.voice_id is not None:
        profile.voice_id = req.voice_id
    if req.recording_disclosure is not None:
        profile.recording_disclosure = req.recording_disclosure
    if req.phonetic_glossary is not None:
        profile.phonetic_glossary = req.phonetic_glossary
    if req.services is not None:
        profile.services = req.services
    if req.pricing_policy is not None:
        profile.pricing_policy = req.pricing_policy
    if req.faq is not None:
        profile.faq = req.faq
    if req.emergency_keywords is not None:
        profile.emergency_keywords = req.emergency_keywords
    if req.emergency_advice is not None:
        profile.emergency_advice = req.emergency_advice
    if req.transfer_number is not None:
        profile.transfer_number = req.transfer_number

    profile.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(tenant)
    db.refresh(profile)

    return AgentProfileResponse(
        business_name=tenant.name,
        agent_name=getattr(profile, "agent_name", "receptionist") or "receptionist",
        timezone=tenant.timezone,
        hours=tenant.hours,
        greeting=profile.greeting,
        tone=profile.tone,
        voice_id=getattr(profile, "voice_id", None) or "Alex",
        recording_disclosure=True
        if getattr(profile, "recording_disclosure", None) is None
        else bool(profile.recording_disclosure),
        phonetic_glossary=getattr(profile, "phonetic_glossary", None) or [],
        services=profile.services,
        pricing_policy=profile.pricing_policy,
        faq=profile.faq,
        emergency_keywords=profile.emergency_keywords,
        emergency_advice=profile.emergency_advice,
        transfer_number=profile.transfer_number,
    )
