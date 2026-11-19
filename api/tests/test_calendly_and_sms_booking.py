"""Comprehensive test suite for Phase 4 (Calendly & In-Call SMS Self-Serve Booking) and Phase 5 (Automated Customer & Technician Notifications).

Validates:
1. In-call voice agent send_booking_link tool dispatching SMS with self-serve Calendly URL.
2. Internal /api/v1/internal/calendar/send-link endpoint with call-scoped JWT auth.
3. Calendly inbound webhook ingestion (invitee.created) creating Booking and CRM Contact with stage='booked'.
4. Calendly inbound webhook cancellation (invitee.canceled) updating Booking status to 'cancelled'.
5. Phase 5 automated customer confirmation email (with .ics calendar invite attached) and customer SMS.
6. Phase 5 technician dispatch SMS alert with Google Maps navigation link.
7. Portal Calendly configuration management and test SMS dispatch endpoints.
"""

from __future__ import annotations

import base64
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from starlette.testclient import TestClient

from agent.tools.booking import send_booking_link
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.booking import Booking, TenantIntegration
from api.app.models.crm import Contact
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.services.notifier import (
    BookingNotificationPayload,
    dispatch_booking_notifications,
    format_booking_customer_sms,
    format_booking_technician_sms,
    generate_ics_calendar_invite,
)

client = TestClient(app)


class MockRecordingEmailDispatcher:
    def __init__(self) -> None:
        self.sent_emails: list[dict] = []

    def send(
        self,
        to_email: str,
        subject: str,
        text: str,
        html: str,
        attachments: list[dict] | None = None,
    ) -> bool:
        self.sent_emails.append(
            {
                "to": to_email,
                "subject": subject,
                "text": text,
                "html": html,
                "attachments": attachments or [],
            }
        )
        return True


class MockRecordingSmsDispatcher:
    def __init__(self) -> None:
        self.sent_sms: list[dict] = []

    def send(self, to_phone: str, body: str) -> bool:
        self.sent_sms.append({"to": to_phone, "body": body})
        return True


