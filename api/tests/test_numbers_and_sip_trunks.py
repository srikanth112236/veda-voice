"""Tests for Phase 3: Automated Phone Number Inventory & SIP Trunk Binding."""

import uuid

from fastapi.testclient import TestClient

from api.app.core.config import settings
from api.app.main import app

client = TestClient(app)


def test_numbers_multi_tenant_isolation_and_listing() -> None:
    """Verify tenant users only see their own numbers while admin sees all."""
    # 1. Login as Platform Admin
    admin_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Register Tenant A
    suffix_a = uuid.uuid4().hex[:6]
    phone_a = f"+1512333{suffix_a[:4]}"
    reg_a = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Tenant A {suffix_a}",
            "owner_name": "Alice Smith",
            "email": f"alice_{suffix_a}@tenanta.com",
            "password": "Password123!",
            "phone_number": phone_a,
        },
    )
    assert reg_a.status_code == 200
    token_a = reg_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 3. Register Tenant B
    suffix_b = uuid.uuid4().hex[:6]
    phone_b = f"+1512444{suffix_b[:4]}"
    reg_b = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Tenant B {suffix_b}",
            "owner_name": "Bob Jones",
            "email": f"bob_{suffix_b}@tenantb.com",
            "password": "Password123!",
            "phone_number": phone_b,
        },
    )
    assert reg_b.status_code == 200
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 4. Verify Tenant A only sees their own number
    list_a = client.get("/api/v1/numbers", headers=headers_a)
    assert list_a.status_code == 200
    numbers_a = list_a.json()
    assert len(numbers_a) == 1
    assert numbers_a[0]["e164"] == phone_a
    assert phone_b not in [n["e164"] for n in numbers_a]

    # 5. Verify Tenant B only sees their own number
    list_b = client.get("/api/v1/numbers", headers=headers_b)
    assert list_b.status_code == 200
    numbers_b = list_b.json()
    assert len(numbers_b) == 1
    assert numbers_b[0]["e164"] == phone_b
    assert phone_a not in [n["e164"] for n in numbers_b]

    # 6. Verify Platform Admin sees both and agency pool numbers
    admin_list = client.get("/api/v1/numbers", headers=admin_headers)
    assert admin_list.status_code == 200
    all_numbers = admin_list.json()
    e164_set = {n["e164"] for n in all_numbers}
    assert phone_a in e164_set
    assert phone_b in e164_set
    assert any(n["status"] == "pool" for n in all_numbers)


def test_carrier_number_search_and_provisioning() -> None:
    """Verify search, carrier provisioning, and duplicate prevention."""
    admin_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Search via GET & POST
    search_get = client.get("/api/v1/numbers/search?area_code=512&mode=carrier_search")
    assert search_get.status_code == 200
    assert len(search_get.json()) >= 1

    search_post = client.post(
        "/api/v1/numbers/search",
        json={"area_code": "512", "mode": "carrier_search"},
    )
    assert search_post.status_code == 200
    assert len(search_post.json()) >= 1

    # 2. Provision new number to Agency Pool
    unique_suffix = uuid.uuid4().hex[:6]
    new_e164 = f"+1512999{unique_suffix[:4]}"
    prov_resp = client.post(
        "/api/v1/numbers",
        headers=admin_headers,
        json={
            "e164": new_e164,
            "provider": "twilio",
            "label": "Test Provisioned Pool Line",
            "locality": "Austin Metro",
            "region": "TX",
        },
    )
    assert prov_resp.status_code == 201
    prov_data = prov_resp.json()
    assert prov_data["e164"] == new_e164
    assert prov_data["status"] == "pool"
    assert prov_data["tenant_id"] is None
    assert prov_data["trunk_id"] == "ST_inbound_livekit_scale"

    # 3. Duplicate prevention check
    dup_resp = client.post(
        "/api/v1/numbers",
        headers=admin_headers,
        json={
            "e164": new_e164,
            "provider": "twilio",
        },
    )
    assert dup_resp.status_code == 409
    assert "already registered" in dup_resp.json()["detail"].lower()


