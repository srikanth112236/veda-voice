"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useLeadModal } from "@/context/lead-modal-context";
import {
  ArrowRight,
  PhoneCall,
  ShieldCheck,
  Activity,
  Calendar,
  Database,
  Radio,
  Headphones,
  Languages,
  Award,
  Globe,
  Zap,
} from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { CuratedScenarioTicker } from "@/components/public/CuratedScenarioTicker";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
import { INDUSTRY_CONCEPTS } from "@/data/industries";

type ScenarioKey = "booking" | "emergency" | "wrong_number";

const SCENARIOS: Record<
  ScenarioKey,
  {
    label: string;
    caller: string;
    duration: string;
    turns: string;
    tcpa: string;
    p50: number;
    p95: number;
    eou: number;
    ttft: number;
    ttfb: number;
    messages: Array<{ speaker: string; meta: string; time: string; text: string }>;
  }
> = {
  booking: {
    label: "Inbound Booking",
    caller: "Apex Plumbing & Heating · SIP Inbound",
    duration: "01m 42s",
    turns: "6 turns",
    tcpa: "TCPA disclosure verified · Turn 1",
    p50: 890,
    p95: 1140,
    eou: 420,
    ttft: 290,
    ttfb: 180,
    messages: [
      {
        speaker: "RECEPTIONIST",
        meta: "890ms · Turn 1",
        time: "09:14:02",
        text: "This call may be recorded for quality assurance. Thanks for calling Apex Plumbing & Heating—how can I help?",
      },
      {
        speaker: "CALLER",
        meta: "BVC NOISE FILTER ACTIVE",
        time: "09:14:09",
        text: "Our water heater is leaking near the shutoff valve on Congress Ave. Can someone come out today?",
      },
    ],
  },
  emergency: {
    label: "Gas Leak Escalation",
    caller: "Apex Plumbing & Heating · Priority SIP",
    duration: "00m 54s",
    turns: "4 turns",
    tcpa: "TCPA disclosure verified · Turn 1",
    p50: 760,
    p95: 980,
    eou: 360,
    ttft: 240,
    ttfb: 160,
    messages: [
      {
        speaker: "CALLER",
        meta: "HIGH URGENCY · 0.96 CONF",
        time: "14:02:11",
        text: "I smell strong gas near the furnace in our basement right now.",
      },
      {
        speaker: "RECEPTIONIST",
        meta: "760ms · SAFETY PROTOCOL",
        time: "14:02:12",
        text: "Please leave the building immediately, avoid touching any light switches, and call 911 from outside. I am transferring you to our on-call specialist now.",
      },
    ],
  },
  wrong_number: {
    label: "Wrong-Number Guard",
    caller: "Apex Plumbing & Heating · SIP Inbound",
    duration: "00m 28s",
    turns: "3 turns",
    tcpa: "TCPA disclosure verified · Turn 1",
    p50: 810,
    p95: 940,
    eou: 400,
    ttft: 250,
    ttfb: 160,
    messages: [
      {
        speaker: "CALLER",
        meta: "OFF-TOPIC DETECTED",
        time: "17:50:44",
        text: "Hey, is this the software support line for reverse engineering?",
      },
      {
        speaker: "RECEPTIONIST",
        meta: "810ms · FAST EXIT",
        time: "17:50:45",
        text: "I believe you have the wrong number—this is Apex Plumbing & Heating. Have a great day, goodbye.",
      },
    ],
  },
};

