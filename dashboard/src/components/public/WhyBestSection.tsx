"use client";

import React from "react";
import { Check, Minus } from "lucide-react";

const COMPARISON_ROWS = [
  {
    capability: "Turn-1 Legal / TCPA Disclosure",
    vedavoice: "Locked non-interruptible audio + automated Turn-1 verification",
    legacy: "Skipped or truncated on barge-in",
  },
  {
    capability: "Noisy Caller Handling",
    vedavoice: "LiveKit BVC / BVCTelephony noise shield + semantic turn detector",
    legacy: "Basic VAD splits sentences on background static",
  },
  {
    capability: "Domain Jargon & Street Names",
    vedavoice: "Deepgram Nova-3 with up to 50 tenant keyterms + bilingual multi STT",
    legacy: "Generic transcription mishears equipment & addresses",
  },
  {
    capability: "Database & Calendar Isolation",
    vedavoice: "PostgreSQL RLS + call-scoped tokens (worker never touches DB)",
    legacy: "Shared prompt context or unguarded API keys",
  },
  {
    capability: "Post-Call Accountability",
    vedavoice: "3-stage EOU/TTFT/TTFB waterfall + 100-pt QA rubric + CSAT",
    legacy: "Transcript dump with no objective QA scoring",
  },
];

export function WhyBestSection() {
  return (
    <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-8">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            Engineering Comparison
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
            Why VedaVoice outperforms generic voice bots on live phone lines.
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <table className="w-full text-left text-xs data-table">
            <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              <tr>
                <th className="px-5 py-3">Capability</th>
                <th className="px-5 py-3 text-[var(--accent-signal)]">VedaVoice Platform</th>
                <th className="px-5 py-3">Legacy IVR / Generic Bots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.capability}>
                  <td className="px-5 py-4 font-semibold text-[var(--ink-primary)]">
                    {row.capability}
                  </td>
                  <td className="px-5 py-4 text-[var(--ink-primary)]">
                    <span className="inline-flex items-start gap-2">
                      <Check className="h-4 w-4 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                      <span>{row.vedavoice}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[var(--ink-muted)]">
                    <span className="inline-flex items-start gap-2">
                      <Minus className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{row.legacy}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
