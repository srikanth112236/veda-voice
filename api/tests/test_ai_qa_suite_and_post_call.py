"""Tests for Phase 5 Golden Call QA suite and post-call auto-quote automation."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.quote_invoice import CustomerQuote
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User

init_db()
client = TestClient(app)


@pytest.fixture
def qa_tenant() -> Any:
    """Create a tenant with Phase 5 auto-quote enabled and custom objections."""
    db = SessionLocal()
    try:
        suf = uuid.uuid4().hex[:6]
        t = Tenant(
            name=f"Shield Plumbing {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-18:00",
            status="active",
        )
        db.add(t)
        db.flush()

        u = User(
            tenant_id=t.id,
            email=f"shield_{suf}@example.com",
            full_name="Owner Shield",
            hashed_password="hashed",
            role="owner",
            is_active=True,
        )
        p = AgentProfile(
            tenant_id=t.id,
            services=["Water Heater Repair", "Drain Cleaning"],
            emergency_keywords=["gas leak", "flooding"],
            approved_safety_script="Shut off the main valve if safe and evacuate.",
            objection_handlers=[
                {
                    "trigger": "Why is the trip fee $79?",
                    "response": "The $79 diagnostic is credited toward any approved repair.",
                    "action": "offer_quote",
                }
            ],
            strict_grounding=True,
            unknown_fallback_script="Our master plumber will confirm that exact detail.",
            post_call_auto_quote_enabled=True,
        )
        did = PhoneNumber(
            tenant_id=t.id,
            e164=f"+1800555{uuid.uuid4().int % 10000:04d}",
            status="active",
        )
        db.add_all([u, p, did])
        db.commit()

        user_tok = create_access_token({"sub": u.id, "tenant_id": t.id, "role": "owner"})
        agent_tok = create_access_token({"sub": "agent", "tenant_id": t.id, "role": "agent"})
        yield {
            "tenant_id": t.id,
            "did": did.e164,
            "user_headers": {"Authorization": f"Bearer {user_tok}"},
            "agent_headers": {"Authorization": f"Bearer {agent_tok}"},
        }
    finally:
        db.close()


def test_simulate_qa_suite_returns_6_passing_scenarios(qa_tenant: dict[str, Any]) -> None:
    """Verify POST /api/v1/portal/simulate-suite evaluates all 6 scenarios."""
    resp = client.post("/api/v1/portal/simulate-suite", headers=qa_tenant["user_headers"])
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total_count"] == 6
    assert data["passed_count"] == 6
    assert data["overall_score"] == 100
    assert any(s["source"] == "objection_playbook" for s in data["scenarios"])


def test_post_call_auto_quote_creates_draft_on_price_inquiry(qa_tenant: dict[str, Any]) -> None:
    """Verify calls/complete auto-drafts a CustomerQuote when post_call_auto_quote_enabled=True."""
    call_id = f"call_qa_{uuid.uuid4().hex[:8]}"
    now = datetime.now(UTC)
    resp = client.post(
        "/api/v1/internal/calls/complete",
        json={
            "call_id": call_id,
            "tenant_id": qa_tenant["tenant_id"],
            "caller_number": "+15125550177",
            "dialed_number": qa_tenant["did"],
            "started_at": (now - timedelta(minutes=2)).isoformat(),
            "ended_at": now.isoformat(),
            "duration_s": 120.0,
            "outcome": "message_taken",
            "tags": ["price_inquiry"],
            "message": {
                "caller_name": "Taylor Brooks",
                "issue": "Tankless water heater quote",
            },
        },
        headers=qa_tenant["agent_headers"],
    )
    assert resp.status_code == 200, resp.text

    with SessionLocal() as db:
        q = db.scalar(
            select(CustomerQuote).where(
                CustomerQuote.tenant_id == qa_tenant["tenant_id"],
                CustomerQuote.customer_phone == "+15125550177",
            )
        )
        assert q is not None
        assert q.status == "draft"
        assert q.customer_name == "Taylor Brooks"
        assert "Tankless water heater quote" in q.title
