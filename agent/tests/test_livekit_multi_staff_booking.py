"""Tests for LiveKit voice agent multi-staff booking tools with territory and skill routing (Milestone M10b)."""

import uuid

import pytest
from sqlalchemy import select

from agent.tools.booking import create_booking_tools
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import init_db
from api.app.models.booking import Booking
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant


@pytest.fixture(autouse=True)
def setup_db() -> None:
    init_db()


@pytest.mark.asyncio
async def test_livekit_tool_multi_staff_territory_dispatch() -> None:
    """Verify check_availability and book_appointment tools route to territory technician."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    tenant_id = f"lk-tech-{suffix}"

    try:
        tenant = Tenant(
            id=tenant_id,
            name=f"LiveKit Trades Co {suffix}",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)

        # Register specialized technician
        tech = StaffMember(
            tenant_id=tenant_id,
            name="Gordon Freeman",
            email="gordon@blackmesa.com",
            role="lead_technician",
            skills=["hazard_plumbing", "pipe_relining"],
            service_territory_zips=["78701", "78702"],
            priority_weight=2,
            is_active=True,
        )
        db.add(tech)
        db.commit()

        # Generate agent token
        agent_token = create_access_token(
            {
                "sub": "livekit-agent-dispatch",
                "role": "agent",
                "tenant_id": tenant_id,
                "call_id": f"call-{suffix}",
            }
        )

        tools = create_booking_tools(agent_token)
        tool_map = {tool.info.name: tool for tool in tools}

        check_tool = tool_map["check_availability_tool"]
        book_tool = tool_map["book_appointment_tool"]

        # 1. Check availability with trade service and zip code
        avail_result = await check_tool(
            target_date="2026-11-28",
            service_type="hazard_plumbing",
            postal_code="78701",
        )
        assert "Available openings on 2026-11-28" in avail_result
        assert "start_iso:" in avail_result

        # Extract start_iso
        start_iso = avail_result.split("start_iso: ")[1].split(")")[0]

        # 2. Book appointment with trade service and zip code
        booking_result = await book_tool(
            start_iso=start_iso,
            customer_name="Alyx Vance",
            customer_phone="+15125550999",
            customer_email="alyx@resistance.org",
            service_type="hazard_plumbing",
            postal_code="78701",
            notes="Main valve pressure oscillation.",
        )

        assert "Appointment confirmed for Alyx Vance" in booking_result
        assert "Technician assigned" in booking_result

        # Verify DB booking record
        saved_booking = db.scalar(
            select(Booking).where(
                Booking.tenant_id == tenant_id,
                Booking.customer_name == "Alyx Vance",
            )
        )
        assert saved_booking is not None
        assert saved_booking.staff_id == tech.id
        assert saved_booking.postal_code == "78701"
        assert saved_booking.service_type == "hazard_plumbing"

    finally:
        db.query(Booking).filter(Booking.tenant_id == tenant_id).delete()
        db.query(StaffMember).filter(StaffMember.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()
