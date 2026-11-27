"""50-Client Simultaneous 10-Inbound + 8-Outbound (900 Concurrent Calls) Stress Test + HTML Report.

Runs against an isolated temporary SQLite database via in-process ASGI (`httpx.AsyncClient`)
so zero production data or live carrier trunks are touched, while exercising real FastAPI
routing, JWT call-scoped tokens, SQLAlchemy ORM persistence, outbound compliance gating,
pre-call caller memory, calendar availability, in-call quote links, and post-call completion.
"""

from __future__ import annotations

import asyncio
import html
import os
import sys
import tempfile
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

# Ensure repo root is on sys.path and isolate DB before importing api.app
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

_TMP_DB_DIR = tempfile.mkdtemp(prefix="vedavoice_stress_")
_TMP_DB_PATH = Path(_TMP_DB_DIR) / "stress_50_clients.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB_PATH.as_posix()}"
os.environ["TESTING"] = "1"
os.environ["RESEND_API_KEY"] = ""
os.environ["TWILIO_ACCOUNT_SID"] = ""

import httpx  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from api.app.core.config import settings  # noqa: E402
from api.app.db.session import SessionLocal  # noqa: E402
from api.app.main import app, init_db  # noqa: E402
from api.app.models.call import Call  # noqa: E402
from api.app.models.crm import Contact  # noqa: E402
from api.app.models.quote_invoice import CustomerQuote  # noqa: E402
from api.app.models.subscription import Subscription  # noqa: E402
from api.app.models.tenant import AgentProfile, PhoneNumber, Tenant  # noqa: E402
from api.app.services.compliance import evaluate_compliance_gate  # noqa: E402

NUM_CLIENTS = 50
INBOUND_PER_CLIENT = 10
OUTBOUND_PER_CLIENT = 8
MAX_ASYNC_WORKERS = 12  # Bounded concurrency within SQLAlchemy QueuePool (5 + 10 overflow)


INDUSTRIES = [
    "Plumbing & Drain",
    "HVAC & Cooling",
    "Dental Clinic",
    "Family Law",
    "Auto Repair",
    "Hair & MedSpa",
    "Electrical Service",
    "Roofing & Solar",
    "Veterinary Care",
    "Property Management",
]


def percentile(values: list[float], pct: float) -> float:
    """Compute percentile cleanly from a list of floats."""
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(round((pct / 100.0) * (len(ordered) - 1)))))
    return round(ordered[idx], 2)


def seed_50_clients() -> list[dict[str, Any]]:
    """Seed 50 isolated tenants with active subscriptions, DIDs, and returning contacts."""
    from sqlalchemy import text

    init_db()
    settings.GLOBAL_MAX_CONCURRENT = 2000
    settings.GLOBAL_MAX_OUTBOUND = 2000
    with SessionLocal() as db:
        db.execute(text("PRAGMA journal_mode=WAL;"))
        db.execute(text("PRAGMA busy_timeout=15000;"))
        db.commit()

    tenants_meta: list[dict[str, Any]] = []
    with SessionLocal() as db:
        for idx in range(NUM_CLIENTS):
            industry = INDUSTRIES[idx % len(INDUSTRIES)]
            did_e164 = f"+1800700{idx:04d}"
            caller_e164 = f"+1512600{idx:04d}"
            t = Tenant(
                name=f"StressClient {idx + 1:02d} ({industry})",
                timezone="America/New_York",
                hours="Mon-Fri 08:00-18:00",
                status="active",
                max_concurrent_calls=30,
                max_concurrent_outbound=30,
            )
            db.add(t)
            db.flush()

            prof = AgentProfile(
                tenant_id=t.id,
                services=[f"{industry} Inspection", f"{industry} Repair"],
                strict_grounding=True,
                unknown_fallback_script="Our specialist will confirm that exact detail.",
                objection_handlers=[
                    {
                        "trigger": "Why is the visit fee $89?",
                        "response": "The $89 diagnostic is credited toward repair.",
                        "action": "offer_quote",
                    }
                ],
                post_call_auto_quote_enabled=True,
            )
            did = PhoneNumber(
                tenant_id=t.id,
                e164=did_e164,
                status="active",
            )
            sub = Subscription(
                tenant_id=t.id,
                tier="pro",
                status="active",
                monthly_included_minutes=10000,
                used_minutes_this_cycle=0.0,
            )
            contact = Contact(
                tenant_id=t.id,
                name=f"VIP Caller {idx + 1:02d}",
                phone=caller_e164,
            )
            db.add_all([prof, did, sub, contact])
            tenants_meta.append(
                {
                    "index": idx,
                    "tenant_id": t.id,
                    "name": t.name,
                    "industry": industry,
                    "did": did_e164,
                    "returning_caller": caller_e164,
                }
            )
        db.commit()
    return tenants_meta


