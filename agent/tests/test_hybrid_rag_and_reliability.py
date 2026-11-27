"""Offline unit tests for Phase 2 hybrid RAG, reliability prompts, and escalation routing."""

import sys
import types
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from agent.config import FAQItem, TenantConfig
from agent.prompts import build_system_prompt
from agent.rag import rank_and_filter_faqs, search_faqs_hybrid


def test_hybrid_rag_matches_stems_and_bigrams() -> None:
    """Verify hybrid RAG ranks bigram and stem-prefix matches accurately."""
    faqs = [
        FAQItem(question="What are your hours?", answer="8am to 6pm", category="hours"),
        FAQItem(
            question="Do you repair tankless water heaters?",
            answer="Yes, we service and install tankless water heaters.",
            category="service_scope",
        ),
        FAQItem(
            question="Do you accept credit cards?",
            answer="Yes, all major cards.",
            category="pricing",
        ),
    ]

    hits = search_faqs_hybrid(faqs, "my water heater is leaking", top_k=2)
    assert len(hits) >= 1
    assert "water heaters" in hits[0].question.lower()

    ranked = rank_and_filter_faqs(faqs, query_context="repairing tankless water heater", max_faqs=1)
    assert len(ranked) == 1
    assert "water heaters" in ranked[0].question.lower()


def test_build_system_prompt_includes_reliability_and_caller_memory() -> None:
    """Verify reliability protocol and returning caller memory appear in system prompt."""
    cfg = TenantConfig(
        tenant_id="t-rel-1",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-6pm",
        greeting="Hello Apex Plumbing.",
    )
    caller_ctx = {
        "returning_caller": True,
        "caller_name": "Jordan Rivera",
        "vip_tier": "gold",
        "recent_call_summary": "Inquired about drain jetting",
        "upcoming_booking": {
            "service_type": "Pipe Inspection",
            "start_utc": "2026-11-28T15:00:00+00:00",
            "status": "confirmed",
        },
        "open_quote": {
            "quote_number": "QT-102",
            "title": "Water Heater Swap",
            "status": "sent",
        },
    }
    dt = datetime(2026, 11, 27, 10, 0, tzinfo=ZoneInfo("America/New_York"))
    prompt = build_system_prompt(cfg, current_dt=dt, caller_context=caller_ctx)

    assert "RELIABILITY, READ-BACK, DTMF & LOOP-BREAKER PROTOCOL:" in prompt
    assert "DTMF KEYPAD FALLBACK:" in prompt
    assert "LOOP BREAKER:" in prompt
    assert "RETURNING CALLER MEMORY (HYDRATED PRE-CALL):" in prompt
    assert "Jordan Rivera" in prompt
    assert "QT-102" in prompt
    assert "Pipe Inspection" in prompt


def test_resolve_escalation_target_honors_custom_rules() -> None:
    """Verify custom escalation_rules override default transfer_number when matched."""
    if "livekit.agents" not in sys.modules:
        lk_mod = types.ModuleType("livekit")
        lk_agents: Any = types.ModuleType("livekit.agents")
        lk_agents.FunctionTool = object
        lk_agents.function_tool = lambda fn=None, **kw: fn if fn else (lambda f: f)
        sys.modules.setdefault("livekit", lk_mod)
        sys.modules.setdefault("livekit.agents", lk_agents)

    from agent.tools.transfer import resolve_escalation_target

    cfg = TenantConfig(
        tenant_id="t-esc-1",
        business="Apex Plumbing",
        hours="Mon-Fri 8am-6pm",
        greeting="Hello",
        transfer_number="+18005550100",
        escalation_rules=[
            {
                "condition": "billing dispute or refund",
                "target_number": "+18005550999",
                "label": "Billing Manager",
            }
        ],
    )

    assert resolve_escalation_target(cfg, reason="caller has billing dispute") == "+18005550999"
    assert resolve_escalation_target(cfg, reason="caller_requested_human") == "+18005550100"
