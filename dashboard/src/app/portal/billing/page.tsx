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
  const [renewing, setRenewing] = useState(false);

  // Stripe Checkout Modal state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [cardData, setCardData] = useState({
    number: "4242 •••• •••• 4242",
    expiry: "12/28",
    cvc: "888",
    zip: "78701",
    name: "Apex Plumbing & Heating",
  });
  const [openingPortal, setOpeningPortal] = useState(false);

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
      setShowCheckoutModal(false);
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

  const planPrices: Record<string, number> = { starter: 299, pro: 399, enterprise: 499 };
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

        {/* Cycle Renewal Simulation & Portal Action */}
        <div className="flex items-center gap-2.5">
          {!sub.is_trial && (
            <>
              <button
                type="button"
                onClick={handleSimulateCycleRenewal}
                disabled={renewing}
                className="px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
                title="Simulate 30-day monthly billing reset with 10% complimentary rollover"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${renewing ? "animate-spin text-indigo-600" : ""}`} />
                Simulate 10% Rollover
              </button>

              <button
                type="button"
                onClick={handleOpenCustomerPortal}
                disabled={openingPortal}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Stripe Portal
              </button>
            </>
          )}
        </div>
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
        <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-zinc-900">
              Ready to activate {selectedTier.toUpperCase()} Plan?
            </span>
            <div className="text-[11px] text-zinc-500">
              ${finalPrice}/mo {discountAmt > 0 && `(Saved $${discountAmt} with coupon)`} • Immediate Stripe card authorization.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCheckoutModal(true)}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
          >
            <CreditCard className="w-4 h-4" />
            Proceed to Stripe Checkout (${finalPrice}/mo)
          </button>
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

      {/* STRIPE CHECKOUT MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-bold text-xs">
                  S
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">Stripe Secure Checkout</h3>
                  <div className="text-[10px] text-zinc-500 font-mono">256-Bit Encrypted Payment</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order Summary */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-600">
                <span>Selected Plan:</span>
                <span className="font-bold text-zinc-900 uppercase">{selectedTier} (1,200 min/mo)</span>
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

            {/* Rollover Notification */}
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>100% Free Trial Credits Rolled Over:</strong> Any unused minutes from your free trial will be immediately credited as bonus minutes!
              </span>
            </div>

            {/* Mock Stripe Card Elements */}
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
                <label className="font-semibold text-zinc-700">Card Number</label>
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

            {/* Actions */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={upgrading}
                onClick={handleUpgrade}
                className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                {upgrading ? "Authorizing Card..." : `Pay $${finalPrice}.00 USD`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
