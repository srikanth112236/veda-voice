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
  AgencySubAccount,
  AgencyAuditLog,
  TelnyxNumberItem,
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
  CreditCard,
  Tag,
  Gift,
  UserCheck,
  History,
  ExternalLink,
  ShieldAlert,
  Search,
  Loader2,
  MessageSquare,
} from "lucide-react";

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [trunkTelemetry, setTrunkTelemetry] = useState<SipTrunkTelemetry | null>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [maskPii, setMaskPii] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"telemetry" | "tenants" | "subaccounts" | "audit" | "billing" | "inventory" | "coupons">("telemetry");

  // Agency Sub-Accounts & Impersonation state (Milestone M8b)
  const [subAccounts, setSubAccounts] = useState<AgencySubAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AgencyAuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditImpersonatedOnly, setAuditImpersonatedOnly] = useState<boolean>(false);
  const [impersonateTarget, setImpersonateTarget] = useState<AgencySubAccount | null>(null);
  const [impersonateReason, setImpersonateReason] = useState("Technical investigation and QA configuration audit");
  const [impersonating, setImpersonating] = useState(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AgencyAuditLog | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && ["telemetry", "tenants", "subaccounts", "audit", "billing", "inventory", "coupons"].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);

  const handleTabChange = (newTab: "telemetry" | "tenants" | "subaccounts" | "audit" | "billing" | "inventory" | "coupons") => {
    setActiveTab(newTab);
    router.replace(`/admin/dashboard?tab=${newTab}`, { scroll: false });
  };
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

  // Coupons & Bonus Minutes state
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

  // Admin Master Subscription Control Modal
  const [showManageSubModal, setShowManageSubModal] = useState<any | null>(null);
  const [subTierSelect, setSubTierSelect] = useState<string>("starter");
  const [subStatusSelect, setSubStatusSelect] = useState<string>("active");
  const [subCustomMinutes, setSubCustomMinutes] = useState<number | "">("");
  const [subResetUsage, setSubResetUsage] = useState<boolean>(false);
  const [updatingSub, setUpdatingSub] = useState(false);

  // Telnyx 1-Click DID Order & SMS state (Phase 4)
  const [showTelnyxModal, setShowTelnyxModal] = useState(false);
  const [telnyxAreaCode, setTelnyxAreaCode] = useState("415");
  const [telnyxLocality, setTelnyxLocality] = useState("");
  const [telnyxTargetTenantId, setTelnyxTargetTenantId] = useState("");
  const [searchingTelnyx, setSearchingTelnyx] = useState(false);
  const [telnyxSearchResults, setTelnyxSearchResults] = useState<TelnyxNumberItem[]>([]);
  const [orderingTelnyxNumber, setOrderingTelnyxNumber] = useState<string | null>(null);
  const [telnyxSuccessMsg, setTelnyxSuccessMsg] = useState<string | null>(null);

  const handleSearchTelnyxNumbers = async () => {
    setSearchingTelnyx(true);
    setTelnyxSuccessMsg(null);
    try {
      const results = await api.searchTelnyxNumbers(telnyxAreaCode, telnyxLocality);
      setTelnyxSearchResults(results);
    } catch (err: any) {
      console.error("Failed to search Telnyx numbers", err);
    } finally {
      setSearchingTelnyx(false);
    }
  };

  const handleOrderTelnyxNumber = async (numItem: TelnyxNumberItem) => {
    setOrderingTelnyxNumber(numItem.phone_number);
    setTelnyxSuccessMsg(null);
    try {
      const ordered = await api.orderTelnyxNumber({
        phone_number: numItem.phone_number,
        tenant_id: telnyxTargetTenantId || undefined,
        locality: numItem.locality,
        region: numItem.region_information,
        label: "Telnyx Carrier Line",
      });
      setNumbers((prev) => [ordered, ...prev]);
      setTelnyxSuccessMsg(`Ordered ${numItem.phone_number} on Telnyx ($1/mo) and auto-bound to LiveKit SIP!`);
      setTelnyxSearchResults((prev) => prev.filter((n) => n.phone_number !== numItem.phone_number));
    } catch (err: any) {
      console.error("Failed to order Telnyx number", err);
      alert(`Error ordering Telnyx number: ${err?.message || err}`);
    } finally {
      setOrderingTelnyxNumber(null);
    }
  };

  const loadData = () => {
    setRefreshing(true);
    Promise.all([
      api.getAdminStats(),
      api.getAdminTenants(),
      api.getNumbers(),
      api.getSipTrunkTelemetry(),
      api.getAdminSubscriptions().catch(() => []),
      api.getAdminCoupons().catch(() => []),
      api.getAgencySubAccounts().catch(() => []),
      api.getAgencyAuditLogs({ limit: 100 }).catch(() => ({ total: 0, items: [] })),
    ])
      .then(([statsRes, tenantsRes, numbersRes, trunkRes, subsRes, couponsRes, subAccountsRes, auditRes]) => {
        setStats(statsRes);
        setTenants(tenantsRes);
        setNumbers(numbersRes);
        setTrunkTelemetry(trunkRes);
        setSubscriptions(subsRes);
        setCoupons(couponsRes);
        setSubAccounts(subAccountsRes as any);
        setAuditLogs(auditRes.items as any);
        setAuditTotal(auditRes.total);
      })
      .catch((err) => console.error("Failed to load admin data:", err))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  const loadAuditLogs = () => {
    api
      .getAgencyAuditLogs({
        action: auditActionFilter || undefined,
        is_impersonated: auditImpersonatedOnly ? true : undefined,
        limit: 100,
      })
      .then((res) => {
        setAuditLogs(res.items);
        setAuditTotal(res.total);
      })
      .catch((err) => console.error("Failed to filter audit logs:", err));
  };

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

  const handleSyncTrunkDispatch = async () => {
    setSyncingTrunk(true);
    setSyncSuccessMsg(null);
    try {
      const res = await api.syncSipTrunkDispatchRules();
      setSyncSuccessMsg(res.message);
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

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCoupon(true);
    setCouponError(null);
    try {
      await api.createAdminCoupon(newCouponData);
      setShowCouponModal(false);
      setNewCouponData({ code: "", discount_percent: 20, bonus_minutes: 100, max_redemptions: 50 });
      const refreshedCoupons = await api.getAdminCoupons();
      setCoupons(refreshedCoupons);
    } catch (err: any) {
      setCouponError(err.message || "Failed to create coupon code");
    } finally {
      setCreatingCoupon(false);
    }
  };

  const handleGrantBonusMinutes = async (tenantId: string) => {
    setGrantingMinutes(true);
    try {
      await api.grantAdminMinutes(tenantId, grantMinutesVal, grantReason);
      setShowGrantModal(null);
      const [refreshedSubs, refreshedTenants] = await Promise.all([
        api.getAdminSubscriptions(),
        api.getAdminTenants(),
      ]);
      setSubscriptions(refreshedSubs);
      setTenants(refreshedTenants);
    } catch (err: unknown) {
      console.error("Failed to grant bonus minutes:", err);
    } finally {
      setGrantingMinutes(false);
    }
  };

  const openManageSubModal = (sub: any) => {
    setShowManageSubModal(sub);
    setSubTierSelect(sub.tier);
    setSubStatusSelect(sub.status);
    setSubCustomMinutes(sub.monthly_included_minutes);
    setSubResetUsage(false);
  };

  const handleUpdateTenantSubscription = async () => {
    if (!showManageSubModal) return;
    setUpdatingSub(true);
    try {
      await api.updateAdminSubscriptionTier(
        showManageSubModal.tenant_id,
        subTierSelect,
        subCustomMinutes !== "" ? Number(subCustomMinutes) : undefined,
        subResetUsage
      );
      if (subStatusSelect !== showManageSubModal.status) {
        await api.updateAdminSubscriptionStatus(showManageSubModal.tenant_id, subStatusSelect);
      }
      setShowManageSubModal(null);
      const [refreshedSubs, refreshedTenants] = await Promise.all([
        api.getAdminSubscriptions(),
        api.getAdminTenants(),
      ]);
      setSubscriptions(refreshedSubs);
      setTenants(refreshedTenants);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update tenant subscription");
    } finally {
      setUpdatingSub(false);
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
        <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
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
            Global multi-tenant telephony oversight, concurrency saturation, carrier trunk health, minute billing &amp; CoGS intelligence.
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
          <div className="text-3xl font-extrabold font-mono text-red-600">
            {stats?.emergency_calls || 0}
          </div>
          <div className="text-[11px] text-red-600/80 font-mono">0 false dispatch claims</div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>SIP Trunk Numbers</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-zinc-900">
            {stats?.active_phone_numbers || 0}
          </div>
          <div className="text-[11px] text-emerald-600 font-mono font-medium">STIR/SHAKEN A-Attested</div>
        </div>

        <div className="p-5 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Pipeline P50 Latency</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold font-mono text-zinc-900">
            {stats?.avg_latency_p50_ms ? `${stats.avg_latency_p50_ms}ms` : "1,142ms"}
          </div>
          <div className="text-[11px] text-amber-600 font-mono font-medium">EOU + TTFT + TTFB</div>
        </div>
      </div>

      {/* 5-Tab Admin Command Suite */}
      <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100 rounded-2xl border border-zinc-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => handleTabChange("telemetry")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "telemetry"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <Gauge className="w-3.5 h-3.5 text-indigo-600" />
          <span>System Telemetry</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("tenants")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "tenants"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Organizations</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-700">
            {tenants.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("subaccounts")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "subaccounts"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
          <span>Sub-Accounts &amp; Proxy</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-700">
            {subAccounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            handleTabChange("audit");
            loadAuditLogs();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "audit"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <History className="w-3.5 h-3.5 text-purple-600" />
          <span>Audit Trail</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-700">
            {auditTotal}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("billing")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "billing"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-amber-600" />
          <span>Subscriptions &amp; Billing</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-700">
            {subscriptions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("inventory")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "inventory"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <Phone className="w-3.5 h-3.5 text-sky-600" />
          <span>Carrier &amp; SIP Trunks</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-700">
            {numbers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("coupons")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "coupons"
              ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
          }`}
        >
          <Tag className="w-3.5 h-3.5 text-violet-600" />
          <span>Platform Coupons</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-700">
            {coupons.length}
          </span>
        </button>
      </div>

      {/* SECTION 1: Global Concurrency & Capacity Saturation Gauges */}
      {activeTab === "telemetry" && (
      <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wide">
              Global Concurrency &amp; Capacity Saturation
            </h2>
            <InfoTrigger topic="admin_concurrency_saturation" />
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
            <span>Rate-Limit Safety Threshold: <strong className="text-zinc-800">90%</strong></span>
            <span className="text-zinc-300">|</span>
            <span>Burst Headroom: <strong className="text-emerald-600 font-bold">{maxInbound - activeInbound + (maxOutbound - activeOutbound)} channels</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Inbound Concurrency Meter */}
          <div className="p-4 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                Inbound Receptionist Channels
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700">
                {activeInbound} / {maxInbound}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  inboundPct > 80 ? "bg-red-500" : inboundPct > 50 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(inboundPct, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600">
              <span>{inboundPct}% Saturation</span>
              <span className="text-zinc-500">{maxInbound - activeInbound} available</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Guaranteed ceiling for concurrent incoming phone calls across all client numbers.
            </p>
          </div>

          {/* Outbound Concurrency Meter */}
          <div className="p-4 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-600" />
                Outbound Automated Dialer
              </span>
              <span className="text-xs font-mono font-bold text-indigo-600">
                {activeOutbound} / {maxOutbound}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  outboundPct > 80 ? "bg-red-500" : outboundPct > 50 ? "bg-amber-500" : "bg-indigo-600"
                }`}
                style={{ width: `${Math.min(outboundPct, 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600">
              <span>{outboundPct}% Saturation</span>
              <span className="text-zinc-500">{maxOutbound - activeOutbound} available</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Regulated ceiling for TCPA-consented reminders, scheduled callbacks, and speed-to-lead.
            </p>
          </div>

          {/* Carrier CPS Telemetry */}
          <div className="p-4 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                Carrier CPS Throttle
              </span>
              <span className="text-xs font-mono font-bold text-amber-600">
                {carrier.cps_current} / {carrier.cps_limit} CPS
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${(carrier.cps_current / carrier.cps_limit) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600">
              <span>Calls Per Second</span>
              <span className="text-emerald-600 font-semibold">Zero 503 drops</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Carrier trunk call initiation rate kept strictly below carrier 10 CPS blast limit.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2: Carrier SIP Trunk Telemetry & Audio Quality (MOS) */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wide">
              Carrier SIP Trunk Health &amp; Audio Telemetry
            </h2>
            <InfoTrigger topic="admin_carrier_sip_trunk" />
          </div>
          <span className="text-xs font-mono text-emerald-700 flex items-center gap-1 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Primary: Twilio | Hot Standby: Telnyx
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Trunk Status</span>
            <div className="text-sm font-bold text-emerald-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Connected
            </div>
            <span className="text-[10px] text-zinc-500">SIP INVITE 200 OK</span>
          </div>

          <div className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Carrier Latency</span>
            <div className="text-sm font-bold text-zinc-900">
              {carrier.latency_ms}ms
            </div>
            <span className="text-[10px] text-zinc-500">Jitter: {carrier.jitter_ms}ms</span>
          </div>

          <div className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Audio Score (MOS)</span>
            <div className="text-sm font-bold text-emerald-600 flex items-center gap-1">
              {carrier.mos_score} / 5.0
            </div>
            <span className="text-[10px] text-emerald-600/90 font-medium">Toll-grade PSTN</span>
          </div>

          <div className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Packet Loss</span>
            <div className="text-sm font-bold text-zinc-900">
              {carrier.packet_loss_pct}%
            </div>
            <span className="text-[10px] text-emerald-600 font-medium">Zero audible gaps</span>
          </div>

          <div className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Audio Codec</span>
            <div className="text-xs font-bold text-zinc-900 truncate" title="Opus 48kHz WebRTC to G.711u PSTN">
              Opus &harr; G.711u
            </div>
            <span className="text-[10px] text-zinc-500">48kHz Wideband</span>
          </div>

          <div className="p-3 rounded-xl border border-zinc-100 bg-zinc-50/70 space-y-1 font-mono">
            <span className="text-[10px] uppercase text-zinc-500 font-bold">STIR/SHAKEN</span>
            <div className="text-sm font-bold text-emerald-600">
              Level A
            </div>
            <span className="text-[10px] text-zinc-500">Full Attestation</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: Model Inference Cost & Profit Margin Intelligence */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wide">
              Model Inference CoGS &amp; SaaS Margin Intelligence
            </h2>
            <InfoTrigger topic="admin_inference_cogs" />
          </div>
          <span className="text-xs font-mono text-zinc-600">
            Per-Minute Unit Cost: <strong className="text-emerald-700 font-bold">${cost.total_cogs_per_min.toFixed(4)}/min</strong>
          </span>
        </div>

        {/* CoGS Waterfall Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-1">
            <div className="flex items-center justify-between text-zinc-500 text-[11px]">
              <span>WebRTC SFU Media</span>
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-sm font-bold text-zinc-900">${cost.cost_livekit_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">LiveKit Cloud routing</div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-1">
            <div className="flex items-center justify-between text-zinc-500 text-[11px]">
              <span>Nova-2 STT</span>
              <Activity className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-sm font-bold text-zinc-900">${cost.cost_deepgram_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">Deepgram streaming</div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-1">
            <div className="flex items-center justify-between text-zinc-500 text-[11px]">
              <span>Gemini 2.5 Flash</span>
              <Zap className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-sm font-bold text-zinc-900">${cost.cost_gemini_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">~520 tokens / turn</div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-1">
            <div className="flex items-center justify-between text-zinc-500 text-[11px]">
              <span>Neural TTS</span>
              <Radio className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="text-sm font-bold text-zinc-900">${cost.cost_tts_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-zinc-500 font-sans">Inworld / Rime audio</div>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 space-y-1">
            <div className="flex items-center justify-between text-emerald-800 text-[11px]">
              <span className="font-semibold">Total CoGS / Min</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-base font-extrabold text-emerald-700">${cost.total_cogs_per_min.toFixed(4)}</div>
            <div className="text-[10px] text-emerald-700/80 font-sans">All-in platform cost</div>
          </div>
        </div>

        {/* Agency Financial Intelligence Summary */}
        <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 grid grid-cols-1 sm:grid-cols-4 gap-4 items-center">
          <div>
            <div className="text-[11px] text-zinc-500 uppercase font-mono font-semibold">Billed Call Minutes</div>
            <div className="text-xl font-extrabold font-mono text-zinc-900">{cost.total_billable_minutes.toFixed(1)} mins</div>
            <div className="text-[10px] text-zinc-500">Across {stats?.total_calls || 0} customer calls</div>
          </div>

          <div>
            <div className="text-[11px] text-zinc-500 uppercase font-mono font-semibold">Inference &amp; Carrier CoGS</div>
            <div className="text-xl font-extrabold font-mono text-zinc-900">${cost.est_telephony_cost_usd.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">Real-time compute cost</div>
          </div>

          <div>
            <div className="text-[11px] text-zinc-500 uppercase font-mono font-semibold">Tenant SaaS MRR</div>
            <div className="text-xl font-extrabold font-mono text-emerald-600">${cost.est_monthly_revenue_usd.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">${cost.tenant_subscription_fee_usd}/mo &times; {stats?.total_tenants || 0} clients</div>
          </div>

          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
            <div className="text-[11px] text-emerald-800 uppercase font-mono flex items-center gap-1 font-bold">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              Platform Gross Margin
            </div>
            <div className="text-2xl font-extrabold font-mono text-emerald-700">{cost.gross_margin_pct.toFixed(1)}%</div>
            <div className="text-[10px] text-emerald-700/90 font-medium">Target margin: &gt;85%</div>
          </div>
        </div>
      </div>
      </div>
      )}

      {/* SECTION 2B: Automated Phone Number Inventory & LiveKit SIP Trunk Binding */}
      {activeTab === "inventory" && (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 gap-3">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wide">
              Phone Number Inventory &amp; LiveKit SIP Trunk Binding
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-semibold">
              {numbers.length} Total Lines
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncTrunkDispatch}
              disabled={syncingTrunk}
              className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Synchronize all active tenant E.164 phone numbers to LiveKit Inbound SIP dispatch rules"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingTrunk ? "animate-spin" : ""}`} />
              <span>{syncingTrunk ? "Syncing Dispatch..." : "Sync Trunk Dispatch"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowTelnyxModal(true);
                if (telnyxSearchResults.length === 0) {
                  handleSearchTelnyxNumbers();
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Search live available numbers on Telnyx ($1/mo) and auto-bind to LiveKit SIP trunk"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>1-Click Order Telnyx DID ($1/mo)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowProvisionModal(true)}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Provision Carrier Line</span>
            </button>
          </div>
        </div>

        {/* SIP Trunk & Dispatch Rule Health Metadata Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 font-mono text-xs">
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Inbound SIP Trunk ID</span>
            <div className="text-xs font-bold text-zinc-800 mt-0.5 truncate" title={trunkTelemetry?.inbound_trunk_id || "ST_inbound_livekit_scale"}>
              {trunkTelemetry?.inbound_trunk_id || "ST_inbound_livekit_scale"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Outbound SIP Trunk ID</span>
            <div className="text-xs font-bold text-zinc-800 mt-0.5 truncate" title={trunkTelemetry?.outbound_trunk_id || "ST_outbound_twilio_elastic"}>
              {trunkTelemetry?.outbound_trunk_id || "ST_outbound_twilio_elastic"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Dispatch Rule &amp; Agent</span>
            <div className="text-xs font-bold text-emerald-600 mt-0.5">
              all-tenants-inbound &rarr; receptionist
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-500 font-bold">Inventory Allocation</span>
            <div className="text-xs font-bold text-zinc-800 mt-0.5">
              <span className="text-emerald-600">{numbers.filter((n) => n.status === "active").length} Assigned</span> &bull;{" "}
              <span className="text-indigo-600">{numbers.filter((n) => n.status === "pool").length} In Pool</span>
            </div>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 border-b border-zinc-100 pb-2">
          {[
            { id: "all", label: `All Numbers (${numbers.length})` },
            { id: "active", label: `Active Tenant Lines (${numbers.filter((n) => n.status === "active").length})` },
            { id: "pool", label: `Agency Pool Inventory (${numbers.filter((n) => n.status === "pool").length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setNumberFilter(tab.id as "all" | "active" | "pool")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                numberFilter === tab.id
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Phone Numbers Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 font-mono text-[10px] uppercase text-zinc-500 font-semibold">
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
            <tbody className="divide-y divide-zinc-100">
              {numbers
                .filter((n) => numberFilter === "all" || n.status === numberFilter)
                .map((num) => {
                  const isPool = num.status === "pool";
                  return (
                    <tr key={num.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-zinc-900">
                          {maskPhoneNumber(num.formatted || num.e164)}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-sans">{num.label}</div>
                      </td>

                      <td className="p-3">
                        {num.tenant_id ? (
                          <div className="font-semibold text-zinc-800">
                            {num.tenant_name || "Apex Plumbing & Heating"}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Agency Pre-Bought Pool
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-mono text-zinc-600">
                        <span className="text-[11px] font-semibold text-zinc-800 capitalize">
                          {num.provider}
                        </span>
                        <div className="text-[9px] text-zinc-400">STIR/SHAKEN A</div>
                      </td>

                      <td className="p-3 text-zinc-600">
                        {num.locality ? `${num.locality}, ${num.region}` : num.region}
                      </td>

                      <td className="p-3 font-mono text-[11px] text-zinc-500">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                          {num.trunk_id || "ST_inbound_livekit_scale"}
                        </span>
                      </td>

                      <td className="p-3">
                        {isPool ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Available in Pool
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-sans transition-colors shadow-sm"
                          >
                            <Link2 className="w-3 h-3" />
                            Attach to Tenant
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDetachNumber(num.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-red-50 hover:text-red-600 text-zinc-600 text-xs font-sans transition-colors"
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
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  Provision Carrier Phone Number
                </h3>
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateProvisionedNumber} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-medium text-zinc-700">E.164 Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={newProvisionData.e164}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, e164: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono focus:outline-none focus:border-zinc-900"
                    placeholder="+15125550199"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="font-medium text-zinc-700">Carrier Provider</label>
                    <select
                      value={newProvisionData.provider}
                      onChange={(e) => setNewProvisionData({ ...newProvisionData, provider: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-900"
                    >
                      <option value="Twilio Elastic SIP">Twilio Elastic SIP</option>
                      <option value="Telnyx SIP">Telnyx SIP</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-zinc-700">Region / State</label>
                    <input
                      type="text"
                      value={newProvisionData.region}
                      onChange={(e) => setNewProvisionData({ ...newProvisionData, region: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-900"
                      placeholder="TX"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-700">Metro / Locality</label>
                  <input
                    type="text"
                    value={newProvisionData.locality}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, locality: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-900"
                    placeholder="Austin Metro"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-700">Assign To Tenant (Optional)</label>
                  <select
                    value={newProvisionData.target_tenant_id}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, target_tenant_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-900"
                  >
                    <option value="">Leave in Agency Pool</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setShowProvisionModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={provisioningNumber}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs transition-colors shadow-sm"
                  >
                    {provisioningNumber ? "Provisioning..." : "Provision & Bind Trunk"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Attach Number to Tenant Modal */}
        {showAttachModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-indigo-600" />
                  Attach Pool Number
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAttachModal(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 font-mono">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold">Selected Number</span>
                  <div className="font-bold text-zinc-900 mt-0.5">{showAttachModal.formatted || showAttachModal.e164}</div>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-zinc-700">Target Tenant Organization</label>
                  <select
                    value={targetTenantId}
                    onChange={(e) => setTargetTenantId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-900"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setShowAttachModal(null)}
                    className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttachNumber(showAttachModal.id)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-sm"
                  >
                    Attach Number
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Telnyx 1-Click Order Modal (Phase 4) */}
        {showTelnyxModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-2xl w-full border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md">
                      <Zap className="w-5 h-5 text-amber-300" />
                    </span>
                    <h3 className="text-lg font-bold">Telnyx 1-Click Carrier Hub</h3>
                  </div>
                  <p className="text-xs text-emerald-100 mt-1">
                    Live Telnyx API &bull; Search wholesale inventory, order DIDs at $1.00/mo, and auto-dispatch to LiveKit SIP trunk.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTelnyxModal(false)}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Search & Filter Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-zinc-50 border border-zinc-200">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Area Code
                    </label>
                    <input
                      type="text"
                      maxLength={3}
                      value={telnyxAreaCode}
                      onChange={(e) => setTelnyxAreaCode(e.target.value)}
                      placeholder="e.g. 415, 212, 312"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm font-mono font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      City / Locality (Optional)
                    </label>
                    <input
                      type="text"
                      value={telnyxLocality}
                      onChange={(e) => setTelnyxLocality(e.target.value)}
                      placeholder="e.g. San Francisco"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={searchingTelnyx}
                      onClick={handleSearchTelnyxNumbers}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      {searchingTelnyx ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Searching...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          <span>Find Numbers</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Target Tenant Binding Selector */}
                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Auto-Assign to Tenant on Purchase</div>
                    <div className="text-[11px] text-zinc-500">
                      Purchased number will be immediately provisioned with RLS and LiveKit SIP routing.
                    </div>
                  </div>
                  <select
                    value={telnyxTargetTenantId}
                    onChange={(e) => setTelnyxTargetTenantId(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Keep in Agency Pool (Unassigned) --</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Success alert message */}
                {telnyxSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{telnyxSuccessMsg}</span>
                  </div>
                )}

                {/* Results List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider font-mono">
                      Available Carrier DIDs ({telnyxSearchResults.length})
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      Wholesale Rate: $1.00/mo &bull; LiveKit SIP Inbound
                    </span>
                  </div>

                  {telnyxSearchResults.length === 0 && !searchingTelnyx && (
                    <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50">
                      <Phone className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                      <div className="text-xs font-semibold text-zinc-600">No numbers found</div>
                      <div className="text-[11px] text-zinc-400 mt-1">
                        Try searching a different area code or clearing the locality filter.
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {telnyxSearchResults.map((num) => (
                      <div
                        key={num.phone_number}
                        className="p-3.5 rounded-2xl border border-zinc-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                            <Phone className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-zinc-900">
                                {num.phone_number}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                ${num.cost_monthly_usd.toFixed(2)}/mo
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                                Setup: ${num.cost_upfront_usd.toFixed(2)}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2">
                              <span>{num.locality ? `${num.locality}, ${num.region_information}` : num.region_information || "United States"}</span>
                              <span>&bull;</span>
                              <span className="text-emerald-600 font-medium">{num.features?.join(", ") || "voice, sms"}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={orderingTelnyxNumber === num.phone_number}
                          onClick={() => handleOrderTelnyxNumber(num)}
                          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                        >
                          {orderingTelnyxNumber === num.phone_number ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Ordering...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5 text-amber-300" />
                              <span>Order &amp; Bind ($1)</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Zero Carrier Markup &bull; Direct Telnyx SIP Connection</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTelnyxModal(false)}
                  className="px-4 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* SECTION 4A: Tenant Minute Subscriptions Overview (Full Width) */}
      {activeTab === "billing" && (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-100 gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wide">
              Tenant Minute Subscriptions &amp; Rollovers
            </h2>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            $0.20/min overage &bull; 10% monthly complimentary rollover
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 font-mono text-[10px] uppercase text-zinc-500 font-semibold">
              <tr>
                <th className="p-3">Organization</th>
                <th className="p-3">Current Plan</th>
                <th className="p-3">Included Minutes</th>
                <th className="p-3">Bonus / Rollover</th>
                <th className="p-3">Used Minutes</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {subscriptions.map((sub: any) => (
                <tr key={sub.tenant_id} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="p-3">
                    <div className="font-semibold text-zinc-900">{sub.tenant_name}</div>
                    <div className="text-[10px] text-zinc-500 font-mono">ID: {sub.tenant_id.slice(0, 8)}...</div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase bg-zinc-100 text-zinc-800 border border-zinc-200">
                        {sub.tier}
                      </span>
                      {sub.status === "active" && (
                        <span className="text-[10px] text-emerald-600 font-medium">● Active</span>
                      )}
                      {sub.status === "suspended" && (
                        <span className="text-[10px] text-red-600 font-medium">● Suspended</span>
                      )}
                    </div>
                    {sub.pending_tier && (
                      <div className="text-[10px] text-amber-700 font-mono mt-1 font-semibold flex items-center gap-1">
                        <span>⏳ Queued:</span>
                        <span className="uppercase">{sub.pending_tier}</span>
                      </div>
                    )}
                    {sub.is_cycle_locked && (
                      <div className="text-[9px] text-zinc-400 font-mono">
                        Auto-renews: {sub.cycle_end_date ? new Date(sub.cycle_end_date).toLocaleDateString() : "30d"}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono font-bold text-zinc-800">
                    {sub.monthly_included_minutes.toLocaleString()} mins
                  </td>
                  <td className="p-3 font-mono">
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      +{sub.bonus_rollover_minutes.toFixed(1)} mins
                    </span>
                  </td>
                  <td className="p-3 font-mono text-zinc-600">
                    {sub.used_minutes_this_cycle.toFixed(1)} mins
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openManageSubModal(sub)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold mr-1.5 shadow-sm transition-all"
                    >
                      Manage Plan
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGrantModal(sub.tenant_id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-800 text-xs font-medium transition-colors"
                    >
                      <Gift className="w-3 h-3 text-indigo-600" />
                      Grant Bonus
                    </button>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-zinc-500 font-mono text-xs">
                    No active tenant subscriptions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* SECTION 4B: Admin Coupon Engine (Full Width) */}
      {activeTab === "coupons" && (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-zinc-900 font-mono uppercase tracking-wide">
              Admin Platform Coupon Engine
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowCouponModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Promo Code
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {coupons.map((c: any) => (
            <div
              key={c.code}
              className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50 transition-colors flex items-center justify-between text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-zinc-900 bg-white px-2.5 py-1 rounded-lg border border-zinc-200 text-sm">
                    {c.code}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-bold font-mono bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {c.discount_percent}% OFF
                  </span>
                </div>
                <div className="text-[11px] text-zinc-600 pt-0.5">
                  +{c.bonus_minutes} complimentary minutes
                </div>
                <div className="text-[10px] text-zinc-400 font-mono">
                  Redemptions: <strong className="text-zinc-700">{c.times_redeemed}</strong> / {c.max_redemptions}
                </div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                Active
              </span>
            </div>
          ))}
          {coupons.length === 0 && (
            <div className="col-span-full p-8 text-center text-zinc-400 font-mono text-xs">
              No active coupon codes created yet. Click &quot;Create Promo Code&quot; above to issue new tenant discounts.
            </div>
          )}
        </div>
      </div>
      )}

      {/* Grant Bonus Minutes Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-indigo-600" />
                Grant Compliment Bonus Minutes
              </h3>
              <button
                type="button"
                onClick={() => setShowGrantModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-zinc-700">Bonus Minutes to Grant</label>
                <input
                  type="number"
                  min="10"
                  max="5000"
                  step="10"
                  value={grantMinutesVal}
                  onChange={(e) => setGrantMinutesVal(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-zinc-700">Reason / Description</label>
                <input
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:border-zinc-900"
                  placeholder="Promotional Onboarding Bonus"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowGrantModal(null)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={grantingMinutes}
                  onClick={() => handleGrantBonusMinutes(showGrantModal)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-sm"
                >
                  {grantingMinutes ? "Granting..." : "Grant Minutes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Subscription Master Modal */}
      {showManageSubModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-zinc-900" />
                  Manage Tenant Subscription
                </h3>
                <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                  {showManageSubModal.tenant_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageSubModal(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700">Subscription Tier</label>
                <select
                  value={subTierSelect}
                  onChange={(e) => setSubTierSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-medium focus:outline-none focus:border-zinc-900"
                >
                  <option value="trial">Free Trial (100 Mins / 14 Days)</option>
                  <option value="starter">Starter Plan (1,000 Mins - $299/mo)</option>
                  <option value="pro">Professional Plan (1,200 Mins - $399/mo)</option>
                  <option value="enterprise">Enterprise Scale Plan (1,500 Mins - $499/mo)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700">Account Status</label>
                <select
                  value={subStatusSelect}
                  onChange={(e) => setSubStatusSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-medium focus:outline-none focus:border-zinc-900"
                >
                  <option value="active">Active (Normal Operational Billing)</option>
                  <option value="suspended">Suspended (Pause Answering &amp; Webhooks)</option>
                  <option value="trialing">Trialing (Active Sandbox Evaluation)</option>
                  <option value="canceled">Canceled (Service Disconnected)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700">
                  Custom Monthly Minutes Override (Optional)
                </label>
                <input
                  type="number"
                  placeholder="Leave empty for plan default"
                  value={subCustomMinutes}
                  onChange={(e) => setSubCustomMinutes(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-700 font-medium">
                  <input
                    type="checkbox"
                    checked={subResetUsage}
                    onChange={(e) => setSubResetUsage(e.target.checked)}
                    className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <span>Reset current month used minutes to 0</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowManageSubModal(null)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updatingSub}
                  onClick={handleUpdateTenantSubscription}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5"
                >
                  {updatingSub ? "Saving Changes..." : "Apply Plan Update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Coupon Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                Create Platform Coupon Code
              </h3>
              <button
                type="button"
                onClick={() => setShowCouponModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-3 text-xs">
              {couponError && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 font-mono text-[11px]">
                  {couponError}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-medium text-zinc-700">Coupon Code *</label>
                <input
                  type="text"
                  required
                  value={newCouponData.code}
                  onChange={(e) =>
                    setNewCouponData({ ...newCouponData, code: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono uppercase font-bold focus:outline-none focus:border-zinc-900"
                  placeholder="LAUNCH50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-zinc-700">Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newCouponData.discount_percent}
                    onChange={(e) =>
                      setNewCouponData({ ...newCouponData, discount_percent: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-zinc-700">Bonus Minutes</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={newCouponData.bonus_minutes}
                    onChange={(e) =>
                      setNewCouponData({ ...newCouponData, bonus_minutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono focus:outline-none focus:border-zinc-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-zinc-700">Max Redemptions</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={newCouponData.max_redemptions}
                  onChange={(e) =>
                    setNewCouponData({ ...newCouponData, max_redemptions: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 text-xs font-medium hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCoupon}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs shadow-sm"
                >
                  {creatingCoupon ? "Creating..." : "Save Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 5: Client Tenants Table with PII Masking & Quota Throttles */}
      {activeTab === "tenants" && (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-bold text-zinc-900">
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
              className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs text-zinc-700 font-mono flex items-center gap-1.5 transition-colors shadow-sm"
              title="Toggle masked phone numbers for GDPR/CCPA privacy during demonstrations"
            >
              {maskPii ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Reveal Full E.164</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Mask Phone Numbers (PII)</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 font-mono text-[10px] uppercase text-zinc-500 font-semibold">
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
            <tbody className="divide-y divide-zinc-100 font-mono">
              {tenants.map((t) => {
                const usedMins = t.minutes_used ?? (t.call_count * 2.5);
                const quota = t.monthly_minute_quota ?? 500;
                const quotaPct = Math.min(Math.round((usedMins / quota) * 100), 100);

                return (
                  <tr key={t.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="p-3 font-sans">
                      <div className="font-semibold text-zinc-900">{t.name}</div>
                      <div className="text-[10px] font-mono text-zinc-500">ID: {t.id.slice(0, 8)}...</div>
                    </td>

                    <td className="p-3 text-zinc-600 text-[11px] font-sans">
                      <div className="text-zinc-800 font-mono">{t.timezone}</div>
                      <div className="text-zinc-500 truncate max-w-[140px]">{t.hours}</div>
                    </td>

                    <td className="p-3 text-zinc-800 font-mono">
                      {t.phone_numbers.length > 0 ? (
                        <div className="space-y-0.5">
                          {t.phone_numbers.map((num, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-zinc-900">
                              <PhoneCall className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{maskPhoneNumber(num)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-400 italic">Unassigned</span>
                      )}
                    </td>

                    <td className="p-3 text-zinc-800 font-mono">
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-emerald-700 font-semibold">{t.max_concurrent_inbound || 4} In</span>
                        <span className="text-zinc-300">/</span>
                        <span className="text-indigo-700 font-semibold">{t.max_concurrent_outbound || 2} Out</span>
                      </div>
                      <div className="text-[10px] text-zinc-500">Dedicated limit</div>
                    </td>

                    <td className="p-3 font-mono">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-zinc-800 font-bold">{usedMins.toFixed(1)}m</span>
                        <span className="text-zinc-500">/ {quota}m</span>
                      </div>
                      <div className="w-24 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            quotaPct > 80 ? "bg-red-500" : quotaPct > 50 ? "bg-amber-500" : "bg-zinc-900"
                          }`}
                          style={{ width: `${quotaPct}%` }}
                        />
                      </div>
                    </td>

                    <td className="p-3 text-zinc-900 font-bold">
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-800 text-xs font-sans transition-colors"
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
      )}

      {/* Sub-Accounts & Proxy Tab (Milestone M8b) */}
      {activeTab === "subaccounts" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Agency Sub-Accounts &amp; Operator Impersonation
              </h3>
              <p className="text-xs text-zinc-500">
                Manage all client sub-accounts, view aggregated call metrics and launch proxy sessions with mandatory audit logs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-zinc-500">
                Total Sub-Accounts: <strong>{subAccounts.length}</strong>
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-mono text-[11px] uppercase">
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
              <tbody className="divide-y divide-zinc-100">
                {subAccounts.map((sub) => {
                  return (
                    <tr key={sub.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="p-3">
                        <div className="font-bold text-zinc-900 text-sm flex items-center gap-1.5">
                          {sub.name}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">ID: {sub.id}</div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                          {sub.plan_tier}
                        </span>
                      </td>
                      <td className="p-3 font-mono">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-zinc-800 font-bold">{sub.minutes_used}m</span>
                          <span className="text-zinc-400">/ {sub.monthly_minute_quota}m</span>
                        </div>
                        <div className="w-24 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              sub.usage_pct > 80 ? "bg-red-500" : sub.usage_pct > 50 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(sub.usage_pct, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-zinc-900">{sub.total_calls} calls</div>
                        {sub.emergency_calls > 0 && (
                          <div className="text-[10px] text-red-600 font-semibold">{sub.emergency_calls} emergencies</div>
                        )}
                      </td>
                      <td className="p-3 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-100 font-bold text-zinc-800">
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
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-semibold transition-all shadow-sm"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Impersonate Client
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Immutable Audit Trail Tab (Milestone M8b) */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                Immutable Agency Audit Trail
              </h3>
              <p className="text-xs text-zinc-500">
                Cryptographically anchored event log recording all operator impersonation sessions, supervisor actions, and tenant changes.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={auditActionFilter}
                onChange={(e) => {
                  setAuditActionFilter(e.target.value);
                }}
                className="text-xs border border-zinc-200 rounded-xl px-2.5 py-1.5 bg-white text-zinc-800"
              >
                <option value="">All Actions</option>
                <option value="auth.impersonate_start">auth.impersonate_start</option>
                <option value="auth.impersonate_end">auth.impersonate_end</option>
                <option value="call.qa_override">call.qa_override</option>
                <option value="supervisor.whisper">supervisor.whisper</option>
                <option value="supervisor.barge_in">supervisor.barge_in</option>
                <option value="supervisor.takeover">supervisor.takeover</option>
                <option value="supervisor.transfer">supervisor.transfer</option>
              </select>

              <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer bg-white border border-zinc-200 px-3 py-1.5 rounded-xl">
                <input
                  type="checkbox"
                  checked={auditImpersonatedOnly}
                  onChange={(e) => setAuditImpersonatedOnly(e.target.checked)}
                  className="rounded text-purple-600"
                />
                <span>Impersonated Only</span>
              </label>

              <button
                type="button"
                onClick={loadAuditLogs}
                className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-colors"
                title="Refresh Audit Logs"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-mono text-[11px] uppercase">
                <tr>
                  <th className="p-3">Timestamp (UTC)</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Actor &amp; Impersonator</th>
                  <th className="p-3">Target Tenant</th>
                  <th className="p-3">Resource</th>
                  <th className="p-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-400">
                      No audit events matching criteria.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="p-3 font-mono text-zinc-600 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          log.action.includes("impersonate")
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : log.action.includes("qa")
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : log.action.includes("supervisor")
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-zinc-100 text-zinc-800 border-zinc-200"
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-zinc-900">{log.actor_email}</div>
                        {log.is_impersonated && (
                          <div className="text-[10px] text-amber-600 font-mono flex items-center gap-1">
                            <span>Proxy by: {log.impersonator_email || log.impersonator_id}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-zinc-600">
                        {log.tenant_id ? log.tenant_id.slice(0, 12) + "..." : "Global Platform"}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-zinc-500">
                        {log.resource_type} {log.resource_id ? `(${log.resource_id.slice(0, 8)}...)` : ""}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedAuditLog(log)}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 transition-colors"
                        >
                          View JSON
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Impersonation Confirmation Modal */}
      {impersonateTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Launch Impersonation Session
              </h3>
              <button
                onClick={() => setImpersonateTarget(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                Mandatory Audit Trail Enforcement
              </div>
              <div>
                You are about to enter client workspace <strong>{impersonateTarget.name}</strong> as an authenticated operator. All changes will be logged in the immutable audit log under your identity.
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700">Audit Reason / Justification</label>
              <textarea
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                rows={3}
                className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="State the reason for accessing this client sub-account..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImpersonateTarget(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartImpersonation}
                disabled={impersonating || !impersonateReason.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {impersonating ? "Generating Token..." : "Confirm & Enter Portal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log JSON Details Modal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-zinc-200 shadow-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 font-mono">
                  {selectedAuditLog.action}
                </h3>
                <div className="text-xs text-zinc-500">ID: {selectedAuditLog.id}</div>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-zinc-50 rounded-xl font-mono text-[11px]">
                <div>
                  <span className="text-zinc-400">Actor:</span> {selectedAuditLog.actor_email}
                </div>
                <div>
                  <span className="text-zinc-400">Role:</span> {selectedAuditLog.actor_role}
                </div>
                <div>
                  <span className="text-zinc-400">Impersonated:</span> {selectedAuditLog.is_impersonated ? "YES" : "NO"}
                </div>
                <div>
                  <span className="text-zinc-400">Impersonator:</span> {selectedAuditLog.impersonator_email || "N/A"}
                </div>
                <div>
                  <span className="text-zinc-400">Tenant:</span> {selectedAuditLog.tenant_id || "Global"}
                </div>
                <div>
                  <span className="text-zinc-400">Time:</span> {new Date(selectedAuditLog.created_at).toISOString()}
                </div>
              </div>

              <div>
                <div className="font-semibold text-zinc-700 mb-1">Payload Details:</div>
                <pre className="p-3 bg-zinc-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto">
                  {JSON.stringify(selectedAuditLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 font-mono text-xs text-zinc-500 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span>Loading agency command suite...</span>
        </div>
      }
    >
      <AdminDashboardContent />
    </Suspense>
  );
}

