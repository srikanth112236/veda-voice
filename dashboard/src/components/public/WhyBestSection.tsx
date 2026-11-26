"use client";

import React from "react";
import { Check, Minus } from "lucide-react";

const COMPARISON_ROWS = [
  {
    capability: "Legal Recording Notice",
    vedavoice: "Always speaks your recording notice clearly on Turn 1 without getting cut off",
    legacy: "Often skipped or interrupted by background noise",
  },
  {
    capability: "Noisy Callers & Street Traffic",
    vedavoice: "Filters out wind, traffic, and TV noise while waiting for full sentences",
    legacy: "Cuts callers off mid-sentence or mishears words",
  },
  {
    capability: "Local Street & Brand Names",
    vedavoice: "Pre-tuned for your equipment brands, cities, and English + Spanish callers",
    legacy: "Struggles with accents, brands, and street names",
  },
  {
    capability: "Customer Data & Calendar Safety",
    vedavoice: "Strict per-business isolation and live double-booking prevention",
    legacy: "Shared spreadsheets or manual voicemail callbacks",
  },
  {
    capability: "Call Quality & Follow-Up",
    vedavoice: "Automatic 100-point quality score, customer satisfaction rating, and instant alert",
    legacy: "Raw call logs with zero quality checks",
  },
];

export function WhyBestSection() {
  return (
    <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-8">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            Why Businesses Switch
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
            Why VedaVoice outperforms voicemail and generic answering bots.
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <table className="w-full text-left text-xs data-table">
            <thead className="border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              <tr>
                <th className="px-5 py-3">What Matters</th>
                <th className="px-5 py-3 text-[var(--accent-signal)]">VedaVoice AI Receptionist</th>
                <th className="px-5 py-3">Voicemail &amp; Legacy Bots</th>
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
