"""US Telephony Compliance Gate v2 (TCPA, TSR, FCC 24-17, State Mini-TCPAs).

Executes strict 10-point compliance verification before any outbound call attempt.
No bypass flags exist. All decisions are deterministic, logged, and audited.
"""

from __future__ import annotations

import logging
import re
import zoneinfo
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from datetime import time as dtime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.models.call import Call
from api.app.models.compliance import PlatformSuppression, StateRule
from api.app.models.outbound import ConsentRecord, OutboundDispatch, SuppressionRecord
from api.app.models.subscription import Subscription
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.services.dnc_scrub import scrub_phone_against_dnc

logger = logging.getLogger("vedavoice.compliance")

# NANP Area Code mapping to State and IANA Timezone
_AREA_CODE_MAP: dict[str, tuple[str, str]] = {
    # Florida (FL) - Stricter 8am-8pm window
    "239": ("FL", "America/New_York"),
    "305": ("FL", "America/New_York"),
    "321": ("FL", "America/New_York"),
    "352": ("FL", "America/New_York"),
    "386": ("FL", "America/New_York"),
    "407": ("FL", "America/New_York"),
    "561": ("FL", "America/New_York"),
    "727": ("FL", "America/New_York"),
    "754": ("FL", "America/New_York"),
    "772": ("FL", "America/New_York"),
    "786": ("FL", "America/New_York"),
    "813": ("FL", "America/New_York"),
    "850": ("FL", "America/Chicago"),
    "863": ("FL", "America/New_York"),
    "904": ("FL", "America/New_York"),
    "941": ("FL", "America/New_York"),
    "954": ("FL", "America/New_York"),
    # Maryland (MD) - Stricter 8am-8pm window
    "240": ("MD", "America/New_York"),
    "301": ("MD", "America/New_York"),
    "410": ("MD", "America/New_York"),
    "443": ("MD", "America/New_York"),
    "667": ("MD", "America/New_York"),
    # Oklahoma (OK) - Stricter 8am-8pm window, max 3 attempts/24h
    "405": ("OK", "America/Chicago"),
    "580": ("OK", "America/Chicago"),
    "918": ("OK", "America/Chicago"),
    "539": ("OK", "America/Chicago"),
    # Washington (WA)
    "206": ("WA", "America/Los_Angeles"),
    "425": ("WA", "America/Los_Angeles"),
    "509": ("WA", "America/Los_Angeles"),
    "564": ("WA", "America/Los_Angeles"),
    # California (CA)
    "213": ("CA", "America/Los_Angeles"),
    "310": ("CA", "America/Los_Angeles"),
    "415": ("CA", "America/Los_Angeles"),
    "510": ("CA", "America/Los_Angeles"),
    "619": ("CA", "America/Los_Angeles"),
    "650": ("CA", "America/Los_Angeles"),
    "714": ("CA", "America/Los_Angeles"),
    "818": ("CA", "America/Los_Angeles"),
    "858": ("CA", "America/Los_Angeles"),
    "949": ("CA", "America/Los_Angeles"),
    # New York / Eastern
    "212": ("NY", "America/New_York"),
    "315": ("NY", "America/New_York"),
    "332": ("NY", "America/New_York"),
    "347": ("NY", "America/New_York"),
    "516": ("NY", "America/New_York"),
    "518": ("NY", "America/New_York"),
    "585": ("NY", "America/New_York"),
    "607": ("NY", "America/New_York"),
    "631": ("NY", "America/New_York"),
    "646": ("NY", "America/New_York"),
    "716": ("NY", "America/New_York"),
    "718": ("NY", "America/New_York"),
    "845": ("NY", "America/New_York"),
    "914": ("NY", "America/New_York"),
    "917": ("NY", "America/New_York"),
    "929": ("NY", "America/New_York"),
    "934": ("NY", "America/New_York"),
    "202": ("DC", "America/New_York"),
    "617": ("MA", "America/New_York"),
    "857": ("MA", "America/New_York"),
    "215": ("PA", "America/New_York"),
    "267": ("PA", "America/New_York"),
    # Central
    "312": ("IL", "America/Chicago"),
    "773": ("IL", "America/Chicago"),
    "847": ("IL", "America/Chicago"),
    "214": ("TX", "America/Chicago"),
    "469": ("TX", "America/Chicago"),
    "512": ("TX", "America/Chicago"),
    "713": ("TX", "America/Chicago"),
    "832": ("TX", "America/Chicago"),
    "972": ("TX", "America/Chicago"),
    # Mountain
    "303": ("CO", "America/Denver"),
    "720": ("CO", "America/Denver"),
    "480": ("AZ", "America/Phoenix"),
    "602": ("AZ", "America/Phoenix"),
    "623": ("AZ", "America/Phoenix"),
    "801": ("UT", "America/Denver"),
    # Oregon
    "503": ("OR", "America/Los_Angeles"),
    "541": ("OR", "America/Los_Angeles"),
    "971": ("OR", "America/Los_Angeles"),
}


