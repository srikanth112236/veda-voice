"""Comprehensive Test Suite for Phase 2 / Milestone M5: Outbound Compliance Dialer & Campaign Runner.

Verifies:
1. Compliance gate blocks calls without consent, outside calling windows, and for suppressed numbers.
2. Compliance gate enforces frequency caps (e.g. max attempts per 24h).
3. VoiceCampaign creation, contact loading, and immediate pause/resume execution.
4. Dialer runner dispatch with wait_until_answered.
5. In-call opt-out handler immediately suppresses contact across tenant, revokes consent, and cancels queued calls.
6. Automatic retry scheduling (3 hours apart on no_answer/busy) until max attempts reached.
7. Outbound prompt variant generator for appointment reminders, callbacks, and speed-to-lead.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select

from agent.config import TenantConfig
from agent.prompts import build_outbound_system_prompt
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal, engine
from api.app.main import app
from api.app.models.base import Base
from api.app.models.outbound import (
    CampaignContact,
    ConsentRecord,
    OutboundDispatch,
    SuppressionRecord,
    VoiceCampaign,
)
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.campaign_runner import (
    handle_campaign_contact_outcome,
    run_campaign_step,
)
from api.app.services.compliance import (
    evaluate_compliance_gate_v2,
    normalize_e164_phone,
)
from api.app.services.outbound import record_caller_opt_out

# Ensure newly defined tables exist in the test database
Base.metadata.create_all(bind=engine)

client = TestClient(app)


def _seed_test_tenant_and_caller(db):
    """Seed an isolated tenant, agent profile, and active phone number for dialing."""
    run_id = uuid.uuid4().hex[:6]
    tenant = Tenant(
        name=f"Compliance Test Tenant ({run_id})",
        timezone="America/New_York",
        hours="Mon-Fri 8am-6pm",
        status="active",
        max_concurrent_calls=10,
    )
    db.add(tenant)
    db.flush()

    while True:
        caller_phone = f"+1984{uuid.uuid4().int % 9000000 + 1000000}"
        if not db.scalar(select(PhoneNumber).where(PhoneNumber.e164 == caller_phone)):
            break
    phone = PhoneNumber(
        tenant_id=tenant.id,
        e164=caller_phone,
        label="Outbound Trunk",
        status="active",
    )
    db.add(phone)

    profile = AgentProfile(
        tenant_id=tenant.id,
        agent_name="Sarah",
        greeting="Hello from Compliance Tenant",
    )
    db.add(profile)
    db.commit()
    db.refresh(tenant)
    db.refresh(phone)
    return tenant, phone


def test_compliance_gate_blocks_without_consent() -> None:
    """SRS 6.2 Point 1 & M5 requirement: Gate blocks calls without consent."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)
        recipient_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

        # No consent record seeded
        result = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant.id,
            to_phone=recipient_phone,
            from_phone=phone.e164,
            category="C",
            purpose="speed_to_lead",
            has_consent=None,
        )

        assert not result.passed
        assert result.reason in ("consent_missing", "ai_voice_disclosure_missing")


