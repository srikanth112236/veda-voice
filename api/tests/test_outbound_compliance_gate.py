"""Comprehensive tests for Speed-to-Lead Outbound Pipeline & 8-Point Compliance Gate (Gap 4).

Verifies strict enforcement of SRS Section 6.2:
1. Consent validation (refusal on missing consent)
2. Region rules (rejection of non-US +44 numbers)
3. Suppression / DNC checks (rejection of opt-out numbers)
4. Caller ID ownership verification (rejection of unowned numbers)
5. Calling window checks (8am-9pm US standard, stricter 8am-8pm in FL/MD/OK)
6. Frequency caps (max 2/day, max 5/week)
7. Concurrency caps (tenant and global)
8. Immediate Opt-Out registration via API
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.outbound import SuppressionRecord
from api.app.services.compliance import evaluate_compliance_gate
from api.app.services.outbound import (
    record_caller_opt_out,
    trigger_speed_to_lead_outbound,
)

client = TestClient(app)


def _setup_test_tenant() -> tuple[str, str]:
    """Helper to register a clean tenant with an active phone number."""
    unique = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"compliance_{unique}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Compliance Plumbing {unique}",
            "owner_name": "Compliance Tester",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
        },
    )
    assert reg_res.status_code == 200
    tenant_id = reg_res.json()["user"]["tenant_id"]
    return tenant_id, test_number


def test_compliance_gate_consent_check() -> None:
    """Point 1: Outbound call without explicit consent must be rejected."""
    tenant_id, caller_id = _setup_test_tenant()
    with SessionLocal() as db:
        res = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550111",
            from_phone=caller_id,
            has_consent=False,
        )
        assert res.passed is False
        assert res.reason == "consent_missing"


def test_compliance_gate_region_check() -> None:
    """Point 8: Non-US / non-NANP phone numbers must be rejected."""
    tenant_id, caller_id = _setup_test_tenant()
    with SessionLocal() as db:
        # UK phone number (+44)
        res = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone="+442079460991",
            from_phone=caller_id,
            has_consent=True,
        )
        assert res.passed is False
        assert res.reason == "unsupported_region"


def test_compliance_gate_caller_id_ownership() -> None:
    """Point 5: Caller ID not owned by tenant must be rejected."""
    tenant_id, _ = _setup_test_tenant()
    with SessionLocal() as db:
        unowned_number = "+18889990000"
        res = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550111",
            from_phone=unowned_number,
            has_consent=True,
        )
        assert res.passed is False
        assert res.reason == "invalid_caller_id"


def test_compliance_gate_calling_window_standard_and_strict() -> None:
    """Point 3: Enforces local calling windows across recipient timezones."""
    tenant_id, caller_id = _setup_test_tenant()
    with SessionLocal() as db:
        # 1. New York (+1212...): At 23:30 (11:30 PM local Eastern), call must be rejected
        ny_night_utc = datetime(2026, 6, 15, 3, 30, tzinfo=UTC)  # 23:30 EDT is 03:30 UTC next day
        res_ny = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone="+12125550199",
            from_phone=caller_id,
            current_time=ny_night_utc,
        )
        assert res_ny.passed is False
        assert res_ny.reason == "outside_calling_window"

        # 2. Florida (+1305...): At 20:30 (8:30 PM local Eastern), standard US allows (until 9pm)
        # but Florida enforces stricter 8:00 AM to 8:00 PM (20:00) window, so it must be rejected!
        fl_eve_utc = datetime(2026, 6, 15, 0, 30, tzinfo=UTC)  # 20:30 EDT is 00:30 UTC next day
        res_fl = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone="+13055550199",
            from_phone=caller_id,
            current_time=fl_eve_utc,
        )
        assert res_fl.passed is False
        assert res_fl.reason == "outside_calling_window"
        assert res_fl.details["recipient_state"] == "FL"

        # 3. Daytime (2:00 PM local) in Texas (+1512... Central): Inside calling window -> passes
        tx_day_utc = datetime(2026, 6, 15, 19, 0, tzinfo=UTC)  # 14:00 CDT is 19:00 UTC
        res_tx = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550199",
            from_phone=caller_id,
            current_time=tx_day_utc,
        )
        assert res_tx.passed is True
        assert res_tx.reason == "approved"


def test_compliance_gate_suppression_and_opt_out() -> None:
    """Point 2 & 7: Suppressed number is blocked, and caller opt-out records immediately."""
    tenant_id, caller_id = _setup_test_tenant()
    target_phone = "+15125550144"

    # Midday fixture time
    fixture_time = datetime(2026, 6, 15, 18, 0, tzinfo=UTC)

    with SessionLocal() as db:
        # Before suppression: Passes
        res1 = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            from_phone=caller_id,
            current_time=fixture_time,
        )
        assert res1.passed is True

        # Opt-out caller
        record_caller_opt_out(
            db=db,
            tenant_id=tenant_id,
            phone_number=target_phone,
            reason="opt_out",
        )

        # After suppression: Blocked immediately
        res2 = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            from_phone=caller_id,
            current_time=fixture_time,
        )
        assert res2.passed is False
        assert res2.reason == "number_suppressed"


def test_compliance_gate_frequency_caps() -> None:
    """Point 4: Frequency caps limit contacts to max 2 attempts per 24 hours."""
    tenant_id, caller_id = _setup_test_tenant()
    target_phone = "+15125550166"
    fixture_time = datetime(2026, 6, 15, 18, 0, tzinfo=UTC)

    with SessionLocal() as db:
        # 1st call attempt
        call1 = Call(
            tenant_id=tenant_id,
            call_id=f"out-test-{uuid.uuid4().hex[:6]}",
            caller_number=target_phone,
            dialed_number=caller_id,
            direction="outbound",
            started_at=fixture_time - timedelta(hours=2),
            ended_at=fixture_time - timedelta(hours=2) + timedelta(seconds=60),
            outcome="completed",
        )
        # 2nd call attempt
        call2 = Call(
            tenant_id=tenant_id,
            call_id=f"out-test-{uuid.uuid4().hex[:6]}",
            caller_number=target_phone,
            dialed_number=caller_id,
            direction="outbound",
            started_at=fixture_time - timedelta(hours=1),
            ended_at=fixture_time - timedelta(hours=1) + timedelta(seconds=60),
            outcome="completed",
        )
        db.add_all([call1, call2])
        db.commit()

        # 3rd attempt within 24 hours must be rejected by frequency cap
        res = evaluate_compliance_gate(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            from_phone=caller_id,
            current_time=fixture_time,
        )
        assert res.passed is False
        assert res.reason == "frequency_cap_exceeded"
        assert res.details["attempts_24h"] >= 2


def test_compliance_gate_concurrency_caps() -> None:
    """Point 6: Outbound call concurrency caps per tenant."""
    tenant_id, caller_id = _setup_test_tenant()
    fixture_time = datetime(2026, 6, 15, 18, 0, tzinfo=UTC)

    with SessionLocal() as db:
        # Tenant has max_concurrent_outbound = 2 by default
        # Add 2 active (in-progress) outbound calls (ended_at is None)
        active1 = Call(
            tenant_id=tenant_id,
            call_id=f"out-active-{uuid.uuid4().hex[:6]}",
            caller_number="+15125550181",
            dialed_number=caller_id,
            direction="outbound",
            started_at=fixture_time - timedelta(minutes=2),
            ended_at=None,
            outcome="in_progress",
        )
        active2 = Call(
            tenant_id=tenant_id,
            call_id=f"out-active-{uuid.uuid4().hex[:6]}",
            caller_number="+15125550182",
            dialed_number=caller_id,
            direction="outbound",
            started_at=fixture_time - timedelta(minutes=1),
            ended_at=None,
            outcome="in_progress",
        )
        db.add_all([active1, active2])
        db.commit()

        try:
            # Next call must exceed tenant outbound concurrency cap
            res = evaluate_compliance_gate(
                db=db,
                tenant_id=tenant_id,
                to_phone="+15125550183",
                from_phone=caller_id,
                current_time=fixture_time,
            )
            assert res.passed is False
            assert res.reason == "concurrency_cap_exceeded"
        finally:
            active1.ended_at = fixture_time
            active2.ended_at = fixture_time
            db.commit()


def test_internal_opt_out_endpoint_with_call_token() -> None:
    """Verify /api/v1/internal/calls/opt-out authenticated via call-scoped token."""
    tenant_id, caller_id = _setup_test_tenant()
    token = create_access_token({"sub": "livekit-agent", "role": "agent", "tenant_id": tenant_id})
    target_phone = "+15125550192"

    res = client.post(
        "/api/v1/internal/calls/opt-out",
        headers={"X-Call-Token": token},
        json={
            "phone_number": target_phone,
            "reason": "caller_opt_out",
            "notes": "Caller explicitly said stop calling",
        },
    )
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert res.json()["status"] == "suppressed"

    # Verify phone is now in DB suppression table
    with SessionLocal() as db:
        rec = db.scalar(
            select(SuppressionRecord).where(
                SuppressionRecord.tenant_id == tenant_id,
                SuppressionRecord.phone_number == target_phone,
            )
        )
        assert rec is not None
        assert rec.reason == "caller_opt_out"


def test_speed_to_lead_outbound_pipeline_dispatch() -> None:
    """Verify trigger_speed_to_lead_outbound passes compliance and creates dispatch + call records."""
    tenant_id, caller_id = _setup_test_tenant()
    target_phone = "+15125550195"
    fixture_time = datetime(2026, 6, 15, 18, 0, tzinfo=UTC)

    with SessionLocal() as db:
        dispatch, compliance = trigger_speed_to_lead_outbound(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            caller_name="Sarah Connor",
            service_requested="AC Not Cooling",
            current_time=fixture_time,
        )

        assert compliance.passed is True
        assert dispatch.status == "dispatched"
        assert dispatch.compliance_passed is True
        assert dispatch.to_phone == target_phone
        assert dispatch.from_phone == caller_id

        # Verify initial Call record exists
        call_rec = db.scalar(select(Call).where(Call.call_id == dispatch.call_id))
        assert call_rec is not None
        assert call_rec.direction == "outbound"
        assert call_rec.outcome == "queued"
        assert call_rec.caller_number == target_phone
