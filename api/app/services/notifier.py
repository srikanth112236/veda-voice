"""Automated post-call owner notification service (Email & SMS).

Dispatches immediate structured email alerts (Resend / SendGrid) and emergency SMS alerts
(Twilio / Telnyx) to the business owner upon call completion.
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import BaseModel, Field
from sqlalchemy import select

from api.app.core.config import settings
from api.app.db.session import SessionLocal
from api.app.models.booking import Booking
from api.app.models.call import Call
from api.app.models.location import Location
from api.app.models.staff import StaffMember
from api.app.models.tenant import Tenant
from api.app.models.user import User

logger = logging.getLogger("vedavoice.notifier")


class CallNotificationPayload(BaseModel):
    """Normalized notification data contract."""

    tenant_id: str
    tenant_name: str
    call_id: str
    caller_name: str = "Unknown Caller"
    caller_phone: str = "Unavailable"
    service_address: str | None = None
    urgency: str = "normal"  # normal, urgent, emergency
    outcome: str = "completed"
    duration_s: float = 0.0
    summary: str = "General inquiry"
    action_items: list[str] = Field(default_factory=list)
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    recipient_email: str
    recipient_phone: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


def format_email_subject(payload: CallNotificationPayload) -> str:
    """Format high-impact email subject with urgency indicator."""
    if payload.urgency == "emergency":
        return f"[🚨 EMERGENCY CALL] {payload.tenant_name} - Immediate Action Required from {payload.caller_name}"
    if payload.urgency == "urgent":
        return f"[⚠️ URGENT CALL] {payload.tenant_name} - Priority Callback: {payload.caller_name}"
    return f"[📞 Call Summary] {payload.tenant_name} - Message from {payload.caller_name}"


def format_email_plain(payload: CallNotificationPayload) -> str:
    """Format plain-text notification email body."""
    lines = [
        f"================ {payload.urgency.upper()} CALL ALERT ================",
        f"Business: {payload.tenant_name}",
        f"Caller: {payload.caller_name} ({payload.caller_phone})",
        f"Service Address: {payload.service_address or 'None provided'}",
        f"Duration: {int(payload.duration_s)}s | Outcome: {payload.outcome}",
        f"Time: {payload.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "-------------------------------------------------------",
        f"SUMMARY:\n{payload.summary}\n",
        "ACTION ITEMS:",
    ]
    if payload.action_items:
        for item in payload.action_items:
            lines.append(f"  • {item}")
    else:
        lines.append("  • Review call recording/transcript in portal.")

    if payload.transcript:
        lines.append("\nTRANSCRIPT HIGHLIGHTS:")
        for turn in payload.transcript[:10]:
            speaker = turn.get("speaker", "unknown").capitalize()
            text = turn.get("text", "")
            if text:
                lines.append(f"  [{speaker}]: {text}")

    lines.append("=======================================================")
    return "\n".join(lines)


def format_email_html(payload: CallNotificationPayload) -> str:
    """Format responsive, modern HTML email alert."""
    theme_color = "#2563eb"  # blue
    badge_bg = "#eff6ff"
    badge_text = "#1d4ed8"
    banner_icon = "📞"

    if payload.urgency == "emergency":
        theme_color = "#dc2626"  # red
        badge_bg = "#fef2f2"
        badge_text = "#b91c1c"
        banner_icon = "🚨 EMERGENCY"
    elif payload.urgency == "urgent":
        theme_color = "#d97706"  # amber
        badge_bg = "#fffbeb"
        badge_text = "#b45309"
        banner_icon = "⚠️ URGENT"

    action_items_html = "".join(
        f"<li style='margin-bottom: 6px; color: #1e293b;'>{item}</li>"
        for item in (payload.action_items or ["Review call in portal and schedule follow-up."])
    )

    transcript_rows_html = ""
    for turn in payload.transcript[:12]:
        spk = str(turn.get("speaker", "Speaker")).capitalize()
        txt = str(turn.get("text", ""))
        if txt:
            is_agent = spk.lower() in ("agent", "receptionist", "assistant")
            bg = "#f8fafc" if is_agent else "#ffffff"
            transcript_rows_html += f"""
            <div style='padding: 8px 12px; margin-bottom: 4px; background: {bg}; border-left: 3px solid {theme_color if not is_agent else "#94a3b8"}; font-size: 13px; font-family: monospace;'>
                <strong>{spk}:</strong> {txt}
            </div>
            """

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{format_email_subject(payload)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">

    <!-- Header -->
    <div style="background-color: {theme_color}; padding: 20px 24px; color: #ffffff;">
      <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9;">{payload.tenant_name} &bull; Call Notification</div>
      <h1 style="margin: 8px 0 0 0; font-size: 20px; font-weight: 700;">{banner_icon} Alert</h1>
    </div>

    <!-- Core Metadata Grid -->
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 30%;">Caller Name:</td>
          <td style="padding: 8px 0; font-weight: 600; font-size: 15px; color: #0f172a;">{payload.caller_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Caller Phone:</td>
          <td style="padding: 8px 0; font-weight: 600; font-size: 15px;">
            <a href="tel:{payload.caller_phone}" style="color: {theme_color}; text-decoration: none;">{payload.caller_phone}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Service Address:</td>
          <td style="padding: 8px 0; font-weight: 600; font-size: 14px; color: #0f172a;">{payload.service_address or "None provided"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Duration / Outcome:</td>
          <td style="padding: 8px 0; font-size: 13px; color: #334155;">{int(payload.duration_s)}s &bull; <span style="background: {badge_bg}; color: {badge_text}; padding: 2px 8px; border-radius: 4px; font-weight: 500;">{payload.outcome}</span></td>
        </tr>
      </table>

      <!-- Summary Box -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;">Summary</h3>
        <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #1e293b;">{payload.summary}</p>
      </div>

      <!-- Action Items -->
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;">Recommended Action Items</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
          {action_items_html}
        </ul>
      </div>

      <!-- Call Transcript Preview -->
      {f'''
      <div>
        <h3 style="margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;">Transcript Preview</h3>
        <div style="max-height: 240px; overflow-y: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
          {transcript_rows_html}
        </div>
      </div>
      ''' if transcript_rows_html else ''}

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
      Generated automatically by VedaVoice AI Voice Platform &bull; Call ID: {payload.call_id}
    </div>

  </div>
</body>
</html>
"""


