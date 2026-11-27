"""LiveKit multi-tenant agent synchronization service.

Ensures every onboarded tenant and profile update is immediately compiled
and synchronized into a functioning LiveKit Agent configuration.
"""

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.models.tenant import PhoneNumber, Tenant

logger = logging.getLogger("vedavoice.livekit_sync")


def sync_tenant_to_livekit(
    tenant_id: str,
    db: Session,
    target_dir: Path | str | None = None,
) -> dict[str, Any]:
    """Compile tenant profile into LiveKit Agent runtime JSON config."""
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise ValueError(f"Tenant {tenant_id} not found for LiveKit sync")

    profile = tenant.agent_profile
    active_phones = db.scalars(
        select(PhoneNumber).where(
            PhoneNumber.tenant_id == tenant.id,
            PhoneNumber.status == "active",
        )
    ).all()

    phone_numbers = [p.e164 for p in active_phones if p.e164]

    voice_id = getattr(profile, "voice_id", None) or "Alex"
    rec_disclosure = getattr(profile, "recording_disclosure", True)
    if rec_disclosure is None:
        rec_disclosure = True

    pricing_mode = getattr(profile, "pricing_mode", None)
    if not pricing_mode:
        pricing_mode = (
            "listed" if getattr(profile, "pricing_policy", "") == "fixed_menu" else "no_quote"
        )

    emergency_advice = (
        getattr(profile, "approved_safety_script", "")
        or getattr(profile, "emergency_advice", "")
        or "If safe to do so, please locate and shut off your main shutoff valve immediately."
    )

    config_payload: dict[str, Any] = {
        "tenant_id": tenant.id,
        "business": tenant.name,
        "numbers": phone_numbers,
        "timezone": tenant.timezone or "America/New_York",
        "hours": tenant.hours or "Mon-Fri 8am-6pm",
        "greeting": getattr(profile, "greeting", "") or f"Thanks for calling {tenant.name}.",
        "tone": getattr(profile, "tone", "direct") or "direct",
        "voice_id": voice_id,
        "recording_disclosure": rec_disclosure,
        "phonetic_glossary": getattr(profile, "phonetic_glossary", []) or [],
        "pricing_mode": pricing_mode,
        "price_items": getattr(profile, "price_items", []) or [],
        "services": getattr(profile, "services", []) or [],
        "service_area": getattr(profile, "service_area", "") or "",
        "service_cities": getattr(profile, "service_cities", []) or [],
        "after_hours_policy": getattr(profile, "after_hours_policy", "take_message_all")
        or "take_message_all",
        "out_of_area_policy": getattr(profile, "out_of_area_policy", "polite_decline")
        or "polite_decline",
        "faq": getattr(profile, "faq", []) or [],
        "emergency": {
            "keywords": getattr(profile, "emergency_keywords", []) or [],
            "approved_safety_script": emergency_advice,
            "mode": getattr(profile, "emergency_mode", "priority_message") or "priority_message",
        },
        "tools_enabled": ["take_message", "end_call", "booking"],
        "max_call_duration_seconds": 600,
        "business_notes": getattr(profile, "business_notes", "") or "",
        "agent_name": getattr(profile, "agent_name", "receptionist") or "receptionist",
        "transfer_number": getattr(profile, "transfer_number", "") or "",
        "bilingual_spanish_enabled": bool(getattr(profile, "bilingual_spanish_enabled", False)),
        "patience_cadence": getattr(profile, "patience_cadence", "balanced") or "balanced",
        "silence_timeout_ms": int(getattr(profile, "silence_timeout_ms", 500) or 500),
        "speech_barge_in": True
        if getattr(profile, "speech_barge_in", None) is None
        else bool(profile.speech_barge_in),
        "adaptive_empathy": True
        if getattr(profile, "adaptive_empathy", None) is None
        else bool(profile.adaptive_empathy),
        "background_ambience": getattr(profile, "background_ambience", "studio_clean")
        or "studio_clean",
        "barred_phrases": getattr(profile, "barred_phrases", []) or [],
        "intake_questions": getattr(profile, "intake_questions", []) or [],
        "office_override_mode": getattr(profile, "office_override_mode", "normal") or "normal",
        "office_override_announcement": getattr(profile, "office_override_announcement", "") or "",
        "vip_returning_caller_enabled": True
        if getattr(profile, "vip_returning_caller_enabled", None) is None
        else bool(profile.vip_returning_caller_enabled),
        "vip_returning_greeting": getattr(profile, "vip_returning_greeting", "") or "",
        "mid_call_sms_enabled": True
        if getattr(profile, "mid_call_sms_enabled", None) is None
        else bool(profile.mid_call_sms_enabled),
        "disconnect_recovery_sms_enabled": True
        if getattr(profile, "disconnect_recovery_sms_enabled", None) is None
        else bool(profile.disconnect_recovery_sms_enabled),
        "disconnect_recovery_sms_text": getattr(profile, "disconnect_recovery_sms_text", "") or "",
        "custom_instructions": getattr(profile, "custom_instructions", "") or "",
        "do_rules": getattr(profile, "do_rules", []) or [],
        "dont_rules": getattr(profile, "dont_rules", []) or [],
        "objection_handlers": getattr(profile, "objection_handlers", []) or [],
        "strict_grounding": bool(getattr(profile, "strict_grounding", False)),
        "unknown_fallback_script": getattr(profile, "unknown_fallback_script", "") or "",
        "escalation_rules": getattr(profile, "escalation_rules", []) or [],
    }

    # Resolve output directory (default to data/tenants)
    output_dir = Path(target_dir) if target_dir else Path("data/tenants")
    output_dir.mkdir(parents=True, exist_ok=True)
    out_file = output_dir / f"{tenant.id}.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(config_payload, f, indent=2, ensure_ascii=False)

    logger.info("Synchronized LiveKit Agent config for tenant '%s' to %s", tenant.name, out_file)

    return {
        "success": True,
        "tenant_id": tenant.id,
        "business": tenant.name,
        "file_path": str(out_file),
        "numbers_bound": phone_numbers,
        "voice_id": voice_id,
        "agent_name": config_payload["agent_name"],
        "trunk_id": settings.LIVEKIT_SIP_INBOUND_TRUNK_ID,
    }
