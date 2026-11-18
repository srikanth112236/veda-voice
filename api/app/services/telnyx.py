"""Telnyx Carrier Telephony and Messaging Service (v2 API).

Provides high-efficiency async capabilities for:
1. Searching available DID inventory (voice, SMS, toll-free)
2. 1-Click number ordering and auto-binding to LiveKit SIP connections
3. Two-way SMS messaging dispatch and receipt handling
4. Ed25519 webhook signature validation
"""

import base64
import logging
import uuid
from typing import Any

import httpx
from pydantic import BaseModel, Field

from api.app.core.config import settings

logger = logging.getLogger("vedavoice.telnyx")

TELNYX_API_BASE = "https://api.telnyx.com/v2"


class TelnyxNumberSearchResult(BaseModel):
    """Available phone number item returned from Telnyx carrier search."""

    phone_number: str
    national_format: str
    region_information: str
    locality: str
    country_code: str
    cost_monthly_usd: float = 1.00
    cost_upfront_usd: float = 1.00
    features: list[str] = Field(default_factory=lambda: ["voice", "sms"])
    provider: str = "telnyx"


class TelnyxOrderResult(BaseModel):
    """Result of ordering a phone number via Telnyx."""

    order_id: str
    phone_number: str
    status: str
    connection_id: str | None = None
    messaging_profile_id: str | None = None
    created_at: str


class TelnyxSMSResult(BaseModel):
    """Result of dispatching an SMS via Telnyx."""

    message_id: str
    from_number: str
    to_number: str
    status: str
    parts: int = 1
    cost_usd: float = 0.0040


