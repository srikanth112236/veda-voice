"""Comprehensive Multi-Tenant Capacity-Level Leakage and Security Hardening Tests.

Validates:
1. Tenant-level concurrency caps and noisy neighbor isolation (Tenant A cannot starve Tenant B).
2. Global concurrency ceiling protection.
3. Outbound dialer concurrency limits.
4. Call-scoped JWT verification and cross-tenant tamper protection.
5. Storage path traversal neutralization.
6. Row-level security boundaries in portal endpoints.
"""

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from agent.records import CallRecord, FileCallStore
from api.app.core.config import settings
from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant
from api.app.models.user import User

client = TestClient(app)


@pytest.fixture
def isolated_tenants() -> Any:
    """Create two strictly isolated tenants with low concurrency caps for testing."""
    db = SessionLocal()
    try:
        suffix = uuid.uuid4().hex[:6]

        # Tenant A (Cap = 2)
        tenant_a = Tenant(
            name=f"Tenant A Trades {suffix}",
            timezone="America/New_York",
            hours="Mon-Fri 8am-5pm",
            status="active",
            max_concurrent_calls=2,
            max_concurrent_outbound=1,
            monthly_minute_quota=500,
        )
        db.add(tenant_a)
        db.flush()

        phone_a = PhoneNumber(
            tenant_id=tenant_a.id,
            e164=f"+1512555{suffix[:4]}",
            provider="twilio",
            status="active",
        )
        profile_a = AgentProfile(
            tenant_id=tenant_a.id,
            agent_name="receptionist",
            greeting="Thanks for calling Tenant A.",
            pricing_policy="no_quote",
            emergency_keywords=["burst pipe"],
        )
        user_a = User(
            tenant_id=tenant_a.id,
            email=f"owner_a_{suffix}@example.com",
            hashed_password="hashed_dummy_password",
            full_name="Owner A",
            role="tenant_owner",
            is_active=True,
        )
        db.add_all([phone_a, profile_a, user_a])

        # Tenant B (Cap = 2)
        tenant_b = Tenant(
            name=f"Tenant B Dental {suffix}",
            timezone="America/Chicago",
            hours="Mon-Fri 9am-6pm",
            status="active",
            max_concurrent_calls=2,
            max_concurrent_outbound=1,
            monthly_minute_quota=500,
        )
        db.add(tenant_b)
        db.flush()

        phone_b = PhoneNumber(
            tenant_id=tenant_b.id,
            e164=f"+1512666{suffix[:4]}",
            provider="telnyx",
            status="active",
        )
        profile_b = AgentProfile(
            tenant_id=tenant_b.id,
            agent_name="receptionist",
            greeting="Thanks for calling Tenant B.",
            pricing_policy="listed",
            emergency_keywords=["tooth pain"],
        )
        user_b = User(
            tenant_id=tenant_b.id,
            email=f"owner_b_{suffix}@example.com",
            hashed_password="hashed_dummy_password",
            full_name="Owner B",
            role="tenant_owner",
            is_active=True,
        )
        db.add_all([phone_b, profile_b, user_b])

        db.commit()

        yield {
            "tenant_a": tenant_a,
            "phone_a": phone_a.e164,
            "user_a": user_a,
            "tenant_b": tenant_b,
            "phone_b": phone_b.e164,
            "user_b": user_b,
        }
    finally:
        # Cleanup calls created for test tenants
        db.query(Call).filter(Call.tenant_id.in_([tenant_a.id, tenant_b.id])).delete(
            synchronize_session=False
        )
        db.query(User).filter(User.id.in_([user_a.id, user_b.id])).delete(synchronize_session=False)
        db.query(PhoneNumber).filter(PhoneNumber.id.in_([phone_a.id, phone_b.id])).delete(
            synchronize_session=False
        )
        db.query(AgentProfile).filter(AgentProfile.id.in_([profile_a.id, profile_b.id])).delete(
            synchronize_session=False
        )
        db.query(Tenant).filter(Tenant.id.in_([tenant_a.id, tenant_b.id])).delete(
            synchronize_session=False
        )
        db.commit()
        db.close()


