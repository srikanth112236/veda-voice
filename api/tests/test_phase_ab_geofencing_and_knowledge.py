"""Tests for Phase A (Hyper-Local Knowledge & FAQ Overrides) and Phase B (Smart Geofencing v2).

Covers:
1. Schema verification for Location overrides and UnservedTerritoryLog.
2. Location Overrides API (GET/PATCH /portal/locations/{id}/overrides).
3. Location Geofence API (GET/PATCH /portal/locations/{id}/geofence).
4. Real-time smart geofence territory resolution (/internal/territory/resolve).
   - Exact postal code
   - Wildcard zip (787*)
   - Neighborhood name match
   - City name match
   - Out-of-area fallback with extended surcharge
   - Unserved territory demand logging
5. Hyper-local knowledge search (/internal/knowledge/search) with location FAQ overrides.
6. SLA benchmark: Territory resolution < 30ms.
"""

import time
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.location import Location, UnservedTerritoryLog
from api.app.models.tenant import Tenant
from api.app.models.user import User


@pytest.fixture
def client():
    return TestClient(app)


def test_schema_location_overrides_and_unserved_log():
    """Verify that Location has Phase A & B columns and UnservedTerritoryLog model works."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Test Geo Enterprise", status="active")
        db.add(tenant)
        db.flush()

        loc = Location(
            tenant_id=tenant_id,
            name="Domain Hub",
            code="ATX-DOM",
            postal_code="78758",
            service_territory_zips=["78758", "78759"],
            service_neighborhoods=["The Domain", "Arboretum"],
            service_cities=["Austin"],
            allows_out_of_area_dispatch=True,
            extended_dispatch_surcharge="$45",
            parking_directions="Park in Green Garage P2 off Esperanza St.",
            diagnostic_fee="$89 waived with approved repair",
            regional_license_number="TACLA009988C",
            faq_overrides=[
                {
                    "question": "Do you repair commercial chillers?",
                    "answer": "Yes, our certified techs service chillers up to 25 tons.",
                }
            ],
            custom_policies={"weekend_surcharge": "$50"},
            is_primary=True,
            is_active=True,
        )
        db.add(loc)
        db.commit()
        db.refresh(loc)

        assert loc.service_neighborhoods == ["The Domain", "Arboretum"]
        assert loc.parking_directions == "Park in Green Garage P2 off Esperanza St."
        assert loc.diagnostic_fee == "$89 waived with approved repair"
        assert loc.regional_license_number == "TACLA009988C"
        assert len(loc.faq_overrides) == 1
        assert loc.faq_overrides[0]["question"] == "Do you repair commercial chillers?"


def test_location_overrides_api(client: TestClient):
    """Test GET and PATCH endpoints for /portal/locations/{id}/overrides."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Override Clinic", status="active")
        user = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            email=f"owner_{tenant_id[:6]}@example.com",
            role="tenant_owner",
            hashed_password="test-hash",
            full_name="Override Owner",
        )
        loc = Location(
            tenant_id=tenant_id,
            name="Downtown Office",
            code="DTN",
            is_primary=True,
            is_active=True,
        )
        db.add_all([tenant, user, loc])
        db.commit()
        db.refresh(loc)

        token = create_access_token({"sub": user.id, "tenant_id": tenant_id, "role": user.role})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. GET initial overrides
        res_get = client.get(f"/api/v1/portal/locations/{loc.id}/overrides", headers=headers)
        assert res_get.status_code == 200
        data_get = res_get.json()
        assert data_get["parking_directions"] == ""

        # 2. PATCH overrides
        payload = {
            "parking_directions": "Underground parking entrance on 5th Ave.",
            "diagnostic_fee": "$95 flat inspection fee",
            "regional_license_number": "TX-MED-4421",
            "faq_overrides": [
                {
                    "question": "Are you wheelchair accessible?",
                    "answer": "Yes, elevator access is available from the parking ramp.",
                }
            ],
        }
        res_patch = client.patch(
            f"/api/v1/portal/locations/{loc.id}/overrides", json=payload, headers=headers
        )
        assert res_patch.status_code == 200
        data_patch = res_patch.json()
        assert data_patch["parking_directions"] == "Underground parking entrance on 5th Ave."
        assert data_patch["diagnostic_fee"] == "$95 flat inspection fee"
        assert data_patch["regional_license_number"] == "TX-MED-4421"
        assert len(data_patch["faq_overrides"]) == 1


