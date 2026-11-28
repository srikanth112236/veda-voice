"""Authentication and onboarding endpoints."""

import logging
import secrets
import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.deps import clear_auth_cookies, get_current_user, set_auth_cookie
from api.app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from api.app.db.session import get_db
from api.app.models.entitlement import TrialAbuseRecord
from api.app.models.industry_pack import IndustryPack, IndustryPackVersion
from api.app.models.location import Location
from api.app.models.subscription import Subscription
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.entitlements import verify_trial_eligibility
from api.app.services.industry_packs import LAUNCH_PACKS, seed_default_industry_packs
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
    password: str | None = None
    google_token: str | None = None
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


class PublicIndustryPackItem(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    category: str
    icon: str
    latest_version: str
    requires_hipaa_baa: bool
    allowed_outbound_categories: list[str] = Field(default_factory=list)
    default_prompt_vars: dict[str, Any] = Field(default_factory=dict)
    prompt_vars_schema: dict[str, Any] = Field(default_factory=dict)
    emergency_keywords: list[str] = Field(default_factory=list)
    emergency_advice: str = ""
    services: list[str] = Field(default_factory=list)
    greeting: str = ""
    faq: list[dict[str, str]] = Field(default_factory=list)
    intake_schema: dict[str, Any] = Field(default_factory=dict)


def get_public_industry_packs_fallback() -> list[PublicIndustryPackItem]:
    """Fallback generator for public industry packs in case of temporary database sync delays."""
    items: list[PublicIndustryPackItem] = []
    for blueprint in LAUNCH_PACKS:
        vars_schema = blueprint.get("prompt_vars_schema", {})
        default_vars = {
            k: v.get("default", "") for k, v in vars_schema.items() if isinstance(v, dict)
        }
        appointment_types = blueprint.get("appointment_types", [])
        services = [apt.get("title", "") for apt in appointment_types if apt.get("title")]
        if not services and "specialties" in default_vars:
            services = [s.strip() for s in default_vars["specialties"].split(",") if s.strip()]
        if not services:
            services = ["General Consultation", "Standard Service", "Support Intake"]

        biz_name = default_vars.get("business_name", blueprint["name"])
        greeting = (
            f"Thanks for calling {biz_name}. I'm an automated assistant, and this call may be "
            "recorded and transcribed for quality assurance. How can I help you today?"
        )
        faq_list = [
            {"question": item.get("q", ""), "answer": item.get("a", "")}
            for item in blueprint.get("faq_seed", [])
            if item.get("q") and item.get("a")
        ]
        emergency_rules = blueprint.get("emergency_rules") or {}
        items.append(
            PublicIndustryPackItem(
                id=f"pub-{blueprint['slug']}",
                slug=blueprint["slug"],
                name=blueprint["name"],
                description=blueprint["description"],
                category=blueprint["category"],
                icon=blueprint["icon"],
                latest_version=blueprint.get("version", "1.0.0"),
                requires_hipaa_baa=blueprint.get("requires_hipaa_baa", False),
                allowed_outbound_categories=blueprint.get(
                    "allowed_outbound_categories", ["A", "B", "C", "D", "E"]
                ),
                default_prompt_vars=default_vars,
                prompt_vars_schema=vars_schema,
                emergency_keywords=emergency_rules.get("keywords", []),
                emergency_advice=emergency_rules.get("safety_advice", ""),
                services=services,
                greeting=greeting,
                faq=faq_list,
                intake_schema=blueprint.get("intake_schema") or {},
            )
        )
    return items


@router.get("/industry-packs", response_model=list[PublicIndustryPackItem])
def get_public_industry_packs(db: Session = Depends(get_db)) -> Any:
    """Public onboarding catalog of active industry packs with default presets."""
    try:
        packs = db.scalars(
            select(IndustryPack).where(IndustryPack.is_active.is_(True)).order_by(IndustryPack.name)
        ).all()
        if not packs:
            packs = seed_default_industry_packs(db)

        results: list[PublicIndustryPackItem] = []
        for p in packs:
            latest_ver = db.scalar(
                select(IndustryPackVersion)
                .where(
                    IndustryPackVersion.pack_id == p.id,
                    IndustryPackVersion.status == "published",
                )
                .order_by(IndustryPackVersion.created_at.desc())
            )
            if not latest_ver:
                continue

            vars_schema = latest_ver.prompt_vars_schema or {}
            default_vars = {
                k: v.get("default", "") for k, v in vars_schema.items() if isinstance(v, dict)
            }

            # Services from appointment types or prompt vars
            services: list[str] = []
            if latest_ver.appointment_types:
                services = [
                    apt.get("title", "") for apt in latest_ver.appointment_types if apt.get("title")
                ]
            if not services and "specialties" in default_vars:
                services = [s.strip() for s in default_vars["specialties"].split(",") if s.strip()]
            if not services:
                services = ["General Consultation", "Standard Service", "Support Intake"]

            biz_name = default_vars.get("business_name", p.name)
            greeting = (
                f"Thanks for calling {biz_name}. I'm an automated assistant, and this call may be "
                "recorded and transcribed for quality assurance. How can I help you today?"
            )

            faq_list = [
                {"question": item.get("q", ""), "answer": item.get("a", "")}
                for item in (latest_ver.faq_seed or [])
                if item.get("q") and item.get("a")
            ]

            emergency_rules = latest_ver.emergency_rules or {}

            results.append(
                PublicIndustryPackItem(
                    id=p.id,
                    slug=p.slug,
                    name=p.name,
                    description=p.description,
                    category=p.category,
                    icon=p.icon,
                    latest_version=latest_ver.version_semver,
                    requires_hipaa_baa=latest_ver.requires_hipaa_baa,
                    allowed_outbound_categories=latest_ver.allowed_outbound_categories
                    or ["A", "B", "C", "D", "E"],
                    default_prompt_vars=default_vars,
                    prompt_vars_schema=vars_schema,
                    emergency_keywords=emergency_rules.get("keywords", []),
                    emergency_advice=emergency_rules.get("safety_advice", ""),
                    services=services,
                    greeting=greeting,
                    faq=faq_list,
                    intake_schema=latest_ver.intake_schema or {},
                )
            )

        if not results:
            return get_public_industry_packs_fallback()

        return results
    except Exception as exc:
        logger.warning("Error loading public industry packs catalog, returning fallback: %s", exc)
        db.rollback()
        return get_public_industry_packs_fallback()


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)) -> Any:
    """Authenticate platform admin or tenant user and issue JWT + HttpOnly cookie."""
    stmt = select(User).where(User.email == req.email.lower(), User.is_active.is_(True))
    user = db.scalar(stmt)
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    tenant_name = user.tenant.name if user.tenant else "VedaVoice Platform"
    token = create_access_token({"sub": user.id, "role": user.role, "tenant_id": user.tenant_id})
    set_auth_cookie(response, token)

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


