"""FastAPI application entrypoint for VedaVoice platform."""

import json
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from api.app.core.config import settings
from api.app.core.security import hash_password
from api.app.db.session import SessionLocal, engine
from api.app.models.base import Base
from api.app.models.call import Call
from api.app.models.lead_form import Lead, LeadForm
from api.app.models.subscription import Coupon, Subscription
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.routers.admin import router as admin_router
from api.app.routers.auth import router as auth_router
from api.app.routers.forms import router as forms_router
from api.app.routers.internal import router as internal_router
from api.app.routers.numbers import router as numbers_router
from api.app.routers.portal import router as portal_router
from api.app.routers.subscriptions import router as subscriptions_router


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

        # Seed Default Apex Subscription if empty
        apex_tenant = db.scalar(select(Tenant).where(Tenant.name == "Apex Plumbing & Heating"))
        if apex_tenant:
            existing_sub = db.scalar(
                select(Subscription).where(Subscription.tenant_id == apex_tenant.id)
            )
            if not existing_sub:
                db.add(
                    Subscription(
                        tenant_id=apex_tenant.id,
                        tier="starter",
                        status="active",
                        monthly_included_minutes=1000,
                        bonus_rollover_minutes=100.0,
                        used_minutes_this_cycle=18.5,
                        trial_days=14,
                        trial_minutes_allocated=100,
                        trial_minutes_used=24.0,
                        overage_rate_usd=0.20,
                        allow_overage=True,
                        stripe_customer_id="cus_mock_apex_plumbing",
                        stripe_subscription_id="sub_mock_starter_1000m",
                    )
                )

            # Seed Default Lead Form if empty
            existing_form = db.scalar(select(LeadForm).where(LeadForm.tenant_id == apex_tenant.id))
            if not existing_form:
                sample_form = LeadForm(
                    tenant_id=apex_tenant.id,
                    title="24/7 Emergency Dispatch & Service Intake",
                    description="Submit your repair details for immediate sub-2s phone triage with our AI coordinator.",
                    fields=[
                        {
                            "name": "caller_name",
                            "label": "Full Name",
                            "type": "text",
                            "required": True,
                            "placeholder": "e.g. Sarah Jenkins",
                        },
                        {
                            "name": "caller_phone",
                            "label": "Mobile Phone Number",
                            "type": "tel",
                            "required": True,
                            "placeholder": "+1 (512) 555-0144",
                        },
                        {
                            "name": "urgency",
                            "label": "Urgency Level",
                            "type": "select",
                            "required": True,
                            "options": [
                                "emergency (active leak/flood)",
                                "urgent (same day)",
                                "routine (quote/inspection)",
                            ],
                        },
                        {
                            "name": "service_requested",
                            "label": "Service Needed",
                            "type": "select",
                            "required": True,
                            "options": [
                                "Burst Pipe & Flooding",
                                "Drain Cleaning & Backup",
                                "Water Heater Repair",
                                "Slab Leak Inspection",
                                "Other Service",
                            ],
                        },
                        {
                            "name": "service_address",
                            "label": "Service Property Address",
                            "type": "text",
                            "required": False,
                            "placeholder": "123 Main St, Austin, TX",
                        },
                    ],
                    submit_action="call_triage",
                    is_active=True,
                )
                db.add(sample_form)
                db.flush()

                # Seed sample lead
                db.add(
                    Lead(
                        tenant_id=apex_tenant.id,
                        form_id=sample_form.id,
                        caller_name="Sarah Jenkins",
                        caller_phone="+15125550144",
                        urgency="emergency",
                        service_requested="Burst Pipe & Flooding",
                        service_address="412 Congress Ave, Austin, TX",
                        custom_data={"source": "Google Ads"},
                        status="pending",
                        outbound_call_triggered=True,
                    )
                )

        # Seed Default Coupons if empty
        coupon_count = db.scalar(select(func.count(Coupon.id)))
        if not coupon_count:
            db.add(
                Coupon(
                    code="LAUNCH50",
                    discount_percent=50.0,
                    bonus_minutes=200,
                    max_redemptions=500,
                    times_redeemed=4,
                    is_active=True,
                )
            )
            db.add(
                Coupon(
                    code="VEDA100",
                    discount_percent=0.0,
                    bonus_minutes=100,
                    max_redemptions=1000,
                    times_redeemed=12,
                    is_active=True,
                )
            )
            db.add(
                Coupon(
                    code="VIP20",
                    discount_percent=20.0,
                    bonus_minutes=50,
                    max_redemptions=200,
                    times_redeemed=2,
                    is_active=True,
                )
            )

        db.commit()

        # Seed Agency Pool Numbers if empty
        pool_count = db.scalar(
            select(func.count(PhoneNumber.id)).where(PhoneNumber.status == "pool")
        )
        if not pool_count:
            pool_seeds = [
                {
                    "e164": "+15129002244",
                    "provider": "livekit",
                    "label": "Agency Pool - Austin Metro",
                    "locality": "Austin",
                    "region": "TX",
                },
                {
                    "e164": "+14158003311",
                    "provider": "telnyx",
                    "label": "Agency Pool - San Francisco",
                    "locality": "San Francisco",
                    "region": "CA",
                },
                {
                    "e164": "+13127629011",
                    "provider": "twilio",
                    "label": "Agency Pool - Chicago Metro",
                    "locality": "Chicago",
                    "region": "IL",
                },
            ]
            for seed in pool_seeds:
                existing = db.scalar(select(PhoneNumber).where(PhoneNumber.e164 == seed["e164"]))
                if not existing:
                    db.add(
                        PhoneNumber(
                            tenant_id=None,
                            e164=seed["e164"],
                            provider=seed["provider"],
                            label=seed["label"],
                            locality=seed["locality"],
                            region=seed["region"],
                            trunk_id="ST_inbound_livekit_scale",
                            status="pool",
                        )
                    )
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
    if str(engine.url).startswith("sqlite"):
        with engine.connect() as conn:
            from sqlalchemy import text

            cursor = conn.execute(text("PRAGMA table_info(agent_profiles)"))
            existing_cols = {row[1] for row in cursor.fetchall()}
            if "voice_id" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN voice_id VARCHAR(64) DEFAULT 'Alex'"
                    )
                )
            if "recording_disclosure" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN recording_disclosure BOOLEAN DEFAULT 1"
                    )
                )
            if "phonetic_glossary" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN phonetic_glossary JSON DEFAULT '[]'"
                    )
                )
            if "pricing_mode" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN pricing_mode VARCHAR(32) DEFAULT 'no_quote'"
                    )
                )
            if "price_items" not in existing_cols:
                conn.execute(
                    text("ALTER TABLE agent_profiles ADD COLUMN price_items JSON DEFAULT '[]'")
                )
            if "emergency_mode" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN emergency_mode VARCHAR(64) DEFAULT 'priority_message'"
                    )
                )
            if "approved_safety_script" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN approved_safety_script TEXT DEFAULT ''"
                    )
                )
            if "service_area" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN service_area VARCHAR(255) DEFAULT ''"
                    )
                )
            if "service_cities" not in existing_cols:
                conn.execute(
                    text("ALTER TABLE agent_profiles ADD COLUMN service_cities JSON DEFAULT '[]'")
                )
            if "after_hours_policy" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN after_hours_policy VARCHAR(64) DEFAULT 'take_message_all'"
                    )
                )
            if "out_of_area_policy" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN out_of_area_policy VARCHAR(64) DEFAULT 'polite_decline'"
                    )
                )
            if "notification_email" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN notification_email VARCHAR(255) DEFAULT ''"
                    )
                )
            if "notification_phone" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN notification_phone VARCHAR(32) DEFAULT ''"
                    )
                )
            if "notify_on_all_calls" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN notify_on_all_calls BOOLEAN DEFAULT 1"
                    )
                )
            if "notify_sms_on_emergency" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN notify_sms_on_emergency BOOLEAN DEFAULT 1"
                    )
                )

            # Tenants table capacity columns
            cursor = conn.execute(text("PRAGMA table_info(tenants)"))
            existing_tenant_cols = {row[1] for row in cursor.fetchall()}
            if "max_concurrent_calls" not in existing_tenant_cols:
                conn.execute(
                    text(
                        "ALTER TABLE tenants ADD COLUMN max_concurrent_calls INTEGER DEFAULT 3 NOT NULL"
                    )
                )
            if "max_concurrent_outbound" not in existing_tenant_cols:
                conn.execute(
                    text(
                        "ALTER TABLE tenants ADD COLUMN max_concurrent_outbound INTEGER DEFAULT 2 NOT NULL"
                    )
                )
            if "monthly_minute_quota" not in existing_tenant_cols:
                conn.execute(
                    text(
                        "ALTER TABLE tenants ADD COLUMN monthly_minute_quota INTEGER DEFAULT 500 NOT NULL"
                    )
                )

            # Calls table direction column
            cursor = conn.execute(text("PRAGMA table_info(calls)"))
            existing_call_cols = {row[1] for row in cursor.fetchall()}
            if "direction" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN direction VARCHAR(16) DEFAULT 'inbound' NOT NULL"
                    )
                )

            # Phone numbers table columns
            cursor = conn.execute(text("PRAGMA table_info(phone_numbers)"))
            existing_phone_cols = {row[1] for row in cursor.fetchall()}
            if "purpose" not in existing_phone_cols:
                conn.execute(
                    text(
                        "ALTER TABLE phone_numbers ADD COLUMN purpose VARCHAR(32) DEFAULT 'inbound_outbound' NOT NULL"
                    )
                )
            if "label" not in existing_phone_cols:
                conn.execute(
                    text(
                        "ALTER TABLE phone_numbers ADD COLUMN label VARCHAR(64) DEFAULT 'Main Inbound Line' NOT NULL"
                    )
                )
            if "locality" not in existing_phone_cols:
                conn.execute(
                    text(
                        "ALTER TABLE phone_numbers ADD COLUMN locality VARCHAR(64) DEFAULT '' NOT NULL"
                    )
                )
            if "region" not in existing_phone_cols:
                conn.execute(
                    text(
                        "ALTER TABLE phone_numbers ADD COLUMN region VARCHAR(16) DEFAULT 'US' NOT NULL"
                    )
                )
            if "trunk_id" not in existing_phone_cols:
                conn.execute(
                    text(
                        "ALTER TABLE phone_numbers ADD COLUMN trunk_id VARCHAR(64) DEFAULT 'ST_inbound_livekit_scale' NOT NULL"
                    )
                )

            # Subscriptions table columns for 1-sub-per-month locking
            cursor = conn.execute(text("PRAGMA table_info(subscriptions)"))
            existing_sub_cols = {row[1] for row in cursor.fetchall()}
            if "auto_renew" not in existing_sub_cols:
                conn.execute(
                    text(
                        "ALTER TABLE subscriptions ADD COLUMN auto_renew BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "pending_tier" not in existing_sub_cols:
                conn.execute(
                    text("ALTER TABLE subscriptions ADD COLUMN pending_tier VARCHAR(32) NULL")
                )
            if "pending_effective_at" not in existing_sub_cols:
                conn.execute(
                    text("ALTER TABLE subscriptions ADD COLUMN pending_effective_at DATETIME NULL")
                )
            if "cycle_change_locked_until" not in existing_sub_cols:
                conn.execute(
                    text(
                        "ALTER TABLE subscriptions ADD COLUMN cycle_change_locked_until DATETIME NULL"
                    )
                )

            # Check if tenant_id has NOT NULL constraint and migrate if needed
            cursor = conn.execute(text("PRAGMA table_info(phone_numbers)"))
            cols_info = {row[1]: row for row in cursor.fetchall()}
            if cols_info.get("tenant_id") and cols_info["tenant_id"][3] == 1:
                conn.execute(text("PRAGMA foreign_keys=OFF;"))
                conn.execute(
                    text(
                        """
                        CREATE TABLE phone_numbers_new (
                            id VARCHAR(36) PRIMARY KEY,
                            tenant_id VARCHAR(36) NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            e164 VARCHAR(32) UNIQUE NOT NULL,
                            provider VARCHAR(32) NOT NULL DEFAULT 'livekit',
                            purpose VARCHAR(32) NOT NULL DEFAULT 'inbound_outbound',
                            label VARCHAR(64) NOT NULL DEFAULT 'Main Inbound Line',
                            locality VARCHAR(64) NOT NULL DEFAULT '',
                            region VARCHAR(16) NOT NULL DEFAULT 'US',
                            trunk_id VARCHAR(64) NOT NULL DEFAULT 'ST_inbound_livekit_scale',
                            status VARCHAR(32) NOT NULL DEFAULT 'active',
                            created_at DATETIME NOT NULL
                        );
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        INSERT INTO phone_numbers_new (id, tenant_id, e164, provider, purpose, label, locality, region, trunk_id, status, created_at)
                        SELECT id, tenant_id, e164, provider, purpose, label, locality, region, trunk_id, status, created_at FROM phone_numbers;
                        """
                    )
                )
                conn.execute(text("DROP TABLE phone_numbers;"))
                conn.execute(text("ALTER TABLE phone_numbers_new RENAME TO phone_numbers;"))
                conn.execute(text("PRAGMA foreign_keys=ON;"))

            conn.commit()
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
app.include_router(numbers_router, prefix="/api/v1")
app.include_router(portal_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/api/v1")
app.include_router(subscriptions_router)
app.include_router(forms_router)


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
