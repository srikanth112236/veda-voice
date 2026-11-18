"""Tests for LiveKit voice agent lookup_business_info Knowledge Base RAG tool (Milestone M10a)."""

import uuid

import pytest
from sqlalchemy.orm import Session

from agent.tools.knowledge import create_knowledge_tools
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from api.app.models.tenant import Tenant
from api.app.services.knowledge import _compute_dense_vector


@pytest.mark.asyncio
async def test_agent_lookup_business_info_grounded_answer() -> None:
    """Verify lookup_business_info tool executes and returns verified documentation snippet."""
    db: Session = SessionLocal()
    tenant_id = f"tool-kb-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Apex Comfort Systems",
            timezone="America/Chicago",
            status="active",
        )
        db.add(tenant)
        db.flush()

        doc = KnowledgeDocument(
            tenant_id=tenant_id,
            filename="pricing_and_rebates.txt",
            status="indexed",
            chunk_count=1,
        )
        db.add(doc)
        db.flush()

        content = (
            "Apex Comfort Systems offers a $500 instant utility rebate on all qualifying high-efficiency "
            "heat pumps and tankless water heaters installed before the end of the year."
        )
        chunk = KnowledgeChunk(
            tenant_id=tenant_id,
            document_id=doc.id,
            chunk_index=0,
            content=content,
            token_count=len(content) // 4,
            embedding=_compute_dense_vector(content),
        )
        db.add(chunk)
        db.commit()

        # Generate agent token
        agent_token = create_access_token(
            {"sub": "call-agent-01", "role": "agent", "tenant_id": tenant_id}
        )

        # Instantiate tool
        tools = create_knowledge_tools(agent_token)
        assert len(tools) == 1
        lookup_tool = tools[0]

        # Execute tool
        result = await lookup_tool(
            topic="Are there utility rebates for high efficiency heat pumps?"
        )

        assert "VERIFIED TENANT DOCUMENTATION" in result
        assert "$500 instant utility rebate" in result
        assert "pricing_and_rebates.txt" in result
    finally:
        db.query(KnowledgeChunk).filter(KnowledgeChunk.tenant_id == tenant_id).delete()
        db.query(KnowledgeDocument).filter(KnowledgeDocument.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


@pytest.mark.asyncio
async def test_agent_lookup_business_info_out_of_scope_fallback() -> None:
    """Verify lookup_business_info tool returns safe OUT_OF_SCOPE guidance when query is ungrounded."""
    db: Session = SessionLocal()
    tenant_id = f"tool-kb-oos-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Plumbing Only Co",
            timezone="America/Chicago",
            status="active",
        )
        db.add(tenant)
        db.commit()

        agent_token = create_access_token(
            {"sub": "call-agent-02", "role": "agent", "tenant_id": tenant_id}
        )
        tools = create_knowledge_tools(agent_token)
        lookup_tool = tools[0]

        result = await lookup_tool(
            topic="Can your plumbers also do drywall painting and tile backsplash?"
        )

        assert "OUT_OF_SCOPE" in result
        assert "take down your contact info" in result
    finally:
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()