@router.post("/logout")
def logout_user(response: Response) -> dict[str, bool]:
    """Clear HttpOnly authentication cookies."""
    clear_auth_cookies(response)
    return {"success": True}


@router.post("/register", response_model=LoginResponse)
def register_tenant(
    req: RegisterTenantRequest, response: Response, db: Session = Depends(get_db)
) -> Any:
    """Public self-service tenant onboarding (supports password or verified Google token)."""
    owner_email = req.email.lower()
    owner_name = req.owner_name
    owner_picture = ""
    raw_password = req.password

    if req.google_token:
        g_payload = decode_access_token(req.google_token)
        if (
            not g_payload
            or g_payload.get("flow") != "google_onboarding"
            or g_payload.get("email_verified") is not True
            or not g_payload.get("email")
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired Google onboarding session. Please sign in with Google again.",
            )
        owner_email = str(g_payload["email"]).strip().lower()
        if not owner_name.strip():
            owner_name = str(g_payload.get("name") or owner_email.split("@")[0])
        owner_picture = str(g_payload.get("picture") or "")
        raw_password = raw_password or secrets.token_urlsafe(32)
    elif not raw_password or len(raw_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password of at least 6 characters is required.",
        )

    # Check if user email already exists
    existing_user = db.scalar(select(User).where(User.email == owner_email))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )

    # Verify trial eligibility and block disposable emails or serial trial phone churn (FR-TRIAL-3 & 9)
    is_eligible, ineligibility_reason = verify_trial_eligibility(
        db, email=owner_email, phone=req.phone_number or ""
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
    if owner_picture:
        cfg = dict(tenant.config or {})
        cfg["owner_picture"] = owner_picture
        tenant.config = cfg

    user = User(
        tenant_id=tenant.id,
        email=owner_email,
        hashed_password=hash_password(raw_password),
        full_name=owner_name,
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
    set_auth_cookie(response, token)

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


def _resolve_dashboard_origin(redirect_to: str | None) -> str:
    """Validate redirect_to against allowed origins to prevent open redirects."""
    if redirect_to:
        candidate = redirect_to.rstrip("/")
        if candidate in settings.CORS_ORIGINS or candidate == settings.DASHBOARD_URL.rstrip("/"):
            return candidate
    return settings.DASHBOARD_URL.rstrip("/")


@router.get("/google")
def google_login_url(redirect_to: str | None = Query(None)) -> dict[str, str]:
    """Generate Google OAuth 2.0 login URL with signed CSRF state."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server.",
        )

    safe_origin = _resolve_dashboard_origin(redirect_to)
    state_token = create_access_token(
        {
            "flow": "google_login",
            "nonce": uuid.uuid4().hex[:12],
            "redirect_to": safe_origin,
        }
    )
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_AUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state_token,
        "prompt": "select_account",
    }
    return {
        "authorization_url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    }


@router.get("/google/callback")
async def google_login_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Handle Google OAuth callback, verify ID token, and redirect with VedaVoice JWT."""
    dashboard_origin = settings.DASHBOARD_URL.rstrip("/")
    if state:
        state_payload = decode_access_token(state)
        if state_payload and state_payload.get("flow") == "google_login":
            dashboard_origin = _resolve_dashboard_origin(state_payload.get("redirect_to"))
        else:
            return RedirectResponse(url=f"{dashboard_origin}/login?error=invalid_oauth_state")
    else:
        return RedirectResponse(url=f"{dashboard_origin}/login?error=missing_oauth_state")

    if error or not code:
        return RedirectResponse(url=f"{dashboard_origin}/login?error={error or 'oauth_denied'}")

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_AUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            logger.warning("Google OAuth token exchange failed: %s", token_resp.text)
            return RedirectResponse(
                url=f"{dashboard_origin}/login?error=google_token_exchange_failed"
            )

        token_data = token_resp.json()
        id_token = token_data.get("id_token")
        if not id_token:
            return RedirectResponse(url=f"{dashboard_origin}/login?error=missing_id_token")

        verify_resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
        if verify_resp.status_code != 200:
            logger.warning("Google ID token verification failed: %s", verify_resp.text)
            return RedirectResponse(url=f"{dashboard_origin}/login?error=invalid_google_token")

        claims = verify_resp.json()

    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        return RedirectResponse(url=f"{dashboard_origin}/login?error=invalid_token_audience")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        return RedirectResponse(url=f"{dashboard_origin}/login?error=invalid_token_issuer")
    if claims.get("email_verified") not in (True, "true"):
        return RedirectResponse(url=f"{dashboard_origin}/login?error=email_not_verified")

    email = str(claims.get("email", "")).strip().lower()
    if not email:
        return RedirectResponse(url=f"{dashboard_origin}/login?error=missing_email")

    name = str(claims.get("name") or email.split("@")[0]).strip()
    picture = str(claims.get("picture") or "").strip()

    user = db.scalar(select(User).where(User.email == email, User.is_active.is_(True)))
    if not user:
        onboarding_code = secrets.token_urlsafe(32)
        onboarding_token = create_access_token(
            {
                "flow": "google_onboarding",
                "email": email,
                "name": name,
                "picture": picture,
                "email_verified": True,
                "nonce": uuid.uuid4().hex[:8],
            },
            expires_delta=timedelta(minutes=15),
        )
        _GOOGLE_ONBOARDING_CODES[onboarding_code] = onboarding_token
        return RedirectResponse(url=f"{dashboard_origin}/onboarding?google_code={onboarding_code}")

    jwt_token = create_access_token(
        {
            "sub": user.id,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "auth_provider": "google",
        }
    )
    redir = RedirectResponse(url=f"{dashboard_origin}/login?google_auth=1")
    set_auth_cookie(redir, jwt_token)
    return redir


_GOOGLE_ONBOARDING_CODES: dict[str, str] = {}


class GoogleOnboardingExchangeRequest(BaseModel):
    code: str


@router.post("/google/onboarding-exchange")
def exchange_google_onboarding_code(req: GoogleOnboardingExchangeRequest) -> dict[str, str]:
    """Exchange one-time Google onboarding code for profile and short-lived registration token."""
    token = _GOOGLE_ONBOARDING_CODES.pop(req.code, None)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google onboarding code.",
        )
    payload = decode_access_token(token)
    if (
        not payload
        or payload.get("flow") != "google_onboarding"
        or payload.get("email_verified") is not True
        or not payload.get("email")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google onboarding session.",
        )
    return {
        "google_token": token,
        "email": str(payload["email"]),
        "name": str(payload.get("name") or ""),
        "picture": str(payload.get("picture") or ""),
    }


@router.get("/google/onboarding-session")
def get_google_onboarding_session(token: str = Query(...)) -> dict[str, str]:
    """Verify short-lived Google onboarding token and return name, email, and picture."""
    payload = decode_access_token(token)
    if (
        not payload
        or payload.get("flow") != "google_onboarding"
        or payload.get("email_verified") is not True
        or not payload.get("email")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google onboarding session.",
        )
    return {
        "email": str(payload["email"]),
        "name": str(payload.get("name") or ""),
        "picture": str(payload.get("picture") or ""),
    }
