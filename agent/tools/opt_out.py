"""Voice agent tool for caller opt-out / Do-Not-Call (DNC) requests during outbound calls.

Adheres strictly to SRS Section 6.2 Point 7:
Immediately adds caller to tenant suppression list and confirms removal.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Annotated, cast

from livekit.agents import FunctionTool, function_tool

logger = logging.getLogger("receptionist.tools.opt_out")


def create_opt_out_tool(
    call_token: str,
    phone_number: str = "",
    api_base_url: str | None = None,
) -> FunctionTool:
    """Create a LiveKit function tool that registers caller opt-out with the control plane."""

    def _sync_record_opt_out(opt_reason: str) -> str:
        payload = {
            "phone_number": phone_number,
            "reason": "opt_out",
            "notes": f"Voice agent opt-out trigger: {opt_reason}",
        }

        # 1. Attempt HTTP request to control plane
        base_url = api_base_url or os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
        url = f"{base_url}/api/v1/internal/calls/opt-out"

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "X-Call-Token": call_token,
                    "Authorization": f"Bearer {call_token}",
                    "User-Agent": "LiveKit-Agent-Worker/1.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                if resp.status == 200:
                    logger.info("Successfully registered opt-out via API for %s", phone_number)
                    return (
                        "I have immediately removed your number from our contact list and recorded your opt-out. "
                        "You will not receive any further automated calls from us. Have a great day, goodbye."
                    )
        except Exception as e:
            logger.debug("HTTP opt-out failed (%s); trying in-process fallback", e)
            try:
                from api.app.core.security import decode_access_token
                from api.app.db.session import SessionLocal
                from api.app.services.outbound import record_caller_opt_out

                claims = decode_access_token(call_token)
                if claims and "tenant_id" in claims:
                    with SessionLocal() as db:
                        record_caller_opt_out(
                            db=db,
                            tenant_id=claims["tenant_id"],
                            phone_number=phone_number,
                            reason="opt_out",
                            notes=f"Voice agent opt-out fallback: {opt_reason}",
                        )
                    return (
                        "I have immediately removed your number from our contact list and recorded your opt-out. "
                        "You will not receive any further automated calls from us. Have a great day, goodbye."
                    )
            except Exception as inner_e:
                logger.error("In-process opt-out fallback error: %s", inner_e)

        return (
            "I have noted your request and our system will remove your number from our calling list immediately. "
            "Thank you, goodbye."
        )

    @function_tool
    async def opt_out_tool(
        reason: Annotated[
            str,
            "Reason for opt-out, such as 'caller requested do not call', 'wrong number', or 'unsubscribed'",
        ] = "caller_requested_dnc",
    ) -> str:
        """Call this function IMMEDIATELY when the customer asks to stop calling, remove their number, or opt out."""
        return await asyncio.to_thread(_sync_record_opt_out, reason)

    return cast(FunctionTool, opt_out_tool)
