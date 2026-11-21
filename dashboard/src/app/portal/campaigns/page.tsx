"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  api,
  VoiceCampaignSummary,
  VoiceCampaignDetail,
  VoiceCampaignContact,
  CreateVoiceCampaignInput,
  PhoneNumberRecord,
} from "@/lib/api";
import {
  Radio,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  PhoneCall,
  User,
  Users,
  ShieldCheck,
  Calendar,
  Zap,
  ArrowRight,
  Upload,
  FileText,
  X,
  ChevronRight,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Check,
} from "lucide-react";

export default function VoiceCampaignsPage() {
  const [campaigns, setCampaigns] = useState<VoiceCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPurpose, setFilterPurpose] = useState<string>("all");

  // Selection & Detail Drawer
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<VoiceCampaignDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // New Campaign Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberRecord[]>([]);
  const [loadingPhones, setLoadingPhones] = useState(false);

  // Create Form State
  const [formName, setFormName] = useState("");
  const [formPurpose, setFormPurpose] = useState<string>("appointment_reminder");
  const [formPromptVariant, setFormPromptVariant] = useState<string>("default");
  const [formCallerId, setFormCallerId] = useState<string>("");
  const [formWindowStart, setFormWindowStart] = useState("09:00");
  const [formWindowEnd, setFormWindowEnd] = useState("18:00");
  const [formMaxAttempts, setFormMaxAttempts] = useState(3);
  const [formRetryHours, setFormRetryHours] = useState(3);
  const [formContactsRaw, setFormContactsRaw] = useState("");
  const [formConsentAcknowledged, setFormConsentAcknowledged] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick Action Pending Map
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Load Campaigns List
  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const data = await api.getVoiceCampaigns();
      setCampaigns(data || []);
    } catch (err: any) {
      console.error("Failed to load voice campaigns:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  // Fetch Phone Numbers for Caller ID
  useEffect(() => {
    if (showCreateModal) {
      setLoadingPhones(true);
      api
        .getNumbers()
        .then((res) => {
          const list = Array.isArray(res) ? res : [];
          setPhoneNumbers(list);
          if (list.length > 0 && !formCallerId) {
            setFormCallerId(list[0].e164);
          }
        })
        .catch((err) => console.error("Failed to fetch caller ID numbers:", err))
        .finally(() => setLoadingPhones(false));
    }
  }, [showCreateModal]);

  // Load Campaign Detail when a campaign is selected
  useEffect(() => {
    if (selectedCampaignId) {
      setLoadingDetail(true);
      api
        .getVoiceCampaign(selectedCampaignId)
        .then((res) => setDetailCampaign(res))
        .catch((err) => console.error("Failed to fetch campaign detail:", err))
        .finally(() => setLoadingDetail(false));
    } else {
      setDetailCampaign(null);
    }
  }, [selectedCampaignId]);

  // Parse Contacts from CSV / Multi-line input
  const parsedContacts = useMemo(() => {
    if (!formContactsRaw.trim()) return [];
    const lines = formContactsRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const results: Array<{ phone_number: string; recipient_name: string; valid: boolean }> = [];

    for (const line of lines) {
      // Support comma, tab, or pipe separated
      const parts = line.split(/[,|\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ""));
      let phone = "";
      let name = "Customer";

      if (parts.length >= 2) {
        // If first part looks like phone
        if (parts[0].replace(/[^0-9+]/g, "").length >= 7) {
          phone = parts[0];
          name = parts[1] || "Customer";
        } else {
          name = parts[0] || "Customer";
          phone = parts[1];
        }
      } else if (parts.length === 1) {
        phone = parts[0];
      }

      // Basic E.164 validation
      const cleaned = phone.replace(/[^0-9+]/g, "");
      const isValid = cleaned.length >= 10 && cleaned.length <= 15;
      results.push({
        phone_number: phone,
        recipient_name: name,
        valid: isValid,
      });
    }
    return results;
  }, [formContactsRaw]);

  // Handle Pause
  const handlePause = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setActionPendingId(id);
      await api.pauseVoiceCampaign(id);
      setActionFeedback("Campaign paused immediately.");
      await fetchCampaigns();
      if (selectedCampaignId === id) {
        const updated = await api.getVoiceCampaign(id);
        setDetailCampaign(updated);
      }
    } catch (err: any) {
      alert(`Failed to pause: ${err.message || "Unknown error"}`);
    } finally {
      setActionPendingId(null);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Handle Resume
  const handleResume = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setActionPendingId(id);
      await api.resumeVoiceCampaign(id);
      setActionFeedback("Campaign resumed. Dialer will pick up eligible contacts.");
      await fetchCampaigns();
      if (selectedCampaignId === id) {
        const updated = await api.getVoiceCampaign(id);
        setDetailCampaign(updated);
      }
    } catch (err: any) {
      alert(`Failed to resume: ${err.message || "Unknown error"}`);
    } finally {
      setActionPendingId(null);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  // Handle Run Step Now
  const handleRunStep = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      setActionPendingId(id);
      const res = await api.runVoiceCampaign(id);
      setActionFeedback(
        `Dispatched ${res.dispatches_attempted} calls (${res.dispatches_succeeded} accepted by carrier).`
      );
      await fetchCampaigns();
      if (selectedCampaignId === id) {
        const updated = await api.getVoiceCampaign(id);
        setDetailCampaign(updated);
      }
    } catch (err: any) {
      alert(`Failed to run step: ${err.message || "Unknown error"}`);
    } finally {
      setActionPendingId(null);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  // Handle Create Campaign
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError("Please enter a campaign name.");
      return;
    }
    if (!formCallerId) {
      setFormError("An active caller ID phone number is required.");
      return;
    }
    if (!formConsentAcknowledged) {
      setFormError("You must verify TCPA prior consent before launching outbound calls.");
      return;
    }
    if (parsedContacts.length === 0) {
      setFormError("Please enter or upload at least one contact phone number.");
      return;
    }
    const validCount = parsedContacts.filter((c) => c.valid).length;
    if (validCount === 0) {
      setFormError("None of the supplied contacts have a valid 10-15 digit phone number.");
      return;
    }

    try {
      setFormSubmitting(true);
      const payload: CreateVoiceCampaignInput = {
        name: formName.trim(),
        purpose: formPurpose,
        prompt_variant: formPromptVariant,
        caller_id_e164: formCallerId,
        schedule_window_start: formWindowStart,
        schedule_window_end: formWindowEnd,
        max_attempts_per_contact: formMaxAttempts,
        retry_interval_hours: formRetryHours,
        contacts: parsedContacts
          .filter((c) => c.valid)
          .map((c) => ({
            phone_number: c.phone_number,
            recipient_name: c.recipient_name,
          })),
      };

      const created = await api.createVoiceCampaign(payload);
      setShowCreateModal(false);
      resetForm();
      await fetchCampaigns();
      setSelectedCampaignId(created.id);
      setActionFeedback(`Campaign "${created.name}" created with ${created.total_contacts} contacts.`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      setFormError(err.message || "Failed to create voice campaign.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormPurpose("appointment_reminder");
    setFormPromptVariant("default");
    setFormWindowStart("09:00");
    setFormWindowEnd("18:00");
    setFormMaxAttempts(3);
    setFormRetryHours(3);
    setFormContactsRaw("");
    setFormConsentAcknowledged(false);
    setFormError(null);
  };

  // Sample CSV template loader
  const loadSampleContacts = () => {
    const sample = `+15125550144, Sarah Jenkins\n+15125550188, Michael Chang\n+15125550192, David Miller\n+15125550195, Emma Watson`;
    setFormContactsRaw(sample);
  };

  // Filtered List
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.caller_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === "all" || c.status === filterStatus;
      const matchPurpose = filterPurpose === "all" || c.purpose === filterPurpose;
      return matchSearch && matchStatus && matchPurpose;
    });
  }, [campaigns, searchQuery, filterStatus, filterPurpose]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = campaigns.length;
    const running = campaigns.filter((c) => c.status === "running").length;
    const totalContacts = campaigns.reduce((acc, c) => acc + (c.total_contacts || 0), 0);
    const completedContacts = campaigns.reduce((acc, c) => acc + (c.completed_contacts || 0), 0);
    const successfulContacts = campaigns.reduce((acc, c) => acc + (c.successful_contacts || 0), 0);
    const successRate =
      completedContacts > 0 ? Math.round((successfulContacts / completedContacts) * 100) : 0;
    return { total, running, totalContacts, completedContacts, successfulContacts, successRate };
  }, [campaigns]);

  // Purpose Formatter
  const formatPurpose = (p: string) => {
    switch (p) {
      case "appointment_reminder":
        return { label: "24h Reminder", color: "bg-blue-50 text-blue-700 border-blue-200" };
      case "speed_to_lead":
        return { label: "Speed-to-Lead", color: "bg-amber-50 text-amber-700 border-amber-200" };
      case "callback_scheduled":
        return { label: "Customer Callback", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "reactivation":
        return { label: "Reactivation", color: "bg-purple-50 text-purple-700 border-purple-200" };
      default:
        return { label: p, color: "bg-zinc-100 text-zinc-700 border-zinc-200" };
    }
  };

  // Status Formatter
  const formatStatus = (s: string) => {
    switch (s) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
            <CheckCircle2 className="w-3 h-3 text-zinc-500" />
            Completed
          </span>
        );
      case "draft":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            Draft
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Toast Feedback */}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-zinc-800 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Radio className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Outbound Voice Campaigns
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
              Milestone M5
            </span>
          </div>
          <p className="mt-1.5 text-sm text-zinc-500">
            TCPA-compliant automated appointment reminders, customer callbacks, and sub-2s speed-to-lead voice dialing.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="p-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-sm disabled:opacity-50"
            title="Refresh Campaigns"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 active:scale-[0.98] transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        </div>
      </div>

      {/* TCPA Guardrail Banner */}
      <div className="bg-gradient-to-r from-emerald-50/80 via-white to-sky-50/50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100/80 rounded-xl text-emerald-800 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-zinc-900">10-Point TCPA & FCC Outbound Guardrail Active</span>
            <p className="text-zinc-600 mt-0.5">
              Enforcing recipient timezone calling windows (8:00 AM – 9:00 PM), verified caller ID, max frequency caps, and real-time in-call opt-out suppression.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 shrink-0">
          <span className="px-2 py-1 bg-white rounded-lg border border-zinc-200 font-semibold text-zinc-700">
            SIP Trunk: Twilio Elastic / LiveKit
          </span>
        </div>
      </div>

      {/* KPI Metrics Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Campaigns</span>
            <Radio className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900">{metrics.total}</span>
            {metrics.running > 0 && (
              <span className="text-xs font-semibold text-emerald-600">
                {metrics.running} active
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400 font-mono">
            {campaigns.filter((c) => c.status === "completed").length} completed
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Contacts Queued</span>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900">
              {metrics.totalContacts}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {metrics.completedContacts} attempted / completed
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Successful Connection</span>
            <PhoneCall className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-600">
              {metrics.successRate}%
            </span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {metrics.successfulContacts} confirmed bookings / pickups
          </div>
        </div>

        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Retry Interval</span>
            <Clock className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-zinc-900">3 Hours</span>
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Auto-spaced attempts on busy/no-answer
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search campaigns by name, ID, or caller ID..."
            className="w-full pl-9 pr-4 py-2 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
          </select>

          <select
            value={filterPurpose}
            onChange={(e) => setFilterPurpose(e.target.value)}
            className="px-3 py-2 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Purposes</option>
            <option value="appointment_reminder">Appointment Reminders</option>
            <option value="speed_to_lead">Speed-to-Lead</option>
            <option value="callback_scheduled">Customer Callbacks</option>
            <option value="reactivation">Reactivation</option>
          </select>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-400 font-mono">
            <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-zinc-300" />
            Loading outbound campaigns...
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto text-zinc-400 mb-3">
              <Radio className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-zinc-900">No campaigns found</h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              Create your first voice campaign to automate customer appointment reminders or sub-2s speed-to-lead triage.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Campaign
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50/70 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Campaign Name</th>
                  <th className="px-4 py-3.5">Purpose</th>
                  <th className="px-4 py-3.5">Caller ID</th>
                  <th className="px-4 py-3.5">Progress</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Created</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredCampaigns.map((camp) => {
                  const purposeMeta = formatPurpose(camp.purpose);
                  const progressPct =
                    camp.total_contacts > 0
                      ? Math.round((camp.completed_contacts / camp.total_contacts) * 100)
                      : 0;
                  const isPending = actionPendingId === camp.id;

                  return (
                    <tr
                      key={camp.id}
                      onClick={() => setSelectedCampaignId(camp.id)}
                      className="hover:bg-zinc-50/70 cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-4 font-medium text-zinc-900">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors">
                            {camp.name}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {camp.id.slice(0, 12)}...
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg border text-[11px] font-medium ${purposeMeta.color}`}
                        >
                          {purposeMeta.label}
                        </span>
                      </td>

                      <td className="px-4 py-4 font-mono text-zinc-600">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-zinc-400" />
                          <span>{camp.caller_id || "System Default"}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4 min-w-[160px]">
                        <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                          <span>
                            {camp.completed_contacts} / {camp.total_contacts}
                          </span>
                          <span className="text-zinc-400">{progressPct}%</span>
                        </div>
                        <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              camp.status === "completed"
                                ? "bg-zinc-400"
                                : camp.status === "running"
                                ? "bg-emerald-500"
                                : "bg-indigo-500"
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-4">{formatStatus(camp.status)}</td>

                      <td className="px-4 py-4 text-zinc-400 text-[11px]">
                        {new Date(camp.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {camp.status === "running" ? (
                            <button
                              onClick={(e) => handlePause(camp.id, e)}
                              disabled={isPending}
                              className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="Pause dialing"
                            >
                              <Pause className="w-3 h-3" />
                              Pause
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleResume(camp.id, e)}
                              disabled={isPending || camp.status === "completed"}
                              className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-40"
                              title="Start / Resume dialing"
                            >
                              <Play className="w-3 h-3" />
                              {camp.status === "draft" ? "Start" : "Resume"}
                            </button>
                          )}

                          {camp.status === "running" && (
                            <button
                              onClick={(e) => handleRunStep(camp.id, e)}
                              disabled={isPending}
                              className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-colors disabled:opacity-50"
                              title="Trigger immediate dialer step"
                            >
                              <Zap className="w-3.5 h-3.5 text-indigo-600" />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedCampaignId(camp.id)}
                            className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition-colors"
                            title="Inspect contacts"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Contact Inspector Drawer */}
      {selectedCampaignId && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
          <div
            className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-zinc-200 animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-zinc-200 flex items-start justify-between bg-zinc-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-zinc-400">Campaign Inspector</span>
                  {detailCampaign && formatStatus(detailCampaign.status)}
                </div>
                <h2 className="text-lg font-bold text-zinc-900 mt-1">
                  {detailCampaign?.name || "Loading..."}
                </h2>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 font-mono">
                  <span>Caller: {detailCampaign?.caller_id || "Default"}</span>
                  <span>•</span>
                  <span>
                    Contacts: {detailCampaign?.completed_contacts} / {detailCampaign?.total_contacts}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {detailCampaign?.status === "running" ? (
                  <button
                    onClick={() => handlePause(detailCampaign.id)}
                    className="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold text-xs flex items-center gap-1.5 hover:bg-amber-100 transition-colors"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                ) : detailCampaign?.status !== "completed" ? (
                  <button
                    onClick={() => handleResume(detailCampaign!.id)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-xs flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </button>
                ) : null}

                {detailCampaign?.status === "running" && (
                  <button
                    onClick={() => handleRunStep(detailCampaign.id)}
                    className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-xs flex items-center gap-1.5 hover:bg-indigo-100 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Dispatch Now
                  </button>
                )}

                <button
                  onClick={() => setSelectedCampaignId(null)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Body: Contacts List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                <span>Queued Recipient Contacts ({detailCampaign?.contacts?.length || 0})</span>
                <span className="text-zinc-400 font-mono text-[11px]">
                  Window: 8am-9pm local
                </span>
              </div>

              {loadingDetail ? (
                <div className="p-12 text-center text-xs text-zinc-400 font-mono">
                  <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                  Loading contact records...
                </div>
              ) : !detailCampaign?.contacts || detailCampaign.contacts.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                  No contacts found in this campaign.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-zinc-200/80 rounded-2xl overflow-hidden bg-white">
                  {detailCampaign.contacts.map((c: VoiceCampaignContact) => (
                    <div key={c.id} className="p-4 flex items-center justify-between text-xs hover:bg-zinc-50/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-900">{c.recipient_name}</span>
                          <span className="font-mono text-zinc-500 text-[11px]">{c.phone_number}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                          <span>Attempts: {c.attempts_count}</span>
                          {c.last_outcome && (
                            <>
                              <span>•</span>
                              <span className="text-zinc-600 font-sans font-medium capitalize">
                                {c.last_outcome.replace(/_/g, " ")}
                              </span>
                            </>
                          )}
                          {c.skip_reason && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 font-sans">
                                {c.skip_reason.replace(/_/g, " ")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            c.status === "completed"
                              ? "bg-zinc-100 text-zinc-700"
                              : c.status === "calling"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse"
                              : c.status === "skipped"
                              ? "bg-amber-50 text-amber-700"
                              : c.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {c.status}
                        </span>

                        {c.next_attempt_at && c.status === "pending" && (
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Retry: {new Date(c.next_attempt_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Create Outbound Voice Campaign</h3>
                  <p className="text-xs text-zinc-500">
                    Milestone M5 dialer with automated TCPA consent & calling window enforcement.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-6">
              {formError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Section 1: Campaign Metadata */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  1. Campaign Configuration
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-xs font-semibold text-zinc-700">Campaign Name *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Spring Service Reminders & Triage"
                      className="w-full px-3.5 py-2.5 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700">Campaign Purpose *</label>
                    <select
                      value={formPurpose}
                      onChange={(e) => setFormPurpose(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="appointment_reminder">Appointment Reminder (24h Window)</option>
                      <option value="speed_to_lead">Speed-to-Lead (Immediate Triage)</option>
                      <option value="callback_scheduled">Customer Scheduled Callback</option>
                      <option value="reactivation">Seasonal Reactivation</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-700">Verified Caller ID *</label>
                    <select
                      value={formCallerId}
                      onChange={(e) => setFormCallerId(e.target.value)}
                      disabled={loadingPhones}
                      className="w-full px-3.5 py-2.5 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                    >
                      {phoneNumbers.length === 0 ? (
                        <option value="">No registered numbers found</option>
                      ) : (
                        phoneNumbers.map((p) => (
                          <option key={p.id} value={p.e164}>
                            {p.e164} ({p.label || p.provider})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Calling Window & Retries */}
              <div className="space-y-4 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    2. Calling Schedule & Guardrails
                  </h4>
                  <span className="text-[11px] text-zinc-500">TCPA 8am-9pm Maximum</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-zinc-600 font-medium">Window Start</label>
                    <input
                      type="time"
                      value={formWindowStart}
                      onChange={(e) => setFormWindowStart(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-600 font-medium">Window End</label>
                    <input
                      type="time"
                      value={formWindowEnd}
                      onChange={(e) => setFormWindowEnd(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-600 font-medium">Max Attempts</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={formMaxAttempts}
                      onChange={(e) => setFormMaxAttempts(parseInt(e.target.value) || 3)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-600 font-medium">Retry Spacing (h)</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={formRetryHours}
                      onChange={(e) => setFormRetryHours(parseInt(e.target.value) || 3)}
                      className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Contact List Input */}
              <div className="space-y-3 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    3. Target Contact List
                  </h4>
                  <button
                    type="button"
                    onClick={loadSampleContacts}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    Load Sample Contacts
                  </button>
                </div>

                <div className="space-y-1.5">
                  <textarea
                    rows={4}
                    value={formContactsRaw}
                    onChange={(e) => setFormContactsRaw(e.target.value)}
                    placeholder="Enter one contact per line: Phone Number, Customer Name&#10;e.g. +15125550144, Sarah Jenkins"
                    className="w-full p-3 bg-zinc-50/70 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      Parsed: <strong>{parsedContacts.length}</strong> contacts (
                      <span className="text-emerald-600 font-semibold">
                        {parsedContacts.filter((c) => c.valid).length} valid E.164
                      </span>
                      )
                    </span>
                    <span>Format: +15125550199, John Doe</span>
                  </div>
                </div>
              </div>

              {/* Section 4: TCPA Consent Checkbox */}
              <div className="pt-2 border-t border-zinc-100">
                <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 cursor-pointer hover:bg-amber-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formConsentAcknowledged}
                    onChange={(e) => setFormConsentAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    required
                  />
                  <span className="text-xs text-amber-900 leading-relaxed">
                    <strong>TCPA Prior Express Consent Acknowledgment:</strong> I certify that all contact numbers entered have granted express prior consent to be called by automated AI voice systems for this business purpose (47 U.S.C. § 227). Any contact requesting opt-out during calls will be suppressed across the tenant in real-time.
                  </span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-xs font-semibold hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center gap-2 active:scale-[0.98]"
                >
                  {formSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
