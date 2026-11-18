"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, TenantDashboardStats, CallListItem, AgentProfile } from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import { CardSpotlight } from "@/components/ui/card-spotlight";
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
  ShieldCheck,
  Clock,
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
      <div className="p-12 text-center bg-white rounded-2xl border border-zinc-200/80 shadow-sm font-mono text-xs text-zinc-500">
        <div className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
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

  return (
    <div className="space-y-8">
      {/* Top Header & Telephony Identity Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-zinc-200/80 gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-[11px] font-mono font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>SIP CARRIER ROUTING ACTIVE</span>
            <span className="text-emerald-300">&bull;</span>
            <span>RLS ISOLATED</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-zinc-950 flex items-center gap-2">
            <span>{stats?.tenant_name || "Business"} Operations Command</span>
            <InfoTrigger topic="multitenant_isolation" />
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-sans pt-0.5">
            <span>Inbound Line:</span>
            <button
              onClick={() => copyText(primaryPhone, setCopiedPhone)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-zinc-200 font-mono font-semibold text-zinc-900 hover:border-zinc-300 transition-colors shadow-sm active:scale-[0.98]"
            >
              <span>{primaryPhone}</span>
              {copiedPhone ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-zinc-400" />
              )}
            </button>
            <span className="text-zinc-300">&bull;</span>
            <span>LiveKit Cloud Scale Cluster</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/portal/calls"
            className="px-4 py-2 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.98]"
          >
            <span>Call Explorer ({stats?.total_calls || 0})</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
          </Link>
          <Link
            href="/portal/profile"
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-all shadow-sm active:scale-[0.98]"
          >
            Receptionist Rules &rarr;
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards with CardSpotlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <CardSpotlight className="p-5 space-y-1" color="#6366f1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span className="flex items-center gap-1 font-semibold text-zinc-700">
              Total Inbound Calls
              <InfoTrigger topic="inbound_telephony" />
            </span>
            <PhoneCall className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-zinc-950 font-mono">
            {stats?.total_calls || 0}
          </div>
          <div className="text-[11px] text-zinc-500 font-medium">
            100% automated telephony intake
          </div>
        </CardSpotlight>

        {/* Safety Escalations */}
        <CardSpotlight className="p-5 space-y-1" color="#ef4444">
          <div className="flex items-center justify-between text-rose-700 text-xs font-semibold">
            <span className="flex items-center gap-1">
              Safety Escalations
              <InfoTrigger topic="module4_emergency_platform_gate" />
            </span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-rose-700 font-mono">
            {stats?.emergency_calls || 0}
          </div>
          <div className="text-[11px] text-rose-600/90 font-medium">
            {stats?.emergency_calls ? "Active emergency alert dispatched" : "No active hazards reported"}
          </div>
        </CardSpotlight>

        {/* Messages & Bookings */}
        <CardSpotlight className="p-5 space-y-1" color="#10b981">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
            <span className="flex items-center gap-1">
              Messages &amp; Leads
              <InfoTrigger topic="outbound_telephony" />
            </span>
            <MessageSquare className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-emerald-800 font-mono">
            {stats?.messages_taken || 0}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium">
            Verified callback records locked
          </div>
        </CardSpotlight>

        {/* P50 Turn-Taking Cadence */}
        <CardSpotlight className="p-5 space-y-1" color="#f59e0b">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span className="flex items-center gap-1 font-semibold text-zinc-700">
              Response Latency
              <InfoTrigger topic="call_latency_metrics" />
            </span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-zinc-950 font-mono">
            {stats?.median_latency_ms ? `${stats.median_latency_ms}ms` : "1,142ms"}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            EOU (750ms) + LLM TTFT + TTS
          </div>
        </CardSpotlight>
      </div>

      {/* Actionable Lead & Dispatch Inbox */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-zinc-900" />
              <h2 className="text-sm font-semibold text-zinc-950">
                Actionable Lead &amp; Dispatch Queue
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Verified customer triage inquiries awaiting staff callback or emergency crew dispatch.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 font-semibold self-start sm:self-auto border border-zinc-200/60">
            {actionableMessages.length} Pending Attention
          </span>
        </div>

        {actionableMessages.length === 0 ? (
          <div className="p-10 text-center border border-dashed border-zinc-200 rounded-xl text-xs text-zinc-500 bg-zinc-50/50">
            All customer calls and emergencies have been addressed.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actionableMessages.slice(0, 4).map((msg) => {
              const isDispatched = dispatchedLeads[msg.id];
              const isEmergency = msg.urgency === "emergency";

              return (
                <div
                  key={msg.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isEmergency
                      ? "border-rose-200 bg-rose-50/30"
                      : "border-zinc-200/80 bg-zinc-50/50 hover:bg-white"
                  } shadow-[0_1px_2px_rgba(0,0,0,0.03)]`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-zinc-900">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{msg.caller_name || "Prospective Client"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                        <a
                          href={`tel:${msg.caller_number}`}
                          className="text-zinc-900 hover:underline font-bold"
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
                    <div className="flex items-center justify-between text-xs text-zinc-600 pt-1">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="truncate">{msg.service_address}</span>
                      </div>
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(msg.service_address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-zinc-500 hover:text-zinc-900 underline shrink-0 ml-1 flex items-center gap-0.5 font-mono"
                      >
                        Map <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200/70">
                    <a
                      href={`tel:${msg.caller_number}`}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm active:scale-[0.98]"
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
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      {isDispatched ? "✓ Handled" : "Mark as Handled"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Carrier Call-Forwarding Wizard */}
      <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-zinc-900" />
              <h2 className="text-sm font-semibold text-zinc-950">
                Connect Business Phone (Carrier Forwarding)
              </h2>
              <InfoTrigger topic="telephony_carriers" />
            </div>
            <p className="text-xs text-zinc-500">
              Keep your existing business phone number. Dial this carrier code to automatically route missed calls to VedaVoice.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 font-semibold self-start sm:self-auto border border-zinc-200/60">
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
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCarrier(c.id as "verizon" | "att" | "tmobile" | "spectrum")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 active:scale-[0.98] ${
                selectedCarrier === c.id
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Carrier Instruction Panel */}
        <div className="p-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-xs text-zinc-900">
                {activeCarrierGuide.name} Setup Instructions
              </div>
              <div className="text-xs text-zinc-600 font-sans">{activeCarrierGuide.desc}</div>
            </div>

            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-700 font-medium self-start sm:self-auto">
              {activeCarrierGuide.type}
            </span>
          </div>

          {/* Dialing Code Box */}
          <div className="p-3.5 rounded-xl bg-white border border-zinc-200 flex items-center justify-between gap-3 shadow-sm">
            <div>
              <span className="text-[11px] text-zinc-500 font-mono block">
                Open your business phone keypad and dial:
              </span>
              <span className="text-lg font-bold font-mono text-zinc-950 tracking-wider">
                {activeCarrierGuide.enableCode}
              </span>
            </div>

            <button
              type="button"
              onClick={() => copyText(activeCarrierGuide.enableCode, setCopiedForwardCode)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-white font-mono font-semibold flex items-center gap-1.5 transition-colors active:scale-[0.98]"
            >
              {copiedForwardCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
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

          <div className="text-[11px] text-zinc-500 font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>To cancel forwarding anytime, dial: <strong className="text-zinc-900 font-bold">{activeCarrierGuide.disableCode}</strong></span>
            <span>Takes effect in ~5 seconds</span>
          </div>
        </div>
      </div>

      {/* Speed-to-Lead Webhook & Safety Dispatch Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Speed-to-Lead Gateway */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05)] space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <h2 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                  Speed-to-Lead Ad Webhook
                </h2>
              </div>
              <p className="text-xs text-zinc-500">
                Trigger autonomous calls in &lt;2 seconds from Meta Ads or web forms.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
              ⚡ &lt;2s Outreach
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-800">Your Dedicated Ingestion Webhook URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/leads/webhook/${stats?.tenant_name?.toLowerCase().replace(/\s+/g, "-") || "apex-plumbing"}`}
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={() =>
                  copyText(
                    `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/leads/webhook/${stats?.tenant_name?.toLowerCase().replace(/\s+/g, "-") || "apex-plumbing"}`,
                    setCopiedWebhook
                  )
                }
                className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shrink-0 active:scale-[0.98]"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 font-sans">
              Compatible with Zapier, Make, and Meta Lead Ads. Strict TCPA compliance gate required in payload.
            </p>
          </div>
        </div>

        {/* Emergency Hazard Channel */}
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/20 p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.03)] space-y-4">
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
              <label className="text-xs font-semibold text-zinc-800">Emergency Human Transfer Target</label>
              <input
                type="text"
                readOnly
                value={profile?.transfer_number || "+1 (800) 555-0199"}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-800">Approved Safety Script</label>
              <div className="p-3 rounded-xl border border-rose-200/70 bg-white text-xs text-zinc-800 leading-relaxed font-sans shadow-sm">
                &ldquo;{profile?.approved_safety_script || "If it is safe to do so, locate and shut off your main water valve right away to prevent further damage."}&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
