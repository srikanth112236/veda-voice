"""Core service logic for Multi-Location Tenant Architecture (Milestone M11, FR-LOC-1 to 6)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.models.booking import Booking
from api.app.models.call import Call
from api.app.models.location import Location
from api.app.models.staff import StaffMember
from api.app.models.tenant import PhoneNumber
from api.app.models.user import User

logger = logging.getLogger("vedavoice.locations")


def matches_location_territory(postal_code: str | None, territory_zips: list[str]) -> bool:
    """Evaluate whether a postal/zip code matches location territory patterns.

    Supports:
      - Exact match: "78701" == "78701"
      - Wildcard match: "787*" matches any 5-digit zip beginning with "787"
      - Prefix match: "787" matches "78701"
      - Empty list: Serves all postal codes (universal service territory)
    """
    if not postal_code:
        return False
    clean_zip = postal_code.strip()
    if not territory_zips:
        return True

    for pattern in territory_zips:
        clean_pat = str(pattern).strip()
        if clean_pat == clean_zip:
            return True
        if clean_pat.endswith("*") and clean_zip.startswith(clean_pat[:-1]):
            return True
        if len(clean_pat) in (3, 4) and clean_zip.startswith(clean_pat):
            return True
    return False


def resolve_location_for_caller(
    tenant_id: str,
    db: Session,
    dialed_number: str | None = None,
    postal_code: str | None = None,
    spoken_city: str | None = None,
) -> Location | None:
    """Resolve the most accurate physical location or branch for an incoming caller.

    Resolution Priority:
      1. Direct Phone Number Assignment: If dialed number belongs to a specific location.
      2. Territory Postal Code: Matching `postal_code` against `service_territory_zips`.
      3. City Name Match: Case-insensitive match on location city.
      4. Primary Location: The tenant's designated primary/HQ location.
      5. First active location in tenant roster.
    """
    locations = db.scalars(
        select(Location).where(Location.tenant_id == tenant_id, Location.is_active == True)  # noqa: E712
    ).all()

    if not locations:
        return None

    # 1. Match dialed phone number directly
    if dialed_number:
        clean_dialed = dialed_number.strip()
        phone_match = db.scalar(
            select(PhoneNumber).where(
                PhoneNumber.tenant_id == tenant_id,
                PhoneNumber.e164 == clean_dialed,
                PhoneNumber.location_id != None,  # noqa: E711
            )
        )
        if phone_match and phone_match.location_id:
            loc = db.scalar(
                select(Location).where(
                    Location.id == phone_match.location_id,
                    Location.is_active == True,  # noqa: E712
                )
            )
            if loc:
                return loc

    # 2. Match caller postal code against location territory
    if postal_code:
        for loc in locations:
            if matches_location_territory(postal_code, loc.service_territory_zips):
                return loc

    # 3. Match spoken city
    if spoken_city:
        clean_city = spoken_city.strip().lower()
        for loc in locations:
            if loc.city and loc.city.strip().lower() == clean_city:
                return loc

    # 4. Fallback to Primary Location
    for loc in locations:
        if loc.is_primary:
            return loc

    # 5. Default fallback to first active location
    return locations[0]


def get_location_metrics(location_id: str, db: Session) -> dict[str, Any]:
    """Calculate operational KPIs and resource counts for a single location."""
    staff_count = (
        db.scalar(
            select(func.count(StaffMember.id)).where(
                StaffMember.location_id == location_id,
                StaffMember.is_active == True,  # noqa: E712
            )
        )
        or 0
    )
    phone_count = (
        db.scalar(select(func.count(PhoneNumber.id)).where(PhoneNumber.location_id == location_id))
        or 0
    )
    total_calls = db.scalar(select(func.count(Call.id)).where(Call.location_id == location_id)) or 0
    total_bookings = (
        db.scalar(
            select(func.count(Booking.id)).where(
                Booking.location_id == location_id, Booking.status == "confirmed"
            )
        )
        or 0
    )

    return {
        "staff_count": staff_count,
        "phone_count": phone_count,
        "total_calls": total_calls,
        "total_bookings": total_bookings,
    }


def user_has_location_access(user: User, location_id: str | None) -> bool:
    """Verify whether a user has authorization to access records for a specific location.

    Owners and platform admins have universal access.
    Tenant staff/managers are filtered by user.location_ids (empty = universal access).
    """
    if user.role in ("platform_admin", "tenant_owner"):
        return True
    if not user.location_ids:
        return True
    if not location_id:
        return True
    return location_id in user.location_ids
