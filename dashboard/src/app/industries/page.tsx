"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { VoiceIllustration } from "@/components/public/VoiceIllustration";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
import { INDUSTRY_CONCEPTS } from "@/data/industries";
import { useLeadModal } from "@/context/lead-modal-context";
import { ArrowRight, ShieldCheck, Activity } from "lucide-react";

const CATEGORIES = ["All", "Home Services", "Healthcare", "Automotive", "Professional"] as const;

export default function IndustriesPage() {
  const [selectedSlug, setSelectedSlug] = useState(INDUSTRY_CONCEPTS[0].slug);
  const [categoryFilter, setCategoryFilter] = useState<(typeof CATEGORIES)[number]>("All");
  const { openLeadModal } = useLeadModal();

  const filtered =
    categoryFilter === "All"
      ? INDUSTRY_CONCEPTS
      : INDUSTRY_CONCEPTS.filter((c) => c.category === categoryFilter);

  const active =
    INDUSTRY_CONCEPTS.find((item) => item.slug === selectedSlug) ?? INDUSTRY_CONCEPTS[0];

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Section 1: Hero */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            20 Industry Concepts
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            Tailored greetings, safety rules, and intake trees for 20 verticals.
          </h1>
          <p className="max-w-[58ch] text-base text-[var(--ink-secondary)]">
            Filter by category or select any industry to inspect its acoustic waveform profile,
            sample greeting, caller intent, and automated QA focus.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-md border px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-secondary)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Section 2: Interactive 20-Industry Explorer */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2 self-start">
              {filtered.map((item) => {
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openLeadModal(active.slug)}
                  className="touch-target interactive-lift flex items-center justify-center gap-2 rounded-md bg-[var(--accent-signal)] px-4 text-sm font-semibold text-[var(--accent-signal-ink)]"
                >
                  Try {active.name} Demo
                </button>
                <Link
                  href="/onboarding"
                  className="touch-target interactive-lift flex items-center justify-center gap-2 rounded-md bg-[var(--ink-primary)] px-4 text-sm font-medium text-[var(--surface-panel)]"
                >
                  Deploy Pack
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Acoustic Resilience Visual */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
              <img
                src="/images/bvc-noise-shield.jpg"
                alt="BVC acoustic noise shield illustration"
                className="w-full h-auto object-cover"
              />
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                Field-Ready Audio
              </div>
              <h2 className="text-2xl font-bold">
                Built for roadside callers, basements, and busy front desks.
              </h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Each industry pack pairs BVC noise filtering with domain keyterms so brand names,
                part numbers, and symptoms are transcribed accurately on the first try.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Dispatch Matrix Visual */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                Calendar &amp; Territory Routing
              </div>
              <h2 className="text-2xl font-bold">
                Match skills, arrival windows, and service ZIP codes automatically.
              </h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                From emergency plumbers to multi-chair dental clinics, VedaVoice routes callers to
                the right specialist calendar without double-booking.
              </p>
            </div>
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
              <img
                src="/images/dispatch-calendar-grid.jpg"
                alt="Dispatch calendar grid illustration"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section 5: Safety & Escalation Rules */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Home Services", rule: "Gas leak / sparking / burst pipe shutoff + 911" },
              { title: "Healthcare", rule: "Acute triage transfer + HIPAA/GDPR-ready intake" },
              { title: "Automotive", rule: "Roadside safety check + mile-marker capture" },
              { title: "Professional", rule: "No-legal-advice guardrail + conflict intake" },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 space-y-1.5"
              >
                <div className="font-mono text-[10px] uppercase text-[var(--accent-signal)]">
                  SAFETY PROTOCOL
                </div>
                <div className="text-sm font-bold">{card.title}</div>
                <p className="text-xs text-[var(--ink-secondary)]">{card.rule}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 6: Comparison */}
        <WhyBestSection />

        {/* Section 7: Pricing */}
        <PricingSection />

        {/* Section 8: Final CTA */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Need a custom industry pack?</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Request a live walkthrough with your own FAQs, territory ZIPs, and greeting.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openLeadModal(active.slug)}
              className="touch-target interactive-lift inline-flex items-center gap-2 self-start rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Request Custom Demo
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
