"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { VoiceIllustration } from "@/components/public/VoiceIllustration";
import { INDUSTRY_CONCEPTS } from "@/data/industries";
import { ArrowRight, ShieldCheck, Activity } from "lucide-react";

export default function IndustriesPage() {
  const [selectedSlug, setSelectedSlug] = useState(INDUSTRY_CONCEPTS[0].slug);
  const active =
    INDUSTRY_CONCEPTS.find((item) => item.slug === selectedSlug) ?? INDUSTRY_CONCEPTS[0];

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            20 Industry Concepts
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            Tailored greetings, safety rules, and intake trees for 20 verticals.
          </h1>
          <p className="max-w-[58ch] text-base text-[var(--ink-secondary)]">
            Select an industry below to inspect its acoustic waveform profile, sample greeting,
            caller intent, and automated QA focus.
          </p>
        </section>

        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* 20 Industry Selector Grid */}
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2 self-start">
              {INDUSTRY_CONCEPTS.map((item) => {
                const isSelected = item.slug === active.slug;
                return (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => setSelectedSlug(item.slug)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                        : "border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:border-[var(--ink-secondary)]"
                    }`}
                  >
                    <div
                      className={`font-mono text-[9px] uppercase tracking-wider ${
                        isSelected ? "text-[var(--surface-subtle)]" : "text-[var(--ink-muted)]"
                      }`}
                    >
                      {item.category}
                    </div>
                    <div className="mt-1 text-xs font-semibold leading-snug">{item.name}</div>
                  </button>
                );
              })}
            </div>

            {/* Active Industry Voice Inspector */}
            <div className="lg:col-span-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 space-y-4 self-start">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                    {active.category}
                  </span>
                  <h2 className="text-lg font-bold text-[var(--ink-primary)]">{active.name}</h2>
                </div>
                <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-[var(--accent-signal)] font-semibold">
                  <Activity className="h-3.5 w-3.5" />
                  {active.latencyMs}ms P50
                </span>
              </div>

              <VoiceIllustration bars={active.waveform} label={active.name} />

              <div className="space-y-2.5 text-xs leading-relaxed">
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3">
                  <div className="font-mono text-[10px] text-[var(--ink-muted)] mb-1">
                    GREETING (TURN 1)
                  </div>
                  <p>{active.sampleGreeting}</p>
                </div>

                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
                  <div className="font-mono text-[10px] text-[var(--ink-muted)] mb-1">
                    SAMPLE CALLER TURN
                  </div>
                  <p>{active.callerUtterance}</p>
                </div>

                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3">
                  <div className="font-mono text-[10px] text-[var(--accent-signal)] mb-1">
                    AUTONOMOUS ACTION
                  </div>
                  <p className="font-medium">{active.agentAction}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-secondary)] pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-signal)] shrink-0" />
                <span>QA Focus: {active.qaFocus}</span>
              </div>

              <Link
                href="/onboarding"
                className="touch-target interactive-lift flex w-full items-center justify-center gap-2 rounded-md bg-[var(--ink-primary)] px-4 text-sm font-medium text-[var(--surface-panel)]"
              >
                Deploy {active.name} Pack
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
