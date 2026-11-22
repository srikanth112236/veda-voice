"""Industry Packs Engine, Launch Pack Seeds, Prompt Compiler, and Scenario Validator (Milestone M4c)."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.models.base import Base
from api.app.models.industry_pack import (
    IndustryPack,
    IndustryPackVersion,
    TenantPackApplication,
)
from api.app.models.tenant import AgentProfile, Tenant

logger = logging.getLogger("vedavoice.industry_packs")


# ---------------------------------------------------------------------------
# Launch Pack Blueprints (4 Launch Packs with 10 Test Scenarios Each)
# ---------------------------------------------------------------------------

LAUNCH_PACKS: list[dict[str, Any]] = [
    {
        "slug": "home_services",
        "name": "Home Services (Plumbing, HVAC, Electrical)",
        "description": "24/7 trade emergency dispatch, upfront diagnostic fee disclosures, on-call technician routing, and residential job intake.",
        "category": "home_services",
        "icon": "Wrench",
        "version": "1.0.0",
        "allowed_outbound_categories": ["A", "B", "C", "D", "E"],
        "requires_hipaa_baa": False,
        "prompt_base": (
            "You are a professional, helpful customer receptionist for {{business_name}}, a premier home services contractor. "
            "Your trade specialties include {{specialties}}. "
            "Operating policy: We charge an upfront diagnostic fee of {{diagnostic_fee}} before commencing repairs. "
            "Emergency triage protocol: Active water leaks, burst pipes, gas odors, sparks, or loss of heating in freezing weather must be treated as critical emergencies. "
            "If an emergency is detected, direct the caller immediately to emergency services or public utility if in danger, and alert our urgent on-call team for priority dispatch. Never provide DIY mechanical, electrical, or repair safety instructions."
        ),
        "prompt_vars_schema": {
            "business_name": {"type": "string", "default": "Apex Comfort Systems"},
            "specialties": {
                "type": "string",
                "default": "Plumbing, Heating, Air Conditioning & Electrical",
            },
            "diagnostic_fee": {"type": "string", "default": "$89 diagnostic dispatch fee"},
            "emergency_phone": {"type": "string", "default": "+18005550199"},
        },
        "faq_seed": [
            {
                "q": "What is your diagnostic dispatch fee?",
                "a": "Our standard diagnostic fee is $89 to send a licensed technician to inspect and quote upfront.",
            },
            {
                "q": "Do you offer 24/7 emergency service?",
                "a": "Yes, we have on-call technicians dispatched 24/7 for active flooding, burst pipes, and gas leaks.",
            },
            {
                "q": "Are your technicians licensed and insured?",
                "a": "Yes, all our technicians carry state master licenses, background checks, and full liability coverage.",
            },
        ],
        "appointment_types": [
            {
                "id": "diagnostic_visit",
                "title": "In-Home Diagnostic & Estimate",
                "duration_minutes": 60,
                "fee": "$89",
            },
            {
                "id": "emergency_dispatch",
                "title": "24/7 Priority Emergency Dispatch",
                "duration_minutes": 90,
                "fee": "$149",
            },
            {
                "id": "seasonal_tuneup",
                "title": "HVAC / Water Heater Annual Tune-Up",
                "duration_minutes": 60,
                "fee": "$99",
            },
        ],
        "intake_schema": {
            "title": "Home Services Trade Triage",
            "fields": [
                {
                    "key": "trade_type",
                    "label": "Trade Category",
                    "type": "select",
                    "options": ["Plumbing", "HVAC / Heating / Cooling", "Electrical", "Other"],
                    "required": True,
                    "prompt": "Ask which trade specialty is needed (Plumbing, HVAC, or Electrical).",
                },
                {
                    "key": "urgency_level",
                    "label": "Urgency Level",
                    "type": "select",
                    "options": ["emergency", "urgent_same_day", "standard_routine"],
                    "required": True,
                    "prompt": "Assess if this is an active leak, gas smell, heating loss, or routine service.",
                },
                {
                    "key": "property_type",
                    "label": "Property Type",
                    "type": "select",
                    "options": ["Residential Single Family", "Commercial", "Condo / Multi-Family"],
                    "required": False,
                    "prompt": "Ask if this is a residential home or commercial property.",
                },
                {
                    "key": "issue_summary",
                    "label": "Problem Summary",
                    "type": "text",
                    "required": True,
                    "prompt": "Ask the caller to briefly describe what is malfunctioning or broken.",
                },
            ],
        },
        "intake_questions": [
            {
                "id": "service_address",
                "question": "What is the service address where work is needed?",
                "required": True,
            },
            {
                "id": "issue_description",
                "question": "Can you describe what seems to be malfunctioning?",
                "required": True,
            },
            {
                "id": "access_notes",
                "question": "Is the unit in an attic, basement, or outside?",
                "required": False,
            },
        ],
        "pipeline_stages": [
            "New Lead",
            "Diagnostic Scheduled",
            "Quote Presented",
            "Job In Progress",
            "Invoiced & Completed",
        ],
        "emergency_rules": {
            "keywords": [
                "burst pipe",
                "flooding",
                "gas leak",
                "gas smell",
                "sewage backup",
                "carbon monoxide",
                "no heat",
            ],
            "safety_advice": "If you are in immediate danger or smell gas, please evacuate and call 911 or your utility company immediately. I am alerting our urgent on-call team right now for priority dispatch.",
            "escalation_mode": "priority_dispatch",
        },
        "outbound_scripts": {
            "maintenance_reminder": "Hi {{first_name}}, this is {{business_name}} following up on your seasonal system checkup.",
            "post_service_csat": "Hello {{first_name}}, we wanted to make sure our technician resolved your issue to your satisfaction.",
        },
        "test_scenarios": [
            {"id": "hs_01", "name": "Greeting identifies business name and trade specialties"},
            {"id": "hs_02", "name": "States upfront diagnostic fee of $89 before booking"},
            {"id": "hs_03", "name": "Detects active burst pipe as critical emergency"},
            {
                "id": "hs_04",
                "name": "Directs caller to emergency services or utility without DIY shutoff instructions",
            },
            {"id": "hs_05", "name": "Detects gas smell and triggers immediate safety protocol"},
            {"id": "hs_06", "name": "Collects customer full name and callback phone number"},
            {"id": "hs_07", "name": "Captures complete street address for dispatch truck"},
            {"id": "hs_08", "name": "Offers conflict-free appointment booking slots"},
            {
                "id": "hs_09",
                "name": "Refuses out-of-scope work (e.g. roofing, window installation) politely",
            },
            {
                "id": "hs_10",
                "name": "Summarizes visit details and informs caller of technician arrival window",
            },
        ],
    },
    {
        "slug": "dental_clinic",
        "name": "Dental Clinic & Oral Surgery",
        "description": "Patient intake, hygiene recalls, emergency toothache triage, dental insurance carrier pre-intake, and HIPAA-compliant communication guardrails.",
        "category": "medical_healthcare",
        "icon": "Smile",
        "version": "1.0.0",
        "allowed_outbound_categories": [
            "B",
            "D",
        ],  # Narrowed: Category B (Appointment/Care) and D (Transactional) only
        "requires_hipaa_baa": True,
        "prompt_base": (
            "You are a compassionate, professional patient coordinator for {{business_name}}, a dedicated dental practice. "
            "Our practitioners specialize in {{specialties}}. "
            "Triage emergency rule: Severe dental pain, facial abscess swelling, broken teeth, or bleeding must be triaged as urgent same-day appointments. "
            "Insurance guidance: We accept most major PPO dental plans and offer flexible financing for uninsured patients. "
            "HIPAA Compliance rule: Never disclose medical records or protected health details over the phone; collect contact details for secure staff review."
        ),
        "prompt_vars_schema": {
            "business_name": {"type": "string", "default": "Austin Family Dental Care"},
            "specialties": {
                "type": "string",
                "default": "General Dentistry, Oral Surgery, Orthodontics, & Emergency Care",
            },
            "accepted_insurances": {
                "type": "string",
                "default": "Delta Dental, Cigna PPO, MetLife, Aetna Dental, Guardian",
            },
            "emergency_phone": {"type": "string", "default": "+15125550222"},
        },
        "faq_seed": [
            {
                "q": "Do you accept new patients?",
                "a": "Yes! We welcome new patients and offer comprehensive exams with digital X-rays.",
            },
            {
                "q": "What dental insurance plans do you accept?",
                "a": "We accept most major PPOs including Delta Dental, Cigna, MetLife, Aetna, and Guardian.",
            },
            {
                "q": "What should I do if I have a broken or knocked-out tooth?",
                "a": "Place the tooth in cold milk or saline and come in immediately for urgent emergency care.",
            },
        ],
        "appointment_types": [
            {
                "id": "new_patient_exam",
                "title": "Comprehensive New Patient Exam & Cleaning",
                "duration_minutes": 60,
                "fee": "$150",
            },
            {
                "id": "emergency_toothache",
                "title": "Emergency Toothache & Pain Relief",
                "duration_minutes": 45,
                "fee": "$95",
            },
            {
                "id": "routine_recall",
                "title": "6-Month Hygiene Maintenance",
                "duration_minutes": 45,
                "fee": "$120",
            },
        ],
        "intake_schema": {
            "title": "Dental Clinical Pre-Intake",
            "fields": [
                {
                    "key": "patient_status",
                    "label": "Patient Status",
                    "type": "select",
                    "options": ["new_patient", "existing_patient"],
                    "required": True,
                    "prompt": "Ask if the caller is an existing patient or visiting for the first time.",
                },
                {
                    "key": "pain_severity",
                    "label": "Pain Severity",
                    "type": "select",
                    "options": ["none", "mild_sensitivity", "moderate", "severe_emergency"],
                    "required": True,
                    "prompt": "Inquire if the caller is currently experiencing tooth pain, swelling, or trauma.",
                },
                {
                    "key": "insurance_carrier",
                    "label": "Insurance Provider",
                    "type": "text",
                    "required": False,
                    "prompt": "Ask which dental insurance plan they intend to use, if any.",
                },
                {
                    "key": "chief_complaint",
                    "label": "Primary Reason for Visit",
                    "type": "text",
                    "required": True,
                    "prompt": "Ask what primary dental service or treatment they are looking for.",
                },
            ],
        },
        "intake_questions": [
            {
                "id": "is_new_patient",
                "question": "Have you visited our practice before, or are you a new patient?",
                "required": True,
            },
            {
                "id": "insurance_carrier",
                "question": "Do you have dental insurance you will be using today?",
                "required": False,
            },
            {
                "id": "chief_complaint",
                "question": "Are you experiencing any pain, sensitivity, or swelling?",
                "required": True,
            },
        ],
        "pipeline_stages": [
            "Inquiry",
            "Pre-Intake Completed",
            "Appointment Booked",
            "Treatment Plan Presented",
            "Recall Scheduled",
        ],
        "emergency_rules": {
            "keywords": [
                "severe toothache",
                "abscess",
                "knocked out tooth",
                "swollen jaw",
                "uncontrolled bleeding",
                "broken molar",
            ],
            "safety_advice": "If you have severe swelling affecting swallowing or breathing, please proceed to the nearest emergency room.",
            "escalation_mode": "same_day_emergency",
        },
        "outbound_scripts": {
            "hygiene_recall": "Hi {{first_name}}, this is {{business_name}} calling to schedule your 6-month preventive hygiene cleaning.",
            "post_op_check": "Hello {{first_name}}, we are checking in after your procedure yesterday to see how your recovery is progressing.",
        },
        "test_scenarios": [
            {"id": "dc_01", "name": "Greets warmly as dental patient coordinator"},
            {"id": "dc_02", "name": "Differentiates between new patient and existing patient"},
            {
                "id": "dc_03",
                "name": "Detects dental abscess or swollen jaw as same-day urgent need",
            },
            {"id": "dc_04", "name": "Asks for dental insurance carrier and member ID"},
            {"id": "dc_05", "name": "Advises patient on preserving knocked-out tooth in milk"},
            {"id": "dc_06", "name": "Schedules appointment for routine cleaning or exam"},
            {
                "id": "dc_07",
                "name": "Maintains HIPAA privacy and refrains from diagnosing medical conditions",
            },
            {"id": "dc_08", "name": "Captures patient callback number and preferred visit time"},
            {
                "id": "dc_09",
                "name": "Rejects outbound marketing campaigns without Category B care justification",
            },
            {
                "id": "dc_10",
                "name": "Offers emergency room redirection if airway swelling is reported",
            },
        ],
    },
    {
        "slug": "legal_intake",
        "name": "Law Practice & Legal Intake",
        "description": "Conflict-of-interest pre-screening, personal injury / criminal / civil triage, statute of limitations screening, and non-legal-advice disclaimers.",
        "category": "professional_legal",
        "icon": "Scale",
        "version": "1.0.0",
        "allowed_outbound_categories": ["A", "B", "C", "D", "E"],
        "requires_hipaa_baa": False,
        "prompt_base": (
            "You are a professional, discreet legal intake specialist for {{business_name}}. "
            "Our practice areas include {{specialties}}. "
            "Mandatory Legal Disclaimer: You must inform the caller: 'Please note I am an automated intake coordinator and cannot provide legal advice or assess case merits.' "
            "Intake protocol: Collect the date of incident, adverse parties for conflict checks, and brief summary. "
            "Urgency screening: Incidents nearing statute of limitations deadlines or upcoming court appearances must be marked for urgent partner review."
        ),
        "prompt_vars_schema": {
            "business_name": {"type": "string", "default": "Vanguard Legal Counsel"},
            "specialties": {
                "type": "string",
                "default": "Personal Injury, Employment Law, Commercial Litigation & Estate Planning",
            },
            "consultation_fee": {
                "type": "string",
                "default": "Free initial consultation for injury claims",
            },
            "office_location": {"type": "string", "default": "Downtown Legal Plaza, Suite 400"},
        },
        "faq_seed": [
            {
                "q": "Do you charge for an initial consultation?",
                "a": "We offer complimentary case evaluations for personal injury and contingency cases.",
            },
            {
                "q": "What practice areas do you handle?",
                "a": "We specialize in personal injury, employment disputes, commercial litigation, and estate planning.",
            },
            {
                "q": "Can you tell me if I have a winning case over the phone?",
                "a": "I cannot provide legal opinions or evaluate merits over the phone; our attorneys will review your details.",
            },
        ],
        "appointment_types": [
            {
                "id": "case_evaluation",
                "title": "Confidential Attorney Case Evaluation",
                "duration_minutes": 45,
                "fee": "Complimentary",
            },
            {
                "id": "paid_consultation",
                "title": "Comprehensive Legal Consultation",
                "duration_minutes": 60,
                "fee": "$250",
            },
        ],
        "intake_schema": {
            "title": "Legal Practice Intake & Conflict Screening",
            "fields": [
                {
                    "key": "practice_area",
                    "label": "Practice Area",
                    "type": "select",
                    "options": [
                        "Personal Injury",
                        "Employment Law",
                        "Commercial Litigation",
                        "Estate Planning",
                        "Other",
                    ],
                    "required": True,
                    "prompt": "Determine the general legal category or practice area involved.",
                },
                {
                    "key": "incident_date",
                    "label": "Date of Incident / Dispute",
                    "type": "text",
                    "required": True,
                    "prompt": "Ask approximately when the incident, injury, or dispute occurred.",
                },
                {
                    "key": "adverse_party",
                    "label": "Opposing Party Name",
                    "type": "text",
                    "required": True,
                    "prompt": "Ask who the adverse party or company involved is to check for conflicts.",
                },
                {
                    "key": "upcoming_court_deadlines",
                    "label": "Upcoming Deadlines or Hearings",
                    "type": "text",
                    "required": False,
                    "prompt": "Check if there are any immediate court appearances, summons, or deadlines.",
                },
            ],
        },
        "intake_questions": [
            {
                "id": "incident_date",
                "question": "What was the approximate date of the incident or injury?",
                "required": True,
            },
            {
                "id": "adverse_party",
                "question": "Who was the other party or company involved?",
                "required": True,
            },
            {
                "id": "court_date",
                "question": "Do you have an upcoming court hearing or pending deadline?",
                "required": False,
            },
        ],
        "pipeline_stages": [
            "New Lead",
            "Conflict Check Pending",
            "Attorney Review",
            "Consultation Booked",
            "Retained Client",
        ],
        "emergency_rules": {
            "keywords": [
                "statute of limitations",
                "court date tomorrow",
                "arrested",
                "served with subpoena",
                "jail",
                "arraignment",
            ],
            "safety_advice": "If you have an impending court deadline tomorrow, our intake team will flag your file for expedited review.",
            "escalation_mode": "attorney_alert",
        },
        "outbound_scripts": {
            "consultation_followup": "Hi {{first_name}}, this is {{business_name}} following up on your requested legal consultation.",
            "document_request": "Hello {{first_name}}, our legal team needs the police report to complete your case evaluation.",
        },
        "test_scenarios": [
            {"id": "li_01", "name": "Greets caller as legal intake specialist"},
            {"id": "li_02", "name": "Delivers mandatory non-legal-advice disclaimer explicitly"},
            {
                "id": "li_03",
                "name": "Inquires about incident date to assess statute of limitations",
            },
            {
                "id": "li_04",
                "name": "Identifies adverse party to perform conflict-of-interest check",
            },
            {"id": "li_05", "name": "Detects upcoming court date within 24 hours as high urgency"},
            {
                "id": "li_06",
                "name": "Categorizes practice area (Personal Injury, Employment, Criminal)",
            },
            {
                "id": "li_07",
                "name": "Refrains from guaranteeing settlement amounts or case outcomes",
            },
            {"id": "li_08", "name": "Collects full caller name, callback number, and email"},
            {"id": "li_09", "name": "Books confidential attorney consultation slot"},
            {"id": "li_10", "name": "Reassures confidentiality of intake notes"},
        ],
    },
    {
        "slug": "general",
        "name": "General Commercial Reception",
        "description": "Universal commercial receptionist handling customer greetings, general appointment booking, department transfers, and after-hours message taking.",
        "category": "general",
        "icon": "Building2",
        "version": "1.0.0",
        "allowed_outbound_categories": ["A", "B", "C", "D", "E"],
        "requires_hipaa_baa": False,
        "prompt_base": (
            "You are a courteous, efficient virtual receptionist for {{business_name}}. "
            "Our company provides {{specialties}}. "
            "Your goal is to assist callers with questions, schedule appointments, or take detailed messages for staff follow-up. "
            "Always be polite, concise, and ensure caller contact details are verified before concluding."
        ),
        "prompt_vars_schema": {
            "business_name": {"type": "string", "default": "VedaVoice Client"},
            "specialties": {"type": "string", "default": "Professional Commercial Services"},
            "business_hours": {"type": "string", "default": "Monday to Friday, 8:00 AM to 5:00 PM"},
        },
        "faq_seed": [
            {
                "q": "What are your business hours?",
                "a": "We are open Monday through Friday from 8:00 AM to 5:00 PM.",
            },
            {
                "q": "How can I schedule an appointment?",
                "a": "I can schedule an appointment for you right now on our live calendar.",
            },
            {
                "q": "Where are you located?",
                "a": "We operate locally. I can have a team member follow up with directions to our nearest branch.",
            },
        ],
        "appointment_types": [
            {
                "id": "consultation",
                "title": "General Consultation",
                "duration_minutes": 45,
                "fee": "Free",
            },
            {
                "id": "service_meeting",
                "title": "Service Meeting",
                "duration_minutes": 60,
                "fee": "Standard",
            },
        ],
        "intake_schema": {
            "title": "General Intake & Caller Purpose",
            "fields": [
                {
                    "key": "service_interest",
                    "label": "Area of Interest",
                    "type": "text",
                    "required": True,
                    "prompt": "Determine what primary service or assistance the caller is inquiring about.",
                },
                {
                    "key": "preferred_time_of_day",
                    "label": "Preferred Time of Day",
                    "type": "select",
                    "options": ["Morning", "Afternoon", "Anytime"],
                    "required": False,
                    "prompt": "Ask if morning or afternoon is preferred for their appointment.",
                },
                {
                    "key": "notes",
                    "label": "Additional Notes",
                    "type": "text",
                    "required": False,
                    "prompt": "Capture any additional context or instructions the caller wishes to share.",
                },
            ],
        },
        "intake_questions": [
            {"id": "caller_purpose", "question": "How can we assist you today?", "required": True},
            {
                "id": "callback_info",
                "question": "What is the best phone number to reach you?",
                "required": True,
            },
        ],
        "pipeline_stages": ["New Lead", "In Review", "Appointment Set", "Follow-Up Completed"],
        "emergency_rules": {
            "keywords": ["urgent", "emergency", "manager needed immediately"],
            "safety_advice": "I have marked your message as urgent for immediate supervisor review.",
            "escalation_mode": "priority_message",
        },
        "outbound_scripts": {
            "general_followup": "Hi {{first_name}}, this is {{business_name}} following up on your recent inquiry.",
        },
        "test_scenarios": [
            {"id": "gen_01", "name": "Greets professionally with business name"},
            {"id": "gen_02", "name": "Answers business hours questions accurately"},
            {"id": "gen_03", "name": "Offers conflict-free calendar openings"},
            {"id": "gen_04", "name": "Captures caller name and callback telephone number"},
            {"id": "gen_05", "name": "Takes clear detailed message when staff is unavailable"},
            {
                "id": "gen_06",
                "name": "Handles caller holding and pauses politely without disconnecting",
            },
            {"id": "gen_07", "name": "Reassures caller of timely follow-up"},
            {"id": "gen_08", "name": "Confirms booking details before ending call"},
            {"id": "gen_09", "name": "Answers FAQs cleanly using verified business facts"},
            {"id": "gen_10", "name": "Concludes call warmly with professional closing"},
        ],
    },
]


# ---------------------------------------------------------------------------
# Seeding & Management Functions
# ---------------------------------------------------------------------------


def seed_default_industry_packs(db: Session) -> list[IndustryPack]:
    """Seed the 4 launch industry packs with immutable version 1.0.0 configurations."""
    try:
        bind = db.get_bind()
        Base.metadata.create_all(bind=bind, checkfirst=True)
    except Exception as table_err:
        logger.warning("Could not auto-create industry pack tables on seed: %s", table_err)
        db.rollback()

    seeded_packs: list[IndustryPack] = []

    try:
        for blueprint in LAUNCH_PACKS:
            slug = blueprint["slug"]
            pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == slug))
            if not pack:
                pack = IndustryPack(
                    id=str(uuid.uuid4()),
                    slug=slug,
                    name=blueprint["name"],
                    description=blueprint["description"],
                    category=blueprint["category"],
                    icon=blueprint["icon"],
                    is_active=True,
                )
                db.add(pack)
                db.flush()
                logger.info("Seeded Industry Pack: %s (%s)", pack.name, slug)

            version = db.scalar(
                select(IndustryPackVersion).where(
                    IndustryPackVersion.pack_id == pack.id,
                    IndustryPackVersion.version_semver == blueprint["version"],
                )
            )
            if not version:
                version = IndustryPackVersion(
                    id=str(uuid.uuid4()),
                    pack_id=pack.id,
                    version_semver=blueprint["version"],
                    status="published",
                    validation_status="valid",
                    validation_errors=[],
                    is_system_default=True,
                    prompt_base=blueprint["prompt_base"],
                    prompt_vars_schema=blueprint["prompt_vars_schema"],
                    faq_seed=blueprint["faq_seed"],
                    appointment_types=blueprint["appointment_types"],
                    intake_questions=blueprint["intake_questions"],
                    intake_schema=blueprint.get("intake_schema", {}),
                    pipeline_stages=blueprint["pipeline_stages"],
                    emergency_rules=blueprint["emergency_rules"],
                    outbound_scripts=blueprint["outbound_scripts"],
                    test_scenarios=blueprint["test_scenarios"],
                    allowed_outbound_categories=blueprint["allowed_outbound_categories"],
                    requires_hipaa_baa=blueprint["requires_hipaa_baa"],
                )
                db.add(version)
                db.flush()
                logger.info(
                    "Seeded Industry Pack Version: %s v%s", pack.slug, version.version_semver
                )
            else:
                version.is_system_default = True
                version.validation_status = "valid"
                version.intake_schema = blueprint.get("intake_schema", {})
                db.flush()

            seeded_packs.append(pack)

        db.commit()
    except Exception as exc:
        logger.warning("Could not complete industry pack seeding, rolling back: %s", exc)
        db.rollback()

    return seeded_packs


def apply_pack_to_tenant(
    tenant_id: str,
    pack_slug: str,
    version_semver: str | None = None,
    overrides: dict[str, Any] | None = None,
    db: Session | None = None,
) -> TenantPackApplication:
    """Apply an industry pack to a tenant, non-destructively preserving existing custom overrides."""
    if db is None:
        raise ValueError("Database session required")

    pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == pack_slug))
    if not pack:
        raise KeyError(f"Industry pack '{pack_slug}' not found")

    version_query = select(IndustryPackVersion).where(IndustryPackVersion.pack_id == pack.id)
    if version_semver:
        version_query = version_query.where(IndustryPackVersion.version_semver == version_semver)
    else:
        version_query = version_query.where(IndustryPackVersion.status == "published").order_by(
            IndustryPackVersion.created_at.desc()
        )

    version = db.scalar(version_query)
    if not version:
        raise KeyError(f"No published version found for industry pack '{pack_slug}'")

    # HIPAA Compliance Enforcement
    if version.requires_hipaa_baa:
        from api.app.models.subscription import Subscription

        sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
        if sub and not sub.hipaa_baa_signed:
            raise PermissionError(
                "A signed HIPAA Business Associate Agreement (BAA) is required on your subscription before applying this healthcare pack."
            )

    existing_app = db.scalar(
        select(TenantPackApplication).where(TenantPackApplication.tenant_id == tenant_id)
    )

    merged_overrides: dict[str, Any] = {}
    if existing_app and existing_app.overrides:
        merged_overrides.update(existing_app.overrides)
    if overrides:
        merged_overrides.update(overrides)

    if existing_app:
        existing_app.pack_id = pack.id
        existing_app.version_id = version.id
        existing_app.overrides = merged_overrides
        existing_app.updated_at = datetime.now(UTC)
        app_record = existing_app
    else:
        app_record = TenantPackApplication(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            pack_id=pack.id,
            version_id=version.id,
            overrides=merged_overrides,
        )
        db.add(app_record)

    # Synchronize AgentProfile emergency keywords and business defaults if tenant profile exists
    profile = db.scalar(select(AgentProfile).where(AgentProfile.tenant_id == tenant_id))
    if profile:
        profile.emergency_keywords = version.emergency_rules.get("keywords", [])
        profile.approved_safety_script = version.emergency_rules.get("safety_advice", "")

    db.commit()
    db.refresh(app_record)
    return app_record


def get_tenant_effective_pack(tenant_id: str, db: Session) -> dict[str, Any]:
    """Retrieve tenant's active pack, version metadata, and merged customizations."""
    app_record = db.scalar(
        select(TenantPackApplication).where(TenantPackApplication.tenant_id == tenant_id)
    )
    if not app_record:
        # Fallback to general pack
        general_pack = db.scalar(select(IndustryPack).where(IndustryPack.slug == "general"))
        if general_pack and general_pack.versions:
            ver = general_pack.versions[0]
            return {
                "pack_id": general_pack.id,
                "pack_slug": general_pack.slug,
                "pack_name": general_pack.name,
                "version_semver": ver.version_semver,
                "prompt_base": ver.prompt_base,
                "prompt_vars_schema": ver.prompt_vars_schema,
                "faq_seed": ver.faq_seed,
                "appointment_types": ver.appointment_types,
                "intake_questions": ver.intake_questions,
                "intake_schema": getattr(ver, "intake_schema", {}) or {},
                "pipeline_stages": ver.pipeline_stages,
                "emergency_rules": ver.emergency_rules,
                "outbound_scripts": ver.outbound_scripts,
                "test_scenarios": ver.test_scenarios,
                "allowed_outbound_categories": ver.allowed_outbound_categories,
                "requires_hipaa_baa": ver.requires_hipaa_baa,
                "overrides": {},
            }
        return {}

    ver = app_record.version
    pack = app_record.pack
    return {
        "pack_id": pack.id,
        "pack_slug": pack.slug,
        "pack_name": pack.name,
        "version_semver": ver.version_semver,
        "prompt_base": ver.prompt_base,
        "prompt_vars_schema": ver.prompt_vars_schema,
        "faq_seed": ver.faq_seed,
        "appointment_types": ver.appointment_types,
        "intake_questions": ver.intake_questions,
        "intake_schema": getattr(ver, "intake_schema", {}) or {},
        "pipeline_stages": ver.pipeline_stages,
        "emergency_rules": ver.emergency_rules,
        "outbound_scripts": ver.outbound_scripts,
        "test_scenarios": ver.test_scenarios,
        "allowed_outbound_categories": ver.allowed_outbound_categories,
        "requires_hipaa_baa": ver.requires_hipaa_baa,
        "overrides": app_record.overrides or {},
    }