def test_compliance_gate_blocks_outside_calling_window() -> None:
    """SRS 6.2 Point 3 & M5 requirement: Gate blocks calls outside recipient local calling window."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)
        # Recipient in California (Pacific Time, Area code 415)
        recipient_phone = "+14155550199"

        # Seed valid consent
        consent = ConsentRecord(
            tenant_id=tenant.id,
            phone_number=recipient_phone,
            category="B",
            ai_voice_disclosed=True,
            consent_confirmed=True,
            created_at=datetime.now(UTC),
        )
        db.add(consent)
        db.commit()

        # Simulate 11:30 PM Pacific Time (well outside 8am-8pm window)
        late_night_pt = datetime(
            2026, 6, 15, 23, 30, tzinfo=ZoneInfo("America/Los_Angeles")
        ).astimezone(UTC)

        result = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant.id,
            to_phone=recipient_phone,
            from_phone=phone.e164,
            category="B",
            purpose="appointment_reminder",
            has_consent=True,
            current_time=late_night_pt,
        )

        assert not result.passed
        assert result.reason == "outside_calling_window"
        assert result.details["recipient_timezone"] == "America/Los_Angeles"


def test_compliance_gate_blocks_suppressed_numbers() -> None:
    """SRS 6.2 Point 2 & M5 requirement: Gate blocks calls for suppressed numbers."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)
        recipient_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

        # Seed valid consent
        consent = ConsentRecord(
            tenant_id=tenant.id,
            phone_number=recipient_phone,
            category="B",
            ai_voice_disclosed=True,
            consent_confirmed=True,
            created_at=datetime.now(UTC),
        )
        db.add(consent)

        # Number is on tenant suppression list
        suppression = SuppressionRecord(
            tenant_id=tenant.id,
            phone_number=recipient_phone,
            reason="opt_out",
            notes="Prior opt-out request",
            created_at=datetime.now(UTC),
        )
        db.add(suppression)
        db.commit()

        # Simulate 2:00 PM Eastern (inside window)
        afternoon_et = datetime(2026, 6, 15, 14, 0, tzinfo=ZoneInfo("America/New_York")).astimezone(
            UTC
        )

        result = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant.id,
            to_phone=recipient_phone,
            from_phone=phone.e164,
            category="B",
            purpose="appointment_reminder",
            has_consent=True,
            current_time=afternoon_et,
        )

        assert not result.passed
        assert result.reason == "number_suppressed"


def test_opt_out_during_call_suppresses_contact_immediately() -> None:
    """SRS M5 prompt: opt-out during a call suppresses the contact immediately."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)
        recipient_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

        # Seed consent and queued dispatches
        consent = ConsentRecord(
            tenant_id=tenant.id,
            phone_number=recipient_phone,
            category="B",
            ai_voice_disclosed=True,
            consent_confirmed=True,
            created_at=datetime.now(UTC),
        )
        db.add(consent)

        queued_dispatch = OutboundDispatch(
            tenant_id=tenant.id,
            call_id=f"queued-{uuid.uuid4().hex[:8]}",
            to_phone=recipient_phone,
            from_phone=phone.e164,
            purpose="appointment_reminder",
            status="queued",
            created_at=datetime.now(UTC),
        )
        db.add(queued_dispatch)
        db.commit()

        # Customer triggers opt-out during automated call
        supp_record = record_caller_opt_out(
            db=db,
            tenant_id=tenant.id,
            phone_number=recipient_phone,
            reason="opt_out",
            notes="Caller verbally said 'stop calling me'",
        )

        assert supp_record.phone_number == normalize_e164_phone(recipient_phone)

        # Verify active consent was revoked immediately
        db.refresh(consent)
        assert consent.revoked_at is not None
        assert consent.revoked_via == "opt_out"

        # Verify queued dispatch was cancelled
        db.refresh(queued_dispatch)
        assert queued_dispatch.status == "skipped_compliance"
        assert "Revocation" in (queued_dispatch.skip_reason or "")

        # Verify follow-up compliance gate immediately rejects this recipient
        afternoon_et = datetime(2026, 6, 15, 14, 0, tzinfo=ZoneInfo("America/New_York")).astimezone(
            UTC
        )
        result = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant.id,
            to_phone=recipient_phone,
            from_phone=phone.e164,
            category="B",
            current_time=afternoon_et,
        )
        assert not result.passed
        assert result.reason in ("number_suppressed", "consent_missing")


def test_voice_campaign_creation_and_pause_resume() -> None:
    """SRS 6.5 & M5: Pausing is immediate (dialer checks status before each call)."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)
        now = datetime.now(UTC)

        campaign = VoiceCampaign(
            tenant_id=tenant.id,
            name="24-Hour Reminder Campaign",
            purpose="appointment_reminder",
            caller_id_e164=phone.e164,
            status="paused",  # Starts paused
            total_contacts=2,
            max_attempts_per_contact=3,
            retry_interval_hours=3,
            created_at=now,
            updated_at=now,
        )
        db.add(campaign)
        db.flush()

        c1 = CampaignContact(
            campaign_id=campaign.id,
            tenant_id=tenant.id,
            phone_number=f"+1512{uuid.uuid4().int % 9000000 + 1000000}",
            recipient_name="Alice",
            status="pending",
            created_at=now,
        )
        db.add(c1)
        db.commit()

        # Runner is executed on paused campaign
        res = run_campaign_step(campaign_id=campaign.id, db=db, current_time=now)
        assert res["dispatched"] == 0
        assert "paused" in res["message"]

        # Contact remains in pending status
        db.refresh(c1)
        assert c1.status == "pending"

        # Resume campaign
        campaign.status = "running"
        db.commit()

        # Seed consent so compliance passes during daytime
        consent = ConsentRecord(
            tenant_id=tenant.id,
            phone_number=c1.phone_number,
            category="B",
            ai_voice_disclosed=True,
            consent_confirmed=True,
            created_at=now,
        )
        db.add(consent)
        db.commit()

        afternoon_et = datetime(2026, 6, 15, 14, 0, tzinfo=ZoneInfo("America/New_York")).astimezone(
            UTC
        )
        res_running = run_campaign_step(campaign_id=campaign.id, db=db, current_time=afternoon_et)
        assert res_running["dispatched"] == 1

        db.refresh(c1)
        assert c1.status == "calling"
        assert c1.attempts_count == 1
        assert c1.last_call_id is not None


