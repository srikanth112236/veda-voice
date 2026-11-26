import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
import { ParallaxFrame, ScrubRevealSection } from "@/components/public/ScrollShowcase";
import {
  ShieldCheck,
  Mic,
  Languages,
  Calendar,
  Headphones,
  BarChart3,
  ArrowRight,
  Database,
  PhoneForwarded,
} from "lucide-react";

const CAPABILITIES = [
  {
    icon: Mic,
    title: "Background Noise Cancellation",
    description:
      "Filters road noise, job-site tools, and background television so noisy callers are heard clearly without false cutoffs.",
    tag: "NOISE SHIELD",
  },
  {
    icon: Languages,
    title: "Bilingual & Local-Name Accuracy",
    description:
      "Switches smoothly between English and Spanish while learning your brand name, equipment types, and neighborhood streets.",
    tag: "BILINGUAL VOICE",
  },
  {
    icon: Headphones,
    title: "Live Coach Whisper & Takeover",
    description:
      "Listen to live calls in real time, send silent instructions to your AI receptionist, or step onto the call yourself.",
    tag: "LIVE SUPERVISION",
  },
  {
    icon: Calendar,
    title: "Calendar Sync & Territory Dispatch",
    description:
      "Checks real team availability, respects arrival buffers, assigns jobs by postal code, and prevents double-booking.",
    tag: "SMART SCHEDULING",
  },
  {
    icon: ShieldCheck,
    title: "Private Workspace & Call Rules",
    description:
      "Every business account stays strictly isolated. Outbound reminders automatically honor consent, quiet hours, and do-not-call lists.",
    tag: "COMPLIANCE BUILT-IN",
  },
  {
    icon: BarChart3,
    title: "Automatic Call Grading & CSAT",
    description:
      "Review response speed, full transcripts, 100-point quality scores, and predicted customer satisfaction after every single call.",
    tag: "QUALITY SCORING",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />

      <main className="flex-1">
        {/* Section 1: Hero */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 lg:py-16 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            Platform Capabilities
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            Built for real phone lines, busy callers, and regional compliance.
          </h1>
          <p className="max-w-[58ch] text-base text-[var(--ink-secondary)]">
            Every plan includes crystal-clear voice handling, private data isolation, and
            live team supervision tools.
          </p>
        </section>

        {/* Section 2: 6-Card Capability Matrix */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <article
                  key={cap.title}
                  className="interactive-lift rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-6 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-[var(--accent-signal)]" />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                      {cap.tag}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-[var(--ink-primary)]">{cap.title}</h2>
                  <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
                    {cap.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Section 3: Noise Shield Spotlight */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <ParallaxFrame className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
                <img
                  src="/images/bvc-noise-shield.jpg"
                  alt="Background noise cancellation illustration"
                  className="w-full h-auto object-cover"
                />
              </ParallaxFrame>
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                01 · Clear Listening
              </div>
              <h2 className="text-2xl font-bold">Adaptive Pacing &amp; Noise Shield</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Choose a patient, balanced, or brisk speaking cadence so elderly callers get extra
                breathing room while busy callers move straight to booking.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Dispatch Calendar Matrix */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                02 · Smart Scheduling
              </div>
              <h2 className="text-2xl font-bold">Multi-Staff Territory &amp; Arrival Windows</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Assigns jobs by technician skills, postal-code coverage, and fair rotation
                while checking live Google Calendar availability in real time.
              </p>
            </div>
            <div className="lg:col-span-6">
              <ParallaxFrame className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <img
                  src="/images/dispatch-calendar-grid.jpg"
                  alt="Dispatch scheduling matrix illustration"
                  className="w-full h-auto object-cover"
                />
              </ParallaxFrame>
            </div>
          </div>
        </section>

        {/* Section 5: Warm Transfer & CRM Sync */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: PhoneForwarded,
                title: "Warm Call Transfer",
                text: "Bridges live calls to on-call staff with spoken caller context so customers never repeat themselves.",
              },
              {
                icon: Database,
                title: "Guaranteed Record Sync",
                text: "Automatic retry queues ensure every transcript, booking, and follow-up note reaches your portal safely.",
              },
              {
                icon: ShieldCheck,
                title: "Wrong-Number Guardrail",
                text: "Recognizes misdialed callers and wraps up politely in two turns instead of wasting plan minutes.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-2"
                >
                  <Icon className="h-5 w-5 text-[var(--accent-signal)]" />
                  <h3 className="text-base font-bold">{item.title}</h3>
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 6: Why VedaVoice Wins */}
        <WhyBestSection />

        {/* Section 7: Hero Engine Visual */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <ParallaxFrame className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                <img
                  src="/images/hero-voice-engine.jpg"
                  alt="Autonomous voice engine illustration"
                  className="w-full h-auto object-cover"
                />
              </ParallaxFrame>
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                03 · Call Quality &amp; Speed
              </div>
              <h2 className="text-2xl font-bold">Real quality grading on every single call.</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Every call records exact response speed, grades itself on a clear 5-part quality
                checklist, and flags missing disclosures automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Section 8: Pricing */}
        <PricingSection />

        {/* Section 9: Regional Compliance Strip */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Multi-Jurisdiction Legal Readiness</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Built for US, UK, Canada, UAE, and India privacy &amp; telecom regulations.
              </p>
            </div>
            <Link
              href="/legal"
              className="touch-target inline-flex items-center gap-2 self-start rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-medium"
            >
              Inspect Compliance Hub
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Section 10: Bottom CTA */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Ready to launch your tenant workspace?</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Configure business hours, greeting, and calendar integration in minutes.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="touch-target interactive-lift inline-flex items-center gap-2 self-start rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Start onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
