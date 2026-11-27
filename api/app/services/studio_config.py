"""4-Layer Studio Configuration & White-Label Terminology Engine.

Inheritance order (most specific wins):
  1. Client Override (`Tenant.config["studio"]`)
  2. Industry Pack Preset (`INDUSTRY_STUDIO_PRESETS[pack_slug]`)
  3. Subscription Plan / Entitlements (`Plan` limits & feature gates)
  4. Platform Default (`DEFAULT_STUDIO_CONFIG`)
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.entitlement import Plan
from api.app.models.industry_pack import IndustryPack, TenantPackApplication
from api.app.models.subscription import Subscription
from api.app.models.tenant import AgentProfile, Tenant

DEFAULT_STUDIO_CONFIG: dict[str, Any] = {
    "terminology": {
        "brand_name": "VedaVoice",
        "app_tagline": "AI Receptionist & Dispatch",
        "receptionist_title": "AI Receptionist",
        "team_label": "Staff & Dispatch",
        "professional_singular": "Technician",
        "professional_plural": "Technicians",
        "dispatcher_label": "Dispatcher",
        "customer_singular": "Customer",
        "customer_plural": "Customers",
        "lead_singular": "Lead",
        "lead_plural": "Leads",
        "booking_singular": "Booking",
        "booking_plural": "Bookings",
        "quote_label": "Quotes & Estimates",
        "invoice_label": "Customer Invoices",
        "location_label": "Locations & Branches",
        "service_singular": "Service",
        "service_plural": "Services",
    },
    "nav_labels": {
        "dashboard": "Dashboard Overview",
        "calls": "Call Explorer & Audio",
        "campaigns": "Outbound Campaigns",
        "crm": "Native CRM Pipeline",
        "integrations": "Integrations & Sync",
        "knowledge": "Knowledge Base RAG",
        "calendar": "Staff & Dispatch",
        "quotes": "Quotes & Estimates",
        "invoices": "Customer Invoices",
        "locations": "Locations & Branches",
        "packs": "Industry Packs",
        "profile": "Receptionist Config",
        "forms": "Lead Form Builder",
        "billing": "Billing & Minutes",
    },
    "enabled_pages": {
        "dashboard": True,
        "calls": True,
        "campaigns": True,
        "crm": True,
        "integrations": True,
        "knowledge": True,
        "calendar": True,
        "quotes": True,
        "invoices": True,
        "locations": True,
        "packs": True,
        "profile": True,
        "forms": True,
        "billing": True,
    },
    "hidden_sections": [],
    "theme": {
        "accent_signal": "#4f46e5",
        "accent_signal_ink": "#ffffff",
        "surface_canvas": "#f8fafc",
        "surface_panel": "#ffffff",
        "logo_url": "",
        "support_email": "support@vedavoice.ai",
    },
    "voice_defaults": {
        "tone": "direct",
        "greeting_template": "Thanks for calling {brand_name}. How can I help you today?",
        "emergency_keywords": ["urgent", "emergency", "leak", "broken"],
        "custom_system_instructions": "",
    },
    "plan_overrides": {
        "max_minutes": None,
        "max_phone_numbers": None,
        "crm_connectors_max": None,
        "outbound_campaigns_enabled": None,
        "hipaa_baa_enabled": None,
        "custom_pricing_label": "",
    },
}

INDUSTRY_STUDIO_PRESETS: dict[str, dict[str, Any]] = {
    "plumbing": {
        "label": "Plumbing & Home Trades",
        "terminology": {
            "team_label": "Dispatch Crew",
            "professional_singular": "Technician",
            "professional_plural": "Technicians",
            "customer_singular": "Homeowner",
            "customer_plural": "Homeowners",
            "booking_singular": "Dispatch",
            "booking_plural": "Dispatches",
            "quote_label": "Field Estimates",
            "location_label": "Service Branches",
        },
        "nav_labels": {
            "calendar": "Dispatch Board",
            "quotes": "Field Estimates",
            "locations": "Service Branches",
        },
        "voice_defaults": {
            "tone": "direct",
            "emergency_keywords": ["burst pipe", "flooding", "gas leak", "sewer backup"],
        },
    },
    "hvac": {
        "label": "HVAC & Mechanical",
        "terminology": {
            "team_label": "Service Fleet",
            "professional_singular": "HVAC Tech",
            "professional_plural": "HVAC Techs",
            "booking_singular": "Service Call",
            "booking_plural": "Service Calls",
            "quote_label": "System Quotes",
        },
        "nav_labels": {
            "calendar": "Service Dispatch",
            "quotes": "System Quotes",
        },
        "voice_defaults": {
            "tone": "direct",
            "emergency_keywords": ["no heat", "no ac", "gas smell", "carbon monoxide"],
        },
    },
    "dental": {
        "label": "Dental Practice",
        "terminology": {
            "receptionist_title": "Patient Coordinator",
            "team_label": "Care Team",
            "professional_singular": "Dentist",
            "professional_plural": "Dentists",
            "customer_singular": "Patient",
            "customer_plural": "Patients",
            "lead_singular": "New Patient",
            "lead_plural": "New Patients",
            "booking_singular": "Appointment",
            "booking_plural": "Appointments",
            "quote_label": "Treatment Plans",
            "invoice_label": "Patient Billing",
            "location_label": "Clinics",
        },
        "nav_labels": {
            "calendar": "Chair Schedule",
            "crm": "Patient Pipeline",
            "quotes": "Treatment Plans",
            "invoices": "Patient Billing",
            "locations": "Clinics",
            "profile": "Coordinator Config",
        },
        "enabled_pages": {
            "campaigns": False,
        },
        "voice_defaults": {
            "tone": "warm",
            "emergency_keywords": ["severe toothache", "swelling", "knocked out tooth", "bleeding"],
        },
    },
    "medical": {
        "label": "Medical & Healthcare Clinic",
        "terminology": {
            "receptionist_title": "Clinical Intake Coordinator",
            "team_label": "Clinical Staff",
            "professional_singular": "Doctor",
            "professional_plural": "Doctors",
            "customer_singular": "Patient",
            "customer_plural": "Patients",
            "lead_singular": "Referral",
            "lead_plural": "Referrals",
            "booking_singular": "Visit",
            "booking_plural": "Visits",
            "quote_label": "Care Estimates",
            "invoice_label": "Patient Statements",
            "location_label": "Clinics",
        },
        "nav_labels": {
            "calendar": "Provider Schedule",
            "crm": "Patient Intake",
            "quotes": "Care Estimates",
            "invoices": "Patient Statements",
            "locations": "Clinics",
        },
        "enabled_pages": {
            "quotes": False,
        },
        "voice_defaults": {
            "tone": "empathetic",
            "emergency_keywords": ["chest pain", "difficulty breathing", "911", "bleeding"],
        },
    },
    "legal": {
        "label": "Law Firm & Legal Intake",
        "terminology": {
            "receptionist_title": "Legal Intake Specialist",
            "team_label": "Legal Team",
            "professional_singular": "Attorney",
            "professional_plural": "Attorneys",
            "customer_singular": "Client",
            "customer_plural": "Clients",
            "lead_singular": "Matter",
            "lead_plural": "Matters",
            "booking_singular": "Consultation",
            "booking_plural": "Consultations",
            "quote_label": "Retainers",
            "invoice_label": "Client Invoices",
            "location_label": "Offices",
        },
        "nav_labels": {
            "calendar": "Attorney Calendar",
            "crm": "Case Pipeline",
            "quotes": "Retainers",
            "locations": "Offices",
            "profile": "Intake Config",
        },
        "voice_defaults": {
            "tone": "professional",
            "emergency_keywords": ["arrested", "court tomorrow", "subpoena", "restraining order"],
        },
    },
    "real_estate": {
        "label": "Real Estate & Property",
        "terminology": {
            "receptionist_title": "Showing Concierge",
            "team_label": "Agent Roster",
            "professional_singular": "Agent",
            "professional_plural": "Agents",
            "customer_singular": "Buyer / Seller",
            "customer_plural": "Clients",
            "lead_singular": "Prospect",
            "lead_plural": "Prospects",
            "booking_singular": "Showing",
            "booking_plural": "Showings",
            "location_label": "Brokerages",
        },
        "nav_labels": {
            "calendar": "Showing Schedule",
            "crm": "Buyer & Seller CRM",
            "locations": "Brokerages",
        },
    },
}


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge override dictionary into a copy of base."""
    result = deepcopy(base)
    for key, val in (override or {}).items():
        if isinstance(val, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], val)
        elif val is not None:
            result[key] = deepcopy(val)
    return result


