"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  TenantSummary,
} from "@/lib/api";
import {
  Tag,
  Plus,
  Gift,
  X,
  Search,
  CheckCircle2,
  Sparkles,
  Percent,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Search
  const [couponSearchQuery, setCouponSearchQuery] = useState("");
  const [couponPage, setCouponPage] = useState(1);
  const [couponPageSize, setCouponPageSize] = useState(9);

  // Modals state
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [newCouponData, setNewCouponData] = useState({
    code: "",
    discount_percent: 20,
    bonus_minutes: 100,
    max_redemptions: 50,
  });

  const [showGrantModal, setShowGrantModal] = useState<string | null>(null); // tenant_id
  const [grantingMinutes, setGrantingMinutes] = useState(false);
  const [grantMinutesVal, setGrantMinutesVal] = useState(100);
  const [grantReason, setGrantReason] = useState("Agency VIP Bonus");
  const [grantCreditTo, setGrantCreditTo] = useState<"rollover" | "topup">("rollover");
  const [grantSuccessMsg, setGrantSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [couponsRes, tenantsRes] = await Promise.all([
        api.getAdminCoupons().catch(() => []),
        api.getAdminTenants().catch(() => []),
      ]);
      setCoupons(couponsRes);
      setTenants(tenantsRes);
    } catch (err) {
      console.error("Failed to load coupons data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCoupon(true);
    setCouponError(null);
    try {
      await api.createAdminCoupon(newCouponData);
      setShowCouponModal(false);
      setNewCouponData({ code: "", discount_percent: 20, bonus_minutes: 100, max_redemptions: 50 });
      await loadData();
    } catch (err: any) {
      setCouponError(err.message || "Failed to create coupon");
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleGrantBonusMinutes = async (tenantId: string) => {
    setGrantingMinutes(true);
    try {
      await api.grantAdminMinutes(tenantId, grantMinutesVal, grantReason);
      setShowGrantModal(null);
      setGrantSuccessMsg(`Successfully granted ${grantMinutesVal} ${grantCreditTo} minutes.`);
      setTimeout(() => setGrantSuccessMsg(null), 5000);
      await loadData();
    } catch (err: any) {
      alert(`Grant failed: ${err.message || err}`);
    } finally {
      setGrantingMinutes(false);
    }
  };

  const filteredCoupons = coupons.filter((c: any) => {
    if (!couponSearchQuery) return true;
    return c.code.toLowerCase().includes(couponSearchQuery.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-mono font-bold mb-1">
            <Tag className="w-3.5 h-3.5 text-amber-600" />
            Promo Engine &amp; Growth Incentive System
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Promotional Coupons &amp; VIP Bonus Minutes
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Issue founder discount codes, complimentary minutes for agency VIPs, and credit top-up pools.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGrantModal(tenants[0]?.id || null)}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Gift className="w-3.5 h-3.5 text-purple-600" />
            <span>Grant VIP Bonus</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCouponModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Promo Code</span>
          </button>
        </div>
      </div>

      {grantSuccessMsg && (
        <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{grantSuccessMsg}</span>
        </div>
      )}

      {/* Active Coupons Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
            Active Promo Codes ({coupons.length})
          </h2>
          <span className="text-xs text-slate-400 font-mono">Instant Checkout Validation</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredCoupons
            .slice((couponPage - 1) * couponPageSize, couponPage * couponPageSize)
            .map((c: any) => (
            <div
              key={c.code}
              className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-center justify-between text-xs shadow-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-900 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-sm">
                    {c.code}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold font-mono bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {c.discount_percent}% OFF
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 pt-0.5">
                  +{c.bonus_minutes} complimentary minutes
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Redemptions: <strong className="text-slate-700">{c.times_redeemed}</strong> / {c.max_redemptions}
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                Active
              </span>
            </div>
          ))}
          {filteredCoupons.length === 0 && (
            <div className="col-span-full p-8 text-center text-slate-400 font-mono text-xs bg-white rounded-2xl border border-slate-200">
              {loading ? "Loading coupon codes..." : "No coupon codes created yet."}
            </div>
          )}
        </div>

        {filteredCoupons.length > 9 && (
          <div className="pt-2">
            <PaginationBar
              currentPage={couponPage}
              totalItems={filteredCoupons.length}
              pageSize={couponPageSize}
              onPageChange={setCouponPage}
              onPageSizeChange={setCouponPageSize}
              pageSizeOptions={[9, 18, 27]}
            />
          </div>
        )}
      </div>

      {/* Grant Bonus Minutes Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-purple-600" />
                Grant Compliment Bonus Minutes
              </h3>
              <button
                type="button"
                onClick={() => setShowGrantModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Target Tenant Organization</label>
                <select
                  value={showGrantModal}
                  onChange={(e) => setShowGrantModal(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (ID: {t.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Credit Destination Pool</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGrantCreditTo("rollover")}
                    className={`p-2 rounded-xl border text-center font-medium transition-all ${
                      grantCreditTo === "rollover"
                        ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold text-[11px]">Rollover Bonus</div>
                    <div className="text-[9px] opacity-80">Cycle pool</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGrantCreditTo("topup")}
                    className={`p-2 rounded-xl border text-center font-medium transition-all ${
                      grantCreditTo === "topup"
                        ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold text-[11px]">Top-Up Balance</div>
                    <div className="text-[9px] opacity-80">Permanent validity</div>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Minutes to Grant</label>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  step="10"
                  value={grantMinutesVal}
                  onChange={(e) => setGrantMinutesVal(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Reason / Description</label>
                <input
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  placeholder="VIP Growth Bonus"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGrantModal(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={grantingMinutes}
                  onClick={() => handleGrantBonusMinutes(showGrantModal)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs"
                >
                  {grantingMinutes ? "Granting..." : "Grant Minutes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Platform Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                Create Platform Coupon Code
              </h3>
              <button
                type="button"
                onClick={() => setShowCouponModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
              {couponError && (
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-mono text-[11px]">
                  {couponError}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Coupon Code *</label>
                <input
                  type="text"
                  required
                  value={newCouponData.code}
                  onChange={(e) =>
                    setNewCouponData({ ...newCouponData, code: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono uppercase font-bold focus:outline-none focus:ring-2 focus:ring-purple-600"
                  placeholder="LAUNCH50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newCouponData.discount_percent}
                    onChange={(e) =>
                      setNewCouponData({ ...newCouponData, discount_percent: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Bonus Minutes</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={newCouponData.bonus_minutes}
                    onChange={(e) =>
                      setNewCouponData({ ...newCouponData, bonus_minutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Max Redemptions</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={newCouponData.max_redemptions}
                  onChange={(e) =>
                    setNewCouponData({ ...newCouponData, max_redemptions: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCoupon}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-2xs"
                >
                  {creatingCoupon ? "Creating..." : "Save Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