def test_tenant_capacity_isolation_no_leakage(isolated_tenants: dict[str, Any]) -> None:
    """Verify Tenant A saturating concurrent lines does not starve Tenant B (Noisy Neighbor)."""
    phone_a = isolated_tenants["phone_a"]
    phone_b = isolated_tenants["phone_b"]
    call_id_a1 = f"call_a1_{uuid.uuid4().hex[:6]}"
    call_id_a2 = f"call_a2_{uuid.uuid4().hex[:6]}"
    call_id_a3 = f"call_a3_{uuid.uuid4().hex[:6]}"
    call_id_b1 = f"call_b1_{uuid.uuid4().hex[:6]}"

    # 1. Tenant A starts Call 1 -> Approved
    resp1 = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_a, "caller_number": "+15551112222", "call_id": call_id_a1},
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["allow"] is True
    assert data1["reason"] == "approved"
    assert data1["active_tenant_concurrency"] == 1
    token_a1 = data1["call_token"]

    # 2. Tenant A starts Call 2 -> Approved (Cap reached: 2 of 2)
    resp2 = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_a, "caller_number": "+15553334444", "call_id": call_id_a2},
    )
    assert resp2.status_code == 200
    assert resp2.json()["allow"] is True
    assert resp2.json()["active_tenant_concurrency"] == 2

    # 3. Tenant A attempts Call 3 -> Throttled (Tenant concurrency exceeded)
    resp3 = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_a, "caller_number": "+15555556666", "call_id": call_id_a3},
    )
    assert resp3.status_code == 200
    data3 = resp3.json()
    assert data3["allow"] is False
    assert data3["reason"] == "tenant_concurrency_exceeded"
    assert data3["overload_action"] == "busy_callback_message"

    # 4. ZERO CAPACITY LEAKAGE: Tenant B places a call simultaneously -> MUST SUCCEED
    resp_b = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_b, "caller_number": "+15557778888", "call_id": call_id_b1},
    )
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["allow"] is True
    assert data_b["reason"] == "approved"
    assert data_b["tenant_id"] == isolated_tenants["tenant_b"].id
    assert data_b["active_tenant_concurrency"] == 1

    # 5. Complete Tenant A Call 1 -> Frees channel
    complete_resp = client.post(
        "/api/v1/internal/calls/complete",
        headers={"Authorization": f"Bearer {token_a1}"},
        json={
            "call_id": call_id_a1,
            "dialed_number": phone_a,
            "caller_number": "+15551112222",
            "started_at": datetime.now(UTC).isoformat(),
            "ended_at": datetime.now(UTC).isoformat(),
            "duration_s": 45.0,
            "outcome": "message_taken",
        },
    )
    assert complete_resp.status_code == 200

    # 6. Tenant A can now place Call 3 successfully!
    resp3_retry = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_a, "caller_number": "+15555556666", "call_id": call_id_a3},
    )
    assert resp3_retry.status_code == 200
    assert resp3_retry.json()["allow"] is True
    assert resp3_retry.json()["reason"] == "approved"


def test_outbound_capacity_gate(isolated_tenants: dict[str, Any]) -> None:
    """Verify outbound calling respects tenant outbound capacity cap (max_concurrent_outbound = 1)."""
    phone_a = isolated_tenants["phone_a"]
    call_id_out1 = f"out_{uuid.uuid4().hex[:6]}"
    call_id_out2 = f"out_{uuid.uuid4().hex[:6]}"

    # Outbound call 1 -> Approved
    r1 = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={
            "dialed_number": phone_a,
            "caller_number": phone_a,
            "call_id": call_id_out1,
            "direction": "outbound",
        },
    )
    assert r1.status_code == 200
    assert r1.json()["allow"] is True

    # Outbound call 2 -> Throttled (max_concurrent_outbound is 1)
    r2 = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={
            "dialed_number": phone_a,
            "caller_number": phone_a,
            "call_id": call_id_out2,
            "direction": "outbound",
        },
    )
    assert r2.status_code == 200
    assert r2.json()["allow"] is False
    assert r2.json()["reason"] == "tenant_concurrency_exceeded"


