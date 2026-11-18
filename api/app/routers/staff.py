"""Portal endpoints for technician roster management, dispatch simulation, and multi-staff scheduling (Milestone M10b)."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant
from api.app.db.session import get_db
from api.app.models.booking import Booking
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.services.calendar.dispatch import (
    assign_technician_round_robin,
    filter_eligible_staff,
)

logger = logging.getLogger("vedavoice.portal.staff")

router = APIRouter(prefix="/portal/calendar", tags=["staff-dispatch"])


# --- Pydantic Schemas ---


class StaffMemberCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    email: EmailStr
    phone: str = Field(default="", max_length=32)
    role: str = Field(default="technician", max_length=64)
    skills: list[str] = Field(default_factory=list)
    service_territory_zips: list[str] = Field(default_factory=list)
    calendar_provider: str = Field(default="internal")
    calendar_id: str = Field(default="primary")
    priority_weight: int = Field(default=1, ge=1, le=10)
    is_active: bool = True
    working_hours: dict[str, Any] | None = None
    notes: str | None = None


class StaffMemberUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=128)
    email: EmailStr | None = None
    phone: str | None = None
    role: str | None = None
    skills: list[str] | None = None
    service_territory_zips: list[str] | None = None
    calendar_provider: str | None = None
    calendar_id: str | None = None
    priority_weight: int | None = Field(None, ge=1, le=10)
    is_active: bool | None = None
    working_hours: dict[str, Any] | None = None
    notes: str | None = None


class StaffMemberResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    email: str
    phone: str
    role: str
    skills: list[str]
    service_territory_zips: list[str]
    calendar_provider: str
    calendar_id: str
    priority_weight: int
    is_active: bool
    working_hours: dict[str, Any] | None
    last_assigned_at: str | None
    notes: str | None
    today_bookings_count: int = 0
    created_at: str
    updated_at: str


class DispatchPreviewRequest(BaseModel):
    service_type: str | None = None
    postal_code: str | None = None
    slot_time: datetime | None = None


class DispatchPreviewResponse(BaseModel):
    service_type: str | None
    postal_code: str | None
    eligible_technicians_count: int
    eligible_technicians: list[dict[str, Any]]
    chosen_technician: dict[str, Any] | None
    routing_strategy: str = "round_robin"


class RosterTechnicianSchedule(BaseModel):
    technician_id: str
    technician_name: str
    role: str
    skills: list[str]
    bookings: list[dict[str, Any]]


# --- Endpoints ---


@router.get("/staff", response_model=list[StaffMemberResponse])
def list_staff_members(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    include_inactive: bool = Query(default=False),
) -> list[StaffMemberResponse]:
    """List technician staff members for tenant with active booking counts and dispatch metrics."""
    query = select(StaffMember).where(StaffMember.tenant_id == tenant.id)
    if not include_inactive:
        query = query.where(StaffMember.is_active == True)  # noqa: E712
    query = query.order_by(StaffMember.name)

    staff_records = db.scalars(query).all()

    # Query today's active bookings per technician
    now_utc = datetime.now(UTC)
    day_start = datetime(now_utc.year, now_utc.month, now_utc.day, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)

    counts_query = (
        select(Booking.staff_id, func.count(Booking.id))
        .where(
            Booking.tenant_id == tenant.id,
            Booking.status.in_(["confirmed", "held"]),
            Booking.start_at >= day_start,
            Booking.start_at < day_end,
        )
        .group_by(Booking.staff_id)
    )
    counts_map: dict[str, int] = {
        row[0]: row[1] for row in db.execute(counts_query).all() if row[0] is not None
    }

    results: list[StaffMemberResponse] = []
    for s in staff_records:
        results.append(
            StaffMemberResponse(
                id=s.id,
                tenant_id=s.tenant_id,
                name=s.name,
                email=s.email,
                phone=s.phone,
                role=s.role,
                skills=s.skills or [],
                service_territory_zips=s.service_territory_zips or [],
                calendar_provider=s.calendar_provider,
                calendar_id=s.calendar_id,
                priority_weight=s.priority_weight,
                is_active=s.is_active,
                working_hours=s.working_hours,
                last_assigned_at=s.last_assigned_at.isoformat() if s.last_assigned_at else None,
                notes=s.notes,
                today_bookings_count=counts_map.get(s.id, 0),
                created_at=s.created_at.isoformat(),
                updated_at=s.updated_at.isoformat(),
            )
        )
    return results


@router.post("/staff", response_model=StaffMemberResponse, status_code=status.HTTP_201_CREATED)
def create_staff_member(
    req: StaffMemberCreate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> StaffMemberResponse:
    """Register a new staff technician with skills, territory zip codes, and schedule."""
    new_staff = StaffMember(
        tenant_id=tenant.id,
        name=req.name.strip(),
        email=req.email.lower().strip(),
        phone=req.phone.strip(),
        role=req.role.strip(),
        skills=req.skills,
        service_territory_zips=req.service_territory_zips,
        calendar_provider=req.calendar_provider,
        calendar_id=req.calendar_id,
        priority_weight=req.priority_weight,
        is_active=req.is_active,
        working_hours=req.working_hours,
        notes=req.notes,
    )
    db.add(new_staff)
    db.commit()
    db.refresh(new_staff)

    return StaffMemberResponse(
        id=new_staff.id,
        tenant_id=new_staff.tenant_id,
        name=new_staff.name,
        email=new_staff.email,
        phone=new_staff.phone,
        role=new_staff.role,
        skills=new_staff.skills or [],
        service_territory_zips=new_staff.service_territory_zips or [],
        calendar_provider=new_staff.calendar_provider,
        calendar_id=new_staff.calendar_id,
        priority_weight=new_staff.priority_weight,
        is_active=new_staff.is_active,
        working_hours=new_staff.working_hours,
        last_assigned_at=None,
        notes=new_staff.notes,
        today_bookings_count=0,
        created_at=new_staff.created_at.isoformat(),
        updated_at=new_staff.updated_at.isoformat(),
    )


@router.put("/staff/{staff_id}", response_model=StaffMemberResponse)
def update_staff_member(
    staff_id: str,
    req: StaffMemberUpdate,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> StaffMemberResponse:
    """Update technician profile, active status, skills, or territory assignments."""
    staff = db.scalar(
        select(StaffMember).where(
            StaffMember.id == staff_id,
            StaffMember.tenant_id == tenant.id,
        )
    )
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    update_data = req.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        if val is not None:
            setattr(staff, field, val)

    staff.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(staff)

    return StaffMemberResponse(
        id=staff.id,
        tenant_id=staff.tenant_id,
        name=staff.name,
        email=staff.email,
        phone=staff.phone,
        role=staff.role,
        skills=staff.skills or [],
        service_territory_zips=staff.service_territory_zips or [],
        calendar_provider=staff.calendar_provider,
        calendar_id=staff.calendar_id,
        priority_weight=staff.priority_weight,
        is_active=staff.is_active,
        working_hours=staff.working_hours,
        last_assigned_at=staff.last_assigned_at.isoformat() if staff.last_assigned_at else None,
        notes=staff.notes,
        today_bookings_count=0,
        created_at=staff.created_at.isoformat(),
        updated_at=staff.updated_at.isoformat(),
    )


@router.delete("/staff/{staff_id}", status_code=status.HTTP_200_OK)
def delete_staff_member(
    staff_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Deactivate or remove technician staff member."""
    staff = db.scalar(
        select(StaffMember).where(
            StaffMember.id == staff_id,
            StaffMember.tenant_id == tenant.id,
        )
    )
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found")

    db.delete(staff)
    db.commit()
    return {"success": True, "message": f"Staff member '{staff.name}' deleted successfully"}


