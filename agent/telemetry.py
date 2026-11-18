"""SIP attribute parsing, phone number redaction, and latency telemetry."""

import math
import re
from collections.abc import Mapping, Sequence
from typing import Any

# Regex matching phone digits for redaction
_DIGIT_PATTERN = re.compile(r"\d")


def redact_phone(phone: str | None) -> str:
    """Redact a phone number to only expose the last 4 digits for privacy and log safety.

    Examples:
        "+15551234567" -> "***-***-4567"
        "5551234567"   -> "***-***-4567"
        "123"          -> "***"
        None or ""     -> "[unknown]"
    """
    if not phone or not isinstance(phone, str) or not phone.strip():
        return "[unknown]"

    clean = phone.strip()
    digits = _DIGIT_PATTERN.findall(clean)
    if not digits:
        return "[redacted]"

    if len(digits) <= 4:
        return "***"

    last_four = "".join(digits[-4:])
    return f"***-***-{last_four}"


def parse_sip_attributes(attributes: Any) -> dict[str, str]:
    """Parse standard LiveKit SIP attributes from participant attributes mapping.

    LiveKit telephony sets:
      - sip.phoneNumber: caller's phone number (ANI)
      - sip.trunkPhoneNumber: dialed destination number (DID)
      - sip.callID: SIP Call-ID header

    Ref: https://docs.livekit.io/reference/telephony/sip-participant/
    """
    if not isinstance(attributes, dict | Mapping):
        return {
            "caller_number": "",
            "dialed_number": "",
            "call_id": "",
        }

    def _safe_str(val: Any) -> str:
        return str(val) if isinstance(val, str | int | float) else ""

    return {
        "caller_number": _safe_str(attributes.get("sip.phoneNumber", "")),
        "dialed_number": _safe_str(attributes.get("sip.trunkPhoneNumber", "")),
        "call_id": _safe_str(attributes.get("sip.callID", "")),
    }


def calculate_percentiles(values: Sequence[float]) -> tuple[float, float]:
    """Calculate median (p50) and 95th percentile (p95) from a sequence of numeric values.

    Returns:
        (median, p95) in the same unit as input (e.g. milliseconds).
        Returns (0.0, 0.0) if values is empty.
    """
    if not values:
        return 0.0, 0.0

    sorted_vals = sorted(values)
    n = len(sorted_vals)

    # Median (p50)
    mid = n // 2
    if n % 2 == 1:
        p50 = float(sorted_vals[mid])
    else:
        p50 = float((sorted_vals[mid - 1] + sorted_vals[mid]) / 2.0)

    # 95th percentile (nearest rank method)
    rank_95 = math.ceil(0.95 * n) - 1
    rank_95 = max(0, min(rank_95, n - 1))
    p95 = float(sorted_vals[rank_95])

    return round(p50, 2), round(p95, 2)


