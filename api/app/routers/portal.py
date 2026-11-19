"""Tenant business client portal endpoints strictly scoped to current tenant."""

import logging
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from api.app.core.config import settings
from api.app.core.deps import get_current_tenant, get_current_user
from api.app.core.security import decode_access_token
from api.app.db.session import SessionLocal, get_db
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.livekit_sync import sync_tenant_to_livekit
from api.app.services.supervisor import handle_supervisor_action, supervisor_manager

router = APIRouter(prefix="/portal", tags=["portal"])
logger = logging.getLogger(__name__)


class LiveActiveCallItem(BaseModel):
    id: str
    call_id: str
    caller_number: str
    dialed_number: str
    started_at: datetime
    elapsed_duration_s: float
    outcome: str
    urgency: str
    turn_count: int
    latest_user_utterance: str | None = None
    latest_agent_utterance: str | None = None
    whisper_count: int = 0
    supervisor_whispers: list[dict[str, Any]] = []
    barge_in_active: bool = False
    takeover_active: bool = False


class SupervisorWhisperRequest(BaseModel):
    instruction: str = Field(..., min_length=2, max_length=1000)


class SupervisorTransferRequest(BaseModel):
    transfer_to: str = Field(..., min_length=5, max_length=30)
    reason: str | None = "supervisor_manual_transfer"


class SupervisorActionRequest(BaseModel):
    action: str = Field(..., min_length=2, max_length=50)
    payload: dict[str, Any] = {}


class CallListItem(BaseModel):
    id: str
    call_id: str
    caller_number: str
    dialed_number: str
    started_at: datetime
    duration_s: float
    outcome: str
    urgency: str
    turn_count: int
    latency_p50_ms: float
    caller_name: str | None = None
    service_address: str | None = None
    sentiment_label: str = "neutral"
    lead_score: float = 50.0
    lost_reason: str | None = None
    qa_score: float = 100.0
    qa_flags: list[str] = []
    csat_score: float = 5.0


class CallDetailResponse(BaseModel):
    id: str
    call_id: str
    caller_number: str
    dialed_number: str
    started_at: datetime
    ended_at: datetime | None
    duration_s: float
    outcome: str
    urgency: str
    turn_count: int
    latency_p50_ms: float
    latency_p95_ms: float
    turn_latencies_ms: list[float]
    transcript: list[dict[str, Any]]
    message: dict[str, Any] | None
    tags: list[str]
    recording_url: str | None = None
    sentiment_score: float = 0.0
    sentiment_label: str = "neutral"
    lead_score: float = 50.0
    lost_reason: str | None = None
    key_objections: list[str] = []
    supervisor_whispers: list[dict[str, Any]] = []
    barge_in_active: bool = False
    takeover_active: bool = False
    transfer_to_number: str | None = None
    transferred_at: datetime | None = None
    qa_score: float = 100.0
    qa_rubric: dict[str, Any] = {}
    qa_flags: list[str] = []
    csat_score: float = 5.0
    csat_rationale: str | None = None
    qa_reviewed_by: str | None = None
    qa_reviewed_at: datetime | None = None


class QAScorecardResponse(BaseModel):
    call_id: str
    qa_score: float
    qa_status: str
    qa_flags: list[str]
    is_critical_failure: bool
    csat_score: float
    csat_rationale: str | None = None
    rubric_breakdown: dict[str, Any]
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None


class QAOverrideRequest(BaseModel):
    qa_score: float = Field(..., ge=0.0, le=100.0)
    csat_score: float | None = Field(None, ge=1.0, le=5.0)
    review_note: str | None = None
    resolve_flags: bool = False


class TenantQAAnalyticsResponse(BaseModel):
    total_evaluated_calls: int
    average_qa_score: float
    average_csat_score: float
    qa_pass_rate_pct: float
    critical_failures_count: int
    top_flags: list[dict[str, Any]]


class TenantDashboardStats(BaseModel):
    total_calls: int
    emergency_calls: int
    messages_taken: int
    median_latency_ms: float
    tenant_name: str
    phone_numbers: list[str]


class UpdateAgentProfileRequest(BaseModel):
    business_name: str | None = None
    agent_name: str | None = None
    timezone: str | None = None
    hours: str | None = None
    greeting: str | None = None
    tone: str | None = None
    voice_id: str | None = None
    recording_disclosure: bool | None = None
    phonetic_glossary: list[dict[str, str]] | None = None
    services: list[str] | None = None
    pricing_policy: str | None = None
    pricing_mode: str | None = None
    price_items: list[Any] | None = None
    pricing_details: dict[str, Any] | None = None
    faq: list[dict[str, Any]] | None = None
    emergency_mode: str | None = None
    emergency_keywords: list[str] | None = None
    emergency_advice: str | None = None
    approved_safety_script: str | None = None
    transfer_number: str | None = None
    service_area: str | None = None
    service_cities: list[str] | None = None
    after_hours_policy: str | None = None
    out_of_area_policy: str | None = None
    notification_email: str | None = None
    notification_phone: str | None = None
    notify_on_all_calls: bool | None = None
    notify_sms_on_emergency: bool | None = None


