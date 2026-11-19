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
  is_impersonated?: boolean;
  impersonator_id?: string | null;
  impersonator_email?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface TestCallSessionResponse {
  room_name: string;
  livekit_url: string;
  token: string;
  playground_url: string;
  call_id: string;
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
  sentiment_label?: string;
  lead_score?: number;
  lost_reason?: string | null;
  qa_score?: number;
  qa_flags?: string[];
  csat_score?: number;
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
  recording_url?: string | null;
  sentiment_score?: number;
  sentiment_label?: string;
  lead_score?: number;
  lost_reason?: string | null;
  key_objections?: string[];
  supervisor_whispers?: Array<{
    timestamp: string;
    supervisor_email: string;
    instruction: string;
  }>;
  barge_in_active?: boolean;
  takeover_active?: boolean;
  transfer_to_number?: string | null;
  transferred_at?: string | null;
  qa_score?: number;
  qa_rubric?: Record<string, any>;
  qa_flags?: string[];
  csat_score?: number;
  csat_rationale?: string | null;
  qa_reviewed_by?: string | null;
  qa_reviewed_at?: string | null;
}

export interface QAScorecard {
  call_id: string;
  qa_score: number;
  qa_status: "passed" | "satisfactory" | "needs_review" | "failed";
  qa_flags: string[];
  is_critical_failure: boolean;
  csat_score: number;
  csat_rationale?: string | null;
  rubric_breakdown: Record<string, any>;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface TenantQAAnalytics {
  total_evaluated_calls: number;
  average_qa_score: number;
  average_csat_score: number;
  qa_pass_rate_pct: number;
  critical_failures_count: number;
  top_flags: Array<{ flag: string; count: number; percentage: number }>;
}

export interface LiveActiveCallItem {
  id: string;
  call_id: string;
  caller_number: string;
  dialed_number: string;
  started_at: string;
  elapsed_duration_s: number;
  outcome: string;
  urgency: string;
  turn_count: number;
  latest_user_utterance: string | null;
  latest_agent_utterance: string | null;
  whisper_count: number;
  supervisor_whispers: Array<{
    timestamp: string;
    supervisor_email: string;
    instruction: string;
  }>;
  barge_in_active?: boolean;
  takeover_active?: boolean;
}

export interface SubscriptionCurrent {
  id: string;
  tenant_id: string;
  tier: "trial" | "starter" | "growth" | "pro" | "scale" | "enterprise" | "agency" | string;
  status: "trialing" | "active" | "past_due" | "canceled";
  monthly_included_minutes: number;
  bonus_rollover_minutes: number;
  used_minutes_this_cycle: number;
  total_limit_minutes: number;
  remaining_minutes: number;
  overage_rate_usd: number;
  allow_overage: boolean;
  billing_increment?: "minute" | "second";
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
    locations_max?: number;
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

export interface TelnyxNumberItem {
  phone_number: string;
  national_format: string;
  region_information: string;
  locality: string;
  country_code: string;
  cost_monthly_usd: number;
  cost_upfront_usd: number;
  features: string[];
  provider: string;
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

export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  stage: string;
  tags: string[];
  lead_score: number;
  is_callable?: boolean;
  last_contact_at: string;
  call_count: number;
}

export interface ContactsListResponse {
  total: number;
  limit: number;
  offset: number;
  contacts: ContactItem[];
}

export interface ContactCallSummary {
  call_id: string;
  direction: string;
  duration_s: number;
  billable_minutes: number;
  outcome: string;
  urgency: string;
  sentiment_label: string;
  sentiment_score: number;
  recording_url: string | null;
  summary: string;
  transcript: Array<{ role: string; text: string; time?: string }>;
  ai_voice_disclosed?: boolean;
  recording_disclosed?: boolean;
  started_at: string;
}

export interface ContactTimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface ContactDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  stage: string;
  tags: string[];
  lead_score: number;
  notes: string;
  is_callable?: boolean;
  custom_fields: Record<string, any>;
  first_contact_at: string;
  last_contact_at: string;
  calls: ContactCallSummary[];
  timeline: ContactTimelineEvent[];
}

export interface PipelineStageDefinition {
  id: string;
  stage_key: string;
  label: string;
  color: string;
  order_index: number;
  is_system: boolean;
}

export interface PipelineStagesResponse {
  stages: Record<string, ContactItem[]>;
  stage_definitions?: PipelineStageDefinition[];
  counts: Record<string, number>;
  total: number;
}

export interface ConsentAuditItem {
  id: string;
  category: string;
  method: string;
  ai_voice_disclosed: boolean;
  seller_name: string;
  form_url: string | null;
  ip: string | null;
  created_at: string;
  retention_until: string | null;
  is_revoked: boolean;
  revoked_at: string | null;
  revoked_via: string | null;
}

export interface ContactConsentAudit {
  contact_id: string;
  phone: string;
  is_callable: boolean;
  tenant_suppressed: boolean;
  platform_suppressed: boolean;
  suppression_reason: string | null;
  consents: ConsentAuditItem[];
  audit_export_url: string;
}

export interface DuplicateContactGroup {
  match_type: "email" | "phone";
  match_value: string;
  contacts: ContactItem[];
}

export interface RevenueRecoveredAnalytics {
  average_deal_value: number;
  booked_count: number;
  won_count: number;
  total_conversions: number;
  ai_booked_calls: number;
  total_revenue_recovered: number;
  pipeline_breakdown: Record<string, { label: string; count: number; estimated_value: number }>;
}

export interface EmailCampaignItem {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  trigger_event: string;
  target_stage: string | null;
  status: string;
  sent_count: number;
  created_at: string;
}

export interface CRMIntegrationItem {
  id: string;
  provider: "hubspot" | "zoho" | "gohighlevel" | "pipedrive" | string;
  is_active?: boolean;
  status?: string;
  type?: "oauth2" | "api_key";
  account_id?: string;
  sync_contacts?: boolean;
  sync_calls?: boolean;
  last_synced_at?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  credentials_masked?: Record<string, string>;
  created_at: string;
}

export interface WebhookSubscriptionItem {
  id: string;
  target_url: string;
  event_type: string;
  is_active: boolean;
  secret_masked: string;
  created_at: string;
}

export interface CSVUploadResult {
  success: boolean;
  total_rows: number;
  imported_contacts: number;
  suppressed_skipped: number;
  invalid_phone_skipped: number;
  duplicate_skipped: number;
  outbound_calls_queued: number;
  sample_imported: Array<{ name: string; phone: string }>;
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

