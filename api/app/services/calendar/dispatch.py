"""Multi-staff dispatch, skill matching, territory routing, and round-robin scheduler (Milestone M10b)."""

from __future__ import annotations

import fnmatch
import logging
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.models.booking import Booking
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import (
    AvailableSlotsResponse,
    Slot,
    _get_tenant_calendar_provider,
)
from api.app.services.calendar.base import CalendarProvider, Interval

logger = logging.getLogger("vedavoice.calendar.dispatch")


def matches_territory(postal_code: str, territories: list[str]) -> bool:
    """Check if customer postal/zip code matches technician's assigned territory patterns."""
    if not territories:
        return True  # Empty territories means covers entire tenant region

    clean_zip = postal_code.strip()
    for pattern in territories:
        pattern = pattern.strip()
        if pattern == clean_zip:
            return True
        # Wildcard matching e.g. 787* or prefix matching
        if "*" in pattern and fnmatch.fnmatch(clean_zip, pattern):
            return True
        if pattern.endswith("*") and clean_zip.startswith(pattern[:-1]):
            return True
        if len(pattern) == 3 and clean_zip.startswith(pattern):
            return True
    return False


def filter_eligible_staff(
    tenant_id: str,
    service_type: str | None,
    postal_code: str | None,
    db: Session,
) -> list[StaffMember]:
    """Filter active staff members by service skill capability and territory postal code."""
    staff_members = db.scalars(
        select(StaffMember)
        .where(
            StaffMember.tenant_id == tenant_id,
            StaffMember.is_active == True,  # noqa: E712
        )
        .order_by(StaffMember.priority_weight.desc(), StaffMember.name)
    ).all()

    if not staff_members:
        return []

    # 1. Filter by Skill
    eligible: list[StaffMember] = []
    normalized_service = (service_type or "").lower().replace("-", "_").strip()

    for s in staff_members:
        if not normalized_service or not s.skills:
            # General tech with no explicit restrictions
            eligible.append(s)
            continue

        normalized_skills = [skill.lower().replace("-", "_").strip() for skill in s.skills]
        # Direct match or partial keyword match
        if any(
            normalized_service == sk or normalized_service in sk or sk in normalized_service
            for sk in normalized_skills
        ):
            eligible.append(s)

    # If skill filter was too strict and eliminated everyone, fallback to all active staff
    if not eligible and staff_members:
        eligible = list(staff_members)

    # 2. Filter by Territory Postal Code
    if postal_code and postal_code.strip():
        territory_matched = [
            s for s in eligible if matches_territory(postal_code, s.service_territory_zips)
        ]
        if territory_matched:
            return territory_matched

    return eligible


def assign_technician_round_robin(
    eligible_staff: list[StaffMember],
    slot_start: datetime,
    db: Session,
    strategy: str = "round_robin",
) -> StaffMember | None:
    """Select the best qualified technician for slot_start using fair round-robin or least-busy."""
    if not eligible_staff:
        return None

    tenant_id = eligible_staff[0].tenant_id
    staff_ids = [s.id for s in eligible_staff]

    # Find staff busy at this exact time slot
    busy_staff_ids = set(
        db.scalars(
            select(Booking.staff_id).where(
                Booking.tenant_id == tenant_id,
                Booking.staff_id.in_(staff_ids),
                Booking.start_at == slot_start,
                Booking.status.in_(["confirmed", "held"]),
            )
        ).all()
    )

    available_staff = [s for s in eligible_staff if s.id not in busy_staff_ids]
    if not available_staff:
        return None

    if strategy == "least_busy_today":
        # Count bookings for each technician on this day
        day_start = datetime(slot_start.year, slot_start.month, slot_start.day, 0, 0, tzinfo=UTC)
        day_end = day_start + timedelta(days=1)

        counts_query = (
            select(Booking.staff_id, func.count(Booking.id))
            .where(
                Booking.tenant_id == tenant_id,
                Booking.staff_id.in_([s.id for s in available_staff]),
                Booking.start_at >= day_start,
                Booking.start_at < day_end,
                Booking.status.in_(["confirmed", "held"]),
            )
            .group_by(Booking.staff_id)
        )
        counts_dict: dict[str, int] = {
            row[0]: row[1] for row in db.execute(counts_query).all() if row[0] is not None
        }

        # Sort by lowest active jobs today, tiebreak by last_assigned_at
        available_staff.sort(
            key=lambda s: (
                counts_dict.get(s.id, 0),
                s.last_assigned_at or datetime.min.replace(tzinfo=UTC),
            )
        )
        chosen = available_staff[0]
    else:
        # Standard Round-Robin:
        # 1. Staff who have never been assigned (last_assigned_at is None) come first.
        # 2. Then staff with oldest last_assigned_at (least recently assigned).
        # 3. Higher priority_weight acts as tiebreaker or multiplier.
        min_dt = datetime.min.replace(tzinfo=UTC)
        available_staff.sort(
            key=lambda s: (
                0 if s.last_assigned_at is None else 1,
                s.last_assigned_at or min_dt,
                -s.priority_weight,
            )
        )
        chosen = available_staff[0]

    # Update technician last_assigned_at timestamp atomically
    chosen.last_assigned_at = datetime.now(UTC)
    db.commit()
    db.refresh(chosen)
    return chosen


