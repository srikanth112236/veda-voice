"""Tests for LiveKit Agent Calendar Booking Tools (Gap 2).

Validates:
1. create_booking_tools() factory creates valid LiveKit FunctionTools bound to call_token.
2. check_availability_tool queries real-time slots and formats friendly voice text.
3. hold_slot_tool temporarily reserves a time slot.
4. book_appointment_tool confirms booking and persists record to database.
5. cancel_appointment_tool cancels confirmed booking.
"""

import uuid

import pytest

from agent.tools.booking import create_booking_tools
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import init_db
from api.app.models.booking import Booking
from api.app.models.tenant import Tenant


@pytest.fixture(autouse=True)
def setup_db() -> None:
    init_db()


@pytest.mark.asyncio
async def test_create_booking_tools_and_full_lifecycle() -> None:
    """Verify booking tools lifecycle: check openings, hold, book, and cancel."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Booking Tools Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        # Generate call-scoped agent JWT
        call_id = f"booking-session-{suffix}"
        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant.id,
                "call_id": call_id,
            }
        )

        # 1. Factory creates 4 function tools
        tools = create_booking_tools(call_token=call_token)
        assert len(tools) == 4

        tool_map = {t.__name__: t for t in tools}
        assert "check_availability_tool" in tool_map
        assert "hold_slot_tool" in tool_map
        assert "book_appointment_tool" in tool_map
        assert "cancel_appointment_tool" in tool_map

        # 2. Check availability for a future Wednesday
        target_date = "2026-11-25"
        avail_text = await tool_map["check_availability_tool"](target_date=target_date)
        assert f"Available openings on {target_date}" in avail_text
        assert "start_iso:" in avail_text

        # Extract slot ISO string
        # Formatted like: "... (start_iso: 2026-11-25T08:00:00-05:00)"
        start_marker = "start_iso: "
        start_idx = avail_text.find(start_marker) + len(start_marker)
        end_idx = avail_text.find(")", start_idx)
        slot_iso = avail_text[start_idx:end_idx].strip()
        assert "2026-11-25" in slot_iso

        # 3. Hold the slot
        hold_text = await tool_map["hold_slot_tool"](
            start_iso=slot_iso,
            customer_name="John Connor",
            customer_phone="+15125550188",
        )
        assert "held successfully for 5 minutes" in hold_text

        # 4. Book the appointment
        book_text = await tool_map["book_appointment_tool"](
            start_iso=slot_iso,
            customer_name="John Connor",
            customer_phone="+15125550188",
            customer_email="john@example.com",
            service_type="drain_cleaning",
            notes="Gate code is 1234",
        )
        assert "Appointment confirmed for John Connor" in book_text
        assert "Booking ID:" in book_text

        # Verify record in database
        from sqlalchemy import select

        booking_rec = db.scalar(
            select(Booking).where(
                Booking.tenant_id == tenant.id,
                Booking.customer_name == "John Connor",
            )
        )
        assert booking_rec is not None
        assert booking_rec.status == "confirmed"
        assert booking_rec.customer_phone == "+15125550188"
        booking_id = booking_rec.id

        # 5. Cancel appointment
        cancel_text = await tool_map["cancel_appointment_tool"](booking_id=booking_id)
        assert "cancelled successfully" in cancel_text

        db.refresh(booking_rec)
        assert booking_rec.status == "cancelled"

    finally:
        db.close()


@pytest.mark.asyncio
async def test_relative_date_handling_in_booking_tools() -> None:
    """Verify check_availability_tool handles relative dates ('tomorrow', 'friday') without error."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Relative Dates Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant.id,
                "call_id": f"rel-date-call-{suffix}",
            }
        )
        tools = create_booking_tools(call_token=call_token)
        tool_map = {t.__name__: t for t in tools}

        # Relative date 'tomorrow' should be normalized to YYYY-MM-DD
        res_tomorrow = await tool_map["check_availability_tool"](target_date="tomorrow")
        assert "Invalid target_date format" not in res_tomorrow
        assert ("Available openings on" in res_tomorrow) or (
            "No open slots available" in res_tomorrow
        )

        # Relative date 'friday' should be normalized
        res_fri = await tool_map["check_availability_tool"](target_date="Friday")
        assert "Invalid target_date format" not in res_fri
        assert ("Available openings on" in res_fri) or ("No open slots available" in res_fri)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_hold_slot_with_defaults_and_caller_phone() -> None:
    """Verify hold_slot_tool works when name/phone are omitted, falling back to caller ID."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    caller_id_phone = "+15125550199"
    try:
        tenant = Tenant(
            name=f"Hold Defaults Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()

        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant.id,
                "call_id": f"hold-def-call-{suffix}",
            }
        )
        tools = create_booking_tools(call_token=call_token, caller_phone=caller_id_phone)
        tool_map = {t.__name__: t for t in tools}

        target_date = "2026-11-26"
        avail_text = await tool_map["check_availability_tool"](target_date=target_date)
        start_marker = "start_iso: "
        start_idx = avail_text.find(start_marker) + len(start_marker)
        end_idx = avail_text.find(")", start_idx)
        slot_iso = avail_text[start_idx:end_idx].strip()

        # Hold slot without passing name and phone
        hold_res = await tool_map["hold_slot_tool"](start_iso=slot_iso)
        assert "held successfully for 5 minutes" in hold_res

        # Book appointment using caller ID phone fallback
        book_res = await tool_map["book_appointment_tool"](
            start_iso=slot_iso,
            customer_name="Alice Smith",
        )
        assert "Appointment confirmed for Alice Smith" in book_res
    finally:
        db.close()


def test_tenant_configs_have_booking_enabled() -> None:
    """Verify active tenants in clients.json have calendar booking enabled by default."""
    from agent.config import load_business_config
    from agent.prompts import build_system_prompt

    cfg = load_business_config("default")
    assert "booking" in cfg.tools_enabled

    prompt = build_system_prompt(cfg)
    assert "CALENDAR SCHEDULING (TOOLS: check_availability, hold_slot, book_appointment)" in prompt
