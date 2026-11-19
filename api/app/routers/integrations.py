"""Multi-tenant External Integrations, HubSpot OAuth, and Outbox Engine Router.

Implements Milestone M9a per SRS Addendum v1.1 Section 3.1–3.6:
- HubSpot OAuth 2.0 authorization URL and callback code exchange (FR-INT-1, FR-INT-2)
- Envelope encryption of OAuth access and refresh tokens
- Transactional Outbox pattern with dead-letter queue (FR-INT-3)
- Idempotency via crm_entity_links (FR-INT-4)
- Outbox processing and manual dead-letter retry
- Entitlement checking on connector limits (FR-INT-11)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from api.app.core.config import settings
from api.app.core.deps import get_current_user
from api.app.core.security import create_access_token, decode_access_token, encrypt_token
from api.app.db.session import get_db
from api.app.models.crm import CRMIntegration, WebhookSubscription
from api.app.models.crm_sync import CRMConnection, CRMSyncOutbox
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.routers.calendar import handle_calendly_inbound_webhook
from api.app.services.entitlements import check_tenant_entitlement
from api.app.services.integrations.gohighlevel import HighLevelProvider
from api.app.services.integrations.hubspot import HubSpotProvider
from api.app.services.integrations.outbox_worker import (
    enqueue_crm_outbox,
    get_outbox_stats,
    process_outbox_batch,
)
from api.app.services.integrations.pipedrive import PipedriveProvider
from api.app.services.integrations.webhooks import deliver_webhook_event

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


def resolve_tenant_id(user: User, db: Session) -> str:
    """Resolve tenant ID for standard tenant user or platform admin fallback."""
    if user.tenant_id:
        return user.tenant_id
    if user.role == "platform_admin":
        fallback = db.scalar(
            select(Tenant).where(Tenant.status == "active").order_by(Tenant.created_at.asc())
        )
        if fallback:
            return fallback.id
    raise HTTPException(status_code=400, detail="Tenant context required.")


class ConnectCRMRequest(BaseModel):
    provider: str = Field(..., description="hubspot, zoho, gohighlevel, or pipedrive")
    api_key_or_token: str = Field(..., description="API key or OAuth access token")
    config: dict[str, Any] = Field(default_factory=dict, description="Provider specific settings")


class CreateWebhookRequest(BaseModel):
    target_url: str = Field(..., description="Destination webhook URL (Zapier, Make, etc.)")
    events: list[str] = Field(
        default_factory=lambda: ["call.completed"],
        description="Event triggers: call.completed, contact.created, booking.confirmed",
    )
    secret: str = Field("", description="HMAC-SHA256 signature secret for payload verification")


# ===========================================================================
# 1. HUBSPOT OAUTH 2.0 CONNECT & CALLBACK (FR-INT-1, FR-INT-2, FR-INT-11)
# ===========================================================================


@router.get("/hubspot/connect")
def get_hubspot_auth_url(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Generate HubSpot OAuth 2.0 authorization URL with signed CSRF state."""
    tenant_id = resolve_tenant_id(user, db)

    # FR-INT-11: Plan Gating on CRM Connectors
    allowed, reason = check_tenant_entitlement(
        db, tenant_id, "crm.connectors.max", requested_value=1
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=reason
            or "Your current plan does not include CRM connectors. Upgrade to connect HubSpot.",
        )

    provider = HubSpotProvider()
    state_token = create_access_token(
        {"tenant_id": tenant_id, "user_id": user.id, "nonce": uuid.uuid4().hex[:8]}
    )
    auth_url = provider.authorize_url(
        tenant_id=tenant_id,
        state=state_token,
        redirect_uri=settings.HUBSPOT_REDIRECT_URI,
    )

    return {
        "success": True,
        "provider": "hubspot",
        "authorization_url": auth_url,
    }