def format_sms_text(payload: CallNotificationPayload) -> str:
    """Format concise, high-priority emergency SMS."""
    prefix = "🚨 EMERGENCY" if payload.urgency == "emergency" else "⚠️ URGENT"
    addr_part = f" at {payload.service_address}" if payload.service_address else ""
    return (
        f"[{prefix}] {payload.tenant_name}: {payload.caller_name} ({payload.caller_phone})"
        f"{addr_part} - {payload.summary[:90]}"
    )


# ---------------------------------------------------------------------------
# Dispatcher Protocols & Implementations
# ---------------------------------------------------------------------------


class EmailDispatcher(Protocol):
    """Interface for delivering email notifications."""

    def send(
        self,
        to_email: str,
        subject: str,
        text: str,
        html: str,
        attachments: list[dict[str, Any]] | None = None,
    ) -> bool: ...


class ConsoleEmailDispatcher:
    """Fallback dispatcher that logs emails to console."""

    def send(
        self,
        to_email: str,
        subject: str,
        text: str,
        html: str,
        attachments: list[dict[str, Any]] | None = None,
    ) -> bool:
        att_note = f" (Attachments: {len(attachments)})" if attachments else ""
        logger.info(
            "\n[DISPATCH CONSOLE EMAIL]%s\nTo: %s\nSubject: %s\nBody:\n%s\n",
            att_note,
            to_email,
            subject,
            text,
        )
        return True


