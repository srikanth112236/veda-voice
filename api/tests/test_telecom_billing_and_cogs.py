"""Tests for Telecom Whole-Minute Rounding (Ceil to nearest 60s) and Per-Call COGS Metering.

Validates:
1. Connected calls round up to the nearest whole 60 seconds (1-minute minimum).
2. STT, LLM tokens, TTS characters, and carrier costs are accurately computed into estimated_cogs_usd.
3. LatencyTracker token and character accumulators function correctly.
4. Call and UsageRecord database models persist the telemetry.
"""

import uuid
from datetime import UTC, datetime

from fastapi import BackgroundTasks

from agent.telemetry import LatencyTracker
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import init_db
from api.app.models.call import Call
from api.app.models.subscription import Subscription, UsageRecord
from api.app.models.tenant import Tenant
from api.app.routers.internal import CallCompletionPayload, save_call_record_from_agent


def test_telecom_whole_minute_rounding() -> None:
    """Verify carrier-standard ceiling to 60-second increments."""
    init_db()
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Ceil Rounding Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="starter",
            status="active",
            monthly_included_minutes=1000,
            used_minutes_this_cycle=0.0,
        )
        db.add(sub)
        db.commit()

        token = create_access_token(
            {"sub": "livekit-agent", "role": "agent", "tenant_id": tenant.id}
        )
        auth = f"Bearer {token}"

        # 1. Test 15-second call -> Must round up to 1 whole minute
        call_id_1 = f"call-ceil-15s-{suffix}"
        bg = BackgroundTasks()
        save_call_record_from_agent(
            payload=CallCompletionPayload(
                call_id=call_id_1,
                dialed_number="+15125550199",
                caller_number="+15125551111",
                started_at=datetime.now(UTC).isoformat(),
                duration_s=15.0,
                outcome="info_provided",
            ),
            background_tasks=bg,
            authorization=auth,
            db=db,
        )

        db.refresh(sub)
        assert sub.used_minutes_this_cycle == 1.0

        from sqlalchemy import select

        rec_1 = db.scalar(select(Call).where(Call.call_id == call_id_1))
        assert rec_1 is not None
        assert rec_1.billable_minutes == 1

        # 2. Test 61-second call -> Must round up to 2 whole minutes
        call_id_2 = f"call-ceil-61s-{suffix}"
        save_call_record_from_agent(
            payload=CallCompletionPayload(
                call_id=call_id_2,
                dialed_number="+15125550199",
                caller_number="+15125552222",
                started_at=datetime.now(UTC).isoformat(),
                duration_s=61.0,
                outcome="info_provided",
            ),
            background_tasks=bg,
            authorization=auth,
            db=db,
        )

        db.refresh(sub)
        assert sub.used_minutes_this_cycle == 3.0  # 1 min + 2 min = 3 min

        rec_2 = db.scalar(select(Call).where(Call.call_id == call_id_2))
        assert rec_2 is not None
        assert rec_2.billable_minutes == 2

    finally:
        db.close()