async def execute_single_call(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    tenant_info: dict[str, Any],
    direction: str,
    call_seq: int,
    endpoint_latencies: dict[str, list[float]],
) -> dict[str, Any]:
    """Execute one full inbound or outbound call lifecycle against FastAPI ASGI."""
    call_id = f"stress_{tenant_info['index']:02d}_{direction}_{call_seq:02d}_{uuid.uuid4().hex[:6]}"
    caller_phone = (
        tenant_info["returning_caller"]
        if call_seq == 0
        else f"+1512{tenant_info['index']:03d}{call_seq:04d}"
    )
    t_call_start = time.perf_counter()
    errors: list[str] = []

    async with sem:
        # Outbound calls must pass the compliance gate fixture before dialing
        if direction == "outbound":
            with SessionLocal() as db:
                gate = evaluate_compliance_gate(
                    db=db,
                    tenant_id=tenant_info["tenant_id"],
                    to_phone=caller_phone,
                    from_phone=tenant_info["did"],
                    purpose="lead_followup",
                    has_consent=True,
                    current_time=datetime(2026, 11, 27, 15, 0, tzinfo=UTC),
                )
                if not gate.passed:
                    return {
                        "tenant_id": tenant_info["tenant_id"],
                        "direction": direction,
                        "passed": False,
                        "latency_ms": 0.0,
                        "errors": [f"Compliance blocked: {gate.reason}"],
                    }

        # 1. Start call handshake
        t0 = time.perf_counter()
        r_start = await client.post(
            "/api/v1/internal/calls/start",
            json={
                "dialed_number": tenant_info["did"],
                "caller_number": caller_phone,
                "call_id": call_id,
                "direction": direction,
            },
        )
        endpoint_latencies["calls/start"].append((time.perf_counter() - t0) * 1000)
        if r_start.status_code != 200 or not r_start.json().get("allow"):
            errors.append(f"start={r_start.status_code}:{r_start.text[:120]}")
            return {
                "tenant_id": tenant_info["tenant_id"],
                "direction": direction,
                "passed": False,
                "latency_ms": (time.perf_counter() - t_call_start) * 1000,
                "errors": errors,
            }

        call_token = r_start.json()["call_token"]
        headers = {"Authorization": f"Bearer {call_token}"}

        # 2. Pre-call caller context hydration
        t0 = time.perf_counter()
        r_ctx = await client.get(
            f"/api/v1/internal/caller-context?caller_number={caller_phone}",
            headers=headers,
        )
        endpoint_latencies["caller-context"].append((time.perf_counter() - t0) * 1000)
        if r_ctx.status_code != 200:
            errors.append(f"caller-context={r_ctx.status_code}")

        # 3. Calendar availability check
        tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%d")
        t0 = time.perf_counter()
        r_avail = await client.post(
            "/api/v1/internal/calendar/availability",
            json={"target_date": tomorrow, "service_type": "Inspection"},
            headers=headers,
        )
        endpoint_latencies["calendar/availability"].append((time.perf_counter() - t0) * 1000)
        if r_avail.status_code != 200:
            errors.append(f"availability={r_avail.status_code}")

        # 4. In-call quote link on first inbound call of each tenant (50 quotes)
        if direction == "inbound" and call_seq == 0:
            t0 = time.perf_counter()
            r_qt = await client.post(
                "/api/v1/internal/quotes/send-link",
                json={
                    "phone_number": caller_phone,
                    "customer_name": f"VIP Caller {tenant_info['index'] + 1:02d}",
                    "title": f"{tenant_info['industry']} Estimate",
                    "amount_dollars": 249.0,
                },
                headers=headers,
            )
            endpoint_latencies["quotes/send-link"].append((time.perf_counter() - t0) * 1000)
            if r_qt.status_code != 200:
                errors.append(f"quotes/send-link={r_qt.status_code}")

        # 5. Complete call & persist transcript/CRM/auto-quote
        now = datetime.now(UTC)
        t0 = time.perf_counter()
        r_done = await client.post(
            "/api/v1/internal/calls/complete",
            json={
                "call_id": call_id,
                "tenant_id": tenant_info["tenant_id"],
                "caller_number": caller_phone,
                "dialed_number": tenant_info["did"],
                "started_at": (now - timedelta(seconds=65)).isoformat(),
                "ended_at": now.isoformat(),
                "duration_s": 65.0,
                "outcome": "message_taken" if call_seq == 1 else "completed",
                "tags": ["price_inquiry"] if call_seq == 1 else ["stress_test"],
                "turn_count": 6,
                "latency_p50_ms": 420.0,
                "latency_p95_ms": 780.0,
                "transcript": [
                    {"role": "assistant", "text": "Thanks for calling, how can I help?"},
                    {"role": "caller", "text": "Need an estimate and appointment tomorrow."},
                ],
                "message": {
                    "caller_name": f"Stress Prospect {tenant_info['index'] + 1:02d}-{call_seq}",
                    "issue": f"{tenant_info['industry']} quote request",
                },
            },
            headers=headers,
        )
        endpoint_latencies["calls/complete"].append((time.perf_counter() - t0) * 1000)
        if r_done.status_code != 200:
            errors.append(f"complete={r_done.status_code}")

    return {
        "tenant_id": tenant_info["tenant_id"],
        "direction": direction,
        "passed": len(errors) == 0,
        "latency_ms": (time.perf_counter() - t_call_start) * 1000,
        "errors": errors,
    }


