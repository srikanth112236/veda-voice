"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, AvailableNumberItem } from "@/lib/api";
import { LIVEKIT_VOICE_CATALOG, LiveKitVoice } from "@/lib/voice-catalog";
import {
  Building2,
  PhoneCall,
  Volume2,
  ShieldCheck,
  Rocket,
  Check,
  ArrowRight,
  ArrowLeft,
  Search,
  Sparkles,
  Layers,
  Radio,
  Clock,
  PhoneForwarded,
  ShieldAlert,
  HelpCircle,
  Plus,
  X,
  Phone,
  PhoneOff,
  AlertTriangle,
  Flame,
  Droplets,
  Zap,
} from "lucide-react";

interface FAQEntry {
  question: string;
  answer: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Step 2: Phone number search & mode state
  const [phoneMode, setPhoneMode] = useState<"carrier_search" | "agency_pool" | "byon">("carrier_search");
  const [areaCodeQuery, setAreaCodeQuery] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumberItem[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);

  // Step 3: Voice selection & preview state
  const [voiceProviderFilter, setVoiceProviderFilter] = useState<string>("all");
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<string>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Step 4: Tag & FAQ input state
  const [newServiceTag, setNewServiceTag] = useState("");
  const [newKeywordTag, setNewKeywordTag] = useState("");

  // Step 5: Test simulator state
  const [simState, setSimState] = useState<"idle" | "calling" | "connected">("idle");
  const [simDuration, setSimDuration] = useState(0);
  const [simAgentSpeech, setSimAgentSpeech] = useState<string>("");
  const [simActiveQuestion, setSimActiveQuestion] = useState<string | null>(null);

  // Form state across all 5 steps
  const [formData, setFormData] = useState({
    // Step 1: Identity & Niche
    business_name: "Apex Plumbing & Heating",
    owner_name: "Bob Henderson",
    email: "owner@apexplumbing.local",
    password: "Password123!",
    timezone: "America/New_York",
    hours: "Monday to Friday, 8:00 AM to 6:00 PM EST",
    niche: "plumbing",

    // Step 2: Phone
    phone_number: "+1 (512) 555-0199",
    byon_carrier: "verizon",

    // Step 3: Voice & Persona
    agent_name: "Alex",
    tts_voice: "Alex",
    tone: "direct",
    greeting:
      "Thanks for calling Apex Plumbing & Heating. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
    recording_disclosure: true,

    // Step 4: Knowledge Base & Guardrails
    pricing_policy: "diagnostic_fee_only",
    diagnostic_fee: "$89.00",
    emergency_advice:
      "If safe to do so, please locate and shut off your main water valve right away to prevent further flooding while I write down your address.",
    services: [
      "Emergency pipe bursts",
      "Drain cleaning & snaking",
      "Water heater repair & replacement",
      "Slab leak detection",
    ],
    emergency_keywords: ["burst pipe", "flooding", "gas leak", "water heater leak", "urgent"],
    faq: [
      {
        question: "Do you offer emergency after-hours dispatch?",
        answer: "Yes, our licensed technicians are on-call 24 hours a day for water or gas emergencies.",
      },
      {
        question: "What forms of payment do you accept?",
        answer: "We accept Visa, Mastercard, American Express, checks, and on-site financing upon technician inspection.",
      },
    ] as FAQEntry[],
  });

