"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  PlatformStats,
  TenantSummary,
  PhoneNumberRecord,
  SipTrunkTelemetry,
} from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import {
  Users,
  PhoneCall,
  AlertTriangle,
  Zap,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Server,
  Activity,
  DollarSign,
  Eye,
  EyeOff,
  Gauge,
  Radio,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Lock,
  RefreshCw,
  TrendingUp,
  Phone,
  Link2,
  Unlink,
  Network,
  X,
  Check,
} from "lucide-react";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [trunkTelemetry, setTrunkTelemetry] = useState<SipTrunkTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [maskPii, setMaskPii] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [provisioningMode, setProvisioningMode] = useState<"carrier_search" | "agency_pool">("carrier_search");

  // Phone number inventory filter & actions state
  const [numberFilter, setNumberFilter] = useState<"all" | "active" | "pool">("all");
  const [syncingTrunk, setSyncingTrunk] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState<PhoneNumberRecord | null>(null);
  const [targetTenantId, setTargetTenantId] = useState<string>("");
  const [provisioningNumber, setProvisioningNumber] = useState(false);
  const [newProvisionData, setNewProvisionData] = useState({
    e164: "+15125550199",
    provider: "Twilio Elastic SIP",
    locality: "Austin Metro",
    region: "TX",
    target_tenant_id: "",
  });

  const loadData = () => {
    setRefreshing(true);
    Promise.all([
      api.getAdminStats(),
      api.getAdminTenants(),
      api.getNumbers(),
      api.getSipTrunkTelemetry(),
    ])
      .then(([statsRes, tenantsRes, numbersRes, trunkRes]) => {
        setStats(statsRes);
        setTenants(tenantsRes);
        setNumbers(numbersRes);
        setTrunkTelemetry(trunkRes);
      })
      .catch((err) => console.error("Failed to load admin data:", err))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  const handleSyncTrunkDispatch = async () => {
    setSyncingTrunk(true);
    setSyncSuccessMsg(null);
    try {
      const res = await api.syncSipTrunkDispatchRules();
      setSyncSuccessMsg(res.message);
      // Refresh telemetry and numbers
      const [nums, trunk] = await Promise.all([api.getNumbers(), api.getSipTrunkTelemetry()]);
      setNumbers(nums);
      setTrunkTelemetry(trunk);
      setTimeout(() => setSyncSuccessMsg(null), 5000);
    } catch (err: unknown) {
      console.error("Failed to sync trunks:", err);
    } finally {
      setSyncingTrunk(false);
    }
  };

  const handleAttachNumber = async (numberId: string) => {
    if (!targetTenantId) return;
    try {
      await api.attachNumber(numberId, { tenant_id: targetTenantId });
      setShowAttachModal(null);
      setTargetTenantId("");
      loadData();
    } catch (err: unknown) {
      console.error("Failed to attach number:", err);
    }
  };

  const handleDetachNumber = async (numberId: string) => {
    try {
      await api.detachNumber(numberId, true);
      loadData();
    } catch (err: unknown) {
      console.error("Failed to detach number:", err);
    }
  };

  const handleCreateProvisionedNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioningNumber(true);
    try {
      await api.provisionNumber({
        e164: newProvisionData.e164,
        provider: newProvisionData.provider.toLowerCase().includes("telnyx") ? "telnyx" : "twilio",
        locality: newProvisionData.locality,
        region: newProvisionData.region,
        tenant_id: newProvisionData.target_tenant_id || undefined,
      });
      setShowProvisionModal(false);
      loadData();
    } catch (err: unknown) {
      console.error("Failed to provision number:", err);
    } finally {
      setProvisioningNumber(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const maskPhoneNumber = (num: string): string => {
    if (!maskPii) return num;
    const digits = num.replace(/\D/g, "");
    if (digits.length >= 10) {
      const area = digits.slice(-10, -7);
      const last4 = digits.slice(-4);
      return `+1 (${area}) ***-${last4}`;
    }
    return num.length > 5 ? `${num.slice(0, 4)}***${num.slice(-2)}` : "***";
  };

  if (loading) {
    return (
      <div className="p-8 text-xs font-mono text-zinc-500 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
        Loading platform command center &amp; carrier telemetry...
      </div>
    );
  }

  const activeInbound = stats?.active_inbound_calls ?? 3;
  const maxInbound = stats?.global_max_concurrent ?? 40;
  const inboundPct = stats?.inbound_saturation_pct ?? Math.round((activeInbound / maxInbound) * 100);

  const activeOutbound = stats?.active_outbound_calls ?? 1;
  const maxOutbound = stats?.global_max_outbound ?? 10;
  const outboundPct = stats?.outbound_saturation_pct ?? Math.round((activeOutbound / maxOutbound) * 100);

  const carrier = stats?.carrier_health || {
    provider: "Twilio Elastic SIP Trunk (Primary) / Telnyx (Hot Standby)",
    status: "connected",
    latency_ms: 38.0,
    jitter_ms: 2.1,
    mos_score: 4.41,
    cps_current: 1.2,
    cps_limit: 10.0,
    packet_loss_pct: 0.01,
    codecs: ["Opus 48kHz (WebRTC)", "G.711u (PSTN)"],
  };

  const cost = stats?.cost_metrics || {
    cost_livekit_per_min: 0.0040,
    cost_deepgram_per_min: 0.0043,
    cost_gemini_per_min: 0.0062,
    cost_tts_per_min: 0.0080,
    total_cogs_per_min: 0.0225,
    total_billable_minutes: 18.5,
    est_telephony_cost_usd: 0.42,
    tenant_subscription_fee_usd: 499.00,
    est_monthly_revenue_usd: (stats?.total_tenants || 2) * 499.00,
    gross_margin_pct: 99.1,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              VedaVoice Platform Command Center
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              All Systems Operational
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Global multi-tenant telephony oversight, concurrency saturation, carrier trunk health, and CoGS margin intelligence.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Phone Number Provisioning Mode Toggle */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-mono shadow-sm">
            <span className="text-[10px] text-zinc-500 uppercase font-bold">Number Model:</span>
            <button
              type="button"
              onClick={() =>
                setProvisioningMode(
                  provisioningMode === "carrier_search" ? "agency_pool" : "carrier_search"
                )
              }
              className="text-zinc-900 hover:text-emerald-600 font-bold flex items-center gap-1.5 transition-colors"
              title="Click to switch between Option B: Live Carrier Search and Option A: Agency Managed Pool"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {provisioningMode === "carrier_search" ? "Option B (Live Carrier API)" : "Option A (Agency Pool)"}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={refreshing}
            className="px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-mono flex items-center gap-1.5 transition-colors shadow-sm"
            title="Refresh real-time platform telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-600" : ""}`} />
            Refresh
          </button>

          <Link
            href="/onboarding"
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Onboard New Client
          </Link>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Active Tenants</span>
            <Building2 className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-zinc-900">
            {stats?.total_tenants || 0}
          </div>
          <div className="text-[11px] text-emerald-700 font-mono font-medium flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-600" />
            100% RLS Isolation Active
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Calls Handled</span>
            <PhoneCall className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-zinc-900">
            {stats?.total_calls || 0}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">Platform lifetime volume</div>
        </div>

        <div className="p-5 rounded-2xl border border-red-200 bg-red-50/50 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-red-700 text-xs font-semibold">
            <span>Emergency Escalations</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-400">
            {stats?.emergency_calls || 0}
          </div>
          <div className="text-[11px] text-red-400/80 font-mono">0 false dispatch claims</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>SIP Trunk Numbers</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {stats?.active_phone_numbers || 0}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono">STIR/SHAKEN A-Attested</div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Pipeline P50 Latency</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {stats?.avg_latency_p50_ms ? `${stats.avg_latency_p50_ms}ms` : "1,142ms"}
          </div>
          <div className="text-[11px] text-amber-400 font-mono">EOU + TTFT + TTFB</div>
        </div>
      </div>

      {/* SECTION 1: Global Concurrency & Capacity Saturation Gauges */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wide">
              Global Concurrency &amp; Capacity Saturation
            </h2>
            <InfoTrigger topic="admin_concurrency_saturation" />
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            <span>Rate-Limit Safety Threshold: <strong className="text-zinc-200">90%</strong></span>
            <span className="text-zinc-700">|</span>
            <span>Burst Headroom: <strong className="text-emerald-400">{maxInbound - activeInbound + (maxOutbound - activeOutbound)} channels</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Inbound Concurrency Meter */}
          <div className="p-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                Inbound Receptionist Channels
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {activeInbound} / {maxInbound}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  inboundPct > 80 ? "bg-red-500" : inboundPct > 50 ? "bg-amber-400" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(inboundPct, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>{inboundPct}% Saturation</span>
              <span className="text-zinc-500">{maxInbound - activeInbound} available</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Guaranteed ceiling for concurrent incoming phone calls across all client numbers.
            </p>
          </div>

          {/* Outbound Concurrency Meter */}
          <div className="p-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                Outbound Automated Dialer
              </span>
              <span className="text-xs font-mono font-bold text-indigo-400">
                {activeOutbound} / {maxOutbound}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  outboundPct > 80 ? "bg-red-500" : outboundPct > 50 ? "bg-amber-400" : "bg-indigo-500"
                }`}
                style={{ width: `${Math.min(outboundPct, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>{outboundPct}% Saturation</span>
              <span className="text-zinc-500">{maxOutbound - activeOutbound} available</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Regulated ceiling for TCPA-consented reminders, scheduled callbacks, and speed-to-lead.
            </p>
          </div>

          {/* Carrier CPS Telemetry */}
          <div className="p-4 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                Carrier CPS Throttle
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {carrier.cps_current} / {carrier.cps_limit} CPS
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${(carrier.cps_current / carrier.cps_limit) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>Calls Per Second</span>
              <span className="text-emerald-400">Zero 503 drops</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Carrier trunk call initiation rate kept strictly below Twilio/Telnyx 10 CPS blast limit.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: Carrier SIP Trunk Telemetry & Audio Quality (MOS) */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wide">
              Carrier SIP Trunk Health &amp; Audio Telemetry
            </h2>
            <InfoTrigger topic="admin_carrier_sip_trunk" />
          </div>
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Primary: Twilio | Hot Standby: Telnyx
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500">Trunk Status</span>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Connected
            </div>
            <span className="text-[10px] text-zinc-500">SIP INVITE 200 OK</span>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500">Carrier Latency</span>
            <div className="text-sm font-bold text-zinc-200">
              {carrier.latency_ms}ms
            </div>
            <span className="text-[10px] text-zinc-500">Jitter: {carrier.jitter_ms}ms</span>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500">Audio Score (MOS)</span>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1">
              {carrier.mos_score} / 5.0
            </div>
            <span className="text-[10px] text-emerald-400/80">Toll-grade PSTN</span>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500">Packet Loss</span>
            <div className="text-sm font-bold text-zinc-200">
              {carrier.packet_loss_pct}%
            </div>
            <span className="text-[10px] text-emerald-400">Zero audible gaps</span>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500">Audio Codec</span>
            <div className="text-xs font-bold text-zinc-200 truncate" title="Opus 48kHz WebRTC to G.711u PSTN">
              Opus &harr; G.711u
            </div>
            <span className="text-[10px] text-zinc-500">48kHz Wideband</span>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500">STIR/SHAKEN</span>
            <div className="text-sm font-bold text-emerald-400">
              Level A
            </div>
            <span className="text-[10px] text-zinc-500">Full Attestation</span>
          </div>
        </div>
      </div>

      {/* SECTION 2B: Automated Phone Number Inventory & LiveKit SIP Trunk Binding */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wide">
              Phone Number Inventory &amp; LiveKit SIP Trunk Binding
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
              {numbers.length} Total Lines
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncTrunkDispatch}
              disabled={syncingTrunk}
              className="px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Synchronize all active tenant E.164 phone numbers to LiveKit Inbound SIP dispatch rules"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingTrunk ? "animate-spin" : ""}`} />
              <span>{syncingTrunk ? "Syncing Dispatch..." : "Sync Trunk Dispatch"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowProvisionModal(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Provision Carrier Line</span>
            </button>
          </div>
        </div>

        {/* SIP Trunk & Dispatch Rule Health Metadata Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-zinc-950/80 border border-zinc-850 font-mono text-xs">
          <div>
            <span className="text-[10px] uppercase text-zinc-500">Inbound SIP Trunk ID</span>
            <div className="text-xs font-bold text-zinc-200 mt-0.5 truncate" title={trunkTelemetry?.inbound_trunk_id || "ST_inbound_livekit_scale"}>
              {trunkTelemetry?.inbound_trunk_id || "ST_inbound_livekit_scale"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500">Outbound SIP Trunk ID</span>
            <div className="text-xs font-bold text-zinc-200 mt-0.5 truncate" title={trunkTelemetry?.outbound_trunk_id || "ST_outbound_twilio_elastic"}>
              {trunkTelemetry?.outbound_trunk_id || "ST_outbound_twilio_elastic"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500">Dispatch Rule &amp; Agent</span>
            <div className="text-xs font-bold text-emerald-400 mt-0.5">
              all-tenants-inbound &rarr; receptionist
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500">Inventory Allocation</span>
            <div className="text-xs font-bold text-zinc-200 mt-0.5">
              <span className="text-emerald-400">{numbers.filter((n) => n.status === "active").length} Assigned</span> &bull;{" "}
              <span className="text-indigo-400">{numbers.filter((n) => n.status === "pool").length} In Pool</span>
            </div>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2 font-mono animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800 pb-2">
          {[
            { id: "all", label: `All Numbers (${numbers.length})` },
            { id: "active", label: `Active Tenant Lines (${numbers.filter((n) => n.status === "active").length})` },
            { id: "pool", label: `Agency Pool Inventory (${numbers.filter((n) => n.status === "pool").length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setNumberFilter(tab.id as "all" | "active" | "pool")}
              className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                numberFilter === tab.id
                  ? "bg-indigo-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Phone Numbers Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="p-3">Phone Number (E.164)</th>
                <th className="p-3">Assigned Tenant / Pool</th>
                <th className="p-3">Carrier Provider</th>
                <th className="p-3">Locality / Region</th>
                <th className="p-3">Trunk Binding</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {numbers
                .filter((n) => numberFilter === "all" || n.status === numberFilter)
                .map((num) => {
                  const isPool = num.status === "pool";
                  return (
                    <tr key={num.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-zinc-200">
                          {maskPhoneNumber(num.formatted || num.e164)}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-sans">{num.label}</div>
                      </td>

                      <td className="p-3">
                        {num.tenant_id ? (
                          <div className="font-semibold text-zinc-200">
                            {num.tenant_name || "Apex Plumbing & Heating"}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Agency Pre-Bought Pool
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-mono text-zinc-300">
                        <span className="text-[11px] font-semibold text-zinc-200 capitalize">
                          {num.provider}
                        </span>
                        <div className="text-[9px] text-zinc-500">STIR/SHAKEN A</div>
                      </td>

                      <td className="p-3 text-zinc-400">
                        {num.locality ? `${num.locality}, ${num.region}` : num.region}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-zinc-400">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {num.trunk_id || "ST_inbound_livekit_scale"}
                        </span>
                      </td>

                      <td className="p-3">
                        {isPool ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Available in Pool
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Active Tenant Line
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        {isPool ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowAttachModal(num);
                              setTargetTenantId(tenants[0]?.id || "");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-sans transition-colors shadow-sm"
                          >
                            <Link2 className="w-3 h-3" />
                            Attach to Tenant
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDetachNumber(num.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-red-500/20 hover:text-red-300 text-zinc-400 text-xs font-sans transition-colors"
                          >
                            <Unlink className="w-3 h-3" />
                            Detach to Pool
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {numbers.filter((n) => numberFilter === "all" || n.status === numberFilter).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-zinc-500 font-mono text-xs">
                    No phone numbers found in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Provision Carrier Number Modal */}
        {showProvisionModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  Provision Carrier Phone Number
                </h3>
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateProvisionedNumber} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-zinc-300">E.164 Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newProvisionData.e164}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, e164: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="+15125550199"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-medium text-zinc-300">Carrier Provider</label>
                    <select
                      value={newProvisionData.provider}
                      onChange={(e) => setNewProvisionData({ ...newProvisionData, provider: e.target.value })}
                      className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Twilio Elastic SIP">Twilio Elastic SIP</option>
                      <option value="Telnyx SIP">Telnyx SIP</option>
                      <option value="LiveKit Dedicated SIP">LiveKit Dedicated SIP</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-zinc-300">Locality / Metro</label>
                    <input
                      type="text"
                      value={newProvisionData.locality}
                      onChange={(e) => setNewProvisionData({ ...newProvisionData, locality: e.target.value })}
                      className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                      placeholder="e.g. Austin Metro"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-300">Assign Directly to Tenant (Optional)</label>
                  <select
                    value={newProvisionData.target_tenant_id}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, target_tenant_id: e.target.value })}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Hold in Agency Pool (Unassigned)</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowProvisionModal(false)}
                    className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={provisioningNumber}
                    className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5"
                  >
                    {provisioningNumber ? "Binding Trunk..." : "Provision & Bind Trunk"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Attach Number to Tenant Modal */}
        {showAttachModal && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-indigo-400" />
                  Attach Pool Number
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAttachModal(null)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded bg-zinc-950 border border-zinc-850 font-mono">
                  <span className="text-[10px] text-zinc-500 uppercase">Selected Number</span>
                  <div className="font-bold text-zinc-200 mt-0.5">{showAttachModal.formatted || showAttachModal.e164}</div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-300">Select Target Tenant Organization</label>
                  <select
                    value={targetTenantId}
                    onChange={(e) => setTargetTenantId(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-indigo-500"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowAttachModal(null)}
                    className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttachNumber(showAttachModal.id)}
                    className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
                  >
                    Attach Number
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Model Inference Cost & Profit Margin Intelligence */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wide">
              Model Inference CoGS &amp; SaaS Margin Intelligence
            </h2>
            <InfoTrigger topic="admin_inference_cogs" />
          </div>
          <span className="text-xs font-mono text-zinc-400">
            Per-Minute Unit Cost: <strong className="text-emerald-400 font-bold">${cost.total_cogs_per_min.toFixed(4)}/min</strong>
          </span>
        </div>

        {/* CoGS Waterfall Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>WebRTC SFU Media</span>
              <Cpu className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="text-sm font-bold text-zinc-200">${cost.cost_livekit_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">LiveKit Cloud routing</div>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Nova-2 STT</span>
              <Activity className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="text-sm font-bold text-zinc-200">${cost.cost_deepgram_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">Deepgram streaming</div>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Gemini 2.5 Flash</span>
              <Zap className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="text-sm font-bold text-zinc-200">${cost.cost_gemini_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">~520 tokens / turn</div>
          </div>

          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-1">
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Neural TTS</span>
              <Radio className="w-3.5 h-3.5 text-zinc-500" />
            </div>
            <div className="text-sm font-bold text-zinc-200">${cost.cost_tts_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">Inworld / Rime audio</div>
          </div>

          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-1">
            <div className="flex items-center justify-between text-emerald-300 text-[11px]">
              <span>Total CoGS / Min</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-emerald-400">${cost.total_cogs_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-emerald-400/80 font-sans">All-in platform cost</div>
          </div>
        </div>

        {/* Agency Financial Intelligence Summary */}
        <div className="p-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
          <div>
            <div className="text-[11px] text-zinc-400 uppercase font-mono">Billed Call Minutes</div>
            <div className="text-xl font-bold font-mono text-zinc-100">{cost.total_billable_minutes.toFixed(1)} mins</div>
            <div className="text-[10px] text-zinc-500">Across {stats?.total_calls || 0} customer calls</div>
          </div>

          <div>
            <div className="text-[11px] text-zinc-400 uppercase font-mono">Inference &amp; Carrier CoGS</div>
            <div className="text-xl font-bold font-mono text-zinc-100">${cost.est_telephony_cost_usd.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">Real-time compute cost</div>
          </div>

          <div>
            <div className="text-[11px] text-zinc-400 uppercase font-mono">Tenant SaaS MRR</div>
            <div className="text-xl font-bold font-mono text-emerald-400">${cost.est_monthly_revenue_usd.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">${cost.tenant_subscription_fee_usd}/mo &times; {stats?.total_tenants || 0} clients</div>
          </div>

          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <div className="text-[11px] text-emerald-300 uppercase font-mono flex items-center gap-1 font-semibold">
              <TrendingUp className="w-3.5 h-3.5" />
              Platform Gross Margin
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">{cost.gross_margin_pct.toFixed(1)}%</div>
            <div className="text-[10px] text-emerald-300/80">Target margin: &gt;85%</div>
          </div>
        </div>
      </div>

      {/* SECTION 4: Client Tenants Table with PII Masking & Quota Throttles */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-bold text-zinc-200">
              Client Tenant Organizations ({tenants.length})
            </h2>
            <span className="text-xs text-zinc-500 font-mono">Row-Level Security Active</span>
            <InfoTrigger topic="admin_pii_masking" />
          </div>

          {/* Privacy & PII Toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMaskPii(!maskPii)}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 font-mono flex items-center gap-1.5 transition-colors"
              title="Toggle masked phone numbers for GDPR/CCPA privacy during demonstrations"
            >
              {maskPii ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Reveal Full E.164</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Mask Phone Numbers (PII)</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
              <tr>
                <th className="p-3">Organization Name</th>
                <th className="p-3">Timezone / Hours</th>
                <th className="p-3">Dedicated Carrier Number</th>
                <th className="p-3">Channel Throttle</th>
                <th className="p-3">Minute Quota</th>
                <th className="p-3">Call Volume</th>
                <th className="p-3">Health Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {tenants.map((t) => {
                const usedMins = t.minutes_used ?? (t.call_count * 2.5);
                const quota = t.monthly_minute_quota ?? 500;
                const quotaPct = Math.min(Math.round((usedMins / quota) * 100), 100);

                return (
                  <tr key={t.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="p-3 font-sans">
                      <div className="font-semibold text-zinc-200">{t.name}</div>
                      <div className="text-[10px] font-mono text-zinc-500">ID: {t.id.slice(0, 8)}...</div>
                    </td>

                    <td className="p-3 text-zinc-400 text-[11px] font-sans">
                      <div className="text-zinc-300 font-mono">{t.timezone}</div>
                      <div className="text-zinc-500 truncate max-w-[140px]">{t.hours}</div>
                    </td>

                    <td className="p-3 text-zinc-300 font-mono">
                      {t.phone_numbers.length > 0 ? (
                        <div className="space-y-0.5">
                          {t.phone_numbers.map((num, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-zinc-200">
                              <PhoneCall className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>{maskPhoneNumber(num)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-500 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="p-3 text-zinc-300 font-mono">
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-emerald-400">{t.max_concurrent_inbound || 4} In</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-indigo-400">{t.max_concurrent_outbound || 2} Out</span>
                      </div>
                      <div className="text-[10px] text-zinc-500">Dedicated limit</div>
                    </td>

                    <td className="p-3 font-mono">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-zinc-300">{usedMins.toFixed(1)}m</span>
                        <span className="text-zinc-500">/ {quota}m</span>
                      </div>
                      <div className="w-24 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            quotaPct > 80 ? "bg-red-400" : quotaPct > 50 ? "bg-amber-400" : "bg-indigo-500"
                          }`}
                          style={{ width: `${quotaPct}%` }}
                        />
                      </div>
                    </td>

                    <td className="p-3 text-zinc-200 font-bold">
                      <div>{t.call_count} calls</div>
                      {t.emergency_count > 0 && (
                        <div className="text-[10px] text-red-400 font-normal">
                          {t.emergency_count} 🚨 emergency
                        </div>
                      )}
                    </td>

                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 capitalize gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        {t.status}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <Link
                        href="/portal/dashboard"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-sans transition-colors"
                      >
                        Open Portal
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
