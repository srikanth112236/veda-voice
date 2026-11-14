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
        "tools_enabled": ["take_message", "end_call"],
        "max_call_duration_seconds": 600,
        "business_notes": getattr(profile, "business_notes", "") or "",
        "agent_name": getattr(profile, "agent_name", "receptionist") or "receptionist",
        "transfer_number": getattr(profile, "transfer_number", "") or "",
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
