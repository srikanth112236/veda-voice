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
      errorDetail = errJson.detail || errorDetail;
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
    return request<AvailableNumberItem[]>(`/api/v1/admin/numbers/search${queryStr}`);
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
};
