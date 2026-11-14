/**
 * Typed API client for VedaVoice FastAPI backend.
 */

const API_BASE = ""; // Relative path to use Next.js rewrites to http://localhost:8000

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: "platform_admin" | "tenant_owner" | "tenant_manager" | "tenant_staff";
  tenant_id: string | null;
  tenant_name: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface CallListItem {
  id: string;
  call_id: string;
  caller_number: string;
  dialed_number: string;
  started_at: string;
  duration_s: number;
  outcome: string;
  urgency: string;
  turn_count: number;
  latency_p50_ms: number;
  caller_name: string | null;
  service_address: string | null;
}

export interface CallDetail {
  id: string;
  call_id: string;
  caller_number: string;
  dialed_number: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number;
  outcome: string;
  urgency: string;
  turn_count: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  turn_latencies_ms: number[];
  transcript: Array<{ role: string; text: string; time: string }>;
  message: {
    name?: string;
    phone?: string;
    message?: string;
    urgency?: string;
    address?: string;
    phone_confirmed?: boolean;
  } | null;
  tags: string[];
}

export interface SubscriptionCurrent {
  id: string;
  tenant_id: string;
  tier: "trial" | "starter" | "pro" | "enterprise";
  status: "trialing" | "active" | "past_due" | "canceled";
  monthly_included_minutes: number;
  bonus_rollover_minutes: number;
  used_minutes_this_cycle: number;
  total_limit_minutes: number;
  remaining_minutes: number;
  overage_rate_usd: number;
  allow_overage: boolean;
  is_trial: boolean;
  trial_days: number;
  trial_ends_at: string | null;
  trial_expired: boolean;
  trial_minutes_allocated: number;
  trial_minutes_used: number;
  cycle_start_date: string;
  cycle_end_date: string;
  auto_renew?: boolean;
  is_cycle_locked?: boolean;
  cycle_change_locked_until?: string | null;
  pending_tier?: string | null;
  pending_effective_at?: string | null;
  applied_coupon_code: string | null;
  available_plans: Array<{
    tier: string;
    name: string;
    minutes: number;
    price_usd: number;
    overage_usd: number;
  }>;
}

