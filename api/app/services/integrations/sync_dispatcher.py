"""Unified Post-Call CRM & Outbound Webhook Synchronization Dispatcher."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.db.session import SessionLocal
from api.app.models.call import Call
from api.app.models.crm import Contact, CRMIntegration
from api.app.services.integrations.gohighlevel import HighLevelAdapter
from api.app.services.integrations.hubspot import HubSpotAdapter
from api.app.services.integrations.outbox_worker import enqueue_crm_outbox
from api.app.services.integrations.pipedrive import PipedriveAdapter
from api.app.services.integrations.webhooks import dispatch_tenant_webhooks
from api.app.services.integrations.zoho import ZohoAdapter

logger = logging.getLogger("vedavoice.integrations.sync_dispatcher")


def get_crm_adapter(integration: CRMIntegration) -> Any | None:
    """Instantiate appropriate adapter for configured provider."""
    provider = integration.provider.lower()
    token = integration.api_key_or_token
    config = integration.config or {}

    if provider == "hubspot":
        return HubSpotAdapter(access_token=token, portal_id=config.get("portal_id"))
    if provider == "zoho":
        return ZohoAdapter(
            auth_token=token, domain=config.get("domain", "https://www.zohoapis.com")
        )
    if provider == "gohighlevel":
        return HighLevelAdapter(api_key=token, location_id=config.get("location_id"))
    if provider == "pipedrive":
        return PipedriveAdapter(api_token=token, company_domain=config.get("company_domain", "api"))

    logger.warning("Unknown CRM provider: %s", provider)
    return None


def dispatch_all_crm_and_webhook_sync(call_id: str, db: Session | None = None) -> dict[str, Any]:
    """Execute post-call synchronization across external CRM adapters and Zapier/Make webhooks."""
    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True

    try:
        call = db.scalar(select(Call).where(Call.call_id == call_id))
        if not call:
            call = db.scalar(select(Call).where(Call.id == call_id))
        if not call or not call.tenant_id:
            logger.warning("Call %s not found for external sync", call_id)
            return {"status": "skipped", "reason": "call_not_found"}

        contact = None
        if call.contact_id:
            contact = db.scalar(select(Contact).where(Contact.id == call.contact_id))

        results: dict[str, Any] = {"crm_syncs": [], "webhooks": []}

        # Check HIPAA Guardrails from applied Industry Pack (FR-PACK-7)
        from api.app.models.tenant import Tenant
        from api.app.services.industry_packs import get_tenant_effective_pack

        pack_info = get_tenant_effective_pack(call.tenant_id, db)
        tenant_rec = db.scalar(select(Tenant).where(Tenant.id == call.tenant_id))
        hipaa_baa_active = (
            (tenant_rec.config or {}).get("hipaa_baa_enabled", False) if tenant_rec else False
        )

        sync_call = call
        if pack_info.get("requires_hipaa_baa") and not hipaa_baa_active:
            logger.warning(
                "HIPAA Guardrail: External CRM transcript sync redacted for tenant %s. Active pack '%s' requires HIPAA BAA.",
                call.tenant_id,
                pack_info.get("pack_slug"),
            )
            sync_call = Call(
                id=call.id,
                call_id=call.call_id,
                tenant_id=call.tenant_id,
                caller_number=call.caller_number,
                started_at=call.started_at,
                ended_at=call.ended_at,
                duration_s=call.duration_s,
                outcome=call.outcome,
                transcript="[REDACTED - HIPAA BAA Required for External CRM Sync]",
                message="[REDACTED - Protected Health Information]",
            )

        # 1. Sync to active external CRM integrations
        crm_integrations = db.scalars(
            select(CRMIntegration).where(
                CRMIntegration.tenant_id == call.tenant_id,
                CRMIntegration.status == "connected",
            )
        ).all()

        for crm in crm_integrations:
            adapter = get_crm_adapter(crm)
            if adapter:
                try:
                    res = adapter.log_call(sync_call, contact)
                    if isinstance(res, dict):
                        res["provider"] = crm.provider
                    results["crm_syncs"].append(res)
                except Exception as err:
                    logger.error("Failed to sync call %s to %s: %s", call_id, crm.provider, err)

        # 1b. Enqueue to Transactional Outbox for OAuth CRM connections (FR-INT-3)
        try:
            outbox_jobs = enqueue_crm_outbox(
                db=db,
                tenant_id=call.tenant_id,
                entity="call",
                internal_id=call.id,
                op="log_call",
                payload={
                    "call_id": call.call_id,
                    "contact_id": call.contact_id,
                    "duration_s": call.duration_s,
                    "outcome": call.outcome,
                    "sentiment_label": call.sentiment_label,
                    "recording_url": call.recording_url,
                    "summary": call.message.get("summary") if call.message else "",
                },
            )
            results["outbox_enqueued"] = len(outbox_jobs)
        except Exception as err:
            logger.error("Failed to enqueue CRM outbox for call %s: %s", call_id, err)

        # 2. Dispatch to Zapier / Make webhooks
        call_event_payload = {
            "call_id": call.call_id,
            "tenant_id": call.tenant_id,
            "caller_number": call.caller_number,
            "dialed_number": call.dialed_number,
            "direction": call.direction,
            "duration_s": call.duration_s,
            "billable_minutes": call.billable_minutes,
            "outcome": call.outcome,
            "urgency": call.urgency,
            "sentiment_label": call.sentiment_label,
            "sentiment_score": call.sentiment_score,
            "recording_url": call.recording_url,
            "transcript_turns": len(call.transcript),
            "summary": call.message.get("summary") if call.message else "",
            "started_at": call.started_at.isoformat(),
            "ended_at": call.ended_at.isoformat() if call.ended_at else None,
        }

        webhook_res = dispatch_tenant_webhooks(
            db=db,
            tenant_id=call.tenant_id,
            event_name="call.completed",
            payload=call_event_payload,
        )
        results["webhooks"] = webhook_res

        logger.info(
            "Sync dispatcher executed for call %s: %d CRM syncs, %d webhooks triggered",
            call_id,
            len(results["crm_syncs"]),
            len(results["webhooks"]),
        )
        return {"status": "success", "results": results}
    finally:
        if close_session:
            db.close()
