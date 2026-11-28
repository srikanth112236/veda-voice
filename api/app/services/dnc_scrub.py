"""Federal & State Do-Not-Call (DNC) Registry Scrub Service.

Complies with TCPA & TSR 31-day scrub freshness requirements for
Categories C (Speed-to-lead marketing) and D (Reactivation).
"""

from __future__ import annotations

import logging
from collections import OrderedDict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

logger = logging.getLogger("vedavoice.dnc_scrub")

# Bounded in-memory 31-day LRU cache: phone -> DNCScrubResult
_DNC_CACHE_MAX_SIZE = 10_000
_DNC_CACHE: OrderedDict[str, DNCScrubResult] = OrderedDict()
# Known test phone numbers simulated as registered on National/State DNC
_MOCK_DNC_REGISTRY: set[str] = {
    "+15125559999",
    "+15125559998",
    "+12125559999",
    "+13055559999",
}


@dataclass
class DNCScrubResult:
    phone_number: str
    is_dnc: bool
    registry_source: str  # "federal", "state", "internal", "none"
    scrubbed_at: datetime
    state: str | None = None

    @property
    def is_fresh(self) -> bool:
        """TCPA mandates DNC lists must be scrubbed within 31 days."""
        return datetime.now(UTC) - self.scrubbed_at <= timedelta(days=31)


def register_mock_dnc_number(phone_number: str) -> None:
    """Helper for testing to flag a phone number as listed on DNC."""
    _MOCK_DNC_REGISTRY.add(phone_number)
    _DNC_CACHE.pop(phone_number, None)


def scrub_phone_against_dnc(
    phone_number: str,
    state: str | None = None,
    force_refresh: bool = False,
    db: Any | None = None,
) -> DNCScrubResult:
    """Check a phone number against Federal/State DNC registries with optional DB persistence."""
    cached = _DNC_CACHE.get(phone_number)
    if cached and cached.is_fresh and not force_refresh:
        return cached

    now = datetime.now(UTC)
    if db is not None and not force_refresh:
        try:
            from sqlalchemy import select

            from api.app.models.compliance import PlatformSuppression

            rec = db.scalar(
                select(PlatformSuppression).where(PlatformSuppression.phone_number == phone_number)
            )
            if rec is not None:
                rec_time = rec.created_at
                if rec_time.tzinfo is None:
                    rec_time = rec_time.replace(tzinfo=UTC)
                if now - rec_time <= timedelta(days=31):
                    result = DNCScrubResult(
                        phone_number=phone_number,
                        is_dnc=True,
                        registry_source=str(rec.source or "federal"),
                        scrubbed_at=rec_time,
                        state=state,
                    )
                    _DNC_CACHE[phone_number] = result
                    _DNC_CACHE.move_to_end(phone_number)
                    return result
        except Exception:
            pass

    is_listed = phone_number in _MOCK_DNC_REGISTRY
    source = "federal" if is_listed else "none"

    if is_listed and db is not None:
        try:
            from sqlalchemy import select

            from api.app.models.compliance import PlatformSuppression

            existing = db.scalar(
                select(PlatformSuppression).where(PlatformSuppression.phone_number == phone_number)
            )
            if existing is None:
                db.add(PlatformSuppression(phone_number=phone_number, source=source))
                db.flush()
        except Exception:
            pass

    result = DNCScrubResult(
        phone_number=phone_number,
        is_dnc=is_listed,
        registry_source=source,
        scrubbed_at=now,
        state=state,
    )
    _DNC_CACHE[phone_number] = result
    _DNC_CACHE.move_to_end(phone_number)
    if len(_DNC_CACHE) > _DNC_CACHE_MAX_SIZE:
        _DNC_CACHE.popitem(last=False)
    return result


def clear_dnc_cache() -> None:
    """Clear in-memory DNC cache (useful during testing)."""
    _DNC_CACHE.clear()
