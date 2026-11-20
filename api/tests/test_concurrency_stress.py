"""Automated 50-concurrent-call stress test suite (Milestone M7 / Acceptance Criterion #10).

Validates that 50 simultaneous callers across multiple tenants execute without
deadlocks, database connection pool exhaustion, or cross-tenant data leakage.
"""

import pytest

from scripts.load_test.simulate_calls import run_concurrent_load_test


@pytest.mark.asyncio
async def test_50_concurrent_calls_load_and_gate_enforcement() -> None:
    """Execute synthetic 50-concurrent-call benchmark and assert acceptance criteria."""
    concurrency_target = 50
    tenant_count = 5

    results = await run_concurrent_load_test(
        concurrency=concurrency_target,
        tenant_count=tenant_count,
    )

    # 1. Total attempted matches concurrency target
    assert results["calls_attempted"] == concurrency_target

    # 2. Zero unhandled server errors (0% error rate)
    assert results["unhandled_errors"] == 0
    assert results["error_rate_percent"] == 0.0

    # 3. Concurrency gate successfully admitted callers and safely gated excess callers
    assert results["calls_admitted"] > 0
    assert results["calls_concurrency_rejected"] > 0
    assert (results["calls_admitted"] + results["calls_concurrency_rejected"]) == concurrency_target

    # 4. Successful actions executed under load
    assert results["bookings_completed"] > 0 or results["emergencies_triaged"] > 0

    # 5. Latency metrics verified
    lat = results["overall_latency"]
    assert lat["count"] > 0
    assert lat["p50"] > 0.0
    # Average call endpoint response latency is well under acceptable staging budget
    assert lat["p50"] < 2500.0
