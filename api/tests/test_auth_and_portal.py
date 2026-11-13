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