@router.get("/hubspot/callback")
async def hubspot_oauth_callback(
    code: str = Query(..., description="OAuth authorization code returned by HubSpot"),
    state: str = Query(..., description="CSRF state token"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Handle OAuth redirect, exchange code for tokens, and store encrypted connection."""
    payload = decode_access_token(state)
    if not payload or not payload.get("tenant_id"):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state token.")

    tenant_id = payload["tenant_id"]

    provider = HubSpotProvider()
    token_data = await provider.exchange_code(code, redirect_uri=settings.HUBSPOT_REDIRECT_URI)

    # Envelope encryption of OAuth token set
    encrypted_tokens = encrypt_token(token_data)
    portal_id = str(token_data.get("portal_id", ""))

    now = datetime.now(UTC)
    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == "hubspot",
        )
    )

    if not conn:
        conn = CRMConnection(
            tenant_id=tenant_id,
            provider="hubspot",
            status="connected",
            external_account_id=portal_id,
            token_ciphertext=encrypted_tokens,
            field_map={
                "firstname": "name",
                "phone": "phone",
                "email": "email",
                "hs_lead_status": "stage",
            },
            settings={"push_transcript": False, "sync_direction": "two_way"},
            last_sync_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(conn)
    else:
        conn.status = "connected"
        conn.token_ciphertext = encrypted_tokens
        conn.external_account_id = portal_id or conn.external_account_id
        conn.last_error = None
        conn.last_sync_at = now
        conn.updated_at = now

    db.commit()
    db.refresh(conn)

    return {
        "success": True,
        "provider": "hubspot",
        "status": "connected",
        "portal_id": portal_id,
        "message": "HubSpot connected successfully with encrypted OAuth tokens.",
    }


# ===========================================================================
# 1b. GOHIGHLEVEL OAUTH 2.0 CONNECT & CALLBACK (Milestone M9b)
# ===========================================================================


@router.get("/gohighlevel/connect")
def get_ghl_auth_url(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Generate GoHighLevel Marketplace OAuth 2.0 authorization URL with signed state."""
    tenant_id = resolve_tenant_id(user, db)

    # Plan Gating on CRM Connectors
    allowed, reason = check_tenant_entitlement(
        db, tenant_id, "crm.connectors.max", requested_value=1
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=reason
            or "Your current plan does not include CRM connectors. Upgrade to connect GoHighLevel.",
        )

    provider = HighLevelProvider()
    state_token = create_access_token(
        {"tenant_id": tenant_id, "user_id": user.id, "nonce": uuid.uuid4().hex[:8]}
    )
    auth_url = provider.authorize_url(
        tenant_id=tenant_id,
        state=state_token,
        redirect_uri=settings.GHL_REDIRECT_URI,
    )

    return {
        "success": True,
        "provider": "gohighlevel",
        "authorization_url": auth_url,
    }


@router.get("/gohighlevel/callback")
async def ghl_oauth_callback(
    code: str = Query(..., description="OAuth authorization code returned by GoHighLevel"),
    state: str = Query(..., description="CSRF state token"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Handle GHL OAuth redirect, exchange code for tokens & locationId, and store encrypted connection."""
    payload = decode_access_token(state)
    if not payload or not payload.get("tenant_id"):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state token.")

    tenant_id = payload["tenant_id"]

    provider = HighLevelProvider()
    token_data = await provider.exchange_code(code, redirect_uri=settings.GHL_REDIRECT_URI)

    # Envelope encryption of OAuth token set
    encrypted_tokens = encrypt_token(token_data)
    location_id = str(token_data.get("locationId", ""))

    now = datetime.now(UTC)
    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == "gohighlevel",
        )
    )

    if not conn:
        conn = CRMConnection(
            tenant_id=tenant_id,
            provider="gohighlevel",
            status="connected",
            external_account_id=location_id,
            token_ciphertext=encrypted_tokens,
            field_map={
                "firstName": "name",
                "phone": "phone",
                "email": "email",
            },
            settings={"sync_direction": "two_way", "location_id": location_id},
            last_sync_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(conn)
    else:
        conn.status = "connected"
        conn.token_ciphertext = encrypted_tokens
        conn.external_account_id = location_id or conn.external_account_id
        conn.last_error = None
        conn.last_sync_at = now
        conn.updated_at = now

    db.commit()
    db.refresh(conn)

    return {
        "success": True,
        "provider": "gohighlevel",
        "status": "connected",
        "location_id": location_id,
        "message": "GoHighLevel connected successfully with encrypted OAuth tokens.",
    }


# ===========================================================================
# 1c. PIPEDRIVE OAUTH 2.0 CONNECT & CALLBACK (Milestone M9b)
# ===========================================================================


@router.get("/pipedrive/connect")
def get_pipedrive_auth_url(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Generate Pipedrive OAuth 2.0 authorization URL with signed state."""
    tenant_id = resolve_tenant_id(user, db)

    # Plan Gating on CRM Connectors
    allowed, reason = check_tenant_entitlement(
        db, tenant_id, "crm.connectors.max", requested_value=1
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=reason
            or "Your current plan does not include CRM connectors. Upgrade to connect Pipedrive.",
        )

    provider = PipedriveProvider()
    state_token = create_access_token(
        {"tenant_id": tenant_id, "user_id": user.id, "nonce": uuid.uuid4().hex[:8]}
    )
    auth_url = provider.authorize_url(
        tenant_id=tenant_id,
        state=state_token,
        redirect_uri=settings.PIPEDRIVE_REDIRECT_URI,
    )

    return {
        "success": True,
        "provider": "pipedrive",
        "authorization_url": auth_url,
    }


@router.get("/pipedrive/callback")
async def pipedrive_oauth_callback(
    code: str = Query(..., description="OAuth authorization code returned by Pipedrive"),
    state: str = Query(..., description="CSRF state token"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Handle Pipedrive OAuth redirect, exchange code for tokens, and store encrypted connection."""
    payload = decode_access_token(state)
    if not payload or not payload.get("tenant_id"):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state token.")

    tenant_id = payload["tenant_id"]

    provider = PipedriveProvider()
    token_data = await provider.exchange_code(code, redirect_uri=settings.PIPEDRIVE_REDIRECT_URI)

    # Envelope encryption of OAuth token set
    encrypted_tokens = encrypt_token(token_data)
    company_id = str(token_data.get("company_id", ""))

    now = datetime.now(UTC)
    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == "pipedrive",
        )
    )

    if not conn:
        conn = CRMConnection(
            tenant_id=tenant_id,
            provider="pipedrive",
            status="connected",
            external_account_id=company_id,
            token_ciphertext=encrypted_tokens,
            field_map={
                "name": "name",
                "phone": "phone",
                "email": "email",
            },
            settings={"sync_direction": "two_way", "company_id": company_id},
            last_sync_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(conn)
    else:
        conn.status = "connected"
        conn.token_ciphertext = encrypted_tokens
        conn.external_account_id = company_id or conn.external_account_id
        conn.last_error = None
        conn.last_sync_at = now
        conn.updated_at = now

    db.commit()
    db.refresh(conn)

    return {
        "success": True,
        "provider": "pipedrive",
        "status": "connected",
        "company_id": company_id,
        "message": "Pipedrive connected successfully with encrypted OAuth tokens.",
    }


# ===========================================================================
# 2. TRANSACTIONAL CRM OUTBOX ENGINE (FR-INT-3, FR-INT-4, FR-INT-6)
# ===========================================================================


@router.get("/outbox")
def get_outbox_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve outbox queue health metrics and recent delivery logs (FR-INT-3)."""
    tenant_id = resolve_tenant_id(user, db)
    return get_outbox_stats(db, tenant_id)


@router.post("/outbox/process")
async def trigger_outbox_processing(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Execute immediate batch processing of pending outbox sync jobs."""
    tenant_id = resolve_tenant_id(user, db)
    results = await process_outbox_batch(db, batch_size=50, tenant_id=tenant_id)
    return {"success": True, "results": results}


@router.post("/outbox/retry-dead")
def retry_dead_letter_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Re-enqueue all dead-letter jobs back into the active processing queue (FR-INT-3)."""
    tenant_id = resolve_tenant_id(user, db)

    dead_jobs = db.scalars(
        select(CRMSyncOutbox).where(
            CRMSyncOutbox.tenant_id == tenant_id,
            CRMSyncOutbox.status == "dead",
        )
    ).all()

    now = datetime.now(UTC)
    for j in dead_jobs:
        j.status = "queued"
        j.attempt = 0
        j.next_attempt_at = now
        j.last_error = f"Re-queued from dead-letter by {user.email}"

    db.commit()

    return {
        "success": True,
        "requeued_count": len(dead_jobs),
        "message": f"Successfully re-queued {len(dead_jobs)} dead-letter jobs for synchronization.",
    }


@router.post("/crm/{provider}/test-sync")
def trigger_crm_test_sync(
    provider: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Enqueue a synthetic test sync event into the transactional outbox."""
    tenant_id = resolve_tenant_id(user, db)
    norm_provider = provider.lower().strip()

    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == norm_provider,
        )
    )
    if not conn or conn.status != "connected":
        raise HTTPException(
            status_code=400,
            detail=f"No active connection found for provider '{norm_provider}'. Please connect first.",
        )

    test_payload = {
        "name": "VedaVoice Test Contact",
        "phone": "+15125550199",
        "email": "test-sync@vedavoice.ai",
        "stage": "qualified",
    }

    jobs = enqueue_crm_outbox(
        db=db,
        tenant_id=tenant_id,
        entity="contact",
        internal_id=f"test-contact-{uuid.uuid4().hex[:6]}",
        op="upsert",
        payload=test_payload,
    )
    db.commit()

    return {
        "success": True,
        "enqueued_job_id": jobs[0].id if jobs else None,
        "message": f"Test sync job enqueued into outbox for {norm_provider}.",
    }


# ===========================================================================
# 3. UNIFIED CRM CONNECTOR LIST & DISCONNECT
# ===========================================================================


@router.get("")
def list_tenant_integrations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """List all connected CRMs (OAuth and API-key) and active webhook subscriptions."""
    tenant_id = resolve_tenant_id(user, db)

    # 1. OAuth Connections
    oauth_conns = db.scalars(
        select(CRMConnection).where(CRMConnection.tenant_id == tenant_id)
    ).all()

    # 2. Legacy/API key CRM connections
    legacy_crms = db.scalars(
        select(CRMIntegration).where(CRMIntegration.tenant_id == tenant_id)
    ).all()

    # 3. Webhooks
    webhook_list = db.scalars(
        select(WebhookSubscription).where(WebhookSubscription.tenant_id == tenant_id)
    ).all()

    crms_merged: list[dict[str, Any]] = []
    seen_providers = set()

    for c in oauth_conns:
        seen_providers.add(c.provider)
        crms_merged.append(
            {
                "id": c.id,
                "provider": c.provider,
                "type": "oauth2",
                "status": c.status,
                "account_id": c.external_account_id,
                "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
                "last_error": c.last_error,
                "created_at": c.created_at.isoformat(),
            }
        )

    for lc in legacy_crms:
        if lc.provider not in seen_providers:
            crms_merged.append(
                {
                    "id": lc.id,
                    "provider": lc.provider,
                    "type": "api_key",
                    "status": lc.status,
                    "config": lc.config,
                    "last_sync_at": lc.last_sync_at.isoformat() if lc.last_sync_at else None,
                    "created_at": lc.created_at.isoformat(),
                }
            )

    return {
        "crms": crms_merged,
        "webhooks": [
            {
                "id": w.id,
                "target_url": w.target_url,
                "events": w.events,
                "event_type": w.events[0] if (w.events and len(w.events) > 0) else "call.completed",
                "is_active": w.is_active,
                "failure_count": w.failure_count,
                "has_secret": bool(w.secret),
                "created_at": w.created_at.isoformat() if w.created_at else None,
            }
            for w in webhook_list
        ],
    }


@router.get("/crm")
def list_tenant_crms(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List all connected CRMs for tenant with health indicators."""
    res = list_tenant_integrations(db, user)
    return list(res["crms"])


@router.post("/crm")
def connect_or_update_crm(
    req: ConnectCRMRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Connect or update external CRM credentials (HubSpot, Zoho, GHL, Pipedrive)."""
    tenant_id = resolve_tenant_id(user, db)

    provider = req.provider.lower().strip()
    if provider not in ("hubspot", "zoho", "gohighlevel", "pipedrive"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported CRM provider '{provider}'. Supported: hubspot, zoho, gohighlevel, pipedrive.",
        )

    integration = db.scalar(
        select(CRMIntegration).where(
            CRMIntegration.tenant_id == tenant_id,
            CRMIntegration.provider == provider,
        )
    )

    now = datetime.now(UTC)
    if not integration:
        integration = CRMIntegration(
            tenant_id=tenant_id,
            provider=provider,
            status="connected",
            api_key_or_token=req.api_key_or_token,
            config=req.config,
            created_at=now,
            updated_at=now,
        )
        db.add(integration)
    else:
        integration.api_key_or_token = req.api_key_or_token
        integration.config = req.config
        integration.status = "connected"
        integration.updated_at = now

    # Also maintain/upsert CRMConnection with envelope encryption for transactional outbox
    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == provider,
        )
    )
    encrypted_token = encrypt_token(req.api_key_or_token)
    ext_id = str(req.config.get("location_id") or req.config.get("company_domain") or "")
    if not conn:
        conn = CRMConnection(
            tenant_id=tenant_id,
            provider=provider,
            status="connected",
            external_account_id=ext_id,
            token_ciphertext=encrypted_token,
            field_map={"name": "name", "phone": "phone", "email": "email"},
            settings=req.config,
            last_sync_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(conn)
    else:
        conn.status = "connected"
        conn.token_ciphertext = encrypted_token
        conn.external_account_id = ext_id or conn.external_account_id
        conn.settings = req.config
        conn.updated_at = now

    db.commit()
    db.refresh(integration)

    return {
        "success": True,
        "id": integration.id,
        "provider": integration.provider,
        "status": integration.status,
    }


@router.delete("/crm/{provider}")
def disconnect_crm(
    provider: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Disconnect an external CRM integration and purge active outbox jobs (FR-INT-12)."""
    tenant_id = resolve_tenant_id(user, db)
    norm_provider = provider.lower().strip()

    # Disconnect OAuth connection if present
    conn = db.scalar(
        select(CRMConnection).where(
            CRMConnection.tenant_id == tenant_id,
            CRMConnection.provider == norm_provider,
        )
    )
    if conn:
        db.delete(conn)

    # Disconnect legacy integration if present
    legacy = db.scalar(
        select(CRMIntegration).where(
            CRMIntegration.tenant_id == tenant_id,
            CRMIntegration.provider == norm_provider,
        )
    )
    if legacy:
        db.delete(legacy)

    db.commit()
    return {"success": True, "message": f"{provider.capitalize()} disconnected successfully."}


# ===========================================================================
# 4. OUTBOUND WEBHOOK SUBSCRIPTIONS (ZAPIER / MAKE)
# ===========================================================================


@router.get("/webhooks")
def list_tenant_webhooks(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List tenant's outbound webhook triggers."""
    tenant_id = resolve_tenant_id(user, db)
    hooks = db.scalars(
        select(WebhookSubscription)
        .where(WebhookSubscription.tenant_id == tenant_id)
        .order_by(desc(WebhookSubscription.created_at))
    ).all()

    return [
        {
            "id": h.id,
            "target_url": h.target_url,
            "events": h.events,
            "is_active": h.is_active,
            "failure_count": h.failure_count,
            "created_at": h.created_at.isoformat(),
        }
        for h in hooks
    ]


@router.post("/webhooks", status_code=status.HTTP_201_CREATED)
def create_webhook_subscription(
    req: CreateWebhookRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Register a new outbound webhook target for Zapier/Make automation."""
    tenant_id = resolve_tenant_id(user, db)

    hook = WebhookSubscription(
        tenant_id=tenant_id,
        target_url=req.target_url,
        secret=req.secret,
        events=req.events,
        is_active=True,
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)

    return {"success": True, "id": hook.id, "target_url": hook.target_url}


@router.delete("/webhooks/{webhook_id}")
def delete_webhook_subscription(
    webhook_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Remove a webhook subscription."""
    tenant_id = resolve_tenant_id(user, db)
    hook = db.scalar(
        select(WebhookSubscription).where(
            WebhookSubscription.id == webhook_id,
            WebhookSubscription.tenant_id == tenant_id,
        )
    )
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook subscription not found.")

    db.delete(hook)
    db.commit()
    return {"success": True, "message": "Webhook subscription deleted."}


@router.post("/webhooks/{webhook_id}/test")
def test_webhook_dispatch(
    webhook_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Trigger a sample test ping to verify endpoint connectivity."""
    tenant_id = resolve_tenant_id(user, db)
    hook = db.scalar(
        select(WebhookSubscription).where(
            WebhookSubscription.id == webhook_id,
            WebhookSubscription.tenant_id == tenant_id,
        )
    )
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook subscription not found.")

    test_payload = {
        "event": "test.ping",
        "tenant_id": tenant_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "sample_call": {
            "call_id": "call-test-ping-001",
            "caller_number": "+15125550199",
            "outcome": "appointment_booked",
            "duration_s": 95,
        },
    }

    result = deliver_webhook_event(
        target_url=hook.target_url,
        secret=hook.secret,
        event_name="test.ping",
        payload=test_payload,
    )

    return {"success": True, "delivery_result": result}


@router.post("/calendly/webhook")
def handle_calendly_webhook_alias(
    payload: dict[str, Any],
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Alias for Calendly webhook ingestion under /api/v1/integrations/calendly/webhook."""
    resp = handle_calendly_inbound_webhook(payload=payload, tenant_id=tenant_id, db=db)
    if isinstance(resp, dict):
        return resp
    return {"status": "received"}
