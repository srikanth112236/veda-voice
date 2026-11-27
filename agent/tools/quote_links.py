"""Voice agent tool for sending self-serve quote links via SMS during a call."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from typing import Annotated, Any

from livekit.agents import FunctionTool, function_tool

logger = logging.getLogger("receptionist.tools.quote_links")


def _execute_in_process_send_quote_link(
    payload: dict[str, Any],
    call_token: str,
) -> dict[str, Any]:
    """In-process fallback when running under pytest."""
    from api.app.db.session import SessionLocal
    from api.app.routers.internal import (
        InternalSendQuoteLinkRequest,
        internal_send_quote_link,
    )

    with SessionLocal() as db:
        return dict(
            internal_send_quote_link(
                payload=InternalSendQuoteLinkRequest(
                    phone_number=str(payload.get("phone_number") or ""),
                    customer_name=str(payload.get("customer_name") or "Valued Customer"),
                    title=str(payload.get("title") or "Service Estimate"),
                    notes=str(payload.get("notes") or ""),
                    amount_dollars=float(payload.get("amount_dollars") or 0.0),
                ),
                authorization=f"Bearer {call_token}",
                db=db,
            )
        )


def send_quote_link(
    call_token: str,
    phone_number: str,
    customer_name: str = "Valued Customer",
    title: str = "Service Estimate",
    notes: str = "",
    amount_dollars: float = 0.0,
    api_base_url: str | None = None,
) -> dict[str, Any]:
    """Create a quote record via internal API and text its self-serve link to the caller."""
    payload: dict[str, Any] = {
        "phone_number": phone_number,
        "customer_name": customer_name,
        "title": title,
        "notes": notes,
        "amount_dollars": amount_dollars,
    }
    if api_base_url is None and "pytest" in sys.modules:
        return _execute_in_process_send_quote_link(payload, call_token)

    base_url = str(api_base_url or os.getenv("API_BASE_URL") or "http://127.0.0.1:8000").rstrip("/")
    url = f"{base_url}/api/v1/internal/quotes/send-link"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {call_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return dict(json.loads(resp.read().decode("utf-8")))
    except Exception as exc:
        logger.error("Failed to send quote link: %s", exc)
        return {"status": "error", "error": str(exc)}


def create_quote_link_tools(call_token: str, caller_phone: str = "") -> list[FunctionTool]:
    """Create LiveKit function tools for texting a self-serve quote link mid-call."""

    @function_tool
    async def send_quote_link_tool(
        phone_number: Annotated[
            str,
            "Caller's mobile phone number to receive the quote link via SMS",
        ] = "",
        customer_name: Annotated[
            str,
            "Caller's full name",
        ] = "Valued Customer",
        title: Annotated[
            str,
            "Short title of the requested estimate (e.g. 'Water Heater Replacement Estimate')",
        ] = "Service Estimate",
        notes: Annotated[
            str,
            "Brief scope notes from the caller's request",
        ] = "",
        amount_dollars: Annotated[
            float,
            "Estimated amount in dollars if quoted, or 0 if pending on-site assessment",
        ] = 0.0,
    ) -> str:
        """Create a written quote and text its interactive approval link to the caller's phone."""
        target_phone = (phone_number or caller_phone or "").strip()
        if not target_phone:
            return json.dumps(
                {
                    "status": "error",
                    "message": "Please ask the caller for their mobile phone number first.",
                }
            )
        res = await asyncio.to_thread(
            send_quote_link,
            call_token,
            target_phone,
            customer_name,
            title,
            notes,
            amount_dollars,
        )
        return json.dumps(res)

    return [send_quote_link_tool]
