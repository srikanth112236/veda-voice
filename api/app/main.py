"""FastAPI application entrypoint for VedaVoice platform."""

import asyncio
import json
import logging
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
from api.app.models.compliance import ConsentText, StateRule
from api.app.models.entitlement import (
    FeatureFlag,
    Plan,
)
from api.app.models.lead_form import Lead, LeadForm
from api.app.models.subscription import Coupon, Subscription
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.routers.admin import router as admin_router
from api.app.routers.agency import router as agency_router
from api.app.routers.auth import router as auth_router
from api.app.routers.calendar import router as calendar_router
from api.app.routers.compliance import router as compliance_router
from api.app.routers.crm import router as crm_router
from api.app.routers.forms import router as forms_router
from api.app.routers.industry_packs import router as industry_packs_router
from api.app.routers.integrations import router as integrations_router
from api.app.routers.internal import router as internal_router
from api.app.routers.knowledge import router as knowledge_router
from api.app.routers.leads import router as leads_router
from api.app.routers.locations import router as locations_router
from api.app.routers.numbers import router as numbers_router
from api.app.routers.portal import router as portal_router
from api.app.routers.staff import router as staff_router
from api.app.routers.subscriptions import router as subscriptions_router
from api.app.services.entitlements import DEFAULT_FEATURE_FLAGS, PLAN_ENTITLEMENTS_MATRIX
from api.app.services.industry_packs import seed_default_industry_packs


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

        # Seed US State Compliance Rules (Milestone M5b)
        state_rules_count = db.scalar(select(func.count(StateRule.state)))
        if not state_rules_count:
            default_rules = [
                StateRule(
                    state="US",
                    window_start="08:00",
                    window_end="21:00",
                    max_attempts_24h=None,
                    requires_state_dnc=False,
                    all_party_recording=False,
                    ai_disclosure_required=True,
                    notes="Federal TCPA default baseline (8am-9pm local recipient time)",
                ),
                StateRule(
                    state="FL",
                    window_start="08:00",
                    window_end="20:00",
                    max_attempts_24h=3,
                    requires_state_dnc=True,
                    all_party_recording=True,
                    ai_disclosure_required=True,
                    notes="Florida FTSA: 8am-8pm, max 3 attempts per 24h, two-party consent",
                ),
                StateRule(
                    state="OK",
                    window_start="08:00",
                    window_end="20:00",
                    max_attempts_24h=3,
                    requires_state_dnc=True,
                    all_party_recording=False,
                    ai_disclosure_required=True,
                    notes="Oklahoma OTSA: 8am-8pm, max 3 attempts per 24h on same subject",
                ),
                StateRule(
                    state="MD",
                    window_start="08:00",
                    window_end="20:00",
                    max_attempts_24h=3,
                    requires_state_dnc=True,
                    all_party_recording=True,
                    ai_disclosure_required=True,
                    notes="Maryland Stop the Spam Calls Act: 8am-8pm, two-party recording consent",
                ),
                StateRule(
                    state="WA",
                    window_start="08:00",
                    window_end="20:00",
                    max_attempts_24h=3,
                    requires_state_dnc=True,
                    all_party_recording=True,
                    ai_disclosure_required=True,
                    notes="Washington Commercial Electronic Mail & Two-Party Recording Consent",
                ),
                StateRule(
                    state="CA",
                    window_start="08:00",
                    window_end="21:00",
                    max_attempts_24h=None,
                    requires_state_dnc=False,
                    all_party_recording=True,
                    ai_disclosure_required=True,
                    notes="California Cal. Penal Code § 632 two-party consent; strict AI bot disclosure",
                ),
                StateRule(
                    state="TX",
                    window_start="08:00",
                    window_end="21:00",
                    max_attempts_24h=None,
                    requires_state_dnc=True,
                    all_party_recording=False,
                    ai_disclosure_required=True,
                    notes="Texas Business & Commerce Code: 8am-9pm, state DNC registration",
                ),
            ]
            for rule in default_rules:
                db.add(rule)
            db.commit()

        # Seed Standard Legal Consent Text if empty
        consent_text_count = db.scalar(select(func.count(ConsentText.id)))
        if not consent_text_count:
            db.add(
                ConsentText(
                    tenant_id=None,
                    version=1,
                    body=(
                        "By submitting this form, you authorize {seller_name} and its automated AI voice system "
                        "to contact you at the phone number provided regarding your inquiry, including calls initiated "
                        "by an automated dialing system. Consent is not a condition of purchase."
                    ),
                )
            )
            db.commit()

        # Seed 7-Plan Ladder if empty (Milestone M5c)
        plan_count = db.scalar(select(func.count(Plan.code)))
        if not plan_count:
            plans_data = [
                Plan(
                    code="lite",
                    name="Lite",
                    track="direct",
                    price_cents=9900,
                    included_minutes=300,
                    overage_cents_per_min=40,
                    max_concurrent_calls=2,
                    max_concurrent_outbound=1,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["lite"],
                    public=True,
                    sort_order=10,
                ),
                Plan(
                    code="starter",
                    name="Starter",
                    track="direct",
                    price_cents=29900,
                    included_minutes=1000,
                    overage_cents_per_min=35,
                    max_concurrent_calls=3,
                    max_concurrent_outbound=1,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["starter"],
                    public=True,
                    sort_order=20,
                ),
                Plan(
                    code="growth",
                    name="Growth",
                    track="direct",
                    price_cents=39900,
                    included_minutes=1500,
                    overage_cents_per_min=35,
                    max_concurrent_calls=5,
                    max_concurrent_outbound=2,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["growth"],
                    public=True,
                    sort_order=30,
                ),
                Plan(
                    code="pro",
                    name="Pro",
                    track="direct",
                    price_cents=49900,
                    included_minutes=2000,
                    overage_cents_per_min=35,
                    max_concurrent_calls=8,
                    max_concurrent_outbound=3,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["pro"],
                    public=True,
                    sort_order=40,
                ),
                Plan(
                    code="scale",
                    name="Scale",
                    track="direct",
                    price_cents=99900,
                    included_minutes=4000,
                    overage_cents_per_min=30,
                    max_concurrent_calls=20,
                    max_concurrent_outbound=5,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["scale"],
                    public=True,
                    sort_order=50,
                ),
                Plan(
                    code="enterprise",
                    name="Enterprise",
                    track="enterprise",
                    price_cents=None,
                    included_minutes=None,
                    overage_cents_per_min=None,
                    max_concurrent_calls=40,
                    max_concurrent_outbound=10,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["enterprise"],
                    public=False,
                    sort_order=60,
                ),
                Plan(
                    code="agency",
                    name="Agency",
                    track="agency",
                    price_cents=100000,
                    included_minutes=5000,
                    overage_cents_per_min=25,
                    max_concurrent_calls=40,
                    max_concurrent_outbound=10,
                    entitlements=PLAN_ENTITLEMENTS_MATRIX["agency"],
                    public=False,
                    sort_order=70,
                ),
            ]
            for p in plans_data:
                db.add(p)
            db.commit()

        # Seed Feature Flags Catalog if empty (Milestone M5d)
        flag_count = db.scalar(select(func.count(FeatureFlag.key)))
        if not flag_count:
            for flag in DEFAULT_FEATURE_FLAGS:
                db.add(
                    FeatureFlag(
                        key=flag["key"],
                        kind=flag["kind"],
                        description=flag["description"],
                        default_value=flag["default_value"],
                        compliance_sensitive=flag["compliance_sensitive"],
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
                # Seed Launch Industry Packs
                seed_default_industry_packs(db)
                db.commit()

        # Phase 3: Automated Historical Call Backfill to Native CRM
        from api.app.services.crm_ingest import backfill_orphaned_calls_to_crm

        backfill_orphaned_calls_to_crm(db)
    finally:
        db.close()


def init_db() -> None:
    """Ensure database tables exist and seed initial platform records."""
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        import logging

        logging.getLogger("uvicorn.error").warning(f"Database init skipped or deferred: {exc}")
        return

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
            if "bilingual_spanish_enabled" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN bilingual_spanish_enabled BOOLEAN DEFAULT 0 NOT NULL"
                    )
                )
            if "patience_cadence" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN patience_cadence VARCHAR(32) DEFAULT 'balanced' NOT NULL"
                    )
                )
            if "silence_timeout_ms" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN silence_timeout_ms INTEGER DEFAULT 500 NOT NULL"
                    )
                )
            if "speech_barge_in" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN speech_barge_in BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "adaptive_empathy" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN adaptive_empathy BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "background_ambience" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN background_ambience VARCHAR(64) DEFAULT 'studio_clean' NOT NULL"
                    )
                )
            if "barred_phrases" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN barred_phrases JSON DEFAULT '[]' NOT NULL"
                    )
                )
            if "intake_questions" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN intake_questions JSON DEFAULT '[]' NOT NULL"
                    )
                )
            if "office_override_mode" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN office_override_mode VARCHAR(32) DEFAULT 'normal' NOT NULL"
                    )
                )
            if "office_override_announcement" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN office_override_announcement TEXT DEFAULT '' NOT NULL"
                    )
                )
            if "vip_returning_caller_enabled" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN vip_returning_caller_enabled BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "vip_returning_greeting" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN vip_returning_greeting TEXT DEFAULT '' NOT NULL"
                    )
                )
            if "mid_call_sms_enabled" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN mid_call_sms_enabled BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "disconnect_recovery_sms_enabled" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN disconnect_recovery_sms_enabled BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "disconnect_recovery_sms_text" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN disconnect_recovery_sms_text TEXT DEFAULT '' NOT NULL"
                    )
                )
            if "scheduling_mode" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN scheduling_mode VARCHAR(32) DEFAULT 'exact_time' NOT NULL"
                    )
                )
            if "arrival_window_hours" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN arrival_window_hours INTEGER DEFAULT 2 NOT NULL"
                    )
                )
            if "calendar_buffer_minutes" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN calendar_buffer_minutes INTEGER DEFAULT 15 NOT NULL"
                    )
                )
            if "calendar_buffer_mode" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN calendar_buffer_mode VARCHAR(32) DEFAULT 'after' NOT NULL"
                    )
                )
            if "calendar_buffer_reason" not in existing_cols:
                conn.execute(
                    text(
                        "ALTER TABLE agent_profiles ADD COLUMN calendar_buffer_reason VARCHAR(64) DEFAULT 'travel_and_reset' NOT NULL"
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
            if "config" not in existing_tenant_cols:
                conn.execute(
                    text("ALTER TABLE tenants ADD COLUMN config JSON DEFAULT '{}' NOT NULL")
                )

            # Calls table columns
            cursor = conn.execute(text("PRAGMA table_info(calls)"))
            existing_call_cols = {row[1] for row in cursor.fetchall()}
            if "direction" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN direction VARCHAR(16) DEFAULT 'inbound' NOT NULL"
                    )
                )
            if "billable_minutes" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN billable_minutes INTEGER DEFAULT 0 NOT NULL")
                )
            if "llm_prompt_tokens" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN llm_prompt_tokens INTEGER DEFAULT 0 NOT NULL"
                    )
                )
            if "llm_completion_tokens" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN llm_completion_tokens INTEGER DEFAULT 0 NOT NULL"
                    )
                )
            if "sentiment_score" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN sentiment_score FLOAT DEFAULT 0.0 NOT NULL")
                )
            if "sentiment_label" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN sentiment_label VARCHAR(32) DEFAULT 'neutral' NOT NULL"
                    )
                )
            if "lead_score" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN lead_score FLOAT DEFAULT 50.0 NOT NULL")
                )
            if "lost_reason" not in existing_call_cols:
                conn.execute(text("ALTER TABLE calls ADD COLUMN lost_reason VARCHAR(64) NULL"))
            if "key_objections" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN key_objections JSON DEFAULT '[]' NOT NULL")
                )
            if "supervisor_whispers" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN supervisor_whispers JSON DEFAULT '[]' NOT NULL"
                    )
                )
            if "is_followed_up" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN is_followed_up BOOLEAN DEFAULT 0 NOT NULL")
                )
            if "recording_channels" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN recording_channels INTEGER DEFAULT 2 NOT NULL"
                    )
                )

            # Usage records table columns
            cursor = conn.execute(text("PRAGMA table_info(usage_records)"))
            existing_usage_cols = {row[1] for row in cursor.fetchall()}
            if "llm_prompt_tokens" not in existing_usage_cols:
                conn.execute(
                    text(
                        "ALTER TABLE usage_records ADD COLUMN llm_prompt_tokens INTEGER DEFAULT 0 NOT NULL"
                    )
                )
            if "llm_completion_tokens" not in existing_usage_cols:
                conn.execute(
                    text(
                        "ALTER TABLE usage_records ADD COLUMN llm_completion_tokens INTEGER DEFAULT 0 NOT NULL"
                    )
                )
            if "tts_characters" not in existing_usage_cols:
                conn.execute(
                    text(
                        "ALTER TABLE usage_records ADD COLUMN tts_characters INTEGER DEFAULT 0 NOT NULL"
                    )
                )
            if "estimated_cogs_usd" not in existing_usage_cols:
                conn.execute(
                    text(
                        "ALTER TABLE usage_records ADD COLUMN estimated_cogs_usd FLOAT DEFAULT 0.0 NOT NULL"
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

            # Outbound dispatches table columns
            cursor = conn.execute(text("PRAGMA table_info(outbound_dispatches)"))
            existing_outbound_cols = {row[1] for row in cursor.fetchall()}
            if "scheduled_for" not in existing_outbound_cols:
                conn.execute(
                    text("ALTER TABLE outbound_dispatches ADD COLUMN scheduled_for DATETIME NULL")
                )

            # Consent records table columns (Milestone M5b US Compliance v2)
            cursor = conn.execute(text("PRAGMA table_info(consent_records)"))
            existing_consent_cols = {row[1] for row in cursor.fetchall()}
            if "category" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN category VARCHAR(16) DEFAULT 'B' NOT NULL"
                    )
                )
            if "consent_text_id" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN consent_text_id VARCHAR(36) NULL REFERENCES consent_texts(id)"
                    )
                )
            if "ai_voice_disclosed" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN ai_voice_disclosed BOOLEAN DEFAULT 1 NOT NULL"
                    )
                )
            if "method" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN method VARCHAR(32) DEFAULT 'web_form' NOT NULL"
                    )
                )
            if "form_url" not in existing_consent_cols:
                conn.execute(
                    text("ALTER TABLE consent_records ADD COLUMN form_url VARCHAR(512) NULL")
                )
            if "seller_name" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN seller_name VARCHAR(255) DEFAULT '' NOT NULL"
                    )
                )
            if "user_agent" not in existing_consent_cols:
                conn.execute(
                    text("ALTER TABLE consent_records ADD COLUMN user_agent VARCHAR(255) NULL")
                )
            if "revoked_at" not in existing_consent_cols:
                conn.execute(
                    text("ALTER TABLE consent_records ADD COLUMN revoked_at DATETIME NULL")
                )
            if "revoked_via" not in existing_consent_cols:
                conn.execute(
                    text("ALTER TABLE consent_records ADD COLUMN revoked_via VARCHAR(64) NULL")
                )
            if "revoked_at_call_id" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN revoked_at_call_id VARCHAR(128) NULL"
                    )
                )
            if "retention_until" not in existing_consent_cols:
                conn.execute(
                    text(
                        "ALTER TABLE consent_records ADD COLUMN retention_until DATETIME DEFAULT (DATETIME('now', '+5 years')) NOT NULL"
                    )
                )

            # Contacts table columns
            cursor = conn.execute(text("PRAGMA table_info(contacts)"))
            existing_contact_cols = {row[1] for row in cursor.fetchall()}
            if "is_callable" not in existing_contact_cols:
                conn.execute(
                    text("ALTER TABLE contacts ADD COLUMN is_callable BOOLEAN DEFAULT 1 NOT NULL")
                )

            # Calls table supervisor & transfer columns
            cursor = conn.execute(text("PRAGMA table_info(calls)"))
            existing_call_cols = {row[1] for row in cursor.fetchall()}
            if "barge_in_active" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN barge_in_active BOOLEAN DEFAULT 0 NOT NULL")
                )
            if "takeover_active" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN takeover_active BOOLEAN DEFAULT 0 NOT NULL")
                )
            if "transfer_to_number" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN transfer_to_number VARCHAR(64) NULL")
                )
            if "transferred_at" not in existing_call_cols:
                conn.execute(text("ALTER TABLE calls ADD COLUMN transferred_at DATETIME NULL"))
            if "transferred_by" not in existing_call_cols:
                conn.execute(text("ALTER TABLE calls ADD COLUMN transferred_by VARCHAR(64) NULL"))
            if "qa_score" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN qa_score FLOAT DEFAULT 100.0 NOT NULL")
                )
            if "qa_rubric" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN qa_rubric JSON DEFAULT '{}' NOT NULL")
                )
            if "qa_flags" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN qa_flags JSON DEFAULT '[]' NOT NULL")
                )
            if "csat_score" not in existing_call_cols:
                conn.execute(
                    text("ALTER TABLE calls ADD COLUMN csat_score FLOAT DEFAULT 5.0 NOT NULL")
                )
            if "csat_rationale" not in existing_call_cols:
                conn.execute(text("ALTER TABLE calls ADD COLUMN csat_rationale VARCHAR(512) NULL"))
            if "qa_reviewed_by" not in existing_call_cols:
                conn.execute(text("ALTER TABLE calls ADD COLUMN qa_reviewed_by VARCHAR(64) NULL"))
            if "qa_reviewed_at" not in existing_call_cols:
                conn.execute(text("ALTER TABLE calls ADD COLUMN qa_reviewed_at DATETIME NULL"))

            # Bookings table multi-staff dispatch columns (Milestone M10b)
            cursor = conn.execute(text("PRAGMA table_info(bookings)"))
            existing_booking_cols = {row[1] for row in cursor.fetchall()}
            if "staff_id" not in existing_booking_cols:
                conn.execute(
                    text(
                        "ALTER TABLE bookings ADD COLUMN staff_id VARCHAR(36) NULL REFERENCES staff_members(id) ON DELETE SET NULL"
                    )
                )
            if "postal_code" not in existing_booking_cols:
                conn.execute(text("ALTER TABLE bookings ADD COLUMN postal_code VARCHAR(16) NULL"))
            if "location_id" not in existing_booking_cols:
                conn.execute(
                    text(
                        "ALTER TABLE bookings ADD COLUMN location_id VARCHAR(36) NULL REFERENCES locations(id) ON DELETE SET NULL"
                    )
                )
            if "is_arrival_window" not in existing_booking_cols:
                conn.execute(
                    text(
                        "ALTER TABLE bookings ADD COLUMN is_arrival_window BOOLEAN DEFAULT 0 NOT NULL"
                    )
                )
            if "arrival_window_start" not in existing_booking_cols:
                conn.execute(
                    text("ALTER TABLE bookings ADD COLUMN arrival_window_start DATETIME NULL")
                )
            if "arrival_window_end" not in existing_booking_cols:
                conn.execute(
                    text("ALTER TABLE bookings ADD COLUMN arrival_window_end DATETIME NULL")
                )

            # Multi-Location columns (Milestone M11)
            cursor = conn.execute(text("PRAGMA table_info(phone_numbers)"))
            existing_phone_cols = {row[1] for row in cursor.fetchall()}
            if "location_id" not in existing_phone_cols:
                conn.execute(
                    text(
                        "ALTER TABLE phone_numbers ADD COLUMN location_id VARCHAR(36) NULL REFERENCES locations(id) ON DELETE SET NULL"
                    )
                )

            cursor = conn.execute(text("PRAGMA table_info(staff_members)"))
            existing_staff_cols = {row[1] for row in cursor.fetchall()}
            if "location_id" not in existing_staff_cols:
                conn.execute(
                    text(
                        "ALTER TABLE staff_members ADD COLUMN location_id VARCHAR(36) NULL REFERENCES locations(id) ON DELETE SET NULL"
                    )
                )

            cursor = conn.execute(text("PRAGMA table_info(calls)"))
            existing_call_cols = {row[1] for row in cursor.fetchall()}
            if "location_id" not in existing_call_cols:
                conn.execute(
                    text(
                        "ALTER TABLE calls ADD COLUMN location_id VARCHAR(36) NULL REFERENCES locations(id) ON DELETE SET NULL"
                    )
                )

            cursor = conn.execute(text("PRAGMA table_info(users)"))
            existing_user_cols = {row[1] for row in cursor.fetchall()}
            if "location_ids" not in existing_user_cols:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN location_ids JSON DEFAULT '[]' NOT NULL")
                )

            # Subscriptions table billing increment column
            cursor = conn.execute(text("PRAGMA table_info(subscriptions)"))
            existing_sub_cols = {row[1] for row in cursor.fetchall()}
            if "billing_increment" not in existing_sub_cols:
                conn.execute(
                    text(
                        "ALTER TABLE subscriptions ADD COLUMN billing_increment VARCHAR(16) DEFAULT 'minute' NOT NULL"
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

            # CRM connections table columns (Secret Vault Key Fingerprint)
            cursor = conn.execute(text("PRAGMA table_info(crm_connections)"))
            existing_crm_cols = {row[1] for row in cursor.fetchall()}
            if "key_fingerprint" not in existing_crm_cols:
                conn.execute(
                    text("ALTER TABLE crm_connections ADD COLUMN key_fingerprint VARCHAR(32) NULL")
                )

            conn.commit()

    if "postgresql" in str(engine.url) or "psycopg" in str(engine.url):
        with engine.connect() as conn:
            from sqlalchemy import text

            pg_statements = [
                "ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_followed_up BOOLEAN DEFAULT FALSE NOT NULL;",
                "ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_channels INTEGER DEFAULT 2 NOT NULL;",
                "ALTER TABLE crm_connections ADD COLUMN IF NOT EXISTS key_fingerprint VARCHAR(32) NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS bilingual_spanish_enabled BOOLEAN DEFAULT FALSE NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS patience_cadence VARCHAR(32) DEFAULT 'balanced' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS silence_timeout_ms INTEGER DEFAULT 500 NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS speech_barge_in BOOLEAN DEFAULT TRUE NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS adaptive_empathy BOOLEAN DEFAULT TRUE NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS background_ambience VARCHAR(64) DEFAULT 'studio_clean' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS barred_phrases JSON DEFAULT '[]' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS intake_questions JSON DEFAULT '[]' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS office_override_mode VARCHAR(32) DEFAULT 'normal' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS office_override_announcement TEXT DEFAULT '' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS vip_returning_caller_enabled BOOLEAN DEFAULT TRUE NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS vip_returning_greeting TEXT DEFAULT '' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS mid_call_sms_enabled BOOLEAN DEFAULT TRUE NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS disconnect_recovery_sms_enabled BOOLEAN DEFAULT TRUE NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS disconnect_recovery_sms_text TEXT DEFAULT '' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS scheduling_mode VARCHAR(32) DEFAULT 'exact_time' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS arrival_window_hours INTEGER DEFAULT 2 NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS calendar_buffer_minutes INTEGER DEFAULT 15 NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS calendar_buffer_mode VARCHAR(32) DEFAULT 'after' NOT NULL;",
                "ALTER TABLE agent_profiles ADD COLUMN IF NOT EXISTS calendar_buffer_reason VARCHAR(64) DEFAULT 'travel_and_reset' NOT NULL;",
                "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_arrival_window BOOLEAN DEFAULT FALSE NOT NULL;",
                "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_window_start TIMESTAMP WITH TIME ZONE NULL;",
                "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrival_window_end TIMESTAMP WITH TIME ZONE NULL;",
            ]
            for stmt in pg_statements:
                try:
                    conn.execute(text(stmt))
                    conn.commit()
                except Exception:
                    conn.rollback()

    seed_initial_data()


# ============================================================================
# AUTOMATED CRM TRANSACTIONAL OUTBOX BACKGROUND SWEEPER LOOP (GAP #1)
# ============================================================================

logger = logging.getLogger("vedavoice.outbox_sweeper")


async def run_crm_outbox_sweeper_cycle(batch_size: int = 50) -> dict[str, Any]:
    """Execute one pass of the outbox processor using an isolated DB session."""
    from api.app.services.integrations.outbox_worker import process_outbox_batch

    with SessionLocal() as db:
        return await process_outbox_batch(db, batch_size=batch_size)


async def _crm_outbox_sweeper_loop(
    stop_event: asyncio.Event, interval_seconds: float = 60.0
) -> None:
    """Background periodic worker polling the CRM transactional outbox for pending & retryable sync jobs."""
    logger.info("CRM Outbox Sweeper loop started (interval: %ss).", interval_seconds)
    while not stop_event.is_set():
        try:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
                break  # stop_event was signaled
            except TimeoutError:
                pass

            res = await run_crm_outbox_sweeper_cycle()
            if res.get("processed", 0) > 0:
                logger.info(
                    "CRM Outbox Sweeper completed cycle: %d processed, %d succeeded, %d failed, %d dead.",
                    res["processed"],
                    res["succeeded"],
                    res["failed"],
                    res["dead"],
                )
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("CRM Outbox Sweeper cycle encountered error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    """Startup and shutdown lifecycle with automated outbox sweeper."""
    try:
        init_db()
    except Exception as exc:
        logging.getLogger("uvicorn.error").error(f"Startup DB init error: {exc}")

    # Start automated 60-second background outbox sweeper
    stop_event = asyncio.Event()
    sweeper_task = asyncio.create_task(_crm_outbox_sweeper_loop(stop_event))

    try:
        yield
    finally:
        stop_event.set()
        sweeper_task.cancel()
        try:
            await asyncio.wait_for(sweeper_task, timeout=5.0)
        except (asyncio.CancelledError, TimeoutError, Exception):
            pass


app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    lifespan=lifespan,
)

# CORS middleware for Next.js dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.azurecontainerapps\.io|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(agency_router, prefix="/api/v1")
app.include_router(agency_router)
app.include_router(numbers_router, prefix="/api/v1")
app.include_router(portal_router, prefix="/api/v1")
app.include_router(calendar_router, prefix="/api/v1")
app.include_router(staff_router, prefix="/api/v1")
app.include_router(staff_router)
app.include_router(internal_router, prefix="/api/v1")
app.include_router(subscriptions_router)
app.include_router(forms_router)
app.include_router(crm_router)
app.include_router(leads_router)
app.include_router(integrations_router)
app.include_router(compliance_router)
app.include_router(knowledge_router, prefix="/api/v1")
app.include_router(knowledge_router)
app.include_router(industry_packs_router, prefix="/api/v1")
app.include_router(industry_packs_router)
app.include_router(locations_router, prefix="/api/v1")
app.include_router(locations_router)


@app.get("/", tags=["system"])
@app.get("/health", tags=["system"])
@app.get("/api/health", tags=["system"])
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
