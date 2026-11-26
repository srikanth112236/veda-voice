"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api, TenantDashboardStats, CallListItem, AgentProfile } from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import { StatCard } from "@/components/ui/stat-card";
import { PaginationBar } from "@/components/ui/pagination";
import { EmptyCallsIllustration } from "@/components/ui/illustrations";
import { LiveRadarRing, MotionFadeIn } from "@/components/ui/motion";
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

  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  // Pagination for actionable lead queue
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsPageSize, setLeadsPageSize] = useState(4);

  const handleToggleLeadHandled = async (callId: string, currentlyHandled: boolean) => {
    const nextHandled = !currentlyHandled;
    setSavingLeadId(callId);
    setDispatchedLeads((prev) => ({ ...prev, [callId]: nextHandled }));
    try {
      await api.updateCallFollowup(callId, nextHandled);
    } catch (err) {
      console.error("Failed to update lead status:", err);
      setDispatchedLeads((prev) => ({ ...prev, [callId]: currentlyHandled }));
    } finally {
      setSavingLeadId(null);
    }
  };

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
      <div className="p-12 text-center bg-[var(--surface-panel)] rounded-xl border border-[var(--border-hairline)] font-mono text-xs text-[var(--ink-muted)]">
        <div className="inline-flex items-center gap-2.5">
          <LiveRadarRing color="emerald" size="sm" />
          <span>Synchronizing live workspace telemetry...</span>
        </div>
      </div>
    );
  }

  const primaryPhone = stats?.phone_numbers?.[0] || "";
  const cleanDigits = primaryPhone.replace(/\D/g, "");
  const tenantSlug =
    stats?.tenant_name
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace";
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/v1/leads/webhook/${tenantSlug}`;

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-[var(--border-hairline)] gap-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-[11px] font-mono font-semibold">
            <LiveRadarRing color="emerald" size="sm" />
            <span>SIP CARRIER ROUTING ACTIVE</span>
            <span className="text-emerald-400">&bull;</span>
            <span>WORKSPACE ISOLATED</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink-primary)] flex items-center gap-2">
            <span>{stats?.tenant_name || "Business"} Operations Command</span>
            <InfoTrigger topic="multitenant_isolation" />
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-secondary)] font-sans pt-0.5">
            <span>Inbound Line:</span>
            {primaryPhone ? (
              <button
                type="button"
                onClick={() => copyText(primaryPhone, setCopiedPhone)}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[var(--surface-panel)] border border-[var(--border-hairline)] font-mono tabular-nums font-semibold text-[var(--ink-primary)] hover:border-[var(--ink-muted)] transition-colors active:scale-[0.98]"
              >
                <span>{primaryPhone}</span>
                {copiedPhone ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3 text-[var(--ink-muted)]" />
                )}
              </button>
            ) : (
              <span className="font-mono text-[var(--ink-muted)]">Not provisioned</span>
            )}
            <span className="text-[var(--border-hairline)]">&bull;</span>
            <span>LiveKit Cloud Cluster</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/portal/calls"
            className="px-4 py-2 rounded-lg bg-[var(--surface-panel)] border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-[var(--ink-primary)] text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-[0.98]"
          >
            <span className="tabular-nums">Call Explorer ({stats?.total_calls || 0})</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
          </Link>
          <Link
            href="/portal/profile"
            className="px-4 py-2 rounded-lg bg-[var(--accent-signal)] hover:opacity-90 text-[var(--accent-signal-ink)] text-xs font-semibold transition-all active:scale-[0.98] flex items-center gap-1.5"
          >
            <span>Receptionist Rules</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards with StatCard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Inbound Calls"
          value={stats?.total_calls || 0}
          icon={PhoneCall}
          accentColor="indigo"
          subtitle="Automated voice intake"
        />

        <StatCard
          title="Safety Escalations"
          value={stats?.emergency_calls || 0}
          icon={AlertTriangle}
          accentColor="amber"
          subtitle={stats?.emergency_calls ? "Urgent escalation triggered" : "No active hazards reported"}
          trend={{ value: stats?.emergency_calls ? "Attention Required" : "All Clear", isPositive: !stats?.emergency_calls }}
        />

        <StatCard
          title="Messages & Leads"
          value={stats?.messages_taken || 0}
          icon={MessageSquare}
          accentColor="emerald"
          subtitle="Verified callback records"
        />

        <StatCard
          title="Median Response"
          value={stats?.median_latency_ms ? `${Math.round(stats.median_latency_ms)}ms` : "—"}
          icon={Zap}
          accentColor="cyan"
          subtitle="Turn detection + voice reply"
          trend={stats?.median_latency_ms ? { value: "Measured P50", isPositive: stats.median_latency_ms < 1400 } : undefined}
        />
      </div>

      {/* Actionable Lead & Dispatch Inbox */}
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--accent-signal)]" />
              <h2 className="text-sm font-bold text-[var(--ink-primary)]">
                Actionable Lead &amp; Dispatch Queue
              </h2>
            </div>
            <p className="text-xs text-[var(--ink-secondary)]">
              Verified customer inquiries awaiting staff callback or emergency dispatch.
            </p>
          </div>

          <span className="text-[11px] font-mono tabular-nums px-3 py-1 rounded-full bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-semibold self-start sm:self-auto border border-[var(--border-hairline)]">
            {actionableMessages.length} Pending Attention
          </span>
        </div>

        {actionableMessages.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <EmptyCallsIllustration className="w-20 h-20" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--ink-primary)]">All customer calls and emergencies have been addressed.</p>
              <p className="text-[11px] text-[var(--ink-muted)]">Incoming actionable requests will appear here in real time.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedLeads.map((msg) => {
                const isDispatched = dispatchedLeads[msg.id] ?? Boolean((msg as any).is_followed_up);
                const isEmergency = msg.urgency === "emergency";

                return (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-xl border transition-colors space-y-3 ${
                      isEmergency
                        ? "border-rose-300 bg-rose-500/5"
                        : "border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--ink-primary)]">
                          <User className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                          <span>{msg.caller_name || "Prospective Client"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                          <a
                            href={`tel:${msg.caller_number}`}
                            className="text-[var(--ink-primary)] hover:text-[var(--accent-signal)] hover:underline font-bold"
                          >
                            {msg.caller_number}
                          </a>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                          isEmergency
                            ? "bg-rose-500/10 text-rose-700 border border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
                        }`}
                      >
                        {isEmergency ? "Emergency Hazard" : "New Booking Lead"}
                      </span>
                    </div>

                    {msg.service_address && (
                      <div className="flex items-center justify-between text-xs text-[var(--ink-secondary)] pt-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3 h-3 text-[var(--ink-muted)] shrink-0" />
                          <span className="truncate">{msg.service_address}</span>
                        </div>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(msg.service_address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent-signal)] underline shrink-0 ml-1 flex items-center gap-0.5 font-mono"
                        >
                          Map <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border-hairline)]">
                      <a
                        href={`tel:${msg.caller_number}`}
                        className="px-3 py-1.5 rounded-lg bg-[var(--accent-signal)] hover:opacity-90 text-[var(--accent-signal-ink)] text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98]"
                      >
                        <PhoneForwarded className="w-3 h-3" />
                        Call Back Now
                      </a>

                      <button
                        type="button"
                        disabled={savingLeadId === msg.id}
                        onClick={() => handleToggleLeadHandled(msg.id, isDispatched)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-[0.98] disabled:opacity-50 ${
                          isDispatched
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                            : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]"
                        }`}
                      >
                        {savingLeadId === msg.id ? "Saving..." : isDispatched ? "Handled" : "Mark as Handled"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

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
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-[var(--accent-signal)]" />
              <h2 className="text-sm font-bold text-[var(--ink-primary)]">
                Connect Business Phone (Carrier Forwarding)
              </h2>
              <InfoTrigger topic="telephony_carriers" />
            </div>
            <p className="text-xs text-[var(--ink-secondary)]">
              Keep your existing business phone number. Dial this carrier code to route missed calls to VedaVoice.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-[var(--surface-subtle)] text-[var(--ink-secondary)] font-semibold self-start sm:self-auto border border-[var(--border-hairline)]">
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
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 active:scale-[0.98] ${
                  active
                    ? "bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                    : "border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Carrier Instruction Panel */}
        <div className="p-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-bold text-xs text-[var(--ink-primary)]">
                {activeCarrierGuide.name} Setup Instructions
              </div>
              <div className="text-xs text-[var(--ink-secondary)] font-sans">{activeCarrierGuide.desc}</div>
            </div>

            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[var(--surface-panel)] border border-[var(--border-hairline)] text-[var(--ink-secondary)] font-medium self-start sm:self-auto">
              {activeCarrierGuide.type}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-[var(--surface-panel)] border border-[var(--border-hairline)] flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-[var(--ink-muted)] font-mono block">
                Open your business phone keypad and dial:
              </span>
              <span className="text-lg font-bold font-mono tabular-nums text-[var(--ink-primary)] tracking-wider">
                {cleanDigits ? activeCarrierGuide.enableCode : "Provision a phone number first"}
              </span>
            </div>

            {cleanDigits && (
              <button
                type="button"
                onClick={() => copyText(activeCarrierGuide.enableCode, setCopiedForwardCode)}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent-signal)] hover:opacity-90 text-xs text-[var(--accent-signal-ink)] font-mono font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98]"
              >
                {copiedForwardCode ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Code
                  </>
                )}
              </button>
            )}
          </div>

          <div className="text-[11px] text-[var(--ink-muted)] font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span>To cancel forwarding anytime, dial: <strong className="text-[var(--ink-primary)] font-bold">{activeCarrierGuide.disableCode}</strong></span>
            <span>Takes effect in ~5 seconds</span>
          </div>
        </div>
      </div>

      {/* Speed-to-Lead Webhook & Safety Dispatch Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-bold text-[var(--ink-primary)] uppercase font-mono tracking-wider">
                  Speed-to-Lead Ad Webhook
                </h2>
              </div>
              <p className="text-xs text-[var(--ink-secondary)]">
                Trigger outbound calls within 2 seconds from Meta Ads or web forms.
              </p>
            </div>
            <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-semibold">
              &lt;2s Outreach
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--ink-primary)]">Dedicated Ingestion Webhook URL</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-xs text-[var(--ink-primary)] font-mono focus:outline-hidden select-all"
              />
              <button
                type="button"
                onClick={() => copyText(webhookUrl, setCopiedWebhook)}
                className="px-3.5 py-2 rounded-lg bg-[var(--accent-signal)] hover:opacity-90 text-xs font-semibold text-[var(--accent-signal-ink)] flex items-center gap-1.5 transition-all shrink-0 active:scale-[0.98]"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="text-[11px] text-[var(--ink-muted)] font-sans">
              Compatible with Zapier, Make, and Meta Lead Ads. Requires verified consent flag in payload.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-600" />
              <h2 className="text-xs font-bold text-rose-700 uppercase font-mono tracking-wider">
                Emergency Hazard Triage Channel
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 border border-rose-500/20 font-bold">
              Level-1 Gate Active
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--ink-primary)]">Emergency Human Transfer Target</label>
              <input
                type="text"
                readOnly
                value={profile?.transfer_number || "Not configured in Receptionist Rules"}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2 text-xs text-[var(--ink-primary)] font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[var(--ink-primary)]">Approved Safety Script</label>
              <div className="p-3 rounded-lg border border-rose-500/20 bg-[var(--surface-panel)] text-xs text-[var(--ink-secondary)] leading-relaxed font-sans">
                &ldquo;{profile?.approved_safety_script || "If it is safe to do so, shut off the main utility valve right away and wait in a clear area."}&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    </MotionFadeIn>
  );
}
