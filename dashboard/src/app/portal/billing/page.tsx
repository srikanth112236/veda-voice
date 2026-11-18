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
  X,
  Lock,
  ExternalLink,
  Receipt,
  Download,
} from "lucide-react";

export default function BillingPage() {
  const [sub, setSub] = useState<SubscriptionCurrent | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
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
  const [downgradeWarning, setDowngradeWarning] = useState<string | null>(null);
  const [billingMode, setBillingMode] = useState<"minute" | "second">("minute");
  const [togglingMode, setTogglingMode] = useState(false);

  // Stripe Checkout Test Mode state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [testCardType, setTestCardType] = useState<"success" | "decline">("success");
  const [authStep, setAuthStep] = useState<string>("");
  const [cardData, setCardData] = useState({
    number: "4242 •••• •••• 4242",
    expiry: "12/28",
    cvc: "888",
    zip: "78701",
    name: "Apex Plumbing & Heating",
  });
  const [openingPortal, setOpeningPortal] = useState(false);

  const selectTestCardPreset = (type: "success" | "decline") => {
    setTestCardType(type);
    if (type === "success") {
      setCardData({
        number: "4242 •••• •••• 4242",
        expiry: "12/28",
        cvc: "888",
        zip: "78701",
        name: "Apex Plumbing & Heating",
      });
    } else {
      setCardData({
        number: "4000 •••• •••• 0002",
        expiry: "12/28",
        cvc: "002",
        zip: "90210",
        name: "Apex Plumbing & Heating",
      });
    }
  };

  const loadSubscription = () => {
    setLoading(true);
    Promise.all([
      api.getSubscriptionCurrent(),
      api.getTenantInvoices().catch(() => []),
    ])
      .then(([subRes, invRes]) => {
        setSub(subRes);
        setInvoices(invRes);
        if (subRes.tier !== "trial") {
          setSelectedTier(subRes.tier);
        }
        if (subRes.billing_increment) {
          setBillingMode(subRes.billing_increment);
        }
      })
      .catch((err) => console.error("Failed to load subscription:", err))
      .finally(() => setLoading(false));
  };

  const handleSelectTier = async (tier: string) => {
    setSelectedTier(tier);
    setDowngradeWarning(null);
    if (sub && sub.tier !== "trial" && tier !== sub.tier) {
      try {
        const check = await api.checkSubscriptionDowngrade(tier);
        if (!check.allowed && check.excess_resources && check.excess_resources.length > 0) {
          const msgs = check.excess_resources.map((e) => e.message).join(" ");
          setDowngradeWarning(msgs);
        }
      } catch (err) {
        console.error("Downgrade check failed", err);
      }
    }
  };

  const handleToggleBillingMode = async (mode: "minute" | "second") => {
    try {
      setTogglingMode(true);
      await api.updateBillingMode(mode);
      setBillingMode(mode);
      loadSubscription();
    } catch (err: any) {
      alert(err.message || "Failed to update billing precision mode");
    } finally {
      setTogglingMode(false);
    }
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
    if (testCardType === "decline") {
      setAuthStep("Decline simulated by Stripe Test Mode: Your card has insufficient funds.");
      return;
    }

    setUpgrading(true);
    setUpgradeSuccess(null);
    setAuthStep("Contacting Stripe Test Gateway...");

    setTimeout(async () => {
      setAuthStep("Simulating 3D Secure authorization...");
      try {
        const res = await api.upgradeSubscription(
          selectedTier,
          validatedCoupon?.code || undefined
        );
        setAuthStep("Payment Intent Authorized!");
        setTimeout(() => {
          setUpgradeSuccess(res.message);
          setShowCheckoutModal(false);
          setAuthStep("");
          setUpgrading(false);
          loadSubscription();
        }, 700);
      } catch (err: unknown) {
        setAuthStep("");
        setUpgrading(false);
        alert(err instanceof Error ? err.message : "Failed to activate subscription.");
      }
    }, 800);
  };

  const handleOpenCustomerPortal = async () => {
    setOpeningPortal(true);
    try {
      const res = await api.getStripeCustomerPortalUrl();
      alert(`Stripe Customer Portal Session Created:\n${res.url}\n(In production, redirects to Stripe Hosted Portal)`);
    } catch (err: unknown) {
      alert("Failed to load customer portal");
    } finally {
      setOpeningPortal(false);
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

  const planPrices: Record<string, number> = {
    lite: 99,
    starter: 299,
    growth: 399,
    pro: 499,
    scale: 999,
    enterprise: 1999,
    agency: 1000,
  };
  const planMinutes: Record<string, number> = {
    lite: 300,
    starter: 1000,
    growth: 1500,
    pro: 2000,
    scale: 4000,
    enterprise: 10000,
    agency: 5000,
  };
  const basePrice = planPrices[selectedTier] || 299;
  const discountAmt = validatedCoupon ? Math.round(basePrice * (validatedCoupon.discount_percent / 100)) : 0;
  const finalPrice = Math.max(0, basePrice - discountAmt);

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

        {/* Automated Renewal & Customer Portal Action */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-[11px] text-zinc-700 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Auto-Renews: {new Date(sub.cycle_end_date).toLocaleDateString()}</span>
          </div>

          {!sub.is_trial && (
            <button
              type="button"
              onClick={handleOpenCustomerPortal}
              disabled={openingPortal}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Stripe Customer Portal
            </button>
          )}
        </div>
      </div>

      {upgradeSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{upgradeSuccess}</span>
        </div>
      )}

      {sub.pending_tier && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Scheduled Tier Upgrade:</strong> Your plan will automatically transition to{" "}
              <strong className="uppercase font-mono">{sub.pending_tier}</strong> on your next cycle renewal date (
              {new Date(sub.cycle_end_date).toLocaleDateString()}). Auto-renews monthly via Stripe.
            </span>
          </div>
          <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold uppercase">
            Queued For Renewal
          </span>
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
                ? `100 complimentary trial minutes included • 100% of unused trial credits roll into your first subscription!`
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

        {/* Telephony Billing Mode & Branch Allocation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-100">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-600 font-medium">Billing Resolution Mode:</span>
            <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50">
              <button
                type="button"
                onClick={() => handleToggleBillingMode("minute")}
                disabled={togglingMode}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  billingMode === "minute"
                    ? "bg-white text-zinc-900 shadow-xs border border-zinc-200"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                60s Telephony Rounding
              </button>
              <button
                type="button"
                onClick={() => handleToggleBillingMode("second")}
                disabled={togglingMode}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  billingMode === "second"
                    ? "bg-white text-indigo-700 shadow-xs border border-zinc-200"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                Per-Second Precision
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Branch Plan Tier:</span>
            <span className="font-semibold text-zinc-900">
              {sub.tier === "scale" ? "Up to 25 Branches" : sub.tier === "enterprise" || sub.tier === "agency" ? "Unlimited Branches" : "Single Branch Location"}
            </span>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              id: "starter",
              name: "Starter",
              minutes: 1000,
              price: 299,
              overage: 0.35,
              branches: "Single Branch Location",
              desc: "Ideal for local plumbing, electrical, and single-location trade contractors.",
              features: [
                "1,000 LiveKit voice minutes",
                "1 Dedicated carrier phone number",
                "1 Branch location included",
                "100% Free trial rollover credit",
                "10% Monthly cycle rollover",
                "$0.35/min overage cap",
              ],
            },
            {
              id: "pro",
              name: "Professional",
              minutes: 2000,
              price: 499,
              overage: 0.35,
              badge: "Most Popular",
              branches: "Single Branch (Multi-Staff)",
              desc: "Engineered for busy dental practices, clinics, and multi-truck HVAC trades.",
              features: [
                "2,000 LiveKit voice minutes",
                "Up to 5 Dedicated phone numbers",
                "Multi-staff round-robin calendar",
                "Warm & cold transfer routing",
                "10% Monthly cycle rollover",
                "$0.35/min overage cap",
              ],
            },
            {
              id: "scale",
              name: "Scale (Multi-Branch)",
              minutes: 4000,
              price: 999,
              overage: 0.30,
              branches: "Up to 25 Branches",
              desc: "Designed for expanding multi-location service franchises and regional dealerships.",
              features: [
                "4,000 LiveKit voice minutes",
                "Up to 20 Carrier phone numbers",
                "Up to 25 Branch Locations",
                "Location postal code territory routing",
                "Per-location analytics & QA breakdown",
                "$0.30/min overage cap",
              ],
            },
            {
              id: "enterprise",
              name: "Enterprise Scale",
              minutes: 10000,
              price: 1999,
              overage: 0.20,
              branches: "Unlimited Branches",
              desc: "High-volume 24/7 answering with unlimited branch locations and custom SLA.",
              features: [
                "10,000 LiveKit voice minutes",
                "Unlimited phone lines & trunks",
                "Unlimited Branch Locations",
                "Dedicated 99.99% telephony SLA",
                "White-label branding & SSO",
                "$0.20/min overage cap",
              ],
            },
          ].map((plan) => {
            const isSelected = selectedTier === plan.id;
            return (
              <div
                key={plan.id}
                onClick={() => handleSelectTier(plan.id)}
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

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 text-[11px] font-mono text-zinc-700">
                    <Layers className="w-3 h-3 text-indigo-600" />
                    <span>{plan.branches}</span>
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

        {/* Downgrade Limit Warning */}
        {downgradeWarning && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5 font-medium max-w-2xl">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block font-bold text-amber-900">Downgrade Resource Limit Guard:</strong>
              <p className="text-[11px] leading-relaxed text-amber-800">{downgradeWarning}</p>
              <p className="text-[10px] text-amber-700 italic">
                Please deactivate excess phone numbers or branch locations before transitioning to this plan.
              </p>
            </div>
          </div>
        )}

        {/* Upgrade Action Button */}
        <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-zinc-900">
              {sub.is_trial
                ? `Activate ${selectedTier.toUpperCase()} Plan`
                : selectedTier === sub.tier
                ? `Currently on ${selectedTier.toUpperCase()} Plan`
                : `Transition to ${selectedTier.toUpperCase()} Plan`}
            </span>
            <div className="text-[11px] text-zinc-500">
              {sub.is_trial ? (
                `$${finalPrice}/mo ${discountAmt > 0 ? `(Saved $${discountAmt} with coupon)` : ""} • 100% of unused trial credits will roll into your first month!`
              ) : selectedTier === sub.tier ? (
                `Plan is active and auto-renews on ${new Date(sub.cycle_end_date).toLocaleDateString()} via Stripe ($${finalPrice}/mo).`
              ) : (
                `1 Plan per 30-day Cycle enforced. Schedule for ${new Date(sub.cycle_end_date).toLocaleDateString()} renewal or contact admin for immediate mid-cycle expansion.`
              )}
            </div>
          </div>

          {sub.is_trial ? (
            <button
              type="button"
              disabled={Boolean(downgradeWarning)}
              onClick={() => setShowCheckoutModal(true)}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCard className="w-4 h-4" />
              Proceed to Stripe Checkout (${finalPrice}/mo)
            </button>
          ) : selectedTier === sub.tier ? (
            <div className="px-5 py-2.5 rounded-xl bg-zinc-100 text-zinc-600 text-xs font-semibold flex items-center gap-2 border border-zinc-200">
              <Check className="w-4 h-4 text-emerald-600" />
              Active Plan (Auto-Renews)
            </div>
          ) : sub.pending_tier === selectedTier ? (
            <div className="px-5 py-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs font-semibold flex items-center gap-2 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600" />
              Upgrade Queued for Next Cycle
            </div>
          ) : (
            <button
              type="button"
              disabled={Boolean(downgradeWarning)}
              onClick={() => setShowCheckoutModal(true)}
              className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock className="w-4 h-4 text-amber-400" />
              Schedule Plan Change (${finalPrice}/mo)
            </button>
          )}
        </div>
      </div>

      {/* INVOICES & PAYMENT HISTORY */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-zinc-700" />
            <h3 className="text-sm font-bold text-zinc-900">
              Invoice History &amp; Payment Receipts
            </h3>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {invoices.length} Paid Statements
          </span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500 font-mono">
            No paid invoices generated yet. Your account is currently on trial or pending first renewal.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 font-mono text-[10px] uppercase text-zinc-500 font-semibold">
                <tr>
                  <th className="p-3">Invoice Number</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Payment Method</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono">
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="p-3 font-bold text-zinc-900">{inv.number}</td>
                    <td className="p-3 text-zinc-600">{inv.date}</td>
                    <td className="p-3 font-sans text-zinc-800">{inv.description}</td>
                    <td className="p-3 font-bold text-zinc-900">${inv.amount_usd.toFixed(2)}</td>
                    <td className="p-3 text-zinc-600">{inv.payment_method}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => alert(`Stripe Receipt for ${inv.number}\nPaid: $${inv.amount_usd.toFixed(2)}\nStatus: Settled via Stripe Payment Intent`)}
                        className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900 font-sans font-medium text-xs underline"
                      >
                        <Download className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* STRIPE CHECKOUT TEST MODE MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-5 shadow-2xl">
            {/* Stripe Test Mode Banner Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#635BFF] flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  S
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-zinc-900">Stripe Checkout</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      TEST MODE
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">LiveKit Minute Subscription Gateway</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCheckoutModal(false);
                  setAuthStep("");
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Test Card Quick Selectors */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-700 block">Stripe Test Card Presets:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectTestCardPreset("success")}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                    testCardType === "success"
                      ? "border-emerald-500 bg-emerald-50/60 text-emerald-950 font-semibold"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <div>
                    <div className="font-mono text-[11px]">4242 •••• 4242</div>
                    <div className="text-[10px] text-emerald-700">Instant Success</div>
                  </div>
                  {testCardType === "success" && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </button>

                <button
                  type="button"
                  onClick={() => selectTestCardPreset("decline")}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                    testCardType === "decline"
                      ? "border-red-500 bg-red-50/60 text-red-950 font-semibold"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <div>
                    <div className="font-mono text-[11px]">4000 •••• 0002</div>
                    <div className="text-[10px] text-red-600">Simulate Decline</div>
                  </div>
                  {testCardType === "decline" && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                </button>
              </div>
            </div>

            {/* Order Summary */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-600">
                <span>Selected Plan:</span>
                <span className="font-bold text-zinc-900 uppercase">{selectedTier} ({(planMinutes[selectedTier] || 1000).toLocaleString()} min/mo)</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Base Subscription:</span>
                <span>${basePrice}.00</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Coupon Discount ({validatedCoupon?.discount_percent}%):</span>
                  <span>-${discountAmt}.00</span>
                </div>
              )}
              <div className="pt-2 border-t border-zinc-200 flex justify-between text-sm font-bold text-zinc-900">
                <span>Due Today:</span>
                <span className="text-emerald-700">${finalPrice}.00 USD</span>
              </div>
            </div>

            {/* Rollover Guarantee Banner */}
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>100% Free Trial Credits Rolled Over:</strong> Any unused minutes from your free trial will be immediately credited as bonus minutes!
              </span>
            </div>

            {/* Interactive Stripe Card Form */}
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700">Cardholder Name</label>
                <input
                  type="text"
                  value={cardData.name}
                  onChange={(e) => setCardData({ ...cardData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 flex items-center justify-between">
                  <span>Card Number</span>
                  <span className="text-[10px] font-mono text-zinc-400">TEST MODE ENCRYPTED</span>
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={cardData.number}
                    onChange={(e) => setCardData({ ...cardData, number: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700">Expires</label>
                  <input
                    type="text"
                    value={cardData.expiry}
                    onChange={(e) => setCardData({ ...cardData, expiry: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-center font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700">CVC</label>
                  <input
                    type="text"
                    value={cardData.cvc}
                    onChange={(e) => setCardData({ ...cardData, cvc: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-center font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700">ZIP</label>
                  <input
                    type="text"
                    value={cardData.zip}
                    onChange={(e) => setCardData({ ...cardData, zip: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-center font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
              </div>
            </div>

            {/* Auth Step Feedback */}
            {authStep && (
              <div className={`p-3 rounded-xl text-xs font-mono font-medium flex items-center gap-2 ${
                authStep.includes("Decline")
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : authStep.includes("Authorized")
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200"
              }`}>
                {upgrading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                {authStep.includes("Decline") && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />}
                {authStep.includes("Authorized") && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />}
                <span>{authStep}</span>
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowCheckoutModal(false);
                  setAuthStep("");
                }}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={upgrading}
                onClick={handleUpgrade}
                className="px-6 py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5349e4] text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-[#635BFF]/20 transition-all disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                {upgrading ? "Processing..." : `Pay $${finalPrice}.00 USD (Test Mode)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
