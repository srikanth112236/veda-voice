"use client";

import { useState } from "react";
import { Plus, ShieldCheck, Sparkles, Trash2, Volume2 } from "lucide-react";
import { api, type AgentProfile } from "@/lib/api";

interface AiRulesAndObjectionsCardProps {
  profile: AgentProfile;
  setProfile: (updated: AgentProfile) => void;
}

export function AiRulesAndObjectionsCard({ profile, setProfile }: AiRulesAndObjectionsCardProps) {
  const [newDoRule, setNewDoRule] = useState("");
  const [newDontRule, setNewDontRule] = useState("");
  const [previewPhrase, setPreviewPhrase] = useState(
    profile.greeting || "Thanks for calling, how can I help you today?"
  );
  const [previewResult, setPreviewResult] = useState<{
    spoken_text: string;
    applied_glossary_terms: string[];
  } | null>(null);
  const [simQuestion, setSimQuestion] = useState("");
  const [simResult, setSimResult] = useState<{
    matched_source: string;
    matched_label: string;
    suggested_reply: string;
  } | null>(null);
  const [testingAnswer, setTestingAnswer] = useState(false);

  const doRules = profile.do_rules || [];
  const dontRules = profile.dont_rules || [];
  const objections = profile.objection_handlers || [];
  const escalations = profile.escalation_rules || [];

  const handleVoiceTest = async () => {
    if (!previewPhrase.trim()) return;
    try {
      const res = await api.previewVoicePronunciation(previewPhrase, profile.voice_id);
      setPreviewResult({
        spoken_text: res.spoken_text,
        applied_glossary_terms: res.applied_glossary_terms,
      });
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(res.spoken_text);
        utt.rate = 0.96;
        window.speechSynthesis.speak(utt);
      }
    } catch {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(previewPhrase));
      }
    }
  };

  const handleSimulateAnswer = async () => {
    if (!simQuestion.trim()) return;
    setTestingAnswer(true);
    try {
      const res = await api.simulateAnswer(simQuestion);
      setSimResult({
        matched_source: res.matched_source,
        matched_label: res.matched_label,
        suggested_reply: res.suggested_reply,
      });
    } finally {
      setTestingAnswer(false);
    }
  };

  return (
    <div
      data-testid="ai-rules-objections-card"
      className="p-6 rounded-2xl bg-[var(--surface-panel)] border border-[var(--border-hairline)] space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-[var(--ink-primary)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            AI Operational Rules, Objections & Strict Grounding
          </h3>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Define custom prompt rules, tough-caller objection playbooks, escalation targets, and anti-hallucination guardrails.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(profile.strict_grounding)}
            onChange={(e) => setProfile({ ...profile, strict_grounding: e.target.checked })}
            className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          Strict Grounding (Zero Guessing)
        </label>
      </div>

      {/* Custom Operational Instructions */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-[var(--ink-primary)]">
          Custom Operational Instructions
        </label>
        <textarea
          rows={3}
          value={profile.custom_instructions || ""}
          onChange={(e) => setProfile({ ...profile, custom_instructions: e.target.value })}
          placeholder="e.g. Always ask whether caller is residential or commercial first. Mention our 10% Tuesday senior discount."
          className="w-full px-3 py-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        />
      </div>

      {/* Fallback script when Strict Grounding is active */}
      {profile.strict_grounding && (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--ink-primary)]">
            Unknown Answer Fallback Script
          </label>
          <input
            type="text"
            value={profile.unknown_fallback_script || ""}
            onChange={(e) => setProfile({ ...profile, unknown_fallback_script: e.target.value })}
            placeholder="Let me have our specialist confirm that exact detail and call you right back."
            className="w-full px-3 py-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs"
          />
        </div>
      )}

      {/* Always Do & Never Do Rules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3.5">
          <p className="text-xs font-bold text-emerald-700">Always Do Rules</p>
          <div className="space-y-1.5">
            {doRules.map((rule, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-xs bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5">
                <span className="truncate">{rule}</span>
                <button
                  type="button"
                  onClick={() =>
                    setProfile({ ...profile, do_rules: doRules.filter((_, i) => i !== idx) })
                  }
                  className="text-zinc-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newDoRule}
              onChange={(e) => setNewDoRule(e.target.value)}
              placeholder="Add required behavior..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!newDoRule.trim()) return;
                setProfile({ ...profile, do_rules: [...doRules, newDoRule.trim()] });
                setNewDoRule("");
              }}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3.5">
          <p className="text-xs font-bold text-rose-700">Never Do Rules</p>
          <div className="space-y-1.5">
            {dontRules.map((rule, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-xs bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-lg px-2.5 py-1.5">
                <span className="truncate">{rule}</span>
                <button
                  type="button"
                  onClick={() =>
                    setProfile({ ...profile, dont_rules: dontRules.filter((_, i) => i !== idx) })
                  }
                  className="text-zinc-400 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newDontRule}
              onChange={(e) => setNewDontRule(e.target.value)}
              placeholder="Add prohibited action..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!newDontRule.trim()) return;
                setProfile({ ...profile, dont_rules: [...dontRules, newDontRule.trim()] });
                setNewDontRule("");
              }}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Objection & Tough-Caller Playbook */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[var(--ink-primary)]">Objection &amp; Tough-Caller Playbook</p>
          <button
            type="button"
            onClick={() =>
              setProfile({
                ...profile,
                objection_handlers: [
                  ...objections,
                  { trigger: "", response: "", action: "answer" },
                ],
              })
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <Plus className="w-3.5 h-3.5" /> Add Objection Rule
          </button>
        </div>
        {objections.map((obj, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-[var(--surface-canvas)] p-2.5 rounded-xl border border-[var(--border-hairline)]">
            <input
              type="text"
              value={obj.trigger}
              placeholder="Caller says (e.g. Why $89 fee?)"
              onChange={(e) => {
                const next = [...objections];
                next[idx] = { ...next[idx], trigger: e.target.value };
                setProfile({ ...profile, objection_handlers: next });
              }}
              className="md:col-span-4 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            />
            <input
              type="text"
              value={obj.response}
              placeholder="Required AI response..."
              onChange={(e) => {
                const next = [...objections];
                next[idx] = { ...next[idx], response: e.target.value };
                setProfile({ ...profile, objection_handlers: next });
              }}
              className="md:col-span-5 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            />
            <select
              value={obj.action || "answer"}
              onChange={(e) => {
                const next = [...objections];
                next[idx] = { ...next[idx], action: e.target.value };
                setProfile({ ...profile, objection_handlers: next });
              }}
              className="md:col-span-2 px-2 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            >
              <option value="answer">Answer</option>
              <option value="offer_quote">Offer Quote</option>
              <option value="transfer">Transfer</option>
              <option value="take_message">Take Message</option>
            </select>
            <button
              type="button"
              onClick={() =>
                setProfile({
                  ...profile,
                  objection_handlers: objections.filter((_, i) => i !== idx),
                })
              }
              className="md:col-span-1 justify-self-end p-1.5 text-zinc-400 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Custom Escalation Triggers */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[var(--ink-primary)]">Custom Escalation Triggers</p>
          <button
            type="button"
            onClick={() =>
              setProfile({
                ...profile,
                escalation_rules: [
                  ...escalations,
                  { condition: "", target_number: "", label: "" },
                ],
              })
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <Plus className="w-3.5 h-3.5" /> Add Escalation Trigger
          </button>
        </div>
        {escalations.map((esc, idx) => (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-[var(--surface-canvas)] p-2.5 rounded-xl border border-[var(--border-hairline)]">
            <input
              type="text"
              value={esc.condition}
              placeholder="Condition (e.g. billing dispute)"
              onChange={(e) => {
                const next = [...escalations];
                next[idx] = { ...next[idx], condition: e.target.value };
                setProfile({ ...profile, escalation_rules: next });
              }}
              className="md:col-span-5 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            />
            <input
              type="text"
              value={esc.target_number}
              placeholder="+15125550199"
              onChange={(e) => {
                const next = [...escalations];
                next[idx] = { ...next[idx], target_number: e.target.value };
                setProfile({ ...profile, escalation_rules: next });
              }}
              className="md:col-span-3 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs font-mono"
            />
            <input
              type="text"
              value={esc.label || ""}
              placeholder="Label (e.g. Manager)"
              onChange={(e) => {
                const next = [...escalations];
                next[idx] = { ...next[idx], label: e.target.value };
                setProfile({ ...profile, escalation_rules: next });
              }}
              className="md:col-span-3 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-xs"
            />
            <button
              type="button"
              onClick={() =>
                setProfile({
                  ...profile,
                  escalation_rules: escalations.filter((_, i) => i !== idx),
                })
              }
              className="md:col-span-1 justify-self-end p-1.5 text-zinc-400 hover:text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Live Voice & Answer Simulator */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--border-hairline)]">
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> Voice &amp; Glossary Preview
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={previewPhrase}
              onChange={(e) => setPreviewPhrase(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs"
            />
            <button
              type="button"
              onClick={handleVoiceTest}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-zinc-200/70 text-xs font-semibold shrink-0"
            >
              Speak
            </button>
          </div>
          {previewResult && (
            <p className="text-[11px] text-[var(--ink-secondary)]">
              Spoken: <span className="font-medium text-[var(--ink-primary)]">{previewResult.spoken_text}</span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Quick Answer Simulator
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={simQuestion}
              onChange={(e) => setSimQuestion(e.target.value)}
              placeholder="Ask a tough caller question..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs"
            />
            <button
              type="button"
              disabled={testingAnswer}
              onClick={handleSimulateAnswer}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 disabled:opacity-60"
            >
              {testingAnswer ? "Testing..." : "Test"}
            </button>
          </div>
          {simResult && (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-2.5 text-[11px] space-y-1">
              <p className="font-mono text-[10px] text-emerald-700">
                Matched: {simResult.matched_source} ({simResult.matched_label})
              </p>
              <p className="text-[var(--ink-primary)]">{simResult.suggested_reply}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
