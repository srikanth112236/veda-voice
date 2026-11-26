import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
import { ArrowRight, Radio, ShieldCheck, Cpu, Calendar, Award, Lock } from "lucide-react";

const STAGES = [
  {
    step: "01",
    title: "DID Routing & Call-Scoped Auth",
    summary:
      "Twilio or Telnyx delivers the SIP call to LiveKit. The worker resolves the tenant from the dialed number and receives a short-lived token scoped strictly to that tenant and call.",
    icon: Radio,
    detail: "Zero direct DB access from the voice worker · PostgreSQL RLS enforced",
  },
  {
    step: "02",
    title: "Non-Interruptible TCPA Disclosure",
    summary:
      "Before opening caller barge-in, the receptionist speaks the business recording disclosure with interruptions locked off so background static never cuts off legal notice.",
    icon: ShieldCheck,
    detail: "Verified in Turn 1 · Logged to CallRecord & QA scorecard",
  },
  {
    step: "03",
    title: "BVC Noise Filter & Semantic Turn Detection",
    summary:
      "LiveKit BVC removes traffic, TV, and job-site noise. Deepgram Nova-3 boosts tenant keyterms and street names while MultilingualModel prevents premature cutoffs mid-sentence.",
    icon: Cpu,
    detail: "Per-tenant patience cadence · Adaptive endpointing on interruptions",
  },
  {
    step: "04",
    title: "Calendar Booking, Transfer & Wrong-Number Exit",
    summary:
      "The agent checks live Google Calendar slots, dispatches by service territory, transfers emergencies with whisper briefings, or exits wrong-number calls politely in 2 turns.",
    icon: Calendar,
    detail: "Double-booking lock · Google Meet & SMS confirmation support",
  },
  {
    step: "05",
    title: "3-Stage Telemetry, QA Rubric & CSAT",
    summary:
      "Every completed call syncs with retry backoff to the control plane, computing EOU, LLM TTFT, and TTS TTFB percentiles alongside an objective 5-part QA score.",
    icon: Award,
    detail: "100-point rubric · Predictive 1.0–5.0 CSAT · Supervisor override",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Section 1: Hero */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
              Architecture Walkthrough
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              From inbound ring to booked dispatch in five deterministic stages.
            </h1>
            <p className="max-w-[54ch] text-base text-[var(--ink-secondary)]">
              Real-time audio runs on LiveKit Cloud while business state, calendar locks, and
              multi-tenant compliance live in Azure Container Apps and PostgreSQL 16.
            </p>
          </div>
          <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
            <img
              src="/images/hero-voice-engine.jpg"
              alt="Voice engine pipeline illustration"
              className="w-full h-auto object-cover"
            />
          </div>
        </section>

        {/* Sections 2-6: 5 Deterministic Stages */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 divide-y divide-[var(--border-hairline)]">
            {STAGES.map((stage) => {
              const Icon = stage.icon;
              return (
                <section
                  key={stage.step}
                  className="grid grid-cols-1 gap-4 py-8 lg:grid-cols-12 lg:items-center"
                >
                  <div className="flex items-center gap-3 lg:col-span-4">
                    <span className="font-mono text-xs font-bold text-[var(--accent-signal)] tabular-nums">
                      {stage.step}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--ink-primary)] shrink-0" />
                    <h2 className="text-base font-bold text-[var(--ink-primary)]">{stage.title}</h2>
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--ink-secondary)] lg:col-span-5">
                    {stage.summary}
                  </p>
                  <div className="font-mono text-[11px] text-[var(--ink-muted)] lg:col-span-3 lg:text-right">
                    {stage.detail}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        {/* Section 7: Acoustic Noise Shield */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
              <img
                src="/images/bvc-noise-shield.jpg"
                alt="BVC noise shield illustration"
                className="w-full h-auto object-cover"
              />
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                Acoustic Gatekeeper
              </div>
              <h2 className="text-2xl font-bold">Clean speech extraction before turn detection.</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Road noise, background TVs, and speakerphone echoes are filtered in real time via
                BVCTelephony before Silero VAD and MultilingualModel decide turn boundaries.
              </p>
            </div>
          </div>
        </section>

        {/* Section 8: Calendar & Dispatch Lock */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 space-y-3">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                <Lock className="h-3.5 w-3.5" />
                <span>Double-Booking Guard</span>
              </div>
              <h2 className="text-2xl font-bold">Atomic slot holds &amp; territory routing.</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                When a caller picks a time, the API places a short-lived slot hold, verifies Google
                Calendar busy intervals, and confirms the technician assignment.
              </p>
            </div>
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
              <img
                src="/images/dispatch-calendar-grid.jpg"
                alt="Dispatch scheduling matrix"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section 9: Why VedaVoice Wins */}
        <WhyBestSection />

        {/* Section 10: Pricing Plans */}
        <PricingSection />

        {/* Section 11: Bottom CTA */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Explore 20 pre-configured industry flows</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Inspect sample greetings, caller turns, and acoustic waveforms across verticals.
              </p>
            </div>
            <Link
              href="/industries"
              className="touch-target interactive-lift inline-flex items-center gap-2 self-start rounded-md bg-[var(--ink-primary)] px-4 text-sm font-medium text-[var(--surface-panel)]"
            >
              Browse 20 industries
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
