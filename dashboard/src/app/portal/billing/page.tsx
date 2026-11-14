"use client";

import React, { useEffect, useState } from "react";
import { api, SubscriptionCurrent } from "@/lib/api";
import {
  CreditCard,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Gift,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  Tag,
  Check,
  Flame,
  Layers,
} from "lucide-react";

export default function BillingPage() {
  const [sub, setSub] = useState<SubscriptionCurrent | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string>("starter");
  const [couponCode, setCouponCode] = useState("");
  const [validatedCoupon, setValidatedCoupon] = useState<{
    valid: boolean;
    code: string;
    discount_percent: number;
    bonus_minutes: number;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);

  const loadSubscription = () => {
    setLoading(true);
    api
      .getSubscriptionCurrent()
      .then((res) => {
        setSub(res);
        if (res.tier !== "trial") {
          setSelectedTier(res.tier);
        }
      })
      .catch((err) => console.error("Failed to load subscription:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponError("");
    setValidatedCoupon(null);
    try {
      const res = await api.validateCoupon(couponCode.trim());
      setValidatedCoupon(res);
    } catch (err: unknown) {
      setCouponError(err instanceof Error ? err.message : "Invalid or expired coupon code");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    setUpgradeSuccess(null);
    try {
      const res = await api.upgradeSubscription(
        selectedTier,
        validatedCoupon?.code || undefined
      );
      setUpgradeSuccess(res.message);
      loadSubscription();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to activate subscription.");
    } finally {
      setUpgrading(false);
    }
  };

  const handleSimulateCycleRenewal = async () => {
    setRenewing(true);
    try {
      const res = await api.cycleRenewSubscription();
      alert(res.message);
      loadSubscription();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Renewal failed.");
    } finally {
      setRenewing(false);
    }
  };

  if (loading || !sub) {
    return (
      <div className="p-8 text-xs font-mono text-zinc-500 bg-white rounded-2xl border border-zinc-200 text-center">
        Loading minute subscription and rollover telemetry...
      </div>
    );
  }

  const used = sub.is_trial ? sub.trial_minutes_used : sub.used_minutes_this_cycle;
  const total = sub.is_trial ? sub.trial_minutes_allocated : sub.monthly_included_minutes + sub.bonus_rollover_minutes;
  const pct = Math.min(100, Math.round((used / (total || 1)) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-mono font-semibold mb-2">
            <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            LiveKit Minute Allocation Engine
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Minute Subscriptions, Free Trials &amp; Rollover Engine
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Track real-time LiveKit telephony minutes, rollover bonus credits, and upgrade plan tiers.
          </p>
        </div>

        {/* Cycle Renewal Simulation Action */}
        {!sub.is_trial && (
          <button
            type="button"
            onClick={handleSimulateCycleRenewal}
            disabled={renewing}
            className="px-4 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
            title="Simulate 30-day monthly billing reset with 10% complimentary rollover"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${renewing ? "animate-spin text-indigo-600" : ""}`} />
            Simulate 10% Monthly Rollover
          </button>
        )}
      </div>

      {upgradeSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{upgradeSuccess}</span>
        </div>
      )}

      {/* TOP: ACTIVE PLAN & MINUTE USAGE TELEMETRY */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-zinc-900 capitalize">
                {sub.tier === "trial" ? "14-Day Free Trial" : `${sub.tier} Minute Plan`}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                sub.status === "active"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-indigo-100 text-indigo-800 border border-indigo-200"
              }`}>
                {sub.status}
              </span>
            </div>
            <div className="text-xs text-zinc-500">
              {sub.is_trial
                ? `100 complimentary trial minutes included &bull; 100% of unused trial credits roll into your first subscription!`
                : `${sub.monthly_included_minutes.toLocaleString()} included monthly minutes + ${sub.bonus_rollover_minutes.toLocaleString()} rollover bonus minutes.`}
            </div>
          </div>

          <div className="text-right">
            <span className="text-2xl font-extrabold font-mono text-zinc-900">
              {sub.remaining_minutes.toLocaleString()}
            </span>
            <span className="text-xs text-zinc-500 block font-medium">Minutes Remaining</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-600">
              Used: <strong className="text-zinc-900">{used} min</strong>
            </span>
            <span className="text-zinc-600">
              Limit: <strong className="text-zinc-900">{total} min</strong>
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-zinc-100 overflow-hidden p-0.5 border border-zinc-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-600"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span>{pct}% Quota Utilized</span>
            <span>Overage Rate: ${sub.overage_rate_usd.toFixed(2)} / extra minute</span>
          </div>
        </div>

        {/* Rollover Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-900">
              <Gift className="w-3.5 h-3.5 text-indigo-600" />
              100% Free Trial Rollover Guarantee
            </div>
            <p className="text-[11px] text-indigo-700 leading-snug">
              Every unused minute from your 14-day free trial is credited directly into your first paid month.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              10% Monthly Complimentary Rollover
            </div>
            <p className="text-[11px] text-emerald-700 leading-snug">
              Every month, 10% of remaining unused base minutes automatically roll over into your next cycle as bonus credits.
            </p>
          </div>
        </div>
      </div>

      {/* PLAN TIERS SELECTION MATRIX */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900">
            Select Your Business Minute Tier
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Choose your monthly volume tier. All plans include 14+ LiveKit acoustic personas, STIR/SHAKEN Level A carrier lines, and zero minute leakage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: "starter",
              name: "Starter",
              minutes: 1000,
              price: 299,
              overage: 0.20,
              desc: "Ideal for local plumbing, electrical, and single-location trade contractors.",
              features: [
                "1,000 LiveKit voice minutes",
                "1 Dedicated carrier phone number",
                "100% Free trial rollover credit",
                "10% Monthly cycle rollover",
                "$0.20/min overage cap",
              ],
            },
            {
              id: "pro",
              name: "Professional",
              minutes: 1200,
              price: 399,
              overage: 0.20,
              badge: "Most Popular",
              desc: "Engineered for busy dental practices, clinics, and multi-truck HVAC trades.",
              features: [
                "1,200 LiveKit voice minutes",
                "Up to 3 Dedicated phone numbers",
                "Sub-2s Speed-to-lead ad webhooks",
                "Priority hazard emergency routing",
                "10% Monthly cycle rollover",
              ],
            },
            {
              id: "enterprise",
              name: "Enterprise Scale",
              minutes: 1500,
              price: 499,
              overage: 0.20,
              desc: "High-volume 24/7 answering for regional multi-location service franchises.",
              features: [
                "1,500 LiveKit voice minutes",
                "Unlimited phone lines & trunks",
                "Full custom acoustic tone tuning",
                "Multi-seat dispatcher escalation",
                "Dedicated SLA & 10% rollover",
              ],
            },
          ].map((plan) => {
            const isSelected = selectedTier === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedTier(plan.id)}
                className={`p-6 rounded-2xl border text-left cursor-pointer transition-all space-y-4 relative flex flex-col justify-between ${
                  isSelected
                    ? "border-zinc-900 bg-white ring-2 ring-zinc-900 shadow-md"
                    : "border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 right-6 px-3 py-0.5 rounded-full bg-zinc-900 text-white text-[10px] font-bold uppercase tracking-wider">
                    {plan.badge}
                  </span>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-900">{plan.name}</span>
                    <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                      {plan.minutes.toLocaleString()} min
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold font-mono text-zinc-900">${plan.price}</span>
                    <span className="text-xs text-zinc-500 font-medium">/ month</span>
                  </div>

                  <p className="text-xs text-zinc-500 leading-relaxed">{plan.desc}</p>
                </div>

                <div className="space-y-2 pt-4 border-t border-zinc-100">
                  <span className="text-[10px] uppercase font-mono text-zinc-400 font-bold block">
                    Plan Inclusions:
                  </span>
                  <ul className="space-y-1.5 text-xs text-zinc-700">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 stroke-[3]" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  <div
                    className={`w-full py-2 rounded-xl text-center text-xs font-bold transition-all ${
                      isSelected
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200"
                    }`}
                  >
                    {isSelected ? "✓ Selected Tier" : "Select Tier"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COUPON REDEMPTION & CHECKOUT SUMMARY */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
            <Tag className="w-4 h-4 text-indigo-600" />
            Redeem Agency Coupon Code
          </h3>
          <p className="text-xs text-zinc-500">
            Have a promotional code or founder invite? Apply below for instant invoice discounts and complimentary bonus minutes.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
          <input
            type="text"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="e.g. LAUNCH50 or VEDA100"
            className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-zinc-300 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:border-zinc-900 uppercase"
          />
          <button
            type="button"
            disabled={validatingCoupon}
            onClick={handleValidateCoupon}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            {validatingCoupon ? "Validating..." : "Apply Coupon"}
          </button>
        </div>

        {validatedCoupon && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between font-mono max-w-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Coupon <strong>{validatedCoupon.code}</strong> Active!</span>
            </div>
            <span>
              {validatedCoupon.discount_percent > 0 && `${validatedCoupon.discount_percent}% Discount `}
              {validatedCoupon.bonus_minutes > 0 && `+${validatedCoupon.bonus_minutes} Bonus Minutes`}
            </span>
          </div>
        )}

        {couponError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium max-w-lg">
            {couponError}
          </div>
        )}

        {/* Upgrade Action Button */}
        <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-zinc-900">
              Ready to activate {selectedTier.toUpperCase()}?
            </span>
            <div className="text-[11px] text-zinc-500">
              Immediate Stripe card authorization with instant minute crediting.
            </div>
          </div>

          <button
            type="button"
            disabled={upgrading}
            onClick={handleUpgrade}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            <CreditCard className="w-4 h-4" />
            {upgrading ? "Processing Stripe Card..." : `Activate ${selectedTier.toUpperCase()} Subscription`}
          </button>
        </div>
      </div>
    </div>
  );
}
