"""4-Tier Entitlement & Feature Flag Resolver Service.

Strict Resolution Order:
  Tier 1: Base Plan Entitlements (plans.entitlements)
  Tier 2: Trial Defaults (if tenant is trialing; Growth-level with restricted outbound)
  Tier 3: Tenant Entitlement Overrides (agency-granted, unexpired)
  Tier 4: Hard Compliance Constraints (never overridable by any tier/plan)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.entitlement import (
    Plan,
    TenantEntitlementOverride,
    TrialAbuseRecord,
)
from api.app.models.location import Location
from api.app.models.subscription import Subscription
from api.app.models.tenant import PhoneNumber
from api.app.models.user import User

logger = logging.getLogger("vedavoice.entitlements")

# Disposable email domain blocklist for trial anti-abuse (FR-TRIAL-9)
DISPOSABLE_DOMAINS: set[str] = {
    "mailinator.com",
    "guerrillamail.com",
    "tempmail.com",
    "10minutemail.com",
    "yopmail.com",
    "throwawaymail.com",
    "trashmail.com",
    "dispostable.com",
    "getairmail.com",
}

# Standard Feature Flag Catalog Definitions
DEFAULT_FEATURE_FLAGS: list[dict[str, Any]] = [
    {
        "key": "crm.native",
        "kind": "bool",
        "description": "Native CRM and contact pipeline accessible",
        "default_value": True,
        "compliance_sensitive": False,
    },
    {
        "key": "crm.connectors.max",
        "kind": "int",
        "description": "Max external CRM connectors (HubSpot, Zoho, GHL, Pipedrive)",
        "default_value": 1,
        "compliance_sensitive": False,
    },
    {
        "key": "calendar.max_connections",
        "kind": "int",
        "description": "Max external Google/Outlook calendar connections",
        "default_value": 1,
        "compliance_sensitive": False,
    },
    {
        "key": "calendar.round_robin",
        "kind": "bool",
        "description": "Multi-staff round-robin appointment booking",
        "default_value": False,
        "compliance_sensitive": False,
    },
    {
        "key": "outbound.enabled",
        "kind": "bool",
        "description": "Outbound dialing engine enabled",
        "default_value": True,
        "compliance_sensitive": False,
    },
    {
        "key": "outbound.categories",
        "kind": "list",
        "description": "Allowed outbound call categories (subset of B, C, D)",
        "default_value": ["B"],
        "compliance_sensitive": True,
    },
    {
        "key": "outbound.campaigns",
        "kind": "bool",
        "description": "Campaign broadcast builder enabled",
        "default_value": False,
        "compliance_sensitive": False,
    },
    {
        "key": "numbers.max",
        "kind": "int",
        "description": "Max telephone numbers provisioned",
        "default_value": 1,
        "compliance_sensitive": False,
    },
    {
        "key": "seats.max",
        "kind": "int",
        "description": "Max dashboard user seats",
        "default_value": 2,
        "compliance_sensitive": False,
    },
    {
        "key": "locations.max",
        "kind": "int",
        "description": "Max business locations",
        "default_value": 1,
        "compliance_sensitive": False,
    },
    {
        "key": "transfer.mode",
        "kind": "enum",
        "description": "Call transfer behavior (basic or routing)",
        "default_value": "basic",
        "compliance_sensitive": False,
    },
    {
        "key": "languages",
        "kind": "list",
        "description": "Supported receptionist voice languages",
        "default_value": ["en"],
        "compliance_sensitive": False,
    },
    {
        "key": "retention.transcript_days",
        "kind": "int",
        "description": "Call transcript retention duration in days",
        "default_value": 30,
        "compliance_sensitive": False,
    },
    {
        "key": "retention.recording_days",
        "kind": "int",
        "description": "Call audio recording retention duration in days",
        "default_value": 30,
        "compliance_sensitive": False,
    },
    {
        "key": "reports.level",
        "kind": "enum",
        "description": "Analytics tier (basic, monthly, roi, analytics, per_location, custom)",
        "default_value": "basic",
        "compliance_sensitive": False,
    },
    {
        "key": "api.access",
        "kind": "enum",
        "description": "REST API developer access (none, read, full)",
        "default_value": "none",
        "compliance_sensitive": False,
    },
    {
        "key": "webhooks.enabled",
        "kind": "bool",
        "description": "Outbound HMAC signed webhooks",
        "default_value": False,
        "compliance_sensitive": False,
    },
    {
        "key": "support.tier",
        "kind": "enum",
        "description": "Support SLA tier (email, priority, onboarding, dedicated, sla)",
        "default_value": "email",
        "compliance_sensitive": False,
    },
    {
        "key": "voice.premium",
        "kind": "bool",
        "description": "Access to ultra-realistic neural TTS voices",
        "default_value": False,
        "compliance_sensitive": False,
    },
    {
        "key": "branding.white_label",
        "kind": "bool",
        "description": "White-label custom domain and custom email sender",
        "default_value": False,
        "compliance_sensitive": False,
    },
    {
        "key": "sso.enabled",
        "kind": "bool",
        "description": "SAML 2.0 / OIDC enterprise single sign-on",
        "default_value": False,
        "compliance_sensitive": False,
    },
    {
        "key": "hipaa.package",
        "kind": "bool",
        "description": "Healthcare HIPAA BAA security and redacted sync mode",
        "default_value": False,
        "compliance_sensitive": True,
    },
    {
        "key": "sms.enabled",
        "kind": "bool",
        "description": "Outbound SMS follow-up and confirmation notifications",
        "default_value": True,
        "compliance_sensitive": True,
    },
]

# Trial Entitlements (Growth-level features, restricted outbound, max 1 number)
TRIAL_ENTITLEMENT_DEFAULTS: dict[str, Any] = {
    "crm.native": True,
    "crm.connectors.max": 4,
    "calendar.max_connections": 5,
    "calendar.round_robin": False,
    "outbound.enabled": True,
    "outbound.categories": ["B"],
    "outbound.campaigns": False,
    "numbers.max": 1,
    "seats.max": 2,
    "locations.max": 1,
    "transfer.mode": "basic",
    "languages": ["en", "es"],
    "retention.transcript_days": 30,
    "retention.recording_days": 30,
    "reports.level": "basic",
    "api.access": "read",
    "webhooks.enabled": False,
    "support.tier": "email",
    "voice.premium": False,
    "branding.white_label": False,
    "sso.enabled": False,
    "hipaa.package": False,
    "sms.enabled": True,
}

# 7-Plan Baseline Catalog Entitlements Matrix (SRS Addendum Section 4.5)
PLAN_ENTITLEMENTS_MATRIX: dict[str, dict[str, Any]] = {
    "lite": {
        "crm.native": True,
        "crm.connectors.max": 1,
        "calendar.max_connections": 1,
        "calendar.round_robin": False,
        "outbound.enabled": True,
        "outbound.categories": ["B"],
        "outbound.campaigns": False,
        "numbers.max": 1,
        "seats.max": 2,
        "locations.max": 1,
        "transfer.mode": "basic",
        "languages": ["en"],
        "retention.transcript_days": 30,
        "retention.recording_days": 30,
        "reports.level": "basic",
        "api.access": "none",
        "webhooks.enabled": False,
        "support.tier": "email",
        "voice.premium": False,
        "branding.white_label": False,
        "sso.enabled": False,
        "hipaa.package": False,
        "sms.enabled": True,
    },
    "starter": {
        "crm.native": True,
        "crm.connectors.max": 4,
        "calendar.max_connections": 3,
        "calendar.round_robin": False,
        "outbound.enabled": True,
        "outbound.categories": ["B"],
        "outbound.campaigns": True,
        "numbers.max": 2,
        "seats.max": 5,
        "locations.max": 1,
        "transfer.mode": "basic",
        "languages": ["en"],
        "retention.transcript_days": 90,
        "retention.recording_days": 30,
        "reports.level": "monthly",
        "api.access": "none",
        "webhooks.enabled": False,
        "support.tier": "email",
        "voice.premium": False,
        "branding.white_label": False,
        "sso.enabled": False,
        "hipaa.package": False,
        "sms.enabled": True,
    },
    "growth": {
        "crm.native": True,
        "crm.connectors.max": 4,
        "calendar.max_connections": 5,
        "calendar.round_robin": False,
        "outbound.enabled": True,
        "outbound.categories": ["B", "C"],
        "outbound.campaigns": True,
        "numbers.max": 3,
        "seats.max": 10,
        "locations.max": 1,
        "transfer.mode": "basic",
        "languages": ["en", "es"],
        "retention.transcript_days": 90,
        "retention.recording_days": 60,
        "reports.level": "roi",
        "api.access": "read",
        "webhooks.enabled": False,
        "support.tier": "priority",
        "voice.premium": False,
        "branding.white_label": False,
        "sso.enabled": False,
        "hipaa.package": False,
        "sms.enabled": True,
    },
    "pro": {
        "crm.native": True,
        "crm.connectors.max": 4,
        "calendar.max_connections": 10,
        "calendar.round_robin": True,
        "outbound.enabled": True,
        "outbound.categories": ["B", "C", "D"],
        "outbound.campaigns": True,
        "numbers.max": 5,
        "seats.max": 20,
        "locations.max": 1,
        "transfer.mode": "routing",
        "languages": ["en", "es"],
        "retention.transcript_days": 365,
        "retention.recording_days": 90,
        "reports.level": "analytics",
        "api.access": "full",
        "webhooks.enabled": True,
        "support.tier": "onboarding",
        "voice.premium": True,
        "branding.white_label": False,
        "sso.enabled": False,
        "hipaa.package": False,
        "sms.enabled": True,
    },
    "scale": {
        "crm.native": True,
        "crm.connectors.max": 4,
        "calendar.max_connections": -1,  # unlimited
        "calendar.round_robin": True,
        "outbound.enabled": True,
        "outbound.categories": ["B", "C", "D"],
        "outbound.campaigns": True,
        "numbers.max": 20,
        "seats.max": 50,
        "locations.max": 25,
        "transfer.mode": "routing",
        "languages": ["en", "es"],
        "retention.transcript_days": 365,
        "retention.recording_days": 90,
        "reports.level": "per_location",
        "api.access": "full",
        "webhooks.enabled": True,
        "support.tier": "dedicated",
        "voice.premium": True,
        "branding.white_label": False,
        "sso.enabled": False,
        "hipaa.package": False,
        "sms.enabled": True,
    },
    "enterprise": {
        "crm.native": True,
        "crm.connectors.max": -1,
        "calendar.max_connections": -1,
        "calendar.round_robin": True,
        "outbound.enabled": True,
        "outbound.categories": ["B", "C", "D"],
        "outbound.campaigns": True,
        "numbers.max": -1,
        "seats.max": -1,
        "locations.max": -1,
        "transfer.mode": "routing",
        "languages": ["en", "es"],
        "retention.transcript_days": -1,
        "retention.recording_days": -1,
        "reports.level": "custom",
        "api.access": "full",
        "webhooks.enabled": True,
        "support.tier": "sla",
        "voice.premium": True,
        "branding.white_label": True,
        "sso.enabled": True,
        "hipaa.package": True,
        "sms.enabled": True,
    },
    "agency": {
        "crm.native": True,
        "crm.connectors.max": 4,
        "calendar.max_connections": -1,
        "calendar.round_robin": True,
        "outbound.enabled": True,
        "outbound.categories": ["B", "C", "D"],
        "outbound.campaigns": True,
        "numbers.max": -1,
        "seats.max": -1,
        "locations.max": -1,
        "transfer.mode": "routing",
        "languages": ["en", "es"],
        "retention.transcript_days": 90,
        "retention.recording_days": 30,
        "reports.level": "monthly",
        "api.access": "full",
        "webhooks.enabled": True,
        "support.tier": "priority",
        "voice.premium": True,
        "branding.white_label": True,
        "sso.enabled": False,
        "hipaa.package": False,
        "sms.enabled": True,
    },
}


def resolve_tenant_entitlements(db: Session, tenant_id: str) -> dict[str, Any]:
    """Execute the 4-tier entitlement resolution for a tenant.

    Resolution Order:
      1. Base Plan Entitlements (from Plan table or tier defaults)
      2. Free Trial Defaults (if tenant is trialing)
      3. Tenant Entitlement Overrides (unexpired agency overrides)
      4. Hard Compliance Constraints (never overridable)
    """
    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
    tier = (sub.tier if sub else "trial").lower()
    is_trialing = (sub.status == "trialing" or tier == "trial") if sub else True

    # Tier 1: Plan baseline
    plan_obj = db.scalar(select(Plan).where(Plan.code == tier))
    if plan_obj and plan_obj.entitlements:
        entitlements = dict(plan_obj.entitlements)
    elif tier in PLAN_ENTITLEMENTS_MATRIX:
        entitlements = dict(PLAN_ENTITLEMENTS_MATRIX[tier])
    else:
        entitlements = dict(PLAN_ENTITLEMENTS_MATRIX.get("starter", {}))

    # Tier 2: Free Trial Defaults
    if is_trialing:
        # Overlay trial defaults (Growth-level features with strict single number and Category B only)
        for k, v in TRIAL_ENTITLEMENT_DEFAULTS.items():
            entitlements[k] = v

    # Tier 3: Tenant Entitlement Overrides
    now = datetime.now(UTC)
    overrides = db.scalars(
        select(TenantEntitlementOverride).where(
            TenantEntitlementOverride.tenant_id == tenant_id,
            (TenantEntitlementOverride.expires_at.is_(None))
            | (TenantEntitlementOverride.expires_at > now),
        )
    ).all()
    for ov in overrides:
        entitlements[ov.key] = ov.value

    # Tier 4: Hard Compliance Constraints (Cannot be bypassed under any circumstances)
    # Category E (Cold calling) is strictly prohibited from outbound.categories
    cats = entitlements.get("outbound.categories", ["B"])
    if isinstance(cats, list):
        entitlements["outbound.categories"] = [c for c in cats if str(c).upper() != "E"]
    else:
        entitlements["outbound.categories"] = ["B"]

    # If trial is expired (14 days or 100 minutes reached), outbound is disabled
    if is_trialing and sub and sub.is_trial_expired:
        entitlements["outbound.enabled"] = False

    return entitlements


def check_tenant_entitlement(
    db: Session,
    tenant_id: str,
    key: str,
    requested_value: Any = None,
) -> tuple[bool, str | None]:
    """Check if tenant has permission for an action or resource count under resolved entitlements."""
    entitlements = resolve_tenant_entitlements(db, tenant_id)
    if key not in entitlements:
        return False, f"Unknown feature flag: {key}"

    val = entitlements[key]

    # Boolean check
    if isinstance(val, bool):
        if not val:
            return False, f"Feature '{key}' is not included in your current plan. Please upgrade."
        return True, None

    # Numerical limit check (e.g. seats.max, numbers.max, crm.connectors.max)
    if isinstance(val, int | float):
        if val == -1:  # Unlimited
            return True, None
        if requested_value is not None and isinstance(requested_value, int | float):
            if requested_value > val:
                return (
                    False,
                    f"Limit reached for '{key}' ({requested_value} requested, max {val} allowed). Please upgrade your plan.",
                )
        return True, None

    # List membership check (e.g. outbound.categories, languages)
    if isinstance(val, list):
        if requested_value is not None:
            if requested_value not in val:
                return (
                    False,
                    f"Option '{requested_value}' is not permitted for '{key}' under your plan (allowed: {val}).",
                )
        return True, None

    return True, None


def verify_trial_eligibility(
    db: Session,
    email: str,
    phone: str,
    card_fingerprint: str | None = None,
) -> tuple[bool, str | None]:
    """Verify tenant is eligible for 14-day / 100-minute free trial (Anti-Abuse FR-TRIAL-3 & 9)."""
    # 1. Check disposable email domains
    clean_email = email.strip().lower()
    if "@" in clean_email:
        domain = clean_email.split("@")[-1]
        if domain in DISPOSABLE_DOMAINS:
            return (
                False,
                "Disposable and temporary email addresses are not permitted for free trials.",
            )

    # 2. Check phone number duplication
    if phone:
        existing_phone = db.scalar(
            select(TrialAbuseRecord).where(TrialAbuseRecord.phone_number == phone)
        )
        if existing_phone:
            return (
                False,
                "Phone number is already assigned to an active tenant or redeemed for a free trial.",
            )

    # 3. Check card fingerprint duplication (from Stripe SetupIntent)
    if card_fingerprint:
        existing_card = db.scalar(
            select(TrialAbuseRecord).where(TrialAbuseRecord.card_fingerprint == card_fingerprint)
        )
        if existing_card:
            return False, "A free trial has already been redeemed with this payment card."

    return True, None


def check_downgrade_limits(
    db: Session,
    tenant_id: str,
    target_plan_code: str,
) -> dict[str, Any]:
    """Pre-downgrade gate (FR-PLAN-2): list any resources exceeding the target plan limits."""
    target_plan = db.scalar(select(Plan).where(Plan.code == target_plan_code.lower()))
    if not target_plan:
        return {"allowed": False, "reason": f"Target plan '{target_plan_code}' not found."}

    target_entitlements = (
        dict(target_plan.entitlements)
        if target_plan.entitlements
        else PLAN_ENTITLEMENTS_MATRIX.get(target_plan_code.lower(), {})
    )

    excess: list[dict[str, Any]] = []

    # 1. Phone numbers count
    max_numbers = target_entitlements.get("numbers.max", 1)
    if max_numbers != -1:
        # Count total active numbers
        active_numbers = len(
            db.scalars(
                select(PhoneNumber).where(
                    PhoneNumber.tenant_id == tenant_id, PhoneNumber.status == "active"
                )
            ).all()
        )
        if active_numbers > max_numbers:
            excess.append(
                {
                    "resource": "phone_numbers",
                    "current": active_numbers,
                    "target_max": max_numbers,
                    "message": f"Tenant has {active_numbers} active numbers, but {target_plan.name} allows at most {max_numbers}.",
                }
            )

    # 2. User seats count
    max_seats = target_entitlements.get("seats.max", 2)
    if max_seats != -1:
        active_users = len(
            db.scalars(
                select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True))
            ).all()
        )
        if active_users > max_seats:
            excess.append(
                {
                    "resource": "seats",
                    "current": active_users,
                    "target_max": max_seats,
                    "message": f"Tenant has {active_users} active users, but {target_plan.name} allows at most {max_seats}.",
                }
            )

    # 3. Branch Locations count (Multi-location plans)
    max_locations = target_entitlements.get("locations.max", 1)
    if max_locations != -1:
        active_locations = len(
            db.scalars(
                select(Location).where(
                    Location.tenant_id == tenant_id, Location.is_active.is_(True)
                )
            ).all()
        )
        if active_locations > max_locations:
            excess.append(
                {
                    "resource": "locations",
                    "current": active_locations,
                    "target_max": max_locations,
                    "message": f"Tenant has {active_locations} active branch locations, but {target_plan.name} allows at most {max_locations}.",
                }
            )

    # 4. Outbound Categories
    target_categories = set(target_entitlements.get("outbound.categories", ["B"]))
    current_entitlements = resolve_tenant_entitlements(db, tenant_id)
    current_categories = set(current_entitlements.get("outbound.categories", ["B"]))
    incompatible_categories = current_categories - target_categories
    if incompatible_categories:
        excess.append(
            {
                "resource": "outbound_categories",
                "incompatible": list(incompatible_categories),
                "message": f"{target_plan.name} does not allow outbound categories {list(incompatible_categories)}. Active campaigns using them must be paused.",
            }
        )

    return {
        "allowed": len(excess) == 0,
        "target_plan": target_plan_code,
        "excess_resources": excess,
    }
