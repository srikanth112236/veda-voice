"use client";

import React, { useEffect, useState } from "react";
import { api, AgentProfile, PhoneticEntry } from "@/lib/api";
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
} from "lucide-react";

export default function ReceptionistProfilePage() {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getPortalProfile()
      .then((res) => {
        // Ensure defaults for module 1 if missing
        setProfile({
          ...res,
          agent_name: res.agent_name || "receptionist",
          voice_id: res.voice_id || "Alex",
          recording_disclosure: res.recording_disclosure !== false,
          phonetic_glossary: res.phonetic_glossary || [
            { term: "HVAC", spoken_as: "H-V-A-C", note: "Acronym" },
            { term: "PEX", spoken_as: "pecks", note: "Plumbing pipe type" },
          ],
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
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // FAQ Handlers
  const handleAddFaq = () => {
    if (!profile) return;
    setProfile({
      ...profile,
      faq: [...profile.faq, { question: "", answer: "" }],
    });
  };

  const handleRemoveFaq = (idx: number) => {
    if (!profile) return;
    const nextFaq = [...profile.faq];
    nextFaq.splice(idx, 1);
    setProfile({ ...profile, faq: nextFaq });
  };

  const handleUpdateFaq = (idx: number, field: "question" | "answer", val: string) => {
    if (!profile) return;
    const nextFaq = [...profile.faq];
    nextFaq[idx][field] = val;
    setProfile({ ...profile, faq: nextFaq });
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

  if (loading) {
    return <div className="p-8 text-xs font-mono text-zinc-500">Loading receptionist rules...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-xs text-red-400">Failed to load profile.</div>;
  }

  const glossaryList = profile.phonetic_glossary || [];

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
            Configure greeting scripts, acoustic voice models, phonetic pronunciation glossary, and safety guardrails.
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

          {/* Acoustic Voice Model Selection */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                Acoustic Voice Model &amp; Timbre
              </label>
              <span className="text-[10px] text-zinc-500 font-mono">LiveKit Inference TTS</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {[
                { id: "Alex", label: "Alex", provider: "Inworld TTS", trait: "Neutral American (Crisp)" },
                { id: "Ashley", label: "Ashley", provider: "Inworld TTS", trait: "Warm Female Receptionist" },
                { id: "Edward", label: "Edward", provider: "Inworld TTS", trait: "Authoritative Commercial" },
                { id: "Arcana", label: "Arcana", provider: "Rime TTS", trait: "Fast Expressive Dynamic" },
              ].map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setProfile({ ...profile, voice_id: voice.id })}
                  className={`p-3 rounded-lg border text-left transition-colors space-y-1 ${
                    (profile.voice_id || "Alex") === voice.id
                      ? "border-indigo-500 bg-indigo-500/10 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-xs text-zinc-200">
                    <span>{voice.label}</span>
                    <Volume2 className="w-3 h-3 text-zinc-500" />
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">{voice.provider}</div>
                  <div className="text-[10px] text-zinc-400">{voice.trait}</div>
                </button>
              ))}
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

        {/* SECTION 2: OPERATING SCHEDULE & SCOPE */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
            2. Operating Schedule &amp; Timezone
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Timezone</label>
              <input
                type="text"
                value={profile.timezone}
                onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Operating Hours</label>
              <input
                type="text"
                value={profile.hours}
                onChange={(e) => setProfile({ ...profile, hours: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: PRICING POLICY & GUARDRAILS */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
              3. Pricing Policy &amp; Guardrails
            </h2>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <Check className="w-3 h-3" /> Anti-Hallucination Guard Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                id: "diagnostic_fee_only",
                title: "Diagnostic Fee Only",
                desc: "$89 trip fee; repair pricing given on-site after inspection.",
              },
              {
                id: "fixed_menu",
                title: "Fixed Price Menu",
                desc: "Quotes exact prices from table for listed routine items.",
              },
              {
                id: "no_quote_take_message",
                title: "No Phone Quoting",
                desc: "Takes message; estimator calls back with custom quote.",
              },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProfile({ ...profile, pricing_policy: p.id })}
                className={`p-3 rounded-lg border text-left transition-colors space-y-1 ${
                  profile.pricing_policy === p.id
                    ? "border-emerald-500/50 bg-emerald-500/5 text-zinc-100"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="font-semibold text-xs text-zinc-200">{p.title}</div>
                <div className="text-[11px] text-zinc-500 leading-tight">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 4: EMERGENCY MITIGATION GUIDANCE */}
        <div className="p-5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-4">
          <h2 className="text-xs font-bold text-red-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
            4. Emergency Mitigation Guidance
          </h2>
          <p className="text-xs text-zinc-400">
            Advice spoken immediately to the caller before message intake when an emergency keyword is triggered.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Shut-Off / Damage Mitigation Instructions</label>
            <textarea
              rows={2}
              value={profile.emergency_advice}
              onChange={(e) => setProfile({ ...profile, emergency_advice: e.target.value })}
              className="w-full rounded-lg border border-red-500/20 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-red-500/40 leading-relaxed font-sans"
              placeholder="e.g. If it is safe to do so, locate and shut off your main water valve right away..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Emergency Human Transfer Phone Number</label>
            <input
              type="text"
              value={profile.transfer_number}
              onChange={(e) => setProfile({ ...profile, transfer_number: e.target.value })}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
              placeholder="+1 (800) 555-0199"
            />
          </div>
        </div>

        {/* SECTION 5: KNOWLEDGE BASE & FAQS */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
                5. Knowledge Base &amp; FAQ Grounding
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                The agent answers exclusively from these verified facts to guarantee zero hallucinations.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddFaq}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Q&amp;A
            </button>
          </div>

          <div className="space-y-3">
            {profile.faq.map((item, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    placeholder="Question caller might ask..."
                    value={item.question}
                    onChange={(e) => handleUpdateFaq(idx, "question", e.target.value)}
                    className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 font-medium focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFaq(idx)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Approved factual answer spoken by agent..."
                  value={item.answer}
                  onChange={(e) => handleUpdateFaq(idx, "answer", e.target.value)}
                  className="w-full rounded border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 leading-relaxed font-sans"
                />
              </div>
            ))}
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
