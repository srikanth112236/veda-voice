"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ShieldCheck, PhoneCall, ArrowRight, Lock, Mail, AlertCircle } from "lucide-react";

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
      await login(email, password);
      router.push("/");
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
      await login(demoEmail, demoPass);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Quick login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            VedaVoice Telephony Engine v1.0
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Sign in to your control plane
          </h1>
          <p className="text-xs text-zinc-400">
            Manage your AI voice receptionist, inspect live calls, and configure emergency routing.
          </p>
        </div>

        {/* Login form card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-xl p-6 shadow-2xl space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vedavoice.io"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {submitting ? "Authenticating..." : "Sign In"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="pt-4 border-t border-zinc-800/80 space-y-2">
            <span className="text-[10px] uppercase font-mono text-zinc-400 font-semibold tracking-wider block">
              1-Click Demo Accounts (Localhost)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin@vedavoice.io", "Admin@VedaVoice2026!")}
                className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800/50 text-left transition-colors text-xs space-y-0.5"
              >
                <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Agency Admin
                </div>
                <div className="text-[10px] text-zinc-400 truncate">VedaVoice Super-Admin</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("owner@apexplumbing.com", "ApexOwner2026!")}
                className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 hover:bg-zinc-800/50 text-left transition-colors text-xs space-y-0.5"
              >
                <div className="flex items-center gap-1.5 font-semibold text-zinc-200">
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                  Client Tenant
                </div>
                <div className="text-[10px] text-zinc-400 truncate">Apex Plumbing & Heating</div>
              </button>
            </div>
          </div>
        </div>

        {/* Onboarding Link */}
        <div className="text-center text-xs text-zinc-400">
          Want to onboard a new business client?{" "}
          <Link href="/onboarding" className="text-zinc-200 hover:underline font-medium">
            Launch 5-Step Setup &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
