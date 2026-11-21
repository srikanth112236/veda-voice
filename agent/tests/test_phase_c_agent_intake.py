"""Unit tests for Phase C: Voice Agent Intake Questionnaire Trees and Tool Forwarding."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from agent.config import TenantConfig
from agent.config_client import parse_tenant_config_from_dict
from agent.prompts import build_system_prompt
from agent.tools.booking import create_booking_tools


def test_dict_to_config_hydrates_industry_pack_intake_schema():
    """Verify parse_tenant_config_from_dict hydrates industry_pack_intake_schema from control plane response."""
    raw_payload = {
        "tenant_id": "ten_abc_123",
        "business_name": "Apex HVAC & Plumbing",
        "timezone": "America/Chicago",
        "hours": "8am-5pm",
        "agent_name": "Alex",
        "greeting": "Thanks for calling Apex.",
        "tone": "direct",
        "services": ["Plumbing", "AC Repair"],
        "pricing_policy": "diagnostic_fee_only",
        "pricing_details": {},
        "faq": [],
        "emergency_keywords": ["gas leak", "burst pipe"],
        "emergency_advice": "Evacuate if gas smell is detected.",
        "transfer_number": "+15125550100",
        "call_token": "mock-token",
        "industry_pack_slug": "home_services",
        "industry_pack_prompt": "Emergency triage protocol active.",
        "industry_pack_intake_schema": {
            "title": "Home Services Trade Triage",
            "fields": [
                {
                    "key": "trade_type",
                    "label": "Trade Category",
                    "type": "select",
                    "required": True,
                    "prompt": "Ask which trade specialty is needed.",
                }
            ],
        },
    }

    config = parse_tenant_config_from_dict(raw_payload)
    assert config.industry_pack_slug == "home_services"
    assert config.industry_pack_intake_schema is not None
    assert config.industry_pack_intake_schema["title"] == "Home Services Trade Triage"
    assert len(config.industry_pack_intake_schema["fields"]) == 1


def test_build_system_prompt_weaves_intake_protocol():
    """Verify build_system_prompt includes intake instructions when industry_pack_prompt has intake tree."""
    config = TenantConfig(
        tenant_id="ten_test",
        business="Apex Comfort",
        timezone="America/Chicago",
        hours="8am-5pm",
        agent_name="Apex Agent",
        greeting="Hi",
        tone="direct",
        services=["Plumbing"],
        industry_pack_slug="home_services",
        industry_pack_prompt="Plumbing triage rules.\n# HOME SERVICES TRADE TRIAGE PROTOCOL:\n- [trade_type] (Required): Ask which trade is needed.",
    )

    prompt = build_system_prompt(config)
    assert "HOME SERVICES TRADE TRIAGE PROTOCOL:" in prompt
    assert "trade_type" in prompt
    assert "intake_details" in prompt


@pytest.mark.asyncio
async def test_book_appointment_tool_parses_and_forwards_intake_details():
    """Verify book_appointment_tool extracts dict or JSON string intake answers and sends to API."""
    mock_api_call = MagicMock(return_value={"status": "confirmed", "booking_id": "bk_999"})

    with patch("agent.tools.booking._call_internal_calendar_api", mock_api_call):
        tools = create_booking_tools(call_token="dummy-call-token", caller_phone="+15125550122")
        tool_map = {tool.info.name: tool for tool in tools}
        book_tool = tool_map["book_appointment_tool"]

        intake_dict = {
            "trade_type": "Plumbing",
            "urgency_level": "urgent_same_day",
            "issue_summary": "Water heater leaking from base",
        }

        # 1. Test passing intake as python dict
        res = await book_tool(
            start_iso="2026-11-25T10:00:00",
            customer_name="Bob Smith",
            customer_phone="+15125550122",
            service_type="diagnostic_visit",
            intake_details=intake_dict,
        )
        assert "confirmed" in res.lower()
        assert "bk_999" in res

        call_args = mock_api_call.call_args[1]
        assert call_args["payload"]["intake_details"] == intake_dict

        # 2. Test passing intake as serialized JSON string (common from voice LLM function calls)
        intake_json_str = json.dumps(intake_dict)
        res2 = await book_tool(
            start_iso="2026-11-25T14:00:00",
            customer_name="Bob Smith",
            customer_phone="+15125550122",
            service_type="diagnostic_visit",
            intake_details=intake_json_str,
        )
        assert "confirmed" in res2.lower()
        call_args2 = mock_api_call.call_args[1]
        assert call_args2["payload"]["intake_details"] == intake_dict
