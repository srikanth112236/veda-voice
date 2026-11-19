"""Tests verifying that onboarding automatically creates and syncs a functioning LiveKit Agent."""

import json
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from agent.config import load_tenants_registry, resolve_tenant
from api.app.main import app

client = TestClient(app)


def test_onboarding_auto_creates_livekit_agent_config(tmp_path: Path) -> None:
    """Verify that completing onboarding automatically creates a functioning LiveKit Agent configuration."""
    unique_suffix = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"livekit_owner_{unique_suffix}@example.com"

    register_payload = {
        "business_name": f"LiveKit Air & Heat {unique_suffix}",
        "owner_name": "LiveKit Client",
        "email": email,
        "password": "Password123!",
        "timezone": "America/Chicago",
        "hours": "Mon-Fri 7am-7pm",
        "niche": "hvac",
        "phone_number": test_number,
        "voice_id": "Edward",
        "agent_name": "Edward",
        "greeting": f"Thanks for calling LiveKit Air & Heat {unique_suffix}. How may I help you?",
        "tone": "warm",
        "recording_disclosure": True,
        "pricing_policy": "diagnostic_fee_only",
        "diagnostic_fee": "$99.00",
        "services": ["AC Repair", "Furnace Installation"],
        "emergency_advice": "Please turn off your thermostat and call our emergency line.",
        "emergency_keywords": ["gas smell", "furnace smoke", "freon leak"],
        "faq": [
            {"question": "Do you offer financing?", "answer": "Yes, with 0% APR for 12 months."}
        ],
    }

    res = client.post("/api/v1/auth/register", json=register_payload)
    assert res.status_code == 200
    tenant_id = res.json()["user"]["tenant_id"]

    # 1. Verify JSON file was auto-generated in data/tenants/{tenant_id}.json
    tenant_file = Path("data/tenants") / f"{tenant_id}.json"
    assert tenant_file.exists(), f"Expected LiveKit agent config file {tenant_file} to exist"

    with open(tenant_file, encoding="utf-8") as f:
        config_data = json.load(f)

    assert config_data["tenant_id"] == tenant_id
    assert config_data["voice_id"] == "Edward"
    assert config_data["agent_name"] == "Edward"
    assert test_number in config_data["numbers"]
    assert "AC Repair" in config_data["services"]
    assert "gas smell" in config_data["emergency"]["keywords"]

    # 2. Verify LiveKit Agent registry resolves this number directly
    registry = load_tenants_registry()
    assert test_number in registry
    resolved = registry[test_number]
    assert resolved.tenant_id == tenant_id
    assert resolved.business == f"LiveKit Air & Heat {unique_suffix}"
    assert resolved.voice_id == "Edward"


def test_portal_profile_update_syncs_livekit_agent_config() -> None:
    """Verify that updating receptionist settings in client portal immediately syncs LiveKit Agent."""
    unique_suffix = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"sync_portal_{unique_suffix}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Sync Dental {unique_suffix}",
            "owner_name": "Dental Client",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
            "voice_id": "Alex",
            "agent_name": "Alex",
        },
    )
    assert reg_res.status_code == 200
    token = reg_res.json()["access_token"]
    tenant_id = reg_res.json()["user"]["tenant_id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Update profile to new voice "Ashley" and new agent name "Sarah"
    update_res = client.put(
        "/api/v1/portal/profile",
        headers=headers,
        json={
            "agent_name": "Sarah",
            "voice_id": "Ashley",
            "tone": "warm",
            "greeting": "Welcome to Sync Dental. Sarah speaking.",
            "emergency_advice": "For severe swelling, head to the nearest urgent care immediately.",
        },
    )
    assert update_res.status_code == 200

    # Verify LiveKit config file was updated
    tenant_file = Path("data/tenants") / f"{tenant_id}.json"
    with open(tenant_file, encoding="utf-8") as f:
        updated_data = json.load(f)

    assert updated_data["agent_name"] == "Sarah"
    assert updated_data["voice_id"] == "Ashley"
    assert updated_data["greeting"] == "Welcome to Sync Dental. Sarah speaking."


def test_dynamic_api_resolution_for_livekit_worker() -> None:
    """Verify that LiveKit worker resolves dialed numbers via the internal API in real-time."""
    unique_suffix = uuid.uuid4().hex[:6]
    test_number = f"+1512{uuid.uuid4().int % 9000000 + 1000000}"
    email = f"dynamic_api_{unique_suffix}@example.com"

    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": f"Dynamic Auto {unique_suffix}",
            "owner_name": "Auto Client",
            "email": email,
            "password": "Password123!",
            "phone_number": test_number,
            "voice_id": "Dennis",
            "agent_name": "Dennis",
        },
    )
    assert reg_res.status_code == 200
    tenant_id = reg_res.json()["user"]["tenant_id"]

    # Delete the disk file to test pure dynamic fallback
    tenant_file = Path("data/tenants") / f"{tenant_id}.json"
    if tenant_file.exists():
        tenant_file.unlink()

    # Now call resolve_tenant with an empty registry - it must query internal API and succeed!
    resolved = resolve_tenant(test_number, registry={})
    assert resolved.tenant_id == tenant_id
    assert resolved.business == f"Dynamic Auto {unique_suffix}"
    assert resolved.voice_id == "Dennis"
    assert resolved.agent_name == "Dennis"


def test_livekit_webhook_lifecycle_and_call_reconciliation() -> None:
    """Verify that LiveKit webhook room_started and room_finished events record and reconcile calls."""
    room_id = f"test-room-{uuid.uuid4().hex[:8]}"

    # 1. room_started event
    start_payload = {
        "event": "room_started",
        "room": {
            "name": room_id,
            "sid": f"RM_{uuid.uuid4().hex[:12]}",
        },
        "participant": {
            "identity": "caller-1",
            "attributes": {
                "caller_number": "+15125550199",
                "dialed_number": "+18005550100",
            },
        },
    }

    start_res = client.post(
        "/api/v1/internal/livekit/webhook",
        json=start_payload,
    )
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "ok"
    assert start_res.json()["call_id"] == room_id

    # 2. room_finished event
    finish_payload = {
        "event": "room_finished",
        "room": {
            "name": room_id,
            "sid": start_payload["room"]["sid"],
        },
    }

    finish_res = client.post(
        "/api/v1/internal/livekit/webhook",
        json=finish_payload,
    )
    assert finish_res.status_code == 200
    assert finish_res.json()["status"] == "ok"
    assert finish_res.json()["call_id"] == room_id