def test_pool_number_attach_and_detach_lifecycle() -> None:
    """Verify attaching a pool number to a tenant and detaching it back to the pool."""
    admin_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create target tenant
    suffix = uuid.uuid4().hex[:6]
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Attach HVAC {suffix}",
            "owner_name": "Carl Danvers",
            "email": f"carl_{suffix}@attachhvac.com",
            "password": "Password123!",
        },
    )
    assert reg_resp.status_code == 200
    tenant_id = reg_resp.json()["user"]["tenant_id"]
    tenant_token = reg_resp.json()["access_token"]
    tenant_headers = {"Authorization": f"Bearer {tenant_token}"}

    # Provision number to pool
    e164 = f"+1512777{suffix[:4]}"
    prov_resp = client.post(
        "/api/v1/numbers",
        headers=admin_headers,
        json={
            "e164": e164,
            "provider": "telnyx",
            "label": "Pool Test Number",
            "locality": "Austin",
            "region": "TX",
        },
    )
    assert prov_resp.status_code == 201
    number_id = prov_resp.json()["id"]

    # Attach to tenant
    attach_resp = client.post(
        f"/api/v1/numbers/{number_id}/attach",
        headers=admin_headers,
        json={"tenant_id": tenant_id, "label": "Attached Secondary Line"},
    )
    assert attach_resp.status_code == 200
    attached = attach_resp.json()
    assert attached["status"] == "active"
    assert attached["tenant_id"] == tenant_id
    assert attached["label"] == "Attached Secondary Line"

    # Tenant can now see the number
    tenant_numbers = client.get("/api/v1/numbers", headers=tenant_headers).json()
    assert any(n["id"] == number_id for n in tenant_numbers)

    # Detach from tenant back to pool
    detach_resp = client.post(
        f"/api/v1/numbers/{number_id}/detach?release_to_pool=true",
        headers=admin_headers,
    )
    assert detach_resp.status_code == 200
    detached = detach_resp.json()
    assert detached["status"] == "pool"
    assert detached["tenant_id"] is None

    # Tenant no longer sees the number
    tenant_numbers_after = client.get("/api/v1/numbers", headers=tenant_headers).json()
    assert not any(n["id"] == number_id for n in tenant_numbers_after)


def test_sip_trunk_telemetry_and_dispatch_sync() -> None:
    """Verify SIP trunk health telemetry and dispatch rule synchronization."""
    admin_login = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Telemetry inspection
    trunk_resp = client.get("/api/v1/numbers/trunks", headers=admin_headers)
    assert trunk_resp.status_code == 200
    telemetry = trunk_resp.json()

    assert telemetry["inbound_trunk_id"] == settings.LIVEKIT_SIP_INBOUND_TRUNK_ID
    assert telemetry["dispatch_rule_name"] == "all-tenants-inbound"
    assert telemetry["agent_name"] == "receptionist"
    assert telemetry["primary_carrier"]["mos_score"] >= 4.0
    assert telemetry["primary_carrier"]["status"] == "connected"
    assert telemetry["total_bound_numbers"] >= 1

    # 2. Trigger dispatch sync as Admin
    sync_resp = client.post("/api/v1/numbers/trunks/sync", headers=admin_headers)
    assert sync_resp.status_code == 200
    sync_data = sync_resp.json()
    assert sync_data["synced"] is True
    assert sync_data["dispatch_rule"] == "all-tenants-inbound"
    assert sync_data["total_numbers_bound"] >= 1

    # 3. Non-admin cannot trigger dispatch sync
    suffix = uuid.uuid4().hex[:6]
    reg_user = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Regular Tenant {suffix}",
            "owner_name": "Regular User",
            "email": f"user_{suffix}@tenant.com",
            "password": "Password123!",
        },
    )
    user_token = reg_user.json()["access_token"]
    forbidden_resp = client.post(
        "/api/v1/numbers/trunks/sync",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert forbidden_resp.status_code == 403