def _detect_tenant_industry_slug(tenant: Tenant, db: Session) -> str | None:
    """Resolve active industry pack slug from tenant config or TenantPackApplication."""
    cfg = tenant.config or {}
    if cfg.get("studio_industry_preset"):
        return str(cfg["studio_industry_preset"]).lower()
    if cfg.get("industry_pack_slug"):
        return str(cfg["industry_pack_slug"]).lower()

    app_row = db.scalar(
        select(TenantPackApplication)
        .where(TenantPackApplication.tenant_id == tenant.id)
        .order_by(TenantPackApplication.applied_at.desc())
    )
    if app_row:
        pack = db.scalar(select(IndustryPack).where(IndustryPack.id == app_row.pack_id))
        if pack:
            return pack.slug.lower()
    return None


def _get_plan_studio_layer(tenant: Tenant, db: Session) -> dict[str, Any]:
    """Derive Layer 3 (Subscription Plan / Entitlements) studio defaults."""
    sub = db.scalar(
        select(Subscription)
        .where(Subscription.tenant_id == tenant.id)
        .order_by(Subscription.created_at.desc())
    )
    if not sub:
        return {}

    tier = (sub.tier or "starter").lower()
    plan = db.scalar(select(Plan).where(Plan.code == tier))
    if not plan:
        return {}

    entitlements = plan.entitlements or {}
    layer: dict[str, Any] = {"enabled_pages": {}, "plan_overrides": {}}
    if entitlements.get("outbound.enabled") is False:
        layer["enabled_pages"]["campaigns"] = False
    if entitlements.get("minutes.max") is not None:
        layer["plan_overrides"]["max_minutes"] = entitlements["minutes.max"]
    return layer


