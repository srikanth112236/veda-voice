"""Unit and API integration tests for Telnyx Carrier Telephony and SMS Service."""

import uuid

import pytest
from fastapi.testclient import TestClient

from api.app.core.config import settings
from api.app.main import app
from api.app.services.telnyx import TelnyxCarrierService

client = TestClient(app)


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


def test_telnyx_api_endpoints_end_to_end():
    """Verify FastAPI endpoints: carrier search, 1-click ordering, and outbound SMS dispatch."""
    # 1. Login as Platform Admin
    admin_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    assert admin_login.status_code == 200
    token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Test Carrier Search Endpoint
    search_res = client.get(
        "/api/v1/numbers/carrier/telnyx/search?area_code=312&limit=4",
        headers=headers,
    )
    assert search_res.status_code == 200
    data = search_res.json()
    assert len(data) == 4
    assert data[0]["phone_number"].startswith("+1312")
    assert data[0]["cost_monthly_usd"] == 1.00

    # 3. Test 1-Click Order Endpoint
    test_number = f"+1312555{uuid.uuid4().hex[:4]}"
    order_res = client.post(
        "/api/v1/numbers/carrier/telnyx/order",
        json={
            "phone_number": test_number,
            "label": "Downtown Dispatch Line",
            "locality": "Chicago, IL",
            "region": "IL",
        },
        headers=headers,
    )
    assert order_res.status_code == 200
    order_data = order_res.json()
    assert order_data["e164"] == test_number
    assert order_data["provider"] == "Telnyx SIP Carrier"
    assert order_data["monthly_cost_usd"] == 1.00

    # 4. Test Outbound SMS Endpoint
    sms_res = client.post(
        "/api/v1/numbers/carrier/telnyx/sms",
        json={
            "from_number": test_number,
            "to_number": "+18005550199",
            "text": "Your dispatch technician has been assigned.",
        },
        headers=headers,
    )
    assert sms_res.status_code == 200
    sms_data = sms_res.json()
    assert sms_data["status"] == "delivered"
    assert sms_data["from_number"] == test_number
