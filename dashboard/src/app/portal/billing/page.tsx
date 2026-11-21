"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  SubscriptionCurrent,
  TenantInvoiceRecord,
  BillingQuoteResponse,
  RefundEligibilityResponse,
} from "@/lib/api";
import {
  CreditCard,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Gift,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Clock,
  Tag,
  Check,
  Layers,
  X,
  Lock,
  ExternalLink,
  Receipt,
  Download,
  HelpCircle,
  TrendingDown,
  Coins,
  ShieldAlert,
  Calculator,
} from "lucide-react";

interface TopupPackItem {
  code: string;
  name: string;
  minutes: number;
  price_usd: number;
  rate_per_min: number;
}

export default function BillingPage() {
  const [sub, setSub] = useState<SubscriptionCurrent | null>(null);
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([]);
  const [topupPacks, setTopupPacks] = useState<TopupPackItem[]>([]);
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

  // Quote State
  const [quote, setQuote] = useState<BillingQuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  // Modals State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [immediateDowngrade, setImmediateDowngrade] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundEligibility, setRefundEligibility] = useState<RefundEligibilityResponse | null>(null);
  const [loadingRefundElig, setLoadingRefundElig] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundMsg, setRefundMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Standalone Top-Up Modal
  const [showTopupModal, setShowTopupModal] = useState<TopupPackItem | null>(null);
  const [purchasingTopup, setPurchasingTopup] = useState(false);
  const [topupSuccessMsg, setTopupSuccessMsg] = useState<string | null>(null);

  // Stripe Checkout Test Mode state
  const [testCardType, setTestCardType] = useState<"success" | "decline">("success");
  const [authStep, setAuthStep] = useState<string>("");
  const [cardData, setCardData] = useState({
    number: "4242 •••• •••• 4242",
    expiry: "12/28",
    cvc: "888",
    zip: "78701",
    name: "Apex Trade Services LLC",
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
        name: "Apex Trade Services LLC",
      });
    } else {
      setCardData({
        number: "4000 •••• •••• 0002",
        expiry: "12/28",
        cvc: "002",
        zip: "90210",
        name: "Apex Trade Services LLC",
      });
    }
  };

  const loadSubscription = () => {
    setLoading(true);
    Promise.all([
      api.getSubscriptionCurrent(),
      api.getTenantInvoices().catch(() => []),
      api.getTopupPacks().catch(() => []),
    ])
      .then(([subRes, invRes, packsRes]) => {
        setSub(subRes);
        setInvoices(invRes);
        setTopupPacks(packsRes);
        if (subRes.tier !== "trial") {
          setSelectedTier(subRes.tier);
          fetchQuote(subRes.tier);
        } else {
          fetchQuote("starter");
        }
        if (subRes.billing_increment) {
          setBillingMode(subRes.billing_increment);
        }
      })
      .catch((err) => console.error("Failed to load subscription:", err))
      .finally(() => setLoading(false));
  };

  const fetchQuote = async (tier: string, code?: string) => {
    try {
      setLoadingQuote(true);
      const res = await api.getSubscriptionQuote(tier, code);
      setQuote(res);
    } catch (err) {
      console.error("Failed to fetch quote:", err);
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleSelectTier = async (tier: string) => {
    setSelectedTier(tier);
    setDowngradeWarning(null);
    fetchQuote(tier, validatedCoupon?.code);

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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update billing precision mode");
    } finally {
      setTogglingMode(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  useEffect(() => {
    if (selectedTier) {
      fetchQuote(selectedTier, validatedCoupon?.code);
    }
  }, [selectedTier, validatedCoupon]);

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponError("");
    setValidatedCoupon(null);
    try {
      const res = await api.validateCoupon(couponCode.trim());
      setValidatedCoupon(res);
      fetchQuote(selectedTier, res.code);
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
    setAuthStep("Contacting Stripe Payment Gateway...");

    setTimeout(async () => {
      setAuthStep("Instant Authorization confirmed! Provisioning telephony minute capacity (< 2 min SLA)...");
      try {
        const res = await api.upgradeSubscription(
          selectedTier,
          validatedCoupon?.code || undefined,
          immediateDowngrade
        );
        setAuthStep("LiveKit Acoustic Persona Channels Initialized!");
        setTimeout(() => {
          setUpgradeSuccess(res.message);
          setShowCheckoutModal(false);
          setShowDowngradeModal(false);
          setAuthStep("");
          setUpgrading(false);
          loadSubscription();
        }, 600);
      } catch (err: unknown) {
        setAuthStep("");
        setUpgrading(false);
        alert(err instanceof Error ? err.message : "Failed to activate subscription.");
      }
    }, 700);
  };

  const handleOpenRefundModal = async () => {
    setShowRefundModal(true);
    setRefundMsg(null);
    setLoadingRefundElig(true);
    try {
      const res = await api.getRefundEligibility();
      setRefundEligibility(res);
    } catch (err) {
      console.error("Failed to load refund eligibility", err);
    } finally {
      setLoadingRefundElig(false);
    }
  };

  const handleSubmitRefund = async () => {
    if (refundReason.trim().length < 10) {
      alert("Please enter a detailed explanation (at least 10 characters).");
      return;
    }
    setSubmittingRefund(true);
    setRefundMsg(null);
    try {
      const res = await api.requestRefund(refundReason.trim());
      setRefundMsg({ type: "success", text: res.message });
      loadSubscription();
      setTimeout(() => setShowRefundModal(false), 2500);
    } catch (err: unknown) {
      setRefundMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Refund request failed.",
      });
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handlePurchaseTopup = async () => {
    if (!showTopupModal) return;
    setPurchasingTopup(true);
    setTopupSuccessMsg(null);
    try {
      const res = await api.purchaseTopupPack(showTopupModal.code);
      setTopupSuccessMsg(res.message);
      setTimeout(() => {
        setShowTopupModal(null);
        setTopupSuccessMsg(null);
        loadSubscription();
      }, 1500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Top-up purchase failed.");
    } finally {
      setPurchasingTopup(false);
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
      <div className="p-12 text-xs font-mono text-zinc-500 bg-white rounded-2xl border border-zinc-200 text-center">
        Loading minute subscription, rollover telemetry, and rate limits...
      </div>
    );
  }

  const used = sub.is_trial ? sub.trial_minutes_used : sub.used_minutes_this_cycle;
  const total = sub.is_trial
    ? sub.trial_minutes_allocated
    : sub.monthly_included_minutes + sub.bonus_rollover_minutes + (sub.topup_minutes_balance || 0);
  const pct = Math.min(100, Math.round((used / (total || 1)) * 100));

  const allPlansCatalog = [
    {
      id: "lite",
      name: "Lite",
      minutes: 300,
      price: 99,
      overage: 0.4,
      concurrency: "2 Concurrent Calls",
      branches: "Single Branch Location",
      desc: "Perfect for solo contractors, after-hours overflow, and emergency weekend answering.",
      features: [
        "300 Voice Minutes Included",
        "1 Dedicated Carrier Phone Line",
        "1 Location Profile",
        "100% Free Trial Rollover",
        "10% Monthly Unused Rollover",
        "$0.40/min Overage Rate",
      ],
    },
    {
      id: "starter",
      name: "Starter",
      minutes: 1000,
      price: 299,
      overage: 0.35,
      concurrency: "3 Concurrent Calls",
      branches: "Single Branch Location",
      desc: "Ideal for residential trade professionals (plumbers, roofers, HVAC, electricians).",
      features: [
        "1,000 Voice Minutes Included",
        "1 Carrier Phone Line",
        "1 Location & Calendar Booking",
        "100% Free Trial Rollover Guarantee",
        "10% Monthly Unused Rollover",
        "$0.35/min Overage Rate",
      ],
    },
    {
      id: "growth",
      name: "Growth",
      minutes: 1500,
      price: 399,
      overage: 0.35,
      concurrency: "4 Concurrent Calls",
      branches: "Up to 2 Branches",
      desc: "Engineered for active trade shops managing dispatch and multiple service vans.",
      features: [
        "1,500 Voice Minutes Included",
        "Up to 2 Carrier Phone Lines",
        "2 Branch Locations Included",
        "Warm & Cold Transfer Routing",
        "10% Monthly Unused Rollover",
        "$0.35/min Overage Rate",
      ],
    },
    {
      id: "pro",
      name: "Professional",
      minutes: 2000,
      price: 499,
      overage: 0.35,
      badge: "Most Popular",
      concurrency: "5 Concurrent Calls",
      branches: "Up to 5 Branches",
      desc: "High-performance reception for dental clinics, law practices, and regional trades.",
      features: [
        "2,000 Voice Minutes Included",
        "Up to 5 Carrier Phone Lines",
        "Multi-Staff Round-Robin Booking",
        "External CRM & Webhook Sync",
        "10% Monthly Unused Rollover",
        "$0.35/min Overage Rate",
      ],
    },
    {
      id: "scale",
      name: "Scale (Multi-Branch)",
      minutes: 4000,
      price: 999,
      overage: 0.3,
      concurrency: "10 Concurrent Calls",
      branches: "Up to 25 Branches",
      desc: "Multi-branch franchises and regional automotive service centers.",
      features: [
        "4,000 Voice Minutes Included",
        "Up to 20 Carrier Lines",
        "Up to 25 Branch Locations",
        "Postal Code Geofence Routing",
        "Location QA Scorecards",
        "$0.30/min Overage Rate",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise Scale",
      minutes: 10000,
      price: 1999,
      overage: 0.2,
      concurrency: "25 Concurrent Calls",
      branches: "Unlimited Branches",
      desc: "24/7 mission-critical hospital networks, emergency dispatch, and property management.",
      features: [
        "10,000 Voice Minutes Included",
        "Unlimited Carrier Lines",
        "Unlimited Branch Locations",
        "Dedicated 99.99% Telephony SLA",
        "White-label Branding & SSO",
        "$0.20/min Overage Rate",
      ],
    },
    {
      id: "agency",
      name: "Agency Wholesale",
      minutes: 5000,
      price: 1000,
      overage: 0.25,
      concurrency: "15 Concurrent Calls",
      branches: "Unlimited Sub-Accounts",
      desc: "Wholesale telephony pool designed for digital agencies reselling voice automation.",
      features: [
        "5,000 Shared Voice Minutes",
        "Unlimited Sub-Tenant Accounts",
        "Agency Portal & Client Re-billing",
        "Custom Acoustic Prompt Studio",
        "10% Monthly Unused Rollover",
        "$0.25/min Overage Rate",
      ],
    },
  ];

  const planPrices: Record<string, number> = {
    lite: 99,
    starter: 299,
    growth: 399,
    pro: 499,
    scale: 999,
    enterprise: 1999,
    agency: 1000,
  };

  const currentPlanPrice = planPrices[sub.tier] || 0;
  const targetPlanPrice = planPrices[selectedTier] || 299;
  const isDowngrade = sub.tier !== "trial" && targetPlanPrice < currentPlanPrice;

  const planMinutes: Record<string, number> = {
    lite: 300,
    starter: 1000,
    growth: 1500,
    pro: 2000,
    scale: 4000,
    enterprise: 10000,
    agency: 5000,
  };

  const planDisplayNames: Record<string, string> = {
    lite: "Lite Plan",
    starter: "Starter Plan",
    growth: "Growth Plan",
    pro: "Professional Plan",
    scale: "Scale (Multi-Branch) Plan",
    enterprise: "Enterprise Scale Plan",
    agency: "Agency Wholesale Plan",
  };

  // Resilient real-time calculator metrics (instant sync with quote, robust deterministic fallback)
  const isExistingPaidSubscriber = sub.tier !== "trial";
  const fallbackBasePrice = planPrices[selectedTier] || 299;
  const fallbackOnboardingFee = isExistingPaidSubscriber
    ? 0
    : fallbackBasePrice >= 399
    ? 399
    : 249;
  const fallbackDiscount = validatedCoupon?.discount_percent
    ? (fallbackBasePrice * validatedCoupon.discount_percent) / 100
    : 0;
  const fallbackBonusMinutes = validatedCoupon?.bonus_minutes || 0;
  const fallbackTotalDue = Math.max(0, fallbackBasePrice - fallbackDiscount + fallbackOnboardingFee);
  const fallbackRecurring = Math.max(0, fallbackBasePrice - fallbackDiscount);
  const fallbackMinutes = planMinutes[selectedTier] || 1000;

  const displayBasePrice = quote ? quote.base_price_usd : fallbackBasePrice;
  const displayOnboardingFee = quote ? quote.onboarding_fee_usd : fallbackOnboardingFee;
  const displayDiscount = quote ? quote.discount_amount_usd : fallbackDiscount;
  const displayBonusMinutes = quote ? quote.coupon_bonus_minutes : fallbackBonusMinutes;
  const displayTotalDue = quote ? quote.total_due_today_usd : fallbackTotalDue;
  const displayRecurring = quote ? quote.recurring_monthly_usd : fallbackRecurring;
  const displayBaseMinutes = quote ? quote.included_minutes : fallbackMinutes;
  const displayRolloverMinutes = sub.is_trial ? (sub.bonus_rollover_minutes || 100) : 100;
  const displayTotalMinutes = displayBaseMinutes + displayRolloverMinutes + displayBonusMinutes;
  const displayEffectiveRate =
    displayTotalMinutes > 0 ? (displayTotalDue / displayTotalMinutes).toFixed(3) : "0.00";

  // Effective refund eligibility fallback (never renders blank screen)
  const baseMinutesAllocated = sub.monthly_included_minutes || 2000;
  const minutesUsedCycle = sub.used_minutes_this_cycle || 0;
  const cycleUsagePct = Math.round((minutesUsedCycle / Math.max(baseMinutesAllocated, 1)) * 100);
  const isEligibleForRefund = cycleUsagePct < 50;

  const effectiveEligibility: RefundEligibilityResponse = refundEligibility || {
    eligible: isEligibleForRefund,
    usage_pct: cycleUsagePct,
    monthly_included_minutes: baseMinutesAllocated,
    used_minutes_this_cycle: minutesUsedCycle,
    refund_status: isEligibleForRefund ? "eligible" : "ineligible",
    reason: isEligibleForRefund
      ? "Cycle usage is below the 50% threshold. You are eligible to submit an audited refund exception request."
      : "Strict Non-Refundable Policy: Account has consumed 50% or more of its monthly allocated base minute pool.",
    policy_terms:
      "All VedaVoice minutes and subscriptions are non-refundable once provisioned onto live carrier trunks, except where total billing cycle consumption remains under 50% of monthly base minutes.",
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-mono font-semibold mb-2">
            <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            LiveKit Telephony Allocation &amp; Rollover Engine
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Minute Billing, Rollover Engine &amp; Plan Management
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time telephony usage, instant plan upgrades (&lt; 2 min activation), rollover guarantees, and separate minute top-ups.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100 border border-zinc-200 text-[11px] text-zinc-700 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Cycle End: {new Date(sub.cycle_end_date).toLocaleDateString()}</span>
          </div>

          {!sub.is_trial && (
            <button
              type="button"
              onClick={handleOpenCustomerPortal}
              disabled={openingPortal}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
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
              <strong>Scheduled Tier Downgrade:</strong> Your plan will automatically transition to{" "}
              <strong className="uppercase font-mono">{sub.pending_tier}</strong> on your next cycle renewal date (
              {new Date(sub.cycle_end_date).toLocaleDateString()}). You keep your current benefits until then.
            </span>
          </div>
          <span className="text-[10px] font-mono bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-semibold uppercase">
            Queued For Renewal
          </span>
        </div>
      )}

      {sub.refund_status && sub.refund_status !== "none" && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Refund Exception Request:</strong> Current status:{" "}
              <strong className="uppercase font-mono">{sub.refund_status}</strong>. Evaluated under the strict &lt; 50% cycle utilization gate.
            </span>
          </div>
          <span className="text-[10px] font-mono bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-semibold uppercase">
            {sub.refund_status}
          </span>
        </div>
      )}

      {/* SECTION 1: TELEMETRY & ROLLOVER ENGINE */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-zinc-900 capitalize">
                {sub.tier === "trial" ? "14-Day Free Trial" : `${sub.tier} Voice Plan`}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                  sub.status === "active"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                }`}
              >
                {sub.status}
              </span>
              {sub.onboarding_fee_paid && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                  Setup Fee Paid
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              {sub.is_trial
                ? "100 free trial minutes included • 100% of unused trial credits roll directly into your first paid month!"
                : `${sub.monthly_included_minutes.toLocaleString()} monthly base minutes + ${sub.bonus_rollover_minutes.toLocaleString()} rollover bonus minutes${
                    sub.topup_minutes_balance ? ` + ${sub.topup_minutes_balance.toLocaleString()} top-up minutes` : ""
                  }.`}
            </div>
          </div>

          <div className="text-right">
            <span className="text-3xl font-extrabold font-mono text-zinc-900">
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
              Total Limit: <strong className="text-zinc-900">{total} min</strong>
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
            <span>{pct}% Quota Utilized This Cycle</span>
            <span>Overage Rate: ${sub.overage_rate_usd.toFixed(2)} / extra minute</span>
          </div>
        </div>

        {/* Rollover Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-950">
              <Gift className="w-4 h-4 text-indigo-600 shrink-0" />
              100% Free Trial Rollover Guarantee
            </div>
            <p className="text-xs text-indigo-800 leading-relaxed">
              Every unused minute from your 14-day free trial is credited directly into your first paid month upon plan activation.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-950">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              10% Monthly Complimentary Rollover
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
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

          <div className="flex items-center gap-3">
            {!sub.is_trial && (
              <button
                type="button"
                onClick={handleOpenRefundModal}
                className="text-xs text-zinc-500 hover:text-zinc-800 underline font-medium"
              >
                Refund Policy &amp; Exception Request
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: STANDALONE MINUTE TOP-UP STORE */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              Standalone Minute Top-Up Packs (Separate One-Time Charges)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Need extra minutes without upgrading your recurring monthly plan? Add on-demand minutes that never expire.
            </p>
          </div>
          {sub.topup_minutes_balance !== undefined && sub.topup_minutes_balance > 0 && (
            <div className="px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-mono text-xs font-bold">
              Active Top-Up Balance: {sub.topup_minutes_balance} min
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {topupPacks.map((pack) => (
            <div
              key={pack.code}
              className="p-4 rounded-xl border border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50 transition-all flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-zinc-900">{pack.name}</span>
                  <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                    +{pack.minutes.toLocaleString()} min
                  </span>
                </div>
                <div className="text-lg font-extrabold font-mono text-zinc-900 mt-2">
                  ${pack.price_usd.toFixed(2)}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  ${pack.rate_per_min.toFixed(2)} / minute &bull; Never expires
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTopupModal(pack)}
                className="w-full py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-xs transition-all"
              >
                Buy Top-Up Pack
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: COMPLETE 7-TIER PLAN LADDER SHOWCASE */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900">
            Select Your Business Telephony Minute Tier
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Choose your monthly volume tier. Upgrades activate instantly (&lt; 2 min SLA). First-time subscriptions include one-time telephony onboarding setup.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {allPlansCatalog.map((plan) => {
            const isSelected = selectedTier === plan.id;
            const isCurrent = sub.tier === plan.id;

            return (
              <div
                key={plan.id}
                onClick={() => handleSelectTier(plan.id)}
                className={`p-6 rounded-2xl border text-left cursor-pointer transition-all space-y-4 relative flex flex-col justify-between ${
                  isSelected
                    ? "border-zinc-900 bg-white ring-2 ring-zinc-900 shadow-md"
                    : isCurrent
                    ? "border-emerald-500 bg-emerald-50/20 shadow-xs"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-xs"
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
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">
                      {plan.minutes.toLocaleString()} min
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold font-mono text-zinc-900">${plan.price}</span>
                    <span className="text-xs text-zinc-500 font-medium">/ month</span>
                  </div>

                  <div className="flex flex-col gap-1 text-[11px] font-mono text-zinc-600">
                    <div className="inline-flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-indigo-600" />
                      <span>{plan.branches}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500">{plan.concurrency}</div>
                  </div>

                  <p className="text-xs text-zinc-500 leading-relaxed pt-1">{plan.desc}</p>
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
                        : isCurrent
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {isCurrent ? "Current Plan" : isSelected ? "✓ Selected Tier" : "Select Tier"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: REAL-TIME SUBSCRIPTION & ONBOARDING FEE CALCULATOR */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-mono font-bold mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
              Real-Time Telephony Quote Engine
            </div>
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-indigo-600" />
              Real-Time Plan &amp; Telephony Onboarding Fee Calculator
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live quote breakdown computing monthly base subscriptions, deterministic carrier onboarding setup, promo discounts, and rollover minute yields.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-500">
              {loadingQuote ? "Recalculating quote..." : "Live Deterministic Quote"}
            </span>
          </div>
        </div>

        {/* Quick Plan Switcher Chips */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 font-mono block">
            Switch Target Plan for Real-Time Quote:
          </label>
          <div className="flex flex-wrap gap-2">
            {allPlansCatalog.map((p) => {
              const active = selectedTier === p.id;
              const isCurrent = sub.tier === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectTier(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all flex items-center gap-1.5 ${
                    active
                      ? "bg-zinc-900 text-white shadow-xs"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                  }`}
                >
                  <span>{p.name}</span>
                  <span className={active ? "text-indigo-300" : "text-zinc-500"}>
                    ${p.price}/mo
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] px-1 rounded bg-emerald-600 text-white font-sans">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Calculator Breakdown Card & Summary Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          {/* Left Column: Transparent Itemized Line Items */}
          <div className="lg:col-span-7 space-y-3">
            <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-200 text-zinc-900 font-bold">
                <span className="font-sans text-xs">Line Item Description</span>
                <span className="font-sans text-xs">Amount (USD)</span>
              </div>

              {/* 1. Base Subscription */}
              <div className="flex items-center justify-between text-zinc-700">
                <div>
                  <div className="font-semibold text-zinc-900 font-sans">
                    {planDisplayNames[selectedTier] || selectedTier.toUpperCase()} Base Subscription
                  </div>
                  <div className="text-[11px] text-zinc-500 font-sans">
                    Includes {displayBaseMinutes.toLocaleString()} monthly base minutes
                  </div>
                </div>
                <span className="font-bold text-zinc-900">${displayBasePrice.toFixed(2)}</span>
              </div>

              {/* 2. Onboarding Fee */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 text-zinc-700">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-zinc-900 font-sans">
                    <span>One-Time Telephony Onboarding Fee</span>
                    {displayOnboardingFee === 0 ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono">
                        Waived ($0.00)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold font-mono">
                        1-Time Charge
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-sans">
                    {displayOnboardingFee === 0
                      ? "Waived for active subscribers upgrading or switching plans. Never billed on renewals."
                      : displayBasePrice >= 399
                      ? "$399.00 fixed enterprise setup (LiveKit SIP trunking & carrier registration)."
                      : `Deterministic $199–$299 carrier provisioning fee ($${displayOnboardingFee.toFixed(2)}). Billed strictly once.`}
                  </div>
                </div>
                <span className={`font-bold ${displayOnboardingFee === 0 ? "text-emerald-700" : "text-zinc-900"}`}>
                  {displayOnboardingFee === 0 ? "$0.00" : `+$${displayOnboardingFee.toFixed(2)}`}
                </span>
              </div>

              {/* 3. Promo / Coupon Discount */}
              {displayDiscount > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 text-emerald-800">
                  <div>
                    <div className="font-semibold font-sans">
                      Promotional Coupon Discount ({validatedCoupon?.code})
                    </div>
                    <div className="text-[11px] text-emerald-700 font-sans">
                      {validatedCoupon?.discount_percent}% recurring discount applied
                    </div>
                  </div>
                  <span className="font-bold">-${displayDiscount.toFixed(2)}</span>
                </div>
              )}

              {/* 4. Trial Rollover Guaranteed Minutes */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 text-indigo-800 bg-indigo-50/50 p-2.5 rounded-lg">
                <div>
                  <div className="font-semibold font-sans flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>100% Free Trial Unused Minutes Rollover</span>
                  </div>
                  <div className="text-[10px] text-indigo-600 font-sans">
                    All unused minutes from your 14-day trial roll directly into month 1
                  </div>
                </div>
                <span className="font-bold">+{displayRolloverMinutes} min</span>
              </div>

              {/* 5. Bonus Minutes */}
              {displayBonusMinutes > 0 && (
                <div className="flex items-center justify-between text-indigo-800 bg-indigo-50/50 p-2.5 rounded-lg">
                  <div>
                    <div className="font-semibold font-sans">Coupon Bonus Minute Yield</div>
                    <div className="text-[10px] text-indigo-600 font-sans">Complimentary promotional credit</div>
                  </div>
                  <span className="font-bold">+{displayBonusMinutes} min</span>
                </div>
              )}
            </div>

            {/* Total Minutes Starting Balance Bar */}
            <div className="p-3 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-700">Total Effective Starting Minutes (Month 1):</span>
              <span className="font-mono font-extrabold text-indigo-700 text-sm">
                {displayTotalMinutes.toLocaleString()} Voice Minutes
              </span>
            </div>
          </div>

          {/* Right Column: Executive Summary & Instant Action Box */}
          <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-900 text-white flex flex-col justify-between space-y-4 shadow-lg">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-xs uppercase font-mono tracking-wider text-zinc-400">
                  Total Due Today
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                  Instant Activation
                </span>
              </div>

              <div>
                <div className="text-3xl font-extrabold font-mono tracking-tight text-white">
                  ${displayTotalDue.toFixed(2)} <span className="text-xs font-normal text-zinc-400 font-sans">USD</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {displayOnboardingFee > 0
                    ? `Includes $${displayBasePrice.toFixed(2)} base fee + $${displayOnboardingFee.toFixed(2)} one-time setup fee.`
                    : "No onboarding setup fee. Pure base monthly rate."}
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-800 text-xs font-mono">
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Recurring Monthly Rate:</span>
                  <span className="font-bold">${displayRecurring.toFixed(2)}/mo</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">All-In Unit Cost:</span>
                  <span className="font-bold">~${displayEffectiveRate} / minute</span>
                </div>
                <div className="flex justify-between text-zinc-300">
                  <span className="text-zinc-400">Renewal Onboarding Fee:</span>
                  <span className="text-emerald-400 font-bold">$0.00 (Waived)</span>
                </div>
              </div>
            </div>

            {/* Action CTA */}
            <div className="pt-2">
              {selectedTier === sub.tier ? (
                <div className="w-full py-2.5 rounded-xl bg-zinc-800 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700">
                  <Check className="w-4 h-4 text-emerald-400" />
                  Currently Active Plan (Auto-Renews)
                </div>
              ) : isDowngrade ? (
                <button
                  type="button"
                  disabled={Boolean(downgradeWarning)}
                  onClick={() => setShowDowngradeModal(true)}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
                >
                  <TrendingDown className="w-4 h-4" />
                  Configure Downgrade to {selectedTier.toUpperCase()}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(downgradeWarning) || loadingQuote}
                  onClick={() => setShowCheckoutModal(true)}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-extrabold flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 fill-zinc-950" />
                  {sub.is_trial
                    ? `Activate ${selectedTier.toUpperCase()} ($${displayTotalDue.toFixed(2)})`
                    : `Instant Upgrade to ${selectedTier.toUpperCase()} ($${displayTotalDue.toFixed(2)})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section 4B: Promotional Coupon Box */}
        <div className="pt-4 border-t border-zinc-100 space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              Apply Promotional / Founder Coupon Code
            </h4>
            <p className="text-[11px] text-zinc-500">
              Have a promotional code? Apply below for recurring invoice discounts and complimentary bonus minutes.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 max-w-lg">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="e.g. LAUNCH50 or FOUNDER100"
              className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-zinc-300 text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:border-zinc-900 uppercase"
            />
            <button
              type="button"
              disabled={validatingCoupon}
              onClick={handleValidateCoupon}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-50"
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
                {validatedCoupon.discount_percent > 0 && `${validatedCoupon.discount_percent}% Off `}
                {validatedCoupon.bonus_minutes > 0 && `+${validatedCoupon.bonus_minutes} Bonus Minutes`}
              </span>
            </div>
          )}

          {couponError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium max-w-lg">
              {couponError}
            </div>
          )}

          {downgradeWarning && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2.5 font-medium max-w-2xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="block font-bold text-amber-900">Pre-Downgrade Resource Limit Guard:</strong>
                <p className="text-[11px] leading-relaxed text-amber-800">{downgradeWarning}</p>
                <p className="text-[10px] text-amber-700 italic">
                  Please deactivate excess phone numbers or branch locations before transitioning to this plan.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 5: INVOICE HISTORY */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-xs space-y-4">
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
            No paid invoices generated yet. Your account is currently on trial or awaiting first monthly cycle statement.
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

      {/* MODAL 1: CHECKOUT & INSTANT UPGRADE MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-7 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-white font-bold text-sm">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900">
                    {sub.is_trial ? "Activate Subscription" : "Instant Plan Upgrade"}
                  </h3>
                  <div className="text-[11px] text-zinc-500">&lt; 2 Minute LiveKit Acoustic Provisioning</div>
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

            {/* Test Card Quick Selector */}
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

            {/* Itemized Order Summary */}
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-600">
                <span>Selected Plan:</span>
                <span className="font-bold text-zinc-900 uppercase">
                  {planDisplayNames[selectedTier] || selectedTier.toUpperCase()} ({displayBaseMinutes.toLocaleString()} min/mo)
                </span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Monthly Base Subscription:</span>
                <span>${displayBasePrice.toFixed(2)}</span>
              </div>

              {displayOnboardingFee > 0 && (
                <div className="flex justify-between text-indigo-700 font-semibold">
                  <span>
                    One-Time Telephony Onboarding Fee:
                    <span className="block text-[10px] text-indigo-500 font-sans font-normal">
                      {displayBasePrice < 399 ? "Dynamic $199–$299 tier" : "$399 fixed enterprise setup"}
                    </span>
                  </span>
                  <span>+${displayOnboardingFee.toFixed(2)}</span>
                </div>
              )}

              {displayDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Coupon Discount ({validatedCoupon?.code}):</span>
                  <span>-${displayDiscount.toFixed(2)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-zinc-200 flex justify-between text-sm font-bold text-zinc-900">
                <span>Due Today:</span>
                <span className="text-emerald-700">${displayTotalDue.toFixed(2)} USD</span>
              </div>
              <div className="text-[10px] text-zinc-400 font-sans">
                *Subsequent auto-renewals will be ${displayRecurring.toFixed(2)}/mo. Onboarding fee is only charged once.
              </div>
            </div>

            {displayRolloverMinutes > 0 && (
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  <strong>100% Free Trial Rollover Guarantee:</strong> {displayRolloverMinutes} unused trial minutes will be credited directly as bonus minutes today!
                </span>
              </div>
            )}

            {authStep && (
              <div className={`p-3 rounded-xl text-xs font-mono font-medium flex items-center gap-2 ${
                authStep.includes("Decline")
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : authStep.includes("Initialized")
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-indigo-50 text-indigo-800 border border-indigo-200"
              }`}>
                {upgrading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                <span>{authStep}</span>
              </div>
            )}

            <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={upgrading}
                onClick={handleUpgrade}
                className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                {upgrading ? "Processing..." : `Confirm & Pay $${displayTotalDue.toFixed(2)} USD`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DOWNGRADE OPTIONS & FEATURE RESTRICTION MODAL */}
      {showDowngradeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-sm text-zinc-900">Plan Downgrade Confirmation</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDowngradeModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              You are transitioning from <strong>{sub.tier.toUpperCase()}</strong> to <strong>{selectedTier.toUpperCase()}</strong>.
              Downgrading reduces your monthly included minutes and restricts multi-location or advanced calendar features.
            </p>

            <div className="space-y-2 border border-zinc-200 p-4 rounded-xl bg-zinc-50 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="downgrade_type"
                  checked={!immediateDowngrade}
                  onChange={() => setImmediateDowngrade(false)}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-bold text-zinc-900 block">Schedule at End of Billing Cycle (Recommended)</span>
                  <span className="text-[11px] text-zinc-500">
                    Keep your current plan limits until {new Date(sub.cycle_end_date).toLocaleDateString()}. Transition occurs automatically upon renewal.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-zinc-200">
                <input
                  type="radio"
                  name="downgrade_type"
                  checked={immediateDowngrade}
                  onChange={() => setImmediateDowngrade(true)}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-bold text-zinc-900 block">Instant Downgrade (Immediate Restriction)</span>
                  <span className="text-[11px] text-zinc-500">
                    Applies target tier limits immediately. Excess numbers or seats must be deactivated. Non-refundable.
                  </span>
                </div>
              </label>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowDowngradeModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpgrade}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
              >
                Confirm Downgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: STRICT REFUND POLICY & REQUEST MODAL */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-zinc-900">VedaVoice Refund Terms &amp; Exception Review</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingRefundElig && !refundEligibility ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-mono">
                Calculating current cycle usage telemetry...
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {/* Strict 50% Gate Card */}
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 ${
                    effectiveEligibility.eligible
                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                      : "bg-red-50/70 border-red-200 text-red-950"
                  }`}
                >
                  {effectiveEligibility.eligible ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <span className="font-bold block">
                      {effectiveEligibility.eligible
                        ? "Eligible for Exception Review (< 50% Usage)"
                        : "Strictly Ineligible: Non-Refundable (≥ 50% Usage)"}
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      Current cycle usage is <strong>{effectiveEligibility.usage_pct}%</strong> (
                      {effectiveEligibility.used_minutes_this_cycle} of {effectiveEligibility.monthly_included_minutes} mins).
                    </p>
                    <p className="text-[10px] opacity-80">
                      {effectiveEligibility.reason}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 leading-relaxed font-sans">
                  <strong>Policy Terms:</strong> {effectiveEligibility.policy_terms}
                </div>

                {effectiveEligibility.eligible && (
                  <div className="space-y-2 pt-2">
                    <label className="font-semibold text-zinc-700 block">
                      Reason for Exception Request (Audited by SuperAdmin):
                    </label>
                    <textarea
                      rows={3}
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="Please provide specific details regarding this refund exception..."
                      className="w-full p-2.5 rounded-xl border border-zinc-300 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-hidden"
                    />
                  </div>
                )}

                {refundMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium ${
                      refundMsg.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}
                  >
                    {refundMsg.text}
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowRefundModal(false)}
                    className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Close
                  </button>
                  {effectiveEligibility.eligible && (
                    <button
                      type="button"
                      disabled={submittingRefund}
                      onClick={handleSubmitRefund}
                      className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold disabled:opacity-50"
                    >
                      {submittingRefund ? "Submitting..." : "Submit Exception Request"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: STANDALONE TOP-UP PURCHASE MODAL */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-zinc-900">Purchase Minute Top-Up</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTopupModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-1 text-xs">
              <div className="flex justify-between font-bold text-zinc-900">
                <span>{showTopupModal.name}</span>
                <span className="font-mono">+{showTopupModal.minutes.toLocaleString()} minutes</span>
              </div>
              <div className="flex justify-between text-zinc-600 font-mono">
                <span>Price:</span>
                <span className="text-zinc-900 font-bold">${showTopupModal.price_usd.toFixed(2)} USD</span>
              </div>
              <p className="text-[11px] text-amber-800 pt-1">
                Billed independently. Top-up minutes never expire and do not reset your monthly subscription date.
              </p>
            </div>

            {topupSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
                {topupSuccessMsg}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowTopupModal(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purchasingTopup}
                onClick={handlePurchaseTopup}
                className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold disabled:opacity-50"
              >
                {purchasingTopup ? "Processing..." : `Pay $${showTopupModal.price_usd.toFixed(2)} USD`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
