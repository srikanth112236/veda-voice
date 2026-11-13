"use client";

import React, { useEffect, useState } from "react";
import { api, AgentProfile } from "@/lib/api";
import {
  Settings2,
  Save,
  Check,
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
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
      .then((res) => setProfile(res))
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
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

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

  if (loading) {
    return <div className="p-8 text-xs font-mono text-zinc-500">Loading receptionist rules...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-xs text-red-400">Failed to load profile.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-400" />
            Receptionist Persona &amp; Knowledge Base
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure greeting scripts, conversational tone, strict pricing guardrails, and emergency shut-off advice.
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
        {/* Section 1: Business Identity & Hours */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
            1. Business Identity &amp; Hours
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Business Name</label>
              <input
                type="text"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Timezone</label>
              <input
                type="text"
                value={profile.timezone}
                onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
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

        {/* Section 2: Conversational Tone & Greeting */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
            2. Conversational Tone &amp; Greeting
          </h2>

          <div className="space-y-3">
            <label className="text-xs font-medium text-zinc-300 block">Tone Archetype</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "direct", title: "Direct & Urgent", desc: "Short turns (<15 words). Triage-first for emergency trades." },
                { id: "warm", title: "Warm & Reassuring", desc: "Patient, comforting listening for clinics and dental." },
                { id: "formal", title: "Formal & Precise", desc: "Objective, professional, legally cautious language." },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setProfile({ ...profile, tone: t.id })}
                  className={`p-3 rounded-lg border text-left transition-colors space-y-1 ${
                    profile.tone === t.id
                      ? "border-emerald-500/50 bg-emerald-500/5 text-zinc-100"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="font-semibold text-xs text-zinc-200">{t.title}</div>
                  <div className="text-[11px] text-zinc-500 leading-tight">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Opening Greeting Script</label>
              <span className="text-[10px] text-zinc-500 font-mono">
                ~{Math.round(profile.greeting.split(" ").length / 3)}s spoken duration
              </span>
            </div>
            <textarea
              rows={3}
              value={profile.greeting}
              onChange={(e) => setProfile({ ...profile, greeting: e.target.value })}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 leading-relaxed"
            />
          </div>
        </div>

        {/* Section 3: Pricing Policy & Guardrails */}
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
              { id: "diagnostic_fee_only", title: "Diagnostic Fee Only", desc: "$89 trip fee; repair pricing given on-site after inspection." },
              { id: "fixed_menu", title: "Fixed Price Menu", desc: "Quotes exact prices from table for listed routine items." },
              { id: "no_quote_take_message", title: "No Phone Quoting", desc: "Takes message; estimator calls back with custom quote." },
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

        {/* Section 4: Emergency Mitigation Protocol */}
        <div className="p-5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-4">
          <h2 className="text-xs font-bold text-red-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
            4. Emergency Mitigation Guidance
          </h2>
          <p className="text-xs text-zinc-400">
            Advice spoken immediately to the caller before message intake when an emergency keyword is triggered.
          </p>

          <div className="space-y-1.5">
            <textarea
              rows={2}
              value={profile.emergency_advice}
              onChange={(e) => setProfile({ ...profile, emergency_advice: e.target.value })}
              placeholder="If safe to do so, please locate and shut off your main water valve right away..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-100 focus:outline-none focus:border-red-500/50"
            />
          </div>
        </div>

        {/* Section 5: Knowledge Base & FAQs */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
              5. Knowledge Base &amp; Frequently Asked Questions
            </h2>
            <button
              type="button"
              onClick={handleAddFaq}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center gap-1 font-medium transition-colors"
            >
              <Plus className="w-3 h-3" /> Add FAQ
            </button>
          </div>

          <div className="space-y-3">
            {profile.faq.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-950 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={item.question}
                    onChange={(e) => handleUpdateFaq(idx, "question", e.target.value)}
                    placeholder="Question (e.g. Do you offer warranties?)"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 font-semibold focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFaq(idx)}
                    className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                    title="Remove FAQ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={item.answer}
                  onChange={(e) => handleUpdateFaq(idx, "answer", e.target.value)}
                  placeholder="Answer spoken by the receptionist..."
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 leading-relaxed"
                />
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}
