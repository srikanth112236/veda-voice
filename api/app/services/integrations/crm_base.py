"""Base protocol and data contracts for external CRM synchronizers per SRS Addendum v1.1 Section 3.2."""

from __future__ import annotations

from typing import Any, Protocol


class CrmProvider(Protocol):
    """Protocol implemented by external CRM connectors (HubSpot, GHL, Pipedrive, Zoho)."""

    def authorize_url(self, tenant_id: str, state: str, redirect_uri: str) -> str:
        """Generate vendor OAuth 2.0 authorization URL."""
        ...

    async def exchange_code(self, code: str, redirect_uri: str) -> dict[str, Any]:
        """Exchange authorization code for token set."""
        ...

    async def refresh_tokens(self, refresh_token: str) -> dict[str, Any]:
        """Refresh expired access token."""
        ...

    async def upsert_contact(self, access_token: str, contact_data: dict[str, Any]) -> str:
        """Idempotently upsert contact and return external CRM object ID."""
        ...

    async def log_call(
        self,
        access_token: str,
        call_data: dict[str, Any],
        external_contact_id: str | None = None,
    ) -> str:
        """Log call engagement and return external call/activity ID."""
        ...

    async def set_stage(self, access_token: str, external_contact_id: str, stage: str) -> None:
        """Update lifecycle or lead status stage in external CRM."""
        ...


class BaseCRMAdapter:
    """Base adapter class for external CRM connectors."""

    def sync_contact(self, contact: Any) -> dict[str, Any]:
        """Format and payload for contact synchronization."""
        raise NotImplementedError

    def log_call_activity(self, call: Any, contact: Any) -> dict[str, Any]:
        """Format and payload for call activity note synchronization."""
        raise NotImplementedError
