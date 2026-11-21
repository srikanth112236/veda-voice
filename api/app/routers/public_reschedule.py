"""Public Reschedule API & Inbound Carrier SMS Webhook Handlers.

Allows customers to view and reschedule appointments via cryptographically secure 1-tap links
without requiring tenant authentication or login. Also processes inbound SMS replies (C/CONFIRM/CANCEL)
from Telnyx and Twilio telephony carriers.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db.session import get_db
from api.app.models.booking import Booking
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import (
    AvailableSlotsResponse,
    _get_tenant_calendar_provider,
    compute_available_slots,
)
from api.app.services.notifier import TelnyxSmsDispatcher, process_inbound_sms

logger = logging.getLogger("vedavoice.public_reschedule")

router = APIRouter(tags=["public_reschedule"])


# ===========================================================================
# Pydantic Schemas
# ===========================================================================


class PublicBookingDetailsResponse(BaseModel):
    booking_id: str
    reschedule_token: str
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    service_type: str
    service_label: str
    status: str
    start_at: str
    end_at: str
    duration_minutes: int
    timezone: str
    business_name: str
    business_phone: str
    formatted_time: str
    formatted_date: str
    is_arrival_window: bool = False
    arrival_window_start: str | None = None
    arrival_window_end: str | None = None


class PublicRescheduleRequest(BaseModel):
    slot_start: str = Field(
        ..., description="Target ISO 8601 start datetime for the rescheduled slot"
    )
    notes: str | None = Field(None, description="Optional customer note or reason for rescheduling")


class PublicRescheduleResponse(BaseModel):
    success: bool
    booking_id: str
    status: str
    new_start_at: str
    new_end_at: str
    formatted_date: str
    formatted_time: str
    message: str


# ===========================================================================
# Helpers
# ===========================================================================


def _format_datetime_strings(dt: datetime, tz_str: str) -> tuple[str, str]:
    """Format local date and 12-hour AM/PM time with explicit timezone label."""
    try:
        tz = ZoneInfo(tz_str)
        local_dt = dt.astimezone(tz)
    except Exception:
        local_dt = dt

    date_str = local_dt.strftime("%A, %B %d, %Y")
    time_str = local_dt.strftime("%I:%M %p").lstrip("0")

    if tz_str == "America/New_York":
        tz_abbr = "EST"
    elif tz_str == "America/Chicago":
        tz_abbr = "CST"
    elif tz_str in ("America/Denver", "America/Phoenix"):
        tz_abbr = "MST"
    elif tz_str == "America/Los_Angeles":
        tz_abbr = "PST"
    else:
        tz_abbr = tz_str.split("/")[-1].replace("_", " ")

    return date_str, f"{time_str} {tz_abbr}".strip()


# ===========================================================================
# Endpoints
# ===========================================================================


@router.get("/public/reschedule/{token}", response_model=PublicBookingDetailsResponse)
def get_public_booking_by_token(
    token: str,
    db: Session = Depends(get_db),
) -> PublicBookingDetailsResponse:
    """Lookup appointment details by customer 1-tap reschedule token without authentication."""
    booking = db.scalar(select(Booking).where(Booking.reschedule_token == token))
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found or reschedule link is invalid or expired.",
        )

    tenant = db.scalar(select(Tenant).where(Tenant.id == booking.tenant_id))
    business_name = tenant.name if tenant else "Service Provider"
    tz_str = tenant.timezone if tenant and tenant.timezone else "America/New_York"
    business_phone = ""
    if tenant and tenant.agent_profile:
        business_phone = getattr(tenant.agent_profile, "transfer_number", "") or ""

    date_str, time_str = _format_datetime_strings(booking.start_at, tz_str)

    duration_min = 60
    if booking.start_at and booking.end_at:
        duration_min = max(15, int((booking.end_at - booking.start_at).total_seconds() / 60))

    srv_label = (booking.service_type or "General Appointment").replace("_", " ").title()

    return PublicBookingDetailsResponse(
        booking_id=booking.id,
        reschedule_token=booking.reschedule_token or token,
        customer_name=booking.customer_name,
        customer_phone=booking.customer_phone,
        customer_email=booking.customer_email,
        service_type=booking.service_type or "general_appointment",
        service_label=srv_label,
        status=booking.status,
        start_at=booking.start_at.isoformat(),
        end_at=booking.end_at.isoformat(),
        duration_minutes=duration_min,
        timezone=tz_str,
        business_name=business_name,
        business_phone=business_phone,
        formatted_date=date_str,
        formatted_time=time_str,
        is_arrival_window=bool(getattr(booking, "is_arrival_window", False)),
        arrival_window_start=(
            booking.arrival_window_start.isoformat()
            if booking.arrival_window_start is not None
            else None
        ),
        arrival_window_end=(
            booking.arrival_window_end.isoformat()
            if booking.arrival_window_end is not None
            else None
        ),
    )


@router.get("/public/reschedule/{token}/slots", response_model=AvailableSlotsResponse)
def get_public_reschedule_slots(
    token: str,
    target_date: str | None = Query(None, description="Date in YYYY-MM-DD format"),
    db: Session = Depends(get_db),
) -> AvailableSlotsResponse:
    """Retrieve open bookable appointment slots for target date for reschedule selection."""
    booking = db.scalar(select(Booking).where(Booking.reschedule_token == token))
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found or reschedule link is invalid.",
        )

    tenant = db.scalar(select(Tenant).where(Tenant.id == booking.tenant_id))
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service provider account not found.",
        )

    if target_date:
        try:
            t_date = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Expected YYYY-MM-DD.",
            ) from err
    else:
        # Default to tomorrow
        t_date = (datetime.now(UTC) + timedelta(days=1)).date()

    duration_min = 60
    if booking.start_at and booking.end_at:
        duration_min = max(15, int((booking.end_at - booking.start_at).total_seconds() / 60))

    return compute_available_slots(
        tenant=tenant,
        target_date=t_date,
        db=db,
        service_duration_minutes=duration_min,
        service_type=booking.service_type,
    )


@router.post("/public/reschedule/{token}", response_model=PublicRescheduleResponse)
def execute_public_reschedule(
    token: str,
    payload: PublicRescheduleRequest,
    db: Session = Depends(get_db),
) -> PublicRescheduleResponse:
    """Confirm appointment rescheduling to the selected slot and notify customer via SMS."""
    booking = db.scalar(select(Booking).where(Booking.reschedule_token == token))
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found or reschedule link has expired.",
        )

    if booking.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This appointment is currently {booking.status} and cannot be rescheduled online.",
        )

    tenant = db.scalar(select(Tenant).where(Tenant.id == booking.tenant_id))
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service provider account not found.",
        )

    try:
        new_start_dt = datetime.fromisoformat(payload.slot_start)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid slot_start ISO 8601 datetime format.",
        ) from err

    if new_start_dt.tzinfo is None:
        new_start_dt = new_start_dt.replace(tzinfo=UTC)

    duration_min = 60
    if booking.start_at and booking.end_at:
        duration_min = max(15, int((booking.end_at - booking.start_at).total_seconds() / 60))
    new_end_dt = new_start_dt + timedelta(minutes=duration_min)

    # Conflict check: ensure no other active confirmed booking collides on that slot
    conflict = db.scalar(
        select(Booking).where(
            Booking.tenant_id == tenant.id,
            Booking.id != booking.id,
            Booking.status.in_(["confirmed", "held"]),
            Booking.start_at < new_end_dt,
            Booking.end_at > new_start_dt,
        )
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected time slot was just booked by another customer. Please select another slot.",
        )

    # Update booking times and status
    booking.start_at = new_start_dt
    booking.end_at = new_end_dt
    booking.status = "confirmed"
    booking.confirmation_channel = "reschedule_web"
    booking.confirmed_via_sms_at = datetime.now(UTC)
    if payload.notes:
        existing_notes = booking.notes or ""
        booking.notes = f"{existing_notes}\n[Rescheduled via Web]: {payload.notes}".strip()

    # Sync external Google Calendar event if provider attached
    if booking.calendar_event_id:
        try:
            cal_provider, cal_id = _get_tenant_calendar_provider(tenant.id, db)
            if cal_provider and cal_id:
                cal_provider.update_event(
                    calendar_id=cal_id,
                    event_id=booking.calendar_event_id,
                    changes={
                        "start": new_start_dt,
                        "end": new_end_dt,
                        "summary": f"{booking.service_type.replace('_', ' ').title()} - {booking.customer_name}",
                        "description": f"Rescheduled via Customer Web Portal\nPhone: {booking.customer_phone}\nNotes: {booking.notes or ''}",
                    },
                )
        except Exception as e:
            logger.warning(
                "Could not sync external calendar update during public reschedule: %s", e
            )

    db.commit()
    db.refresh(booking)

    tz_str = tenant.timezone if tenant and tenant.timezone else "America/New_York"
    formatted_date, formatted_time = _format_datetime_strings(booking.start_at, tz_str)

    # Send confirmation SMS to customer
    if booking.customer_phone and len(booking.customer_phone.strip()) >= 10:
        sms_dispatcher = TelnyxSmsDispatcher()
        sms_text = (
            f"Confirmed! Your appointment with {tenant.name} has been successfully rescheduled to "
            f"{formatted_date} at {formatted_time}. Questions? Call {tenant.agent_profile.transfer_number if tenant.agent_profile else 'our office'}."
        )
        try:
            sms_dispatcher.send(booking.customer_phone, sms_text)
        except Exception as e:
            logger.warning(
                "Could not send reschedule confirmation SMS to %s: %s", booking.customer_phone, e
            )

    return PublicRescheduleResponse(
        success=True,
        booking_id=booking.id,
        status=booking.status,
        new_start_at=booking.start_at.isoformat(),
        new_end_at=booking.end_at.isoformat(),
        formatted_date=formatted_date,
        formatted_time=formatted_time,
        message=f"Appointment successfully rescheduled to {formatted_date} at {formatted_time}.",
    )


# ===========================================================================
# Carrier Inbound SMS Webhooks (Telnyx & Twilio)
# ===========================================================================


@router.post("/webhooks/sms/inbound")
async def handle_carrier_inbound_sms(
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Ingest inbound carrier SMS webhook event from Telnyx or Twilio and process 2-way reply."""
    from_phone = ""
    message_body = ""

    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception:
            payload = {}

        # 1. Telnyx event structure
        data = payload.get("data", {})
        if data.get("event_type") == "message.received":
            msg_payload = data.get("payload", {})
            from_phone = msg_payload.get("from", {}).get("phone_number", "")
            message_body = msg_payload.get("text", "")

        # 2. Direct JSON fallback
        if not from_phone:
            from_phone = (
                payload.get("from_phone") or payload.get("From") or payload.get("from") or ""
            )
            message_body = payload.get("body") or payload.get("Body") or payload.get("text") or ""

    else:
        # Twilio standard application/x-www-form-urlencoded
        try:
            form_data = await request.form()
            from_phone = str(form_data.get("From") or form_data.get("from") or "")
            message_body = str(form_data.get("Body") or form_data.get("text") or "")
        except Exception as err:
            logger.warning("Failed to parse form-encoded carrier SMS webhook: %s", err)

    if not from_phone or not message_body:
        logger.warning(
            "Carrier SMS webhook received without required phone or body: from='%s', body='%s'",
            from_phone,
            message_body,
        )
        return {
            "status": "ignored",
            "reason": "missing_from_or_body",
            "received_from": from_phone,
        }

    logger.info("Processing inbound carrier SMS from %s: '%s'", from_phone, message_body)
    result = process_inbound_sms(from_phone=from_phone, message_body=message_body, db=db)
    return {"status": "processed", "result": result}
