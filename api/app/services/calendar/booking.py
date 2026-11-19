"""Booking service with atomic slot holds, double-booking prevention, and Google Meet integration."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.app.models.booking import Booking
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import _get_tenant_calendar_provider
from api.app.services.calendar.base import CalendarProvider, ExternalEvent
from api.app.services.calendar.dispatch import (
    assign_technician_round_robin,
    filter_eligible_staff,
)

logger = logging.getLogger("vedavoice.calendar.booking")


class SlotUnavailableError(Exception):
    """Raised when a requested slot is occupied or conflicts with an existing booking."""

    pass


def hold_time_slot(
    tenant_id: str,
    slot_start: datetime,
    duration_minutes: int,
    call_id: str,
    db: Session,
    customer_name: str = "Prospective Customer",
    customer_phone: str = "",
    service_type: str = "general_appointment",
    postal_code: str | None = None,
    staff_id: str | None = None,
) -> Booking:
    """Acquire a temporary 5-minute hold lock on a slot during a live call."""
    slot_end = slot_start + timedelta(minutes=duration_minutes)
    now_utc = datetime.now(UTC)

    # Clean up expired holds first
    db.query(Booking).filter(
        Booking.tenant_id == tenant_id,
        Booking.status == "held",
        Booking.hold_expires_at < now_utc,
    ).update({"status": "cancelled"})
    db.commit()

    # Resolve technician if staff members exist
    assigned_staff_id = staff_id
    if not assigned_staff_id:
        eligible = filter_eligible_staff(tenant_id, service_type, postal_code, db)
        if eligible:
            tech = assign_technician_round_robin(eligible, slot_start, db)
            if tech:
                assigned_staff_id = tech.id

    # Check for existing active booking
    conflict_query = select(Booking).where(
        Booking.tenant_id == tenant_id,
        Booking.start_at == slot_start,
        Booking.status.in_(["confirmed", "held"]),
    )
    if assigned_staff_id:
        conflict_query = conflict_query.where(Booking.staff_id == assigned_staff_id)

    existing = db.scalar(conflict_query)

    if existing:
        if existing.status == "held" and existing.call_id == call_id:
            # Refresh hold for same call
            existing.hold_expires_at = now_utc + timedelta(minutes=5)
            db.commit()
            return existing
        raise SlotUnavailableError(
            f"Slot starting at {slot_start.isoformat()} is no longer available."
        )

    from api.app.services.locations import resolve_location_for_caller

    resolved_loc = resolve_location_for_caller(tenant_id, db=db, postal_code=postal_code)
    loc_id = resolved_loc.id if resolved_loc else None

    hold_booking = Booking(
        tenant_id=tenant_id,
        call_id=call_id,
        location_id=loc_id,
        staff_id=assigned_staff_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        postal_code=postal_code,
        service_type=service_type,
        start_at=slot_start,
        end_at=slot_end,
        status="held",
        hold_expires_at=now_utc + timedelta(minutes=5),
    )

    try:
        db.add(hold_booking)
        db.commit()
        db.refresh(hold_booking)
        return hold_booking
    except IntegrityError as err:
        db.rollback()
        raise SlotUnavailableError(
            f"Slot {slot_start.isoformat()} was just locked by another caller."
        ) from err


def confirm_booking(
    tenant_id: str,
    slot_start: datetime,
    duration_minutes: int,
    customer_name: str,
    customer_phone: str,
    db: Session,
    customer_email: str | None = None,
    service_type: str = "general_appointment",
    call_id: str | None = None,
    idempotency_key: str | None = None,
    notes: str | None = None,
    custom_provider: CalendarProvider | None = None,
    postal_code: str | None = None,
    staff_id: str | None = None,
) -> Booking:
    """Confirm appointment booking, prevent double booking, and insert external calendar event."""
    slot_end = slot_start + timedelta(minutes=duration_minutes)
    now_utc = datetime.now(UTC)

    # 1. Idempotency check: if key already used, return existing booking
    if idempotency_key:
        existing_key = db.scalar(select(Booking).where(Booking.idempotency_key == idempotency_key))
        if existing_key:
            logger.info("Idempotent booking hit for key '%s'", idempotency_key)
            return existing_key

    # 2. Check if this call held this slot
    held_booking = None
    if call_id:
        held_booking = db.scalar(
            select(Booking).where(
                Booking.tenant_id == tenant_id,
                Booking.call_id == call_id,
                Booking.start_at == slot_start,
                Booking.status == "held",
            )
        )

    # Resolve staff assignment
    assigned_staff_id = staff_id or (held_booking.staff_id if held_booking else None)
    if not assigned_staff_id:
        eligible = filter_eligible_staff(tenant_id, service_type, postal_code, db)
        if eligible:
            tech = assign_technician_round_robin(eligible, slot_start, db)
            if tech:
                assigned_staff_id = tech.id

    # 3. Check for conflicting active bookings (unless it is our held slot)
    conflict_query = select(Booking).where(
        Booking.tenant_id == tenant_id,
        Booking.start_at == slot_start,
        Booking.status == "confirmed",
    )
    if assigned_staff_id:
        conflict_query = conflict_query.where(Booking.staff_id == assigned_staff_id)
    if held_booking:
        conflict_query = conflict_query.where(Booking.id != held_booking.id)

    conflict = db.scalar(conflict_query)
    if conflict:
        raise SlotUnavailableError(f"Slot {slot_start.isoformat()} is already booked.")

    # Fetch technician name if assigned
    tech_name = None
    if assigned_staff_id:
        staff_rec = db.scalar(select(StaffMember).where(StaffMember.id == assigned_staff_id))
        if staff_rec:
            tech_name = staff_rec.name

    # 4. Create External Calendar Event (Google Calendar with Meet link)
    cal_provider = custom_provider
    calendar_id = "primary"
    if cal_provider is None:
        cal_provider, calendar_id = _get_tenant_calendar_provider(tenant_id, db)

    calendar_event_id: str | None = None
    meet_link: str | None = None

    if cal_provider:
        tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
        biz_name = tenant.name if tenant else "Service Appointment"
        title_suffix = f" (Tech: {tech_name})" if tech_name else ""
        event_title = f"{service_type.replace('_', ' ').title()} - {customer_name}{title_suffix}"
        event_desc = (
            f"Customer: {customer_name}\n"
            f"Phone: {customer_phone}\n"
            f"Service: {service_type}\n"
            f"Postal Code: {postal_code or 'N/A'}\n"
            f"Assigned Technician: {tech_name or 'Unassigned'}\n"
            f"Business: {biz_name}\n"
            f"Notes: {notes or 'Booked via VedaVoice AI Voice Agent'}"
        )
        attendees = [customer_email] if customer_email else []

        try:
            created_event = cal_provider.create_event(
                calendar_id,
                ExternalEvent(
                    title=event_title,
                    start=slot_start,
                    end=slot_end,
                    description=event_desc,
                    attendee_emails=attendees,
                ),
            )
            calendar_event_id = created_event.id
            meet_link = created_event.meet_link
        except Exception as e:
            logger.error("Failed to insert event into Google Calendar: %s", e)
            # We still record booking in DB even if external sync encounters network error

    # 5. Persist confirmed booking in DB
    from api.app.services.locations import resolve_location_for_caller

    resolved_loc = resolve_location_for_caller(tenant_id, db=db, postal_code=postal_code)
    loc_id = resolved_loc.id if resolved_loc else None

    if held_booking:
        held_booking.status = "confirmed"
        if loc_id and not held_booking.location_id:
            held_booking.location_id = loc_id
        held_booking.staff_id = assigned_staff_id
        held_booking.customer_name = customer_name
        held_booking.customer_phone = customer_phone
        held_booking.customer_email = customer_email
        held_booking.postal_code = postal_code or held_booking.postal_code
        held_booking.service_type = service_type
        held_booking.calendar_event_id = calendar_event_id
        held_booking.meet_link = meet_link
        held_booking.idempotency_key = idempotency_key
        held_booking.notes = notes
        held_booking.hold_expires_at = None
        held_booking.updated_at = now_utc
        db.commit()
        db.refresh(held_booking)

        # Trigger Phase 5 automated customer & technician notifications
        try:
            import threading

            from api.app.services.notifier import dispatch_booking_notifications

            threading.Thread(
                target=dispatch_booking_notifications,
                args=(held_booking.id, tenant_id),
                daemon=True,
            ).start()
        except Exception as notif_err:
            logger.warning("Could not launch booking notification thread: %s", notif_err)

        return held_booking

    new_booking = Booking(
        tenant_id=tenant_id,
        call_id=call_id,
        location_id=loc_id,
        staff_id=assigned_staff_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        postal_code=postal_code,
        service_type=service_type,
        start_at=slot_start,
        end_at=slot_end,
        status="confirmed",
        calendar_event_id=calendar_event_id,
        meet_link=meet_link,
        idempotency_key=idempotency_key,
        notes=notes,
    )

    try:
        db.add(new_booking)
        db.commit()
        db.refresh(new_booking)

        # Trigger Phase 5 automated customer & technician notifications
        try:
            import threading

            from api.app.services.notifier import dispatch_booking_notifications

            threading.Thread(
                target=dispatch_booking_notifications,
                args=(new_booking.id, tenant_id),
                daemon=True,
            ).start()
        except Exception as notif_err:
            logger.warning("Could not launch booking notification thread: %s", notif_err)

        return new_booking
    except IntegrityError as err:
        db.rollback()
        raise SlotUnavailableError(
            f"Double booking prevented: slot {slot_start.isoformat()} already taken."
        ) from err


def cancel_booking(
    booking_id: str,
    tenant_id: str,
    db: Session,
    custom_provider: CalendarProvider | None = None,
) -> Booking:
    """Cancel an appointment and delete external calendar event if present."""
    booking = db.scalar(
        select(Booking).where(Booking.id == booking_id, Booking.tenant_id == tenant_id)
    )
    if not booking:
        raise KeyError(f"Booking {booking_id} not found for tenant {tenant_id}")

    booking.status = "cancelled"
    booking.updated_at = datetime.now(UTC)

    # Delete external calendar event if exists
    if booking.calendar_event_id:
        cal_provider = custom_provider
        calendar_id = "primary"
        if cal_provider is None:
            cal_provider, calendar_id = _get_tenant_calendar_provider(tenant_id, db)
        if cal_provider:
            try:
                cal_provider.delete_event(calendar_id, booking.calendar_event_id)
            except Exception as e:
                logger.warning("Failed to delete external calendar event: %s", e)

    db.commit()
    db.refresh(booking)
    return booking
