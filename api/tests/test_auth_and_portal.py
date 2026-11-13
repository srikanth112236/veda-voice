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
