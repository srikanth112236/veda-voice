"""Unit and Integration tests for Agency Super-Admin Concurrency Monitoring & Billing Analytics (Phase 3)."""

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.app.core.security import create_access_token, hash_password
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.call import Call
from api.app.models.tenant import Tenant
from api.app.models.user import User

client = TestClient(app)


@pytest.fixture
def test_setup_agency_admin() -> dict[str, Any]:
    """Ensure a verified platform tenant and platform admin exist for agency billing analytics."""
    db = SessionLocal()
    try:
        # 1. Platform Admin user
        admin = db.scalar(select(User).where(User.role == "platform_admin"))
        if not admin:
            admin = User(
                email="admin_analytics@example.com",
                hashed_password=hash_password("SuperSecret123!"),
                role="platform_admin",
                full_name="Platform Super Admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        admin_token = create_access_token(
            {"sub": admin.id, "role": "platform_admin", "tenant_id": None}
        )

        tenant = db.scalar(select(Tenant).where(Tenant.name == "Apex Plumbing & Heating"))
        if not tenant:
            tenant = Tenant(
                name="Apex Plumbing & Heating",
                timezone="America/New_York",
                hours="Mon-Fri 08:00-18:00",
                status="active",
                plan="growth",
                monthly_minute_quota=1500,
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)

        # Add mock calls with duration to test billing accumulation
        existing_calls = db.scalars(select(Call).where(Call.tenant_id == tenant.id)).all()
        if len(existing_calls) < 3:
            for i in range(3):
                call = Call(
                    tenant_id=tenant.id,
                    call_id=f"call-analytics-{i}-{tenant.id[:8]}",
                    direction="inbound",
                    caller_number="+15125550199",
                    dialed_number="+15125550100",
                    started_at=datetime.now(UTC) - timedelta(minutes=10 * (i + 1)),
                    ended_at=datetime.now(UTC) - timedelta(minutes=10 * i),
                    duration_s=180,  # 3 minutes
                    outcome="booked",
                    urgency="normal",
                    latency_p50_ms=450,
                )
                db.add(call)
            db.commit()

        return {
            "tenant_id": tenant.id,
            "admin_token": admin_token,
            "headers": {"Authorization": f"Bearer {admin_token}"},
        }
    finally:
        db.close()


def test_platform_stats_concurrency_and_scale_limits(
    test_setup_agency_admin: dict[str, Any],
) -> None:
    """Verify platform stats return Scale plan concurrency limit, 60%/80% thresholds, and alert level."""
    headers = test_setup_agency_admin["headers"]
    resp = client.get("/api/v1/admin/stats", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["scale_plan_limit"] == 50
    assert data["warn_threshold_concurrency"] == 30
    assert data["critical_threshold_concurrency"] == 40
    assert data["concurrency_alert_level"] in ("normal", "warning_60", "critical_80")
    assert "concurrency_alert_message" in data
    assert data["cost_metrics"]["total_billable_minutes"] >= 0.0
    assert data["cost_metrics"]["gross_margin_pct"] >= 50.0


def test_platform_stats_triggers_warning_at_60_percent(
    test_setup_agency_admin: dict[str, Any],
) -> None:
    """Verify concurrency alert triggers warning_60 when active calls reach 30 (60% of Scale 50)."""
    headers = test_setup_agency_admin["headers"]
    with patch("api.app.routers.admin.settings.GLOBAL_MAX_CONCURRENT", 50):
        orig_scalar = Session.scalar

        def mock_scalar(self, statement, *args, **kwargs):
            stmt_str = str(statement)
            if "calls.ended_at IS NULL" in stmt_str:
                return 32
            return orig_scalar(self, statement, *args, **kwargs)

        with patch.object(Session, "scalar", mock_scalar):
            resp = client.get("/api/v1/admin/stats", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            assert data["concurrency_alert_level"] == "warning_60"
            assert "60%" in data["concurrency_alert_message"]


def test_platform_stats_triggers_critical_at_80_percent(
    test_setup_agency_admin: dict[str, Any],
) -> None:
    """Verify concurrency alert triggers critical_80 when active calls reach 40 (80% of Scale 50)."""
    headers = test_setup_agency_admin["headers"]
    with patch("api.app.routers.admin.settings.GLOBAL_MAX_CONCURRENT", 50):
        orig_scalar = Session.scalar

        def mock_scalar(self, statement, *args, **kwargs):
            stmt_str = str(statement)
            if "calls.ended_at IS NULL" in stmt_str:
                return 42
            return orig_scalar(self, statement, *args, **kwargs)

        with patch.object(Session, "scalar", mock_scalar):
            resp = client.get("/api/v1/admin/stats", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            assert data["concurrency_alert_level"] == "critical_80"
            assert "80%" in data["concurrency_alert_message"]


def test_tenant_summary_includes_cogs_and_margins(test_setup_agency_admin: dict[str, Any]) -> None:
    """Verify tenant summary calculates MRR, CoGS, and Gross Margin percentage."""
    headers = test_setup_agency_admin["headers"]
    resp = client.get("/api/v1/admin/tenants", headers=headers)
    assert resp.status_code == 200
    tenants = resp.json()
    assert len(tenants) > 0

    target = tenants[0]
    assert "plan_code" in target
    assert "monthly_revenue_usd" in target
    assert "monthly_cogs_usd" in target
    assert "gross_margin_pct" in target

    # Verify mathematics: MRR > 0 and Gross Margin is high (> 70%)
    assert target["monthly_revenue_usd"] >= 99.00
    assert target["gross_margin_pct"] >= 70.0