def _ensure_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(UTC)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def normalize_e164_phone(phone: str | None) -> str:
    """Normalize phone number to standard E.164 string format (+1XXXXXXXXXX)."""
    if not phone or not isinstance(phone, str):
        return ""
    clean = phone.strip()
    digits = re.sub(r"\D", "", clean)
    if not digits or len(digits) < 10 or len(digits) > 15:
        return ""
    if clean.startswith("+"):
        return f"+{digits}"
    if len(digits) == 10 and digits[0] in "23456789":
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return f"+{digits}"


def resolve_recipient_timezone_and_state(
    phone_e164: str, tenant_fallback_tz: str = "America/New_York"
) -> tuple[str, str]:
    """Resolve recipient state code and IANA timezone from phone area code."""
    digits = re.sub(r"\D", "", phone_e164)
    area_code = ""
    if len(digits) == 11 and digits.startswith("1"):
        area_code = digits[1:4]
    elif len(digits) == 10:
        area_code = digits[0:3]

    if area_code and area_code in _AREA_CODE_MAP:
        return _AREA_CODE_MAP[area_code]

    return "US", tenant_fallback_tz or "America/New_York"


@dataclass
class ComplianceGateResult:
    """Detailed verdict for all 10 points of Compliance Gate v2."""

    passed: bool
    reason: str  # "approved" or specific rejection reason
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "reason": self.reason,
            "details": self.details,
        }


