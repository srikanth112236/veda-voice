"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Play, ShieldAlert, X } from "lucide-react";
import { api } from "@/lib/api";

interface QaScenario {
  id: string;
  title: string;
  caller_input: string;
  expected_behavior: string;
  ai_response: string;
  passed: boolean;
  source: string;
}

interface AiQaSimulatorModalProps {
  onClose: () => void;
}

export function AiQaSimulatorModal({ onClose }: AiQaSimulatorModalProps) {
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [passedCount, setPassedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [scenarios, setScenarios] = useState<QaScenario[]>([]);

  const runSuite = async () => {
    setLoading(true);
    try {
      const res = await api.runAiQaSuite();
      setScore(res.overall_score);
      setPassedCount(res.passed_count);
      setTotalCount(res.total_count);
      setScenarios(res.scenarios);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSuite();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--ink-primary)]">
              Golden Call QA Suite
            </h3>
            <p className="text-xs text-[var(--ink-secondary)]">
              Automated 6-scenario verification of your live AI rules, objections, safety, and grounding.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs font-mono text-[var(--ink-muted)]">
            Running 6 Golden Call scenarios...
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-subtle)] p-3.5">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-xs font-bold text-[var(--ink-primary)]">
                    Readiness Score: {score}% ({passedCount}/{totalCount} passed)
                  </p>
                  <p className="text-[11px] text-[var(--ink-secondary)]">
                    Evaluated against current objections, FAQs, emergency script, and strict grounding.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={runSuite}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              >
                <Play className="w-3 h-3" /> Re-Run
              </button>
            </div>

            <div className="space-y-2.5">
              {scenarios.map((sc) => (
                <div
                  key={sc.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--ink-primary)] flex items-center gap-1.5">
                      {sc.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      )}
                      {sc.title}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[var(--surface-subtle)] font-mono text-[10px] text-[var(--ink-secondary)]">
                      {sc.source}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--ink-secondary)]">
                    <strong>Caller:</strong> &ldquo;{sc.caller_input}&rdquo;
                  </p>
                  <p className="text-[11px] text-[var(--ink-primary)]">
                    <strong>AI:</strong> {sc.ai_response}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
