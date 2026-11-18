"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
  ShieldCheck,
  PhoneCall,
  ArrowRight,
  Lock,
  Mail,
  AlertCircle,
  Activity,
  CheckCircle2,
  Radio,
  Server,
  Zap,
  Sparkles,
} from "lucide-react";
import { CardSpotlight } from "@/components/ui/card-spotlight";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const u = await login(email, password);
      const target = u.role === "platform_admin" ? "/admin/dashboard" : "/portal/dashboard";
      window.location.href = target;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError("");
    setSubmitting(true);
    try {
      const u = await login(demoEmail, demoPass);
      const target = u.role === "platform_admin" ? "/admin/dashboard" : "/portal/dashboard";
      window.location.href = target;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Quick login failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#fbfbfd] text-zinc-900 font-sans antialiased flex flex-col justify-between selection:bg-zinc-200 selection:text-zinc-900">
      {/* ================= TOP NAVIGATION ================= */}
      <header className="w-full border-b border-zinc-200/80 bg-white/80 backdrop-blur-md px-6 sm:px-12 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center font-bold text-white shadow-sm">
            <span className="font-mono text-sm tracking-tight">V</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-zinc-900">
                VedaVoice
              </span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium">
              Autonomous Telephony &amp; Dispatch Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-[11px] font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>SIP Network: Operational</span>
          </div>
          <Link
            href="/onboarding"
            className="text-zinc-600 hover:text-zinc-900 transition-colors text-xs font-semibold"
          >
            Create Account &rarr;
          </Link>
        </div>
      </header>

      {/* ================= MAIN CONTENT ================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 sm:px-10 lg:px-12 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Left Column: Platform Editorial & Telemetry Showcase */}
        <section className="lg:col-span-7 space-y-8">
          <div className="space-y-4 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-zinc-200 shadow-sm text-xs font-mono text-zinc-700">
              <Radio className="w-3.5 h-3.5 text-zinc-700" />
              <span>Multi-Tenant Voice Receptionist</span>
              <span className="text-zinc-300">&bull;</span>
              <span className="text-zinc-500">Sub-400ms Pipeline</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-semibold tracking-[-0.03em] text-zinc-950 leading-[1.18]">
              Autonomous phone receptionists that handle emergencies and bookings 24/7.
            </h1>

            <p className="text-base text-zinc-600 leading-relaxed max-w-lg">
              Engineered specifically for trade contractors and medical practices. Integrates live carrier SIP trunks, strict tenant row-level security, and two-way Google Calendar synchronization.
            </p>
          </div>

          {/* Operational Inspection Card with 21st.dev/Aceternity Spotlight */}
          <CardSpotlight className="max-w-xl space-y-4" color="#6366f1">
            <div className="flex items-center justify-between pb-3.5 border-b border-zinc-100 text-xs font-mono">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>INCOMING TELEPHONY SESSION</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-[11px] font-semibold border border-zinc-200/80">
                P95 Latency: 124ms
              </span>
            </div>

            {/* Live Call Event Snapshot */}
            <div className="rounded-xl bg-zinc-50 border border-zinc-200/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                <span>TENANT: APEX PLUMBING &bull; LINE +1 (512) 555-0199</span>
                <span className="text-emerald-700 font-semibold">TRIAGE: 1.4s</span>
              </div>

              <div className="space-y-1.5 text-xs text-zinc-700 font-sans">
                <p>
                  <strong className="text-zinc-900 font-semibold">Caller:</strong> &ldquo;Water is leaking through our ceiling into the main hallway right now.&rdquo;
                </p>
                <p>
                  <strong className="text-zinc-900 font-semibold">Agent:</strong> &ldquo;Emergency flagged. I have reserved your emergency dispatch window and dispatched an SMS alert to the on-call master plumber.&rdquo;
                </p>
              </div>
            </div>

            {/* Quality Gates */}
            <div className="grid grid-cols-3 gap-3 pt-1 text-center font-mono">
              <div className="p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60">
                <div className="text-xs font-bold text-zinc-900">&lt;150ms</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-tight">Turn-Taking</div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60">
                <div className="text-xs font-bold text-zinc-900">Level A</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-tight">STIR / SHAKEN</div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/60">
                <div className="text-xs font-bold text-zinc-900">100% RLS</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-tight">Data Isolation</div>
              </div>
            </div>
          </CardSpotlight>

          {/* Three Feature Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <Zap className="w-3.5 h-3.5 text-zinc-700" />
                Speech Barge-In
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                Callers can naturally interrupt the agent mid-sentence with instantaneous audio cut-off.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <Server className="w-3.5 h-3.5 text-zinc-700" />
                Row-Level Security
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                PostgreSQL RLS ensures zero cross-tenant contamination across call logs and recordings.
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-700" />
                Compliance Guard
              </div>
              <p className="text-zinc-500 text-[11px] leading-relaxed">
                Built-in TCPA calling window gates, automated opt-out scrub, and call caps.
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: High-Craft Light Authentication Plane */}
        <section className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-md bg-white border border-zinc-200 rounded-3xl p-8 sm:p-10 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.06)] space-y-7">
            {/* Form Header */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
                Sign in to workspace
              </h2>
              <p className="text-xs text-zinc-500">
                Enter your account credentials or pick an instant verified role.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* Credentials Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 block">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@vedavoice.io"
                    className="w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3.5 py-2.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 font-mono transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-800 block">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3.5 py-2.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 font-mono transition-all shadow-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
              >
                {submitting ? "Authenticating..." : "Sign in to Control Plane"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Instant Verified Roles */}
            <div className="pt-5 border-t border-zinc-100 space-y-2.5">
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-zinc-400 block">
                Instant Verified Demo Access
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    handleQuickLogin("admin@vedavoice.io", "Admin@VedaVoice2026!")
                  }
                  className="p-3 rounded-xl border border-zinc-200 bg-zinc-50/70 hover:bg-white hover:border-zinc-300 text-left transition-all active:scale-[0.98] group shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                    <ShieldCheck className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-950" />
                    <span>Agency Admin</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    Fleet Management
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleQuickLogin(
                      "owner@apexplumbing.com",
                      "ApexOwner2026!"
                    )
                  }
                  className="p-3 rounded-xl border border-zinc-200 bg-zinc-50/70 hover:bg-white hover:border-zinc-300 text-left transition-all active:scale-[0.98] group shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Client Tenant</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                    Apex Plumbing
                  </div>
                </button>
              </div>
            </div>

            {/* Onboarding Wizard Link */}
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-zinc-900">
                  New business client?
                </div>
                <div className="text-[11px] text-zinc-500">
                  14-day trial &bull; 100 free minutes
                </div>
              </div>
              <Link
                href="/onboarding"
                className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-800 text-xs font-medium transition-all shadow-sm inline-flex items-center gap-1 active:scale-[0.98]"
              >
                Set up &rarr;
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="w-full border-t border-zinc-200/80 bg-white/70 px-6 sm:px-12 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono">
        <div>
          &copy; {new Date().getFullYear()} VedaVoice Infrastructure Inc. All rights reserved.
        </div>
        <div className="flex items-center gap-4">
          <span>SOC 2 Type II Audited</span>
          <span>&bull;</span>
          <span>HIPAA-Ready Telephony</span>
          <span>&bull;</span>
          <span>LiveKit Scale Cluster</span>
        </div>
      </footer>
    </div>
  );
}
