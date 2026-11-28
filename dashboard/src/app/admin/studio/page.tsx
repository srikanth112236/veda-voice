"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { ShieldAlert, Save, RotateCcw, Sparkles, CheckCircle2 } from "lucide-react";

interface TenantItem {
  id: string;
  name: string;
  status: string;
}

type StudioTab = "terminology" | "pages" | "theme" | "voice" | "plan";

export default function HiddenAdminStudioPage() {
  const { user, loading: authLoading } = useAuth();
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [presets, setPresets] = useState<Record<string, { label?: string }>>({});
  const [industrySlug, setIndustrySlug] = useState<string>("");
  const [resolved, setResolved] = useState<any>(null);
  const [overrideData, setOverrideData] = useState<any>({});
  const [activeTab, setActiveTab] = useState<StudioTab>("terminology");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const authHeaders = () => ({
    "Content-Type": "application/json",
  });

  useEffect(() => {
    if (!user || user.role !== "platform_admin") return;
    Promise.all([
      fetch("/api/v1/admin/tenants", { credentials: "include", headers: authHeaders() }).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/v1/admin/studio/presets", { credentials: "include", headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
    ]).then(([tList, presetRes]) => {
      if (Array.isArray(tList) && tList.length > 0) {
        setTenants(tList);
        setSelectedTenantId(tList[0].id);
      }
      if (presetRes?.presets) {
        setPresets(presetRes.presets);
      }
    });
  }, [user]);

  const loadTenantStudio = async (tenantId: string) => {
    if (!tenantId) return;
    setNotice(null);
    const res = await fetch(`/api/v1/admin/studio/tenants/${tenantId}`, {
      credentials: "include",
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      setResolved(data.resolved);
      setOverrideData(data.client_override || {});
      setIndustrySlug(data.industry_slug || "");
    } else {
      setNotice(`Failed to load tenant studio (${res.status}).`);
    }
  };

  useEffect(() => {
    if (selectedTenantId && user?.role === "platform_admin") {
      loadTenantStudio(selectedTenantId);
    }
  }, [selectedTenantId, user]);

  const setNestedOverride = (section: string, key: string, value: unknown) => {
    setOverrideData((prev: any) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [key]: value,
      },
    }));
    setResolved((prev: any) =>
      prev
        ? {
            ...prev,
            [section]: {
              ...(prev[section] || {}),
              [key]: value,
            },
          }
        : prev
    );
  };

  const handleSave = async () => {
    if (!selectedTenantId) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/studio/tenants/${selectedTenantId}`, {
        method: "PUT",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({
          studio: overrideData,
          industry_preset: industrySlug || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResolved(data.resolved);
        setOverrideData(data.client_override || {});
        setNotice("Studio configuration saved and active.");
      } else {
        setNotice("Failed to save configuration.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPreset = async (slug: string) => {
    if (!selectedTenantId || !slug) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/studio/tenants/${selectedTenantId}/apply-preset`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ preset_slug: slug }),
      });
      if (res.ok) {
        const data = await res.json();
        setResolved(data.resolved);
        setOverrideData(data.client_override || {});
        setIndustrySlug(data.industry_slug || slug);
        setNotice(`Applied '${slug}' industry preset.`);
      } else {
        setNotice(`Failed to apply '${slug}' preset (${res.status}).`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <div className="p-10 text-xs font-mono text-zinc-500">Loading Studio...</div>;
  }

  if (!user || user.role !== "platform_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-6 text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
          <h1 className="text-sm font-bold text-zinc-900">Restricted Route</h1>
          <p className="text-xs text-zinc-500">
            Platform Administrator credentials are required to access Customization Studio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">
            Hidden Admin Route &bull; 4-Layer Studio
          </span>
          <h1 className="text-xl font-bold text-zinc-950 mt-1">
            Industry &amp; Client Customization Studio
          </h1>
          <p className="text-xs text-zinc-500">
            Resolution: Client Override &rarr; Industry Preset &rarr; Plan Limits &rarr; Platform Default
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setOverrideData({});
              loadTenantStudio(selectedTenantId);
            }}
            className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "Saving..." : "Save Studio Config"}</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Tenant + Industry Preset Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-zinc-200 rounded-2xl p-4">
        <div>
          <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
            Target Client (Tenant)
          </label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
            Apply Industry Preset (Layer 2)
          </label>
          <div className="flex gap-2">
            <select
              value={industrySlug}
              onChange={(e) => setIndustrySlug(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono bg-white"
            >
              <option value="">-- Select Industry Preset --</option>
              {Object.entries(presets).map(([slug, p]) => (
                <option key={slug} value={slug}>
                  {p.label || slug}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleApplyPreset(industrySlug)}
              disabled={!industrySlug || saving}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "terminology", label: "Terminology & Names" },
          { id: "pages", label: "Pages & Sidebar Labels" },
          { id: "theme", label: "Brand & Theme Tokens" },
          { id: "voice", label: "Voice AI Defaults" },
          { id: "plan", label: "Plan Overrides" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as StudioTab)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === tab.id
                ? "bg-zinc-900 text-white"
                : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {resolved && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
          {activeTab === "terminology" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(resolved.terminology || {}).map(([key, val]) => (
                <div key={key}>
                  <label className="block text-[11px] font-mono text-zinc-500 mb-1">{key}</label>
                  <input
                    type="text"
                    value={String(val ?? "")}
                    onChange={(e) => setNestedOverride("terminology", key, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === "pages" && (
            <div className="space-y-3">
              {Object.entries(resolved.nav_labels || {}).map(([slug, label]) => {
                const enabled = resolved.enabled_pages?.[slug] !== false;
                return (
                  <div
                    key={slug}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200/70"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) =>
                          setNestedOverride("enabled_pages", slug, e.target.checked)
                        }
                        className="rounded"
                      />
                      <span className="text-xs font-mono font-semibold text-zinc-700 w-28">
                        /portal/{slug}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={String(label ?? "")}
                      onChange={(e) => setNestedOverride("nav_labels", slug, e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs bg-white"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "theme" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(resolved.theme || {}).map(([key, val]) => (
                <div key={key}>
                  <label className="block text-[11px] font-mono text-zinc-500 mb-1">{key}</label>
                  <input
                    type="text"
                    value={String(val ?? "")}
                    onChange={(e) => setNestedOverride("theme", key, e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === "voice" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 mb-1">tone</label>
                <input
                  type="text"
                  value={resolved.voice_defaults?.tone || ""}
                  onChange={(e) => setNestedOverride("voice_defaults", "tone", e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 mb-1">
                  greeting_template
                </label>
                <input
                  type="text"
                  value={resolved.voice_defaults?.greeting_template || ""}
                  onChange={(e) =>
                    setNestedOverride("voice_defaults", "greeting_template", e.target.value)
                  }
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 mb-1">
                  custom_system_instructions
                </label>
                <textarea
                  rows={4}
                  value={resolved.voice_defaults?.custom_system_instructions || ""}
                  onChange={(e) =>
                    setNestedOverride(
                      "voice_defaults",
                      "custom_system_instructions",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {activeTab === "plan" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(resolved.plan_overrides || {}).map(([key, val]) => (
                <div key={key}>
                  <label className="block text-[11px] font-mono text-zinc-500 mb-1">{key}</label>
                  <input
                    type="text"
                    value={val === null || val === undefined ? "" : String(val)}
                    placeholder="Inherit from Plan"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const parsed =
                        raw === ""
                          ? null
                          : raw === "true"
                          ? true
                          : raw === "false"
                          ? false
                          : !Number.isNaN(Number(raw)) && key !== "custom_pricing_label"
                          ? Number(raw)
                          : raw;
                      setNestedOverride("plan_overrides", key, parsed);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
