import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import {
  ShieldCheck,
  Mic,
  Languages,
  Calendar,
  Headphones,
  BarChart3,
  ArrowRight,
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
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 lg:py-16 space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            Platform Capabilities
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            Built for real phone lines, noisy callers, and strict compliance.
          </h1>
          <p className="max-w-[58ch] text-base text-[var(--ink-secondary)]">
            Every feature ships with telemetry, multi-tenant isolation, and human-in-the-loop
            supervision.
          </p>
        </section>

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

        <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
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