def compute_multi_staff_available_slots(
    tenant: Tenant,
    target_date: date,
    db: Session,
    service_type: str | None = None,
    postal_code: str | None = None,
    service_duration_minutes: int = 60,
    buffer_minutes: int = 15,
    minimum_notice_hours: int = 2,
    custom_provider: CalendarProvider | None = None,
    scheduling_mode: str = "exact_time",
    arrival_window_hours: int = 2,
) -> AvailableSlotsResponse:
    """Compute aggregate slot availability across all eligible staff for target_date with Google Calendar FreeBusy and Buffer Protection."""
    # 1. Resolve Timezone
    try:
        tz = ZoneInfo(tenant.timezone)
    except Exception:
        tz = ZoneInfo("America/New_York")

    now_tz = datetime.now(tz)
    earliest_allowed = now_tz + timedelta(hours=minimum_notice_hours)

    eligible_staff = filter_eligible_staff(tenant.id, service_type, postal_code, db)

    # 2. Operating hours: use tenant default 08:00 - 18:00 if not specified
    open_time = time(8, 0)
    close_time = time(18, 0)

    day_open_dt = datetime.combine(target_date, open_time, tzinfo=tz)
    day_close_dt = datetime.combine(target_date, close_time, tzinfo=tz)

    # 3. Query existing bookings for this tenant on target_date
    existing_bookings = db.scalars(
        select(Booking).where(
            Booking.tenant_id == tenant.id,
            Booking.status.in_(["confirmed", "held"]),
            Booking.start_at >= day_open_dt.astimezone(UTC) - timedelta(hours=3),
            Booking.start_at <= day_close_dt.astimezone(UTC) + timedelta(hours=3),
        )
    ).all()

    # Buffer configuration
    buf_delta = timedelta(minutes=buffer_minutes)
    profile = getattr(tenant, "agent_profile", None)
    buf_mode = getattr(profile, "calendar_buffer_mode", "after") if profile else "after"
    buf_before = buf_delta if buf_mode == "both" else timedelta(0)
    buf_after = buf_delta

    # Helper: Check which staff IDs are busy during interval [start_dt, end_dt] including buffers
    def get_busy_staff_for_interval(start_dt: datetime, end_dt: datetime) -> set[str]:
        busy: set[str] = set()
        s_utc = start_dt.astimezone(UTC) if start_dt.tzinfo else start_dt.replace(tzinfo=UTC)
        e_utc = end_dt.astimezone(UTC) if end_dt.tzinfo else end_dt.replace(tzinfo=UTC)
        for b in existing_bookings:
            b_s = b.start_at if b.start_at.tzinfo else b.start_at.replace(tzinfo=UTC)
            b_e = b.end_at if b.end_at.tzinfo else b.end_at.replace(tzinfo=UTC)
            # Check overlap with buffer envelope [b_s - buf_before, b_e + buf_after]
            if not (e_utc <= (b_s - buf_before) or s_utc >= (b_e + buf_after)):
                if b.staff_id:
                    busy.add(b.staff_id)
                else:
                    busy.add("unassigned")
        return busy

    # 3b. Query External Google Calendar Free/Busy Blocks (Two-Way Sync)
    cal_provider = custom_provider
    calendar_id = "primary"
    if cal_provider is None:
        cal_provider, calendar_id = _get_tenant_calendar_provider(tenant.id, db)

    ext_busy_intervals: list[Interval] = []
    if cal_provider:
        try:
            ext_busy_intervals = cal_provider.free_busy(calendar_id, day_open_dt, day_close_dt)
        except Exception as e:
            logger.warning("Failed to fetch external Google Calendar free_busy in dispatch: %s", e)

    candidate_slots: list[Slot] = []

    if scheduling_mode == "arrival_window":
        # 4a. Arrival Windows Generation (2-Hr or 4-Hr)
        win_delta = timedelta(hours=arrival_window_hours)
        current_win_start = day_open_dt
        service_delta = timedelta(minutes=service_duration_minutes)

        while current_win_start + win_delta <= day_close_dt:
            win_end = current_win_start + win_delta
            is_available = True
            if current_win_start < earliest_allowed:
                is_available = False

            if is_available:
                # Find if any eligible staff member is free for service duration inside this window
                window_has_free_staff = False
                sub_slot_start = current_win_start
                sub_step = timedelta(minutes=30)

                while sub_slot_start + service_delta <= win_end:
                    sub_slot_end = sub_slot_start + service_delta
                    busy_staff = get_busy_staff_for_interval(sub_slot_start, sub_slot_end)

                    # External calendar collision check
                    ext_collision = False
                    if ext_busy_intervals:
                        s_utc = sub_slot_start.astimezone(UTC)
                        e_utc = sub_slot_end.astimezone(UTC)
                        for ext in ext_busy_intervals:
                            e_start = (
                                ext.start.astimezone(UTC)
                                if ext.start.tzinfo
                                else ext.start.replace(tzinfo=UTC)
                            )
                            e_end = (
                                ext.end.astimezone(UTC)
                                if ext.end.tzinfo
                                else ext.end.replace(tzinfo=UTC)
                            )
                            if s_utc < (e_end + buf_after) and e_utc > (e_start - buf_before):
                                ext_collision = True
                                break

                    if not ext_collision:
                        if eligible_staff:
                            eligible_ids = {s.id for s in eligible_staff}
                            free_staff_count = len(eligible_ids - busy_staff)
                            if free_staff_count > 0 and "unassigned" not in busy_staff:
                                window_has_free_staff = True
                                break
                        else:
                            if not busy_staff:
                                window_has_free_staff = True
                                break

                    sub_slot_start += sub_step

                if not window_has_free_staff:
                    is_available = False

            w_s_fmt = current_win_start.strftime("%I:%M %p").lstrip("0")
            w_e_fmt = win_end.strftime("%I:%M %p").lstrip("0")
            display_fmt = f"{w_s_fmt} – {w_e_fmt} ({arrival_window_hours}-Hr Arrival Window)"

            candidate_slots.append(
                Slot(
                    start_iso=current_win_start.isoformat(),
                    end_iso=win_end.isoformat(),
                    display_time=display_fmt,
                    is_available=is_available,
                    is_arrival_window=True,
                    window_start_iso=current_win_start.isoformat(),
                    window_end_iso=win_end.isoformat(),
                    buffer_minutes=buffer_minutes,
                )
            )
            current_win_start += win_delta

    else:
        # 4b. Exact Time Slots with Buffer Protection
        step = timedelta(minutes=service_duration_minutes + buffer_minutes)
        current_slot_start = day_open_dt

        while current_slot_start + timedelta(minutes=service_duration_minutes) <= day_close_dt:
            slot_end = current_slot_start + timedelta(minutes=service_duration_minutes)
            is_available = True
            if current_slot_start < earliest_allowed:
                is_available = False
            else:
                busy_staff = get_busy_staff_for_interval(current_slot_start, slot_end)
                if eligible_staff:
                    eligible_ids = {s.id for s in eligible_staff}
                    free_staff_count = len(eligible_ids - busy_staff)
                    if free_staff_count <= 0 or "unassigned" in busy_staff:
                        is_available = False
                else:
                    if busy_staff:
                        is_available = False

                # External Google Calendar Collision Check with Buffer
                if is_available and ext_busy_intervals:
                    slot_start_utc = current_slot_start.astimezone(UTC)
                    slot_end_utc = slot_end.astimezone(UTC)
                    for ext in ext_busy_intervals:
                        e_start = (
                            ext.start.astimezone(UTC)
                            if ext.start.tzinfo
                            else ext.start.replace(tzinfo=UTC)
                        )
                        e_end = (
                            ext.end.astimezone(UTC)
                            if ext.end.tzinfo
                            else ext.end.replace(tzinfo=UTC)
                        )
                        if slot_start_utc < (e_end + buf_after) and slot_end_utc > (
                            e_start - buf_before
                        ):
                            is_available = False
                            break

            candidate_slots.append(
                Slot(
                    start_iso=current_slot_start.isoformat(),
                    end_iso=slot_end.isoformat(),
                    display_time=current_slot_start.strftime("%I:%M %p").lstrip("0"),
                    is_available=is_available,
                    is_arrival_window=False,
                    buffer_minutes=buffer_minutes,
                )
            )
            current_slot_start += step

    available_count = sum(1 for s in candidate_slots if s.is_available)

    return AvailableSlotsResponse(
        tenant_id=tenant.id,
        target_date=target_date.isoformat(),
        timezone=tenant.timezone,
        slots=candidate_slots,
        available_count=available_count,
    )
