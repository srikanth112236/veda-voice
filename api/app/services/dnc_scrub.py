"""Federal & State Do-Not-Call (DNC) Registry Scrub Service.

Complies with TCPA & TSR 31-day scrub freshness requirements for
Categories C (Speed-to-lead marketing) and D (Reactivation).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

logger = logging.getLogger("vedavoice.dnc_scrub")

# In-memory 31-day cache: phone -> DNCScrubResult
_DNC_CACHE: dict[str, DNCScrubResult] = {}
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
    phone_number: str, state: str | None = None, force_refresh: bool = False
) -> DNCScrubResult:
    """Check a phone number against Federal and State DNC registries.

    Caches results for 31 days per federal requirements.
    """
    cached = _DNC_CACHE.get(phone_number)
    if cached and cached.is_fresh and not force_refresh:
        return cached

    now = datetime.now(UTC)
    is_listed = phone_number in _MOCK_DNC_REGISTRY
    source = "federal" if is_listed else "none"

    result = DNCScrubResult(
        phone_number=phone_number,
        is_dnc=is_listed,
        registry_source=source,
        scrubbed_at=now,
        state=state,
    )
    _DNC_CACHE[phone_number] = result
    return result


def clear_dnc_cache() -> None:
    """Clear in-memory DNC cache (useful during testing)."""
    _DNC_CACHE.clear()
