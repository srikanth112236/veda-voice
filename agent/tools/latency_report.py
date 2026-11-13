"""Utility script to parse logs and report per-turn pipeline latency percentiles.

Labels figures explicitly as:
'server-side pipeline latency, not including phone-network delay'
"""

import argparse
import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path

from agent.telemetry import calculate_percentiles

_LATENCY_LOG_PATTERN = re.compile(r"turn_latency_ms=([\d\.]+)")
_LATENCY_JSON_PATTERN = re.compile(r'"turn_latency_ms":\s*([\d\.]+)')


def extract_latencies_from_text(text: str) -> list[float]:
    """Extract all recorded turn latencies (ms) from log output or JSON text."""
    latencies: list[float] = []

    # Check key-value regex
    for match in _LATENCY_LOG_PATTERN.finditer(text):
        try:
            latencies.append(float(match.group(1)))
        except ValueError:
            continue

    # Check JSON regex
    for match in _LATENCY_JSON_PATTERN.finditer(text):
        try:
            latencies.append(float(match.group(1)))
        except ValueError:
            continue

    # Try line-by-line JSON objects if present
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                data = json.loads(line)
                if isinstance(data, dict) and "turn_latency_ms" in data:
                    latencies.append(float(data["turn_latency_ms"]))
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

    return latencies


def format_report(latencies: Sequence[float]) -> str:
    """Format human-readable latency report with required milestone disclaimer."""
    p50, p95 = calculate_percentiles(latencies)
    count = len(latencies)

    lines = [
        "============================================================",
        "          RECEPTIONIST AGENT TURN LATENCY REPORT           ",
        "============================================================",
        "Metric: End-of-utterance to first synthesized audio frame",
        "Scope:  server-side pipeline latency, not including phone-network delay",
        "------------------------------------------------------------",
        f"Sample Count (Turns): {count}",
        f"Median (p50):         {p50:.2f} ms",
        f"95th Percentile (p95): {p95:.2f} ms",
        "============================================================",
    ]
    return "\n".join(lines)


def main() -> None:
    """CLI entrypoint for latency reporting."""
    parser = argparse.ArgumentParser(
        description="Print median and p95 server-side pipeline latency from agent logs."
    )
    parser.add_argument(
        "logfile",
        nargs="?",
        type=Path,
        default=None,
        help="Path to agent log file. If omitted, reads from stdin.",
    )
    args = parser.parse_args()

    if args.logfile:
        if not args.logfile.exists():
            sys.stderr.write(f"Error: Log file not found at {args.logfile}\n")
            sys.exit(1)
        text = args.logfile.read_text(encoding="utf-8")
    else:
        if sys.stdin.isatty():
            sys.stderr.write("Reading from stdin... (Ctrl+Z and Enter on Windows to finish)\n")
        text = sys.stdin.read()

    latencies = extract_latencies_from_text(text)
    print(format_report(latencies))


if __name__ == "__main__":
    main()