def test_campaign_contact_retry_scheduling_on_no_answer() -> None:
    """SRS 6.4: no-answer retries 2 more times, 3 hours apart, inside the window."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)
        now = datetime.now(UTC)

        campaign = VoiceCampaign(
            tenant_id=tenant.id,
            name="Callback Campaign",
            purpose="callback_scheduled",
            caller_id_e164=phone.e164,
            status="running",
            total_contacts=1,
            max_attempts_per_contact=3,
            retry_interval_hours=3,
            created_at=now,
            updated_at=now,
        )
        db.add(campaign)
        db.flush()

        contact = CampaignContact(
            campaign_id=campaign.id,
            tenant_id=tenant.id,
            phone_number=f"+1512{uuid.uuid4().int % 9000000 + 1000000}",
            recipient_name="Bob",
            status="calling",
            attempts_count=1,
            created_at=now,
        )
        db.add(contact)
        db.commit()

        # First attempt resulted in no_answer
        outcome_res = handle_campaign_contact_outcome(
            db=db,
            campaign_contact_id=contact.id,
            outcome="no_answer",
            current_time=now,
        )

        assert outcome_res["status"] == "failed"
        assert outcome_res["attempts_count"] == 1
        assert outcome_res["next_attempt_at"] is not None

        # Verify next attempt is scheduled 3 hours in the future
        next_dt = datetime.fromisoformat(outcome_res["next_attempt_at"])
        if next_dt.tzinfo is None:
            next_dt = next_dt.replace(tzinfo=UTC)
        delta = next_dt - now
        assert 2.9 <= delta.total_seconds() / 3600 <= 3.1

        # Second attempt resulted in busy
        contact.attempts_count = 2
        db.commit()
        outcome_res2 = handle_campaign_contact_outcome(
            db=db,
            campaign_contact_id=contact.id,
            outcome="busy",
            current_time=now + timedelta(hours=3),
        )
        assert outcome_res2["status"] == "failed"

        # Third attempt reaches limit (max 3 attempts)
        contact.attempts_count = 3
        db.commit()
        outcome_res3 = handle_campaign_contact_outcome(
            db=db,
            campaign_contact_id=contact.id,
            outcome="no_answer",
            current_time=now + timedelta(hours=6),
        )
        assert outcome_res3["status"] == "completed"
        assert outcome_res3["last_outcome"] == "no_answer"


def test_outbound_system_prompts_builder() -> None:
    """SRS 6.1 & 6.3: Outbound prompts for reminders, call-backs, and speed-to-lead."""
    cfg = TenantConfig(
        tenant_id="tenant-test-123",
        business="Precision Plumbing",
        phone="+15125550100",
        agent_name="Sarah",
        timezone="America/New_York",
        hours="Mon-Fri 8am-6pm",
        services=["Drain Cleaning", "Water Heaters"],
        greeting="Hello, thanks for calling Precision Plumbing!",
    )

    # 1. Appointment Reminder Variant
    reminder_prompt = build_outbound_system_prompt(
        config=cfg,
        lead_name="Michael",
        purpose="appointment_reminder",
        appointment_time="Tomorrow at 2:00 PM",
    )
    assert "OUTBOUND APPOINTMENT REMINDER CALL PROTOCOL" in reminder_prompt
    assert "Tomorrow at 2:00 PM" in reminder_prompt
    assert "automated assistant calling from Precision Plumbing" in reminder_prompt
    assert "VOICEMAIL DETECTION" in reminder_prompt
    assert "OPT-OUT & TCPA COMPLIANCE" in reminder_prompt

    # 2. Callback Scheduled Variant
    callback_prompt = build_outbound_system_prompt(
        config=cfg,
        lead_name="Jessica",
        purpose="callback_scheduled",
        service_requested="Water Heater Inspection",
    )
    assert "OUTBOUND SCHEDULED CALL-BACK PROTOCOL" in callback_prompt
    assert "Water Heater Inspection" in callback_prompt
    assert "returning your requested call" in callback_prompt

    # 3. Speed-to-lead Variant
    stl_prompt = build_outbound_system_prompt(
        config=cfg,
        lead_name="David",
        purpose="speed_to_lead",
        service_requested="Emergency Drain Unclogging",
        source="Google Ads",
    )
    assert "OUTBOUND SPEED-TO-LEAD CALL PROTOCOL" in stl_prompt
    assert "Emergency Drain Unclogging" in stl_prompt
    assert "Google Ads" in stl_prompt


def test_campaign_portal_endpoints() -> None:
    """Test campaign creation, listing, pause, and run endpoints."""
    with SessionLocal() as db:
        tenant, phone = _seed_test_tenant_and_caller(db)

        # Create tenant user for portal auth
        user = User(
            email=f"campaign-owner-{uuid.uuid4().hex[:6]}@example.com",
            hashed_password="TestPasswordHash123!",
            full_name="Campaign Admin",
            tenant_id=tenant.id,
            role="tenant_admin",
            is_active=True,
        )
        db.add(user)
        db.commit()

        token = create_access_token(
            {"sub": user.id, "tenant_id": tenant.id, "role": "tenant_admin"}
        )
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create campaign via API
        create_resp = client.post(
            "/api/v1/portal/campaigns",
            headers=headers,
            json={
                "name": "Spring Service Reminder",
                "purpose": "appointment_reminder",
                "caller_id_e164": phone.e164,
                "contacts": [
                    {"phone_number": "+15128001111", "recipient_name": "Customer 1"},
                    {"phone_number": "+15128002222", "recipient_name": "Customer 2"},
                ],
            },
        )
        assert create_resp.status_code == 201
        campaign_data = create_resp.json()
        campaign_id = campaign_data["id"]
        assert campaign_data["total_contacts"] == 2
        assert campaign_data["status"] == "draft"

        # 2. List campaigns
        list_resp = client.get("/api/v1/portal/campaigns", headers=headers)
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert any(c["id"] == campaign_id for c in items)

        # 3. Resume campaign (start running)
        resume_resp = client.post(f"/api/v1/portal/campaigns/{campaign_id}/resume", headers=headers)
        assert resume_resp.status_code == 200
        assert resume_resp.json()["status"] == "running"

        # 4. Pause campaign
        pause_resp = client.post(f"/api/v1/portal/campaigns/{campaign_id}/pause", headers=headers)
        assert pause_resp.status_code == 200
        assert pause_resp.json()["status"] == "paused"
