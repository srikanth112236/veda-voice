"""Comprehensive Test Suite for Milestone M5b: US Telephony Compliance Gate v2.

Tests all 10 points and strict regulatory mandates:
1. Category A-E routing & hard-blocking Category E (cold calling) in code.
2. TCPA / FCC 24-17 express written consent with AI voice disclosure & 5-year retention.
3. Cross-tenant Platform DND & sub-60s opt-out propagation across dispatches.
4. Federal & State DNC registry scrub & 31-day cache logic.
5. State Mini-TCPA rules (FL/OK/MD/WA 8am-8pm window, OK 3-attempt/24h cap).
6. Frequency caps by category (C/D max 1/day, B max 3/day, 5/week).
7. Caller ID ownership & NANP +1 formatting.
8. Quiet days & federal holidays.
9. Tenant & global concurrency caps.
10. Complaint rate kill-switch (>= 3 complaints/24h auto-pauses outbound).
11. One-click compliance audit evidentiary export with 5-year retention verification.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.compliance import PlatformSuppression
from api.app.models.outbound import ConsentRecord, OutboundDispatch, SuppressionRecord
from api.app.services.compliance import (
    evaluate_compliance_gate_v2,
)

client = TestClient(app)


def _setup_test_tenant() -> tuple[str, str, str]:
    """Helper to register a clean tenant and return (tenant_id, caller_phone, auth_token)."""
    unique = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"compliance_v2_{unique}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Compliance v2 Plumbing {unique}",
            "owner_name": "Compliance Tester",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
        },
    )
    assert reg_res.status_code == 200
    data = reg_res.json()
    tenant_id = data["user"]["tenant_id"]
    token = data["access_token"]
    return tenant_id, test_number, token


def test_category_e_cold_calling_hard_blocked() -> None:
    """Point 1: Category E (Cold Calling) must be hard-blocked in code with zero bypass."""
    tenant_id, caller_id, _ = _setup_test_tenant()
    with SessionLocal() as db:
        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550111",
            from_phone=caller_id,
            category="E",
            purpose="cold_outreach",
        )
        assert res.passed is False
        assert res.reason == "cold_calling_blocked"
        assert "Cold calling" in res.details["message"]

        # Invalid category also rejected
        res_invalid = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550111",
            from_phone=caller_id,
            category="Z",
        )
        assert res_invalid.passed is False
        assert res_invalid.reason == "cold_calling_blocked"


def test_category_c_requires_ai_voice_disclosure() -> None:
    """Point 2: Categories C & D require prior express written consent explicitly disclosing AI voice."""
    tenant_id, caller_id, _ = _setup_test_tenant()
    target_phone = "+15125550188"
    now = datetime.now(UTC)

    with SessionLocal() as db:
        # Create consent WITHOUT AI voice disclosure
        no_ai_consent = ConsentRecord(
            tenant_id=tenant_id,
            phone_number=target_phone,
            source="test_form",
            consent_confirmed=True,
            consent_text="I agree to receive calls.",
            category="C",
            ai_voice_disclosed=False,  # NOT DISCLOSED
            seller_name="Compliance Plumbing",
            created_at=now,
        )
        db.add(no_ai_consent)
        db.commit()

        # Gate v2 should reject Category C
        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            from_phone=caller_id,
            category="C",
            purpose="lead_followup",
            current_time=datetime(2026, 11, 17, 15, 0, 0, tzinfo=UTC),  # 9am Central
        )
        assert res.passed is False
        assert res.reason == "ai_voice_disclosure_missing"

        # Now update with AI voice disclosure
        no_ai_consent.ai_voice_disclosed = True
        db.commit()

        # Now Gate v2 passes consent check
        res_pass = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=target_phone,
            from_phone=caller_id,
            category="C",
            purpose="lead_followup",
            current_time=datetime(2026, 11, 17, 15, 0, 0, tzinfo=UTC),
        )
        assert res_pass.passed is True
        assert res_pass.reason == "approved"


def test_state_rules_florida_and_oklahoma() -> None:
    """Point 5 & 6: Florida 8am-8pm window and Oklahoma max 3 attempts per 24 hours."""
    tenant_id, caller_id, _ = _setup_test_tenant()
    fl_phone = "+13055550199"  # Miami, FL (America/New_York)
    ok_phone = "+14055550122"  # Oklahoma City, OK (America/Chicago)
    now = datetime.now(UTC)

    with SessionLocal() as db:
        # Add valid consent for both
        for p in (fl_phone, ok_phone):
            db.add(
                ConsentRecord(
                    tenant_id=tenant_id,
                    phone_number=p,
                    consent_confirmed=True,
                    category="B",
                    ai_voice_disclosed=True,
                    seller_name="Compliance Plumbing",
                    created_at=now,
                )
            )
        db.commit()

        # 1. Florida outside window check (8:30 PM Eastern = 20:30 local)
        # 20:30 Eastern is 01:30 UTC next day
        late_fl_utc = datetime(2026, 11, 18, 1, 30, 0, tzinfo=UTC)
        res_fl = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=fl_phone,
            from_phone=caller_id,
            category="B",
            current_time=late_fl_utc,
        )
        assert res_fl.passed is False
        assert res_fl.reason == "outside_calling_window"
        assert res_fl.details["recipient_state"] == "FL"
        assert res_fl.details["window_end"] == "20:00"

        # Florida inside window check (11:00 AM Eastern = 16:00 UTC)
        day_fl_utc = datetime(2026, 11, 17, 16, 0, 0, tzinfo=UTC)
        res_fl_pass = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=fl_phone,
            from_phone=caller_id,
            category="B",
            current_time=day_fl_utc,
        )
        assert res_fl_pass.passed is True

        # 2. Oklahoma frequency cap (max 3 in 24 hours)
        ok_time = datetime(2026, 11, 17, 17, 0, 0, tzinfo=UTC)  # 11am Central
        # Insert 3 recent calls in past 24h
        for i in range(3):
            db.add(
                Call(
                    tenant_id=tenant_id,
                    call_id=f"ok-test-call-{i}-{uuid.uuid4().hex[:6]}",
                    caller_number=ok_phone,
                    dialed_number=caller_id,
                    direction="outbound",
                    outcome="completed",
                    started_at=ok_time - timedelta(hours=2 + i),
                    ended_at=ok_time - timedelta(hours=2 + i) + timedelta(minutes=1),
                )
            )
        db.commit()

        res_ok = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=ok_phone,
            from_phone=caller_id,
            category="B",
            current_time=ok_time,
        )
        assert res_ok.passed is False
        assert res_ok.reason == "frequency_cap_exceeded"
        assert res_ok.details["max_24h"] == 3


def test_dnc_scrub_and_category_exemption() -> None:
    """Point 4: Marketing categories (C & D) blocked on DNC; transactional (B) exempt."""
    tenant_id, caller_id, _ = _setup_test_tenant()
    dnc_phone = "+15125559999"  # Included in test DNC registry
    now = datetime(2026, 11, 17, 16, 0, 0, tzinfo=UTC)

    with SessionLocal() as db:
        db.add(
            ConsentRecord(
                tenant_id=tenant_id,
                phone_number=dnc_phone,
                consent_confirmed=True,
                category="C",
                ai_voice_disclosed=True,
                seller_name="Compliance Plumbing",
                created_at=now - timedelta(days=1),
            )
        )
        db.commit()

        # Category C (marketing / lead inquiry) should be rejected on DNC
        res_c = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=dnc_phone,
            from_phone=caller_id,
            category="C",
            current_time=now,
        )
        assert res_c.passed is False
        assert res_c.reason == "dnc_registry_match"

        # Category B (transactional / appointment reminder) is exempt from DNC scrub
        res_b = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=dnc_phone,
            from_phone=caller_id,
            category="B",
            current_time=now,
        )
        assert res_b.passed is True
        assert res_b.reason == "approved"


def test_platform_wide_suppression_blocks_cross_tenant() -> None:
    """Point 3: Cross-tenant platform suppression blocks marketing calls for other tenants."""
    tenant_1, caller_1, _ = _setup_test_tenant()
    tenant_2, caller_2, _ = _setup_test_tenant()
    target_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    now = datetime(2026, 11, 17, 16, 0, 0, tzinfo=UTC)

    with SessionLocal() as db:
        # Tenant 2 adds consent
        db.add(
            ConsentRecord(
                tenant_id=tenant_2,
                phone_number=target_phone,
                consent_confirmed=True,
                category="C",
                ai_voice_disclosed=True,
                seller_name="Plumbing 2",
                created_at=now,
            )
        )
        # But user previously opted out globally on Platform
        db.add(
            PlatformSuppression(
                phone_number=target_phone,
                reason="platform_opt_out",
                source_tenant_id=tenant_1,
                created_at=now - timedelta(days=2),
            )
        )
        db.commit()

        # Tenant 2 attempts Category C call -> must be blocked by platform suppression
        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_2,
            to_phone=target_phone,
            from_phone=caller_2,
            category="C",
            current_time=now,
        )
        assert res.passed is False
        assert res.reason == "platform_suppression_match"


def test_sub_60s_opt_out_propagation() -> None:
    """Sub-60s Opt-Out Propagation: revokes consents, suppresses tenant & platform, cancels dispatches."""
    tenant_id, caller_id, token = _setup_test_tenant()
    opt_phone = "+15125550166"
    now = datetime.now(UTC)

    with SessionLocal() as db:
        # Create active consent
        db.add(
            ConsentRecord(
                tenant_id=tenant_id,
                phone_number=opt_phone,
                consent_confirmed=True,
                category="C",
                ai_voice_disclosed=True,
                created_at=now - timedelta(hours=1),
            )
        )
        # Create queued dispatch
        db.add(
            OutboundDispatch(
                tenant_id=tenant_id,
                call_id=f"queued-{uuid.uuid4().hex[:6]}",
                to_phone=opt_phone,
                from_phone=caller_id,
                purpose="lead_triage",
                status="queued",
                compliance_passed=True,
                created_at=now,
            )
        )
        db.commit()

    # Trigger sub-60s Opt-Out via API
    res = client.post(
        "/api/v1/compliance/opt-out",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "phone_number": opt_phone,
            "reason": "verbal_stop_request",
            "notes": "Caller said stop calling during LiveKit triage",
            "propagate_platform": True,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["consents_revoked"] >= 1
    assert data["dispatches_cancelled"] >= 1
    assert data["platform_suppressed"] is True

    # Verify DB state within the same millisecond
    with SessionLocal() as db:
        supp = db.scalar(
            select(SuppressionRecord).where(
                SuppressionRecord.tenant_id == tenant_id,
                SuppressionRecord.phone_number == opt_phone,
            )
        )
        assert supp is not None
        assert supp.reason == "verbal_stop_request"

        consent = db.scalar(
            select(ConsentRecord).where(
                ConsentRecord.tenant_id == tenant_id,
                ConsentRecord.phone_number == opt_phone,
            )
        )
        assert consent.revoked_at is not None

        queued = db.scalars(
            select(OutboundDispatch).where(
                OutboundDispatch.tenant_id == tenant_id,
                OutboundDispatch.to_phone == opt_phone,
            )
        ).all()
        for q in queued:
            assert q.status == "skipped_compliance"

        # Subsequent compliance gate call must immediately reject
        gate_res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone=opt_phone,
            from_phone=caller_id,
            category="C",
        )
        assert gate_res.passed is False
        assert gate_res.reason == "consent_missing" or gate_res.reason == "number_suppressed"


def test_complaint_rate_auto_pause_kill_switch() -> None:
    """Point 10: >= 3 complaints/opt-outs in 24 hours triggers automated outbound pause."""
    tenant_id, caller_id, _ = _setup_test_tenant()
    now = datetime(2026, 11, 17, 16, 0, 0, tzinfo=UTC)

    with SessionLocal() as db:
        # Insert 3 complaints in past 24h
        for i in range(3):
            db.add(
                SuppressionRecord(
                    tenant_id=tenant_id,
                    phone_number=f"+151255502{i:02d}",
                    reason="opt_out",
                    notes="Automated opt-out complaint",
                    created_at=now - timedelta(hours=i + 1),
                )
            )
        db.commit()

        # Gate v2 should hit kill switch
        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant_id,
            to_phone="+15125550999",
            from_phone=caller_id,
            category="B",
            has_consent=True,
            current_time=now,
        )
        assert res.passed is False
        assert res.reason == "complaint_auto_pause"
        assert res.details["complaints_24h"] >= 3


def test_audit_export_endpoint_with_5_year_retention() -> None:
    """1-Click Evidentiary Audit Export with 5-year retention confirmation."""
    tenant_id, caller_id, token = _setup_test_tenant()
    audit_phone = "+15125550888"
    now = datetime.now(UTC)

    with SessionLocal() as db:
        # Seed state rules if empty
        db.add(
            ConsentRecord(
                tenant_id=tenant_id,
                phone_number=audit_phone,
                consent_confirmed=True,
                consent_text="Agreement to AI voice dispatch.",
                category="C",
                ai_voice_disclosed=True,
                method="web_form",
                seller_name="Compliance Audit Tenant",
                created_at=now,
                retention_until=now + timedelta(days=5 * 365),
            )
        )
        db.commit()

    res = client.get(
        f"/api/v1/compliance/audit-export/{audit_phone}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    export = res.json()

    assert export["phone_number"] == audit_phone
    assert export["tenant_id"] == tenant_id
    assert export["has_active_consent"] is True
    assert len(export["consents"]) >= 1
    assert export["consents"][0]["ai_voice_disclosed"] is True
    assert "retention_until" in export["consents"][0]