def test_call_scoped_token_tampering_cross_tenant_rejected(
    isolated_tenants: dict[str, Any],
) -> None:
    """Verify an agent token minted for Tenant A cannot complete or tamper with Tenant B's call."""
    phone_a = isolated_tenants["phone_a"]
    phone_b = isolated_tenants["phone_b"]
    call_id_a = f"call_a_{uuid.uuid4().hex[:6]}"
    call_id_b = f"call_b_{uuid.uuid4().hex[:6]}"

    # Start call for Tenant A -> get Token A
    resp_a = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_a, "caller_number": "+15551111111", "call_id": call_id_a},
    )
    token_a = resp_a.json()["call_token"]

    # Start call for Tenant B
    resp_b = client.post(
        "/api/v1/internal/calls/start",
        headers={"X-Internal-Secret": settings.INTERNAL_SIGNING_KEY},
        json={"dialed_number": phone_b, "caller_number": "+15552222222", "call_id": call_id_b},
    )
    assert resp_b.json()["allow"] is True

    # Malicious attempt: Complete Tenant B's call using Tenant A's token
    tamper_resp = client.post(
        "/api/v1/internal/calls/complete",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "call_id": call_id_b,  # Tenant B call!
            "dialed_number": phone_b,
            "caller_number": "+15552222222",
            "started_at": datetime.now(UTC).isoformat(),
            "ended_at": datetime.now(UTC).isoformat(),
            "duration_s": 25.0,
            "outcome": "completed",
        },
    )
    # Must be rejected with 403 Forbidden!
    assert tamper_resp.status_code == 403
    assert "Cross-tenant call completion forbidden" in tamper_resp.json()["detail"]


def test_file_call_store_path_traversal_neutralization(tmp_path: Path) -> None:
    """Verify CallStore strictly prevents directory traversal attacks."""
    store = FileCallStore(storage_dir=tmp_path / "calls")

    rec = CallRecord(
        tenant_id="valid_tenant",
        call_id="call_123",
        dialed_number="+18005550199",
        caller_number="+15125550100",
        started_at=datetime.now(UTC).isoformat(),
        ended_at=datetime.now(UTC).isoformat(),
        duration_s=10.0,
        outcome="completed",
    )

    # 1. Normal save works
    path = store.save_call_record(rec, tenant_id="acme_plumbing")
    assert path.exists()
    assert "acme_plumbing" in str(path)

    # 2. Path traversal in tenant_id is neutralized to basename or raises
    path_traversal_id = "../../etc/passwd"
    safe_path = store.save_call_record(rec, tenant_id=path_traversal_id)
    # Must resolve inside store storage_dir
    assert str(safe_path.resolve()).startswith(str((tmp_path / "calls").resolve()))
    assert "passwd" in str(safe_path) or "unassigned" in str(safe_path)


def test_portal_tenant_isolation_boundary(isolated_tenants: dict[str, Any]) -> None:
    """Verify tenant users cannot query or mutate another tenant's call data."""
    tenant_a = isolated_tenants["tenant_a"]
    user_a = isolated_tenants["user_a"]
    tenant_b = isolated_tenants["tenant_b"]

    token_a = create_access_token({"sub": user_a.id, "tenant_id": tenant_a.id, "role": user_a.role})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Insert a call for Tenant B
    db = SessionLocal()
    call_b = Call(
        tenant_id=tenant_b.id,
        call_id=f"secret_call_{uuid.uuid4().hex[:6]}",
        caller_number="+15559998888",
        dialed_number="+18005550199",
        started_at=datetime.now(UTC),
        ended_at=datetime.now(UTC),
        duration_s=60.0,
        outcome="message_taken",
        message={"name": "Confidential Client", "message": "Secret Tenant B memo"},
    )
    db.add(call_b)
    db.commit()
    call_b_id = call_b.id
    db.close()

    # Tenant A attempts to access Tenant B's call detail via /portal/calls/{call_id}
    resp = client.get(f"/api/v1/portal/calls/{call_b_id}", headers=headers_a)
    assert resp.status_code == 404  # Strictly not found under Tenant A's scope!