  createTestCallSession: () =>
    request<TestCallSessionResponse>("/api/v1/portal/calls/test-session", {
      method: "POST",
    }),

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

  searchTelnyxNumbers: (areaCode?: string, locality?: string, countryCode = "US", limit = 8) => {
    const q = new URLSearchParams();
    if (areaCode) q.append("area_code", areaCode);
    if (locality) q.append("locality", locality);
    q.append("country_code", countryCode);
    q.append("limit", limit.toString());
    return request<TelnyxNumberItem[]>(`/api/v1/numbers/carrier/telnyx/search?${q.toString()}`);
  },

  orderTelnyxNumber: (data: {
    phone_number: string;
    tenant_id?: string;
    label?: string;
    locality?: string;
    region?: string;
  }) =>
    request<PhoneNumberRecord>("/api/v1/numbers/carrier/telnyx/order", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  sendTelnyxSMS: (data: { from_number: string; to_number: string; text: string }) =>
    request<{ message_id: string; status: string; parts: number; cost_usd: number }>(
      "/api/v1/numbers/carrier/telnyx/sms",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

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

  checkSubscriptionDowngrade: (targetTier: string) =>
    request<{
      allowed: boolean;
      target_plan: string;
      excess_resources: Array<{
        resource: string;
        current: number;
        target_max: number;
        message: string;
      }>;
    }>(`/api/v1/subscriptions/check-downgrade?target_tier=${encodeURIComponent(targetTier)}`),

  updateBillingMode: (billing_increment: "minute" | "second") =>
    request<any>("/api/v1/subscriptions/billing-mode", {
      method: "PATCH",
      body: JSON.stringify({ billing_increment }),
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

  // Native CRM & Visual Pipeline Board
  getCRMContacts: (stage?: string, search?: string) => {
    const params = new URLSearchParams();
    if (stage) params.set("stage", stage);
    if (search) params.set("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<ContactsListResponse>(`/api/v1/crm/contacts${query}`);
  },

  getCRMPipeline: () => request<PipelineStagesResponse>("/api/v1/crm/pipeline"),

  getCRMContactDetail: (id: string) => request<ContactDetail>(`/api/v1/crm/contacts/${id}`),

  createCRMContact: (data: {
    name: string;
    phone: string;
    email?: string;
    source?: string;
    stage?: string;
    tags?: string[];
    notes?: string;
    custom_fields?: Record<string, any>;
  }) =>
    request<{ success: boolean; id: string; name: string; phone: string }>("/api/v1/crm/contacts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCRMContact: (
    id: string,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      stage?: string;
      tags?: string[];
      notes?: string;
      lead_score?: number;
      custom_fields?: Record<string, any>;
    }
  ) =>
    request<{ success: boolean; id: string; stage?: string; tags?: string[] }>(
      `/api/v1/crm/contacts/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  deleteCRMContact: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/crm/contacts/${id}`, {
      method: "DELETE",
    }),

  // FR-CRM-11: Configurable Pipeline Stages
  getCRMStages: () => request<PipelineStageDefinition[]>("/api/v1/crm/stages"),

  createCRMStage: (data: {
    stage_key: string;
    label: string;
    color?: string;
    order_index?: number;
  }) =>
    request<PipelineStageDefinition>("/api/v1/crm/stages", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  reorderCRMStages: (stage_keys: string[]) =>
    request<PipelineStageDefinition[]>("/api/v1/crm/stages/reorder", {
      method: "PUT",
      body: JSON.stringify({ stage_keys }),
    }),

  deleteCRMStage: (stage_key: string, reassign_to?: string) =>
    request<{ success: boolean; message: string }>(
      reassign_to
        ? `/api/v1/crm/stages/${stage_key}?reassign_to=${encodeURIComponent(reassign_to)}`
        : `/api/v1/crm/stages/${stage_key}`,
      {
        method: "DELETE",
      }
    ),

  // FR-CRM-13: Contact Deduplication & Merge
  getCRMDuplicates: () => request<DuplicateContactGroup[]>("/api/v1/crm/contacts/duplicates"),

  mergeCRMContacts: (
    target_id: string,
    data: {
      source_id: string;
      preferred_name?: string;
      preferred_email?: string;
      preferred_notes?: string;
    }
  ) =>
    request<{
      success: boolean;
      survivor_id: string;
      name: string;
      phone: string;
      tags: string[];
      calls_reassigned: number;
      events_reassigned: number;
    }>(`/api/v1/crm/contacts/${target_id}/merge`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // FR-CRM-14: Consent Evidentiary Audit Panel
  getCRMConsentAudit: (contact_id: string) =>
    request<ContactConsentAudit>(`/api/v1/crm/contacts/${contact_id}/consent-audit`),

  // FR-CRM-16: CSV Import with Consent Attestation
  importCRMContactsCSV: (data: {
    rows: any[];
    consent_attestation: boolean;
    default_category?: string;
    source?: string;
  }) =>
    request<{
      success: boolean;
      imported: number;
      callable: number;
      non_callable: number;
      errors: string[];
    }>("/api/v1/crm/contacts/import-csv", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // FR-CRM-18: Revenue Recovered Analytics & Configuration
  getCRMRevenueAnalytics: () =>
    request<RevenueRecoveredAnalytics>("/api/v1/crm/analytics/revenue-recovered"),

  updateCRMRevenueSettings: (average_deal_value: number) =>
    request<{ success: boolean; average_deal_value: number; message: string }>(
      "/api/v1/crm/settings/revenue",
      {
        method: "PATCH",
        body: JSON.stringify({ average_deal_value }),
      }
    ),

  // Email Campaigns & Sequences
  getCRMCampaigns: () => request<EmailCampaignItem[]>("/api/v1/crm/campaigns"),

  createCRMCampaign: (data: {
    name: string;
    subject: string;
    body_html: string;
    trigger_event?: string;
    target_stage?: string;
  }) =>
    request<{ success: boolean; id: string; name: string; subject: string }>(
      "/api/v1/crm/campaigns",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  sendCRMCampaign: (campaignId: string) =>
    request<{ success: boolean; campaign_id: string; sent_count: number; message: string }>(
      `/api/v1/crm/campaigns/${campaignId}/send`,
      {
        method: "POST",
      }
    ),

  // Outbound CRM Integrations & Webhooks
  getCRMIntegrations: () => request<CRMIntegrationItem[]>("/api/v1/integrations/crm"),

  getHubSpotAuthUrl: () =>
    request<{ success: boolean; provider: string; authorization_url: string }>(
      "/api/v1/integrations/hubspot/connect"
    ),

  getGHLAuthUrl: () =>
    request<{ success: boolean; provider: string; authorization_url: string }>(
      "/api/v1/integrations/gohighlevel/connect"
    ),

  getPipedriveAuthUrl: () =>
    request<{ success: boolean; provider: string; authorization_url: string }>(
      "/api/v1/integrations/pipedrive/connect"
    ),

  getOutboxDashboard: () =>
    request<{
      counts: { queued: number; in_progress: number; done: number; failed: number; dead: number };
      recent_jobs: Array<{
        id: string;
        entity: string;
        op: string;
        status: string;
        attempt: number;
        last_error: string | null;
        created_at: string;
      }>;
    }>("/api/v1/integrations/outbox"),

  retryDeadLetterJobs: () =>
    request<{ success: boolean; requeued_count: number; message: string }>(
      "/api/v1/integrations/outbox/retry-dead",
      { method: "POST" }
    ),

  triggerOutboxBatch: () =>
    request<{ success: boolean; results: any }>("/api/v1/integrations/outbox/process", {
      method: "POST",
    }),

  testCRMSync: (provider: string) =>
    request<{ success: boolean; message: string }>(
      `/api/v1/integrations/crm/${provider}/test-sync`,
      { method: "POST" }
    ),

  connectCRM: (data: {
    provider: string;
    credentials: Record<string, string>;
    sync_contacts?: boolean;
    sync_calls?: boolean;
  }) =>
    request<{ success: boolean; provider: string; message: string }>(
      "/api/v1/integrations/crm/connect",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  disconnectCRM: (provider: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/integrations/crm/${provider}`, {
      method: "DELETE",
    }),

  getWebhooks: () => request<WebhookSubscriptionItem[]>("/api/v1/integrations/webhooks"),

  createWebhook: (data: { target_url: string; secret: string; event_type?: string }) =>
    request<{ success: boolean; id: string; target_url: string }>(
      "/api/v1/integrations/webhooks",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  deleteWebhook: (webhookId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/integrations/webhooks/${webhookId}`, {
      method: "DELETE",
    }),

  uploadLeadsCSV: (csvText: string, autoDial = false) =>
    request<CSVUploadResult>(`/api/v1/leads/csv-upload?auto_dial=${autoDial}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
      },
      body: csvText,
    }),

  // Supervisor Copilot Real-Time Monitoring & Whispers
  getLiveActiveCalls: () => request<LiveActiveCallItem[]>("/api/v1/portal/copilot/active-calls"),

  sendSupervisorWhisper: (callId: string, instruction: string) =>
    request<{
      status: string;
      call_id: string;
      whisper: { timestamp: string; supervisor_email: string; instruction: string };
      total_whispers: number;
    }>(`/api/v1/portal/calls/${callId}/whisper`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),

  getSupervisionToken: (callId: string) =>
    request<{
      status: string;
      token: string;
      livekit_url: string;
      room_name: string;
      identity: string;
    }>(`/api/v1/portal/calls/${callId}/supervision-token`, {
      method: "POST",
    }),

  bargeInCall: (callId: string, active?: boolean) =>
    request<{
      status: string;
      action: string;
      data: any;
    }>(`/api/v1/portal/calls/${callId}/barge-in`, {
      method: "POST",
      body: JSON.stringify(active !== undefined ? { active } : {}),
    }),

  takeoverCall: (callId: string) =>
    request<{
      status: string;
      action: string;
      data: any;
    }>(`/api/v1/portal/calls/${callId}/takeover`, {
      method: "POST",
    }),

  transferCall: (callId: string, transfer_to: string, reason = "supervisor_manual_transfer") =>
    request<{
      status: string;
      action: string;
      data: any;
    }>(`/api/v1/portal/calls/${callId}/transfer`, {
      method: "POST",
      body: JSON.stringify({ transfer_to, reason }),
    }),

  endCall: (callId: string) =>
    request<{
      status: string;
      call_id: string;
      message: string;
    }>(`/api/v1/portal/calls/${callId}/end`, {
      method: "POST",
    }),

  // Automated Post-Call QA & Call Scoring (Milestone M7b)
  getCallQAScorecard: (callId: string) =>
    request<QAScorecard>(`/api/v1/portal/calls/${callId}/qa`),

  overrideCallQAScore: (
    callId: string,
    payload: { qa_score: number; csat_score?: number; review_note?: string; resolve_flags?: boolean }
  ) =>
    request<{
      status: string;
      call_id: string;
      qa_score: number;
      csat_score: number;
      qa_reviewed_by: string;
      qa_reviewed_at: string;
    }>(`/api/v1/portal/calls/${callId}/qa/override`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getTenantQAAnalytics: () =>
    request<TenantQAAnalytics>("/api/v1/portal/analytics/qa"),

  // Agency Sub-Accounts & Impersonation (Milestone M8b)
  getAgencySubAccounts: () =>
    request<AgencySubAccount[]>("/api/v1/agency/sub-accounts"),

  getAgencySubAccountSummary: (tenantId: string) =>
    request<AgencySubAccount>(`/api/v1/agency/sub-accounts/${tenantId}/summary`),

  impersonateSubAccount: async (tenantId: string, reason = "support_troubleshooting") => {
    if (typeof window !== "undefined") {
      const currentToken = localStorage.getItem("vedavoice_token");
      if (currentToken) {
        localStorage.setItem("vedavoice_admin_token", currentToken);
      }
    }
    const res = await request<ImpersonationResponse>(
      `/api/v1/agency/sub-accounts/${tenantId}/impersonate`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      }
    );
    if (typeof window !== "undefined") {
      localStorage.setItem("vedavoice_token", res.access_token);
    }
    return res;
  },

  exitImpersonation: async () => {
    try {
      await request<{ status: string }>("/api/v1/agency/sub-accounts/impersonate/exit", {
        method: "POST",
      });
    } catch {
      // Ignore exit error if session already expired
    }
    if (typeof window !== "undefined") {
      const adminToken = localStorage.getItem("vedavoice_admin_token");
      if (adminToken) {
        localStorage.setItem("vedavoice_token", adminToken);
        localStorage.removeItem("vedavoice_admin_token");
      }
    }
  },

  getAgencyAuditLogs: (params?: {
    tenant_id?: string;
    actor_id?: string;
    action?: string;
    is_impersonated?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.tenant_id) query.set("tenant_id", params.tenant_id);
    if (params?.actor_id) query.set("actor_id", params.actor_id);
    if (params?.action) query.set("action", params.action);
    if (params?.is_impersonated !== undefined) query.set("is_impersonated", String(params.is_impersonated));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return request<{
      total: number;
      items: AgencyAuditLog[];
      limit: number;
      offset: number;
    }>(`/api/v1/agency/audit-logs${qs ? `?${qs}` : ""}`);
  },

  // Knowledge Base Document RAG & FAQ Ingestion (Milestone M10a)
  listKnowledgeDocuments: () =>
    request<KnowledgeDocument[]>("/api/v1/portal/knowledge/documents"),

  getKnowledgeDocument: (docId: string) =>
    request<{
      document: KnowledgeDocument;
      chunks: Array<{ id: string; chunk_index: number; content: string; token_count: number }>;
    }>(`/api/v1/portal/knowledge/documents/${docId}`),

  uploadKnowledgeDocument: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const token = typeof window !== "undefined" ? localStorage.getItem("vedavoice_token") : null;
    const res = await fetch("/api/v1/portal/knowledge/upload", {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json() as Promise<KnowledgeDocument>;
  },

  deleteKnowledgeDocument: (docId: string) =>
    request<{ status: string; document_id: string }>(
      `/api/v1/portal/knowledge/documents/${docId}`,
      { method: "DELETE" }
    ),

  testRAGQuery: (query: string, top_k = 3, confidence_threshold = 0.30) =>
    request<RAGQueryResponse>("/api/v1/portal/knowledge/query", {
      method: "POST",
      body: JSON.stringify({ query, top_k, confidence_threshold }),
    }),

  // Multi-Staff Calendar Scheduling & Round-Robin Dispatch (Milestone M10b)
  listStaffMembers: (includeInactive = false) =>
    request<StaffMember[]>(`/api/v1/portal/calendar/staff${includeInactive ? "?include_inactive=true" : ""}`),

  createStaffMember: (data: Partial<StaffMember>) =>
    request<StaffMember>("/api/v1/portal/calendar/staff", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateStaffMember: (staffId: string, data: Partial<StaffMember>) =>
    request<StaffMember>(`/api/v1/portal/calendar/staff/${staffId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteStaffMember: (staffId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/portal/calendar/staff/${staffId}`, {
      method: "DELETE",
    }),

  previewDispatchRouting: (data: { service_type?: string; postal_code?: string; slot_time?: string }) =>
    request<DispatchPreviewResult>("/api/v1/portal/calendar/dispatch/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getRosterSchedule: (targetDate?: string) =>
    request<RosterSchedule[]>(
      `/api/v1/portal/calendar/roster${targetDate ? `?target_date=${encodeURIComponent(targetDate)}` : ""}`
    ),

  // Industry Packs Engine (Milestone M4c)
  listIndustryPacks: () =>
    request<IndustryPackSummary[]>("/api/v1/portal/industry-packs"),

  getIndustryPackDetails: (slug: string) =>
    request<IndustryPackDetail>(`/api/v1/portal/industry-packs/${slug}`),

  getCurrentAppliedPack: () =>
    request<Record<string, any>>("/api/v1/portal/industry-packs/current"),

  applyIndustryPack: (data: {
    pack_slug: string;
    version_semver?: string;
    overrides?: Record<string, any>;
  }) =>
    request<{ success: boolean; message: string }>("/api/v1/portal/industry-packs/apply", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePackOverrides: (data: {
    vars?: Record<string, any>;
    emergency_keywords?: string[];
    custom_safety_script?: string;
  }) =>
    request<{ success: boolean; overrides: Record<string, any> }>(
      "/api/v1/portal/industry-packs/overrides",
      {
        method: "PUT",
        body: JSON.stringify(data),
      }
    ),

  runPackTestScenarios: () =>
    request<{
      tenant_id: string;
      pack_slug: string;
      version_semver: string;
      total_scenarios: number;
      passed_scenarios: number;
      score_pct: number;
      status: string;
      scenarios: Array<{ id: string; name: string; passed: boolean; rationale: string }>;
    }>("/api/v1/portal/industry-packs/test", {
      method: "POST",
    }),

  // Multi-Location Tenant Architecture (Milestone M11, FR-LOC-1 to 6)
  listLocations: (includeInactive = false) =>
    request<TenantLocation[]>(
      `/api/v1/portal/locations${includeInactive ? "?include_inactive=true" : ""}`
    ),

  getLocationDetails: (locationId: string) =>
    request<TenantLocation>(`/api/v1/portal/locations/${locationId}`),

  createLocation: (data: Partial<TenantLocation>) =>
    request<TenantLocation>("/api/v1/portal/locations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateLocation: (locationId: string, data: Partial<TenantLocation>) =>
    request<TenantLocation>(`/api/v1/portal/locations/${locationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteLocation: (locationId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/portal/locations/${locationId}`, {
      method: "DELETE",
    }),

  resolveLocation: (data: { dialed_number?: string; postal_code?: string; spoken_city?: string }) =>
    request<{
      resolved: boolean;
      message?: string;
      location: Partial<TenantLocation> | null;
    }>("/api/v1/portal/locations/resolve", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export interface KnowledgeDocument {
  id: string;
  tenant_id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  status: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface RAGQueryResponse {
  out_of_scope: boolean;
  confidence_score: number;
  latency_ms: number;
  top_matches: Array<{
    chunk_id: string;
    document_id: string;
    filename: string;
    chunk_index: number;
    score: number;
    content: string;
    token_count: number;
  }>;
  grounding_prompt: string;
}

export interface AgencySubAccount {
  id: string;
  name: string;
  timezone: string;
  status: string;
  created_at: string;
  plan_tier: string;
  monthly_minute_quota: number;
  minutes_used: number;
  usage_pct: number;
  total_calls: number;
  active_calls: number;
  emergency_calls: number;
  qa_avg_score: number;
  csat_avg_score: number;
  phone_numbers: string[];
  last_call_at: string | null;
}

export interface AgencyAuditLog {
  id: string;
  tenant_id: string | null;
  actor_id: string;
  actor_email: string;
  actor_role: string;
  is_impersonated: boolean;
  impersonator_id: string | null;
  impersonator_email: string | null;
  session_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}

export interface ImpersonationResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  session_id: string;
  tenant: {
    id: string;
    name: string;
    timezone: string;
    status: string;
  };
  impersonator: {
    id: string;
    email: string;
    full_name: string;
  };
}

export interface StaffMember {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  skills: string[];
  service_territory_zips: string[];
  calendar_provider: string;
  calendar_id: string;
  priority_weight: number;
  is_active: boolean;
  working_hours: Record<string, any> | null;
  last_assigned_at: string | null;
  notes: string | null;
  today_bookings_count: number;
  created_at: string;
  updated_at: string;
}

export interface DispatchPreviewResult {
  service_type: string | null;
  postal_code: string | null;
  eligible_technicians_count: number;
  eligible_technicians: Array<{
    id: string;
    name: string;
    role: string;
    skills: string[];
    territories: string[];
    priority_weight: number;
    last_assigned_at: string | null;
  }>;
  chosen_technician: {
    id: string;
    name: string;
    role: string;
    email: string;
    phone: string;
  } | null;
  routing_strategy: string;
}

export interface RosterSchedule {
  technician_id: string;
  technician_name: string;
  role: string;
  skills: string[];
  bookings: Array<{
    id: string;
    customer_name: string;
    customer_phone: string;
    service_type: string;
    postal_code: string | null;
    start_at: string;
    end_at: string;
    status: string;
  }>;
}

export interface IndustryPackSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  badge?: string;
  latest_version?: string;
  active_version?: string;
  is_applied?: boolean;
  requires_hipaa_baa?: boolean;
  allowed_outbound_categories?: string[];
  permitted_outbound_categories?: string[];
}

export interface IndustryPackDetail extends IndustryPackSummary {
  version_semver?: string;
  prompt_base?: string;
  system_prompt_template?: string;
  prompt_vars_schema?: Record<string, any>;
  faq_seed?: Array<{ q: string; a: string }>;
  intake_schema?: Record<string, any>;
  intake_questions?: Array<{ id: string; question: string; required: boolean }>;
  pipeline_stages?: string[];
  appointment_types?: Array<{
    id: string;
    title?: string;
    name?: string;
    duration_minutes?: number;
    duration_min?: number;
    fee?: string;
    description?: string;
    deposit_required?: boolean;
    prep_instructions?: string;
  }>;
  emergency_rules?: {
    keywords?: string[];
    safety_advice?: string;
    escalation_mode?: string;
  };
  emergency_protocol?: {
    triggers?: string[];
    immediate_action?: string;
    script?: string;
  };
  outbound_scripts?: Record<string, string>;
  test_scenarios?: Array<{ id: string; name: string }>;
  sample_scenarios?: Array<{
    id: string;
    name: string;
    user_utterance: string;
    expected_action: string;
    expected_urgency: string;
  }>;
}

export interface TenantLocation {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  hours: string;
  service_territory_zips: string[];
  transfer_number: string;
  emergency_phone: string;
  calendar_provider: string;
  calendar_id: string;
  is_primary: boolean;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  metrics?: {
    staff_count: number;
    phone_count: number;
    total_calls: number;
    total_bookings: number;
  };
}