def test_location_geofence_api(client: TestClient):
    """Test GET and PATCH endpoints for /portal/locations/{id}/geofence."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Geofence Plumbing", status="active")
        user = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            email=f"geo_{tenant_id[:6]}@example.com",
            role="tenant_owner",
            hashed_password="test-hash",
            full_name="Geo Owner",
        )
        loc = Location(
            tenant_id=tenant_id,
            name="North Service Hub",
            code="NSH",
            is_primary=True,
            is_active=True,
        )
        db.add_all([tenant, user, loc])
        db.commit()
        db.refresh(loc)

        token = create_access_token({"sub": user.id, "tenant_id": tenant_id, "role": user.role})
        headers = {"Authorization": f"Bearer {token}"}

        # PATCH geofence
        payload = {
            "service_territory_zips": ["78701", "78702", "787*"],
            "service_neighborhoods": ["Barton Hills", "Zilker", "Bouldin"],
            "service_cities": ["Austin", "Westlake"],
            "allows_out_of_area_dispatch": True,
            "extended_dispatch_surcharge": "$40",
        }
        res = client.patch(
            f"/api/v1/portal/locations/{loc.id}/geofence", json=payload, headers=headers
        )
        assert res.status_code == 200
        data = res.json()
        assert "787*" in data["service_territory_zips"]
        assert "Zilker" in data["service_neighborhoods"]
        assert "Westlake" in data["service_cities"]
        assert data["allows_out_of_area_dispatch"] is True
        assert data["extended_dispatch_surcharge"] == "$40"


def test_internal_territory_resolve_and_sla(client: TestClient):
    """Test smart geofencing resolution across zips, wildcards, neighborhoods, and border fallbacks."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Enterprise Dispatch", status="active")
        loc1 = Location(
            tenant_id=tenant_id,
            name="Central Austin",
            code="ATX-C",
            postal_code="78701",
            service_territory_zips=["78701", "78702", "78703"],
            service_neighborhoods=["Downtown", "Clarksville", "Rainey"],
            service_cities=["Austin"],
            diagnostic_fee="$79 diagnostic fee",
            is_primary=True,
            is_active=True,
            allows_out_of_area_dispatch=True,
            extended_dispatch_surcharge="$35",
        )
        loc2 = Location(
            tenant_id=tenant_id,
            name="North Austin Hub",
            code="ATX-N",
            postal_code="78758",
            service_territory_zips=["78758", "78759", "786*"],
            service_neighborhoods=["The Domain", "Arboretum", "Wells Branch"],
            service_cities=["Round Rock", "Pflugerville"],
            diagnostic_fee="$85 diagnostic fee",
            is_primary=False,
            is_active=True,
            allows_out_of_area_dispatch=False,
        )
        db.add_all([tenant, loc1, loc2])
        db.commit()

        call_token = create_access_token(
            {"sub": "livekit-agent", "role": "agent", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {call_token}"}

        # 1. Exact postal code match
        res_zip = client.post(
            "/api/v1/internal/territory/resolve", json={"query": "78701"}, headers=headers
        )
        assert res_zip.status_code == 200
        d_zip = res_zip.json()
        assert d_zip["serviced"] is True
        assert d_zip["is_out_of_area"] is False
        assert d_zip["location_code"] == "ATX-C"
        assert "$79" in d_zip["message"]

        # 2. Wildcard postal code match (786* in loc2)
        res_wildcard = client.post(
            "/api/v1/internal/territory/resolve", json={"query": "78660"}, headers=headers
        )
        assert res_wildcard.status_code == 200
        assert res_wildcard.json()["location_code"] == "ATX-N"

        # 3. Neighborhood match ("The Domain")
        t0 = time.perf_counter()
        res_hood = client.post(
            "/api/v1/internal/territory/resolve",
            json={"query": "I am over near The Domain"},
            headers=headers,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        assert res_hood.status_code == 200
        d_hood = res_hood.json()
        assert d_hood["serviced"] is True
        assert d_hood["location_code"] == "ATX-N"
        assert elapsed_ms < 30.0, f"Resolution exceeded 30ms SLA: took {elapsed_ms:.2f}ms"

        # 4. Out-of-area fallback (e.g. Buda 78610 without direct match, falls back to loc1 with surcharge)
        res_fallback = client.post(
            "/api/v1/internal/territory/resolve", json={"query": "Dallas TX 75201"}, headers=headers
        )
        assert res_fallback.status_code == 200
        d_fb = res_fallback.json()
        assert d_fb["serviced"] is True
        assert d_fb["is_out_of_area"] is True
        assert d_fb["extended_dispatch_surcharge"] == "$35"


def test_unserved_territory_logging_and_demand_api(client: TestClient):
    """Test that queries outside all territories are logged when out-of-area dispatch is disabled."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Strict Local Clinic", status="active")
        user = User(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            email=f"strict_{tenant_id[:6]}@example.com",
            role="tenant_owner",
            hashed_password="test-hash",
            full_name="Strict Owner",
        )
        loc = Location(
            tenant_id=tenant_id,
            name="Strict Branch",
            code="STR",
            service_territory_zips=["90210"],
            allows_out_of_area_dispatch=False,
            is_primary=True,
            is_active=True,
        )
        db.add_all([tenant, user, loc])
        db.commit()

        call_token = create_access_token(
            {"sub": "livekit-agent", "role": "agent", "tenant_id": tenant_id}
        )
        agent_headers = {"Authorization": f"Bearer {call_token}"}

        # Query outside territory
        res = client.post(
            "/api/v1/internal/territory/resolve",
            json={"query": "1000 Broadway, New York, NY 10001", "caller_phone": "+15551234567"},
            headers=agent_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["serviced"] is False
        assert data["is_out_of_area"] is True

        # Check that UnservedTerritoryLog was recorded
        log_entry = db.scalar(
            select(UnservedTerritoryLog).where(UnservedTerritoryLog.tenant_id == tenant_id)
        )
        assert log_entry is not None
        assert log_entry.caller_phone == "+15551234567"
        assert "10001" in log_entry.postal_code

        # Check Portal unserved-demand endpoint
        user_token = create_access_token(
            {"sub": user.id, "tenant_id": tenant_id, "role": user.role}
        )
        user_headers = {"Authorization": f"Bearer {user_token}"}
        res_demand = client.get("/api/v1/portal/locations/unserved-demand", headers=user_headers)
        assert res_demand.status_code == 200
        demand_data = res_demand.json()
        assert demand_data["total"] >= 1
        assert demand_data["items"][0]["caller_phone"] == "+15551234567"


def test_hyper_local_knowledge_search(client: TestClient):
    """Test that /internal/knowledge/search prioritizes branch parking, fees, and FAQ overrides."""
    with SessionLocal() as db:
        tenant_id = str(uuid.uuid4())
        tenant = Tenant(id=tenant_id, name="Local HVAC Pros", status="active")
        loc = Location(
            tenant_id=tenant_id,
            name="South Branch",
            code="STH",
            parking_directions="Underground parking in Blue Lot, ticket validated at desk.",
            diagnostic_fee="$69 standard inspection fee",
            regional_license_number="LIC-HVAC-9900",
            faq_overrides=[
                {
                    "question": "Do you offer financing?",
                    "answer": "Yes, 0% APR financing is available for 18 months on all new heat pumps.",
                }
            ],
            is_primary=True,
            is_active=True,
        )
        db.add_all([tenant, loc])
        db.commit()

        call_token = create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant_id,
                "location_id": loc.id,
            }
        )
        headers = {"Authorization": f"Bearer {call_token}"}

        # 1. Search parking
        res_park = client.post(
            "/api/v1/internal/knowledge/search", json={"query": "Where do I park?"}, headers=headers
        )
        assert res_park.status_code == 200
        d_park = res_park.json()
        assert d_park["out_of_scope"] is False
        assert "Blue Lot" in d_park["grounding_prompt"]

        # 2. Search fee
        res_fee = client.post(
            "/api/v1/internal/knowledge/search",
            json={"query": "What is your diagnostic dispatch fee?"},
            headers=headers,
        )
        assert res_fee.status_code == 200
        d_fee = res_fee.json()
        assert "$69" in d_fee["grounding_prompt"]

        # 3. Search branch FAQ
        res_faq = client.post(
            "/api/v1/internal/knowledge/search",
            json={"query": "Can I get financing for a heat pump?"},
            headers=headers,
        )
        assert res_faq.status_code == 200
        d_faq = res_faq.json()
        assert "0% APR financing" in d_faq["grounding_prompt"]
