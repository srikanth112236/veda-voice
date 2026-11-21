"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  AgencySubAccount,
} from "@/lib/api";
import {
  UserCheck,
  Search,
  X,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Users,
  ShieldAlert,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

export default function AdminSubAccountsPage() {
  const [subAccounts, setSubAccounts] = useState<AgencySubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(10);

  // Impersonation state
  const [impersonateTarget, setImpersonateTarget] = useState<AgencySubAccount | null>(null);
  const [impersonateReason, setImpersonateReason] = useState("Technical investigation and QA configuration audit");
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    api.getAgencySubAccounts()
      .then((data) => setSubAccounts(data as any))
      .catch((err) => console.error("Failed to load sub-accounts:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleStartImpersonation = async () => {
    if (!impersonateTarget) return;
    setImpersonating(true);
    try {
      await api.impersonateSubAccount(impersonateTarget.id, impersonateReason);
      window.location.href = "/portal/dashboard";
    } catch (err: any) {
      alert(`Failed to start impersonation: ${err.message || err}`);
      setImpersonating(false);
    }
  };

  const filteredSubAccounts = subAccounts.filter((sub) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return sub.name.toLowerCase().includes(q) || sub.id.toLowerCase().includes(q) || sub.plan_tier.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-mono font-bold mb-1">
            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
            Agency Wholesale Tier
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Client Sub-Accounts &amp; Proxy Impersonation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage all client sub-accounts, view aggregated call metrics and launch operator proxy sessions with mandatory audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            Total Sub-Accounts: <strong>{subAccounts.length}</strong>
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSubPage(1);
            }}
            placeholder="Search sub-accounts by name, tier, or ID..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSubPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase">
            <tr>
              <th className="p-3">Client Sub-Account</th>
              <th className="p-3">Plan Tier</th>
              <th className="p-3">Minutes Usage</th>
              <th className="p-3">Calls &amp; Emer.</th>
              <th className="p-3">QA / CSAT Rating</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Proxy Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredSubAccounts
              .slice((subPage - 1) * subPageSize, subPage * subPageSize)
              .map((sub) => {
              return (
                <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      {sub.name}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">ID: {sub.id}</div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                      {sub.plan_tier}
                    </span>
                  </td>
                  <td className="p-3 font-mono">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-800 font-bold">{sub.minutes_used}m</span>
                      <span className="text-slate-400">/ {sub.monthly_minute_quota}m</span>
                    </div>
                    <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          sub.usage_pct > 80 ? "bg-rose-500" : sub.usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(sub.usage_pct, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{sub.total_calls} calls</div>
                    {sub.emergency_calls > 0 && (
                      <div className="text-[10px] text-rose-600 font-semibold">{sub.emergency_calls} emergencies</div>
                    )}
                  </td>
                  <td className="p-3 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-800">
                        {sub.qa_avg_score.toFixed(0)}% QA
                      </span>
                      <span className="text-amber-500 font-bold">★ {sub.csat_avg_score.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {sub.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setImpersonateTarget(sub)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-semibold transition-all shadow-2xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Impersonate Client
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredSubAccounts.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 font-mono text-xs">
                  {loading ? "Loading sub-accounts..." : `No sub-accounts found matching "${searchQuery}".`}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filteredSubAccounts.length > 5 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <PaginationBar
              currentPage={subPage}
              totalItems={filteredSubAccounts.length}
              pageSize={subPageSize}
              onPageChange={setSubPage}
              onPageSizeChange={setSubPageSize}
              pageSizeOptions={[5, 10, 25]}
            />
          </div>
        )}
      </div>

      {/* Impersonate Client Proxy Confirmation Modal */}
      {impersonateTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Launch Operator Proxy Session
              </h3>
              <button
                onClick={() => setImpersonateTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                You are about to enter client workspace <strong>{impersonateTarget.name}</strong> as an authenticated operator. All actions will be cryptographically recorded in the immutable audit trail under your operator credentials.
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Audit Reason / Justification</label>
              <textarea
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="Required reason for compliance audit log..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setImpersonateTarget(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={impersonating || !impersonateReason.trim()}
                onClick={handleStartImpersonation}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-2xs"
              >
                {impersonating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    Enter Client Portal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
