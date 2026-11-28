#!/usr/bin/env python3
"""Sync local or offline call records to the production Azure PostgreSQL API.

Usage:
    python scripts/sync_calls_to_prod.py --prod-url https://api.<unique>.azurecontainerapps.io
    OR
    PROD_API_URL="https://..." python scripts/sync_calls_to_prod.py
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import jwt

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def sync_call_file(file_path: Path, prod_url: str, secret: str) -> bool:
    """Read a JSON call record file and post to /api/v1/internal/calls/complete."""
    try:
        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"[-] Could not read {file_path.name}: {e}")
        return False

    tenant_id = data.get("tenant_id") or "45124363-dcf6-4771-b569-e60f0d19bd0c"
    call_id = data.get("call_id") or file_path.stem

    token_payload = {
        "sub": "livekit-agent",
        "role": "agent",
        "tenant_id": tenant_id,
        "call_id": call_id,
        "exp": time.time() + 3600,
    }
    token = jwt.encode(token_payload, secret, algorithm="HS256")

    url = f"{prod_url.rstrip('/')}/api/v1/internal/calls/complete"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "CallSyncScript/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            if resp.status == 200:
                print(
                    f"[+] Synced {call_id} ({data.get('outcome', 'unknown')}, {data.get('duration_s', 0)}s) to {url}"
                )
                return True
            else:
                print(f"[-] Call {call_id} returned HTTP status {resp.status}")
                return False
    except Exception as e:
        print(f"[-] Failed to sync {call_id} to {url}: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync call records to production API")
    parser.add_argument(
        "--prod-url",
        default=os.getenv("PROD_API_URL") or os.getenv("API_BASE_URL", "http://127.0.0.1:8000"),
        help="Base URL of target API (e.g. https://api...azurecontainerapps.io)",
    )
    parser.add_argument(
        "--secret",
        default=os.getenv("JWT_SECRET", ""),
        help="JWT Secret used by the API (defaults to JWT_SECRET env var)",
    )
    parser.add_argument(
        "--calls-dir",
        default="data/calls",
        help="Path to calls directory",
    )
    args = parser.parse_args()

    prod_url = args.prod_url.rstrip("/")
    calls_dir = Path(args.calls_dir)
    secret = args.secret

    print("=== VedaVoice Call Sync to Production ===")
    print(f"Target API: {prod_url}")
    print(f"Source Directory: {calls_dir.resolve()}\n")

    json_files = list(calls_dir.glob("**/*.json"))
    if not json_files:
        print(f"No call record JSON files found in {calls_dir}")
        return

    success_count = 0
    for jf in sorted(json_files):
        if sync_call_file(jf, prod_url, secret):
            success_count += 1

    print(f"\nCompleted: Synced {success_count}/{len(json_files)} call records successfully.")


if __name__ == "__main__":
    main()
