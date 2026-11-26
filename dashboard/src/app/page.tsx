"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ArrowRight, PhoneCall, ShieldCheck, Activity } from "lucide-react";

export default function Home() {
  const { user, loading } = useAuth();
  const [routing, setRouting] = useState(false);

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

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)]">
      {/* Top Bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-[var(--border-hairline)] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ink-primary)] font-mono text-sm font-bold text-[var(--surface-panel)]">
            V
          </span>
          <span className="text-sm font-semibold tracking-tight">VedaVoice</span>
        </div>

        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="touch-target inline-flex items-center px-3 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="touch-target interactive-lift inline-flex items-center gap-1.5 rounded-md bg-[var(--ink-primary)] px-4 text-sm font-medium text-[var(--surface-panel)]"
          >
            Deploy receptionist
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      {/* Single-Screen Software Hero with Live HTML App Frame */}
      <main className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-14 lg:grid-cols-12 lg:py-20">
        <section className="space-y-6 lg:col-span-5">
          <p className="font-mono text-xs uppercase tracking-wider text-[var(--ink-muted)]">
            SIP Telephony · LiveKit Agents · Multi-Tenant CRM
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-4xl lg:text-[2.65rem] lg:leading-[1.12]">
            Voice reception that answers, books, and dispatches.
          </h1>
          <p className="max-w-[52ch] text-base leading-relaxed text-[var(--ink-secondary)]">
            Every inbound call gets sub-second turn detection, mandatory TCPA disclosure, emergency
            escalation, and direct Google Calendar scheduling isolated per business.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/login"
              className="touch-target interactive-lift inline-flex items-center gap-2 rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Open control plane
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/onboarding"
              className="touch-target interactive-lift inline-flex items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--ink-primary)]"
            >
              Client onboarding
            </Link>
          </div>
        </section>

        {/* Live HTML Product UI Frame (app-frame) */}
        <section
          aria-label="Live Call Telemetry Preview"
          className="lg:col-span-7 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-4 py-2.5 font-mono text-[11px] text-[var(--ink-secondary)]">
            <div className="flex items-center gap-2">
              <PhoneCall className="h-3.5 w-3.5 text-[var(--accent-signal)]" />
              <span>Apex Plumbing &amp; Heating · SIP Inbound</span>
            </div>
            <span className="tabular-nums text-[var(--ink-muted)]">01m 42s · 6 turns</span>
          </div>

          <div className="divide-y divide-[var(--border-hairline)]">
            {/* Transcript Sample */}
            <div className="space-y-3 p-5 text-xs leading-relaxed">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>TCPA recording disclosure verified · Turn 1</span>
              </div>

              <div className="space-y-2">
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--ink-muted)]">
                    <span>RECEPTIONIST · 890ms</span>
                    <span className="tabular-nums">09:14:02</span>
                  </div>
                  <p className="text-[var(--ink-primary)]">
                    This call may be recorded for quality assurance. Thanks for calling Apex
                    Plumbing &amp; Heating—how can I help?
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--ink-muted)]">
                    <span>CALLER · BVC NOISE FILTER ACTIVE</span>
                    <span className="tabular-nums">09:14:09</span>
                  </div>
                  <p className="text-[var(--ink-primary)]">
                    Our water heater is leaking near the shutoff valve on Congress Ave. Can someone
                    come out today?
                  </p>
                </div>
              </div>
            </div>

            {/* 3-Stage Latency Waterfall */}
            <div className="bg-[var(--surface-canvas)] px-5 py-4">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold text-[var(--ink-primary)]">
                  <Activity className="h-3.5 w-3.5 text-[var(--accent-signal)]" />
                  3-Stage Pipeline Latency
                </span>
                <span className="tabular-nums text-[var(--ink-secondary)]">
                  P50 <strong>890ms</strong> · P95 <strong>1140ms</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5">
                  <div className="text-[10px] text-[var(--ink-muted)]">1. EOU (VAD+Turn)</div>
                  <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">420 ms</div>
                </div>
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5">
                  <div className="text-[10px] text-[var(--ink-muted)]">2. LLM TTFT</div>
                  <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">290 ms</div>
                </div>
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2.5">
                  <div className="text-[10px] text-[var(--ink-muted)]">3. TTS TTFB</div>
                  <div className="mt-0.5 font-semibold text-[var(--ink-primary)]">180 ms</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
