"""Tests for Phase 4 per-location AI behavior overrides API."""

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.location import Location
from api.app.models.tenant import Tenant
from api.app.models.user import User

init_db()
client = TestClient(app)


@pytest.fixture
def loc_setup() -> Any:
    """Create a tenant, owner user, and branch location."""
    db = SessionLocal()
    try:
        suf = uuid.uuid4().hex[:6]
        t = Tenant(
            name=f"Metro Dental {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-17:00",
            status="active",
        )
        db.add(t)
        db.flush()

        u = User(
            tenant_id=t.id,
            email=f"metro_{suf}@example.com",
            full_name="Branch Admin",
            hashed_password="hashed",
            role="owner",
            is_active=True,
        )
        loc = Location(
            tenant_id=t.id,
            name="Austin North",
            code=f"AUSN_{suf.upper()}",
            address_line1="100 Main St",
            city="Austin",
            state="TX",
            postal_code="78701",
            is_primary=True,
            is_active=True,
        )
        db.add_all([u, loc])
        db.commit()

        tok = create_access_token({"sub": u.id, "tenant_id": t.id, "role": "owner"})
        yield {"loc_id": loc.id, "headers": {"Authorization": f"Bearer {tok}"}}
    finally:
        db.close()


def test_location_ai_overrides_patch_and_get(loc_setup: dict[str, Any]) -> None:
    """Verify PATCH and GET /api/v1/portal/locations/{id}/overrides persist AI overrides."""
    loc_id = loc_setup["loc_id"]
    payload = {
        "greeting_override": "Thanks for calling Austin North Dental!",
        "custom_instructions_override": "Mention free parking behind Building B.",
        "pricing_mode_override": "listed",
        "services_override": ["Emergency Toothache", "Teeth Whitening"],
    }
    patch_resp = client.patch(
        f"/api/v1/portal/locations/{loc_id}/overrides",
        json=payload,
        headers=loc_setup["headers"],
    )
    assert patch_resp.status_code == 200, patch_resp.text
    data = patch_resp.json()
    assert data["greeting_override"] == payload["greeting_override"]
    assert data["custom_instructions_override"] == payload["custom_instructions_override"]
    assert data["pricing_mode_override"] == "listed"
    assert data["services_override"] == payload["services_override"]

    get_resp = client.get(
        f"/api/v1/portal/locations/{loc_id}/overrides",
        headers=loc_setup["headers"],
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["greeting_override"] == payload["greeting_override"]
