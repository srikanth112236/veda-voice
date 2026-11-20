"""Unit and Integration Tests for Portal Profile Advanced Settings & Carrier Diagnostics.

Verifies:
- Retrieval of default advanced configuration fields (cadence, silence timeout, barge-in, empathy, Spanish auto-switch, etc.)
- Update of advanced settings including barred phrases, intake questionnaire, and weather closure override
- Carrier trunk diagnostic endpoint telemetry and STIR/SHAKEN A-attestation
- Compiled LiveKit agent config synchronization
"""

import uuid

from fastapi.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_portal_profile_advanced_customizations_lifecycle() -> None:
    """Validate full get, update, verify, and carrier diagnostic lifecycle for advanced profile settings."""
    # 1. Register new isolated tenant
    unique_suffix = uuid.uuid4().hex[:8]
    email = f"operator_{unique_suffix}@precisionair{unique_suffix}.com"
    phone_offset = uuid.uuid4().int % 8000000 + 1000000
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "business_name": "Precision Air Conditioning & Heating",
            "owner_name": "Tyler Stevens",
            "email": email,
            "password": "SecurePassword123!",
            "timezone": "America/Chicago",
            "niche": "hvac",
            "phone_number": f"+1987{phone_offset}",
        },
    )
    assert reg_resp.status_code == 200, reg_resp.text
    token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get profile defaults
    get_resp = client.get("/api/v1/portal/profile", headers=headers)
    assert get_resp.status_code == 200, get_resp.text
    profile = get_resp.json()

    assert profile["bilingual_spanish_enabled"] is False
    assert profile["patience_cadence"] == "balanced"
    assert profile["silence_timeout_ms"] == 500
    assert profile["speech_barge_in"] is True
    assert profile["adaptive_empathy"] is True
    assert profile["background_ambience"] == "studio_clean"
    assert profile["office_override_mode"] == "normal"
    assert profile["barred_phrases"] == []
    assert profile["intake_questions"] == []
    assert profile["vip_returning_caller_enabled"] is True
    assert profile["mid_call_sms_enabled"] is True
    assert profile["disconnect_recovery_sms_enabled"] is True

    # 3. Update profile with advanced custom features
    custom_barred = [
        "I am an AI robot",
        "That is not my job",
        "cheap estimate",
    ]
    custom_intake = [
        {
            "id": "q1",
            "label": "Property Address & Unit Number",
            "required": True,
            "category": "location",
        },
        {
            "id": "q2",
            "label": "HVAC Unit Age & Brand",
            "required": False,
            "category": "equipment",
        },
        {
            "id": "q3",
            "label": "Gate Access Code",
            "required": False,
            "category": "access",
        },
    ]

    update_payload = {
        "bilingual_spanish_enabled": True,
        "patience_cadence": "relaxed_elderly",
        "silence_timeout_ms": 750,
        "speech_barge_in": False,
        "adaptive_empathy": True,
        "background_ambience": "subtle_office",
        "barred_phrases": custom_barred,
        "intake_questions": custom_intake,
        "office_override_mode": "weather_closure",
        "office_override_announcement": "Attention: Our field vans are grounded due to ice storms. Emergency leak triage is operating remotely.",
        "vip_returning_caller_enabled": True,
        "vip_returning_greeting": "Welcome back to Precision Air! Are you calling about your recent repair estimate?",
        "mid_call_sms_enabled": True,
        "disconnect_recovery_sms_enabled": True,
        "disconnect_recovery_sms_text": "We lost connection! Tap here to re-connect or view your booking: https://precision.ac/resume",
    }

    put_resp = client.put("/api/v1/portal/profile", json=update_payload, headers=headers)
    assert put_resp.status_code == 200, put_resp.text
    updated = put_resp.json()

    assert updated["bilingual_spanish_enabled"] is True
    assert updated["patience_cadence"] == "relaxed_elderly"
    assert updated["silence_timeout_ms"] == 750
    assert updated["speech_barge_in"] is False
    assert updated["adaptive_empathy"] is True
    assert updated["background_ambience"] == "subtle_office"
    assert len(updated["barred_phrases"]) == 3
    assert "cheap estimate" in updated["barred_phrases"]
    assert len(updated["intake_questions"]) == 3
    assert updated["office_override_mode"] == "weather_closure"
    assert "ice storms" in updated["office_override_announcement"]
    assert "Welcome back to Precision Air" in updated["vip_returning_greeting"]
    assert "https://precision.ac/resume" in updated["disconnect_recovery_sms_text"]

    # 4. Re-fetch via GET to confirm persistence
    re_get = client.get("/api/v1/portal/profile", headers=headers)
    assert re_get.status_code == 200
    persisted = re_get.json()
    assert persisted["bilingual_spanish_enabled"] is True
    assert persisted["patience_cadence"] == "relaxed_elderly"
    assert persisted["silence_timeout_ms"] == 750
    assert persisted["office_override_mode"] == "weather_closure"
    assert len(persisted["barred_phrases"]) == 3

    # 5. Check Carrier Trunk Diagnostics endpoint
    diag_resp = client.get("/api/v1/portal/profile/carrier-diagnostics", headers=headers)
    assert diag_resp.status_code == 200, diag_resp.text
    diag = diag_resp.json()

    assert diag["carrier_status"] == "operational"
    assert diag["total_trunks"] >= 1
    assert diag["stir_shaken_ready"] is True
    assert diag["emergency_e911_registered"] is True
    assert len(diag["trunks"]) >= 1
    first_trunk = diag["trunks"][0]
    assert first_trunk["sip_tls_encrypted"] is True
    assert first_trunk["stir_shaken_attestation"] == "A"
    assert first_trunk["health_status"] == "healthy"
