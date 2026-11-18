"""Tests for LiveKit voice agent opt-out tool."""

import uuid

import pytest
from sqlalchemy import select

from agent.tools.opt_out import create_opt_out_tool
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.models.outbound import SuppressionRecord
from api.app.models.tenant import Tenant


@pytest.mark.asyncio
async def test_agent_opt_out_tool_execution() -> None:
    """Verify opt_out_tool registers caller opt-out into suppression list."""
    unique = uuid.uuid4().hex[:6]
    target_phone = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"

    with SessionLocal() as db:
        tenant = Tenant(
            name=f"OptOut Plumbing {unique}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-6pm",
            status="active",
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)
        tenant_id = tenant.id

    token = create_access_token({"sub": "livekit-agent", "role": "agent", "tenant_id": tenant_id})

    # Create agent opt-out tool
    tool = create_opt_out_tool(call_token=token, phone_number=target_phone)

    # Execute tool asynchronously as LiveKit Agent does
    response = await tool(reason="caller said do not call again")

    assert "removed your number" in response.lower()
    assert "opt-out" in response.lower()

    # Verify suppression record was committed
    with SessionLocal() as db:
        rec = db.scalar(
            select(SuppressionRecord).where(
                SuppressionRecord.tenant_id == tenant_id,
                SuppressionRecord.phone_number == target_phone,
            )
        )
        assert rec is not None
        assert rec.reason == "opt_out"
        assert "do not call" in rec.notes
