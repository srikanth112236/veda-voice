"""API Router for Multi-Location Tenant Architecture (Milestone M11, FR-LOC-1 to 6)."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.app.core.deps import get_current_tenant, get_current_user
from api.app.db.session import get_db
from api.app.models.location import Location, UnservedTerritoryLog
from api.app.models.staff import StaffMember
from api.app.models.subscription import Subscription
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.calendar.availability import (
    AvailableSlotsResponse,
    compute_available_slots,
)
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
    service_neighborhoods: list[str] = Field(default_factory=list)
    service_cities: list[str] = Field(default_factory=list)
    allows_out_of_area_dispatch: bool = True
    extended_dispatch_surcharge: str = ""
    parking_directions: str = ""
    diagnostic_fee: str = ""
    regional_license_number: str = ""
    faq_overrides: list[dict[str, str]] = Field(default_factory=list)
    custom_policies: dict[str, Any] = Field(default_factory=dict)
    greeting_override: str = ""
    custom_instructions_override: str = ""
    pricing_mode_override: str = ""
    services_override: list[str] = Field(default_factory=list)
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
    service_neighborhoods: list[str] = Field(default_factory=list)
    service_cities: list[str] = Field(default_factory=list)
    allows_out_of_area_dispatch: bool = True
    extended_dispatch_surcharge: str = ""
    parking_directions: str = ""
    diagnostic_fee: str = ""
    regional_license_number: str = ""
    faq_overrides: list[dict[str, str]] = Field(default_factory=list)
    custom_policies: dict[str, Any] = Field(default_factory=dict)
    greeting_override: str = ""
    custom_instructions_override: str = ""
    pricing_mode_override: str = ""
    services_override: list[str] = Field(default_factory=list)
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


class LocationOverridesResponse(BaseModel):
    location_id: str
    parking_directions: str
    diagnostic_fee: str
    regional_license_number: str
    faq_overrides: list[dict[str, str]]
    custom_policies: dict[str, Any]
    greeting_override: str = ""
    custom_instructions_override: str = ""
    pricing_mode_override: str = ""
    services_override: list[str] = Field(default_factory=list)


class LocationOverridesUpdateRequest(BaseModel):
    parking_directions: str | None = None
    diagnostic_fee: str | None = None
    regional_license_number: str | None = None
    faq_overrides: list[dict[str, str]] | None = None
    custom_policies: dict[str, Any] | None = None
    greeting_override: str | None = None
    custom_instructions_override: str | None = None
    pricing_mode_override: str | None = None
    services_override: list[str] | None = None


class LocationGeofenceResponse(BaseModel):
    location_id: str
    service_territory_zips: list[str]
    service_neighborhoods: list[str]
    service_cities: list[str]
    allows_out_of_area_dispatch: bool
    extended_dispatch_surcharge: str


class LocationGeofenceUpdateRequest(BaseModel):
    service_territory_zips: list[str] | None = None
    service_neighborhoods: list[str] | None = None
    service_cities: list[str] | None = None
    allows_out_of_area_dispatch: bool | None = None
    extended_dispatch_surcharge: str | None = None


class UnservedDemandItem(BaseModel):
    id: str
    caller_phone: str
    requested_location_raw: str
    postal_code: str
    notes: str | None = None
    created_at: str


class UnservedDemandResponse(BaseModel):
    total: int
    items: list[UnservedDemandItem]


class LocationStaffResponse(BaseModel):
    id: str
    tenant_id: str
    location_id: str | None
    name: str
    email: str
    phone: str
    role: str
    skills: list[str]
    service_territory_zips: list[str]
    calendar_provider: str
    calendar_id: str
    is_active: bool
    duty_status: str
    priority_weight: int
    last_assigned_at: str | None = None
    notes: str | None = None


class StaffStatusUpdateRequest(BaseModel):
    duty_status: str = Field(..., pattern="^(on_duty|busy|on_break|off_duty)$")


class LocationStaffCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    email: str = Field(..., min_length=5, max_length=255)
    phone: str = ""
    role: str = "technician"
    skills: list[str] = Field(default_factory=list)
    service_territory_zips: list[str] = Field(default_factory=list)
    calendar_provider: str = "internal"
    calendar_id: str = "primary"
    duty_status: str = "on_duty"
    priority_weight: int = 1
    notes: str | None = None


# --- Helpers ---


def _build_location_response(loc: Location, db: Session) -> LocationResponse:
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
        service_neighborhoods=getattr(loc, "service_neighborhoods", []) or [],
        service_cities=getattr(loc, "service_cities", []) or [],
        allows_out_of_area_dispatch=getattr(loc, "allows_out_of_area_dispatch", True),
        extended_dispatch_surcharge=getattr(loc, "extended_dispatch_surcharge", "") or "",
        parking_directions=getattr(loc, "parking_directions", "") or "",
        diagnostic_fee=getattr(loc, "diagnostic_fee", "") or "",
        regional_license_number=getattr(loc, "regional_license_number", "") or "",
        faq_overrides=getattr(loc, "faq_overrides", []) or [],
        custom_policies=getattr(loc, "custom_policies", {}) or {},
        greeting_override=getattr(loc, "greeting_override", "") or "",
        custom_instructions_override=getattr(loc, "custom_instructions_override", "") or "",
        pricing_mode_override=getattr(loc, "pricing_mode_override", "") or "",
        services_override=getattr(loc, "services_override", []) or [],
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
    return [_build_location_response(loc, db) for loc in accessible_locations]


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

    # Enforce Subscription Location Quotas
    sub = db.scalar(select(Subscription).where(Subscription.tenant_id == tenant.id))
    if sub and user.role != "platform_admin":
        current_loc_count = (
            db.scalar(select(func.count(Location.id)).where(Location.tenant_id == tenant.id)) or 0
        )
        if current_loc_count >= sub.max_locations:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Subscription tier '{sub.tier}' limit of {sub.max_locations} location(s) reached. Please upgrade your plan to add more branches.",
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
        service_neighborhoods=req.service_neighborhoods,
        service_cities=req.service_cities,
        allows_out_of_area_dispatch=req.allows_out_of_area_dispatch,
        extended_dispatch_surcharge=req.extended_dispatch_surcharge.strip(),
        parking_directions=req.parking_directions.strip(),
        diagnostic_fee=req.diagnostic_fee.strip(),
        regional_license_number=req.regional_license_number.strip(),
        faq_overrides=req.faq_overrides,
        custom_policies=req.custom_policies,
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

    return _build_location_response(loc, db)


@router.get("/unserved-demand", response_model=UnservedDemandResponse)
def get_unserved_demand(
    limit: int = Query(50, ge=1, le=200),
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UnservedDemandResponse:
    """Retrieve logged caller inquiries that fell outside all active service boundaries."""
    total = (
        db.scalar(
            select(func.count(UnservedTerritoryLog.id)).where(
                UnservedTerritoryLog.tenant_id == tenant.id
            )
        )
        or 0
    )

    logs = db.scalars(
        select(UnservedTerritoryLog)
        .where(UnservedTerritoryLog.tenant_id == tenant.id)
        .order_by(UnservedTerritoryLog.created_at.desc())
        .limit(limit)
    ).all()

    items = [
        UnservedDemandItem(
            id=log_entry.id,
            caller_phone=log_entry.caller_phone,
            requested_location_raw=log_entry.requested_location_raw,
            postal_code=log_entry.postal_code,
            notes=log_entry.notes,
            created_at=log_entry.created_at.isoformat(),
        )
        for log_entry in logs
    ]
    return UnservedDemandResponse(total=total, items=items)


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

    return _build_location_response(loc, db)


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
    loc.service_neighborhoods = req.service_neighborhoods
    loc.service_cities = req.service_cities
    loc.allows_out_of_area_dispatch = req.allows_out_of_area_dispatch
    loc.extended_dispatch_surcharge = req.extended_dispatch_surcharge.strip()
    loc.parking_directions = req.parking_directions.strip()
    loc.diagnostic_fee = req.diagnostic_fee.strip()
    loc.regional_license_number = req.regional_license_number.strip()
    loc.faq_overrides = req.faq_overrides
    loc.custom_policies = req.custom_policies
    loc.transfer_number = req.transfer_number.strip()
    loc.emergency_phone = req.emergency_phone.strip()
    loc.calendar_provider = req.calendar_provider
    loc.calendar_id = req.calendar_id
    loc.is_primary = req.is_primary
    loc.is_active = req.is_active
    loc.notes = req.notes

    db.commit()
    db.refresh(loc)

    return _build_location_response(loc, db)


@router.get("/{location_id}/overrides", response_model=LocationOverridesResponse)
def get_location_overrides(
    location_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationOverridesResponse:
    """Get hyper-local knowledge, parking, fees, license, and branch FAQ overrides."""
    if not user_has_location_access(user, location_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this location.",
        )
    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return LocationOverridesResponse(
        location_id=loc.id,
        parking_directions=loc.parking_directions or "",
        diagnostic_fee=loc.diagnostic_fee or "",
        regional_license_number=loc.regional_license_number or "",
        faq_overrides=loc.faq_overrides or [],
        custom_policies=loc.custom_policies or {},
        greeting_override=getattr(loc, "greeting_override", "") or "",
        custom_instructions_override=getattr(loc, "custom_instructions_override", "") or "",
        pricing_mode_override=getattr(loc, "pricing_mode_override", "") or "",
        services_override=getattr(loc, "services_override", []) or [],
    )


@router.patch("/{location_id}/overrides", response_model=LocationOverridesResponse)
def update_location_overrides(
    location_id: str,
    req: LocationOverridesUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationOverridesResponse:
    """Update hyper-local knowledge, parking, fees, license, and branch FAQ overrides."""
    if not user_has_location_access(user, location_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have administrative access to this location.",
        )
    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    if req.parking_directions is not None:
        loc.parking_directions = req.parking_directions.strip()
    if req.diagnostic_fee is not None:
        loc.diagnostic_fee = req.diagnostic_fee.strip()
    if req.regional_license_number is not None:
        loc.regional_license_number = req.regional_license_number.strip()
    if req.faq_overrides is not None:
        loc.faq_overrides = req.faq_overrides
    if req.custom_policies is not None:
        loc.custom_policies = req.custom_policies
    if req.greeting_override is not None:
        loc.greeting_override = req.greeting_override.strip()
    if req.custom_instructions_override is not None:
        loc.custom_instructions_override = req.custom_instructions_override.strip()
    if req.pricing_mode_override is not None:
        loc.pricing_mode_override = req.pricing_mode_override.strip()
    if req.services_override is not None:
        loc.services_override = [s.strip() for s in req.services_override if s and s.strip()]

    db.commit()
    db.refresh(loc)
    return LocationOverridesResponse(
        location_id=loc.id,
        parking_directions=loc.parking_directions or "",
        diagnostic_fee=loc.diagnostic_fee or "",
        regional_license_number=loc.regional_license_number or "",
        faq_overrides=loc.faq_overrides or [],
        custom_policies=loc.custom_policies or {},
        greeting_override=getattr(loc, "greeting_override", "") or "",
        custom_instructions_override=getattr(loc, "custom_instructions_override", "") or "",
        pricing_mode_override=getattr(loc, "pricing_mode_override", "") or "",
        services_override=getattr(loc, "services_override", []) or [],
    )


@router.get("/{location_id}/geofence", response_model=LocationGeofenceResponse)
def get_location_geofence(
    location_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationGeofenceResponse:
    """Get smart geofencing territories, neighborhoods, cities, and out-of-area settings."""
    if not user_has_location_access(user, location_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this location.",
        )
    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return LocationGeofenceResponse(
        location_id=loc.id,
        service_territory_zips=loc.service_territory_zips or [],
        service_neighborhoods=loc.service_neighborhoods or [],
        service_cities=loc.service_cities or [],
        allows_out_of_area_dispatch=loc.allows_out_of_area_dispatch,
        extended_dispatch_surcharge=loc.extended_dispatch_surcharge or "",
    )


@router.patch("/{location_id}/geofence", response_model=LocationGeofenceResponse)
def update_location_geofence(
    location_id: str,
    req: LocationGeofenceUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationGeofenceResponse:
    """Update smart geofencing territories, neighborhoods, cities, and out-of-area settings."""
    if not user_has_location_access(user, location_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have administrative access to this location.",
        )
    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    if req.service_territory_zips is not None:
        loc.service_territory_zips = [z.strip() for z in req.service_territory_zips if z.strip()]
    if req.service_neighborhoods is not None:
        loc.service_neighborhoods = [n.strip() for n in req.service_neighborhoods if n.strip()]
    if req.service_cities is not None:
        loc.service_cities = [c.strip() for c in req.service_cities if c.strip()]
    if req.allows_out_of_area_dispatch is not None:
        loc.allows_out_of_area_dispatch = req.allows_out_of_area_dispatch
    if req.extended_dispatch_surcharge is not None:
        loc.extended_dispatch_surcharge = req.extended_dispatch_surcharge.strip()

    db.commit()
    db.refresh(loc)
    return LocationGeofenceResponse(
        location_id=loc.id,
        service_territory_zips=loc.service_territory_zips or [],
        service_neighborhoods=loc.service_neighborhoods or [],
        service_cities=loc.service_cities or [],
        allows_out_of_area_dispatch=loc.allows_out_of_area_dispatch,
        extended_dispatch_surcharge=loc.extended_dispatch_surcharge or "",
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


@router.get("/{location_id}/staff", response_model=list[LocationStaffResponse])
def list_location_staff(
    location_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[LocationStaffResponse]:
    """List all technicians and staff members assigned to this branch location."""
    if not user_has_location_access(user, location_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have administrative access to this branch location.",
        )

    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    staff_members = db.scalars(
        select(StaffMember)
        .where(
            StaffMember.tenant_id == tenant.id,
            StaffMember.location_id == location_id,
        )
        .order_by(StaffMember.name)
    ).all()

    return [
        LocationStaffResponse(
            id=s.id,
            tenant_id=s.tenant_id,
            location_id=s.location_id,
            name=s.name,
            email=s.email,
            phone=s.phone,
            role=s.role,
            skills=s.skills or [],
            service_territory_zips=s.service_territory_zips or [],
            calendar_provider=s.calendar_provider,
            calendar_id=s.calendar_id,
            is_active=s.is_active,
            duty_status=s.duty_status,
            priority_weight=s.priority_weight,
            last_assigned_at=s.last_assigned_at.isoformat() if s.last_assigned_at else None,
            notes=s.notes,
        )
        for s in staff_members
    ]


@router.post(
    "/{location_id}/staff",
    response_model=LocationStaffResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_location_staff(
    location_id: str,
    req: LocationStaffCreateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LocationStaffResponse:
    """Create a new staff technician assigned directly to this branch location."""
    if user.role not in ("platform_admin", "tenant_owner", "tenant_manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owners and managers can add staff members.",
        )

    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    staff = StaffMember(
        tenant_id=tenant.id,
        location_id=location_id,
        name=req.name.strip(),
        email=req.email.strip().lower(),
        phone=req.phone.strip(),
        role=req.role.strip(),
        skills=req.skills,
        service_territory_zips=req.service_territory_zips or loc.service_territory_zips,
        calendar_provider=req.calendar_provider,
        calendar_id=req.calendar_id,
        duty_status=req.duty_status,
        priority_weight=req.priority_weight,
        notes=req.notes,
        is_active=True,
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)

    return LocationStaffResponse(
        id=staff.id,
        tenant_id=staff.tenant_id,
        location_id=staff.location_id,
        name=staff.name,
        email=staff.email,
        phone=staff.phone,
        role=staff.role,
        skills=staff.skills or [],
        service_territory_zips=staff.service_territory_zips or [],
        calendar_provider=staff.calendar_provider,
        calendar_id=staff.calendar_id,
        is_active=staff.is_active,
        duty_status=staff.duty_status,
        priority_weight=staff.priority_weight,
        last_assigned_at=staff.last_assigned_at.isoformat() if staff.last_assigned_at else None,
        notes=staff.notes,
    )


@router.patch("/{location_id}/staff/{staff_id}/status")
def update_staff_duty_status(
    location_id: str,
    staff_id: str,
    req: StaffStatusUpdateRequest,
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Toggle or update real-time duty status of a technician at this location."""
    staff = db.scalar(
        select(StaffMember).where(
            StaffMember.id == staff_id,
            StaffMember.tenant_id == tenant.id,
            StaffMember.location_id == location_id,
        )
    )
    if not staff:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Staff member '{staff_id}' not found at this location",
        )

    staff.duty_status = req.duty_status
    db.commit()
    return {
        "success": True,
        "staff_id": staff.id,
        "name": staff.name,
        "location_id": location_id,
        "duty_status": staff.duty_status,
    }


@router.get("/{location_id}/availability", response_model=AvailableSlotsResponse)
def get_location_availability(
    location_id: str,
    target_date: str = Query(..., description="Target date in YYYY-MM-DD format"),
    service_type: str | None = Query(None, description="Requested service type"),
    duration_minutes: int = Query(60, ge=15, le=240),
    tenant: Tenant = Depends(get_current_tenant),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AvailableSlotsResponse:
    """Inspect real-time bookable slots specifically for this branch location and its on-duty staff."""
    if not user_has_location_access(user, location_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have administrative access to this branch location.",
        )

    loc = db.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant.id)
    )
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    try:
        t_date = datetime.strptime(target_date.strip(), "%Y-%m-%d").date()
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid target_date format. Expected YYYY-MM-DD",
        ) from err

    return compute_available_slots(
        tenant=tenant,
        target_date=t_date,
        db=db,
        service_duration_minutes=duration_minutes,
        service_type=service_type,
        location_id=location_id,
    )