class LatencyTracker:
    """Tracks per-turn pipeline and end-to-end latencies during voice agent calls across all 3 stages."""

    def __init__(self) -> None:
        self.eou_latencies_ms: list[float] = []
        self.llm_ttft_latencies_ms: list[float] = []
        self.tts_ttfb_latencies_ms: list[float] = []
        self.pipeline_latencies_ms: list[float] = []
        self.library_e2e_latencies_ms: list[float] = []
        self.total_llm_calls: int = 0
        self.total_prompt_tokens: int = 0
        self.total_completion_tokens: int = 0
        self.total_tts_characters: int = 0

    def record_tokens(self, prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
        """Accumulate LLM prompt and completion tokens."""
        self.total_prompt_tokens += max(0, prompt_tokens)
        self.total_completion_tokens += max(0, completion_tokens)

    def record_tts_characters(self, characters_count: int = 0) -> None:
        """Accumulate synthesized TTS character count."""
        self.total_tts_characters += max(0, characters_count)

    def record_turn(
        self,
        pipeline_latency_ms: float,
        eou_delay_ms: float = 0.0,
        llm_ttft_ms: float = 0.0,
        tts_ttfb_ms: float = 0.0,
        library_e2e_ms: float | None = None,
        llm_calls: int = 1,
    ) -> None:
        """Record a single turn's latencies across all 3 stages plus e2e.

        Skips turns where pipeline_latency_ms is negative or zero.
        """
        if pipeline_latency_ms > 0:
            self.pipeline_latencies_ms.append(pipeline_latency_ms)
            if eou_delay_ms > 0:
                self.eou_latencies_ms.append(eou_delay_ms)
            if llm_ttft_ms > 0:
                self.llm_ttft_latencies_ms.append(llm_ttft_ms)
            if tts_ttfb_ms > 0:
                self.tts_ttfb_latencies_ms.append(tts_ttfb_ms)
            if library_e2e_ms is not None and library_e2e_ms > 0:
                self.library_e2e_latencies_ms.append(library_e2e_ms)
            self.total_llm_calls += max(0, llm_calls)

    def summary(self) -> dict[str, float | int]:
        """Return count, median (p50), and p95 summary for the three stages, pipeline, and e2e."""
        pipe_p50, pipe_p95 = calculate_percentiles(self.pipeline_latencies_ms)
        eou_p50, eou_p95 = calculate_percentiles(self.eou_latencies_ms)
        ttft_p50, ttft_p95 = calculate_percentiles(self.llm_ttft_latencies_ms)
        ttfb_p50, ttfb_p95 = calculate_percentiles(self.tts_ttfb_latencies_ms)
        e2e_p50, e2e_p95 = calculate_percentiles(self.library_e2e_latencies_ms)
        return {
            "turn_count": len(self.pipeline_latencies_ms),
            "total_llm_calls": self.total_llm_calls,
            "pipeline_median_ms": pipe_p50,
            "pipeline_p95_ms": pipe_p95,
            "eou_p50_ms": eou_p50,
            "eou_p95_ms": eou_p95,
            "ttft_p50_ms": ttft_p50,
            "ttft_p95_ms": ttft_p95,
            "ttfb_p50_ms": ttfb_p50,
            "ttfb_p95_ms": ttfb_p95,
            "e2e_median_ms": e2e_p50,
            "e2e_p95_ms": e2e_p95,
            "prompt_tokens": self.total_prompt_tokens,
            "completion_tokens": self.total_completion_tokens,
            "tts_characters": self.total_tts_characters,
        }

    def check_sla_compliance(
        self,
        target_eou_ms: float = 750.0,
        target_ttft_ms: float = 350.0,
        target_ttfb_ms: float = 250.0,
        target_pipeline_p95_ms: float = 1200.0,
    ) -> dict[str, Any]:
        """Evaluate call latencies against telephony SLA thresholds and identify bottleneck stages."""
        s = self.summary()
        breaches: list[str] = []
        bottleneck: str | None = None
        max_deviation = 0.0

        eou_p95 = float(s["eou_p95_ms"])
        ttft_p95 = float(s["ttft_p95_ms"])
        ttfb_p95 = float(s["ttfb_p95_ms"])
        pipe_p95 = float(s["pipeline_p95_ms"])

        if eou_p95 > target_eou_ms:
            breaches.append(f"EOU delay p95 ({eou_p95}ms > {target_eou_ms}ms)")
            dev = eou_p95 - target_eou_ms
            if dev > max_deviation:
                max_deviation = dev
                bottleneck = "STT_EOU"

        if ttft_p95 > target_ttft_ms:
            breaches.append(f"LLM TTFT p95 ({ttft_p95}ms > {target_ttft_ms}ms)")
            dev = ttft_p95 - target_ttft_ms
            if dev > max_deviation:
                max_deviation = dev
                bottleneck = "LLM_INFERENCE"

        if ttfb_p95 > target_ttfb_ms:
            breaches.append(f"TTS TTFB p95 ({ttfb_p95}ms > {target_ttfb_ms}ms)")
            dev = ttfb_p95 - target_ttfb_ms
            if dev > max_deviation:
                max_deviation = dev
                bottleneck = "TTS_SYNTHESIS"

        if pipe_p95 > target_pipeline_p95_ms and not breaches:
            breaches.append(f"Pipeline p95 ({pipe_p95}ms > {target_pipeline_p95_ms}ms)")
            bottleneck = "PIPELINE_ORCHESTRATION"

        return {
            "compliant": len(breaches) == 0,
            "breaches": breaches,
            "bottleneck_stage": bottleneck,
            "metrics": s,
        }


def check_sla_compliance(
    stt_latency_ms: float = 180.0,
    llm_ttft_ms: float = 220.0,
    tts_ttfb_ms: float = 180.0,
    target_eou_ms: float = 750.0,
    target_ttft_ms: float = 350.0,
    target_ttfb_ms: float = 250.0,
) -> dict[str, Any]:
    """Helper function to evaluate a single turn's component latencies against SLA targets."""
    tracker = LatencyTracker()
    total_ms = stt_latency_ms + llm_ttft_ms + tts_ttfb_ms
    tracker.record_turn(
        pipeline_latency_ms=total_ms,
        eou_delay_ms=stt_latency_ms,
        llm_ttft_ms=llm_ttft_ms,
        tts_ttfb_ms=tts_ttfb_ms,
    )
    res = tracker.check_sla_compliance(
        target_eou_ms=target_eou_ms,
        target_ttft_ms=target_ttft_ms,
        target_ttfb_ms=target_ttfb_ms,
    )
    return {
        "compliant": res["compliant"],
        "turn_latency_ms": round(total_ms, 1),
        "primary_bottleneck": res["bottleneck_stage"],
        "breaches": res["breaches"],
    }
