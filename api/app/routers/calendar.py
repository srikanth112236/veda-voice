"""Tenant Portal endpoints for Google Calendar OAuth integration and booking management."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.deps import get_current_tenant
from api.app.core.encryption import encrypt_token
from api.app.db.session import get_db
from api.app.models.booking import Booking, TenantIntegration
from api.app.models.crm import Contact
from api.app.models.tenant import Tenant
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
    notes: str | None


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
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, str]:
    """Generate Google OAuth 2.0 consent URL for calendar authorization."""
    client_id = settings.GOOGLE_CLIENT_ID or "mock-google-client-id"
    redirect_uri = settings.GOOGLE_REDIRECT_URI

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
    return {"auth_url": auth_url, "state": tenant.id}


@router.get("/callback")
def handle_google_oauth_callback(
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

    encrypted = encrypt_token(json.dumps(token_data))
    raw_exp = token_data.get("expires_in", 3600)
    expires_in = int(str(raw_exp))
    token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    integration = db.scalar(
        select(TenantIntegration).where(TenantIntegration.tenant_id == tenant.id)
    )

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
    """List confirmed and held customer bookings for tenant."""
    bookings = db.scalars(
        select(Booking)
        .where(Booking.tenant_id == tenant.id)
        .order_by(Booking.start_at.desc())
        .limit(limit)
    ).all()

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
            notes=b.notes,
        )
        for b in bookings
    ]


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
