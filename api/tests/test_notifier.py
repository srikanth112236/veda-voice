"""Tests for automated post-call owner notification pipeline (Email & SMS)."""

import uuid
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from starlette.testclient import TestClient

from api.app.core.security import create_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, Tenant
from api.app.models.user import User
from api.app.services.notifier import (
    CallNotificationPayload,
    ResendEmailDispatcher,
    TwilioSmsDispatcher,
    dispatch_call_notifications,
    format_email_html,
    format_email_plain,
    format_email_subject,
    format_sms_text,
)

client = TestClient(app)


def test_notification_formatting_payloads() -> None:
    """Verify email subject, plain text, HTML, and SMS formatting across urgencies."""
    payload = CallNotificationPayload(
        tenant_id="tenant-123",
        tenant_name="Apex Plumbing",
        call_id="call-456",
        caller_name="Sarah Connor",
        caller_phone="+15125550199",
        service_address="123 Tech Ridge, Austin, TX",
        urgency="emergency",
        outcome="message_taken",
        duration_s=85.0,
        summary="Water heater burst and flooding basement rapidly.",
        action_items=["Dispatch emergency technician immediately.", "Shut off main water valve."],
        transcript=[
            {"speaker": "assistant", "text": "Thanks for calling Apex Plumbing."},
            {"speaker": "user", "text": "My pipe burst and water is everywhere!"},
        ],
        recipient_email="owner@apexplumbing.com",
        recipient_phone="+15125550100",
    )

    # 1. Subject line
    subj = format_email_subject(payload)
    assert "[🚨 EMERGENCY CALL]" in subj
    assert "Apex Plumbing" in subj
    assert "Sarah Connor" in subj

    # 2. Plain text
    text = format_email_plain(payload)
    assert "EMERGENCY CALL ALERT" in text
    assert "+15125550199" in text
    assert "123 Tech Ridge, Austin, TX" in text
    assert "Water heater burst" in text
    assert "Dispatch emergency technician immediately." in text

    # 3. HTML email
    html = format_email_html(payload)
    assert "#dc2626" in html  # Emergency red
    assert "Sarah Connor" in html
    assert 'href="tel:+15125550199"' in html
    assert "123 Tech Ridge" in html
    assert "Water heater burst" in html

    # 4. SMS text
    sms = format_sms_text(payload)
    assert "[🚨 EMERGENCY]" in sms
    assert "Apex Plumbing" in sms
    assert "Sarah Connor" in sms
    assert "123 Tech Ridge" in sms


def test_notification_formatting_routine_call() -> None:
    """Verify normal/routine calls use standard non-emergency styling."""
    payload = CallNotificationPayload(
        tenant_id="tenant-789",
        tenant_name="Austin Dental",
        call_id="call-999",
        caller_name="John Doe",
        caller_phone="+15125550222",
        urgency="normal",
        summary="Routine teeth cleaning inquiry.",
        recipient_email="office@austindental.com",
    )

    subj = format_email_subject(payload)
    assert "[📞 Call Summary]" in subj
    assert "Austin Dental" in subj

    html = format_email_html(payload)
    assert "#2563eb" in html  # Brand blue
    assert "Routine teeth cleaning" in html


def test_resend_email_dispatcher_success() -> None:
    """Verify ResendEmailDispatcher delivers via mocked HTTP POST."""
    dispatcher = ResendEmailDispatcher(api_key="re_test_key_123", from_email="alerts@test.com")

    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        sent = dispatcher.send(
            to_email="client@example.com",
            subject="Test Subject",
            text="Test body",
            html="<p>Test body</p>",
        )
        assert sent is True
        assert mock_urlopen.called
        req = mock_urlopen.call_args[0][0]
        assert req.full_url == "https://api.resend.com/emails"
        assert req.headers["Authorization"] == "Bearer re_test_key_123"


def test_resend_email_dispatcher_fallback_on_empty_key() -> None:
    """Verify fallback to ConsoleEmailDispatcher when no API key is provided."""
    dispatcher = ResendEmailDispatcher(api_key="", from_email="alerts@test.com")
    sent = dispatcher.send(
        to_email="client@example.com",
        subject="Test Fallback",
        text="Test body",
        html="<p>Test body</p>",
    )
    assert sent is True


def test_twilio_sms_dispatcher_success() -> None:
    """Verify TwilioSmsDispatcher sends SMS via Twilio API."""
    dispatcher = TwilioSmsDispatcher(
        account_sid="AC_test_sid",
        auth_token="auth_token_secret",
        from_number="+18005550100",
    )

    mock_resp = MagicMock()
    mock_resp.status = 201
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        sent = dispatcher.send("+15125550199", "Test alert SMS")
        assert sent is True
        assert mock_urlopen.called
        req = mock_urlopen.call_args[0][0]
        assert "api.twilio.com" in req.full_url


def test_twilio_sms_dispatcher_fallback_on_empty_credentials() -> None:
    """Verify fallback to ConsoleSmsDispatcher when Twilio is not configured."""
    dispatcher = TwilioSmsDispatcher(account_sid="", auth_token="", from_number="")
    sent = dispatcher.send("+15125550199", "Test console SMS")
    assert sent is True


