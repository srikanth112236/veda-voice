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
from api.app.models.industry_pack import (
    IndustryPack,  # noqa: F401
    IndustryPackVersion,  # noqa: F401
    TenantPackApplication,  # noqa: F401
)
from api.app.models.knowledge import (
    KnowledgeChunk,  # noqa: F401
    KnowledgeDocument,  # noqa: F401
)
from api.app.models.lead_form import Lead, LeadForm
from api.app.models.subscription import Coupon, Subscription
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.routers.admin import router as admin_router
from api.app.routers.agency import router as agency_router
from api.app.routers.auth import router as auth_router
from api.app.routers.calendar import router as calendar_router
from api.app.routers.campaigns import router as campaigns_router
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
from api.app.routers.public_reschedule import router as public_reschedule_router
from api.app.routers.quotes_invoices import router as quotes_invoices_router
from api.app.routers.staff import router as staff_router
from api.app.routers.subscriptions import router as subscriptions_router
from api.app.services.entitlements import DEFAULT_FEATURE_FLAGS, PLAN_ENTITLEMENTS_MATRIX
from api.app.services.industry_packs import seed_default_industry_packs


def seed_initial_data() -> None:
    """Initialize platform admin, default tenant, and import existing call records."""
    db = SessionLocal()
    try:
        # 0. Seed Default Industry Packs if not present
        try:
            seed_default_industry_packs(db)
        except Exception as exc:
            logging.getLogger("uvicorn.error").warning(
                "Initial industry packs seeding deferred: %s", exc
            )

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

        # 2. Seed Default Apex Plumbing Tenant in non-production environments only
        if settings.ENVIRONMENT.lower() in ("prod", "production"):
            return
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

                        started_dt = _parse_dt(data.get("started_at"))
                        ended_dt = _parse_dt(data.get("ended_at"))
                        raw_duration_s = float(data.get("duration_s", 0.0))
                        if raw_duration_s <= 0 and ended_dt > started_dt:
                            raw_duration_s = round((ended_dt - started_dt).total_seconds(), 2)

                        from api.app.services.call_intelligence import (
                            extract_post_call_intelligence,
                        )
                        from api.app.services.qa_scoring import evaluate_call_qa

                        transcript_data = data.get("transcript", [])
                        outcome_val = data.get("outcome", "abandoned")
                        latency_p50_val = float(data.get("latency_p50_ms", 0.0))
                        intel = extract_post_call_intelligence(
                            transcript=transcript_data,
                            outcome=outcome_val,
                            urgency=urgency,
                        )
                        qa_eval = evaluate_call_qa(
                            transcript=transcript_data,
                            business_name=tenant.name,
                            recording_disclosure=True,
                            message=data.get("message"),
                            outcome=outcome_val,
                            urgency=urgency,
                            latency_p50_ms=latency_p50_val,
                            sentiment_label=intel["sentiment_label"],
                        )

                        db_call = Call(
                            tenant_id=tenant.id,
                            call_id=data.get("call_id", call_file.stem),
                            caller_number=data.get("caller_number", ""),
                            dialed_number=data.get("dialed_number", "+18005550199"),
                            started_at=started_dt,
                            ended_at=ended_dt,
                            duration_s=raw_duration_s,
                            outcome=outcome_val,
                            urgency=urgency,
                            turn_count=int(data.get("turn_count", 0)),
                            latency_p50_ms=latency_p50_val,
                            latency_p95_ms=float(data.get("latency_p95_ms", 0.0)),
                            eou_p50_ms=float(data.get("eou_p50_ms", 0.0)),
                            eou_p95_ms=float(data.get("eou_p95_ms", 0.0)),
                            ttft_p50_ms=float(data.get("ttft_p50_ms", 0.0)),
                            ttft_p95_ms=float(data.get("ttft_p95_ms", 0.0)),
                            ttfb_p50_ms=float(data.get("ttfb_p50_ms", 0.0)),
                            ttfb_p95_ms=float(data.get("ttfb_p95_ms", 0.0)),
                            turn_latencies_ms=data.get("turn_latencies_ms", []),
                            transcript=transcript_data,
                            message=data.get("message"),
                            tags=data.get("tags", []),
                            sentiment_score=intel["sentiment_score"],
                            sentiment_label=intel["sentiment_label"],
                            lead_score=intel["lead_score"],
                            lost_reason=intel["lost_reason"],
                            key_objections=intel["key_objections"],
                            qa_score=qa_eval["qa_score"],
                            qa_rubric=qa_eval["rubric_breakdown"],
                            qa_flags=qa_eval["qa_flags"],
                            csat_score=qa_eval["csat_score"],
                            csat_rationale=qa_eval["csat_rationale"],
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


def _pg_column_ddl(col: Any) -> str:
    """Return a PostgreSQL column type + optional scalar default DDL fragment."""
    from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text

    col_type = col.type
    if isinstance(col_type, Boolean):
        sql_type = "BOOLEAN"
    elif isinstance(col_type, Integer):
        sql_type = "INTEGER"
    elif isinstance(col_type, Float):
        sql_type = "DOUBLE PRECISION"
    elif isinstance(col_type, DateTime):
        sql_type = (
            "TIMESTAMP WITH TIME ZONE"
            if getattr(col_type, "timezone", False)
            else "TIMESTAMP WITHOUT TIME ZONE"
        )
    elif isinstance(col_type, JSON):
        sql_type = "JSON"
    elif isinstance(col_type, Text):
        sql_type = "TEXT"
    elif isinstance(col_type, String):
        length = getattr(col_type, "length", None)
        sql_type = f"VARCHAR({length})" if length else "VARCHAR"
    else:
        sql_type = "TEXT"

    default_clause = ""
    if col.default is not None and getattr(col.default, "is_scalar", False):
        arg = col.default.arg
        if isinstance(arg, bool):
            default_clause = f" DEFAULT {'TRUE' if arg else 'FALSE'}"
        elif isinstance(arg, int | float):
            default_clause = f" DEFAULT {arg}"
        elif isinstance(arg, str):
            escaped = arg.replace("'", "''")
            default_clause = f" DEFAULT '{escaped}'"

    return f"{sql_type}{default_clause}"


def _sync_pg_missing_columns(
    conn: Any,
    existing_cols: set[tuple[str, str]],
    existing_tables: set[str],
) -> None:
    """Add any SQLAlchemy model columns missing from live PostgreSQL tables."""
    from sqlalchemy import text

    for table in Base.metadata.sorted_tables:
        tbl = table.name
        if tbl not in existing_tables:
            continue
        for col in table.columns:
            if (tbl, col.name) in existing_cols:
                continue
            ddl = _pg_column_ddl(col)
            stmt = f'ALTER TABLE "{tbl}" ADD COLUMN IF NOT EXISTS "{col.name}" {ddl}'
            try:
                conn.execute(text(stmt))
                conn.commit()
                existing_cols.add((tbl, col.name))
                logger.info("Added missing PostgreSQL column %s.%s (%s)", tbl, col.name, ddl)
            except Exception as exc:
                logger.warning("Failed to add column %s.%s: %s", tbl, col.name, exc)
                conn.rollback()


def _sync_sqlite_missing_columns(conn: Any) -> None:
    """Add any SQLAlchemy model columns missing from local SQLite tables."""
    from sqlalchemy import text

    tables_rows = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
    existing_tables = {row[0] for row in tables_rows}

    for table in Base.metadata.sorted_tables:
        tbl = table.name
        if tbl not in existing_tables:
            continue
        col_rows = conn.execute(text(f'PRAGMA table_info("{tbl}")')).fetchall()
        existing_cols = {row[1] for row in col_rows}
        for col in table.columns:
            if col.name in existing_cols:
                continue
            ddl = _pg_column_ddl(col)
            stmt = f'ALTER TABLE "{tbl}" ADD COLUMN "{col.name}" {ddl}'
            try:
                conn.execute(text(stmt))
            except Exception as exc:
                logger.warning("Failed to add SQLite column %s.%s: %s", tbl, col.name, exc)


def init_db() -> None:
    """Ensure SQLite dev tables exist and delegate PostgreSQL schema to Alembic."""
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logging.getLogger("uvicorn.error").warning(f"Database init skipped or deferred: {exc}")
        return

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
    stop_event: asyncio.Event, interval_seconds: float = 15.0
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
app.include_router(subscriptions_router, prefix="/api/v1")
app.include_router(subscriptions_router)
app.include_router(forms_router, prefix="/api/v1")
app.include_router(forms_router)
app.include_router(crm_router, prefix="/api/v1")
app.include_router(crm_router)
app.include_router(leads_router)
app.include_router(integrations_router)
app.include_router(compliance_router, prefix="/api/v1")
app.include_router(compliance_router)
app.include_router(knowledge_router, prefix="/api/v1")
app.include_router(knowledge_router)
app.include_router(industry_packs_router, prefix="/api/v1")
app.include_router(industry_packs_router)
app.include_router(locations_router, prefix="/api/v1")
app.include_router(locations_router)
app.include_router(public_reschedule_router, prefix="/api/v1")
app.include_router(public_reschedule_router, prefix="/v1")
app.include_router(public_reschedule_router)
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(campaigns_router)
app.include_router(quotes_invoices_router, prefix="/api/v1")
app.include_router(quotes_invoices_router)


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