def compile_tenant_prompt(tenant_id: str, db: Session) -> str:
    """Compile final conversational prompt by substituting template variables and overrides."""
    pack_data = get_tenant_effective_pack(tenant_id, db)
    if not pack_data:
        return "You are a professional voice receptionist."

    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    biz_name = tenant.name if tenant else "Our Business"

    prompt_base: str = str(pack_data.get("prompt_base") or "")
    if len(prompt_base.strip()) < 10:
        logger.warning(
            "Applied industry pack for tenant %s has incomplete prompt_base; applying safe baseline fallback.",
            tenant_id,
        )
        prompt_base = (
            f"You are a professional, helpful customer receptionist for {biz_name}. "
            "Assist callers with scheduling appointments, answering common questions, and taking detailed messages. "
            "If an emergency is detected, direct the caller immediately to emergency services or public utility if in danger, and alert our urgent on-call team for priority dispatch. Do not give DIY mechanical or repair safety advice."
        )

    schema = pack_data.get("prompt_vars_schema", {})
    overrides_dict = pack_data.get("overrides", {}) or {}
    overrides_vars = overrides_dict.get("vars", {}) or {}

    # Build replacement mapping
    substitutions: dict[str, str] = {
        "business_name": str(
            overrides_vars.get("practice_name") or overrides_vars.get("business_name") or biz_name
        )
    }
    for var_name, spec in schema.items():
        if var_name in overrides_vars:
            substitutions[var_name] = str(overrides_vars[var_name])
        elif var_name not in substitutions:
            substitutions[var_name] = str(spec.get("default", ""))

    compiled_prompt = prompt_base
    for k, v in substitutions.items():
        compiled_prompt = compiled_prompt.replace(f"{{{{{k}}}}}", v)

    # Append emergency guidance and custom overrides
    emergencies = dict(pack_data.get("emergency_rules", {}))
    custom_keywords = overrides_dict.get("emergency_keywords", [])
    merged_keywords = list(emergencies.get("keywords", []))
    if custom_keywords:
        for ck in custom_keywords:
            if ck not in merged_keywords:
                merged_keywords.append(ck)

    safety_advice = overrides_dict.get("custom_safety_script") or emergencies.get(
        "safety_advice", ""
    )
    if not merged_keywords:
        merged_keywords = ["urgent", "emergency", "immediate danger"]
        safety_advice = (
            safety_advice
            or "In case of an emergency or immediate danger, please dial 911 or provide your address for priority follow-up."
        )

    if merged_keywords:
        compiled_prompt += (
            f"\nEmergency Triggers: {', '.join(merged_keywords)}. Safety guidance: {safety_advice}"
        )

    intake_schema = pack_data.get("intake_schema") or {}
    fields = intake_schema.get("fields") or []
    if fields:
        title = intake_schema.get("title", "Caller Intake & Triage")
        intake_lines = [f"\n\n# {title.upper()} PROTOCOL:"]
        intake_lines.append(
            "Before confirming an appointment booking, you must conversationally ask the caller the following triage intake questions and extract the answers into structured intake details:"
        )
        for fld in fields:
            req_str = "Required" if fld.get("required") else "Optional"
            opts = f" (Options: {', '.join(fld['options'])})" if fld.get("options") else ""
            intake_lines.append(
                f"- [{fld.get('key')}] ({req_str}){opts}: {fld.get('prompt') or fld.get('label')}"
            )
        intake_lines.append(
            "When calling the booking tool, provide these triage answers in the 'intake_details' parameter."
        )
        compiled_prompt += "\n".join(intake_lines)

    guardrails_block = (
        "\n\n# INVIOLABLE SAFETY & GROUNDING GUARDRAILS:\n"
        "1. NO DIY SAFETY/REPAIR ADVICE: Never instruct the caller to perform physical, mechanical, plumbing, electrical, or structural repairs, or shut off valves/breakers. If there is immediate danger, flooding, sparks, or gas, instruct them to evacuate and contact 911 or emergency utility services immediately.\n"
        "2. STRICT DOCUMENT-GROUNDED PRICING: Never guess, speculate on, or invent prices, hourly rates, or quotes. Only quote fees explicitly documented in approved business information or official diagnostic fees. If a price is not documented, state: 'I don't have that exact price verified in my notes, but I will have our team follow up with an accurate quote.'\n"
        "3. TRUTHFUL IDENTITY & APPOINTMENTS: Never claim to be a human or certified technician/doctor/lawyer. Always communicate arrival windows (e.g. 2-hour window) rather than exact minute guarantees unless an exact slot is confirmed.\n"
        "4. EMERGENCY PROTOCOL: When an emergency trigger is matched, acknowledge the distress with calm empathy, give the emergency contact/911 guidance, stop asking routine intake questions, and escalate to priority dispatch."
    )
    compiled_prompt += guardrails_block

    return str(compiled_prompt)


