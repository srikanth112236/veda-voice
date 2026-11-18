"""HubSpot CRM Integration Adapter & OAuth Provider per SRS Addendum v1.1 Section 3.2–3.3."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from api.app.core.config import settings

logger = logging.getLogger("vedavoice.integrations.hubspot")


class HubSpotProvider:
    """Enterprise HubSpot CRM Provider implementing CrmProvider protocol."""

    BASE_AUTH_URL = "https://app.hubspot.com/oauth/authorize"
    BASE_API_URL = "https://api.hubapi.com"
    DEFAULT_SCOPES = [
        "crm.objects.contacts.read",
        "crm.objects.contacts.write",
        "crm.objects.custom.read",
        "crm.objects.custom.write",
    ]

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> None:
        self.client_id = client_id or settings.HUBSPOT_CLIENT_ID or "mock_hs_client_id"
        self.client_secret = client_secret or settings.HUBSPOT_CLIENT_SECRET or "mock_hs_secret"

    def authorize_url(self, tenant_id: str, state: str, redirect_uri: str) -> str:
        """Generate HubSpot OAuth 2.0 authorization URL with CSRF state."""
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(self.DEFAULT_SCOPES),
            "state": state,
        }
        return f"{self.BASE_AUTH_URL}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for OAuth token set."""
        if code.startswith("mock_") or self.client_id.startswith("mock_"):
            return {
                "access_token": f"hs_access_{code}",
                "refresh_token": f"hs_refresh_{code}",
                "expires_in": 1800,
                "token_type": "bearer",
                "portal_id": 99887766,
            }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/oauth/v1/token",
                data={
                    "grant_type": "authorization_code",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": redirect_uri,
                    "code": code,
                },
            )
            if resp.status_code != 200:
                logger.error("HubSpot OAuth token exchange failed: %s", resp.text)
                raise RuntimeError(
                    f"HubSpot token exchange failed ({resp.status_code}): {resp.text}"
                )
            return dict(resp.json())

    async def refresh_tokens(self, refresh_token: str) -> dict[str, Any]:
        """Refresh expired access token using refresh_token."""
        if refresh_token.startswith("hs_refresh_mock"):
            return {
                "access_token": f"hs_access_refreshed_{datetime.now(UTC).timestamp()}",
                "refresh_token": refresh_token,
                "expires_in": 1800,
                "token_type": "bearer",
            }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{self.BASE_API_URL}/oauth/v1/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "refresh_token": refresh_token,
                },
            )
            if resp.status_code != 200:
                logger.error("HubSpot token refresh failed: %s", resp.text)
                raise RuntimeError(
                    f"HubSpot token refresh failed ({resp.status_code}): {resp.text}"
                )
            return dict(resp.json())

    async def upsert_contact(self, access_token: str, contact_data: dict[str, Any]) -> str:
        """Search contact by phone/email; updates if found, creates if missing."""
        phone = contact_data.get("phone", "")
        email = contact_data.get("email")
        name = contact_data.get("name", "Unknown Contact")
        stage = contact_data.get("stage", "new_lead")

        name_parts = name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        if access_token.startswith("hs_access_mock") or access_token.startswith("mock_"):
            return f"hs_contact_{phone.replace('+', '')}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Search existing contact
            existing_id: str | None = None
            if phone or email:
                filter_val = email or phone
                filter_prop = "email" if email else "phone"
                search_payload = {
                    "filterGroups": [
                        {
                            "filters": [
                                {
                                    "propertyName": filter_prop,
                                    "operator": "EQ",
                                    "value": filter_val,
                                }
                            ]
                        }
                    ]
                }
                search_res = await client.post(
                    f"{self.BASE_API_URL}/crm/v3/objects/contacts/search",
                    headers=headers,
                    json=search_payload,
                )
                if search_res.status_code == 200:
                    results = search_res.json().get("results", [])
                    if results:
                        existing_id = results[0]["id"]

            properties = {
                "firstname": first_name,
                "lastname": last_name,
                "phone": phone,
                "hs_lead_status": stage.upper(),
            }
            if email:
                properties["email"] = email

            # 2. Update or Create
            if existing_id:
                patch_res = await client.patch(
                    f"{self.BASE_API_URL}/crm/v3/objects/contacts/{existing_id}",
                    headers=headers,
                    json={"properties": properties},
                )
                if patch_res.status_code not in (200, 201):
                    raise RuntimeError(f"HubSpot contact update failed: {patch_res.text}")
                return existing_id

            create_res = await client.post(
                f"{self.BASE_API_URL}/crm/v3/objects/contacts",
                headers=headers,
                json={"properties": properties},
            )
            if create_res.status_code not in (200, 201):
                raise RuntimeError(f"HubSpot contact creation failed: {create_res.text}")
            return str(create_res.json()["id"])

    async def log_call(
        self,
        access_token: str,
        call_data: dict[str, Any],
        external_contact_id: str | None = None,
    ) -> str:
        """Create call engagement object in HubSpot with recording URL and summary."""
        duration_s = float(call_data.get("duration_s", 0.0))
        summary = call_data.get("summary", "")
        sentiment = call_data.get("sentiment_label", "neutral").upper()
        outcome = call_data.get("outcome", "completed")
        recording_url = call_data.get("recording_url", "")
        call_id = call_data.get("call_id", "")

        if access_token.startswith("hs_access_mock") or access_token.startswith("mock_"):
            return f"hs_call_{call_id or 'mock'}"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        body_notes = f"AI Voice Consultation Summary:\n{summary}\n\nOutcome: {outcome}\nSentiment: {sentiment}"

        payload: dict[str, Any] = {
            "properties": {
                "hs_call_title": f"VedaVoice AI Call - {outcome}",
                "hs_call_body": body_notes,
                "hs_call_duration": str(int(duration_s * 1000)),
                "hs_call_status": "COMPLETED" if duration_s > 0 else "MISSED",
                "hs_call_recording_url": recording_url,
                "hs_timestamp": datetime.now(UTC).isoformat(),
            }
        }

        if external_contact_id:
            payload["associations"] = [
                {
                    "to": {"id": external_contact_id},
                    "types": [
                        {
                            "associationCategory": "HUBSPOT_DEFINED",
                            "associationTypeId": 194,  # call_to_contact association
                        }
                    ],
                }
            ]

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{self.BASE_API_URL}/crm/v3/objects/calls",
                headers=headers,
                json=payload,
            )
            if res.status_code not in (200, 201):
                raise RuntimeError(f"HubSpot log_call failed ({res.status_code}): {res.text}")
            return str(res.json()["id"])

    async def set_stage(self, access_token: str, external_contact_id: str, stage: str) -> None:
        """Update lead status stage in HubSpot."""
        if access_token.startswith("hs_access_mock") or access_token.startswith("mock_"):
            return

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.patch(
                f"{self.BASE_API_URL}/crm/v3/objects/contacts/{external_contact_id}",
                headers=headers,
                json={"properties": {"hs_lead_status": stage.upper()}},
            )
            if res.status_code not in (200, 201):
                raise RuntimeError(f"HubSpot set_stage failed ({res.status_code}): {res.text}")


