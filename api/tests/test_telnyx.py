"""Unit tests for Telnyx Carrier Telephony and SMS Service."""

import pytest

from api.app.services.telnyx import TelnyxCarrierService


@pytest.mark.asyncio
async def test_telnyx_search_numbers_mock_fallback():
    """Verify number search returns structured, voice-enabled numbers with 100% reliability."""
    service = TelnyxCarrierService(api_key="")
    numbers = await service.search_numbers(country_code="US", area_code="415", limit=5)

    assert len(numbers) == 5
    first = numbers[0]
    assert first.phone_number.startswith("+1415")
    assert "voice" in first.features
    assert "sms" in first.features
    assert first.provider == "telnyx"
    assert first.cost_monthly_usd == 1.00


@pytest.mark.asyncio
async def test_telnyx_order_number_mock():
    """Verify ordering a number successfully binds to SIP connection and messaging profile."""
    service = TelnyxCarrierService(api_key="")
    result = await service.order_number(
        phone_number="+14155551001",
        sip_connection_id="conn_livekit_sip_123",
        messaging_profile_id="msg_prof_sms_456",
    )

    assert result.phone_number == "+14155551001"
    assert result.status == "active"
    assert result.connection_id == "conn_livekit_sip_123"
    assert result.messaging_profile_id == "msg_prof_sms_456"
    assert result.order_id.startswith("order_")


@pytest.mark.asyncio
async def test_telnyx_send_sms_mock():
    """Verify sending an SMS returns delivery receipt, parts count, and cost."""
    service = TelnyxCarrierService(api_key="")
    result = await service.send_sms(
        from_number="+14155551001",
        to_number="+18005550199",
        text="Apex Plumbing: Your technician is arriving in 15 minutes.",
    )

    assert result.message_id.startswith("msg_")
    assert result.from_number == "+14155551001"
    assert result.to_number == "+18005550199"
    assert result.status == "delivered"
    assert result.cost_usd == 0.0040
    assert result.parts == 1


def test_telnyx_webhook_signature_verification_fallback():
    """Verify signature verification safely handles dev/test environments without failure."""
    service = TelnyxCarrierService(api_key="")
    verified = service.verify_webhook_signature(
        payload_bytes=b'{"data":{"event_type":"message.received"}}',
        signature_b64="dummy_sig",
        timestamp_str="1795000000",
    )
    assert verified is True
