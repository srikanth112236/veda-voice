"""Utility script to parse logs and report per-turn pipeline and end-to-end latency percentiles.

Labels figures explicitly as:
'server-side pipeline latency (EOU + LLM TTFT + TTS TTFB), not including phone-network delay'
and reports the library's measured end-to-end latency alongside it.
"""

import argparse
import json
import re
import sys
from collections.abc import Sequence
from pathlib import Path

from agent.telemetry import calculate_percentiles

# Matches pipeline latency: turn_latency_ms=123.45 or pipeline_latency_ms=123.45
_PIPELINE_LOG_PATTERN = re.compile(r"(?:turn_latency_ms|pipeline_latency_ms)=([\d\.]+)")
# Matches library e2e latency: e2e_latency_ms=234.56 or e2e_ms=234.56
_E2E_LOG_PATTERN = re.compile(r"(?:e2e_latency_ms|e2e_ms)=([\d\.]+)")
# Matches LLM calls count per turn: llm_calls=(\d+)
_LLM_CALLS_LOG_PATTERN = re.compile(r"llm_calls=(\d+)")


def extract_metrics_from_text(text: str) -> tuple[list[float], list[float], int]:
    """Extract pipeline latencies, library e2e latencies, and total LLM calls from logs."""
    pipeline_latencies: list[float] = []
    e2e_latencies: list[float] = []
    total_llm_calls = 0

    for match in _PIPELINE_LOG_PATTERN.finditer(text):
        try:
            val = float(match.group(1))
            if val > 0:
                pipeline_latencies.append(val)
        except ValueError:
            continue

    for match in _E2E_LOG_PATTERN.finditer(text):
        try:
            val = float(match.group(1))
            if val > 0:
                e2e_latencies.append(val)
        except ValueError:
            continue

    for match in _LLM_CALLS_LOG_PATTERN.finditer(text):
        try:
            total_llm_calls += int(match.group(1))
        except ValueError:
            continue

    # Also parse structured JSON substrings or lines if present
    for line in text.splitlines():
        line = line.strip()
        idx = line.find("{")
        if idx != -1 and line.endswith("}"):
            json_part = line[idx:]
            try:
                data = json.loads(json_part)
                if isinstance(data, dict):
                    if "pipeline_latency_ms" in data:
                        val = float(data["pipeline_latency_ms"])
                        if val > 0:
                            pipeline_latencies.append(val)
                    elif "turn_latency_ms" in data:
                        val = float(data["turn_latency_ms"])
                        if val > 0:
                            pipeline_latencies.append(val)
                    if "e2e_latency_ms" in data:
                        val = float(data["e2e_latency_ms"])
                        if val > 0:
                            e2e_latencies.append(val)
                    if "llm_calls" in data:
                        total_llm_calls += int(data["llm_calls"])
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

    return pipeline_latencies, e2e_latencies, total_llm_calls


def format_report(
    pipeline_latencies: Sequence[float],
    e2e_latencies: Sequence[float],
    total_llm_calls: int = 0,
) -> str:
    """Format human-readable latency report with pipeline and e2e breakdowns."""
    pipe_p50, pipe_p95 = calculate_percentiles(pipeline_latencies)
    e2e_p50, e2e_p95 = calculate_percentiles(e2e_latencies)
    count = len(pipeline_latencies)

    lines = [
        "============================================================",
        "          RECEPTIONIST AGENT TURN LATENCY REPORT           ",
        "============================================================",
        "Metric 1: Pipeline Latency = EOU Delay + LLM TTFT + TTS TTFB",
        "          (server-side pipeline latency, not including phone-network delay)",
        "Metric 2: Library E2E Latency = time agent starts speaking - user stopped speaking",
        "------------------------------------------------------------",
        f"Spoken Turns Measured:    {count}",
        f"Total LLM Invocations:    {total_llm_calls or count}",
        "------------------------------------------------------------",
        "Pipeline Latency (EOU + TTFT + TTFB):",
        f"  Median (p50):           {pipe_p50:.2f} ms",
        f"  95th Percentile (p95):  {pipe_p95:.2f} ms",
        "Library End-to-End Latency:",
        f"  Median (p50):           {e2e_p50:.2f} ms",
        f"  95th Percentile (p95):  {e2e_p95:.2f} ms",
        "============================================================",
    ]
    return "\n".join(lines)


def main() -> None:
    """CLI entrypoint for latency reporting."""
    parser = argparse.ArgumentParser(
        description="Print pipeline and e2e latency percentiles from agent logs."
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

    pipe, e2e, llm_calls = extract_metrics_from_text(text)
    print(format_report(pipe, e2e, llm_calls))


if __name__ == "__main__":
    main()
