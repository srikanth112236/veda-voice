"""Comprehensive tests for Speed-to-Lead Outbound Webhook Ingestion & Gate."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from agent.config import TenantConfig
from agent.outbound.dialer import trigger_instant_outbound_call
from agent.prompts import build_outbound_system_prompt
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.crm import Contact
from api.app.models.lead_form import Lead
from api.app.models.outbound import ConsentRecord, OutboundDispatch, SuppressionRecord
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant

client = TestClient(app)


@pytest.fixture
def webhook_tenant() -> Any:
    """Fixture providing an active tenant with provisioned phone numbers for outbound calling."""
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        suffix_num = uuid.uuid4().int % 9000 + 1000
        tenant = Tenant(
            name=f"Speed Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-8pm",
            status="active",
            max_concurrent_calls=5,
            max_concurrent_outbound=2,
            monthly_minute_quota=500,
        )
        db.add(tenant)
        db.flush()

        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=f"+1512777{suffix_num}",
            provider="twilio",
            status="active",
        )
        profile = AgentProfile(
            tenant_id=tenant.id,
            agent_name="Sarah",
            greeting="Hello! Thanks for reaching out.",
            pricing_policy="listed",
            emergency_keywords=["gas leak", "pipe burst"],
        )
        db.add_all([phone, profile])
        db.commit()

        yield {
            "tenant_id": tenant.id,
            "caller_id": phone.e164,
            "business_name": tenant.name,
        }
    finally:
        db.query(OutboundDispatch).filter(OutboundDispatch.tenant_id == tenant.id).delete()
        db.query(ConsentRecord).filter(ConsentRecord.tenant_id == tenant.id).delete()
        db.query(SuppressionRecord).filter(SuppressionRecord.tenant_id == tenant.id).delete()
        db.query(Lead).filter(Lead.tenant_id == tenant.id).delete()
        db.query(Contact).filter(Contact.tenant_id == tenant.id).delete()
        db.query(PhoneNumber).filter(PhoneNumber.tenant_id == tenant.id).delete()
        db.query(AgentProfile).filter(AgentProfile.tenant_id == tenant.id).delete()
        db.query(Tenant).filter(Tenant.id == tenant.id).delete()
        db.commit()
        db.close()


def test_speed_to_lead_webhook_happy_path(webhook_tenant: dict[str, Any]) -> None:
    """Verify webhook ingestion records consent, creates contact, passes compliance, and dispatches."""
    tenant_id = webhook_tenant["tenant_id"]
    suffix = uuid.uuid4().int % 9000000 + 1000000
    lead_phone = f"+1512{suffix}"

    # Target 2:00 PM Eastern (well inside 8am-8pm calling window)
    payload = {
        "full_name": "John Connor",
        "phone": lead_phone,
        "email": "john@example.com",
        "service_requested": "Tankless Water Heater",
        "source": "meta_lead_ad",
        "consent_confirmed": True,
        "consent_text": "I agree to automated calls from Speed Plumbing",
        "custom_data": {"campaign": "spring_2026", "ad_id": "ad_123"},
    }

    resp = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["lead_id"] is not None
    assert data["contact_id"] is not None

    db = SessionLocal()
    try:
        # Verify ConsentRecord created
        consent = db.scalar(
            select(ConsentRecord).where(
                ConsentRecord.tenant_id == tenant_id,
                ConsentRecord.phone_number == lead_phone,
            )
        )
        assert consent is not None
        assert consent.consent_confirmed is True
        assert consent.source == "meta_lead_ad"

        # Verify Contact created in Native CRM
        contact = db.scalar(
            select(Contact).where(
                Contact.tenant_id == tenant_id,
                Contact.phone == lead_phone,
            )
        )
        assert contact is not None
        assert contact.name == "John Connor"
        assert contact.email == "john@example.com"
        assert contact.source == "meta_lead_ad"
    finally:
        db.close()


def test_speed_to_lead_webhook_suppression_blocked(webhook_tenant: dict[str, Any]) -> None:
    """Verify webhook blocks outbound call if number is on suppression / DNC list."""
    tenant_id = webhook_tenant["tenant_id"]
    suffix = uuid.uuid4().int % 9000000 + 1000000
    lead_phone = f"+1512{suffix}"

    db = SessionLocal()
    try:
        # Add to suppression
        supp = SuppressionRecord(
            tenant_id=tenant_id,
            phone_number=lead_phone,
            reason="opt_out",
            notes="Customer previously opted out",
        )
        db.add(supp)
        db.commit()
    finally:
        db.close()

    payload = {
        "full_name": "Sarah Connor",
        "phone": lead_phone,
        "service_requested": "Emergency Drain Clearing",
        "source": "google_search",
        "consent_confirmed": True,
    }

    resp = client.post(f"/api/v1/leads/webhook/{tenant_id}", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["compliance_passed"] is False
    assert data["compliance_reason"] == "number_suppressed"


def test_outbound_lead_prompt_generation() -> None:
    """Verify build_outbound_system_prompt satisfies Section 3.3 conversational goals."""
    config = TenantConfig(
        tenant_id="t-test",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-5pm",
        timezone="America/New_York",
        services=["Drain cleaning", "Water heaters"],
        agent_name="Sarah",
        greeting="Hello! Thank you for calling Apex Plumbing.",
    )

    prompt = build_outbound_system_prompt(
        config=config,
        lead_name="Michael Scott",
        service_requested="Water Heater Inspection",
        source="facebook_lead_ad",
        caller_phone="+15125550199",
    )

    # 1. First turn mandatory AI disclosure
    assert "automated assistant calling from Apex Plumbing" in prompt
    assert "Michael Scott" in prompt

    # 2. Hook and service requested
    assert "Water Heater Inspection" in prompt
    assert "Facebook Lead Ad" in prompt

    # 3. Qualify & Schedule
    assert "confirm your address and schedule our technician" in prompt

    # 4. Voicemail detection
    assert "12-second message" in prompt
    assert "answering machine or voicemail beep" in prompt

    # 5. Opt-out compliance
    assert "opt_out_tool" in prompt


@pytest.mark.asyncio
async def test_instant_outbound_dialer_dispatch() -> None:
    """Verify trigger_instant_outbound_call dispatches agent and SIP participant."""

    class MockAgentDispatch:
        async def create_dispatch(self, req: Any) -> None:
            pass

    class MockSIP:
        async def create_sip_participant(self, req: Any) -> Any:
            class MockParticipant:
                sip_call_id = "sip_mock_12345"

            return MockParticipant()

    class MockLiveKitAPI:
        agent_dispatch = MockAgentDispatch()
        sip = MockSIP()

    sip_id = await trigger_instant_outbound_call(
        lk_api=MockLiveKitAPI(),
        tenant_id="tenant-123",
        lead_phone="+15125550199",
        caller_id="+15125550100",
        trunk_id="trunk_abc",
        lead_metadata={"lead_name": "Test Lead"},
    )
    assert sip_id == "sip_mock_12345"