class TelnyxCarrierService:
    """Async client managing Telnyx voice DIDs and SMS messaging."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.TELNYX_API_KEY
        self.is_live = bool(self.api_key and self.api_key.startswith("KEY"))

    def _get_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def search_numbers(
        self,
        country_code: str = "US",
        area_code: str | None = None,
        locality: str | None = None,
        limit: int = 8,
    ) -> list[TelnyxNumberSearchResult]:
        """Search available inventory for Voice and SMS capable numbers."""
        if not self.is_live:
            # Deterministic, realistic sandbox numbers when API key is not yet configured
            prefix = area_code if area_code and len(area_code) == 3 else "415"
            loc = locality or "San Francisco, CA"
            mock_results = []
            for i in range(1, limit + 1):
                clean_num = f"+1{prefix}555{1000 + i}"
                mock_results.append(
                    TelnyxNumberSearchResult(
                        phone_number=clean_num,
                        national_format=f"({prefix}) 555-{1000 + i}",
                        region_information=loc,
                        locality=loc,
                        country_code=country_code,
                        cost_monthly_usd=1.00,
                        cost_upfront_usd=1.00,
                        features=["voice", "sms", "mms"],
                        provider="telnyx",
                    )
                )
            return mock_results

        url = f"{TELNYX_API_BASE}/available_phone_numbers"
        params: dict[str, Any] = {
            "filter[country_code]": country_code,
            "filter[features][]": ["voice", "sms"],
            "filter[limit]": limit,
        }
        if area_code:
            params["filter[national_destination_code]"] = area_code
        if locality:
            params["filter[locality]"] = locality

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=self._get_headers(), params=params)
                if res.status_code != 200:
                    logger.error("Telnyx search error: %s - %s", res.status_code, res.text)
                    return []

                payload = res.json()
                results: list[TelnyxNumberSearchResult] = []
                for item in payload.get("data", []):
                    num = item.get("phone_number", "")
                    reg = item.get("region_information", [])
                    region_str = reg[0].get("region_name", "") if reg else country_code
                    loc_name = item.get("locality") or region_str
                    cost_info = item.get("cost_information", {})
                    monthly_cost = float(cost_info.get("monthly_rate", 1.00))
                    upfront_cost = float(cost_info.get("upfront_cost", 1.00))

                    results.append(
                        TelnyxNumberSearchResult(
                            phone_number=num,
                            national_format=num,
                            region_information=region_str,
                            locality=loc_name,
                            country_code=country_code,
                            cost_monthly_usd=monthly_cost,
                            cost_upfront_usd=upfront_cost,
                            features=[f.get("name", "") for f in item.get("features", [])],
                            provider="telnyx",
                        )
                    )
                return results
        except Exception as exc:
            logger.error("Telnyx search exception: %s", exc)
            return []

    async def order_number(
        self,
        phone_number: str,
        sip_connection_id: str | None = None,
        messaging_profile_id: str | None = None,
    ) -> TelnyxOrderResult:
        """Order a phone number and bind it to LiveKit SIP trunk and Messaging Profile."""
        conn_id = sip_connection_id or settings.TELNYX_SIP_CONNECTION_ID
        msg_id = messaging_profile_id or settings.TELNYX_MESSAGING_PROFILE_ID

        if not self.is_live:
            return TelnyxOrderResult(
                order_id=f"order_{uuid.uuid4().hex[:12]}",
                phone_number=phone_number,
                status="active",
                connection_id=conn_id,
                messaging_profile_id=msg_id,
                created_at="2026-11-18T12:00:00Z",
            )

        url = f"{TELNYX_API_BASE}/number_orders"
        body: dict[str, Any] = {
            "phone_numbers": [{"phone_number": phone_number}],
        }
        if conn_id and conn_id.strip():
            body["connection_id"] = conn_id.strip()
        if msg_id and msg_id.strip():
            body["messaging_profile_id"] = msg_id.strip()

        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=self._get_headers(), json=body)
            if res.status_code not in (200, 201, 202):
                raise RuntimeError(f"Telnyx number order failed: {res.status_code} - {res.text}")

            data = res.json().get("data", {})
            return TelnyxOrderResult(
                order_id=data.get("id", str(uuid.uuid4())),
                phone_number=phone_number,
                status=data.get("status", "pending"),
                connection_id=conn_id,
                messaging_profile_id=msg_id,
                created_at=data.get("created_at", "2026-11-18T12:00:00Z"),
            )

    async def send_sms(
        self,
        from_number: str,
        to_number: str,
        text: str,
        messaging_profile_id: str | None = None,
    ) -> TelnyxSMSResult:
        """Send an outbound SMS message via Telnyx Messaging API."""
        msg_id = messaging_profile_id or settings.TELNYX_MESSAGING_PROFILE_ID

        if not self.is_live:
            logger.info(
                "[Telnyx Mock SMS] From: %s | To: %s | Text: %s",
                from_number,
                to_number,
                text[:60],
            )
            return TelnyxSMSResult(
                message_id=f"msg_{uuid.uuid4().hex[:14]}",
                from_number=from_number,
                to_number=to_number,
                status="delivered",
                parts=1,
                cost_usd=0.0040,
            )

        url = f"{TELNYX_API_BASE}/messages"
        payload: dict[str, Any] = {
            "from": from_number,
            "to": to_number,
            "text": text,
        }
        if msg_id and msg_id.strip():
            payload["messaging_profile_id"] = msg_id.strip()

        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, headers=self._get_headers(), json=payload)
            if res.status_code not in (200, 201, 202):
                raise RuntimeError(f"Telnyx SMS dispatch failed: {res.status_code} - {res.text}")

            data = res.json().get("data", {})
            cost_amount = 0.0040
            if "cost" in data and data["cost"] and "amount" in data["cost"]:
                try:
                    cost_amount = float(data["cost"]["amount"])
                except Exception:
                    pass

            return TelnyxSMSResult(
                message_id=data.get("id", str(uuid.uuid4())),
                from_number=from_number,
                to_number=to_number,
                status=data.get("to", [{}])[0].get("status", "queued"),
                parts=int(data.get("parts", 1)),
                cost_usd=cost_amount,
            )

    def verify_webhook_signature(
        self,
        payload_bytes: bytes,
        signature_b64: str,
        timestamp_str: str,
        public_key_b64: str | None = None,
    ) -> bool:
        """Verify Telnyx Ed25519 webhook signature for tamper-proof inbound messaging."""
        pub_key = public_key_b64 or settings.TELNYX_PUBLIC_KEY
        if not pub_key or not self.is_live:
            # In development/test mode without public key, bypass verification
            return True

        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

            public_bytes = base64.b64decode(pub_key)
            signature_bytes = base64.b64decode(signature_b64)
            signed_data = f"{timestamp_str}|".encode() + payload_bytes

            verifier = Ed25519PublicKey.from_public_bytes(public_bytes)
            verifier.verify(signature_bytes, signed_data)
            return True
        except Exception as exc:
            logger.warning("Telnyx webhook signature verification failed: %s", exc)
            return False


# Singleton service instance
telnyx_service = TelnyxCarrierService()
