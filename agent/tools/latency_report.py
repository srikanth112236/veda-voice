"""Utility script to parse logs and report per-turn pipeline and end-to-end latency percentiles.

Shows the three stages separately:
  1. Stage 1: End-of-speech wait (EOU delay)
  2. Stage 2: LLM first token (TTFT)
  3. Stage 3: Voice first audio (TTS TTFB)
Alongside total server-side pipeline latency and library end-to-end latency.
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
# Stage patterns:
_EOU_LOG_PATTERN = re.compile(r"(?:eou_ms|end_of_utterance_ms)=([\d\.]+)")
_TTFT_LOG_PATTERN = re.compile(r"(?:ttft_ms|llm_ttft_ms)=([\d\.]+)")
_TTFB_LOG_PATTERN = re.compile(r"(?:tts_ttfb_ms|ttfb_ms)=([\d\.]+)")
# Matches LLM calls count per turn: llm_calls=(\d+)
_LLM_CALLS_LOG_PATTERN = re.compile(r"llm_calls=(\d+)")


def extract_metrics_from_text(
    text: str,
) -> tuple[list[float], list[float], list[float], list[float], list[float], int]:
    """Extract pipeline, e2e, and the three stages (EOU, TTFT, TTFB) from logs."""
    pipeline_latencies: list[float] = []
    e2e_latencies: list[float] = []
    eou_latencies: list[float] = []
    ttft_latencies: list[float] = []
    ttfb_latencies: list[float] = []
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

    for match in _EOU_LOG_PATTERN.finditer(text):
        try:
            val = float(match.group(1))
            if val > 0:
                eou_latencies.append(val)
        except ValueError:
            continue

    for match in _TTFT_LOG_PATTERN.finditer(text):
        try:
            val = float(match.group(1))
            if val > 0:
                ttft_latencies.append(val)
        except ValueError:
            continue

    for match in _TTFB_LOG_PATTERN.finditer(text):
        try:
            val = float(match.group(1))
            if val > 0:
                ttfb_latencies.append(val)
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
                    if "eou_ms" in data:
                        val = float(data["eou_ms"])
                        if val > 0:
                            eou_latencies.append(val)
                    if "ttft_ms" in data:
                        val = float(data["ttft_ms"])
                        if val > 0:
                            ttft_latencies.append(val)
                    if "tts_ttfb_ms" in data:
                        val = float(data["tts_ttfb_ms"])
                        if val > 0:
                            ttfb_latencies.append(val)
                    if "llm_calls" in data:
                        total_llm_calls += int(data["llm_calls"])
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

    return (
        pipeline_latencies,
        e2e_latencies,
        eou_latencies,
        ttft_latencies,
        ttfb_latencies,
        total_llm_calls,
    )


def format_report(
    pipeline_latencies: Sequence[float],
    e2e_latencies: Sequence[float],
    eou_latencies: Sequence[float] | None = None,
    ttft_latencies: Sequence[float] | None = None,
    ttfb_latencies: Sequence[float] | None = None,
    total_llm_calls: int = 0,
) -> str:
    """Format human-readable latency report with separate three stages and e2e figures."""
    pipe_p50, pipe_p95 = calculate_percentiles(pipeline_latencies)
    e2e_p50, e2e_p95 = calculate_percentiles(e2e_latencies)
    eou_p50, eou_p95 = calculate_percentiles(eou_latencies or [])
    ttft_p50, ttft_p95 = calculate_percentiles(ttft_latencies or [])
    ttfb_p50, ttfb_p95 = calculate_percentiles(ttfb_latencies or [])
    count = len(pipeline_latencies)

    lines = [
        "============================================================",
        "          RECEPTIONIST AGENT TURN LATENCY REPORT           ",
        "============================================================",
        "Three Distinct Turn Latency Stages:",
        f"  1. End-of-Speech Wait (EOU Delay): p50 = {eou_p50:>7.2f} ms | p95 = {eou_p95:>7.2f} ms",
        f"  2. LLM First Token (TTFT):         p50 = {ttft_p50:>7.2f} ms | p95 = {ttft_p95:>7.2f} ms",
        f"  3. Voice First Audio (TTS TTFB):   p50 = {ttfb_p50:>7.2f} ms | p95 = {ttfb_p95:>7.2f} ms",
        "------------------------------------------------------------",
        "Total Pipeline Latency (EOU + TTFT + TTFB):",
        f"  p50 (Median): {pipe_p50:>7.2f} ms",
        f"  p95:          {pipe_p95:>7.2f} ms",
        "  (server-side pipeline latency, not including phone-network delay)",
        "------------------------------------------------------------",
        "Library Measured End-to-End Latency:",
        f"  p50 (Median): {e2e_p50:>7.2f} ms",
        f"  p95:          {e2e_p95:>7.2f} ms",
        "------------------------------------------------------------",
        f"Spoken Turns Measured:    {count}",
        f"Total LLM Invocations:    {total_llm_calls}",
    ]

    # Target compliance check
    if pipe_p50 > 0:
        lines.append("------------------------------------------------------------")
        if pipe_p50 < 1000.0:
            lines.append("✓ Pipeline p50 target met (< 1000 ms)")
        else:
            lines.append(f"✗ Pipeline p50 target missed: {pipe_p50:.2f} ms (expected < 1000 ms)")

        if pipe_p95 < 1800.0:
            lines.append("✓ Pipeline p95 target met (< 1800 ms)")
        else:
            lines.append(f"✗ Pipeline p95 target missed: {pipe_p95:.2f} ms (expected < 1800 ms)")

    lines.append("============================================================")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint to parse file or stdin and output latency percentiles report."""
    parser = argparse.ArgumentParser(description="Parse turn latencies from agent logs.")
    parser.add_argument(
        "logfile",
        nargs="?",
        type=Path,
        help="Path to log file. If omitted, reads from standard input.",
    )
    args = parser.parse_args(argv)

    if args.logfile:
        if not args.logfile.exists():
            print(f"Error: Log file '{args.logfile}' not found.", file=sys.stderr)
            return 1
        text = args.logfile.read_text(encoding="utf-8", errors="replace")
    else:
        text = sys.stdin.read()

    pipe, e2e, eou, ttft, ttfb, llm_calls = extract_metrics_from_text(text)
    print(format_report(pipe, e2e, eou, ttft, ttfb, llm_calls))
    return 0


if __name__ == "__main__":
    sys.exit(main())
