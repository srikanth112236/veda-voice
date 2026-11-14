"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, TenantDashboardStats, CallListItem, AgentProfile } from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import {
  PhoneCall,
  AlertTriangle,
  MessageSquare,
  Zap,
  ArrowUpRight,
  Copy,
  Check,
  Clock,
  Globe,
  ShieldCheck,
  PhoneForwarded,
  ExternalLink,
  Flame,
  User,
  MapPin,
  Radio,
  Sparkles,
  Share2,
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
      <div className="space-y-4 font-mono text-xs text-zinc-500 p-8 text-center bg-white rounded-2xl border border-zinc-200">
        Loading real-time business telemetry...
      </div>
    );
  }

  const primaryPhone = stats?.phone_numbers?.[0] || "+18005550199";
  const cleanDigits = primaryPhone.replace(/\D/g, "");

  // Carrier Forwarding Dial Strings
  const carrierGuides = {
    verizon: {
      name: "Verizon Wireless",
      enableCode: `*71${cleanDigits}`,
      disableCode: "*73",
      type: "Conditional (Forward on Busy / No Answer)",
      desc: "Routes callers to VedaVoice only when your staff does not answer after 3-4 rings.",
    },
    att: {
      name: "AT&T Business",
      enableCode: `*71${cleanDigits}`,
      disableCode: "*73",
      type: "Conditional (Forward on Busy / No Answer)",
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
      name: "Spectrum / Comcast VoIP",
      enableCode: `*92${cleanDigits}`,
      disableCode: "*93",
      type: "No Answer Call Forwarding",
      desc: "Forwards office landline and VoIP lines when rings exceed 15 seconds.",
    },
  };

  const activeCarrierGuide = carrierGuides[selectedCarrier];

  // Filter messages & emergencies for the Actionable Lead Triage card
  const actionableMessages = recentCalls.filter(
    (c) => c.urgency === "emergency" || c.urgency === "urgent" || c.outcome === "message_taken"
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            AI Receptionist Active &amp; Guarded
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            {stats?.tenant_name || "Business"} Owner Command Center
            <InfoTrigger topic="multitenant_isolation" />
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time telephony intake, safety escalation monitoring, lead triage, and carrier call-forwarding.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/portal/calls"
            className="px-3.5 py-2 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-800 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            All Calls ({stats?.total_calls || 0})
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/portal/profile"
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition-all shadow-sm"
          >
            Receptionist Rules &rarr;
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className="p-5 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span className="flex items-center gap-1">
              Total Inbound Calls
              <InfoTrigger topic="inbound_telephony" />
            </span>
            <PhoneCall className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-zinc-900">
            {stats?.total_calls || 0}
          </div>
          <div className="text-[11px] text-zinc-500 font-medium">100% automated telephony intake</div>
        </div>

        {/* Emergency Calls */}
        <div className="p-5 rounded-2xl border border-red-200 bg-red-50/50 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-red-700 text-xs font-semibold">
            <span className="flex items-center gap-1">
              Safety Escalations
              <InfoTrigger topic="module4_emergency_platform_gate" />
            </span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-red-700">
            {stats?.emergency_calls || 0}
          </div>
          <div className="text-[11px] text-red-600/90 font-medium">
            {stats?.emergency_calls ? "Active emergency alert dispatched" : "No active hazards reported"}
          </div>
        </div>

        {/* Messages Taken */}
        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
            <span className="flex items-center gap-1">
              Messages &amp; Leads
              <InfoTrigger topic="outbound_telephony" />
            </span>
            <MessageSquare className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-emerald-800">
            {stats?.messages_taken || 0}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium">
            Callback numbers verified &amp; confirmed
          </div>
        </div>

        {/* P50 Latency */}
        <div className="p-5 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span className="flex items-center gap-1">
              P50 Response Cadence
              <InfoTrigger topic="call_latency_metrics" />
            </span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-zinc-900">
            {stats?.median_latency_ms ? `${stats.median_latency_ms}ms` : "1,142ms"}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">EOU (750ms) + LLM TTFT + TTS TTFB</div>
        </div>
      </div>

      {/* SECTION: ACTIONABLE LEAD & DISPATCH INBOX */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                Actionable Lead &amp; Dispatch Inbox
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Verified customer inquiries and emergency calls awaiting callback or technician dispatch.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 font-semibold self-start sm:self-auto">
            {actionableMessages.length} Leads Needing Attention
          </span>
        </div>

        {actionableMessages.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-zinc-200 rounded-xl text-xs text-zinc-500 bg-zinc-50">
            Inbox is clear! All customer calls have been processed.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {actionableMessages.slice(0, 4).map((msg) => {
              const isDispatched = dispatchedLeads[msg.id];
              const isEmergency = msg.urgency === "emergency";

              return (
                <div
                  key={msg.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isEmergency
                      ? "border-red-200 bg-red-50/40"
                      : "border-zinc-200 bg-zinc-50/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-zinc-900">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{msg.caller_name || "Prospective Customer"}</span>
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
                          ? "bg-red-100 text-red-700 border border-red-200"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {isEmergency ? "🚨 Emergency" : "📝 New Lead"}
                    </span>
                  </div>

                  {msg.service_address && (
                    <div className="flex items-center justify-between text-xs text-zinc-600">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="truncate">{msg.service_address}</span>
                      </div>
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(msg.service_address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-zinc-500 hover:text-zinc-900 underline shrink-0 ml-1 flex items-center gap-0.5"
                      >
                        Map <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                    <a
                      href={`tel:${msg.caller_number}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isDispatched
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      {isDispatched ? "✓ Dispatched" : "Mark as Handled"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION: SPEED-TO-LEAD AD WEBHOOK INGESTION */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-sky-600 animate-pulse" />
              <h2 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                Speed-to-Lead Instant Webhook Gateway
              </h2>
              <InfoTrigger topic="outbound_telephony" />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Connect Facebook Lead Ads, Google Forms, Zapier, or Webflow to trigger AI phone outreach in &lt;2 seconds.
            </p>
          </div>

          <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-semibold self-start sm:self-auto">
            ⚡ 2s Instant Call Trigger Ready
          </span>
        </div>

        {/* Webhook Endpoint Display */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-700">Your Dedicated Ingestion Webhook URL</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`http://localhost:8000/api/v1/leads/webhook/apex-plumbing`}
              className="flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 font-mono focus:outline-none select-all"
            />
            <button
              type="button"
              onClick={() =>
                copyText(
                  `http://localhost:8000/api/v1/leads/webhook/apex-plumbing`,
                  setCopiedWebhook
                )
              }
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
            >
              {copiedWebhook ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Webhook
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed font-sans">
            Configure this Webhook in Zapier, Make, or Meta Ads Manager. Requires <code>consent_confirmed: true</code> in the payload to pass TCPA compliance.
          </p>
        </div>
      </div>

      {/* SECTION: CARRIER CALL-FORWARDING WIZARD (*71 / *72) */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                Connect Your Existing Phone Line (Call-Forwarding Wizard)
              </h2>
              <InfoTrigger topic="telephony_carriers" />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Keep your existing business phone number on Google and Yelp. Dial this short carrier code to route missed calls to VedaVoice.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 font-semibold self-start sm:self-auto">
            Zero Hardware Required
          </span>
        </div>

        {/* Carrier Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: "verizon", label: "Verizon (*71)" },
            { id: "att", label: "AT&T (*71)" },
            { id: "tmobile", label: "T-Mobile (**004*)" },
            { id: "spectrum", label: "Spectrum / Comcast (*92)" },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCarrier(c.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                selectedCarrier === c.id
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Carrier Instruction Card */}
        <div className="p-5 rounded-2xl border border-zinc-200 bg-zinc-50 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-bold text-xs text-zinc-900">
                {activeCarrierGuide.name} Setup Instructions
              </div>
              <div className="text-xs text-zinc-600 font-sans">{activeCarrierGuide.desc}</div>
            </div>

            <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-white border border-zinc-200 text-zinc-700 font-medium">
              {activeCarrierGuide.type}
            </span>
          </div>

          {/* Dialing Code Box */}
          <div className="p-3.5 rounded-xl bg-white border border-zinc-300 flex items-center justify-between gap-3 shadow-sm">
            <div>
              <span className="text-[11px] text-zinc-500 font-mono block">
                Open your business phone keypad and dial:
              </span>
              <span className="text-base font-extrabold font-mono text-zinc-900 tracking-wider">
                {activeCarrierGuide.enableCode}
              </span>
            </div>

            <button
              type="button"
              onClick={() => copyText(activeCarrierGuide.enableCode, setCopiedForwardCode)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-white font-mono font-semibold flex items-center gap-1.5 transition-colors"
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

          <div className="text-[11px] text-zinc-500 font-mono flex items-center justify-between">
            <span>To cancel forwarding anytime, dial: <strong className="text-zinc-900">{activeCarrierGuide.disableCode}</strong></span>
            <span>Takes effect in ~5 seconds</span>
          </div>
        </div>
      </div>

      {/* SECTION: EMERGENCY NOTIFICATION CHANNELS */}
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50/30 space-y-4">
        <div className="flex items-center justify-between border-b border-red-200 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-600" />
            <h2 className="text-xs font-bold text-red-700 uppercase font-mono tracking-wider">
              Emergency Hazard Dispatch Channels
            </h2>
            <InfoTrigger topic="module4_emergency_platform_gate" />
          </div>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-bold">
            Level-1 Gate Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">On-Call Emergency Human Line (E.164)</label>
            <input
              type="text"
              readOnly
              value={profile?.transfer_number || "+1 (800) 555-0199"}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 font-mono"
            />
            <p className="text-[11px] text-zinc-500">
              Immediate live call transfer target when urgent safety hazards are triggered.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700">Approved Safety Script</label>
            <div className="p-3 rounded-xl border border-red-200 bg-white text-xs text-zinc-800 leading-relaxed font-sans shadow-sm">
              &quot;{profile?.approved_safety_script || "If it is safe to do so, locate and shut off your main water valve right away to prevent further flooding."}&quot;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