class ResendEmailDispatcher:
    """Delivers email notifications via Resend REST API."""

    def __init__(self, api_key: str | None = None, from_email: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else settings.RESEND_API_KEY
        self.from_email = from_email if from_email is not None else settings.RESEND_FROM_EMAIL

    def send(
        self,
        to_email: str,
        subject: str,
        text: str,
        html: str,
        attachments: list[dict[str, Any]] | None = None,
    ) -> bool:
        if not self.api_key:
            logger.debug("RESEND_API_KEY not configured. Falling back to ConsoleEmailDispatcher.")
            return ConsoleEmailDispatcher().send(to_email, subject, text, html, attachments)

        payload: dict[str, Any] = {
            "from": f"VedaVoice Alerts <{self.from_email}>",
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        }
        if attachments:
            payload["attachments"] = attachments

        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if 200 <= resp.status < 300:
                    logger.info("Delivered post-call email via Resend to %s", to_email)
                    return True
                logger.error("Resend API returned HTTP %s", resp.status)
                return False
        except urllib.error.HTTPError as e:
            logger.error("Resend HTTP error %s: %s", e.code, e.read().decode("utf-8", "replace"))
            return False
        except Exception as e:
            logger.error("Failed to send email via Resend: %s", e)
            return False


class SmsDispatcher(Protocol):
    """Interface for delivering SMS notifications."""

    def send(self, to_phone: str, body: str) -> bool: ...


class ConsoleSmsDispatcher:
    """Fallback dispatcher that logs SMS to console."""

    def send(self, to_phone: str, body: str) -> bool:
        logger.info("\n[DISPATCH CONSOLE SMS]\nTo: %s\nBody: %s\n", to_phone, body)
        return True


class TelnyxSmsDispatcher:
    """Delivers emergency & confirmation SMS notifications via Telnyx v2 Messaging API."""

    def __init__(
        self,
        api_key: str | None = None,
        from_number: str | None = None,
        messaging_profile_id: str | None = None,
    ) -> None:
        self.api_key = api_key or settings.TELNYX_API_KEY
        self.from_number = from_number or settings.TWILIO_FROM_NUMBER or "+18005550199"
        self.messaging_profile_id = messaging_profile_id or settings.TELNYX_MESSAGING_PROFILE_ID

    def send(self, to_phone: str, body: str) -> bool:
        if not self.api_key or not self.api_key.startswith("KEY"):
            # Fall back to Twilio if configured, else console logger
            if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
                return TwilioSmsDispatcher().send(to_phone, body)
            return ConsoleSmsDispatcher().send(to_phone, body)

        url = "https://api.telnyx.com/v2/messages"
        payload_dict: dict[str, Any] = {
            "from": self.from_number,
            "to": to_phone,
            "text": body,
        }
        if self.messaging_profile_id and self.messaging_profile_id.strip():
            payload_dict["messaging_profile_id"] = self.messaging_profile_id.strip()

        data = json.dumps(payload_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if 200 <= resp.status < 300:
                    logger.info("Delivered post-call SMS via Telnyx to %s", to_phone)
                    return True
                logger.error("Telnyx API returned HTTP %s", resp.status)
                return False
        except urllib.error.HTTPError as e:
            logger.error("Telnyx HTTP error %s: %s", e.code, e.read().decode("utf-8", "replace"))
            return False
        except Exception as e:
            logger.error("Failed to deliver SMS via Telnyx: %s", e)
            return False


class TwilioSmsDispatcher:
    """Delivers emergency SMS notifications via Twilio REST API."""

    def __init__(
        self,
        account_sid: str | None = None,
        auth_token: str | None = None,
        from_number: str | None = None,
    ) -> None:
        self.account_sid = account_sid or settings.TWILIO_ACCOUNT_SID
        self.auth_token = auth_token or settings.TWILIO_AUTH_TOKEN
        self.from_number = from_number or settings.TWILIO_FROM_NUMBER

    def send(self, to_phone: str, body: str) -> bool:
        if not (self.account_sid and self.auth_token and self.from_number):
            logger.debug(
                "Twilio SMS credentials not configured. Falling back to ConsoleSmsDispatcher."
            )
            return ConsoleSmsDispatcher().send(to_phone, body)

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        data = urllib.parse.urlencode(
            {
                "To": to_phone,
                "From": self.from_number,
                "Body": body,
            }
        ).encode("utf-8")

        auth_str = f"{self.account_sid}:{self.auth_token}"
        auth_header = f"Basic {base64.b64encode(auth_str.encode('ascii')).decode('ascii')}"

        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": auth_header,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if 200 <= resp.status < 300:
                    logger.info("Delivered post-call SMS via Twilio to %s", to_phone)
                    return True
                logger.error("Twilio API returned HTTP %s", resp.status)
                return False
        except urllib.error.HTTPError as e:
            logger.error("Twilio HTTP error %s: %s", e.code, e.read().decode("utf-8", "replace"))
            return False
        except Exception as e:
            logger.error("Failed to deliver SMS via Twilio: %s", e)
            return False


# ---------------------------------------------------------------------------
# Background Task Pipeline
# ---------------------------------------------------------------------------


def build_call_notification_payload(
    call: Call,
    tenant: Tenant,
    recipient_email: str,
    recipient_phone: str = "",
) -> CallNotificationPayload:
    """Construct structured payload from Call and Tenant database models."""
    caller_name = "Unknown Caller"
    caller_phone = call.caller_number or "Unavailable"
    address: str | None = None
    summary = "General inquiry"
    action_items: list[str] = []

    urgency = (call.urgency or "normal").lower()

    if call.message:
        msg = call.message
        caller_name = msg.get("name") or caller_name
        caller_phone = msg.get("phone") or caller_phone
        address = msg.get("address")
        summary = msg.get("message") or summary
    elif call.transcript:
        # Fallback summary from caller lines
        caller_turns = [
            t.get("text", "")
            for t in call.transcript
            if str(t.get("speaker", "")).lower() in ("user", "caller", "customer")
        ]
        if caller_turns:
            summary = " | ".join(caller_turns[:2])

    if urgency == "emergency":
        action_items.append("Call customer immediately at verified callback number.")
        if address:
            action_items.append(f"Dispatch emergency on-call technician to {address}.")
        action_items.append("Confirm emergency utility shut-off status.")
    elif urgency == "urgent":
        action_items.append("Review callback request and reach customer today.")
        action_items.append("Check technician dispatch calendar for open slot.")
    else:
        action_items.append("Review message and follow up according to standard schedule.")

    return CallNotificationPayload(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        call_id=call.call_id,
        caller_name=caller_name,
        caller_phone=caller_phone,
        service_address=address,
        urgency=urgency,
        outcome=call.outcome or "completed",
        duration_s=float(call.duration_s or 0.0),
        summary=summary,
        action_items=action_items,
        transcript=call.transcript or [],
        recipient_email=recipient_email,
        recipient_phone=recipient_phone,
        timestamp=call.ended_at or datetime.now(UTC),
    )


def dispatch_call_notifications(
    call_id: str,
    email_dispatcher: EmailDispatcher | None = None,
    sms_dispatcher: SmsDispatcher | None = None,
) -> dict[str, Any]:
    """Execute end-to-end notification delivery for a completed call."""
    if not settings.NOTIFICATION_ENABLED:
        logger.info("Notifications disabled in settings. Skipping for call %s", call_id)
        return {"status": "skipped", "reason": "disabled"}

    db = SessionLocal()
    try:
        call = db.scalar(select(Call).where(Call.call_id == call_id))
        if not call:
            call = db.scalar(select(Call).where(Call.id == call_id))

        if not call or not call.tenant_id:
            logger.warning(
                "Notification worker could not find valid call/tenant for ID %s", call_id
            )
            return {"status": "skipped", "reason": "call_or_tenant_not_found"}

        tenant = db.scalar(select(Tenant).where(Tenant.id == call.tenant_id))
        if not tenant:
            logger.warning("Tenant %s not found for call %s", call.tenant_id, call_id)
            return {"status": "skipped", "reason": "tenant_not_found"}

        profile = tenant.agent_profile

        # Determine destination email
        recipient_email = ""
        if profile and profile.notification_email:
            recipient_email = profile.notification_email.strip()

        if not recipient_email:
            # Fall back to tenant owner user email
            owner_user = db.scalar(
                select(User).where(User.tenant_id == tenant.id, User.role == "tenant_owner")
            )
            if owner_user and owner_user.email:
                recipient_email = owner_user.email.strip()

        if not recipient_email:
            # Platform fallback
            recipient_email = settings.PLATFORM_ADMIN_EMAIL

        # Determine destination phone for SMS
        recipient_phone = ""
        if profile and profile.notification_phone:
            recipient_phone = profile.notification_phone.strip()
        elif profile and profile.transfer_number:
            recipient_phone = profile.transfer_number.strip()

        payload = build_call_notification_payload(call, tenant, recipient_email, recipient_phone)

        # Policy checks
        notify_all = getattr(profile, "notify_on_all_calls", True) if profile else True
        notify_sms_emerg = getattr(profile, "notify_sms_on_emergency", True) if profile else True

        email_worker = email_dispatcher or ResendEmailDispatcher()
        sms_worker = sms_dispatcher or TelnyxSmsDispatcher()

        email_sent = False
        sms_sent = False

        # Deliver Email
        if notify_all or payload.urgency in ("emergency", "urgent"):
            subject = format_email_subject(payload)
            text_body = format_email_plain(payload)
            html_body = format_email_html(payload)
            email_sent = email_worker.send(recipient_email, subject, text_body, html_body)

        # Deliver SMS for emergencies to business owner
        if recipient_phone and notify_sms_emerg and payload.urgency == "emergency":
            sms_body = format_sms_text(payload)
            sms_sent = sms_worker.send(recipient_phone, sms_body)

        # Deliver Omnichannel Customer Confirmation SMS
        caller_sms_sent = False
        caller_phone = call.caller_number
        if caller_phone and not caller_phone.startswith("anon") and len(caller_phone) >= 10:
            caller_msg = None
            if call.outcome in ("booked", "appointment_booked", "confirmed"):
                caller_msg = f"Hi {payload.caller_name or 'there'}, your appointment with {tenant.name} is confirmed! Thank you for calling."
            elif call.outcome in ("message_taken", "info_provided", "transferred"):
                caller_msg = f"Hi {payload.caller_name or 'there'}, thank you for contacting {tenant.name}! We have received your inquiry and our team will follow up with you shortly."

            if caller_msg:
                caller_sms_sent = sms_worker.send(caller_phone, caller_msg)

        return {
            "status": "delivered",
            "call_id": call.call_id,
            "recipient_email": recipient_email,
            "recipient_phone": recipient_phone,
            "email_sent": email_sent,
            "sms_sent": sms_sent,
            "caller_sms_sent": caller_sms_sent,
            "urgency": payload.urgency,
        }

    except Exception as e:
        logger.exception("Error in dispatch_call_notifications for call %s: %s", call_id, e)
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


# ===========================================================================
# Phase 5: Automated Booking Notifications & Staff Dispatch
# ===========================================================================


class BookingNotificationPayload(BaseModel):
    """Normalized payload for confirmed booking notifications."""

    booking_id: str
    tenant_id: str
    tenant_name: str
    tenant_phone: str = ""
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    service_type: str
    service_address: str | None = None
    start_at: datetime
    end_at: datetime
    technician_name: str | None = None
    technician_phone: str | None = None
    technician_email: str | None = None
    meet_link: str | None = None
    notes: str | None = None
    reschedule_url: str | None = None


def generate_ics_calendar_invite(payload: BookingNotificationPayload) -> str:
    """Generate RFC 5545 iCalendar (.ics) string for customer appointment invitation."""
    dt_fmt = "%Y%m%dT%H%M%SZ"
    start_utc = payload.start_at.astimezone(UTC).strftime(dt_fmt)
    end_utc = payload.end_at.astimezone(UTC).strftime(dt_fmt)
    now_utc = datetime.now(UTC).strftime(dt_fmt)

    summary = f"{payload.service_type.replace('_', ' ').title()} - {payload.tenant_name}"
    description = (
        f"Service: {payload.service_type}\\n"
        f"Customer: {payload.customer_name} ({payload.customer_phone})\\n"
        f"Assigned Technician: {payload.technician_name or 'On-Call Technician'}\\n"
        f"Notes: {payload.notes or 'Booked via VedaVoice'}"
    )
    if payload.meet_link:
        description += f"\\nGoogle Meet: {payload.meet_link}"

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//VedaVoice//Appointment Booking//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:booking-{payload.booking_id}@vedavoice.ai",
        f"DTSTAMP:{now_utc}",
        f"DTSTART:{start_utc}",
        f"DTEND:{end_utc}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{payload.service_address or payload.tenant_name}",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines)


def format_booking_customer_email_html(payload: BookingNotificationPayload) -> str:
    """Format modern, responsive HTML customer appointment confirmation."""
    date_str = payload.start_at.strftime("%A, %B %d, %Y")
    start_time = payload.start_at.strftime("%I:%M %p").lstrip("0")
    end_time = payload.end_at.strftime("%I:%M %p").lstrip("0")
    tech_str = payload.technician_name or "Certified Technician"

    meet_btn_html = ""
    if payload.meet_link:
        meet_btn_html = f"""
        <div style="margin: 20px 0; text-align: center;">
          <a href="{payload.meet_link}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            📹 Join Google Meet Video Consultation
          </a>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
        <div style="background-color: #0f172a; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 700;">{payload.tenant_name}</h1>
          <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Appointment Confirmation</p>
        </div>
        <div style="padding: 28px;">
          <h2 style="font-size: 16px; margin: 0 0 12px; color: #0f172a;">Hi {payload.customer_name},</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
            Your service appointment is confirmed! Our technician will arrive within your scheduled arrival window.
          </p>
          <div style="background: #f1f5f9; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
            <div style="margin-bottom: 10px;">
              <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Service</span>
              <strong style="font-size: 14px; color: #0f172a;">{payload.service_type.replace('_', ' ').title()}</strong>
            </div>
            <div style="margin-bottom: 10px;">
              <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Date & Time</span>
              <strong style="font-size: 14px; color: #0f172a;">{date_str}</strong><br/>
              <span style="font-size: 13px; color: #334155;">{start_time} – {end_time}</span>
            </div>
            <div style="margin-bottom: 10px;">
              <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Service Location</span>
              <span style="font-size: 13px; color: #334155;">{payload.service_address or 'Service address confirmed with coordinator'}</span>
            </div>
            <div>
              <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block;">Assigned Technician</span>
              <span style="font-size: 13px; color: #334155;">{tech_str}</span>
            </div>
          </div>
          {meet_btn_html}
          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 20px 0 0; text-align: center;">
            Need to reschedule or have questions? Call us directly at <strong>{payload.tenant_phone or 'our main line'}</strong>.<br/>
            An iCalendar (.ics) invite has been attached to this email for your convenience.
          </p>
        </div>
      </div>
    </body>
    </html>
    """


def format_booking_customer_sms(payload: BookingNotificationPayload) -> str:
    """Format concise customer SMS confirmation."""
    date_str = payload.start_at.strftime("%a, %b %d")
    time_str = payload.start_at.strftime("%I:%M %p").lstrip("0")
    phone_part = f" Questions? Call {payload.tenant_phone}." if payload.tenant_phone else ""
    return (
        f"Hi {payload.customer_name}, your appointment with {payload.tenant_name} is confirmed for "
        f"{date_str} at {time_str}. Tech: {payload.technician_name or 'On-call specialist'}.{phone_part} Reply STOP to opt out."
    )


def format_booking_technician_sms(payload: BookingNotificationPayload) -> str:
    """Format dispatch alert SMS to assigned technician."""
    date_str = payload.start_at.strftime("%a, %b %d")
    time_str = payload.start_at.strftime("%I:%M %p").lstrip("0")
    addr = payload.service_address or "Customer Location"
    encoded_addr = urllib.parse.quote(addr)
    notes_str = f"\n📝 Notes: {payload.notes}" if payload.notes else ""
    return (
        f"🔧 DISPATCH ALERT: {payload.service_type.replace('_', ' ').title()}\n"
        f"🕒 Time: {date_str} @ {time_str}\n"
        f"👤 Customer: {payload.customer_name} ({payload.customer_phone})\n"
        f"📍 Address: {addr}\n"
        f"🗺️ Maps: https://maps.google.com/?q={encoded_addr}{notes_str}"
    )


def dispatch_booking_notifications(
    booking_id: str,
    tenant_id: str | None = None,
    email_dispatcher: EmailDispatcher | None = None,
    sms_dispatcher: SmsDispatcher | None = None,
) -> dict[str, Any]:
    """Dispatch real-time booking alerts to customer, assigned technician, and dispatch inbox."""
    db = SessionLocal()
    try:
        stmt = select(Booking).where(Booking.id == booking_id)
        if tenant_id:
            stmt = stmt.where(Booking.tenant_id == tenant_id)
        booking = db.scalar(stmt)
        if not booking:
            logger.warning("Booking %s not found for notification dispatch", booking_id)
            return {"status": "error", "detail": "Booking not found"}

        tenant = db.scalar(select(Tenant).where(Tenant.id == booking.tenant_id))
        tenant_name = tenant.name if tenant else "Service Provider"

        # Resolve technician details
        tech_name: str | None = None
        tech_phone: str | None = None
        tech_email: str | None = None
        if booking.staff_id:
            tech = db.scalar(select(StaffMember).where(StaffMember.id == booking.staff_id))
            if tech:
                tech_name = tech.name
                tech_phone = tech.phone
                tech_email = tech.email

        # Resolve location address if set
        service_addr = None
        if booking.location_id:
            loc = db.scalar(select(Location).where(Location.id == booking.location_id))
            if loc:
                service_addr = f"{loc.address_line1}, {loc.city}, {loc.state} {loc.postal_code}"
        elif booking.postal_code:
            service_addr = f"Postal Code: {booking.postal_code}"

        payload = BookingNotificationPayload(
            booking_id=booking.id,
            tenant_id=booking.tenant_id,
            tenant_name=tenant_name,
            customer_name=booking.customer_name,
            customer_phone=booking.customer_phone,
            customer_email=booking.customer_email,
            service_type=booking.service_type,
            service_address=service_addr,
            start_at=booking.start_at,
            end_at=booking.end_at,
            technician_name=tech_name,
            technician_phone=tech_phone,
            technician_email=tech_email,
            meet_link=booking.meet_link,
            notes=booking.notes,
        )

        email_worker = email_dispatcher or ResendEmailDispatcher()
        sms_worker = sms_dispatcher or TelnyxSmsDispatcher()

        customer_email_sent = False
        customer_sms_sent = False
        tech_sms_sent = False

        # 1. Dispatch Customer Confirmation Email (with HTML + attached .ics calendar invite)
        if payload.customer_email and "@" in payload.customer_email:
            ics_content = generate_ics_calendar_invite(payload)
            ics_b64 = base64.b64encode(ics_content.encode("utf-8")).decode("utf-8")
            attachments = [
                {
                    "filename": "appointment.ics",
                    "content": ics_b64,
                }
            ]
            subject = f"Appointment Confirmed: {payload.service_type.replace('_', ' ').title()} with {payload.tenant_name}"
            html_body = format_booking_customer_email_html(payload)
            text_body = f"Your appointment with {payload.tenant_name} is confirmed for {payload.start_at.isoformat()}."
            customer_email_sent = email_worker.send(
                to_email=payload.customer_email,
                subject=subject,
                text=text_body,
                html=html_body,
                attachments=attachments,
            )

        # 2. Dispatch Customer Confirmation SMS
        if payload.customer_phone and len(payload.customer_phone) >= 10:
            sms_text = format_booking_customer_sms(payload)
            customer_sms_sent = sms_worker.send(payload.customer_phone, sms_text)

        # 3. Dispatch Technician SMS Alert (with Google Maps location link)
        if tech_phone and len(tech_phone) >= 10:
            tech_sms_text = format_booking_technician_sms(payload)
            tech_sms_sent = sms_worker.send(tech_phone, tech_sms_text)

        logger.info(
            "Booking notifications dispatched for booking %s: customer_email=%s, customer_sms=%s, tech_sms=%s",
            booking_id,
            customer_email_sent,
            customer_sms_sent,
            tech_sms_sent,
        )

        return {
            "status": "delivered",
            "booking_id": booking_id,
            "customer_email_sent": customer_email_sent,
            "customer_sms_sent": customer_sms_sent,
            "technician_sms_sent": tech_sms_sent,
        }
    except Exception as e:
        logger.exception(
            "Failed to dispatch booking notifications for booking %s: %s", booking_id, e
        )
        return {"status": "error", "error": str(e)}
    finally:
        db.close()
