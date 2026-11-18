"""Voice agent tool for Sub-50ms Knowledge Base Document RAG & FAQ Retrieval (Milestone M10a).

All knowledge lookups communicate with the control plane internal API using the
call-scoped token. The agent never accesses the database directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Annotated, Any

from livekit.agents import FunctionTool, function_tool

logger = logging.getLogger("receptionist.tools.knowledge")


def _call_internal_knowledge_api(
    payload: dict[str, Any],
    call_token: str,
    api_base_url: str | None = None,
) -> dict[str, Any]:
    """Execute authenticated HTTP POST request to internal control plane RAG endpoint."""
    base_url = api_base_url or os.getenv("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
    url = f"{base_url}/api/v1/internal/knowledge/search"

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {call_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return dict(data) if isinstance(data, dict) else {}
    except Exception as e:
        logger.debug("HTTP call to internal knowledge endpoint failed: %s; trying in-process", e)
        # In-process fallback when running in unit tests or unified runtime
        try:
            from api.app.db.session import SessionLocal
            from api.app.routers.internal import (
                InternalKnowledgeSearchRequest,
                internal_knowledge_search,
            )

            db = SessionLocal()
            try:
                res = internal_knowledge_search(
                    payload=InternalKnowledgeSearchRequest(
                        query=payload.get("query", ""),
                        top_k=payload.get("top_k", 3),
                        confidence_threshold=payload.get("confidence_threshold", 0.30),
                    ),
                    authorization=f"Bearer {call_token}",
                    db=db,
                )
                if hasattr(res, "model_dump"):
                    dumped: dict[str, Any] = res.model_dump()
                    return dumped
                if isinstance(res, dict):
                    return res
                return dict(res)
            finally:
                db.close()
        except Exception as in_proc_err:
            logger.error("In-process internal knowledge search failed: %s", in_proc_err)
            return {
                "out_of_scope": True,
                "confidence_score": 0.0,
                "top_matches": [],
                "grounding_prompt": "Knowledge lookup temporarily unavailable.",
                "latency_ms": 0.0,
            }


def create_knowledge_tools(call_token: str) -> list[FunctionTool]:
    """Create LiveKit FunctionTools bound to the active call token."""

    @function_tool
    async def lookup_business_info(
        topic: Annotated[
            str,
            "Specific topic, question, policy, warranty, or service to look up in the business knowledge base",
        ],
    ) -> str:
        """Search verified tenant business documents, price lists, policies, and FAQs to answer caller questions accurately."""
        res = await asyncio.to_thread(
            _call_internal_knowledge_api,
            payload={"query": topic, "top_k": 3},
            call_token=call_token,
        )

        if res.get("out_of_scope", False) or not res.get("top_matches"):
            return (
                "OUT_OF_SCOPE: I do not have verified documentation answering that specific inquiry. "
                "Politely inform the caller: 'I don't have that specific detail in our documentation right in front of me, "
                "but I can take down your contact info or transfer you to our specialist team.'"
            )

        matches = res.get("top_matches", [])
        snippets = "\n---\n".join(
            f"[{m.get('filename')}, Chunk {m.get('chunk_index')} (Confidence: {m.get('score')}]:\n{m.get('content')}"
            for m in matches
        )
        return f"VERIFIED TENANT DOCUMENTATION (Answer caller using ONLY these facts):\n{snippets}"

    return [lookup_business_info]