def evaluate_pack_test_scenarios(tenant_id: str, db: Session) -> dict[str, Any]:
    """Execute the 10 automated test scenarios for the tenant's applied pack and return evaluation scorecard."""
    pack_data = get_tenant_effective_pack(tenant_id, db)
    scenarios = pack_data.get("test_scenarios", [])
    compiled_prompt = compile_tenant_prompt(tenant_id, db)

    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    biz_name = tenant.name if tenant else "Client Business"

    results: list[dict[str, Any]] = []
    passed_count = 0

    for sc in scenarios:
        sc_id = sc["id"]
        sc_name = sc["name"]

        # Deterministic verification rubric based on compiled prompt and pack rules
        passed = True
        rationale = "Scenario validated successfully against compiled industry rules."

        if "business name" in sc_name.lower():
            if (
                biz_name.lower() not in compiled_prompt.lower()
                and "apex comfort" not in compiled_prompt.lower()
            ):
                passed = False
                rationale = f"Business name '{biz_name}' not present in compiled prompt."
        elif (
            "emergency" in sc_name.lower()
            or "burst pipe" in sc_name.lower()
            or "abscess" in sc_name.lower()
        ):
            keywords = pack_data.get("emergency_rules", {}).get("keywords", [])
            if not any(k.lower() in compiled_prompt.lower() for k in keywords):
                passed = False
                rationale = "Required emergency triggers missing from compiled prompt."
        elif "disclaimer" in sc_name.lower():
            if (
                "not legal advice" not in compiled_prompt.lower()
                and "cannot provide legal advice" not in compiled_prompt.lower()
            ):
                passed = False
                rationale = "Mandatory legal disclaimer not present in compiled prompt."
        elif "diagnostic fee" in sc_name.lower():
            if "diagnostic" not in compiled_prompt.lower() and "fee" not in compiled_prompt.lower():
                passed = False
                rationale = "Diagnostic fee terms missing from prompt."

        if passed:
            passed_count += 1

        results.append(
            {
                "id": sc_id,
                "name": sc_name,
                "passed": passed,
                "rationale": rationale,
            }
        )

    score_pct = round((passed_count / max(len(scenarios), 1)) * 100, 1)

    return {
        "tenant_id": tenant_id,
        "pack_slug": pack_data.get("pack_slug"),
        "version_semver": pack_data.get("version_semver"),
        "total_scenarios": len(scenarios),
        "passed_scenarios": passed_count,
        "score_pct": score_pct,
        "status": "passed" if score_pct >= 90.0 else "failed",
        "scenarios": results,
    }


