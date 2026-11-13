"""FastAPI application entrypoint for VedaVoice platform."""

import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from api.app.core.config import settings
from api.app.core.security import hash_password
from api.app.db.session import SessionLocal, engine
from api.app.models.base import Base
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.routers.admin import router as admin_router
from api.app.routers.auth import router as auth_router
from api.app.routers.internal import router as internal_router
from api.app.routers.portal import router as portal_router


def seed_initial_data() -> None:
    """Initialize platform admin, default tenant, and import existing call records."""
    db = SessionLocal()
    try:
        # 1. Seed Platform Admin
        admin_user = db.scalar(
            select(User).where(User.email == settings.PLATFORM_ADMIN_EMAIL.lower())
        )
        if not admin_user:
            admin_user = User(
                email=settings.PLATFORM_ADMIN_EMAIL.lower(),
                hashed_password=hash_password(settings.PLATFORM_ADMIN_PASSWORD),
                full_name=settings.PLATFORM_ADMIN_NAME,
                role="platform_admin",
                is_active=True,
            )
            db.add(admin_user)
            db.commit()

        # 2. Seed Default Apex Plumbing Tenant if empty
        tenant = db.scalar(select(Tenant).where(Tenant.name == "Apex Plumbing & Heating"))
        if not tenant:
            tenant = Tenant(
                name="Apex Plumbing & Heating",
                timezone="America/New_York",
                hours="Monday to Friday, 8:00 AM to 6:00 PM EST",
                status="active",
            )
            db.add(tenant)
            db.flush()

            # Profile
            profile = AgentProfile(
                tenant_id=tenant.id,
                agent_name="receptionist",
                greeting="Thanks for calling Apex Plumbing & Heating. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
                tone="direct",
                services=[
                    "Emergency pipe burst and leak repair",
                    "Drain cleaning and camera inspection",
                    "Water heater installation and flush",
                    "Boiler repair and winterization",
                ],
                pricing_policy="diagnostic_fee_only",
                pricing_details={
                    "dispatch_diagnostic_fee": "$89 diagnostic fee; repair estimate on-site"
                },
                faq=[
                    {
                        "question": "Do you offer emergency service?",
                        "answer": "Yes, we operate 24/7 emergency dispatch for burst pipes, active flooding, and sewage backups.",
                    },
                    {
                        "question": "How much do you charge for diagnosis?",
                        "answer": "We charge an $89 diagnostic fee to inspect the issue and provide an upfront price before starting work.",
                    },
                ],
                emergency_keywords=[
                    "burst pipe",
                    "flooding",
                    "gas smell",
                    "gas leak",
                    "sewage backup",
                ],
                emergency_advice="If safe, locate and shut off your main water valve right away to prevent further flooding.",
                transfer_number="+18005550199",
            )
            db.add(profile)

            # Inbound Phone Number
            phone = PhoneNumber(
                tenant_id=tenant.id,
                e164="+18005550199",
                provider="livekit",
                status="active",
            )
            db.add(phone)

            # Tenant Owner User
            owner = User(
                tenant_id=tenant.id,
                email="owner@apexplumbing.com",
                hashed_password=hash_password("ApexOwner2026!"),
                full_name="Bob Henderson",
                role="tenant_owner",
                is_active=True,
            )
            db.add(owner)
            db.commit()

        # 3. Import existing calls from data/calls/ if database calls are empty
        call_count = db.scalar(select(Call.id))
        if not call_count:
            calls_dir = Path("data/calls")
            if calls_dir.exists():
                for call_file in sorted(calls_dir.glob("*.json")):
                    try:
                        with open(call_file, encoding="utf-8") as f:
                            data = json.load(f)

                        urgency = "normal"
                        if data.get("message") and data["message"].get("urgency"):
                            urgency = data["message"]["urgency"].lower()
                        elif "emergency" in data.get("tags", []):
                            urgency = "emergency"

                        def _parse_dt(s: str | None) -> datetime:
                            if not s:
                                return datetime.now(UTC)
                            try:
                                return datetime.fromisoformat(s)
                            except Exception:
                                return datetime.now(UTC)

                        db_call = Call(
                            tenant_id=tenant.id,
                            call_id=data.get("call_id", call_file.stem),
                            caller_number=data.get("caller_number", ""),
                            dialed_number=data.get("dialed_number", "+18005550199"),
                            started_at=_parse_dt(data.get("started_at")),
                            ended_at=_parse_dt(data.get("ended_at")),
                            duration_s=float(data.get("duration_s", 0.0)),
                            outcome=data.get("outcome", "abandoned"),
                            urgency=urgency,
                            turn_count=int(data.get("turn_count", 0)),
                            latency_p50_ms=float(data.get("latency_p50_ms", 0.0)),
                            latency_p95_ms=float(data.get("latency_p95_ms", 0.0)),
                            turn_latencies_ms=data.get("turn_latencies_ms", []),
                            transcript=data.get("transcript", []),
                            message=data.get("message"),
                            tags=data.get("tags", []),
                        )
                        db.add(db_call)
                    except Exception:
                        pass
                db.commit()
    finally:
        db.close()


def init_db() -> None:
    """Ensure database tables exist and seed initial platform records."""
    Base.metadata.create_all(bind=engine)
    seed_initial_data()


# Initialize database schema immediately on import
init_db()


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    """Startup and shutdown events."""
    init_db()
    yield


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
)

# CORS middleware for Next.js dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(portal_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health_check() -> JSONResponse:
    """System health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "service": "api",
            "version": settings.API_VERSION,
        },
    )
