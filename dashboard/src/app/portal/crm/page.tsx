"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  api,
  ContactItem,
  ContactDetail,
  PipelineStagesResponse,
  PipelineStageDefinition,
  EmailCampaignItem,
  RevenueRecoveredAnalytics,
  DuplicateContactGroup,
  ContactConsentAudit,
} from "@/lib/api";
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Clock,
  Play,
  Pause,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  DollarSign,
  Layers,
  ShieldCheck,
  GitMerge,
  ExternalLink,
  Edit3,
  Calendar,
  Sparkles,
} from "lucide-react";

const FALLBACK_STAGES = [
  { key: "new_lead", label: "New Lead", color: "border-blue-300 bg-blue-50/50 text-blue-700", is_system: true },
  { key: "ai_called", label: "AI Contacted", color: "border-purple-300 bg-purple-50/50 text-purple-700", is_system: true },
  { key: "qualified", label: "Qualified", color: "border-amber-300 bg-amber-50/50 text-amber-700", is_system: true },
  { key: "booked", label: "Appointment Booked", color: "border-emerald-300 bg-emerald-50/50 text-emerald-700", is_system: true },
  { key: "closed", label: "Won / Closed", color: "border-zinc-300 bg-zinc-100 text-zinc-800", is_system: true },
  { key: "lost", label: "Lost", color: "border-red-300 bg-red-50/50 text-red-700", is_system: true },
];

