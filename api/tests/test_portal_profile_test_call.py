"""Unit tests for portal agent profile test call endpoint and compliance integration."""

import uuid

from fastapi.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_agent_profile_test_call() -> None:
    """Verify tenant can trigger an automated test call through the compliance gate."""
    unique_email = f"owner_{uuid.uuid4().hex[:8]}@testpractice.com"
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Sarah Family Clinic",
            "owner_name": "Dr. Sarah Test",
            "email": unique_email,
            "password": "Password123!",
            "timezone": "America/Chicago",
            "niche": "dental",
        },
    )
    assert reg_resp.status_code == 200
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Trigger test call to valid US number (+1 512 555 0199)
    resp = client.post(
        "/api/v1/portal/profile/test-call",
        headers=headers,
        json={"phone_number": "+15125550199"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "compliance_passed" in data
    assert "phone_dialed" in data
    assert data["phone_dialed"] == "+15125550199"

    # 2. Trigger test call with non-NANP country (e.g. UK +44) to verify compliance rejection
    resp_uk = client.post(
        "/api/v1/portal/profile/test-call",
        headers=headers,
        json={"phone_number": "+447911123456"},
    )
    assert resp_uk.status_code == 200
    data_uk = resp_uk.json()
    assert data_uk["status"] == "blocked_compliance"
    assert data_uk["compliance_passed"] is False
    assert data_uk["reason"] == "unsupported_region"
