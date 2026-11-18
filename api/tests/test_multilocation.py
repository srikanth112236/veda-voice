"""Tests for Milestone M11: Multi-Location Tenant Architecture (FR-LOC-1 to 6)."""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.location import Location
from api.app.models.tenant import PhoneNumber, Tenant
from api.app.models.user import User
from api.app.services.locations import (
    matches_location_territory,
    resolve_location_for_caller,
    user_has_location_access,
)

client = TestClient(app)


def test_territory_matching_rules() -> None:
    """Verify territory zip code pattern matching."""
    # Exact match
    assert matches_location_territory("78701", ["78701", "78702"]) is True
    assert matches_location_territory("78704", ["78701", "78702"]) is False

    # Wildcard prefix
    assert matches_location_territory("78759", ["787*"]) is True
    assert matches_location_territory("78613", ["787*"]) is False

    # 3-digit prefix
    assert matches_location_territory("78758", ["787"]) is True

    # Universal coverage (empty array)
    assert matches_location_territory("90210", []) is True
    assert matches_location_territory("", []) is False


def test_location_crud_and_primary_flag() -> None:
    """Verify creating, listing, updating, and deleting locations."""
    db: Session = SessionLocal()
    tenant_id = f"loc-test-{uuid.uuid4().hex[:8]}"
    user_id = str(uuid.uuid4())

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Apex Comfort Multi-Branch",
            timezone="America/Chicago",
            status="active",
        )
        user = User(
            id=user_id,
            email=f"owner-{uuid.uuid4().hex[:6]}@apexmulti.com",
            hashed_password="pw",
            role="tenant_owner",
            tenant_id=tenant_id,
            full_name="Branch Owner",
            is_active=True,
        )
        db.add_all([tenant, user])
        db.commit()

        token = create_access_token({"sub": user_id})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create Location A (Austin North)
        res_a = client.post(
            "/api/v1/portal/locations",
            json={
                "name": "Austin North Branch",
                "code": "AUSTIN_NORTH",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78759",
                "service_territory_zips": ["78759", "78758", "78727"],
                "hours": "Mon-Fri 7am-7pm",
                "transfer_number": "+15125550188",
                "is_primary": True,
            },
            headers=headers,
        )
        assert res_a.status_code == 201
        loc_a_data = res_a.json()
        assert loc_a_data["code"] == "AUSTIN_NORTH"
        assert loc_a_data["is_primary"] is True
        loc_a_id = loc_a_data["id"]

        # 2. Create Location B (Austin South)
        res_b = client.post(
            "/api/v1/portal/locations",
            json={
                "name": "Austin South Branch",
                "code": "AUSTIN_SOUTH",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78704",
                "service_territory_zips": ["78704", "78745"],
                "hours": "Mon-Fri 8am-5pm",
                "transfer_number": "+15125550199",
                "is_primary": False,
            },
            headers=headers,
        )
        assert res_b.status_code == 201
        loc_b_id = res_b.json()["id"]

        # 3. List Locations
        res_list = client.get("/api/v1/portal/locations", headers=headers)
        assert res_list.status_code == 200
        items = res_list.json()
        assert len(items) == 2
        # Primary should be ordered first
        assert items[0]["code"] == "AUSTIN_NORTH"

        # 4. Update Location B to be primary -> demotes Location A
        res_update = client.put(
            f"/api/v1/portal/locations/{loc_b_id}",
            json={
                "name": "Austin South Central Hub",
                "code": "AUSTIN_SOUTH",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78704",
                "service_territory_zips": ["78704", "78745", "78701"],
                "hours": "Mon-Fri 8am-6pm",
                "transfer_number": "+15125550199",
                "is_primary": True,
            },
            headers=headers,
        )
        assert res_update.status_code == 200
        assert res_update.json()["is_primary"] is True

        # Verify Location A was demoted
        res_a_fresh = client.get(f"/api/v1/portal/locations/{loc_a_id}", headers=headers)
        assert res_a_fresh.status_code == 200
        assert res_a_fresh.json()["is_primary"] is False

        # 5. Delete Location A
        res_del = client.delete(f"/api/v1/portal/locations/{loc_a_id}", headers=headers)
        assert res_del.status_code == 200
        assert res_del.json()["success"] is True
    finally:
        db.close()


def test_intelligent_location_routing() -> None:
    """Verify resolving incoming calls by dialed number, caller postal code, and fallback."""
    db: Session = SessionLocal()
    tenant_id = f"loc-route-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id,
            name="Texas Regional HVAC",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-5pm",
            status="active",
        )
        db.add(tenant)
        db.flush()

        loc_dallas = Location(
            tenant_id=tenant_id,
            name="Dallas Fort Worth Hub",
            code="DFW_HUB",
            city="Dallas",
            state="TX",
            postal_code="75201",
            timezone="America/Chicago",
            hours="Mon-Fri 7am-6pm",
            service_territory_zips=["752*", "750*"],
            transfer_number="+12145550111",
            is_primary=False,
            is_active=True,
        )
        loc_austin = Location(
            tenant_id=tenant_id,
            name="Austin Central HQ",
            code="ATX_HQ",
            city="Austin",
            state="TX",
            postal_code="78701",
            timezone="America/Chicago",
            hours="Mon-Fri 8am-8pm",
            service_territory_zips=["787*"],
            transfer_number="+15125550222",
            is_primary=True,
            is_active=True,
        )
        db.add_all([loc_dallas, loc_austin])
        db.flush()

        # Specific phone number assigned to Dallas
        dallas_phone_e164 = f"+1214{uuid.uuid4().int % 9000000 + 1000000}"
        dallas_phone = PhoneNumber(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            location_id=loc_dallas.id,
            e164=dallas_phone_e164,
            status="active",
        )
        db.add(dallas_phone)
        db.commit()

        # Case 1: Route by dialed number assigned to Dallas location
        routed_by_number = resolve_location_for_caller(
            tenant_id=tenant_id,
            db=db,
            dialed_number=dallas_phone_e164,
        )
        assert routed_by_number is not None
        assert routed_by_number.code == "DFW_HUB"

        # Case 2: Route by caller postal code matching Austin territory
        routed_by_zip = resolve_location_for_caller(
            tenant_id=tenant_id,
            db=db,
            postal_code="78759",
        )
        assert routed_by_zip is not None
        assert routed_by_zip.code == "ATX_HQ"

        # Case 3: Caller in unknown zip code falls back to Primary Location
        routed_fallback = resolve_location_for_caller(
            tenant_id=tenant_id,
            db=db,
            postal_code="90210",
        )
        assert routed_fallback is not None
        assert routed_fallback.code == "ATX_HQ"
    finally:
        db.close()


def test_user_location_permission_scoping() -> None:
    """Verify that staff assigned to specific location_ids are scoped properly."""
    loc_id_1 = str(uuid.uuid4())
    loc_id_2 = str(uuid.uuid4())

    # Owner has universal access
    owner_user = User(
        id=str(uuid.uuid4()),
        email="owner@branch.com",
        hashed_password="pw",
        role="tenant_owner",
        location_ids=[],
    )
    assert user_has_location_access(owner_user, loc_id_1) is True
    assert user_has_location_access(owner_user, loc_id_2) is True

    # Staff restricted to Location 1
    staff_user = User(
        id=str(uuid.uuid4()),
        email="staff1@branch.com",
        hashed_password="pw",
        role="tenant_staff",
        location_ids=[loc_id_1],
    )
    assert user_has_location_access(staff_user, loc_id_1) is True
    assert user_has_location_access(staff_user, loc_id_2) is False
