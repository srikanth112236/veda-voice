"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  AdminSubscriptionRecord,
  AdminRefundRequestRecord,
  AdminTopupOrderRecord,
} from "@/lib/api";
import {
  CreditCard,
  Sparkles,
  Coins,
  DollarSign,
  ShieldAlert,
  Search,
  Download,
  Check,
  X,
  Clock,
  Layers,
  AlertCircle,
  Receipt,
  UserCheck,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

export default function AdminBillingPage() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>([]);
  const [refundRequests, setRefundRequests] = useState<AdminRefundRequestRecord[]>([]);
  const [topupOrders, setTopupOrders] = useState<AdminTopupOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & sub-tab
  const [billingSubTab, setBillingSubTab] = useState<"all" | "subscriptions" | "refunds" | "topups" | "fees">("all");
  const [billingSearchQuery, setBillingSearchQuery] = useState("");

  // Pagination states
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(10);
  const [refundPage, setRefundPage] = useState(1);
  const [refundPageSize, setRefundPageSize] = useState(10);
  const [topupPage, setTopupPage] = useState(1);
  const [topupPageSize, setTopupPageSize] = useState(10);

  // Manage Subscription Modal
  const [showManageSubModal, setShowManageSubModal] = useState<any | null>(null);
  const [subTierSelect, setSubTierSelect] = useState<string>("starter");
  const [subStatusSelect, setSubStatusSelect] = useState<string>("active");
  const [subCustomMinutes, setSubCustomMinutes] = useState<number | "">("");
  const [subResetUsage, setSubResetUsage] = useState<boolean>(false);
  const [updatingSub, setUpdatingSub] = useState(false);

  // Refund Action Modal
  const [refundActionModal, setRefundActionModal] = useState<{ request: AdminRefundRequestRecord; action: "approve" | "reject" } | null>(null);
  const [refundNotes, setRefundNotes] = useState("");
  const [resolvingRefund, setResolvingRefund] = useState(false);

  // Onboarding Fee Modal
  const [onboardingFeeModal, setOnboardingFeeModal] = useState<{
    tenant_id: string;
    org_name: string;
    current_fee: number;
    paid: boolean;
    waived: boolean;
  } | null>(null);
  const [updatingFee, setUpdatingFee] = useState(false);
  const [feeActionSelect, setFeeActionSelect] = useState<"waive" | "set_paid" | "charge">("waive");
  const [customFeeUsd, setCustomFeeUsd] = useState<number>(299);

  const loadData = async () => {
    setLoading(true);
    try {
      const [subsRes, refundsRes, topupsRes] = await Promise.all([
        api.getAdminSubscriptions().catch(() => []),
        api.getAdminRefunds().catch(() => []),
        api.getAdminTopupOrders().catch(() => []),
      ]);
      setSubscriptions(Array.isArray(subsRes) ? subsRes : []);
      setRefundRequests(Array.isArray(refundsRes) ? refundsRes : []);
      setTopupOrders(Array.isArray(topupsRes) ? topupsRes : []);
    } catch (err) {
      console.error("Failed to load billing records:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenManageSub = (sub: any) => {
    setShowManageSubModal(sub);
    setSubTierSelect(sub.tier);
    setSubStatusSelect(sub.status);
    setSubCustomMinutes(sub.custom_minutes || "");
    setSubResetUsage(false);
  };

  const handleUpdateTenantSubscription = async () => {
    if (!showManageSubModal) return;
    setUpdatingSub(true);
    try {
      await api.updateAdminSubscriptionTier(
        showManageSubModal.tenant_id,
        subTierSelect
      );
      if (subCustomMinutes !== "") {
        await api.updateAdminSubscriptionLimits(
          showManageSubModal.tenant_id,
          Number(subCustomMinutes)
        );
      }
      if (subStatusSelect !== showManageSubModal.status) {
        await api.updateAdminSubscriptionStatus(showManageSubModal.tenant_id, subStatusSelect);
      }
      setShowManageSubModal(null);
      await loadData();
    } catch (err: any) {
      alert(`Failed to update subscription: ${err.message || err}`);
    } finally {
      setUpdatingSub(false);
    }
  };

  const handleResolveRefund = async () => {
    if (!refundActionModal) return;
    setResolvingRefund(true);
    try {
      await api.resolveAdminRefund(refundActionModal.request.id, refundActionModal.action, refundNotes);
      setRefundActionModal(null);
      setRefundNotes("");
      await loadData();
    } catch (err: any) {
      alert(`Failed to resolve refund request: ${err.message || err}`);
    } finally {
      setResolvingRefund(false);
    }
  };

  const handleUpdateOnboardingFee = async () => {
    if (!onboardingFeeModal) return;
    setUpdatingFee(true);
    try {
      await api.updateAdminOnboardingFee(onboardingFeeModal.tenant_id, {
        action: feeActionSelect,
        waived: feeActionSelect === "waive",
        paid: feeActionSelect === "set_paid",
        custom_fee_usd: feeActionSelect === "charge" ? customFeeUsd : undefined,
      });
      setOnboardingFeeModal(null);
      await loadData();
    } catch (err: any) {
      alert(`Failed to update setup fee: ${err.message || err}`);
    } finally {
      setUpdatingFee(false);
    }
  };

  const handleExportSubscriptionsCsv = () => {
    const headers = [
      "Tenant ID", "Organization Name", "Tier", "Status",
      "Included Minutes", "Used Minutes", "Bonus Rollover Mins", "Top-Up Balance Mins",
      "Overage Rate", "Billing Mode", "Onboarding Fee Paid", "Onboarding Fee Waived",
    ];
    const rows = subscriptions.map((s: any) => [
      s.tenant_id, `"${s.tenant_name || ""}"`, s.tier, s.status,
      s.monthly_included_minutes, s.minutes_used_this_cycle, s.bonus_rollover_minutes, s.topup_minutes_balance || 0,
      s.overage_rate_usd, s.billing_resolution_mode, s.onboarding_fee_paid ? "YES" : "NO", s.onboarding_fee_waived ? "YES" : "NO",
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vedavoice_subscriptions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const subList = Array.isArray(subscriptions) ? subscriptions : [];
  const refundList = Array.isArray(refundRequests) ? refundRequests : [];
  const topupList = Array.isArray(topupOrders) ? topupOrders : [];

  const filteredSubscriptions = subList.filter((s: any) => {
    if (!billingSearchQuery) return true;
    const q = billingSearchQuery.toLowerCase();
    return s.tenant_name?.toLowerCase().includes(q) || s.tenant_id?.toLowerCase().includes(q) || s.tier?.toLowerCase().includes(q);
  });

  const filteredRefundRequests = refundList.filter((req: any) => {
    if (!billingSearchQuery) return true;
    const q = billingSearchQuery.toLowerCase();
    return (
      req.tenant_name?.toLowerCase().includes(q) ||
      req.tenant_id?.toLowerCase().includes(q) ||
      req.tier?.toLowerCase().includes(q) ||
      req.status?.toLowerCase().includes(q) ||
      req.reason?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-mono font-bold mb-1">
            <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
            Financial Ledger &amp; Rollover Engine
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Minute Billing, Rollovers &amp; Strict Refund Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor tenant minute allocations, strict refund policy compliance, setup fee waivers, and standalone top-ups.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportSubscriptionsCsv}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Subscriptions CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Active Subs &amp; MRR</span>
            <CreditCard className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">
            {subList.filter((s: any) => s.status === "active").length}
            <span className="text-xs font-normal text-slate-500 font-sans ml-1.5">
              / {subList.length} accounts
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            Est. Monthly Recurring: $
            {subList
              .filter((s: any) => s.status === "active")
              .reduce((acc: number, s: any) => {
                const pricing: Record<string, number> = {
                  lite: 99, starter: 299, growth: 399, pro: 499, scale: 999, enterprise: 1999, agency: 2499,
                };
                return acc + (pricing[s.tier?.toLowerCase()] || 299);
              }, 0)
              .toLocaleString()}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Rollover Guarantee</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700">
            +{subList.reduce((acc: number, s: any) => acc + (s.bonus_rollover_minutes || 0), 0).toFixed(0)}
            <span className="text-xs font-normal text-slate-500 font-sans ml-1">mins</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            100% trial + 10% monthly rollover
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Top-Up Minute Pool</span>
            <Coins className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold font-mono text-blue-700">
            +{subList.reduce((acc: number, s: any) => acc + (s.topup_minutes_balance || 0), 0).toFixed(0)}
            <span className="text-xs font-normal text-slate-500 font-sans ml-1">mins</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {topupList.length} standalone packs completed
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Setup Fees Collected</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">
            ${subList
              .filter((s: any) => s.onboarding_fee_paid)
              .reduce((acc: number, s: any) => acc + (s.onboarding_fee_usd || 0), 0)
              .toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            Waived: {subList.filter((s: any) => s.onboarding_fee_waived).length} accounts
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">Strict Refund Queue</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 flex items-center gap-2">
            <span>{refundList.filter((r: any) => r.status === "pending").length}</span>
            {refundList.filter((r: any) => r.status === "pending").length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-100 text-rose-700 font-bold border border-rose-200 animate-pulse">
                Action Required
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            &lt;50% usage gate strictly enforced
          </div>
        </div>
      </div>

      {/* Sub-nav & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "all", label: "All Views" },
            { id: "subscriptions", label: `Subscriptions (${subscriptions.length})` },
            { id: "refunds", label: `Strict Refund Queue (${refundRequests.length})` },
            { id: "topups", label: `Top-Up Orders (${topupOrders.length})` },
            { id: "fees", label: "Setup Fees" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBillingSubTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                billingSubTab === tab.id
                  ? "bg-purple-600 text-white shadow-2xs font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={billingSearchQuery}
            onChange={(e) => setBillingSearchQuery(e.target.value)}
            placeholder="Search subscriptions or refunds..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-600"
          />
        </div>
      </div>

      {/* Subscriptions Table */}
      {(billingSubTab === "all" || billingSubTab === "subscriptions") && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-600" />
              Platform Master Subscriptions ({subscriptions.length})
            </h3>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase">
                <tr>
                  <th className="p-3">Organization</th>
                  <th className="p-3">Plan Tier</th>
                  <th className="p-3">Included Base</th>
                  <th className="p-3">Cycle Used</th>
                  <th className="p-3">Rollover Bonus</th>
                  <th className="p-3">Top-Up Pool</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredSubscriptions
                  .slice((subPage - 1) * subPageSize, subPage * subPageSize)
                  .map((sub: any) => (
                  <tr key={sub.tenant_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-sans">
                      <div className="font-bold text-slate-900">{sub.tenant_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {sub.tenant_id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                        {sub.tier}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-900">
                      {sub.monthly_included_minutes} mins
                    </td>
                    <td className="p-3 text-slate-700">
                      {(sub.minutes_used_this_cycle ?? 0).toFixed(1)} mins
                    </td>
                    <td className="p-3 text-emerald-700 font-semibold">
                      +{sub.bonus_rollover_minutes} mins
                    </td>
                    <td className="p-3 text-blue-700 font-semibold">
                      +{sub.topup_minutes_balance || 0} mins
                    </td>
                    <td className="p-3 font-sans">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${
                        sub.status === "active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600"
                      }`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => handleOpenManageSub(sub)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-2xs"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredSubscriptions.length > 5 && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <PaginationBar
                  currentPage={subPage}
                  totalItems={filteredSubscriptions.length}
                  pageSize={subPageSize}
                  onPageChange={setSubPage}
                  onPageSizeChange={setSubPageSize}
                  pageSizeOptions={[5, 10, 25]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strict Refund Queue Table */}
      {(billingSubTab === "all" || billingSubTab === "refunds") && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Strict Refund Policy Review Queue ({refundRequests.length})
            </h3>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase">
                <tr>
                  <th className="p-3">Organization</th>
                  <th className="p-3">Usage at Request</th>
                  <th className="p-3">Policy Gate</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRefundRequests
                  .slice((refundPage - 1) * refundPageSize, refundPage * refundPageSize)
                  .map((req: any) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{req.tenant_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{req.tier} • ID: {req.tenant_id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-3 font-mono">
                      <div className="font-semibold text-slate-900">{(req.minutes_used ?? 0).toFixed(1)} / {req.cycle_included_minutes ?? 0}m</div>
                      <div className="text-[10px] text-slate-500">{(req.usage_percentage ?? 0).toFixed(1)}% of base allocation</div>
                    </td>
                    <td className="p-3">
                      {req.eligible_under_50pct_rule ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Eligible (&lt;50%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <X className="w-3 h-3 text-rose-600" />
                          Ineligible (&ge;50%)
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-900">
                      ${(req.amount_usd ?? 0).toFixed(2)}
                    </td>
                    <td className="p-3 max-w-xs text-slate-600 text-[11px] italic truncate">
                      &quot;{req.reason}&quot;
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold capitalize ${
                        req.status === "pending"
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : req.status === "approved"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {req.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRefundActionModal({ request: req, action: "approve" })}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefundActionModal({ request: req, action: "reject" })}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRefundRequests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-mono text-xs">
                      No refund requests submitted.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {filteredRefundRequests.length > 5 && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <PaginationBar
                  currentPage={refundPage}
                  totalItems={filteredRefundRequests.length}
                  pageSize={refundPageSize}
                  onPageChange={setRefundPage}
                  onPageSizeChange={setRefundPageSize}
                  pageSizeOptions={[5, 10, 25]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standalone Top-Up Orders Ledger Table */}
      {(billingSubTab === "all" || billingSubTab === "topups") && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
            <Coins className="w-4 h-4 text-blue-600" />
            Standalone Minute Top-Up Orders Ledger ({topupOrders.length})
          </h3>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Pack Name</th>
                  <th className="p-3">Minutes Added</th>
                  <th className="p-3">Amount USD</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {topupOrders
                  .slice((topupPage - 1) * topupPageSize, topupPage * topupPageSize)
                  .map((ord: any) => (
                  <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-slate-400">ID: {ord.id.slice(0, 10)}...</td>
                    <td className="p-3 font-sans font-bold text-slate-900">{ord.pack_name}</td>
                    <td className="p-3 text-blue-700 font-bold">+{ord.minutes.toLocaleString()} mins</td>
                    <td className="p-3 text-slate-900 font-bold">${(ord.price_usd ?? 0).toFixed(2)}</td>
                    <td className="p-3 font-sans">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {ord.status}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-500">
                      {new Date(ord.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {topupOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                      No standalone top-up pack orders recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {topupOrders.length > 5 && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <PaginationBar
                  currentPage={topupPage}
                  totalItems={topupOrders.length}
                  pageSize={topupPageSize}
                  onPageChange={setTopupPage}
                  onPageSizeChange={setTopupPageSize}
                  pageSizeOptions={[5, 10, 25]}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manage Tenant Subscription Master Modal */}
      {showManageSubModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  Manage Tenant Subscription
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {showManageSubModal.tenant_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageSubModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Subscription Tier</label>
                <select
                  value={subTierSelect}
                  onChange={(e) => setSubTierSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  <option value="trial">Free Trial (100 Mins / 14 Days)</option>
                  <option value="lite">Lite Plan (300 Mins - $99/mo)</option>
                  <option value="starter">Starter Plan (1,000 Mins - $299/mo)</option>
                  <option value="growth">Growth Plan (2,500 Mins - $399/mo)</option>
                  <option value="pro">Pro Plan (5,000 Mins - $499/mo)</option>
                  <option value="scale">Scale Plan (12,000 Mins - $999/mo)</option>
                  <option value="enterprise">Enterprise Plan (30,000 Mins - $1,999/mo)</option>
                  <option value="agency">Agency Partner Plan (50,000 Mins - $2,499/mo)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Account Status</label>
                <select
                  value={subStatusSelect}
                  onChange={(e) => setSubStatusSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  <option value="active">Active (Normal Operational Billing)</option>
                  <option value="suspended">Suspended (Pause Answering &amp; Webhooks)</option>
                  <option value="trialing">Trialing (Active Sandbox Evaluation)</option>
                  <option value="canceled">Canceled (Service Disconnected)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Custom Monthly Minutes Override (Optional)</label>
                <input
                  type="number"
                  placeholder="Leave empty for plan default"
                  value={subCustomMinutes}
                  onChange={(e) => setSubCustomMinutes(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={subResetUsage}
                    onChange={(e) => setSubResetUsage(e.target.checked)}
                    className="rounded text-purple-600"
                  />
                  <span>Reset current month used minutes to 0</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManageSubModal(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updatingSub}
                  onClick={handleUpdateTenantSubscription}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                >
                  {updatingSub ? "Saving Changes..." : "Apply Plan Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin Refund Resolution Modal */}
      {refundActionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-4 h-4 ${refundActionModal.action === "approve" ? "text-emerald-600" : "text-rose-600"}`} />
                <h3 className="font-bold text-sm text-slate-900 uppercase">
                  {refundActionModal.action === "approve" ? "Approve Refund Exception" : "Reject Refund Request"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRefundActionModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Organization:</span>
                  <span className="font-bold text-slate-900">{refundActionModal.request.tenant_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tier &amp; Amount:</span>
                  <span className="font-bold text-slate-900 uppercase">
                    {refundActionModal.request.tier} (${(refundActionModal.request.amount_usd ?? 0).toFixed(2)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Usage at Request:</span>
                  <span className={`font-bold ${refundActionModal.request.eligible_under_50pct_rule ? "text-emerald-700" : "text-rose-700"}`}>
                    {(refundActionModal.request.usage_percentage ?? 0).toFixed(1)}% of base allocation
                  </span>
                </div>
              </div>

              {!refundActionModal.request.eligible_under_50pct_rule && refundActionModal.action === "approve" && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Policy Override Notice:</strong> This tenant consumed &ge; 50% of their base cycle. Approving this refund will bypass standard policy and generate an audited exception record.
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Client Reason</label>
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 italic border border-slate-200 text-[11px]">
                  &quot;{refundActionModal.request.reason}&quot;
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Decision Notes</label>
                <textarea
                  rows={3}
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  placeholder="Mandatory decision notes..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600 text-xs"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRefundActionModal(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={resolvingRefund}
                  onClick={handleResolveRefund}
                  className={`px-4 py-2 rounded-xl text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5 ${
                    refundActionModal.action === "approve"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {resolvingRefund ? "Processing..." : refundActionModal.action === "approve" ? "Confirm Refund Approval" : "Confirm Refund Rejection"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
