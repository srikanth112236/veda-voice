"use client";

import React, { useEffect, useState } from "react";
import { api, AgentProfile, PhoneticEntry, FAQItem, PriceItem } from "@/lib/api";
import { LIVEKIT_VOICE_CATALOG, LiveKitVoice } from "@/lib/voice-catalog";
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
} from "lucide-react";

const FAQ_CATEGORIES = [
  { id: "all", label: "All Topics" },
  { id: "hours_availability", label: "Hours & Availability" },
  { id: "service_scope", label: "Service Scope" },
  { id: "licensing_insurance", label: "Licensing & Credentials" },
  { id: "booking_procedures", label: "Booking & Dispatch" },
  { id: "pricing", label: "Pricing & Estimates" },
  { id: "general", label: "General" },
];

export default function ReceptionistProfilePage() {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Module 2 FAQ Filter & Search state
  const [activeFaqCategory, setActiveFaqCategory] = useState("all");
  const [faqSearchQuery, setFaqSearchQuery] = useState("");
  const [newTriggerInputs, setNewTriggerInputs] = useState<Record<number, string>>({});

  // Module 3 Pricing items state
  const [newPriceItem, setNewPriceItem] = useState<PriceItem>({
    service: "",
    amount: "",
    type: "fixed",
    conditions: "",
  });

  // Module 4 Emergency state
  const [newKeywordInput, setNewKeywordInput] = useState("");

  // Module 5 Geofence state
  const [newCityInput, setNewCityInput] = useState("");

  // Voice Catalog state
  const [voiceProviderFilter, setVoiceProviderFilter] = useState<string>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

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

  useEffect(() => {
    api
      .getPortalProfile()
      .then((res) => {
        setProfile({
          ...res,
          agent_name: res.agent_name || "receptionist",
          voice_id: res.voice_id || "Alex",
          recording_disclosure: res.recording_disclosure !== false,
          phonetic_glossary: res.phonetic_glossary || [
            { term: "HVAC", spoken_as: "H-V-A-C", note: "Acronym" },
            { term: "PEX", spoken_as: "pecks", note: "Plumbing pipe type" },
          ],
          faq: (res.faq || []).map((f) => ({
            ...f,
            category: f.category || "general",
            alternate_phrasings: f.alternate_phrasings || [],
          })),
          pricing_mode:
            res.pricing_mode ||
            (res.pricing_policy === "fixed_menu"
              ? "listed"
              : res.pricing_policy === "range"
              ? "range"
              : "no_quote"),
          price_items:
            res.price_items && res.price_items.length > 0
              ? res.price_items
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
                    conditions: "Single cleanout access point",
                  },
                ],
          emergency_mode: res.emergency_mode || "priority_message",
          emergency_keywords:
            res.emergency_keywords && res.emergency_keywords.length > 0
              ? res.emergency_keywords
              : ["gas leak", "smell gas", "burst pipe", "flooding", "sparking wires", "sewage backup"],
          emergency_advice:
            res.emergency_advice ||
            res.approved_safety_script ||
            "If it is safe to do so, locate and shut off your main water valve right away to prevent further flooding.",
          approved_safety_script:
            res.approved_safety_script ||
            res.emergency_advice ||
            "If it is safe to do so, locate and shut off your main water valve right away to prevent further flooding.",
          service_area:
            res.service_area ||
            "Metropolitan area and surrounding suburbs within a 25-mile radius",
          service_cities:
            res.service_cities && res.service_cities.length > 0
              ? res.service_cities
              : ["Austin", "Round Rock", "Cedar Park", "Georgetown"],
          after_hours_policy: res.after_hours_policy || "take_message_all",
          out_of_area_policy: res.out_of_area_policy || "polite_decline",
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      const updated = await api.updatePortalProfile(profile);
      setProfile({
        ...updated,
        agent_name: updated.agent_name || profile.agent_name,
        voice_id: updated.voice_id || profile.voice_id,
        recording_disclosure: updated.recording_disclosure ?? profile.recording_disclosure,
        phonetic_glossary: updated.phonetic_glossary || profile.phonetic_glossary,
        faq: (updated.faq || []).map((f) => ({
          ...f,
          category: f.category || "general",
          alternate_phrasings: f.alternate_phrasings || [],
        })),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // Module 2 FAQ Handlers
  const handleAddFaq = (category = "general") => {
    if (!profile) return;
    setProfile({
      ...profile,
      faq: [
        ...profile.faq,
        {
          question: "",
          answer: "",
          category: category === "all" ? "general" : category,
          alternate_phrasings: [],
        },
      ],
    });
  };

  const handleRemoveFaq = (idx: number) => {
    if (!profile) return;
    const nextFaq = [...profile.faq];
    nextFaq.splice(idx, 1);
    setProfile({ ...profile, faq: nextFaq });
  };

  const handleUpdateFaq = (
    idx: number,
    field: keyof FAQItem,
    val: string | string[]
  ) => {
    if (!profile) return;
    const nextFaq = [...profile.faq];
    nextFaq[idx] = { ...nextFaq[idx], [field]: val };
    setProfile({ ...profile, faq: nextFaq });
  };

  const handleAddTriggerPhrase = (idx: number) => {
    const text = (newTriggerInputs[idx] || "").trim();
    if (!text || !profile) return;

    const currentTriggers = profile.faq[idx]?.alternate_phrasings || [];
    if (!currentTriggers.includes(text)) {
      handleUpdateFaq(idx, "alternate_phrasings", [...currentTriggers, text]);
    }
    setNewTriggerInputs({ ...newTriggerInputs, [idx]: "" });
  };

  const handleRemoveTriggerPhrase = (faqIdx: number, triggerIdx: number) => {
    if (!profile) return;
    const currentTriggers = [...(profile.faq[faqIdx]?.alternate_phrasings || [])];
    currentTriggers.splice(triggerIdx, 1);
    handleUpdateFaq(faqIdx, "alternate_phrasings", currentTriggers);
  };

  // Quick Template Injector
  const handleInsertFaqTemplate = (type: "emergency" | "radius" | "licensed") => {
    if (!profile) return;
    let template: FAQItem;
    if (type === "emergency") {
      template = {
        question: "Do you offer emergency after-hours service?",
        answer: "Yes, we provide 24/7 emergency dispatch for burst pipes, active flooding, and dangerous hazards.",
        category: "hours_availability",
        alternate_phrasings: ["Can someone come out tonight?", "Do you work weekends?", "Is emergency service available?"],
      };
    } else if (type === "radius") {
      template = {
        question: "What is your service coverage area?",
        answer: "We serve the metropolitan area and surrounding communities within a 25-mile radius.",
        category: "service_scope",
        alternate_phrasings: ["Do you service my area?", "Are you in Dallas?", "How far do you travel?"],
      };
    } else {
      template = {
        question: "Are your technicians licensed, bonded, and insured?",
        answer: "Yes, all of our service technicians and plumbers are fully licensed, bonded, and carry full liability coverage.",
        category: "licensing_insurance",
        alternate_phrasings: ["Are you licensed?", "Do you have insurance?", "Are technicians certified?"],
      };
    }

    setProfile({
      ...profile,
      faq: [...profile.faq, template],
    });
  };

  // Phonetic Glossary Handlers (Module 1)
  const handleAddGlossary = () => {
    if (!profile) return;
    const current = profile.phonetic_glossary || [];
    setProfile({
      ...profile,
      phonetic_glossary: [...current, { term: "", spoken_as: "", note: "" }],
    });
  };

  const handleRemoveGlossary = (idx: number) => {
    if (!profile) return;
    const current = [...(profile.phonetic_glossary || [])];
    current.splice(idx, 1);
    setProfile({ ...profile, phonetic_glossary: current });
  };

  const handleUpdateGlossary = (idx: number, field: keyof PhoneticEntry, val: string) => {
    if (!profile) return;
    const current = [...(profile.phonetic_glossary || [])];
    current[idx] = { ...current[idx], [field]: val };
    setProfile({ ...profile, phonetic_glossary: current });
  };

  // Module 3: Pricing Catalog Handlers
  const handleAddPriceItem = () => {
    if (!profile || !newPriceItem.service.trim() || !newPriceItem.amount.trim()) return;
    const current = (profile.price_items || []) as PriceItem[];
    setProfile({
      ...profile,
      price_items: [...current, { ...newPriceItem }],
    });
    setNewPriceItem({ service: "", amount: "", type: "fixed", conditions: "" });
  };

  const handleRemovePriceItem = (idx: number) => {
    if (!profile) return;
    const current = [...(profile.price_items || [])];
    current.splice(idx, 1);
    setProfile({ ...profile, price_items: current });
  };

  const handlePresetPriceItem = (
    service: string,
    amount: string,
    type: "fixed" | "range",
    conditions: string
  ) => {
    if (!profile) return;
    const current = (profile.price_items || []) as PriceItem[];
    setProfile({
      ...profile,
      price_items: [...current, { service, amount, type, conditions }],
    });
  };

  // Module 4: Emergency Handlers
  const handleAddEmergencyKeyword = () => {
    const kw = newKeywordInput.trim().toLowerCase();
    if (!kw || !profile) return;
    const current = profile.emergency_keywords || [];
    if (!current.includes(kw)) {
      setProfile({
        ...profile,
        emergency_keywords: [...current, kw],
      });
    }
    setNewKeywordInput("");
  };

  const handleRemoveEmergencyKeyword = (idx: number) => {
    if (!profile) return;
    const current = [...(profile.emergency_keywords || [])];
    current.splice(idx, 1);
    setProfile({ ...profile, emergency_keywords: current });
  };

  const handleApplyEmergencyPack = (pack: "plumbing" | "hvac" | "universal") => {
    if (!profile) return;
    const packs: Record<string, string[]> = {
      plumbing: ["burst pipe", "active flooding", "sewage backup", "gushing water", "gas smell"],
      hvac: ["no heat freezing", "carbon monoxide alarm", "furnace smoke", "gas leak"],
      universal: ["gas leak", "smell gas", "sparking wires", "active fire", "flooding"],
    };
    const current = new Set(profile.emergency_keywords || []);
    packs[pack].forEach((k) => current.add(k));
    setProfile({
      ...profile,
      emergency_keywords: Array.from(current),
    });
  };

  // Module 5: Operating Hours & Geofence Handlers
  const handleAddCity = () => {
    const city = newCityInput.trim();
    if (!city || !profile) return;
    const current = profile.service_cities || [];
    if (!current.includes(city)) {
      setProfile({
        ...profile,
        service_cities: [...current, city],
      });
    }
    setNewCityInput("");
  };

  const handleRemoveCity = (idx: number) => {
    if (!profile) return;
    const current = [...(profile.service_cities || [])];
    current.splice(idx, 1);
    setProfile({ ...profile, service_cities: current });
  };

  if (loading) {
    return <div className="p-8 text-xs font-mono text-zinc-500">Loading receptionist rules...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-xs text-red-400">Failed to load profile.</div>;
  }

  const glossaryList = profile.phonetic_glossary || [];

  // Filtered FAQs for Module 2
  const filteredFaqs = (profile.faq || []).map((f, originalIndex) => ({ ...f, originalIndex })).filter((f) => {
    const matchesCategory =
      activeFaqCategory === "all" || (f.category || "general") === activeFaqCategory;
    const matchesSearch =
      !faqSearchQuery.trim() ||
      f.question.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
      (f.alternate_phrasings || []).some((t) => t.toLowerCase().includes(faqSearchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-400" />
            Receptionist Persona &amp; Knowledge Base
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure brand persona, verified knowledge base, caller phrasing triggers, and strict safety guardrails.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {saving ? (
            "Saving..."
          ) : success ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              Saved Successfully
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* MODULE 1: BRAND PERSONA & ACOUSTIC TUNING */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-indigo-400" />
              <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
                Module 1: Brand Persona &amp; Acoustic Tuning
              </h2>
            </div>
            <span className="text-[10px] text-indigo-400/90 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              LiveKit Voice Agent Pipeline
            </span>
          </div>

          {/* Persona Identity & Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Business Display Name</label>
              <input
                type="text"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Receptionist Agent Name</label>
              <input
                type="text"
                placeholder="receptionist (e.g. Sarah, Alex)"
                value={profile.agent_name || ""}
                onChange={(e) => setProfile({ ...profile, agent_name: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Tone Archetype Selection */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-medium text-zinc-300 block">Conversational Tone Archetype</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "direct",
                  title: "Direct & Agile",
                  pace: "<15 words/turn",
                  desc: "Short, crisp turns. Triage-first response. Ideal for emergency trades, plumbing, and towing.",
                },
                {
                  id: "warm",
                  title: "Warm & Consultative",
                  pace: "~20 words/turn",
                  desc: "Patient, empathetic listening and reassurance. Ideal for clinics, residential services, and care.",
                },
                {
                  id: "formal",
                  title: "Formal & Executive",
                  pace: "Precise articulation",
                  desc: "Objective, polished, legally cautious language. Ideal for corporate, legal, and premium consulting.",
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setProfile({ ...profile, tone: t.id })}
                  className={`p-3.5 rounded-lg border text-left transition-all space-y-1.5 ${
                    profile.tone === t.id
                      ? "border-indigo-500/60 bg-indigo-500/10 text-zinc-100 shadow-sm shadow-indigo-500/5"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-200">{t.title}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{t.pace}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Acoustic Voice Model Selection - Full 14-Voice LiveKit Catalog */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                  Acoustic Voice Model &amp; Timbre ({LIVEKIT_VOICE_CATALOG.length} Options)
                </label>
                <p className="text-[11px] text-zinc-400">
                  Powered directly by LiveKit Scale Inference (Inworld, Rime, Deepgram Aura). Click speaker to preview.
                </p>
              </div>

              {/* Provider Filter Tabs */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[10px] font-mono">
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
                    className={`px-2 py-0.5 rounded transition-colors ${
                      voiceProviderFilter === tab.id
                        ? "bg-indigo-600 text-white font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
              {LIVEKIT_VOICE_CATALOG.filter(
                (v) => voiceProviderFilter === "all" || v.provider === voiceProviderFilter
              ).map((voice) => {
                const isSelected = (profile.voice_id || "Alex") === voice.id;
                const isPlaying = playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => setProfile({ ...profile, voice_id: voice.id })}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer space-y-1.5 relative group ${
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
                        <Volume2 className="w-3 h-3" />
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
          </div>

          {/* Opening Greeting Script */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Brand Opening Greeting</label>
              <span className="text-[10px] text-zinc-500 font-mono">
                ~{Math.round(profile.greeting.split(" ").length / 3)}s spoken latency
              </span>
            </div>
            <textarea
              rows={3}
              value={profile.greeting}
              onChange={(e) => setProfile({ ...profile, greeting: e.target.value })}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 leading-relaxed font-sans"
            />
          </div>

          {/* Legal Compliance Switch */}
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Two-Party Recording &amp; AI Disclosure Notice
              </div>
              <div className="text-[11px] text-zinc-400">
                Automatically announces recording and AI assistant disclosure at call start (Mandatory for compliance in CA, FL, PA, MA, WA).
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={profile.recording_disclosure !== false}
                onChange={(e) => setProfile({ ...profile, recording_disclosure: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Phonetic Pronunciation Glossary */}
          <div className="space-y-3 pt-3 border-t border-zinc-800/80">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  Phonetic Pronunciation Glossary
                </label>
                <p className="text-[11px] text-zinc-400">
                  Teach the voice model how to speak trade acronyms, uncommon street names, and brand terms accurately.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddGlossary}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Term
              </button>
            </div>

            {glossaryList.length === 0 ? (
              <div className="p-3 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
                No phonetic terms configured. Click &quot;Add Term&quot; to guide technical pronunciation.
              </div>
            ) : (
              <div className="space-y-2">
                {glossaryList.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                  >
                    <div className="sm:col-span-4 space-y-1">
                      <span className="text-[10px] text-zinc-500 font-mono block">Text / Term</span>
                      <input
                        type="text"
                        placeholder="e.g. HVAC, PEX, VedaVoice"
                        value={item.term}
                        onChange={(e) => handleUpdateGlossary(idx, "term", e.target.value)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-600"
                      />
                    </div>

                    <div className="sm:col-span-4 space-y-1">
                      <span className="text-[10px] text-zinc-500 font-mono block">Phonetic Spoken As</span>
                      <input
                        type="text"
                        placeholder='e.g. "H-V-A-C", "pecks"'
                        value={item.spoken_as}
                        onChange={(e) => handleUpdateGlossary(idx, "spoken_as", e.target.value)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-zinc-600"
                      />
                    </div>

                    <div className="sm:col-span-3 space-y-1">
                      <span className="text-[10px] text-zinc-500 font-mono block">Context / Note</span>
                      <input
                        type="text"
                        placeholder="e.g. Acronym"
                        value={item.note || ""}
                        onChange={(e) => handleUpdateGlossary(idx, "note", e.target.value)}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-zinc-600"
                      />
                    </div>

                    <div className="sm:col-span-1 flex justify-end pt-4 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => handleRemoveGlossary(idx)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Remove phonetic rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MODULE 2: KNOWLEDGE BASE & FAQ ENGINE (THE CORE UPGRADE) */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800/80 pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
                  Module 2: Knowledge Base &amp; FAQ Grounding Engine
                </h2>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Categorized canonical facts and caller phrasing triggers to eliminate AI hallucinations.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddFaq(activeFaqCategory)}
                className="px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30 flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New Question
              </button>
            </div>
          </div>

          {/* Zero Hallucination Grounding Status Badge */}
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-xs text-zinc-300 leading-tight">
                <span className="font-semibold text-emerald-300">Strict Knowledge Grounding Active:</span>{" "}
                The voice model answers caller questions strictly from these verified canonical answers. Unlisted questions are gracefully deflected to a message intake without guessing.
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              {profile.faq?.length || 0} Grounded Facts
            </span>
          </div>

          {/* Quick Template Inserters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-[11px] text-zinc-500 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Quick Add Template:
            </span>
            <button
              type="button"
              onClick={() => handleInsertFaqTemplate("emergency")}
              className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 shrink-0 text-[11px]"
            >
              + 24/7 Emergency Service
            </button>
            <button
              type="button"
              onClick={() => handleInsertFaqTemplate("radius")}
              className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 shrink-0 text-[11px]"
            >
              + 25-Mile Service Radius
            </button>
            <button
              type="button"
              onClick={() => handleInsertFaqTemplate("licensed")}
              className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 shrink-0 text-[11px]"
            >
              + Licensed &amp; Insured
            </button>
          </div>

          {/* Category Filter Tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
              {FAQ_CATEGORIES.map((cat) => {
                const count =
                  cat.id === "all"
                    ? profile.faq?.length || 0
                    : (profile.faq || []).filter((f) => (f.category || "general") === cat.id).length;
                const isActive = activeFaqCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveFaqCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? "bg-zinc-100 text-zinc-900"
                        : "bg-zinc-950 text-zinc-400 border border-zinc-800/80 hover:text-zinc-200 hover:border-zinc-700"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                        isActive ? "bg-zinc-200 text-zinc-900" : "bg-zinc-900 text-zinc-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-[180px] shrink-0">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search FAQs..."
                value={faqSearchQuery}
                onChange={(e) => setFaqSearchQuery(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          {/* FAQ Accordion / Cards List */}
          {filteredFaqs.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500 space-y-2">
              <p>No questions found in this category.</p>
              <button
                type="button"
                onClick={() => handleAddFaq(activeFaqCategory)}
                className="text-emerald-400 hover:underline font-medium"
              >
                + Add question to {activeFaqCategory === "all" ? "Knowledge Base" : activeFaqCategory}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFaqs.map((item) => {
                const idx = item.originalIndex;
                const triggers = item.alternate_phrasings || [];
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/70 space-y-3 transition-colors hover:border-zinc-700/80"
                  >
                    {/* Top Row: Category Pill & Actions */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-zinc-500" />
                        <select
                          value={item.category || "general"}
                          onChange={(e) => handleUpdateFaq(idx, "category", e.target.value)}
                          className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-zinc-600"
                        >
                          <option value="hours_availability">Hours &amp; Availability</option>
                          <option value="service_scope">Service Scope</option>
                          <option value="licensing_insurance">Licensing &amp; Credentials</option>
                          <option value="booking_procedures">Booking &amp; Dispatch</option>
                          <option value="pricing">Pricing &amp; Estimates</option>
                          <option value="general">General Topic</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFaq(idx)}
                        className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                        title="Delete FAQ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Question Input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase text-zinc-500 block">
                        Canonical Question
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Do you offer 24/7 emergency service?"
                        value={item.question}
                        onChange={(e) => handleUpdateFaq(idx, "question", e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-medium focus:outline-none focus:border-zinc-600"
                      />
                    </div>

                    {/* Approved Factual Answer */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono uppercase text-zinc-500">
                          Approved Factual Answer (Spoken Verbatim by Agent)
                        </label>
                        <span className="text-[10px] text-zinc-600 font-mono">
                          ~{Math.round((item.answer || "").split(" ").length / 3)}s spoken
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        placeholder="e.g. Yes, we operate 24/7 emergency dispatch for burst pipes, active flooding, and gas leaks."
                        value={item.answer}
                        onChange={(e) => handleUpdateFaq(idx, "answer", e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 leading-relaxed font-sans"
                      />
                    </div>

                    {/* Caller Phrasing Variations / Trigger Hints Manager */}
                    <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                          <Layers className="w-3 h-3 text-zinc-500" />
                          Caller Phrasing Variations ({triggers.length})
                        </span>
                        <span className="text-[10px] text-zinc-600">
                          Maps caller variations to this approved answer
                        </span>
                      </div>

                      {triggers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 py-1">
                          {triggers.map((trigger, tIdx) => (
                            <span
                              key={tIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/90 text-[11px] text-zinc-300 font-mono"
                            >
                              <span>&quot;{trigger}&quot;</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTriggerPhrase(idx, tIdx)}
                                className="text-zinc-500 hover:text-red-400 transition-colors ml-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Add Trigger Input */}
                      <div className="flex items-center gap-2 pt-0.5">
                        <input
                          type="text"
                          placeholder='e.g. "Can someone come out tonight?" (Press Enter or Add)'
                          value={newTriggerInputs[idx] || ""}
                          onChange={(e) =>
                            setNewTriggerInputs({ ...newTriggerInputs, [idx]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddTriggerPhrase(idx);
                            }
                          }}
                          className="flex-1 rounded border border-zinc-800/80 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddTriggerPhrase(idx)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium shrink-0 transition-colors"
                        >
                          + Add Trigger
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MODULE 3: 3-TIER PRICING GUARDRAIL ENGINE */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800/80 pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
                  Module 3: 3-Tier Pricing Guardrail Engine
                </h2>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Anti-hallucination pricing boundaries, catalog items, and mandatory verbal disclaimers.
              </p>
            </div>

            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 self-start sm:self-auto">
              <ShieldCheck className="w-3 h-3" /> Hard Pricing Wall Active
            </span>
          </div>

          {/* 3 Tier Mode Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300 block">Pricing Quoting Tier</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "no_quote",
                  title: "Tier 1: Zero Phone Quoting",
                  badge: "Zero-Quote Wall",
                  badgeColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
                  desc: "Strictly disclaims dollar amounts. Explains that accurate quotes require on-site diagnostic inspection. Offers callback or appointment.",
                },
                {
                  id: "listed",
                  title: "Tier 2: Fixed-Price Menu",
                  badge: "Menu Bound",
                  badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
                  desc: "Quotes exact prices strictly for catalog items listed below. Unlisted repairs are explicitly disclaimed as requiring on-site assessment.",
                },
                {
                  id: "range",
                  title: "Tier 3: Estimated Price Brackets",
                  badge: "Bracket + Disclaimer",
                  badgeColor: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
                  desc: "Provides estimated price ranges. Spoken instructions mandate disclosing that final pricing is confirmed on-site before work begins.",
                },
              ].map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      pricing_mode: tier.id as "no_quote" | "listed" | "range",
                      pricing_policy: tier.id,
                    })
                  }
                  className={`p-3.5 rounded-lg border text-left transition-all space-y-2 ${
                    profile.pricing_mode === tier.id
                      ? "border-emerald-500/60 bg-emerald-500/10 text-zinc-100 shadow-sm shadow-emerald-500/5"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-200">{tier.title}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tier.badgeColor}`}>
                      {tier.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">{tier.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Price Items Catalog (active for listed and range modes) */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  Service Price Catalog ({profile.price_items?.length || 0} Items)
                </label>
                <p className="text-[11px] text-zinc-400">
                  {profile.pricing_mode === "no_quote"
                    ? "Catalog is stored for technician reference, but AI is barred from speaking quotes over the phone."
                    : "The voice model will draw authorized figures exclusively from these items."}
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] text-zinc-500 shrink-0">Presets:</span>
                <button
                  type="button"
                  onClick={() =>
                    handlePresetPriceItem(
                      "Diagnostic Inspection Trip Fee",
                      "$89",
                      "fixed",
                      "Credited toward completed repair"
                    )
                  }
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-[11px] text-zinc-300 shrink-0 font-mono"
                >
                  + $89 Trip Fee
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handlePresetPriceItem(
                      "Standard Drain Snaking",
                      "$150 - $250",
                      "range",
                      "Up to 50ft line access"
                    )
                  }
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-[11px] text-zinc-300 shrink-0 font-mono"
                >
                  + Drain Snaking ($150-$250)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handlePresetPriceItem(
                      "Water Heater Flush & Inspection",
                      "$220",
                      "fixed",
                      "Standard tank up to 50 gallons"
                    )
                  }
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-[11px] text-zinc-300 shrink-0 font-mono"
                >
                  + Water Heater ($220)
                </button>
              </div>
            </div>

            {/* Catalog Items List */}
            {(!profile.price_items || profile.price_items.length === 0) ? (
              <div className="p-3 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
                No catalog items configured. Use the presets above or add custom pricing below.
              </div>
            ) : (
              <div className="space-y-2">
                {profile.price_items.map((item, idx) => {
                  const isObj = typeof item === "object" && item !== null;
                  const service = isObj ? item.service : String(item);
                  const amount = isObj ? item.amount : "";
                  const type = isObj ? item.type || "fixed" : "fixed";
                  const conditions = isObj ? item.conditions || "" : "";

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-zinc-200">{service}</span>
                          <span className="font-mono font-bold text-emerald-400">{amount}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              type === "range"
                                ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
                                : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                            }`}
                          >
                            {type}
                          </span>
                        </div>
                        {conditions && (
                          <div className="text-[11px] text-zinc-500">Scope: {conditions}</div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePriceItem(idx)}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors self-end sm:self-auto"
                        title="Remove price item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Price Item Form */}
            <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/90 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <input
                type="text"
                placeholder="Service Name (e.g. Toilet Rebuild)"
                value={newPriceItem.service}
                onChange={(e) => setNewPriceItem({ ...newPriceItem, service: e.target.value })}
                className="sm:col-span-4 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
              />
              <input
                type="text"
                placeholder="Amount (e.g. $180 or $150 - $220)"
                value={newPriceItem.amount}
                onChange={(e) => setNewPriceItem({ ...newPriceItem, amount: e.target.value })}
                className="sm:col-span-3 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-zinc-600"
              />
              <select
                value={newPriceItem.type || "fixed"}
                onChange={(e) =>
                  setNewPriceItem({ ...newPriceItem, type: e.target.value as "fixed" | "range" })
                }
                className="sm:col-span-2 rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 font-mono focus:outline-none focus:border-zinc-600"
              >
                <option value="fixed">Fixed</option>
                <option value="range">Range</option>
              </select>
              <input
                type="text"
                placeholder="Notes / Conditions"
                value={newPriceItem.conditions || ""}
                onChange={(e) => setNewPriceItem({ ...newPriceItem, conditions: e.target.value })}
                className="sm:col-span-2 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-400 focus:outline-none focus:border-zinc-600"
              />
              <button
                type="button"
                onClick={handleAddPriceItem}
                className="sm:col-span-1 p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold flex items-center justify-center transition-colors"
                title="Add price item"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Live Verbal Pricing Simulation */}
          <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-zinc-400 uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Live Verbal Soundboard Simulator
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Caller: &quot;How much for a service call?&quot;
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed font-sans">
              {profile.pricing_mode === "no_quote" && (
                <>
                  <span className="text-emerald-400 font-semibold">{profile.agent_name || "Receptionist"}:</span> &quot;We don&apos;t provide exact price estimates over the phone because every situation requires an in-person assessment. Our technician will diagnose the issue on-site and give you an upfront price before starting any work. Would you like me to write down your details to schedule a visit?&quot;
                </>
              )}
              {profile.pricing_mode === "listed" && (
                <>
                  <span className="text-emerald-400 font-semibold">{profile.agent_name || "Receptionist"}:</span> &quot;We charge a standard $89 diagnostic trip fee to inspect your system, which is credited toward any completed repair. For specialized repairs, our technician provides an exact upfront quote on-site. Can I get your address to schedule?&quot;
                </>
              )}
              {profile.pricing_mode === "range" && (
                <>
                  <span className="text-emerald-400 font-semibold">{profile.agent_name || "Receptionist"}:</span> &quot;Routine service calls typically range from $150 to $250 depending on the scope of the job. Please note that final pricing always depends on an on-site assessment by our technician. Shall I write down your details?&quot;
                </>
              )}
            </div>
          </div>
        </div>

        {/* MODULE 4: EMERGENCY PROTOCOLS & SAFETY SCRIPTS */}
        <div className="p-5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-red-500/20 pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-400" />
                <h2 className="text-xs font-bold text-red-400 uppercase font-mono tracking-wider">
                  Module 4: Emergency Protocols &amp; Safety Scripts
                </h2>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Life-safety gates, hazard detection keywords, business safety instructions, and live transfer routing.
              </p>
            </div>

            <span className="text-[10px] text-red-400 font-mono bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30 flex items-center gap-1 self-start sm:self-auto">
              <ShieldAlert className="w-3 h-3" /> Platform Level-1 Gate Active
            </span>
          </div>

          {/* Platform Safety Gate Status Banner */}
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/30 text-xs text-zinc-300 space-y-1">
            <div className="font-semibold text-red-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              Non-Negotiable Platform Safety Rules:
            </div>
            <div className="text-[11px] text-zinc-400 leading-relaxed">
              If gas odors or leaks are detected, the AI is programmatically locked to command the caller to evacuate immediately and dial 911 or the utility company. The AI is strictly barred from promising immediate technician arrival times or claiming personnel will be dispatched immediately. The compliance phrase is strictly: &quot;I&apos;ve written down your details.&quot;
            </div>
          </div>

          {/* Emergency Keyword Matrix */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-medium text-zinc-200 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-red-400" />
                  Emergency Trigger Keywords ({profile.emergency_keywords?.length || 0})
                </label>
                <p className="text-[11px] text-zinc-400">
                  When any of these terms are spoken, the call immediately escalates to emergency mitigation protocol.
                </p>
              </div>

              {/* Keyword Pack Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] text-zinc-500 shrink-0">Packs:</span>
                <button
                  type="button"
                  onClick={() => handleApplyEmergencyPack("plumbing")}
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:border-red-500/40 text-[11px] text-zinc-300 shrink-0 font-mono"
                >
                  + Plumbing Pack
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyEmergencyPack("hvac")}
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:border-red-500/40 text-[11px] text-zinc-300 shrink-0 font-mono"
                >
                  + HVAC Pack
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyEmergencyPack("universal")}
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:border-red-500/40 text-[11px] text-zinc-300 shrink-0 font-mono"
                >
                  + Life-Safety
                </button>
              </div>
            </div>

            {/* Keyword Chips */}
            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-zinc-800 bg-zinc-950/80 min-h-[44px]">
              {(profile.emergency_keywords || []).map((kw, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-[11px] text-red-300 font-mono"
                >
                  <span>{kw}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmergencyKeyword(idx)}
                    className="text-red-400 hover:text-red-200 transition-colors ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  placeholder="Add hazard keyword..."
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddEmergencyKeyword();
                    }
                  }}
                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40 font-mono w-44"
                />
                <button
                  type="button"
                  onClick={handleAddEmergencyKeyword}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          {/* Approved Safety Script Authoring */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-200">
                Tenant Approved Safety Script (Spoken Immediately)
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">
                ~{Math.round(((profile.approved_safety_script || profile.emergency_advice) || "").split(" ").length / 3)}s spoken
              </span>
            </div>
            <textarea
              rows={2}
              value={profile.approved_safety_script || profile.emergency_advice || ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  approved_safety_script: e.target.value,
                  emergency_advice: e.target.value,
                })
              }
              className="w-full rounded-lg border border-red-500/20 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-red-500/40 leading-relaxed font-sans"
              placeholder="e.g. If it is safe to do so, locate and shut off your main water valve right away to prevent further flooding. Do not touch any electrical fixtures near standing water."
            />
            <p className="text-[11px] text-zinc-500">
              Note: If empty, the platform defaults to strict safety advice: no valve or repair operations authorized, 911 only.
            </p>
          </div>

          {/* Escalation Mode & Transfer Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Emergency Escalation Action</label>
              <select
                value={profile.emergency_mode || "priority_message"}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    emergency_mode: e.target.value as "priority_message" | "live_transfer" | "hybrid",
                  })
                }
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-red-500/40"
              >
                <option value="priority_message">Priority Intake (High-Urgency Alert Notification)</option>
                <option value="live_transfer">Live Telephony Transfer to Human On-Call</option>
                <option value="hybrid">Hybrid (Attempt Live Transfer, Fallback to Urgent Intake)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Emergency Transfer Phone Number (E.164)</label>
              <input
                type="text"
                value={profile.transfer_number}
                onChange={(e) => setProfile({ ...profile, transfer_number: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
                placeholder="+18005550199"
              />
            </div>
          </div>

          {/* Emergency Voice Soundboard Simulator */}
          <div className="p-3.5 rounded-lg border border-red-500/20 bg-zinc-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-red-400 uppercase flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                Live Emergency Vocalization Readout
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Caller: &quot;Help! A pipe burst and my basement is flooding!&quot;
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed font-sans">
              <span className="text-red-400 font-semibold">{profile.agent_name || "Receptionist"}:</span> &quot;{profile.approved_safety_script || profile.emergency_advice || "If it is safe to do so, locate and shut off your main water valve right away to prevent further flooding."} I&apos;ve written down your details. {profile.emergency_mode === "live_transfer" ? "Please hold while I transfer you immediately to our emergency on-call team." : "Our emergency dispatcher has been notified immediately."}&quot;
            </div>
          </div>
        </div>

        {/* MODULE 5: OPERATING HOURS & GEOFENCE BOUNDARIES */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-800/80 pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
                  Module 5: Operating Hours &amp; Geofence Boundaries
                </h2>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Weekly working schedule, after-hours intake policy, territory boundary, and out-of-area guardrails.
              </p>
            </div>

            <span className="text-[10px] text-sky-400 font-mono bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30 flex items-center gap-1 self-start sm:self-auto">
              <Globe className="w-3 h-3" /> Temporal &amp; Geo Guard Active
            </span>
          </div>

          {/* Timezone & Operating Hours */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                <Globe className="w-3 h-3 text-zinc-500" />
                Business Timezone
              </label>
              <select
                value={profile.timezone}
                onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
              >
                <option value="America/New_York">America/New_York (Eastern)</option>
                <option value="America/Chicago">America/Chicago (Central)</option>
                <option value="America/Denver">America/Denver (Mountain)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (Pacific)</option>
                <option value="America/Phoenix">America/Phoenix (Arizona)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  Weekly Operating Schedule Description
                </label>
                {/* Schedule Presets */}
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        hours: "Monday through Friday 8:00 AM to 5:00 PM Eastern, Saturday 9:00 AM to 1:00 PM Eastern, closed Sunday.",
                      })
                    }
                    className="text-zinc-500 hover:text-zinc-300 underline"
                  >
                    Trade Std
                  </button>
                  <span className="text-zinc-700">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        hours: "24 hours a day, 7 days a week, 365 days a year.",
                      })
                    }
                    className="text-zinc-500 hover:text-zinc-300 underline"
                  >
                    24/7
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={profile.hours}
                onChange={(e) => setProfile({ ...profile, hours: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                placeholder="e.g. Monday to Friday, 8:00 AM to 6:00 PM EST"
              />
            </div>
          </div>

          {/* After-Hours Call Routing Policy */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-medium text-zinc-300 block">After-Hours Call Handling Protocol</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "take_message_all",
                  title: "Option A: Full Message Intake",
                  badge: "Default",
                  desc: "Informs caller the office is closed, states next reopen time, and gathers complete message details for morning follow-up.",
                },
                {
                  id: "emergency_only",
                  title: "Option B: Emergency Gate Only",
                  badge: "Filtered",
                  desc: "Informs caller routine business is closed. Only processes urgent emergency dispatch (floods/gas). Others told to call back.",
                },
                {
                  id: "informational_only",
                  title: "Option C: Informational Voicemail",
                  badge: "No Intake",
                  desc: "Announces operating hours and directs caller to website booking. Does not take callback messages.",
                },
              ].map((pol) => (
                <button
                  key={pol.id}
                  type="button"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      after_hours_policy: pol.id as "take_message_all" | "emergency_only" | "informational_only",
                    })
                  }
                  className={`p-3 rounded-lg border text-left transition-colors space-y-1.5 ${
                    (profile.after_hours_policy || "take_message_all") === pol.id
                      ? "border-sky-500 bg-sky-500/10 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs text-zinc-200">
                    <span>{pol.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-zinc-700 bg-zinc-900 text-zinc-400">
                      {pol.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-relaxed">{pol.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Service Area Territory & Geofence Boundaries */}
          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-zinc-500" />
                  Primary Service Area Description
                </label>
                <input
                  type="text"
                  value={profile.service_area || ""}
                  onChange={(e) => setProfile({ ...profile, service_area: e.target.value })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                  placeholder="e.g. Metropolitan area and suburbs within a 25-mile radius"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Out-of-Area Caller Action</label>
                <select
                  value={profile.out_of_area_policy || "polite_decline"}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      out_of_area_policy: e.target.value as "polite_decline" | "strict_decline" | "travel_surcharge",
                    })
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
                >
                  <option value="polite_decline">Politely Decline &amp; Capture Lead for Review</option>
                  <option value="strict_decline">Hard Disqualification (Refer to Local Provider)</option>
                  <option value="travel_surcharge">Disclose Extended Travel Surcharge Option</option>
                </select>
              </div>
            </div>

            {/* Covered Cities Tag Manager */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>Covered Cities / Municipalities ({profile.service_cities?.length || 0})</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Used by the voice model to verify caller addresses
                </span>
              </label>

              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-zinc-800 bg-zinc-950/80 min-h-[44px]">
                {(profile.service_cities || []).map((city, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-[11px] text-sky-300 font-mono"
                  >
                    <span>{city}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCity(idx)}
                      className="text-sky-400 hover:text-sky-200 transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}

                <div className="flex items-center gap-1 ml-auto">
                  <input
                    type="text"
                    placeholder="Add city (e.g. Plano)..."
                    value={newCityInput}
                    onChange={(e) => setNewCityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCity();
                      }
                    }}
                    className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/40 font-mono w-44"
                  />
                  <button
                    type="button"
                    onClick={handleAddCity}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                  >
                    + Add City
                  </button>
                </div>
              </div>
            </div>

            {/* Live Territory & Temporal Readout Simulator */}
            <div className="p-3.5 rounded-lg border border-sky-500/20 bg-zinc-950 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-sky-400 uppercase flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                  Live Geofence Vocalization Simulator
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Caller: &quot;I&apos;m in Dallas, can you come unclog my drain?&quot;
                </span>
              </div>

              <div className="p-2.5 rounded bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed font-sans">
                <span className="text-sky-400 font-semibold">{profile.agent_name || "Receptionist"}:</span> &quot;Since you are in Dallas, which is outside our service area of {profile.service_area || "our primary territory"}, we unfortunately cannot send a technician out to your location. However, is there anything else I can assist you with today?&quot;
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-end pt-4 border-t border-zinc-800">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {saving ? (
              "Saving..."
            ) : success ? (
              <>
                <Check className="w-4 h-4" />
                Changes Saved to Voice Agent
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Publish Changes to Voice Agent
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