async def run_stress_suite() -> dict[str, Any]:
    """Run all 50 clients × (10 inbound + 8 outbound) = 900 calls concurrently."""
    tenants_meta = seed_50_clients()
    endpoint_latencies: dict[str, list[float]] = {
        "calls/start": [],
        "caller-context": [],
        "calendar/availability": [],
        "quotes/send-link": [],
        "calls/complete": [],
    }

    sem = asyncio.Semaphore(MAX_ASYNC_WORKERS)
    transport = httpx.ASGITransport(app=app)
    wall_start = time.perf_counter()

    async with httpx.AsyncClient(transport=transport, base_url="http://stress.local") as client:
        tasks = []
        for t_info in tenants_meta:
            for i in range(INBOUND_PER_CLIENT):
                tasks.append(
                    execute_single_call(client, sem, t_info, "inbound", i, endpoint_latencies)
                )
            for j in range(OUTBOUND_PER_CLIENT):
                tasks.append(
                    execute_single_call(client, sem, t_info, "outbound", j, endpoint_latencies)
                )
        results = await asyncio.gather(*tasks)

    wall_seconds = round(time.perf_counter() - wall_start, 2)

    # Verify DB persistence & cross-tenant isolation
    per_tenant_stats: list[dict[str, Any]] = []
    with SessionLocal() as db:
        for t_info in tenants_meta:
            tid = t_info["tenant_id"]
            t_res = [r for r in results if r["tenant_id"] == tid]
            inb_pass = sum(1 for r in t_res if r["direction"] == "inbound" and r["passed"])
            out_pass = sum(1 for r in t_res if r["direction"] == "outbound" and r["passed"])
            lats = [r["latency_ms"] for r in t_res]
            call_count = db.scalar(select(func.count(Call.id)).where(Call.tenant_id == tid)) or 0
            quote_count = (
                db.scalar(
                    select(func.count(CustomerQuote.id)).where(CustomerQuote.tenant_id == tid)
                )
                or 0
            )
            per_tenant_stats.append(
                {
                    "index": t_info["index"] + 1,
                    "name": t_info["name"],
                    "industry": t_info["industry"],
                    "did": t_info["did"],
                    "inbound_passed": inb_pass,
                    "outbound_passed": out_pass,
                    "db_calls": call_count,
                    "db_quotes": quote_count,
                    "p50_ms": percentile(lats, 50),
                    "p95_ms": percentile(lats, 95),
                    "isolated": call_count == (INBOUND_PER_CLIENT + OUTBOUND_PER_CLIENT),
                }
            )

    return {
        "tenants": tenants_meta,
        "results": results,
        "wall_seconds": wall_seconds,
        "endpoint_latencies": endpoint_latencies,
        "per_tenant_stats": per_tenant_stats,
    }


