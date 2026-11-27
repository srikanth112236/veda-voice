"""Tests for Phase 3 simulate-answer and voice-preview portal endpoints."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.tenant import AgentProfile, Tenant
from api.app.models.user import User

init_db()
client = TestClient(app)


@pytest.fixture
def tenant_headers() -> Any:
    """Create a tenant with objection handlers, FAQs, phonetic glossary, and strict grounding."""
    db = SessionLocal()
    try:
        suf = uuid.uuid4().hex[:6]
        t = Tenant(
            name=f"Peak HVAC {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-18:00",
            status="active",
        )
        db.add(t)
        db.flush()

        u = User(
            tenant_id=t.id,
            email=f"hvac_{suf}@example.com",
            full_name="Owner HVAC",
            hashed_password="hashed",
            role="owner",
            is_active=True,
        )
        p = AgentProfile(
            tenant_id=t.id,
            voice_id="Maya",
            phonetic_glossary=[{"term": "VedaVoice", "spoken_as": "Vayda Voice", "note": ""}],
            faq=[
                {
                    "question": "Do you offer weekend service?",
                    "answer": "Yes, Saturday emergency service is available.",
                    "category": "hours",
                }
            ],
            objection_handlers=[
                {
                    "trigger": "Why is the diagnostic fee $89?",
                    "response": "The $89 fee covers full system diagnostics and is credited toward repair.",
                    "action": "offer_quote",
                }
            ],
            strict_grounding=True,
            unknown_fallback_script="Let me have our senior estimator confirm that exact detail.",
        )
        db.add_all([u, p])
        db.commit()

        tok = create_access_token({"sub": u.id, "tenant_id": t.id, "role": "owner"})
        yield {"Authorization": f"Bearer {tok}"}
    finally:
        db.close()


def test_simulate_answer_matches_objection_faq_and_strict_fallback(
    tenant_headers: dict[str, str],
) -> None:
    """Verify simulate-answer prioritizes objection playbook, then FAQ, then strict fallback."""
    r1 = client.post(
        "/api/v1/portal/simulate-answer",
        json={"caller_text": "Why is the diagnostic fee $89?"},
        headers=tenant_headers,
    )
    assert r1.status_code == 200
    assert r1.json()["matched_source"] == "objection_playbook"
    assert "credited toward repair" in r1.json()["suggested_reply"]

    r2 = client.post(
        "/api/v1/portal/simulate-answer",
        json={"caller_text": "Do you offer weekend service?"},
        headers=tenant_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["matched_source"] == "faq"

    r3 = client.post(
        "/api/v1/portal/simulate-answer",
        json={"caller_text": "What is your geothermal tax rebate policy?"},
        headers=tenant_headers,
    )
    assert r3.status_code == 200
    assert r3.json()["matched_source"] == "strict_grounding_fallback"
    assert "senior estimator" in r3.json()["suggested_reply"]


def test_voice_preview_applies_phonetic_glossary(tenant_headers: dict[str, str]) -> None:
    """Verify voice-preview substitutes glossary terms case-insensitively."""
    resp = client.post(
        "/api/v1/portal/voice-preview",
        json={"text": "Welcome to VedaVoice HVAC support."},
        headers=tenant_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["voice_id"] == "Maya"
    assert "Vayda Voice" in data["spoken_text"]
    assert len(data["applied_glossary_terms"]) == 1
