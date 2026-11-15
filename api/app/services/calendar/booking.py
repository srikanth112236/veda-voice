"""Booking service with atomic slot holds, double-booking prevention, and Google Meet integration."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.app.models.booking import Booking
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import _get_tenant_calendar_provider
from api.app.services.calendar.base import CalendarProvider, ExternalEvent

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

    # Check for existing active booking
    existing = db.scalar(
        select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.start_at == slot_start,
            Booking.status.in_(["confirmed", "held"]),
        )
    )

    if existing:
        if existing.status == "held" and existing.call_id == call_id:
            # Refresh hold for same call
            existing.hold_expires_at = now_utc + timedelta(minutes=5)
            db.commit()
            return existing
        raise SlotUnavailableError(
            f"Slot starting at {slot_start.isoformat()} is no longer available."
        )

    hold_booking = Booking(
        tenant_id=tenant_id,
        call_id=call_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
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

    # 3. Check for conflicting active bookings (unless it is our held slot)
    conflict = db.scalar(
        select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.start_at == slot_start,
            Booking.status == "confirmed",
        )
    )
    if conflict:
        raise SlotUnavailableError(f"Slot {slot_start.isoformat()} is already booked.")

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
        event_title = f"{service_type.replace('_', ' ').title()} - {customer_name}"
        event_desc = (
            f"Customer: {customer_name}\n"
            f"Phone: {customer_phone}\n"
            f"Service: {service_type}\n"
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
    if held_booking:
        held_booking.status = "confirmed"
        held_booking.customer_name = customer_name
        held_booking.customer_phone = customer_phone
        held_booking.customer_email = customer_email
        held_booking.service_type = service_type
        held_booking.calendar_event_id = calendar_event_id
        held_booking.meet_link = meet_link
        held_booking.idempotency_key = idempotency_key
        held_booking.notes = notes
        held_booking.hold_expires_at = None
        held_booking.updated_at = now_utc
        db.commit()
        db.refresh(held_booking)
        return held_booking

    new_booking = Booking(
        tenant_id=tenant_id,
        call_id=call_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
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