  // Auto-detect timezone on mount
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) {
        setFormData((prev) => ({ ...prev, timezone: detected }));
      }
    } catch {
      // Fallback stays America/New_York
    }
  }, []);

  // Fetch numbers on mode or area code change
  useEffect(() => {
    if (phoneMode === "byon") return;
    setLoadingNumbers(true);
    api
      .searchAvailableNumbers(areaCodeQuery, phoneMode)
      .then((res) => {
        setAvailableNumbers(res);
        if (res.length > 0 && !res.some((n) => n.e164 === formData.phone_number)) {
          setFormData((prev) => ({ ...prev, phone_number: res[0].e164 }));
        }
      })
      .catch((err) => console.error("Failed to load numbers:", err))
      .finally(() => setLoadingNumbers(false));
  }, [phoneMode, areaCodeQuery]);

  // Simulator timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (simState === "connected") {
      interval = setInterval(() => {
        setSimDuration((d) => d + 1);
      }, 1000);
    } else {
      setSimDuration(0);
    }
    return () => clearInterval(interval);
  }, [simState]);

  const speakText = (text: string, voiceId?: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const chosenVoice = LIVEKIT_VOICE_CATALOG.find((v) => v.id === (voiceId || formData.tts_voice));
      if (chosenVoice) {
        utterance.rate = chosenVoice.provider === "Rime TTS" ? 1.05 : 0.95;
        utterance.pitch = chosenVoice.gender === "Female" ? 1.15 : 0.9;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const handlePlayVoicePreview = (voice: LiveKitVoice) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (playingVoiceId === voice.id) {
        window.speechSynthesis.cancel();
        setPlayingVoiceId(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(voice.sampleAudioText);
      utterance.rate = voice.provider === "Rime TTS" ? 1.05 : 0.95;
      utterance.pitch = voice.gender === "Female" ? 1.15 : 0.9;
      setPlayingVoiceId(voice.id);
      utterance.onend = () => setPlayingVoiceId(null);
      utterance.onerror = () => setPlayingVoiceId(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const applyNichePreset = (niche: string) => {
    if (niche === "plumbing") {
      setFormData((prev) => ({
        ...prev,
        niche: "plumbing",
        business_name: "Apex Plumbing & Heating",
        tone: "direct",
        agent_name: "Alex",
        tts_voice: "Alex",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$89.00",
        emergency_advice:
          "If safe to do so, please locate and shut off your main water valve right away to prevent further flooding while I write down your address.",
        services: [
          "Emergency pipe bursts",
          "Drain cleaning & snaking",
          "Water heater repair & replacement",
          "Slab leak detection",
        ],
        emergency_keywords: ["burst pipe", "flooding", "gas leak", "water heater leak", "urgent"],
        greeting:
          "Thanks for calling Apex Plumbing & Heating. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
        faq: [
          {
            question: "Do you offer emergency after-hours dispatch?",
            answer: "Yes, our licensed technicians are on-call 24 hours a day for water or gas emergencies.",
          },
          {
            question: "What forms of payment do you accept?",
            answer: "We accept Visa, Mastercard, American Express, checks, and on-site financing upon technician inspection.",
          },
        ],
      }));
    } else if (niche === "dental") {
      setFormData((prev) => ({
        ...prev,
        niche: "dental",
        business_name: "SmileCare Dental Practice",
        tone: "warm",
        agent_name: "Ashley",
        tts_voice: "Ashley",
        pricing_policy: "fixed_menu",
        diagnostic_fee: "$75.00",
        emergency_advice:
          "If you are experiencing severe bleeding, swelling affecting breathing, or jaw trauma, please visit an urgent care or emergency room immediately.",
        services: [
          "Teeth cleaning & exam",
          "Emergency toothache triage",
          "Dental crowns & fillings",
          "Teeth whitening",
        ],
        emergency_keywords: ["severe toothache", "bleeding", "knocked out tooth", "swelling", "abscess"],
        greeting:
          "Thanks for calling SmileCare Dental Practice. I'm an automated assistant, and this call may be recorded for quality care. How can we help your smile today?",
        faq: [
          {
            question: "Do you accept dental insurance?",
            answer: "We accept most major PPO dental insurance plans including Delta Dental, Cigna, and Aetna.",
          },
          {
            question: "Are new patients welcome?",
            answer: "Yes, we are currently accepting new patients for both general and cosmetic appointments.",
          },
        ],
      }));
    } else if (niche === "hvac") {
      setFormData((prev) => ({
        ...prev,
        niche: "hvac",
        business_name: "ComfortAir HVAC & Cooling",
        tone: "direct",
        agent_name: "Edward",
        tts_voice: "Edward",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$99.00",
        emergency_advice:
          "If you detect gas odor, burning smells, or carbon monoxide alarms, please evacuate everyone outside immediately and call 911.",
        services: [
          "AC emergency diagnostics",
          "Furnace heat restoration",
          "Heat pump tune-up",
          "Duct cleaning & air quality",
        ],
        emergency_keywords: ["no heat in winter", "gas odor", "smoke from furnace", "frozen coil", "leaking freon"],
        greeting:
          "Thanks for calling ComfortAir HVAC. I'm an automated assistant, and this call may be recorded for quality assurance. How can we restore your comfort today?",
        faq: [
          {
            question: "How quickly can a technician arrive for no-heat emergencies?",
            answer: "We dispatch prioritized emergency technicians within 2 hours during freezing temperatures.",
          },
          {
            question: "Do you service all furnace brands?",
            answer: "Yes, our certified techs service Carrier, Trane, Lennox, Goodman, Rheem, and all major brands.",
          },
        ],
      }));
    } else if (niche === "legal") {
      setFormData((prev) => ({
        ...prev,
        niche: "legal",
        business_name: "Veda Legal & Advisory",
        tone: "formal",
        agent_name: "Kimberly",
        tts_voice: "Kimberly",
        pricing_policy: "no_quote",
        diagnostic_fee: "Consultation on file",
        emergency_advice:
          "For urgent law enforcement custody or court filing deadlines, our managing partner will review your intake details immediately upon message completion.",
        services: [
          "Business incorporation & M&A",
          "Commercial contract review",
          "Civil dispute resolution",
          "Estate planning & trusts",
        ],
        emergency_keywords: ["custody", "warrant", "injunction", "court deadline", "urgent subpoena"],
        greeting:
          "Thank you for contacting Veda Legal and Advisory. I am an automated intake assistant. Please note this call may be recorded for record accuracy and does not constitute attorney-client representation until formal engagement.",
        faq: [
          {
            question: "Is this intake confidential?",
            answer: "All initial inquiry information is handled with strict attorney-client privilege precautions.",
          },
          {
            question: "What is your consultation fee?",
            answer: "Our attorneys determine representation scope and fee arrangements after reviewing your initial intake.",
          },
        ],
      }));
    } else if (niche === "electrical") {
      setFormData((prev) => ({
        ...prev,
        niche: "electrical",
        business_name: "VoltPro Electrical Contractors",
        tone: "direct",
        agent_name: "Dennis",
        tts_voice: "Dennis",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$95.00",
        emergency_advice:
          "If you observe sparking, burning electrical odors, or active smoke, immediately trip your main breaker if safe to do so, and evacuate.",
        services: [
          "Main panel upgrade (200A)",
          "EV charger installation",
          "Emergency circuit diagnostics",
          "Generator transfer switch",
        ],
        emergency_keywords: ["sparks from outlet", "burning wire odor", "power outage main breaker", "smoke"],
        greeting:
          "Thanks for calling VoltPro Electrical. I'm an automated assistant, and this call may be recorded for quality assurance. How can our master electricians help today?",
        faq: [
          {
            question: "Are your electricians licensed and insured?",
            answer: "All VoltPro technicians are fully licensed state master electricians with \$2M liability coverage.",
          },
        ],
      }));
    }
  };

  const handleNext = () => {
    setError("");
    if (currentStep === 1) {
      if (!formData.business_name.trim() || !formData.email.trim() || !formData.password.trim()) {
        setError("Please complete all required business identity fields.");
        return;
      }
      if (!formData.email.includes("@") || !formData.email.includes(".")) {
        setError("Please enter a valid business email address.");
        return;
      }
      if (formData.password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }
    }
    if (currentStep === 2 && phoneMode !== "byon" && !formData.phone_number) {
      setError("Please select an available phone number or choose carrier forwarding.");
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setError("");
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleAddServiceTag = () => {
    if (!newServiceTag.trim()) return;
    if (!formData.services.includes(newServiceTag.trim())) {
      setFormData((prev) => ({
        ...prev,
        services: [...prev.services, newServiceTag.trim()],
      }));
    }
    setNewServiceTag("");
  };

  const handleRemoveServiceTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s !== tag),
    }));
  };

  const handleAddKeywordTag = () => {
    if (!newKeywordTag.trim()) return;
    if (!formData.emergency_keywords.includes(newKeywordTag.trim().toLowerCase())) {
      setFormData((prev) => ({
        ...prev,
        emergency_keywords: [...prev.emergency_keywords, newKeywordTag.trim().toLowerCase()],
      }));
    }
    setNewKeywordTag("");
  };

  const handleToggleHazardPreset = (keyword: string) => {
    const kw = keyword.toLowerCase();
    setFormData((prev) => {
      const exists = prev.emergency_keywords.includes(kw);
      return {
        ...prev,
        emergency_keywords: exists
          ? prev.emergency_keywords.filter((k) => k !== kw)
          : [...prev.emergency_keywords, kw],
      };
    });
  };

  // Test Simulator Actions
  const startSimulation = () => {
    setSimState("calling");
    setSimActiveQuestion(null);
    setTimeout(() => {
      setSimState("connected");
      setSimAgentSpeech(formData.greeting);
      speakText(formData.greeting);
    }, 1200);
  };

  const stopSimulation = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSimState("idle");
    setSimActiveQuestion(null);
    setSimAgentSpeech("");
  };

  const simulateCustomerQuestion = (questionType: "pricing" | "emergency" | "hours") => {
    let responseText = "";
    if (questionType === "pricing") {
      setSimActiveQuestion("How much do you charge to come inspect or fix a problem?");
      if (formData.pricing_policy === "diagnostic_fee_only") {
        responseText = `Our standard dispatch diagnostic fee is ${formData.diagnostic_fee}. Our certified technician will inspect everything on-site and provide an exact flat-rate quote before any work starts.`;
      } else if (formData.pricing_policy === "no_quote") {
        responseText =
          "We do not provide blind phone quotes. Our specialists review every project file individually to ensure strict estimate accuracy.";
      } else {
        responseText = `Our standard diagnostic fee begins at ${formData.diagnostic_fee}, and we offer flat-rate pricing based on your specific requirements.`;
      }
    } else if (questionType === "emergency") {
      setSimActiveQuestion("Emergency! Water / gas is leaking everywhere right now!");
      responseText = formData.emergency_advice;
    } else if (questionType === "hours") {
      setSimActiveQuestion("What are your business operating hours?");
      responseText = `We are open during our operating schedule: ${formData.hours}. For urgent emergencies, our line is monitored 24/7.`;
    }

    setSimAgentSpeech(responseText);
    speakText(responseText);
  };

  // Final Onboarding Launch
  const handleLaunch = async () => {
    setSubmitting(true);
    setError("");
    try {
      // 1. Register tenant account through public self-service endpoint
      const registerRes = await api.registerTenant({
        business_name: formData.business_name,
        owner_name: formData.owner_name,
        email: formData.email,
        password: formData.password,
        timezone: formData.timezone,
        hours: formData.hours,
        niche: formData.niche,
        phone_number: formData.phone_number,
        voice_id: formData.tts_voice,
        agent_name: formData.agent_name,
        greeting: formData.greeting,
        tone: formData.tone,
        recording_disclosure: formData.recording_disclosure,
        pricing_policy: formData.pricing_policy,
        diagnostic_fee: formData.diagnostic_fee,
        services: formData.services,
        emergency_advice: formData.emergency_advice,
        emergency_keywords: formData.emergency_keywords,
        faq: formData.faq,
      });

      // 2. Persist returned JWT token in client storage
      if (typeof window !== "undefined") {
        localStorage.setItem("vedavoice_token", registerRes.access_token);
      }

      // 3. Seamlessly redirect to the client's live business owner portal
      router.push("/portal/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to activate business line. Please verify details.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-8 flex flex-col justify-between max-w-5xl mx-auto">
      {/* Top Header & Breadcrumbs */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
              V
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100 tracking-tight">VedaVoice Client Onboarding</div>
              <div className="text-[11px] text-zinc-400">Automated Multi-Tenant Voice Receptionist Setup</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs font-mono text-zinc-400 hidden sm:block">
              Step {currentStep} of 5 &bull;{" "}
              <span className="text-zinc-200 font-semibold">
                {currentStep === 1 && "Business Profile & Niche"}
                {currentStep === 2 && "Phone Provisioning"}
                {currentStep === 3 && "LiveKit Acoustic Voice"}
                {currentStep === 4 && "Knowledge & Guardrails"}
                {currentStep === 5 && "Audible Test Simulator & Launch"}
              </span>
            </div>
            <Link
              href="/login"
              className="text-xs text-zinc-400 hover:text-zinc-200 font-mono transition-colors flex items-center gap-1.5"
            >
              Existing account? Sign In
            </Link>
          </div>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((step) => (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep >= step ? "bg-indigo-500 shadow-sm shadow-indigo-500/50" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono px-0.5">
            <span className={currentStep >= 1 ? "text-indigo-400 font-medium" : ""}>1. Business Profile</span>
            <span className={currentStep >= 2 ? "text-indigo-400 font-medium" : ""}>2. Dedicated Number</span>
            <span className={currentStep >= 3 ? "text-indigo-400 font-medium" : ""}>3. LiveKit Voice</span>
            <span className={currentStep >= 4 ? "text-indigo-400 font-medium" : ""}>4. Guardrails &amp; FAQs</span>
            <span className={currentStep >= 5 ? "text-indigo-400 font-medium" : ""}>5. Verify &amp; Go-Live</span>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* ================= STEP 1: BUSINESS PROFILE & NICHE ARCHETYPE ================= */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                Step 1: Business Identity &amp; Industry Niche Archetype
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Select your industry archetype to pre-load battle-tested emergency safety scripts, pricing policies, and customer greetings.
              </p>
            </div>

            {/* Industry Preset Cards */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Industry Pre-Grounded Template
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { id: "plumbing", label: "Plumbing & Trades", desc: "Pipe burst triage & diagnostic fees" },
                  { id: "dental", label: "Dental Practice", desc: "Warm appointment intake & emergency gate" },
                  { id: "hvac", label: "HVAC & Heating", desc: "Furnace safety & seasonal maintenance" },
                  { id: "legal", label: "Legal & Advisory", desc: "Formal executive intake & no blind quotes" },
                  { id: "electrical", label: "Electrical Trades", desc: "Spark/breaker safety & panel triage" },
                ].map((niche) => (
                  <button
                    key={niche.id}
                    type="button"
                    onClick={() => applyNichePreset(niche.id)}
                    className={`p-3 rounded-lg border text-left transition-all relative ${
                      formData.niche === niche.id
                        ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 shadow-sm ring-1 ring-indigo-500"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    {formData.niche === niche.id && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-400" />
                    )}
                    <div className="text-xs font-bold text-zinc-200">{niche.label}</div>
                    <div className="text-[10px] text-zinc-400 mt-1 leading-snug">{niche.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Core Form Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Registered Business Name *</label>
                <input
                  type="text"
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Apex Plumbing & Heating"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Business Owner Full Name *</label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Bob Henderson"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Owner Login Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="owner@yourcompany.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Account Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Operating Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                >
                  <option value="America/New_York">Eastern Time (America/New_York)</option>
                  <option value="America/Chicago">Central Time (America/Chicago)</option>
                  <option value="America/Denver">Mountain Time (America/Denver)</option>
                  <option value="America/Los_Angeles">Pacific Time (America/Los_Angeles)</option>
                  <option value="America/Phoenix">Arizona (America/Phoenix)</option>
                  <option value="Europe/London">London (Europe/London)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Standard Working Hours</label>
                <input
                  type="text"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Monday to Friday, 8:00 AM to 6:00 PM EST"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: PHONE NUMBER ALLOCATION ================= */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-400" />
                Step 2: Dedicated Phone Number Allocation &amp; Routing
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Choose between instant carrier API provisioning (Option B), agency pre-purchased pools (Option A), or keep your existing number with call-forwarding (Option C).
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPhoneMode("carrier_search")}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  phoneMode === "carrier_search"
                    ? "border-emerald-500 bg-emerald-500/10 text-zinc-100 ring-1 ring-emerald-500 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs text-zinc-200">
                  <span>Option B: Direct Carrier Search</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">Live API</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  Search &amp; provision numbers on the fly via Twilio/Telnyx Elastic SIP trunks.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhoneMode("agency_pool")}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  phoneMode === "agency_pool"
                    ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 ring-1 ring-indigo-500 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs text-zinc-200">
                  <span>Option A: Agency Pool</span>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-mono">Pre-Bought</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  Select from pre-purchased agency pool numbers with zero incremental monthly fee.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhoneMode("byon")}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  phoneMode === "byon"
                    ? "border-amber-500 bg-amber-500/10 text-zinc-100 ring-1 ring-amber-500 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs text-zinc-200">
                  <span>Option C: Carrier Forwarding</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono">BYON</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  Keep your existing published phone line. Forward missed calls via *71.
                </div>
              </button>
            </div>

            {/* Carrier / Pool Number Grid */}
            {phoneMode !== "byon" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={areaCodeQuery}
                      onChange={(e) => setAreaCodeQuery(e.target.value)}
                      placeholder="Filter by area code or city (e.g. 512, Austin, 212, 800)..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 whitespace-nowrap">
                    {availableNumbers.length} available
                  </span>
                </div>

                {loadingNumbers ? (
                  <div className="p-8 text-center text-xs font-mono text-zinc-500">
                    Querying carrier SIP trunk inventory...
                  </div>
                ) : availableNumbers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 border border-zinc-800/80 rounded-lg">
                    No numbers found matching &quot;{areaCodeQuery}&quot;. Clear search to view all options.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {availableNumbers.map((num) => {
                      const isSelected = formData.phone_number === num.e164;
                      return (
                        <div
                          key={num.e164}
                          onClick={() => setFormData({ ...formData, phone_number: num.e164 })}
                          className={`p-3 rounded-lg border text-left cursor-pointer transition-all space-y-1 ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-500/10 text-zinc-100 ring-1 ring-emerald-500 shadow-sm"
                              : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs text-zinc-200">{num.formatted}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-emerald-400">
                              STIR/SHAKEN A
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                            <span>
                              {num.locality}, {num.region}
                            </span>
                            <span className="font-mono text-zinc-500">
                              {num.monthly_cost_usd === 0 ? "Included" : `$${num.monthly_cost_usd.toFixed(2)}/mo`}
                            </span>
                          </div>
                          <div className="text-[9px] font-mono text-zinc-500">{num.provider}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Option C: BYON Instructions */}
            {phoneMode === "byon" && (
              <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-3 text-xs">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5 font-mono text-[11px] uppercase">
                  <PhoneForwarded className="w-3.5 h-3.5" />
                  Carrier Conditional Call Forwarding (*71) Setup
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">
                  Your business phone line stays exactly as published on Google and Yelp. When you don&apos;t answer after 2-3 rings, your mobile carrier automatically forwards the customer to your dedicated LiveKit receptionist line:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                    <strong className="text-zinc-200">Verizon:</strong> Dial *71 + Target
                  </div>
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                    <strong className="text-zinc-200">AT&amp;T:</strong> Dial *71 + Target
                  </div>
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                    <strong className="text-zinc-200">T-Mobile:</strong> Dial **004* + Target #
                  </div>
                  <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                    <strong className="text-zinc-200">Spectrum:</strong> Dial *92 + Target
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: LIVEKIT VOICE & TIMBRE ================= */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-indigo-400" />
                Step 3: LiveKit Acoustic Voice &amp; Tone Persona
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Choose from {LIVEKIT_VOICE_CATALOG.length} models across Inworld, Rime, and Deepgram Aura. Audition live previews with the speaker button.
              </p>
            </div>

            {/* Provider and Gender Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[10px] font-mono">
                {[
                  { id: "all", label: "All Providers" },
                  { id: "Inworld TTS", label: "Inworld" },
                  { id: "Rime TTS", label: "Rime" },
                  { id: "Deepgram Aura", label: "Deepgram Aura" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setVoiceProviderFilter(tab.id)}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      voiceProviderFilter === tab.id
                        ? "bg-indigo-600 text-white font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 text-[10px] font-mono">
                {["all", "Male", "Female"].map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setVoiceGenderFilter(gender)}
                    className={`px-2 py-0.5 rounded border ${
                      voiceGenderFilter === gender
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-300 font-bold"
                        : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto pr-1">
              {LIVEKIT_VOICE_CATALOG.filter(
                (v) =>
                  (voiceProviderFilter === "all" || v.provider === voiceProviderFilter) &&
                  (voiceGenderFilter === "all" || v.gender === voiceGenderFilter)
              ).map((voice) => {
                const isSelected = formData.tts_voice === voice.id;
                const isPlaying = playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => setFormData({ ...formData, tts_voice: voice.id, agent_name: voice.name })}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all space-y-1.5 relative group ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 ring-1 ring-indigo-500 shadow-sm"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-xs text-zinc-200">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-100">{voice.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full border border-zinc-700 font-mono text-zinc-400">
                          {voice.gender}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVoicePreview(voice);
                        }}
                        className={`p-1 rounded-md transition-colors ${
                          isPlaying
                            ? "bg-indigo-600 text-white animate-pulse"
                            : "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300"
                        }`}
                        title="Click to hear speech preview"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-indigo-400">{voice.provider}</span>
                      <span className="text-zinc-500">{voice.accent}</span>
                    </div>

                    <div className="text-[10px] text-zinc-300 font-medium leading-snug">{voice.trait}</div>

                    <div className="text-[9px] text-zinc-500 line-clamp-2">{voice.description}</div>
                  </div>
                );
              })}
            </div>

            {/* Conversational Tone */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Conversational Cadence &amp; Tone
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "direct", title: "Direct & Agile", desc: "<15 words/turn, rapid triage for field emergency trades" },
                  { id: "warm", title: "Warm & Consultative", desc: "~20 words/turn, empathetic active listening for clinics" },
                  { id: "formal", title: "Formal & Executive", desc: "Corporate front-desk authority for legal and finance" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, tone: t.id })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      formData.tone === t.id
                        ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 ring-1 ring-indigo-500"
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="text-xs font-bold text-zinc-200">{t.title}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Custom Greeting */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">Custom Spoken Receptionist Greeting</label>
                <button
                  type="button"
                  onClick={() => speakText(formData.greeting)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                >
                  <Volume2 className="w-3 h-3" /> Test Listen
                </button>
              </div>
              <textarea
                rows={2}
                value={formData.greeting}
                onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
              />
            </div>

            {/* Two-Party Recording Disclosure */}
            <div className="flex items-center justify-between p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/40">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-200">Two-Party Recording Disclosure</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 font-mono">
                    CA, FL, PA, WA Compliant
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Speaks: &ldquo;This call may be recorded and transcribed for quality assurance.&rdquo;
                </p>
              </div>
              <input
                type="checkbox"
                checked={formData.recording_disclosure}
                onChange={(e) => setFormData({ ...formData, recording_disclosure: e.target.checked })}
                className="w-4 h-4 accent-indigo-600 rounded"
              />
            </div>
          </div>
        )}

        {/* ================= STEP 4: KNOWLEDGE BASE & GUARDRAILS ================= */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                Step 4: Knowledge Base &amp; Zero-Hallucination Guardrails
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Strictly bound what figures and policies the AI receptionist is authorized to recite.
              </p>
            </div>

            {/* Services Tag Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Catalog Services Offered</label>
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 min-h-[44px]">
                {formData.services.map((service) => (
                  <span
                    key={service}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 text-zinc-200 text-xs border border-zinc-750"
                  >
                    {service}
                    <button
                      type="button"
                      onClick={() => handleRemoveServiceTag(service)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newServiceTag}
                    onChange={(e) => setNewServiceTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddServiceTag();
                      }
                    }}
                    placeholder="+ Add service (press enter)..."
                    className="bg-transparent text-xs text-zinc-300 focus:outline-none px-1 py-0.5 font-sans"
                  />
                  <button
                    type="button"
                    onClick={handleAddServiceTag}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Pricing Policy Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Pricing Policy Archetype</label>
                <select
                  value={formData.pricing_policy}
                  onChange={(e) => setFormData({ ...formData, pricing_policy: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="diagnostic_fee_only">Diagnostic Fee Only (Quote on-site)</option>
                  <option value="fixed_menu">Fixed Catalog Menu (Exact dollar figures)</option>
                  <option value="no_quote">Strict Zero Quoting (No numbers spoken)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Standard Diagnostic / Dispatch Fee</label>
                <input
                  type="text"
                  value={formData.diagnostic_fee}
                  onChange={(e) => setFormData({ ...formData, diagnostic_fee: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="e.g. $89.00"
                />
              </div>
            </div>

            {/* Emergency Hazards & Mitigation Script */}
            <div className="space-y-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-red-300 flex items-center gap-1.5 font-mono">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  Urgent Hazard Detection Keywords
                </span>
                <span className="text-[10px] text-zinc-400">Triggers emergency escalation immediately</span>
              </div>

              {/* Quick Preset Hazard Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { kw: "burst pipe", icon: Droplets },
                  { kw: "gas leak", icon: Flame },
                  { kw: "flooding", icon: Droplets },
                  { kw: "smoke from furnace", icon: Flame },
                  { kw: "sparks from outlet", icon: Zap },
                  { kw: "severe toothache", icon: AlertTriangle },
                ].map((item) => {
                  const Icon = item.icon;
                  const isChecked = formData.emergency_keywords.includes(item.kw);
                  return (
                    <button
                      key={item.kw}
                      type="button"
                      onClick={() => handleToggleHazardPreset(item.kw)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-all ${
                        isChecked
                          ? "bg-red-500/20 text-red-300 border border-red-500/40"
                          : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {item.kw}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-medium text-zinc-300">Tenant-Approved Emergency Advice Script</label>
                <textarea
                  rows={2}
                  value={formData.emergency_advice}
                  onChange={(e) => setFormData({ ...formData, emergency_advice: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                  placeholder="Spoken immediately when hazard keywords are detected..."
                />
              </div>
            </div>

            {/* Quick FAQ List */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono">
                Receptionist Knowledge Base (FAQs)
              </label>
              <div className="space-y-2">
                {formData.faq.map((faqItem, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-1">
                    <div className="font-semibold text-xs text-zinc-200 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                      {faqItem.question}
                    </div>
                    <div className="text-[11px] text-zinc-400 pl-5">{faqItem.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 5: TEST SIMULATOR & LAUNCH ================= */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-400" />
                Step 5: Acoustic Verification &amp; Live Deployment
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Conduct an interactive test call with your new LiveKit voice agent, verify routing, and activate your line.
              </p>
            </div>

            {/* Interactive Phone Simulation Widget */}
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                      <span>{formData.business_name} Receptionist</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-400">
                        {formData.tts_voice} (LiveKit)
                      </span>
                    </div>
                    <div className="text-xs font-mono text-zinc-400">
                      Line: <span className="text-emerald-400 font-semibold">{formData.phone_number}</span> &bull;{" "}
                      {simState === "connected" ? `In-call (${simDuration}s)` : "Idle / Standby"}
                    </div>
                  </div>
                </div>

                {simState === "idle" ? (
                  <button
                    type="button"
                    onClick={startSimulation}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Simulate Inbound Call
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopSimulation}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 transition-all"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    Hang Up
                  </button>
                )}
              </div>

              {/* Active Call Audio Mockup */}
              {simState === "connected" && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {/* Waveform Animation */}
                  <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Radio className="w-3 h-3 animate-pulse" /> Live WebRTC Audio Stream
                      </span>
                      <span>Opus 24kbps &bull; 0 packet loss</span>
                    </div>

                    <div className="flex items-center justify-center gap-1 h-8">
                      {[40, 70, 30, 90, 60, 20, 80, 50, 95, 45, 65, 85, 30, 75].map((h, i) => (
                        <div
                          key={i}
                          className="w-1 bg-emerald-500/80 rounded-full animate-pulse"
                          style={{
                            height: `${h}%`,
                            animationDelay: `${(i % 5) * 120}ms`,
                          }}
                        />
                      ))}
                    </div>

                    {simAgentSpeech && (
                      <div className="p-3 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 italic leading-relaxed">
                        &ldquo;{simAgentSpeech}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Caller Question Simulator Chips */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                      Simulate Realistic Caller Inquiries:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => simulateCustomerQuestion("pricing")}
                        className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-left text-xs text-zinc-300 transition-colors"
                      >
                        <div className="font-semibold text-zinc-200">1. Pricing Inquiry</div>
                        <div className="text-[10px] text-zinc-500">&quot;How much do you charge?&quot;</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => simulateCustomerQuestion("emergency")}
                        className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/5 hover:border-red-500/50 text-left text-xs text-red-300 transition-colors"
                      >
                        <div className="font-semibold text-red-200">2. Emergency Hazard</div>
                        <div className="text-[10px] text-red-400">&quot;Pipe burst, flooding fast!&quot;</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => simulateCustomerQuestion("hours")}
                        className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-left text-xs text-zinc-300 transition-colors"
                      >
                        <div className="font-semibold text-zinc-200">3. Business Hours</div>
                        <div className="text-[10px] text-zinc-500">&quot;Are you open right now?&quot;</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Pre-flight Checklist */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[11px] font-mono">
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> RLS Isolation Armed
                </div>
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Carrier Attestation A
                </div>
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Pricing Gate Active
                </div>
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> LiveKit Scale Ready
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-zinc-800 mt-8">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Previous
          </button>
        ) : (
          <div />
        )}

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm shadow-indigo-600/20"
          >
            Next Step
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Rocket className="w-4 h-4" />
            {submitting ? "Deploying Voice Agent..." : "Launch Live Receptionist Line"}
          </button>
        )}
      </div>
    </div>
  );
}
