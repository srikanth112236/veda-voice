"""Tenant Portal endpoints for Google Calendar OAuth integration and booking management."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.deps import get_current_tenant
from api.app.core.encryption import decrypt_token, encrypt_token
from api.app.db.session import get_db
from api.app.models.booking import Booking, TenantIntegration
from api.app.models.crm import Contact
from api.app.models.tenant import AgentProfile, Tenant
from api.app.services.calendar.availability import _get_tenant_calendar_provider
from api.app.services.calendar.base import ExternalEvent
from api.app.services.calendar.booking import cancel_booking
from api.app.services.notifier import TelnyxSmsDispatcher, dispatch_booking_notifications

logger = logging.getLogger("vedavoice.portal.calendar")

router = APIRouter(prefix="/portal/calendar", tags=["calendar"])


class CalendarStatusResponse(BaseModel):
    is_connected: bool
    provider: str
    status: str
    calendar_id: str
    token_expires_at: datetime | None = None


class BookingItemResponse(BaseModel):
    id: str
    customer_name: str
    customer_phone: str
    customer_email: str | None
    service_type: str
    start_at: datetime
    end_at: datetime
    status: str
    meet_link: str | None
    calendar_event_id: str | None = None
    staff_id: str | None = None
    call_id: str | None = None
    contact_id: str | None = None
    notes: str | None
    is_arrival_window: bool = False
    arrival_window_start: datetime | None = None
    arrival_window_end: datetime | None = None
    timezone: str = "America/New_York"


class CreateManualBookingRequest(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    service_type: str = "General Appointment"
    start_at: datetime
    end_at: datetime | None = None
    notes: str | None = None
    staff_id: str | None = None
    is_arrival_window: bool = False
    arrival_window_start: datetime | None = None
    arrival_window_end: datetime | None = None
    bypass_buffer: bool = False


class CalendarSettingsResponse(BaseModel):
    scheduling_mode: str  # exact_time | arrival_window
    arrival_window_hours: int  # 2 | 4
    calendar_buffer_minutes: int  # 15 | 20 | 30 | 45
    calendar_buffer_mode: str  # after | both
    calendar_buffer_reason: str
    timezone: str = "America/New_York"


class UpdateCalendarSettingsRequest(BaseModel):
    scheduling_mode: str | None = None
    arrival_window_hours: int | None = None
    calendar_buffer_minutes: int | None = None
    calendar_buffer_mode: str | None = None
    calendar_buffer_reason: str | None = None


class SyncTestResponse(BaseModel):
    success: bool
    status: str
    calendar_id: str
    provider: str
    busy_blocks_found: int
    meet_link_generated: str | None
    message: str


@router.get("/status", response_model=CalendarStatusResponse)
def get_calendar_status(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve Google Calendar integration status for the authenticated tenant."""
    integration = db.scalar(
        select(TenantIntegration).where(TenantIntegration.tenant_id == tenant.id)
    )

    if not integration or integration.status != "connected":
        return CalendarStatusResponse(
            is_connected=False,
            provider="none",
            status="disconnected",
            calendar_id="none",
            token_expires_at=None,
        )

    return CalendarStatusResponse(
        is_connected=True,
        provider=integration.provider,
        status=integration.status,
        calendar_id=integration.calendar_id,
        token_expires_at=integration.token_expires_at,
    )


