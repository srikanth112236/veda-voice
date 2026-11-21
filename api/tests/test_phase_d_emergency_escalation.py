"""Unit and integration tests for Phase D: Life Safety & Urgent Escalation (Whisper Briefings & SMS Dispatch)."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.models.call import Call
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.tenant import Tenant
from api.app.routers.internal import CallTransferRequest, handle_call_transfer
from api.app.services.notifier import (
    dispatch_emergency_transfer_alert,
    format_emergency_transfer_sms,
)


@pytest.fixture
def db_session():
    with SessionLocal() as db:
        yield db


def test_format_and_dispatch_emergency_transfer_sms(db_session):
    """Verify emergency transfer SMS alert formatting and dispatch execution."""
    sms_text = format_emergency_transfer_sms(
        business_name="Apex Comfort Systems",
        customer_name="Robert Miller",
        customer_phone="+15125550144",
        reason="gas_smell_in_basement",
        whisper_briefing="Strong natural gas smell detected near furnace",
        service_address="4104 Burnet Rd, Austin TX",
    )

    assert "🚨 EMERGENCY DISPATCH [Apex Comfort Systems]" in sms_text
    assert "Robert Miller" in sms_text
    assert "+15125550144" in sms_text
    assert "gas_smell_in_basement" in sms_text
    assert "4104 Burnet Rd" in sms_text
    assert "Strong natural gas smell" in sms_text

    # Test dispatch
    mock_dispatcher = MagicMock()
    mock_dispatcher.send.return_value = True

    tenant_id = f"ten_esc_{uuid.uuid4().hex[:8]}"
    tenant = Tenant(id=tenant_id, name="Apex Comfort Systems", status="active")
    db_session.add(tenant)
    db_session.commit()

    sent = dispatch_emergency_transfer_alert(
        tenant_id=tenant_id,
        recipient_phone="+15125550999",
        customer_name="Robert Miller",
        customer_phone="+15125550144",
        reason="gas_smell_in_basement",
        whisper_briefing="Strong natural gas smell detected near furnace",
        service_address="4104 Burnet Rd, Austin TX",
        call_id="call_esc_1",
        sms_dispatcher=mock_dispatcher,
        db=db_session,
    )
    assert sent is True
    assert mock_dispatcher.send.called
    to_phone, body = mock_dispatcher.send.call_args[1].values()
    assert to_phone == "+15125550999"
    assert "Apex Comfort Systems" in body


@pytest.mark.asyncio
async def test_handle_call_transfer_emergency_persists_briefing_and_crm(db_session):
    """Verify internal /calls/transfer with priority='emergency' persists whisper briefing and emits CRM timeline event."""
    tenant_id = f"ten_trans_{uuid.uuid4().hex[:8]}"
    tenant = Tenant(id=tenant_id, name="Peak Plumbing Co", status="active")
    db_session.add(tenant)

    contact_id = f"cnt_{uuid.uuid4().hex[:8]}"
    contact = Contact(
        id=contact_id,
        tenant_id=tenant_id,
        name="Sarah Jenkins",
        phone="+15125550177",
        source="inbound_call",
    )
    db_session.add(contact)

    call_id = f"call_warm_{uuid.uuid4().hex[:8]}"
    call = Call(
        id=f"c_rec_{uuid.uuid4().hex[:8]}",
        tenant_id=tenant_id,
        contact_id=contact_id,
        call_id=call_id,
        caller_number="+15125550177",
        dialed_number="+18005550199",
        outcome="in_progress",
        urgency="emergency",
    )
    db_session.add(call)
    db_session.commit()

    call_token = create_access_token(
        {"sub": "livekit-agent", "role": "agent", "tenant_id": tenant_id, "call_id": call_id}
    )

    whisper = "Critical: Burst pipe in second floor bathroom flooding ceiling."
    req = CallTransferRequest(
        call_id=call_id,
        target_number="+15125550911",
        reason="burst_pipe_flooding",
        priority="emergency",
        notes="Urgent on-call technician dispatch",
        whisper_briefing=whisper,
        caller_name="Sarah Jenkins",
        caller_phone="+15125550177",
        service_address="1200 S Congress Ave, Austin TX",
        emergency_details={"hazard": "burst_pipe", "shutoff_verified": False},
    )

    res = await handle_call_transfer(
        payload=req,
        x_call_token=call_token,
        db=db_session,
    )
    assert res["success"] is True
    assert res["status"] == "transferred"
    assert res["priority"] == "emergency"
    assert res["whisper_briefing"] == whisper

    # Verify Call Record in DB
    updated_call = db_session.scalar(select(Call).where(Call.call_id == call_id))
    assert updated_call is not None
    assert updated_call.outcome == "transferred"
    assert updated_call.transfer_to_number == "+15125550911"
    assert updated_call.whisper_briefing == whisper
    assert updated_call.emergency_recipient_phone == "+15125550911"
    assert updated_call.emergency_alert_dispatched is True
    assert "emergency_transfer" in updated_call.tags

    # Verify CRM Timeline Event
    events = db_session.scalars(
        select(ContactTimelineEvent).where(
            ContactTimelineEvent.contact_id == contact_id,
            ContactTimelineEvent.event_type == "emergency_escalated",
        )
    ).all()
    assert len(events) == 1
    assert "Emergency Escalation" in events[0].title
    assert "+15125550911" in events[0].description
    assert events[0].payload["whisper_briefing"] == whisper
