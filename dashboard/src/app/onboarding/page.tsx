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
  Radio,
  Clock,
  PhoneForwarded,
  ShieldAlert,
  HelpCircle,
  Plus,
  X,
  Phone,
  PhoneOff,
  Flame,
  Droplets,
  Zap,
  CheckCircle2,
  BadgeCheck,
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
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Step 4: Tag & FAQ input state
  const [newServiceTag, setNewServiceTag] = useState("");
  const [newKeywordTag, setNewKeywordTag] = useState("");

  // Step 5: Test simulator interactive state
  const [simState, setSimState] = useState<"idle" | "calling" | "connected" | "ended">("idle");
  const [simDuration, setSimDuration] = useState(0);
  const [simActiveQuestion, setSimActiveQuestion] = useState<string | null>(null);
  const [simAgentSpeech, setSimAgentSpeech] = useState<string>("");

  // Master Onboarding Form State
  const [formData, setFormData] = useState({
    business_name: "Apex Plumbing & Heating",
    owner_name: "Bob Henderson",
    email: "",
    password: "",
    timezone: "America/New_York",
    hours: "Monday to Friday, 8:00 AM to 6:00 PM EST",
    niche: "plumbing",
    niche_pack_slug: "home_services",
    address_line1: "100 Congress Ave",
    city: "Austin",
    state: "TX",
    postal_code: "78701",
    service_territory_zips: "78701, 78702, 78703, 78704",
    phone_number: "+15125550199",
    tts_voice: "Alex",
    agent_name: "Alex",
    tone: "direct",
    recording_disclosure: true,
    pricing_policy: "diagnostic_fee_only",
    diagnostic_fee: "$89.00",
    services: [
      "Emergency pipe bursts & leak isolation",
      "Drain clearing & camera line inspection",
      "Water heater repair & tankless install",
      "Sewer backup & hydro-jetting",
    ],
    emergency_advice:
      "If safe to do so, please locate and shut off your main water shutoff valve immediately to minimize water damage while I note your address.",
    emergency_keywords: [
      "burst pipe",
      "flooding",
      "gas leak",
      "gas smell",
      "sewage backup",
      "water heater leak",
    ],
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
    ] as FAQEntry[],
  });

  // Browser Speech Synthesis voices cache
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const loadVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          setBrowserVoices(v);
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

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
        utterance.rate = chosenVoice.rate;
        utterance.pitch = chosenVoice.pitch;
        if (browserVoices.length > 0) {
          const isFemale = chosenVoice.gender === "Female";
          const match = browserVoices.find((bv) => {
            const n = bv.name.toLowerCase();
            return isFemale
              ? n.includes("female") || n.includes("zira") || n.includes("samantha") || n.includes("karen") || n.includes("victoria")
              : n.includes("male") || n.includes("david") || n.includes("mark") || n.includes("george") || n.includes("guy");
          });
          if (match) utterance.voice = match;
        }
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
      utterance.rate = voice.rate;
      utterance.pitch = voice.pitch;

      if (browserVoices.length > 0) {
        const isFemale = voice.gender === "Female";
        const match = browserVoices.find((bv) => {
          const n = bv.name.toLowerCase();
          return isFemale
            ? n.includes("female") || n.includes("zira") || n.includes("samantha") || n.includes("karen") || n.includes("victoria")
            : n.includes("male") || n.includes("david") || n.includes("mark") || n.includes("george") || n.includes("guy");
        });
        if (match) utterance.voice = match;
      }

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
        business_name: "ComfortZone HVAC & Air",
        tone: "direct",
        agent_name: "Dennis",
        tts_voice: "Dennis",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$99.00",
        emergency_advice:
          "If you smell gas or suspect a carbon monoxide leak, please evacuate your building immediately and call the utility emergency line.",
        services: [
          "No heat / No AC emergency service",
          "Seasonal HVAC tune-ups & filter swaps",
          "Heat pump & compressor replacement",
          "Duct cleaning & air quality testing",
        ],
        emergency_keywords: ["no heat in freezing", "gas smell", "carbon monoxide", "ac leaking water"],
        greeting:
          "Thanks for calling ComfortZone HVAC & Air. I'm an automated assistant on a recorded line. How can we help keep your climate comfortable?",
        faq: [
          {
            question: "How quickly can a technician arrive for no heat?",
            answer: "During extreme weather conditions, we prioritize no-heat calls with dispatch typically within 2 to 4 hours.",
          },
        ],
      }));
    } else if (niche === "legal") {
      setFormData((prev) => ({
        ...prev,
        niche: "legal",
        business_name: "Vanguard Law Partners",
        tone: "formal",
        agent_name: "Kimberly",
        tts_voice: "Kimberly",
        pricing_policy: "no_quote",
        diagnostic_fee: "Consultation Required",
        emergency_advice:
          "If this is an immediate legal emergency regarding an active arrest or court deadline, please contact our emergency hotline immediately.",
        services: [
          "Business entity formation",
          "Contract drafting & review",
          "Commercial litigation consultation",
          "Real estate closing advisory",
        ],
        emergency_keywords: ["active arrest", "served with subpoena", "court hearing tomorrow", "restraining order"],
        greeting:
          "Thank you for contacting Vanguard Law Partners. This line is recorded for intake accuracy. May I ask what legal matter you are inquiring about?",
        faq: [
          {
            question: "Do you offer free phone consultations?",
            answer: "We offer an initial 15-minute phone intake assessment before scheduling a comprehensive attorney consultation.",
          },
        ],
      }));
    } else if (niche === "electrical") {
      setFormData((prev) => ({
        ...prev,
        niche: "electrical",
        business_name: "VoltPro Electric",
        tone: "direct",
        agent_name: "Orion",
        tts_voice: "Orion",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$95.00",
        emergency_advice:
          "If you see active electrical sparks or smoke coming from an outlet, turn off the corresponding breaker or main power immediately and do not touch the area.",
        services: [
          "Emergency breaker panel repair",
          "EV charger home installation",
          "Lighting & outlet rewiring",
          "Generator transfer switches",
        ],
        emergency_keywords: ["sparking breaker", "electrical fire", "power outage whole house", "smoking outlet"],
        greeting:
          "Thanks for calling VoltPro Electric. I am an automated receptionist on a recorded line. What electrical issue can we resolve for you today?",
        faq: [
          {
            question: "Are your electricians licensed and insured?",
            answer: "Yes, 100% of our field electricians carry state master or journeyman licenses and full liability coverage.",
          },
        ],
      }));
    }
  };

  const handleAddService = () => {
    if (newServiceTag.trim() && !formData.services.includes(newServiceTag.trim())) {
      setFormData((prev) => ({
        ...prev,
        services: [...prev.services, newServiceTag.trim()],
      }));
      setNewServiceTag("");
    }
  };

  const handleRemoveService = (service: string) => {
    setFormData((prev) => ({
      ...prev,
      services: prev.services.filter((s) => s !== service),
    }));
  };

  const handleAddKeyword = () => {
    if (newKeywordTag.trim() && !formData.emergency_keywords.includes(newKeywordTag.trim().toLowerCase())) {
      setFormData((prev) => ({
        ...prev,
        emergency_keywords: [...prev.emergency_keywords, newKeywordTag.trim().toLowerCase()],
      }));
      setNewKeywordTag("");
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData((prev) => ({
      ...prev,
      emergency_keywords: prev.emergency_keywords.filter((k) => k !== keyword),
    }));
  };

  const handleAddFaq = () => {
    setFormData((prev) => ({
      ...prev,
      faq: [...prev.faq, { question: "New Question?", answer: "Answer details here..." }],
    }));
  };

  const handleRemoveFaq = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      faq: prev.faq.filter((_, i) => i !== index),
    }));
  };

  const handleFaqChange = (index: number, field: "question" | "answer", val: string) => {
    setFormData((prev) => {
      const copy = [...prev.faq];
      copy[index] = { ...copy[index], [field]: val };
      return { ...prev, faq: copy };
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
        address_line1: formData.address_line1,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        service_territory_zips: formData.service_territory_zips
          .split(",")
          .map((z) => z.trim())
          .filter((z) => z.length > 0),
        niche_pack_slug: formData.niche_pack_slug,
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("vedavoice_token", registerRes.access_token);
      }

      router.push("/portal/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to activate business line. Please verify details.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 p-4 sm:p-8 flex flex-col justify-between max-w-5xl mx-auto">
      {/* Top Header & Breadcrumbs */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center font-bold text-white shadow-sm">
              V
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-900 tracking-tight">VedaVoice Client Onboarding</div>
              <div className="text-[11px] text-zinc-500">Autonomous Multi-Tenant Voice Receptionist Setup</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs font-mono text-zinc-500 hidden sm:block">
              Step {currentStep} of 5 &bull;{" "}
              <span className="text-zinc-900 font-semibold">
                {currentStep === 1 && "Business Profile & Niche"}
                {currentStep === 2 && "Phone Provisioning"}
                {currentStep === 3 && "LiveKit Acoustic Voice"}
                {currentStep === 4 && "Knowledge & Guardrails"}
                {currentStep === 5 && "Audible Test Simulator & Launch"}
              </span>
            </div>
            <Link
              href="/login"
              className="text-xs text-zinc-600 hover:text-zinc-900 font-medium transition-colors flex items-center gap-1.5"
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
                className={`h-2 rounded-full transition-all duration-300 ${
                  currentStep >= step ? "bg-zinc-900" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-zinc-500 font-medium px-0.5">
            <span className={currentStep >= 1 ? "text-zinc-900 font-semibold" : ""}>1. Business Profile</span>
            <span className={currentStep >= 2 ? "text-zinc-900 font-semibold" : ""}>2. Dedicated Number</span>
            <span className={currentStep >= 3 ? "text-zinc-900 font-semibold" : ""}>3. LiveKit Voice</span>
            <span className={currentStep >= 4 ? "text-zinc-900 font-semibold" : ""}>4. Guardrails &amp; FAQs</span>
            <span className={currentStep >= 5 ? "text-zinc-900 font-semibold" : ""}>5. Verify &amp; Go-Live</span>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* ================= STEP 1: BUSINESS PROFILE & NICHE ARCHETYPE ================= */}
        {currentStep === 1 && (
          <div className="space-y-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-zinc-900" />
                Step 1: Business Identity &amp; Industry Niche Archetype
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Select your industry archetype to pre-load battle-tested emergency safety scripts, pricing policies, and customer greetings.
              </p>
            </div>

            {/* Industry Preset Cards */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider font-mono">
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
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      formData.niche === niche.id
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                    }`}
                  >
                    {formData.niche === niche.id && (
                      <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                    <div className="text-xs font-bold">{niche.label}</div>
                    <div className={`text-[10px] mt-1 leading-snug ${formData.niche === niche.id ? "text-zinc-300" : "text-zinc-500"}`}>
                      {niche.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Core Form Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Registered Business Name *</label>
                <input
                  type="text"
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
                  placeholder="e.g. Apex Plumbing & Heating"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Business Owner Full Name *</label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
                  placeholder="e.g. Bob Henderson"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Owner Login Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 font-mono"
                  placeholder="owner@yourcompany.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Account Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 font-mono"
                  placeholder="Min. 8 characters"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Business Timezone</label>
                <input
                  type="text"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                  placeholder="America/New_York"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Standard Operating Schedule</label>
                <input
                  type="text"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                  placeholder="Monday to Friday, 8:00 AM to 6:00 PM EST"
                />
              </div>

              {/* Primary Location Dispatch & Territory */}
              <div className="space-y-1.5 sm:col-span-2 pt-3 border-t border-zinc-100">
                <span className="text-xs font-bold text-zinc-800 block">
                  Primary Headquarters &amp; Service Territory Geofence
                </span>
                <p className="text-[11px] text-zinc-500 mb-2">
                  Used by the AI receptionist to confirm physical branch service availability and dispatch technicians.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={formData.address_line1}
                    onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                    className="sm:col-span-2 px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                    placeholder="Street Address (e.g. 100 Congress Ave)"
                  />
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                    placeholder="City (e.g. Austin)"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-16 px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                      placeholder="State (TX)"
                    />
                    <input
                      type="text"
                      value={formData.postal_code}
                      onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                      placeholder="Zip (78701)"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <input
                    type="text"
                    value={formData.service_territory_zips}
                    onChange={(e) => setFormData({ ...formData, service_territory_zips: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                    placeholder="Service Territory Postal Codes (comma-separated, e.g. 78701, 78702, 78703)"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: PHONE NUMBER ALLOCATION ================= */}
        {currentStep === 2 && (
          <div className="space-y-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-600" />
                Step 2: Dedicated Phone Number Allocation &amp; Routing
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Choose between instant carrier API provisioning (Option B), agency pre-purchased pools (Option A), or keep your existing number with call-forwarding (Option C).
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPhoneMode("carrier_search")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  phoneMode === "carrier_search"
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>Option B: Direct Carrier Search</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${phoneMode === "carrier_search" ? "bg-emerald-500 text-zinc-900" : "bg-emerald-100 text-emerald-800"}`}>
                    Live Carrier
                  </span>
                </div>
                <div className={`text-[10px] mt-1 ${phoneMode === "carrier_search" ? "text-zinc-300" : "text-zinc-500"}`}>
                  Search &amp; provision numbers on the fly via Twilio/Telnyx Elastic SIP trunks.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhoneMode("agency_pool")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  phoneMode === "agency_pool"
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>Option A: Agency Pool</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${phoneMode === "agency_pool" ? "bg-indigo-400 text-zinc-900" : "bg-indigo-100 text-indigo-800"}`}>
                    Pre-Purchased
                  </span>
                </div>
                <div className={`text-[10px] mt-1 ${phoneMode === "agency_pool" ? "text-zinc-300" : "text-zinc-500"}`}>
                  Select from pre-purchased agency pool numbers with zero incremental monthly carrier fee.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhoneMode("byon")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  phoneMode === "byon"
                    ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>Option C: Carrier Forwarding</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${phoneMode === "byon" ? "bg-amber-400 text-zinc-900" : "bg-amber-100 text-amber-800"}`}>
                    BYON
                  </span>
                </div>
                <div className={`text-[10px] mt-1 ${phoneMode === "byon" ? "text-zinc-300" : "text-zinc-500"}`}>
                  Keep your existing published phone line. Forward missed calls via conditional forward (*71).
                </div>
              </button>
            </div>

            {/* Carrier / Pool Number Grid */}
            {phoneMode !== "byon" && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={areaCodeQuery}
                      onChange={(e) => setAreaCodeQuery(e.target.value)}
                      placeholder="Filter by area code, city or state (e.g. 512, Austin, 212, 415)..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                    />
                  </div>
                  <span className="text-xs font-mono text-zinc-500 whitespace-nowrap bg-zinc-100 px-3 py-2 rounded-xl">
                    {availableNumbers.length} available
                  </span>
                </div>

                {loadingNumbers ? (
                  <div className="p-8 text-center text-xs font-mono text-zinc-500 bg-zinc-50 rounded-xl border border-zinc-200">
                    Querying carrier SIP trunk inventory in real-time...
                  </div>
                ) : availableNumbers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 border border-zinc-200 rounded-xl bg-zinc-50">
                    No numbers found matching &quot;{areaCodeQuery}&quot;. Clear search to view all options.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    {availableNumbers.map((num) => {
                      const isSelected = formData.phone_number === num.e164;
                      return (
                        <div
                          key={num.e164}
                          onClick={() => setFormData({ ...formData, phone_number: num.e164 })}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all space-y-1 relative ${
                            isSelected
                              ? "border-zinc-900 bg-zinc-900 text-white shadow-md ring-1 ring-zinc-900"
                              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-xs">{num.formatted}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                              isSelected ? "bg-emerald-400 text-zinc-900" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}>
                              STIR/SHAKEN A
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={isSelected ? "text-zinc-300" : "text-zinc-600"}>
                              {num.locality}, {num.region}
                            </span>
                            <span className={`font-mono font-medium ${isSelected ? "text-zinc-200" : "text-zinc-900"}`}>
                              {num.monthly_cost_usd === 0 ? "Free in Plan" : `$${num.monthly_cost_usd.toFixed(2)}/mo`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className={`text-[10px] font-mono ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
                              Provider: {num.provider}
                            </span>
                            {isSelected && (
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 font-mono">
                                <Check className="w-3 h-3 stroke-[3]" /> Active Selection
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Option C: BYON Instructions */}
            {phoneMode === "byon" && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-3 text-xs text-amber-900">
                <div className="font-semibold text-amber-900 flex items-center gap-1.5 font-mono text-[11px] uppercase">
                  <PhoneForwarded className="w-4 h-4 text-amber-700" />
                  Carrier Conditional Call Forwarding (*71) Setup
                </div>
                <p className="text-amber-800 text-xs leading-relaxed">
                  Your business phone line stays exactly as published on Google and Yelp. When you don&apos;t answer after 2-3 rings, your mobile carrier automatically forwards the customer to your dedicated LiveKit receptionist line:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200">
                    <strong className="text-zinc-900">Verizon:</strong> Dial *71 + Target
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200">
                    <strong className="text-zinc-900">AT&amp;T:</strong> Dial *71 + Target
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200">
                    <strong className="text-zinc-900">T-Mobile:</strong> Dial **004* + Target #
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-amber-200">
                    <strong className="text-zinc-900">Spectrum:</strong> Dial *92 + Target
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: LIVEKIT VOICE & TIMBRE ================= */}
        {currentStep === 3 && (
          <div className="space-y-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-indigo-600" />
                Step 3: LiveKit Acoustic Voice &amp; Tone Persona
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Choose from {LIVEKIT_VOICE_CATALOG.length} models across Inworld, Rime, and Deepgram Aura. Audition distinct live acoustic previews with the speaker button.
              </p>
            </div>

            {/* Provider and Gender Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-[11px] font-medium">
                {[
                  { id: "all", label: "All Models" },
                  { id: "Inworld TTS", label: "Inworld" },
                  { id: "Rime TTS", label: "Rime" },
                  { id: "Deepgram Aura", label: "Deepgram Aura" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setVoiceProviderFilter(tab.id)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      voiceProviderFilter === tab.id
                        ? "bg-zinc-900 text-white font-semibold shadow-sm"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 text-[11px]">
                {["all", "Male", "Female"].map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setVoiceGenderFilter(gender)}
                    className={`px-3 py-1 rounded-lg border font-medium transition-all ${
                      voiceGenderFilter === gender
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-400 bg-white"
                    }`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[340px] overflow-y-auto pr-1">
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
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all space-y-2 relative group ${
                      isSelected
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-md ring-2 ring-zinc-900"
                        : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-sm ${isSelected ? "text-white" : "text-zinc-900"}`}>{voice.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                          isSelected ? "bg-zinc-800 text-zinc-200" : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                        }`}>
                          {voice.gender}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayVoicePreview(voice);
                        }}
                        className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
                          isPlaying
                            ? "bg-emerald-500 text-zinc-950 font-bold"
                            : isSelected
                            ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                            : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                        }`}
                        title="Click to audition live voice"
                      >
                        {isPlaying ? (
                          <div className="flex items-center gap-0.5 h-3 px-1">
                            <span className="w-0.5 h-3 bg-zinc-950 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-0.5 h-2 bg-zinc-950 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-0.5 h-3 bg-zinc-950 rounded-full animate-bounce" />
                          </div>
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className={isSelected ? "text-emerald-400 font-semibold" : "text-indigo-600 font-medium"}>
                        {voice.provider}
                      </span>
                      <span className={isSelected ? "text-zinc-400" : "text-zinc-500"}>{voice.accent}</span>
                    </div>

                    <div className={`text-xs font-medium leading-snug ${isSelected ? "text-zinc-200" : "text-zinc-800"}`}>
                      {voice.trait}
                    </div>

                    <div className={`text-[11px] line-clamp-2 leading-relaxed ${isSelected ? "text-zinc-400" : "text-zinc-500"}`}>
                      {voice.description}
                    </div>

                    {isSelected && (
                      <div className="pt-1 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Selected Voice Model
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Conversational Tone */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider font-mono">
                Conversational Cadence &amp; Tone
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "direct", title: "Direct & Agile", desc: "<15 words/turn, rapid triage for field emergency trades" },
                  { id: "warm", title: "Warm & Consultative", desc: "~20 words/turn, empathetic active listening for clinics" },
                  { id: "formal", title: "Formal & Professional", desc: "Corporate front-desk authority for legal and accounting" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, tone: t.id })}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      formData.tone === t.id
                        ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    <div className="text-xs font-bold">{t.title}</div>
                    <div className={`text-[10px] mt-1 ${formData.tone === t.id ? "text-zinc-300" : "text-zinc-500"}`}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: KNOWLEDGE & GUARDRAILS ================= */}
        {currentStep === 4 && (
          <div className="space-y-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Step 4: Knowledge, Emergency Guardrails &amp; Anti-Hallucination
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Configure approved services, pricing containment gates, and safety advice triggered on emergency hazard keywords.
              </p>
            </div>

            {/* Approved Service Offerings */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700">Approved Service Offerings</label>
              <div className="flex flex-wrap gap-2">
                {formData.services.map((svc) => (
                  <span
                    key={svc}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-medium"
                  >
                    {svc}
                    <button
                      type="button"
                      onClick={() => handleRemoveService(svc)}
                      className="text-zinc-400 hover:text-zinc-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newServiceTag}
                  onChange={(e) => setNewServiceTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddService())}
                  placeholder="Add custom service offering (e.g. Tankless water heaters)..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                />
                <button
                  type="button"
                  onClick={handleAddService}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Pricing Gate Policy */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Phone Pricing Disclosure Gate</label>
                <select
                  value={formData.pricing_policy}
                  onChange={(e) => setFormData({ ...formData, pricing_policy: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
                >
                  <option value="diagnostic_fee_only">Diagnostic Fee Only (Quote on-site)</option>
                  <option value="no_quote">Strict No Blind Quotes (Consultation required)</option>
                  <option value="fixed_menu">Fixed Menu Rates</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">Standard Diagnostic / Intake Fee</label>
                <input
                  type="text"
                  value={formData.diagnostic_fee}
                  onChange={(e) => setFormData({ ...formData, diagnostic_fee: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                  placeholder="$89.00"
                />
              </div>
            </div>

            {/* Emergency Advice */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Emergency Caller Immediate Safety Script</label>
              <textarea
                rows={2}
                value={formData.emergency_advice}
                onChange={(e) => setFormData({ ...formData, emergency_advice: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 leading-relaxed"
              />
            </div>

            {/* Emergency Keyword Triggers */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-700">Hazard Trigger Keywords (Priority Bypass)</label>
              <div className="flex flex-wrap gap-2">
                {formData.emergency_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-mono font-medium"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(kw)}
                      className="text-red-400 hover:text-red-700"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newKeywordTag}
                  onChange={(e) => setNewKeywordTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddKeyword())}
                  placeholder="Add emergency trigger phrase (e.g. electrical smoke)..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddKeyword}
                  className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 5: AUDIBLE SIMULATOR & LAUNCH ================= */}
        {currentStep === 5 && (
          <div className="space-y-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-in fade-in duration-150">
            <div>
              <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-600" />
                Step 5: Audible Test Simulator &amp; Production Activation
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Audition your LiveKit voice agent in a sandbox call simulator. Verify greeting cadence and pricing rules before activating your live line.
              </p>
            </div>

            {/* Virtual Phone Simulator Console */}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${
                    simState === "connected" ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                  }`} />
                  <span className="font-mono text-xs font-bold text-zinc-900">
                    LiveKit Virtual Line: {formData.phone_number}
                  </span>
                </div>
                <div className="font-mono text-xs text-zinc-600">
                  {simState === "connected" ? `${Math.floor(simDuration / 60)}:${(simDuration % 60).toString().padStart(2, "0")}` : "00:00"}
                </div>
              </div>

              {simState === "idle" && (
                <div className="py-8 text-center space-y-3">
                  <div className="text-xs text-zinc-600">
                    Click &quot;Start Test Call&quot; to audition your configured voice model ({formData.tts_voice}) with the business greeting.
                  </div>
                  <button
                    type="button"
                    onClick={startSimulation}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 shadow-sm inline-flex items-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> Start Audible Test Call
                  </button>
                </div>
              )}

              {simState === "calling" && (
                <div className="py-8 text-center space-y-2">
                  <div className="text-xs font-mono text-zinc-600 animate-pulse">
                    Connecting to LiveKit Agent Worker via SIP trunk...
                  </div>
                </div>
              )}

              {simState === "connected" && (
                <div className="space-y-4">
                  {/* Live Speech Bubble */}
                  <div className="p-4 rounded-xl bg-white border border-zinc-200 space-y-1.5 shadow-sm">
                    <div className="text-[10px] font-mono text-indigo-600 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Agent ({formData.agent_name} &bull; {formData.tts_voice})</span>
                      <span className="text-emerald-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        Speaking live
                      </span>
                    </div>
                    <p className="text-xs text-zinc-800 leading-relaxed italic">&quot;{simAgentSpeech}&quot;</p>
                  </div>

                  {/* Caller Question Simulator Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                      Simulate Inbound Caller Inquiries:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => simulateCustomerQuestion("pricing")}
                        className="p-2.5 rounded-xl border border-zinc-300 bg-white hover:border-zinc-900 text-left text-xs text-zinc-800 transition-all font-medium"
                      >
                        Ask Pricing / Rates
                      </button>
                      <button
                        type="button"
                        onClick={() => simulateCustomerQuestion("emergency")}
                        className="p-2.5 rounded-xl border border-red-200 bg-red-50 hover:border-red-400 text-left text-xs text-red-700 transition-all font-medium"
                      >
                        Simulate Flood / Gas Hazard
                      </button>
                      <button
                        type="button"
                        onClick={() => simulateCustomerQuestion("hours")}
                        className="p-2.5 rounded-xl border border-zinc-300 bg-white hover:border-zinc-900 text-left text-xs text-zinc-800 transition-all font-medium"
                      >
                        Ask Operating Schedule
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 text-right">
                    <button
                      type="button"
                      onClick={stopSimulation}
                      className="px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-500 inline-flex items-center gap-1.5"
                    >
                      <PhoneOff className="w-3.5 h-3.5" /> End Test Call
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Launch Summary Card */}
            <div className="p-4 rounded-xl bg-zinc-100 border border-zinc-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-mono">Company</span>
                <span className="font-bold text-zinc-900">{formData.business_name}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-mono">Dedicated Number</span>
                <span className="font-mono font-bold text-zinc-900">{formData.phone_number}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-mono">Voice Model</span>
                <span className="font-bold text-indigo-700">{formData.tts_voice} ({formData.tone})</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase block font-mono">14-Day Trial</span>
                <span className="font-bold text-emerald-700">100 Free Minutes</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Action Buttons Footer */}
      <div className="pt-6 border-t border-zinc-200 flex items-center justify-between mt-6">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s - 1)}
            className="px-4 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        ) : (
          <div />
        )}

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={() => setCurrentStep((s) => s + 1)}
            className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
          >
            Next Step <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleLaunch}
            className="px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
          >
            <Rocket className="w-4 h-4" />
            {submitting ? "Activating Business Line..." : "Activate Business Receptionist"}
          </button>
        )}
      </div>
    </div>
  );
}