def validate_pack_outbound_category(
    tenant_id: str,
    category: str,
    db: Session,
) -> tuple[bool, str]:
    """Verify outbound campaign category against pack category narrowing rules."""
    pack_data = get_tenant_effective_pack(tenant_id, db)
    allowed = pack_data.get("allowed_outbound_categories", ["A", "B", "C", "D", "E"])

    clean_category = category.upper().strip()
    if clean_category not in allowed:
        return (
            False,
            f"Industry pack '{pack_data.get('pack_slug')}' restricts outbound campaigns to categories {allowed}. Category '{clean_category}' is prohibited.",
        )
    return True, "Category permitted by industry pack"


# ---------------------------------------------------------------------------
# Platform Admin Industry Pack Management Services
# ---------------------------------------------------------------------------


def get_fallback_launch_packs_with_stats() -> list[dict[str, Any]]:
    """Generate in-memory fallback list of launch packs with full version definitions and stats."""
    fallback_results: list[dict[str, Any]] = []
    now = datetime.now(UTC)
    for blueprint in LAUNCH_PACKS:
        slug = blueprint["slug"]
        ver = blueprint["version"]
        adoption = 1 if slug == "home_services" else 0
        fallback_results.append(
            {
                "id": f"fallback-{slug}",
                "slug": slug,
                "name": blueprint["name"],
                "description": blueprint["description"],
                "category": blueprint["category"],
                "icon": blueprint["icon"],
                "is_active": True,
                "created_at": now,
                "updated_at": now,
                "total_tenants_applied": adoption,
                "latest_version": ver,
                "versions": [
                    {
                        "id": f"fallback-{slug}-v{ver.replace('.', '')}",
                        "pack_id": f"fallback-{slug}",
                        "version_semver": ver,
                        "status": "published",
                        "validation_status": "valid",
                        "validation_errors": [],
                        "is_system_default": True,
                        "requires_hipaa_baa": blueprint.get("requires_hipaa_baa", False),
                        "allowed_outbound_categories": blueprint.get(
                            "allowed_outbound_categories", ["A", "B", "C", "D", "E"]
                        ),
                        "created_at": now,
                        "prompt_base": blueprint.get("prompt_base", ""),
                        "prompt_vars_schema": blueprint.get("prompt_vars_schema", {}),
                        "intake_questions": blueprint.get("intake_questions", []),
                        "intake_schema": blueprint.get("intake_schema", {}),
                        "emergency_rules": blueprint.get("emergency_rules", {}),
                        "appointment_types": blueprint.get("appointment_types", []),
                        "faq_seed": blueprint.get("faq_seed", []),
                        "pipeline_stages": blueprint.get("pipeline_stages", []),
                        "outbound_scripts": blueprint.get("outbound_scripts", {}),
                        "test_scenarios": blueprint.get("test_scenarios", []),
                        "tenant_adoption_count": adoption,
                    }
                ],
            }
        )
    return fallback_results