export default function CRMPipelinePage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "contacts" | "campaigns">("pipeline");
  const [pipelineData, setPipelineData] = useState<PipelineStagesResponse | null>(null);
  const [allContacts, setAllContacts] = useState<ContactItem[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaignItem[]>([]);
  const [revenueAnalytics, setRevenueAnalytics] = useState<RevenueRecoveredAnalytics | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Drawer & Contact Detail State
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"overview" | "calls" | "consent">("overview");
  const [contactConsent, setContactConsent] = useState<ContactConsentAudit | null>(null);
  const [loadingConsent, setLoadingConsent] = useState(false);

  // Modals
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showAddCampaignModal, setShowAddCampaignModal] = useState(false);
  const [showAvgDealModal, setShowAvgDealModal] = useState(false);
  const [avgDealInput, setAvgDealInput] = useState("250");
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // New Custom Stage Form
  const [newStage, setNewStage] = useState({
    stage_key: "",
    label: "",
    color: "border-indigo-300 bg-indigo-50/50 text-indigo-700",
  });

  // New Contact Form State
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    email: "",
    source: "manual",
    stage: "new_lead",
    tags: "Interested",
    notes: "",
  });

  // New Campaign Form State
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    subject: "",
    body_html: "Hi {{name}},\n\nThanks for speaking with our AI team today. We would love to continue the conversation.\n\nBest regards,\nVedaVoice Team",
    trigger_event: "manual_broadcast",
    target_stage: "qualified",
  });

  // Audio Player State for Drawer
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchCRMData = async () => {
    setLoading(true);
    try {
      const [pipe, contactsRes, camps, rev, dups] = await Promise.all([
        api.getCRMPipeline(),
        api.getCRMContacts(),
        api.getCRMCampaigns(),
        api.getCRMRevenueAnalytics().catch(() => null),
        api.getCRMDuplicates().catch(() => []),
      ]);
      setPipelineData(pipe);
      const contactList = Array.isArray(contactsRes)
        ? contactsRes
        : contactsRes && Array.isArray((contactsRes as any).contacts)
        ? (contactsRes as any).contacts
        : [];
      setAllContacts(contactList);
      setCampaigns(Array.isArray(camps) ? camps : []);
      if (rev) {
        setRevenueAnalytics(rev);
        setAvgDealInput(String(rev.average_deal_value));
      }
      setDuplicates(Array.isArray(dups) ? dups : []);
    } catch (err: any) {
      console.error("Failed to load CRM data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCRMData();
  }, []);

  const currentStages = (
    pipelineData?.stage_definitions && pipelineData.stage_definitions.length > 0
      ? pipelineData.stage_definitions.map((s) => ({
          key: s.stage_key,
          label: s.label,
          color: s.color,
          is_system: s.is_system,
        }))
      : FALLBACK_STAGES
  );

  const handleOpenContactDetail = async (contactId: string) => {
    setSelectedContactId(contactId);
    setLoadingDetail(true);
    setDrawerTab("overview");
    setContactConsent(null);
    try {
      const detail = await api.getCRMContactDetail(contactId);
      setContactDetail(detail);
    } catch (err: any) {
      console.error("Failed to load contact details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleLoadConsentAudit = async (contactId: string) => {
    setLoadingConsent(true);
    try {
      const audit = await api.getCRMConsentAudit(contactId);
      setContactConsent(audit);
    } catch (err: any) {
      console.error("Failed to load consent audit:", err);
    } finally {
      setLoadingConsent(false);
    }
  };

  const handleMoveStage = async (contactId: string, newStage: string) => {
    try {
      await api.updateCRMContact(contactId, { stage: newStage });
      fetchCRMData();
      if (contactDetail && contactDetail.id === contactId) {
        setContactDetail({ ...contactDetail, stage: newStage });
      }
    } catch (err: any) {
      alert(`Could not move contact: ${err.message}`);
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tagsArray = newContact.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await api.createCRMContact({
        name: newContact.name,
        phone: newContact.phone,
        email: newContact.email || undefined,
        source: newContact.source,
        stage: newContact.stage,
        tags: tagsArray,
        notes: newContact.notes,
      });

      setShowAddContactModal(false);
      setNewContact({
        name: "",
        phone: "",
        email: "",
        source: "manual",
        stage: "new_lead",
        tags: "Interested",
        notes: "",
      });
      setActionMessage("Contact created successfully!");
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Error creating contact: ${err.message}`);
    }
  };

  const handleCreateStage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCRMStage(newStage);
      setShowStagesModal(false);
      setNewStage({
        stage_key: "",
        label: "",
        color: "border-indigo-300 bg-indigo-50/50 text-indigo-700",
      });
      setActionMessage("Custom pipeline stage added!");
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Error adding stage: ${err.message}`);
    }
  };

  const handleDeleteStage = async (stageKey: string) => {
    if (!confirm(`Are you sure you want to delete stage '${stageKey}'?`)) return;
    try {
      await api.deleteCRMStage(stageKey, "new_lead");
      setActionMessage(`Stage '${stageKey}' deleted.`);
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Could not delete stage: ${err.message}`);
    }
  };

  const handleUpdateAvgDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(avgDealInput);
    if (isNaN(val) || val <= 0) {
      alert("Please enter a valid positive number");
      return;
    }
    try {
      await api.updateCRMRevenueSettings(val);
      setShowAvgDealModal(false);
      setActionMessage(`Average deal value updated to $${val.toFixed(2)}`);
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Failed to update settings: ${err.message}`);
    }
  };

  const handleMergeDuplicate = async (survivorId: string, sourceId: string) => {
    if (!confirm("Merge these contacts? Call records, notes, and tags will be consolidated into the primary profile.")) {
      return;
    }
    try {
      await api.mergeCRMContacts(survivorId, { source_id: sourceId });
      setActionMessage("Contacts merged successfully!");
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Merge failed: ${err.message}`);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCRMCampaign({
        name: newCampaign.name,
        subject: newCampaign.subject,
        body_html: newCampaign.body_html,
        trigger_event: newCampaign.trigger_event,
        target_stage: newCampaign.target_stage || undefined,
      });
      setShowAddCampaignModal(false);
      setActionMessage("Email campaign created!");
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Error creating campaign: ${err.message}`);
    }
  };

  const handleSendBroadcast = async (campaignId: string) => {
    if (!confirm("Are you sure you want to trigger this email broadcast to contacts in this stage?")) {
      return;
    }
    try {
      const res = await api.sendCRMCampaign(campaignId);
      setActionMessage(res.message);
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Error sending broadcast: ${err.message}`);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm("Are you sure you want to delete this contact and all its history?")) return;
    try {
      await api.deleteCRMContact(contactId);
      setSelectedContactId(null);
      setContactDetail(null);
      setActionMessage("Contact deleted.");
      setTimeout(() => setActionMessage(null), 3000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Could not delete contact: ${err.message}`);
    }
  };

  const toggleAudio = (url: string) => {
    if (!audioRef.current) return;
    if (playingAudioUrl === url && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setPlayingAudioUrl(url);
      audioRef.current.src = url;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const changePlaybackSpeed = (speed: 1 | 1.5 | 2) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-zinc-900">Native CRM & Pipeline Board</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            System of record for AI calls, pipeline conversions, TCPA consent evidentiary trails, and automated email sequences.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchCRMData()}
            className="p-2 border border-zinc-200 rounded-xl hover:bg-zinc-100 text-zinc-600 transition"
            title="Refresh CRM data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowStagesModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 shadow-xs transition"
          >
            <Layers className="w-4 h-4 text-zinc-500" />
            Configure Stages
          </button>
          <button
            onClick={() => setShowAddCampaignModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 shadow-xs transition"
          >
            <Mail className="w-4 h-4 text-zinc-500" />
            + New Campaign
          </button>
          <button
            onClick={() => setShowAddContactModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-semibold text-white shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            + Add Contact
          </button>
        </div>
      </div>

      {/* KPI Cards: Revenue Recovered, Conversions, and Deduplication */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Revenue Recovered (FR-CRM-18) */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-zinc-400 font-bold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              Revenue Recovered
            </span>
            <button
              onClick={() => setShowAvgDealModal(true)}
              className="text-[10px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded transition"
              title="Configure average deal value"
            >
              <Edit3 className="w-3 h-3" />
              ${revenueAnalytics?.average_deal_value || 250}/deal
            </button>
          </div>
          <div className="text-2xl font-black text-zinc-900 mt-2 font-mono">
            ${(revenueAnalytics?.total_revenue_recovered || 0).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5">
            <span className="font-semibold text-emerald-700">
              {revenueAnalytics?.total_conversions || 0} Deals Won / Booked
            </span>
            <span>across pipeline</span>
          </div>
        </div>

        {/* KPI 2: AI Voice Conversions */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-mono uppercase text-zinc-400 font-bold flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-indigo-600" />
            AI Voice Conversions
          </span>
          <div className="text-2xl font-black text-zinc-900 mt-2 font-mono">
            {revenueAnalytics?.ai_booked_calls || 0}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Appointments booked directly via voice triage calls
          </div>
        </div>

        {/* KPI 3: Deduplication & Legal Status */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-zinc-400 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Compliance & Hygiene
            </span>
            {duplicates.length > 0 && (
              <button
                onClick={() => setShowDuplicatesModal(true)}
                className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 font-semibold px-2 py-0.5 rounded-full hover:bg-amber-100 transition"
              >
                Review ({duplicates.length})
              </button>
            )}
          </div>
          <div className="text-2xl font-black text-zinc-900 mt-2 font-mono">
            {allContacts.filter((c) => c.is_callable !== false).length} / {allContacts.length}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
            <span className="text-emerald-700 font-semibold">TCPA Gate v2 Validated</span>
            <span>• {duplicates.length} duplicate groups</span>
          </div>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {actionMessage}
          </div>
          <button onClick={() => setActionMessage(null)}>
            <X className="w-3.5 h-3.5 text-emerald-600" />
          </button>
        </div>
      )}

      {/* Duplicate Warning Banner if any */}
      {duplicates.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>{duplicates.length} duplicate contact cluster(s) detected.</strong> Consolidate records to maintain continuous call logs and unified timeline history.
            </span>
          </div>
          <button
            onClick={() => setShowDuplicatesModal(true)}
            className="flex items-center gap-1 font-bold text-amber-900 underline hover:no-underline ml-4 whitespace-nowrap"
          >
            <GitMerge className="w-3.5 h-3.5" />
            Merge Duplicates
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`pb-3 text-xs font-bold transition-colors border-b-2 ${
              activeTab === "pipeline"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Visual Kanban Board
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`pb-3 text-xs font-bold transition-colors border-b-2 ${
              activeTab === "contacts"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            All Contacts ({Array.isArray(allContacts) ? allContacts.length : 0})
          </button>
          <button
            onClick={() => setActiveTab("campaigns")}
            className={`pb-3 text-xs font-bold transition-colors border-b-2 ${
              activeTab === "campaigns"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Email Campaigns ({Array.isArray(campaigns) ? campaigns.length : 0})
          </button>
        </div>

        {activeTab !== "campaigns" && (
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-400 w-48 sm:w-64"
            />
          </div>
        )}
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div className="text-center py-16 text-zinc-400 text-xs font-mono">
          Loading CRM pipeline...
        </div>
      )}

      {/* TAB 1: DYNAMIC VISUAL PIPELINE BOARD (FR-CRM-11) */}
      {!loading && activeTab === "pipeline" && pipelineData && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {currentStages.map((col) => {
            const stageContacts = (pipelineData.stages[col.key] || []).filter(
              (c) =>
                !searchQuery ||
                (c.name && c.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (c.phone && c.phone.includes(searchQuery)) ||
                (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
            );

            return (
              <div
                key={col.key}
                className="bg-zinc-50/70 border border-zinc-200 rounded-2xl p-3 flex flex-col min-w-[240px] max-w-xs"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${col.color}`}
                    >
                      {col.label}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      ({stageContacts.length})
                    </span>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[600px] pr-1">
                  {stageContacts.length === 0 ? (
                    <div className="h-24 flex items-center justify-center border border-dashed border-zinc-200 rounded-xl text-[11px] text-zinc-400">
                      No contacts in stage
                    </div>
                  ) : (
                    stageContacts.map((contact) => (
                      <div
                        key={contact.id}
                        onClick={() => handleOpenContactDetail(contact.id)}
                        className="bg-white border border-zinc-200/80 rounded-xl p-3 shadow-xs hover:border-zinc-400 hover:shadow-md cursor-pointer transition space-y-2"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <h4 className="text-xs font-bold text-zinc-900 leading-tight">
                            {contact.name}
                          </h4>
                          {contact.is_callable === false && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-50 border border-rose-200 text-rose-700 font-mono">
                              DNC
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 text-[11px] text-zinc-500 font-mono">
                          <div className="flex items-center gap-1 text-zinc-700">
                            <Phone className="w-3 h-3 text-zinc-400" />
                            {contact.phone}
                          </div>
                          {contact.email && (
                            <div className="flex items-center gap-1 truncate text-zinc-500">
                              <Mail className="w-3 h-3 text-zinc-400" />
                              <span className="truncate">{contact.email}</span>
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        {contact.tags && contact.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {contact.tags.slice(0, 3).map((tag, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                            {contact.tags.length > 3 && (
                              <span className="text-[9px] text-zinc-400">
                                +{contact.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Quick Stage Move Dropdown */}
                        <div
                          className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-zinc-400 font-mono">
                            {contact.call_count} call{contact.call_count !== 1 ? "s" : ""}
                          </span>
                          <select
                            value={col.key}
                            onChange={(e) => handleMoveStage(contact.id, e.target.value)}
                            className="bg-transparent border-0 text-zinc-500 font-semibold cursor-pointer hover:text-zinc-900 focus:outline-none"
                          >
                            {currentStages.map((s) => (
                              <option key={s.key} value={s.key}>
                                Move &rarr; {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: ALL CONTACTS TABLE */}
      {!loading && activeTab === "contacts" && (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium">
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Phone / Email</th>
                <th className="py-3 px-4">Stage</th>
                <th className="py-3 px-4">Callable Status</th>
                <th className="py-3 px-4">Tags</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(Array.isArray(allContacts) ? allContacts : [])
                .filter(
                  (c) =>
                    !searchQuery ||
                    (c.name && c.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (c.phone && c.phone.includes(searchQuery)) ||
                    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .map((contact) => (
                  <tr
                    key={contact.id}
                    onClick={() => handleOpenContactDetail(contact.id)}
                    className="hover:bg-zinc-50/80 cursor-pointer transition"
                  >
                    <td className="py-3 px-4 font-bold text-zinc-900">{contact.name}</td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-zinc-800">{contact.phone}</div>
                      {contact.email && <div className="text-[11px] text-zinc-400">{contact.email}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-700 capitalize">
                        {contact.stage ? contact.stage.replace("_", " ") : "New Lead"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {contact.is_callable !== false ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Callable
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          Non-Callable
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map((t, i) => (
                          <span
                            key={i}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] uppercase text-zinc-500">
                      {(contact.source || "manual").replace("_", " ")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenContactDetail(contact.id);
                        }}
                        className="text-zinc-600 hover:text-zinc-900 font-semibold text-[11px]"
                      >
                        Details &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: EMAIL CAMPAIGNS */}
      {!loading && activeTab === "campaigns" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 uppercase">
                      {camp.trigger_event.replace("_", " ")}
                    </span>
                    <span className="text-xs font-mono text-zinc-400">
                      Sent to: <strong>{camp.sent_count}</strong>
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900">{camp.name}</h3>
                  <p className="text-xs text-zinc-500 line-clamp-1">Subject: {camp.subject}</p>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-zinc-400">
                    Target: {camp.target_stage ? camp.target_stage.replace("_", " ") : "All"}
                  </span>
                  <button
                    onClick={() => handleSendBroadcast(camp.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 text-white rounded-xl text-xs font-semibold hover:bg-zinc-800 transition shadow-xs"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Send Broadcast
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONTACT DETAIL DRAWER WITH CONSENT & DISCLOSURES (FR-CRM-14 & FR-CRM-19) */}
      {selectedContactId && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-white border-l border-zinc-200 shadow-2xl z-50 flex flex-col justify-between">
          {/* Drawer Header */}
          <div className="p-5 border-b border-zinc-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">
                Contact Profile & AI Call Hub
              </span>
              <h2 className="text-base font-bold text-zinc-900">
                {contactDetail?.name || "Loading..."}
              </h2>
            </div>
            <button
              onClick={() => {
                setSelectedContactId(null);
                setContactDetail(null);
              }}
              className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Tabs */}
          <div className="flex border-b border-zinc-200 px-5 text-xs font-semibold">
            <button
              onClick={() => setDrawerTab("overview")}
              className={`py-2.5 mr-4 border-b-2 transition ${
                drawerTab === "overview"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Overview & Notes
            </button>
            <button
              onClick={() => setDrawerTab("calls")}
              className={`py-2.5 mr-4 border-b-2 transition ${
                drawerTab === "calls"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Recorded Calls ({contactDetail?.calls.length || 0})
            </button>
            <button
              onClick={() => {
                setDrawerTab("consent");
                if (contactDetail && !contactConsent) {
                  handleLoadConsentAudit(contactDetail.id);
                }
              }}
              className={`py-2.5 border-b-2 transition flex items-center gap-1 ${
                drawerTab === "consent"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Consent Evidence (TCPA)
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {loadingDetail || !contactDetail ? (
              <div className="text-center py-20 text-zinc-400 text-xs font-mono">
                Loading contact profile...
              </div>
            ) : (
              <>
                {/* TAB: OVERVIEW */}
                {drawerTab === "overview" && (
                  <div className="space-y-5">
                    {/* Contact Quick Details */}
                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-400 text-[10px] uppercase font-mono block">Phone</span>
                          <span className="font-bold text-zinc-900 font-mono">{contactDetail.phone}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400 text-[10px] uppercase font-mono block">Email</span>
                          <span className="font-semibold text-zinc-700">
                            {contactDetail.email || "None recorded"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400 text-[10px] uppercase font-mono block">Stage</span>
                          <select
                            value={contactDetail.stage}
                            onChange={(e) => handleMoveStage(contactDetail.id, e.target.value)}
                            className="mt-0.5 text-xs bg-white border border-zinc-300 rounded px-2 py-1 font-semibold text-zinc-800"
                          >
                            {currentStages.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <span className="text-zinc-400 text-[10px] uppercase font-mono block">Callable Status</span>
                          <span
                            className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                              contactDetail.is_callable !== false ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {contactDetail.is_callable !== false ? "✓ Gate v2 Callable" : "✕ Non-Callable"}
                          </span>
                        </div>
                      </div>

                      {contactDetail.notes && (
                        <div className="pt-2 border-t border-zinc-200 text-xs text-zinc-600">
                          <span className="text-zinc-400 text-[10px] uppercase font-mono block">Notes</span>
                          {contactDetail.notes}
                        </div>
                      )}
                    </div>

                    {/* Timeline History */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        Interaction Timeline
                      </h3>
                      <div className="space-y-2">
                        {contactDetail.timeline.map((ev) => (
                          <div
                            key={ev.id}
                            className="text-xs p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-0.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-zinc-800">{ev.title}</span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {new Date(ev.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-zinc-500 text-[11px]">{ev.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: CALLS & TRANSCRIPTS (WITH DISCLOSURE FLAGS FR-CRM-19) */}
                {drawerTab === "calls" && (
                  <div className="space-y-3">
                    {contactDetail.calls.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-zinc-200 text-center text-xs text-zinc-400">
                        No voice calls recorded yet for this contact.
                      </div>
                    ) : (
                      contactDetail.calls.map((call) => (
                        <div
                          key={call.call_id}
                          className="bg-white border border-zinc-200 rounded-xl p-3.5 space-y-2.5 shadow-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-900">
                                {call.direction === "outbound" ? "Outbound Call" : "Inbound Call"}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-400">
                                {call.duration_s}s ({call.billable_minutes} min billable)
                              </span>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize ${
                                call.sentiment_label === "positive"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : call.sentiment_label === "negative"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                              }`}
                            >
                              {call.sentiment_label}
                            </span>
                          </div>

                          {/* Mandatory Disclosure Badges (FR-CRM-19) */}
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              AI Voice Disclosed
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-medium">
                              <ShieldCheck className="w-3 h-3 text-blue-600" />
                              Recording Disclosed
                            </span>
                          </div>

                          {/* Call Summary */}
                          {call.summary && (
                            <p className="text-xs text-zinc-600 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100 leading-relaxed">
                              {call.summary}
                            </p>
                          )}

                          {/* Audio Player Controls */}
                          {call.recording_url ? (
                            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-100">
                              <button
                                onClick={() => toggleAudio(call.recording_url!)}
                                className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 text-white rounded text-xs font-semibold shadow-xs hover:bg-zinc-800 transition"
                              >
                                {playingAudioUrl === call.recording_url && isPlaying ? (
                                  <>
                                    <Pause className="w-3 h-3" /> Pause
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-3 h-3" /> Play Audio
                                  </>
                                )}
                              </button>

                              <div className="flex items-center gap-1 text-[10px] font-mono">
                                <span className="text-zinc-500 mr-1">Speed:</span>
                                {([1, 1.5, 2] as const).map((spd) => (
                                  <button
                                    key={spd}
                                    onClick={() => changePlaybackSpeed(spd)}
                                    className={`px-1.5 py-0.5 rounded ${
                                      playbackSpeed === spd
                                        ? "bg-zinc-800 text-white"
                                        : "bg-white text-zinc-600 border border-zinc-200"
                                    }`}
                                  >
                                    {spd}x
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-zinc-400 italic">
                              Audio recording processing or not available
                            </div>
                          )}

                          {/* Transcript Collapsible */}
                          {call.transcript && call.transcript.length > 0 && (
                            <details className="text-xs pt-1">
                              <summary className="cursor-pointer text-indigo-600 font-semibold hover:underline">
                                View Full Transcript ({call.transcript.length} turns)
                              </summary>
                              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto bg-zinc-50 p-2.5 rounded-lg border border-zinc-200 text-[11px]">
                                {call.transcript.map((line, idx) => (
                                  <div key={idx} className="leading-snug">
                                    <strong className="text-zinc-800 uppercase text-[9px] mr-1">
                                      {line.role}:
                                    </strong>
                                    <span className="text-zinc-600">{line.text}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB: CONSENT EVIDENTIARY PANEL (FR-CRM-14) */}
                {drawerTab === "consent" && (
                  <div className="space-y-4">
                    {loadingConsent || !contactConsent ? (
                      <div className="text-center py-10 text-xs font-mono text-zinc-400">
                        Querying evidentiary compliance records...
                      </div>
                    ) : (
                      <>
                        {/* Status Summary Banner */}
                        <div
                          className={`p-3.5 rounded-xl border ${
                            contactConsent.is_callable && !contactConsent.tenant_suppressed
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : "bg-rose-50 border-rose-200 text-rose-900"
                          } text-xs space-y-1`}
                        >
                          <div className="font-bold flex items-center gap-1.5">
                            {contactConsent.is_callable && !contactConsent.tenant_suppressed ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                Validated Callable under TCPA / FCC Gate v2
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                                Blocked / Suppressed from Automated Outbound Calling
                              </>
                            )}
                          </div>
                          {contactConsent.suppression_reason && (
                            <div className="text-[11px] text-rose-700 font-mono">
                              Reason: {contactConsent.suppression_reason}
                            </div>
                          )}
                        </div>

                        {/* Evidentiary Records List */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-zinc-800 block">
                            Consent Records on File ({contactConsent.consents.length})
                          </span>
                          {contactConsent.consents.length === 0 ? (
                            <div className="p-3 rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-400">
                              No prior express written consent recorded for this number.
                            </div>
                          ) : (
                            contactConsent.consents.map((cr) => (
                              <div
                                key={cr.id}
                                className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1.5 text-xs font-mono"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-zinc-900">
                                    Category {cr.category} ({cr.method})
                                  </span>
                                  <span className="text-[10px] text-zinc-400">
                                    {new Date(cr.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-600">
                                  Seller: <strong>{cr.seller_name || "VedaVoice Lead Form"}</strong>
                                </div>
                                {cr.ip && (
                                  <div className="text-[10px] text-zinc-400">
                                    IP: {cr.ip} • Form: {cr.form_url || "Hosted Form"}
                                  </div>
                                )}
                                <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-200 flex justify-between">
                                  <span>5-Yr Retention: {cr.retention_until ? new Date(cr.retention_until).toLocaleDateString() : "Active"}</span>
                                  <span>AI Disclosed: {cr.ai_voice_disclosed ? "Yes" : "No"}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* 1-Click Audit Export */}
                        <a
                          href={contactConsent.audit_export_url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition shadow-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Download Legal Audit Export (JSON/Audit)
                        </a>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
            <button
              onClick={() => contactDetail && handleDeleteContact(contactDetail.id)}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Contact
            </button>
            <button
              onClick={() => {
                setSelectedContactId(null);
                setContactDetail(null);
              }}
              className="px-4 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 hover:bg-zinc-100"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE STAGES (FR-CRM-11) */}
      {showStagesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">Configure Pipeline Stages</h3>
              <button onClick={() => setShowStagesModal(false)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            {/* List current stages */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {currentStages.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs"
                >
                  <span className={`px-2 py-0.5 rounded-full font-bold border ${s.color}`}>
                    {s.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-400">
                      key: {s.key} {s.is_system ? "(system)" : ""}
                    </span>
                    {!s.is_system && (
                      <button
                        onClick={() => handleDeleteStage(s.key)}
                        className="text-rose-600 hover:text-rose-700 font-semibold text-[10px]"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add New Custom Stage Form */}
            <form onSubmit={handleCreateStage} className="pt-3 border-t border-zinc-200 space-y-3 text-xs">
              <span className="font-bold text-zinc-900 block">Add Custom Stage</span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-600 mb-1">Stage Slug Key *</label>
                  <input
                    type="text"
                    required
                    placeholder="contract_out"
                    value={newStage.stage_key}
                    onChange={(e) => setNewStage({ ...newStage, stage_key: e.target.value })}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-600 mb-1">Display Label *</label>
                  <input
                    type="text"
                    required
                    placeholder="Contract Out"
                    value={newStage.label}
                    onChange={(e) => setNewStage({ ...newStage, label: e.target.value })}
                    className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStagesModal(false)}
                  className="px-3 py-1.5 border border-zinc-200 rounded-lg text-zinc-600"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-zinc-900 text-white font-bold rounded-lg hover:bg-zinc-800"
                >
                  Add Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DUPLICATE MERGE (FR-CRM-13) */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-zinc-900">Merge Duplicate Contacts</h3>
              </div>
              <button onClick={() => setShowDuplicatesModal(false)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {duplicates.map((grp, idx) => (
                <div key={idx} className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono font-bold text-zinc-700 block">
                    Duplicate {grp.match_type}: <strong>{grp.match_value}</strong> ({grp.contacts.length} leads)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {grp.contacts.map((c, i) => (
                      <div key={c.id} className="p-2.5 bg-white border border-zinc-200 rounded-lg space-y-1">
                        <div className="font-bold text-zinc-900">{c.name}</div>
                        <div className="font-mono text-zinc-500 text-[10px]">{c.phone}</div>
                        <div className="text-[10px] text-zinc-400">Stage: {c.stage}</div>
                        {i === 0 ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold">
                            Primary (Survivor)
                          </span>
                        ) : (
                          <button
                            onClick={() => handleMergeDuplicate(grp.contacts[0].id, c.id)}
                            className="w-full mt-1 px-2 py-1 bg-amber-600 text-white rounded text-[10px] font-bold hover:bg-amber-700 transition"
                          >
                            Merge into Primary
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-200">
              <button
                onClick={() => setShowDuplicatesModal(false)}
                className="px-4 py-2 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SET AVERAGE DEAL VALUE (FR-CRM-18) */}
      {showAvgDealModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">Average Deal / Job Value</h3>
              <button onClick={() => setShowAvgDealModal(false)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            <form onSubmit={handleUpdateAvgDeal} className="space-y-3 text-xs">
              <p className="text-zinc-500 text-[11px]">
                Used to calculate estimated revenue recovered from voice calls and appointment bookings.
              </p>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Average Value (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-zinc-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={avgDealInput}
                    onChange={(e) => setAvgDealInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 border border-zinc-300 rounded-xl font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAvgDealModal(false)}
                  className="px-3 py-1.5 border border-zinc-200 rounded-xl text-zinc-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800"
                >
                  Save Value
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CONTACT */}
      {showAddContactModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">Add New Contact / Lead</h3>
              <button onClick={() => setShowAddContactModal(false)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            <form onSubmit={handleCreateContact} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Jane Doe"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Phone Number (E.164) *</label>
                <input
                  type="text"
                  required
                  placeholder="+15125550199"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="jane@example.com"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-1 focus:ring-zinc-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Stage</label>
                  <select
                    value={newContact.stage}
                    onChange={(e) => setNewContact({ ...newContact, stage: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                  >
                    {currentStages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Source</label>
                  <select
                    value={newContact.source}
                    onChange={(e) => setNewContact({ ...newContact, source: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                  >
                    <option value="manual">Manual Entry</option>
                    <option value="website_form">Website Form</option>
                    <option value="google_sheets">Google Sheets</option>
                    <option value="meta_ads">Meta Lead Ads</option>
                    <option value="csv_upload">CSV Upload</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="Interested, Callback, VIP"
                  value={newContact.tags}
                  onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Initial inquiry details or preferences..."
                  value={newContact.notes}
                  onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="px-4 py-2 border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition shadow-xs"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CAMPAIGN */}
      {showAddCampaignModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <h3 className="text-sm font-bold text-zinc-900">New Email Sequence Template</h3>
              <button onClick={() => setShowAddCampaignModal(false)}>
                <X className="w-4 h-4 text-zinc-400 hover:text-zinc-700" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Sequence Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Post-Call Demo Follow-up"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Subject Line *</label>
                <input
                  type="text"
                  required
                  placeholder="Thanks for speaking with VedaVoice AI"
                  value={newCampaign.subject}
                  onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Target Stage</label>
                <select
                  value={newCampaign.target_stage}
                  onChange={(e) => setNewCampaign({ ...newCampaign, target_stage: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none"
                >
                  {currentStages.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Email Body (supports {"{{name}}"} variable) *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newCampaign.body_html}
                  onChange={(e) => setNewCampaign({ ...newCampaign, body_html: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-xl font-mono text-[11px] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddCampaignModal(false)}
                  className="px-4 py-2 border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition shadow-xs"
                >
                  Create Sequence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
