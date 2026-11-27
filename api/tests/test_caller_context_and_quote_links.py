"""Tests for Phase 2 pre-call caller memory hydration and in-call quote link APIs."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app, init_db
from api.app.models.booking import Booking
from api.app.models.call import Call
from api.app.models.crm import Contact
from api.app.models.quote_invoice import CustomerInvoice, CustomerQuote
from api.app.models.tenant import Tenant

init_db()
client = TestClient(app)


@pytest.fixture
def caller_setup() -> Any:
    """Create two tenants with caller memory records in Tenant A."""
    db = SessionLocal()
    try:
        suf = uuid.uuid4().hex[:6]
        t_a = Tenant(
            name=f"FlowPro Plumbing {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-18:00",
            status="active",
        )
        t_b = Tenant(
            name=f"Other Electric {suf}",
            timezone="America/New_York",
            hours="Mon-Fri 08:00-18:00",
            status="active",
        )
        db.add_all([t_a, t_b])
        db.flush()

        phone = f"+1512555{uuid.uuid4().int % 10000:04d}"
        now = datetime.now(UTC)

        contact = Contact(
            tenant_id=t_a.id,
            name="Jordan Rivera",
            phone=phone,
        )
        recent_call = Call(
            tenant_id=t_a.id,
            call_id=f"call_{suf}",
            caller_number=phone,
            dialed_number="+18005550199",
            direction="inbound",
            started_at=now - timedelta(days=1),
            outcome="completed",
        )
        booking = Booking(
            tenant_id=t_a.id,
            customer_name="Jordan Rivera",
            customer_phone=phone,
            service_type="Water Heater Inspection",
            start_at=now + timedelta(days=2),
            end_at=now + timedelta(days=2, hours=1),
            status="confirmed",
        )
        quote = CustomerQuote(
            tenant_id=t_a.id,
            quote_number=f"QT-{suf.upper()}",
            public_token=f"qt_{suf}_{uuid.uuid4().hex[:6]}",
            customer_name="Jordan Rivera",
            customer_phone=phone,
            title="Tankless Heater Estimate",
            total_cents=240000,
            status="sent",
        )
        invoice = CustomerInvoice(
            tenant_id=t_a.id,
            invoice_number=f"INV-{suf.upper()}",
            public_token=f"inv_{suf}_{uuid.uuid4().hex[:6]}",
            title="Diagnostic Visit Invoice",
            customer_name="Jordan Rivera",
            customer_phone=phone,
            total_cents=12500,
            status="sent",
        )
        db.add_all([contact, recent_call, booking, quote, invoice])
        db.commit()

        tok_a = create_access_token({"sub": "agent", "tenant_id": t_a.id, "role": "agent"})
        tok_b = create_access_token({"sub": "agent", "tenant_id": t_b.id, "role": "agent"})
        yield {
            "tenant_a": t_a.id,
            "phone": phone,
            "headers_a": {"Authorization": f"Bearer {tok_a}"},
            "headers_b": {"Authorization": f"Bearer {tok_b}"},
        }
    finally:
        db.close()


def test_internal_caller_context_hydration_and_isolation(caller_setup: dict[str, Any]) -> None:
    """Verify pre-call caller memory hydrates all entities and isolates across tenants."""
    resp_a = client.get(
        f"/api/v1/internal/caller-context?caller_number={caller_setup['phone']}",
        headers=caller_setup["headers_a"],
    )
    assert resp_a.status_code == 200, resp_a.text
    data = resp_a.json()
    assert data["returning_caller"] is True
    assert data["caller_name"] == "Jordan Rivera"
    assert "vip_tier" in data
    assert "completed" in data["recent_call_summary"]
    assert data["upcoming_booking"]["service_type"] == "Water Heater Inspection"
    assert data["open_quote"]["title"] == "Tankless Heater Estimate"
    assert data["open_invoice"]["status"] == "sent"

    # Tenant B must not see Tenant A's caller memory
    resp_b = client.get(
        f"/api/v1/internal/caller-context?caller_number={caller_setup['phone']}",
        headers=caller_setup["headers_b"],
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["returning_caller"] is False


def test_internal_send_quote_link_creates_quote(caller_setup: dict[str, Any]) -> None:
    """Verify POST /api/v1/internal/quotes/send-link creates a quote and returns its URL."""
    resp = client.post(
        "/api/v1/internal/quotes/send-link",
        json={
            "phone_number": caller_setup["phone"],
            "customer_name": "Jordan Rivera",
            "title": "Drain Line Hydro-Jetting",
            "notes": "Main sewer line cleaning",
            "amount_dollars": 350.0,
        },
        headers=caller_setup["headers_a"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "sent"
    assert body["quote_number"].startswith("QT-")
    assert "/quote/" in body["quote_url"]