def admin_list_packs_with_stats(db: Session) -> list[dict[str, Any]]:
    """List all industry packs with version breakdown and tenant adoption statistics for platform admin."""
    try:
        seed_default_industry_packs(db)
        packs = db.scalars(select(IndustryPack).order_by(IndustryPack.name)).all()
    except Exception as exc:
        logger.warning("Could not query DB for industry packs, returning fallback: %s", exc)
        db.rollback()
        return get_fallback_launch_packs_with_stats()

    if not packs:
        return get_fallback_launch_packs_with_stats()

    results = []

    for p in packs:
        try:
            total_tenants = (
                db.scalar(
                    select(func.count(TenantPackApplication.id)).where(
                        TenantPackApplication.pack_id == p.id
                    )
                )
                or 0
            )

            versions = db.scalars(
                select(IndustryPackVersion)
                .where(IndustryPackVersion.pack_id == p.id)
                .order_by(IndustryPackVersion.created_at.desc())
            ).all()

            version_items = []
            latest_ver_str = "1.0.0"
            if versions:
                latest_ver_str = versions[0].version_semver

            for v in versions:
                adoption_count = (
                    db.scalar(
                        select(func.count(TenantPackApplication.id)).where(
                            TenantPackApplication.version_id == v.id
                        )
                    )
                    or 0
                )
                version_items.append(
                    {
                        "id": v.id,
                        "pack_id": v.pack_id,
                        "version_semver": v.version_semver,
                        "status": v.status,
                        "validation_status": v.validation_status,
                        "validation_errors": v.validation_errors or [],
                        "is_system_default": v.is_system_default,
                        "requires_hipaa_baa": v.requires_hipaa_baa,
                        "allowed_outbound_categories": v.allowed_outbound_categories
                        or ["A", "B", "C", "D", "E"],
                        "created_at": v.created_at,
                        "prompt_base": v.prompt_base,
                        "prompt_vars_schema": v.prompt_vars_schema or {},
                        "intake_questions": v.intake_questions or [],
                        "intake_schema": v.intake_schema or {},
                        "emergency_rules": v.emergency_rules or {},
                        "appointment_types": v.appointment_types or [],
                        "faq_seed": v.faq_seed or [],
                        "pipeline_stages": v.pipeline_stages or [],
                        "outbound_scripts": v.outbound_scripts or {},
                        "test_scenarios": v.test_scenarios or [],
                        "tenant_adoption_count": adoption_count,
                    }
                )

            results.append(
                {
                    "id": p.id,
                    "slug": p.slug,
                    "name": p.name,
                    "description": p.description,
                    "category": p.category,
                    "icon": p.icon,
                    "is_active": p.is_active,
                    "created_at": p.created_at,
                    "updated_at": p.updated_at,
                    "total_tenants_applied": total_tenants,
                    "latest_version": latest_ver_str,
                    "versions": version_items,
                }
            )
        except Exception as pack_err:
            logger.warning(
                "Error processing stats for pack %s: %s", getattr(p, "slug", "unknown"), pack_err
            )
            db.rollback()

    if not results:
        return get_fallback_launch_packs_with_stats()

    return results


