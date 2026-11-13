"use client";

import React, { useEffect, useState } from "react";
import { api, CallListItem, CallDetail } from "@/lib/api";
import {
  PhoneCall,
  Search,
  Filter,
  X,
  User,
  MapPin,
  Calendar,
  Zap,
  Activity,
  CheckCircle2,
} from "lucide-react";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [detailCall, setDetailCall] = useState<CallDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getPortalCalls({ urgency: filterUrgency || undefined, limit: 100 })
      .then((res) => setCalls(res))
      .catch((err) => console.error("Failed to load calls:", err))
      .finally(() => setLoading(false));
  }, [filterUrgency]);

  const handleSelectCall = (id: string) => {
    setSelectedCallId(id);
    setLoadingDetail(true);
    api
      .getPortalCallDetail(id)
      .then((res) => setDetailCall(res))
      .catch((err) => console.error("Failed to load detail:", err))
      .finally(() => setLoadingDetail(false));
  };

  const filteredCalls = calls.filter((c) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = c.caller_name?.toLowerCase().includes(q) ?? false;
    const phoneMatch = c.caller_number?.toLowerCase().includes(q) ?? false;
    const addrMatch = c.service_address?.toLowerCase().includes(q) ?? false;
    const idMatch = c.call_id?.toLowerCase().includes(q) ?? false;
    return !q || nameMatch || phoneMatch || addrMatch || idMatch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-400" />
            Telephony Call Explorer
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Complete audit trail of all inbound calls, turn transcripts, caller verification, and latencies.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by caller, phone, address..."
              className="pl-9 pr-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 w-56 sm:w-64 font-mono"
            />
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs">
            <button
              onClick={() => setFilterUrgency("")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filterUrgency === ""
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterUrgency("emergency")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filterUrgency === "emergency"
                  ? "bg-red-500/20 text-red-400 font-bold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Emergencies
            </button>
            <button
              onClick={() => setFilterUrgency("urgent")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filterUrgency === "urgent"
                  ? "bg-amber-500/20 text-amber-400 font-bold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Urgent
            </button>
          </div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
            <tr>
              <th className="p-3 w-32">Urgency</th>
              <th className="p-3">Caller Name</th>
              <th className="p-3">Callback Number</th>
              <th className="p-3">Service Address</th>
              <th className="p-3">Duration &amp; Turns</th>
              <th className="p-3">P50 Latency</th>
              <th className="p-3 text-right">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  Loading call records...
                </td>
              </tr>
            ) : filteredCalls.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">
                  No calls matching your criteria.
                </td>
              </tr>
            ) : (
              filteredCalls.map((call) => (
                <tr
                  key={call.id}
                  onClick={() => handleSelectCall(call.id)}
                  className={`cursor-pointer hover:bg-zinc-800/40 transition-colors ${
                    selectedCallId === call.id ? "bg-zinc-800/60" : ""
                  }`}
                >
                  <td className="p-3">
                    {call.urgency === "emergency" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                        🚨 Emergency
                      </span>
                    ) : call.urgency === "urgent" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        ⚠️ Urgent
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] text-zinc-400 bg-zinc-800/60 border border-zinc-700/40">
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-sans font-medium text-zinc-200">
                    {call.caller_name || "Unknown Caller"}
                  </td>
                  <td className="p-3 text-zinc-300">
                    {call.caller_number || "Unavailable"}
                  </td>
                  <td className="p-3 text-zinc-400 font-sans truncate max-w-xs">
                    {call.service_address || "None specified"}
                  </td>
                  <td className="p-3 text-zinc-400">
                    {Math.floor(call.duration_s / 60)}m {Math.floor(call.duration_s % 60)}s ({call.turn_count} turns)
                  </td>
                  <td className="p-3 text-zinc-300 font-bold">
                    {call.latency_p50_ms ? `${call.latency_p50_ms}ms` : "—"}
                  </td>
                  <td className="p-3 text-right text-zinc-500 font-sans text-[11px]">
                    {new Date(call.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-out Call Detail Drawer */}
      {selectedCallId && (
        <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-zinc-900 border-l border-zinc-800 shadow-2xl p-6 z-50 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Call Inspection Drawer
              </span>
              <h2 className="text-base font-bold text-zinc-100 font-mono">
                {detailCall?.call_id || "Loading..."}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCallId(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loadingDetail || !detailCall ? (
            <div className="text-xs font-mono text-zinc-500 p-8 text-center">
              Fetching full transcript and telemetry...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Telemetry Row */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 block">Duration</span>
                  <span className="font-bold text-zinc-200">{detailCall.duration_s}s</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">P50 Latency</span>
                  <span className="font-bold text-zinc-200">{detailCall.latency_p50_ms}ms</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 block">P95 Latency</span>
                  <span className="font-bold text-amber-400">{detailCall.latency_p95_ms}ms</span>
                </div>
              </div>

              {/* Extracted Message Card */}
              {detailCall.message && (
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Extracted Caller Request
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                      {detailCall.message.urgency || "normal"}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 text-zinc-300 font-sans">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{detailCall.message.name}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <PhoneCall className="w-3.5 h-3.5 text-zinc-500" />
                      <a href={`tel:${detailCall.message.phone}`} className="text-blue-400 hover:underline">
                        {detailCall.message.phone}
                      </a>
                      {detailCall.message.phone_confirmed && (
                        <span className="text-[10px] text-emerald-400 font-mono">(Confirmed by caller)</span>
                      )}
                    </div>
                    {detailCall.message.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{detailCall.message.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 leading-relaxed font-sans">
                    {detailCall.message.message}
                  </div>
                </div>
              )}

              {/* Turn-by-Turn Transcript */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-300 uppercase font-mono tracking-wider">
                  Turn-by-Turn Transcript ({detailCall.transcript.length} turns)
                </h3>
                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {detailCall.transcript.map((entry, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg text-xs leading-relaxed ${
                        entry.role === "assistant"
                          ? "bg-zinc-800/40 border border-zinc-800 text-zinc-200"
                          : "bg-zinc-950 border border-zinc-800/80 text-zinc-300 font-medium"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
                        <span className="uppercase font-bold text-zinc-400">
                          {entry.role === "assistant" ? "🤖 AI Receptionist" : "👤 Caller"}
                        </span>
                        <span>{entry.time ? new Date(entry.time).toLocaleTimeString() : ""}</span>
                      </div>
                      <p className="font-sans">{entry.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
