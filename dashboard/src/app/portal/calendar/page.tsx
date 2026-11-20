"use client";

import React, { useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Users,
  MapPin,
  Wrench,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  ShieldAlert,
  Zap,
  Globe,
  Video,
  ExternalLink,
  ShieldCheck,
  Send,
  Copy,
  Check,
  MessageSquare,
  X,
  AlertTriangle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Play,
  Phone,
  Mail,
  User,
  AlertCircle,
  Stethoscope,
  Scale,
  Building2,
  Briefcase,
} from "lucide-react";
import {
  api,
  StaffMember,
  DispatchPreviewResult,
  RosterSchedule,
  CalendarIntegrationStatus,
  CalendarBookingItem,
  CalendlyConfigResponse,
} from "@/lib/api";
import {
  resolveIndustrySemantics,
  INDUSTRY_SEMANTIC_PROFILES,
  IndustrySemanticProfile,
} from "@/lib/industry-semantics";

export default function StaffAndDispatchPage() {
  const [activeTab, setActiveTab] = useState<"calendar" | "bookings" | "schedule" | "roster" | "simulator" | "google_sync">("calendar");
  const [selectedNiche, setSelectedNiche] = useState<string>("home_services");
  const semantics: IndustrySemanticProfile = resolveIndustrySemantics(selectedNiche);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rosterSchedule, setRosterSchedule] = useState<RosterSchedule[]>([]);
  const [calStatus, setCalStatus] = useState<CalendarIntegrationStatus | null>(null);
  const [bookingsList, setBookingsList] = useState<CalendarBookingItem[]>([]);
  const [testingCalSync, setTestingCalSync] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [calNotification, setCalNotification] = useState<string | null>(null);
  const [connectingSandbox, setConnectingSandbox] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);
  const [oauthSetupDetails, setOauthSetupDetails] = useState<{
    redirect_uri?: string;
    message?: string;
  } | null>(null);

  // Visual Interactive Schedule Grid State
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  const [selectedBooking, setSelectedBooking] = useState<CalendarBookingItem | null>(null);
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");

  // Manual Booking Modal State
  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newServiceType, setNewServiceType] = useState("");
  const [newBookingDate, setNewBookingDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newBookingTime, setNewBookingTime] = useState("10:00");
  const [newBookingDuration, setNewBookingDuration] = useState(60);
  const [newBookingStaffId, setNewBookingStaffId] = useState("");
  const [newBookingNotes, setNewBookingNotes] = useState("");

  // Calendly & Self-Serve In-Call SMS State (Phase 4)
  const [calendlyConfig, setCalendlyConfig] = useState<CalendlyConfigResponse | null>(null);
  const [calendlyInput, setCalendlyInput] = useState("");
  const [savingCalendly, setSavingCalendly] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState("");
  const [sendingTestSms, setSendingTestSms] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New staff modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("technician");
  const [newSkills, setNewSkills] = useState("hvac_repair, water_heater");
  const [newTerritories, setNewTerritories] = useState("78701, 78702, 787*");
  const [newPriority, setNewPriority] = useState(1);

  // Dispatch Simulator state
  const [simService, setSimService] = useState("water_heater");
  const [simZip, setSimZip] = useState("78701");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<DispatchPreviewResult | null>(null);

  // Schedule date state
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [staffData, scheduleData, calData, bookingsData, calyRes, tenantPack] = await Promise.all([
        api.listStaffMembers(true).catch(() => []),
        api.getRosterSchedule(targetDate).catch(() => []),
        api.getCalendarStatus().catch(() => null),
        api.listCalendarBookings(50).catch(() => []),
        api.getCalendlyConfig().catch(() => null),
        api.getCurrentAppliedPack().catch(() => null),
      ]);
      setStaffList(staffData);
      setRosterSchedule(scheduleData);
      if (calData) setCalStatus(calData);
      setBookingsList(bookingsData);
      if (calyRes) {
        setCalendlyConfig(calyRes);
        setCalendlyInput(calyRes.calendly_url || "");
      }
      if (tenantPack && tenantPack.pack_slug) {
        setSelectedNiche(tenantPack.pack_slug);
        const sem = resolveIndustrySemantics(tenantPack.pack_slug);
        if (sem.defaultServiceTypes.length > 0) {
          setNewServiceType(sem.defaultServiceTypes[0].title);
        }
        setSimService(sem.defaultSimulationService);
        setSimZip(sem.defaultSimulationTerritory);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load calendar and provider roster.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("connected") === "true") {
        setCalNotification("Google Calendar successfully connected! Real-time two-way synchronization is active.");
        setTimeout(() => setCalNotification(null), 5000);
      }
    }
  }, [targetDate]);

  const handleSaveCalendlyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendlyInput.trim()) return;
    setSavingCalendly(true);
    try {
      const res = await api.updateCalendlyConfig({ calendly_url: calendlyInput.trim() });
      setCalendlyConfig(res);
      setCalNotification("Calendly self-serve scheduling link updated successfully.");
      setTimeout(() => setCalNotification(null), 4000);
    } catch (err: any) {
      alert(`Failed to save Calendly link: ${err?.message || err}`);
    } finally {
      setSavingCalendly(false);
    }
  };

  const handleSendTestBookingSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSmsPhone.trim()) return;
    setSendingTestSms(true);
    try {
      const res = await api.sendCalendlyTestSMS({
        phone_number: testSmsPhone.trim(),
        customer_name: "Valued Customer",
      });
      setCalNotification(`In-call self-serve SMS link successfully sent to ${res.phone_number}!`);
      setTimeout(() => setCalNotification(null), 5000);
    } catch (err: any) {
      alert(`Could not send test booking SMS: ${err?.message || err}`);
    } finally {
      setSendingTestSms(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io";
    const fullUrl = `${origin}/api/v1/portal/calendar/calendly/webhook`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 3000);
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      const res = await api.connectGoogleCalendar();
      if (res.is_configured && res.auth_url) {
        window.location.href = res.auth_url;
      } else {
        setOauthSetupDetails({
          redirect_uri: res.redirect_uri || "https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/portal/calendar/callback",
          message: res.message || "Google Cloud OAuth credentials are not yet configured on this deployment.",
        });
        setShowOAuthModal(true);
      }
    } catch (err: any) {
      alert(`Could not initiate Google OAuth: ${err?.message || err}`);
    }
  };

  const handleConnectSandboxCalendar = async () => {
    try {
      setConnectingSandbox(true);
      await api.connectSandboxCalendar();
      setCalNotification("Instant Sandbox Calendar Connected! Live two-way slot sync and Meet links are ready.");
      await loadData();
      setShowOAuthModal(false);
      setTimeout(() => setCalNotification(null), 5000);
    } catch (err: any) {
      alert(`Failed to connect Sandbox Calendar: ${err?.message || err}`);
    } finally {
      setConnectingSandbox(false);
    }
  };

  const handleCopyRedirectUri = (uri: string) => {
    navigator.clipboard.writeText(uri);
    setCopiedRedirectUri(true);
    setTimeout(() => setCopiedRedirectUri(false), 3000);
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!confirm("Are you sure you want to disconnect Google Calendar? Two-way synchronization will be paused.")) {
      return;
    }
    try {
      await api.disconnectGoogleCalendar();
      setCalStatus({
        is_connected: false,
        provider: "none",
        status: "disconnected",
        calendar_id: "none",
        token_expires_at: null,
      });
      setCalNotification("Google Calendar successfully disconnected.");
      setTimeout(() => setCalNotification(null), 4000);
    } catch (err: any) {
      alert(`Failed to disconnect: ${err?.message || err}`);
    }
  };

  const handleTestCalendarSync = async () => {
    setTestingCalSync(true);
    try {
      const res = await api.testCalendarSync();
      setCalNotification(
        `Sync Verified! Connected: ${res.calendar_id} • FreeBusy Blocks: ${res.busy_blocks_found} • Meet Link: ${res.meet_link_generated || "Generated"}`
      );
      loadData();
      setTimeout(() => setCalNotification(null), 6000);
    } catch (err: any) {
      alert(`Two-way sync test failed: ${err?.message || err}`);
    } finally {
      setTestingCalSync(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm("Cancel this customer booking and remove it from Google Calendar?")) {
      return;
    }
    setCancellingBookingId(bookingId);
    try {
      await api.cancelCalendarBooking(bookingId);
      setBookingsList((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b))
      );
      setCalNotification("Booking cancelled and removed from Google Calendar.");
      setTimeout(() => setCalNotification(null), 4000);
    } catch (err: any) {
      alert(`Failed to cancel booking: ${err?.message || err}`);
    } finally {
      setCancellingBookingId(null);
    }
  };

  const getDaysOfWeek = (startDate: Date) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const handlePrevWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const handleTodayWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const handleCreateManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      setBookingError("Customer name and phone number are required.");
      return;
    }
    setCreatingBooking(true);
    setBookingError(null);
    try {
      const [hours, minutes] = newBookingTime.split(":").map(Number);
      const startDateTime = new Date(`${newBookingDate}T00:00:00`);
      startDateTime.setHours(hours, minutes, 0, 0);
      const endDateTime = new Date(startDateTime.getTime() + newBookingDuration * 60 * 1000);

      const created = await api.createManualBooking({
        customer_name: newCustName.trim(),
        customer_phone: newCustPhone.trim(),
        customer_email: newCustEmail.trim() || null,
        service_type: newServiceType,
        start_at: startDateTime.toISOString(),
        end_at: endDateTime.toISOString(),
        notes: newBookingNotes.trim() || null,
        staff_id: newBookingStaffId || null,
      });

      setShowNewBookingModal(false);
      setCalNotification(`Appointment booked successfully for ${created.customer_name}!`);
      setTimeout(() => setCalNotification(null), 4000);
      // Reset form
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
      setNewBookingNotes("");
      await loadData();
      setSelectedBooking(created);
    } catch (err: any) {
      setBookingError(err?.message || "Failed to create appointment.");
    } finally {
      setCreatingBooking(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    setSubmitting(true);
    try {
      const parsedSkills = newSkills
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const parsedTerritories = newTerritories
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

      await api.createStaffMember({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        role: newRole,
        skills: parsedSkills,
        service_territory_zips: parsedTerritories,
        priority_weight: newPriority,
        is_active: true,
      });

      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      await loadData();
    } catch (err: any) {
      alert(err?.message || `Error creating ${semantics.staffSingular.toLowerCase()}.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStaff = async (staffId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${semantics.staffSingular.toLowerCase()} ${name}?`)) return;
    try {
      await api.deleteStaffMember(staffId);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error removing staff member.");
    }
  };

  const handleToggleActive = async (staff: StaffMember) => {
    try {
      await api.updateStaffMember(staff.id, { is_active: !staff.is_active });
      await loadData();
    } catch (err: any) {
      alert(err?.message || `Error updating ${semantics.staffSingular.toLowerCase()} status.`);
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    try {
      const result = await api.previewDispatchRouting({
        service_type: simService.trim(),
        postal_code: simZip.trim(),
      });
      setSimResult(result);
    } catch (err: any) {
      alert(err?.message || "Dispatch simulation failed.");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Live Control Plane
            </span>
            <span className="text-xs font-mono text-zinc-500">Google Calendar Two-Way Active</span>

            {/* Semantic Industry Context Pill Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 border border-zinc-200 shadow-xs">
              <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold">Industry Context:</span>
              <select
                value={selectedNiche}
                onChange={(e) => {
                  const newSlug = e.target.value;
                  setSelectedNiche(newSlug);
                  const sem = resolveIndustrySemantics(newSlug);
                  if (sem.defaultServiceTypes.length > 0) {
                    setNewServiceType(sem.defaultServiceTypes[0].title);
                  }
                  if (sem.staffRoleOptions.length > 0) {
                    setNewRole(sem.staffRoleOptions[0].value);
                  }
                  setSimService(sem.defaultSimulationService);
                  setSimZip(sem.defaultSimulationTerritory);
                }}
                className="bg-transparent text-xs font-semibold text-zinc-800 cursor-pointer focus:outline-none pr-1"
              >
                {Object.values(INDUSTRY_SEMANTIC_PROFILES).map((prof) => (
                  <option key={prof.slug} value={prof.slug}>
                    {prof.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mt-1">
            Appointments, Live Calendar &amp; Scheduling
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Interactive weekly schedule, two-way Google Calendar synchronization, {semantics.staffSingular.toLowerCase()} management, and manual booking creation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewBookingModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Appointment
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800 transition shadow-xs"
          >
            <Users className="w-4 h-4" />
            Add {semantics.staffSingular}
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            className="p-2 border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-100 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Appointments</span>
            <CalendarIcon className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{bookingsList.length}</div>
          <div className="text-[10.5px] text-zinc-400 font-mono">
            {bookingsList.filter((b) => b.status === "confirmed").length} Confirmed
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Google Calendar</span>
            <Globe className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-base font-bold text-zinc-900 font-mono flex items-center gap-1.5 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${
                calStatus?.is_connected ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"
              }`}
            />
            <span>{calStatus?.is_connected ? "Active Two-Way" : "Disconnected"}</span>
          </div>
          <div className="text-[10.5px] text-zinc-400 font-mono truncate">
            {calStatus?.calendar_id || "None configured"}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>{semantics.activeStaffLabel}</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">
            {staffList.filter((s) => s.is_active).length}
          </div>
          <div className="text-[10.5px] text-emerald-600 font-mono font-medium">{semantics.readyStatusText}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Voice Agent Bookings</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">
            {bookingsList.filter((b) => Boolean(b.call_id)).length}
          </div>
          <div className="text-[10.5px] text-zinc-400 font-mono">From Phone Calls</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 gap-6 text-sm font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab("calendar")}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === "calendar"
              ? "border-emerald-600 text-emerald-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Live Schedule Grid
        </button>
        <button
          onClick={() => setActiveTab("bookings")}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === "bookings"
              ? "border-purple-600 text-purple-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          All Appointments ({bookingsList.length})
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === "schedule"
              ? "border-indigo-600 text-indigo-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <CalendarIcon className="w-4 h-4 text-indigo-600" />
          {semantics.scheduleMatrixLabel}
        </button>
        <button
          onClick={() => setActiveTab("google_sync")}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === "google_sync"
              ? "border-blue-600 text-blue-600 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Globe className="w-4 h-4 text-blue-600" />
          Google Calendar &amp; Meet
          {calStatus?.is_connected ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-zinc-300"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("roster")}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === "roster"
              ? "border-zinc-900 text-zinc-900 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Users className="w-4 h-4" />
          {semantics.staffTabLabel} ({staffList.length})
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`pb-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
            activeTab === "simulator"
              ? "border-zinc-900 text-zinc-900 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          {semantics.simulatorTabLabel}
        </button>
      </div>

      {calNotification && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          {calNotification}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* TAB 0: LIVE INTERACTIVE SCHEDULE GRID */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          {/* Calendar Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200/90 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevWeek}
                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleTodayWeek}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-xs font-semibold text-zinc-700 transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleNextWeek}
                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs sm:text-sm font-bold text-zinc-900 ml-2 font-mono">
                {(() => {
                  const days = getDaysOfWeek(currentWeekStart);
                  return `${days[0].toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })} – ${days[6].toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`;
                })()}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-zinc-600">Confirmed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-zinc-600">Held (Soft)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-zinc-600">Google Meet</span>
              </div>
            </div>
          </div>

          {/* Interactive Weekly Schedule Grid */}
          <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Day Columns Header */}
              <div className="grid grid-cols-8 border-b border-zinc-200 text-xs bg-zinc-50/80">
                <div className="p-3 text-center text-zinc-400 font-mono font-medium border-r border-zinc-200/80 text-[11px]">
                  Time (UTC)
                </div>
                {getDaysOfWeek(currentWeekStart).map((day, idx) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={idx}
                      className={`p-3 text-center border-r last:border-r-0 border-zinc-200/80 ${
                        isToday ? "bg-purple-50/80 font-bold text-purple-900" : "text-zinc-700"
                      }`}
                    >
                      <div className="text-[11px] uppercase font-mono text-zinc-400">
                        {day.toLocaleDateString(undefined, { weekday: "short" })}
                      </div>
                      <div className={`text-sm ${isToday ? "font-bold text-purple-700" : "font-bold text-zinc-800"}`}>
                        {day.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hourly Time Slots (8 AM to 6 PM) */}
              <div className="divide-y divide-zinc-100">
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((hour) => {
                  const hourLabel = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
                  return (
                    <div key={hour} className="grid grid-cols-8 min-h-[72px]">
                      {/* Hour Label Column */}
                      <div className="p-2 border-r border-zinc-200/80 text-[11px] font-mono text-zinc-400 text-right pr-3 bg-zinc-50/40 select-none flex items-start justify-end">
                        {hourLabel}
                      </div>

                      {/* Day Cells for this Hour */}
                      {getDaysOfWeek(currentWeekStart).map((day, dIdx) => {
                        const cellDateStr = day.toISOString().split("T")[0];
                        const cellBookings = bookingsList.filter((b) => {
                          const bDate = new Date(b.start_at);
                          const bDateStr = bDate.toISOString().split("T")[0];
                          return bDateStr === cellDateStr && bDate.getHours() === hour;
                        });

                        return (
                          <div
                            key={dIdx}
                            className="p-1 border-r last:border-r-0 border-zinc-100 relative group transition-colors hover:bg-zinc-50/50 flex flex-col gap-1"
                          >
                            {cellBookings.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewBookingDate(cellDateStr);
                                  setNewBookingTime(`${hour.toString().padStart(2, "0")}:00`);
                                  setShowNewBookingModal(true);
                                }}
                                className="w-full h-full min-h-[56px] rounded-lg border border-dashed border-transparent group-hover:border-zinc-300 text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                              >
                                + Book
                              </button>
                            ) : (
                              cellBookings.map((b) => {
                                const isConfirmed = b.status === "confirmed";
                                const isHeld = b.status === "held";
                                return (
                                  <div
                                    key={b.id}
                                    onClick={() => setSelectedBooking(b)}
                                    className={`p-2 rounded-xl border text-left cursor-pointer transition shadow-xs space-y-1 ${
                                      isConfirmed
                                        ? "bg-emerald-50/90 border-emerald-300 hover:border-emerald-500 text-emerald-950"
                                        : isHeld
                                        ? "bg-amber-50/90 border-amber-300 hover:border-amber-500 text-amber-950"
                                        : "bg-zinc-100 border-zinc-200 text-zinc-600 line-through opacity-70"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="font-bold text-xs truncate leading-tight">
                                        {b.customer_name}
                                      </span>
                                      {b.meet_link && (
                                        <span title="Google Meet Video Link">
                                          <Video className="w-3 h-3 text-blue-600 shrink-0" />
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] font-mono opacity-80 truncate">
                                      {new Date(b.start_at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}{" "}
                                      -{" "}
                                      {new Date(b.end_at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </div>
                                    <div className="text-[9.5px] px-1.5 py-0.2 rounded bg-white/80 border border-zinc-200/50 inline-block truncate max-w-full font-medium capitalize">
                                      {b.service_type.replace(/_/g, " ")}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 0.5: ALL APPOINTMENTS DIRECTORY */}
      {activeTab === "bookings" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by customer name, phone, email, service..."
                value={bookingSearchQuery}
                onChange={(e) => setBookingSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span className="text-zinc-400 text-[11px] mr-1">Filter:</span>
              {["all", "confirmed", "held", "cancelled"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setBookingStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg capitalize transition text-xs font-semibold ${
                    bookingStatusFilter === st
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Scheduled Window</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Google Meet</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-mono">
                {bookingsList
                  .filter((b) => {
                    const matchesQuery =
                      !bookingSearchQuery ||
                      b.customer_name.toLowerCase().includes(bookingSearchQuery.toLowerCase()) ||
                      b.customer_phone.includes(bookingSearchQuery) ||
                      (b.customer_email && b.customer_email.toLowerCase().includes(bookingSearchQuery.toLowerCase())) ||
                      b.service_type.toLowerCase().includes(bookingSearchQuery.toLowerCase());
                    const matchesStatus =
                      bookingStatusFilter === "all" || b.status === bookingStatusFilter;
                    return matchesQuery && matchesStatus;
                  })
                  .map((b) => (
                    <tr key={b.id} className="hover:bg-zinc-50/70 transition">
                      <td className="px-4 py-3">
                        <div className="font-bold text-zinc-900">{b.customer_name}</div>
                        <div className="text-[11px] text-zinc-500">{b.customer_phone}</div>
                        {b.customer_email && <div className="text-[10px] text-zinc-400">{b.customer_email}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="capitalize text-zinc-800 font-medium font-sans">
                          {b.service_type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        <div>{new Date(b.start_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div className="text-[11px] text-zinc-400">
                          {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            b.status === "confirmed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : b.status === "held"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {b.meet_link ? (
                          <a
                            href={b.meet_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold hover:bg-blue-100"
                          >
                            <Video className="w-3 h-3 text-blue-600" />
                            Join Meet
                            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">In-Person Dispatch</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 font-sans">
                          {b.call_id ? (
                            <a
                              href={`/portal/calls?call_id=${encodeURIComponent(b.call_id)}&autoplay=true`}
                              className="px-2 py-1 rounded border border-purple-200 hover:bg-purple-50 text-purple-700 text-[11px] font-semibold flex items-center gap-1 transition"
                              title="Listen to call that booked this slot"
                            >
                              <Play className="w-2.5 h-2.5" />
                              <span>Play Call</span>
                            </a>
                          ) : (
                            <a
                              href={`/portal/calls?search=${encodeURIComponent(b.customer_phone)}&autoplay=true`}
                              className="px-2 py-1 rounded border border-zinc-200 hover:bg-zinc-100 text-zinc-600 text-[11px] font-semibold flex items-center gap-1 transition"
                              title="Look up call logs by phone"
                            >
                              <Play className="w-2.5 h-2.5" />
                              <span>Calls</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedBooking(b)}
                            className="px-2.5 py-1 rounded border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-[11px] font-semibold transition"
                          >
                            Details
                          </button>

                          {b.status !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b.id)}
                              disabled={cancellingBookingId === b.id}
                              className="px-2 py-1 rounded border border-red-200 hover:bg-red-50 text-red-600 text-[11px] font-semibold transition"
                            >
                              {cancellingBookingId === b.id ? "Cancelling..." : "Cancel"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 1: STAFF ROSTER */}
      {activeTab === "roster" && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-sm font-mono text-zinc-400">Loading {semantics.staffTabLabel.toLowerCase()}...</div>
          ) : staffList.length === 0 ? (
            <div className="border border-dashed border-zinc-300 rounded-xl p-10 text-center">
              <Users className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-zinc-800">{semantics.emptyStaffTitle}</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1 mb-4">
                {semantics.emptyStaffDesc}
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-semibold"
              >
                Add Your First {semantics.staffSingular}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffList.map((staff) => (
                <div
                  key={staff.id}
                  className={`border rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between transition ${
                    staff.is_active ? "border-zinc-200" : "border-zinc-200 bg-zinc-50 opacity-75"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900">{staff.name}</h3>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                              staff.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                            }`}
                          >
                            {staff.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-mono capitalize mt-0.5">
                          {staff.role.replace("_", " ")}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[10px]">
                        Weight: {staff.priority_weight}x
                      </span>
                    </div>

                    <div className="text-xs space-y-1 text-zinc-600 font-mono">
                      <div>Email: {staff.email}</div>
                      {staff.phone && <div>Phone: {staff.phone}</div>}
                    </div>

                    {/* Skills */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-zinc-400" />
                        {semantics.skillsFieldLabel}:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {staff.skills.length > 0 ? (
                          staff.skills.map((skill, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-mono"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">All skills (General)</span>
                        )}
                      </div>
                    </div>

                    {/* Territories */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-zinc-400" />
                        {semantics.territoryFieldLabel}:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {staff.service_territory_zips.length > 0 ? (
                          staff.service_territory_zips.map((zip, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded text-[10px] font-mono"
                            >
                              {zip}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">All areas</span>
                        )}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span>Bookings Today: {staff.today_bookings_count}</span>
                      <span>
                        {staff.last_assigned_at
                          ? `Last: ${new Date(staff.last_assigned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : "Never assigned"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-end gap-2 border-t border-zinc-100 mt-4">
                    <button
                      onClick={() => handleToggleActive(staff)}
                      className="px-2.5 py-1 text-xs border border-zinc-200 rounded text-zinc-600 hover:bg-zinc-50"
                    >
                      {staff.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(staff.id, staff.name)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 rounded transition"
                      title={`Delete ${semantics.staffSingular}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SMART ROUTING SIMULATOR */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              {semantics.simulatorTabLabel}
            </h2>
            <p className="text-xs text-zinc-500 mt-1 mb-4">
              {semantics.simulationExplainText}
            </p>

            <form onSubmit={handleRunSimulation} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">{semantics.serviceFieldLabel}</label>
                <input
                  type="text"
                  value={simService}
                  onChange={(e) => setSimService(e.target.value)}
                  placeholder={`e.g. ${semantics.defaultSimulationService}`}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">{semantics.territoryFieldLabel}</label>
                <input
                  type="text"
                  value={simZip}
                  onChange={(e) => setSimZip(e.target.value)}
                  placeholder={`e.g. ${semantics.defaultSimulationTerritory}`}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={simulating}
                  className="w-full py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {simulating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {semantics.simulatorActionLabel}
                </button>
              </div>
            </form>
          </div>

          {simResult && (
            <div className="space-y-4">
              {/* Decision Box */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Routing Decision: Round-Robin Selected
                </div>
                {simResult.chosen_technician ? (
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-emerald-100 shadow-sm">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-emerald-700 font-bold block mb-0.5">
                        {semantics.simulationResultRoleLabel}
                      </span>
                      <h4 className="text-sm font-bold text-zinc-900">{simResult.chosen_technician.name}</h4>
                      <p className="text-xs text-zinc-500 font-mono capitalize">
                        Role: {simResult.chosen_technician.role.replace("_", " ")}
                      </p>
                    </div>
                    <div className="text-xs font-mono text-zinc-600">
                      <div>Email: {simResult.chosen_technician.email}</div>
                      <div>Phone: {simResult.chosen_technician.phone || "N/A"}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      Assigned to Appointment
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600 mt-2 font-mono">
                    No available {semantics.staffSingular.toLowerCase()} matched both requirements or all qualified staff are fully booked at this slot.
                  </div>
                )}
              </div>

              {/* Eligible Pool */}
              <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider mb-3">
                  {semantics.simulationPoolLabel} ({simResult.eligible_technicians_count} Eligible)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {simResult.eligible_technicians.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border text-xs font-mono ${
                        simResult.chosen_technician?.id === t.id
                          ? "border-emerald-500 bg-emerald-50/50"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <div className="font-bold text-zinc-900">{t.name}</div>
                      <div className="text-[11px] text-zinc-500 capitalize">{t.role.replace("_", " ")}</div>
                      <div className="text-[10px] text-zinc-400 mt-1">Weight: {t.priority_weight}x</div>
                      <div className="text-[10px] text-zinc-400">
                        Last Assigned:{" "}
                        {t.last_assigned_at
                          ? new Date(t.last_assigned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "None"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DAILY ROSTER SCHEDULE */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-zinc-500" />
              <div>
                <h3 className="text-xs font-bold text-zinc-900">Select Date for Schedule Overview</h3>
                <p className="text-[11px] text-zinc-500 font-mono">Inspecting booked appointments across {semantics.staffTabLabel.toLowerCase()}</p>
              </div>
            </div>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="text-xs px-3 py-1.5 border border-zinc-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div className="space-y-3">
            {rosterSchedule.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-400">No appointments scheduled for {targetDate}.</div>
            ) : (
              rosterSchedule.map((entry) => (
                <div key={entry.technician_id} className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-zinc-900">{entry.technician_name}</span>
                      <span className="text-[10px] font-mono text-zinc-500 capitalize">({entry.role.replace("_", " ")})</span>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                      {entry.bookings.length} {entry.bookings.length === 1 ? "Booking" : "Bookings"}
                    </span>
                  </div>

                  {entry.bookings.length === 0 ? (
                    <div className="text-[11px] font-mono text-zinc-400 italic py-1">No bookings for this date. {semantics.readyStatusText}.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {entry.bookings.map((b) => (
                        <div key={b.id} className="p-2.5 rounded bg-zinc-50 border border-zinc-200 text-xs font-mono">
                          <div className="font-bold text-zinc-900 truncate">{b.customer_name}</div>
                          <div className="text-[11px] text-zinc-500">{b.service_type.replace("_", " ")}</div>
                          <div className="text-[10px] text-zinc-400 mt-1">
                            {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {b.postal_code && <div className="text-[10px] text-blue-600 mt-0.5">Zip: {b.postal_code}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: GOOGLE CALENDAR & TWO-WAY SYNCHRONIZATION */}
      {activeTab === "google_sync" && (
        <div className="space-y-6">
          {/* Integration Status Card */}
          <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-900">Google Calendar Two-Way Synchronization</h3>
                    {calStatus?.is_connected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Connected & Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                        Disconnected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xl leading-relaxed">
                    Automatically syncs voice caller appointments to your primary Google Calendar and queries live FreeBusy blocks to prevent double-booking. Includes auto-generated Google Meet video conference links.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {calStatus?.is_connected ? (
                  <>
                    <button
                      type="button"
                      onClick={handleTestCalendarSync}
                      disabled={testingCalSync}
                      className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingCalSync ? "animate-spin" : ""}`} />
                      <span>{testingCalSync ? "Verifying..." : "Test Two-Way Sync"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectGoogleCalendar}
                      className="px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConnectGoogleCalendar}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
                    >
                      <Globe className="w-4 h-4" />
                      <span>Connect Google Calendar</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleConnectSandboxCalendar}
                      disabled={connectingSandbox}
                      className="px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
                      title="Instant 1-click test calendar: simulated busy blocks, Meet links, and conflict checking without Google Cloud credentials"
                    >
                      <Zap className={`w-4 h-4 text-emerald-600 ${connectingSandbox ? "animate-spin" : ""}`} />
                      <span>{connectingSandbox ? "Connecting..." : "Connect Sandbox Calendar"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Diagnostic Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-zinc-100 text-xs font-mono">
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                <span className="text-[10px] text-zinc-400 block uppercase font-bold">Primary Calendar</span>
                <span className="text-zinc-800 font-semibold">{calStatus?.calendar_id || "None"}</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                <span className="text-[10px] text-zinc-400 block uppercase font-bold">FreeBusy Engine</span>
                <span className="text-zinc-800 font-semibold">15m Travel Buffer + Drive Time</span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                <span className="text-[10px] text-zinc-400 block uppercase font-bold">Video Conferencing</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Video className="w-3.5 h-3.5" /> Google Meet Injected
                </span>
              </div>
            </div>
          </div>

          {/* Phase 4 & Phase 5: Calendly Alternative & Instant SMS Self-Serve Booking */}
          <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-900">Calendly Alternative & Instant SMS Self-Serve</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Phase 4 & 5 Active
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xl leading-relaxed">
                    Voice callers who prefer to choose their own appointment time on their phone will receive an instant SMS text containing your direct scheduling link. Includes automated customer email (.ics calendar invite attached) and {semantics.staffSingular.toLowerCase()} schedule alerts.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-100">
              {/* Calendly URL Configuration Form */}
              <form onSubmit={handleSaveCalendlyConfig} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-2.5">
                <label className="block text-xs font-bold text-zinc-800">Direct Self-Serve Booking Link (Calendly / Custom)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    placeholder="https://calendly.com/your-business/diagnostic-visit"
                    value={calendlyInput}
                    onChange={(e) => setCalendlyInput(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={savingCalendly}
                    className="px-3.5 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg transition disabled:opacity-50"
                  >
                    {savingCalendly ? "Saving..." : "Save Link"}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                  <span>Webhook Ingestion URL:</span>
                  <button
                    type="button"
                    onClick={handleCopyWebhookUrl}
                    className="text-blue-600 hover:underline flex items-center gap-1 font-mono font-semibold"
                  >
                    {copiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedWebhook ? "Copied!" : "Copy Webhook URL"}</span>
                  </button>
                </div>
              </form>

              {/* Test In-Call SMS Dispatch Form */}
              <form onSubmit={handleSendTestBookingSms} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-2.5">
                <label className="block text-xs font-bold text-zinc-800">Test In-Call SMS Dispatch to Mobile Phone</label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    required
                    placeholder="+1 (512) 555-0199"
                    value={testSmsPhone}
                    onChange={(e) => setTestSmsPhone(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={sendingTestSms}
                    className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1 disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{sendingTestSms ? "Sending..." : "Send Test Link"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Sends the real SMS dispatch message that voice callers receive when asking for a self-serve booking link.
                </p>
              </form>
            </div>

            {/* Phase 5 Automated Notification Channels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-100 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-zinc-800">Customer: Email (.ics) + SMS</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-zinc-800">{semantics.staffSingular}: SMS + Schedule Alerts</span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-zinc-800">Native CRM: Auto-Stage 'Booked'</span>
              </div>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-zinc-900">Synchronized Voice & Web Bookings</h4>
                <p className="text-xs text-zinc-500">Live schedule of appointments booked by your AI receptionist.</p>
              </div>
              <span className="text-xs font-mono text-zinc-500">{bookingsList.length} Appointments</span>
            </div>

            {bookingsList.length === 0 ? (
              <div className="border border-dashed border-zinc-300 rounded-xl p-8 text-center text-xs font-mono text-zinc-400">
                No customer bookings recorded yet. When a caller confirms an appointment, it will appear here and sync to your Google Calendar.
              </div>
            ) : (
              <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Service</th>
                      <th className="px-4 py-3">Scheduled Window</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Google Meet</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-mono">
                    {bookingsList.map((b) => (
                      <tr key={b.id} className="hover:bg-zinc-50/50 transition">
                        <td className="px-4 py-3">
                          <div className="font-bold text-zinc-900">{b.customer_name}</div>
                          <div className="text-[11px] text-zinc-500">{b.customer_phone}</div>
                          {b.customer_email && <div className="text-[10px] text-zinc-400">{b.customer_email}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="capitalize text-zinc-800">{b.service_type.replace("_", " ")}</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          <div>{new Date(b.start_at).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>
                          <div className="text-[11px] text-zinc-400">
                            {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              b.status === "confirmed"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : b.status === "held"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {b.meet_link ? (
                            <a
                              href={b.meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold hover:bg-blue-100"
                            >
                              <Video className="w-3 h-3 text-blue-600" />
                              Join Meet
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic">In-Person Dispatch</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {b.status !== "cancelled" ? (
                            <button
                              type="button"
                              onClick={() => handleCancelBooking(b.id)}
                              disabled={cancellingBookingId === b.id}
                              className="px-2.5 py-1 rounded border border-red-200 hover:bg-red-50 text-red-600 text-[11px] font-semibold transition"
                            >
                              {cancellingBookingId === b.id ? "Cancelling..." : "Cancel"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-400">Cancelled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPOINTMENT DETAIL INSPECTOR DRAWER */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col p-6 space-y-6 animate-in slide-in-from-right duration-200 overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zinc-200">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      selectedBooking.status === "confirmed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : selectedBooking.status === "held"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                    }`}
                  >
                    {selectedBooking.status}
                  </span>
                  <span className="text-xs font-mono text-zinc-400">ID: {selectedBooking.id.slice(0, 8)}</span>
                </div>
                <h3 className="text-xl font-bold text-zinc-900 mt-1">{selectedBooking.customer_name}</h3>
                <p className="text-xs text-zinc-500 font-mono capitalize">
                  {selectedBooking.service_type.replace(/_/g, " ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Contact & Scheduled Time */}
            <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200/90 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-mono block">Phone Number</span>
                  <span className="font-bold text-zinc-900 font-mono flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-zinc-400" />
                    {selectedBooking.customer_phone}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-mono block">Customer Email</span>
                  <span className="font-semibold text-zinc-700 flex items-center gap-1.5 mt-0.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{selectedBooking.customer_email || "None recorded"}</span>
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-mono block">Date &amp; Day</span>
                  <span className="font-bold text-zinc-900 flex items-center gap-1.5 mt-0.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-purple-600" />
                    {new Date(selectedBooking.start_at).toLocaleDateString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] uppercase font-mono block">Time Window</span>
                  <span className="font-bold text-zinc-900 font-mono flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    {new Date(selectedBooking.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                    {new Date(selectedBooking.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>

              {selectedBooking.notes && (
                <div className="pt-2 border-t border-zinc-200 text-xs text-zinc-600">
                  <span className="text-zinc-400 text-[10px] uppercase font-mono block">Booking Notes</span>
                  <p className="mt-0.5">{selectedBooking.notes}</p>
                </div>
              )}
            </div>

            {/* Google Calendar Video Meet Link */}
            {selectedBooking.meet_link ? (
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-blue-950 font-mono uppercase">Google Meet Video Room</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    Active
                  </span>
                </div>
                <p className="text-xs text-blue-800">
                  A dedicated Google Meet room was automatically generated and attached to this booking.
                </p>
                <a
                  href={selectedBooking.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Join Google Meet Video</span>
                  <ExternalLink className="w-3 h-3 opacity-70 ml-1" />
                </a>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-500 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>In-Person On-Site Dispatch Appointment</span>
              </div>
            )}

            {/* Cross-Navigation Actions: Call Recording & CRM Profile */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                Two-Way Cross Links
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {selectedBooking.call_id ? (
                  <a
                    href={`/portal/calls?call_id=${encodeURIComponent(selectedBooking.call_id)}&autoplay=true`}
                    className="p-3 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-100/70 text-purple-900 transition flex items-center justify-between group"
                    title="Open call recording in Call Explorer and autoplay"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold flex items-center gap-1.5 text-purple-950">
                        <Play className="w-3.5 h-3.5 text-purple-700 group-hover:scale-110 transition" />
                        <span>Play Call Audio</span>
                      </div>
                      <div className="text-[10px] text-purple-700 font-mono">Deep-link Autoplay</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-700" />
                  </a>
                ) : (
                  <a
                    href={`/portal/calls?search=${encodeURIComponent(selectedBooking.customer_phone)}&autoplay=true`}
                    className="p-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-900 transition flex items-center justify-between group"
                    title="Search calls for this phone number"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold flex items-center gap-1.5 text-zinc-800">
                        <Play className="w-3.5 h-3.5 text-zinc-600" />
                        <span>Call Explorer</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">Search Phone Number</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700" />
                  </a>
                )}

                <a
                  href={`/portal/crm?search=${encodeURIComponent(selectedBooking.customer_phone)}`}
                  className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 text-blue-900 transition flex items-center justify-between group"
                  title="Open customer contact profile in CRM"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold flex items-center gap-1.5 text-blue-950">
                      <User className="w-3.5 h-3.5 text-blue-700 group-hover:scale-110 transition" />
                      <span>View in CRM</span>
                    </div>
                    <div className="text-[10px] text-blue-700 font-mono">Pipeline &amp; History</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-700" />
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-200 flex items-center justify-between mt-auto">
              {selectedBooking.status !== "cancelled" ? (
                <button
                  type="button"
                  onClick={() => {
                    handleCancelBooking(selectedBooking.id);
                    setSelectedBooking(null);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Cancel Appointment</span>
                </button>
              ) : (
                <span className="text-xs text-zinc-400 font-mono">Appointment Cancelled</span>
              )}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL NEW APPOINTMENT */}
      {showNewBookingModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-emerald-600" />
                  Schedule New Appointment
                </h3>
                <p className="text-xs text-zinc-500">
                  Manual telephone or walk-in booking with two-way Google Calendar sync.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewBookingModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bookingError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            <form onSubmit={handleCreateManualBooking} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Customer Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="e.g. Eleanor Vance"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Phone Number (E.164) *</label>
                  <input
                    type="tel"
                    required
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="+1 (512) 555-0199"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Customer Email</label>
                  <input
                    type="email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    placeholder="customer@domain.com"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">{semantics.serviceFieldLabel}</label>
                  <select
                    value={newServiceType || semantics.defaultServiceTypes[0]?.title}
                    onChange={(e) => setNewServiceType(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    {semantics.defaultServiceTypes.map((st) => (
                      <option key={st.id} value={st.title}>
                        {st.title} ({st.durationMinutes}m • {st.fee})
                      </option>
                    ))}
                    <option value="General Consultation">General Diagnostic / Consultation</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Appointment Date *</label>
                  <input
                    type="date"
                    required
                    value={newBookingDate}
                    onChange={(e) => setNewBookingDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Start Time *</label>
                  <select
                    value={newBookingTime}
                    onChange={(e) => setNewBookingTime(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  >
                    {[
                      { value: "08:00", label: "8:00 AM" },
                      { value: "09:00", label: "9:00 AM" },
                      { value: "10:00", label: "10:00 AM" },
                      { value: "11:00", label: "11:00 AM" },
                      { value: "12:00", label: "12:00 PM" },
                      { value: "13:00", label: "1:00 PM" },
                      { value: "14:00", label: "2:00 PM" },
                      { value: "15:00", label: "3:00 PM" },
                      { value: "16:00", label: "4:00 PM" },
                      { value: "17:00", label: "5:00 PM" },
                      { value: "18:00", label: "6:00 PM" },
                    ].map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Duration</label>
                  <select
                    value={newBookingDuration}
                    onChange={(e) => setNewBookingDuration(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  >
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins (1 hr)</option>
                    <option value={90}>90 mins</option>
                    <option value={120}>120 mins (2 hrs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Assigned {semantics.staffSingular}</label>
                <select
                  value={newBookingStaffId}
                  onChange={(e) => setNewBookingStaffId(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">Auto-Assign / Next Available</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Notes &amp; Access Details</label>
                <textarea
                  rows={2}
                  value={newBookingNotes}
                  onChange={(e) => setNewBookingNotes(e.target.value)}
                  placeholder="Service requirements, access details, expectations..."
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={creatingBooking}
                  onClick={() => setShowNewBookingModal(false)}
                  className="px-4 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-50 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBooking}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5"
                >
                  {creatingBooking ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Scheduling &amp; Syncing...</span>
                    </>
                  ) : (
                    <span>Confirm &amp; Schedule</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE STAFF MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">Add {semantics.staffSingular}</h3>
            <p className="text-xs text-zinc-500">
              Configure {semantics.staffSingular.toLowerCase()} credentials, certified {semantics.skillsFieldLabel.toLowerCase()}, and {semantics.territoryFieldLabel.toLowerCase()}.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">{semantics.staffSingular} Full Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`e.g. Dr. Sarah Jenkins / Alex Morgan`}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="practitioner@clinic.com"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+15125550199"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Role / Specialization</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    {semantics.staffRoleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Priority Weight</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(parseInt(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  >
                    <option value="1">1x (Standard)</option>
                    <option value="2">2x (High)</option>
                    <option value="3">3x (Preferred)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {semantics.skillsFieldLabel} (comma separated)
                </label>
                <input
                  type="text"
                  value={newSkills}
                  onChange={(e) => setNewSkills(e.target.value)}
                  placeholder={semantics.skillsPlaceholder}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-0.5">Leave empty if {semantics.staffSingular.toLowerCase()} handles all appointments.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  {semantics.territoryFieldLabel} (comma separated)
                </label>
                <input
                  type="text"
                  value={newTerritories}
                  onChange={(e) => setNewTerritories(e.target.value)}
                  placeholder={semantics.territoryPlaceholder}
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-0.5">Defines smart matching criteria for automated voice scheduling.</p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 text-xs bg-zinc-900 text-white rounded-lg font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : `Save ${semantics.staffSingular}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GOOGLE OAUTH CONFIGURATION & SANDBOX MODAL */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Google Cloud OAuth Setup &amp; Sandbox</h3>
                  <p className="text-xs text-zinc-500">Why Error 401 occurred &amp; how to connect</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <span>The Google OAuth Client ID is not configured on this server yet.</span>
              </p>
              <p className="text-amber-800 leading-relaxed text-[11px]">
                When clicking &quot;Connect with info@vedasynk.com&quot;, Google returned <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">Error 401: invalid_client</code> because <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">GOOGLE_CLIENT_ID</code> has not yet been registered in Google Cloud Console.
              </p>
            </div>

            {/* Instant Sandbox Option */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">Option 1: Instant Sandbox Mode (Ready Now)</span>
                </div>
                <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-semibold px-2 py-0.5 rounded-full">Recommended for Testing</span>
              </div>
              <p className="text-xs text-emerald-900 leading-relaxed">
                Connect the simulated calendar in 1 click. You can immediately test live voice agent slot booking, anti-double-booking locks, smart staff dispatch, and simulated Google Meet link generation without waiting on Google Cloud setup.
              </p>
              <button
                type="button"
                onClick={handleConnectSandboxCalendar}
                disabled={connectingSandbox}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Zap className={`w-4 h-4 ${connectingSandbox ? "animate-spin" : ""}`} />
                <span>{connectingSandbox ? "Connecting Sandbox..." : "Connect Instant Sandbox Calendar Now"}</span>
              </button>
            </div>

            {/* Production Live Sync Instructions */}
            <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-zinc-600" />
                <span className="text-xs font-bold text-zinc-800 uppercase tracking-wide">Option 2: Live Google Calendar Setup (info@vedasynk.com)</span>
              </div>
              <ol className="text-xs text-zinc-600 space-y-1.5 list-decimal pl-4">
                <li>
                  Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blue-600 underline font-medium">Google Cloud Console &gt; APIs &amp; Services &gt; Credentials</a>.
                </li>
                <li>Create <strong>OAuth Client ID</strong> &gt; Application type: <strong>Web application</strong>.</li>
                <li>
                  Add this <strong>Authorized Redirect URI</strong>:
                  <div className="mt-1 flex items-center gap-1.5 bg-white border border-zinc-300 rounded-lg p-1.5 font-mono text-[11px] text-zinc-800">
                    <span className="truncate flex-1">{oauthSetupDetails?.redirect_uri || "https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/portal/calendar/callback"}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyRedirectUri(oauthSetupDetails?.redirect_uri || "https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/portal/calendar/callback")}
                      className="px-2 py-0.5 text-[10px] bg-zinc-100 hover:bg-zinc-200 rounded text-zinc-700 flex items-center gap-1 font-sans"
                    >
                      {copiedRedirectUri ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedRedirectUri ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </li>
                <li>Add <code className="bg-zinc-200 px-1 py-0.5 rounded font-mono text-[10px]">GOOGLE_CLIENT_ID</code> and <code className="bg-zinc-200 px-1 py-0.5 rounded font-mono text-[10px]">GOOGLE_CLIENT_SECRET</code> to your Azure Container App environment variables.</li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="px-4 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-50 font-medium"
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
