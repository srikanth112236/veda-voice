"""Post-call processing and instant owner notification pipeline (Milestone M1c-b).

Generates structured summaries and dispatches email/SMS alerts to the business owner
within 60 seconds of call completion, prioritizing emergencies and urgent callbacks.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Protocol

from pydantic import BaseModel, Field

from agent.config import BusinessConfig
from agent.records import CallRecord

logger = logging.getLogger("receptionist.post_call")


class PostCallAlert(BaseModel):
    """Structured notification payload for business owners."""

    subject: str
    urgency: str
    recipient_email: str
    plain_text: str
    html_body: str
    caller_name: str
    caller_phone: str
    call_id: str
    duration_s: float
    address: str | None = None
    action_items: list[str] = Field(default_factory=list)


class EmailDispatcher(Protocol):
    """Interface for delivering post-call email notifications."""

    def send_alert(self, alert: PostCallAlert) -> bool:
        """Deliver post-call alert. Returns True on success, False on failure."""
        ...


class ConsoleEmailDispatcher:
    """Dispatches notifications by logging to application logs and console."""

    def send_alert(self, alert: PostCallAlert) -> bool:
        logger.info(
            "================ POST-CALL OWNER ALERT ================\n"
            "TO: %s\n"
            "SUBJECT: %s\n"
            "URGENCY: %s\n"
            "CALLER: %s (%s)\n"
            "ADDRESS: %s\n"
            "ACTION ITEMS:\n%s\n"
            "-------------------------------------------------------\n"
            "%s\n"
            "=======================================================",
            alert.recipient_email,
            alert.subject,
            alert.urgency.upper(),
            alert.caller_name,
            alert.caller_phone,
            alert.address or "None provided",
            "\n".join(f"  • {item}" for item in alert.action_items),
            alert.plain_text,
        )
        return True


class ResendEmailDispatcher:
    """Delivers email notifications via Resend API."""

    def __init__(self, api_key: str | None = None, from_email: str = "alerts@updates.vedasynk.com"):
        self.api_key = api_key or os.getenv("RESEND_API_KEY", "")
        self.from_email = from_email

    def send_alert(self, alert: PostCallAlert) -> bool:
        if not self.api_key:
            logger.warning("RESEND_API_KEY not configured. Falling back to console dispatch.")
            return ConsoleEmailDispatcher().send_alert(alert)

        payload = {
            "from": f"VedaVoice Alerts <{self.from_email}>",
            "to": [alert.recipient_email],
            "subject": alert.subject,
            "text": alert.plain_text,
            "html": alert.html_body,
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
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                if 200 <= resp.status < 300:
                    logger.info(
                        "Successfully sent post-call alert via Resend to %s", alert.recipient_email
                    )
                    return True
                logger.error("Resend API returned non-2xx status: %s", resp.status)
                return False
        except urllib.error.HTTPError as e:
            logger.error(
                "Resend HTTP error: %s - %s", e.code, e.read().decode("utf-8", errors="replace")
            )
            return False
        except Exception as e:
            logger.error("Failed to deliver alert via Resend: %s", e)
            return False


def build_post_call_alert(record: CallRecord, config: BusinessConfig) -> PostCallAlert:
    """Construct structured alert payload with emergency banners and action items."""
    urgency = "normal"
    caller_name = "Unknown Caller"
    caller_phone = record.caller_number or "Unavailable"
    address: str | None = None
    issue_desc = "General inquiry"
    action_items: list[str] = []

    if record.message is not None:
        urgency = record.message.urgency.lower()
        caller_name = record.message.name
        caller_phone = record.message.phone
        address = record.message.address
        issue_desc = record.message.message
    elif "emergency" in record.tags:
        urgency = "emergency"
    elif "urgent" in record.tags:
        urgency = "urgent"

    recipient = os.getenv("OWNER_ALERT_EMAIL", "owner@example.com")

    # Format Subject with Urgency Banner
    if urgency == "emergency":
        subject = (
            f"[🚨 EMERGENCY CALL] {config.business} - Immediate Action Required from {caller_name}"
        )
        action_items.append("Call customer immediately at verified callback number.")
        if address:
            action_items.append(f"Dispatch emergency on-call technician to {address}.")
        action_items.append("Confirm main utility shut-off status (water / gas).")
    elif urgency == "urgent":
        subject = f"[⚠️ URGENT CALL] {config.business} - Priority Callback: {caller_name}"
        action_items.append("Review callback request and reach customer today.")
    else:
        subject = f"[Call Summary] {config.business} - Message from {caller_name}"
        action_items.append("Review message and schedule follow-up.")

    # Plain text body
    plain_text_lines = [
        f"CALL NOTIFICATION: {config.business.upper()}",
        f"Urgency: {urgency.upper()}",
        f"Caller Name: {caller_name}",
        f"Callback Phone: {caller_phone}",
        f"Service Address: {address or 'None specified'}",
        f"Call Duration: {record.duration_s} seconds",
        f"Outcome: {record.outcome}",
        "",
        "SUMMARY / ISSUE:",
        issue_desc,
        "",
        "RECOMMENDED ACTION ITEMS:",
    ]
    for item in action_items:
        plain_text_lines.append(f"- {item}")

    plain_text_lines.extend(
        [
            "",
            "TRANSCRIPT SNIPPET:",
        ]
    )
    for entry in record.transcript[-6:]:
        plain_text_lines.append(f"[{entry.role.upper()}]: {entry.text}")

    plain_text = "\n".join(plain_text_lines)

    # HTML Body with styled badge
    urgency_color = (
        "#10b981" if urgency == "normal" else "#f59e0b" if urgency == "urgent" else "#ef4444"
    )
    urgency_bg = (
        "#ecfdf5" if urgency == "normal" else "#fffbeb" if urgency == "urgent" else "#fef2f2"
    )

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 24px;">
    <div style="border-bottom: 2px solid {urgency_color}; padding-bottom: 12px; margin-bottom: 16px;">
      <span style="background: {urgency_bg}; color: {urgency_color}; font-weight: bold; font-size: 12px; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">
        {urgency.upper()} ALERT
      </span>
      <h2 style="margin: 12px 0 4px 0; color: #111827;">{config.business} Call Notification</h2>
      <p style="margin: 0; color: #6b7280; font-size: 13px;">Call ID: {record.call_id} &bull; Duration: {record.duration_s}s</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
      <tr>
        <td style="padding: 6px 0; color: #4b5563; width: 120px;"><strong>Caller:</strong></td>
        <td style="padding: 6px 0; color: #111827;">{caller_name}</td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #4b5563;"><strong>Callback Phone:</strong></td>
        <td style="padding: 6px 0; color: #111827;"><a href="tel:{caller_phone}" style="color: #2563eb; font-weight: bold;">{caller_phone}</a></td>
      </tr>
      <tr>
        <td style="padding: 6px 0; color: #4b5563;"><strong>Address:</strong></td>
        <td style="padding: 6px 0; color: #111827;">{address or '<em>None specified</em>'}</td>
      </tr>
    </table>

    <div style="background: #f3f4f6; border-left: 4px solid {urgency_color}; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 4px 4px 0;">
      <h4 style="margin: 0 0 6px 0; color: #1f2937; font-size: 13px; text-transform: uppercase;">Issue Description</h4>
      <p style="margin: 0; color: #374151; font-size: 14px; line-height: 1.5;">{issue_desc}</p>
    </div>

    <h4 style="margin: 16px 0 8px 0; color: #1f2937; font-size: 13px; text-transform: uppercase;">Required Action Items</h4>
    <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #374151; font-size: 14px;">
      {''.join(f'<li style="margin-bottom: 4px;">{item}</li>' for item in action_items)}
    </ul>
  </div>
</body>
</html>"""

    return PostCallAlert(
        subject=subject,
        urgency=urgency,
        recipient_email=recipient,
        plain_text=plain_text,
        html_body=html_body,
        caller_name=caller_name,
        caller_phone=caller_phone,
        call_id=record.call_id,
        duration_s=record.duration_s,
        address=address,
        action_items=action_items,
    )


def dispatch_post_call_notification(
    record: CallRecord,
    config: BusinessConfig,
    dispatcher: EmailDispatcher | None = None,
) -> bool:
    """Generate and dispatch post-call alert to business owner."""
    try:
        alert = build_post_call_alert(record, config)
        if dispatcher is None:
            # Check for Resend API key or default to console logger
            api_key = os.getenv("RESEND_API_KEY")
            dispatcher = (
                ResendEmailDispatcher(api_key=api_key) if api_key else ConsoleEmailDispatcher()
            )
        return dispatcher.send_alert(alert)
    except Exception as e:
        logger.error("Failed to generate or dispatch post-call alert: %s", e)
        return False
