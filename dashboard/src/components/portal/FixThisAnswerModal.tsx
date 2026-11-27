"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles, Wrench, X } from "lucide-react";
import { api } from "@/lib/api";

interface FixThisAnswerModalProps {
  callerPrompt: string;
  aiReply: string;
  onClose: () => void;
}

export function FixThisAnswerModal({ callerPrompt, aiReply, onClose }: FixThisAnswerModalProps) {
  const [mode, setMode] = useState<"objection" | "faq" | "barred">("objection");
  const [triggerText, setTriggerText] = useState(callerPrompt || "");
  const [betterAnswer, setBetterAnswer] = useState("");
  const [barredPhrase, setBarredPhrase] = useState(aiReply.slice(0, 120));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [simReply, setSimReply] = useState<string | null>(null);

  const handleSaveFix = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      const current = await api.getPortalProfile();
      if (mode === "objection") {
        await api.updatePortalProfile({
          objection_handlers: [
            ...(current.objection_handlers || []),
            {
              trigger: triggerText.trim() || "Caller question",
              response: betterAnswer.trim(),
              action: "answer",
            },
          ],
        });
      } else if (mode === "faq") {
        await api.updatePortalProfile({
          faq: [
            ...(current.faq || []),
            {
              question: triggerText.trim() || "Caller question",
              answer: betterAnswer.trim(),
              category: "general",
            },
          ],
        });
      } else {
        await api.updatePortalProfile({
          barred_phrases: [
            ...(current.barred_phrases || []),
            barredPhrase.trim(),
          ].filter(Boolean),
        });
      }

      if (triggerText.trim()) {
        const sim = await api.simulateAnswer(triggerText.trim());
        setSimReply(`${sim.suggested_reply} (${sim.matched_source})`);
      }
      setSavedMsg("Saved to live AI profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-[var(--ink-primary)]">Fix This AI Answer</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-hairline)] p-3 text-xs space-y-1">
          <p className="font-semibold text-[var(--ink-secondary)]">AI Previously Said:</p>
          <p className="text-[var(--ink-primary)] italic">&ldquo;{aiReply}&rdquo;</p>
        </div>

        <div className="flex gap-2">
          {(
            [
              ["objection", "Objection Rule"],
              ["faq", "Add FAQ"],
              ["barred", "Bar Phrase"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                mode === id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-[var(--surface-canvas)] text-[var(--ink-secondary)] border-[var(--border-hairline)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "barred" ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold">Phrase AI Must Never Say</label>
            <input
              type="text"
              value={barredPhrase}
              onChange={(e) => setBarredPhrase(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs"
            />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold">
                {mode === "objection" ? "When Caller Says / Asks" : "FAQ Question"}
              </label>
              <input
                type="text"
                value={triggerText}
                onChange={(e) => setTriggerText(e.target.value)}
                placeholder="e.g. Why is the diagnostic fee $89?"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold">
                {mode === "objection" ? "Better AI Response" : "Approved FAQ Answer"}
              </label>
              <textarea
                rows={3}
                value={betterAnswer}
                onChange={(e) => setBetterAnswer(e.target.value)}
                placeholder="Write the exact answer the AI should give..."
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs"
              />
            </div>
          </>
        )}

        {savedMsg && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {savedMsg}
            </p>
            {simReply && (
              <p className="text-[11px] flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Simulated: {simReply}</span>
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-[var(--border-hairline)] text-xs font-medium"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving || (mode !== "barred" && !betterAnswer.trim())}
            onClick={handleSaveFix}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save & Test"}
          </button>
        </div>
      </div>
    </div>
  );
}
