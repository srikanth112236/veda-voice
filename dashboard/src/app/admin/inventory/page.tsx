"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  PhoneNumberRecord,
  SipTrunkTelemetry,
  TenantSummary,
  TelnyxNumberItem,
} from "@/lib/api";
import {
  Phone,
  RefreshCw,
  Zap,
  Plus,
  CheckCircle2,
  Link2,
  Unlink,
  X,
  Search,
  Eye,
  EyeOff,
  PhoneCall,
  Activity,
  Layers,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

export default function AdminInventoryPage() {
  const [numbers, setNumbers] = useState<PhoneNumberRecord[]>([]);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [trunkTelemetry, setTrunkTelemetry] = useState<SipTrunkTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [maskPii, setMaskPii] = useState(true);

  // Filters & Pagination
  const [numberFilter, setNumberFilter] = useState<"all" | "active" | "pool">("all");
  const [phonePage, setPhonePage] = useState(1);
  const [phonePageSize, setPhonePageSize] = useState(10);

  // Trunk Sync State
  const [syncingTrunk, setSyncingTrunk] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState<PhoneNumberRecord | null>(null);
  const [targetTenantId, setTargetTenantId] = useState<string>("");
  const [provisioningNumber, setProvisioningNumber] = useState(false);
  const [newProvisionData, setNewProvisionData] = useState({
    e164: "+15125550199",
    provider: "Twilio Elastic SIP",
    locality: "Austin Metro",
    region: "TX",
    target_tenant_id: "",
  });

  // Telnyx 1-Click DID Ordering
  const [showTelnyxModal, setShowTelnyxModal] = useState(false);
  const [telnyxAreaCode, setTelnyxAreaCode] = useState("415");
  const [telnyxLocality, setTelnyxLocality] = useState("");
  const [telnyxTargetTenantId, setTelnyxTargetTenantId] = useState("");
  const [searchingTelnyx, setSearchingTelnyx] = useState(false);
  const [telnyxSearchResults, setTelnyxSearchResults] = useState<TelnyxNumberItem[]>([]);
  const [orderingTelnyxNumber, setOrderingTelnyxNumber] = useState<string | null>(null);
  const [telnyxSuccessMsg, setTelnyxSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nums, tnts, trunk] = await Promise.all([
        api.getNumbers().catch(() => []),
        api.getAdminTenants().catch(() => []),
        api.getSipTrunkTelemetry().catch(() => null),
      ]);
      setNumbers(Array.isArray(nums) ? nums : []);
      setTenants(Array.isArray(tnts) ? tnts : []);
      setTrunkTelemetry(trunk);
    } catch (err) {
      console.error("Failed to load inventory:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const maskPhoneNumber = (num: string) => {
    if (!num) return "";
    if (!maskPii) return num;
    if (num.length > 7) {
      return num.slice(0, num.length - 4).replace(/\d/g, "*") + num.slice(-4);
    }
    return num;
  };

  const handleSyncTrunkDispatch = async () => {
    setSyncingTrunk(true);
    setSyncSuccessMsg(null);
    try {
      const res = await api.syncSipTrunkDispatchRules();
      const updatedTrunk = await api.getSipTrunkTelemetry();
      setTrunkTelemetry(updatedTrunk);
      setSyncSuccessMsg(res.message || "Synchronized all active carrier numbers to LiveKit inbound dispatch rules.");
      setTimeout(() => setSyncSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(`Sync failed: ${err.message || err}`);
    } finally {
      setSyncingTrunk(false);
    }
  };

  const handleSearchTelnyxNumbers = async () => {
    setSearchingTelnyx(true);
    setTelnyxSuccessMsg(null);
    try {
      const results = await api.searchTelnyxNumbers(telnyxAreaCode, telnyxLocality);
      setTelnyxSearchResults(results);
    } catch (err: any) {
      alert(`Failed to search Telnyx numbers: ${err.message || err}`);
    } finally {
      setSearchingTelnyx(false);
    }
  };

  const handleOrderTelnyxNumber = async (numItem: TelnyxNumberItem) => {
    setOrderingTelnyxNumber(numItem.phone_number);
    setTelnyxSuccessMsg(null);
    try {
      const res = await api.orderTelnyxNumber({
        phone_number: numItem.phone_number,
        tenant_id: telnyxTargetTenantId || undefined,
        locality: numItem.locality,
        region: numItem.region_information,
      });
      setTelnyxSuccessMsg(`Successfully ordered ${res.formatted || res.e164} on Telnyx and bound to SIP trunk.`);
      await loadData();
    } catch (err: any) {
      alert(`Failed to order Telnyx number: ${err.message || err}`);
    } finally {
      setOrderingTelnyxNumber(null);
    }
  };

  const handleAttachNumber = async () => {
    if (!showAttachModal || !targetTenantId) return;
    try {
      await api.attachNumber(showAttachModal.id, { tenant_id: targetTenantId });
      setShowAttachModal(null);
      await loadData();
    } catch (err: any) {
      alert(`Failed to attach phone number: ${err.message || err}`);
    }
  };

  const handleDetachNumber = async (numberId: string) => {
    if (!confirm("Are you sure you want to detach this phone number from the tenant? Inbound calls will return to the unassigned agency pool.")) {
      return;
    }
    try {
      await api.detachNumber(numberId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to detach phone number: ${err.message || err}`);
    }
  };

  const handleCreateCarrierNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioningNumber(true);
    try {
      await api.orderTelnyxNumber({
        phone_number: newProvisionData.e164,
        tenant_id: newProvisionData.target_tenant_id || undefined,
        locality: newProvisionData.locality,
        region: newProvisionData.region,
      });
      setShowProvisionModal(false);
      await loadData();
    } catch (err: any) {
      alert(`Failed to provision carrier number: ${err.message || err}`);
    } finally {
      setProvisioningNumber(false);
    }
  };

  const filteredNumbers = numbers.filter((n) => numberFilter === "all" || n.status === numberFilter);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-mono font-bold mb-1">
            <Phone className="w-3.5 h-3.5 text-indigo-600" />
            LiveKit SIP Trunk Orchestrator
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Inbound Phone Number Inventory &amp; SIP Trunks
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            1-Click Telnyx DID provisioning, inbound dispatch rules, and agency phone number inventory pool.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMaskPii(!maskPii)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs text-slate-700 font-mono flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            {maskPii ? (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Reveal Numbers</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Mask PII</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSyncTrunkDispatch}
            disabled={syncingTrunk}
            className="px-3.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingTrunk ? "animate-spin" : ""}`} />
            <span>{syncingTrunk ? "Syncing..." : "Sync Trunk Dispatch"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowTelnyxModal(true);
              if (telnyxSearchResults.length === 0) handleSearchTelnyxNumbers();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>1-Click Order Telnyx DID ($1/mo)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowProvisionModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Manual Add</span>
          </button>
        </div>
      </div>

      {/* SIP Trunk Telemetry Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-xs shadow-xs">
        <div>
          <span className="text-[10px] uppercase text-slate-400 font-bold">Inbound SIP Trunk ID</span>
          <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">
            {trunkTelemetry?.inbound_trunk_id || "ST_inbound_livekit_scale"}
          </div>
        </div>
        <div>
          <span className="text-[10px] uppercase text-slate-400 font-bold">Outbound SIP Trunk ID</span>
          <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">
            {trunkTelemetry?.outbound_trunk_id || "ST_outbound_twilio_elastic"}
          </div>
        </div>
        <div>
          <span className="text-[10px] uppercase text-slate-400 font-bold">Dispatch Rule &amp; Agent</span>
          <div className="text-xs font-bold text-emerald-600 mt-0.5">
            all-tenants-inbound &rarr; receptionist
          </div>
        </div>
        <div>
          <span className="text-[10px] uppercase text-slate-400 font-bold">Inventory Allocation</span>
          <div className="text-xs font-bold text-slate-800 mt-0.5">
            <span className="text-emerald-600">{numbers.filter((n) => n.status === "active").length} Assigned</span> •{" "}
            <span className="text-indigo-600">{numbers.filter((n) => n.status === "pool").length} In Pool</span>
          </div>
        </div>
      </div>

      {syncSuccessMsg && (
        <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{syncSuccessMsg}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
        {[
          { id: "all", label: `All Numbers (${numbers.length})` },
          { id: "active", label: `Active Tenant Lines (${numbers.filter((n) => n.status === "active").length})` },
          { id: "pool", label: `Agency Pool Inventory (${numbers.filter((n) => n.status === "pool").length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setNumberFilter(tab.id as any);
              setPhonePage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors ${
              numberFilter === tab.id
                ? "bg-purple-600 text-white shadow-2xs font-bold"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Numbers Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 font-mono text-[10px] uppercase text-slate-500 font-semibold">
            <tr>
              <th className="p-3">Phone Number (E.164)</th>
              <th className="p-3">Assigned Tenant / Pool</th>
              <th className="p-3">Carrier Provider</th>
              <th className="p-3">Locality / Region</th>
              <th className="p-3">Trunk Binding</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredNumbers
              .slice((phonePage - 1) * phonePageSize, phonePage * phonePageSize)
              .map((num) => {
              const isPool = num.status === "pool";
              return (
                <tr key={num.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3">
                    <div className="font-mono font-bold text-slate-900">
                      {maskPhoneNumber(num.formatted || num.e164)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans">{num.label}</div>
                  </td>

                  <td className="p-3">
                    {num.tenant_id ? (
                      <div className="font-semibold text-slate-800">
                        {num.tenant_name || "Assigned Client"}
                      </div>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Agency Pre-Bought Pool
                      </span>
                    )}
                  </td>

                  <td className="p-3 font-mono text-slate-600">
                    <span className="text-[11px] font-semibold text-slate-800 capitalize">
                      {num.provider}
                    </span>
                    <div className="text-[9px] text-slate-400">STIR/SHAKEN A</div>
                  </td>

                  <td className="p-3 text-slate-600">
                    {num.locality ? `${num.locality}, ${num.region}` : num.region}
                  </td>

                  <td className="p-3 font-mono text-[11px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {num.trunk_id || "ST_inbound_livekit_scale"}
                    </span>
                  </td>

                  <td className="p-3">
                    {isPool ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Available in Pool
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active Tenant Line
                      </span>
                    )}
                  </td>

                  <td className="p-3 text-right">
                    {isPool ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachModal(num);
                          setTargetTenantId(tenants[0]?.id || "");
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-sans transition-colors shadow-2xs"
                      >
                        <Link2 className="w-3 h-3" />
                        Attach to Tenant
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDetachNumber(num.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-sans transition-colors shadow-2xs"
                      >
                        <Unlink className="w-3 h-3" />
                        Detach to Pool
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredNumbers.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 font-mono text-xs">
                  {loading ? "Loading phone numbers..." : "No phone numbers found in this view."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filteredNumbers.length > 5 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <PaginationBar
              currentPage={phonePage}
              totalItems={filteredNumbers.length}
              pageSize={phonePageSize}
              onPageChange={setPhonePage}
              onPageSizeChange={setPhonePageSize}
              pageSizeOptions={[5, 10, 25]}
            />
          </div>
        )}
      </div>

      {/* Telnyx 1-Click DID Ordering Modal */}
      {showTelnyxModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-xl w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Zap className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Telnyx 1-Click Carrier DID Ordering ($1/mo)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Instant SIP trunk dispatch rule attachment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTelnyxModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {telnyxSuccessMsg && (
              <div className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2 font-mono">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{telnyxSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 font-mono block mb-1">
                  Area Code
                </label>
                <input
                  type="text"
                  maxLength={3}
                  value={telnyxAreaCode}
                  onChange={(e) => setTelnyxAreaCode(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="415"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 font-mono block mb-1">
                  Locality (Optional)
                </label>
                <input
                  type="text"
                  value={telnyxLocality}
                  onChange={(e) => setTelnyxLocality(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="San Francisco"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={searchingTelnyx}
                  onClick={handleSearchTelnyxNumbers}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs"
                >
                  {searchingTelnyx ? "Searching..." : "Search DIDs"}
                </button>
              </div>
            </div>

            {/* Target Tenant Organization selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Assign Directly To Tenant:</label>
              <select
                value={telnyxTargetTenantId}
                onChange={(e) => setTelnyxTargetTenantId(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="">(Hold in Unassigned Agency Pool)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (ID: {t.id ? t.id.slice(0, 8) + "..." : "N/A"})
                  </option>
                ))}
              </select>
            </div>

            {/* Available DIDs list */}
            <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {telnyxSearchResults.map((num) => (
                <div key={num.phone_number} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="font-mono font-bold text-xs text-slate-900">
                      {num.phone_number}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {num.locality}, {num.region_information} • ${num.cost_monthly_usd.toFixed(2)}/mo
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={orderingTelnyxNumber === num.phone_number}
                    onClick={() => handleOrderTelnyxNumber(num)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs transition-colors"
                  >
                    {orderingTelnyxNumber === num.phone_number ? "Ordering & Binding..." : "Buy & Bind ($1/mo)"}
                  </button>
                </div>
              ))}
              {telnyxSearchResults.length === 0 && (
                <div className="p-6 text-center text-slate-400 font-mono text-xs">
                  {searchingTelnyx ? "Querying Telnyx Inventory..." : "Enter area code and click Search DIDs."}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTelnyxModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Number Modal */}
      {showAttachModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="font-extrabold text-sm text-slate-900">Attach Number to Tenant</h3>
            <p className="text-xs text-slate-500 font-mono">
              Number: {showAttachModal.formatted || showAttachModal.e164}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Select Client Tenant:</label>
              <select
                value={targetTenantId}
                onChange={(e) => setTargetTenantId(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-600"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAttachModal(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAttachNumber}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs"
              >
                Confirm Attachment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Provision Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateCarrierNumber} className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-sm text-slate-900">Provision Carrier Number</h3>
              <button
                type="button"
                onClick={() => setShowProvisionModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">E.164 Phone Number</label>
                <input
                  type="text"
                  required
                  value={newProvisionData.e164}
                  onChange={(e) => setNewProvisionData({ ...newProvisionData, e164: e.target.value })}
                  placeholder="+15125550199"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Locality</label>
                  <input
                    type="text"
                    value={newProvisionData.locality}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, locality: e.target.value })}
                    placeholder="Austin"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Region / State</label>
                  <input
                    type="text"
                    value={newProvisionData.region}
                    onChange={(e) => setNewProvisionData({ ...newProvisionData, region: e.target.value })}
                    placeholder="TX"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Carrier Provider</label>
                <input
                  type="text"
                  value={newProvisionData.provider}
                  onChange={(e) => setNewProvisionData({ ...newProvisionData, provider: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Assign To Tenant (Optional)</label>
                <select
                  value={newProvisionData.target_tenant_id}
                  onChange={(e) => setNewProvisionData({ ...newProvisionData, target_tenant_id: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                  <option value="">Hold in Agency Inventory Pool</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowProvisionModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={provisioningNumber}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-2xs"
              >
                {provisioningNumber ? "Saving..." : "Save Carrier Line"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
