"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  api,
  AgentProfile,
  PhoneticEntry,
  PriceItem,
  IntakeQuestionItem,
  CarrierDiagnosticsResponse,
} from "@/lib/api";
import { LIVEKIT_VOICE_CATALOG, LiveKitVoice } from "@/lib/voice-catalog";
import { AiRulesAndObjectionsCard } from "@/components/portal/AiRulesAndObjectionsCard";
import {
  Settings2,
  Save,
  Check,
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  Mic,
  Volume2,
  VolumeX,
  ShieldCheck,
  BookOpen,
  Sparkles,
  Layers,
  Search,
  Tag,
  ShieldAlert,
  X,
  DollarSign,
  Clock,
  MapPin,
  PhoneForwarded,
  Radio,
  Flame,
  AlertTriangle,
  Building,
  Globe,
  Sliders,
  PhoneCall,
  PhoneOff,
  MessageSquare,
  Send,
  Smartphone,
  Activity,
  Wifi,
  CheckCircle2,
  ArrowRight,
  Lock,
  UserCheck,
  Play,
  Square,
  RotateCcw,
  FileText,
  CloudRain,
  Snowflake,
  Sun,
} from "lucide-react";

export type TabType =
  | "persona"
  | "pacing"
  | "guardrails"
  | "intake"
  | "pricing"
  | "emergency"
  | "schedule"
  | "sms";

const CADENCE_PRESETS = [
  {
    id: "urgent_fast",
    label: "Urgent & Rapid",
    silenceMs: 350,
    desc: "Crisp sub-400ms cadence. Ideal for 24/7 HVAC, plumbing emergencies, and fast call turnover.",
    badge: "350ms Pause",
  },
  {
    id: "balanced",
    label: "Balanced Professional",
    silenceMs: 500,
    desc: "Standard natural conversational flow. Suitable for general field service, contractors, and retail.",
    badge: "500ms Pause",
  },
  {
    id: "relaxed_elderly",
    label: "Patient & Relaxed",
    silenceMs: 800,
    desc: "Deliberate pacing with patient 800ms endpointing. Designed for elderly callers and medical intake.",
    badge: "800ms Pause",
  },
];

const AMBIENCE_OPTIONS = [
  { id: "studio_clean", label: "Studio Clean (Silent)", desc: "Pure digital voice with zero background noise." },
  { id: "subtle_office", label: "Subtle Quiet Office", desc: "Gentle low-volume indoor acoustic presence." },
  { id: "hvac_field", label: "Dispatch Desk & Field Van", desc: "Realistic light radio and office activity." },
];

const DEFAULT_INTAKE_ITEMS: IntakeQuestionItem[] = [
  { id: "iq-name", label: "Caller Full Name", required: true, category: "identity", hint: "Mandatory for CRM contact record creation" },
  { id: "iq-phone", label: "Callback Phone Number", required: true, category: "identity", hint: "Mandatory for dispatch verification" },
  { id: "iq-address", label: "Service Property Address & Unit", required: true, category: "location", hint: "Property where work is to be performed" },
  { id: "iq-issue", label: "Symptom & Problem Description", required: true, category: "technical", hint: "Details of pipe leak, AC failure, or request" },
  { id: "iq-urgency", label: "Urgency Rating (Active Leak / Routine)", required: true, category: "triage", hint: "Distinguishes immediate dispatch from standard appointments" },
  { id: "iq-equipment", label: "HVAC Unit / Appliance Brand & Age", required: false, category: "equipment", hint: "Optional equipment context for the field technician" },
  { id: "iq-access", label: "Gate Access Code & Pet Notice", required: false, category: "access", hint: "Property entry notes for arrival" },
];

