"""API Router for Multi-Location Tenant Architecture (Milestone M11, FR-LOC-1 to 6)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant, get_current_user
from api.app.db.session import get_db
from api.app.models.location import Location
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.locations import (
    get_location_metrics,
    resolve_location_for_caller,
    user_has_location_access,
)

logger = logging.getLogger("vedavoice.routers.locations")
router = APIRouter(prefix="/portal/locations", tags=["locations"])


# --- Schemas ---


class LocationCreateUpdateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    code: str = Field(..., min_length=2, max_length=32)
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    state: str = ""
    postal_code: str = ""
    country: str = "US"
    phone: str = ""
    email: str = ""
    timezone: str = "America/New_York"
    hours: str = "Monday to Friday, 8:00 AM to 6:00 PM"
    service_territory_zips: list[str] = Field(default_factory=list)
    transfer_number: str = ""
    emergency_phone: str = ""
    calendar_provider: str = "internal"
    calendar_id: str = "primary"
    is_primary: bool = False
    is_active: bool = True
    notes: str | None = None


class LocationResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    code: str
    address_line1: str
    address_line2: str
    city: str
    state: str
    postal_code: str
    country: str
    phone: str
    email: str
    timezone: str
    hours: str
    service_territory_zips: list[str]
    transfer_number: str
    emergency_phone: str
    calendar_provider: str
    calendar_id: str
    is_primary: bool
    is_active: bool
    notes: str | None = None
    created_at: str
    updated_at: str
    metrics: dict[str, Any] = Field(default_factory=dict)


class ResolveLocationRequest(BaseModel):
    dialed_number: str | None = None
    postal_code: str | None = None
    spoken_city: str | None = None


# --- Endpoints ---


@router.get("", response_model=list[LocationResponse])
def list_tenant_locations(
    include_inactive: bool = Query(False),
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LocationResponse]:
    """List all physical locations, branches, or territories configured for the tenant."""
    query = select(Location).where(Location.tenant_id == tenant.id)
    if not include_inactive:
        query = query.where(Location.is_active == True)  # noqa: E712
    query = query.order_by(Location.is_primary.desc(), Location.name)

    locations = db.scalars(query).all()

    # Filter by user location permissions if restricted
    accessible_locations = [loc for loc in locations if user_has_location_access(user, loc.id)]

    results: list[LocationResponse] = []
    for loc in accessible_locations:
        metrics = get_location_metrics(loc.id, db)
        results.append(
            LocationResponse(
                id=loc.id,
                tenant_id=loc.tenant_id,
                name=loc.name,
                code=loc.code,
                address_line1=loc.address_line1,
                address_line2=loc.address_line2,
                city=loc.city,
                state=loc.state,
                postal_code=loc.postal_code,
                country=loc.country,
                phone=loc.phone,
                email=loc.email,
                timezone=loc.timezone,
                hours=loc.hours,
                service_territory_zips=loc.service_territory_zips,
                transfer_number=loc.transfer_number,
                emergency_phone=loc.emergency_phone,
                calendar_provider=loc.calendar_provider,
                calendar_id=loc.calendar_id,
                is_primary=loc.is_primary,
                is_active=loc.is_active,
                notes=loc.notes,
                created_at=loc.created_at.isoformat(),
                updated_at=loc.updated_at.isoformat(),
                metrics=metrics,
            )
        )
    return results


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(
    req: LocationCreateUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Create a new branch or service territory location for the tenant."""
    if user.role not in ("platform_admin", "tenant_owner", "tenant_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owners and managers can create new business locations.",
        )

    # Check for duplicate code
    existing_code = db.scalar(
        select(Location).where(
            Location.tenant_id == tenant.id,
            Location.code == req.code.strip().upper(),
        )
    )
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Location code '{req.code}' is already registered for this tenant.",
        )

    # If this location is marked primary, demote any other primary locations
    if req.is_primary:
        db.query(Location).where(Location.tenant_id == tenant.id).update({"is_primary": False})

    # Auto-set primary if first location
    loc_count = db.scalar(select(Location.id).where(Location.tenant_id == tenant.id)) is not None
    is_first_primary = req.is_primary or (not loc_count)

    loc = Location(
        tenant_id=tenant.id,
        name=req.name.strip(),
        code=req.code.strip().upper(),
        address_line1=req.address_line1.strip(),
        address_line2=req.address_line2.strip(),
        city=req.city.strip(),
        state=req.state.strip(),
        postal_code=req.postal_code.strip(),
        country=req.country.strip(),
        phone=req.phone.strip(),
        email=req.email.strip(),
        timezone=req.timezone.strip() or tenant.timezone,
        hours=req.hours.strip() or tenant.hours,
        service_territory_zips=[z.strip() for z in req.service_territory_zips if z.strip()],
        transfer_number=req.transfer_number.strip(),
        emergency_phone=req.emergency_phone.strip(),
        calendar_provider=req.calendar_provider,
        calendar_id=req.calendar_id,
        is_primary=is_first_primary,
        is_active=req.is_active,
        notes=req.notes,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)

    metrics = get_location_metrics(loc.id, db)
    return LocationResponse(
        id=loc.id,
        tenant_id=loc.tenant_id,
        name=loc.name,
        code=loc.code,
        address_line1=loc.address_line1,
        address_line2=loc.address_line2,
        city=loc.city,
        state=loc.state,
        postal_code=loc.postal_code,
        country=loc.country,
        phone=loc.phone,
        email=loc.email,
        timezone=loc.timezone,
        hours=loc.hours,
        service_territory_zips=loc.service_territory_zips,
        transfer_number=loc.transfer_number,
        emergency_phone=loc.emergency_phone,
        calendar_provider=loc.calendar_provider,
        calendar_id=loc.calendar_id,
        is_primary=loc.is_primary,
        is_active=loc.is_active,
        notes=loc.notes,
        created_at=loc.created_at.isoformat(),
        updated_at=loc.updated_at.isoformat(),
        metrics=metrics,
    )