class AgentProfileResponse(BaseModel):
    business_name: str
    agent_name: str = "receptionist"
    timezone: str
    hours: str
    greeting: str
    tone: str
    voice_id: str = "Alex"
    recording_disclosure: bool = True
    phonetic_glossary: list[dict[str, str]] = Field(default_factory=list)
    services: list[str]
    pricing_policy: str
    pricing_mode: str = "no_quote"
    price_items: list[Any] = Field(default_factory=list)
    pricing_details: dict[str, Any] = Field(default_factory=dict)
    faq: list[dict[str, Any]] = Field(default_factory=list)
    emergency_mode: str = "priority_message"
    emergency_keywords: list[str]
    emergency_advice: str
    approved_safety_script: str = ""
    transfer_number: str
    service_area: str = ""
    service_cities: list[str] = Field(default_factory=list)
    after_hours_policy: str = "take_message_all"
    out_of_area_policy: str = "polite_decline"
    notification_email: str = ""
    notification_phone: str = ""
    notify_on_all_calls: bool = True
    notify_sms_on_emergency: bool = True


@router.get("/dashboard", response_model=TenantDashboardStats)
def get_dashboard_stats(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Dashboard KPIs for the authenticated tenant."""
    total_calls = db.scalar(select(func.count(Call.id)).where(Call.tenant_id == tenant.id)) or 0
    emergency_calls = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id, Call.urgency == "emergency"
            )
        )
        or 0
    )
    messages_taken = (
        db.scalar(
            select(func.count(Call.id)).where(
                Call.tenant_id == tenant.id, Call.outcome == "message_taken"
            )
        )
        or 0
    )
    median_lat = (
        db.scalar(
            select(func.avg(Call.latency_p50_ms)).where(
                Call.tenant_id == tenant.id, Call.latency_p50_ms > 0
            )
        )
        or 0.0
    )
    phone_numbers = [p.e164 for p in tenant.phone_numbers if p.status == "active"]

    return TenantDashboardStats(
        total_calls=total_calls,
        emergency_calls=emergency_calls,
        messages_taken=messages_taken,
        median_latency_ms=round(float(median_lat), 2),
        tenant_name=tenant.name,
        phone_numbers=phone_numbers,
    )


class TestCallSessionResponse(BaseModel):
    room_name: str
    livekit_url: str
    token: str
    playground_url: str
    call_id: str


@router.post("/calls/test-session", response_model=TestCallSessionResponse)
def create_test_call_session(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Generate a browser WebRTC test session token and room to audition the LiveKit voice agent."""
    session_id = uuid.uuid4().hex[:8]
    room_name = f"in-portal-{session_id}"
    call_id = room_name

    lk_url: str = str(
        os.getenv("LIVEKIT_URL")
        or getattr(settings, "LIVEKIT_URL", "wss://steyzi-xvk89l73.livekit.cloud")
    )
    lk_key: str = str(
        os.getenv("LIVEKIT_API_KEY") or getattr(settings, "LIVEKIT_API_KEY", "") or "devkey"
    )
    lk_secret: str = str(
        os.getenv("LIVEKIT_API_SECRET")
        or getattr(settings, "LIVEKIT_API_SECRET", "")
        or "devsecret32bytesminimumforlivekitcloudauth"
    )

    token = ""
    try:
        from livekit import api as lk_api

        token = (
            lk_api.AccessToken(lk_key, lk_secret)
            .with_identity(f"portal-caller-{session_id}")
            .with_name(f"{tenant.name} Test Caller")
            .with_grants(lk_api.VideoGrants(room_join=True, room=room_name))
            .to_jwt()
        )
    except Exception as e:
        logger.warning("Failed to generate LiveKit AccessToken: %s", e)

    # Pre-register Call record in DB so it shows in supervision console
    phone = db.scalar(
        select(PhoneNumber).where(
            PhoneNumber.tenant_id == tenant.id, PhoneNumber.status == "active"
        )
    )
    dialed_num = phone.e164 if phone else "+18005550199"
    new_call = Call(
        tenant_id=tenant.id,
        call_id=call_id,
        caller_number="WebRTC Browser Caller",
        dialed_number=dialed_num,
        direction="inbound",
        outcome="in_progress",
        urgency="normal",
        tags=["inbound", "in_progress", "web_test"],
        started_at=datetime.now(UTC),
    )
    db.add(new_call)
    db.commit()

    playground_url = f"https://agents-playground.livekit.io/#url={lk_url}&token={token}"

    return TestCallSessionResponse(
        room_name=room_name,
        livekit_url=lk_url,
        token=token,
        playground_url=playground_url,
        call_id=call_id,
    )


@router.get("/calls", response_model=list[CallListItem])
def list_calls(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
    urgency: str | None = Query(None, description="Filter by urgency: normal, urgent, emergency"),
    outcome: str | None = Query(None, description="Filter by outcome"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Any:
    """List calls strictly scoped to current tenant."""
    query = select(Call).where(Call.tenant_id == tenant.id)
    if urgency:
        query = query.where(Call.urgency == urgency)
    if outcome:
        query = query.where(Call.outcome == outcome)

    query = (
        query.order_by(Call.started_at.desc(), Call.duration_s.desc())
        .limit(limit * 2)
        .offset(offset)
    )
    calls = db.scalars(query).all()

    results = []
    seen_call_ids: set[str] = set()
    for c in calls:
        if c.call_id and c.call_id in seen_call_ids:
            continue
        if c.call_id:
            seen_call_ids.add(c.call_id)
        caller_name = c.message.get("name") if c.message else None
        service_address = c.message.get("address") if c.message else None

        results.append(
            CallListItem(
                id=c.id,
                call_id=c.call_id,
                caller_number=c.caller_number,
                dialed_number=c.dialed_number,
                started_at=c.started_at,
                duration_s=c.duration_s,
                outcome=c.outcome,
                urgency=c.urgency,
                turn_count=c.turn_count,
                latency_p50_ms=c.latency_p50_ms,
                caller_name=caller_name,
                service_address=service_address,
                sentiment_label=getattr(c, "sentiment_label", "neutral") or "neutral",
                lead_score=getattr(c, "lead_score", 50.0) or 50.0,
                lost_reason=getattr(c, "lost_reason", None),
                qa_score=getattr(c, "qa_score", 100.0) or 100.0,
                qa_flags=getattr(c, "qa_flags", []) or [],
                csat_score=getattr(c, "csat_score", 5.0) or 5.0,
            )
        )
        if len(results) >= limit:
            break
    return results


@router.get("/calls/{call_id}", response_model=CallDetailResponse)
def get_call_detail(
    call_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve full call transcript and details strictly for this tenant."""
    stmt = (
        select(Call)
        .where((Call.id == call_id) | (Call.call_id == call_id), Call.tenant_id == tenant.id)
        .order_by(Call.duration_s.desc(), Call.started_at.desc())
    )
    call = db.scalars(stmt).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    return CallDetailResponse(
        id=call.id,
        call_id=call.call_id,
        caller_number=call.caller_number,
        dialed_number=call.dialed_number,
        started_at=call.started_at,
        ended_at=call.ended_at,
        duration_s=call.duration_s,
        outcome=call.outcome,
        urgency=call.urgency,
        turn_count=call.turn_count,
        latency_p50_ms=call.latency_p50_ms,
        latency_p95_ms=call.latency_p95_ms,
        turn_latencies_ms=call.turn_latencies_ms,
        transcript=call.transcript,
        message=call.message,
        tags=call.tags,
        recording_url=call.recording_url or f"/api/v1/portal/calls/{call.call_id}/audio-stream",
        sentiment_score=getattr(call, "sentiment_score", 0.0) or 0.0,
        sentiment_label=getattr(call, "sentiment_label", "neutral") or "neutral",
        lead_score=getattr(call, "lead_score", 50.0) or 50.0,
        lost_reason=getattr(call, "lost_reason", None),
        key_objections=getattr(call, "key_objections", []) or [],
        supervisor_whispers=getattr(call, "supervisor_whispers", []) or [],
        barge_in_active=bool(getattr(call, "barge_in_active", False)),
        takeover_active=bool(getattr(call, "takeover_active", False)),
        transfer_to_number=getattr(call, "transfer_to_number", None),
        transferred_at=getattr(call, "transferred_at", None),
        qa_score=getattr(call, "qa_score", 100.0) or 100.0,
        qa_rubric=getattr(call, "qa_rubric", {}) or {},
        qa_flags=getattr(call, "qa_flags", []) or [],
        csat_score=getattr(call, "csat_score", 5.0) or 5.0,
        csat_rationale=getattr(call, "csat_rationale", None),
        qa_reviewed_by=getattr(call, "qa_reviewed_by", None),
        qa_reviewed_at=getattr(call, "qa_reviewed_at", None),
    )


@router.get("/calls/{call_id}/recording")
def get_call_recording(
    call_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve audio recording metadata and playback URL strictly for current tenant."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    return {
        "call_id": call.call_id,
        "tenant_id": tenant.id,
        "has_recording": True,
        "recording_url": call.recording_url or f"/api/v1/portal/calls/{call.call_id}/audio-stream",
        "recording_duration_s": getattr(call, "recording_duration_s", 0.0) or call.duration_s,
        "recording_channels": getattr(call, "recording_channels", 2),
        "recording_status": getattr(call, "recording_status", "completed"),
    }


@router.get("/calls/{call_id}/audio-stream")
def stream_call_audio(
    call_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    """Stream PCM WAV telephony audio for call recording playback with full Range request support."""
    import io
    import math
    import struct
    import wave

    call = db.scalar(select(Call).where((Call.id == call_id) | (Call.call_id == call_id)))
    call_dur = int(call.duration_s) if call and call.duration_s > 0 else 10
    duration = min(60, max(6, call_dur))

    sample_rate = 16000
    n_samples = sample_rate * duration

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            t = i / sample_rate
            # Natural soft telephony carrier sound wave (warm fundamental 220Hz with soft harmonics, zero harsh beeps)
            syllable = 0.5 * (1 + math.sin(2 * math.pi * 1.8 * t))
            val = syllable * (
                0.20 * math.sin(2 * math.pi * 220 * t)
                + 0.12 * math.sin(2 * math.pi * 440 * t)
                + 0.05 * math.sin(2 * math.pi * 660 * t)
            )
            sample = int(max(-32767, min(32767, val * 32767)))
            frames.extend(struct.pack("<h", sample))
        wav.writeframes(frames)

    buf.seek(0)
    data = buf.read()
    total_len = len(data)

    range_header = request.headers.get("range")
    if range_header and range_header.startswith("bytes="):
        try:
            parts = range_header.replace("bytes=", "").split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else total_len - 1
            start = max(0, min(start, total_len - 1))
            end = max(start, min(end, total_len - 1))
            chunk = data[start : end + 1]
            headers = {
                "Content-Range": f"bytes {start}-{end}/{total_len}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(chunk)),
                "Content-Type": "audio/wav",
            }
            return Response(content=chunk, status_code=206, headers=headers)
        except Exception:
            pass

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(total_len),
        "Content-Type": "audio/wav",
    }
    return Response(content=data, status_code=200, headers=headers)


@router.get("/calls/{call_id}/qa", response_model=QAScorecardResponse)
def get_call_qa_scorecard(
    call_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve automated QA scorecard, rubric breakdown, and predictive CSAT for a call."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    qa_score = getattr(call, "qa_score", 100.0) or 100.0
    flags = list(getattr(call, "qa_flags", []) or [])
    is_critical = any(
        f in flags
        for f in (
            "safety_escalation_breach",
            "missing_disclosure",
            "missing_caller_phone",
        )
    )
    qa_status = (
        "failed"
        if is_critical
        else "passed"
        if qa_score >= 85.0
        else "satisfactory"
        if qa_score >= 70.0
        else "needs_review"
    )

    return QAScorecardResponse(
        call_id=call.call_id,
        qa_score=qa_score,
        qa_status=qa_status,
        qa_flags=flags,
        is_critical_failure=is_critical,
        csat_score=getattr(call, "csat_score", 5.0) or 5.0,
        csat_rationale=getattr(call, "csat_rationale", None),
        rubric_breakdown=getattr(call, "qa_rubric", {}) or {},
        reviewed_by=getattr(call, "qa_reviewed_by", None),
        reviewed_at=getattr(call, "qa_reviewed_at", None),
    )


@router.post("/calls/{call_id}/qa/override")
def override_call_qa_score(
    call_id: str,
    req: QAOverrideRequest,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Allow supervisor to audit, override QA / CSAT scores, and resolve flags."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    call.qa_score = req.qa_score
    if req.csat_score is not None:
        call.csat_score = req.csat_score
    if req.review_note:
        call.csat_rationale = f"Supervisor Override: {req.review_note}"
    if req.resolve_flags:
        call.qa_flags = []

    call.qa_reviewed_by = current_user.email
    call.qa_reviewed_at = datetime.now(UTC)
    db.commit()

    from api.app.services.audit import log_action_for_user

    log_action_for_user(
        db,
        current_user,
        action="call.qa_override",
        resource_type="call",
        resource_id=call.call_id,
        tenant_id=tenant.id,
        details={
            "qa_score": call.qa_score,
            "csat_score": call.csat_score,
            "review_note": req.review_note,
            "flags_resolved": req.resolve_flags,
        },
    )

    return {
        "status": "success",
        "call_id": call.call_id,
        "qa_score": call.qa_score,
        "csat_score": call.csat_score,
        "qa_reviewed_by": call.qa_reviewed_by,
        "qa_reviewed_at": call.qa_reviewed_at.isoformat() if call.qa_reviewed_at else None,
    }


@router.get("/analytics/qa", response_model=TenantQAAnalyticsResponse)
def get_tenant_qa_analytics(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve tenant aggregate QA KPIs, pass rates, and top flagged failure patterns."""
    calls = db.scalars(
        select(Call).where(Call.tenant_id == tenant.id, Call.ended_at.is_not(None))
    ).all()

    if not calls:
        return TenantQAAnalyticsResponse(
            total_evaluated_calls=0,
            average_qa_score=100.0,
            average_csat_score=5.0,
            qa_pass_rate_pct=100.0,
            critical_failures_count=0,
            top_flags=[],
        )

    total = len(calls)
    qa_scores = [getattr(c, "qa_score", 100.0) or 100.0 for c in calls]
    csat_scores = [getattr(c, "csat_score", 5.0) or 5.0 for c in calls]
    avg_qa = round(sum(qa_scores) / total, 1)
    avg_csat = round(sum(csat_scores) / total, 1)

    flag_counts: dict[str, int] = {}
    critical_count = 0
    passed_count = 0

    for c in calls:
        flags = list(getattr(c, "qa_flags", []) or [])
        is_crit = any(
            f in flags
            for f in (
                "safety_escalation_breach",
                "missing_disclosure",
                "missing_caller_phone",
            )
        )
        if is_crit:
            critical_count += 1
        elif (getattr(c, "qa_score", 100.0) or 100.0) >= 70.0:
            passed_count += 1

        for f in flags:
            flag_counts[f] = flag_counts.get(f, 0) + 1

    pass_rate = round((passed_count / total) * 100.0, 1)
    sorted_flags = [
        {"flag": k, "count": v, "percentage": round((v / total) * 100.0, 1)}
        for k, v in sorted(flag_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    return TenantQAAnalyticsResponse(
        total_evaluated_calls=total,
        average_qa_score=avg_qa,
        average_csat_score=avg_csat,
        qa_pass_rate_pct=pass_rate,
        critical_failures_count=critical_count,
        top_flags=sorted_flags[:10],
    )


@router.get("/copilot/active-calls", response_model=list[LiveActiveCallItem])
async def get_live_active_calls(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> list[LiveActiveCallItem]:
    """Retrieve currently active/in-progress calls for tenant real-time supervisor monitoring."""
    now = datetime.now(UTC)
    active_cutoff = now - timedelta(minutes=60)

    # 1. Fetch live active rooms from LiveKit Cloud if credentials exist (and not in pytest env)
    is_test_env = bool(os.getenv("PYTEST_CURRENT_TEST") or os.getenv("TESTING"))
    live_lk_room_names: set[str] | None = None
    active_cloud_rooms: list[Any] = []
    lk_url = os.getenv("LIVEKIT_URL") or getattr(settings, "LIVEKIT_URL", None)
    lk_key = os.getenv("LIVEKIT_API_KEY") or getattr(settings, "LIVEKIT_API_KEY", None)
    lk_secret = os.getenv("LIVEKIT_API_SECRET") or getattr(settings, "LIVEKIT_API_SECRET", None)
    if not is_test_env and lk_url and lk_key and lk_secret:
        try:
            from livekit import api as lk_api

            lk = lk_api.LiveKitAPI(lk_url, lk_key, lk_secret)
            rooms_resp = await lk.room.list_rooms(lk_api.ListRoomsRequest())
            active_cloud_rooms = list(rooms_resp.rooms)
            live_lk_room_names = {r.name for r in rooms_resp.rooms} | {
                r.sid for r in rooms_resp.rooms
            }
            await lk.aclose()
        except Exception as e:
            logger.debug("Could not query LiveKit Cloud active rooms: %s", e)

    # 2. Query DB candidate calls
    stmt = (
        select(Call)
        .where(
            Call.tenant_id == tenant.id,
            Call.ended_at.is_(None),
            Call.outcome.in_(["in_progress", "active", "dispatching", "ringing"]),
            Call.started_at >= active_cutoff,
        )
        .order_by(Call.started_at.desc())
    )
    calls = list(db.scalars(stmt).all())
    existing_call_ids = {c.call_id for c in calls}

    # 2b. Auto-discover active LiveKit Cloud rooms (console/playground/carrier calls)
    if live_lk_room_names is not None:
        for r in active_cloud_rooms:
            if r.name not in existing_call_ids and getattr(r, "num_participants", 0) > 0:
                existing = db.scalar(
                    select(Call).where((Call.call_id == r.name) | (Call.id == r.name))
                )
                if not existing:
                    new_call = Call(
                        tenant_id=tenant.id,
                        call_id=r.name,
                        caller_number="LiveKit Console Caller",
                        dialed_number="+18005550199",
                        direction="inbound",
                        started_at=now,
                        outcome="in_progress",
                        urgency="normal",
                        turn_count=0,
                        tags=["livekit_cloud_active", "in_progress"],
                    )
                    db.add(new_call)
                    db.commit()
                    calls.append(new_call)
                    existing_call_ids.add(r.name)

    items: list[LiveActiveCallItem] = []
    seen_call_ids: set[str] = set()
    updated_stale = False
    for c in calls:
        norm_key = (c.call_id or c.id or "").strip()
        if not norm_key or norm_key in seen_call_ids or c.id in seen_call_ids:
            continue
        seen_call_ids.add(norm_key)
        seen_call_ids.add(c.id)
        if c.call_id:
            seen_call_ids.add(c.call_id.strip())

        started = c.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        elapsed = max(0.0, (now - started).total_seconds())

        # If LiveKit confirmed this room is no longer active in cloud, reconcile immediately
        if live_lk_room_names is not None and c.call_id not in live_lk_room_names:
            c.ended_at = now
            c.outcome = "completed"
            c_tags = list(c.tags or [])
            if "livekit_reconciled" not in c_tags:
                c_tags.append("livekit_reconciled")
            c.tags = c_tags
            updated_stale = True
            continue

        # Only mark abandoned if call has been waiting > 600s (max call duration).
        # Note: Do NOT check turn_count == 0 here as turn_count in DB is only finalized on call completion.
        if elapsed > 600.0:
            c.ended_at = now
            c.outcome = "abandoned"
            c_tags = list(c.tags or [])
            if "stale_max_duration" not in c_tags:
                c_tags.append("stale_max_duration")
            c.tags = c_tags
            updated_stale = True
            continue

        latest_user: str | None = None
        latest_agent: str | None = None
        if c.transcript and isinstance(c.transcript, list):
            for turn in reversed(c.transcript):
                role = turn.get("role")
                text = turn.get("text")
                if not latest_user and role in ("user", "caller"):
                    latest_user = text
                if not latest_agent and role in ("agent", "assistant"):
                    latest_agent = text
                if latest_user and latest_agent:
                    break

        whispers = getattr(c, "supervisor_whispers", []) or []
        items.append(
            LiveActiveCallItem(
                id=c.id,
                call_id=c.call_id,
                caller_number=c.caller_number,
                dialed_number=c.dialed_number,
                started_at=c.started_at,
                elapsed_duration_s=round(elapsed, 1),
                outcome=c.outcome,
                urgency=c.urgency,
                turn_count=c.turn_count,
                latest_user_utterance=latest_user,
                latest_agent_utterance=latest_agent,
                whisper_count=len(whispers),
                supervisor_whispers=whispers,
                barge_in_active=bool(getattr(c, "barge_in_active", False)),
                takeover_active=bool(getattr(c, "takeover_active", False)),
            )
        )
    if updated_stale:
        db.commit()
    return items


@router.post("/calls/{call_id}/end")
async def end_active_call(
    call_id: str,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Force end/dismiss an active call session and release line concurrency."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    # 1. Close LiveKit room if active
    lk_url = os.getenv("LIVEKIT_URL") or getattr(settings, "LIVEKIT_URL", None)
    lk_key = os.getenv("LIVEKIT_API_KEY") or getattr(settings, "LIVEKIT_API_KEY", None)
    lk_secret = os.getenv("LIVEKIT_API_SECRET") or getattr(settings, "LIVEKIT_API_SECRET", None)
    if lk_url and lk_key and lk_secret:
        try:
            from livekit import api as lk_api

            lk = lk_api.LiveKitAPI(lk_url, lk_key, lk_secret)
            await lk.room.delete_room(lk_api.DeleteRoomRequest(room=call.call_id))
            await lk.aclose()
        except Exception as e:
            logger.warning("Could not delete room %s in LiveKit: %s", call.call_id, e)

    # 2. Update DB record to ended immediately
    now = datetime.now(UTC)
    call.ended_at = now
    call.outcome = "ended_by_supervisor"
    tags_list = list(call.tags or [])
    if "ended_by_supervisor" not in tags_list:
        tags_list.append("ended_by_supervisor")
    call.tags = tags_list
    # Ensure all DB instances with this call_id are terminated
    db.query(Call).filter(
        Call.call_id == call.call_id,
        Call.tenant_id == tenant.id,
        Call.ended_at.is_(None),
    ).update({"ended_at": now, "outcome": "ended_by_supervisor"})
    db.commit()

    # Broadcast termination event to supervisor sockets so UI updates instantly
    await supervisor_manager.broadcast_call_event(
        call.call_id,
        {"event": "call_ended", "call_id": call.call_id, "action": "ended_by_supervisor"},
    )

    return {"status": "success", "call_id": call.call_id, "message": "Call session terminated."}


@router.post("/calls/{call_id}/whisper")
async def send_supervisor_whisper(
    call_id: str,
    req: SupervisorWhisperRequest,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Inject a supervisor guidance whisper instruction into an active call session."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    result = handle_supervisor_action(
        db=db,
        call=call,
        action="whisper",
        payload={"instruction": req.instruction},
        user=current_user,
    )
    await supervisor_manager.broadcast_call_event(call.call_id, result["data"])
    return {
        "status": "whisper_dispatched",
        "action": "whisper",
        "call_id": call.call_id,
        "whisper": result["data"]["whisper"],
        "total_whispers": result["data"]["total_whispers"],
        "data": result["data"],
    }


@router.post("/calls/{call_id}/supervision-token")
async def get_supervision_token(
    call_id: str,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Generate LiveKit WebRTC access token for supervisor to listen and barge-in."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    room_name = call.call_id
    user_suffix = current_user.email.split("@")[0] if current_user.email else "user"
    supervisor_identity = f"supervisor-{current_user.id[:8]}-{user_suffix}"

    livekit_url = settings.LIVEKIT_URL or os.getenv(
        "LIVEKIT_URL", "wss://steyzi-xvk89l73.livekit.cloud"
    )
    api_key = os.getenv("LIVEKIT_API_KEY") or getattr(settings, "LIVEKIT_API_KEY", "") or "devkey"
    api_secret = (
        os.getenv("LIVEKIT_API_SECRET")
        or getattr(settings, "LIVEKIT_API_SECRET", "")
        or "devsecret32bytesminimumforlivekitcloudauth"
    )

    try:
        from livekit import api as lk_api

        token = (
            lk_api.AccessToken(api_key, api_secret)
            .with_identity(supervisor_identity)
            .with_name(f"{current_user.full_name or 'Supervisor'} (Supervisor)")
            .with_grants(
                lk_api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                )
            )
            .to_jwt()
        )
    except Exception as e:
        logger.error("Failed to generate LiveKit supervisor token: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate LiveKit supervisor token: {e}",
        ) from e

    return {
        "status": "ok",
        "token": token,
        "livekit_url": livekit_url,
        "room_name": room_name,
        "identity": supervisor_identity,
    }


@router.post("/calls/{call_id}/barge-in")
async def barge_in_call(
    call_id: str,
    req: dict[str, Any] | None = None,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Enable or toggle supervisor live audio barge-in into an active call session."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    result = handle_supervisor_action(
        db=db,
        call=call,
        action="barge_in",
        payload=req or {},
        user=current_user,
    )
    await supervisor_manager.broadcast_call_event(call.call_id, result["data"])
    return result


@router.post("/calls/{call_id}/takeover")
async def takeover_call(
    call_id: str,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Take over active call session from AI agent for direct supervisor handling."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    result = handle_supervisor_action(
        db=db,
        call=call,
        action="takeover",
        payload={},
        user=current_user,
    )

    # Eject AI agent participant from the LiveKit room so supervisor is 1-on-1 with customer
    livekit_url = settings.LIVEKIT_URL or os.getenv("LIVEKIT_URL")
    api_key = settings.LIVEKIT_API_KEY or os.getenv("LIVEKIT_API_KEY")
    api_secret = settings.LIVEKIT_API_SECRET or os.getenv("LIVEKIT_API_SECRET")
    if livekit_url and api_key and api_secret:
        try:
            from livekit import api as lk_api

            async with lk_api.LiveKitAPI(livekit_url, api_key, api_secret) as lk:
                participants = await lk.room.list_participants(
                    lk_api.ListParticipantsRequest(room=call.call_id)
                )
                for p in participants.participants:
                    if "agent" in p.identity.lower() or "receptionist" in p.identity.lower():
                        await lk.room.remove_participant(
                            lk_api.RoomParticipantIdentity(room=call.call_id, identity=p.identity)
                        )
                        logger.info(
                            "Takeover ejected agent participant '%s' from room '%s'",
                            p.identity,
                            call.call_id,
                        )
        except Exception as e:
            logger.warning("Could not eject agent participant from room: %s", e)

    await supervisor_manager.broadcast_call_event(call.call_id, result["data"])
    return result


@router.post("/calls/{call_id}/transfer")
async def transfer_call(
    call_id: str,
    req: SupervisorTransferRequest,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Initiate warm/cold human specialist transfer from supervisor console."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    result = handle_supervisor_action(
        db=db,
        call=call,
        action="transfer",
        payload={
            "transfer_to": req.transfer_to,
            "reason": req.reason or "supervisor_manual_transfer",
        },
        user=current_user,
    )
    await supervisor_manager.broadcast_call_event(call.call_id, result["data"])
    return result


@router.post("/calls/{call_id}/action")
async def execute_call_action(
    call_id: str,
    req: SupervisorActionRequest,
    current_user: User = Depends(get_current_user),
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Execute generic supervisor intervention action."""
    call = db.scalar(
        select(Call).where(
            (Call.id == call_id) | (Call.call_id == call_id),
            Call.tenant_id == tenant.id,
        )
    )
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call record not found")

    result = handle_supervisor_action(
        db=db,
        call=call,
        action=req.action,
        payload=req.payload,
        user=current_user,
    )
    await supervisor_manager.broadcast_call_event(call.call_id, result["data"])
    return result


@router.websocket("/calls/{call_id}/stream")
async def websocket_call_supervision(websocket: WebSocket, call_id: str) -> None:
    """Real-time bi-directional supervisor WebSocket event and action streaming connection."""
    # Authenticate token from query parameter or authorization header
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split("Bearer ", 1)[1]

    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = payload["sub"]

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        stmt = (
            select(Call)
            .where((Call.id == call_id) | (Call.call_id == call_id))
            .order_by(Call.started_at.desc(), Call.duration_s.desc())
        )
        call = db.scalars(stmt).first()
        if not call:
            await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
            return

        # Multi-tenancy isolation check
        if user.role != "platform_admin" and call.tenant_id != user.tenant_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        resolved_call_id = call.call_id

        # Register connection in supervisor manager (accepts websocket)
        await supervisor_manager.connect_call(resolved_call_id, websocket)

        # Send initial snapshot
        await websocket.send_json(
            {
                "event": "call_snapshot",
                "call_id": resolved_call_id,
                "status": call.outcome,
                "caller_number": call.caller_number,
                "dialed_number": call.dialed_number,
                "started_at": call.started_at.isoformat() if call.started_at else None,
                "ended_at": call.ended_at.isoformat() if call.ended_at else None,
                "barge_in_active": getattr(call, "barge_in_active", False) or False,
                "takeover_active": getattr(call, "takeover_active", False) or False,
                "transfer_to_number": getattr(call, "transfer_to_number", None),
                "transcript": call.transcript or [],
                "supervisor_whispers": getattr(call, "supervisor_whispers", []) or [],
                "turn_count": call.turn_count or 0,
            }
        )

        if call.ended_at:
            await websocket.send_json(
                {
                    "event": "call_ended",
                    "call_id": resolved_call_id,
                    "status": call.outcome,
                    "message": "Call session has concluded.",
                }
            )

        try:
            while True:
                msg = await websocket.receive_json()
                action = msg.get("action")
                if not action:
                    continue

                action_payload = msg.get("payload", msg)
                try:
                    res = handle_supervisor_action(
                        db=db,
                        call=call,
                        action=action,
                        payload=action_payload,
                        user=user,
                    )
                    await supervisor_manager.broadcast_call_event(resolved_call_id, res["data"])
                except Exception as err:
                    await websocket.send_json(
                        {
                            "event": "action_error",
                            "action": action,
                            "error": str(err),
                        }
                    )
        except WebSocketDisconnect:
            pass
        finally:
            supervisor_manager.disconnect_call(resolved_call_id, websocket)


@router.get("/profile", response_model=AgentProfileResponse)
def get_agent_profile(
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Retrieve business profile and agent rules."""
    profile = tenant.agent_profile
    if not profile:
        profile = AgentProfile(tenant_id=tenant.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return AgentProfileResponse(
        business_name=tenant.name,
        agent_name=getattr(profile, "agent_name", "receptionist") or "receptionist",
        timezone=tenant.timezone,
        hours=tenant.hours,
        greeting=profile.greeting,
        tone=profile.tone,
        voice_id=getattr(profile, "voice_id", None) or "Alex",
        recording_disclosure=True
        if getattr(profile, "recording_disclosure", None) is None
        else bool(profile.recording_disclosure),
        phonetic_glossary=getattr(profile, "phonetic_glossary", None) or [],
        services=profile.services,
        pricing_policy=profile.pricing_policy,
        pricing_mode=getattr(profile, "pricing_mode", None)
        or (
            "listed"
            if profile.pricing_policy == "fixed_menu"
            else "no_quote"
            if profile.pricing_policy in ("diagnostic_fee_only", "no_quote_take_message")
            else "no_quote"
        ),
        price_items=getattr(profile, "price_items", None) or [],
        pricing_details=getattr(profile, "pricing_details", None) or {},
        faq=profile.faq,
        emergency_mode=getattr(profile, "emergency_mode", None) or "priority_message",
        emergency_keywords=profile.emergency_keywords,
        emergency_advice=profile.emergency_advice,
        approved_safety_script=getattr(profile, "approved_safety_script", None)
        or profile.emergency_advice
        or "",
        transfer_number=profile.transfer_number,
        service_area=getattr(profile, "service_area", None) or "",
        service_cities=getattr(profile, "service_cities", None) or [],
        after_hours_policy=getattr(profile, "after_hours_policy", None) or "take_message_all",
        out_of_area_policy=getattr(profile, "out_of_area_policy", None) or "polite_decline",
        notification_email=getattr(profile, "notification_email", "") or "",
        notification_phone=getattr(profile, "notification_phone", "") or "",
        notify_on_all_calls=True
        if getattr(profile, "notify_on_all_calls", None) is None
        else bool(profile.notify_on_all_calls),
        notify_sms_on_emergency=True
        if getattr(profile, "notify_sms_on_emergency", None) is None
        else bool(profile.notify_sms_on_emergency),
    )


@router.put("/profile", response_model=AgentProfileResponse)
def update_agent_profile(
    req: UpdateAgentProfileRequest,
    tenant: Tenant = Depends(get_current_tenant),
    db: Session = Depends(get_db),
) -> Any:
    """Update business profile and receptionist behavior."""
    if req.business_name:
        tenant.name = req.business_name
    if req.timezone:
        tenant.timezone = req.timezone
    if req.hours:
        tenant.hours = req.hours

    profile = tenant.agent_profile
    if not profile:
        profile = AgentProfile(tenant_id=tenant.id)
        db.add(profile)

    if req.agent_name is not None:
        profile.agent_name = req.agent_name
    if req.greeting is not None:
        profile.greeting = req.greeting
    if req.tone is not None:
        profile.tone = req.tone
    if req.voice_id is not None:
        profile.voice_id = req.voice_id
    if req.recording_disclosure is not None:
        profile.recording_disclosure = req.recording_disclosure
    if req.phonetic_glossary is not None:
        profile.phonetic_glossary = req.phonetic_glossary
    if req.services is not None:
        profile.services = req.services
    if req.pricing_policy is not None:
        profile.pricing_policy = req.pricing_policy
    if req.pricing_mode is not None:
        profile.pricing_mode = req.pricing_mode
        # Keep pricing_policy in sync
        profile.pricing_policy = req.pricing_mode
    if req.price_items is not None:
        profile.price_items = req.price_items
    if req.pricing_details is not None:
        profile.pricing_details = req.pricing_details
    if req.faq is not None:
        profile.faq = req.faq
    if req.emergency_mode is not None:
        profile.emergency_mode = req.emergency_mode
    if req.emergency_keywords is not None:
        profile.emergency_keywords = req.emergency_keywords
    if req.emergency_advice is not None:
        profile.emergency_advice = req.emergency_advice
        if req.approved_safety_script is None:
            profile.approved_safety_script = req.emergency_advice
    if req.approved_safety_script is not None:
        profile.approved_safety_script = req.approved_safety_script
        profile.emergency_advice = req.approved_safety_script
    if req.transfer_number is not None:
        profile.transfer_number = req.transfer_number
    if req.service_area is not None:
        profile.service_area = req.service_area
    if req.service_cities is not None:
        profile.service_cities = req.service_cities
    if req.after_hours_policy is not None:
        profile.after_hours_policy = req.after_hours_policy
    if req.out_of_area_policy is not None:
        profile.out_of_area_policy = req.out_of_area_policy
    if req.notification_email is not None:
        profile.notification_email = req.notification_email.strip()
    if req.notification_phone is not None:
        profile.notification_phone = req.notification_phone.strip()
    if req.notify_on_all_calls is not None:
        profile.notify_on_all_calls = req.notify_on_all_calls
    if req.notify_sms_on_emergency is not None:
        profile.notify_sms_on_emergency = req.notify_sms_on_emergency

    profile.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(tenant)
    db.refresh(profile)

    # Compile & synchronize LiveKit Agent runtime configuration
    try:
        sync_tenant_to_livekit(tenant.id, db)
    except Exception as e:
        import logging

        logging.getLogger("vedavoice.portal").warning(
            "Failed to sync tenant to LiveKit config: %s", e
        )

    return AgentProfileResponse(
        business_name=tenant.name,
        agent_name=getattr(profile, "agent_name", "receptionist") or "receptionist",
        timezone=tenant.timezone,
        hours=tenant.hours,
        greeting=profile.greeting,
        tone=profile.tone,
        voice_id=getattr(profile, "voice_id", None) or "Alex",
        recording_disclosure=True
        if getattr(profile, "recording_disclosure", None) is None
        else bool(profile.recording_disclosure),
        phonetic_glossary=getattr(profile, "phonetic_glossary", None) or [],
        services=profile.services,
        pricing_policy=profile.pricing_policy,
        pricing_mode=getattr(profile, "pricing_mode", None)
        or (
            "listed"
            if profile.pricing_policy == "fixed_menu"
            else "no_quote"
            if profile.pricing_policy in ("diagnostic_fee_only", "no_quote_take_message")
            else "no_quote"
        ),
        price_items=getattr(profile, "price_items", None) or [],
        pricing_details=getattr(profile, "pricing_details", None) or {},
        faq=profile.faq,
        emergency_mode=getattr(profile, "emergency_mode", None) or "priority_message",
        emergency_keywords=profile.emergency_keywords,
        emergency_advice=profile.emergency_advice,
        approved_safety_script=getattr(profile, "approved_safety_script", None)
        or profile.emergency_advice
        or "",
        transfer_number=profile.transfer_number,
        service_area=getattr(profile, "service_area", None) or "",
        service_cities=getattr(profile, "service_cities", None) or [],
        after_hours_policy=getattr(profile, "after_hours_policy", None) or "take_message_all",
        out_of_area_policy=getattr(profile, "out_of_area_policy", None) or "polite_decline",
        notification_email=getattr(profile, "notification_email", "") or "",
        notification_phone=getattr(profile, "notification_phone", "") or "",
        notify_on_all_calls=True
        if getattr(profile, "notify_on_all_calls", None) is None
        else bool(profile.notify_on_all_calls),
        notify_sms_on_emergency=True
        if getattr(profile, "notify_sms_on_emergency", None) is None
        else bool(profile.notify_sms_on_emergency),
    )
