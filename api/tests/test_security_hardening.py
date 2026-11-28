"""Negative security tests for internal auth, webhook signatures, OAuth state, and compliance rollover."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from api.app.core.config import settings
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.services.compliance import evaluate_compliance_gate_v2

client = TestClient(app)


def test_internal_endpoints_reject_missing_or_wrong_secret() -> None:
    r1 = client.get("/api/v1/internal/tenants/by-number/+18005550199")
    assert r1.status_code == 401

    r2 = client.get(
        "/api/v1/internal/tenants/some-tenant-id",
        headers={"X-Internal-Secret": "wrong-secret"},
    )
    assert r2.status_code == 401

    r3 = client.post(
        "/api/v1/internal/calls/start",
        json={"dialed_number": "+18005550199", "caller_number": "+15551112222", "call_id": "c1"},
    )
    assert r3.status_code == 401


def test_internal_calls_complete_rejects_missing_or_forged_jwt() -> None:
    payload = {
        "call_id": "forged-call-1",
        "dialed_number": "+18005550199",
        "caller_number": "+15551112222",
        "started_at": datetime.now(UTC).isoformat(),
        "ended_at": datetime.now(UTC).isoformat(),
        "duration_s": 10.0,
        "outcome": "completed",
    }
    r_missing = client.post("/api/v1/internal/calls/complete", json=payload)
    assert r_missing.status_code == 401

    import jwt as pyjwt

    forged = pyjwt.encode(
        {"sub": "attacker", "role": "agent"},
        key="wrong-attacker-secret-32-chars-min",
        algorithm="HS256",
    )
    r_forged = client.post(
        "/api/v1/internal/calls/complete",
        headers={"Authorization": f"Bearer {forged}"},
        json=payload,
    )
    assert r_forged.status_code == 403


def test_livekit_webhook_rejects_invalid_signature_when_configured(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "LIVEKIT_API_KEY", "test-lk-key")
    monkeypatch.setattr(settings, "LIVEKIT_API_SECRET", "test-lk-secret-32-chars-minimum!")

    resp = client.post(
        "/api/v1/internal/livekit/webhook",
        headers={"Authorization": "Bearer forged.jwt.token"},
        json={"event": "room_finished", "room": {"name": "in-fake"}},
    )
    assert resp.status_code == 401


def test_sms_webhook_rejects_invalid_signature_when_configured(monkeypatch: Any) -> None:
    monkeypatch.setattr(
        settings, "TELNYX_PUBLIC_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )
    resp = client.post(
        "/api/v1/webhooks/sms/inbound",
        headers={"telnyx-signature-ed25519": "AAAA", "telnyx-timestamp": "12345"},
        json={"from_phone": "+15125550199", "body": "STOP"},
    )
    assert resp.status_code == 401


def test_calendly_webhook_rejects_invalid_signature(monkeypatch: Any) -> None:
    monkeypatch.setenv("CALENDLY_WEBHOOK_SIGNING_KEY", "calendly-test-secret")
    resp = client.post(
        "/api/v1/portal/calendar/calendly/webhook",
        headers={"Calendly-Webhook-Signature": "t=12345,v1=deadbeef"},
        json={"event": "invitee.canceled", "payload": {}},
    )
    assert resp.status_code == 401


def test_google_calendar_callback_rejects_unsigned_state() -> None:
    resp = client.get(
        "/api/v1/portal/calendar/callback",
        params={"code": "mock_code", "state": "raw-unsigned-tenant-id"},
    )
    assert resp.status_code == 401


def test_meta_webhook_rejects_invalid_hmac(monkeypatch: Any) -> None:
    monkeypatch.setattr(settings, "META_APP_SECRET", "meta-secret-123")
    resp = client.post(
        "/api/v1/leads/meta/webhook",
        headers={"X-Hub-Signature-256": "sha256=deadbeef"},
        json={"entry": []},
    )
    assert resp.status_code == 403


def test_compliance_window_rollover_at_minute_55() -> None:
    """Verify window_start ending in :55 rolls over cleanly without ValueError."""
    import uuid

    e164 = f"+1{uuid.uuid4().int % 700 + 200}{uuid.uuid4().int % 8000000 + 2000000}"
    with SessionLocal() as db:
        tenant = Tenant(
            name=f"Rollover Test {uuid.uuid4().hex[:6]}",
            timezone="America/New_York",
            status="active",
            config={"calling_window_start": "08:55", "calling_window_end": "20:00"},
        )
        db.add(tenant)
        db.flush()
        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=e164,
            provider="twilio",
            status="active",
        )
        db.add(phone)
        db.commit()

        # 23:30 EDT = 03:30 UTC next day (outside window)
        res = evaluate_compliance_gate_v2(
            db=db,
            tenant_id=tenant.id,
            to_phone="+12125550199",
            from_phone=e164,
            has_consent=True,
            current_time=datetime(2026, 6, 15, 3, 30, tzinfo=UTC),
        )
        assert res.passed is False
        assert res.reason == "outside_calling_window"
        assert "scheduled_for" in res.details
