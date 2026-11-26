"""Tests for tenant-isolated customer quotes, invoices, conversions, and public self-service APIs."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.crm import Contact, ContactTimelineEvent
from api.app.models.tenant import Tenant
from api.app.models.user import User

init_db()
client = TestClient(app)


@pytest.fixture
def two_tenant_setup() -> Any:
    """Create two isolated tenants with users and a contact in Tenant A."""
    db = SessionLocal()
    try:
        suf = uuid.uuid4().hex[:6]
        tenant_a = Tenant(
            name=f"Summit HVAC {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-18:00",
            status="active",
        )
        tenant_b = Tenant(
            name=f"Other Plumbing {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-18:00",
            status="active",
        )
        db.add_all([tenant_a, tenant_b])
        db.flush()

        user_a = User(
            tenant_id=tenant_a.id,
            email=f"owner_a_{suf}@example.com",
            hashed_password="hashed",
            role="tenant_owner",
            full_name="Owner A",
        )
        user_b = User(
            tenant_id=tenant_b.id,
            email=f"owner_b_{suf}@example.com",
            hashed_password="hashed",
            role="tenant_owner",
            full_name="Owner B",
        )
        contact_a = Contact(
            tenant_id=tenant_a.id,
            name="Marcus Vance",
            phone="+15551230001",
            email="marcus@example.com",
        )
        db.add_all([user_a, user_b, contact_a])
        db.commit()

        token_a = create_access_token(
            {"sub": user_a.id, "tenant_id": tenant_a.id, "role": user_a.role}
        )
        token_b = create_access_token(
            {"sub": user_b.id, "tenant_id": tenant_b.id, "role": user_b.role}
        )
        yield {
            "tenant_a": tenant_a,
            "tenant_b": tenant_b,
            "contact_a": contact_a,
            "headers_a": {"Authorization": f"Bearer {token_a}"},
            "headers_b": {"Authorization": f"Bearer {token_b}"},
        }
    finally:
        db.close()


def test_quote_lifecycle_conversion_and_public_approval(two_tenant_setup: dict[str, Any]) -> None:
    headers_a = two_tenant_setup["headers_a"]
    contact_a = two_tenant_setup["contact_a"]

    # 1. Create Quote with 2 line items + 8.00% (800 bps) tax
    create_resp = client.post(
        "/api/v1/portal/quotes",
        headers=headers_a,
        json={
            "contact_id": contact_a.id,
            "title": "Water Heater Replacement",
            "customer_name": "Marcus Vance",
            "customer_phone": "+15551230001",
            "customer_email": "marcus@example.com",
            "tax_rate_bps": 800,
            "line_items": [
                {
                    "description": "50-Gal Gas Unit",
                    "qty": 1,
                    "unit_price_cents": 95000,
                    "category": "parts",
                },
                {
                    "description": "Installation Labor",
                    "qty": 2,
                    "unit_price_cents": 12500,
                    "category": "labor",
                },
            ],
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    quote = create_resp.json()
    assert quote["subtotal_cents"] == 120000
    assert quote["tax_cents"] == 9600
    assert quote["total_cents"] == 129600
    assert quote["status"] == "draft"
    assert quote["quote_number"].startswith("QT-")

    # 2. Send quote & approve via public token
    send_resp = client.post(f"/api/v1/portal/quotes/{quote['id']}/send", headers=headers_a)
    assert send_resp.status_code == 200
    assert send_resp.json()["status"] == "sent"

    pub_get = client.get(f"/api/v1/public/quote/{quote['public_token']}")
    assert pub_get.status_code == 200
    assert pub_get.json()["quote"]["total_cents"] == 129600

    pub_approve = client.post(
        f"/api/v1/public/quote/{quote['public_token']}/respond",
        json={"decision": "approve"},
    )
    assert pub_approve.status_code == 200
    assert pub_approve.json()["status"] == "approved"

    # 3. Convert quote to invoice and mark paid
    inv_resp = client.post(
        f"/api/v1/portal/quotes/{quote['id']}/convert-to-invoice",
        headers=headers_a,
    )
    assert inv_resp.status_code == 200
    invoice = inv_resp.json()
    assert invoice["quote_id"] == quote["id"]
    assert invoice["total_cents"] == 129600
    assert invoice["status"] == "issued"
    assert invoice["invoice_number"].startswith("INV-")

    paid_resp = client.post(
        f"/api/v1/portal/invoices/{invoice['id']}/mark-paid",
        headers=headers_a,
    )
    assert paid_resp.status_code == 200
    assert paid_resp.json()["status"] == "paid"
    assert paid_resp.json()["amount_paid_cents"] == 129600

    pub_inv = client.get(f"/api/v1/public/invoice/{invoice['public_token']}")
    assert pub_inv.status_code == 200
    assert pub_inv.json()["invoice"]["status"] == "paid"

    # 4. Verify CRM timeline events logged
    db = SessionLocal()
    try:
        events = (
            db.query(ContactTimelineEvent)
            .filter(ContactTimelineEvent.contact_id == contact_a.id)
            .all()
        )
        event_types = {e.event_type for e in events}
        assert {"quote_sent", "quote_approved", "invoice_issued", "invoice_paid"}.issubset(
            event_types
        )
    finally:
        db.close()


def test_cross_tenant_isolation_for_quotes_and_invoices(two_tenant_setup: dict[str, Any]) -> None:
    headers_a = two_tenant_setup["headers_a"]
    headers_b = two_tenant_setup["headers_b"]

    q_res = client.post(
        "/api/v1/portal/quotes",
        headers=headers_a,
        json={
            "title": "Tenant A Private Estimate",
            "customer_name": "Alice",
            "line_items": [{"description": "Diagnostic", "qty": 1, "unit_price_cents": 8900}],
        },
    )
    assert q_res.status_code == 201
    quote_id = q_res.json()["id"]

    inv_res = client.post(
        "/api/v1/portal/invoices",
        headers=headers_a,
        json={
            "title": "Tenant A Private Invoice",
            "customer_name": "Alice",
            "line_items": [{"description": "Diagnostic", "qty": 1, "unit_price_cents": 8900}],
        },
    )
    assert inv_res.status_code == 201
    invoice_id = inv_res.json()["id"]

    # Tenant B must not see or mutate Tenant A's quotes or invoices
    assert client.get("/api/v1/portal/quotes", headers=headers_b).json() == []
    assert client.get("/api/v1/portal/invoices", headers=headers_b).json() == []
    assert client.get(f"/api/v1/portal/quotes/{quote_id}", headers=headers_b).status_code == 404
    assert (
        client.patch(
            f"/api/v1/portal/quotes/{quote_id}", headers=headers_b, json={"title": "Hijacked"}
        ).status_code
        == 404
    )
    assert (
        client.post(f"/api/v1/portal/quotes/{quote_id}/send", headers=headers_b).status_code == 404
    )
    assert client.get(f"/api/v1/portal/invoices/{invoice_id}", headers=headers_b).status_code == 404
    assert (
        client.post(
            f"/api/v1/portal/invoices/{invoice_id}/mark-paid", headers=headers_b
        ).status_code
        == 404
    )


def test_public_booking_endpoint_and_quote_to_booking(two_tenant_setup: dict[str, Any]) -> None:
    tenant_a = two_tenant_setup["tenant_a"]
    headers_a = two_tenant_setup["headers_a"]

    # Public availability by tenant_id
    avail = client.get(f"/api/v1/public/booking/{tenant_a.id}/availability")
    assert avail.status_code == 200
    assert avail.json()["business_name"] == tenant_a.name

    # Public booking creation at a clean future weekday 10:00 UTC slot
    base = datetime.now(UTC).replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=5)
    if base.weekday() >= 5:
        base = base + timedelta(days=2)

    book_resp = client.post(
        f"/api/v1/public/booking/{tenant_a.id}",
        json={
            "customer_name": "Public Booker",
            "customer_phone": "+15557770001",
            "service_type": "System Tune-Up",
            "slot_start": base.isoformat(),
            "duration_minutes": 60,
        },
    )
    assert book_resp.status_code == 201, book_resp.text
    assert book_resp.json()["status"] == "confirmed"
    assert book_resp.json()["reschedule_token"]

    # Quote conversion to booking on a separate slot
    q_res = client.post(
        "/api/v1/portal/quotes",
        headers=headers_a,
        json={
            "title": "Duct Inspection",
            "customer_name": "Quote Booker",
            "customer_phone": "+15557770002",
            "line_items": [{"description": "Inspection", "qty": 1, "unit_price_cents": 15000}],
        },
    )
    quote_id = q_res.json()["id"]
    slot2 = base + timedelta(hours=3)
    conv_resp = client.post(
        f"/api/v1/portal/quotes/{quote_id}/convert-to-booking",
        headers=headers_a,
        json={"start_at": slot2.isoformat(), "duration_minutes": 60},
    )
    assert conv_resp.status_code == 200, conv_resp.text
    assert conv_resp.json()["status"] == "confirmed"