export interface LeadFormField {
  name: string;
  label: string;
  type: "text" | "tel" | "email" | "select" | "textarea";
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface LeadFormItem {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  fields: LeadFormField[];
  submit_action: "call_triage" | "log_only";
  is_active: boolean;
  total_leads_captured: number;
  created_at: string;
}

export interface CapturedLead {
  id: string;
  form_id: string | null;
  caller_name: string;
  caller_phone: string;
  urgency: string;
  service_requested: string | null;
  service_address: string | null;
  custom_data: Record<string, any>;
  status: "pending" | "contacted" | "dispatched" | "converted";
  outbound_call_triggered: boolean;
  created_at: string;
}

export interface TenantDashboardStats {
  total_calls: number;
  emergency_calls: number;
  messages_taken: number;
  median_latency_ms: number;
  tenant_name: string;
  phone_numbers: string[];
}

export interface PhoneticEntry {
  term: string;
  spoken_as: string;
  note?: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  category?: string;
  alternate_phrasings?: string[];
}

export interface PriceItem {
  service: string;
  amount: string;
  type?: "fixed" | "range";
  conditions?: string;
}

export interface AgentProfile {
  business_name: string;
  agent_name?: string;
  timezone: string;
  hours: string;
  greeting: string;
  tone: string;
  voice_id?: string;
  recording_disclosure?: boolean;
  phonetic_glossary?: PhoneticEntry[];
  services: string[];
  pricing_policy: string;
  pricing_mode?: "no_quote" | "listed" | "range";
  price_items?: (string | PriceItem)[];
  pricing_details?: Record<string, any>;
  faq: FAQItem[];
  emergency_mode?: "priority_message" | "live_transfer" | "hybrid";
  emergency_keywords: string[];
  emergency_advice: string;
  approved_safety_script?: string;
  transfer_number: string;
  service_area?: string;
  service_cities?: string[];
  after_hours_policy?: "take_message_all" | "emergency_only" | "informational_only";
  out_of_area_policy?: "polite_decline" | "strict_decline" | "travel_surcharge";
}

export interface AvailableNumberItem {
  e164: string;
  formatted: string;
  region: string;
  locality: string;
  provider: string;
  monthly_cost_usd: number;
  capabilities: string[];
  source: "carrier_api" | "agency_pool";
}

export interface CarrierTrunkHealth {
  provider: string;
  status: string;
  latency_ms: number;
  jitter_ms: number;
  mos_score: number;
  cps_current: number;
  cps_limit: number;
  packet_loss_pct: number;
  codecs: string[];
}

export interface PhoneNumberRecord {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  e164: string;
  formatted: string;
  provider: string;
  purpose: string;
  label: string;
  locality: string;
  region: string;
  trunk_id: string;
  status: "active" | "pool" | "released";
  monthly_cost_usd: number;
  created_at: string;
}

export interface SipTrunkTelemetry {
  inbound_trunk_id: string;
  outbound_trunk_id: string;
  dispatch_rule_name: string;
  room_prefix: string;
  agent_name: string;
  total_bound_numbers: number;
  active_tenant_numbers: number;
  pool_available_numbers: number;
  primary_carrier: CarrierTrunkHealth;
  standby_carrier: CarrierTrunkHealth;
  sync_status: string;
  last_synced_at: string;
}

export interface SyncTrunkResult {
  synced: boolean;
  dispatch_rule: string;
  inbound_trunk_id: string;
  total_numbers_bound: number;
  bindings: string[];
  message: string;
}

export interface InferenceCostMetrics {
  cost_livekit_per_min: number;
  cost_deepgram_per_min: number;
  cost_gemini_per_min: number;
  cost_tts_per_min: number;
  total_cogs_per_min: number;
  total_billable_minutes: number;
  est_telephony_cost_usd: number;
  tenant_subscription_fee_usd: number;
  est_monthly_revenue_usd: number;
  gross_margin_pct: number;
}

export interface PlatformStats {
  total_tenants: number;
  total_calls: number;
  emergency_calls: number;
  avg_latency_p50_ms: number;
  active_phone_numbers: number;
  // Concurrency Telemetry
  global_max_concurrent: number;
  active_inbound_calls: number;
  inbound_saturation_pct: number;
  global_max_outbound: number;
  active_outbound_calls: number;
  outbound_saturation_pct: number;
  // Carrier SIP Trunk Health
  carrier_health?: CarrierTrunkHealth;
  // Cost & Margin Intelligence
  cost_metrics?: InferenceCostMetrics;
}

export interface TenantSummary {
  id: string;
  name: string;
  timezone: string;
  hours: string;
  status: string;
  created_at: string;
  phone_numbers: string[];
  call_count: number;
  emergency_count: number;
  max_concurrent_inbound?: number;
  max_concurrent_outbound?: number;
  monthly_minute_quota?: number;
  minutes_used?: number;
  health_status?: string;
}

function getAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("vedavoice_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (Array.isArray(errJson.detail)) {
        errorDetail = errJson.detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join(", ");
      } else if (typeof errJson.detail === "string") {
        errorDetail = errJson.detail;
      } else if (errJson.message) {
        errorDetail = errJson.message;
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  registerTenant: (data: {
    business_name: string;
    owner_name: string;
    email: string;
    password: string;
    timezone?: string;
    hours?: string;
    niche?: string;
    phone_number?: string;
    voice_id?: string;
    agent_name?: string;
    greeting?: string;
    tone?: string;
    recording_disclosure?: boolean;
    pricing_policy?: string;
    diagnostic_fee?: string;
    services?: string[];
    emergency_advice?: string;
    emergency_keywords?: string[];
    faq?: Array<{ question: string; answer: string }>;
  }) =>
    request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getMe: () => request<UserProfile>("/api/v1/auth/me"),

  // Tenant Portal
  getPortalDashboard: () => request<TenantDashboardStats>("/api/v1/portal/dashboard"),

  getPortalCalls: (params?: { urgency?: string; outcome?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.urgency) q.append("urgency", params.urgency);
    if (params?.outcome) q.append("outcome", params.outcome);
    if (params?.limit) q.append("limit", params.limit.toString());
    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return request<CallListItem[]>(`/api/v1/portal/calls${queryStr}`);
  },

  getPortalCallDetail: (callId: string) =>
    request<CallDetail>(`/api/v1/portal/calls/${callId}`),

  getPortalProfile: () => request<AgentProfile>("/api/v1/portal/profile"),

  updatePortalProfile: (data: Partial<AgentProfile>) =>
    request<AgentProfile>("/api/v1/portal/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Platform Admin
  getAdminStats: () => request<PlatformStats>("/api/v1/admin/stats"),

  getAdminTenants: () => request<TenantSummary[]>("/api/v1/admin/tenants"),

  searchAvailableNumbers: (areaCode?: string, mode?: "carrier_search" | "agency_pool") => {
    const q = new URLSearchParams();
    if (areaCode) q.append("area_code", areaCode);
    if (mode) q.append("mode", mode);
    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return request<AvailableNumberItem[]>(`/api/v1/numbers/search${queryStr}`);
  },

  createAdminTenant: (data: {
    name: string;
    owner_name: string;
    owner_email: string;
    owner_password: string;
    timezone?: string;
    hours?: string;
    phone_number?: string;
    voice_id?: string;
    recording_disclosure?: boolean;
    greeting?: string;
    tone?: string;
    pricing_policy?: string;
    services?: string[];
    emergency_keywords?: string[];
    emergency_advice?: string;
  }) =>
    request<TenantSummary>("/api/v1/admin/tenants", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Automated Phone Number Inventory & SIP Trunk Binding
  getNumbers: (params?: { status?: string; provider?: string; tenant_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append("status", params.status);
    if (params?.provider) q.append("provider", params.provider);
    if (params?.tenant_id) q.append("tenant_id", params.tenant_id);
    const queryStr = q.toString() ? `?${q.toString()}` : "";
    return request<PhoneNumberRecord[]>(`/api/v1/numbers${queryStr}`);
  },

  provisionNumber: (data: {
    e164: string;
    provider?: string;
    purpose?: string;
    label?: string;
    locality?: string;
    region?: string;
    tenant_id?: string;
    trunk_id?: string;
  }) =>
    request<PhoneNumberRecord>("/api/v1/numbers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  attachNumber: (numberId: string, data: { tenant_id?: string; label?: string; trunk_id?: string }) =>
    request<PhoneNumberRecord>(`/api/v1/numbers/${numberId}/attach`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  detachNumber: (numberId: string, releaseToPool = true) =>
    request<PhoneNumberRecord>(`/api/v1/numbers/${numberId}/detach?release_to_pool=${releaseToPool}`, {
      method: "POST",
    }),

  getSipTrunkTelemetry: () => request<SipTrunkTelemetry>("/api/v1/numbers/trunks"),

  syncSipTrunkDispatchRules: () =>
    request<SyncTrunkResult>("/api/v1/numbers/trunks/sync", {
      method: "POST",
    }),

  // Minute-Based Stripe Subscriptions & Rollovers
  getSubscriptionCurrent: () => request<SubscriptionCurrent>("/api/v1/subscriptions/current"),

  upgradeSubscription: (tier: string, coupon_code?: string) =>
    request<any>("/api/v1/subscriptions/upgrade", {
      method: "POST",
      body: JSON.stringify({ tier, coupon_code }),
    }),

  validateCoupon: (code: string) =>
    request<{ valid: boolean; code: string; discount_percent: number; bonus_minutes: number }>(
      `/api/v1/subscriptions/coupons/validate?code=${encodeURIComponent(code)}`,
      { method: "POST" }
    ),

  cycleRenewSubscription: () =>
    request<any>("/api/v1/subscriptions/cycle-renew", {
      method: "POST",
    }),

  getStripeCustomerPortalUrl: () =>
    request<{ url: string; message: string }>("/api/v1/subscriptions/customer-portal", {
      method: "POST",
    }),

  getTenantInvoices: () => request<any[]>("/api/v1/subscriptions/invoices"),

  // Multi-Tenant Lead Form Builder & Leads Inbox
  getLeadForms: () => request<LeadFormItem[]>("/api/v1/forms"),

  createLeadForm: (data: {
    title: string;
    description: string;
    fields: LeadFormField[];
    submit_action?: string;
  }) =>
    request<LeadFormItem>("/api/v1/forms", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteLeadForm: (formId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/forms/${formId}`, {
      method: "DELETE",
    }),

  getCapturedLeads: () => request<CapturedLead[]>("/api/v1/forms/leads/all"),

  updateLeadStatus: (leadId: string, status: string) =>
    request<{ success: boolean; lead_id: string; status: string }>(
      `/api/v1/forms/leads/${leadId}/status`,
      {
        method: "POST",
        body: JSON.stringify({ status }),
      }
    ),

  // Platform Admin Subscriptions & Coupons
  getAdminSubscriptions: () => request<any[]>("/api/v1/admin/subscriptions"),
  getAdminCoupons: () => request<any[]>("/api/v1/admin/coupons"),
  createAdminCoupon: (data: {
    code: string;
    discount_percent: number;
    bonus_minutes: number;
    max_uses?: number;
  }) =>
    request<any>("/api/v1/admin/coupons", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  grantAdminMinutes: (tenantId: string, minutes: number, reason = "Promotional Bonus") =>
    request<any>(
      `/api/v1/admin/subscriptions/${tenantId}/grant-minutes?minutes=${minutes}&reason=${encodeURIComponent(
        reason
      )}`,
      { method: "POST" }
    ),
  updateAdminSubscriptionTier: (
    tenantId: string,
    tier: string,
    customMinutes?: number,
    resetUsage = false
  ) =>
    request<any>(`/api/v1/admin/subscriptions/${tenantId}/tier`, {
      method: "PUT",
      body: JSON.stringify({ tier, custom_minutes: customMinutes, reset_usage: resetUsage }),
    }),
  updateAdminSubscriptionStatus: (tenantId: string, status: string, reason?: string) =>
    request<any>(`/api/v1/admin/subscriptions/${tenantId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason }),
    }),
  updateAdminSubscriptionLimits: (
    tenantId: string,
    monthlyIncludedMinutes: number,
    overageRateUsd = 0.2,
    allowOverage = true
  ) =>
    request<any>(`/api/v1/admin/subscriptions/${tenantId}/limits`, {
      method: "PUT",
      body: JSON.stringify({
        monthly_included_minutes: monthlyIncludedMinutes,
        overage_rate_usd: overageRateUsd,
        allow_overage: allowOverage,
      }),
    }),
};
