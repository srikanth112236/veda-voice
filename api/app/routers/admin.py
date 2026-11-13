"""Platform Administrator endpoints for multi-tenant oversight."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.deps import require_platform_admin
from api.app.core.security import hash_password
from api.app.db.session import get_db
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_platform_admin)])


class CreateTenantAdminRequest(BaseModel):
    name: str
    owner_name: str
    owner_email: EmailStr
    owner_password: str
    timezone: str = "America/New_York"
    hours: str = "Monday to Friday, 8:00 AM to 6:00 PM EST"
    phone_number: str | None = None
    greeting: str | None = None
    tone: str = "direct"
    pricing_policy: str = "diagnostic_fee_only"
    services: list[str] = ["Plumbing", "Heating", "Drain Cleaning"]
    emergency_keywords: list[str] = ["burst pipe", "flooding", "gas smell", "sewage"]
    emergency_advice: str = "If safe, shut off your main water valve right away."


class TenantSummaryResponse(BaseModel):
    id: str
    name: str
    timezone: str
    hours: str
    status: str
    created_at: datetime
    phone_numbers: list[str]
    call_count: int
    emergency_count: int


class PlatformStatsResponse(BaseModel):
    total_tenants: int
    total_calls: int
    emergency_calls: int
    avg_latency_p50_ms: float
    active_phone_numbers: int


@router.get("/stats", response_model=PlatformStatsResponse)
def get_platform_stats(db: Session = Depends(get_db)) -> Any:
    """Aggregate platform analytics across all tenants."""
    total_tenants = db.scalar(select(func.count(Tenant.id))) or 0
    total_calls = db.scalar(select(func.count(Call.id))) or 0
    emergency_calls = db.scalar(select(func.count(Call.id)).where(Call.urgency == "emergency")) or 0
    avg_latency = (
        db.scalar(select(func.avg(Call.latency_p50_ms)).where(Call.latency_p50_ms > 0)) or 0.0
    )
    active_numbers = (
        db.scalar(select(func.count(PhoneNumber.id)).where(PhoneNumber.status == "active")) or 0
    )

    return PlatformStatsResponse(
        total_tenants=total_tenants,
        total_calls=total_calls,
        emergency_calls=emergency_calls,
        avg_latency_p50_ms=round(float(avg_latency), 2),
        active_phone_numbers=active_numbers,
    )


@router.get("/tenants", response_model=list[TenantSummaryResponse])
def list_tenants(db: Session = Depends(get_db)) -> Any:
    """List all onboarded business clients."""
    tenants = db.scalars(select(Tenant).order_by(Tenant.created_at.desc())).all()
    results = []

    for t in tenants:
        phone_nums = [p.e164 for p in t.phone_numbers if p.status == "active"]
        call_count = db.scalar(select(func.count(Call.id)).where(Call.tenant_id == t.id)) or 0
        emergency_count = (
            db.scalar(
                select(func.count(Call.id)).where(
                    Call.tenant_id == t.id, Call.urgency == "emergency"
                )
            )
            or 0
        )

        results.append(
            TenantSummaryResponse(
                id=t.id,
                name=t.name,
                timezone=t.timezone,
                hours=t.hours,
                status=t.status,
                created_at=t.created_at,
                phone_numbers=phone_nums,
                call_count=call_count,
                emergency_count=emergency_count,
            )
        )

    return results


@router.post("/tenants", response_model=TenantSummaryResponse)
def create_tenant_admin(req: CreateTenantAdminRequest, db: Session = Depends(get_db)) -> Any:
    """Admin-assisted tenant provisioning with complete custom persona and phone number."""
    existing_user = db.scalar(select(User).where(User.email == req.owner_email.lower()))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists",
        )

    # 1. Create Tenant
    tenant = Tenant(
        name=req.name,
        timezone=req.timezone,
        hours=req.hours,
        status="active",
    )
    db.add(tenant)
    db.flush()

    # 2. Create Custom Agent Profile
    greeting_text = (
        req.greeting
        if req.greeting
        else f"Thanks for calling {req.name}. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?"
    )

    profile = AgentProfile(
        tenant_id=tenant.id,
        agent_name="receptionist",
        greeting=greeting_text,
        tone=req.tone,
        services=req.services,
        pricing_policy=req.pricing_policy,
        emergency_keywords=req.emergency_keywords,
        emergency_advice=req.emergency_advice,
    )
    db.add(profile)

    # 3. Create Tenant Owner
    owner = User(
        tenant_id=tenant.id,
        email=req.owner_email.lower(),
        hashed_password=hash_password(req.owner_password),
        full_name=req.owner_name,
        role="tenant_owner",
        is_active=True,
    )
    db.add(owner)

    # 4. Attach Phone Number if provided
    attached_numbers: list[str] = []
    if req.phone_number:
        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=req.phone_number,
            provider="livekit",
            status="active",
        )
        db.add(phone)
        attached_numbers.append(req.phone_number)

    db.commit()
    db.refresh(tenant)

    return TenantSummaryResponse(
        id=tenant.id,
        name=tenant.name,
        timezone=tenant.timezone,
        hours=tenant.hours,
        status=tenant.status,
        created_at=tenant.created_at,
        phone_numbers=attached_numbers,
        call_count=0,
        emergency_count=0,
    )
