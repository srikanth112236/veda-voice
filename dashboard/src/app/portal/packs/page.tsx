"use client";

import React, { useState, useEffect } from "react";
import {
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Sparkles,
  Sliders,
  FileCode,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { api, IndustryPackSummary, IndustryPackDetail } from "@/lib/api";

export default function IndustryPacksPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "overrides" | "test">("catalog");
  const [packs, setPacks] = useState<IndustryPackSummary[]>([]);
  const [selectedPackSlug, setSelectedPackSlug] = useState<string>("home_services");
  const [packDetail, setPackDetail] = useState<IndustryPackDetail | null>(null);
  const [currentApplied, setCurrentApplied] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [savingOverrides, setSavingOverrides] = useState<boolean>(false);
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Overrides form state
  const [emergencyKeywordsInput, setEmergencyKeywordsInput] = useState<string>("");
  const [customSafetyScript, setCustomSafetyScript] = useState<string>("");
  const [customVarsJson, setCustomVarsJson] = useState<string>("{}");

  const loadData = async () => {
    try {
      setLoading(true);
      const packsList = await api.listIndustryPacks();
      let applied: Record<string, any> = {};
      try {
        applied = await api.getCurrentAppliedPack();
      } catch {
        applied = {};
      }

      const activeSlug = applied?.pack_slug || applied?.applied_pack?.slug;

      const normalizedPacks: IndustryPackSummary[] = (packsList || []).map((p) => ({
        ...p,
        is_applied: p.slug === activeSlug,
      }));

      setPacks(normalizedPacks);
      setCurrentApplied(applied);

      const targetSlug = activeSlug || normalizedPacks[0]?.slug || "home_services";
      setSelectedPackSlug(targetSlug);

      const detail = await api.getIndustryPackDetails(targetSlug);
      setPackDetail({
        ...detail,
        is_applied: detail.slug === activeSlug,
      });

      // Hydrate overrides
      if (applied?.overrides) {
        setEmergencyKeywordsInput(
          (applied.overrides.emergency_keywords || []).join(", ")
        );
        setCustomSafetyScript(applied.overrides.custom_safety_script || "");
        setCustomVarsJson(
          JSON.stringify(applied.overrides.vars || {}, null, 2)
        );
      }
    } catch (err: any) {
      console.error("Failed to load industry packs", err);
      setMessage({ type: "error", text: err.message || "Failed to load industry packs" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectPack = async (slug: string) => {
    setSelectedPackSlug(slug);
    try {
      const detail = await api.getIndustryPackDetails(slug);
      const activeSlug = currentApplied?.pack_slug || currentApplied?.applied_pack?.slug;
      setPackDetail({
        ...detail,
        is_applied: detail.slug === activeSlug,
      });
    } catch (err: any) {
      console.error("Failed to fetch pack detail", err);
    }
  };

  const handleApplyPack = async (slug: string) => {
    try {
      setApplying(true);
      setMessage(null);
      await api.applyIndustryPack({ pack_slug: slug });
      setMessage({
        type: "success",
        text: `Successfully applied ${slug.replace(/_/g, " ")} industry pack to your voice agent!`,
      });
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to apply industry pack" });
    } finally {
      setApplying(false);
    }
  };

  const handleSaveOverrides = async () => {
    try {
      setSavingOverrides(true);
      setMessage(null);

      let parsedVars = {};
      try {
        parsedVars = JSON.parse(customVarsJson);
      } catch {
        throw new Error("Custom Variables must be valid JSON format");
      }

      const keywords = emergencyKeywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      await api.updatePackOverrides({
        vars: parsedVars,
        emergency_keywords: keywords,
        custom_safety_script: customSafetyScript,
      });

      setMessage({ type: "success", text: "Custom pack overrides updated and compiled." });
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save overrides" });
    } finally {
      setSavingOverrides(false);
    }
  };

  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setMessage(null);
      const res = await api.runPackTestScenarios();
      setTestResult(res);
      setMessage({
        type: "success",
        text: `Evaluated ${res.total_scenarios} scenarios. Score: ${res.score_pct}% (${res.passed_scenarios}/${res.total_scenarios} passed)`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to run test scenarios" });
    } finally {
      setRunningTests(false);
    }
  };

  const currentPackName = currentApplied?.pack_name || currentApplied?.applied_pack?.name || currentApplied?.pack_slug;
  const currentPackVersion = currentApplied?.version_semver || currentApplied?.applied_pack?.active_version || "1.0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Briefcase className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Industry Packs Engine</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              FR-PACK-1..7
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Pre-built operational blueprints, prompt synthesizers, emergency protocols, and automated 10-scenario QA suites.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentPackName && (
            <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs text-indigo-900">
              <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              <span>Active Pack:</span>
              <strong className="font-semibold capitalize">
                {currentPackName} ({currentPackVersion})
              </strong>
            </div>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 font-bold text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "catalog"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Blueprint Catalog
        </button>
        <button
          onClick={() => setActiveTab("overrides")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "overrides"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Tenant Custom Overrides
        </button>
        <button
          onClick={() => setActiveTab("test")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "test"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Play className="h-4 w-4" />
          10-Scenario QA Test Runner
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === "catalog" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Pack Cards List */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Available Industry Blueprints
            </h3>
            {packs.map((p) => {
              const isSelected = selectedPackSlug === p.slug;
              const outboundCats = p.allowed_outbound_categories || p.permitted_outbound_categories || [];
              const packVersion = p.latest_version || p.active_version || "1.0.0";
              const packCategory = p.category ? p.category.replace(/_/g, " ") : "General";

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPack(p.slug)}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500 shadow-sm"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{p.icon || "📦"}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">{p.name}</h4>
                        <span className="text-[11px] font-mono text-zinc-500 capitalize">
                          {p.badge || packCategory} • v{packVersion}
                        </span>
                      </div>
                    </div>
                    {p.is_applied && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 line-clamp-2">{p.description}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-100">
                    {p.validation_status === "incomplete" && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        <AlertTriangle className="h-3 w-3 text-amber-600" />
                        Draft / Fallback Mode
                      </span>
                    )}
                    {p.requires_hipaa_baa && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                        <ShieldCheck className="h-3 w-3" />
                        Requires HIPAA BAA
                      </span>
                    )}
                    {outboundCats.length > 0 && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                        Permitted Outbound: {outboundCats.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Pack Details Preview */}
          <div className="lg:col-span-7">
            {packDetail ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-5">
                <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{packDetail.icon || "📦"}</span>
                      <h3 className="text-lg font-bold text-zinc-900">{packDetail.name}</h3>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-600">
                        v{packDetail.version_semver || packDetail.latest_version || packDetail.active_version || "1.0.0"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{packDetail.description}</p>
                  </div>
                  <button
                    onClick={() => handleApplyPack(packDetail.slug)}
                    disabled={applying || packDetail.is_applied}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition ${
                      packDetail.is_applied
                        ? "bg-zinc-400 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                    }`}
                  >
                    {applying ? "Applying Blueprint..." : packDetail.is_applied ? "Already Active" : "Apply Blueprint"}
                  </button>
                </div>

                {packDetail.validation_status === "incomplete" && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Incomplete / Draft Industry Pack:</strong>
                      <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                        This blueprint is currently in draft mode. When activated, the AI voice agent automatically applies safe commercial baseline fallbacks for any missing prompts or emergency triggers, guaranteeing complete operational safety during calls.
                      </p>
                    </div>
                  </div>
                )}

                {/* Appointment Types */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Pre-Configured Appointment Types ({packDetail.appointment_types?.length || 0})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {packDetail.appointment_types?.map((apt: any) => (
                      <div key={apt.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 text-xs">
                        <div className="flex items-center justify-between font-semibold text-zinc-800">
                          <span>{apt.title || apt.name}</span>
                          <span className="font-mono text-zinc-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {apt.duration_minutes || apt.duration_min || 45}m
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500 line-clamp-1">{apt.description || apt.fee || "Standard Booking"}</p>
                        {apt.deposit_required && (
                          <span className="mt-1 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">
                            Deposit Required
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Emergency Protocol */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>Emergency Safety Protocol & Triggers</span>
                  </div>
                  <p className="text-zinc-600 text-[11px] mb-2">
                    Action: <strong>{packDetail.emergency_rules?.escalation_mode || packDetail.emergency_protocol?.immediate_action || "Immediate Dispatch Escalation"}</strong>
                  </p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(packDetail.emergency_rules?.keywords || packDetail.emergency_protocol?.triggers || []).map((t: string, idx: number) => (
                      <span key={idx} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-mono text-amber-800">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="font-mono text-[10px] text-amber-900 bg-amber-100/60 p-2 rounded border border-amber-200">
                    &ldquo;{packDetail.emergency_rules?.safety_advice || packDetail.emergency_protocol?.script || "If experiencing severe emergencies, please evacuate and call 911 immediately."}&rdquo;
                  </p>
                </div>

                {/* System Prompt Template Excerpt */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5" />
                    Specialized Agent System Prompt
                  </h4>
                  <pre className="max-h-48 overflow-y-auto rounded-lg bg-zinc-900 p-3 font-mono text-[11px] text-zinc-200 whitespace-pre-wrap">
                    {packDetail.prompt_base || packDetail.system_prompt_template || "Blueprint prompt not configured."}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400">
                Select an industry pack to view its blueprint details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Custom Overrides */}
      {activeTab === "overrides" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Tenant-Level Custom Overrides</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Customize emergency detection triggers, dispatch safety scripts, and variable dictionaries for your applied industry pack.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Additional Emergency Keywords (Comma-separated)
              </label>
              <input
                type="text"
                value={emergencyKeywordsInput}
                onChange={(e) => setEmergencyKeywordsInput(e.target.value)}
                placeholder="e.g. gas leak, sparking wires, ceiling collapsed"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                These keywords immediately trigger tier 1 dispatch escalation and bypass standard triage queues.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Custom Emergency Safety Script (Spoken by Agent)
              </label>
              <textarea
                rows={3}
                value={customSafetyScript}
                onChange={(e) => setCustomSafetyScript(e.target.value)}
                placeholder="e.g. If you suspect gas or electrical hazards, please evacuate the building immediately and dial 911."
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Custom Prompt Variables (JSON)
              </label>
              <textarea
                rows={6}
                value={customVarsJson}
                onChange={(e) => setCustomVarsJson(e.target.value)}
                placeholder='{"diagnostic_fee": "$89", "service_radius_miles": 25}'
                className="w-full rounded-lg border border-zinc-300 p-3 font-mono text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                Variables are interpolated directly into your LiveKit agent prompt blueprint.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveOverrides}
                disabled={savingOverrides}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition"
              >
                {savingOverrides ? "Saving..." : "Save Overrides & Recompile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: QA Test Runner */}
      {activeTab === "test" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Automated 10-Scenario QA Test Runner</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Execute the standard test matrix against your effective industry pack prompt and safety guards.
              </p>
            </div>
            <button
              onClick={handleRunTests}
              disabled={runningTests}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-indigo-700 transition shadow-sm"
            >
              <Play className={`h-4 w-4 ${runningTests ? "animate-spin" : ""}`} />
              {runningTests ? "Simulating 10 Scenarios..." : "Run Test Suite"}
            </button>
          </div>

          {testResult && (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-zinc-900">Scorecard:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    testResult.score_pct >= 90 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {testResult.score_pct}% ({testResult.passed_scenarios}/{testResult.total_scenarios} passed)
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">Pack: {testResult.pack_slug}</span>
                </div>
                <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                  Status: {testResult.status}
                </span>
              </div>

              <div className="divide-y divide-zinc-100">
                {testResult.scenarios?.map((sc: any, idx: number) => (
                  <div key={sc.id || idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5">
                        {sc.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                        )}
                      </span>
                      <div>
                        <div className="font-medium text-zinc-800">{sc.name}</div>
                        <div className="text-[11px] text-zinc-500 italic mt-0.5">&ldquo;{sc.user_utterance}&rdquo;</div>
                        <div className="text-[11px] text-zinc-400 mt-1">Expected: {sc.expected_action} ({sc.expected_urgency})</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono text-right">{sc.rationale}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