@router.post("/dispatch/preview", response_model=DispatchPreviewResponse)
def preview_dispatch_routing(
    req: DispatchPreviewRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> DispatchPreviewResponse:
    """Simulate dispatch routing for a given trade service and customer postal code."""
    eligible = filter_eligible_staff(tenant.id, req.service_type, req.postal_code, db)

    target_slot = req.slot_time or datetime.now(UTC)
    chosen = assign_technician_round_robin(eligible, target_slot, db)

    eligible_summary = [
        {
            "id": s.id,
            "name": s.name,
            "role": s.role,
            "skills": s.skills,
            "territories": s.service_territory_zips,
            "priority_weight": s.priority_weight,
            "last_assigned_at": s.last_assigned_at.isoformat() if s.last_assigned_at else None,
        }
        for s in eligible
    ]

    chosen_summary = None
    if chosen:
        chosen_summary = {
            "id": chosen.id,
            "name": chosen.name,
            "role": chosen.role,
            "email": chosen.email,
            "phone": chosen.phone,
        }

    return DispatchPreviewResponse(
        service_type=req.service_type,
        postal_code=req.postal_code,
        eligible_technicians_count=len(eligible),
        eligible_technicians=eligible_summary,
        chosen_technician=chosen_summary,
        routing_strategy="round_robin",
    )


@router.get("/roster", response_model=list[RosterTechnicianSchedule])
def get_technician_roster_schedule(
    target_date: str = Query(default=lambda: datetime.now(UTC).strftime("%Y-%m-%d")),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[RosterTechnicianSchedule]:
    """Retrieve schedule of appointments grouped by technician for the target date."""
    try:
        parsed_date = date.fromisoformat(target_date)
    except ValueError:
        parsed_date = datetime.now(UTC).date()

    day_start = datetime(parsed_date.year, parsed_date.month, parsed_date.day, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)

    staff_members = db.scalars(
        select(StaffMember)
        .where(
            StaffMember.tenant_id == tenant.id,
            StaffMember.is_active == True,  # noqa: E712
        )
        .order_by(StaffMember.name)
    ).all()

    # Query bookings for this day
    bookings = db.scalars(
        select(Booking)
        .where(
            Booking.tenant_id == tenant.id,
            Booking.status.in_(["confirmed", "held"]),
            Booking.start_at >= day_start,
            Booking.start_at < day_end,
        )
        .order_by(Booking.start_at)
    ).all()

    bookings_by_staff: dict[str, list[dict[str, Any]]] = {}
    for b in bookings:
        key = b.staff_id or "unassigned"
        if key not in bookings_by_staff:
            bookings_by_staff[key] = []
        bookings_by_staff[key].append(
            {
                "id": b.id,
                "customer_name": b.customer_name,
                "customer_phone": b.customer_phone,
                "service_type": b.service_type,
                "postal_code": b.postal_code,
                "start_at": b.start_at.isoformat(),
                "end_at": b.end_at.isoformat(),
                "status": b.status,
            }
        )

    roster: list[RosterTechnicianSchedule] = []
    for s in staff_members:
        roster.append(
            RosterTechnicianSchedule(
                technician_id=s.id,
                technician_name=s.name,
                role=s.role,
                skills=s.skills or [],
                bookings=bookings_by_staff.get(s.id, []),
            )
        )

    # If there are unassigned bookings, append unassigned group
    if "unassigned" in bookings_by_staff:
        roster.append(
            RosterTechnicianSchedule(
                technician_id="unassigned",
                technician_name="Unassigned / General Queue",
                role="general",
                skills=[],
                bookings=bookings_by_staff["unassigned"],
            )
        )

    return roster
