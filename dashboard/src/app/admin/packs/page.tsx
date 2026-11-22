"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  AdminIndustryPackDetail,
  AdminIndustryPackVersionItem,
  TenantSummary,
} from "@/lib/api";
import {
  Boxes,
  Sparkles,
  Plus,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Layers,
  FileCode,
  Tag,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sliders,
  Send,
  X,
  Building2,
  Users,
  Check,
  ArrowUpRight,
  Eye,
  HelpCircle,
} from "lucide-react";

export default function AdminIndustryPacksPage() {
  const [packs, setPacks] = useState<AdminIndustryPackDetail[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"catalog" | "versions" | "tenants">("catalog");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modals
  const [showCreatePackModal, setShowCreatePackModal] = useState<boolean>(false);
  const [showPublishVersionModal, setShowPublishVersionModal] = useState<boolean>(false);
  const [showAssignTenantModal, setShowAssignTenantModal] = useState<{
    tenantId: string;
    tenantName: string;
    currentPackSlug?: string | null;
    currentPackVersion?: string | null;
  } | null>(null);

  // Form states: Create Pack
  const [createSlug, setCreateSlug] = useState<string>("");
  const [createName, setCreateName] = useState<string>("");
  const [createDescription, setCreateDescription] = useState<string>("");
  const [createCategory, setCreateCategory] = useState<string>("commercial");
  const [createIcon, setCreateIcon] = useState<string>("Briefcase");
  const [createInitialVersion, setCreateInitialVersion] = useState<string>("1.0.0");
  const [createPromptBase, setCreatePromptBase] = useState<string>(
    "You are the autonomous AI receptionist for {{business_name}}. You specialize in {{specialties}}."
  );
  const [createEmergencyKeywords, setCreateEmergencyKeywords] = useState<string>(
    "burst pipe, flooding, gas smell, urgent"
  );
  const [createSafetyAdvice, setCreateSafetyAdvice] = useState<string>(
    "Please locate your main shutoff valve immediately if safe to do so."
  );
  const [createRequiresHipaa, setCreateRequiresHipaa] = useState<boolean>(false);
  const [creatingPack, setCreatingPack] = useState<boolean>(false);

  // Form states: Publish Version
  const [publishSemver, setPublishSemver] = useState<string>("");
  const [publishPromptBase, setPublishPromptBase] = useState<string>("");
  const [publishEmergencyKeywords, setPublishEmergencyKeywords] = useState<string>("");
  const [publishSafetyAdvice, setPublishSafetyAdvice] = useState<string>("");
  const [publishRequiresHipaa, setPublishRequiresHipaa] = useState<boolean>(false);
  const [publishingVersion, setPublishingVersion] = useState<boolean>(false);

  // Form states: Assign/Upgrade Tenant Pack
  const [assignPackSlug, setAssignPackSlug] = useState<string>("");
  const [assignVersionSemver, setAssignVersionSemver] = useState<string>("");
  const [assigningTenant, setAssigningTenant] = useState<boolean>(false);

  const loadData = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [packsData, tenantsData] = await Promise.all([
        api.listIndustryPacksAdmin(),
        api.getAdminTenants(),
      ]);

      setPacks(Array.isArray(packsData) ? packsData : []);
      setTenants(Array.isArray(tenantsData) ? tenantsData : []);

      if (packsData && packsData.length > 0 && !selectedPackId) {
        setSelectedPackId(packsData[0].id);
        if (packsData[0].versions.length > 0) {
          setSelectedVersionId(packsData[0].versions[0].id);
        }
      }
    } catch (err: unknown) {
      console.error("Failed to load admin industry packs data:", err);
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to load industry packs catalog.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedPack = packs.find((p) => p.id === selectedPackId) || packs[0] || null;
  const selectedVersion =
    selectedPack?.versions.find((v) => v.id === selectedVersionId) ||
    selectedPack?.versions[0] ||
    null;

  // Stats calculation
  const totalPacks = packs.length;
  const activePacks = packs.filter((p) => p.is_active).length;
  const totalVersions = packs.reduce((acc, p) => acc + (p.versions?.length || 0), 0);
  const totalDeployments = packs.reduce((acc, p) => acc + (p.total_tenants_applied || 0), 0);

  const handleTogglePackActive = async (pack: AdminIndustryPackDetail) => {
    try {
      await api.updateIndustryPackAdmin(pack.id, { is_active: !pack.is_active });
      setNotification({
        type: "success",
        message: `Industry pack '${pack.name}' is now ${!pack.is_active ? "active" : "inactive"}.`,
      });
      loadData(true);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to toggle pack status.",
      });
    }
  };

  const handleCreatePackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSlug.trim() || !createName.trim()) {
      setNotification({ type: "error", message: "Slug and Name are required." });
      return;
    }

    setCreatingPack(true);
    try {
      const keywords = createEmergencyKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      await api.createIndustryPackAdmin({
        slug: createSlug.trim().toLowerCase(),
        name: createName.trim(),
        description: createDescription.trim(),
        category: createCategory,
        icon: createIcon,
        is_active: true,
        initial_version_semver: createInitialVersion.trim() || "1.0.0",
        prompt_base: createPromptBase.trim(),
        emergency_rules: {
          keywords,
          safety_advice: createSafetyAdvice.trim(),
        },
        requires_hipaa_baa: createRequiresHipaa,
      });

      setNotification({
        type: "success",
        message: `Created industry pack '${createName}' (${createSlug}) with version ${createInitialVersion}.`,
      });

      setShowCreatePackModal(false);
      setCreateSlug("");
      setCreateName("");
      setCreateDescription("");
      loadData(true);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to create industry pack.",
      });
    } finally {
      setCreatingPack(false);
    }
  };

  const handleOpenPublishModal = (pack: AdminIndustryPackDetail) => {
    const latest = pack.versions[0];
    const latestSemver = latest?.version_semver || "1.0.0";
    const parts = latestSemver.split(".").map((n) => parseInt(n, 10));
    const nextSemver =
      parts.length === 3 && !isNaN(parts[1])
        ? `${parts[0]}.${parts[1] + 1}.0`
        : `${latestSemver}-next`;

    setPublishSemver(nextSemver);
    setPublishPromptBase(latest?.prompt_base || pack.description || "");
    setPublishEmergencyKeywords((latest?.emergency_rules?.keywords || []).join(", "));
    setPublishSafetyAdvice(latest?.emergency_rules?.safety_advice || "");
    setPublishRequiresHipaa(latest?.requires_hipaa_baa || false);
    setShowPublishVersionModal(true);
  };

  const handlePublishVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPack || !publishSemver.trim()) {
      setNotification({ type: "error", message: "Version SemVer is required." });
      return;
    }

    setPublishingVersion(true);
    try {
      const keywords = publishEmergencyKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      await api.publishPackVersionAdmin(selectedPack.id, {
        version_semver: publishSemver.trim(),
        prompt_base: publishPromptBase.trim(),
        emergency_rules: {
          keywords,
          safety_advice: publishSafetyAdvice.trim(),
        },
        requires_hipaa_baa: publishRequiresHipaa,
        status: "published",
      });

      setNotification({
        type: "success",
        message: `Published new immutable version ${publishSemver} for '${selectedPack.name}'.`,
      });

      setShowPublishVersionModal(false);
      loadData(true);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to publish version.",
      });
    } finally {
      setPublishingVersion(false);
    }
  };

  const handleAssignTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssignTenantModal || !assignPackSlug) {
      setNotification({ type: "error", message: "Please select an industry pack." });
      return;
    }

    setAssigningTenant(true);
    try {
      await api.assignTenantPackAdmin(showAssignTenantModal.tenantId, {
        pack_slug: assignPackSlug,
        version_semver: assignVersionSemver || undefined,
      });

      setNotification({
        type: "success",
        message: `Successfully applied pack '${assignPackSlug}' to tenant '${showAssignTenantModal.tenantName}'.`,
      });

      setShowAssignTenantModal(null);
      loadData(true);
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to assign pack to tenant.",
      });
    } finally {
      setAssigningTenant(false);
    }
  };

  const filteredPacks = packs.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner / Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs hover:opacity-75 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-rose-600 font-mono text-xs uppercase font-bold tracking-wider">
            <Boxes className="w-4 h-4" />
            Global Archetypes &amp; Blueprints
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Industry Packs &amp; Version Releases
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage pre-grounded prompt templates, emergency protocols, and immutable SemVer releases across client tenants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-2xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => setShowCreatePackModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Industry Pack
          </button>
        </div>
      </div>

      {/* Telemetry Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Total Pack Blueprints
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalPacks}</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            {activePacks} active for onboarding
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Immutable Releases
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalVersions}</div>
          <div className="text-[11px] text-slate-500 mt-1">SemVer tagged snapshots</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Tenant Deployments
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalDeployments}</div>
          <div className="text-[11px] text-slate-500 mt-1">Live client lines running packs</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
            HIPAA Safeguarded
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {packs.filter((p) => p.versions?.some((v) => v.requires_hipaa_baa)).length}
          </div>
          <div className="text-[11px] text-blue-600 font-medium mt-1">BAA strictly enforced</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === "catalog"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Boxes className="w-4 h-4" />
          Pack Catalog &amp; Blueprint Studio
        </button>

        <button
          onClick={() => setActiveTab("versions")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === "versions"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          Release Inspector &amp; SemVer Manager
        </button>

        <button
          onClick={() => setActiveTab("tenants")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
            activeTab === "tenants"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Building2 className="w-4 h-4" />
          Tenant Adoption &amp; Upgrades
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono">
            {tenants.length}
          </span>
        </button>
      </div>

      {/* ================= TAB 1: CATALOG ================= */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between bg-white p-3 rounded-2xl border border-slate-200">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search templates, slugs, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-slate-400 bg-slate-50/50"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                Category:
              </span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 font-medium"
              >
                <option value="all">All Categories</option>
                <option value="home_services">Home Services</option>
                <option value="medical_healthcare">Healthcare</option>
                <option value="professional_legal">Legal &amp; Professional</option>
                <option value="commercial">General Commercial</option>
              </select>
            </div>
          </div>

          {/* Catalog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPacks.map((pack) => {
              const isSelected = pack.id === selectedPackId;
              const latestVer = pack.versions[0];
              const requiresHipaa = latestVer?.requires_hipaa_baa;

              return (
                <div
                  key={pack.id}
                  onClick={() => {
                    setSelectedPackId(pack.id);
                    if (pack.versions.length > 0) {
                      setSelectedVersionId(pack.versions[0].id);
                    }
                  }}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer relative bg-white ${
                    isSelected
                      ? "border-slate-900 ring-2 ring-slate-900/10 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-2xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                          {pack.slug}
                        </span>
                        {requiresHipaa && (
                          <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            HIPAA
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            pack.is_active
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          {pack.is_active ? "Active Onboarding" : "Disabled"}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mt-1">{pack.name}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {pack.description || "No description provided."}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg">
                        v{pack.latest_version}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                        {pack.versions.length} release{pack.versions.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>

                  {/* Footer details & quick actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="text-slate-700">{pack.total_tenants_applied}</strong> client
                        line{pack.total_tenants_applied === 1 ? "" : "s"}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-slate-400 capitalize">{pack.category}</span>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleTogglePackActive(pack)}
                        className="text-[11px] font-medium text-slate-600 hover:text-slate-900 underline"
                      >
                        {pack.is_active ? "Disable" : "Enable"}
                      </button>

                      <button
                        onClick={() => {
                          setSelectedPackId(pack.id);
                          handleOpenPublishModal(pack);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        Release vNext
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 2: VERSIONS ================= */}
      {activeTab === "versions" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Version Snapshots List */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                  Release History
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {selectedPack ? selectedPack.name : "Select a Pack"}
                </div>
              </div>

              {selectedPack && (
                <button
                  onClick={() => handleOpenPublishModal(selectedPack)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-all"
                >
                  <Plus className="w-3 h-3" />
                  New Version
                </button>
              )}
            </div>

            <div className="space-y-2">
              {selectedPack?.versions.map((ver) => {
                const isCurrent = ver.id === selectedVersionId;
                return (
                  <div
                    key={ver.id}
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isCurrent
                        ? "border-rose-600 bg-rose-50/40 shadow-2xs"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-900">
                          v{ver.version_semver}
                        </span>
                        {ver.is_system_default && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
                            System
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(ver.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                      <span>{ver.tenant_adoption_count} active tenants</span>
                      <span className="font-mono text-emerald-600 font-semibold">{ver.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Version Blueprint Inspector */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            {selectedVersion ? (
              <>
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {selectedPack?.name} v{selectedVersion.version_semver}
                      </h2>
                      <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-semibold">
                        Immutable Snapshot
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Published on {new Date(selectedVersion.created_at).toLocaleString()} •{" "}
                      {selectedVersion.tenant_adoption_count} tenants running this release
                    </p>
                  </div>
                </div>

                {/* Prompt Base Blueprint */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-rose-600" />
                      Master Prompt Base (LiveKit System Prompt Template)
                    </label>
                  </div>
                  <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                    {selectedVersion.prompt_base}
                  </pre>
                </div>

                {/* Emergency Protocol Rules */}
                <div className="space-y-2 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                  <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    Autonomous Emergency Triage Protocol
                  </div>
                  <div className="text-xs text-slate-700">
                    <strong>Urgency Keywords:</strong>{" "}
                    {(selectedVersion.emergency_rules?.keywords || []).map((k: string) => (
                      <span
                        key={k}
                        className="inline-block bg-white text-rose-700 border border-rose-200 text-[10px] font-mono px-2 py-0.5 rounded mr-1.5 mt-1"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-700 mt-1">
                    <strong>Caller Safety Advice:</strong>{" "}
                    <span className="italic">
                      &quot;{selectedVersion.emergency_rules?.safety_advice || "No advice configured"}&quot;
                    </span>
                  </div>
                </div>

                {/* Schema & Intake Question Trees */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                      Appointment Menu ({selectedVersion.appointment_types?.length || 0})
                    </label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(selectedVersion.appointment_types || []).map((apt: any) => (
                        <div
                          key={apt.id || apt.title}
                          className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                        >
                          <span className="font-semibold text-slate-800">{apt.title}</span>
                          <span className="font-mono text-slate-500 text-[10px]">
                            {apt.fee ? apt.fee : `${apt.duration_minutes || 60}m`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                      Dynamic Intake Schema Fields
                    </label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(selectedVersion.intake_schema?.fields || []).map((f: any) => (
                        <div
                          key={f.key}
                          className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                        >
                          <span className="font-mono text-slate-800">{f.key}</span>
                          <span className="text-[10px] text-slate-500 capitalize">{f.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Select an industry pack version on the left to inspect its immutable prompt blueprint.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: TENANTS ================= */}
      {activeTab === "tenants" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden space-y-0">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tenant Industry Pack Deployments</h3>
              <p className="text-xs text-slate-500">
                Inspect which industry pack and SemVer release each business client is actively running.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              {tenants.length} Total Tenants
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase">
                <tr>
                  <th className="py-3 px-4">Client Business</th>
                  <th className="py-3 px-4">Applied Industry Pack</th>
                  <th className="py-3 px-4">Active Version</th>
                  <th className="py-3 px-4">Calls Triage</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => {
                  const appliedPack = packs.find((p) => p.slug === t.applied_pack_slug);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{t.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{t.id}</div>
                      </td>

                      <td className="py-3 px-4">
                        {t.applied_pack_slug ? (
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {t.applied_pack_slug}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None configured</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono">
                        {t.applied_pack_version ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
                            v{t.applied_pack_version}
                          </span>
                        ) : (
                          <span className="text-slate-400">1.0.0 (default)</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{t.call_count} calls</div>
                        <div className="text-[10px] text-slate-400">
                          {t.emergency_count} emergencies
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setShowAssignTenantModal({
                              tenantId: t.id,
                              tenantName: t.name,
                              currentPackSlug: t.applied_pack_slug,
                              currentPackVersion: t.applied_pack_version,
                            });
                            setAssignPackSlug(t.applied_pack_slug || "home_services");
                            setAssignVersionSemver(t.applied_pack_version || "1.0.0");
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                        >
                          Change / Upgrade Pack
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE PACK ================= */}
      {showCreatePackModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create New Industry Pack</h3>
                <p className="text-xs text-slate-500">
                  Define a new archetype template and release version 1.0.0.
                </p>
              </div>
              <button
                onClick={() => setShowCreatePackModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePackSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">
                    Pack Slug (Unique Identifier) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. veterinary_care"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:border-slate-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">
                    Initial SemVer *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="1.0.0"
                    value={createInitialVersion}
                    onChange={(e) => setCreateInitialVersion(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:border-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Veterinary Hospital & Clinic"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-slate-400 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">Description</label>
                <textarea
                  rows={2}
                  placeholder="Summary for onboarding and tenant catalog..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">Category</label>
                  <select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="commercial">General Commercial</option>
                    <option value="home_services">Home Services</option>
                    <option value="medical_healthcare">Medical &amp; Healthcare</option>
                    <option value="professional_legal">Professional Legal</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">HIPAA Protection</label>
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hipaa_check"
                      checked={createRequiresHipaa}
                      onChange={(e) => setCreateRequiresHipaa(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <label htmlFor="hipaa_check" className="text-slate-700 cursor-pointer">
                      Requires signed BAA
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">
                  Master Prompt Base Blueprint *
                </label>
                <textarea
                  rows={4}
                  required
                  value={createPromptBase}
                  onChange={(e) => setCreatePromptBase(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:border-slate-400 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">
                    Emergency Keywords (comma-sep)
                  </label>
                  <input
                    type="text"
                    value={createEmergencyKeywords}
                    onChange={(e) => setCreateEmergencyKeywords(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">
                    Caller Safety Script
                  </label>
                  <input
                    type="text"
                    value={createSafetyAdvice}
                    onChange={(e) => setCreateSafetyAdvice(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePackModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPack}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {creatingPack ? "Creating Pack..." : "Create & Publish v1.0.0"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: PUBLISH NEW VERSION ================= */}
      {showPublishVersionModal && selectedPack && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Release New Version for {selectedPack.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Pack slug: {selectedPack.slug} • Latest release: v{selectedPack.latest_version}
                </p>
              </div>
              <button
                onClick={() => setShowPublishVersionModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublishVersionSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">
                    New SemVer Tag *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1.1.0"
                    value={publishSemver}
                    onChange={(e) => setPublishSemver(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:border-slate-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 font-mono uppercase">HIPAA Required</label>
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="publish_hipaa"
                      checked={publishRequiresHipaa}
                      onChange={(e) => setPublishRequiresHipaa(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <label htmlFor="publish_hipaa" className="text-slate-700 cursor-pointer">
                      Enforce HIPAA BAA
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">
                  Prompt Base Blueprint *
                </label>
                <textarea
                  rows={5}
                  required
                  value={publishPromptBase}
                  onChange={(e) => setPublishPromptBase(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:border-slate-400 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">
                  Emergency Keywords (comma-sep)
                </label>
                <input
                  type="text"
                  value={publishEmergencyKeywords}
                  onChange={(e) => setPublishEmergencyKeywords(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">
                  Caller Safety Script
                </label>
                <input
                  type="text"
                  value={publishSafetyAdvice}
                  onChange={(e) => setPublishSafetyAdvice(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPublishVersionModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={publishingVersion}
                  className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 disabled:opacity-50"
                >
                  {publishingVersion ? "Publishing..." : `Publish v${publishSemver || "..."}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ASSIGN / UPGRADE TENANT PACK ================= */}
      {showAssignTenantModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assign / Upgrade Pack</h3>
                <p className="text-xs text-slate-500">
                  Target client: <strong>{showAssignTenantModal.tenantName}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowAssignTenantModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignTenantSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">
                  Select Industry Pack Template *
                </label>
                <select
                  value={assignPackSlug}
                  onChange={(e) => {
                    const slug = e.target.value;
                    setAssignPackSlug(slug);
                    const p = packs.find((item) => item.slug === slug);
                    if (p && p.versions.length > 0) {
                      setAssignVersionSemver(p.versions[0].version_semver);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-medium"
                >
                  {packs.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 font-mono uppercase">
                  Target SemVer Version
                </label>
                <select
                  value={assignVersionSemver}
                  onChange={(e) => setAssignVersionSemver(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-mono"
                >
                  {packs
                    .find((p) => p.slug === assignPackSlug)
                    ?.versions.map((v) => (
                      <option key={v.version_semver} value={v.version_semver}>
                        v{v.version_semver} ({v.status})
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssignTenantModal(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigningTenant}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50"
                >
                  {assigningTenant ? "Applying..." : "Apply Pack to Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
