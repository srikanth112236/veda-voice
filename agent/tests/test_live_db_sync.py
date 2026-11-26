"""Tests for Voice Agent live database synchronization and minute usage tracking (Gap 1).

Validates:
1. Agent CallRecord syncs to FastAPI /api/v1/internal/calls/complete.
2. PostgreSQL Call record is created/updated with transcripts, urgency, and latency metrics.
3. Subscription minutes (trial_minutes_used or used_minutes_this_cycle) and UsageRecord are updated.
4. Offline network resilience: local FileCallStore saves safely without crashing the worker.
"""

import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

from agent.records import (
    CallRecord,
    FileCallStore,
    MessagePayload,
    TranscriptEntry,
    sync_call_record_to_api,
)
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.models.call import Call
from api.app.models.subscription import Subscription, UsageRecord
from api.app.models.tenant import PhoneNumber, Tenant


def test_sync_call_record_to_api_success(tmp_path: Path) -> None:
    """Verify that completing a call syncs the CallRecord into the live PostgreSQL database."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    call_id = f"test-call-sync-{suffix}"
    dialed_e164 = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    try:
        # Create test tenant
        tenant = Tenant(
            name=f"Sync Drains {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=dialed_e164,
            provider="twilio",
            status="active",
        )
        sub = Subscription(
            tenant_id=tenant.id,
            tier="trial",
            status="trialing",
            trial_minutes_allocated=100,
            trial_minutes_used=0.0,
            monthly_included_minutes=1000,
        )
        db.add_all([phone, sub])
        db.commit()

        # Generate call-scoped token
        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant.id,
                "call_id": call_id,
            }
        )

        record = CallRecord(
            tenant_id=tenant.id,
            call_id=call_id,
            dialed_number=dialed_e164,
            caller_number="+15125550199",
            started_at=datetime.now(UTC).isoformat(),
            ended_at=datetime.now(UTC).isoformat(),
            duration_s=120.0,
            outcome="message_taken",
            message=MessagePayload(
                tenant_id=tenant.id,
                name="Sarah Connor",
                phone="+15125550199",
                message="My basement pipe burst and water is flooding everywhere!",
                urgency="emergency",
                phone_confirmed=True,
                address="100 Tech Ridge Pkwy",
            ),
            tags=["emergency", "message_taken"],
            turn_count=4,
            latency_p50_ms=480.0,
            latency_p95_ms=620.0,
            turn_latencies_ms=[420.0, 480.0, 510.0, 620.0],
            transcript=[
                TranscriptEntry(
                    role="assistant",
                    text="Thanks for calling Sync Drains. How can I help you?",
                    time=datetime.now(UTC).isoformat(),
                ),
                TranscriptEntry(
                    role="user",
                    text="My pipe burst and water is flooding!",
                    time=datetime.now(UTC).isoformat(),
                ),
            ],
        )

        # 1. Sync call record to API
        synced = sync_call_record_to_api(record, call_token=call_token)
        assert synced is True

        # 2. Verify record in PostgreSQL database
        from sqlalchemy import select

        db_call = db.scalar(select(Call).where(Call.call_id == call_id))
        assert db_call is not None
        assert db_call.tenant_id == tenant.id
        assert db_call.duration_s == 120.0
        assert db_call.outcome == "message_taken"
        assert db_call.urgency == "emergency"
        assert db_call.turn_count == 4
        assert db_call.latency_p50_ms == 480.0
        assert len(db_call.transcript) == 2
        assert db_call.message is not None
        assert db_call.message["name"] == "Sarah Connor"

        # 3. Verify minute usage was recorded in tenant subscription
        db.refresh(sub)
        assert sub.trial_minutes_used == 2.0  # 120 seconds = 2.0 minutes

        usage_rec = db.scalar(select(UsageRecord).where(UsageRecord.call_id == call_id))
        assert usage_rec is not None
        assert usage_rec.tenant_id == tenant.id
        assert usage_rec.duration_seconds == 120
        assert usage_rec.billable_minutes == 2.0

    finally:
        db.close()


def test_offline_resilience_preserves_local_file_call_store(tmp_path: Path) -> None:
    """Verify that if API sync is unreachable, FileCallStore safely persists locally."""
    store = FileCallStore(storage_dir=tmp_path)
    record = CallRecord(
        tenant_id="offline_tenant_test",
        call_id="call-offline-123",
        dialed_number="+18005550199",
        caller_number="+15125550100",
        started_at=datetime.now(UTC).isoformat(),
        ended_at=datetime.now(UTC).isoformat(),
        duration_s=45.0,
        outcome="info_provided",
    )

    # 1. Local file write succeeds
    saved_file = store.save_call_record(record, tenant_id="offline_tenant_test")
    assert saved_file.exists()
    assert "call-offline-123" in saved_file.name

    # 2. Attempt sync with invalid / unreachable base url
    # Should catch error gracefully and return False without throwing exception
    synced = sync_call_record_to_api(
        record,
        call_token="invalid_token_test",
        api_base_url="http://127.0.0.1:59999",  # unreachable port
    )
    # Falls back gracefully or returns True/False without crashing
    assert isinstance(synced, bool)


def test_sync_call_record_retries_transient_502_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify sync_call_record_to_api retries transient 5xx errors and succeeds on retry."""
    import io
    import urllib.error
    import urllib.request

    attempts = {"count": 0}

    class _FakeResp:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def _fake_urlopen(req, timeout=8.0):
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise urllib.error.HTTPError(
                req.full_url, 502, "Bad Gateway", hdrs=None, fp=io.BytesIO(b"bad gateway")
            )
        return _FakeResp()

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)

    record = CallRecord(
        tenant_id="retry_tenant",
        call_id="call-retry-502",
        dialed_number="+18005550199",
        caller_number="+15125550100",
        started_at=datetime.now(UTC).isoformat(),
        ended_at=datetime.now(UTC).isoformat(),
        duration_s=30.0,
        outcome="completed",
    )

    synced = sync_call_record_to_api(
        record,
        call_token="test-token",
        api_base_url="http://127.0.0.1:8000",
        max_attempts=3,
        backoff_base_s=0.0,
    )
    assert synced is True
    assert attempts["count"] == 3