@router.get("/{location_id}", response_model=LocationResponse)
def get_location_details(
    location_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Retrieve details and metrics for a specific business location."""
    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{location_id}' not found",
        )
    if not user_has_location_access(user, loc.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to view this location.",
        )

    metrics = get_location_metrics(loc.id, db)
    return LocationResponse(
        id=loc.id,
        tenant_id=loc.tenant_id,
        name=loc.name,
        code=loc.code,
        address_line1=loc.address_line1,
        address_line2=loc.address_line2,
        city=loc.city,
        state=loc.state,
        postal_code=loc.postal_code,
        country=loc.country,
        phone=loc.phone,
        email=loc.email,
        timezone=loc.timezone,
        hours=loc.hours,
        service_territory_zips=loc.service_territory_zips,
        transfer_number=loc.transfer_number,
        emergency_phone=loc.emergency_phone,
        calendar_provider=loc.calendar_provider,
        calendar_id=loc.calendar_id,
        is_primary=loc.is_primary,
        is_active=loc.is_active,
        notes=loc.notes,
        created_at=loc.created_at.isoformat(),
        updated_at=loc.updated_at.isoformat(),
        metrics=metrics,
    )


@router.put("/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: str,
    req: LocationCreateUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Update location profile, working hours, and service territories."""
    if user.role not in ("platform_admin", "tenant_owner", "tenant_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owners and managers can update business locations.",
        )

    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{location_id}' not found",
        )

    # Demote others if this one is made primary
    if req.is_primary and not loc.is_primary:
        db.query(Location).where(Location.tenant_id == tenant.id).update({"is_primary": False})

    loc.name = req.name.strip()
    loc.code = req.code.strip().upper()
    loc.address_line1 = req.address_line1.strip()
    loc.address_line2 = req.address_line2.strip()
    loc.city = req.city.strip()
    loc.state = req.state.strip()
    loc.postal_code = req.postal_code.strip()
    loc.country = req.country.strip()
    loc.phone = req.phone.strip()
    loc.email = req.email.strip()
    loc.timezone = req.timezone.strip()
    loc.hours = req.hours.strip()
    loc.service_territory_zips = [z.strip() for z in req.service_territory_zips if z.strip()]
    loc.transfer_number = req.transfer_number.strip()
    loc.emergency_phone = req.emergency_phone.strip()
    loc.calendar_provider = req.calendar_provider
    loc.calendar_id = req.calendar_id
    loc.is_primary = req.is_primary
    loc.is_active = req.is_active
    loc.notes = req.notes

    db.commit()
    db.refresh(loc)

    metrics = get_location_metrics(loc.id, db)
    return LocationResponse(
        id=loc.id,
        tenant_id=loc.tenant_id,
        name=loc.name,
        code=loc.code,
        address_line1=loc.address_line1,
        address_line2=loc.address_line2,
        city=loc.city,
        state=loc.state,
        postal_code=loc.postal_code,
        country=loc.country,
        phone=loc.phone,
        email=loc.email,
        timezone=loc.timezone,
        hours=loc.hours,
        service_territory_zips=loc.service_territory_zips,
        transfer_number=loc.transfer_number,
        emergency_phone=loc.emergency_phone,
        calendar_provider=loc.calendar_provider,
        calendar_id=loc.calendar_id,
        is_primary=loc.is_primary,
        is_active=loc.is_active,
        notes=loc.notes,
        created_at=loc.created_at.isoformat(),
        updated_at=loc.updated_at.isoformat(),
        metrics=metrics,
    )


@router.delete("/{location_id}")
def delete_location(
    location_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete or archive a business location."""
    if user.role not in ("platform_admin", "tenant_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owners can delete business locations.",
        )

    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{location_id}' not found",
        )

    # Detach linked resources before deletion
    db.query(PhoneNumber).where(PhoneNumber.location_id == loc.id).update({"location_id": None})

    db.delete(loc)
    db.commit()
    return {"success": True, "message": f"Location '{loc.name}' deleted successfully."}


@router.post("/resolve", response_model=dict[str, Any])
def resolve_incoming_location(
    req: ResolveLocationRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Resolve which branch location should handle an incoming caller or appointment request."""
    loc = resolve_location_for_caller(
        tenant_id=tenant.id,
        db=db,
        dialed_number=req.dialed_number,
        postal_code=req.postal_code,
        spoken_city=req.spoken_city,
    )
    if not loc:
        return {
            "resolved": False,
            "message": "No active location found for this tenant; fallback to primary tenant settings.",
            "location": None,
        }

    return {
        "resolved": True,
        "location": {
            "id": loc.id,
            "name": loc.name,
            "code": loc.code,
            "city": loc.city,
            "state": loc.state,
            "postal_code": loc.postal_code,
            "timezone": loc.timezone,
            "hours": loc.hours,
            "phone": loc.phone,
            "transfer_number": loc.transfer_number,
            "emergency_phone": loc.emergency_phone,
            "is_primary": loc.is_primary,
        },
    }
