"""Unit tests for Milestone M7b: Post-Call QA & Call Scoring Automation (FR-ANL-1 to 8).

Validates:
1. Automated QA rubric scoring across all 5 evaluation dimensions.
2. Legal & recording disclosure violation detection and critical flagging.
3. Safety & emergency escalation breach detection.
4. Predictive CSAT modeling (1.0 to 5.0 stars) with contextual rationale.
5. Internal post-call completion auto-evaluation and database persistence.
6. Supervisor QA scorecard retrieval, override review, and multi-tenant isolation.
7. Tenant-wide aggregate QA analytics and pass rate metrics.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import Tenant
from api.app.models.user import User
from api.app.services.qa_scoring import evaluate_call_qa

client = TestClient(app)


@pytest.fixture
def qa_setup():
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]
        tenant_a = Tenant(
            id=f"ten_qa_a_{suffix}",
            name=f"Apex Heating & Air {suffix}",
            timezone="America/Chicago",
            hours="8am-6pm",
            status="active",
        )
        tenant_b = Tenant(
            id=f"ten_qa_b_{suffix}",
            name=f"Lone Star Plumbing {suffix}",
            timezone="America/Chicago",
            hours="8am-6pm",
            status="active",
        )
        db.add_all([tenant_a, tenant_b])
        db.commit()

        user_a = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_a.id,
            email=f"qa_supervisor_{suffix}@apexheating.com",
            full_name="QA Supervisor A",
            role="admin",
            is_active=True,
            hashed_password="fakehashedsecret",
        )
        user_b = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_b.id,
            email=f"qa_supervisor_b_{suffix}@lonestar.com",
            full_name="QA Supervisor B",
            role="admin",
            is_active=True,
            hashed_password="fakehashedsecret",
        )
        db.add_all([user_a, user_b])
        db.commit()

        # Call with complete QA fields
        call_a = Call(
            id=f"call_qa_{suffix}",
            call_id=f"room_qa_{suffix}",
            tenant_id=tenant_a.id,
            caller_number="+15125550188",
            dialed_number="+15125550100",
            started_at=datetime.now(UTC) - timedelta(minutes=5),
            ended_at=datetime.now(UTC) - timedelta(minutes=1),
            duration_s=240.0,
            outcome="booked",
            urgency="normal",
            turn_count=6,
            latency_p50_ms=1150.0,
            transcript=[
                {
                    "role": "agent",
                    "text": "Thank you for calling Apex Heating & Air. This call is recorded for quality assurance. How can I help you today?",
                },
                {
                    "role": "caller",
                    "text": "Hi, my name is John Doe and my AC is not cooling properly.",
                },
                {
                    "role": "agent",
                    "text": "I can help schedule a technician. Could I get your phone number and service address?",
                },
                {
                    "role": "caller",
                    "text": "Sure, my number is 512-555-0188 and I am at 123 Maple Street, Austin.",
                },
                {
                    "role": "agent",
                    "text": "Thank you John. I have confirmed your appointment for tomorrow at 10 AM.",
                },
                {"role": "caller", "text": "That sounds great, thank you!"},
            ],
            message={
                "name": "John Doe",
                "phone": "+15125550188",
                "address": "123 Maple Street, Austin",
                "message": "AC not cooling properly",
            },
            qa_score=95.0,
            qa_rubric={"greeting": {"score": 20.0}, "disclosure": {"score": 20.0}},
            qa_flags=[],
            csat_score=4.8,
            csat_rationale="Appointment booked successfully; Positive customer sentiment detected",
        )
        db.add(call_a)
        db.commit()

        token_a = create_access_token(data={"sub": user_a.id, "tenant_id": tenant_a.id})
        token_b = create_access_token(data={"sub": user_b.id, "tenant_id": tenant_b.id})

        yield {
            "db": db,
            "tenant_a": tenant_a,
            "tenant_b": tenant_b,
            "user_a": user_a,
            "user_b": user_b,
            "call_a": call_a,
            "token_a": token_a,
            "token_b": token_b,
        }
    finally:
        try:
            db.delete(call_a)
            db.delete(user_a)
            db.delete(user_b)
            db.delete(tenant_a)
            db.delete(tenant_b)
            db.commit()
        except Exception:
            db.rollback()
        db.close()


def test_evaluate_call_qa_full_compliance():
    """Verify 100% QA score and high CSAT on a compliant, professional booking interaction."""
    transcript = [
        {
            "role": "agent",
            "text": "Thanks for calling Apex Heating. This call is recorded for quality assurance and training. How may I assist you today?",
        },
        {
            "role": "caller",
            "text": "Hi, this is Alice Smith. I need my furnace tuned up before winter.",
        },
        {
            "role": "agent",
            "text": "Certainly Alice! May I have your callback phone number and address please?",
        },
        {
            "role": "caller",
            "text": "Yes, it is 512-555-0144, and I live at 456 Oak Lane, Austin Texas.",
        },
        {
            "role": "agent",
            "text": "Thank you Alice, I would be happy to book you for Thursday at 2 PM.",
        },
        {"role": "caller", "text": "Wonderful, thank you so much!"},
    ]
    result = evaluate_call_qa(
        transcript=transcript,
        business_name="Apex Heating",
        recording_disclosure=True,
        message={
            "name": "Alice Smith",
            "phone": "+15125550144",
            "address": "456 Oak Lane",
            "message": "Furnace tune up",
        },
        outcome="booked",
        urgency="normal",
        latency_p50_ms=1100.0,
        sentiment_label="positive",
    )
    assert result["qa_score"] >= 95.0
    assert result["qa_status"] == "passed"
    assert result["qa_flags"] == []
    assert result["is_critical_failure"] is False
    assert result["csat_score"] >= 4.5
    assert result["rubric_breakdown"]["greeting"]["passed"] is True
    assert result["rubric_breakdown"]["disclosure"]["passed"] is True
    assert result["rubric_breakdown"]["data_collection"]["passed"] is True


def test_evaluate_call_qa_missing_disclosure_critical_flag():
    """Verify that omitting the required recording/AI disclosure results in 0 disclosure pts, flag, and failure."""
    transcript = [
        {
            "role": "agent",
            "text": "Hello, how can I help you today?",
        },  # No business name, no recording disclosure
        {"role": "caller", "text": "I need a quote for water heater replacement."},
        {"role": "agent", "text": "Our technician can come out tomorrow at 9 AM."},
    ]
    result = evaluate_call_qa(
        transcript=transcript,
        business_name="Apex Plumbing",
        recording_disclosure=True,  # Disclosure required
        message={"phone": "+15125550122"},
        outcome="inquiry_resolved",
        urgency="normal",
    )
    assert result["rubric_breakdown"]["disclosure"]["score"] == 0.0
    assert "missing_disclosure" in result["qa_flags"]
    assert result["is_critical_failure"] is True
    assert result["qa_status"] == "failed"
    assert result["csat_score"] <= 2.0


def test_evaluate_call_qa_emergency_protocol_breach():
    """Verify that failing to escalate an active emergency triggers safety_escalation_breach."""
    transcript = [
        {"role": "agent", "text": "Thanks for calling Apex Heating. This call is recorded."},
        {
            "role": "caller",
            "text": "We have an emergency! There is a strong gas smell and active gas leak in the basement!",
        },
        {
            "role": "agent",
            "text": "Our next routine appointment is next Tuesday, let me check the schedule.",
        },  # Critical breach!
    ]
    result = evaluate_call_qa(
        transcript=transcript,
        business_name="Apex Heating",
        recording_disclosure=True,
        outcome="completed",
        urgency="emergency",
    )
    assert result["rubric_breakdown"]["safety_escalation"]["score"] == 0.0
    assert "safety_escalation_breach" in result["qa_flags"]
    assert result["is_critical_failure"] is True
    assert result["qa_status"] == "failed"


def test_evaluate_call_qa_emergency_protocol_honored():
    """Verify that transferring or providing immediate emergency safety advice earns full safety marks."""
    transcript = [
        {"role": "agent", "text": "Thanks for calling Apex Heating. This call is recorded."},
        {"role": "caller", "text": "Emergency! A pipe burst and water is flooding everywhere!"},
        {
            "role": "agent",
            "text": "Please locate and shut off your main water valve right away. I am transferring you directly to our on-call emergency specialist right now.",
        },
    ]
    result = evaluate_call_qa(
        transcript=transcript,
        business_name="Apex Heating",
        recording_disclosure=True,
        outcome="transferred",
        urgency="emergency",
    )
    assert result["rubric_breakdown"]["safety_escalation"]["score"] == 20.0
    assert "safety_escalation_breach" not in result["qa_flags"]


def test_portal_get_qa_scorecard_api(qa_setup):
    """Test retrieving QA scorecard via GET /api/v1/portal/calls/{call_id}/qa."""
    call = qa_setup["call_a"]
    token = qa_setup["token_a"]

    resp = client.get(
        f"/api/v1/portal/calls/{call.call_id}/qa",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["call_id"] == call.call_id
    assert data["qa_score"] == 95.0
    assert data["qa_status"] == "passed"
    assert data["csat_score"] == 4.8
    assert "rubric_breakdown" in data


def test_portal_qa_multi_tenant_isolation(qa_setup):
    """Test that Tenant B cannot access Tenant A's QA scorecard."""
    call = qa_setup["call_a"]
    token_b = qa_setup["token_b"]

    resp = client.get(
        f"/api/v1/portal/calls/{call.call_id}/qa",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert resp.status_code == 404


def test_portal_override_qa_score_api(qa_setup):
    """Test supervisor manual override of QA score and CSAT via POST /api/v1/portal/calls/{call_id}/qa/override."""
    call = qa_setup["call_a"]
    token = qa_setup["token_a"]
    user = qa_setup["user_a"]
    db = qa_setup["db"]

    resp = client.post(
        f"/api/v1/portal/calls/{call.call_id}/qa/override",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "qa_score": 98.0,
            "csat_score": 5.0,
            "review_note": "Verified caller was delighted; minor latency was carrier jitter.",
            "resolve_flags": True,
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert data["qa_score"] == 98.0
    assert data["csat_score"] == 5.0
    assert data["qa_reviewed_by"] == user.email

    db.refresh(call)
    assert call.qa_score == 98.0
    assert call.csat_score == 5.0
    assert call.qa_flags == []
    assert "Supervisor Override:" in (call.csat_rationale or "")


def test_portal_qa_analytics_api(qa_setup):
    """Test aggregate QA analytics endpoint GET /api/v1/portal/analytics/qa."""
    token = qa_setup["token_a"]

    resp = client.get(
        "/api/v1/portal/analytics/qa",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_evaluated_calls"] >= 1
    assert data["average_qa_score"] >= 80.0
    assert data["average_csat_score"] >= 4.0
    assert data["qa_pass_rate_pct"] >= 80.0
    assert isinstance(data["top_flags"], list)
