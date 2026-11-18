"""Google Sheets Two-Way Sync Integration Service.

Handles:
1. Inbound: Parsing newly appended spreadsheet rows into normalized leads and triggering speed-to-lead calling.
2. Outbound Writeback: Formatting and synchronizing call outcomes, AI summaries, sentiment scores, and audio recording links back into client spreadsheets.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.models.call import Call
from api.app.models.crm import Contact

logger = logging.getLogger("vedavoice.integrations.google_sheets")


class GoogleSheetRowPayload(BaseModel):
    """Normalized payload sent from Google Sheets / Apps Script trigger."""

    full_name: str | None = Field(None, description="Lead customer name")
    phone: str = Field(..., description="Lead telephone number")
    email: str | None = Field(None, description="Customer email address")
    service_requested: str | None = Field(None, description="Requested job or service")
    consent_confirmed: bool = Field(
        True, description="Whether caller agreed to automated phone contact"
    )
    spreadsheet_id: str | None = Field(None, description="Target Google Spreadsheet ID")
    sheet_name: str | None = Field("Sheet1", description="Worksheet name")
    row_index: int | None = Field(None, description="Row number in spreadsheet for writeback")
    custom_columns: dict[str, Any] = Field(
        default_factory=dict, description="Arbitrary extra column headers and values"
    )


class GoogleSheetWritebackData(BaseModel):
    """Data contract written back to client Google Spreadsheet upon call completion."""

    call_id: str
    phone: str
    status: str
    outcome: str
    duration_s: float
    billable_minutes: float
    summary: str
    sentiment_label: str
    sentiment_score: float
    recording_url: str | None
    completed_at: str
    row_index: int | None = None
    spreadsheet_id: str | None = None
    sheet_name: str = "Sheet1"


def parse_raw_sheet_row(raw_data: dict[str, Any]) -> GoogleSheetRowPayload:
    """Extract lead parameters from various Google Sheet header casings (case-insensitive)."""
    normalized_keys = {
        str(k).strip().lower().replace(" ", "_").replace("-", "_"): v for k, v in raw_data.items()
    }

    # Name extraction
    name = (
        normalized_keys.get("full_name")
        or normalized_keys.get("name")
        or normalized_keys.get("customer_name")
        or normalized_keys.get("lead_name")
        or (
            f"{normalized_keys.get('first_name', '')} {normalized_keys.get('last_name', '')}".strip()
            if "first_name" in normalized_keys or "last_name" in normalized_keys
            else None
        )
    )

    # Phone extraction
    phone = (
        normalized_keys.get("phone")
        or normalized_keys.get("phone_number")
        or normalized_keys.get("mobile")
        or normalized_keys.get("telephone")
        or normalized_keys.get("tel")
        or ""
    )

    # Email extraction
    email = (
        normalized_keys.get("email")
        or normalized_keys.get("email_address")
        or normalized_keys.get("contact_email")
    )

    # Service extraction
    service = (
        normalized_keys.get("service")
        or normalized_keys.get("service_requested")
        or normalized_keys.get("notes")
        or normalized_keys.get("inquiry")
        or normalized_keys.get("issue")
    )

    # Consent extraction
    consent_raw = normalized_keys.get("consent", normalized_keys.get("consent_confirmed", True))
    consent_confirmed = (
        consent_raw in (True, 1, "true", "True", "yes", "Yes", "1")
        if isinstance(consent_raw, bool | int | str)
        else True
    )

    # Metadata extraction
    spreadsheet_id = normalized_keys.get("spreadsheet_id", raw_data.get("spreadsheet_id"))
    sheet_name = normalized_keys.get("sheet_name", raw_data.get("sheet_name", "Sheet1"))
    row_index = normalized_keys.get("row_index", raw_data.get("row_index"))

    return GoogleSheetRowPayload(
        full_name=name or "Google Sheet Lead",
        phone=str(phone).strip(),
        email=str(email).strip() if email else None,
        service_requested=str(service).strip() if service else None,
        consent_confirmed=consent_confirmed,
        spreadsheet_id=str(spreadsheet_id) if spreadsheet_id else None,
        sheet_name=str(sheet_name) if sheet_name else "Sheet1",
        row_index=int(row_index) if row_index is not None and str(row_index).isdigit() else None,
        custom_columns=raw_data,
    )


def format_sheet_writeback(call: Call, contact: Contact | None = None) -> GoogleSheetWritebackData:
    """Format call outcome, AI summary, sentiment, and recording URL for Google Sheet writeback."""
    summary_text = ""
    if call.message and isinstance(call.message, dict):
        summary_text = call.message.get("summary") or call.message.get("notes") or ""
    elif call.transcript:
        summary_text = f"Call completed with {call.turn_count} conversational turns."
    else:
        summary_text = f"Call outcome: {call.outcome}"

    phone_num = call.caller_number or (contact.phone if contact else "")

    completed_iso = call.ended_at.isoformat() if call.ended_at else datetime.now(UTC).isoformat()

    return GoogleSheetWritebackData(
        call_id=call.call_id,
        phone=phone_num,
        status="completed" if call.duration_s > 0 else "missed",
        outcome=call.outcome,
        duration_s=round(call.duration_s, 1),
        billable_minutes=call.billable_minutes,
        summary=summary_text,
        sentiment_label=call.sentiment_label,
        sentiment_score=round(call.sentiment_score, 2),
        recording_url=call.recording_url,
        completed_at=completed_iso,
    )


def sync_call_result_to_sheets(call_id: str, db: Session | None = None) -> dict[str, Any]:
    """Inspect completed call, extract sheet sync metadata if present, and execute writeback."""
    from api.app.db.session import SessionLocal

    close_session = False
    if db is None:
        db = SessionLocal()
        close_session = True

    try:
        call = db.scalar(select(Call).where(Call.call_id == call_id))
        if not call:
            call = db.scalar(select(Call).where(Call.id == call_id))
        if not call:
            logger.warning("Call %s not found for sheets writeback", call_id)
            return {"status": "error", "message": "Call not found"}

        contact = None
        if call.contact_id:
            contact = db.scalar(select(Contact).where(Contact.id == call.contact_id))

        writeback = format_sheet_writeback(call, contact)

        # Check if lead custom_data or contact custom_fields contained sheet metadata
        metadata: dict[str, Any] = {}
        if contact and contact.custom_fields:
            metadata = contact.custom_fields
        elif call.message and isinstance(call.message, dict):
            metadata = call.message

        spreadsheet_id = metadata.get("spreadsheet_id")
        row_index = metadata.get("row_index")

        if spreadsheet_id:
            writeback.spreadsheet_id = str(spreadsheet_id)
        if row_index:
            try:
                writeback.row_index = int(row_index)
            except Exception:
                pass

        logger.info(
            "Google Sheets writeback prepared for call %s: outcome=%s, sentiment=%s, recording=%s",
            call.call_id,
            writeback.outcome,
            writeback.sentiment_label,
            writeback.recording_url,
        )

        return {
            "status": "success",
            "call_id": call.call_id,
            "writeback": writeback.model_dump(),
        }
    finally:
        if close_session:
            db.close()


async def execute_sheet_writeback(
    writeback: GoogleSheetWritebackData,
    writeback_url: str | None = None,
) -> bool:
    """Send call writeback payload to Google Apps Script or external spreadsheet webhook."""
    import httpx

    if not writeback_url or writeback_url.startswith("mock_") or "mock" in writeback_url:
        logger.info("Mock Google Sheet writeback executed for call %s", writeback.call_id)
        return True

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(writeback_url, json=writeback.model_dump())
            if resp.status_code in (200, 201, 302):
                logger.info("Successfully delivered Google Sheet writeback to %s", writeback_url)
                return True
            logger.warning(
                "Google Sheet writeback returned status %s: %s", resp.status_code, resp.text
            )
            return False
    except Exception as err:
        logger.error("Failed to execute Google Sheet writeback: %s", err)
        return False
