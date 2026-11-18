"""Outbound Webhook Dispatcher for Zapier, Make, and custom endpoints."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.crm import WebhookSubscription

logger = logging.getLogger("vedavoice.integrations.webhooks")


def sign_webhook_payload(payload_bytes: bytes, secret: str) -> str:
    """Generate HMAC-SHA256 signature for webhook payload verification."""
    if not secret:
        return ""
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


def deliver_webhook_event(
    target_url: str,
    event_name: str,
    payload: dict[str, Any],
    secret: str = "",
    timeout_s: float = 5.0,
) -> dict[str, Any]:
    """Execute synchronous or test HTTP POST delivery of signed webhook payload."""
    data = {
        "event": event_name,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": payload,
    }
    json_bytes = json.dumps(data, separators=(",", ":")).encode("utf-8")
    sig = sign_webhook_payload(json_bytes, secret)

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "VedaVoice-Webhook/1.0",
        "X-VedaVoice-Event": event_name,
    }
    if sig:
        headers["X-VedaVoice-Signature"] = f"sha256={sig}"

    req = urllib.request.Request(target_url, data=json_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as response:
            status_code = response.getcode()
            logger.info("Webhook delivered successfully to %s: HTTP %s", target_url, status_code)
            return {"status": "delivered", "status_code": status_code, "event": event_name}
    except Exception as err:
        logger.warning("Webhook delivery failed to %s: %s", target_url, err)
        return {"status": "failed", "error": str(err), "event": event_name}


def dispatch_tenant_webhooks(
    db: Session,
    tenant_id: str,
    event_name: str,
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    """Dispatch event to all active tenant webhook subscriptions (Zapier/Make)."""
    subscriptions = db.scalars(
        select(WebhookSubscription).where(
            WebhookSubscription.tenant_id == tenant_id,
            WebhookSubscription.is_active.is_(True),
        )
    ).all()

    results = []
    for sub in subscriptions:
        if event_name in sub.events or "*" in sub.events:
            res = deliver_webhook_event(
                target_url=sub.target_url,
                event_name=event_name,
                payload=payload,
                secret=sub.secret,
            )
            if res["status"] == "failed":
                sub.failure_count += 1
            else:
                sub.failure_count = 0
            results.append(res)

    db.commit()
    return results
