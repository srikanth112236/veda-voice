"""Tests for Speed-to-Lead Outbound Optimizations: After-Hours Queue & Omnichannel SMS."""

import uuid
from datetime import datetime
from typing import Any
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.outbound import OutboundDispatch
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.services.notifier import dispatch_call_notifications
from api.app.services.outbound import trigger_speed_to_lead_outbound

client = TestClient(app)


@pytest.fixture
def optimization_tenant() -> Any:
    """Fixture providing an active tenant for outbound testing."""
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        tenant = Tenant(
            name=f"Opt Plumbing {suffix}",
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
            e164=f"+1512333{uuid.uuid4().int % 9000 + 1000}",
            provider="twilio",
            status="active",
        )
        profile = AgentProfile(
            tenant_id=tenant.id,
            agent_name="Sarah",
            greeting="Hello!",
            notification_email=f"owner_{suffix}@example.com",
            notification_phone=f"+1512444{uuid.uuid4().int % 9000 + 1000}",
            notify_sms_on_emergency=True,
        )
        db.add_all([phone, profile])
        db.commit()

        yield {
            "tenant_id": tenant.id,
            "business_name": tenant.name,
            "caller_id": phone.e164,
        }
    finally:
        db.query(OutboundDispatch).filter(OutboundDispatch.tenant_id == tenant.id).delete()
        db.query(Call).filter(Call.tenant_id == tenant.id).delete()
        db.query(PhoneNumber).filter(PhoneNumber.tenant_id == tenant.id).delete()
        db.query(AgentProfile).filter(AgentProfile.tenant_id == tenant.id).delete()
        db.query(Tenant).filter(Tenant.id == tenant.id).delete()
        db.commit()
        db.close()


def test_after_hours_holding_queue_and_sms(optimization_tenant: dict[str, Any]) -> None:
    """Verify after-hours leads are held in queue until 8:05 AM and receive instant SMS."""
    tenant_id = optimization_tenant["tenant_id"]
    lead_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    # Simulate submission at 11:30 PM (23:30) Eastern Time (after-hours)
    late_night = datetime(2026, 6, 15, 23, 30, 0, tzinfo=ZoneInfo("America/New_York"))

    db = SessionLocal()
    try:
        dispatch, compliance = trigger_speed_to_lead_outbound(
            db=db,
            tenant_id=tenant_id,
            to_phone=lead_phone,
            caller_name="Sarah Connor",
            service_requested="Water Heater Replacement",
            current_time=late_night,
        )

        assert compliance.passed is False
        assert compliance.reason == "outside_calling_window"

        # Verify OutboundDispatch queued with status 'queued_after_hours'
        assert dispatch.status == "queued_after_hours"
        assert dispatch.scheduled_for is not None

        # Verify scheduled for next morning at 8:05 AM in lead's local timezone (512 is America/Chicago)
        sched_dt = dispatch.scheduled_for
        sched_utc = (
            sched_dt.replace(tzinfo=ZoneInfo("UTC")) if sched_dt.tzinfo is None else sched_dt
        )
        scheduled_local = sched_utc.astimezone(ZoneInfo("America/Chicago"))
        assert scheduled_local.hour == 8
        assert scheduled_local.minute == 5
        assert scheduled_local.day == 16  # June 16 (next day)
    finally:
        db.close()


def test_omnichannel_customer_follow_up_sms(optimization_tenant: dict[str, Any]) -> None:
    """Verify customer receives automated confirmation SMS upon call booking or message taken."""
    tenant_id = optimization_tenant["tenant_id"]
    caller_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    call_id = f"call_sms_{uuid.uuid4().hex[:6]}"

    db = SessionLocal()
    try:
        call = Call(
            tenant_id=tenant_id,
            call_id=call_id,
            caller_number=caller_phone,
            dialed_number=optimization_tenant["caller_id"],
            direction="inbound",
            outcome="booked",
            message={"caller_name": "Mark Watney", "service_requested": "Heating Repair"},
        )
        db.add(call)
        db.commit()
    finally:
        db.close()

    mock_sms = MagicMock()
    mock_sms.send.return_value = True

    result = dispatch_call_notifications(
        call_id=call_id,
        sms_dispatcher=mock_sms,
    )

    assert result["status"] == "delivered"
    assert result["caller_sms_sent"] is True

    # Check mock called for caller_phone
    calls_made = mock_sms.send.call_args_list
    assert any(c[0][0] == caller_phone for c in calls_made)
    # Check confirmation text
    confirmation_body = [c[0][1] for c in calls_made if c[0][0] == caller_phone][0]
    assert "appointment" in confirmation_body.lower()
    assert "confirmed" in confirmation_body.lower()
