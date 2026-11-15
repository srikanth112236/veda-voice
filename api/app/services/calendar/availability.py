"""Server-side slot availability and scheduling engine (Milestone M3).

Computes conflict-free appointment slots based on tenant business hours,
existing bookings, 5-minute hold locks, and Google Calendar free/busy intervals.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.encryption import decrypt_token
from api.app.models.booking import Booking, TenantIntegration
from api.app.models.tenant import Tenant
from api.app.services.calendar.base import CalendarProvider, Interval
from api.app.services.calendar.google import GoogleCalendarProvider

logger = logging.getLogger("vedavoice.calendar.availability")


class Slot(BaseModel):
    """Represent an individual bookable time slot."""

    start_iso: str
    end_iso: str
    display_time: str
    is_available: bool


class AvailableSlotsResponse(BaseModel):
    """Structured response containing open appointment slots."""

    tenant_id: str
    target_date: str
    timezone: str
    slots: list[Slot]
    available_count: int


def _get_tenant_calendar_provider(
    tenant_id: str, db: Session
) -> tuple[CalendarProvider | None, str]:
    """Retrieve connected calendar provider for tenant or None."""
    integration = db.scalar(
        select(TenantIntegration).where(
            TenantIntegration.tenant_id == tenant_id,
            TenantIntegration.status == "connected",
        )
    )
    if not integration or not integration.encrypted_tokens:
        return None, "primary"

    try:
        tokens_json = decrypt_token(integration.encrypted_tokens)
        token_data = {}
        if tokens_json:
            import json

            token_data = json.loads(tokens_json)

        refresh_token = token_data.get("refresh_token", "")
        access_token = token_data.get("access_token")

        if refresh_token:
            provider = GoogleCalendarProvider(
                refresh_token=refresh_token,
                access_token=access_token,
                token_expiry=integration.token_expires_at,
            )
            return provider, integration.calendar_id
    except Exception as e:
        logger.warning("Could not instantiate calendar provider for tenant %s: %s", tenant_id, e)

    return None, "primary"


def compute_available_slots(
    tenant: Tenant,
    target_date: date,
    db: Session,
    service_duration_minutes: int = 60,
    buffer_minutes: int = 15,
    minimum_notice_hours: int = 2,
    custom_provider: CalendarProvider | None = None,
) -> AvailableSlotsResponse:
    """Compute conflict-free available slots for a given tenant on target_date."""
    # 1. Resolve Timezone
    try:
        tz = ZoneInfo(tenant.timezone)
    except Exception:
        tz = ZoneInfo("America/New_York")

    now_tz = datetime.now(tz)
    earliest_allowed = now_tz + timedelta(hours=minimum_notice_hours)

    # 2. Operating Hours (Defaults: 8:00 AM to 6:00 PM Mon-Fri, 9:00 AM to 2:00 PM Sat)
    weekday = target_date.weekday()  # 0=Mon, 6=Sun
    if weekday == 6:  # Sunday closed
        work_start = time(0, 0)
        work_end = time(0, 0)
    elif weekday == 5:  # Saturday 9am - 2pm
        work_start = time(9, 0)
        work_end = time(14, 0)
    else:  # Mon - Fri 8am - 6pm
        work_start = time(8, 0)
        work_end = time(18, 0)

    if work_start == work_end:
        return AvailableSlotsResponse(
            tenant_id=tenant.id,
            target_date=target_date.isoformat(),
            timezone=tenant.timezone,
            slots=[],
            available_count=0,
        )

    # 3. Clean up expired holds in database for this tenant
    now_utc = datetime.now(UTC)
    db.query(Booking).filter(
        Booking.tenant_id == tenant.id,
        Booking.status == "held",
        Booking.hold_expires_at < now_utc,
    ).update({"status": "cancelled"})
    db.commit()

    # 4. Fetch existing database bookings on target date
    day_start_tz = datetime.combine(target_date, time(0, 0), tzinfo=tz)
    day_end_tz = datetime.combine(target_date, time(23, 59, 59), tzinfo=tz)

    existing_bookings = db.scalars(
        select(Booking).where(
            Booking.tenant_id == tenant.id,
            Booking.status.in_(["confirmed", "held"]),
            Booking.start_at >= day_start_tz,
            Booking.start_at <= day_end_tz,
        )
    ).all()

    db_busy_intervals = [Interval(start=b.start_at, end=b.end_at) for b in existing_bookings]

    # 5. Fetch external calendar busy blocks (Google Calendar FreeBusy)
    cal_provider = custom_provider
    calendar_id = "primary"
    if cal_provider is None:
        cal_provider, calendar_id = _get_tenant_calendar_provider(tenant.id, db)

    ext_busy_intervals: list[Interval] = []
    if cal_provider:
        try:
            ext_busy_intervals = cal_provider.free_busy(calendar_id, day_start_tz, day_end_tz)
        except Exception as e:
            logger.warning("Failed to fetch external free_busy for tenant %s: %s", tenant.id, e)

    all_busy = db_busy_intervals + ext_busy_intervals

    # 6. Generate Candidate Slots
    current_dt = datetime.combine(target_date, work_start, tzinfo=tz)
    end_working_dt = datetime.combine(target_date, work_end, tzinfo=tz)
    step_delta = timedelta(minutes=service_duration_minutes)

    slot_list: list[Slot] = []

    while current_dt + step_delta <= end_working_dt:
        slot_start = current_dt
        slot_end = current_dt + step_delta

        # Check if slot is in the past or within minimum notice
        is_available = True
        if slot_start < earliest_allowed:
            is_available = False

        # Check collision with busy intervals
        if is_available:
            for busy in all_busy:
                # Normalize timezones for comparison
                b_s = (
                    busy.start.astimezone(tz)
                    if busy.start.tzinfo
                    else busy.start.replace(tzinfo=tz)
                )
                b_e = busy.end.astimezone(tz) if busy.end.tzinfo else busy.end.replace(tzinfo=tz)
                if not (slot_end <= b_s or slot_start >= b_e):
                    is_available = False
                    break

        display_fmt = slot_start.strftime("%I:%M %p").lstrip("0")
        slot_list.append(
            Slot(
                start_iso=slot_start.isoformat(),
                end_iso=slot_end.isoformat(),
                display_time=display_fmt,
                is_available=is_available,
            )
        )

        # Advance to next slot with buffer
        current_dt += step_delta + timedelta(minutes=buffer_minutes)

    avail_count = sum(1 for s in slot_list if s.is_available)

    return AvailableSlotsResponse(
        tenant_id=tenant.id,
        target_date=target_date.isoformat(),
        timezone=tenant.timezone,
        slots=slot_list,
        available_count=avail_count,
    )