@router.get("/connect")
def initiate_google_oauth(
    request: Request,
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Generate Google OAuth 2.0 consent URL for calendar authorization."""
    is_configured = bool(
        settings.GOOGLE_CLIENT_ID
        and not settings.GOOGLE_CLIENT_ID.startswith("mock")
        and settings.GOOGLE_CLIENT_SECRET
        and not settings.GOOGLE_CLIENT_SECRET.startswith("mock")
    )
    client_id = settings.GOOGLE_CLIENT_ID if is_configured else "mock-google-client-id"
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    host = request.headers.get("host", "")
    if "localhost" in host or "127.0.0.1" in host:
        redirect_uri = f"{str(request.base_url).rstrip('/')}/api/v1/portal/calendar/callback"

    scopes = [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.freebusy",
    ]

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "state": tenant.id,
    }

    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    sandbox_connect_url = (
        f"/api/v1/portal/calendar/callback?code=mock_sandbox_code&state={tenant.id}"
    )

    return {
        "auth_url": auth_url,
        "state": tenant.id,
        "is_configured": is_configured,
        "sandbox_connect_url": sandbox_connect_url,
        "redirect_uri": redirect_uri,
        "message": (
            "Google Calendar OAuth is configured and ready."
            if is_configured
            else "Google OAuth client ID is not configured. Connect Instant Sandbox Calendar or configure GOOGLE_CLIENT_ID in Azure/env."
        ),
    }


@router.post("/connect-sandbox")
def connect_sandbox_calendar(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Instant 1-click connection of simulated calendar for development and end-to-end voice booking tests."""
    token_data = {
        "refresh_token": f"mock_refresh_sandbox_{tenant.id}",
        "access_token": f"mock_access_sandbox_{tenant.id}",
        "expires_in": 3600,
    }
    encrypted = encrypt_token(json.dumps(token_data))
    token_expires_at = datetime.now(UTC) + timedelta(seconds=3600)

    integration = db.scalar(
        select(TenantIntegration).where(TenantIntegration.tenant_id == tenant.id)
    )

    if integration:
        integration.provider = "google_calendar"
        integration.status = "connected"
        integration.calendar_id = "primary (Sandbox)"
        integration.encrypted_tokens = encrypted
        integration.token_expires_at = token_expires_at
        integration.updated_at = datetime.now(UTC)
    else:
        integration = TenantIntegration(
            tenant_id=tenant.id,
            provider="google_calendar",
            status="connected",
            calendar_id="primary (Sandbox)",
            encrypted_tokens=encrypted,
            token_expires_at=token_expires_at,
        )
        db.add(integration)

    db.commit()
    return {
        "status": "connected",
        "tenant_id": tenant.id,
        "provider": "google_calendar",
        "calendar_id": "primary (Sandbox)",
    }


@router.get("/callback")
def handle_google_oauth_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    """Exchange authorization code for refresh tokens and save with envelope encryption."""
    tenant_id = state
    tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant specified in OAuth state not found",
        )

    # In local testing without Google credentials, allow mock code
    if code.startswith("mock_"):
        token_data = {
            "refresh_token": f"mock_refresh_{code}",
            "access_token": f"mock_access_{code}",
            "expires_in": 3600,
        }
    else:
        # Live Google token exchange
        token_url = "https://oauth2.googleapis.com/token"
        data = urllib.parse.urlencode(
            {
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                token_data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            logger.error("OAuth token exchange failed: %s", e.read().decode("utf-8", "replace"))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange authorization code with Google",
            ) from e
        except Exception as e:
            logger.error("OAuth exchange network error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Network error during Google OAuth exchange",
            ) from e

    integration = db.scalar(
        select(TenantIntegration).where(TenantIntegration.tenant_id == tenant.id)
    )

    # Preserve existing refresh_token if Google omits it on re-authorization
    if not token_data.get("refresh_token") and integration and integration.encrypted_tokens:
        try:
            prev = json.loads(decrypt_token(integration.encrypted_tokens) or "{}")
            if prev.get("refresh_token"):
                token_data["refresh_token"] = prev["refresh_token"]
        except Exception:
            pass

    encrypted = encrypt_token(json.dumps(token_data))
    raw_exp = token_data.get("expires_in", 3600)
    expires_in = int(str(raw_exp))
    token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    if integration:
        integration.provider = "google_calendar"
        integration.status = "connected"
        integration.calendar_id = "primary"
        integration.encrypted_tokens = encrypted
        integration.token_expires_at = token_expires_at
        integration.updated_at = datetime.now(UTC)
    else:
        integration = TenantIntegration(
            tenant_id=tenant.id,
            provider="google_calendar",
            status="connected",
            calendar_id="primary",
            encrypted_tokens=encrypted,
            token_expires_at=token_expires_at,
        )
        db.add(integration)

    db.commit()

    if request and "text/html" in request.headers.get("accept", ""):
        # Browser was redirected here directly from Google OAuth consent flow
        host = request.headers.get("host", "")
        dashboard_url = (
            "http://localhost:3000"
            if ("localhost" in host or "127.0.0.1" in host)
            else settings.DASHBOARD_URL.rstrip("/")
        )
        return RedirectResponse(url=f"{dashboard_url}/portal/integrations?calendar_connected=true")

    return {"status": "connected", "tenant_id": tenant.id, "provider": "google_calendar"}


@router.post("/disconnect")
def disconnect_calendar(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Revoke and delete calendar integration for tenant."""
    integration = db.scalar(
        select(TenantIntegration).where(TenantIntegration.tenant_id == tenant.id)
    )
    if integration:
        integration.status = "disconnected"
        integration.encrypted_tokens = ""
        db.commit()

    return {"status": "disconnected", "tenant_id": tenant.id}


@router.get("/bookings", response_model=list[BookingItemResponse])
def list_bookings(
    limit: int = 50,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """List confirmed and held customer bookings for tenant with CRM and Call Explorer cross-links."""
    bookings = db.scalars(
        select(Booking)
        .where(Booking.tenant_id == tenant.id)
        .order_by(Booking.start_at.desc())
        .limit(limit)
    ).all()

    # Batch resolve contact_ids by phone to avoid N+1 queries
    phones = {b.customer_phone for b in bookings if b.customer_phone}
    contact_map: dict[str, str] = {}
    if phones:
        contacts = db.execute(
            select(Contact.phone, Contact.id).where(
                Contact.tenant_id == tenant.id,
                Contact.phone.in_(phones),
            )
        ).all()
        contact_map = {row[0]: row[1] for row in contacts}

    return [
        BookingItemResponse(
            id=b.id,
            customer_name=b.customer_name,
            customer_phone=b.customer_phone,
            customer_email=b.customer_email,
            service_type=b.service_type,
            start_at=b.start_at,
            end_at=b.end_at,
            status=b.status,
            meet_link=b.meet_link,
            calendar_event_id=b.calendar_event_id,
            staff_id=b.staff_id,
            call_id=b.call_id,
            contact_id=contact_map.get(b.customer_phone),
            notes=b.notes,
            is_arrival_window=getattr(b, "is_arrival_window", False) or False,
            arrival_window_start=getattr(b, "arrival_window_start", None),
            arrival_window_end=getattr(b, "arrival_window_end", None),
            timezone=tenant.timezone or "America/New_York",
        )
        for b in bookings
    ]


@router.get("/settings", response_model=CalendarSettingsResponse)
def get_calendar_settings(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> CalendarSettingsResponse:
    """Retrieve active calendar scheduling mode and buffer time protection settings."""
    profile = db.scalar(select(AgentProfile).where(AgentProfile.tenant_id == tenant.id))
    return CalendarSettingsResponse(
        scheduling_mode=getattr(profile, "scheduling_mode", "exact_time") or "exact_time",
        arrival_window_hours=getattr(profile, "arrival_window_hours", 2) or 2,
        calendar_buffer_minutes=getattr(profile, "calendar_buffer_minutes", 15) or 15,
        calendar_buffer_mode=getattr(profile, "calendar_buffer_mode", "after") or "after",
        calendar_buffer_reason=getattr(profile, "calendar_buffer_reason", "travel_and_reset")
        or "travel_and_reset",
        timezone=tenant.timezone or "America/New_York",
    )


@router.patch("/settings", response_model=CalendarSettingsResponse)
def update_calendar_settings(
    req: UpdateCalendarSettingsRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> CalendarSettingsResponse:
    """Update calendar scheduling preferences including arrival window duration and travel/reset buffer protection."""
    profile = db.scalar(select(AgentProfile).where(AgentProfile.tenant_id == tenant.id))
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent profile not found")

    if req.scheduling_mode is not None:
        if req.scheduling_mode not in ("exact_time", "arrival_window"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="scheduling_mode must be 'exact_time' or 'arrival_window'",
            )
        profile.scheduling_mode = req.scheduling_mode

    if req.arrival_window_hours is not None:
        if req.arrival_window_hours not in (2, 4):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="arrival_window_hours must be 2 or 4",
            )
        profile.arrival_window_hours = req.arrival_window_hours

    if req.calendar_buffer_minutes is not None:
        if req.calendar_buffer_minutes not in (15, 20, 30, 45):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="calendar_buffer_minutes must be 15, 20, 30, or 45",
            )
        profile.calendar_buffer_minutes = req.calendar_buffer_minutes

    if req.calendar_buffer_mode is not None:
        if req.calendar_buffer_mode not in ("after", "both"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="calendar_buffer_mode must be 'after' or 'both'",
            )
        profile.calendar_buffer_mode = req.calendar_buffer_mode

    if req.calendar_buffer_reason is not None:
        profile.calendar_buffer_reason = req.calendar_buffer_reason.strip()

    db.commit()
    db.refresh(profile)

    return CalendarSettingsResponse(
        scheduling_mode=profile.scheduling_mode,
        arrival_window_hours=profile.arrival_window_hours,
        calendar_buffer_minutes=profile.calendar_buffer_minutes,
        calendar_buffer_mode=profile.calendar_buffer_mode,
        calendar_buffer_reason=profile.calendar_buffer_reason,
        timezone=tenant.timezone or "America/New_York",
    )


@router.post("/bookings/manual", response_model=BookingItemResponse)
def create_manual_booking(
    req: CreateManualBookingRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Create a manual booking with buffer protection, conflict validation, Google Calendar sync, and CRM linkage."""
    start_at = req.start_at
    end_at = req.end_at or (start_at + timedelta(minutes=60))
    if end_at <= start_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time",
        )

    # 1. Direct Time Conflict Check
    overlap_q = select(Booking).where(
        Booking.tenant_id == tenant.id,
        Booking.status.in_(["confirmed", "held"]),
        Booking.start_at < end_at,
        Booking.end_at > start_at,
    )
    if req.staff_id:
        overlap_q = overlap_q.where(Booking.staff_id == req.staff_id)
    conflict = db.scalar(overlap_q)
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Time slot conflicts with an existing booking ({conflict.customer_name} from {conflict.start_at.strftime('%H:%M')} to {conflict.end_at.strftime('%H:%M')})",
        )

    # 2. Buffer Time Protection Check (unless explicitly bypassed)
    profile = db.scalar(select(AgentProfile).where(AgentProfile.tenant_id == tenant.id))
    buffer_mins = getattr(profile, "calendar_buffer_minutes", 15) or 15
    buf_mode = getattr(profile, "calendar_buffer_mode", "after") or "after"
    buf_delta = timedelta(minutes=buffer_mins)
    buf_before = buf_delta if buf_mode == "both" else timedelta(0)
    buf_after = buf_delta

    if not req.bypass_buffer and buffer_mins > 0:
        buffer_q = select(Booking).where(
            Booking.tenant_id == tenant.id,
            Booking.status.in_(["confirmed", "held"]),
            Booking.start_at < (end_at + buf_before),
            Booking.end_at > (start_at - buf_after),
        )
        if req.staff_id:
            buffer_q = buffer_q.where(Booking.staff_id == req.staff_id)
        buf_conflict = db.scalar(buffer_q)
        if buf_conflict:
            reason = (
                getattr(profile, "calendar_buffer_reason", "travel or room reset")
                or "travel or room reset"
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Time slot violates buffer time protection ({buffer_mins} min required for {reason}). Existing booking ({buf_conflict.customer_name}) is scheduled from {buf_conflict.start_at.strftime('%H:%M')} to {buf_conflict.end_at.strftime('%H:%M')}.",
            )

    meet_link: str | None = None
    cal_event_id: str | None = None

    # If Google Calendar is connected, sync event
    cal_provider, cal_id = _get_tenant_calendar_provider(tenant.id, db)
    if cal_provider and cal_id:
        try:
            window_info = (
                f"\nArrival Window: {req.arrival_window_start.strftime('%I:%M %p')} - {req.arrival_window_end.strftime('%I:%M %p')}"
                if req.is_arrival_window and req.arrival_window_start and req.arrival_window_end
                else ""
            )
            ext_ev = ExternalEvent(
                title=f"[{tenant.name}] {req.service_type} - {req.customer_name}",
                start=start_at,
                end=end_at,
                description=f"Service: {req.service_type}\nCustomer: {req.customer_name}\nPhone: {req.customer_phone}{window_info}\nNotes: {req.notes or 'Manual appointment'}",
            )
            created = cal_provider.create_event(cal_id, ext_ev)
            cal_event_id = created.id
            meet_link = created.meet_link
        except Exception as e:
            logger.warning("Could not sync manual booking to external calendar: %s", e)

    booking = Booking(
        tenant_id=tenant.id,
        customer_name=req.customer_name.strip(),
        customer_phone=req.customer_phone.strip(),
        customer_email=req.customer_email.strip() if req.customer_email else None,
        service_type=req.service_type,
        start_at=start_at,
        end_at=end_at,
        status="confirmed",
        meet_link=meet_link,
        calendar_event_id=cal_event_id,
        staff_id=req.staff_id,
        notes=req.notes,
        is_arrival_window=req.is_arrival_window,
        arrival_window_start=req.arrival_window_start,
        arrival_window_end=req.arrival_window_end,
    )
    db.add(booking)
    db.flush()

    # Link booking to CRM Contact
    from api.app.services.crm_ingest import link_booking_to_crm

    contact = link_booking_to_crm(
        db=db,
        tenant_id=tenant.id,
        booking=booking,
        customer_phone=booking.customer_phone,
        customer_name=booking.customer_name,
        customer_email=booking.customer_email,
        service_type=booking.service_type,
    )

    db.commit()
    db.refresh(booking)

    return BookingItemResponse(
        id=booking.id,
        customer_name=booking.customer_name,
        customer_phone=booking.customer_phone,
        customer_email=booking.customer_email,
        service_type=booking.service_type,
        start_at=booking.start_at,
        end_at=booking.end_at,
        status=booking.status,
        meet_link=booking.meet_link,
        calendar_event_id=booking.calendar_event_id,
        staff_id=booking.staff_id,
        call_id=booking.call_id,
        contact_id=contact.id if contact else None,
        notes=booking.notes,
        is_arrival_window=booking.is_arrival_window,
        arrival_window_start=booking.arrival_window_start,
        arrival_window_end=booking.arrival_window_end,
        timezone=tenant.timezone or "America/New_York",
    )