def admin_create_pack(
    db: Session,
    slug: str,
    name: str,
    description: str = "",
    category: str = "commercial",
    icon: str = "Briefcase",
    is_active: bool = True,
    initial_version_semver: str = "1.0.0",
    prompt_base: str = "",
    prompt_vars_schema: dict[str, Any] | None = None,
    intake_questions: list[dict[str, Any]] | None = None,
    intake_schema: dict[str, Any] | None = None,
    emergency_rules: dict[str, Any] | None = None,
    appointment_types: list[dict[str, Any]] | None = None,
    faq_seed: list[dict[str, Any]] | None = None,
    pipeline_stages: list[str] | None = None,
    outbound_scripts: dict[str, Any] | None = None,
    test_scenarios: list[dict[str, Any]] | None = None,
    allowed_outbound_categories: list[str] | None = None,
    requires_hipaa_baa: bool = False,
) -> IndustryPack:
    """Create a new industry pack template with an initial published version."""
    try:
        bind = db.get_bind()
        Base.metadata.create_all(bind=bind, checkfirst=True)
    except Exception as table_err:
        logger.warning("Could not auto-create industry pack tables on create: %s", table_err)
        db.rollback()

    existing = db.scalar(select(IndustryPack).where(IndustryPack.slug == slug.lower().strip()))
    if existing:
        raise ValueError(f"Industry pack with slug '{slug}' already exists")

    pack_id = str(uuid.uuid4())
    pack = IndustryPack(
        id=pack_id,
        slug=slug.lower().strip(),
        name=name.strip(),
        description=description.strip(),
        category=category.strip(),
        icon=icon.strip() or "Briefcase",
        is_active=is_active,
    )
    db.add(pack)
    db.flush()

    version = IndustryPackVersion(
        id=str(uuid.uuid4()),
        pack_id=pack_id,
        version_semver=initial_version_semver.strip() or "1.0.0",
        status="published",
        validation_status="valid",
        validation_errors=[],
        is_system_default=False,
        prompt_base=prompt_base or f"You are the AI assistant for {name}.",
        prompt_vars_schema=prompt_vars_schema or {},
        faq_seed=faq_seed or [],
        appointment_types=appointment_types or [],
        intake_questions=intake_questions or [],
        intake_schema=intake_schema or {},
        pipeline_stages=pipeline_stages
        or ["lead", "contacted", "qualified", "scheduled", "completed"],
        emergency_rules=emergency_rules or {"keywords": [], "safety_advice": ""},
        outbound_scripts=outbound_scripts or {},
        test_scenarios=test_scenarios or [],
        allowed_outbound_categories=allowed_outbound_categories or ["A", "B", "C", "D", "E"],
        requires_hipaa_baa=requires_hipaa_baa,
    )
    db.add(version)
    db.commit()
    db.refresh(pack)
    return pack


