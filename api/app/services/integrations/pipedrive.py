"""Pipedrive CRM Integration Adapter & OAuth Provider per SRS Addendum v1.1 Section 3.2–3.4.

Implements CrmProvider protocol:
- Pipedrive OAuth 2.0 authorization URL and token exchange
- Person search and upsert
- Activity logging with duration, outcome, summary, and recording URL
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

logger = logging.getLogger("vedavoice.integrations.pipedrive")


class PipedriveProvider:
    """Enterprise Pipedrive CRM Provider implementing CrmProvider protocol."""

    BASE_AUTH_URL = "https://oauth.pipedrive.com/oauth/authorize"
    BASE_TOKEN_URL = "https://oauth.pipedrive.com/oauth/token"
    BASE_API_URL = "https://api.pipedrive.com"

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> None:
        self.client_id = client_id or settings.PIPEDRIVE_CLIENT_ID or "mock_pd_client_id"
        self.client_secret = client_secret or settings.PIPEDRIVE_CLIENT_SECRET or "mock_pd_secret"

    def authorize_url(self, tenant_id: str, state: str, redirect_uri: str) -> str:
        """Generate Pipedrive OAuth 2.0 authorization URL."""
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "state": state,
        }
        return f"{self.BASE_AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for OAuth token set."""
        if code.startswith("mock_") or self.client_id.startswith("mock_"):
            return {
                "access_token": f"pd_access_{code}",
                "refresh_token": f"pd_refresh_{code}",
                "expires_in": 3600,
                "token_type": "Bearer",
                "api_domain": "https://api.pipedrive.com",
                "company_id": 987654,
            }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                self.BASE_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": redirect_uri,
                    "code": code,
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                logger.error("Pipedrive token exchange failed: %s", resp.text)
                raise RuntimeError(
                    f"Pipedrive token exchange failed ({resp.status_code}): {resp.text}"
                )
            return dict(resp.json())

    async def refresh_tokens(self, refresh_token: str) -> dict[str, Any]:
        """Refresh expired Pipedrive access token."""
        if refresh_token.startswith("pd_refresh_mock") or refresh_token.startswith("mock_"):
            return {
                "access_token": f"pd_access_refreshed_{datetime.now(UTC).timestamp()}",
                "refresh_token": refresh_token,
                "expires_in": 3600,
                "token_type": "Bearer",
            }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                self.BASE_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": refresh_token,
                },
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                logger.error("Pipedrive token refresh failed: %s", resp.text)
                raise RuntimeError(
                    f"Pipedrive token refresh failed ({resp.status_code}): {resp.text}"
                )
            return dict(resp.json())

    async def upsert_contact(self, access_token: str, contact_data: dict[str, Any]) -> str:
        """Search Person by phone/email; updates if found, creates if missing."""
        phone = contact_data.get("phone", "")
        email = contact_data.get("email")
        name = contact_data.get("name", "Unknown Contact")

        if access_token.startswith("pd_access_mock") or access_token.startswith("mock_"):
            return f"pd_person_{phone.replace('+', '')}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Search existing Person
            search_term = phone or email or name
            search_resp = await client.get(
                f"{self.BASE_API_URL}/v1/persons/search",
                headers=headers,
                params={"term": search_term, "fields": "phone,email"},
            )
            existing_id: int | None = None
            if search_resp.status_code == 200:
                items = search_resp.json().get("data", {}).get("items", [])
                if items:
                    existing_id = items[0]["item"]["id"]

            payload = {
                "name": name,
                "phone": [{"value": phone, "primary": True, "label": "work"}] if phone else [],
                "email": [{"value": email, "primary": True, "label": "work"}] if email else [],
            }

            if existing_id:
                # Update existing person
                up_resp = await client.put(
                    f"{self.BASE_API_URL}/v1/persons/{existing_id}",
                    headers=headers,
                    json=payload,
                )
                if up_resp.status_code == 200:
                    return str(existing_id)

            # Create new Person
            create_resp = await client.post(
                f"{self.BASE_API_URL}/v1/persons",
                headers=headers,
                json=payload,
            )
            if create_resp.status_code in (200, 201):
                data = create_resp.json().get("data", {})
                return str(data.get("id", ""))

            logger.error("Pipedrive Person upsert failed: %s", create_resp.text)
            raise RuntimeError(
                f"Pipedrive upsert contact failed ({create_resp.status_code}): {create_resp.text}"
            )

    async def log_call(
        self,
        access_token: str,
        call_data: dict[str, Any],
        external_contact_id: str | None = None,
    ) -> str:
        """Create call activity in Pipedrive."""
        call_id = call_data.get("call_id", "call")
        outcome = call_data.get("outcome", "completed")
        summary = call_data.get("summary", "AI Voice conversation completed.")
        recording_url = call_data.get("recording_url")
        duration_s = int(call_data.get("duration_s", 0))

        if access_token.startswith("pd_access_mock") or access_token.startswith("mock_"):
            return f"pd_activity_{call_id[:12]}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        note_html = (
            f"<b>VedaVoice AI Call Outcome:</b> {outcome}<br>"
            f"<b>Duration:</b> {duration_s} seconds<br>"
            f"<b>Summary:</b><br>{summary}<br>"
        )
        if recording_url:
            note_html += f"<b>Audio Recording:</b> <a href='{recording_url}'>Listen</a><br>"

        duration_formatted = f"{duration_s // 60:02d}:{duration_s % 60:02d}"

        activity_payload: dict[str, Any] = {
            "subject": f"AI Call - {outcome.title()}",
            "type": "call",
            "done": 1,
            "duration": duration_formatted,
            "note": note_html,
        }
        if external_contact_id:
            try:
                activity_payload["person_id"] = int(external_contact_id)
            except ValueError:
                activity_payload["person_id"] = external_contact_id

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/v1/activities",
                headers=headers,
                json=activity_payload,
            )
            if resp.status_code in (200, 201):
                data = resp.json().get("data", {})
                return str(data.get("id", f"act_{call_id[:8]}"))

            logger.error("Pipedrive log_call activity failed: %s", resp.text)
            raise RuntimeError(f"Pipedrive log_call failed ({resp.status_code}): {resp.text}")

    async def set_stage(self, access_token: str, external_contact_id: str, stage: str) -> None:
        """Update Person stage or note in Pipedrive."""
        if access_token.startswith("pd_access_mock") or access_token.startswith("mock_"):
            return

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.put(
                f"{self.BASE_API_URL}/v1/persons/{external_contact_id}",
                headers=headers,
                json={"label": stage},
            )