class HubSpotAdapter:
    """Synchronous adapter wrapper for HubSpot operations."""

    def __init__(self, access_token: str, portal_id: str | None = None) -> None:
        self.access_token = access_token
        self.portal_id = portal_id

    def sync_contact(self, contact: Any) -> dict[str, Any]:
        name_parts = contact.name.split(" ", 1) if getattr(contact, "name", None) else ["", ""]
        return {
            "status": "success",
            "endpoint": "/crm/v3/objects/contacts",
            "payload": {
                "properties": {
                    "firstname": name_parts[0],
                    "lastname": name_parts[1] if len(name_parts) > 1 else "",
                    "phone": getattr(contact, "phone", ""),
                    "email": getattr(contact, "email", "") or "",
                    "address": getattr(contact, "address", "") or "",
                }
            },
        }

    def log_call(self, call: Any, contact: Any) -> dict[str, Any]:
        return self.log_call_activity(call, contact)

    def log_call_activity(self, call: Any, contact: Any) -> dict[str, Any]:
        sentiment_label = str(getattr(call, "sentiment_label", "neutral")).upper()
        sentiment_score = float(getattr(call, "sentiment_score", 0.0) or 0.0)
        return {
            "status": "success",
            "endpoint": "/crm/v3/objects/calls",
            "payload": {
                "properties": {
                    "hs_call_title": f"VedaVoice Call - {getattr(call, 'outcome', 'completed')}",
                    "hs_call_duration": str(int(getattr(call, "duration_s", 0) * 1000)),
                    "hs_call_status": "COMPLETED",
                    "hs_call_recording_url": getattr(call, "recording_url", None) or "",
                    "hs_call_body": f"Sentiment: {sentiment_label} ({sentiment_score:+.2f})\nSummary: {getattr(call, 'message', {}).get('summary', '') if isinstance(getattr(call, 'message', None), dict) else ''}",
                }
            },
        }
