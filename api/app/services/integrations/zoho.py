"""Zoho CRM Integration Adapter (REST API v3 Contacts & Calls)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from api.app.models.call import Call
from api.app.models.crm import Contact
from api.app.services.integrations.crm_base import BaseCRMAdapter

logger = logging.getLogger("vedavoice.integrations.zoho")


class ZohoAdapter(BaseCRMAdapter):
    """Syncs contacts and logs phone call activities into Zoho CRM."""

    def __init__(self, auth_token: str, domain: str = "https://www.zohoapis.com") -> None:
        self.auth_token = auth_token
        self.domain = domain.rstrip("/")

    def sync_contact(self, contact: Contact) -> dict[str, Any]:
        """Format and payload for Zoho CRM Contacts API."""
        name_parts = contact.name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else "Lead"

        payload = {
            "data": [
                {
                    "First_Name": first_name,
                    "Last_Name": last_name,
                    "Phone": contact.phone,
                    "Email": contact.email or "",
                    "Lead_Source": contact.source,
                    "Description": f"Stage: {contact.stage} | Tags: {', '.join(contact.tags)}",
                }
            ]
        }

        logger.info("Zoho CRM sync_contact formatted for contact %s", contact.id)
        return {
            "status": "success",
            "provider": "zoho",
            "endpoint": f"{self.domain}/crm/v3/Contacts",
            "payload": payload,
        }

    def log_call(self, call: Call, contact: Contact | None = None) -> dict[str, Any]:
        """Format and payload for Zoho CRM Calls API."""
        summary = ""
        if call.message and isinstance(call.message, dict):
            summary = call.message.get("summary") or call.message.get("notes") or ""
        elif call.transcript:
            summary = f"Completed conversation ({call.turn_count} turns)."
        else:
            summary = f"Outcome: {call.outcome}"

        sentiment_label_str = (call.sentiment_label or "neutral").upper()
        sentiment_score_val = call.sentiment_score if call.sentiment_score is not None else 0.0

        description = (
            f"AI Call Summary:\n{summary}\n"
            f"Sentiment: {sentiment_label_str} ({sentiment_score_val:+.2f})\n"
            f"Audio Recording: {call.recording_url or 'None'}"
        )

        start_time_iso = (call.started_at or datetime.now(UTC)).isoformat()

        payload = {
            "data": [
                {
                    "Subject": f"AI Call - {call.outcome.title()}",
                    "Call_Type": "Inbound" if call.direction == "inbound" else "Outbound",
                    "Call_Duration": f"{int(call.duration_s // 60):02d}:{int(call.duration_s % 60):02d}",
                    "Call_Result": call.outcome,
                    "Description": description,
                    "Call_Start_Time": start_time_iso,
                }
            ]
        }

        logger.info("Zoho CRM log_call formatted for call %s", call.call_id)
        return {
            "status": "success",
            "provider": "zoho",
            "endpoint": f"{self.domain}/crm/v3/Calls",
            "payload": payload,
        }
