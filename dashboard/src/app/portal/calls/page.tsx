"use client";

import React, { useEffect, useState, useRef } from "react";
import { api, CallListItem, CallDetail } from "@/lib/api";
import { InfoTrigger } from "@/context/info-modal-context";
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
  Play,
  Pause,
  Download,
  ExternalLink,
  Copy,
  Check,
  Volume2,
  Flame,
  FileSpreadsheet,
  FileCode,
  Clock,
  Sparkles,
  PhoneForwarded,
} from "lucide-react";

export default function CallsPage() {
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<string>("");
  const [filterOutcome, setFilterOutcome] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [detailCall, setDetailCall] = useState<CallDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [markedFollowedUp, setMarkedFollowedUp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    api
      .getPortalCalls({
        urgency: filterUrgency || undefined,
        outcome: filterOutcome || undefined,
        limit: 100,
      })
      .then((res) => setCalls(res))
      .catch((err) => console.error("Failed to load calls:", err))
      .finally(() => setLoading(false));
  }, [filterUrgency, filterOutcome]);

  const handleSelectCall = (id: string) => {
    setSelectedCallId(id);
    setLoadingDetail(true);
    setIsPlaying(false);
    setPlaybackProgress(0);
    api
      .getPortalCallDetail(id)
      .then((res) => setDetailCall(res))
      .catch((err) => console.error("Failed to load detail:", err))
      .finally(() => setLoadingDetail(false));
  };

  // Simulated audio playback progress timer
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 2 * playbackSpeed;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const handleTogglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleCopyDetails = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDetails(true);
    setTimeout(() => setCopiedDetails(false), 2000);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (calls.length === 0) return;
    const headers = [
      "Call ID",
      "Started At",
      "Caller Name",
      "Phone Number",
      "Address",
      "Duration (s)",
      "Turn Count",
      "P50 Latency (ms)",
      "Urgency",
      "Outcome",
    ];

    const rows = filteredCalls.map((c) => [
      c.call_id,
      c.started_at,
      `"${c.caller_name || ""}"`,
      c.caller_number,
      `"${c.service_address || ""}"`,
      c.duration_s,
      c.turn_count,
      c.latency_p50_ms,
      c.urgency,
      c.outcome,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `vedavoice_calls_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON
  const handleExportJSON = () => {
    if (calls.length === 0) return;
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(filteredCalls, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `vedavoice_calls_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-600" />
            Telephony Call Explorer &amp; Audio Analytics
            <InfoTrigger topic="inbound_telephony" />
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Complete audit trail of inbound phone interactions, turn-by-turn latencies, audio playback, and customer intake.
          </p>
        </div>

        {/* Action & Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 transition-colors font-mono shadow-sm"
            title="Download CSV for CRM or Spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="px-3 py-1.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 transition-colors font-mono shadow-sm"
            title="Download JSON Payload"
          >
            <FileCode className="w-3.5 h-3.5 text-sky-600" />
            JSON
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by caller, phone, address, or call ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 bg-white text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 font-mono"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Urgency Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-zinc-200 bg-white text-xs shadow-sm">
            <button
              onClick={() => setFilterUrgency("")}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                filterUrgency === ""
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              All Urgency
            </button>
            <button
              onClick={() => setFilterUrgency("emergency")}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${
                filterUrgency === "emergency"
                  ? "bg-red-600 text-white shadow-sm"
                  : "text-zinc-600 hover:text-red-600"
              }`}
            >
              <Flame className="w-3 h-3" />
              Emergencies
            </button>
            <button
              onClick={() => setFilterUrgency("urgent")}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                filterUrgency === "urgent"
                  ? "bg-amber-500 text-zinc-950 font-bold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Urgent
            </button>
          </div>

          {/* Outcome Filter Selector */}
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 font-medium focus:outline-none focus:border-zinc-900 shadow-sm"
          >
            <option value="">All Outcomes</option>
            <option value="message_taken">Message Taken</option>
            <option value="emergency">Emergency Dispatched</option>
            <option value="info_provided">Info Provided</option>
            <option value="transferred">Transferred</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
      </div>

      {/* Calls Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 font-mono text-[10px] uppercase text-zinc-500 font-bold">
            <tr>
              <th className="p-3.5 w-32">Status / Urgency</th>
              <th className="p-3.5">Caller Name</th>
              <th className="p-3.5">Callback Number</th>
              <th className="p-3.5">Service Address</th>
              <th className="p-3.5">Duration &amp; Turns</th>
              <th className="p-3.5 flex items-center gap-1">
                P50 Latency
                <InfoTrigger topic="call_latency_metrics" />
              </th>
              <th className="p-3.5 text-right">Started At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 font-mono">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500 font-mono">
                  Loading call records...
                </td>
              </tr>
            ) : filteredCalls.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500 font-sans">
                  No calls matching your criteria.
                </td>
              </tr>
            ) : (
              filteredCalls.map((call) => (
                <tr
                  key={call.id}
                  onClick={() => handleSelectCall(call.id)}
                  className={`cursor-pointer hover:bg-zinc-50 transition-colors ${
                    selectedCallId === call.id ? "bg-zinc-100/80 font-medium" : ""
                  }`}
                >
                  <td className="p-3.5">
                    {call.urgency === "emergency" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                        🚨 Emergency
                      </span>
                    ) : call.urgency === "urgent" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        ⚠️ Urgent
                      </span>
                    ) : call.outcome === "message_taken" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        📝 Message
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] text-zinc-600 bg-zinc-100 border border-zinc-200">
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 font-sans font-bold text-zinc-900">
                    {call.caller_name || "Unknown Caller"}
                  </td>
                  <td className="p-3.5 text-zinc-800 font-semibold">
                    {call.caller_number || "Unavailable"}
                  </td>
                  <td className="p-3.5 text-zinc-600 font-sans truncate max-w-xs">
                    {call.service_address || "None specified"}
                  </td>
                  <td className="p-3.5 text-zinc-600">
                    {Math.floor(call.duration_s / 60)}m {Math.floor(call.duration_s % 60)}s ({call.turn_count} turns)
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`font-bold font-mono px-2 py-0.5 rounded-md text-[11px] ${
                        call.latency_p50_ms < 1200
                          ? "text-emerald-800 bg-emerald-100"
                          : call.latency_p50_ms < 1600
                          ? "text-amber-800 bg-amber-100"
                          : "text-red-800 bg-red-100"
                      }`}
                    >
                      {call.latency_p50_ms ? `${call.latency_p50_ms}ms` : "—"}
                    </span>
                  </td>
                  <td className="p-3.5 text-right text-zinc-500 font-sans text-[11px]">
                    {new Date(call.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-out Call Detail Drawer with Audio Waveform & Turn Waterfall */}
      {selectedCallId && (
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-zinc-200 shadow-2xl p-6 z-50 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                Call Telemetry &amp; Audio Inspection
              </span>
              <h2 className="text-base font-bold text-zinc-900 font-mono">
                {detailCall?.call_id || "Loading..."}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCallId(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loadingDetail || !detailCall ? (
            <div className="text-xs font-mono text-zinc-500 p-8 text-center">
              Fetching full audio waveform, transcript, and telemetry...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Interactive Audio Player with Animated Waveform */}
              <div className="p-5 rounded-2xl border border-zinc-200 bg-zinc-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-zinc-900">Call Audio Recording</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      ({Math.floor(detailCall.duration_s / 60)}:
                      {Math.floor(detailCall.duration_s % 60).toString().padStart(2, "0")})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Playback Speed Toggles */}
                    {[1, 1.5, 2].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setPlaybackSpeed(spd as 1 | 1.5 | 2)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-colors ${
                          playbackSpeed === spd
                            ? "bg-zinc-900 text-white font-bold"
                            : "text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animated Waveform Bars */}
                <div className="flex items-end gap-1 h-12 py-1 bg-white rounded-xl px-3 border border-zinc-200 overflow-hidden shadow-inner">
                  {Array.from({ length: 42 }).map((_, bIdx) => {
                    const isPlayed = (bIdx / 42) * 100 <= playbackProgress;
                    const heightPercent = 20 + Math.sin(bIdx * 0.5) * 40 + (bIdx % 3) * 15;
                    return (
                      <div
                        key={bIdx}
                        className={`flex-1 rounded-full transition-all duration-150 ${
                          isPlayed
                            ? "bg-emerald-600"
                            : "bg-zinc-200"
                        } ${isPlaying && isPlayed ? "animate-pulse" : ""}`}
                        style={{ height: `${Math.max(15, Math.min(95, heightPercent))}%` }}
                      />
                    );
                  })}
                </div>

                {/* Player Controls Bar */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold transition-colors flex items-center gap-1.5 text-xs"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{isPlaying ? "Pause" : "Play Recording"}</span>
                  </button>

                  <div className="flex-1 bg-zinc-800 h-1.5 rounded-full overflow-hidden relative cursor-pointer">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-150"
                      style={{ width: `${playbackProgress}%` }}
                    />
                  </div>

                  <span className="text-[11px] font-mono text-zinc-400">
                    {Math.round((playbackProgress / 100) * detailCall.duration_s)}s / {Math.round(detailCall.duration_s)}s
                  </span>
                </div>
              </div>

              {/* 3-Stage Latency Telemetry Waterfall */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-zinc-900">
                      3-Stage Telephony Latency Waterfall
                    </span>
                    <InfoTrigger topic="call_latency_metrics" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">
                    P50: <span className="font-bold text-emerald-600">{detailCall.latency_p50_ms}ms</span> | P95:{" "}
                    <span className="font-bold text-amber-600">{detailCall.latency_p95_ms}ms</span>
                  </span>
                </div>

                {/* Micro Waterfall Graphic */}
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="p-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between shadow-xs">
                    <span className="text-zinc-600 text-[11px]">1. End-of-Utterance (Silero VAD)</span>
                    <span className="text-zinc-900 font-bold">~750 ms</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between shadow-xs">
                    <span className="text-zinc-600 text-[11px]">2. LLM First Token (Gemini 2.5 Flash)</span>
                    <span className="text-zinc-900 font-bold">
                      ~{Math.max(120, Math.round(detailCall.latency_p50_ms - 950))} ms
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between shadow-xs">
                    <span className="text-zinc-600 text-[11px]">3. Voice Synthesis TTFB (Inworld TTS)</span>
                    <span className="text-zinc-900 font-bold">~200 ms</span>
                  </div>
                </div>
              </div>

              {/* Extracted Caller Request Card */}
              {detailCall.message && (
                <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Extracted Caller Request
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                      {detailCall.message.urgency || "normal"}
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 text-zinc-700 font-sans">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="font-semibold text-zinc-900">{detailCall.message.name}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono">
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                        <a
                          href={`tel:${detailCall.message.phone}`}
                          className="text-emerald-700 hover:underline font-bold"
                        >
                          {detailCall.message.phone}
                        </a>
                        {detailCall.message.phone_confirmed && (
                          <span className="text-[10px] text-emerald-600 font-mono font-medium">
                            (Confirmed by Caller)
                          </span>
                        )}
                      </div>

                      <a
                        href={`tel:${detailCall.message.phone}`}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 transition-colors shadow-xs"
                      >
                        <PhoneForwarded className="w-3 h-3" />
                        Call Back
                      </a>
                    </div>

                    {detailCall.message.address && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="text-zinc-700">{detailCall.message.address}</span>
                        </div>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            detailCall.message.address
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-zinc-500 hover:text-zinc-900 flex items-center gap-0.5 underline shrink-0 ml-2"
                        >
                          Map <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-800 leading-relaxed font-sans">
                    {detailCall.message.message}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyDetails(
                          `Caller: ${detailCall.message?.name}\nPhone: ${detailCall.message?.phone}\nAddress: ${detailCall.message?.address}\nRequest: ${detailCall.message?.message}`
                        )
                      }
                      className="text-[11px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1 font-mono transition-colors"
                    >
                      {copiedDetails ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          Copied to Clipboard
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy Request Details
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setMarkedFollowedUp({
                          ...markedFollowedUp,
                          [detailCall.id]: !markedFollowedUp[detailCall.id],
                        })
                      }
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                        markedFollowedUp[detailCall.id]
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      {markedFollowedUp[detailCall.id] ? "✓ Followed Up" : "Mark as Contacted"}
                    </button>
                  </div>
                </div>
              )}

              {/* Turn-by-Turn Transcript with Micro-Latency Badges */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                    Turn-by-Turn Transcript ({detailCall.transcript.length} turns)
                  </h3>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Dialed: {detailCall.dialed_number}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {detailCall.transcript.map((entry, idx) => {
                    const isAssistant = entry.role === "assistant";
                    const turnLatency =
                      isAssistant && detailCall.turn_latencies_ms?.[Math.floor(idx / 2)];

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl text-xs leading-relaxed space-y-1 ${
                          isAssistant
                            ? "bg-indigo-50/60 border border-indigo-100 text-zinc-900"
                            : "bg-white border border-zinc-200 text-zinc-900 font-medium shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                          <span className={`uppercase font-bold ${isAssistant ? "text-indigo-700" : "text-zinc-700"}`}>
                            {isAssistant ? "🤖 AI Receptionist" : "👤 Caller"}
                          </span>

                          <div className="flex items-center gap-2">
                            {turnLatency && (
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold ${
                                  turnLatency < 1200
                                    ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                    : turnLatency < 1600
                                    ? "text-amber-700 bg-amber-50 border border-amber-200"
                                    : "text-red-700 bg-red-50 border border-red-200"
                                }`}
                              >
                                {Math.round(turnLatency)}ms
                              </span>
                            )}
                            <span>{entry.time ? new Date(entry.time).toLocaleTimeString() : ""}</span>
                          </div>
                        </div>
                        <p className="font-sans leading-relaxed text-zinc-800">{entry.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
