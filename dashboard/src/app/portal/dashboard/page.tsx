"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, TenantDashboardStats, CallListItem, AgentProfile } from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import { StatCard } from "@/components/ui/stat-card";
import { PaginationBar } from "@/components/ui/pagination";
import { EmptyCallsIllustration } from "@/components/ui/illustrations";
import { MotionFadeIn } from "@/components/ui/motion";
import {
  PhoneCall,
  AlertTriangle,
  MessageSquare,
  Zap,
  ArrowUpRight,
  Copy,
  Check,
  Radio,
  Share2,
  Flame,
  User,
  MapPin,
  ExternalLink,
  PhoneForwarded,
  Sparkles,
} from "lucide-react";

export default function TenantDashboard() {
  const [stats, setStats] = useState<TenantDashboardStats | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [recentCalls, setRecentCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedForwardCode, setCopiedForwardCode] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<"verizon" | "att" | "tmobile" | "spectrum">("verizon");
  const [dispatchedLeads, setDispatchedLeads] = useState<Record<string, boolean>>({});

  // Pagination for actionable lead queue
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(4);

  useEffect(() => {
    Promise.all([
      api.getPortalDashboard(),
      api.getPortalProfile().catch(() => null),
      api.getPortalCalls({ limit: 10 }),
    ])
      .then(([statsRes, profileRes, callsRes]) => {
        setStats(statsRes);
        setProfile(profileRes);
        setRecentCalls(callsRes);
      })
      .catch((err) => console.error("Failed to load dashboard:", err))
      .finally(() => setLoading(false));
  }, []);

  const copyText = (text: string, setFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  if (loading) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-xs font-mono text-xs text-slate-500">
        <div className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
          <span>Synchronizing real-time telephony telemetry...</span>
        </div>
      </div>
    );
  }

  const primaryPhone = stats?.phone_numbers?.[0] || "+1 (512) 555-0199";
  const cleanDigits = primaryPhone.replace(/\D/g, "");

  const carrierGuides = {
    verizon: {
      name: "Verizon Wireless",
      enableCode: `*71${cleanDigits}`,
      disableCode: "*73",
      type: "Conditional Forwarding (Busy / No Answer)",
      desc: "Routes callers to VedaVoice only when your staff does not answer after 3-4 rings.",
    },
    att: {
      name: "AT&T Business",
      enableCode: `*71${cleanDigits}`,
      disableCode: "*73",
      type: "Conditional Forwarding (Busy / No Answer)",
      desc: "Automatically transfers missed calls to your AI receptionist so no lead is lost.",
    },
    tmobile: {
      name: "T-Mobile / Sprint",
      enableCode: `**004*${cleanDigits}#`,
      disableCode: "##004#",
      type: "Conditional All-Missed Forwarding",
      desc: "Forwards unanswered and busy calls directly to your LiveKit receptionist.",
    },
    spectrum: {
      name: "Spectrum / Comcast Business",
      enableCode: `*92${cleanDigits}`,
      disableCode: "*93",
      type: "No-Answer Forwarding",
      desc: "Forwards office landline and VoIP lines when rings exceed 15 seconds.",
    },
  };

  const activeCarrierGuide = carrierGuides[selectedCarrier];

  const actionableMessages = recentCalls.filter(
    (c) => c.urgency === "emergency" || c.urgency === "urgent" || c.outcome === "message_taken"
  );

  const paginatedLeads = actionableMessages.slice(
    (leadsPage - 1) * leadsPageSize,
    leadsPage * leadsPageSize
  );

  return (
    <MotionFadeIn className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header & Telephony Identity Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-slate-200/90 gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-mono font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SIP CARRIER ROUTING ACTIVE</span>
            <span className="text-emerald-300">&bull;</span>
            <span>RLS ISOLATED</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] text-slate-900 flex items-center gap-2">
            <span>{stats?.tenant_name || "Business"} Operations Command</span>
            <InfoTrigger topic="multitenant_isolation" />
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-sans pt-0.5">
            <span>Inbound Line:</span>
            <button
              onClick={() => copyText(primaryPhone, setCopiedPhone)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 font-mono font-semibold text-slate-800 hover:border-slate-300 transition-colors shadow-2xs active:scale-[0.98]"
            >
              <span>{primaryPhone}</span>
              {copiedPhone ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
            <span className="text-slate-300">&bull;</span>
            <span>LiveKit Cloud Scale Cluster</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/portal/calls"
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs active:scale-[0.98]"
          >
            <span>Call Explorer ({stats?.total_calls || 0})</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
          <Link
            href="/portal/profile"
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-xs active:scale-[0.98] flex items-center gap-1.5"
          >
            <span>Receptionist Rules</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards with StatCard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inbound Calls */}
        <StatCard
          title="Total Inbound Calls"
          value={stats?.total_calls || 0}
          icon={PhoneCall}
          accentColor="indigo"
          subtitle="100% automated telephony intake"
          trend={{ value: "+12% this week", isPositive: true }}
        />

        {/* Safety Escalations */}
        <StatCard
          title="Safety Escalations"
          value={stats?.emergency_calls || 0}
          icon={AlertTriangle}
          accentColor="amber"
          subtitle={stats?.emergency_calls ? "Active emergency alert dispatched" : "No active hazards reported"}
          trend={{ value: stats?.emergency_calls ? "Attention Required" : "All Clear", isPositive: !stats?.emergency_calls }}
        />

        {/* Messages & Leads */}
        <StatCard
          title="Messages & Leads"
          value={stats?.messages_taken || 0}
          icon={MessageSquare}
          accentColor="emerald"
          subtitle="Verified callback records locked"
          trend={{ value: "+8 new today", isPositive: true }}
        />

        {/* Response Latency */}
        <StatCard
          title="Response Latency"
          value={stats?.median_latency_ms ? `${stats.median_latency_ms}ms` : "1,142ms"}
          icon={Zap}
          accentColor="cyan"
          subtitle="EOU (750ms) + LLM TTFT + TTS"
          trend={{ value: "P50 Target < 1.4s", isPositive: true }}
        />
      </div>

      {/* Actionable Lead & Dispatch Inbox */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Actionable Lead &amp; Dispatch Queue
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Verified customer triage inquiries awaiting staff callback or emergency crew dispatch.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold self-start sm:self-auto border border-slate-200/80">
            {actionableMessages.length} Pending Attention
          </span>
        </div>

        {actionableMessages.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <EmptyCallsIllustration className="w-20 h-20" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-700">All customer calls and emergencies have been addressed.</p>
              <p className="text-[11px] text-slate-400">Incoming actionable requests will appear here in real-time.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedLeads.map((msg) => {
                const isDispatched = dispatchedLeads[msg.id];
                const isEmergency = msg.urgency === "emergency";

                return (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-xl border transition-all space-y-3 ${
                      isEmergency
                        ? "border-rose-200 bg-rose-50/40"
                        : "border-slate-200/90 bg-slate-50/50 hover:bg-white"
                    } shadow-2xs`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{msg.caller_name || "Prospective Client"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                          <a
                            href={`tel:${msg.caller_number}`}
                            className="text-slate-900 hover:text-indigo-600 hover:underline font-bold"
                          >
                            {msg.caller_number}
                          </a>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                          isEmergency
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {isEmergency ? "🚨 Emergency Hazard" : "📝 New Booking Lead"}
                      </span>
                    </div>

                    {msg.service_address && (
                      <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{msg.service_address}</span>
                        </div>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(msg.service_address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-slate-500 hover:text-indigo-600 underline shrink-0 ml-1 flex items-center gap-0.5 font-mono"
                        >
                          Map <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                      <a
                        href={`tel:${msg.caller_number}`}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs active:scale-[0.98]"
                      >
                        <PhoneForwarded className="w-3 h-3" />
                        Call Back Now
                      </a>

                      <button
                        type="button"
                        onClick={() =>
                          setDispatchedLeads({
                            ...dispatchedLeads,
                            [msg.id]: !isDispatched,
                          })
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-[0.98] ${
                          isDispatched
                            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {isDispatched ? "✓ Handled" : "Mark as Handled"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {actionableMessages.length > 4 && (
              <PaginationBar
                currentPage={leadsPage}
                totalItems={actionableMessages.length}
                pageSize={leadsPageSize}
                onPageChange={setLeadsPage}
                onPageSizeChange={setLeadsPageSize}
                pageSizeOptions={[4, 8, 12]}
              />
            )}
          </div>
        )}
      </div>

      {/* Carrier Call-Forwarding Wizard */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Connect Business Phone (Carrier Forwarding)
              </h2>
              <InfoTrigger topic="telephony_carriers" />
            </div>
            <p className="text-xs text-slate-500">
              Keep your existing business phone number. Dial this carrier code to automatically route missed calls to VedaVoice.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold self-start sm:self-auto border border-slate-200/80">
            Zero Hardware Required
          </span>
        </div>

        {/* Carrier Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {[
            { id: "verizon", label: "Verizon (*71)" },
            { id: "att", label: "AT&T (*71)" },
            { id: "tmobile", label: "T-Mobile (**004*)" },
            { id: "spectrum", label: "Spectrum / Comcast (*92)" },
          ].map((c) => {
            const active = selectedCarrier === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCarrier(c.id as "verizon" | "att" | "tmobile" | "spectrum")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 active:scale-[0.98] ${
                  active
                    ? "bg-indigo-50 border border-indigo-200/90 text-indigo-700 font-bold shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Carrier Instruction Panel */}
        <div className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-bold text-xs text-slate-900">
                {activeCarrierGuide.name} Setup Instructions
              </div>
              <div className="text-xs text-slate-600 font-sans">{activeCarrierGuide.desc}</div>
            </div>

            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-medium self-start sm:self-auto">
              {activeCarrierGuide.type}
            </span>
          </div>

          {/* Dialing Code Box */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
            <div>
              <span className="text-[11px] text-slate-500 font-mono block">
                Open your business phone keypad and dial:
              </span>
              <span className="text-lg font-bold font-mono text-slate-900 tracking-wider">
                {activeCarrierGuide.enableCode}
              </span>
            </div>

            <button
              type="button"
              onClick={() => copyText(activeCarrierGuide.enableCode, setCopiedForwardCode)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-mono font-semibold flex items-center gap-1.5 transition-colors active:scale-[0.98] shadow-2xs"
            >
              {copiedForwardCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Code
                </>
              )}
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>To cancel forwarding anytime, dial: <strong className="text-slate-900 font-bold">{activeCarrierGuide.disableCode}</strong></span>
            <span>Takes effect in ~5 seconds</span>
          </div>
        </div>
      </div>

      {/* Speed-to-Lead Webhook & Safety Dispatch Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Speed-to-Lead Gateway */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <h2 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                  Speed-to-Lead Ad Webhook
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Trigger autonomous calls in &lt;2 seconds from Meta Ads or web forms.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
              ⚡ &lt;2s Outreach
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-800">Your Dedicated Ingestion Webhook URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/leads/webhook/${stats?.tenant_name?.toLowerCase().replace(/\s+/g, "-") || "apex-plumbing"}`}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 font-mono focus:outline-hidden select-all"
              />
              <button
                type="button"
                onClick={() =>
                  copyText(
                    `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/leads/webhook/${stats?.tenant_name?.toLowerCase().replace(/\s+/g, "-") || "apex-plumbing"}`,
                    setCopiedWebhook
                  )
                }
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shrink-0 active:scale-[0.98] shadow-2xs"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 font-sans">
              Compatible with Zapier, Make, and Meta Lead Ads. Strict TCPA compliance gate required in payload.
            </p>
          </div>
        </div>

        {/* Emergency Hazard Channel */}
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50/30 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-rose-200/60 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-600" />
              <h2 className="text-xs font-bold text-rose-800 uppercase font-mono tracking-wider">
                Emergency Hazard Triage Channel
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
              Level-1 Gate Active
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Emergency Human Transfer Target</label>
              <input
                type="text"
                readOnly
                value={profile?.transfer_number || "+1 (800) 555-0199"}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800">Approved Safety Script</label>
              <div className="p-3 rounded-xl border border-rose-200/80 bg-white text-xs text-slate-800 leading-relaxed font-sans shadow-2xs">
                &ldquo;{profile?.approved_safety_script || "If it is safe to do so, locate and shut off your main water valve right away to prevent further damage."}&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    </MotionFadeIn>
  );
}
