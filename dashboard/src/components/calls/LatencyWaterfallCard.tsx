"use client";

import React from "react";
import { Zap } from "lucide-react";

interface LatencyWaterfallCardProps {
  latencyP50Ms: number;
  latencyP95Ms: number;
  eouP50Ms?: number;
  ttftP50Ms?: number;
  ttfbP50Ms?: number;
  infoTrigger?: React.ReactNode;
}

export function LatencyWaterfallCard({
  latencyP50Ms,
  latencyP95Ms,
  eouP50Ms = 0,
  ttftP50Ms = 0,
  ttfbP50Ms = 0,
  infoTrigger,
}: LatencyWaterfallCardProps) {
  const hasTelemetry =
    latencyP50Ms > 0 || eouP50Ms > 0 || ttftP50Ms > 0 || ttfbP50Ms > 0;

  const eouVal = eouP50Ms > 0 ? Math.round(eouP50Ms) : 750;
  const ttfbVal = ttfbP50Ms > 0 ? Math.round(ttfbP50Ms) : 200;
  const ttftVal =
    ttftP50Ms > 0
      ? Math.round(ttftP50Ms)
      : Math.max(0, Math.round(latencyP50Ms - (eouVal + ttfbVal)));

  const total = Math.max(1, eouVal + ttftVal + ttfbVal);

  const stages = [
    {
      label: "1. End-of-Utterance (Silero VAD + Turn)",
      ms: eouVal,
      estimated: eouP50Ms <= 0,
      barClass: "bg-sky-600",
    },
    {
      label: "2. LLM First Token (Gemini 2.5 Flash)",
      ms: ttftVal,
      estimated: ttftP50Ms <= 0,
      barClass: "bg-indigo-600",
    },
    {
      label: "3. Voice Synthesis TTFB (Inworld TTS)",
      ms: ttfbVal,
      estimated: ttfbP50Ms <= 0,
      barClass: "bg-emerald-600",
    },
  ];

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-xs font-bold text-[var(--ink-primary)]">
            3-Stage Telephony Latency Waterfall
          </span>
          {infoTrigger}
        </div>
        <span className="text-[11px] font-mono tabular-nums text-[var(--ink-secondary)]">
          P50:{" "}
          <span className="font-bold text-emerald-700">
            {Math.round(latencyP50Ms)}ms
          </span>{" "}
          | P95:{" "}
          <span className="font-bold text-amber-700">
            {Math.round(latencyP95Ms)}ms
          </span>
        </span>
      </div>

      {!hasTelemetry ? (
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 font-mono text-[11px] text-[var(--ink-muted)]">
          No per-turn latency telemetry recorded for this call.
        </div>
      ) : (
        <div className="space-y-2 font-mono text-xs tabular-nums">
          {stages.map((s) => {
            const pct = Math.max(4, Math.min(100, Math.round((s.ms / total) * 100)));
            return (
              <div
                key={s.label}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--ink-secondary)]">
                    {s.label}
                  </span>
                  <span className="font-bold text-[var(--ink-primary)]">
                    {s.estimated ? `~${s.ms} ms (est)` : `${s.ms} ms`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                  <div
                    className={`h-full rounded-full ${s.barClass}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
