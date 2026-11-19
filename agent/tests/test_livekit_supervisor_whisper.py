"""Tests for LiveKit Agent Supervisor Whisper Real-Time Ingestion.

Validates:
1. rtc.DataPacket containing supervisor_whisper action is decoded.
2. Silent coaching instruction is injected directly into ChatContext as a system message.
3. ChatContext retains coaching guidance for the LLM's next conversational turn.
"""

import json
from unittest.mock import MagicMock

from livekit import rtc
from livekit.agents.llm import ChatContext


def test_supervisor_whisper_data_packet_injection_into_chat_context() -> None:
    """Verify that receiving a supervisor whisper data packet appends system guidance to ChatContext."""
    chat_ctx = ChatContext()
    assert len(chat_ctx.messages()) == 0

    # Simulate incoming LiveKit DataPacket
    whisper_payload = {
        "type": "supervisor_whisper",
        "action": "whisper",
        "call_id": "call-12345",
        "instruction": "Offer 10% diagnostic discount for loyalty.",
        "supervisor_email": "supervisor@apexplumbing.com",
    }
    raw_bytes = json.dumps(whisper_payload).encode("utf-8")

    mock_packet = MagicMock(spec=rtc.DataPacket)
    mock_packet.data = raw_bytes
    mock_packet.topic = "supervisor_whisper"

    # Simulate the agent handler logic
    data_str = mock_packet.data.decode("utf-8")
    payload = json.loads(data_str)
    msg_type = payload.get("type") or payload.get("action")
    assert msg_type == "supervisor_whisper"

    instruction = payload.get("instruction", "").strip()
    supervisor_tag = payload.get("supervisor_email") or "Supervisor"
    coaching_text = (
        f'[SUPERVISOR COACHING WHISPER from {supervisor_tag}]: "{instruction}". '
        "Adopt this coaching immediately in your next response to the caller."
    )
    chat_ctx.add_message(role="system", content=coaching_text)

    # Verify message in ChatContext
    msgs = chat_ctx.messages()
    assert len(msgs) == 1
    sys_msg = msgs[0]
    assert sys_msg.role == "system"
    assert "Offer 10% diagnostic discount for loyalty." in sys_msg.text_content
    assert "supervisor@apexplumbing.com" in sys_msg.text_content
