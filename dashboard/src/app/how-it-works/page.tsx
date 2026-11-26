import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
import { ParallaxFrame, ScrubRevealSection } from "@/components/public/ScrollShowcase";
import { ArrowRight, Radio, ShieldCheck, Cpu, Calendar, Award, Lock } from "lucide-react";

const STAGES = [
  {
    step: "01",
    title: "Instant Line Recognition & Private Vault",
    summary:
      "When a customer dials your business number, VedaVoice identifies your company profile in a split second and locks every note strictly inside your private workspace.",
    icon: Radio,
    detail: "Private business isolation · Zero cross-company mixing",
  },
  {
    step: "02",
    title: "Clear Recording Notice First",
    summary:
      "Before taking details, the receptionist clearly announces that the call is recorded, ensuring local consent rules are met even on noisy mobile lines.",
    icon: ShieldCheck,
    detail: "Spoken on Turn 1 · Logged to your compliance record",
  },
  {
    step: "03",
    title: "Noise Shield & Natural Pacing",
    summary:
      "Traffic, TV chatter, and job-site tools are filtered out while smart pause detection waits politely for slow talkers instead of interrupting mid-thought.",
    icon: Cpu,
    detail: "Custom speaking pace · Clear brand & street pronunciation",
  },
  {
    step: "04",
    title: "Live Calendar Booking & Warm Transfer",
    summary:
      "The receptionist checks real staff availability, books by service area, transfers urgent calls with a spoken summary, or ends wrong-number calls politely.",
    icon: Calendar,
    detail: "Zero double-bookings · Instant text & calendar confirmations",
  },
  {
    step: "05",
    title: "Instant Call Summary & Quality Score",
    summary:
      "Right after hang-up, your dashboard receives the full transcript, caller intent, response speed metrics, and an automatic 100-point quality score.",
    icon: Award,
    detail: "100-point quality grade · Caller satisfaction score · Full history",
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
              How It Works
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              From inbound ring to booked appointment in five clear steps.
            </h1>
            <p className="max-w-[54ch] text-base text-[var(--ink-secondary)]">
              Real-time voice conversations run on a dedicated voice network while your customer
              records, live calendar locks, and compliance history stay safely inside your private portal.
            </p>
          </div>
          <div className="lg:col-span-6">
            <ParallaxFrame className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
              <img
                src="/images/hero-voice-engine.jpg"
                alt="Voice reception pipeline illustration"
                className="w-full h-auto object-cover"
              />
            </ParallaxFrame>
          </div>
        </section>

        {/* Sections 2-6: 5 Stages */}
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
            <div className="lg:col-span-6">
              <ParallaxFrame className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
                <img
                  src="/images/bvc-noise-shield.jpg"
                  alt="Background noise filter illustration"
                  className="w-full h-auto object-cover"
                />
              </ParallaxFrame>
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                Crystal-Clear Listening
              </div>
              <h2 className="text-2xl font-bold">Clean speech extraction before every reply.</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Highway wind, shop machinery, and speakerphone echoes are cleaned automatically so
                your AI receptionist understands callers accurately on the first try.
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
              <h2 className="text-2xl font-bold">Instant time-slot holds &amp; territory routing.</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                When a caller picks a time, VedaVoice checks live team schedules, reserves the
                exact arrival window, and confirms the right specialist for their neighborhood.
              </p>
            </div>
            <div className="lg:col-span-6">
              <ParallaxFrame className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <img
                  src="/images/dispatch-calendar-grid.jpg"
                  alt="Dispatch scheduling matrix"
                  className="w-full h-auto object-cover"
                />
              </ParallaxFrame>
            </div>
          </div>
        </section>

        <ScrubRevealSection
          eyebrow="Always-On Reliability"
          headline="Every missed ring turns into a confirmed customer visit."
          subtext="From Turn 1 recording notice to calendar confirmation, your business sounds calm, helpful, and unmistakably yours."
        />

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
