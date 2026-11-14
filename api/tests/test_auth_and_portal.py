"""Unit tests for Auth, Platform Admin, Tenant Portal, and Internal routing."""

import uuid

from fastapi.testclient import TestClient

from api.app.core.config import settings
from api.app.main import app

client = TestClient(app)


def test_health_check() -> None:
    """Verify system health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_platform_admin_login() -> None:
    """Verify platform admin authentication and role."""
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "platform_admin"
    assert data["user"]["email"] == settings.PLATFORM_ADMIN_EMAIL.lower()


def test_platform_admin_stats_access() -> None:
    """Verify platform admin can access global stats."""
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    stats_resp = client.get("/api/v1/admin/stats", headers=headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert "total_tenants" in stats
    assert "total_calls" in stats
    assert stats["total_tenants"] >= 1


def test_tenant_registration_and_portal_access() -> None:
    """Verify public client self-service onboarding and dashboard access."""
    unique_email = f"owner_{uuid.uuid4().hex[:8]}@smilecaredental.com"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Smile Care Dental",
            "owner_name": "Dr. Sarah Jenkins",
            "email": unique_email,
            "password": "Password123!",
            "timezone": "America/Los_Angeles",
            "niche": "dental",
        },
    )
    assert reg_resp.status_code == 200
    data = reg_resp.json()
    assert "access_token" in data
    assert data["user"]["role"] == "tenant_owner"
    assert data["user"]["tenant_name"] == "Smile Care Dental"

    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Tenant can view their dashboard
    dash_resp = client.get("/api/v1/portal/dashboard", headers=headers)
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()
    assert dash_data["tenant_name"] == "Smile Care Dental"

    # 2. Tenant CANNOT access platform admin endpoints
    forbidden_resp = client.get("/api/v1/admin/stats", headers=headers)
    assert forbidden_resp.status_code == 403


def test_internal_tenant_resolution_by_number() -> None:
    """Verify voice agent can resolve tenant by dialed E.164 phone number."""
    response = client.get("/api/v1/internal/tenants/by-number/+18005550199")
    assert response.status_code == 200
    data = response.json()
    assert data["business_name"] == "Apex Plumbing & Heating"
    assert "call_token" in data
    assert len(data["services"]) > 0
    assert "burst pipe" in data["emergency_keywords"]


def test_agent_profile_module1_brand_and_acoustic_tuning() -> None:
    """Verify Module 1 brand persona, acoustic voice, and phonetic glossary in profile API."""
    # 1. Register tenant
    unique_email = f"owner_{uuid.uuid4().hex[:8]}@coolhvac.com"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Cool Air Pros",
            "owner_name": "Dave Miller",
            "email": unique_email,
            "password": "Password123!",
            "timezone": "America/Chicago",
            "niche": "hvac",
        },
    )
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get initial profile
    prof_resp = client.get("/api/v1/portal/profile", headers=headers)
    assert prof_resp.status_code == 200
    prof = prof_resp.json()
    assert prof["voice_id"] == "Alex"
    assert prof["recording_disclosure"] is True
    assert isinstance(prof["phonetic_glossary"], list)

    # 3. Update profile with Module 1 acoustic tuning & phonetic glossary
    update_payload = {
        "agent_name": "Ashley",
        "tone": "warm",
        "voice_id": "Ashley",
        "recording_disclosure": True,
        "phonetic_glossary": [
            {"term": "HVAC", "spoken_as": "H-V-A-C", "note": "Acronym"},
            {"term": "Freon", "spoken_as": "free-on", "note": "Refrigerant brand"},
        ],
        "greeting": "Thanks for calling Cool Air Pros. This call is recorded. How can I keep you cool today?",
    }
    put_resp = client.put("/api/v1/portal/profile", json=update_payload, headers=headers)
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["agent_name"] == "Ashley"
    assert updated["tone"] == "warm"
    assert updated["voice_id"] == "Ashley"
    assert len(updated["phonetic_glossary"]) == 2
    assert updated["phonetic_glossary"][0]["term"] == "HVAC"
    assert updated["phonetic_glossary"][0]["spoken_as"] == "H-V-A-C"


def test_agent_profile_modules_3_4_5_enterprise_guardrails() -> None:
    """Test Module 3 (Pricing), Module 4 (Emergency), and Module 5 (Hours & Geofence)."""
    unique_email = f"owner-{uuid.uuid4().hex[:8]}@apexplumbing.com"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Lone Star Emergency Plumbing",
            "owner_name": "Sarah Connor",
            "email": unique_email,
            "password": "Password123!",
            "timezone": "America/Chicago",
            "niche": "plumbing",
        },
    )
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Update profile with all Module 3, 4, 5 fields
    update_payload = {
        # Module 3
        "pricing_mode": "listed",
        "price_items": [
            {
                "service": "Diagnostic Trip Fee",
                "amount": "$89",
                "type": "fixed",
                "conditions": "Credited toward repair",
            },
            {
                "service": "Standard Drain Snaking",
                "amount": "$150 - $250",
                "type": "range",
                "conditions": "Up to 50ft line access",
            },
        ],
        # Module 4
        "emergency_mode": "live_transfer",
        "emergency_keywords": ["burst pipe", "flooding", "gas smell", "sewage backup"],
        "approved_safety_script": "If safe, turn off your main water valve immediately.",
        "transfer_number": "+18005550199",
        # Module 5
        "timezone": "America/Chicago",
        "hours": "Monday through Friday 8:00 AM to 5:00 PM Central, closed weekends.",
        "service_area": "Greater Austin within 25 miles",
        "service_cities": ["Austin", "Round Rock", "Cedar Park", "Georgetown"],
        "after_hours_policy": "emergency_only",
        "out_of_area_policy": "polite_decline",
    }

    put_resp = client.put("/api/v1/portal/profile", json=update_payload, headers=headers)
    assert put_resp.status_code == 200
    updated = put_resp.json()

    # Verify Module 3
    assert updated["pricing_mode"] == "listed"
    assert len(updated["price_items"]) == 2
    assert updated["price_items"][0]["amount"] == "$89"

    # Verify Module 4
    assert updated["emergency_mode"] == "live_transfer"
    assert "burst pipe" in updated["emergency_keywords"]
    assert "main water valve" in updated["approved_safety_script"]
    assert updated["transfer_number"] == "+18005550199"

    # Verify Module 5
    assert updated["timezone"] == "America/Chicago"
    assert "Monday through Friday" in updated["hours"]
    assert updated["service_area"] == "Greater Austin within 25 miles"
    assert "Round Rock" in updated["service_cities"]
    assert updated["after_hours_policy"] == "emergency_only"
    assert updated["out_of_area_policy"] == "polite_decline"

    # Verify GET persistence
    get_resp = client.get("/api/v1/portal/profile", headers=headers)
    assert get_resp.status_code == 200
    persisted = get_resp.json()
    assert persisted["pricing_mode"] == "listed"
    assert persisted["emergency_mode"] == "live_transfer"
    assert persisted["after_hours_policy"] == "emergency_only"
    assert len(persisted["service_cities"]) == 4


def test_platform_admin_command_center_telemetry() -> None:
    """Verify platform admin command center concurrency, carrier health, and CoGS telemetry."""
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test /admin/stats
    stats_resp = client.get("/api/v1/admin/stats", headers=headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()

    assert stats["global_max_concurrent"] == 40
    assert stats["global_max_outbound"] == 10
    assert "inbound_saturation_pct" in stats
    assert "outbound_saturation_pct" in stats

    # Carrier trunk health
    carrier = stats["carrier_health"]
    assert carrier["status"] == "connected"
    assert carrier["latency_ms"] == 38.0
    assert carrier["mos_score"] == 4.41
    assert carrier["cps_limit"] == 10.0

    # CoGS & margin metrics
    cost = stats["cost_metrics"]
    assert cost["total_cogs_per_min"] == 0.0225
    assert cost["tenant_subscription_fee_usd"] == 499.0
    assert cost["gross_margin_pct"] >= 80.0

    # 2. Test /admin/tenants
    tenants_resp = client.get("/api/v1/admin/tenants", headers=headers)
    assert tenants_resp.status_code == 200
    tenants = tenants_resp.json()
    assert len(tenants) >= 1
    first = tenants[0]
    assert first["max_concurrent_inbound"] >= 1
    assert first["max_concurrent_outbound"] >= 1
    assert first["monthly_minute_quota"] == 500
    assert first["health_status"] == "operational"


def test_admin_number_search_and_voice_sync() -> None:
    """Verify carrier number search, agency pool toggle, and LiveKit voice sync."""
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "email": settings.PLATFORM_ADMIN_EMAIL,
            "password": settings.PLATFORM_ADMIN_PASSWORD,
        },
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Search carrier numbers by area code (Option B)
    search_resp = client.get(
        "/api/v1/admin/numbers/search?area_code=512&mode=carrier_search", headers=headers
    )
    assert search_resp.status_code == 200
    numbers = search_resp.json()
    assert len(numbers) >= 1
    assert any("512" in n["e164"] for n in numbers)
    assert numbers[0]["source"] == "carrier_api"

    # 2. Search agency pre-purchased pool (Option A)
    pool_resp = client.get("/api/v1/admin/numbers/search?mode=agency_pool", headers=headers)
    assert pool_resp.status_code == 200
    pool_numbers = pool_resp.json()
    assert len(pool_numbers) >= 1
    assert pool_numbers[0]["source"] == "agency_pool"

    # 3. Create tenant with custom voice and verify LiveKit voice sync
    unique_suffix = uuid.uuid4().hex[:6]
    test_e164 = f"+1512777{unique_suffix[:4]}"
    create_resp = client.post(
        "/api/v1/admin/tenants",
        headers=headers,
        json={
            "name": f"Acoustic Dental {unique_suffix}",
            "owner_name": "Dr. Sarah Adams",
            "owner_email": f"sarah_{unique_suffix}@acousticdental.com",
            "owner_password": "Password123!",
            "timezone": "America/Chicago",
            "hours": "Mon-Fri 8am-5pm",
            "phone_number": test_e164,
            "voice_id": "Ashley",
            "recording_disclosure": True,
            "tone": "warm",
            "services": ["Teeth Cleaning", "Emergency Toothache"],
        },
    )
    assert create_resp.status_code == 200

    # 4. Verify LiveKit Dynamic Sync via /internal/tenants/by-number/
    sync_resp = client.get(f"/api/v1/internal/tenants/by-number/{test_e164}")
    assert sync_resp.status_code == 200
    synced = sync_resp.json()
    assert synced["voice_id"] == "Ashley"
    assert synced["tts_model"] == "inworld/inworld-tts-1"
    assert synced["tone"] == "warm"
    assert synced["recording_disclosure"] is True
