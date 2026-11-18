"""Tests for Distributed Dynamic Configuration HTTP Client (agent/config_client.py).

Validates:
1. Remote/containerized worker can fetch fresh tenant configuration directly over HTTP.
2. start_call_session performs live HTTP capacity & quota handshake with control plane.
3. In-memory TTL caching prevents network request flooding.
4. Worker resiliently falls back to last-known cached configuration if API becomes unavailable.
"""

import uuid
from pathlib import Path
from unittest.mock import patch

import pytest

from agent.config_client import InternalApiClient
from api.app.db.session import SessionLocal
from api.app.models.tenant import PhoneNumber, Tenant


@pytest.fixture
def test_tenant_in_db() -> tuple[str, str]:
    """Seed a tenant and phone number in DB for HTTP lookup tests."""
    suffix = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    db = SessionLocal()
    try:
        tenant = Tenant(
            name=f"Distributed Remote Plumbing {suffix}",
            timezone="America/Chicago",
            hours="Mon-Fri 7am-6pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        phone = PhoneNumber(
            tenant_id=tenant.id,
            e164=test_number,
            provider="twilio",
            status="active",
        )
        db.add(phone)
        db.commit()
        return tenant.id, test_number
    finally:
        db.close()


def test_fetch_tenant_by_number_and_id_over_http(
    test_tenant_in_db: tuple[str, str], tmp_path: Path
) -> None:
    """Verify worker fetches fresh config over HTTP by phone number and by tenant_id."""
    tenant_id, phone_number = test_tenant_in_db
    client = InternalApiClient(cache_dir=tmp_path)

    # 1. Fetch by phone number
    cfg_by_num = client.fetch_tenant_by_number(phone_number)
    assert cfg_by_num is not None
    assert cfg_by_num.tenant_id == tenant_id
    assert "Distributed Remote Plumbing" in cfg_by_num.business
    assert cfg_by_num.timezone == "America/Chicago"

    # 2. Fetch by tenant_id
    cfg_by_id = client.fetch_tenant_by_id(tenant_id)
    assert cfg_by_id is not None
    assert cfg_by_id.tenant_id == tenant_id
    assert "Distributed Remote Plumbing" in cfg_by_id.business

    # 3. Verify last-known config was written to worker's local cache directory
    cache_file = tmp_path / f"{tenant_id}.json"
    assert cache_file.exists()


def test_start_call_session_handshake_over_http(test_tenant_in_db: tuple[str, str]) -> None:
    """Verify start_call_session executes live HTTP handshake and receives call_token."""
    tenant_id, phone_number = test_tenant_in_db
    client = InternalApiClient()
    call_id = f"remote-call-{uuid.uuid4().hex[:8]}"

    res = client.start_call_session(
        dialed_number=phone_number,
        caller_number="+15125550100",
        call_id=call_id,
        direction="inbound",
    )

    assert res["allow"] is True
    assert res["reason"] == "approved"
    assert res["tenant_id"] == tenant_id
    assert "call_token" in res
    assert len(res["call_token"]) > 20
    assert res["config"] is not None
    assert res["config"]["tenant_id"] == tenant_id


def test_worker_resilient_fallback_to_last_known_cache(
    test_tenant_in_db: tuple[str, str], tmp_path: Path
) -> None:
    """Verify worker falls back to last-known good config when control plane is unreachable."""
    tenant_id, phone_number = test_tenant_in_db
    client = InternalApiClient(cache_dir=tmp_path)

    # Prime cache
    initial_cfg = client.fetch_tenant_by_number(phone_number)
    assert initial_cfg is not None

    # Clear in-memory cache to force network or disk lookup
    client._memory_cache.clear()

    # Simulate network outage to API
    with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
        # Also ensure in-process fallback fails to simulate truly isolated container
        with patch(
            "api.app.routers.internal.resolve_tenant_by_number", side_effect=Exception("No DB")
        ):
            cached_cfg = client.fetch_tenant_by_number(phone_number)
            assert cached_cfg is not None
            assert cached_cfg.tenant_id == tenant_id
            assert "Distributed Remote Plumbing" in cached_cfg.business


def test_in_memory_ttl_cache_avoids_repeated_network_calls(
    test_tenant_in_db: tuple[str, str], tmp_path: Path
) -> None:
    """Verify sequential lookups within TTL hit in-memory cache without repeating HTTP calls."""
    tenant_id, phone_number = test_tenant_in_db
    client = InternalApiClient(cache_dir=tmp_path)

    # First lookup
    cfg1 = client.fetch_tenant_by_number(phone_number)
    assert cfg1 is not None

    # Second lookup should hit in-memory cache immediately
    with patch("urllib.request.urlopen") as mock_http:
        cfg2 = client.fetch_tenant_by_number(phone_number)
        assert cfg2 is cfg1
        mock_http.assert_not_called()
