"""Tests for Phase 4 / Milestone M6 & M7: Azure IaC, Docker Hardening, CI/CD, and Load Testing.

Validates:
1. Bicep IaC module integrity, parameter files (dev, staging, prod), and Key Vault Managed Identity RBAC.
2. Production Dockerfiles adhere to security hardening (non-root users, multi-stage builds, healthchecks).
3. Azure Monitor alert rules in alerts.bicep match SRS Section 17.1 specifications.
4. GitHub Actions CI/CD workflows utilize OIDC authentication and staging validation before production.
5. Load testing simulation harness aggregates concurrency metrics, verifies capacity gates, and records zero unhandled errors.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from scripts.load_test.simulate_calls import CallMetrics, run_concurrent_load_test

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_bicep_parameter_environments() -> None:
    """Ensure parameter files exist for dev, staging, and prod matching SRS Section 15.2."""
    params_dir = REPO_ROOT / "infra" / "bicep" / "parameters"
    assert params_dir.is_dir(), "infra/bicep/parameters directory missing"

    for env in ("dev", "staging", "prod"):
        param_file = params_dir / f"{env}.bicepparam"
        assert param_file.is_file(), f"Missing parameter file: {env}.bicepparam"
        content = param_file.read_text(encoding="utf-8")
        assert f"param environment = '{env}'" in content
        assert "main.bicep" in content


def test_bicep_modules_and_keyvault_rbac() -> None:
    """Verify Bicep modules exist and Key Vault Secrets User RBAC is wired to container apps."""
    modules_dir = REPO_ROOT / "infra" / "bicep" / "modules"
    expected_modules = [
        "acr.bicep",
        "alerts.bicep",
        "containerapps.bicep",
        "keyvault.bicep",
        "keyvault-access.bicep",
        "monitoring.bicep",
        "postgres.bicep",
        "storage.bicep",
    ]
    for mod in expected_modules:
        mod_path = modules_dir / mod
        assert mod_path.is_file(), f"Missing Bicep module: {mod}"

    # Verify Key Vault Secrets User Role Definition (4633458b-17de-408a-b874-0445c86b69e6)
    kv_access_bicep = (modules_dir / "keyvault-access.bicep").read_text(encoding="utf-8")
    assert "4633458b-17de-408a-b874-0445c86b69e6" in kv_access_bicep
    assert "Microsoft.Authorization/roleAssignments" in kv_access_bicep

    # Verify main.bicep wires keyVaultAccessModule
    main_bicep = (REPO_ROOT / "infra" / "bicep" / "main.bicep").read_text(encoding="utf-8")
    assert "keyVaultAccessModule" in main_bicep
    assert "keyvault-access.bicep" in main_bicep


def test_azure_monitor_alerts_match_srs_17() -> None:
    """Verify alerts.bicep configures Azure Monitor alerts per SRS Section 17.1."""
    alerts_bicep = (REPO_ROOT / "infra" / "bicep" / "modules" / "alerts.bicep").read_text(
        encoding="utf-8"
    )

    # 1. High API 5xx rate
    assert "alert-api-high-5xx-rate" in alerts_bicep
    # 2. High latency SLA (> 2.5s / 2500ms)
    assert "alert-api-latency-sla" in alerts_bicep
    assert "2500" in alerts_bicep
    # 3. Container restart / crash loop
    assert "alert-api-restart-loop" in alerts_bicep
    # 4. PostgreSQL High CPU (> 75%)
    assert "alert-postgres-high-cpu" in alerts_bicep
    assert "cpu_percent" in alerts_bicep
    # 5. PostgreSQL High Storage (> 75%)
    assert "alert-postgres-high-storage" in alerts_bicep
    assert "storage_percent" in alerts_bicep


def test_dockerfiles_security_and_hardening() -> None:
    """Verify Dockerfiles execute under non-root users, use multi-stage builds, and define healthchecks."""
    dockerfiles = {
        "api": REPO_ROOT / "api" / "Dockerfile",
        "dashboard": REPO_ROOT / "dashboard" / "Dockerfile",
        "agent": REPO_ROOT / "agent" / "Dockerfile",
    }

    for service, path in dockerfiles.items():
        assert path.is_file(), f"Missing Dockerfile for {service}"
        content = path.read_text(encoding="utf-8")

        # Non-root security requirement
        assert re.search(r"USER\s+\w+", content), f"{service} Dockerfile must specify non-root USER"

        # Multi-stage or runtime minimization
        if service in ("api", "dashboard"):
            assert "AS " in content, f"{service} Dockerfile should use multi-stage builds"
            assert (
                "HEALTHCHECK" in content
            ), f"{service} Dockerfile should define container HEALTHCHECK"


def test_github_actions_oidc_and_staging_workflow() -> None:
    """Verify GitHub Actions workflows use Azure OIDC and staging smoke test before production."""
    deploy_yml = (REPO_ROOT / ".github" / "workflows" / "deploy.yml").read_text(encoding="utf-8")

    # Verify OIDC permissions
    assert "id-token: write" in deploy_yml
    assert "azure/login@v2" in deploy_yml
    assert "client-id:" in deploy_yml

    # Verify staging deployment & smoke test prior to production
    assert "deploy-staging:" in deploy_yml
    assert "deploy-production:" in deploy_yml
    assert "smoke_test_prod.py" in deploy_yml


def test_runbook_procedures_documented() -> None:
    """Verify RUNBOOK.md provides deployment, revision rollback, Alembic rollback, and incident triage."""
    runbook = (REPO_ROOT / "docs" / "RUNBOOK.md").read_text(encoding="utf-8")

    assert "Rollback Procedures" in runbook
    assert "az containerapp revision" in runbook
    assert "alembic -c api/alembic.ini downgrade" in runbook
    assert "lk agent rollback" in runbook
    assert "Secret Rotation" in runbook


@pytest.mark.asyncio
async def test_load_simulation_harness_in_process() -> None:
    """Verify load test harness executes against in-process FastAPI ASGI app without errors."""
    summary = await run_concurrent_load_test(concurrency=8, tenant_count=2)

    assert summary["calls_attempted"] == 8
    assert summary["unhandled_errors"] == 0
    assert summary["error_rate_percent"] == 0.0
    assert summary["duration_seconds"] > 0
    assert "overall_latency" in summary
    assert summary["overall_latency"]["count"] > 0
    assert summary["overall_latency"]["p50"] >= 0.0


def test_call_metrics_percentiles_calculation() -> None:
    """Verify CallMetrics mathematical percentile calculations."""
    metrics = CallMetrics()
    for val in [100.0, 200.0, 300.0, 400.0, 500.0]:
        metrics.record_latency(val, "general")

    pcts = metrics.compute_percentiles(metrics.latencies_ms)
    assert pcts["count"] == 5.0
    assert pcts["p50"] == 300.0
    assert pcts["max"] == 500.0
    assert pcts["mean"] == 300.0
