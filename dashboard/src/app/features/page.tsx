import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
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
    title: "BVC Telephony Noise Cancellation",
    description:
      "Filters road noise, job-site tools, and background television before VAD fires so noisy callers do not trigger false interruptions.",
    tag: "LIVEKIT BVC",
  },
  {
    icon: Languages,
    title: "Bilingual & Keyterm-Boosted STT",
    description:
      "Deepgram Nova-3 switches cleanly between English and Spanish while boosting tenant brand names, equipment models, and local cities.",
    tag: "DEEPGRAM NOVA-3",
  },
  {
    icon: Headphones,
    title: "Live Supervisor Whisper & Barge-In",
    description:
      "Watch active calls in real time over WebSocket, whisper silent coaching into the agent prompt, or bridge directly onto the call.",
    tag: "REAL-TIME COPILOT",
  },
  {
    icon: Calendar,
    title: "Google Calendar & Territory Dispatch",
    description:
      "Checks real busy blocks, enforces arrival windows and buffers, assigns technicians by ZIP territory, and prevents double-booking.",
    tag: "DISPATCH ENGINE",
  },
  {
    icon: ShieldCheck,
    title: "Multi-Tenant Postgres RLS & Compliance",
    description:
      "Every tenant table enforces row-level security. Outbound calls pass consent, suppression, calling-window, and cap gates.",
    tag: "ISOLATION MANDATE",
  },
  {
    icon: BarChart3,
    title: "3-Stage Waterfall & Automated QA",
    description:
      "Inspect exact EOU, LLM TTFT, and TTS TTFB per turn alongside an objective 5-part QA compliance rubric and predictive CSAT.",
    tag: "MILESTONE M7B",
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
            Built for real phone lines, noisy callers, and strict compliance.
          </h1>
          <p className="max-w-[58ch] text-base text-[var(--ink-secondary)]">
            Every feature ships with per-stage telemetry, multi-tenant isolation, and
            human-in-the-loop supervision.
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

        {/* Section 3: BVC Noise Shield Spotlight */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
              <img
                src="/images/bvc-noise-shield.jpg"
                alt="BVC noise cancellation illustration"
                className="w-full h-auto object-cover"
              />
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                01 · Acoustic Layer
              </div>
              <h2 className="text-2xl font-bold">Adaptive Endpointing &amp; Noise Shield</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Per-tenant `patience_cadence` (`patient`, `balanced`, `brisk`) adapts endpointing
                windows for elderly speakers vs. fast talkers and widens automatically after
                consecutive interruptions.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Dispatch Calendar Matrix */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                02 · Dispatch Layer
              </div>
              <h2 className="text-2xl font-bold">Multi-Staff Territory &amp; Arrival Windows</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Assigns jobs by technician skills, postal-code coverage, and round-robin fairness
                while checking Google Calendar busy intervals in real time.
              </p>
            </div>
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
              <img
                src="/images/dispatch-calendar-grid.jpg"
                alt="Dispatch scheduling matrix illustration"
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </section>

        {/* Section 5: Warm SIP Transfer & Whisper */}
        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: PhoneForwarded,
                title: "Warm SIP Transfer",
                text: "Bridges live calls to on-call specialists with spoken caller context and hold reassurance.",
              },
              {
                icon: Database,
                title: "Retry-Backed CRM Sync",
                text: "3-attempt exponential backoff + ordered turn queue ensures zero dropped transcripts.",
              },
              {
                icon: ShieldCheck,
                title: "Wrong-Number Guardrail",
                text: "Detects off-topic callers and exits politely in 2 turns instead of burning minutes.",
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
            <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
              <img
                src="/images/hero-voice-engine.jpg"
                alt="Autonomous voice engine illustration"
                className="w-full h-auto object-cover"
              />
            </div>
            <div className="lg:col-span-6 space-y-3">
              <div className="font-mono text-[11px] uppercase text-[var(--accent-signal)]">
                03 · Telemetry &amp; QA
              </div>
              <h2 className="text-2xl font-bold">No fake 100% scores. No hardcoded waterfalls.</h2>
              <p className="text-sm text-[var(--ink-secondary)]">
                Every call stores real EOU, LLM TTFT, and TTS TTFB metrics, evaluates a 5-part QA
                rubric, and flags missing disclosures or telemetry gaps automatically.
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
