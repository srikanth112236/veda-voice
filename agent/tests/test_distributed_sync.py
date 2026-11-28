"""Tests for Distributed Dynamic Configuration API-First Resolution (Gap 3).

Verifies that:
1. /api/v1/internal/tenants/{tenant_id} allows distributed workers to look up configuration directly by ID.
2. resolve_tenant() queries API first instead of relying on local disk files.
3. In-memory caching with TTL prevents excessive API hammering.
4. Fallback to local static JSON files occurs gracefully when API is unreachable.
"""

import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from agent.config import (
    fetch_tenant_from_api_by_id,
    invalidate_tenant_cache,
    resolve_tenant,
)
from api.app.main import app

client = TestClient(app)


def test_internal_tenant_lookup_by_id_endpoint() -> None:
    """Verify GET /internal/tenants/{tenant_id} endpoint returns active configuration."""
    unique = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"dist_owner_{unique}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Distributed HVAC {unique}",
            "owner_name": "Dist Owner",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
            "voice_id": "Edward",
            "agent_name": "Edward",
            "greeting": f"Thanks for calling Distributed HVAC {unique}.",
        },
    )
    assert reg_res.status_code == 200
    tenant_id = reg_res.json()["user"]["tenant_id"]

    from api.app.core.config import settings

    # 1. Fetch via GET /internal/tenants/{tenant_id}
    res = client.get(
        f"/api/v1/internal/tenants/{tenant_id}",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["tenant_id"] == tenant_id
    assert data["business_name"] == f"Distributed HVAC {unique}"
    assert data["agent_name"] == "Edward"
    assert data["voice_id"] == "Edward"
    assert "call_token" in data
    assert len(data["call_token"]) > 20

    # 2. Fetch non-existent tenant returns 404
    non_existent = client.get(
        f"/api/v1/internal/tenants/{uuid.uuid4()}",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
    )
    assert non_existent.status_code == 404


def test_api_first_dynamic_resolution_and_caching() -> None:
    """Verify resolve_tenant resolves via API first, caches in-memory, and invalidates properly."""
    unique = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"api_first_{unique}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"API First Auto {unique}",
            "owner_name": "Auto Owner",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
            "voice_id": "Dennis",
            "agent_name": "Dennis",
        },
    )
    assert reg_res.status_code == 200
    tenant_id = reg_res.json()["user"]["tenant_id"]

    invalidate_tenant_cache()

    # 1. First resolution should query API and return fresh tenant
    t1 = resolve_tenant(test_number)
    assert t1.tenant_id == tenant_id
    assert t1.business == f"API First Auto {unique}"
    assert t1.voice_id == "Dennis"

    # 2. Second resolution should hit in-memory cache
    t2 = resolve_tenant(test_number)
    assert t2 is t1  # Same in-memory instance from cache

    # 3. Direct lookup by ID via fetch_tenant_from_api_by_id
    t_by_id = fetch_tenant_from_api_by_id(tenant_id)
    assert t_by_id is not None
    assert t_by_id.tenant_id == tenant_id
    assert t_by_id.business == f"API First Auto {unique}"


def test_fallback_to_static_files_when_api_is_offline() -> None:
    """Verify that if internal API fails, agent falls back to static JSON disk files."""
    invalidate_tenant_cache()

    # Mock fetch_tenant_from_api to simulate API failure/offline
    with patch("agent.config.fetch_tenant_from_api", return_value=None):
        # Apex Plumbing (+18005550199) is in data/tenants/
        config = resolve_tenant("+18005550199")
        assert config.business == "Apex Plumbing & Heating"
        assert config.tenant_id != "unassigned"


def test_safe_default_tenant_for_unknown_number() -> None:
    """Verify unknown number returns safe default tenant that takes no data."""
    invalidate_tenant_cache()
    unknown_num = "+19998887777"
    config = resolve_tenant(unknown_num)
    assert config.tenant_id == "unassigned"
    assert "unassigned" in config.business.lower()
    assert config.tools_enabled == ["end_call"]