def test_per_call_cogs_calculation() -> None:
    """Verify STT, LLM, TTS, and carrier fees calculate exact dollar COGS."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"COGS Metering {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        sub = Subscription(
            tenant_id=tenant.id,
            tier="starter",
            status="active",
            monthly_included_minutes=1000,
        )
        db.add(sub)
        db.commit()

        token = create_access_token(
            {"sub": "livekit-agent", "role": "agent", "tenant_id": tenant.id}
        )
        auth = f"Bearer {token}"

        # Duration = 60s (1 min), prompt_tokens = 500, completion_tokens = 200, tts_chars = 300
        # Expected COGS:
        # STT: (60/60) * 0.0048 = 0.0048
        # LLM: ((500 + 200) / 1,000,000) * 0.06 = 0.000042
        # TTS: (300 / 1,000,000) * 20.0 = 0.0060
        # Carrier: 1 * 0.0040 = 0.0040
        # Total = 0.0048 + 0.000042 + 0.0060 + 0.0040 = 0.014842 -> 0.0148
        call_id = f"cogs-call-{suffix}"
        bg = BackgroundTasks()
        save_call_record_from_agent(
            payload=CallCompletionPayload(
                call_id=call_id,
                dialed_number="+15125550199",
                caller_number="+15125553333",
                started_at=datetime.now(UTC).isoformat(),
                duration_s=60.0,
                outcome="message_taken",
                llm_prompt_tokens=500,
                llm_completion_tokens=200,
                tts_characters=300,
            ),
            background_tasks=bg,
            authorization=auth,
            db=db,
        )

        from sqlalchemy import select

        db_call = db.scalar(select(Call).where(Call.call_id == call_id))
        assert db_call is not None
        assert db_call.llm_prompt_tokens == 500
        assert db_call.llm_completion_tokens == 200
        assert db_call.tts_characters == 300
        assert db_call.estimated_cogs_usd == 0.0148

        usage = db.scalar(select(UsageRecord).where(UsageRecord.call_id == call_id))
        assert usage is not None
        assert usage.llm_prompt_tokens == 500
        assert usage.llm_completion_tokens == 200
        assert usage.tts_characters == 300
        assert usage.estimated_cogs_usd == 0.0148

    finally:
        db.close()


def test_latency_tracker_token_accumulation() -> None:
    """Verify LatencyTracker accumulates prompt tokens, completion tokens, and TTS characters."""
    tracker = LatencyTracker()
    tracker.record_turn(
        pipeline_latency_ms=350.0, eou_delay_ms=100.0, llm_ttft_ms=150.0, tts_ttfb_ms=100.0
    )
    tracker.record_tokens(prompt_tokens=250, completion_tokens=80)
    tracker.record_tts_characters(characters_count=180)

    tracker.record_turn(
        pipeline_latency_ms=400.0, eou_delay_ms=120.0, llm_ttft_ms=180.0, tts_ttfb_ms=100.0
    )
    tracker.record_tokens(prompt_tokens=300, completion_tokens=90)
    tracker.record_tts_characters(characters_count=220)

    summary = tracker.summary()
    assert summary["turn_count"] == 2
    assert summary["prompt_tokens"] == 550
    assert summary["completion_tokens"] == 170
    assert summary["tts_characters"] == 400


def test_quota_gate_and_call_duration_capping() -> None:
    """Verify start_call quota enforcement and duration clamping when overage is disabled."""
    from api.app.models.tenant import PhoneNumber
    from api.app.routers.internal import CallStartRequest, start_call

    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    phone_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    try:
        tenant = Tenant(
            name=f"Quota Defense {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=phone_number,
            provider="twilio",
            status="active",
        )
        db.add(phone)
        db.commit()

        # 1. Trial expired -> Quota exceeded
        sub_trial = Subscription(
            tenant_id=tenant.id,
            tier="trial",
            status="trialing",
            trial_minutes_allocated=100,
            trial_minutes_used=100.0,  # 100% used
        )
        db.add(sub_trial)
        db.commit()

        resp_trial = start_call(
            CallStartRequest(
                dialed_number=phone_number,
                caller_number="+15125550000",
                call_id=f"call-trial-exp-{suffix}",
            ),
            db=db,
        )
        assert resp_trial.allow is False
        assert resp_trial.reason == "quota_exceeded"
        assert resp_trial.overload_action == "reject"

        # 2. Plan minutes exhausted with allow_overage=False -> Quota exceeded
        sub_trial.tier = "starter"
        sub_trial.status = "active"
        sub_trial.monthly_included_minutes = 1000
        sub_trial.bonus_rollover_minutes = 0.0
        sub_trial.used_minutes_this_cycle = 1000.0
        sub_trial.allow_overage = False
        db.commit()

        resp_exhausted = start_call(
            CallStartRequest(
                dialed_number=phone_number,
                caller_number="+15125550001",
                call_id=f"call-overage-off-{suffix}",
            ),
            db=db,
        )
        assert resp_exhausted.allow is False
        assert resp_exhausted.reason == "quota_exceeded"

        # 3. 2 minutes remaining with allow_overage=False -> Approved and duration capped to 120s
        sub_trial.used_minutes_this_cycle = 998.0  # 2.0 minutes remaining
        db.commit()

        resp_capped = start_call(
            CallStartRequest(
                dialed_number=phone_number,
                caller_number="+15125550002",
                call_id=f"call-capped-{suffix}",
            ),
            db=db,
        )
        assert resp_capped.allow is True
        assert resp_capped.reason == "approved"
        assert resp_capped.config is not None
        assert resp_capped.config.max_call_duration_seconds == 120

    finally:
        db.close()
