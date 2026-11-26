"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  ArrowRight,
  PhoneCall,
  ShieldCheck,
  Activity,
  Calendar,
  Database,
  Radio,
} from "lucide-react";

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
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)]">
      {/* Top Bar */}
      <header className="border-b border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ink-primary)] font-mono text-sm font-bold text-[var(--surface-panel)]">
              V
            </span>
            <span className="text-sm font-semibold tracking-tight whitespace-nowrap">
              VedaVoice
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="touch-target inline-flex items-center whitespace-nowrap px-3 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="touch-target interactive-lift inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--ink-primary)] px-3.5 sm:px-4 text-sm font-medium text-[var(--surface-panel)]"
            >
              Deploy receptionist
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Screen 1: Software Hero + Interactive Live HTML App Frame */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-12 lg:grid-cols-12 lg:py-20">
        <div className="space-y-6 lg:col-span-5" data-enter="hero">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
            SIP Telephony · LiveKit Agents · Multi-Tenant CRM
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
            Voice reception that answers, books, and dispatches.
          </h1>
          <p className="max-w-[48ch] text-base leading-relaxed text-[var(--ink-secondary)]">
            Sub-second turn detection, locked TCPA disclosure, safety escalation, and direct Google
            Calendar scheduling isolated per business.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/login"
              className="touch-target interactive-lift inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Open control plane
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            <Link
              href="/onboarding"
              className="touch-target interactive-lift inline-flex items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--ink-primary)]"
            >
              Client onboarding
            </Link>
          </div>
        </div>

        {/* Interactive App Frame */}
        <div
          aria-label="Live Call Telemetry Preview"
          className="lg:col-span-7 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] shadow-sm overflow-hidden"
        >
          {/* Scenario Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-4 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-secondary)]">
              <PhoneCall className="h-3.5 w-3.5 text-[var(--accent-signal)] shrink-0" />
              <span className="truncate">{active.caller}</span>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)] whitespace-nowrap">
              {active.duration} · {active.turns}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-4 py-2">
            {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => {
              const selected = scenario === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScenario(key)}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    selected
                      ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                      : "text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)]"
                  }`}
                >
                  {SCENARIOS[key].label}
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-[var(--border-hairline)]">
            <div className="space-y-3 p-5 text-xs leading-relaxed">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>{active.tcpa}</span>
              </div>

              <div className="space-y-2">
                {active.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border border-[var(--border-hairline)] p-3 ${
                      msg.speaker === "RECEPTIONIST"
                        ? "bg-[var(--surface-canvas)]"
                        : "bg-[var(--surface-panel)]"
                    }`}
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
            </div>

            <div className="bg-[var(--surface-canvas)] px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--ink-primary)]">
                  <Activity className="h-3.5 w-3.5 text-[var(--accent-signal)] shrink-0" />
                  3-Stage Pipeline Latency
                </span>
                <span className="tabular-nums text-[var(--ink-secondary)]">
                  P50 <strong>{active.p50}ms</strong> · P95 <strong>{active.p95}ms</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5">
                  <div className="text-[10px] text-[var(--ink-muted)]">1. EOU (VAD + Turn)</div>
                  <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                    {active.eou} ms
                  </div>
                </div>
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5">
                  <div className="text-[10px] text-[var(--ink-muted)]">2. LLM TTFT</div>
                  <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                    {active.ttft} ms
                  </div>
                </div>
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5">
                  <div className="text-[10px] text-[var(--ink-muted)]">3. TTS TTFB</div>
                  <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">
                    {active.ttfb} ms
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Screen 2: Dealt Moment — 3-Lane Telephony Execution Architecture */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20 space-y-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                Isolated Execution Path
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-3xl">
                One voice worker. Scoped per call.
              </h2>
            </div>
            <p className="max-w-[44ch] text-sm text-[var(--ink-secondary)]">
              The real-time agent never touches PostgreSQL directly—every booking, transfer, and
              transcript write goes through call-scoped API tokens.
            </p>
          </div>

          {/* Hub + Processor + 3 Parallel Lanes Diagram */}
          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-12">
            {/* Input */}
            <div className="lg:col-span-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 space-y-2">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <Radio className="h-3.5 w-3.5 shrink-0" />
                <span>INPUT · PSTN / WEBRTC</span>
              </div>
              <div className="text-sm font-semibold text-[var(--ink-primary)]">
                SIP Trunk + BVC Filter
              </div>
              <p className="text-xs text-[var(--ink-secondary)]">
                Twilio or Telnyx audio cleaned with telephony noise cancellation before VAD.
              </p>
            </div>

            {/* Connector */}
            <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
              <div className="h-px w-full bg-[var(--border-hairline)] relative">
                <span className="absolute right-0 -top-1 h-2 w-2 rounded-full bg-[var(--accent-signal)] animate-pulse" />
              </div>
            </div>

            {/* Main Processor */}
            <div className="lg:col-span-4 rounded-lg border-2 border-[var(--ink-primary)] bg-[var(--surface-canvas)] p-5 space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                LiveKit Agents Runtime
              </div>
              <div className="text-base font-bold text-[var(--ink-primary)]">
                Turn Detector + Gemini 2.5 Flash
              </div>
              <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
                Per-tenant patience cadence, Deepgram Nova-3 keyterms, and non-interruptible TCPA
                disclosure.
              </p>
            </div>

            {/* Connector */}
            <div className="hidden lg:flex lg:col-span-1 items-center justify-center">
              <div className="h-px w-full bg-[var(--border-hairline)] relative">
                <span className="absolute right-0 -top-1 h-2 w-2 rounded-full bg-[var(--accent-signal)] animate-pulse" />
              </div>
            </div>

            {/* 3 Parallel Lanes */}
            <div className="lg:col-span-3 space-y-2.5">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3 flex items-start gap-2.5">
                <Calendar className="h-4 w-4 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-[var(--ink-primary)]">
                    Google Calendar Dispatch
                  </div>
                  <div className="text-[11px] text-[var(--ink-secondary)]">
                    Live slot checks &amp; territory routing
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3 flex items-start gap-2.5">
                <Database className="h-4 w-4 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-[var(--ink-primary)]">
                    Postgres RLS + CRM
                  </div>
                  <div className="text-[11px] text-[var(--ink-secondary)]">
                    Retry-backed call &amp; lead sync
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-[var(--ink-primary)]">
                    Automated QA &amp; CSAT
                  </div>
                  <div className="text-[11px] text-[var(--ink-secondary)]">
                    5-part rubric &amp; TCPA audit trail
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between font-mono text-[11px] text-[var(--ink-muted)]">
          <span>VedaVoice Control Plane · Multi-Tenant SIP &amp; WebRTC</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-[var(--ink-primary)]">
              Sign in
            </Link>
            <Link href="/onboarding" className="hover:text-[var(--ink-primary)]">
              Onboarding
            </Link>
            <Link href="/admin/dashboard" className="hover:text-[var(--ink-primary)]">
              Agency Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
