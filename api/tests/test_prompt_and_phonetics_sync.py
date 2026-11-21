"""Integration tests for Prompt Persona, Phonetic Glossary, and LiveKit Sync."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import AgentProfile, Tenant
from api.app.models.user import User

client = TestClient(app)


def test_agent_profile_phonetics_and_prompt_sync() -> None:
    """Verify tenant can fetch and update phonetic glossary, greeting, and prompt persona."""
    db: Session = SessionLocal()
    tenant_id = f"prompt-test-{uuid.uuid4().hex[:8]}"
    user_id = f"usr-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id, name="Prompt Test Plumbing", timezone="America/Chicago", status="active"
        )
        db.add(tenant)

        profile = AgentProfile(
            tenant_id=tenant_id,
            greeting="Hello and welcome to Prompt Test Plumbing.",
            tone="Professional",
            phonetic_glossary=[],
        )
        db.add(profile)

        user = User(
            id=user_id,
            email=f"user_{user_id}@test.com",
            hashed_password="hash",
            full_name="Prompt User",
            role="tenant_owner",
            tenant_id=tenant_id,
            is_active=True,
        )
        db.add(user)
        db.commit()

        token = create_access_token(
            {"sub": user.id, "role": "tenant_owner", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Fetch current profile
        res = client.get("/api/v1/portal/profile", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "phonetic_glossary" in data
        assert "greeting" in data

        # 2. Update phonetic glossary and greeting
        updated_glossary = [
            {
                "term": "HVAC",
                "spoken_as": "H-V-A-C",
                "note": "Heating Ventilation Air Conditioning",
            },
            {"term": "VedaVoice", "spoken_as": "VAY-duh Voice", "note": "Brand pronunciation"},
            {"term": "PEX", "spoken_as": "Pecks", "note": "Cross-linked polyethylene piping"},
        ]
        new_greeting = (
            "Thank you for calling Apex Plumbing. This is Alex, your virtual receptionist. "
            "How can I help you today?"
        )

        update_payload = {
            "greeting": new_greeting,
            "agent_name": "Alex",
            "tone": "Warm & Professional",
            "phonetic_glossary": updated_glossary,
        }

        put_res = client.put(
            "/api/v1/portal/profile",
            json=update_payload,
            headers=headers,
        )
        assert put_res.status_code == 200
        updated_data = put_res.json()
        assert updated_data["greeting"] == new_greeting
        assert updated_data["agent_name"] == "Alex"
        assert len(updated_data["phonetic_glossary"]) == 3
        assert updated_data["phonetic_glossary"][0]["term"] == "HVAC"
        assert updated_data["phonetic_glossary"][1]["spoken_as"] == "VAY-duh Voice"

        # 3. Verify persistence in DB
        db.expire_all()
        persisted_profile = db.query(AgentProfile).filter_by(tenant_id=tenant_id).first()
        assert persisted_profile is not None
        assert persisted_profile.greeting == new_greeting
        assert len(persisted_profile.phonetic_glossary) == 3
    finally:
        db.query(AgentProfile).filter_by(tenant_id=tenant_id).delete()
        db.query(User).filter_by(tenant_id=tenant_id).delete()
        db.query(Tenant).filter_by(id=tenant_id).delete()
        db.commit()
        db.close()