def test_dispatch_call_notifications_with_database_record() -> None:
    """Verify end-to-end background dispatcher resolves tenant, owner, and delivers alerts."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    test_call_id = f"test-call-notify-{suffix}"

    try:
        # Create tenant with specific alert email and emergency SMS phone
        tenant = Tenant(
            name=f"Notify Plumbers {suffix}",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        profile = AgentProfile(
            tenant_id=tenant.id,
            notification_email=f"owner_{suffix}@notifyplumbers.com",
            notification_phone="+15125550199",
            notify_on_all_calls=True,
            notify_sms_on_emergency=True,
        )
        db.add(profile)

        owner = User(
            tenant_id=tenant.id,
            email=f"fallback_owner_{suffix}@notifyplumbers.com",
            hashed_password=hash_password("Password123!"),
            full_name="Master Plumber",
            role="tenant_owner",
        )
        db.add(owner)

        # Create emergency call record
        call = Call(
            tenant_id=tenant.id,
            call_id=test_call_id,
            caller_number="+15125550123",
            dialed_number="+15125550999",
            direction="inbound",
            duration_s=64.0,
            outcome="message_taken",
            urgency="emergency",
            message={
                "name": "Jane Doe",
                "phone": "+15125550123",
                "address": "500 Main St, Austin, TX",
                "message": "Water leaking through second floor ceiling!",
                "urgency": "emergency",
            },
            transcript=[
                {"speaker": "assistant", "text": "Emergency line, how can I help?"},
                {"speaker": "user", "text": "Water is leaking through my ceiling!"},
            ],
            tags=["inbound", "emergency"],
        )
        db.add(call)
        db.commit()

        # Run dispatch with mock dispatchers
        mock_email = MagicMock()
        mock_email.send.return_value = True

        mock_sms = MagicMock()
        mock_sms.send.return_value = True

        result = dispatch_call_notifications(
            test_call_id,
            email_dispatcher=mock_email,
            sms_dispatcher=mock_sms,
        )

        assert result["status"] == "delivered"
        assert result["recipient_email"] == f"owner_{suffix}@notifyplumbers.com"
        assert result["recipient_phone"] == "+15125550199"
        assert result["email_sent"] is True
        assert result["sms_sent"] is True
        assert result["urgency"] == "emergency"

        assert mock_email.send.called
        assert mock_sms.send.called

    finally:
        db.close()


def test_dispatch_fallback_to_owner_user_email() -> None:
    """Verify fallback to User table owner email when profile.notification_email is blank."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    test_call_id = f"test-call-fallback-{suffix}"

    try:
        tenant = Tenant(
            name=f"Fallback Corp {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 9am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        profile = AgentProfile(
            tenant_id=tenant.id,
            notification_email="",  # intentionally empty
            notification_phone="",
        )
        db.add(profile)

        owner = User(
            tenant_id=tenant.id,
            email=f"registered_owner_{suffix}@fallbackcorp.com",
            hashed_password=hash_password("Password123!"),
            full_name="Registered Owner",
            role="tenant_owner",
        )
        db.add(owner)

        call = Call(
            tenant_id=tenant.id,
            call_id=test_call_id,
            caller_number="+15125550144",
            dialed_number="+15125550999",
            direction="inbound",
            duration_s=45.0,
            outcome="completed",
            urgency="normal",
            transcript=[{"speaker": "user", "text": "Just checking your hours."}],
        )
        db.add(call)
        db.commit()

        mock_email = MagicMock()
        mock_email.send.return_value = True

        result = dispatch_call_notifications(
            test_call_id,
            email_dispatcher=mock_email,
        )

        assert result["status"] == "delivered"
        assert result["recipient_email"] == f"registered_owner_{suffix}@fallbackcorp.com"
        assert result["email_sent"] is True
        assert mock_email.send.called

    finally:
        db.close()


def test_internal_complete_call_enqueues_notification() -> None:
    """Verify POST /internal/calls/complete triggers the background notification task."""
    suffix = uuid.uuid4().hex[:6]
    call_id = f"test-api-complete-{suffix}"

    # Generate agent call-scoped token
    token = create_access_token({"sub": "livekit-agent", "role": "agent"})

    with patch("api.app.routers.internal.dispatch_call_notifications") as mock_dispatch:
        response = client.post(
            "/api/v1/internal/calls/complete",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "call_id": call_id,
                "dialed_number": "+18005550199",
                "caller_number": "+15125550144",
                "started_at": datetime.now(UTC).isoformat(),
                "ended_at": datetime.now(UTC).isoformat(),
                "duration_s": 52.0,
                "outcome": "message_taken",
                "turn_count": 4,
                "latency_p50_ms": 280.0,
                "latency_p95_ms": 410.0,
                "turn_latencies_ms": [260.0, 300.0],
                "tags": ["inbound", "emergency"],
                "message": {
                    "name": "Tom Davis",
                    "phone": "+15125550144",
                    "address": "77 Brazos St",
                    "message": "Water heater leaking heavily",
                    "urgency": "emergency",
                },
                "transcript": [
                    {"speaker": "assistant", "text": "Thanks for calling."},
                    {"speaker": "user", "text": "My water heater is leaking."},
                ],
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["call_id"] == call_id
        assert mock_dispatch.called
