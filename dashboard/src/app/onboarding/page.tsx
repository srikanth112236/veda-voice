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
} from "lucide-react";

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

  // Step 3: Voice selection & interactive preview state
  const [voiceProviderFilter, setVoiceProviderFilter] = useState<string>("all");
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<string>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  // Form state across all 5 steps
  const [formData, setFormData] = useState({
    // Step 1: Identity
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
    tts_voice: "Alex",
    tone: "direct",
    greeting: "Thanks for calling Apex Plumbing & Heating. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
    recording_disclosure: true,

    // Step 4: Knowledge Base & Pricing
    pricing_policy: "diagnostic_fee_only",
    diagnostic_fee: "$89.00",
    emergency_advice: "If safe to do so, please locate and shut off your main water valve right away to prevent further flooding while I write down your address.",
    services: "Emergency pipe bursts, Drain cleaning, Water heater replacement, Leak detection",

    // Step 5: Test simulator
    tested: false,
    simulatingCall: false,
  });

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

  const handlePlayVoicePreview = (voice: LiveKitVoice) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      if (playingVoiceId === voice.id) {
        setPlayingVoiceId(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(voice.sampleAudioText);
      utterance.rate = voice.provider === "Rime TTS" ? 1.05 : 0.95;
      utterance.pitch = voice.gender === "Female" ? 1.15 : 0.9;
      setPlayingVoiceId(voice.id);
      utterance.onend = () => setPlayingVoiceId(null);
      utterance.onerror = () => setPlayingVoiceId(null);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleNext = () => {
    setError("");
    if (currentStep === 1 && (!formData.business_name || !formData.email || !formData.password)) {
      setError("Please complete all required business identity fields.");
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setError("");
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const applyNichePreset = (niche: string) => {
    if (niche === "plumbing") {
      setFormData((prev) => ({
        ...prev,
        niche: "plumbing",
        business_name: "Apex Plumbing & Heating",
        tone: "direct",
        tts_voice: "Alex",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$89.00",
        emergency_advice: "If safe to do so, please locate and shut off your main water valve right away to prevent further flooding.",
        services: "Emergency pipe bursts, Drain cleaning, Water heater replacement, Leak detection",
      }));
    } else if (niche === "dental") {
      setFormData((prev) => ({
        ...prev,
        niche: "dental",
        business_name: "SmileCare Dental Practice",
        tone: "warm",
        tts_voice: "Ashley",
        pricing_policy: "fixed_menu",
        diagnostic_fee: "$75.00",
        emergency_advice: "If you are experiencing severe bleeding or trauma, please visit an urgent care or emergency room immediately.",
        services: "Teeth cleaning, Emergency toothache, Dental crowns, Whitening",
      }));
    } else if (niche === "hvac") {
      setFormData((prev) => ({
        ...prev,
        niche: "hvac",
        business_name: "ComfortAir HVAC & Cooling",
        tone: "direct",
        tts_voice: "Edward",
        pricing_policy: "diagnostic_fee_only",
        diagnostic_fee: "$99.00",
        emergency_advice: "If you detect gas odor or carbon monoxide, evacuate the building immediately and dial 911 from outside.",
        services: "AC repair, Furnace diagnostics, Heat pump installation, Duct cleaning",
      }));
    } else if (niche === "legal") {
      setFormData((prev) => ({
        ...prev,
        niche: "legal",
        business_name: "Veda Legal & Advisory",
        tone: "formal",
        tts_voice: "Kimberly",
        pricing_policy: "no_quote",
        diagnostic_fee: "Consultation on file",
        emergency_advice: "For urgent detention or legal deadlines, an attorney will review your message immediately.",
        services: "Business incorporation, Contract review, Dispute resolution, Estate planning",
      }));
    }
  };

  const handleLaunch = async () => {
    setSubmitting(true);
    setError("");
    try {
      const servicesArray = formData.services.split(",").map((s) => s.trim()).filter(Boolean);

      // Create tenant organization with LiveKit acoustic voice settings
      await api.createAdminTenant({
        name: formData.business_name,
        owner_name: formData.owner_name,
        owner_email: formData.email,
        owner_password: formData.password,
        timezone: formData.timezone,
        hours: formData.hours,
        phone_number: formData.phone_number,
        voice_id: formData.tts_voice,
        recording_disclosure: formData.recording_disclosure,
        greeting: formData.greeting,
        tone: formData.tone,
        pricing_policy: formData.pricing_policy,
        services: servicesArray,
        emergency_advice: formData.emergency_advice,
      });

      // Auto-authenticate as tenant owner
      const loginRes = await api.login({
        email: formData.email,
        password: formData.password,
      });
      localStorage.setItem("vedavoice_token", loginRes.access_token);
      router.push("/portal/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to activate business line");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col justify-between max-w-4xl mx-auto">
      {/* Top Breadcrumb Header */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <Link href="/login" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
          <div className="text-xs font-mono text-zinc-400">
            Step {currentStep} of 5 &bull;{" "}
            <span className="text-zinc-200 font-bold">
              {currentStep === 1 && "Business Identity & Niche"}
              {currentStep === 2 && "Phone Number Allocation"}
              {currentStep === 3 && "LiveKit Voice & Timbre (14 Options)"}
              {currentStep === 4 && "Guardrails & Grounding"}
              {currentStep === 5 && "Audible Test Simulator & Launch"}
            </span>
          </div>
        </div>

        {/* Step Indicator Progress Bar */}
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((step) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all ${
                currentStep >= step ? "bg-indigo-500" : "bg-zinc-800"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: Business Identity & Niche Selection */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                Step 1: Client Organization &amp; Niche Archetype
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Configure your business credentials, operating timezone, and pre-grounded industry template.
              </p>
            </div>

            {/* Quick Niche Presets */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Quick Industry Preset</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "plumbing", label: "Plumbing & Trades", desc: "Emergency burst triage + diagnostic fee" },
                  { id: "dental", label: "Dental Practice", desc: "Warm appointment intake + clinical gate" },
                  { id: "hvac", label: "HVAC & Cooling", desc: "Gas safety commands + seasonal maintenance" },
                  { id: "legal", label: "Legal & Advisory", desc: "Formal tone + intake without pricing" },
                ].map((niche) => (
                  <button
                    key={niche.id}
                    type="button"
                    onClick={() => applyNichePreset(niche.id)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      formData.niche === niche.id
                        ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 shadow-sm"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="text-xs font-bold text-zinc-200">{niche.label}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{niche.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Business Name</label>
                <input
                  type="text"
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Apex Plumbing & Heating"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Owner Full Name</label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Bob Henderson"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Owner Login Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="owner@business.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Account Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                  placeholder="••••••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Operating Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="America/New_York">Eastern Time (America/New_York)</option>
                  <option value="America/Chicago">Central Time (America/Chicago)</option>
                  <option value="America/Denver">Mountain Time (America/Denver)</option>
                  <option value="America/Los_Angeles">Pacific Time (America/Los_Angeles)</option>
                  <option value="America/Phoenix">Arizona (America/Phoenix)</option>
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

        {/* STEP 2: Phone Number Provisioning (Option B + Option A Toggle) */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-400" />
                Step 2: Dedicated Phone Number Allocation
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Choose between real-time carrier API provisioning, agency managed pools, or existing business call-forwarding.
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPhoneMode("carrier_search")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  phoneMode === "carrier_search"
                    ? "border-emerald-500 bg-emerald-500/10 text-zinc-100 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs text-zinc-200">
                  <span>Option B: Direct Carrier Search</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">Live API</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  Search &amp; provision numbers on the fly via Twilio/Telnyx Elastic SIP.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhoneMode("agency_pool")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  phoneMode === "agency_pool"
                    ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs text-zinc-200">
                  <span>Option A: Agency Pool</span>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-mono">Pre-Bought</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  Select from pre-purchased agency numbers ($0.00 extra cost).
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPhoneMode("byon")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  phoneMode === "byon"
                    ? "border-amber-500 bg-amber-500/10 text-zinc-100 shadow-sm"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs text-zinc-200">
                  <span>Option C: Forwarding</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono">BYON</span>
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  Keep existing phone number with conditional call forwarding (*71).
                </div>
              </button>
            </div>

            {/* Search Input for Carrier Mode */}
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
                              ? "border-emerald-500 bg-emerald-500/10 text-zinc-100 shadow-sm"
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
                            <span>{num.locality}, {num.region}</span>
                            <span className="font-mono text-zinc-500">${num.monthly_cost_usd.toFixed(2)}/mo</span>
                          </div>
                          <div className="text-[9px] font-mono text-zinc-500">{num.provider}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* BYON Carrier Instructions */}
            {phoneMode === "byon" && (
              <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-3 text-xs">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5 font-mono text-[11px] uppercase">
                  <PhoneForwarded className="w-3.5 h-3.5" />
                  Carrier Conditional Call Forwarding (*71)
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed">
                  You can keep your existing business phone number. When unanswered after 2-3 rings, your mobile carrier automatically routes the call to your VedaVoice LiveKit line:
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

        {/* STEP 3: LiveKit Voice & Timbre Selection (14 Verified Voices) */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-indigo-400" />
                Step 3: LiveKit Acoustic Voice &amp; Tone Archetype
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Select from {LIVEKIT_VOICE_CATALOG.length} LiveKit Scale Inference models across Inworld, Rime, and Deepgram Aura. Click speaker to listen.
              </p>
            </div>

            {/* Provider Filter Tabs */}
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

              {/* Gender Filter */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[340px] overflow-y-auto pr-1">
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
                    onClick={() => setFormData({ ...formData, tts_voice: voice.id })}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all space-y-1.5 relative group ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-500/10 text-zinc-100 shadow-sm"
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

                      {/* Interactive Audible Preview Button */}
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

                    <div className="text-[10px] text-zinc-300 font-medium leading-snug">
                      {voice.trait}
                    </div>

                    <div className="text-[9px] text-zinc-500 line-clamp-2">
                      {voice.description}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tone Archetype & Recording Disclosure */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
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
                      ? "border-indigo-500 bg-indigo-500/10 text-zinc-100"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="text-xs font-bold text-zinc-200">{t.title}</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>

            {/* Two-Party Call Recording Disclosure Switch */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-zinc-200">Two-Party Recording Disclosure</span>
                <p className="text-[11px] text-zinc-400">
                  Speaks: &ldquo;This call may be recorded for quality assurance.&rdquo; (Mandatory in CA, FL, PA, WA).
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

        {/* STEP 4: Pricing & Grounding Guardrails */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                Step 4: Knowledge Base &amp; Zero-Hallucination Guardrails
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Strictly bounds what figures the voice model is allowed to recite, protecting your technicians from price disputes.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Catalog Services Offered (Comma-separated)</label>
                <textarea
                  rows={2}
                  value={formData.services}
                  onChange={(e) => setFormData({ ...formData, services: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                  placeholder="e.g. Emergency pipe bursts, Drain cleaning, Water heater repair"
                />
              </div>

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

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Tenant Approved Damage Mitigation Script</label>
                <textarea
                  rows={3}
                  value={formData.emergency_advice}
                  onChange={(e) => setFormData({ ...formData, emergency_advice: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed"
                  placeholder="Spoken to caller during property water/hazard emergencies before dispatching."
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Test Simulator & Launch */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div>
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-indigo-400" />
                Step 5: Acoustic Verification &amp; Live Deployment
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Listen to your agent&apos;s custom opening greeting, verify caller ID routing, and activate your line.
              </p>
            </div>

            {/* Review Summary Card */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 uppercase">Dedicated Number</span>
                  <div className="font-bold text-emerald-400 mt-0.5">{formData.phone_number}</div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 uppercase">Voice Timbre</span>
                  <div className="font-bold text-zinc-200 mt-0.5">{formData.tts_voice} (LiveKit)</div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 uppercase">Archetype Tone</span>
                  <div className="font-bold text-zinc-200 capitalize mt-0.5">{formData.tone}</div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 uppercase">Tenant Isolation</span>
                  <div className="font-bold text-indigo-400 mt-0.5">100% RLS Active</div>
                </div>
              </div>

              {/* Spoken Greeting Preview Soundboard */}
              <div className="p-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5 font-mono">
                    <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    Opening Spoken Receptionist Greeting
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && "speechSynthesis" in window) {
                        window.speechSynthesis.cancel();
                        const utterance = new SpeechSynthesisUtterance(formData.greeting);
                        window.speechSynthesis.speak(utterance);
                      }
                    }}
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Volume2 className="w-3 h-3" />
                    Simulate Audio Playback
                  </button>
                </div>
                <p className="text-xs text-zinc-300 italic leading-relaxed">
                  &ldquo;{formData.greeting}&rdquo;
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
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
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            Next Step
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLaunch}
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/10"
          >
            <Rocket className="w-4 h-4" />
            {submitting ? "Deploying Voice Agent..." : "Launch Live Receptionist Line"}
          </button>
        )}
      </div>
    </div>
  );
}
