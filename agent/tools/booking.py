"""Voice agent tools for calendar availability checking and appointment booking (Milestone M3).

All calendar and booking actions communicate with the control plane internal API
using the call-scoped token. The agent never accesses the database or calendar directly.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, cast

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
                    return cast(dict[str, Any], res_hold)
                if endpoint_path == "book":
                    res_book = confirm_appointment_booking(
                        payload=BookSlotRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return cast(dict[str, Any], res_book)
                if endpoint_path == "cancel":
                    res_cancel = cancel_appointment_booking(
                        payload=CancelBookingRequest(**payload),
                        authorization=auth_hdr,
                        db=db,
                    )
                    return cast(dict[str, Any], res_cancel)
        except Exception as inner_e:
            logger.error("In-process internal calendar execution failed: %s", inner_e)
            raise inner_e

        raise e


def check_availability(
    call_token: str,
    target_date: str,
    duration_minutes: int = 60,
    service_type: str = "general_appointment",
) -> dict[str, Any]:
    """Check open, conflict-free appointment slots for target date (YYYY-MM-DD)."""
    return _call_internal_calendar_api(
        endpoint_path="availability",
        payload={
            "target_date": target_date,
            "duration_minutes": duration_minutes,
            "service_type": service_type,
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