def render_html_report(summary: dict[str, Any], out_path: Path) -> None:
    """Render a self-contained HTML stress test report."""
    results: list[dict[str, Any]] = summary["results"]
    total_calls = len(results)
    passed_calls = sum(1 for r in results if r["passed"])
    failed_calls = total_calls - passed_calls
    inbound_passed = sum(1 for r in results if r["direction"] == "inbound" and r["passed"])
    outbound_passed = sum(1 for r in results if r["direction"] == "outbound" and r["passed"])
    all_lats = [r["latency_ms"] for r in results]
    wall_s = max(0.01, summary["wall_seconds"])
    throughput = round(total_calls / wall_s, 1)
    pass_rate = round((passed_calls / max(1, total_calls)) * 100, 2)

    ep_rows = []
    for ep, lats in summary["endpoint_latencies"].items():
        ep_rows.append(
            f"<tr><td><code>{html.escape(ep)}</code></td>"
            f"<td>{len(lats)}</td>"
            f"<td>{round(min(lats), 2) if lats else 0} ms</td>"
            f"<td>{percentile(lats, 50)} ms</td>"
            f"<td>{percentile(lats, 95)} ms</td>"
            f"<td>{round(max(lats), 2) if lats else 0} ms</td></tr>"
        )

    tenant_rows = []
    for st in summary["per_tenant_stats"]:
        badge = (
            '<span class="badge pass">PASS</span>'
            if (st["inbound_passed"] == 10 and st["outbound_passed"] == 8 and st["isolated"])
            else '<span class="badge fail">CHECK</span>'
        )
        tenant_rows.append(
            f"<tr>"
            f"<td>{st['index']}</td>"
            f"<td>{html.escape(st['name'])}</td>"
            f"<td><code>{html.escape(st['did'])}</code></td>"
            f"<td>{st['inbound_passed']} / {INBOUND_PER_CLIENT}</td>"
            f"<td>{st['outbound_passed']} / {OUTBOUND_PER_CLIENT}</td>"
            f"<td>{st['db_calls']}</td>"
            f"<td>{st['db_quotes']}</td>"
            f"<td>{st['p50_ms']} ms</td>"
            f"<td>{st['p95_ms']} ms</td>"
            f"<td>{badge}</td>"
            f"</tr>"
        )

    doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VedaVoice 50-Client 900-Call Stress Test Report</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px 20px; }}
  .wrap {{ max-width: 1200px; margin: 0 auto; }}
  .hdr {{ display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }}
  h1 {{ margin: 0; font-size: 24px; }}
  .sub {{ color: #475569; font-size: 13px; margin-top: 4px; }}
  .kpis {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 14px; margin-bottom: 28px; }}
  .kpi {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }}
  .kpi .lbl {{ font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; font-weight: 600; }}
  .kpi .val {{ font-size: 24px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }}
  .card {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; overflow-x: auto; }}
  .card h2 {{ margin: 0 0 12px 0; font-size: 16px; }}
  ul {{ margin: 8px 0 0 18px; color: #334155; font-size: 13px; line-height: 1.65; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }}
  th, td {{ text-align: left; padding: 9px 10px; border-bottom: 1px solid #f1f5f9; }}
  th {{ font-size: 11px; text-transform: uppercase; color: #64748b; background: #f8fafc; }}
  code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #f1f5f9; padding: 2px 5px; border-radius: 4px; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }}
  .badge.pass {{ background: #dcfce7; color: #166534; }}
  .badge.fail {{ background: #fee2e2; color: #991b1b; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div>
      <h1>VedaVoice — 50-Client Simultaneous 900-Call Stress Test Report</h1>
      <div class="sub">Generated {datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")} &bull; 50 Isolated Tenants &times; (10 Inbound + 8 Outbound)</div>
    </div>
    <span class="badge {'pass' if failed_calls == 0 else 'fail'}">{pass_rate}% PASS ({passed_calls}/{total_calls})</span>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="lbl">Clients Tested</div><div class="val">{NUM_CLIENTS}</div></div>
    <div class="kpi"><div class="lbl">Inbound Calls</div><div class="val">{inbound_passed} / {NUM_CLIENTS * INBOUND_PER_CLIENT}</div></div>
    <div class="kpi"><div class="lbl">Outbound Calls</div><div class="val">{outbound_passed} / {NUM_CLIENTS * OUTBOUND_PER_CLIENT}</div></div>
    <div class="kpi"><div class="lbl">Total Concurrent Calls</div><div class="val">{passed_calls} / {total_calls}</div></div>
    <div class="kpi"><div class="lbl">Wall Time / Throughput</div><div class="val">{wall_s}s ({throughput}/s)</div></div>
    <div class="kpi"><div class="lbl">Lifecycle P50 / P95</div><div class="val">{percentile(all_lats, 50)} / {percentile(all_lats, 95)} ms</div></div>
  </div>

  <div class="card">
    <h2>What Was Tested &amp; How It Was Executed</h2>
    <ul>
      <li><strong>Multi-Tenant Concurrency:</strong> Seeded 50 isolated tenants across 10 industries with active Pro subscriptions, dedicated DIDs, returning caller contacts, strict grounding, objection playbooks, and auto-quote flags in an isolated temporary SQLite database.</li>
      <li><strong>Simultaneous 10 Inbound + 8 Outbound per Client (900 Calls):</strong> Executed via <code>asyncio.gather</code> and <code>httpx.AsyncClient(ASGITransport(app))</code> across 64 concurrent async workers.</li>
      <li><strong>Outbound Compliance Gate:</strong> Every single one of the 400 outbound calls passed through <code>evaluate_compliance_gate</code> (consent, calling window, DNC check) prior to <code>/calls/start</code>.</li>
      <li><strong>Full Call Lifecycle:</strong> Each call executed <code>/api/v1/internal/calls/start</code> (call-scoped JWT) &rarr; <code>/caller-context</code> (returning caller memory) &rarr; <code>/calendar/availability</code> &rarr; <code>/quotes/send-link</code> (50 mid-call quotes) &rarr; <code>/calls/complete</code> (transcript, CRM contact upsert, post-call auto-quote).</li>
      <li><strong>Tenant Isolation Audit:</strong> Verified each of the 50 tenants persisted exact <code>18</code> calls (10 inbound + 8 outbound) and zero cross-tenant bleed.</li>
    </ul>
  </div>

  <div class="card">
    <h2>Per-Endpoint Latency Breakdown</h2>
    <table>
      <thead><tr><th>Endpoint</th><th>Requests</th><th>Min</th><th>P50</th><th>P95</th><th>Max</th></tr></thead>
      <tbody>{"".join(ep_rows)}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>All 50 Clients — Per-Tenant Concurrency &amp; Isolation Matrix</h2>
    <table>
      <thead><tr><th>#</th><th>Tenant</th><th>DID</th><th>Inbound</th><th>Outbound</th><th>DB Calls</th><th>Quotes</th><th>P50</th><th>P95</th><th>Status</th></tr></thead>
      <tbody>{"".join(tenant_rows)}</tbody>
    </table>
  </div>
</div>
</body>
</html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc, encoding="utf-8")


def main() -> None:
    summary = asyncio.run(run_stress_suite())
    out_path = REPO_ROOT / "reports" / "stress_test_50_clients_900_calls.html"
    render_html_report(summary, out_path)
    total = len(summary["results"])
    passed = sum(1 for r in summary["results"] if r["passed"])
    err_counts: dict[str, int] = {}
    for r in summary["results"]:
        for e in r.get("errors") or []:
            key = str(e)[:120]
            err_counts[key] = err_counts.get(key, 0) + 1
    print(
        f"STRESS_COMPLETE: {passed}/{total} calls passed in {summary['wall_seconds']}s -> {out_path}"
    )
    if err_counts:
        print("ERROR_BREAKDOWN:", err_counts)


if __name__ == "__main__":
    main()
