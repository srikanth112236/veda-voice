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
  MessageSquare,
  Send,
  GripVertical,
  ArrowRight,
  PhoneCall,
  Zap,
  Flame,
  ShieldAlert,
  Check,
  Activity,
  Bell,
  ChevronRight,
  Siren,
  Thermometer,
} from "lucide-react";
import { formatHumanReadableTag } from "@/lib/tagFormatter";

interface SentimentTelemetry {
  label: string;
  score: number;
  badgeClass: string;
  indicator: string;
  mood: string;
  recommendation: string;
}

function getContactSentimentTelemetry(contact: {
  tags?: string[];
  stage?: string;
  calls?: Array<{ sentiment_label?: string; summary?: string }>;
  call_count?: number;
}): SentimentTelemetry {
  const tags = contact.tags || [];
  const isEmergency = tags.some((t) => {
    const lower = t.toLowerCase();
    return (
      lower.includes("emerg") ||
      lower.includes("urgent") ||
      lower.includes("flood") ||
      lower.includes("gas") ||
      lower.includes("burst")
    );
  });

  if (isEmergency) {
    return {
      label: "Emergency Triage",
      score: 98,
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
      indicator: "🚨",
      mood: "Critical Urgent Need",
      recommendation: "Immediate tech dispatch & priority LiveKit voice callback required.",
    };
  }

  const calls = contact.calls || [];
  if (calls.length > 0) {
    const positiveCount = calls.filter((c) => c.sentiment_label === "positive").length;
    const negativeCount = calls.filter((c) => c.sentiment_label === "negative").length;

    if (positiveCount > negativeCount) {
      return {
        label: "Hot Lead",
        score: Math.min(96, 80 + positiveCount * 5),
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        indicator: "🔥",
        mood: "High Conversion Intent",
        recommendation: "AI triage qualified customer intent. Ready for booking confirmation.",
      };
    } else if (negativeCount > 0) {
      return {
        label: "Hesitant Lead",
        score: Math.max(38, 55 - negativeCount * 8),
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
        indicator: "⚠️",
        mood: "Objection / Price Sensitive",
        recommendation: "Customer raised friction during AI call. Recommend supervisor follow-up.",
      };
    }
  }

  if (contact.stage === "booked" || contact.stage === "closed") {
    return {
      label: "Confirmed Booking",
      score: 92,
      badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
      indicator: "📅",
      mood: "Slot Reserved & Synced",
      recommendation: "Appointment locked in calendar. Automated SMS reminders active.",
    };
  }

  if (contact.call_count && contact.call_count > 0) {
    return {
      label: "Engaged Prospect",
      score: 75,
      badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
      indicator: "💬",
      mood: "Interactive Triage",
      recommendation: "Contact had recent dialogue. Ready for follow-up quote or dispatch.",
    };
  }

  return {
    label: "Warm Inquiry",
    score: 65,
    badgeClass: "bg-zinc-100 text-zinc-700 border-zinc-200",
    indicator: "✨",
    mood: "Awaiting Outbound Callback",
    recommendation: "1-click AI Speed-to-Lead callback recommended within 5 minutes.",
  };
}

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

  // Drag-and-Drop & Stage Confirmation State
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    contactId: string;
    contactName: string;
    fromStage: string;
    fromStageLabel: string;
    toStage: string;
    toStageLabel: string;
  } | null>(null);
  const [movingStage, setMovingStage] = useState(false);

  // Telnyx Two-Way SMS State
  const [smsText, setSmsText] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsStatusMsg, setSmsStatusMsg] = useState<string | null>(null);

  const handleSendSms = async () => {
    if (!contactDetail || !smsText.trim()) return;
    setSendingSms(true);
    setSmsStatusMsg(null);
    try {
      await api.sendTelnyxSMS({
        from_number: "", // Backend auto-selects tenant's registered DID
        to_number: contactDetail.phone,
        text: smsText.trim(),
      });
      setSmsStatusMsg("Dispatched via Telnyx!");
      setSmsText("");
      const updated = await api.getCRMContactDetail(contactDetail.id);
      setContactDetail(updated);
    } catch (err: any) {
      setSmsStatusMsg(`Send failed: ${err?.message || err}`);
    } finally {
      setSendingSms(false);
    }
  };

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

  // High-Value CRM Features State
  const [kanbanFilter, setKanbanFilter] = useState<"all" | "callable" | "emergency" | "booked" | "uncontacted">("all");
  const [callingContactId, setCallingContactId] = useState<string | null>(null);

  // 1-Click AI Speed-to-Lead Callback Dispatcher
  const handleTriggerAiCallback = async (contact: {
    id: string;
    name?: string;
    phone: string;
    is_callable?: boolean;
  }) => {
    if (!contact.phone) {
      alert("This contact does not have a valid phone number.");
      return;
    }
    if (contact.is_callable === false) {
      const proceed = confirm(
        "Notice: This contact is marked as non-callable or missing express consent. TCPA gate v2 may suppress this call. Do you still wish to submit the dispatch request?"
      );
      if (!proceed) return;
    }
    setCallingContactId(contact.id);
    try {
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const campaign = await api.createVoiceCampaign({
        name: `Speed-to-Lead: ${contact.name || contact.phone} (${timeStr})`,
        purpose: "speed_to_lead",
        prompt_variant: "standard",
        max_attempts_per_contact: 1,
        contacts: [
          {
            phone_number: contact.phone,
            recipient_name: contact.name || "Customer",
            contact_id: contact.id,
            metadata_json: { contact_id: contact.id, trigger: "crm_instant_callback" },
          },
        ],
      });
      const dispatchRes = await api.runVoiceCampaign(campaign.id);
      if (dispatchRes.dispatches_succeeded > 0) {
        setActionMessage(
          `AI speed-to-lead call dispatched to ${contact.name || contact.phone}! Carrier acknowledged SIP trunk invite.`
        );
      } else {
        setActionMessage(
          `AI campaign queued. Contacts eligible: ${dispatchRes.eligible_contacts_found}, carrier accepted: ${dispatchRes.dispatches_succeeded}.`
        );
      }
      setTimeout(() => setActionMessage(null), 5000);
      await fetchCRMData();
      if (selectedContactId === contact.id) {
        const updated = await api.getCRMContactDetail(contact.id);
        setContactDetail(updated);
      }
    } catch (err: any) {
      alert(`Could not trigger AI callback: ${err?.message || err}`);
    } finally {
      setCallingContactId(null);
    }
  };

  // 1-Click Emergency Tag & Technician Dispatch Toggle
  const handleToggleEmergency = async () => {
    if (!contactDetail) return;
    const currentTags = contactDetail.tags || [];
    const isEmergency = currentTags.some((t) => {
      const lower = t.toLowerCase();
      return lower.includes("emerg") || lower.includes("urgent");
    });

    let newTags: string[];
    if (isEmergency) {
      newTags = currentTags.filter((t) => {
        const lower = t.toLowerCase();
        return !lower.includes("emerg") && !lower.includes("urgent");
      });
    } else {
      newTags = [...currentTags, "emergency_dispatch", "urgent_triage"];
    }

    try {
      await api.updateCRMContact(contactDetail.id, { tags: newTags });
      setContactDetail({ ...contactDetail, tags: newTags });
      setActionMessage(
        isEmergency
          ? "Emergency status cleared. Contact returned to standard priority."
          : "🚨 Lead marked for EMERGENCY priority technician dispatch!"
      );
      setTimeout(() => setActionMessage(null), 4000);
      fetchCRMData();
    } catch (err: any) {
      alert(`Failed to update emergency status: ${err?.message || err}`);
    }
  };

  // Filter Helper for Search & Quick Filter Chips
  const filterContact = (c: ContactItem) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (kanbanFilter === "callable") {
      return c.is_callable !== false;
    }
    if (kanbanFilter === "emergency") {
      return (c.tags || []).some((t) => {
        const lower = t.toLowerCase();
        return lower.includes("emerg") || lower.includes("urgent") || lower.includes("flood");
      });
    }
    if (kanbanFilter === "booked") {
      return c.stage === "booked" || (c.tags || []).some((t) => t.toLowerCase().includes("book"));
    }
    if (kanbanFilter === "uncontacted") {
      return !c.call_count || c.call_count === 0;
    }
    return true;
  };

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

      // Cross-navigation from Calls Explorer (?contact_id=... or ?phone=...)
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const targetContactId = params.get("contact_id");
        const targetPhone = params.get("phone");
        if (targetContactId) {
          handleOpenContactDetail(targetContactId);
        } else if (targetPhone) {
          const matched = contactList.find(
            (c: ContactItem) => c.phone === targetPhone || c.phone.includes(targetPhone.slice(-7))
          );
          if (matched) {
            handleOpenContactDetail(matched.id);
          } else {
            setSearchQuery(targetPhone);
          }
        }
      }
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

  const requestStageMove = (
    contact: { id: string; name?: string; phone?: string; stage?: string },
    targetStageKey: string
  ) => {
    const currentKey = contact.stage || "new_lead";
    if (currentKey === targetStageKey) return;
    const fromStageLabel = currentStages.find((s) => s.key === currentKey)?.label || currentKey;
    const toStageLabel = currentStages.find((s) => s.key === targetStageKey)?.label || targetStageKey;
    setPendingMove({
      contactId: contact.id,
      contactName: contact.name || contact.phone || "Contact",
      fromStage: currentKey,
      fromStageLabel,
      toStage: targetStageKey,
      toStageLabel,
    });
  };

  const handleConfirmMove = async () => {
    if (!pendingMove) return;
    setMovingStage(true);
    try {
      await api.updateCRMContact(pendingMove.contactId, { stage: pendingMove.toStage });
      await fetchCRMData();
      if (contactDetail && contactDetail.id === pendingMove.contactId) {
        setContactDetail({ ...contactDetail, stage: pendingMove.toStage });
      }
      setActionMessage(`Moved ${pendingMove.contactName} to ${pendingMove.toStageLabel}`);
      setTimeout(() => setActionMessage(null), 3500);
    } catch (err: any) {
      alert(`Could not move contact: ${err?.message || err}`);
    } finally {
      setMovingStage(false);
      setPendingMove(null);
    }
  };

  const handleDragStart = (e: React.DragEvent, contactId: string) => {
    e.dataTransfer.setData("text/plain", contactId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedContactId(contactId);
  };

  const handleDragEnd = () => {
    setDraggedContactId(null);
    setDragOverStage(null);
  };

  const handleDragOverColumn = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stageKey) {
      setDragOverStage(stageKey);
    }
  };

  const handleDragLeaveColumn = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverStage(null);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetStageKey: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const contactId = e.dataTransfer.getData("text/plain") || draggedContactId;
    if (!contactId) return;

    let contact: ContactItem | undefined = allContacts.find((c) => c.id === contactId);
    if (!contact && pipelineData) {
      for (const stg of Object.values(pipelineData.stages)) {
        const found = stg.find((c) => c.id === contactId);
        if (found) {
          contact = found;
          break;
        }
      }
    }
    if (!contact) return;

    requestStageMove(contact, targetStageKey);
  };

  const handleMoveStage = async (contactId: string, newStage: string) => {
    const contact = allContacts.find((c) => c.id === contactId) || (contactDetail?.id === contactId ? contactDetail : null);
    if (contact) {
      requestStageMove(contact, newStage);
      return;
    }
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

      {/* Quick Filter Toolbar for Pipeline & Contacts */}
      {activeTab !== "campaigns" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[10.5px] font-mono text-zinc-400 font-bold uppercase shrink-0">Filter:</span>
          {[
            { id: "all", label: "All Contacts", icon: Layers, count: allContacts.length },
            {
              id: "callable",
              label: "TCPA Callable",
              icon: ShieldCheck,
              count: allContacts.filter((c) => c.is_callable !== false).length,
            },
            {
              id: "emergency",
              label: "Emergency Triage",
              icon: Siren,
              count: allContacts.filter((c) =>
                (c.tags || []).some((t) => {
                  const lower = t.toLowerCase();
                  return lower.includes("emerg") || lower.includes("urgent");
                })
              ).length,
            },
            {
              id: "booked",
              label: "Booked Slots",
              icon: Calendar,
              count: allContacts.filter(
                (c) => c.stage === "booked" || (c.tags || []).some((t) => t.toLowerCase().includes("book"))
              ).length,
            },
            {
              id: "uncontacted",
              label: "Zero Calls",
              icon: PhoneCall,
              count: allContacts.filter((c) => !c.call_count || c.call_count === 0).length,
            },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setKanbanFilter(pill.id as any)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                kanbanFilter === pill.id
                  ? "bg-zinc-900 text-white shadow-xs font-semibold"
                  : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <pill.icon className="w-3 h-3" />
              <span>{pill.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  kanbanFilter === pill.id ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {pill.count}
              </span>
            </button>
          ))}
        </div>
      )}

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
            const stageContacts = (pipelineData.stages[col.key] || []).filter(filterContact);

            return (
              <div
                key={col.key}
                onDragOver={(e) => handleDragOverColumn(e, col.key)}
                onDragLeave={handleDragLeaveColumn}
                onDrop={(e) => handleDropOnColumn(e, col.key)}
                className={`border rounded-2xl p-3 flex flex-col min-w-[260px] max-w-xs transition-all duration-200 ${
                  dragOverStage === col.key
                    ? "bg-purple-50/70 border-purple-400 ring-2 ring-purple-300 ring-offset-1 shadow-md"
                    : "bg-zinc-50/70 border-zinc-200"
                }`}
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
                    <div
                      className={`h-24 flex flex-col items-center justify-center border border-dashed rounded-xl text-[11px] transition-colors ${
                        dragOverStage === col.key
                          ? "border-purple-400 bg-purple-50/50 text-purple-700 font-semibold"
                          : "border-zinc-200 text-zinc-400"
                      }`}
                    >
                      {dragOverStage === col.key ? (
                        <span>Drop to move here</span>
                      ) : (
                        <span>No contacts in stage</span>
                      )}
                    </div>
                  ) : (
                    stageContacts.map((contact) => {
                      const sentiment = getContactSentimentTelemetry(contact);
                      return (
                        <div
                          key={contact.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, contact.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleOpenContactDetail(contact.id)}
                          className={`group bg-white border rounded-xl p-3 shadow-xs hover:border-purple-300 hover:shadow-md cursor-grab active:cursor-grabbing transition-all duration-150 space-y-2.5 relative select-none ${
                            draggedContactId === contact.id
                              ? "opacity-40 border-dashed border-purple-400"
                              : "border-zinc-200/90"
                          }`}
                        >
                          {/* Header: Drag Grip, Name, DNC/Callable Pill */}
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <GripVertical className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-500 shrink-0 transition-colors" />
                              <h4 className="text-xs font-bold text-zinc-900 group-hover:text-purple-700 transition-colors truncate">
                                {contact.name || "Unnamed Contact"}
                              </h4>
                            </div>
                            {contact.is_callable === false ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-mono font-medium shrink-0">
                                DNC
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-medium shrink-0">
                                ✓ Gate v2
                              </span>
                            )}
                          </div>

                          {/* Emotional Temperature & Conversion Intent Pill */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[9.5px] px-2 py-0.5 rounded-md border font-medium flex items-center gap-1 ${sentiment.badgeClass}`}
                              title={`AI Temperature: ${sentiment.score}/100 - ${sentiment.mood}`}
                            >
                              <span>{sentiment.indicator}</span>
                              <span>{sentiment.label}</span>
                              <span className="font-mono text-[9px] opacity-80">{sentiment.score}°</span>
                            </span>
                          </div>

                          {/* Phone & Email */}
                          <div className="space-y-1 text-[11px] font-mono">
                            <div className="flex items-center gap-1.5 text-zinc-700 font-semibold">
                              <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>{contact.phone}</span>
                            </div>
                            {contact.email && (
                              <div className="flex items-center gap-1.5 truncate text-zinc-500 text-[10.5px]">
                                <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                                <span className="truncate">{contact.email}</span>
                              </div>
                            )}
                          </div>

                          {/* Human-Readable Tags */}
                          {contact.tags && contact.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {contact.tags.slice(0, 3).map((tag, idx) => {
                                const formatted = formatHumanReadableTag(tag);
                                return (
                                  <span
                                    key={idx}
                                    className={`text-[9.5px] px-2 py-0.5 rounded-md border font-medium ${formatted.color}`}
                                  >
                                    {formatted.label}
                                  </span>
                                );
                              })}
                              {contact.tags.length > 3 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-500 font-mono">
                                  +{contact.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Footer: AI Speed-to-Lead Callback, Call telemetry & Manual stage move trigger */}
                          <div
                            className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={callingContactId === contact.id}
                              onClick={() => handleTriggerAiCallback(contact)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-semibold transition-colors disabled:opacity-50"
                              title="Dispatch instant 1-click AI voice call (Speed-to-lead)"
                            >
                              {callingContactId === contact.id ? (
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <Zap className="w-2.5 h-2.5 fill-purple-600 text-purple-600" />
                              )}
                              <span>{callingContactId === contact.id ? "Dialing..." : "AI Call"}</span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              <span className="text-zinc-500 font-mono flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-zinc-400" />
                                {contact.call_count}
                              </span>
                              <select
                                value={col.key}
                                onChange={(e) => requestStageMove(contact, e.target.value)}
                                className="bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-600 font-medium cursor-pointer hover:text-zinc-900 focus:outline-none transition text-[10px]"
                                title="Move to another stage"
                              >
                                {currentStages.map((s) => (
                                  <option key={s.key} value={s.key}>
                                    &rarr; {s.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })
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
                <th className="py-3 px-4">Emotional Temp</th>
                <th className="py-3 px-4">Callable Status</th>
                <th className="py-3 px-4">Tags</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(Array.isArray(allContacts) ? allContacts : [])
                .filter(filterContact)
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
                      {(() => {
                        const sentiment = getContactSentimentTelemetry(contact);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border font-medium ${sentiment.badgeClass}`}
                            title={`AI Temperature: ${sentiment.score}/100 - ${sentiment.mood}`}
                          >
                            <span>{sentiment.indicator}</span>
                            <span>{sentiment.label}</span>
                            <span className="font-mono text-[9px] opacity-75">{sentiment.score}°</span>
                          </span>
                        );
                      })()}
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
                        {(contact.tags || []).map((t, i) => {
                          const formatted = formatHumanReadableTag(t);
                          return (
                            <span
                              key={i}
                              className={`text-[9.5px] px-2 py-0.5 rounded-md border font-medium ${formatted.color}`}
                            >
                              {formatted.label}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] uppercase text-zinc-500">
                      {(contact.source || "manual").replace("_", " ")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTriggerAiCallback(contact);
                          }}
                          disabled={callingContactId === contact.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-semibold text-[11px] transition disabled:opacity-50"
                          title="Trigger 1-click AI Speed-to-lead callback"
                        >
                          {callingContactId === contact.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3 fill-purple-600 text-purple-600" />
                          )}
                          <span>{callingContactId === contact.id ? "Calling..." : "AI Call"}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenContactDetail(contact.id);
                          }}
                          className="text-zinc-600 hover:text-zinc-900 font-semibold text-[11px]"
                        >
                          Details &rarr;
                        </button>
                      </div>
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
            <div className="flex items-center gap-2">
              {contactDetail && (
                <button
                  type="button"
                  disabled={callingContactId === contactDetail.id}
                  onClick={() => handleTriggerAiCallback(contactDetail)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition"
                  title="Dispatch 1-click live voice triage call via LiveKit SIP trunk"
                >
                  {callingContactId === contactDetail.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PhoneCall className="w-3.5 h-3.5" />
                  )}
                  <span>{callingContactId === contactDetail.id ? "Connecting..." : "Trigger AI Callback"}</span>
                </button>
              )}
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
                    {/* Widget 1: AI Conversion Temperature & Emotional Intelligence */}
                    {(() => {
                      const sentiment = getContactSentimentTelemetry(contactDetail);
                      const isEmergency = (contactDetail.tags || []).some((t) => {
                        const lower = t.toLowerCase();
                        return lower.includes("emerg") || lower.includes("urgent");
                      });
                      return (
                        <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                                <Activity className="w-4 h-4 text-purple-600" />
                              </span>
                              <div>
                                <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold block">
                                  AI Emotional Intelligence & Score
                                </span>
                                <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                                  <span>{sentiment.indicator}</span>
                                  <span>{sentiment.label}</span>
                                  <span className="text-zinc-400 font-normal">({sentiment.mood})</span>
                                </h4>
                              </div>
                            </div>
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${sentiment.badgeClass}`}
                            >
                              {sentiment.score} / 100
                            </span>
                          </div>

                          {/* Conversion Intent Progress Bar */}
                          <div className="space-y-1.5">
                            <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden flex">
                              <div
                                className={`h-full transition-all duration-500 rounded-full ${
                                  sentiment.score >= 80
                                    ? "bg-emerald-500"
                                    : sentiment.score >= 60
                                    ? "bg-blue-500"
                                    : "bg-amber-500"
                                }`}
                                style={{ width: `${sentiment.score}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-snug">
                              <strong className="text-zinc-700">AI Recommendation:</strong>{" "}
                              {sentiment.recommendation}
                            </p>
                          </div>

                          {/* 1-Click Fast-Track Emergency Dispatch Toggle */}
                          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <Siren
                                className={`w-3.5 h-3.5 ${
                                  isEmergency ? "text-rose-600 animate-pulse" : "text-zinc-400"
                                }`}
                              />
                              <span className={isEmergency ? "text-rose-700 font-bold" : "text-zinc-500"}>
                                {isEmergency ? "Emergency Triage Active" : "Standard Priority Lead"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleToggleEmergency}
                              className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                isEmergency
                                  ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300"
                                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300"
                              }`}
                            >
                              {isEmergency ? "Clear Emergency Flag" : "🚨 Fast-Track Emergency Dispatch"}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Widget 2: Visual Multi-Step Call Lifecycle Progression Tracker */}
                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-zinc-500" />
                          Call & Lead Lifecycle Progression
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {contactDetail.stage.replace("_", " ").toUpperCase()}
                        </span>
                      </div>

                      {/* 5-Stage Roadmap Steps */}
                      <div className="grid grid-cols-5 gap-1.5 pt-1">
                        {[
                          {
                            step: 1,
                            name: "Ingestion",
                            done: true,
                            detail: contactDetail.source || "Web/Inbound",
                          },
                          {
                            step: 2,
                            name: "AI Triage",
                            done: Boolean(contactDetail.calls && contactDetail.calls.length > 0),
                            detail: `${contactDetail.calls?.length || 0} calls`,
                          },
                          {
                            step: 3,
                            name: "Slot Booked",
                            done:
                              contactDetail.stage === "booked" ||
                              contactDetail.stage === "closed" ||
                              (contactDetail.tags || []).some((t) => t.toLowerCase().includes("book")),
                            detail: contactDetail.stage === "booked" ? "Confirmed" : "Pending",
                          },
                          {
                            step: 4,
                            name: "CRM Synced",
                            done: true,
                            detail: "Realtime",
                          },
                          {
                            step: 5,
                            name: "SMS Confirmed",
                            done: (contactDetail.timeline || []).some((t) =>
                              t.title.toLowerCase().includes("sms")
                            ),
                            detail: "Telnyx Carrier",
                          },
                        ].map((m) => (
                          <div
                            key={m.step}
                            className={`p-2 rounded-xl border text-center space-y-1 transition-all ${
                              m.done
                                ? "bg-white border-emerald-300 text-zinc-900 shadow-xs"
                                : "bg-zinc-100/70 border-zinc-200 text-zinc-400"
                            }`}
                          >
                            <div className="flex items-center justify-center">
                              {m.done ? (
                                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                                  ✓
                                </span>
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-zinc-200 text-zinc-500 flex items-center justify-center text-[9px] font-mono">
                                  {m.step}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-bold truncate leading-none">{m.name}</div>
                            <div className="text-[9px] font-mono text-zinc-400 truncate leading-none">
                              {m.detail}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
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

                      {contactDetail.tags && contactDetail.tags.length > 0 && (
                        <div className="pt-2 border-t border-zinc-200 space-y-1">
                          <span className="text-zinc-400 text-[10px] uppercase font-mono block">Tags & Attributes</span>
                          <div className="flex flex-wrap gap-1">
                            {contactDetail.tags.map((t, i) => {
                              const formatted = formatHumanReadableTag(t);
                              return (
                                <span
                                  key={i}
                                  className={`text-[10px] px-2 py-0.5 rounded-md border font-medium ${formatted.color}`}
                                >
                                  {formatted.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Two-Way SMS Quick Dispatcher (Telnyx) */}
                    <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200/90 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-emerald-700" />
                          <span className="text-xs font-bold text-emerald-950 font-mono uppercase tracking-wide">
                            Direct SMS (Telnyx Carrier)
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          $0.004/msg &bull; 2-Way Active
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={smsText}
                          onChange={(e) => setSmsText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendSms();
                            }
                          }}
                          placeholder={`Text ${contactDetail.name || contactDetail.phone}...`}
                          className="flex-1 px-3 py-2 text-xs bg-white border border-emerald-200 rounded-xl text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-zinc-400"
                        />
                        <button
                          type="button"
                          disabled={sendingSms || !smsText.trim()}
                          onClick={handleSendSms}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          {sendingSms ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>Send</span>
                        </button>
                      </div>
                      {smsStatusMsg && (
                        <div className="text-[11px] font-medium text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                          <span>{smsStatusMsg}</span>
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

                          <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-[11px]">
                            <span className="font-mono text-zinc-400 text-[10px]">ID: {call.call_id}</span>
                            <a
                              href={`/portal/calls?call_id=${encodeURIComponent(call.call_id)}&autoplay=true`}
                              className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 font-semibold transition-colors"
                              title="Open full audio and telemetry in Call Explorer and autoplay recording"
                            >
                              <span>Open in Call Explorer</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
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

      {/* MODAL: CONFIRM STAGE TRANSITION */}
      {pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Confirm Stage Transition</h3>
                  <p className="text-xs text-zinc-500">Move lead through the conversion pipeline</p>
                </div>
              </div>
              <button
                onClick={() => setPendingMove(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200/80 space-y-3">
              <div className="text-xs">
                <span className="text-zinc-400 text-[10px] uppercase font-mono block">Contact</span>
                <span className="font-bold text-zinc-900 text-sm">{pendingMove.contactName}</span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200/60">
                <div className="flex-1 text-center p-2.5 rounded-lg bg-white border border-zinc-200">
                  <span className="text-[10px] uppercase font-mono text-zinc-400 block">Current Stage</span>
                  <span className="text-xs font-semibold text-zinc-700">{pendingMove.fromStageLabel}</span>
                </div>

                <ArrowRight className="w-4 h-4 text-purple-600 shrink-0" />

                <div className="flex-1 text-center p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-[10px] uppercase font-mono text-purple-600 block">Target Stage</span>
                  <span className="text-xs font-bold text-purple-900">{pendingMove.toStageLabel}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Moving this contact will update pipeline metrics, attribution history, and notify automated follow-up sequences.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={movingStage}
                onClick={() => setPendingMove(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={movingStage}
                onClick={handleConfirmMove}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 disabled:opacity-50 transition shadow-sm flex items-center gap-1.5"
              >
                {movingStage && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>Confirm Move</span>
              </button>
            </div>
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
