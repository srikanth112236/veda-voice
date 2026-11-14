"""Authentication and onboarding endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_user
from api.app.core.security import create_access_token, hash_password, verify_password
from api.app.db.session import get_db
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterTenantRequest(BaseModel):
    business_name: str
    owner_name: str
    email: EmailStr
    password: str
    timezone: str = "America/New_York"
    hours: str = "Monday to Friday, 8:00 AM to 6:00 PM EST"
    niche: str = "plumbing"  # plumbing, dental, hvac, legal, general
    phone_number: str | None = None
    voice_id: str = "Alex"
    agent_name: str = "receptionist"
    greeting: str | None = None
    tone: str = "direct"
    recording_disclosure: bool = True
    pricing_policy: str = "diagnostic_fee_only"
    diagnostic_fee: str | None = "$89.00"
    services: list[str] = Field(
        default_factory=lambda: ["General Services", "Repairs", "Maintenance"]
    )
    emergency_advice: str | None = None
    emergency_keywords: list[str] = Field(
        default_factory=lambda: ["burst pipe", "flooding", "gas leak", "urgent"]
    )
    faq: list[dict[str, Any]] = Field(default_factory=list)


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    tenant_id: str | None
    tenant_name: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)) -> Any:
    """Authenticate platform admin or tenant user and issue JWT."""
    stmt = select(User).where(User.email == req.email.lower(), User.is_active.is_(True))
    user = db.scalar(stmt)
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    tenant_name = user.tenant.name if user.tenant else "VedaVoice Platform"
    token = create_access_token({"sub": user.id, "role": user.role, "tenant_id": user.tenant_id})

    return LoginResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            tenant_id=user.tenant_id,
            tenant_name=tenant_name,
        ),
    )


@router.post("/register", response_model=LoginResponse)
def register_tenant(req: RegisterTenantRequest, db: Session = Depends(get_db)) -> Any:
    """Public self-service tenant onboarding."""
    # Check if user email already exists
    existing_user = db.scalar(select(User).where(User.email == req.email.lower()))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )

    # 1. Create Tenant
    tenant = Tenant(
        name=req.business_name,
        timezone=req.timezone,
        hours=req.hours,
        status="active",
    )
    db.add(tenant)
    db.flush()

    # 2. Build Agent Profile
    greeting_text = req.greeting
    if not greeting_text:
        disclosure_phrase = (
            " This call may be recorded and transcribed for quality assurance."
            if req.recording_disclosure
            else ""
        )
        greeting_text = f"Thanks for calling {req.business_name}. I'm an automated assistant.{disclosure_phrase} How can I help you today?"

    default_emergency_advice = (
        "If safe, locate and shut off your main water valve right away."
        if req.niche == "plumbing"
        else "In case of immediate danger, please call 911."
    )

    pricing_details: dict[str, Any] = {}
    if req.diagnostic_fee:
        pricing_details["diagnostic_fee"] = req.diagnostic_fee

    agent_profile = AgentProfile(
        tenant_id=tenant.id,
        agent_name=req.agent_name or "receptionist",
        greeting=greeting_text,
        tone=req.tone,
        voice_id=req.voice_id or "Alex",
        recording_disclosure=req.recording_disclosure,
        pricing_policy=req.pricing_policy,
        pricing_details=pricing_details,
        services=req.services,
        emergency_advice=req.emergency_advice or default_emergency_advice,
        emergency_keywords=req.emergency_keywords,
        faq=req.faq,
    )
    db.add(agent_profile)

    # Attach phone number if provided
    if req.phone_number:
        # Check if number is already in use by active tenant
        existing_phone = db.scalar(
            select(PhoneNumber).where(
                PhoneNumber.e164 == req.phone_number,
                PhoneNumber.status == "active",
            )
        )
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Phone number {req.phone_number} is already assigned to an active tenant",
            )
        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=req.phone_number,
            provider="livekit",
            status="active",
        )
        db.add(phone)

    # 3. Create Tenant Owner User
    user = User(
        tenant_id=tenant.id,
        email=req.email.lower(),
        hashed_password=hash_password(req.password),
        full_name=req.owner_name,
        role="tenant_owner",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "role": user.role, "tenant_id": tenant.id})

    return LoginResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            tenant_id=tenant.id,
            tenant_name=tenant.name,
        ),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)) -> Any:
    """Return profile details for the authenticated user."""
    tenant_name = current_user.tenant.name if current_user.tenant else "VedaVoice Platform"
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        tenant_id=current_user.tenant_id,
        tenant_name=tenant_name,
    )
