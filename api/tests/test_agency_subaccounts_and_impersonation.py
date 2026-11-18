"""Tests for Milestone M8b: Agency Sub-Account Impersonation & Audit Trail (FR-WL-8 to 12)."""

import uuid
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.audit import AgencyAuditLog
from api.app.models.call import Call
from api.app.models.tenant import AgentProfile, Tenant
from api.app.models.user import User

client = TestClient(app)


def test_agency_subaccounts_listing_and_health_rollup() -> None:
    """Verify GET /api/v1/agency/sub-accounts returns all tenants with usage and QA rollups."""
    db: Session = SessionLocal()
    tenant_id = f"subacc-test-{uuid.uuid4().hex[:8]}"
    admin_id = f"admin-{uuid.uuid4().hex[:8]}"

    try:
        # Create admin user
        admin = User(
            id=admin_id,
            email=f"admin_{admin_id}@platform.com",
            hashed_password=hash_password("admin_pass_123"),
            full_name="Platform Agency Admin",
            role="platform_admin",
            tenant_id=None,
            is_active=True,
        )
        db.add(admin)

        # Create client tenant
        client_tenant = Tenant(
            id=tenant_id,
            name="Rollup SubAccount Client",
            timezone="America/Chicago",
            monthly_minute_quota=1000,
            status="active",
        )
        db.add(client_tenant)
        db.flush()

        # Add a call with QA & CSAT score
        call = Call(
            id=f"c-{uuid.uuid4().hex[:8]}",
            call_id=f"call-sub-{uuid.uuid4().hex[:8]}",
            tenant_id=tenant_id,
            caller_number="+15125550999",
            duration_s=120,
            qa_score=95.0,
            csat_score=4.8,
            outcome="booked",
            urgency="normal",
            ended_at=datetime.now(UTC),
        )
        db.add(call)
        db.commit()

        admin_token = create_access_token(
            {"sub": admin.id, "role": "platform_admin", "tenant_id": None}
        )
        headers = {"Authorization": f"Bearer {admin_token}"}

        resp = client.get("/api/v1/agency/sub-accounts", headers=headers)
        assert resp.status_code == 200
        sub_accounts = resp.json()
        assert isinstance(sub_accounts, list)

        match = next((item for item in sub_accounts if item["id"] == tenant_id), None)
        assert match is not None
        assert match["name"] == "Rollup SubAccount Client"
        assert match["monthly_minute_quota"] == 1000
        assert match["minutes_used"] == 2.0  # 120s / 60s
        assert match["total_calls"] >= 1
        assert match["qa_avg_score"] >= 95.0
        assert match["csat_avg_score"] >= 4.8
    finally:
        db.query(Call).filter(Call.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.query(User).filter(User.id == admin_id).delete()
        db.commit()
        db.close()


def test_agency_impersonation_security_gate_non_admin_forbidden() -> None:
    """Verify non-admin users cannot initiate impersonation or access agency endpoints."""
    db: Session = SessionLocal()
    tenant_id = f"forbidden-tenant-{uuid.uuid4().hex[:8]}"
    staff_id = f"staff-{uuid.uuid4().hex[:8]}"

    try:
        tenant = Tenant(
            id=tenant_id, name="Test Forbidden", timezone="America/New_York", status="active"
        )
        db.add(tenant)
        db.flush()

        staff = User(
            id=staff_id,
            email=f"staff_{staff_id}@test.com",
            hashed_password=hash_password("staff_pass"),
            full_name="Tenant Staff User",
            role="tenant_staff",
            tenant_id=tenant_id,
            is_active=True,
        )
        db.add(staff)
        db.commit()

        staff_token = create_access_token(
            {"sub": staff.id, "role": "tenant_staff", "tenant_id": tenant_id}
        )
        headers = {"Authorization": f"Bearer {staff_token}"}

        # Attempt to list sub-accounts
        resp1 = client.get("/api/v1/agency/sub-accounts", headers=headers)
        assert resp1.status_code == 403

        # Attempt to impersonate
        resp2 = client.post(
            f"/api/v1/agency/sub-accounts/{tenant_id}/impersonate",
            headers=headers,
            json={"reason": "unauthorized attempt"},
        )
        assert resp2.status_code == 403

        # Attempt to read audit logs
        resp3 = client.get("/api/v1/agency/audit-logs", headers=headers)
        assert resp3.status_code == 403
    finally:
        db.query(User).filter(User.id == staff_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_agency_impersonation_session_lifecycle_and_audit_log() -> None:
    """Verify full impersonation workflow: start -> token claims -> portal access -> sensitive action -> exit -> audit trail."""
    db: Session = SessionLocal()
    tenant_id = f"impersonate-t-{uuid.uuid4().hex[:8]}"
    admin_id = f"admin-imp-{uuid.uuid4().hex[:8]}"
    call_id = f"call-imp-{uuid.uuid4().hex[:8]}"

    try:
        # Create client tenant
        client_tenant = Tenant(
            id=tenant_id,
            name="Apex Plumbing Services",
            timezone="America/Chicago",
            status="active",
        )
        db.add(client_tenant)

        # Create tenant agent profile
        profile = AgentProfile(
            tenant_id=tenant_id,
            agent_name="receptionist",
            greeting="Welcome to Apex Plumbing.",
            tone="direct",
            voice_id="Alex",
        )
        db.add(profile)

        # Create admin user
        admin = User(
            id=admin_id,
            email=f"admin_{admin_id}@agency.com",
            hashed_password=hash_password("admin_pass"),
            full_name="Apex Agency Owner",
            role="platform_admin",
            tenant_id=None,
            is_active=True,
        )
        db.add(admin)

        # Create a call record for this tenant
        call = Call(
            id=f"c-{uuid.uuid4().hex[:8]}",
            call_id=call_id,
            tenant_id=tenant_id,
            caller_number="+15125550188",
            qa_score=70.0,
            csat_score=3.5,
            outcome="completed",
            urgency="normal",
            ended_at=datetime.now(UTC),
        )
        db.add(call)
        db.commit()

        admin_token = create_access_token(
            {"sub": admin.id, "role": "platform_admin", "tenant_id": None}
        )
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 1: Initiate Impersonation
        imp_resp = client.post(
            f"/api/v1/agency/sub-accounts/{tenant_id}/impersonate",
            headers=admin_headers,
            json={"reason": "Customer requested investigation into low QA score on recent call"},
        )
        assert imp_resp.status_code == 200
        imp_data = imp_resp.json()

        assert "access_token" in imp_data
        assert imp_data["tenant"]["id"] == tenant_id
        assert imp_data["tenant"]["name"] == "Apex Plumbing Services"
        assert imp_data["impersonator"]["id"] == admin.id
        session_id = imp_data["session_id"]
        impersonation_token = imp_data["access_token"]
        imp_headers = {"Authorization": f"Bearer {impersonation_token}"}

        # Step 2: Verify /auth/me reflects impersonation session
        me_resp = client.get("/api/v1/auth/me", headers=imp_headers)
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["is_impersonated"] is True
        assert me_data["tenant_id"] == tenant_id
        assert me_data["tenant_name"] == "Apex Plumbing Services"
        assert me_data["impersonator_id"] == admin.id
        assert me_data["impersonator_email"] == admin.email

        # Step 3: Perform tenant action while impersonating (Override QA score)
        override_resp = client.post(
            f"/api/v1/portal/calls/{call_id}/qa/override",
            headers=imp_headers,
            json={
                "qa_score": 98.0,
                "csat_score": 4.9,
                "review_note": "Agency operator audited call audio; audio artifact caused inaccurate initial score",
                "resolve_flags": True,
            },
        )
        assert override_resp.status_code == 200
        assert override_resp.json()["qa_score"] == 98.0

        # Step 4: Exit Impersonation session
        exit_resp = client.post("/api/v1/agency/sub-accounts/impersonate/exit", headers=imp_headers)
        assert exit_resp.status_code == 200
        assert exit_resp.json()["status"] == "impersonation_ended"

        # Step 5: Verify immutable audit logs via Agency API
        audit_resp = client.get(
            f"/api/v1/agency/audit-logs?tenant_id={tenant_id}",
            headers=admin_headers,
        )
        assert audit_resp.status_code == 200
        audit_data = audit_resp.json()
        assert audit_data["total"] >= 3

        actions = [item["action"] for item in audit_data["items"]]
        assert "auth.impersonate_start" in actions
        assert "call.qa_override" in actions
        assert "auth.impersonate_end" in actions

        # Verify impersonator attribution in the sensitive action
        qa_override_log = next(
            item for item in audit_data["items"] if item["action"] == "call.qa_override"
        )
        assert qa_override_log["is_impersonated"] is True
        assert qa_override_log["impersonator_id"] == admin.id
        assert qa_override_log["session_id"] == session_id
        assert qa_override_log["resource_id"] == call_id

        # Verify impersonate start audit entry details
        start_log = next(
            item for item in audit_data["items"] if item["action"] == "auth.impersonate_start"
        )
        assert "reason" in start_log["details"]
        assert "investigation into low QA score" in start_log["details"]["reason"]
    finally:
        db.query(AgencyAuditLog).filter(AgencyAuditLog.tenant_id == tenant_id).delete()
        db.query(Call).filter(Call.tenant_id == tenant_id).delete()
        db.query(AgentProfile).filter(AgentProfile.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.query(User).filter(User.id == admin_id).delete()
        db.commit()
        db.close()


def test_agency_audit_logs_filtering_and_pagination() -> None:
    """Verify audit logs endpoint filters by action, actor, and supports pagination."""
    db: Session = SessionLocal()
    tenant_id = f"audit-filter-{uuid.uuid4().hex[:8]}"
    admin_id = f"admin-flt-{uuid.uuid4().hex[:8]}"

    try:
        admin = User(
            id=admin_id,
            email=f"admin_{admin_id}@agency.com",
            hashed_password=hash_password("admin_pass"),
            full_name="Filter Agency Admin",
            role="platform_admin",
            tenant_id=None,
            is_active=True,
        )
        db.add(admin)

        tenant = Tenant(
            id=tenant_id, name="Audit Filter Tenant", timezone="America/New_York", status="active"
        )
        db.add(tenant)
        db.flush()

        # Seed 5 distinct audit entries
        for i in range(5):
            entry = AgencyAuditLog(
                action=f"test.action_{i}",
                resource_type="tenant",
                resource_id=tenant_id,
                actor_id=admin_id,
                actor_email=admin.email,
                actor_role="platform_admin",
                tenant_id=tenant_id,
                is_impersonated=bool(i % 2 == 0),
                details={"index": i},
            )
            db.add(entry)
        db.commit()

        admin_token = create_access_token(
            {"sub": admin.id, "role": "platform_admin", "tenant_id": None}
        )
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Filter by tenant_id
        res_tenant = client.get(
            f"/api/v1/agency/audit-logs?tenant_id={tenant_id}", headers=admin_headers
        )
        assert res_tenant.status_code == 200
        assert res_tenant.json()["total"] == 5

        # Filter by action
        res_action = client.get(
            f"/api/v1/agency/audit-logs?tenant_id={tenant_id}&action=test.action_2",
            headers=admin_headers,
        )
        assert res_action.status_code == 200
        assert res_action.json()["total"] == 1
        assert res_action.json()["items"][0]["action"] == "test.action_2"

        # Filter by is_impersonated=true
        res_imp = client.get(
            f"/api/v1/agency/audit-logs?tenant_id={tenant_id}&is_impersonated=true",
            headers=admin_headers,
        )
        assert res_imp.status_code == 200
        assert res_imp.json()["total"] == 3  # indices 0, 2, 4

        # Pagination: limit=2, offset=0
        res_page = client.get(
            f"/api/v1/agency/audit-logs?tenant_id={tenant_id}&limit=2&offset=0",
            headers=admin_headers,
        )
        assert res_page.status_code == 200
        assert len(res_page.json()["items"]) == 2
        assert res_page.json()["limit"] == 2
        assert res_page.json()["offset"] == 0
    finally:
        db.query(AgencyAuditLog).filter(AgencyAuditLog.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.query(User).filter(User.id == admin_id).delete()
        db.commit()
        db.close()
