"""Voice agent tools for calendar availability checking and appointment booking (Milestone M3).

All calendar and booking actions communicate with the control plane internal API
using the call-scoped token. The agent never accesses the database or calendar directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Annotated, Any, cast

from livekit.agents import FunctionTool, function_tool

logger = logging.getLogger("receptionist.tools.booking")


def _call_internal_calendar_api(
    endpoint_path: str,
    payload: dict[str, Any],
    call_token: str,
    api_base_url: str | None = None,
) -> dict[str, Any]:
    """Execute authenticated HTTP POST request to internal control plane."""
    base_url = api_base_url or os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    url = f"{base_url}/api/v1/internal/calendar/{endpoint_path.lstrip('/')}"

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {call_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return dict(data) if isinstance(data, dict) else {}
    except Exception as e:
        logger.debug("HTTP call to internal calendar endpoint failed: %s; trying in-process", e)
        # In-process fallback when running in tests or within same Python interpreter
        try:
            from api.app.db.session import SessionLocal
            from api.app.routers.internal import (
                BookSlotRequest,
                CancelBookingRequest,
                CheckAvailabilityRequest,
                HoldSlotRequest,
                cancel_appointment_booking,
                confirm_appointment_booking,
                get_slot_availability,
                hold_appointment_slot,
            )

            with SessionLocal() as db:
                auth_hdr = f"Bearer {call_token}"
                if endpoint_path == "availability":
                    res = get_slot_availability(
                        payload=CheckAvailabilityRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return cast(
                        dict[str, Any],
                        res.model_dump() if hasattr(res, "model_dump") else dict(res),
                    )
                if endpoint_path == "hold":
                    res_hold = hold_appointment_slot(
                        payload=HoldSlotRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return dict(res_hold)
                if endpoint_path == "book":
                    res_book = confirm_appointment_booking(
                        payload=BookSlotRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return dict(res_book)
                if endpoint_path == "cancel":
                    res_cancel = cancel_appointment_booking(
                        payload=CancelBookingRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return dict(res_cancel)
                if endpoint_path == "send-link":
                    from api.app.routers.internal import (
                        SendBookingLinkRequest,
                        send_self_serve_booking_link_sync,
                    )

                    res_send = send_self_serve_booking_link_sync(
                        payload=SendBookingLinkRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return dict(res_send)
        except Exception as inner_e:
            logger.error("In-process internal calendar execution failed: %s", inner_e)
            raise inner_e

        raise e


def check_availability(
    call_token: str,
    target_date: str,
    duration_minutes: int = 60,
    service_type: str = "general_appointment",
    postal_code: str | None = None,
) -> dict[str, Any]:
    """Check open, conflict-free appointment slots for target date (YYYY-MM-DD)."""
    return _call_internal_calendar_api(
        endpoint_path="availability",
        payload={
            "target_date": target_date,
            "duration_minutes": duration_minutes,
            "service_type": service_type,
            "postal_code": postal_code,
        },
        call_token=call_token,
    )


def hold_slot(
    call_token: str,
    start_iso: str,
    duration_minutes: int = 60,
    customer_name: str = "Prospective Customer",
    customer_phone: str = "",
    service_type: str = "general_appointment",
    postal_code: str | None = None,
    staff_id: str | None = None,
) -> dict[str, Any]:
    """Temporarily lock a time slot for 5 minutes during the phone call."""
    return _call_internal_calendar_api(
        endpoint_path="hold",
        payload={
            "start_iso": start_iso,
            "duration_minutes": duration_minutes,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "service_type": service_type,
            "postal_code": postal_code,
            "staff_id": staff_id,
        },
        call_token=call_token,
    )


def book_appointment(
    call_token: str,
    start_iso: str,
    customer_name: str,
    customer_phone: str,
    duration_minutes: int = 60,
    customer_email: str | None = None,
    service_type: str = "general_appointment",
    idempotency_key: str | None = None,
    notes: str | None = None,
    postal_code: str | None = None,
    staff_id: str | None = None,
) -> dict[str, Any]:
    """Confirm appointment booking, generate Google Meet link, and record in calendar."""
    return _call_internal_calendar_api(
        endpoint_path="book",
        payload={
            "start_iso": start_iso,
            "duration_minutes": duration_minutes,
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "customer_email": customer_email,
            "service_type": service_type,
            "idempotency_key": idempotency_key,
            "notes": notes,
            "postal_code": postal_code,
            "staff_id": staff_id,
        },
        call_token=call_token,
    )


def cancel_appointment(
    call_token: str,
    booking_id: str,
) -> dict[str, Any]:
    """Cancel a confirmed booking and delete external calendar event."""
    return _call_internal_calendar_api(
        endpoint_path="cancel",
        payload={"booking_id": booking_id},
        call_token=call_token,
    )


def send_booking_link(
    call_token: str,
    phone_number: str,
    customer_name: str = "Valued Customer",
) -> dict[str, Any]:
    """Dispatch self-serve SMS booking link directly to caller mobile phone."""
    return _call_internal_calendar_api(
        endpoint_path="send-link",
        payload={
            "phone_number": phone_number,
            "customer_name": customer_name,
        },
        call_token=call_token,
    )


def _normalize_target_date(raw_date: str) -> str:
    """Normalize user or LLM input string (e.g. 'tomorrow', 'Friday', '2026-11-20') to strict YYYY-MM-DD."""
    cleaned = raw_date.strip()
    try:
        datetime.strptime(cleaned, "%Y-%m-%d")
        return cleaned
    except ValueError:
        pass

    now = datetime.now()
    low = cleaned.lower()
    if low in ("today", "now"):
        return now.strftime("%Y-%m-%d")
    if low in ("tomorrow",):
        return (now + timedelta(days=1)).strftime("%Y-%m-%d")
    if low in ("day after tomorrow",):
        return (now + timedelta(days=2)).strftime("%Y-%m-%d")

    weekdays = {
        "monday": 0,
        "mon": 0,
        "tuesday": 1,
        "tue": 1,
        "wednesday": 2,
        "wed": 2,
        "thursday": 3,
        "thu": 3,
        "friday": 4,
        "fri": 4,
        "saturday": 5,
        "sat": 5,
        "sunday": 6,
        "sun": 6,
    }
    for day_name, day_num in weekdays.items():
        if day_name in low:
            days_ahead = (day_num - now.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            target = now + timedelta(days=days_ahead)
            return target.strftime("%Y-%m-%d")

    return cleaned


def create_booking_tools(call_token: str, caller_phone: str = "") -> list[FunctionTool]:
    """Factory to create LiveKit function tools for calendar scheduling bound to a session's call token."""

    @function_tool(
        description="Check open appointment times for a specific date (YYYY-MM-DD or relative like 'tomorrow', 'Friday'). Call this when the caller asks when you have openings, wants to schedule on a day, or asks if a technician can come out."
    )
    async def check_availability_tool(
        target_date: Annotated[
            str,
            "Date in YYYY-MM-DD format (or relative day like 'tomorrow', 'Friday') to check open slots for",
        ],
        service_type: Annotated[str, "Type of service requested"] = "general_appointment",
        postal_code: Annotated[
            str | None, "Customer's postal or zip code for territory routing"
        ] = None,
    ) -> str:
        """Query open, conflict-free appointment slots for target date."""
        normalized_date = _normalize_target_date(target_date)
        try:
            res = await asyncio.to_thread(
                check_availability,
                call_token=call_token,
                target_date=normalized_date,
                duration_minutes=60,
                service_type=service_type,
                postal_code=postal_code.strip() if postal_code else None,
            )
            slots = res.get("slots", [])
            if not slots:
                return f"No open slots available on {normalized_date}. Please ask the caller for an alternative date."

            times_formatted = []
            for s in slots[:4]:
                start_iso = s.get("start_iso", "")
                disp = s.get("display_time")
                if disp:
                    times_formatted.append(f"{disp} (start_iso: {start_iso})")
                else:
                    try:
                        dt = datetime.fromisoformat(start_iso)
                        hour_str = dt.strftime("%I:%M %p").lstrip("0")
                        times_formatted.append(f"{hour_str} (start_iso: {start_iso})")
                    except Exception:
                        times_formatted.append(f"slot (start_iso: {start_iso})")

            return (
                f"Available openings on {normalized_date}: {', '.join(times_formatted)}. "
                "Offer 2-3 of these times concisely to the caller."
            )
        except Exception as e:
            logger.warning("check_availability tool error: %s", e)
            return f"Unable to check availability for {normalized_date} right now: {e}"

    @function_tool(
        description="Temporarily reserve and lock an appointment time slot for 5 minutes as soon as the caller agrees on or specifies a time. Call this immediately when a time is selected."
    )
    async def hold_slot_tool(
        start_iso: Annotated[
            str,
            "Exact start_iso string returned from check_availability (e.g. 2026-11-20T10:00:00-05:00)",
        ],
        customer_name: Annotated[
            str, "Customer's full name (if already known, or 'Prospective Customer')"
        ] = "Prospective Customer",
        customer_phone: Annotated[
            str, "Customer's callback phone number (if already known, or leave empty)"
        ] = "",
    ) -> str:
        """Lock slot for 5 minutes to prevent double-booking."""
        phone_to_use = customer_phone.strip() or caller_phone.strip()
        try:
            res = await asyncio.to_thread(
                hold_slot,
                call_token=call_token,
                start_iso=start_iso.strip(),
                customer_name=customer_name.strip() or "Prospective Customer",
                customer_phone=phone_to_use,
            )
            if res.get("status") == "held":
                return (
                    f"Slot {start_iso} held successfully for 5 minutes. "
                    "Now confirm customer full name and callback number to complete booking."
                )
            return f"Could not hold slot: {res.get('message', 'Slot may be unavailable.')}"
        except Exception as e:
            return f"Error holding slot: {e}"

    @function_tool(
        description="Confirm and schedule the appointment on the calendar. Call this after the time slot has been chosen and the caller's name and callback phone number are confirmed."
    )
    async def book_appointment_tool(
        start_iso: Annotated[str, "Confirmed slot start_iso string"],
        customer_name: Annotated[str, "Customer's full name"],
        customer_phone: Annotated[str, "Customer's callback phone number"] = "",
        customer_email: Annotated[
            str | None,
            "Customer's email address if provided for calendar invite",
        ] = None,
        service_type: Annotated[str, "Service or appointment type"] = "general_appointment",
        postal_code: Annotated[
            str | None, "Customer's postal or zip code for territory dispatch"
        ] = None,
        notes: Annotated[str | None, "Special notes or request details"] = None,
    ) -> str:
        """Confirm booking, generate calendar event and optional Google Meet link."""
        phone_to_use = customer_phone.strip() or caller_phone.strip()
        if not phone_to_use:
            return (
                "Please ask the caller for their callback phone number to confirm the appointment."
            )
        try:
            res = await asyncio.to_thread(
                book_appointment,
                call_token=call_token,
                start_iso=start_iso.strip(),
                customer_name=customer_name.strip(),
                customer_phone=phone_to_use,
                customer_email=customer_email.strip() if customer_email else None,
                service_type=service_type,
                postal_code=postal_code.strip() if postal_code else None,
                notes=notes.strip() if notes else None,
            )
            if res.get("status") == "confirmed":
                meet = f" Google Meet: {res['meet_link']}" if res.get("meet_link") else ""
                tech = " (Technician assigned)" if res.get("staff_id") else ""
                return f"Appointment confirmed for {customer_name} at {start_iso}. Booking ID: {res.get('booking_id')}.{meet}{tech}"
            return f"Unable to confirm booking: {res.get('message', 'Slot no longer available.')}"
        except Exception as e:
            return f"Error booking appointment: {e}"

    @function_tool(
        description="Cancel a previously confirmed appointment booking upon caller request."
    )
    async def cancel_appointment_tool(
        booking_id: Annotated[str, "Booking ID of the appointment to cancel"],
    ) -> str:
        """Cancel a booking."""
        try:
            res = await asyncio.to_thread(
                cancel_appointment,
                call_token=call_token,
                booking_id=booking_id.strip(),
            )
            if res.get("status") == "cancelled":
                return f"Appointment {booking_id} has been cancelled successfully."
            return f"Could not cancel appointment: {res.get('message', 'Booking not found.')}"
        except Exception as e:
            return f"Error cancelling appointment: {e}"

    @function_tool(
        description="Text a direct self-serve booking link (Calendly or scheduling portal) straight to the caller's phone via SMS if they prefer to choose a time on their phone, book online, or schedule later."
    )
    async def send_booking_link_tool(
        phone_number: Annotated[
            str,
            "Mobile phone number to receive the text message. If blank, automatically uses caller ID.",
        ] = "",
        customer_name: Annotated[
            str, "Customer's name if known, or 'Valued Customer'"
        ] = "Valued Customer",
    ) -> str:
        """Send self-serve booking link via SMS."""
        target_phone = phone_number.strip() or caller_phone.strip()
        if not target_phone:
            return "Please ask the caller for their mobile phone number so I can text them our booking link."
        try:
            res = await asyncio.to_thread(
                send_booking_link,
                call_token=call_token,
                phone_number=target_phone,
                customer_name=customer_name.strip() or "Valued Customer",
            )
            if res.get("success"):
                return (
                    f"Direct scheduling link successfully texted to {target_phone}. "
                    "Warmly let the caller know that the scheduling link has been sent to their phone, and they can open it anytime to choose their preferred time."
                )
            return f"Unable to text booking link: {res.get('message', 'SMS service unavailable')}"
        except Exception as e:
            return f"Error sending booking link: {e}"

    return [
        check_availability_tool,
        hold_slot_tool,
        book_appointment_tool,
        cancel_appointment_tool,
        send_booking_link_tool,
    ]
