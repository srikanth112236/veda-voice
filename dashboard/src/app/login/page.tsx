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
  Zap,
  Activity,
  CheckCircle2,
  Sparkles,
  Headphones,
  ShieldAlert,
} from "lucide-react";

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
      if (u.role === "platform_admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/portal/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
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
      if (u.role === "platform_admin") {
        router.push("/admin/dashboard");
      } else {
        router.push("/portal/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Quick login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:grid lg:grid-cols-2 bg-zinc-50">
      {/* ================= LEFT SIDE: 50% BRAND VALUE & TELEMETRY SHOWCASE ================= */}
      <div className="relative bg-zinc-950 text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-8">
          {/* Brand header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/25">
              V
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                VedaVoice <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-semibold border border-zinc-700">v2.0</span>
              </div>
              <div className="text-xs text-zinc-400">Autonomous Enterprise Voice Telephony</div>
            </div>
          </div>

          {/* Main Hero Hook */}
          <div className="space-y-4 max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              LiveKit Scale Inference &bull; Carrier SIP Trunks
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Instant 24/7 AI Voice Receptionists for Field Trades &amp; Modern Clinics
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Eliminate missed calls, triage emergency hazards in under two seconds, and capture qualified appointments with sub-second LiveKit conversational intelligence.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 max-w-lg">
            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Headphones className="w-4 h-4 text-indigo-400" />
                14+ Acoustic Personas
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Inworld, Rime, and Deepgram Aura models with zero extra latency.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Zap className="w-4 h-4 text-emerald-400" />
                &lt;150ms Turn-Taking
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Natural conversational flow with instant human speech barge-in interruptibility.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                STIR/SHAKEN Level A
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Carrier-verified caller ID so customer phones never flag your calls as spam.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Activity className="w-4 h-4 text-cyan-400" />
                Zero-Leakage Multi-Tenancy
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Strict tenant isolation, minute quotas, and encrypted call records.
              </p>
            </div>
          </div>
        </div>

        {/* Real-World Customer Impact Quote */}
        <div className="relative z-10 pt-8 border-t border-zinc-800/80 mt-8 space-y-2">
          <div className="flex items-center gap-1 text-emerald-400 text-xs font-mono font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Live Verified Production Deployment
          </div>
          <p className="text-xs text-zinc-300 italic leading-relaxed">
            &ldquo;Apex Plumbing captured 38 emergency calls in their first week after hours, routing flooded basements within 2 seconds without waking up an on-call dispatcher.&rdquo;
          </p>
          <div className="text-[11px] text-zinc-500 font-mono">
            Austin Metro, TX &bull; Inbound Line +1 (512) 555-0199
          </div>
        </div>
      </div>

      {/* ================= RIGHT SIDE: 50% CLEAN LIGHT LOGIN FORM ================= */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
              Sign in to your control plane
            </h2>
            <p className="text-xs text-zinc-500">
              Manage your AI voice receptionist, inspect call recordings, and configure emergency routing.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vedavoice.io"
                  className="w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 font-mono transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-zinc-300 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 font-mono transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              {submitting ? "Authenticating..." : "Sign In to Portal"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="pt-6 border-t border-zinc-200 space-y-3">
            <span className="text-[11px] uppercase font-mono text-zinc-500 font-semibold tracking-wider block">
              1-Click Demo Accounts (Instant Access)
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin@vedavoice.io", "Admin@VedaVoice2026!")}
                className="p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-left transition-all text-xs space-y-1 group"
              >
                <div className="flex items-center gap-1.5 font-bold text-zinc-900 group-hover:text-indigo-600">
                  <ShieldAlert className="w-4 h-4 text-indigo-600" />
                  Agency Admin
                </div>
                <div className="text-[10px] text-zinc-500 truncate font-mono">Super-Admin Plane</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("owner@apexplumbing.com", "ApexOwner2026!")}
                className="p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-left transition-all text-xs space-y-1 group"
              >
                <div className="flex items-center gap-1.5 font-bold text-zinc-900 group-hover:text-emerald-600">
                  <PhoneCall className="w-4 h-4 text-emerald-600" />
                  Client Tenant
                </div>
                <div className="text-[10px] text-zinc-500 truncate font-mono">Apex Plumbing Owner</div>
              </button>
            </div>
          </div>

          {/* Onboarding Wizard CTA */}
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-zinc-900">New business client?</div>
              <div className="text-[11px] text-zinc-500">14-day free trial &bull; 100 free minutes</div>
            </div>
            <Link
              href="/onboarding"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors inline-flex items-center gap-1"
            >
              Start Setup <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
