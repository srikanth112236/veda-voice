"""GoHighLevel (GHL / LeadConnector) OAuth Provider & Integration Adapter.

Implements CrmProvider protocol per SRS Addendum v1.1 Section 3.2–3.4:
- Agency multi-location install flow and sub-account location token exchange
- Contact upsert with custom field and tag mapping
- Post-call note & conversation activity synchronization with audio recording URL
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from api.app.core.config import settings
from api.app.models.call import Call
from api.app.models.crm import Contact
from api.app.services.integrations.crm_base import BaseCRMAdapter

logger = logging.getLogger("vedavoice.integrations.gohighlevel")


class HighLevelProvider:
    """LeadConnector / GoHighLevel v2 Provider implementing CrmProvider protocol."""

    BASE_AUTH_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation"
    BASE_API_URL = "https://services.leadconnectorhq.com"
    API_VERSION = "2021-07-28"
    DEFAULT_SCOPES = [
        "contacts.readonly",
        "contacts.write",
        "conversations.readonly",
        "conversations.write",
        "locations.readonly",
    ]

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> None:
        self.client_id = client_id or settings.GHL_CLIENT_ID or "mock_ghl_client_id"
        self.client_secret = client_secret or settings.GHL_CLIENT_SECRET or "mock_ghl_secret"

    def authorize_url(self, tenant_id: str, state: str, redirect_uri: str) -> str:
        """Generate GoHighLevel Marketplace OAuth 2.0 authorization URL."""
        params = {
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "client_id": self.client_id,
            "scope": " ".join(self.DEFAULT_SCOPES),
            "state": state,
        }
        return f"{self.BASE_AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for OAuth tokens and sub-account location ID."""
        if code.startswith("mock_") or self.client_id.startswith("mock_"):
            return {
                "access_token": f"ghl_access_{code}",
                "refresh_token": f"ghl_refresh_{code}",
                "expires_in": 86400,
                "token_type": "Bearer",
                "locationId": "loc_ghl_mock_12345",
                "companyId": "comp_ghl_mock_agency",
                "userId": "user_ghl_mock",
            }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/oauth/token",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "user_type": "Location",
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                logger.error("GoHighLevel token exchange failed: %s", resp.text)
                raise RuntimeError(
                    f"GoHighLevel token exchange failed ({resp.status_code}): {resp.text}"
                )
            return dict(resp.json())

    async def refresh_tokens(self, refresh_token: str) -> dict[str, Any]:
        """Refresh expired GHL access token."""
        if refresh_token.startswith("ghl_refresh_mock") or refresh_token.startswith("mock_"):
            return {
                "access_token": f"ghl_access_refreshed_{datetime.now(UTC).timestamp()}",
                "refresh_token": refresh_token,
                "expires_in": 86400,
                "token_type": "Bearer",
                "locationId": "loc_ghl_mock_12345",
            }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/oauth/token",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "user_type": "Location",
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                logger.error("GoHighLevel token refresh failed: %s", resp.text)
                raise RuntimeError(
                    f"GoHighLevel token refresh failed ({resp.status_code}): {resp.text}"
                )
            return dict(resp.json())

    async def upsert_contact(self, access_token: str, contact_data: dict[str, Any]) -> str:
        """Upsert contact into GoHighLevel location via /contacts/upsert."""
        phone = contact_data.get("phone", "")
        email = contact_data.get("email")
        name = contact_data.get("name", "Unknown Contact")
        location_id = contact_data.get("location_id") or contact_data.get("locationId")

        name_parts = name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        if access_token.startswith("ghl_access_mock") or access_token.startswith("mock_"):
            return f"ghl_contact_{phone.replace('+', '')}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Version": self.API_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        body: dict[str, Any] = {
            "firstName": first_name,
            "lastName": last_name,
            "phone": phone,
            "tags": contact_data.get("tags") or ["VedaVoice AI Lead"],
        }
        if email:
            body["email"] = email
        if location_id:
            body["locationId"] = location_id

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/contacts/upsert",
                headers=headers,
                json=body,
            )
            if resp.status_code in (200, 201):
                data = resp.json()
                contact_obj = data.get("contact", {})
                return str(contact_obj.get("id") or data.get("id", ""))

            logger.error("GoHighLevel contact upsert failed: %s", resp.text)
            raise RuntimeError(f"GHL upsert contact failed ({resp.status_code}): {resp.text}")

    async def log_call(
        self,
        access_token: str,
        call_data: dict[str, Any],
        external_contact_id: str | None = None,
    ) -> str:
        """Create call notes and log outcome in GoHighLevel."""
        call_id = call_data.get("call_id", "call")
        outcome = call_data.get("outcome", "completed")
        summary = call_data.get("summary", "AI Voice conversation completed.")
        recording_url = call_data.get("recording_url")
        duration_s = int(call_data.get("duration_s", 0))

        if access_token.startswith("ghl_access_mock") or access_token.startswith("mock_"):
            return f"ghl_note_{call_id[:12]}"

        if not external_contact_id:
            logger.warning("No external_contact_id provided for GHL call note logging.")
            return f"ghl_unlinked_{call_id[:12]}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Version": self.API_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        body_text = (
            f"📞 VedaVoice AI Call Completed ({duration_s}s)\n"
            f"Outcome: {outcome}\n"
            f"Summary:\n{summary}\n"
        )
        if recording_url:
            body_text += f"\n🎙️ Recording URL: {recording_url}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/contacts/{external_contact_id}/notes",
                headers=headers,
                json={"body": body_text},
            )
            if resp.status_code in (200, 201):
                res_data = resp.json()
                return str(
                    res_data.get("note", {}).get("id") or res_data.get("id", f"note_{call_id[:8]}")
                )

            logger.error("GoHighLevel log_call note failed: %s", resp.text)
            raise RuntimeError(f"GHL log_call failed ({resp.status_code}): {resp.text}")

    async def set_stage(self, access_token: str, external_contact_id: str, stage: str) -> None:
        """Tag contact with lifecycle stage in GoHighLevel."""
        if access_token.startswith("ghl_access_mock") or access_token.startswith("mock_"):
            return

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Version": self.API_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{self.BASE_API_URL}/contacts/{external_contact_id}/tags",
                headers=headers,
                json={"tags": [f"stage:{stage}"]},
            )


