"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, ArrowRight, Pause, Play } from "lucide-react";
import { CURATED_SCENARIO_POOL, CuratedTickerItem } from "@/data/curated-scenarios";
import { useLeadModal } from "@/context/lead-modal-context";

export function CuratedScenarioTicker() {
  const { openLeadModal } = useLeadModal();
  const [items, setItems] = useState<CuratedTickerItem[]>(CURATED_SCENARIO_POOL);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Randomize starting order on client mount so each visit surfaces fresh curated items
  useEffect(() => {
    const shuffled = [...CURATED_SCENARIO_POOL];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setItems(shuffled);
    setIndex(0);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  const current = items[index] ?? CURATED_SCENARIO_POOL[0];

  const badgeClass =
    current.kind === "EARLY-BIRD OFFER"
      ? "bg-emerald-600/15 text-emerald-800 border-emerald-600/30"
      : current.kind === "BENCHMARK"
      ? "bg-sky-600/10 text-sky-800 border-sky-600/25"
      : "bg-[var(--surface-subtle)] text-[var(--ink-secondary)] border-[var(--border-hairline)]";

  return (
    <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}
          >
            {current.kind === "EARLY-BIRD OFFER" ? (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {current.kind}
              </span>
            ) : (
              current.kind
            )}
          </span>
          <p className="truncate text-xs text-[var(--ink-primary)] font-medium">
            {current.headline}
          </p>
          <span className="hidden md:inline-block shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
            · {current.metric}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume scenario ticker" : "Pause scenario ticker"}
            className="rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => openLeadModal(current.industrySlug)}
            className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[var(--accent-signal)] hover:underline underline-offset-4 whitespace-nowrap"
          >
            Try {current.industryName}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
