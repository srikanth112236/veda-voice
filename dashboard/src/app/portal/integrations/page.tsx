"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import {
  api,
  CRMIntegrationItem,
  WebhookSubscriptionItem,
  CSVUploadResult,
} from "@/lib/api";
import {
  Share2,
  FileSpreadsheet,
  Globe,
  Radio,
  Upload,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Zap,
  RefreshCw,
  X,
  PhoneCall,
  Sliders,
  Layers,
  Clock,
  Send,
} from "lucide-react";

export default function IntegrationsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id || "your-tenant-id";

  const [integrations, setIntegrations] = useState<CRMIntegrationItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookSubscriptionItem[]>([]);
  const [outboxData, setOutboxData] = useState<{
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
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [processingOutbox, setProcessingOutbox] = useState(false);
  const [retryingDead, setRetryingDead] = useState(false);
  const [testingSync, setTestingSync] = useState<string | null>(null);

  // Modals & form state
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [syncContacts, setSyncContacts] = useState(true);
  const [syncCalls, setSyncCalls] = useState(true);

  // New Webhook state
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookSecret, setNewWebhookSecret] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState("call.completed");

  // CSV Bulk Upload State
  const [csvContent, setCsvContent] = useState("");
  const [autoDialCSV, setAutoDialCSV] = useState(false);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const [csvResult, setCsvResult] = useState<CSVUploadResult | null>(null);

  // Copy helpers
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://app.vedavoice.ai";

  const fetchData = async () => {
    setLoading(true);
    try {
      const [crmList, hookList, outboxRes] = await Promise.all([
        api.getCRMIntegrations().catch(() => []),
        api.getWebhooks().catch(() => []),
        api.getOutboxDashboard().catch((err) => {
          console.warn("Outbox dashboard unavailable:", err);
          return null;
        }),
      ]);
      setIntegrations(Array.isArray(crmList) ? crmList : []);
      setWebhooks(Array.isArray(hookList) ? hookList : []);
      if (outboxRes) {
        setOutboxData(outboxRes);
      }
    } catch (err: any) {
      console.error("Failed to load integrations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleConnectHubSpotOAuth = async () => {
    setConnectingOAuth(true);
    try {
      const res = await api.getHubSpotAuthUrl();
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        alert("No authorization URL returned by server.");
      }
    } catch (err: any) {
      alert(`HubSpot OAuth initiation failed: ${err.message}`);
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleConnectGHLOAuth = async () => {
    setConnectingOAuth(true);
    try {
      const res = await api.getGHLAuthUrl();
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        alert("No authorization URL returned by server.");
      }
    } catch (err: any) {
      alert(`GoHighLevel OAuth initiation failed: ${err.message}`);
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleConnectPipedriveOAuth = async () => {
    setConnectingOAuth(true);
    try {
      const res = await api.getPipedriveAuthUrl();
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        alert("No authorization URL returned by server.");
      }
    } catch (err: any) {
      alert(`Pipedrive OAuth initiation failed: ${err.message}`);
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleRetryDeadLetters = async () => {
    setRetryingDead(true);
    try {
      const res = await api.retryDeadLetterJobs();
      setNotification(res.message || "Dead-letter jobs re-queued for delivery.");
      setTimeout(() => setNotification(null), 4000);
      await fetchData();
    } catch (err: any) {
      alert(`Failed to retry dead letters: ${err.message}`);
    } finally {
      setRetryingDead(false);
    }
  };

  const handleProcessOutbox = async () => {
    setProcessingOutbox(true);
    try {
      const res = await api.triggerOutboxBatch();
      const countDelivered = res.results?.delivered ?? 0;
      const countDead = res.results?.dead_lettered ?? 0;
      setNotification(
        `Outbox processed: ${countDelivered} delivered, ${countDead} dead-lettered.`
      );
      setTimeout(() => setNotification(null), 4000);
      await fetchData();
    } catch (err: any) {
      alert(`Process outbox failed: ${err.message}`);
    } finally {
      setProcessingOutbox(false);
    }
  };

  const handleTestCRMSync = async (provider: string) => {
    setTestingSync(provider);
    try {
      const res = await api.testCRMSync(provider);
      setNotification(res.message || `Test sync enqueued for ${provider.toUpperCase()}`);
      setTimeout(() => setNotification(null), 4000);
      await fetchData();
    } catch (err: any) {
      alert(`Test sync failed: ${err.message}`);
    } finally {
      setTestingSync(null);
    }
  };

  const handleConnectCRM = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.connectCRM({
        provider: selectedProvider,
        credentials,
        sync_contacts: syncContacts,
        sync_calls: syncCalls,
      });
      setActiveModal(null);
      setCredentials({});
      setNotification(`Successfully connected ${selectedProvider.toUpperCase()}!`);
      setTimeout(() => setNotification(null), 3500);
      fetchData();
    } catch (err: any) {
      alert(`Connection failed: ${err.message}`);
    }
  };

  const handleDisconnectCRM = async (provider: string) => {
    if (!confirm(`Are you sure you want to disconnect ${provider.toUpperCase()}?`)) return;
    try {
      await api.disconnectCRM(provider);
      setNotification(`Disconnected ${provider.toUpperCase()}.`);
      setTimeout(() => setNotification(null), 3000);
      fetchData();
    } catch (err: any) {
      alert(`Disconnect failed: ${err.message}`);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWebhook({
        target_url: newWebhookUrl,
        secret: newWebhookSecret || "vedavoice_secret_token",
        event_type: newWebhookEvent,
      });
      setActiveModal(null);
      setNewWebhookUrl("");
      setNewWebhookSecret("");
      setNotification("Webhook endpoint subscribed!");
      setTimeout(() => setNotification(null), 3000);
      fetchData();
    } catch (err: any) {
      alert(`Error adding webhook: ${err.message}`);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("Delete this webhook subscription?")) return;
    try {
      await api.deleteWebhook(id);
      fetchData();
    } catch (err: any) {
      alert(`Failed to delete webhook: ${err.message}`);
    }
  };

  const handleCSVUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      alert("Please enter or paste CSV content.");
      return;
    }
    setUploadingCSV(true);
    try {
      const res = await api.uploadLeadsCSV(csvContent, autoDialCSV);
      setCsvResult(res);
      setCsvContent("");
      setNotification(
        `Imported ${res.imported_contacts} leads (${res.suppressed_skipped} DNC skipped).`
      );
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      alert(`CSV Upload failed: ${err.message}`);
    } finally {
      setUploadingCSV(false);
    }
  };

  const getProviderInfo = (providerKey: string) => {
    return integrations.find(
      (i) => i.provider?.toLowerCase() === providerKey.toLowerCase()
    );
  };

  const isProviderConnected = (info: CRMIntegrationItem | undefined) => {
    if (!info) return false;
    return Boolean(info.is_active || info.status === "connected");
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Page Header */}
      <div className="border-b border-zinc-200 pb-5">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
            <Share2 className="w-5 h-5" />
          </span>
          <h1 className="text-xl font-bold text-zinc-900">Lead Capture & External CRM Hub</h1>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Connect your website forms, Google Sheets, Meta Ads, and external small-business CRMs for instant AI calling under 10 seconds.
        </p>
      </div>

      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {notification}
          </div>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      )}

      {/* SECTION 1: INBOUND LEAD CAPTURE GATEWAYS */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider text-xs">
            1. Inbound Lead Capture & Spreadsheet Two-Way Sync
          </h2>
          <p className="text-xs text-zinc-500">
            Triggers an immediate outbound AI call when a prospect registers or is added to a spreadsheet.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card A: Google Sheets Two-Way Sync */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <FileSpreadsheet className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  2-Way Sync
                </span>
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-900">Google Sheets Two-Way Sync</h3>
                <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                  When a client adds a lead row, VedaVoice dials immediately. After the call, the outcome, summary, and recording link are written back into the sheet.
                </p>
              </div>

              {/* Endpoint link */}
              <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 space-y-1">
                <span className="text-[9px] font-mono text-zinc-400 uppercase block font-bold">
                  Google Sheet Inbound Webhook URL
                </span>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-zinc-700 truncate">
                    {baseUrl}/api/v1/leads/sheets/sync/{tenantId}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${baseUrl}/api/v1/leads/sheets/sync/${tenantId}`,
                        "gsheets_url"
                      )
                    }
                    className="p-1 text-zinc-500 hover:text-zinc-900"
                    title="Copy URL"
                  >
                    {copiedKey === "gsheets_url" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <details className="text-xs text-zinc-600 pt-2 border-t border-zinc-100">
              <summary className="cursor-pointer font-semibold text-indigo-600 hover:underline">
                View Google Apps Script Snippet
              </summary>
              <pre className="mt-2 p-2 bg-zinc-900 text-zinc-100 rounded-lg text-[10px] font-mono overflow-x-auto">
{`function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var row = e.range.getRow();
  if (row === 1) return;
  var name = sheet.getRange(row, 1).getValue();
  var phone = sheet.getRange(row, 2).getValue();
  if (!phone) return;
  
  UrlFetchApp.fetch("${baseUrl}/api/v1/leads/sheets/sync/${tenantId}", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      row_id: row.toString(),
      name: name,
      phone: phone,
      auto_dial: true
    })
  });
}`}
              </pre>
            </details>
          </div>

          {/* Card B: Universal Website Forms Webhook */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                  <Globe className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">
                  Speed-to-Lead &lt; 10s
                </span>
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-900">Website Forms & Plugins</h3>
                <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                  Direct webhook support for WordPress (WPForms, Contact Form 7), Webflow, and Typeform. Dials website inquiries in under 10 seconds.
                </p>
              </div>

              {/* Endpoint link */}
              <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 space-y-1">
                <span className="text-[9px] font-mono text-zinc-400 uppercase block font-bold">
                  Universal Form Webhook URL
                </span>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-zinc-700 truncate">
                    {baseUrl}/api/v1/leads/webhook/{tenantId}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${baseUrl}/api/v1/leads/webhook/${tenantId}`,
                        "forms_url"
                      )
                    }
                    className="p-1 text-zinc-500 hover:text-zinc-900"
                    title="Copy URL"
                  >
                    {copiedKey === "forms_url" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 flex items-center justify-between">
              <span>Supports: JSON, Multipart, CF7, Typeform</span>
              <span className="text-emerald-600 font-semibold font-mono">Active</span>
            </div>
          </div>

          {/* Card C: Meta Lead Ads */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                  <Radio className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold">
                  Facebook & IG
                </span>
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-900">Meta Lead Ads Instant Forms</h3>
                <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                  Call Facebook and Instagram ad leads the instant they click submit, before they go cold.
                </p>
              </div>

              {/* Endpoint link */}
              <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 space-y-1">
                <span className="text-[9px] font-mono text-zinc-400 uppercase block font-bold">
                  Meta Webhook Callback URL
                </span>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-zinc-700 truncate">
                    {baseUrl}/api/v1/leads/meta/webhook
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${baseUrl}/api/v1/leads/meta/webhook`,
                        "meta_url"
                      )
                    }
                    className="p-1 text-zinc-500 hover:text-zinc-900"
                    title="Copy URL"
                  >
                    {copiedKey === "meta_url" ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 flex items-center justify-between">
              <span>Verify Token: <code className="font-mono text-zinc-700">vedavoice_meta_verify_token</code></span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CSV BULK UPLOAD WITH COMPLIANCE GATE */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider text-xs flex items-center gap-2">
              <Upload className="w-4 h-4 text-zinc-600" />
              CSV Bulk Lead Upload & Campaign Launcher
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              One-click spreadsheet upload for reactivation and cold campaigns. Automatically filtered against your National and Internal DNC suppression list.
            </p>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Compliance Gate Enforced
          </span>
        </div>

        <form onSubmit={handleCSVUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Paste CSV Content (Headers: name, phone, email, notes)
            </label>
            <textarea
              rows={4}
              placeholder={`name,phone,email\nJohn Doe,+15125550199,john@example.com\nJane Smith,+15125550200,jane@example.com`}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-1 focus:ring-zinc-900 focus:outline-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDialCSV}
                onChange={(e) => setAutoDialCSV(e.target.checked)}
                className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span>
                <strong>Auto-dial immediately</strong> (respects 8:00 AM – 8:00 PM local recipient window)
              </span>
            </label>

            <button
              type="submit"
              disabled={uploadingCSV || !csvContent.trim()}
              className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 disabled:opacity-50 transition shadow-xs flex items-center gap-2"
            >
              {uploadingCSV ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Filtering & Importing...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Process & Upload Leads
                </>
              )}
            </button>
          </div>
        </form>

        {/* Live CSV Upload Results */}
        {csvResult && (
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <h4 className="text-xs font-bold text-zinc-900">Upload Processing Report:</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                <span className="text-[10px] text-zinc-400 font-mono uppercase block">Total Rows</span>
                <span className="text-base font-bold text-zinc-800 font-mono">
                  {csvResult.total_rows}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                <span className="text-[10px] text-zinc-400 font-mono uppercase block">Imported Leads</span>
                <span className="text-base font-bold text-emerald-600 font-mono">
                  {csvResult.imported_contacts}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                <span className="text-[10px] text-zinc-400 font-mono uppercase block">DNC Suppressed</span>
                <span className="text-base font-bold text-rose-600 font-mono">
                  {csvResult.suppressed_skipped}
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                <span className="text-[10px] text-zinc-400 font-mono uppercase block">Dials Dispatched</span>
                <span className="text-base font-bold text-indigo-600 font-mono">
                  {csvResult.outbound_calls_queued}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: TOP 4 SMALL BUSINESS CRMS */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider text-xs">
            2. Top 4 External CRM Integrations
          </h2>
          <p className="text-xs text-zinc-500">
            For businesses that already use a dedicated CRM. Synchronize contacts, call outcomes, summaries, and recording links automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* HubSpot */}
          {(() => {
            const info = getProviderInfo("hubspot");
            const isConn = isProviderConnected(info);
            const isOAuth = info?.type === "oauth2";
            return (
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-900">HubSpot</span>
                      {isOAuth && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                          OAuth 2.0
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isConn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {isConn ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Transactional 2-way sync with envelope encryption. Syncs contacts, call summaries, recording URLs, and stage updates into HubSpot CRM.
                  </p>
                  {isConn && info?.account_id && (
                    <div className="text-[10px] font-mono text-zinc-600 bg-zinc-50 px-2 py-1 rounded-md border border-zinc-200 truncate">
                      Portal ID: <span className="font-semibold text-zinc-800">{info.account_id}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  {isConn ? (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => handleTestCRMSync("hubspot")}
                        disabled={testingSync === "hubspot"}
                        className="w-full py-1.5 rounded-xl bg-zinc-100 text-zinc-800 hover:bg-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        {testingSync === "hubspot" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Test Sync to Outbox
                      </button>
                      <button
                        onClick={() => handleDisconnectCRM("hubspot")}
                        className="w-full py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={handleConnectHubSpotOAuth}
                        disabled={connectingOAuth}
                        className="w-full py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                      >
                        {connectingOAuth ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Connect HubSpot (OAuth 2.0)
                      </button>
                      <button
                        onClick={() => {
                          setSelectedProvider("hubspot");
                          setActiveModal("crm");
                        }}
                        className="w-full text-center text-[10px] text-zinc-500 hover:text-zinc-800 underline block"
                      >
                        Or connect via Private App Token
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Zoho CRM */}
          {(() => {
            const info = getProviderInfo("zoho");
            const isConn = isProviderConnected(info);
            return (
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900">Zoho CRM</span>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isConn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {isConn ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Native REST API integration to push call outcomes, transcripts, and update lead stages in Zoho.
                  </p>
                </div>
                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  {isConn ? (
                    <>
                      <button
                        onClick={() => handleTestCRMSync("zoho")}
                        disabled={testingSync === "zoho"}
                        className="w-full py-1.5 rounded-xl bg-zinc-100 text-zinc-800 hover:bg-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        {testingSync === "zoho" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Test Sync to Outbox
                      </button>
                      <button
                        onClick={() => handleDisconnectCRM("zoho")}
                        className="w-full py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedProvider("zoho");
                        setActiveModal("crm");
                      }}
                      className="w-full py-1.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold transition shadow-xs"
                    >
                      Connect Zoho CRM
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* GoHighLevel */}
          {(() => {
            const info = getProviderInfo("gohighlevel");
            const isConn = isProviderConnected(info);
            const isOAuth = info?.type === "oauth2";
            return (
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-900">GoHighLevel</span>
                      {isOAuth && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                          OAuth 2.0
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isConn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {isConn ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Agency multi-location sync. Creates sub-account contacts, custom fields, and logs AI conversation notes.
                  </p>
                  {isConn && info?.account_id && (
                    <div className="text-[10px] font-mono text-zinc-600 bg-zinc-50 px-2 py-1 rounded-md border border-zinc-200 truncate">
                      Loc ID: <span className="font-semibold text-zinc-800">{info.account_id}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  {isConn ? (
                    <>
                      <button
                        onClick={() => handleTestCRMSync("gohighlevel")}
                        disabled={testingSync === "gohighlevel"}
                        className="w-full py-1.5 rounded-xl bg-zinc-100 text-zinc-800 hover:bg-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        {testingSync === "gohighlevel" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Test Sync to Outbox
                      </button>
                      <button
                        onClick={() => handleDisconnectCRM("gohighlevel")}
                        className="w-full py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={handleConnectGHLOAuth}
                        disabled={connectingOAuth}
                        className="w-full py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                      >
                        {connectingOAuth ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Connect GHL (OAuth 2.0)
                      </button>
                      <button
                        onClick={() => {
                          setSelectedProvider("gohighlevel");
                          setActiveModal("crm");
                        }}
                        className="w-full text-center text-[10px] text-zinc-500 hover:text-zinc-800 underline block"
                      >
                        Or connect via Location API Key
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Pipedrive */}
          {(() => {
            const info = getProviderInfo("pipedrive");
            const isConn = isProviderConnected(info);
            const isOAuth = info?.type === "oauth2";
            return (
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-900">Pipedrive</span>
                      {isOAuth && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                          OAuth 2.0
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isConn ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {isConn ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Creates Persons and logs completed call Activities and recordings directly into your Pipedrive pipeline.
                  </p>
                  {isConn && info?.account_id && (
                    <div className="text-[10px] font-mono text-zinc-600 bg-zinc-50 px-2 py-1 rounded-md border border-zinc-200 truncate">
                      Company ID: <span className="font-semibold text-zinc-800">{info.account_id}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  {isConn ? (
                    <>
                      <button
                        onClick={() => handleTestCRMSync("pipedrive")}
                        disabled={testingSync === "pipedrive"}
                        className="w-full py-1.5 rounded-xl bg-zinc-100 text-zinc-800 hover:bg-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        {testingSync === "pipedrive" ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Test Sync to Outbox
                      </button>
                      <button
                        onClick={() => handleDisconnectCRM("pipedrive")}
                        className="w-full py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <button
                        onClick={handleConnectPipedriveOAuth}
                        disabled={connectingOAuth}
                        className="w-full py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                      >
                        {connectingOAuth ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5" />
                        )}
                        Connect Pipedrive (OAuth 2.0)
                      </button>
                      <button
                        onClick={() => {
                          setSelectedProvider("pipedrive");
                          setActiveModal("crm");
                        }}
                        className="w-full text-center text-[10px] text-zinc-500 hover:text-zinc-800 underline block"
                      >
                        Or connect via Personal API Token
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* SECTION 3: TRANSACTIONAL CRM OUTBOX & QUEUE MONITOR (FR-INT-3, FR-INT-4, FR-INT-5) */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700">
                <Layers className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider text-xs">
                3. Transactional CRM Outbox & Queue Monitor
              </h2>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Guaranteed at-least-once delivery with exponential backoff (2<sup>attempt</sup>s), dead-letter safety after 5 retries, and cross-platform idempotency.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleProcessOutbox}
              disabled={processingOutbox}
              className="px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50 transition shadow-xs flex items-center gap-1.5"
            >
              <Zap className={`w-3.5 h-3.5 ${processingOutbox ? "animate-spin text-amber-400" : "text-amber-300"}`} />
              Process Queue Now
            </button>
            <button
              onClick={handleRetryDeadLetters}
              disabled={retryingDead || !outboxData?.counts?.dead}
              className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50/50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryingDead ? "animate-spin" : ""}`} />
              Retry Dead Letters ({outboxData?.counts?.dead ?? 0})
            </button>
            <button
              onClick={fetchData}
              title="Refresh queue status"
              className="p-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 5-State Outbox Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
            <span className="text-[10px] text-zinc-500 uppercase font-mono font-bold block">Queued</span>
            <span className="text-lg font-bold text-zinc-800 font-mono">
              {outboxData?.counts?.queued ?? 0}
            </span>
          </div>
          <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
            <span className="text-[10px] text-blue-700 uppercase font-mono font-bold block">In Progress</span>
            <span className="text-lg font-bold text-blue-800 font-mono">
              {outboxData?.counts?.in_progress ?? 0}
            </span>
          </div>
          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
            <span className="text-[10px] text-emerald-700 uppercase font-mono font-bold block">Delivered</span>
            <span className="text-lg font-bold text-emerald-700 font-mono">
              {outboxData?.counts?.done ?? 0}
            </span>
          </div>
          <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200">
            <span className="text-[10px] text-amber-700 uppercase font-mono font-bold block">Retrying / Failed</span>
            <span className="text-lg font-bold text-amber-700 font-mono">
              {outboxData?.counts?.failed ?? 0}
            </span>
          </div>
          <div className={`p-3 rounded-xl border ${
            (outboxData?.counts?.dead ?? 0) > 0
              ? "bg-rose-50 border-rose-300"
              : "bg-zinc-50 border-zinc-200"
          }`}>
            <span className={`text-[10px] uppercase font-mono font-bold block ${
              (outboxData?.counts?.dead ?? 0) > 0 ? "text-rose-700" : "text-zinc-500"
            }`}>
              Dead Letter (5+ Retries)
            </span>
            <span className={`text-lg font-bold font-mono ${
              (outboxData?.counts?.dead ?? 0) > 0 ? "text-rose-700" : "text-zinc-800"
            }`}>
              {outboxData?.counts?.dead ?? 0}
            </span>
          </div>
        </div>

        {/* Dead-Letter Log Table or Recent Outbox Activity */}
        {outboxData?.recent_jobs && outboxData.recent_jobs.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-zinc-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-zinc-500" />
                Recent Transactional Outbox Activity (Last 20 Events)
              </span>
              {(outboxData.counts?.dead ?? 0) > 0 && (
                <span className="text-rose-600 font-semibold flex items-center gap-1 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Contains dead-lettered events requiring attention
                </span>
              )}
            </div>
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50 divide-y divide-zinc-200 text-xs">
              {outboxData.recent_jobs.slice(0, 10).map((job) => {
                const isDead = job.status === "dead";
                const isDone = job.status === "done";
                const isFailed = job.status === "failed";
                return (
                  <div
                    key={job.id}
                    className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      isDead ? "bg-rose-50/40" : ""
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            isDone
                              ? "bg-emerald-100 text-emerald-800"
                              : isDead
                              ? "bg-rose-100 text-rose-800"
                              : isFailed
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-200 text-zinc-700"
                          }`}
                        >
                          {job.status}
                        </span>
                        <span className="font-mono text-zinc-800 font-semibold">
                          {job.entity}:{job.op}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          attempt #{job.attempt}
                        </span>
                      </div>
                      {job.last_error && (
                        <p className="text-[11px] text-rose-600 font-mono truncate max-w-xl">
                          {job.last_error}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono self-end sm:self-auto">
                      {new Date(job.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: OUTBOUND WEBHOOKS (ZAPIER / MAKE / CUSTOM) */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider text-xs">
              4. Outbound Webhooks (Zapier, Make, n8n)
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Securely stream completed calls and appointments to Zapier, Make, Airtable, or your internal API with HMAC-SHA256 signing.
            </p>
          </div>
          <button
            onClick={() => setActiveModal("webhook")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            + Add Webhook
          </button>
        </div>

        {webhooks.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-zinc-200 text-center text-xs text-zinc-400">
            No active webhook subscriptions. Add a Zapier or Make Catch Hook above.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
            {webhooks.map((hook) => (
              <div key={hook.id} className="p-3.5 flex items-center justify-between bg-zinc-50/50">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-zinc-800">
                      {hook.target_url}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-700 font-mono">
                      {hook.event_type}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    Secret: {hook.secret_masked} (HMAC-SHA256 verified)
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteWebhook(hook.id)}
                  className="p-1.5 text-zinc-400 hover:text-rose-600 transition"
                  title="Delete subscription"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: CONNECT CRM */}
      {activeModal === "crm" && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 uppercase">
                Connect {selectedProvider}
              </h3>
              <button onClick={() => setActiveModal(null)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            <form onSubmit={handleConnectCRM} className="space-y-3 text-xs">
              {selectedProvider === "hubspot" && (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    HubSpot Private App Access Token *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="pat-na1-..."
                    value={credentials.access_token || ""}
                    onChange={(e) => setCredentials({ ...credentials, access_token: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
              )}

              {selectedProvider === "zoho" && (
                <>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Client ID *</label>
                    <input
                      type="text"
                      required
                      placeholder="1000.XXXXXX..."
                      value={credentials.client_id || ""}
                      onChange={(e) => setCredentials({ ...credentials, client_id: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Client Secret *</label>
                    <input
                      type="password"
                      required
                      placeholder="Zoho Client Secret"
                      value={credentials.client_secret || ""}
                      onChange={(e) => setCredentials({ ...credentials, client_secret: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Refresh Token *</label>
                    <input
                      type="password"
                      required
                      placeholder="1000.refresh_token..."
                      value={credentials.refresh_token || ""}
                      onChange={(e) => setCredentials({ ...credentials, refresh_token: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}

              {selectedProvider === "gohighlevel" && (
                <>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      GHL Location API Key / Token *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Location API Key"
                      value={credentials.api_key || ""}
                      onChange={(e) => setCredentials({ ...credentials, api_key: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Location ID</label>
                    <input
                      type="text"
                      placeholder="Optional Sub-account ID"
                      value={credentials.location_id || ""}
                      onChange={(e) => setCredentials({ ...credentials, location_id: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}

              {selectedProvider === "pipedrive" && (
                <>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">API Token *</label>
                    <input
                      type="password"
                      required
                      placeholder="Personal API Token"
                      value={credentials.api_token || ""}
                      onChange={(e) => setCredentials({ ...credentials, api_token: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Company Domain</label>
                    <input
                      type="text"
                      placeholder="company (for company.pipedrive.com)"
                      value={credentials.company_domain || ""}
                      onChange={(e) => setCredentials({ ...credentials, company_domain: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div className="pt-2 space-y-2 border-t border-zinc-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncContacts}
                    onChange={(e) => setSyncContacts(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  <span>Sync Contacts automatically</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncCalls}
                    onChange={(e) => setSyncCalls(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  <span>Log AI Calls, Summaries & Recordings</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition shadow-xs"
                >
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD WEBHOOK */}
      {activeModal === "webhook" && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">Add Zapier / Make Webhook</h3>
              <button onClick={() => setActiveModal(null)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Target Webhook URL *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Signing Secret</label>
                <input
                  type="text"
                  placeholder="Optional secret for HMAC-SHA256 signature"
                  value={newWebhookSecret}
                  onChange={(e) => setNewWebhookSecret(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Trigger Event</label>
                <select
                  value={newWebhookEvent}
                  onChange={(e) => setNewWebhookEvent(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                >
                  <option value="call.completed">call.completed (Triggers after every call)</option>
                  <option value="lead.qualified">lead.qualified (Only qualified leads)</option>
                  <option value="appointment.booked">appointment.booked (Confirmed bookings)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-4 py-2 border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition shadow-xs"
                >
                  Subscribe Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