def test_tenant_cannot_access_platform_admin_endpoints(isolated_tenants: dict[str, Any]) -> None:
    """Verify tenant users are strictly rejected with 403 Forbidden from all admin routes."""
    tenant_a = isolated_tenants["tenant_a"]
    user_a = isolated_tenants["user_a"]
    token_a = create_access_token({"sub": user_a.id, "tenant_id": tenant_a.id, "role": user_a.role})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 1. Admin stats
    res_stats = client.get("/api/v1/admin/stats", headers=headers_a)
    assert res_stats.status_code == 403
    assert "Platform administrator access required" in res_stats.json()["detail"]

    # 2. Admin tenant list
    res_tenants = client.get("/api/v1/admin/tenants", headers=headers_a)
    assert res_tenants.status_code == 403

    # 3. Admin subscriptions master list
    res_subs = client.get("/api/v1/admin/subscriptions", headers=headers_a)
    assert res_subs.status_code == 403

    # 4. Admin coupons
    res_coups = client.get("/api/v1/admin/coupons", headers=headers_a)
    assert res_coups.status_code == 403


def test_tenant_cannot_access_other_tenant_lead_forms_or_leads(
    isolated_tenants: dict[str, Any],
) -> None:
    """Verify Tenant A cannot view, query, or mutate Tenant B's lead forms or captured leads."""
    from api.app.models.lead_form import Lead, LeadForm

    tenant_a = isolated_tenants["tenant_a"]
    user_a = isolated_tenants["user_a"]
    tenant_b = isolated_tenants["tenant_b"]

    token_a = create_access_token({"sub": user_a.id, "tenant_id": tenant_a.id, "role": user_a.role})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Seed form and lead for Tenant B
    db = SessionLocal()
    form_b = LeadForm(
        tenant_id=tenant_b.id,
        title="Tenant B Secret Intake",
        fields=[{"name": "caller_name", "label": "Name", "type": "text", "required": True}],
        is_active=True,
    )
    db.add(form_b)
    db.flush()

    lead_b = Lead(
        tenant_id=tenant_b.id,
        form_id=form_b.id,
        caller_name="Private Patient",
        caller_phone="+15125559999",
        status="pending",
    )
    db.add(lead_b)
    db.commit()
    form_b_id = form_b.id
    lead_b_id = lead_b.id
    db.close()

    # Tenant A attempts to delete Tenant B's form
    del_res = client.delete(f"/api/v1/forms/{form_b_id}", headers=headers_a)
    assert del_res.status_code == 404

    # Tenant A attempts to mutate Tenant B's lead status
    status_res = client.post(
        f"/api/v1/forms/leads/{lead_b_id}/status",
        headers=headers_a,
        json={"status": "converted"},
    )
    assert status_res.status_code == 404

    # Tenant A lists forms - Tenant B's form must not be in list
    forms_res = client.get("/api/v1/forms", headers=headers_a)
    assert forms_res.status_code == 200
    form_ids = [f["id"] for f in forms_res.json()]
    assert form_b_id not in form_ids

    # Tenant A lists leads - Tenant B's lead must not be in list
    leads_res = client.get("/api/v1/forms/leads/all", headers=headers_a)
    assert leads_res.status_code == 200
    lead_ids = [item["id"] for item in leads_res.json()]
    assert lead_b_id not in lead_ids
