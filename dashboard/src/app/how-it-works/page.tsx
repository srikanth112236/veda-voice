import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { ArrowRight, Radio, ShieldCheck, Cpu, Calendar, Award } from "lucide-react";

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
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 lg:py-16 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            Architecture Walkthrough
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            From inbound ring to booked dispatch in five deterministic stages.
          </h1>
          <p className="max-w-[58ch] text-base text-[var(--ink-secondary)]">
            Every call follows a strict isolation boundary: real-time audio runs on LiveKit
            Cloud, while business state, calendar locks, and compliance live in Azure.
          </p>
        </section>

        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 divide-y divide-[var(--border-hairline)]">
            {STAGES.map((stage) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.step}
                  className="grid grid-cols-1 gap-4 py-7 lg:grid-cols-12 lg:items-center"
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
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Explore 20 pre-configured industry flows</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                See sample greetings, caller turns, and acoustic waveforms across trades and clinics.
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