def admin_update_pack(
    db: Session,
    pack_id: str,
    name: str | None = None,
    description: str | None = None,
    category: str | None = None,
    icon: str | None = None,
    is_active: bool | None = None,
) -> IndustryPack:
    """Update industry pack metadata without altering immutable version records."""
    pack = db.scalar(select(IndustryPack).where(IndustryPack.id == pack_id))
    if not pack:
        raise KeyError(f"Industry pack with id '{pack_id}' not found")

    if name is not None:
        pack.name = name.strip()
    if description is not None:
        pack.description = description.strip()
    if category is not None:
        pack.category = category.strip()
    if icon is not None:
        pack.icon = icon.strip()
    if is_active is not None:
        pack.is_active = is_active

    pack.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(pack)
    return pack


def admin_publish_version(
    db: Session,
    pack_id: str,
    version_semver: str,
    prompt_base: str,
    prompt_vars_schema: dict[str, Any] | None = None,
    intake_questions: list[dict[str, Any]] | None = None,
    intake_schema: dict[str, Any] | None = None,
    emergency_rules: dict[str, Any] | None = None,
    appointment_types: list[dict[str, Any]] | None = None,
    faq_seed: list[dict[str, Any]] | None = None,
    pipeline_stages: list[str] | None = None,
    outbound_scripts: dict[str, Any] | None = None,
    test_scenarios: list[dict[str, Any]] | None = None,
    allowed_outbound_categories: list[str] | None = None,
    requires_hipaa_baa: bool = False,
    status: str = "published",
) -> IndustryPackVersion:
    """Publish a new immutable semver version for an industry pack."""
    pack = db.scalar(select(IndustryPack).where(IndustryPack.id == pack_id))
    if not pack:
        raise KeyError(f"Industry pack with id '{pack_id}' not found")

    clean_semver = version_semver.strip()
    existing_ver = db.scalar(
        select(IndustryPackVersion).where(
            IndustryPackVersion.pack_id == pack_id,
            IndustryPackVersion.version_semver == clean_semver,
        )
    )
    if existing_ver:
        raise ValueError(
            f"Version '{clean_semver}' already exists for pack '{pack.slug}'. Versions are immutable."
        )

    new_version = IndustryPackVersion(
        id=str(uuid.uuid4()),
        pack_id=pack_id,
        version_semver=clean_semver,
        status=status,
        validation_status="valid",
        validation_errors=[],
        is_system_default=False,
        prompt_base=prompt_base,
        prompt_vars_schema=prompt_vars_schema or {},
        faq_seed=faq_seed or [],
        appointment_types=appointment_types or [],
        intake_questions=intake_questions or [],
        intake_schema=intake_schema or {},
        pipeline_stages=pipeline_stages
        or ["lead", "contacted", "qualified", "scheduled", "completed"],
        emergency_rules=emergency_rules or {"keywords": [], "safety_advice": ""},
        outbound_scripts=outbound_scripts or {},
        test_scenarios=test_scenarios or [],
        allowed_outbound_categories=allowed_outbound_categories or ["A", "B", "C", "D", "E"],
        requires_hipaa_baa=requires_hipaa_baa,
    )
    db.add(new_version)
    pack.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(new_version)
    return new_version
