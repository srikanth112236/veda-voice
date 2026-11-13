"""SIP attribute parsing, phone number redaction, and latency telemetry."""

import math
import re
from collections.abc import Mapping, Sequence

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
    if not phone or not phone.strip():
        return "[unknown]"

    clean = phone.strip()
    digits = _DIGIT_PATTERN.findall(clean)
    if not digits:
        return "[redacted]"

    if len(digits) <= 4:
        return "***"

    last_four = "".join(digits[-4:])
    return f"***-***-{last_four}"


def parse_sip_attributes(attributes: Mapping[str, str] | None) -> dict[str, str]:
    """Parse standard LiveKit SIP attributes from participant attributes mapping.

    LiveKit telephony sets:
      - sip.phoneNumber: caller's phone number (ANI)
      - sip.trunkPhoneNumber: dialed destination number (DID)
      - sip.callID: SIP Call-ID header

    Ref: https://docs.livekit.io/telephony/accepting-calls/inbound-trunk/
    """
    attrs = attributes or {}
    return {
        "caller_number": attrs.get("sip.phoneNumber", ""),
        "dialed_number": attrs.get("sip.trunkPhoneNumber", ""),
        "call_id": attrs.get("sip.callID", ""),
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
    """Tracks per-turn pipeline latencies (end of speech to first audio) during calls."""

    def __init__(self) -> None:
        self.turn_latencies_ms: list[float] = []

    def record_turn(self, latency_ms: float) -> None:
        """Record a single turn's server-side pipeline latency in milliseconds."""
        if latency_ms >= 0:
            self.turn_latencies_ms.append(latency_ms)

    def summary(self) -> dict[str, float | int]:
        """Return count, median (p50), and p95 summary in milliseconds."""
        p50, p95 = calculate_percentiles(self.turn_latencies_ms)
        return {
            "count": len(self.turn_latencies_ms),
            "median_ms": p50,
            "p95_ms": p95,
        }