def resolve_tenant_studio(tenant: Tenant, db: Session) -> dict[str, Any]:
    """Compute final 4-layer merged Studio config for a tenant."""
    # Layer 4: Platform default
    resolved = deepcopy(DEFAULT_STUDIO_CONFIG)

    # Layer 3: Subscription Plan gates
    plan_layer = _get_plan_studio_layer(tenant, db)
    if plan_layer:
        resolved = deep_merge(resolved, plan_layer)

    # Layer 2: Industry Pack preset
    industry_slug = _detect_tenant_industry_slug(tenant, db)
    if industry_slug:
        # Match exact or prefix (e.g. "plumbing_hvac" -> "plumbing")
        preset = INDUSTRY_STUDIO_PRESETS.get(industry_slug)
        if not preset:
            for key, candidate in INDUSTRY_STUDIO_PRESETS.items():
                if key in industry_slug:
                    preset = candidate
                    break
        if preset:
            preset_clean = {k: v for k, v in preset.items() if k != "label"}
            resolved = deep_merge(resolved, preset_clean)

    # Layer 1: Client override
    client_override = (tenant.config or {}).get("studio") or {}
    if isinstance(client_override, dict):
        resolved = deep_merge(resolved, client_override)

    return {
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
        "industry_slug": industry_slug,
        "resolved": resolved,
        "client_override": client_override if isinstance(client_override, dict) else {},
    }


def sync_studio_voice_defaults_to_agent_profile(
    tenant: Tenant, resolved_studio: dict[str, Any], db: Session
) -> None:
    """Sync resolved Studio voice_defaults & branding into the tenant's AgentProfile."""
    profile = db.scalar(select(AgentProfile).where(AgentProfile.tenant_id == tenant.id))
    if not profile:
        return

    voice = resolved_studio.get("voice_defaults") or {}
    terms = resolved_studio.get("terminology") or {}
    brand_name = terms.get("brand_name") or tenant.name

    if voice.get("tone"):
        profile.tone = str(voice["tone"])
    if voice.get("greeting_template"):
        profile.greeting = str(voice["greeting_template"]).replace("{brand_name}", str(brand_name))
    if isinstance(voice.get("emergency_keywords"), list) and voice["emergency_keywords"]:
        profile.emergency_keywords = [str(k) for k in voice["emergency_keywords"]]
    if voice.get("custom_system_instructions") is not None:
        profile.custom_instructions = str(voice["custom_system_instructions"])
