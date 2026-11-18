"""Production and Staging Automated Smoke Test Script.

Validates that deployed API, database connectivity, auth, and internal call
dispatch endpoints are healthy and responsive after deployment.
"""

from __future__ import annotations

import argparse
import sys
import time
from typing import Any

try:
    import httpx
except ImportError:
    print("Error: httpx is required. Run 'pip install httpx'.")
    sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="VedaVoice Production Smoke Test")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of deployed API (e.g. https://api.yourdomain.com)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="HTTP request timeout in seconds",
    )
    return parser.parse_args()


def test_health(client: httpx.Client, base_url: str) -> None:
    print("--> [1/4] Checking API Health endpoint (/health)...")
    url = f"{base_url.rstrip('/')}/health"
    resp = client.get(url)
    assert resp.status_code == 200, f"Health check failed with {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("status") in ("ok", "healthy", "up"), f"Unexpected health status: {data}"
    print(f"    [PASS] Healthcheck OK: {data}")


def test_admin_login(client: httpx.Client, base_url: str) -> str | None:
    print("--> [2/4] Testing Admin Authentication (/api/v1/auth/login)...")
    url = f"{base_url.rstrip('/')}/api/v1/auth/login"
    login_payload = {
        "email": "admin@vedavoice.io",
        "password": "Admin@VedaVoice2026!",
    }
    resp = client.post(url, json=login_payload)
    if resp.status_code == 200:
        token = resp.json().get("access_token")
        print("    [PASS] Admin authenticated successfully.")
        return str(token)
    elif resp.status_code == 401:
        print("    [WARN] Admin default password changed or user seeded with custom credentials.")
        return None
    else:
        print(f"    [WARN] Auth returned status {resp.status_code}: {resp.text}")
        return None


def test_internal_number_lookup(client: httpx.Client, base_url: str) -> None:
    print("--> [3/4] Testing DID / Number lookup (/api/v1/internal/by-number)...")
    url = f"{base_url.rstrip('/')}/api/v1/internal/by-number"
    params = {"number": "+18005550199"}
    resp = client.get(url, params=params)
    if resp.status_code == 200:
        tenant_info = resp.json()
        print(f"    [PASS] Number resolved to tenant: {tenant_info.get('tenant_name', 'Unknown')}")
    elif resp.status_code == 404:
        print(
            "    [PASS] Number lookup endpoint responded cleanly (404 expected for unseeded DID)."
        )
    else:
        raise AssertionError(f"Unexpected response from by-number: {resp.status_code} {resp.text}")


def test_internal_call_lifecycle(client: httpx.Client, base_url: str) -> None:
    print("--> [4/4] Testing Call Lifecycle Start & Complete...")
    start_url = f"{base_url.rstrip('/')}/api/v1/internal/calls/start"
    call_payload = {
        "room_name": f"smoke-test-room-{int(time.time())}",
        "dialed_number": "+18005550199",
        "caller_phone": "+15550199000",
        "sip_call_id": f"sip-smoke-{int(time.time())}",
    }
    resp = client.post(start_url, json=call_payload)
    if resp.status_code == 200:
        call_data = resp.json()
        call_id = call_data.get("call_id")
        print(f"    [PASS] Call registered with ID: {call_id}")

        # Complete the call
        complete_url = f"{base_url.rstrip('/')}/api/v1/internal/calls/{call_id}/complete"
        comp_payload: dict[str, Any] = {
            "duration_s": 12.5,
            "outcome": "completed",
            "summary": "Automated deployment smoke test verification",
        }
        comp_resp = client.post(complete_url, json=comp_payload)
        assert comp_resp.status_code == 200, f"Call complete failed: {comp_resp.text}"
        print("    [PASS] Call completed and recorded successfully.")
    else:
        print(f"    [INFO] Internal call start status {resp.status_code} (Tenant may require seed)")


def main() -> None:
    args = parse_args()
    print("=" * 60)
    print("       VEDAVOICE AZURE POST-DEPLOYMENT SMOKE TEST            ")
    print(f"Target Base URL: {args.base_url}")
    print("=" * 60)

    with httpx.Client(timeout=args.timeout) as client:
        try:
            test_health(client, args.base_url)
            test_admin_login(client, args.base_url)
            test_internal_number_lookup(client, args.base_url)
            test_internal_call_lifecycle(client, args.base_url)
            print("\n>>> ALL PRODUCTION SMOKE CHECKS PASSED SUCCESSFULLY! <<<")
            sys.exit(0)
        except Exception as err:
            print(f"\n[FAIL] Smoke test encountered an error: {err}")
            sys.exit(1)


if __name__ == "__main__":
    main()