@router.post("/sync-test", response_model=SyncTestResponse)
def test_calendar_sync(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Execute a live two-way roundtrip test against the connected calendar provider."""
    cal_provider, calendar_id = _get_tenant_calendar_provider(tenant.id, db)
    if not cal_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No connected calendar provider configured for this tenant. Please connect Google Calendar first.",
        )

    try:
        diag = cal_provider.test_connection(calendar_id)
        now_utc = datetime.now(UTC)
        test_event = ExternalEvent(
            title=f"[VedaVoice Sync Test] {tenant.name}",
            start=now_utc + timedelta(days=14, hours=10),
            end=now_utc + timedelta(days=14, hours=11),
            description="Automated diagnostic test event verifying bidirectional sync and Google Meet injection.",
        )
        created = cal_provider.create_event(calendar_id, test_event)
        # Immediately clean up the test event
        if created.id:
            try:
                cal_provider.delete_event(calendar_id, created.id)
            except Exception:
                pass

        return SyncTestResponse(
            success=True,
            status="active_sync",
            calendar_id=calendar_id,
            provider=diag.get("provider", "google_calendar"),
            busy_blocks_found=diag.get("busy_blocks_found", 0),
            meet_link_generated=created.meet_link,
            message="Two-way Google Calendar synchronization and Google Meet link generation verified successfully.",
        )
    except Exception as e:
        logger.error("Calendar sync test failed for tenant %s: %s", tenant.id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Calendar sync test failed: {e}",
        ) from e


@router.post("/bookings/{booking_id}/cancel")
def cancel_tenant_booking(
    booking_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Cancel a booking and remove the associated event from Google Calendar."""
    try:
        booking = cancel_booking(booking_id, tenant.id, db=db)
        return {
            "success": True,
            "booking_id": booking.id,
            "status": booking.status,
            "calendar_event_deleted": bool(booking.calendar_event_id),
        }
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post("/webhook")
def handle_google_calendar_push_webhook(
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Receive Google Calendar push notifications (X-Goog-Resource-State)."""
    logger.info("Google Calendar webhook push notification received.")
    return {"status": "received"}


class CalendlyConfigRequest(BaseModel):
    calendly_url: str
    webhook_secret: str | None = None


class CalendlyConfigResponse(BaseModel):
    is_configured: bool
    calendly_url: str | None
    webhook_endpoint: str


class CalendlyTestSMSRequest(BaseModel):
    phone_number: str
    customer_name: str = "Valued Customer"


@router.get("/calendly", response_model=CalendlyConfigResponse)
def get_calendly_config(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve tenant's configured Calendly link and webhook status."""
    integration = db.scalar(
        select(TenantIntegration).where(
            TenantIntegration.tenant_id == tenant.id,
            TenantIntegration.provider == "calendly",
        )
    )
    url = integration.calendar_id if integration and integration.calendar_id != "primary" else None
    return CalendlyConfigResponse(
        is_configured=bool(url),
        calendly_url=url,
        webhook_endpoint="/api/v1/portal/calendar/calendly/webhook",
    )


@router.post("/calendly", response_model=CalendlyConfigResponse)
def update_calendly_config(
    payload: CalendlyConfigRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Save or update tenant's Calendly scheduling link."""
    integration = db.scalar(
        select(TenantIntegration).where(
            TenantIntegration.tenant_id == tenant.id,
            TenantIntegration.provider == "calendly",
        )
    )
    clean_url = payload.calendly_url.strip()
    if integration:
        integration.calendar_id = clean_url
        integration.status = "connected"
        integration.updated_at = datetime.now(UTC)
    else:
        integration = TenantIntegration(
            tenant_id=tenant.id,
            provider="calendly",
            status="connected",
            calendar_id=clean_url,
            encrypted_tokens="",
        )
        db.add(integration)

    db.commit()
    return CalendlyConfigResponse(
        is_configured=True,
        calendly_url=clean_url,
        webhook_endpoint="/api/v1/portal/calendar/calendly/webhook",
    )


@router.post("/calendly/test-sms")
def send_calendly_test_sms(
    payload: CalendlyTestSMSRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Test in-call SMS booking link dispatch from portal."""
    integration = db.scalar(
        select(TenantIntegration).where(
            TenantIntegration.tenant_id == tenant.id,
            TenantIntegration.provider == "calendly",
        )
    )
    if integration and integration.calendar_id and integration.calendar_id != "primary":
        booking_url = integration.calendar_id
    else:
        tenant_slug = tenant.name.lower().replace(" ", "-").replace("&", "and")
        booking_url = f"https://calendly.com/{tenant_slug}/service-visit"

    clean_name = payload.customer_name.strip() or "Valued Customer"
    msg_text = (
        f"Hi {clean_name}! Here is your direct link to schedule service with {tenant.name}: {booking_url}\n\n"
        f"Reply STOP to opt out."
    )

    sms_worker = TelnyxSmsDispatcher()
    delivered = sms_worker.send(payload.phone_number, msg_text)

    return {
        "success": delivered,
        "phone_number": payload.phone_number,
        "booking_url": booking_url,
        "message": f"Test SMS dispatched to {payload.phone_number}",
    }


@router.post("/calendly/webhook")
def handle_calendly_inbound_webhook(
    payload: dict[str, Any],
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Ingest Calendly webhook event (invitee.created / invitee.canceled) and sync to CRM and DB."""
    event_type = payload.get("event")
    event_payload = payload.get("payload", {})

    logger.info("Calendly webhook received: event=%s", event_type)

    if event_type == "invitee.created":
        name = event_payload.get("name") or "Calendly Invitee"
        email = event_payload.get("email")
        phone = (
            event_payload.get("text_reminder_number")
            or event_payload.get("phone")
            or "+15125550199"
        )
        scheduled_event = event_payload.get("scheduled_event", {})
        start_str = scheduled_event.get("start_time")
        end_str = scheduled_event.get("end_time")
        event_name = scheduled_event.get("name") or "Service Appointment"
        event_uri = scheduled_event.get("uri")

        start_dt = (
            datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            if start_str
            else datetime.now(UTC) + timedelta(days=1)
        )
        end_dt = (
            datetime.fromisoformat(end_str.replace("Z", "+00:00"))
            if end_str
            else start_dt + timedelta(hours=1)
        )

        # Resolve tenant:
        # 1. Direct tenant_id parameter or payload key
        # 2. Match existing CRM Contact by phone or email
        # 3. Match tenant with active Calendly integration
        # 4. Fallback to active tenant
        resolved_tenant_id = tenant_id or payload.get("tenant_id")
        tenant = None
        if resolved_tenant_id:
            tenant = db.scalar(select(Tenant).where(Tenant.id == resolved_tenant_id))

        if not tenant and (phone or email):
            matched_contact = db.scalar(
                select(Contact)
                .where(or_(Contact.phone == phone, Contact.email == email))
                .order_by(Contact.created_at.desc())
            )
            if matched_contact:
                tenant = db.scalar(select(Tenant).where(Tenant.id == matched_contact.tenant_id))

        if not tenant:
            tenant_integ = db.scalar(
                select(TenantIntegration).where(
                    TenantIntegration.provider == "calendly",
                    TenantIntegration.status == "connected",
                )
            )
            if tenant_integ:
                tenant = db.scalar(select(Tenant).where(Tenant.id == tenant_integ.tenant_id))

        if not tenant:
            tenant = db.scalar(
                select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
            )

        if not tenant:
            return {"status": "ignored", "reason": "no_active_tenant"}

        # 1. Register or update Booking in DB
        booking = Booking(
            tenant_id=tenant.id,
            customer_name=name,
            customer_phone=phone,
            customer_email=email,
            service_type=event_name.lower().replace(" ", "_"),
            start_at=start_dt,
            end_at=end_dt,
            status="confirmed",
            calendar_event_id=event_uri,
            notes=f"Booked via Calendly self-serve link: {event_name}",
        )
        db.add(booking)

        # 2. Synchronize to native CRM Contact (Stage: 'booked')
        existing_contact = db.scalar(
            select(Contact).where(Contact.tenant_id == tenant.id, Contact.phone == phone)
        )
        if existing_contact:
            existing_contact.stage = "booked"
            existing_contact.last_contact_at = datetime.now(UTC)
            tags = list(existing_contact.tags or [])
            if "calendly_booking" not in tags:
                tags.append("calendly_booking")
            existing_contact.tags = tags
        else:
            new_contact = Contact(
                tenant_id=tenant.id,
                name=name,
                phone=phone,
                email=email,
                source="calendly",
                stage="booked",
                tags=["calendly_booking", "self_serve"],
                notes=f"Booked appointment via Calendly: {event_name}",
            )
            db.add(new_contact)

        db.commit()
        db.refresh(booking)

        # 3. Trigger Phase 5 automated customer & technician notifications
        try:
            import threading

            threading.Thread(
                target=dispatch_booking_notifications,
                args=(booking.id, tenant.id),
                daemon=True,
            ).start()
        except Exception as e:
            logger.warning("Could not dispatch booking notifications for Calendly booking: %s", e)

        return {
            "status": "ingested",
            "booking_id": booking.id,
            "customer_name": name,
            "crm_updated": True,
        }

    elif event_type == "invitee.canceled":
        event_uri = event_payload.get("scheduled_event", {}).get("uri")
        if event_uri:
            b = db.scalar(select(Booking).where(Booking.calendar_event_id == event_uri))
            if b:
                b.status = "cancelled"
                db.commit()
                return {"status": "cancelled", "booking_id": b.id}

    return {"status": "received", "event": event_type}
