"""Authentication and onboarding endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_user
from api.app.core.security import create_access_token, hash_password, verify_password
from api.app.db.session import get_db
from api.app.models.tenant import AgentProfile, Tenant
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
    niche: str = "plumbing"  # plumbing, dental, legal, general


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

    # 2. Create Default Agent Profile for this niche
    agent_profile = AgentProfile(
        tenant_id=tenant.id,
        agent_name="receptionist",
        greeting=f"Thanks for calling {req.business_name}. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
        tone="direct" if req.niche == "plumbing" else "warm",
        pricing_policy="diagnostic_fee_only" if req.niche == "plumbing" else "fixed_menu",
        emergency_advice="If safe, locate and shut off your main water valve right away."
        if req.niche == "plumbing"
        else "In case of immediate danger, please call 911.",
        services=["General Services", "Repairs", "Maintenance"],
        emergency_keywords=["burst pipe", "flooding", "gas leak", "urgent"],
    )
    db.add(agent_profile)

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
