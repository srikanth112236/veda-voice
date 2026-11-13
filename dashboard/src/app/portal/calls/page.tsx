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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-400" />
            Telephony Call Explorer &amp; Audio Analytics
            <InfoTrigger topic="inbound_telephony" />
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Complete audit trail of inbound phone interactions, turn-by-turn latencies, audio playback, and customer intake.
          </p>
        </div>

        {/* Action & Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-xs text-zinc-300 flex items-center gap-1.5 transition-colors font-mono"
            title="Download CSV for CRM or Spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 text-xs text-zinc-300 flex items-center gap-1.5 transition-colors font-mono"
            title="Download JSON Payload"
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            JSON
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by caller, phone, address, or call ID..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Urgency Filter Tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs">
            <button
              onClick={() => setFilterUrgency("")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filterUrgency === ""
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All Urgency
            </button>
            <button
              onClick={() => setFilterUrgency("emergency")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                filterUrgency === "emergency"
                  ? "bg-red-500/20 text-red-400 font-bold shadow-sm"
                  : "text-zinc-400 hover:text-red-400"
              }`}
            >
              <Flame className="w-3 h-3 text-red-400" />
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

          {/* Outcome Filter Selector */}
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-zinc-600"
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
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 font-mono text-[10px] uppercase text-zinc-500">
            <tr>
              <th className="p-3 w-32">Status / Urgency</th>
              <th className="p-3">Caller Name</th>
              <th className="p-3">Callback Number</th>
              <th className="p-3">Service Address</th>
              <th className="p-3">Duration &amp; Turns</th>
              <th className="p-3 flex items-center gap-1">
                P50 Latency
                <InfoTrigger topic="call_latency_metrics" />
              </th>
              <th className="p-3 text-right">Started At</th>
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
                    ) : call.outcome === "message_taken" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        📝 Message
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
                  <td className="p-3">
                    <span
                      className={`font-bold font-mono px-1.5 py-0.5 rounded text-[11px] ${
                        call.latency_p50_ms < 1200
                          ? "text-emerald-400 bg-emerald-500/10"
                          : call.latency_p50_ms < 1600
                          ? "text-amber-400 bg-amber-500/10"
                          : "text-red-400 bg-red-500/10"
                      }`}
                    >
                      {call.latency_p50_ms ? `${call.latency_p50_ms}ms` : "—"}
                    </span>
                  </td>
                  <td className="p-3 text-right text-zinc-500 font-sans text-[11px]">
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
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl p-6 z-50 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="space-y-0.5">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Call Telemetry &amp; Audio Inspection
              </span>
              <h2 className="text-base font-bold text-zinc-100 font-mono">
                {detailCall?.call_id || "Loading..."}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCallId(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/90 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-zinc-200">Call Audio Recording</span>
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
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                          playbackSpeed === spd
                            ? "bg-emerald-500/20 text-emerald-400 font-bold"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animated Waveform Bars */}
                <div className="flex items-end gap-1 h-10 py-1 bg-zinc-950/80 rounded-lg px-3 border border-zinc-800/80 overflow-hidden">
                  {Array.from({ length: 42 }).map((_, bIdx) => {
                    const isPlayed = (bIdx / 42) * 100 <= playbackProgress;
                    const heightPercent = 20 + Math.sin(bIdx * 0.5) * 40 + (bIdx % 3) * 15;
                    return (
                      <div
                        key={bIdx}
                        className={`flex-1 rounded-full transition-all duration-150 ${
                          isPlayed
                            ? "bg-emerald-400"
                            : "bg-zinc-800"
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
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-zinc-200">
                      3-Stage Telephony Latency Waterfall
                    </span>
                    <InfoTrigger topic="call_latency_metrics" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    P50: <span className="font-bold text-emerald-400">{detailCall.latency_p50_ms}ms</span> | P95:{" "}
                    <span className="font-bold text-amber-400">{detailCall.latency_p95_ms}ms</span>
                  </span>
                </div>

                {/* Micro Waterfall Graphic */}
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80 flex items-center justify-between">
                    <span className="text-zinc-400 text-[11px]">1. End-of-Utterance (Silero VAD)</span>
                    <span className="text-zinc-200 font-bold">~750 ms</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80 flex items-center justify-between">
                    <span className="text-zinc-400 text-[11px]">2. LLM First Token (Gemini 2.5 Flash)</span>
                    <span className="text-zinc-200 font-bold">
                      ~{Math.max(120, Math.round(detailCall.latency_p50_ms - 950))} ms
                    </span>
                  </div>
                  <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80 flex items-center justify-between">
                    <span className="text-zinc-400 text-[11px]">3. Voice Synthesis TTFB (Inworld TTS)</span>
                    <span className="text-zinc-200 font-bold">~200 ms</span>
                  </div>
                </div>
              </div>

              {/* Extracted Caller Request Card */}
              {detailCall.message && (
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/80 space-y-3">
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
                      <span className="font-semibold text-zinc-100">{detailCall.message.name}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono">
                        <PhoneCall className="w-3.5 h-3.5 text-zinc-500" />
                        <a
                          href={`tel:${detailCall.message.phone}`}
                          className="text-blue-400 hover:underline font-bold"
                        >
                          {detailCall.message.phone}
                        </a>
                        {detailCall.message.phone_confirmed && (
                          <span className="text-[10px] text-emerald-400 font-mono font-medium">
                            (Confirmed by Caller)
                          </span>
                        )}
                      </div>

                      <a
                        href={`tel:${detailCall.message.phone}`}
                        className="px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <PhoneForwarded className="w-3 h-3" />
                        Call Back
                      </a>
                    </div>

                    {detailCall.message.address && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          <span>{detailCall.message.address}</span>
                        </div>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            detailCall.message.address
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5 underline shrink-0 ml-2"
                        >
                          Map <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed font-sans">
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
                      className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-mono transition-colors"
                    >
                      {copiedDetails ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
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
                      className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                        markedFollowedUp[detailCall.id]
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold"
                          : "border-zinc-800 text-zinc-400 hover:text-zinc-200"
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
                  <h3 className="text-xs font-bold text-zinc-300 uppercase font-mono tracking-wider">
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
                        className={`p-3 rounded-lg text-xs leading-relaxed space-y-1 ${
                          isAssistant
                            ? "bg-zinc-900 border border-zinc-800 text-zinc-200"
                            : "bg-zinc-950 border border-zinc-800/80 text-zinc-300 font-medium"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                          <span className="uppercase font-bold text-zinc-400">
                            {isAssistant ? "🤖 AI Receptionist" : "👤 Caller"}
                          </span>

                          <div className="flex items-center gap-2">
                            {turnLatency && (
                              <span
                                className={`px-1.5 py-0.2 rounded font-bold ${
                                  turnLatency < 1200
                                    ? "text-emerald-400 bg-emerald-500/10"
                                    : turnLatency < 1600
                                    ? "text-amber-400 bg-amber-500/10"
                                    : "text-red-400 bg-red-500/10"
                                }`}
                              >
                                {Math.round(turnLatency)}ms
                              </span>
                            )}
                            <span>{entry.time ? new Date(entry.time).toLocaleTimeString() : ""}</span>
                          </div>
                        </div>
                        <p className="font-sans leading-relaxed">{entry.text}</p>
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
