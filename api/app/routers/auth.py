"""Authentication and onboarding endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_user
from api.app.core.security import create_access_token, hash_password, verify_password
from api.app.db.session import get_db
from api.app.models.entitlement import TrialAbuseRecord
from api.app.models.location import Location
from api.app.models.subscription import Subscription
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.entitlements import verify_trial_eligibility
from api.app.services.livekit_sync import sync_tenant_to_livekit

logger = logging.getLogger("vedavoice.auth")

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
    # Primary Location details
    address_line1: str = ""
    city: str = ""
    state: str = ""
    postal_code: str = ""
    service_territory_zips: list[str] = Field(default_factory=list)
    niche_pack_slug: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    tenant_id: str | None
    tenant_name: str | None = None
    is_impersonated: bool = False
    impersonator_id: str | None = None
    impersonator_email: str | None = None


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

    # Verify trial eligibility and block disposable emails or serial trial phone churn (FR-TRIAL-3 & 9)
    is_eligible, ineligibility_reason = verify_trial_eligibility(
        db, email=req.email, phone=req.phone_number or ""
    )
    if not is_eligible:
        status_code = (
            status.HTTP_409_CONFLICT
            if (
                "already assigned" in (ineligibility_reason or "").lower()
                or "already been redeemed" in (ineligibility_reason or "").lower()
            )
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(
            status_code=status_code,
            detail=ineligibility_reason,
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

    # 2. Automatically create Primary Location (HQ) for this tenant
    primary_location = Location(
        tenant_id=tenant.id,
        name=f"{tenant.name} Headquarters",
        code="HQ",
        address_line1=req.address_line1 or "",
        city=req.city or "",
        state=req.state or "",
        postal_code=req.postal_code or "",
        country="US",
        phone=req.phone_number or "",
        timezone=tenant.timezone,
        hours=tenant.hours,
        service_territory_zips=req.service_territory_zips,
        is_primary=True,
        is_active=True,
    )
    db.add(primary_location)
    db.flush()

    # Attach phone number if provided and bind to primary location
    if req.phone_number:
        # Check if number is already in database (from seed pool or existing inventory)
        existing_phone = db.scalar(
            select(PhoneNumber).where(
                PhoneNumber.e164 == req.phone_number,
            )
        )
        if existing_phone:
            if (
                existing_phone.status == "active"
                and existing_phone.tenant_id
                and existing_phone.tenant_id != tenant.id
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Phone number {req.phone_number} is already assigned to an active tenant",
                )
            # Reassign / claim pool number for this new tenant
            existing_phone.tenant_id = tenant.id
            existing_phone.location_id = primary_location.id
            existing_phone.status = "active"
            existing_phone.label = f"{tenant.name} Main Line"
        else:
            phone = PhoneNumber(
                tenant_id=tenant.id,
                location_id=primary_location.id,
                e164=req.phone_number,
                provider="livekit",
                status="active",
                label=f"{tenant.name} Main Line",
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

    # 4. Initialize 14-Day Free Trial Subscription (100 Minutes)
    sub = Subscription(
        tenant_id=tenant.id,
        tier="trial",
        status="trialing",
        monthly_included_minutes=1000,
        bonus_rollover_minutes=0.0,
        used_minutes_this_cycle=0.0,
        trial_days=14,
        trial_minutes_allocated=100,
        trial_minutes_used=0.0,
        overage_rate_usd=0.20,
        allow_overage=True,
    )
    db.add(sub)

    # Record trial identity for anti-abuse tracking (FR-TRIAL-3 & 9)
    email_domain = req.email.split("@")[-1].lower() if "@" in req.email else None
    abuse_rec = TrialAbuseRecord(
        tenant_id=tenant.id,
        phone_number=req.phone_number,
        email_domain=email_domain,
    )
    db.add(abuse_rec)
    try:
        db.commit()
    except Exception as ie:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration conflict: email or phone number is already registered to another account.",
        ) from ie
    db.refresh(user)

    # 5. Automatically apply selected Industry Pack to the newly registered tenant
    slug_map = {
        "plumbing": "home_services",
        "hvac": "home_services",
        "electrical": "home_services",
        "home_services": "home_services",
        "dental": "dental_clinic",
        "dental_clinic": "dental_clinic",
        "legal": "legal_intake",
        "legal_intake": "legal_intake",
        "general": "general",
    }
    pack_slug = req.niche_pack_slug or slug_map.get(req.niche.lower(), "home_services")
    try:
        from api.app.services.industry_packs import apply_pack_to_tenant

        apply_pack_to_tenant(tenant_id=tenant.id, pack_slug=pack_slug, db=db)
    except Exception as pe:
        logger.warning(
            "Could not auto-apply industry pack %s during registration: %s", pack_slug, pe
        )

    # 6. Automatically compile & synchronize LiveKit Agent runtime configuration
    try:
        sync_tenant_to_livekit(tenant.id, db)
    except Exception as e:
        # Do not fail registration if directory sync encounters non-critical IO issue
        import logging

        logging.getLogger("vedavoice.auth").warning(
            "Failed to auto-sync tenant to LiveKit config: %s", e
        )

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
        is_impersonated=getattr(current_user, "is_impersonated", False),
        impersonator_id=getattr(current_user, "impersonator_id", None),
        impersonator_email=getattr(current_user, "impersonator_email", None),
    )