def test_phase4_in_call_send_booking_link_and_internal_api() -> None:
    """Verify voice agent send_booking_link tool calls /internal/calendar/send-link and returns SMS confirmation."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Calendly Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        # Configure custom Calendly link for tenant
        integration = TenantIntegration(
            tenant_id=tenant.id,
            provider="calendly",
            status="connected",
            calendar_id=f"https://calendly.com/calendly-plumbing-{suffix}/service",
        )
        db.add(integration)
        db.commit()

        # Generate call-scoped token
        call_token = create_access_token(
            {
                "tenant_id": tenant.id,
                "call_id": f"call-{suffix}",
                "role": "agent",
                "scope": "call_internal",
            }
        )

        # 1. Execute send_booking_link tool
        res = send_booking_link(
            call_token=call_token,
            phone_number="+15125550199",
            customer_name="Sarah Connor",
        )

        assert res.get("success") is True
        assert "calendly-plumbing" in res.get("booking_url", "")
        assert res.get("phone_number") == "+15125550199"
    finally:
        db.close()


def test_phase4_calendly_webhook_ingestion_and_crm_sync() -> None:
    """Verify Calendly invitee.created creates a Booking record and syncs CRM Contact stage to 'booked'."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Apex HVAC {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        # Pre-seed a CRM lead for this customer
        lead = Contact(
            tenant_id=tenant.id,
            name="John Connor",
            phone="+15125550144",
            email=f"john_{suffix}@example.com",
            stage="new_lead",
            source="inbound_call",
        )
        db.add(lead)
        db.commit()

        # Simulate Calendly invitee.created webhook event
        event_uri = f"https://api.calendly.com/scheduled_events/evt-{suffix}"
        webhook_payload = {
            "event": "invitee.created",
            "payload": {
                "name": "John Connor",
                "email": f"john_{suffix}@example.com",
                "text_reminder_number": "+15125550144",
                "scheduled_event": {
                    "uri": event_uri,
                    "name": "Emergency Pipe Diagnostic",
                    "start_time": (datetime.now(ZoneInfo("UTC")) + timedelta(days=2)).isoformat(),
                    "end_time": (
                        datetime.now(ZoneInfo("UTC")) + timedelta(days=2, hours=1)
                    ).isoformat(),
                },
            },
        }

        resp = client.post("/api/v1/portal/calendar/calendly/webhook", json=webhook_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "ingested"
        assert data.get("crm_updated") is True
        booking_id = data.get("booking_id")

        # Verify Booking created in DB
        booking = db.scalar(select(Booking).where(Booking.id == booking_id))
        assert booking is not None
        assert booking.customer_name == "John Connor"
        assert booking.status == "confirmed"

        # Verify CRM Contact stage updated to 'booked'
        db.refresh(lead)
        assert lead.stage == "booked"
        assert "calendly_booking" in lead.tags

        # 2. Test invitee.canceled webhook
        cancel_payload = {
            "event": "invitee.canceled",
            "payload": {
                "scheduled_event": {
                    "uri": event_uri,
                }
            },
        }
        cancel_resp = client.post("/api/v1/portal/calendar/calendly/webhook", json=cancel_payload)
        assert cancel_resp.status_code == 200
        assert cancel_resp.json().get("status") == "cancelled"

        # Verify Booking status updated to cancelled
        db.expire_all()
        b_after = db.scalar(select(Booking).where(Booking.id == booking_id))
        assert b_after is not None
        assert b_after.status == "cancelled"
    finally:
        db.close()


def test_phase5_automated_customer_and_technician_notifications() -> None:
    """Verify dispatch_booking_notifications delivers email with .ics attachment, customer SMS, and tech SMS."""
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:6]
    try:
        tenant = Tenant(
            name=f"Rapid Response Plumbing {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        # Assigned technician with phone
        tech = StaffMember(
            tenant_id=tenant.id,
            name="Bob Fixer",
            email=f"bob_{suffix}@contractor.com",
            phone="+15125550188",
            role="technician",
            skills=["plumbing"],
            is_active=True,
        )
        db.add(tech)
        db.commit()
        db.refresh(tech)

        now_utc = datetime.now(ZoneInfo("UTC"))
        booking = Booking(
            tenant_id=tenant.id,
            staff_id=tech.id,
            customer_name="Alice Smith",
            customer_phone="+15125550122",
            customer_email="alice.smith@example.com",
            postal_code="78758",
            service_type="water_heater_repair",
            start_at=now_utc + timedelta(days=1, hours=2),
            end_at=now_utc + timedelta(days=1, hours=3),
            status="confirmed",
            meet_link="https://meet.google.com/xyz-test-abc",
            notes="Water heater leaking from base valve",
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)

        # 1. Test .ics generation
        payload = BookingNotificationPayload(
            booking_id=booking.id,
            tenant_id=tenant.id,
            tenant_name=tenant.name,
            customer_name=booking.customer_name,
            customer_phone=booking.customer_phone,
            customer_email=booking.customer_email,
            service_type=booking.service_type,
            start_at=booking.start_at,
            end_at=booking.end_at,
            technician_name=tech.name,
            meet_link=booking.meet_link,
            notes=booking.notes,
        )
        ics_text = generate_ics_calendar_invite(payload)
        assert "BEGIN:VCALENDAR" in ics_text
        assert "BEGIN:VEVENT" in ics_text
        assert f"booking-{booking.id}@vedavoice.ai" in ics_text
        assert "Google Meet" in ics_text

        # 2. Test Customer SMS format
        cust_sms = format_booking_customer_sms(payload)
        assert "Alice Smith" in cust_sms
        assert "Bob Fixer" in cust_sms
        assert "confirmed" in cust_sms

        # 3. Test Technician SMS format with Google Maps pin
        tech_sms = format_booking_technician_sms(payload)
        assert "DISPATCH ALERT" in tech_sms
        assert "Alice Smith" in tech_sms
        assert "maps.google.com" in tech_sms
        assert "Water heater leaking" in tech_sms

        # 4. Test live dispatcher integration
        mock_email = MockRecordingEmailDispatcher()
        mock_sms = MockRecordingSmsDispatcher()

        result = dispatch_booking_notifications(
            booking_id=booking.id,
            tenant_id=tenant.id,
            email_dispatcher=mock_email,
            sms_dispatcher=mock_sms,
        )

        assert result.get("status") == "delivered"
        assert result.get("customer_email_sent") is True
        assert result.get("customer_sms_sent") is True
        assert result.get("technician_sms_sent") is True

        # Verify email has .ics attachment
        assert len(mock_email.sent_emails) == 1
        email_sent = mock_email.sent_emails[0]
        assert email_sent["to"] == "alice.smith@example.com"
        assert len(email_sent["attachments"]) == 1
        assert email_sent["attachments"][0]["filename"] == "appointment.ics"

        # Verify decoded .ics content matches
        b64_content = email_sent["attachments"][0]["content"]
        decoded_ics = base64.b64decode(b64_content).decode("utf-8")
        assert "BEGIN:VCALENDAR" in decoded_ics

        # Verify two SMS messages dispatched (customer + technician)
        assert len(mock_sms.sent_sms) == 2
        recipients = {s["to"] for s in mock_sms.sent_sms}
        assert "+15125550122" in recipients  # Customer
        assert "+15125550188" in recipients  # Technician
    finally:
        db.close()


def test_portal_calendly_configuration_and_test_sms() -> None:
    """Verify portal endpoints GET/POST /portal/calendar/calendly and test-sms."""
    suffix = uuid.uuid4().hex[:6]
    email = f"portal_caly_{suffix}@test.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Portal Calendly Corp {suffix}",
            "owner_name": "Portal Master",
            "email": email,
            "password": "Password123!",
            "phone_number": f"+1512{uuid.uuid4().int % 9000000 + 1000000}",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Initially unconfigured or default
    get_res = client.get("/api/v1/portal/calendar/calendly", headers=headers)
    assert get_res.status_code == 200
    assert "webhook_endpoint" in get_res.json()

    # 2. Update Calendly link
    post_res = client.post(
        "/api/v1/portal/calendar/calendly",
        headers=headers,
        json={"calendly_url": "https://calendly.com/portal-corp/30min"},
    )
    assert post_res.status_code == 200
    assert post_res.json()["is_configured"] is True
    assert post_res.json()["calendly_url"] == "https://calendly.com/portal-corp/30min"

    # 3. Test SMS dispatch
    sms_res = client.post(
        "/api/v1/portal/calendar/calendly/test-sms",
        headers=headers,
        json={"phone_number": "+15125550199", "customer_name": "Test Customer"},
    )
    assert sms_res.status_code == 200
    assert sms_res.json()["success"] is True
    assert "calendly.com/portal-corp/30min" in sms_res.json()["booking_url"]
