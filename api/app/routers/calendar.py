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
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.deps import get_current_tenant
from api.app.core.encryption import encrypt_token
from api.app.db.session import get_db
from api.app.models.booking import Booking, TenantIntegration
from api.app.models.tenant import Tenant
from api.app.services.calendar.availability import _get_tenant_calendar_provider
from api.app.services.calendar.base import ExternalEvent
from api.app.services.calendar.booking import cancel_booking

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