class PipedriveAdapter(BaseCRMAdapter):
    """Legacy helper adapter for Pipedrive payload formatting."""

    def __init__(self, api_token: str, company_domain: str = "api") -> None:
        self.api_token = api_token
        self.company_domain = company_domain.rstrip("/")

    def sync_contact(self, contact: Contact) -> dict[str, Any]:
        payload = {
            "name": contact.name,
            "phone": [{"value": contact.phone, "primary": True, "label": "work"}],
            "email": (
                [{"value": contact.email, "primary": True, "label": "work"}]
                if contact.email
                else []
            ),
        }
        return {
            "status": "success",
            "provider": "pipedrive",
            "endpoint": f"https://{self.company_domain}.pipedrive.com/v1/persons",
            "payload": payload,
        }

    def log_call(self, call: Call, contact: Contact | None = None) -> dict[str, Any]:
        summary = ""
        if call.message and isinstance(call.message, dict):
            summary = call.message.get("summary") or call.message.get("notes") or ""
        elif call.transcript:
            summary = f"AI Voice conversation completed with {call.turn_count} turns."
        else:
            summary = f"Call completed ({call.outcome})."

        note = (
            f"<b>AI Call Outcome:</b> {call.outcome}<br>"
            f"<b>Sentiment:</b> {call.sentiment_label.upper()} ({call.sentiment_score:+.2f})<br>"
            f"<b>Summary:</b> {summary}<br>"
        )
        if call.recording_url:
            note += f"<b>Audio Recording:</b> <a href='{call.recording_url}'>Listen</a><br>"

        duration_str = f"{int(call.duration_s // 60):02d}:{int(call.duration_s % 60):02d}"

        payload = {
            "subject": f"AI Call - {call.outcome.title()}",
            "type": "call",
            "done": 1,
            "duration": duration_str,
            "note": note,
            "due_date": (call.ended_at or call.started_at).strftime("%Y-%m-%d"),
            "due_time": (call.ended_at or call.started_at).strftime("%H:%M"),
        }
        return {
            "status": "success",
            "provider": "pipedrive",
            "endpoint": f"https://{self.company_domain}.pipedrive.com/v1/activities",
            "payload": payload,
        }
