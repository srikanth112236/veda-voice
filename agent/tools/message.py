"""take_message tool for receptionist agent with phone validation, confirmation guard, and tenant scoping."""

import re
from typing import Annotated

from livekit.agents import FunctionTool, function_tool

from agent.records import MessagePayload

# E.164: +1234567890.. (8 to 15 digits)
_E164_REGEX = re.compile(r"^\+[1-9]\d{7,14}$")
_DIGITS_ONLY = re.compile(r"\D")

ALLOWED_URGENCIES = {"normal", "urgent", "emergency"}


def validate_and_normalize_phone(phone: str | None) -> tuple[bool, str]:
    """Validate phone format (E.164 or 10-digit US) and return (is_valid, normalized_phone)."""
    if not phone or not phone.strip():
        return False, ""

    raw = phone.strip()
    # Check E.164 directly first
    if _E164_REGEX.match(raw):
        return True, raw

    # Clean non-digits
    digits = _DIGITS_ONLY.sub("", raw)
    if len(digits) == 10 and digits[0] in "23456789":
        return True, f"+1{digits}"
    elif len(digits) == 11 and digits[0] == "1" and digits[1] in "23456789":
        return True, f"+{digits}"

    return False, raw


class MessageCollector:
    """Stores the latest message and correction history for a call session."""

    def __init__(self, caller_id_phone: str = "", tenant_id: str = "default") -> None:
        self.caller_id_phone = caller_id_phone
        self.tenant_id = tenant_id
        self.latest_message: MessagePayload | None = None
        self.history: list[MessagePayload] = []

    def record(self, payload: MessagePayload) -> None:
        """Save a new message or correction."""
        if self.latest_message is not None:
            self.history.append(self.latest_message)
        self.latest_message = payload


def create_take_message_tool(collector: MessageCollector) -> FunctionTool:
    """Factory to create take_message function tool bound to a session's MessageCollector."""

    async def take_message_impl(
        name: Annotated[str, "Caller's full name"],
        phone: Annotated[str, "Caller's callback phone number in E.164 or 10-digit US format"],
        message: Annotated[str, "The inquiry, requested service, or emergency details"],
        urgency: Annotated[str, "Urgency level: 'normal', 'urgent', or 'emergency'"] = "normal",
        phone_confirmed: Annotated[
            bool,
            "Must be True. Set to True ONLY AFTER you read the number back and the caller confirmed it.",
        ] = False,
        address: Annotated[str | None, "Service address or apartment/gate code if provided"] = None,
    ) -> str:
        """Validate phone, enforce caller confirmation, and store message."""
        # 1. Enforce caller confirmation
        if not phone_confirmed:
            return (
                "REJECTED: You have not confirmed the phone number with the caller. "
                "Please read the phone number back to the caller and ask for a yes/no confirmation first."
            )

        # 2. Validate phone number
        is_valid, normalized_phone = validate_and_normalize_phone(phone)
        if not is_valid:
            return (
                f"REJECTED: '{phone}' is not a valid 10-digit US or E.164 phone number. "
                "Please ask the caller to repeat their phone number."
            )

        # 3. Validate urgency
        clean_urgency = (urgency or "normal").strip().lower()
        if clean_urgency not in ALLOWED_URGENCIES:
            clean_urgency = "normal"

        # 4. Save payload scoped by tenant_id
        payload = MessagePayload(
            tenant_id=collector.tenant_id,
            name=name.strip(),
            phone=normalized_phone,
            message=message.strip(),
            urgency=clean_urgency,
            phone_confirmed=True,
            address=address.strip() if address else None,
        )
        collector.record(payload)

        if clean_urgency == "emergency":
            return (
                f"SUCCESS: Emergency details recorded for {payload.name}. "
                "Inform the caller: 'I've written down your details. If anyone is in immediate danger or injured, please call 911 immediately.'"
            )
        return (
            f"SUCCESS: Message recorded for {payload.name}. Callback phone {payload.phone} confirmed. "
            "Inform the caller: 'I've written down your details.'"
        )

    return function_tool(
        take_message_impl,
        name="take_message",
        description=(
            "Save a message from the caller. You MUST read the phone number back and get an explicit "
            "'yes' before calling this tool (setting phone_confirmed=True). If caller confirms their caller ID, "
            "you may use that number."
        ),
    )
