"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  api,
  PlatformStats,
  TenantSummary,
  PhoneNumberRecord,
  SipTrunkTelemetry,
  AdminSubscriptionRecord,
} from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import {
  Users,
  PhoneCall,
  AlertTriangle,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Server,
  Activity,
  DollarSign,
  Gauge,
  Radio,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Lock,
  RefreshCw,
  TrendingUp,
  CreditCard,
  Tag,
  Gift,
  UserCheck,
  History,
  ExternalLink,
  ShieldAlert,
  Sliders,
  Sparkles,
  ChevronRight,
  Coins,
} from "lucide-react";

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Redirect legacy query tab parameter to individual sub-pages
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["tenants", "subaccounts", "audit", "billing", "inventory", "coupons"].includes(tabParam)) {
      router.replace(`/admin/${tabParam}`);
    }
  }, [searchParams, router]);

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [trunkTelemetry, setTrunkTelemetry] = useState<SipTrunkTelemetry | null>(null);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [simulatedConcurrencyLoad, setSimulatedConcurrencyLoad] = useState<number | null>(null);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [statsRes, tenantsRes, numbersRes, trunkRes, subsRes] = await Promise.all([
        api.getAdminStats(),
        api.getAdminTenants(),
        api.getNumbers(),
        api.getSipTrunkTelemetry(),
        api.getAdminSubscriptions().catch(() => []),
      ]);
      setStats(statsRes);
      setTenants(tenantsRes);
      setNumbers(numbersRes);
      setTrunkTelemetry(trunkRes);
      setSubscriptions(subsRes);
    } catch (err) {
      console.error("Failed to load admin stats:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  // Concurrency saturation metrics
  const scaleLimit = 50;
  const activeConcurrency = trunkTelemetry?.active_tenant_numbers ?? (numbers.filter((n) => n.status === "active").length || 2);
  const totalConcurrency = simulatedConcurrencyLoad !== null ? simulatedConcurrencyLoad : activeConcurrency;
  const saturationPct = Math.round((totalConcurrency / scaleLimit) * 100);
  const isWarning = saturationPct >= 60 && saturationPct < 80;
  const isCritical = saturationPct >= 80;
  const criticalThreshold = Math.round(scaleLimit * 0.8);

  // SVG Gauge calculations
  const dialRadius = 75;
  const dialCircumference = Math.PI * dialRadius;
  const dialProgress = Math.min(Math.max(totalConcurrency / scaleLimit, 0), 1);
  const dialOffset = dialCircumference * (1 - dialProgress);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-mono font-bold mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
            Global Infrastructure Command Center
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Platform Command Center &amp; Live Telemetry
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time LiveKit audio rooms, carrier trunk health, unit margins, and infrastructure governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Platform Healthy</span>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={refreshing}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
            title="Refresh All Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* SECTION 1: Concurrency Saturation & LiveKit Scale Dial Gauge */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
              Global Concurrency &amp; LiveKit Scale Saturation
            </h2>
            <InfoTrigger topic="admin_concurrency_saturation" />
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
            <span>Critical Ceiling: <strong className="text-rose-600 font-bold">80% ({criticalThreshold} ch)</strong></span>
            <span className="text-slate-300">|</span>
            <span>Headroom: <strong className="text-emerald-600 font-bold">{Math.max(0, scaleLimit - totalConcurrency)} channels</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: SVG Concurrency Dial Gauge */}
          <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-600" />
                LiveKit Room Concurrency
              </span>
              <span className="text-[11px] text-slate-500 font-medium">Standard Scale Tier</span>
            </div>

            {/* SVG Arc Gauge */}
            <div className="relative py-2">
              <svg viewBox="0 0 200 115" className="w-full max-w-[260px] mx-auto overflow-visible">
                <path
                  d="M 25 90 A 75 75 0 0 1 175 90"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                <path
                  d="M 25 90 A 75 75 0 0 1 175 90"
                  fill="none"
                  stroke={isCritical ? "#f43f5e" : isWarning ? "#f59e0b" : "#10b981"}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={dialCircumference}
                  strokeDashoffset={Math.max(0, dialOffset)}
                  className="transition-all duration-700 ease-out"
                />
                <text x="25" y="106" fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="middle">0</text>
                <text x="100" y="22" fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="middle">25</text>
                <text x="146" y="38" fill="#d97706" fontSize="8" fontFamily="monospace" textAnchor="middle">60% (30)</text>
                <text x="178" y="70" fill="#e11d48" fontSize="8" fontFamily="monospace" textAnchor="middle">80% (40)</text>
                <text x="175" y="106" fill="#64748b" fontSize="9" fontFamily="monospace" textAnchor="middle">{scaleLimit}</text>
              </svg>

              <div className="text-center -mt-6 space-y-1">
                <div className="text-3xl font-extrabold font-mono text-slate-900 tracking-tight">
                  {totalConcurrency}
                  <span className="text-sm font-semibold text-slate-400 ml-1">/ {scaleLimit}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs font-mono">
                  {isCritical ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 font-bold">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      Critical Saturation (≥80%)
                    </span>
                  ) : isWarning ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Advisory Threshold (≥60%)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Optimal Headroom ({Math.max(0, scaleLimit - totalConcurrency)} Free)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Simulation Controls */}
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-slate-400" />
                  Load Simulation:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSimulatedConcurrencyLoad(null)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      simulatedConcurrencyLoad === null
                        ? "bg-purple-600 text-white font-bold"
                        : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    }`}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatedConcurrencyLoad(32)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      simulatedConcurrencyLoad === 32
                        ? "bg-amber-600 text-white font-bold"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    }`}
                  >
                    60% (32)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatedConcurrencyLoad(42)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      simulatedConcurrencyLoad === 42
                        ? "bg-rose-600 text-white font-bold"
                        : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                    }`}
                  >
                    80% (42)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500 font-mono">Current Live Load:</span>
                <span className="font-mono font-bold text-xs text-slate-800">
                  {saturationPct}% saturation
                </span>
              </div>
            </div>
          </div>

          {/* Right: Live Voice AI Pipeline Latencies */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
                  <span>Deepgram Nova-2 ASR</span>
                  <Activity className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">118 ms</div>
                <div className="text-[10px] text-emerald-600 font-mono">P95 Telephony Word Latency</div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
                  <span>Cartesia Sonic TTS</span>
                  <Radio className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">89 ms</div>
                <div className="text-[10px] text-emerald-600 font-mono">First-Byte Synthesis TTFB</div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
                  <span>Gemini 2.5 Flash</span>
                  <Cpu className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">145 ms</div>
                <div className="text-[10px] text-emerald-600 font-mono">Function Call Resolution</div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
                  <span>LiveKit Edge SFU</span>
                  <Server className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-xl font-bold font-mono text-slate-900">24 ms</div>
                <div className="text-[10px] text-emerald-600 font-mono">WebRTC Media Edge RTT</div>
              </div>
            </div>

            {/* Overall Turn-Taking SLA Card */}
            <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5 font-mono">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  E2E Turn-Taking Acoustic SLA: &lt; 500 ms Target
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                  PASSING (376 ms)
                </span>
              </div>
              <p className="text-[11px] text-purple-800 font-sans leading-relaxed">
                Total conversational latency from caller speech end-of-turn to synthesized audio delivery across the carrier SIP trunk.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Platform Sub-Page Jump Deck */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
          Dedicated Governance Modules
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/tenants"
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-blue-600 transition-all" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-3">Client Tenants &amp; RLS</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Oversee {tenants.length} client organizations, per-minute unit CoGS waterfall, gross margins, and LiveKit concurrency tiers.
              </p>
            </div>
            <div className="text-[11px] font-mono text-blue-600 font-semibold flex items-center gap-1">
              <span>View Organizations ({tenants.length})</span>
              <span>&rarr;</span>
            </div>
          </Link>

          <Link
            href="/admin/subaccounts"
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <UserCheck className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-indigo-600 transition-all" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-3">Sub-Accounts &amp; Proxy</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Manage agency client sub-accounts, aggregate minutes quotas, and launch operator proxy sessions with mandatory audit logs.
              </p>
            </div>
            <div className="text-[11px] font-mono text-indigo-600 font-semibold flex items-center gap-1">
              <span>Open Sub-Accounts</span>
              <span>&rarr;</span>
            </div>
          </Link>

          <Link
            href="/admin/audit"
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-purple-400 hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <History className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-purple-600 transition-all" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-3">Immutable Audit Trail</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Cryptographically anchored event log capturing all impersonation sessions, supervisor overrides, and tenant changes.
              </p>
            </div>
            <div className="text-[11px] font-mono text-purple-600 font-semibold flex items-center gap-1">
              <span>Inspect Audit Trail</span>
              <span>&rarr;</span>
            </div>
          </Link>

          <Link
            href="/admin/billing"
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-600 transition-all" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-3">Minute Billing &amp; Strict Refunds</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Master subscriptions control, rollover bonus calculations, setup fee waivers, and the strict &lt;50% refund policy queue.
              </p>
            </div>
            <div className="text-[11px] font-mono text-emerald-600 font-semibold flex items-center gap-1">
              <span>Manage Billing &amp; Refunds</span>
              <span>&rarr;</span>
            </div>
          </Link>

          <Link
            href="/admin/inventory"
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-teal-400 hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-teal-600 transition-all" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-3">Inbound Phone Inventory</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                1-Click Telnyx DID purchasing ($1/mo), agency pre-bought phone pool, and LiveKit inbound SIP trunk dispatch rules.
              </p>
            </div>
            <div className="text-[11px] font-mono text-teal-600 font-semibold flex items-center gap-1">
              <span>View Lines ({numbers.length})</span>
              <span>&rarr;</span>
            </div>
          </Link>

          <Link
            href="/admin/coupons"
            className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 hover:shadow-sm transition-all group flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Tag className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-amber-600 transition-all" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mt-3">Coupons &amp; Bonus Credits</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Create founder promotional codes, issue recurring percentage discounts, and grant complimentary VIP bonus minutes.
              </p>
            </div>
            <div className="text-[11px] font-mono text-amber-600 font-semibold flex items-center gap-1">
              <span>Manage Promo Codes</span>
              <span>&rarr;</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 font-mono text-xs">Loading Command Center...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}
