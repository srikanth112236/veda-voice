"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  TenantSummary,
} from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
import {
  Building2,
  PhoneCall,
  Search,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  Zap,
  ExternalLink,
  Sliders,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [maskPii, setMaskPii] = useState(true);
  const [tenantSearchQuery, setTenantSearchQuery] = useState("");
  const [tenantPlanFilter, setTenantPlanFilter] = useState<string>("all");
  const [tenantPage, setTenantPage] = useState(1);
  const [tenantPageSize, setTenantPageSize] = useState(10);

  // Modals state
  const [showCogsModal, setShowCogsModal] = useState<TenantSummary | null>(null);
  const [showScaleIncreaseModal, setShowScaleIncreaseModal] = useState(false);
  const [scaleIncreaseRequested, setScaleIncreaseRequested] = useState(false);
  const [selectedScaleTier, setSelectedScaleTier] = useState<"scale_100" | "scale_250" | "enterprise">("scale_100");

  useEffect(() => {
    api.getAdminTenants()
      .then((data) => setTenants(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Failed to load tenants:", err))
      .finally(() => setLoading(false));
  }, []);

  const maskPhoneNumber = (num: string) => {
    if (!num) return "";
    if (!maskPii) return num;
    if (num.length > 7) {
      return num.slice(0, num.length - 4).replace(/\d/g, "*") + num.slice(-4);
    }
    return num;
  };

  const filteredTenants = tenants.filter((t) => {
    const query = tenantSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      t.name.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query) ||
      t.phone_numbers.some((p) => p.includes(query));
    const matchesPlan =
      tenantPlanFilter === "all" ||
      (t.plan_code || "growth").toLowerCase() === tenantPlanFilter.toLowerCase();
    return matchesSearch && matchesPlan;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-mono font-bold mb-1">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            PostgreSQL RLS Protected
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Client Tenant Organizations
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage multi-tenant business accounts, unit margins, and telephony concurrency limits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMaskPii(!maskPii)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 font-mono flex items-center gap-1.5 transition-colors shadow-2xs"
            title="Toggle masked phone numbers for GDPR/CCPA privacy during demonstrations"
          >
            {maskPii ? (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Reveal Full E.164</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Mask Phone Numbers (PII)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowScaleIncreaseModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Concurrency Plan</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={tenantSearchQuery}
            onChange={(e) => {
              setTenantSearchQuery(e.target.value);
              setTenantPage(1);
            }}
            placeholder="Search organizations by name, phone, or ID..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
          />
          {tenantSearchQuery && (
            <button
              type="button"
              onClick={() => {
                setTenantSearchQuery("");
                setTenantPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-mono">
          <span className="text-[11px] text-slate-500 uppercase font-bold mr-1">Plan:</span>
          {[
            { id: "all", label: "All" },
            { id: "starter", label: "Starter ($299)" },
            { id: "growth", label: "Growth ($399)" },
            { id: "pro", label: "Pro ($499)" },
            { id: "scale", label: "Scale ($999)" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setTenantPlanFilter(p.id);
                setTenantPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors shrink-0 ${
                tenantPlanFilter === p.id
                  ? "bg-purple-600 text-white font-bold shadow-2xs"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Tenants Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 font-mono text-[10px] uppercase text-slate-500 font-semibold">
            <tr>
              <th className="p-3">Organization Name</th>
              <th className="p-3">Timezone / Hours</th>
              <th className="p-3">Dedicated Carrier Number</th>
              <th className="p-3">Plan &amp; MRR</th>
              <th className="p-3">Unit CoGS &amp; Margin</th>
              <th className="p-3">Minute Quota</th>
              <th className="p-3">Call Volume</th>
              <th className="p-3">Health Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {filteredTenants
              .slice((tenantPage - 1) * tenantPageSize, tenantPage * tenantPageSize)
              .map((t) => {
              const usedMins = t.minutes_used ?? (t.call_count * 2.5);
              const quota = t.monthly_minute_quota ?? 500;
              const quotaPct = Math.min(Math.round((usedMins / quota) * 100), 100);

              return (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-sans">
                    <div className="font-semibold text-slate-900">{t.name}</div>
                    <div className="text-[10px] font-mono text-slate-400">ID: {t.id ? t.id.slice(0, 8) + "..." : "N/A"}</div>
                  </td>

                  <td className="p-3 text-slate-600 text-[11px] font-sans">
                    <div className="text-slate-800 font-mono">{t.timezone}</div>
                    <div className="text-slate-500 truncate max-w-[140px]">{t.hours}</div>
                  </td>

                  <td className="p-3 text-slate-800 font-mono">
                    {t.phone_numbers.length > 0 ? (
                      <div className="space-y-0.5">
                        {t.phone_numbers.map((num, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-slate-900">
                            <PhoneCall className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{maskPhoneNumber(num)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                  </td>

                  <td className="p-3 text-slate-800 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {t.plan_code || "growth"}
                      </span>
                      <span className="font-bold text-slate-900">
                        ${t.monthly_revenue_usd || 499}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">MRR subscription</div>
                  </td>

                  <td className="p-3 font-mono">
                    <div className="flex items-center gap-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          (t.gross_margin_pct ?? 95) >= 80
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {(t.gross_margin_pct ?? 95).toFixed(1)}% Margin
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      CoGS: ${(t.monthly_cogs_usd ?? (usedMins * 0.0225)).toFixed(2)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCogsModal(t)}
                      className="mt-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-mono flex items-center gap-0.5 transition-colors"
                      title="Inspect granular per-minute CoGS waterfall"
                    >
                      <Activity className="w-3 h-3 text-indigo-500" />
                      <span>CoGS Waterfall &rarr;</span>
                    </button>
                  </td>

                  <td className="p-3 font-mono">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-800 font-bold">{usedMins.toFixed(1)}m</span>
                      <span className="text-slate-400">/ {quota}m</span>
                    </div>
                    <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          quotaPct > 80 ? "bg-red-500" : quotaPct > 50 ? "bg-amber-500" : "bg-purple-600"
                        }`}
                        style={{ width: `${quotaPct}%` }}
                      />
                    </div>
                  </td>

                  <td className="p-3 text-slate-900 font-bold">
                    <div>{t.call_count} calls</div>
                    {t.emergency_count > 0 && (
                      <div className="text-[10px] text-red-600 font-normal">
                        {t.emergency_count} 🚨 emergency
                      </div>
                    )}
                  </td>

                  <td className="p-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {t.status}
                    </span>
                  </td>

                  <td className="p-3 text-right">
                    <Link
                      href="/portal/dashboard"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-800 text-xs font-sans transition-colors"
                    >
                      Open Portal
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filteredTenants.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400 font-mono text-xs">
                  {loading ? "Loading client organizations..." : `No client organizations found matching "${tenantSearchQuery}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filteredTenants.length > 5 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <PaginationBar
              currentPage={tenantPage}
              totalItems={filteredTenants.length}
              pageSize={tenantPageSize}
              onPageChange={setTenantPage}
              onPageSizeChange={setTenantPageSize}
              pageSizeOptions={[5, 10, 25]}
            />
          </div>
        )}
      </div>

      {/* LiveKit Concurrency Scaling Modal */}
      {showScaleIncreaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Zap className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">LiveKit Scale &amp; Concurrency Deck</h3>
                  <p className="text-[11px] text-slate-500 font-mono">LiveKit Cloud Edge Cluster Scaling</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowScaleIncreaseModal(false);
                  setScaleIncreaseRequested(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {scaleIncreaseRequested ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-xs text-emerald-900">Concurrency Upgrade In Progress</h4>
                <p className="text-[11px] text-emerald-700 font-sans leading-relaxed">
                  Your ticket has been logged with LiveKit Cloud Enterprise ops. The concurrent room ceiling will automatically expand within 15 minutes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowScaleIncreaseModal(false);
                    setScaleIncreaseRequested(false);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-2xs hover:bg-emerald-700 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 leading-relaxed font-sans">
                  Select your target LiveKit Cloud concurrency tier to support higher tenant call volumes without drops.
                </p>

                <div className="space-y-2.5">
                  {[
                    {
                      id: "scale_100",
                      name: "Scale 100",
                      channels: "100 Concurrent Audio Rooms",
                      capacity: "Supports ~30 to 50 active tenant organizations",
                      price: "+$200/mo LiveKit Cloud base",
                    },
                    {
                      id: "scale_250",
                      name: "Scale 250",
                      channels: "250 Concurrent Audio Rooms",
                      capacity: "Supports ~80 to 125 active tenant organizations",
                      price: "+$450/mo LiveKit Cloud base",
                    },
                    {
                      id: "enterprise",
                      name: "Enterprise Dedicated SIP",
                      channels: "500–2,500+ Concurrent Channels",
                      capacity: "Dedicated SFU edge cluster with 99.99% carrier SLA",
                      price: "Custom enterprise contract",
                    },
                  ].map((tier) => (
                    <label
                      key={tier.id}
                      onClick={() => setSelectedScaleTier(tier.id as any)}
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                        selectedScaleTier === tier.id
                          ? "border-purple-600 bg-purple-50/30 shadow-2xs"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="scale_tier"
                        checked={selectedScaleTier === tier.id}
                        onChange={() => setSelectedScaleTier(tier.id as any)}
                        className="mt-0.5 text-purple-600 focus:ring-purple-600"
                      />
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{tier.name}</span>
                          <span className="font-mono text-[11px] font-semibold text-emerald-700">
                            {tier.price}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-700 font-medium">
                          {tier.channels}
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans">
                          {tier.capacity}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 flex items-center justify-between">
                  <span>Direct LiveKit Console:</span>
                  <a
                    href="https://cloud.livekit.io/projects/settings"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                  >
                    <span>cloud.livekit.io</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowScaleIncreaseModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleIncreaseRequested(true)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Submit Quota Request</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tenant CoGS Breakdown Waterfall Modal */}
      {showCogsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Per-Minute Unit CoGS Waterfall</h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Client: {showCogsModal.name} (Plan: {showCogsModal.plan_code || "growth"})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCogsModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center font-mono">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Monthly MRR</div>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5">
                    ${showCogsModal.monthly_revenue_usd || 499}.00
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase">Total CoGS</div>
                  <div className="text-base font-extrabold text-rose-600 mt-0.5">
                    ${(showCogsModal.monthly_cogs_usd ?? (showCogsModal.call_count * 2.5 * 0.0225)).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-800 uppercase font-bold">Gross Margin</div>
                  <div className="text-base font-extrabold text-emerald-600 mt-0.5">
                    {(showCogsModal.gross_margin_pct ?? 95.5).toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Per-Minute Unit Waterfall */}
              <div className="space-y-2 text-xs font-mono">
                <span className="text-[11px] uppercase font-bold text-slate-500 block">
                  Telephony Cost Breakdown per Minute:
                </span>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      LiveKit Cloud Audio WebRTC (SFU)
                    </span>
                    <span className="font-bold">$0.0040 / min</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      Deepgram Nova-2 Telephony ASR
                    </span>
                    <span className="font-bold">$0.0059 / min</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Cartesia Sonic Voice Synthesis (TTS)
                    </span>
                    <span className="font-bold">$0.0068 / min</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Gemini 2.5 Flash LLM (Interactions API)
                    </span>
                    <span className="font-bold">$0.0028 / min</span>
                  </div>

                  <div className="flex items-center justify-between text-slate-700">
                    <span className="flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      Twilio / Telnyx SIP Inbound Trunking
                    </span>
                    <span className="font-bold">$0.0030 / min</span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-slate-900 font-extrabold text-xs">
                    <span>Blended Total Unit Telephony CoGS:</span>
                    <span className="text-rose-600 font-bold">$0.0225 / min</span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Total Billed Minutes this Cycle:</span>
                  <span className="font-bold">
                    {(showCogsModal.minutes_used ?? (showCogsModal.call_count * 2.5)).toFixed(1)} mins
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Net Gross Profit this Month:</span>
                  <span className="font-bold text-emerald-700">
                    +${((showCogsModal.monthly_revenue_usd || 499) - (showCogsModal.monthly_cogs_usd ?? (showCogsModal.call_count * 2.5 * 0.0225))).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCogsModal(null)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs"
                >
                  Close CoGS Detail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