export default function Home() {
  const { user, loading } = useAuth();
  const { openLeadModal } = useLeadModal();
  const [routing, setRouting] = useState(false);
  const [scenario, setScenario] = useState<ScenarioKey>("booking");

  useEffect(() => {
    if (loading || !user) return;
    const target = user.role === "platform_admin" ? "/admin/dashboard" : "/portal/dashboard";
    setRouting(true);
    window.location.replace(target);
  }, [user, loading]);

  if (loading || routing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] px-6">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3 font-mono text-xs text-[var(--ink-secondary)]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-signal)] animate-pulse" />
          <span>{routing ? "Opening workspace..." : "Checking session..."}</span>
        </div>
      </main>
    );
  }

  const active = SCENARIOS[scenario];

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />
      {/* Section 1: Curated Scenario & Early-Bird Ticker */}
      <CuratedScenarioTicker />

      {/* Section 2: Hero with Custom Voice Engine Illustration */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 py-14 lg:grid-cols-12 lg:py-20">
        <div className="space-y-6 lg:col-span-6" data-enter="hero">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            SIP Telephony · LiveKit Agents · Multi-Tenant CRM
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-4xl lg:text-[2.85rem] lg:leading-[1.08]">
            Voice reception that answers, books, and dispatches.
          </h1>
          <p className="max-w-[50ch] text-base leading-relaxed text-[var(--ink-secondary)]">
            Sub-second turn detection, locked Turn-1 TCPA disclosure, safety escalation, and direct
            Google Calendar scheduling isolated per business.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => openLeadModal()}
              className="touch-target interactive-lift inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Request live demo
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
            <Link
              href="/onboarding"
              className="touch-target interactive-lift inline-flex items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--ink-primary)]"
            >
              Client onboarding
            </Link>
            <Link
              href="#pricing"
              className="touch-target inline-flex items-center whitespace-nowrap px-3 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            >
              View pricing
            </Link>
          </div>
        </div>

        <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <img
            src="/images/hero-voice-engine.jpg"
            alt="Autonomous voice telephony engine signal routing illustration"
            className="w-full h-auto object-cover transition-transform duration-500 hover:scale-[1.02]"
          />
        </div>
      </section>

      {/* Section 3: Interactive Live HTML App-Frame */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                Live Call Telemetry Inspector
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Every turn timed. Every disclosure verified.
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScenario(key)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    scenario === key
                      ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                      : "border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)]"
                  }`}
                >
                  {SCENARIOS[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs text-[var(--ink-secondary)]">
                <PhoneCall className="h-3.5 w-3.5 text-[var(--accent-signal)] shrink-0" />
                <span>{active.caller}</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-[var(--ink-muted)]">
                {active.duration} · {active.turns}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-hairline)]">
              <div className="lg:col-span-7 space-y-3 p-5 text-xs leading-relaxed">
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>{active.tcpa}</span>
                </div>
                {active.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[var(--ink-muted)]">
                      <span>
                        {msg.speaker} · {msg.meta}
                      </span>
                      <span className="tabular-nums">{msg.time}</span>
                    </div>
                    <p className="text-[var(--ink-primary)]">{msg.text}</p>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-5 p-5 space-y-4">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Activity className="h-3.5 w-3.5 text-[var(--accent-signal)]" />
                    3-Stage Waterfall
                  </span>
                  <span className="tabular-nums text-[var(--ink-secondary)]">
                    P50 <strong>{active.p50}ms</strong> · P95 <strong>{active.p95}ms</strong>
                  </span>
                </div>

                <div className="space-y-2.5 font-mono text-xs tabular-nums">
                  {[
                    { name: "1. EOU (Silero + Turn)", val: active.eou },
                    { name: "2. LLM TTFT (Gemini 2.5)", val: active.ttft },
                    { name: "3. TTS TTFB (Inworld)", val: active.ttfb },
                  ].map((s) => (
                    <div
                      key={s.name}
                      className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 flex items-center justify-between"
                    >
                      <span className="text-[var(--ink-secondary)]">{s.name}</span>
                      <span className="font-bold text-[var(--ink-primary)]">{s.val} ms</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: 3-Lane Isolated Telephony Execution Diagram */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                Isolated Execution Path
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                One voice worker. Scoped per call.
              </h2>
            </div>
            <p className="max-w-[44ch] text-sm text-[var(--ink-secondary)]">
              The real-time agent never touches PostgreSQL directly—every booking, transfer, and
              transcript write goes through call-scoped API tokens.
            </p>
          </div>

          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-12">
            <div className="lg:col-span-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-4 space-y-2">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span>INPUT · PSTN / WEBRTC</span>
              </div>
              <div className="text-sm font-semibold">SIP Trunk + BVC Filter</div>
              <p className="text-xs text-[var(--ink-secondary)]">
                Twilio or Telnyx audio cleaned before VAD fires.
              </p>
            </div>
            <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
              <div className="h-px w-full bg-[var(--border-hairline)] relative">
                <span className="absolute right-0 -top-1 h-2 w-2 rounded-full bg-[var(--accent-signal)] animate-pulse" />
              </div>
            </div>
            <div className="lg:col-span-4 rounded-lg border-2 border-[var(--ink-primary)] bg-[var(--surface-panel)] p-5 space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                LiveKit Agents Runtime
              </div>
              <div className="text-base font-bold">Turn Detector + Gemini 2.5 Flash</div>
              <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
                Per-tenant patience cadence, Deepgram Nova-3 keyterms, and locked TCPA disclosure.
              </p>
            </div>
            <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
              <div className="h-px w-full bg-[var(--border-hairline)] relative">
                <span className="absolute right-0 -top-1 h-2 w-2 rounded-full bg-[var(--accent-signal)] animate-pulse" />
              </div>
            </div>
            <div className="lg:col-span-3 space-y-2.5">
              {[
                { icon: Calendar, title: "Google Calendar Dispatch", sub: "Live slots & territories" },
                { icon: Database, title: "Postgres RLS + CRM", sub: "Retry-backed call sync" },
                { icon: ShieldCheck, title: "Automated QA & CSAT", sub: "5-part rubric & TCPA audit" },
              ].map((lane) => {
                const Icon = lane.icon;
                return (
                  <div
                    key={lane.title}
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 flex items-start gap-2.5"
                  >
                    <Icon className="h-4 w-4 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold">{lane.title}</div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">{lane.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: BVC Noise Shield Visual Spotlight */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 py-16 lg:grid-cols-12">
          <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
            <img
              src="/images/bvc-noise-shield.jpg"
              alt="Acoustic noise filtering shield illustration"
              className="w-full h-auto object-cover transition-transform duration-500 hover:scale-[1.02]"
            />
          </div>
          <div className="lg:col-span-6 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)]">
              Acoustic Resilience
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Built for highways, basements, and noisy job sites.
            </h2>
            <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
              LiveKit BVC and BVCTelephony strip background television, engine idle, and wind
              before Silero VAD evaluates speech—eliminating false barge-in and split caller turns.
            </p>
            <Link
              href="/features"
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-signal)]"
            >
              Inspect audio pipeline
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Section 6: Why VedaVoice Wins Comparison Matrix */}
      <WhyBestSection />

      {/* Section 7: Dispatch & Calendar Matrix Visual Spotlight */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 py-16 lg:grid-cols-12">
          <div className="lg:col-span-6 space-y-4 order-2 lg:order-1">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)]">
              Calendar &amp; Territory Engine
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Real slot availability. Zero double-bookings.
            </h2>
            <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
              Checks live Google Calendar busy blocks, enforces arrival windows and travel buffers,
              matches technician skills by postal code, and sends instant 1-tap SMS reschedule links.
            </p>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-signal)]"
            >
              Explore dispatch flow
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="lg:col-span-6 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] order-1 lg:order-2">
            <img
              src="/images/dispatch-calendar-grid.jpg"
              alt="Multi-tenant calendar dispatch matrix illustration"
              className="w-full h-auto object-cover transition-transform duration-500 hover:scale-[1.02]"
            />
          </div>
        </div>
      </section>

      {/* Section 8: 3-Stage Latency SLA Breakdown */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              icon: Zap,
              metric: "~400 ms",
              title: "Semantic End-of-Utterance",
              desc: "MultilingualModel + per-tenant patience cadence waits for complete thoughts instead of cutting off pauses.",
            },
            {
              icon: Activity,
              metric: "~280 ms",
              title: "LLM First Token (TTFT)",
              desc: "Preemptive generation + Gemini 2.5 Flash grounded against tenant FAQs, pricing policy, and service area.",
            },
            {
              icon: PhoneCall,
              metric: "~180 ms",
              title: "Voice Synthesis TTFB",
              desc: "Inworld streaming TTS delivers natural cadence with adaptive endpointing if caller interrupts.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-[var(--accent-signal)]" />
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--ink-primary)]">
                    {item.metric}
                  </span>
                </div>
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 9: Bilingual EN/ES & Keyterm Boosting */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
              <Languages className="h-4 w-4" />
              <span>BILINGUAL + PHONETIC GLOSSARY</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Fluently switches English &amp; Spanish while boosting local brand terms.
            </h2>
            <p className="text-sm text-[var(--ink-secondary)]">
              Every tenant&apos;s equipment names, street corridors, and pronunciation glossary feed
              directly into Deepgram Nova-3 keyterm boosting (up to 50 terms per call).
            </p>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-2.5 font-mono text-xs">
            {["Navien Tankless", "Bradford White", "Congress Ave", "language=\"multi\""].map(
              (term) => (
                <div
                  key={term}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2.5 text-[var(--ink-primary)]"
                >
                  {term}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Section 10: Live Supervisor Copilot */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5 grid grid-cols-3 gap-2 font-mono text-xs text-center">
            {["Silent Whisper", "Live Barge-In", "Warm Transfer"].map((action) => (
              <div
                key={action}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 font-semibold text-[var(--ink-primary)]"
              >
                {action}
              </div>
            ))}
          </div>
          <div className="lg:col-span-7 space-y-3">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
              <Headphones className="h-4 w-4" />
              <span>HUMAN-IN-THE-LOOP SUPERVISION</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Coach the AI silently or take over any active call in one click.
            </h2>
            <p className="text-sm text-[var(--ink-secondary)]">
              Watch live transcripts stream over WebSocket, inject supervisor guidance mid-call, or
              bridge directly onto the SIP line with an automated whisper briefing.
            </p>
          </div>
        </div>
      </section>

      {/* Section 11: Automated 5-Part QA & Predictive CSAT */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <Award className="h-4 w-4" />
                <span>MILESTONE M7B · AUTOMATED QA</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">
                100-point objective rubric on every completed call.
              </h2>
            </div>
            <span className="font-mono text-xs text-[var(--ink-muted)]">
              Predictive CSAT 1.0 – 5.0 + Supervisor Override
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 font-mono text-xs tabular-nums">
            {[
              { title: "1. Greeting", pts: "20 pts" },
              { title: "2. TCPA Notice", pts: "20 pts" },
              { title: "3. Intake Data", pts: "25 pts" },
              { title: "4. Safety", pts: "20 pts" },
              { title: "5. Tone & Speed", pts: "15 pts" },
            ].map((r) => (
              <div
                key={r.title}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3.5 flex items-center justify-between sm:block space-y-1"
              >
                <div className="text-[var(--ink-secondary)]">{r.title}</div>
                <div className="font-bold text-[var(--ink-primary)]">{r.pts}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 12: 20 Pre-Trained Industry Verticals */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                20 Pre-Trained Verticals
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Ready for trades, clinics, salons, and dispatch teams.
              </h2>
            </div>
            <Link
              href="/industries"
              className="touch-target inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-signal)]"
            >
              Inspect all 20 industries
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {INDUSTRY_CONCEPTS.map((ind) => (
              <button
                key={ind.slug}
                type="button"
                onClick={() => openLeadModal(ind.slug)}
                className="interactive-lift rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 text-left space-y-1"
              >
                <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                  {ind.category}
                </div>
                <div className="text-xs font-semibold text-[var(--ink-primary)]">{ind.name}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Section 13: Complete 7-Plan Pricing Ladder + Top-Up Packs */}
      <PricingSection />

      {/* Section 14: Global Compliance Readiness (US, UK, CA, UAE, IN) */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
              <Globe className="h-4 w-4" />
              <span>MULTI-JURISDICTION TELECOM &amp; PRIVACY</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Aligned for US, UK, Canada, UAE, and India deployments.
            </h2>
            <p className="max-w-[56ch] text-sm text-[var(--ink-secondary)]">
              TCPA/FCC, UK GDPR &amp; PECR, PIPEDA/CRTC, UAE PDPL/TDRA, and India DPDP/TRAI
              compliance documentation built into the trust hub.
            </p>
          </div>
          <Link
            href="/legal"
            className="touch-target interactive-lift inline-flex items-center gap-2 self-start rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--ink-primary)] shrink-0"
          >
            Open Compliance Hub
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Section 15: Final Conversion Band + Footer */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--ink-primary)] text-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
              Early-Bird Cohort Open
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Deploy your AI receptionist in minutes.
            </h2>
            <p className="text-sm text-slate-300">
              Includes 500 founder voice minutes and priority SIP trunk provisioning.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openLeadModal()}
              className="touch-target interactive-lift inline-flex items-center gap-2 rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Claim Early-Bird Demo
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              href="/onboarding"
              className="touch-target inline-flex items-center rounded-md border border-slate-600 px-4 text-sm font-medium text-[var(--surface-panel)] hover:bg-slate-800"
            >
              Self-Serve Onboarding
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
