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
from api.app.models.call import Call
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

    def send(self, to_email: str, subject: str, text: str, html: str) -> bool: ...


class ConsoleEmailDispatcher:
    """Fallback dispatcher that logs emails to console."""

    def send(self, to_email: str, subject: str, text: str, html: str) -> bool:
        logger.info(
            "\n[DISPATCH CONSOLE EMAIL]\nTo: %s\nSubject: %s\nBody:\n%s\n",
            to_email,
            subject,
            text,
        )
        return True


class ResendEmailDispatcher:
    """Delivers email notifications via Resend REST API."""

    def __init__(self, api_key: str | None = None, from_email: str | None = None) -> None:
        self.api_key = api_key or settings.RESEND_API_KEY
        self.from_email = from_email or settings.RESEND_FROM_EMAIL

    def send(self, to_email: str, subject: str, text: str, html: str) -> bool:
        if not self.api_key:
            logger.debug("RESEND_API_KEY not configured. Falling back to ConsoleEmailDispatcher.")
            return ConsoleEmailDispatcher().send(to_email, subject, text, html)

        payload = {
            "from": f"VedaVoice Alerts <{self.from_email}>",
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        }

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
        sms_worker = sms_dispatcher or TwilioSmsDispatcher()

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
