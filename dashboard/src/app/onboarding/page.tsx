"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Building2,
  PhoneCall,
  Mic,
  ShieldCheck,
  Rocket,
  Check,
  ArrowRight,
  ArrowLeft,
  Volume2,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
    phone_number: "+1 (800) 555-0199",
    phone_option: "pool", // pool or byon

    // Step 3: Voice & Persona
    tts_voice: "Alex",
    tone: "direct",
    greeting: "Thanks for calling Apex Plumbing & Heating. I'm an automated assistant, and this call may be recorded and transcribed for quality assurance. How can I help you today?",
    disclose_ai: true,

    // Step 4: Knowledge Base & Pricing
    pricing_policy: "diagnostic_fee_only",
    diagnostic_fee: "$89.00",
    emergency_advice: "If safe to do so, please locate and shut off your main water valve right away to prevent further flooding while I write down your address.",
    services: "Emergency pipe bursts, Drain cleaning, Water heater replacement, Leak detection",

    // Step 5: Test simulator
    tested: false,
    simulatingCall: false,
  });

  const availableNumbers = [
    { number: "+1 (800) 555-0199", area: "Toll-Free Nationwide", provider: "LiveKit SIP" },
    { number: "+1 (415) 320-4491", area: "San Francisco / Bay Area", provider: "LiveKit SIP" },
    { number: "+1 (212) 890-3320", area: "New York City, NY", provider: "LiveKit SIP" },
    { number: "+1 (312) 762-9011", area: "Chicago, IL", provider: "LiveKit SIP" },
  ];

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

  const handleLaunch = async () => {
    setSubmitting(true);
    setError("");
    try {
      // Register tenant with all customized persona & rules
      const servicesArray = formData.services.split(",").map((s) => s.trim()).filter(Boolean);

      await api.createAdminTenant({
        name: formData.business_name,
        owner_name: formData.owner_name,
        owner_email: formData.email,
        owner_password: formData.password,
        timezone: formData.timezone,
        hours: formData.hours,
        phone_number: formData.phone_number,
        greeting: formData.greeting,
        tone: formData.tone,
        pricing_policy: formData.pricing_policy,
        services: servicesArray,
        emergency_advice: formData.emergency_advice,
      });

      // Auto login as tenant owner
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
      {/* Top Breadcrumb */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <Link href="/login" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
          <div className="text-xs font-mono text-zinc-400">
            Step {currentStep} of 5 &bull; <span className="text-zinc-200 font-bold">
              {currentStep === 1 && "Business Identity"}
              {currentStep === 2 && "Phone Number Assignment"}
              {currentStep === 3 && "Voice & Persona"}
              {currentStep === 4 && "Pricing & Knowledge Guardrails"}
              {currentStep === 5 && "Test Call Simulator & Launch"}
            </span>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-5 gap-2">
          {[
            { num: 1, label: "Identity" },
            { num: 2, label: "Number" },
            { num: 3, label: "Voice" },
            { num: 4, label: "Guardrails" },
            { num: 5, label: "Test & Launch" },
          ].map((s) => (
            <div key={s.num} className="space-y-1.5">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  s.num < currentStep
                    ? "bg-emerald-500"
                    : s.num === currentStep
                    ? "bg-zinc-100"
                    : "bg-zinc-800"
                }`}
              />
              <span className={`text-[10px] font-mono block ${s.num === currentStep ? "text-zinc-200 font-bold" : "text-zinc-400"}`}>
                {s.num}. {s.label}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: BUSINESS IDENTITY */}
        {currentStep === 1 && (
          <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                Step 1: Business Identity &amp; Schedule
              </h2>
              <p className="text-xs text-zinc-400">
                Enter your client&apos;s business profile so the receptionist greets callers with accurate local context.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Business Legal / Trading Name</label>
                <input
                  type="text"
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  placeholder="Apex Plumbing & Heating"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Industry / Niche Template</label>
                <select
                  value={formData.niche}
                  onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                >
                  <option value="plumbing">Plumbing, Heating &amp; HVAC</option>
                  <option value="dental">Dental &amp; Medical Clinic</option>
                  <option value="legal">Legal &amp; Law Firm</option>
                  <option value="general">General Commercial Services</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Owner / Manager Name</label>
                <input
                  type="text"
                  value={formData.owner_name}
                  onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                  placeholder="Bob Henderson"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Portal Account Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="owner@business.com"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Temporary Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Business Timezone</label>
                <input
                  type="text"
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-zinc-300">Operating Hours</label>
                <input
                  type="text"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PHONE NUMBER ASSIGNMENT */}
        {currentStep === 2 && (
          <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                Step 2: Inbound Phone Number Assignment
              </h2>
              <p className="text-xs text-zinc-400">
                Choose the direct number callers dial, or use carrier call-forwarding with your existing line.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {availableNumbers.map((num) => (
                <div
                  key={num.number}
                  onClick={() => setFormData({ ...formData, phone_number: num.number })}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-colors space-y-2 ${
                    formData.phone_number === num.number
                      ? "border-emerald-500 bg-emerald-500/10 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-zinc-100">{num.number}</span>
                    {formData.phone_number === num.number && (
                      <span className="h-5 w-5 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 flex items-center justify-between font-mono">
                    <span>{num.area}</span>
                    <span className="text-zinc-400">{num.provider}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 space-y-1">
              <div className="font-semibold text-zinc-300">Carrier Call-Forwarding Note:</div>
              <p>
                If you wish to keep your existing phone number, simply enable immediate call-forwarding (e.g. dial <code className="bg-zinc-900 px-1 py-0.5 rounded text-emerald-400">*72 {formData.phone_number}</code>) from your current telecom carrier line.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: VOICE & PERSONA */}
        {currentStep === 3 && (
          <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Mic className="w-4 h-4 text-emerald-400" />
                Step 3: Voice Model &amp; Tone Customization
              </h2>
              <p className="text-xs text-zinc-400">
                Select your receptionist&apos;s vocal timbre and pacing style.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-zinc-300 block">Vocal Timbre (Inworld Low-Latency TTS)</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "Alex", title: "Alex (Male)", desc: "Conversational, crisp, natural pacing. Ideal for trades and emergency response." },
                  { id: "Sarah", title: "Sarah (Female)", desc: "Warm, gentle, reassuring inflection. Ideal for dental, medical, and wellness." },
                ].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, tts_voice: v.id })}
                    className={`p-3.5 rounded-lg border text-left transition-colors space-y-1.5 ${
                      formData.tts_voice === v.id
                        ? "border-emerald-500 bg-emerald-500/10 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-zinc-200">{v.title}</span>
                      {formData.tts_voice === v.id && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <div className="text-[11px] text-zinc-400 leading-tight">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-medium text-zinc-300 block">Opening Greeting Script</label>
              <textarea
                rows={3}
                value={formData.greeting}
                onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 leading-relaxed"
              />
              <span className="text-[10px] text-zinc-500 font-mono">
                Duration: ~{Math.round(formData.greeting.split(" ").length / 3)} seconds spoken duration
              </span>
            </div>
          </div>
        )}

        {/* STEP 4: PRICING & KNOWLEDGE GUARDRAILS */}
        {currentStep === 4 && (
          <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Step 4: Strict Pricing Guardrails &amp; Emergency Protocols
              </h2>
              <p className="text-xs text-zinc-400">
                Define the guardrail rules that prevent price fabrication and configure immediate utility shut-off advice.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-medium text-zinc-300 block">Pricing Quoting Policy</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: "diagnostic_fee_only", title: "Diagnostic Fee Only", desc: "Quotes $89 trip fee. Strict refusal to estimate repair costs over phone." },
                  { id: "fixed_menu", title: "Fixed Menu", desc: "Quotes exact prices for listed services only. Evaluates unlisted in person." },
                  { id: "no_quote_take_message", title: "No Phone Quoting", desc: "Strictly takes project details; senior estimator calls with quote." },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, pricing_policy: p.id })}
                    className={`p-3 rounded-lg border text-left transition-colors space-y-1 ${
                      formData.pricing_policy === p.id
                        ? "border-emerald-500 bg-emerald-500/10 text-zinc-100"
                        : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-semibold text-xs text-zinc-200">{p.title}</div>
                    <div className="text-[11px] text-zinc-400 leading-tight">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Services Offered (Comma Separated)</label>
              <input
                type="text"
                value={formData.services}
                onChange={(e) => setFormData({ ...formData, services: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-red-400">Emergency Damage Mitigation Advice</label>
              <textarea
                rows={2}
                value={formData.emergency_advice}
                onChange={(e) => setFormData({ ...formData, emergency_advice: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-red-500/50"
              />
            </div>
          </div>
        )}

        {/* STEP 5: TEST SIMULATOR & LAUNCH */}
        {currentStep === 5 && (
          <div className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Rocket className="w-4 h-4 text-emerald-400" />
                Step 5: Test Call Simulator &amp; Production Activation
              </h2>
              <p className="text-xs text-zinc-400">
                Speak directly to your customized receptionist right now using your desktop microphone.
              </p>
            </div>

            {/* Test Simulator Box */}
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-950 text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Simulated Line: {formData.phone_number} &bull; Voice: {formData.tts_voice}
              </div>

              <div className="py-4">
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, simulatingCall: !formData.simulatingCall, tested: true });
                  }}
                  className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 mx-auto transition-colors shadow-lg ${
                    formData.simulatingCall
                      ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  <PhoneCall className="w-4 h-4" />
                  {formData.simulatingCall ? "End In-Browser Test Call" : "Start Live Test Call (Desktop Mic)"}
                </button>
              </div>

              {formData.simulatingCall ? (
                <div className="p-4 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-left font-mono space-y-2">
                  <div className="text-emerald-400 font-bold flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    WebRTC Audio Connected &bull; Latency: 1,140ms
                  </div>
                  <div className="text-zinc-300">
                    🤖 AI: &quot;{formData.greeting}&quot;
                  </div>
                  <div className="text-zinc-400 text-[11px] italic">
                    Say: &quot;How much for water heater repair?&quot; or &quot;Water is pouring through my ceiling!&quot;
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Click the button above to simulate a live call before activating your public phone line.
                </p>
              )}
            </div>

            {/* Activation Summary Checklist */}
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-2">
              <span className="text-[11px] font-mono uppercase text-zinc-400 font-semibold tracking-wider block">
                Pre-Activation Quality Checklist
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 font-sans">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Business: {formData.business_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Assigned: {formData.phone_number}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Policy: {formData.pricing_policy}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Emergency shut-off advice ready</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="pt-6 border-t border-zinc-800 flex items-center justify-between">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Previous Step
          </button>
        ) : (
          <div />
        )}

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            className="px-5 py-2.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            Continue to Step {currentStep + 1}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleLaunch}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-colors shadow-lg disabled:opacity-50"
          >
            <Rocket className="w-4 h-4" />
            {submitting ? "Activating Phone Line..." : "🚀 ACTIVATE BUSINESS LINE & LAUNCH"}
          </button>
        )}
      </div>
    </div>
  );
}
