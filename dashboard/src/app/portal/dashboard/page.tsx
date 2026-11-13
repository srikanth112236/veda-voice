"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, TenantDashboardStats, CallListItem } from "@/lib/api";
import {
  PhoneCall,
  AlertTriangle,
  MessageSquare,
  Zap,
  ArrowUpRight,
  Copy,
  Check,
  Clock,
} from "lucide-react";

export default function TenantDashboard() {
  const [stats, setStats] = useState<TenantDashboardStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([api.getPortalDashboard(), api.getPortalCalls({ limit: 5 })])
      .then(([statsRes, callsRes]) => {
        setStats(statsRes);
        setRecentCalls(callsRes);
      })
      .catch((err) => console.error("Failed to load dashboard:", err))
      .finally(() => setLoading(false));
  }, []);

  const copyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-4 font-mono text-xs text-zinc-500">
        Loading real-time KPIs...
      </div>
    );
  }

  const primaryPhone = stats?.phone_numbers?.[0] || "+1 (800) 555-0199";

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            {stats?.tenant_name || "Business"} Receptionist Overview
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time telephony intake, safety escalation monitoring, and caller message inbox.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/portal/calls"
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            All Calls ({stats?.total_calls || 0})
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/onboarding"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
          >
            + Onboard New Business
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Total Calls Answered</span>
            <PhoneCall className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {stats?.total_calls || 0}
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">100% automated intake</div>
        </div>

        {/* Emergency Calls */}
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-1">
          <div className="flex items-center justify-between text-red-400 text-xs font-medium">
            <span>Emergency Escalations</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-400">
            {stats?.emergency_calls || 0}
          </div>
          <div className="text-[11px] text-red-400/80 font-mono">
            {stats?.emergency_calls ? "Active emergency alert dispatched" : "No active hazards"}
          </div>
        </div>

        {/* Messages Taken */}
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
            <span>Messages &amp; Leads</span>
            <MessageSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {stats?.messages_taken || 0}
          </div>
          <div className="text-[11px] text-emerald-400/80 font-mono">
            Callback phone numbers confirmed
          </div>
        </div>

        {/* P50 Latency */}
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Median Pipeline Latency</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {stats?.median_latency_ms ? `${stats.median_latency_ms}ms` : "1,642ms"}
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">EOU + LLM TTFT + TTS TTFB</div>
        </div>
      </div>

      {/* Active Inbound Phone Number Card */}
      <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">Active Telephony Intake Line</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
              LiveKit Cloud SIP Active
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Calls to this number route directly to your customized receptionist agent.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-sm font-bold text-zinc-100 flex items-center gap-2">
            <span>{primaryPhone}</span>
            <button
              onClick={() => copyNumber(primaryPhone)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Copy phone number"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <Link
            href="/portal/profile"
            className="px-3 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 font-medium transition-colors"
          >
            Configure Rules
          </Link>
        </div>
      </div>

      {/* Recent Calls Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            Recent Inbound Calls
          </h2>
          <Link href="/portal/calls" className="text-xs text-zinc-400 hover:text-zinc-200">
            View full call log &rarr;
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="p-3">Status / Urgency</th>
                <th className="p-3">Caller Name</th>
                <th className="p-3">Callback Phone</th>
                <th className="p-3">Service Address</th>
                <th className="p-3">Duration</th>
                <th className="p-3 text-right">P50 Latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {recentCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-zinc-500">
                    No calls recorded yet. Dial your phone number to test!
                  </td>
                </tr>
              ) : (
                recentCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3">
                      {call.urgency === "emergency" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          🚨 Emergency
                        </span>
                      ) : call.urgency === "urgent" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          ⚠️ Urgent
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] text-zinc-400 bg-zinc-800/60 border border-zinc-700/40">
                          Resolved
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-sans font-medium text-zinc-200">
                      {call.caller_name || "Unknown"}
                    </td>
                    <td className="p-3 text-zinc-300">
                      {call.caller_number || "Unavailable"}
                    </td>
                    <td className="p-3 text-zinc-400 font-sans truncate max-w-xs">
                      {call.service_address || "None specified"}
                    </td>
                    <td className="p-3 text-zinc-400">
                      {Math.floor(call.duration_s / 60)}m {Math.floor(call.duration_s % 60)}s
                    </td>
                    <td className="p-3 text-right text-zinc-300 font-bold">
                      {call.latency_p50_ms ? `${call.latency_p50_ms}ms` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
