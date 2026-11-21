"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  AgencyAuditLog,
} from "@/lib/api";
import {
  History,
  RefreshCw,
  Search,
  X,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

export default function AdminAuditPage() {
  const [auditLogs, setAuditLogs] = useState<AgencyAuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditImpersonatedOnly, setAuditImpersonatedOnly] = useState<boolean>(false);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AgencyAuditLog | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getAgencyAuditLogs({
        action: auditActionFilter || undefined,
        is_impersonated: auditImpersonatedOnly || undefined,
        limit: 50,
      });
      setAuditLogs(res.items || []);
      setAuditTotal(res.total || 0);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [auditActionFilter, auditImpersonatedOnly]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-mono font-bold mb-1">
            <Lock className="w-3.5 h-3.5 text-purple-600" />
            Cryptographically Anchored Ledger
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Immutable Agency Audit Trail
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cryptographically anchored event log recording all operator impersonation sessions, supervisor actions, and tenant changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            Total Events: <strong>{auditTotal}</strong>
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={auditActionFilter}
            onChange={(e) => {
              setAuditActionFilter(e.target.value);
              setAuditPage(1);
            }}
            className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-600"
          >
            <option value="">All Actions</option>
            <option value="auth.impersonate_start">auth.impersonate_start</option>
            <option value="auth.impersonate_end">auth.impersonate_end</option>
            <option value="call.qa_override">call.qa_override</option>
            <option value="supervisor.whisper">supervisor.whisper</option>
            <option value="supervisor.barge_in">supervisor.barge_in</option>
            <option value="supervisor.takeover">supervisor.takeover</option>
            <option value="supervisor.transfer">supervisor.transfer</option>
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
            <input
              type="checkbox"
              checked={auditImpersonatedOnly}
              onChange={(e) => {
                setAuditImpersonatedOnly(e.target.checked);
                setAuditPage(1);
              }}
              className="rounded text-purple-600"
            />
            <span>Impersonated Sessions Only</span>
          </label>
        </div>

        <button
          type="button"
          onClick={loadAuditLogs}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-colors shadow-2xs"
          title="Refresh Audit Logs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[11px] uppercase">
            <tr>
              <th className="p-3">Timestamp (UTC)</th>
              <th className="p-3">Action</th>
              <th className="p-3">Actor &amp; Impersonator</th>
              <th className="p-3">Target Tenant</th>
              <th className="p-3">Resource</th>
              <th className="p-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400 font-mono text-xs">
                  {loading ? "Loading audit events..." : "No audit events matching criteria."}
                </td>
              </tr>
            ) : (
              auditLogs
                .slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize)
                .map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      log.action.includes("impersonate")
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : log.action.includes("qa")
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : log.action.includes("supervisor")
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-slate-100 text-slate-800 border-slate-200"
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{log.actor_email}</div>
                    {log.is_impersonated && (
                      <div className="text-[10px] text-amber-600 font-mono flex items-center gap-1">
                        <span>Proxy by: {log.impersonator_email || log.impersonator_id}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-600">
                    {log.tenant_id ? log.tenant_id.slice(0, 12) + "..." : "Global Platform"}
                  </td>
                  <td className="p-3 font-mono text-[11px] text-slate-500">
                    {log.resource_type} {log.resource_id ? `(${log.resource_id.slice(0, 8)}...)` : ""}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedAuditLog(log)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs"
                    >
                      View JSON
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {auditLogs.length > 5 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
            <PaginationBar
              currentPage={auditPage}
              totalItems={auditLogs.length}
              pageSize={auditPageSize}
              onPageChange={setAuditPage}
              onPageSizeChange={setAuditPageSize}
              pageSizeOptions={[5, 10, 25]}
            />
          </div>
        )}
      </div>

      {/* Audit Log JSON Details Modal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-mono">
                  {selectedAuditLog.action}
                </h3>
                <div className="text-xs text-slate-500">ID: {selectedAuditLog.id}</div>
              </div>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-2xl font-mono text-[11px] border border-slate-200">
                <div>
                  <span className="text-slate-400">Actor:</span> {selectedAuditLog.actor_email}
                </div>
                <div>
                  <span className="text-slate-400">Role:</span> {selectedAuditLog.actor_role}
                </div>
                <div>
                  <span className="text-slate-400">Impersonated:</span> {selectedAuditLog.is_impersonated ? "YES" : "NO"}
                </div>
                <div>
                  <span className="text-slate-400">Impersonator:</span> {selectedAuditLog.impersonator_email || "N/A"}
                </div>
                <div>
                  <span className="text-slate-400">Tenant:</span> {selectedAuditLog.tenant_id || "Global"}
                </div>
                <div>
                  <span className="text-slate-400">Time:</span> {new Date(selectedAuditLog.created_at).toISOString()}
                </div>
              </div>

              <div>
                <div className="font-semibold text-slate-700 mb-1">Payload Details:</div>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-2xl overflow-x-auto">
                  {JSON.stringify(selectedAuditLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-700 shadow-2xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