class HighLevelAdapter(BaseCRMAdapter):
    """Legacy helper adapter for GHL payload generation."""

    def __init__(self, api_key: str, location_id: str | None = None) -> None:
        self.api_key = api_key
        self.location_id = location_id

    def sync_contact(self, contact: Contact) -> dict[str, Any]:
        name_parts = contact.name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        payload = {
            "firstName": first_name,
            "lastName": last_name,
            "phone": contact.phone,
            "email": contact.email,
            "source": contact.source,
            "tags": contact.tags or ["AI Lead"],
        }
        if self.location_id:
            payload["locationId"] = self.location_id

        return {
            "status": "success",
            "provider": "gohighlevel",
            "endpoint": "https://services.leadconnectorhq.com/contacts/upsert",
            "payload": payload,
        }

    def log_call(self, call: Call, contact: Contact | None = None) -> dict[str, Any]:
        summary = ""
        if call.message and isinstance(call.message, dict):
            summary = call.message.get("summary") or call.message.get("notes") or ""
        elif call.transcript:
            summary = f"Voice Assistant Call with {call.turn_count} turns."
        else:
            summary = f"Call completed ({call.outcome})."

        note_body = (
            f"📞 AI Call Completed ({int(call.duration_s)}s)\n"
            f"Outcome: {call.outcome}\n"
            f"Sentiment: {call.sentiment_label.upper()} ({call.sentiment_score:+.2f})\n\n"
            f"Summary:\n{summary}\n"
        )
        if call.recording_url:
            note_body += f"\n🎙️ Recording: {call.recording_url}"

        return {
            "status": "success",
            "provider": "gohighlevel",
            "endpoint": "https://services.leadconnectorhq.com/contacts/{contact_id}/notes",
            "payload": {"body": note_body},
        }
