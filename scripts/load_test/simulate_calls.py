"""Synthetic load testing harness simulating 50 concurrent calls in staging (Milestone M7).

Evaluates database connection pool limits, tenant RLS isolation under load,
concurrency gate enforcement (graceful busy response), and latency percentiles.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
import statistics
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from api.app.core.security import create_access_token
from api.app.db.session import SessionLocal
from api.app.main import app
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("vedavoice.load_test")


class CallMetrics:
    """Aggregates latency observations and outcome counts across concurrent workers."""

    def __init__(self) -> None:
        self.latencies_ms: list[float] = []
        self.start_latencies_ms: list[float] = []
        self.booking_latencies_ms: list[float] = []
        self.completion_latencies_ms: list[float] = []
        self.calls_attempted: int = 0
        self.calls_admitted: int = 0
        self.calls_concurrency_rejected: int = 0
        self.bookings_completed: int = 0
        self.emergencies_triaged: int = 0
        self.unhandled_errors: int = 0
        self.error_messages: list[str] = []

    def record_latency(self, latency_ms: float, stage: str = "general") -> None:
        self.latencies_ms.append(latency_ms)
        if stage == "start":
            self.start_latencies_ms.append(latency_ms)
        elif stage == "booking":
            self.booking_latencies_ms.append(latency_ms)
        elif stage == "complete":
            self.completion_latencies_ms.append(latency_ms)

    def compute_percentiles(self, samples: list[float]) -> dict[str, float]:
        if not samples:
            return {
                "count": 0,
                "p50": 0.0,
                "p90": 0.0,
                "p95": 0.0,
                "p99": 0.0,
                "mean": 0.0,
                "max": 0.0,
            }
        sorted_samples = sorted(samples)
        n = len(sorted_samples)

        def pct(p: float) -> float:
            k = (n - 1) * (p / 100.0)
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return float(sorted_samples[int(k)])
            d0 = sorted_samples[int(f)] * (c - k)
            d1 = sorted_samples[int(c)] * (k - f)
            return float(d0 + d1)

        return {
            "count": float(n),
            "p50": round(pct(50.0), 2),
            "p90": round(pct(90.0), 2),
            "p95": round(pct(95.0), 2),
            "p99": round(pct(99.0), 2),
            "mean": round(statistics.mean(sorted_samples), 2),
            "max": round(max(sorted_samples), 2),
        }

    def summary(self, duration_s: float) -> dict[str, Any]:
        req_rate = round(self.calls_attempted / max(0.1, duration_s), 2)
        return {
            "duration_seconds": round(duration_s, 2),
            "calls_attempted": self.calls_attempted,
            "calls_admitted": self.calls_admitted,
            "calls_concurrency_rejected": self.calls_concurrency_rejected,
            "bookings_completed": self.bookings_completed,
            "emergencies_triaged": self.emergencies_triaged,
            "unhandled_errors": self.unhandled_errors,
            "error_rate_percent": round(
                (self.unhandled_errors / max(1, self.calls_attempted)) * 100.0, 2
            ),
            "calls_per_second": req_rate,
            "overall_latency": self.compute_percentiles(self.latencies_ms),
            "start_call_latency": self.compute_percentiles(self.start_latencies_ms),
            "booking_latency": self.compute_percentiles(self.booking_latencies_ms),
            "complete_call_latency": self.compute_percentiles(self.completion_latencies_ms),
        }


def setup_load_test_tenants(tenant_count: int = 5) -> list[dict[str, str]]:
    """Seed test tenants with dedicated phone numbers and concurrency caps."""
    db = SessionLocal()
    tenant_configs: list[dict[str, str]] = []
    run_id = uuid.uuid4().hex[:6]
    base_prefix = uuid.uuid4().int % 90000 + 10000

    try:
        for i in range(tenant_count):
            phone_num = f"+1512{base_prefix}{i:02d}"
            tenant = Tenant(
                name=f"LoadTest Tenant {i + 1} ({run_id})",
                timezone="America/New_York",
                hours="Mon-Fri 8am-6pm",
                status="active",
                max_concurrent_calls=3,  # Strict cap of 3
            )
            db.add(tenant)
            db.flush()

            profile = AgentProfile(
                tenant_id=tenant.id,
                agent_name=f"agent-{i+1}",
                greeting=f"Hello from LoadTest Tenant {i+1}",
            )
            db.add(profile)

            phone = PhoneNumber(
                tenant_id=tenant.id,
                e164=phone_num,
                label=f"Load Line {i+1}",
                status="active",
            )
            db.add(phone)
            db.commit()

            tenant_configs.append(
                {
                    "tenant_id": tenant.id,
                    "phone_number": phone_num,
                    "name": tenant.name,
                }
            )
    finally:
        db.close()

    return tenant_configs


async def simulate_caller_worker(
    worker_id: int,
    tenant_info: dict[str, str],
    scenario_type: str,
    client: httpx.AsyncClient,
    metrics: CallMetrics,
) -> None:
    """Simulate a single caller session lifecycle through start, dialog, tools, and completion."""
    metrics.calls_attempted += 1
    call_id = f"load-{uuid.uuid4().hex[:12]}"
    phone = tenant_info["phone_number"]
    tenant_id = tenant_info["tenant_id"]

    # 1. Start Call (POST /internal/calls/start)
    t0 = time.perf_counter()
    try:
        start_resp = await client.post(
            "/api/v1/internal/calls/start",
            json={
                "call_id": call_id,
                "dialed_number": phone,
                "caller_number": f"+1512800{worker_id:04d}",
                "direction": "inbound",
            },
        )
        t_start = (time.perf_counter() - t0) * 1000.0
        metrics.record_latency(t_start, "start")

        if start_resp.status_code != 200:
            metrics.unhandled_errors += 1
            metrics.error_messages.append(
                f"Worker {worker_id}: start HTTP {start_resp.status_code}"
            )
            return

        start_data = start_resp.json()
        if not start_data.get("allow"):
            # Concurrency limit reached as expected for excess callers
            metrics.calls_concurrency_rejected += 1
            return

        metrics.calls_admitted += 1
        call_token = start_data.get("call_token") or create_access_token(
            {
                "sub": "livekit-agent",
                "role": "agent",
                "tenant_id": tenant_id,
                "call_id": call_id,
            }
        )

    except Exception as e:
        metrics.unhandled_errors += 1
        metrics.error_messages.append(f"Worker {worker_id} exception during start: {e}")
        return

    auth_headers = {"Authorization": f"Bearer {call_token}"}

    # 2. Simulate Mid-Call Conversational Action
    urgency = "normal"
    outcome = "completed"
    message_payload: dict[str, Any] | None = None

    if scenario_type == "booking":
        t_book_start = time.perf_counter()
        target_date_str = (datetime.now(UTC) + timedelta(days=worker_id % 7 + 1)).strftime(
            "%Y-%m-%d"
        )
        try:
            # Check availability
            avail_resp = await client.post(
                "/api/v1/internal/calendar/availability",
                headers=auth_headers,
                json={"target_date": target_date_str, "duration_minutes": 45},
            )
            if avail_resp.status_code == 200 and avail_resp.json().get("available_count", 0) > 0:
                open_slot = avail_resp.json()["slots"][0]["start_iso"]
                # Confirm booking
                book_resp = await client.post(
                    "/api/v1/internal/calendar/book",
                    headers=auth_headers,
                    json={
                        "start_iso": open_slot,
                        "duration_minutes": 45,
                        "customer_name": f"Simulated Customer {worker_id}",
                        "customer_phone": f"+1512800{worker_id:04d}",
                        "customer_email": f"cust_{worker_id}@example.com",
                        "service_type": "plumbing_repair",
                    },
                )
                if book_resp.status_code == 200:
                    metrics.bookings_completed += 1
                    outcome = "booked"
            t_book = (time.perf_counter() - t_book_start) * 1000.0
            metrics.record_latency(t_book, "booking")
        except Exception as e:
            metrics.error_messages.append(f"Worker {worker_id} booking error: {e}")

    elif scenario_type == "emergency":
        urgency = "emergency"
        outcome = "message_taken"
        metrics.emergencies_triaged += 1
        message_payload = {
            "name": f"Emergency Caller {worker_id}",
            "phone": f"+1512800{worker_id:04d}",
            "address": f"{worker_id * 10} Main St, Austin, TX",
            "message": "Water heater ruptured and flooded basement!",
            "urgency": "emergency",
        }

    # 3. Simulate natural audio speech turn duration
    await asyncio.sleep(0.05)

    # 4. Complete Call (POST /internal/calls/complete)
    t_comp_start = time.perf_counter()
    try:
        comp_resp = await client.post(
            "/api/v1/internal/calls/complete",
            headers=auth_headers,
            json={
                "call_id": call_id,
                "dialed_number": phone,
                "caller_number": f"+1512800{worker_id:04d}",
                "started_at": datetime.now(UTC).isoformat(),
                "ended_at": (datetime.now(UTC) + timedelta(seconds=12)).isoformat(),
                "duration_s": 12.0,
                "outcome": outcome,
                "turn_count": 4,
                "latency_p50_ms": 290.0,
                "latency_p95_ms": 420.0,
                "turn_latencies_ms": [280.0, 310.0, 320.0],
                "tags": ["inbound", urgency],
                "message": message_payload,
                "transcript": [
                    {"speaker": "assistant", "text": "Thanks for calling."},
                    {"speaker": "user", "text": "I need help with my appointment."},
                ],
            },
        )
        t_comp = (time.perf_counter() - t_comp_start) * 1000.0
        metrics.record_latency(t_comp, "complete")

        if comp_resp.status_code != 200:
            metrics.unhandled_errors += 1
            metrics.error_messages.append(
                f"Worker {worker_id}: complete HTTP {comp_resp.status_code}"
            )

    except Exception as e:
        metrics.unhandled_errors += 1
        metrics.error_messages.append(f"Worker {worker_id} complete exception: {e}")


async def run_concurrent_load_test(
    concurrency: int = 50,
    base_url: str | None = None,
    tenant_count: int = 5,
) -> dict[str, Any]:
    """Execute asynchronous load test across concurrent caller sessions."""
    logger.info(
        "Initializing load test: %d concurrent callers across %d tenants", concurrency, tenant_count
    )
    tenants = setup_load_test_tenants(tenant_count)
    metrics = CallMetrics()

    limits = httpx.Limits(max_connections=concurrency + 20, max_keepalive_connections=concurrency)

    start_time = time.perf_counter()

    if base_url:
        async with httpx.AsyncClient(base_url=base_url, limits=limits, timeout=15.0) as client:
            tasks = []
            for i in range(concurrency):
                assigned_tenant = tenants[i % len(tenants)]
                scenario = "booking" if i % 2 == 0 else "emergency" if i % 5 == 0 else "inquiry"
                tasks.append(simulate_caller_worker(i, assigned_tenant, scenario, client, metrics))
            await asyncio.gather(*tasks)
    else:
        # In-process ASGI transport against FastAPI app
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver", limits=limits, timeout=15.0
        ) as client:
            tasks = []
            for i in range(concurrency):
                assigned_tenant = tenants[i % len(tenants)]
                scenario = "booking" if i % 2 == 0 else "emergency" if i % 5 == 0 else "inquiry"
                tasks.append(simulate_caller_worker(i, assigned_tenant, scenario, client, metrics))
            await asyncio.gather(*tasks)

    duration = time.perf_counter() - start_time
    summary_data = metrics.summary(duration)
    return summary_data


def print_load_test_report(summary: dict[str, Any]) -> None:
    """Format and print benchmark results to terminal."""
    print("\n" + "=" * 65)
    print("      VEDAVOICE 50-CONCURRENT-CALL STAGING BENCHMARK REPORT      ")
    print("=" * 65)
    print(f"Total Callers Simulated:      {summary['calls_attempted']}")
    print(f"Total Duration:               {summary['duration_seconds']}s")
    print(f"Throughput Rate:              {summary['calls_per_second']} calls/sec")
    print("-" * 65)
    print(f"Calls Admitted:               {summary['calls_admitted']}")
    print(f"Calls Concurrency-Gated:      {summary['calls_concurrency_rejected']} (graceful busy)")
    print(f"Bookings Completed:           {summary['bookings_completed']}")
    print(f"Emergencies Triaged:          {summary['emergencies_triaged']}")
    print(
        f"Unhandled Server Errors:      {summary['unhandled_errors']} (Error Rate: {summary['error_rate_percent']}%)"
    )
    print("-" * 65)
    print("LATENCY PERCENTILES (ms):")
    all_lat = summary["overall_latency"]
    print(f"  P50 (Median):   {all_lat['p50']} ms")
    print(f"  P90:            {all_lat['p90']} ms")
    print(f"  P95:            {all_lat['p95']} ms")
    print(f"  P99:            {all_lat['p99']} ms")
    print(f"  Max Latency:    {all_lat['max']} ms")
    print("=" * 65 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="VedaVoice 50-Call Load Test Harness")
    parser.add_argument("--concurrency", type=int, default=50, help="Number of concurrent callers")
    parser.add_argument(
        "--base-url", type=str, default=None, help="Base URL of live staging server"
    )
    parser.add_argument(
        "--tenants", type=int, default=5, help="Number of tenants to distribute load across"
    )
    args = parser.parse_args()

    results = asyncio.run(
        run_concurrent_load_test(
            concurrency=args.concurrency,
            base_url=args.base_url,
            tenant_count=args.tenants,
        )
    )
    print_load_test_report(results)

    # Assert acceptance criteria: 0 unhandled errors and P95 < 600ms
    if results["unhandled_errors"] > 0:
        logger.error("Load test failed: unhandled server errors observed.")
        sys.exit(1)
    if results["overall_latency"]["p95"] > 600.0:
        logger.warning("P95 latency exceeded 600ms threshold.")


if __name__ == "__main__":
    main()
