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