export default function ReceptionistProfilePage() {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Unified 8-Module Command Suite Tab State
  const [activeTab, setActiveTab] = useState<TabType>("persona");

  // Carrier Diagnostics Telemetry State
  const [carrierData, setCarrierData] = useState<CarrierDiagnosticsResponse | null>(null);
  const [showCarrierModal, setShowCarrierModal] = useState(false);

  // In-Browser Mic Simulator State
  const [showMicModal, setShowMicModal] = useState(false);
  const [simState, setSimState] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [simInterimText, setSimInterimText] = useState("");
  const [simMessages, setSimMessages] = useState<
    Array<{ sender: "user" | "agent"; text: string; time: string }>
  >([]);
  const recognitionRef = useRef<any>(null);

  // Audition Greeting State
  const [isPlayingGreeting, setIsPlayingGreeting] = useState(false);
  const [isPlayingOverride, setIsPlayingOverride] = useState(false);

  // Voice Catalog State
  const [voiceProviderFilter, setVoiceProviderFilter] = useState<string>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Phone Test Call Modal State
  const [showTestCallModal, setShowTestCallModal] = useState(false);
  const [testCallPhone, setTestCallPhone] = useState("+15125550199");
  const [dispatchingTestCall, setDispatchingTestCall] = useState(false);
  const [testCallResult, setTestCallResult] = useState<{
    status: string;
    call_id: string | null;
    compliance_passed: boolean;
    message: string;
    phone_dialed?: string;
  } | null>(null);

  // Module Specific State
  const [playingPhoneticIdx, setPlayingPhoneticIdx] = useState<number | null>(null);
  const [newBarredInput, setNewBarredInput] = useState("");
  const [newIntakeLabel, setNewIntakeLabel] = useState("");
  const [newIntakeCategory, setNewIntakeCategory] = useState("general");
  const [newIntakeRequired, setNewIntakeRequired] = useState(false);
  const [newPriceItem, setNewPriceItem] = useState<PriceItem>({
    service: "",
    amount: "",
    type: "fixed",
    conditions: "",
  });
  const [newKeywordInput, setNewKeywordInput] = useState("");
  const [newCityInput, setNewCityInput] = useState("");

  // ---------------------------------------------------------------------------
  // Load Profile & Carrier Diagnostics on Mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    Promise.all([api.getPortalProfile(), api.getCarrierDiagnostics()])
      .then(([profRes, carrierRes]) => {
        setProfile({
          ...profRes,
          agent_name: profRes.agent_name || "receptionist",
          bilingual_spanish_enabled: Boolean(profRes.bilingual_spanish_enabled),
          patience_cadence: profRes.patience_cadence || "balanced",
          silence_timeout_ms: profRes.silence_timeout_ms || 500,
          speech_barge_in: profRes.speech_barge_in !== false,
          adaptive_empathy: profRes.adaptive_empathy !== false,
          background_ambience: profRes.background_ambience || "studio_clean",
          barred_phrases: profRes.barred_phrases || [
            "I am an AI robot",
            "That is not my job",
            "cheap estimate",
          ],
          intake_questions:
            profRes.intake_questions && profRes.intake_questions.length > 0
              ? profRes.intake_questions
              : DEFAULT_INTAKE_ITEMS,
          office_override_mode: profRes.office_override_mode || "normal",
          office_override_announcement:
            profRes.office_override_announcement ||
            "Attention: Our office is currently operating under emergency weather protocols. Urgent leak dispatch is active.",
          vip_returning_caller_enabled: profRes.vip_returning_caller_enabled !== false,
          vip_returning_greeting:
            profRes.vip_returning_greeting ||
            "Welcome back! Are you calling regarding your ongoing service request?",
          mid_call_sms_enabled: profRes.mid_call_sms_enabled !== false,
          disconnect_recovery_sms_enabled: profRes.disconnect_recovery_sms_enabled !== false,
          disconnect_recovery_sms_text:
            profRes.disconnect_recovery_sms_text ||
            "We noticed our call disconnected! Tap here to resume your service request or view technician status: https://app.vedavoice.com/resume",
          auto_sms_reminders_enabled: profRes.auto_sms_reminders_enabled !== false,
          reminder_lead_hours: profRes.reminder_lead_hours || 24,
          custom_reminder_template:
            profRes.custom_reminder_template ||
            "Reminder from {{tenant_name}}: Your {{service_type}} appointment is on {{date}} at {{time}}. Reply C to confirm or click: {{reschedule_link}}. Reply STOP to opt out.",
          pricing_mode: profRes.pricing_mode || "no_quote",
          price_items:
            profRes.price_items && profRes.price_items.length > 0
              ? profRes.price_items
              : [
                  {
                    service: "Diagnostic Inspection Trip Fee",
                    amount: "$89",
                    type: "fixed",
                    conditions: "Credited toward any approved repair",
                  },
                  {
                    service: "Standard Drain Snaking (up to 50ft)",
                    amount: "$150 - $250",
                    type: "range",
                    conditions: "Excludes main sewer line camera scope",
                  },
                ],
        });
        setCarrierData(carrierRes);
      })
      .catch((err) => {
        setError(err.message || "Failed to load agent profile and carrier telemetry.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Save Handler
  // ---------------------------------------------------------------------------
  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      const updated = await api.updatePortalProfile(profile);
      setProfile((prev) => ({
        ...prev,
        ...updated,
      }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: any) {
      setError(err.message || "Failed to save profile changes.");
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Audition Speech Synthesis
  // ---------------------------------------------------------------------------
  const handlePlayVoicePreview = (voice: LiveKitVoice) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      if (playingVoiceId === voice.id) {
        setPlayingVoiceId(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(voice.sampleAudioText);
      utterance.rate = voice.rate || (voice.provider === "Rime TTS" ? 1.05 : 0.95);
      utterance.pitch = voice.pitch || (voice.gender === "Female" ? 1.15 : 0.9);
      setPlayingVoiceId(voice.id);
      utterance.onend = () => setPlayingVoiceId(null);
      utterance.onerror = () => setPlayingVoiceId(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAuditionGreeting = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (isPlayingGreeting) {
        window.speechSynthesis.cancel();
        setIsPlayingGreeting(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(profile?.greeting || "");
      const selectedVoice = LIVEKIT_VOICE_CATALOG.find((v) => v.id === profile?.voice_id);
      utterance.rate =
        profile?.patience_cadence === "relaxed_elderly"
          ? 0.88
          : profile?.patience_cadence === "urgent_fast"
          ? 1.08
          : selectedVoice?.rate || 0.98;
      utterance.pitch = selectedVoice?.pitch || 1.0;
      setIsPlayingGreeting(true);
      utterance.onend = () => setIsPlayingGreeting(false);
      utterance.onerror = () => setIsPlayingGreeting(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAuditionOverride = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (isPlayingOverride) {
        window.speechSynthesis.cancel();
        setIsPlayingOverride(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(profile?.office_override_announcement || "");
      const selectedVoice = LIVEKIT_VOICE_CATALOG.find((v) => v.id === profile?.voice_id);
      utterance.rate = selectedVoice?.rate || 0.95;
      utterance.pitch = selectedVoice?.pitch || 1.0;
      setIsPlayingOverride(true);
      utterance.onend = () => setIsPlayingOverride(false);
      utterance.onerror = () => setIsPlayingOverride(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // ---------------------------------------------------------------------------
  // In-Browser Mic Simulator
  // ---------------------------------------------------------------------------
  const handleOpenMicSimulator = () => {
    setShowMicModal(true);
    if (simMessages.length === 0) {
      const greetingText =
        profile?.office_override_mode !== "normal" && profile?.office_override_announcement
          ? `${profile.office_override_announcement} ${profile?.greeting || ""}`
          : profile?.greeting || "Thanks for calling! How can I assist you today?";
      setSimMessages([
        {
          sender: "agent",
          text: greetingText,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
  };

  const handleStartMicListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSimInterimText("Web Speech API not supported in this browser. Use the prompt chips below!");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = profile?.bilingual_spanish_enabled ? "es-US" : "en-US";

      recognition.onstart = () => {
        setSimState("listening");
        setSimInterimText("");
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const final = event.results[i][0].transcript;
            handleSimUserSpeech(final);
          } else {
            interim += event.results[i][0].transcript;
            setSimInterimText(interim);
          }
        }
      };

      recognition.onerror = (e: any) => {
        setSimState("idle");
      };

      recognition.onend = () => {
        if (simState === "listening") {
          setSimState("idle");
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      setSimState("idle");
    }
  };

  const handleStopMicListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setSimState("idle");
  };

  const handleSimUserSpeech = (userText: string) => {
    if (!userText.trim()) return;
    setSimInterimText("");
    setSimState("processing");
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setSimMessages((prev) => [...prev, { sender: "user", text: userText, time: timeStr }]);

    // Contextual Receptionist Agent Response Engine
    setTimeout(() => {
      let reply = "";
      const lower = userText.toLowerCase();

      // Check barred phrases safety guardrail
      const matchedBarred = (profile?.barred_phrases || []).find((b) =>
        lower.includes(b.toLowerCase())
      );
      if (matchedBarred) {
        reply = `I apologize, but our policy ensures all recommendations adhere strictly to certified standards. May I gather your address to dispatch an on-site specialist?`;
      } else if (
        lower.includes("emergency") ||
        lower.includes("leak") ||
        lower.includes("flood") ||
        lower.includes("burst") ||
        lower.includes("gas")
      ) {
        reply =
          profile?.approved_safety_script ||
          profile?.emergency_advice ||
          "For active water leaks, locate and shut off your main shutoff valve immediately. I am alerting our emergency dispatch technician right now.";
      } else if (
        lower.includes("price") ||
        lower.includes("cost") ||
        lower.includes("fee") ||
        lower.includes("estimate") ||
        lower.includes("how much")
      ) {
        if (profile?.pricing_mode === "no_quote") {
          reply = `We charge a standard diagnostic inspection fee of $89 to evaluate the issue in person and deliver a guaranteed upfront price before starting.`;
        } else {
          reply = `Our standard diagnostic fee is $89, with drain service typically starting at $150 to $250. Our technician confirms exact costs upon arrival.`;
        }
      } else if (
        lower.includes("hour") ||
        lower.includes("open") ||
        lower.includes("weekend") ||
        lower.includes("available")
      ) {
        reply = `Our regular service hours are ${profile?.hours || "Monday to Friday, 8:00 AM to 6:00 PM"}. For urgent situations, our emergency technician team is available 24/7.`;
      } else if (lower.includes("spanish") || lower.includes("espanol") || lower.includes("hola")) {
        reply = `¡Hola! Sí, le puedo ayudar en español. ¿En qué le puedo colaborar hoy?`;
      } else {
        reply = `Thanks for reaching out to ${profile?.business_name || "us"}. I can definitely assist you with scheduling. Could you please share your service property address?`;
      }

      setSimMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setSimState("speaking");

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(reply);
        const selectedVoice = LIVEKIT_VOICE_CATALOG.find((v) => v.id === profile?.voice_id);
        utt.rate =
          profile?.patience_cadence === "relaxed_elderly"
            ? 0.88
            : profile?.patience_cadence === "urgent_fast"
            ? 1.08
            : selectedVoice?.rate || 0.98;
        utt.pitch = selectedVoice?.pitch || 1.0;
        utt.onend = () => setSimState("idle");
        utt.onerror = () => setSimState("idle");
        window.speechSynthesis.speak(utt);
      } else {
        setSimState("idle");
      }
    }, 400);
  };

  // ---------------------------------------------------------------------------
  // Test Call Trigger
  // ---------------------------------------------------------------------------
  const handleTriggerTestCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testCallPhone.trim()) return;
    setDispatchingTestCall(true);
    setTestCallResult(null);
    try {
      const res = await api.triggerAgentTestCall(testCallPhone.trim());
      setTestCallResult(res);
    } catch (err: any) {
      setTestCallResult({
        status: "error",
        call_id: null,
        compliance_passed: false,
        message: err.message || "Failed to initiate test call",
      });
    } finally {
      setDispatchingTestCall(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="h-10 w-64 bg-zinc-200  animate-pulse rounded-xl" />
        <div className="h-28 w-full bg-zinc-200  animate-pulse rounded-2xl" />
        <div className="h-96 w-full bg-zinc-200  animate-pulse rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 text-zinc-900 ">
      {/* --------------------------------------------------------------------- */}
      {/* 1. TOP HEADER & PRIMARY ACTION CONTROLS                               */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-hairline)]  pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold bg-indigo-500/10 text-indigo-600  border border-indigo-500/20">
              LiveKit Agent Core v2.4
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold bg-emerald-500/10 text-emerald-600  border border-emerald-500/20">
              Sub-500ms P95
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">AI Receptionist Command Center</h1>
          <p className="text-xs text-zinc-500  mt-0.5">
            Unified 360° operational control: voice identity, real-time pacing, safety guardrails, intake checklist, and live carrier telemetry.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* In-Browser Mic Simulator Button */}
          <button
            type="button"
            onClick={handleOpenMicSimulator}
            className="px-3.5 py-2 rounded-xl bg-violet-50  border border-violet-200  text-violet-700  hover:bg-violet-100  text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Mic className="w-3.5 h-3.5 text-violet-600  animate-pulse" />
            <span>🎙️ In-Browser Mic Simulator</span>
          </button>

          {/* Test Call to Phone */}
          <button
            type="button"
            onClick={() => setShowTestCallModal(true)}
            className="px-3 py-2 rounded-xl bg-zinc-100  border border-zinc-300  hover:bg-zinc-200  text-zinc-700  text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <PhoneCall className="w-3.5 h-3.5 text-indigo-600 " />
            <span>Call My Phone</span>
          </button>

          {/* Save Profile Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700   text-white  text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : success ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Saved & Compiled!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save All Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50  border border-red-200  text-xs text-red-700  flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 " />
          <span>{error}</span>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. TOP MISSION CONTROL BAR: CARRIER TELEMETRY & OFFICE OVERRIDE       */}
      {/* --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Carrier Trunk Diagnostics Card */}
        <div className="lg:col-span-2 p-4 rounded-2xl bg-zinc-50  border border-[var(--border-hairline)]  flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 ">
                Live Carrier Trunk Telemetry
              </span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600  border border-emerald-500/20">
                {carrierData?.carrier_status || "OPERATIONAL"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCarrierModal(true)}
              className="text-[11px] font-semibold text-indigo-600  hover:underline flex items-center gap-1"
            >
              <span>View SIP Trunks ({carrierData?.total_trunks || 1})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]/80 ">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-0.5">
                Provider
              </span>
              <span className="font-semibold text-zinc-900  truncate block">
                {carrierData?.default_provider === "livekit"
                  ? "LiveKit SIP Scale"
                  : carrierData?.default_provider || "LiveKit SIP"}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]/80 ">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-0.5">
                STIR/SHAKEN
              </span>
              <div className="flex items-center gap-1 font-semibold text-emerald-600 ">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>A-Attested</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]/80 ">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-0.5">
                SIP Security
              </span>
              <div className="flex items-center gap-1 font-semibold text-zinc-900 ">
                <Lock className="w-3 h-3 text-indigo-500" />
                <span>TLS 1.3 / SRTP</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]/80 ">
              <span className="text-[10px] font-mono uppercase text-zinc-400 block mb-0.5">
                E911 Routing
              </span>
              <span className="font-semibold text-emerald-600 ">
                Registered
              </span>
            </div>
          </div>
        </div>

        {/* Instant Office Override Card */}
        <div className="p-4 rounded-2xl bg-zinc-50  border border-[var(--border-hairline)]  flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700  flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Office Mode Override</span>
              </span>
              {profile.office_override_mode !== "normal" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold bg-amber-500/10 text-amber-600  border border-amber-500/20">
                  Active Override
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500  mb-2.5">
              Instantly toggle severe weather closure, holiday schedules, or after-hours emergency broadcast.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-200/60  rounded-xl">
            <button
              type="button"
              onClick={() => setProfile({ ...profile, office_override_mode: "normal" })}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                profile.office_override_mode === "normal"
                  ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs"
                  : "text-zinc-600  hover:text-zinc-900"
              }`}
            >
              🟢 Normal
            </button>
            <button
              type="button"
              onClick={() => setProfile({ ...profile, office_override_mode: "weather_closure" })}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                profile.office_override_mode === "weather_closure"
                  ? "bg-amber-500 text-white shadow-xs font-bold"
                  : "text-zinc-600  hover:text-zinc-900"
              }`}
            >
              ❄️ Weather
            </button>
            <button
              type="button"
              onClick={() => setProfile({ ...profile, office_override_mode: "holiday_after_hours" })}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all ${
                profile.office_override_mode === "holiday_after_hours"
                  ? "bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] shadow-xs font-bold"
                  : "text-zinc-600  hover:text-zinc-900"
              }`}
            >
              🌙 Holiday
            </button>
          </div>
        </div>
      </div>

      {/* Broadcast Announcement Bar (Visible if office_override_mode != normal) */}
      {profile.office_override_mode !== "normal" && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600  shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold text-amber-800  block">
                Emergency Spoken Broadcast Announcement Active
              </span>
              <p className="text-[11px] text-amber-700/90  mt-0.5">
                This notice is read to callers before the standard greeting:
              </p>
              <input
                type="text"
                value={profile.office_override_announcement || ""}
                onChange={(e) =>
                  setProfile({ ...profile, office_override_announcement: e.target.value })
                }
                placeholder="e.g. Due to severe icing, our vans are grounded today. Urgent pipe leaks are being triaged remotely."
                className="mt-1.5 w-full md:w-[540px] px-3 py-1.5 text-xs rounded-lg border border-amber-300  bg-[var(--surface-panel)]  text-zinc-900  focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAuditionOverride}
            className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
          >
            {isPlayingOverride ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Stop Audio</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>▶ Audition Broadcast</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. 8-MODULE UNIFIED COMMAND SUITE TAB BAR                             */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100  rounded-2xl border border-[var(--border-hairline)]  overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("persona")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "persona"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <Mic className="w-3.5 h-3.5 text-indigo-600 " />
          <span>1. Voice & Persona</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pacing")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "pacing"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-600 " />
          <span>2. Pacing & Cadence</span>
          {profile.bilingual_spanish_enabled && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-cyan-500/20 text-cyan-600 ">
              ES
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("guardrails")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "guardrails"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 " />
          <span>3. Barred Phrases</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-zinc-200  text-zinc-700 ">
            {profile.barred_phrases?.length || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("intake")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "intake"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-amber-600 " />
          <span>4. Caller Intake</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-zinc-200  text-zinc-700 ">
            {profile.intake_questions?.length || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pricing")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "pricing"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <DollarSign className="w-3.5 h-3.5 text-emerald-600 " />
          <span>5. Pricing Policy</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("emergency")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "emergency"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-orange-600 " />
          <span>6. Emergency & Transfer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "schedule"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <MapPin className="w-3.5 h-3.5 text-blue-600 " />
          <span>7. Hours & Geofence</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sms")}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
            activeTab === "sms"
              ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs border border-[var(--border-hairline)] "
              : "text-zinc-600  hover:text-zinc-900 "
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 text-purple-600 " />
          <span>8. SMS & Recovery</span>
        </button>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 4. MODULE CONTENT CONTAINERS                                          */}
      {/* --------------------------------------------------------------------- */}

      {/* ===================================================================== */}
      {/* MODULE 1: VOICE & PERSONA                                             */}
      {/* ===================================================================== */}
      {activeTab === "persona" && (
        <div className="space-y-6">
          {/* Persona Identity & Opening Greeting Card */}
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-tight">AI Identity & Opening Greeting</h3>
                <p className="text-xs text-zinc-500 ">
                  Configure receptionist name, conversational tone, and exact opening greeting.
                </p>
              </div>

              {/* Audition Button */}
              <button
                type="button"
                onClick={handleAuditionGreeting}
                className="px-3.5 py-2 rounded-xl bg-indigo-50  border border-indigo-200  text-indigo-700  hover:bg-indigo-100  text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                {isPlayingGreeting ? (
                  <>
                    <Square className="w-3.5 h-3.5 text-indigo-600 " />
                    <span>Stop Greeting</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-indigo-600 " />
                    <span>▶ Audition Greeting</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Business Legal / Display Name
                </label>
                <input
                  type="text"
                  value={profile.business_name}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Receptionist Spoken Handle
                </label>
                <input
                  type="text"
                  value={profile.agent_name || "receptionist"}
                  onChange={(e) => setProfile({ ...profile, agent_name: e.target.value })}
                  placeholder="e.g. Alex, Sarah, Dispatcher"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Conversational Persona Tone
                </label>
                <select
                  value={profile.tone}
                  onChange={(e) => setProfile({ ...profile, tone: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="direct">Direct & Concise (Trades & Emergency Dispatch)</option>
                  <option value="warm">Warm & Conversational (Consultative & Retail)</option>
                  <option value="formal">Formal & Executive (Medical & Legal)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700  mb-1">
                Spoken Greeting
              </label>
              <textarea
                rows={3}
                value={profile.greeting}
                onChange={(e) => setProfile({ ...profile, greeting: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900  focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1">
                <span>{profile.greeting.length} characters</span>
                <span className="text-zinc-500">
                  Tip: Sub-20 word greetings achieve fastest turn engagement.
                </span>
              </div>
            </div>

            {/* Knowledge Grounding Pill (De-duplicated from monolithic FAQ list) */}
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600  shrink-0" />
                <div>
                  <span className="text-xs font-bold text-emerald-900  block">
                    Dynamic Knowledge Grounding Active
                  </span>
                  <span className="text-[11px] text-emerald-700 ">
                    Live grounded in {profile.faq?.length || 0} direct FAQs and uploaded PDF manuals via Pinecone RAG.
                  </span>
                </div>
              </div>
              <Link
                href="/portal/knowledge"
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
              >
                <span>Open Knowledge Studio</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Voice Selector Catalog Grid */}
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold tracking-tight">Voice Selection Catalog</h3>
                <p className="text-xs text-zinc-500 ">
                  Low-latency neural voices powered by LiveKit Scale Inference & ElevenLabs.
                </p>
              </div>

              {/* Provider Filter */}
              <div className="flex items-center gap-1 p-1 bg-zinc-100  rounded-xl text-xs">
                {["all", "Inworld TTS", "Rime TTS", "Deepgram Aura"].map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setVoiceProviderFilter(provider)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      voiceProviderFilter === provider
                        ? "bg-[var(--surface-panel)]  text-zinc-900  shadow-xs"
                        : "text-zinc-600 "
                    }`}
                  >
                    {provider === "all" ? "All Engines" : provider}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {LIVEKIT_VOICE_CATALOG.filter(
                (v) => voiceProviderFilter === "all" || v.provider === voiceProviderFilter
              ).map((voice) => {
                const isSelected = (profile.voice_id || "Alex") === voice.id;
                const isPlaying = playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => setProfile({ ...profile, voice_id: voice.id })}
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-indigo-600  bg-indigo-50/50  shadow-xs"
                        : "border-[var(--border-hairline)]  hover:border-zinc-300  bg-zinc-50/50 "
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-zinc-900 ">
                            {voice.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-200  text-zinc-700 ">
                            {voice.gender}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-signal)] text-[var(--accent-signal-ink)]">
                            Selected
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mb-2">
                        <span className="font-semibold text-zinc-700 ">
                          {voice.provider}
                        </span>
                        <span>•</span>
                        <span>{voice.trait}</span>
                      </div>

                      <p className="text-[11px] text-zinc-600  line-clamp-2 mb-3">
                        {voice.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border-hairline)]/60 ">
                      <div className="flex items-center gap-1 flex-wrap">
                        {voice.recommendedNiches.slice(0, 2).map((n) => (
                          <span
                            key={n}
                            className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-200/80  text-zinc-600 "
                          >
                            {n}
                          </span>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVoicePreview(voice);
                        }}
                        className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
                          isPlaying
                            ? "bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] border-indigo-600"
                            : "bg-[var(--surface-panel)]  border-[var(--border-hairline)]  hover:bg-zinc-100 text-zinc-700 "
                        }`}
                      >
                        {isPlaying ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phonetic Pronunciation Glossary */}
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-tight">Phonetic Pronunciation Glossary</h3>
                <p className="text-xs text-zinc-500 ">
                  Ensure tricky brand names, technical jargon, and acronyms are spoken with 100% natural cadence.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const current = profile.phonetic_glossary || [];
                    setProfile({
                      ...profile,
                      phonetic_glossary: [
                        ...current,
                        { term: "HVAC", spoken_as: "H-V-A-C", note: "Air conditioning acronym" },
                        { term: "PEX", spoken_as: "pecks", note: "Piping material" },
                      ],
                    });
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-zinc-100  hover:bg-zinc-200 text-zinc-700 "
                >
                  + Add Trades Preset
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {(profile.phonetic_glossary || []).map((entry, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  text-xs"
                >
                  <input
                    type="text"
                    value={entry.term}
                    placeholder="Term (e.g. HVAC)"
                    onChange={(e) => {
                      const updated = [...(profile.phonetic_glossary || [])];
                      updated[idx].term = e.target.value;
                      setProfile({ ...profile, phonetic_glossary: updated });
                    }}
                    className="w-1/3 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)]  bg-[var(--surface-panel)] "
                  />
                  <span className="text-zinc-400">→</span>
                  <input
                    type="text"
                    value={entry.spoken_as}
                    placeholder="Spoken as (e.g. H-V-A-C)"
                    onChange={(e) => {
                      const updated = [...(profile.phonetic_glossary || [])];
                      updated[idx].spoken_as = e.target.value;
                      setProfile({ ...profile, phonetic_glossary: updated });
                    }}
                    className="w-1/3 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)]  bg-[var(--surface-panel)]  font-mono"
                  />
                  <input
                    type="text"
                    value={entry.note || ""}
                    placeholder="Optional note"
                    onChange={(e) => {
                      const updated = [...(profile.phonetic_glossary || [])];
                      updated[idx].note = e.target.value;
                      setProfile({ ...profile, phonetic_glossary: updated });
                    }}
                    className="w-1/3 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)]  bg-[var(--surface-panel)] "
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && "speechSynthesis" in window) {
                        const utt = new SpeechSynthesisUtterance(entry.spoken_as);
                        utt.rate = 0.9;
                        window.speechSynthesis.speak(utt);
                      }
                    }}
                    className="p-1.5 rounded-lg border border-[var(--border-hairline)]  hover:bg-zinc-100  text-zinc-600 "
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (profile.phonetic_glossary || []).filter((_, i) => i !== idx);
                      setProfile({ ...profile, phonetic_glossary: updated });
                    }}
                    className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setProfile({
                    ...profile,
                    phonetic_glossary: [
                      ...(profile.phonetic_glossary || []),
                      { term: "", spoken_as: "", note: "" },
                    ],
                  });
                }}
                className="w-full py-2 border-2 border-dashed border-[var(--border-hairline)]  rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-800 hover:border-zinc-400 transition-all flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Phonetic Entry</span>
              </button>
            </div>
          </div>

          <AiRulesAndObjectionsCard profile={profile} setProfile={setProfile} />
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 2: CONVERSATIONAL AI & PACING                                  */}
      {/* ===================================================================== */}
      {activeTab === "pacing" && (
        <div className="space-y-6">
          {/* Cadence & Patience Selector */}
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Conversational Cadence & Patience</h3>
              <p className="text-xs text-zinc-500 ">
                Tune silence endpointing thresholds to tailor pacing for rapid emergency dispatch vs. patient elderly healthcare.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {CADENCE_PRESETS.map((preset) => {
                const isSelected = (profile.patience_cadence || "balanced") === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        patience_cadence: preset.id,
                        silence_timeout_ms: preset.silenceMs,
                      })
                    }
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-cyan-500  bg-cyan-50/50  shadow-xs"
                        : "border-[var(--border-hairline)]  hover:border-zinc-300  bg-zinc-50/50 "
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-zinc-900 ">
                          {preset.label}
                        </span>
                        <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-cyan-500/10 text-cyan-700  font-bold">
                          {preset.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600  mb-3">
                        {preset.desc}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-bold text-cyan-600  flex items-center gap-1">
                        <Check className="w-3 h-3" /> Active Profile Cadence
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Silence Detection Slider */}
            <div className="pt-3 border-t border-[var(--border-hairline)] ">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-700 ">
                  Custom Silence Threshold Endpointing (ms)
                </label>
                <span className="text-xs font-mono font-bold text-cyan-600 ">
                  {profile.silence_timeout_ms || 500} ms
                </span>
              </div>
              <input
                type="range"
                min="300"
                max="1500"
                step="50"
                value={profile.silence_timeout_ms || 500}
                onChange={(e) =>
                  setProfile({ ...profile, silence_timeout_ms: parseInt(e.target.value, 10) })
                }
                className="w-full accent-cyan-600"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-400 mt-1">
                <span>300ms (Fastest)</span>
                <span>500ms (Default)</span>
                <span>1500ms (Max Patience)</span>
              </div>
            </div>
          </div>

          {/* Bilingual Spanish Auto-Switch & Empathy Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bilingual Spanish */}
            <div className="p-5 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-600 " />
                    <h3 className="text-sm font-bold">Bilingual Spanish Auto-Switch</h3>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.bilingual_spanish_enabled || false}
                    onChange={(e) =>
                      setProfile({ ...profile, bilingual_spanish_enabled: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-cyan-600 accent-cyan-600"
                  />
                </div>
                <p className="text-xs text-zinc-500  mb-3">
                  When enabled, LiveKit agent actively detects Spanish callers ("Hola", "¿Habla español?") and immediately switches to native bilingual Latin American Spanish.
                </p>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {profile.bilingual_spanish_enabled
                  ? "✓ Active: Multi-lingual Spanish turn routing ready"
                  : "Inactive: English only"}
              </span>
            </div>

            {/* Adaptive Empathy & Barge-In */}
            <div className="p-5 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 " />
                    <h3 className="text-sm font-bold">Adaptive Empathy & Sentiment</h3>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.adaptive_empathy !== false}
                    onChange={(e) =>
                      setProfile({ ...profile, adaptive_empathy: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                  />
                </div>
                <p className="text-xs text-zinc-500  mb-3">
                  Dynamically modulates tone pitch and phrasing when caller expresses high stress, panic, or frustration during active emergency intake.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 ">
                <span className="text-xs text-zinc-700  font-medium">
                  Speech Barge-In (Interruption)
                </span>
                <input
                  type="checkbox"
                  checked={profile.speech_barge_in !== false}
                  onChange={(e) =>
                    setProfile({ ...profile, speech_barge_in: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Background Ambience Layer */}
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-3">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Acoustic Ambience Layer</h3>
              <p className="text-xs text-zinc-500 ">
                Subtle real-world background acoustic layers eliminate robotic isolation on cellular lines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {AMBIENCE_OPTIONS.map((opt) => {
                const isSelected = (profile.background_ambience || "studio_clean") === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setProfile({ ...profile, background_ambience: opt.id })}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "border-cyan-500 bg-cyan-50/40 "
                        : "border-[var(--border-hairline)]  hover:border-zinc-300"
                    }`}
                  >
                    <span className="font-bold text-zinc-900  block mb-0.5">
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-zinc-500 ">
                      {opt.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 3: BARRED PHRASES & SAFETY GUARDRAILS                           */}
      {/* ===================================================================== */}
      {activeTab === "guardrails" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold tracking-tight">Do-Not-Say Guardrails Blacklist</h3>
                <p className="text-xs text-zinc-500 ">
                  Strictly barred statements that the AI receptionist is forbidden from uttering under any circumstance.
                </p>
              </div>

              {/* Industry Quick Presets */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const additions = [
                      "Never guarantee price before diagnosis",
                      "Never promise same-hour arrival without dispatch approval",
                      "I am an AI robot",
                    ];
                    const current = profile.barred_phrases || [];
                    const merged = Array.from(new Set([...current, ...additions]));
                    setProfile({ ...profile, barred_phrases: merged });
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-rose-50  border border-rose-200  text-rose-700  hover:bg-rose-100"
                >
                  🛡️ Contractor Shield
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const additions = [
                      "Never provide medical diagnosis",
                      "Never prescribe medication",
                      "Advise emergency room for severe chest pain",
                    ];
                    const current = profile.barred_phrases || [];
                    const merged = Array.from(new Set([...current, ...additions]));
                    setProfile({ ...profile, barred_phrases: merged });
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50  border border-indigo-200  text-indigo-700  hover:bg-indigo-100"
                >
                  ⚕️ Medical Shield
                </button>
              </div>
            </div>

            {/* Barred Chip Tags */}
            <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  min-h-[90px]">
              {(profile.barred_phrases || []).map((phrase, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-100  text-rose-800  border border-rose-300 "
                >
                  <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>{phrase}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = (profile.barred_phrases || []).filter((_, i) => i !== idx);
                      setProfile({ ...profile, barred_phrases: updated });
                    }}
                    className="hover:text-rose-950 "
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            {/* Add Custom Barred Phrase */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newBarredInput}
                onChange={(e) => setNewBarredInput(e.target.value)}
                placeholder="e.g. That is not my problem, We can do it for free"
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50 "
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newBarredInput.trim()) {
                    e.preventDefault();
                    const current = profile.barred_phrases || [];
                    setProfile({
                      ...profile,
                      barred_phrases: [...current, newBarredInput.trim()],
                    });
                    setNewBarredInput("");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newBarredInput.trim()) {
                    const current = profile.barred_phrases || [];
                    setProfile({
                      ...profile,
                      barred_phrases: [...current, newBarredInput.trim()],
                    });
                    setNewBarredInput("");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600  text-white  text-xs font-semibold hover:bg-indigo-700"
              >
                Add Blacklisted Phrase
              </button>
            </div>

            {/* Returning VIP Recognition */}
            <div className="pt-4 border-t border-[var(--border-hairline)]  flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className="w-4 h-4 text-emerald-600 " />
                  <span className="text-xs font-bold text-zinc-900 ">
                    Returning Customer & VIP Caller Recognition
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 ">
                  When active, callers in your CRM are recognized immediately by phone number.
                </p>
              </div>

              <input
                type="checkbox"
                checked={profile.vip_returning_caller_enabled !== false}
                onChange={(e) =>
                  setProfile({ ...profile, vip_returning_caller_enabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-emerald-600 accent-emerald-600"
              />
            </div>

            {profile.vip_returning_caller_enabled !== false && (
              <div className="mt-2">
                <label className="block text-[11px] font-medium text-zinc-700  mb-1">
                  Recognized Returning Caller Greeting
                </label>
                <input
                  type="text"
                  value={profile.vip_returning_greeting || ""}
                  onChange={(e) =>
                    setProfile({ ...profile, vip_returning_greeting: e.target.value })
                  }
                  placeholder="Welcome back! Are you calling regarding your ongoing service appointment?"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  font-mono"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 4: CALLER INTAKE QUESTIONNAIRE                                 */}
      {/* ===================================================================== */}
      {activeTab === "intake" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold tracking-tight">Structured Caller Intake Checklist</h3>
                <p className="text-xs text-zinc-500 ">
                  Data points the receptionist is strictly mandated to collect before booking or dispatching.
                </p>
              </div>

              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-100  text-zinc-600 ">
                {profile.intake_questions?.filter((q) => q.required).length} Mandatory Requirements
              </span>
            </div>

            <div className="space-y-2">
              {(profile.intake_questions || []).map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-zinc-200  flex items-center justify-center font-mono text-[10px] font-bold text-zinc-700 ">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-semibold text-zinc-900  block">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="text-[11px] text-zinc-500 ">
                          {item.hint}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-200  text-zinc-600 ">
                      {item.category || "general"}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(profile.intake_questions || [])];
                        updated[idx].required = !updated[idx].required;
                        setProfile({ ...profile, intake_questions: updated });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        item.required
                          ? "bg-amber-500/10 text-amber-700  border border-amber-500/20"
                          : "bg-zinc-100  text-zinc-400 border border-[var(--border-hairline)] "
                      }`}
                    >
                      {item.required ? "Mandatory" : "Optional"}
                    </button>

                    {/* Don't delete locked identity fields */}
                    {!["iq-name", "iq-phone"].includes(item.id) && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (profile.intake_questions || []).filter((_, i) => i !== idx);
                          setProfile({ ...profile, intake_questions: updated });
                        }}
                        className="p-1 text-zinc-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Question Row */}
            <div className="pt-3 border-t border-[var(--border-hairline)]  flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newIntakeLabel}
                onChange={(e) => setNewIntakeLabel(e.target.value)}
                placeholder="e.g. Approximate Square Footage, Insurance Policy Number"
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50 "
              />
              <select
                value={newIntakeCategory}
                onChange={(e) => setNewIntakeCategory(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-700 "
              >
                <option value="location">Location</option>
                <option value="equipment">Equipment</option>
                <option value="access">Access</option>
                <option value="billing">Billing</option>
                <option value="general">General</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (newIntakeLabel.trim()) {
                    const current = profile.intake_questions || [];
                    setProfile({
                      ...profile,
                      intake_questions: [
                        ...current,
                        {
                          id: `iq-${Date.now()}`,
                          label: newIntakeLabel.trim(),
                          required: newIntakeRequired,
                          category: newIntakeCategory,
                        },
                      ],
                    });
                    setNewIntakeLabel("");
                  }
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600  text-white  text-xs font-semibold hover:bg-indigo-700 shrink-0"
              >
                + Add Custom Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 5: PRICING POLICY                                              */}
      {/* ===================================================================== */}
      {activeTab === "pricing" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Telephone Pricing Policy</h3>
              <p className="text-xs text-zinc-500 ">
                Determine how the receptionist responds when callers demand pricing over the phone.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "no_quote",
                  label: "Diagnostic Fee Only",
                  desc: "Quotes standard trip fee ($89) and explains all physical work requires on-site inspection.",
                },
                {
                  id: "listed",
                  label: "Listed Price Menu",
                  desc: "Quotes exact fixed pricing for specific menu items (e.g. drain cleaning, water heater tune-up).",
                },
                {
                  id: "range",
                  label: "Price Ranges",
                  desc: "Quotes estimated ranges with clear disclaimer that unexpected complexity adjusts pricing.",
                },
              ].map((policy) => {
                const isSelected = (profile.pricing_mode || "no_quote") === policy.id;
                return (
                  <div
                    key={policy.id}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        pricing_mode: policy.id as any,
                        pricing_policy: policy.id,
                      })
                    }
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50  shadow-xs"
                        : "border-[var(--border-hairline)]  hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-zinc-900 ">
                        {policy.label}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <p className="text-[11px] text-zinc-600 ">{policy.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Price Items Table */}
            <div className="pt-4 border-t border-[var(--border-hairline)]  space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700  block">
                Recognized Service Price Menu
              </span>

              <div className="space-y-2">
                {(profile.price_items || []).map((item: any, idx) => {
                  const sName = typeof item === "string" ? item : item.service;
                  const sAmt = typeof item === "string" ? "$89" : item.amount;
                  const sCond = typeof item === "string" ? "" : item.conditions || "";

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  text-xs"
                    >
                      <div>
                        <span className="font-bold text-zinc-900  block">
                          {sName}
                        </span>
                        {sCond && (
                          <span className="text-[11px] text-zinc-500 ">
                            {sCond}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-emerald-600 ">
                          {sAmt}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (profile.price_items || []).filter((_, i) => i !== idx);
                            setProfile({ ...profile, price_items: updated });
                          }}
                          className="p-1 text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Price Item */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <input
                  type="text"
                  value={newPriceItem.service}
                  onChange={(e) => setNewPriceItem({ ...newPriceItem, service: e.target.value })}
                  placeholder="Service Name (e.g. Tankless Flush)"
                  className="w-1/2 px-3 py-1.5 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50 "
                />
                <input
                  type="text"
                  value={newPriceItem.amount}
                  onChange={(e) => setNewPriceItem({ ...newPriceItem, amount: e.target.value })}
                  placeholder="Amount / Range (e.g. $189)"
                  className="w-1/4 px-3 py-1.5 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newPriceItem.service.trim()) {
                      const current = profile.price_items || [];
                      setProfile({
                        ...profile,
                        price_items: [...current, newPriceItem],
                      });
                      setNewPriceItem({ service: "", amount: "", type: "fixed", conditions: "" });
                    }
                  }}
                  className="w-1/4 px-3 py-1.5 rounded-xl bg-indigo-600  text-white  text-xs font-semibold hover:bg-indigo-700"
                >
                  + Add Price Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 6: EMERGENCY & LIVE SIP REFER                                  */}
      {/* ===================================================================== */}
      {activeTab === "emergency" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Emergency Protocol & Live SIP Transfer</h3>
              <p className="text-xs text-zinc-500 ">
                Configure immediate safety scripts, on-call technician phone number, and warm SIP transfer routing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  On-Call Transfer Phone Number (E.164)
                </label>
                <input
                  type="tel"
                  value={profile.transfer_number}
                  onChange={(e) => setProfile({ ...profile, transfer_number: e.target.value })}
                  placeholder="+1 (512) 555-0199"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  font-mono"
                />
                <span className="text-[11px] text-zinc-500 mt-1 block">
                  When triggered, AI will initiate warm SIP REFER to this number.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Emergency Dispatch Mode
                </label>
                <select
                  value={profile.emergency_mode || "priority_message"}
                  onChange={(e) => setProfile({ ...profile, emergency_mode: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900 "
                >
                  <option value="priority_message">Priority Message (Instant SMS notification)</option>
                  <option value="live_transfer">Live SIP Transfer (Direct phone patch)</option>
                  <option value="hybrid">Hybrid (Attempt live transfer, fallback to SMS)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700  mb-1">
                Approved Safety Guidance Script
              </label>
              <textarea
                rows={3}
                value={profile.approved_safety_script || profile.emergency_advice}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    approved_safety_script: e.target.value,
                    emergency_advice: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900  font-mono"
              />
            </div>

            {/* Emergency Keywords */}
            <div>
              <label className="block text-xs font-medium text-zinc-700  mb-1">
                Trigger Keywords
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(profile.emergency_keywords || []).map((kw, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100  text-orange-800  border border-orange-300 "
                  >
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (profile.emergency_keywords || []).filter((_, i) => i !== idx);
                        setProfile({ ...profile, emergency_keywords: updated });
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  placeholder="e.g. water gushing, gas smell, electrical sparks"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50 "
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newKeywordInput.trim()) {
                      const current = profile.emergency_keywords || [];
                      setProfile({
                        ...profile,
                        emergency_keywords: [...current, newKeywordInput.trim()],
                      });
                      setNewKeywordInput("");
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700"
                >
                  + Add Keyword
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 7: OPERATING SCHEDULE & GEOFENCE                               */}
      {/* ===================================================================== */}
      {activeTab === "schedule" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Business Hours & Geofenced Service Area</h3>
              <p className="text-xs text-zinc-500 ">
                Define operational availability, service radius, and out-of-area rejection policies.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Business Hours String
                </label>
                <input
                  type="text"
                  value={profile.hours}
                  onChange={(e) => setProfile({ ...profile, hours: e.target.value })}
                  placeholder="Monday to Friday, 8:00 AM to 6:00 PM EST"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Timezone
                </label>
                <select
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  text-zinc-900 "
                >
                  <option value="America/New_York">Eastern Time (America/New_York)</option>
                  <option value="America/Chicago">Central Time (America/Chicago)</option>
                  <option value="America/Denver">Mountain Time (America/Denver)</option>
                  <option value="America/Los_Angeles">Pacific Time (America/Los_Angeles)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700  mb-1">
                Service Area Description
              </label>
              <input
                type="text"
                value={profile.service_area || ""}
                onChange={(e) => setProfile({ ...profile, service_area: e.target.value })}
                placeholder="Greater Austin Metro within 35 miles"
                className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50 "
              />
            </div>

            {/* Geofenced Cities Tags */}
            <div>
              <label className="block text-xs font-medium text-zinc-700  mb-1">
                Geofenced Serviced Municipalities
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(profile.service_cities || []).map((city, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100  text-blue-800  border border-blue-300 "
                  >
                    <span>{city}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = (profile.service_cities || []).filter((_, i) => i !== idx);
                        setProfile({ ...profile, service_cities: updated });
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCityInput}
                  onChange={(e) => setNewCityInput(e.target.value)}
                  placeholder="e.g. Austin, Round Rock, Cedar Park"
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50 "
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCityInput.trim()) {
                      const current = profile.service_cities || [];
                      setProfile({
                        ...profile,
                        service_cities: [...current, newCityInput.trim()],
                      });
                      setNewCityInput("");
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  + Add City
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODULE 8: SMS DISPATCH & DISCONNECT RECOVERY                          */}
      {/* ===================================================================== */}
      {activeTab === "sms" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  space-y-4">
            <div>
              <h3 className="text-sm font-bold tracking-tight">Automated SMS Dispatch & Cellular Recovery</h3>
              <p className="text-xs text-zinc-500 ">
                Trigger instant text messages during live calls and recover dropped cellular connections automatically.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mid-Call SMS Toggle */}
              <div className="p-4 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-900  flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-purple-600" />
                      <span>Mid-Call Live SMS Link Dispatch</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={profile.mid_call_sms_enabled !== false}
                      onChange={(e) =>
                        setProfile({ ...profile, mid_call_sms_enabled: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-purple-600 accent-purple-600"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 ">
                    Allows the AI receptionist to text booking confirmation links, photos portal, or payment links to caller's phone during the live call.
                  </p>
                </div>
              </div>

              {/* Disconnect Recovery Toggle */}
              <div className="p-4 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-900  flex items-center gap-1.5">
                      <PhoneOff className="w-3.5 h-3.5 text-rose-600" />
                      <span>Dropped Call Cellular Recovery SMS</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={profile.disconnect_recovery_sms_enabled !== false}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          disconnect_recovery_sms_enabled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded text-rose-600 accent-rose-600"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 ">
                    If caller signal drops abruptly, an automated SMS is dispatched within 5 seconds with a 1-tap link to resume.
                  </p>
                </div>
              </div>
            </div>

            {/* Dropped Call Recovery Template */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-700 ">
                Dropped Call Recovery SMS Text Template
              </label>
              <textarea
                rows={3}
                value={profile.disconnect_recovery_sms_text || ""}
                onChange={(e) =>
                  setProfile({ ...profile, disconnect_recovery_sms_text: e.target.value })
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  font-mono"
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>
                  {(profile.disconnect_recovery_sms_text || "").length} / 160 characters (1 SMS segment)
                </span>
                <span>Available tokens: {"{business_name}, {resume_link}"}</span>
              </div>
            </div>

            {/* Smartphone Simulation Preview */}
            <div className="p-4 rounded-xl bg-zinc-100  border border-[var(--border-hairline)]  flex items-center justify-center">
              <div className="w-[340px] bg-[var(--surface-panel)]  rounded-2xl border border-zinc-300  p-3 shadow-sm">
                <div className="flex items-center justify-between text-[10px] text-zinc-400 pb-2 border-b border-zinc-100 ">
                  <span className="font-semibold text-zinc-700 ">
                    {profile.business_name || "Apex Plumbing"}
                  </span>
                  <span>Now</span>
                </div>
                <div className="mt-2.5 p-2.5 rounded-xl bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] text-[11px] font-sans leading-relaxed">
                  {profile.disconnect_recovery_sms_text ||
                    "We noticed our call disconnected! Tap here to resume: https://app.vedavoice.com/resume"}
                </div>
              </div>
            </div>

            {/* 2-Way SMS Confirmation & Automated 24h Reminders */}
            <div className="pt-6 border-t border-[var(--border-hairline)]  space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900  flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <span>Automated Appointment Reminder Texts & 2-Way Reschedule</span>
                  </h4>
                  <p className="text-[11px] text-zinc-500  mt-0.5">
                    Sends automatic SMS reminders to booked customers with 1-tap reschedule links and 2-way text responses (Reply C to confirm, CANCEL, or RESCHEDULE).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profile.auto_sms_reminders_enabled !== false}
                    onChange={(e) =>
                      setProfile({ ...profile, auto_sms_reminders_enabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer  peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--surface-panel)] after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {profile.auto_sms_reminders_enabled !== false && (
                <div className="space-y-4 p-4 rounded-xl bg-zinc-50  border border-[var(--border-hairline)] ">
                  {/* Lead Hours Selector */}
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
                      Reminder Dispatch Timing Before Appointment
                    </label>
                    <div className="flex gap-2">
                      {[12, 24, 48].map((hours) => (
                        <button
                          key={hours}
                          type="button"
                          onClick={() => setProfile({ ...profile, reminder_lead_hours: hours })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            (profile.reminder_lead_hours || 24) === hours
                              ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 "
                              : "bg-[var(--surface-panel)]  border-[var(--border-hairline)]  text-zinc-600  hover:border-zinc-300"
                          }`}
                        >
                          {hours} Hours Prior {hours === 24 ? "(Recommended)" : ""}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Template Editor */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                      SMS Template Customizer
                    </label>
                    <textarea
                      rows={3}
                      value={profile.custom_reminder_template || ""}
                      onChange={(e) =>
                        setProfile({ ...profile, custom_reminder_template: e.target.value })
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-[var(--surface-panel)]  font-mono text-zinc-900 "
                    />

                    {/* Variable Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono text-zinc-400 mr-1">Insert Variable:</span>
                      {[
                        "{{customer_name}}",
                        "{{service_type}}",
                        "{{tenant_name}}",
                        "{{date}}",
                        "{{time}}",
                        "{{reschedule_link}}",
                      ].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const cur = profile.custom_reminder_template || "";
                            setProfile({
                              ...profile,
                              custom_reminder_template: `${cur} ${tag}`.trim(),
                            });
                          }}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-200  text-zinc-700  hover:bg-zinc-300  transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Smartphone Reminder Preview */}
                  <div className="pt-2">
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                      Live Customer Handset Preview
                    </span>
                    <div className="w-full max-w-sm bg-[var(--surface-panel)]  rounded-2xl border border-zinc-300  p-3 shadow-xs">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 pb-2 border-b border-zinc-100 ">
                        <span className="font-semibold text-zinc-700 ">
                          {profile.business_name || "Apex Plumbing"}
                        </span>
                        <span>SMS • 24h Reminder</span>
                      </div>
                      <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-600 text-white text-[11px] font-sans leading-relaxed">
                        {(profile.custom_reminder_template || "")
                          .replace("{{customer_name}}", "Jane Doe")
                          .replace("{{service_type}}", "Drain Cleaning")
                          .replace("{{tenant_name}}", profile.business_name || "Apex Plumbing")
                          .replace("{{date}}", "Tomorrow, 2:00 PM")
                          .replace("{{time}}", "2:00 PM EST")
                          .replace("{{reschedule_link}}", "https://app.vedavoice.com/reschedule/sample-token") ||
                          `Reminder from ${profile.business_name || "Apex Plumbing"}: Your Drain Cleaning appointment is tomorrow at 2:00 PM EST. Reply C to confirm or 1-tap: https://app.vedavoice.com/reschedule/sample-token. Reply STOP to opt out.`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 5. IN-BROWSER MIC SIMULATOR MODAL                                     */}
      {/* --------------------------------------------------------------------- */}
      {showMicModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100  pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center font-bold">
                  🎙️
                </div>
                <div>
                  <h3 className="text-sm font-bold">In-Browser Mic Simulator</h3>
                  <p className="text-[11px] text-zinc-400">
                    Real-time voice interactive testing using browser speech recognition & synthesis.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleStopMicListening();
                  setShowMicModal(false);
                }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conversation Bubbles */}
            <div className="h-64 overflow-y-auto space-y-2.5 p-3 rounded-2xl bg-zinc-50  border border-[var(--border-hairline)]  text-xs">
              {simMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl ${
                      msg.sender === "user"
                        ? "bg-violet-600 text-white rounded-br-xs"
                        : "bg-[var(--surface-panel)]  text-zinc-900  border border-[var(--border-hairline)]  rounded-bl-xs"
                    }`}
                  >
                    <p className="leading-relaxed">{msg.text}</p>
                    <span
                      className={`text-[9px] mt-1 block ${
                        msg.sender === "user" ? "text-violet-200" : "text-zinc-400"
                      }`}
                    >
                      {msg.time}
                    </span>
                  </div>
                </div>
              ))}

              {simInterimText && (
                <div className="flex flex-col items-end">
                  <div className="max-w-[80%] p-2.5 rounded-xl bg-violet-600/30 text-violet-800  italic">
                    {simInterimText}...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="text-zinc-400 font-mono text-[10px]">Test Prompts:</span>
              {[
                "Do you fix active water leaks?",
                "How much is your diagnostic fee?",
                "Are you open on weekends?",
                "¿Habla español?",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSimUserSpeech(chip)}
                  className="px-2 py-0.5 rounded-full bg-zinc-100  text-zinc-700  hover:bg-zinc-200 border border-[var(--border-hairline)] "
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Mic Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 ">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    simState === "listening"
                      ? "bg-red-500 animate-ping"
                      : simState === "speaking"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-zinc-400"
                  }`}
                />
                <span className="text-xs font-mono capitalize text-zinc-600 ">
                  {simState === "listening"
                    ? "Listening to mic..."
                    : simState === "speaking"
                    ? "Agent Speaking..."
                    : simState === "processing"
                    ? "Synthesizing response..."
                    : "Ready"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {simState === "listening" ? (
                  <button
                    type="button"
                    onClick={handleStopMicListening}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Listening</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartMicListening}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Speak to Agent</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 6. CARRIER TRUNK DIAGNOSTICS MODAL                                    */}
      {/* --------------------------------------------------------------------- */}
      {showCarrierModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100  pb-3">
              <div>
                <h3 className="text-sm font-bold">Carrier SIP Trunk Architecture</h3>
                <p className="text-[11px] text-zinc-400">
                  Real-time reachability, encryption ciphers, and STIR/SHAKEN attestation telemetry.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCarrierModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {(carrierData?.trunks || []).map((trunk) => (
                <div
                  key={trunk.phone_id}
                  className="p-3.5 rounded-xl bg-zinc-50  border border-[var(--border-hairline)]  text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono font-bold text-zinc-900 ">
                        {trunk.e164}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-600 font-bold">
                        {trunk.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400">{trunk.label}</span>
                  </div>

                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <span className="font-mono text-[11px] text-zinc-700  block">
                        {trunk.trunk_id}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        STIR/SHAKEN: Grade {trunk.stir_shaken_attestation}
                      </span>
                    </div>
                    <span className="px-2 py-1 rounded bg-zinc-200  font-mono text-[11px] font-bold">
                      {trunk.round_trip_ms}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-zinc-100  flex justify-end">
              <button
                type="button"
                onClick={() => setShowCarrierModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600  text-white  text-xs font-semibold"
              >
                Close Telemetry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 7. TEST CALL PHONE MODAL (TCPA COMPLIANT)                             */}
      {/* --------------------------------------------------------------------- */}
      {showTestCallModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-panel)]  border border-[var(--border-hairline)]  rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100  pb-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-indigo-600 " />
                <h3 className="text-sm font-bold">Test Call Your Phone</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTestCallModal(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTriggerTestCall} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700  mb-1">
                  Recipient Mobile Phone (E.164)
                </label>
                <input
                  type="tel"
                  value={testCallPhone}
                  onChange={(e) => setTestCallPhone(e.target.value)}
                  placeholder="+1 (512) 555-0199"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-hairline)]  bg-zinc-50  font-mono"
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">
                  Automated test calls verify sub-second turn latency and TCPA compliance gates.
                </span>
              </div>

              {testCallResult && (
                <div
                  className={`p-3 rounded-xl text-xs ${
                    testCallResult.compliance_passed
                      ? "bg-emerald-50  text-emerald-800  border border-emerald-200"
                      : "bg-red-50  text-red-800  border border-red-200"
                  }`}
                >
                  <span className="font-bold block mb-0.5">
                    {testCallResult.compliance_passed ? "✓ Dispatch Authorized" : "Blocked by Gate"}
                  </span>
                  <span>{testCallResult.message}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTestCallModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl text-zinc-600 "
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchingTestCall}
                  className="px-4 py-2 rounded-xl bg-[var(--accent-signal)] hover:opacity-90 text-[var(--accent-signal-ink)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {dispatchingTestCall ? "Dispatching..." : "Call My Phone Now"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