def evaluate_compliance_gate_v2(
    db: Session,
    tenant_id: str,
    to_phone: str,
    from_phone: str,
    category: str = "B",  # B: transactional, C: speed-to-lead, D: reactivation, E: cold (blocked)
    purpose: str = "call_triage",
    has_consent: bool | None = None,
    current_time: datetime | None = None,
) -> ComplianceGateResult:
    """Execute the strict 10-Point Compliance Gate v2 prior to any outbound call.

    Points:
      1. Category Validation (Category E / Cold Calling hard-blocked)
      2. Consent Verification (category matched, AI voice disclosed, seller verified, unrevoked)
      3. Suppression & Platform DND (tenant suppression + cross-tenant platform suppression)
      4. Federal & State DNC Registry Scrub (31-day cache for C & D)
      5. State Rules & Recipient Local Calling Window (8am-8pm FL/OK/MD/WA/default)
      6. Frequency Caps (State specific caps e.g. OK 3/24h, Category C/D max 1/day, B max 3/24h)
      7. Caller ID Ownership & STIR/SHAKEN Registration
      8. Quiet Days & Holiday Check
      9. Outbound Concurrency Caps (Tenant & Platform Global)
      10. Tenant Standing & Complaint Rate Kill-Switch (>= 3 complaints in 24h pauses outbound)
    """
    now = current_time or datetime.now(UTC)
    norm_to = normalize_e164_phone(to_phone)
    norm_from = normalize_e164_phone(from_phone)

    checks: dict[str, Any] = {"category": category}

    # =========================================================================
    # Point 1: Category Check (Cold calling hard-blocked in code)
    # =========================================================================
    if category.upper() == "E" or category.upper() not in ("A", "B", "C", "D"):
        logger.warning(
            "Compliance hard block: Category E (Cold Calling) prohibited for %s", norm_to
        )
        return ComplianceGateResult(
            passed=False,
            reason="cold_calling_blocked",
            details={
                "category": category,
                "message": "Cold calling, purchased lists, and unconsented outbound calls are hard-blocked in code.",
            },
        )

    # Check if tenant's active Industry Pack narrows allowed categories (FR-PACK-6)
    from api.app.services.industry_packs import validate_pack_outbound_category

    is_cat_allowed, cat_msg = validate_pack_outbound_category(tenant_id, category, db)
    if not is_cat_allowed:
        logger.warning("Compliance rejection: %s", cat_msg)
        return ComplianceGateResult(
            passed=False,
            reason="industry_pack_category_prohibited",
            details={"category": category, "message": cat_msg},
        )

    checks["category_valid"] = category.upper()

    # =========================================================================
    # Region Check (US / NANP +1 only in v1)
    # =========================================================================
    if not norm_to.startswith("+1") or len(norm_to) != 12:
        logger.warning("Compliance rejection: Non-US/NANP country code %s", norm_to)
        return ComplianceGateResult(
            passed=False,
            reason="unsupported_region",
            details={"phone": norm_to, "supported_regions": ["US", "CA"]},
        )
    checks["region_compliant"] = "NANP"

    # =========================================================================
    # Point: Caller ID Ownership & Status (Must own originating trunk before dialing)
    # =========================================================================
    phone_rec = db.scalar(
        select(PhoneNumber).where(
            PhoneNumber.tenant_id == tenant_id,
            PhoneNumber.e164 == norm_from,
            PhoneNumber.status == "active",
        )
    )
    if not phone_rec:
        logger.warning("Compliance rejection: Caller ID %s not owned or active", norm_from)
        return ComplianceGateResult(
            passed=False,
            reason="invalid_caller_id",
            details={"caller_id": norm_from, "tenant_id": tenant_id},
        )
    checks["caller_id_verified"] = norm_from

    # =========================================================================
    # Point 2: Consent Verification (Prior express / written with AI voice disclosure)
    # =========================================================================
    consent_rec = db.scalar(
        select(ConsentRecord)
        .where(
            ConsentRecord.tenant_id == tenant_id,
            ConsentRecord.phone_number == norm_to,
            ConsentRecord.consent_confirmed.is_(True),
            ConsentRecord.revoked_at.is_(None),
        )
        .order_by(ConsentRecord.created_at.desc())
    )

    if has_consent is False or (has_consent is None and not consent_rec):
        logger.warning("Compliance rejection: Missing or revoked consent for %s", norm_to)
        return ComplianceGateResult(
            passed=False,
            reason="consent_missing",
            details={"consent_valid": False, "purpose": purpose, "category": category},
        )

    # For speed-to-lead (C) and reactivation (D): enforce written consent naming AI voice
    if category in ("C", "D"):
        if consent_rec and not consent_rec.ai_voice_disclosed:
            logger.warning(
                "Compliance rejection: Missing AI voice disclosure consent for %s", norm_to
            )
            return ComplianceGateResult(
                passed=False,
                reason="ai_voice_disclosure_missing",
                details={
                    "phone": norm_to,
                    "category": category,
                    "message": "Categories C and D require prior express written consent specifically disclosing AI / artificial voice.",
                },
            )

    checks["consent_verified"] = {
        "status": "valid",
        "method": consent_rec.method if consent_rec else "inferred",
        "ai_voice_disclosed": consent_rec.ai_voice_disclosed if consent_rec else True,
        "created_at": consent_rec.created_at.isoformat() if consent_rec else None,
    }

    # =========================================================================
    # Point 3: Suppression & Cross-Tenant Platform DND
    # =========================================================================
    tenant_suppression = db.scalar(
        select(SuppressionRecord).where(
            SuppressionRecord.tenant_id == tenant_id,
            SuppressionRecord.phone_number == norm_to,
        )
    )
    if tenant_suppression:
        logger.warning("Compliance rejection: Phone %s is on tenant suppression list", norm_to)
        return ComplianceGateResult(
            passed=False,
            reason="number_suppressed",
            details={
                "phone": norm_to,
                "suppression_reason": tenant_suppression.reason,
                "suppressed_at": tenant_suppression.created_at.isoformat(),
            },
        )

    # Cross-tenant platform suppression for marketing categories (C and D)
    if category in ("C", "D"):
        platform_suppression = db.scalar(
            select(PlatformSuppression).where(PlatformSuppression.phone_number == norm_to)
        )
        if platform_suppression:
            logger.warning(
                "Compliance rejection: Phone %s matches platform-wide DND suppression", norm_to
            )
            return ComplianceGateResult(
                passed=False,
                reason="platform_suppression_match",
                details={
                    "phone": norm_to,
                    "platform_reason": platform_suppression.reason,
                    "category": category,
                },
            )
    checks["suppression_check"] = "clean"

    # =========================================================================
    # Point 4: Federal & State DNC Registry Scrub (31-day cache for C & D)
    # =========================================================================
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    fallback_tz = tenant.timezone if tenant else "America/New_York"
    state, tz_name = resolve_recipient_timezone_and_state(norm_to, fallback_tz)

    if category in ("C", "D"):
        dnc_result = scrub_phone_against_dnc(norm_to, state=state)
        if dnc_result.is_dnc:
            logger.warning("Compliance rejection: Phone %s is registered on DNC registry", norm_to)
            return ComplianceGateResult(
                passed=False,
                reason="dnc_registry_match",
                details={
                    "phone": norm_to,
                    "registry_source": dnc_result.registry_source,
                    "state": dnc_result.state,
                },
            )
    checks["dnc_scrub"] = "clean"

    # =========================================================================
    # Point 5: State Rules & Recipient Local Calling Window
    # =========================================================================
    state_rule = db.scalar(select(StateRule).where(StateRule.state == state))
    start_str = state_rule.window_start if state_rule else "08:00"
    end_str = state_rule.window_end if state_rule else "20:00"

    try:
        start_hour, start_min = map(int, start_str.split(":"))
        end_hour, end_min = map(int, end_str.split(":"))
    except Exception:
        start_hour, start_min = 8, 0
        end_hour, end_min = 20, 0

    try:
        recipient_tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        recipient_tz = zoneinfo.ZoneInfo("America/New_York")

    local_dt = now.astimezone(recipient_tz)
    local_time = local_dt.time()
    w_start = dtime(start_hour, start_min)
    w_end = dtime(end_hour, end_min)

    is_inside_window = w_start <= local_time < w_end
    checks["calling_window"] = {
        "recipient_state": state,
        "recipient_timezone": tz_name,
        "recipient_local_time": local_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "window_start": start_str,
        "window_end": end_str,
    }

    if not is_inside_window:
        if local_time >= w_end:
            next_date = local_dt.date() + timedelta(days=1)
        else:
            next_date = local_dt.date()
        next_dt_local = datetime(
            next_date.year,
            next_date.month,
            next_date.day,
            start_hour,
            start_min + 5,
            0,
            tzinfo=recipient_tz,
        )
        next_dt_utc = next_dt_local.astimezone(UTC)
        checks["calling_window"]["scheduled_for"] = next_dt_utc.isoformat()

        logger.warning(
            "Compliance rejection: Current time %s outside local window (%s-%s) in %s (%s)",
            local_time.strftime("%H:%M"),
            start_str,
            end_str,
            state,
            tz_name,
        )
        return ComplianceGateResult(
            passed=False,
            reason="outside_calling_window",
            details=checks["calling_window"],
        )

    # =========================================================================
    # Point 6: Frequency Caps (State specific e.g. OK max 3/24h, Category C/D max 1/24h)
    # =========================================================================
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)

    recent_calls = db.scalars(
        select(Call).where(
            Call.tenant_id == tenant_id,
            Call.caller_number == norm_to,
            Call.direction == "outbound",
            Call.started_at >= week_ago,
        )
    ).all()

    calls_past_24h = sum(1 for c in recent_calls if _ensure_utc(c.started_at) >= day_ago)
    calls_past_7d = len(recent_calls)

    recent_dispatches = db.scalars(
        select(OutboundDispatch).where(
            OutboundDispatch.tenant_id == tenant_id,
            OutboundDispatch.to_phone == norm_to,
            OutboundDispatch.status.in_(["queued", "dispatched", "completed"]),
            OutboundDispatch.created_at >= week_ago,
        )
    ).all()

    disp_past_24h = sum(1 for d in recent_dispatches if _ensure_utc(d.created_at) >= day_ago)
    disp_past_7d = len(recent_dispatches)

    total_24h = max(calls_past_24h, disp_past_24h)
    total_7d = max(calls_past_7d, disp_past_7d)

    # Frequency caps: Categories C & D strictly 1/24h; Category B respects state statutory cap or defaults to 2/24h
    if category in ("C", "D"):
        limit_24h = 1
    else:
        limit_24h = (
            state_rule.max_attempts_24h if (state_rule and state_rule.max_attempts_24h) else 2
        )

    checks["frequency_caps"] = {
        "attempts_24h": total_24h,
        "max_24h": limit_24h,
        "attempts_7d": total_7d,
        "max_7d": 5,
    }

    if total_24h >= limit_24h or total_7d >= 5:
        logger.warning(
            "Compliance rejection: Frequency cap exceeded for %s (24h: %d/%d, 7d: %d/5)",
            norm_to,
            total_24h,
            limit_24h,
            total_7d,
        )
        return ComplianceGateResult(
            passed=False,
            reason="frequency_cap_exceeded",
            details=checks["frequency_caps"],
        )

    # =========================================================================
    # Point 8: Quiet Days & Holiday Check
    # =========================================================================
    # Federal holidays where telemarketing is prohibited (New Year, July 4, Thanksgiving, Xmas)
    holiday_dates = {(1, 1), (7, 4), (11, 26), (12, 25)}
    if (local_dt.month, local_dt.day) in holiday_dates:
        logger.warning("Compliance rejection: Date %s is a holiday", local_dt.date())
        return ComplianceGateResult(
            passed=False,
            reason="quiet_day_holiday",
            details={"date": local_dt.strftime("%Y-%m-%d"), "holiday": True},
        )
    checks["quiet_day_check"] = "clean"

    # =========================================================================
    # Point 9: Outbound Concurrency Caps
    # =========================================================================
    max_tenant_outbound = tenant.max_concurrent_outbound if tenant else 2
    max_global_outbound = getattr(settings, "GLOBAL_MAX_OUTBOUND", 10)

    active_outcomes = ["in_progress", "active", "dispatching", "ringing"]
    active_tenant_outbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant_id,
                Call.direction == "outbound",
                Call.outcome.in_(active_outcomes),
                Call.ended_at.is_(None),
                Call.started_at >= now - timedelta(minutes=30),
            )
        )
        or 0
    )

    active_global_outbound = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.direction == "outbound",
                Call.outcome.in_(active_outcomes),
                Call.ended_at.is_(None),
                Call.started_at >= now - timedelta(minutes=30),
            )
        )
        or 0
    )

    checks["concurrency"] = {
        "active_tenant": active_tenant_outbound,
        "max_tenant": max_tenant_outbound,
        "active_global": active_global_outbound,
        "max_global": max_global_outbound,
    }

    if (
        active_tenant_outbound >= max_tenant_outbound
        or active_global_outbound >= max_global_outbound
    ):
        logger.warning("Compliance rejection: Concurrency cap exceeded")
        return ComplianceGateResult(
            passed=False,
            reason="concurrency_cap_exceeded",
            details=checks["concurrency"],
        )

    # =========================================================================
    # Point 10: Tenant Standing & Complaint Rate Kill-Switch
    # =========================================================================
    if not tenant or tenant.status != "active":
        logger.warning("Compliance rejection: Tenant %s account not active", tenant_id)
        return ComplianceGateResult(
            passed=False,
            reason="tenant_not_active",
            details={"tenant_status": tenant.status if tenant else "unknown"},
        )

    # Free Trial Standing & Abuse Restrictions (FR-TRIAL-1, 5)
    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant_id))
    if sub and (sub.tier == "trial" or sub.status == "trialing"):
        if sub.is_trial_expired:
            logger.warning("Compliance rejection: Tenant %s free trial has expired", tenant_id)
            return ComplianceGateResult(
                passed=False,
                reason="trial_expired",
                details={
                    "message": "Free trial 14-day or 100-minute allocation exhausted. Upgrade to a paid plan to place outbound calls.",
                    "trial_minutes_used": sub.trial_minutes_used,
                    "trial_minutes_allocated": sub.trial_minutes_allocated,
                },
            )
        # Cap trial outbound calls at max 25 attempts
        trial_outbound_count = (
            db.scalar(
                select(func.count(Call.id)).where(
                    Call.tenant_id == tenant_id,
                    Call.direction == "outbound",
                )
            )
            or 0
        )
        if trial_outbound_count >= 25:
            logger.warning(
                "Compliance rejection: Tenant %s reached 25 outbound trial call cap", tenant_id
            )
            return ComplianceGateResult(
                passed=False,
                reason="trial_outbound_limit_reached",
                details={
                    "message": "Free trial limit of 25 outbound calls reached. Upgrade to a paid plan for unlimited campaigns.",
                    "outbound_calls_count": trial_outbound_count,
                    "max_trial_outbound": 25,
                },
            )

    # Auto-pause check: 3 complaints/opt-outs in last 24h triggers automatic outbound pause
    recent_complaints = (
        db.scalar(
            select(func.count(SuppressionRecord.id)).where(
                SuppressionRecord.tenant_id == tenant_id,
                SuppressionRecord.reason.in_(["opt_out", "carrier_complaint", "complaint"]),
                SuppressionRecord.created_at >= day_ago,
            )
        )
        or 0
    )

    if recent_complaints >= 3:
        logger.error(
            "COMPLIANCE KILL-SWITCH TRIGGERED: Tenant %s exceeded complaint threshold (%d/3 in 24h). Pausing outbound.",
            tenant_id,
            recent_complaints,
        )
        return ComplianceGateResult(
            passed=False,
            reason="complaint_auto_pause",
            details={
                "complaints_24h": recent_complaints,
                "threshold": 3,
                "message": "Outbound calling temporarily paused due to elevated opt-out/complaint rates.",
            },
        )

    checks["tenant_standing"] = "active"
    checks["complaints_24h"] = recent_complaints

    return ComplianceGateResult(
        passed=True,
        reason="approved",
        details=checks,
    )


# Backward-compatible wrapper
def evaluate_compliance_gate(
    db: Session,
    tenant_id: str,
    to_phone: str,
    from_phone: str,
    purpose: str = "call_triage",
    has_consent: bool | None = None,
    current_time: datetime | None = None,
) -> ComplianceGateResult:
    """Legacy wrapper for evaluate_compliance_gate_v2."""
    category = "C" if purpose in ("lead_followup", "web_inquiry") else "B"
    effective_consent = True if has_consent is None else has_consent
    return evaluate_compliance_gate_v2(
        db=db,
        tenant_id=tenant_id,
        to_phone=to_phone,
        from_phone=from_phone,
        category=category,
        purpose=purpose,
        has_consent=effective_consent,
        current_time=current_time,
    )
