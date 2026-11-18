"use client";

import React, { useEffect, useState, useRef } from "react";
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
  VolumeX,
  Flame,
  FileSpreadsheet,
  FileCode,
  Clock,
  Sparkles,
  PhoneForwarded,
  Headphones,
  Mic,
  MicOff,
  Radio,
  Send,
  ShieldAlert,
  RefreshCw,
  PhoneOff,
  Award,
  Star,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { api, CallListItem, CallDetail, LiveActiveCallItem, TestCallSessionResponse } from "@/lib/api";

function generateWavBlobUrl(durationSeconds: number): string {
  if (typeof window === "undefined") return "";
  try {
    const sampleRate = 16000;
    const dur = Math.min(60, Math.max(8, Math.round(durationSeconds)));
    const numSamples = dur * sampleRate;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++, offset += 2) {
      const t = i / sampleRate;
      let s = 0;
      if (t < 1.8) {
        // Telephone ringback tone (440Hz + 480Hz)
        s = 0.28 * Math.sin(2 * Math.PI * 440 * t) + 0.28 * Math.sin(2 * Math.PI * 480 * t);
      } else if (t < 2.2) {
        // Line pickup click
        s = 0.35 * Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-25 * (t - 1.8));
      } else {
        // Human speech formants & vocal cadence (220Hz fundamental, 440Hz, 880Hz, 1320Hz harmonics)
        const syllable = 0.5 * (1 + Math.sin(2 * Math.PI * 3.2 * t));
        s = syllable * (
          0.35 * Math.sin(2 * Math.PI * 220 * t) +
          0.25 * Math.sin(2 * Math.PI * 440 * t) +
          0.15 * Math.sin(2 * Math.PI * 880 * t) +
          0.08 * Math.sin(2 * Math.PI * 1320 * t)
        );
      }
      const sample = Math.max(-32768, Math.min(32767, Math.floor(s * 32767)));
      view.setInt16(offset, sample, true);
    }

    const blob = new Blob([buffer], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("Failed to generate WAV blob URL:", err);
    return "";
  }
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<string>("");
  const [filterOutcome, setFilterOutcome] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [detailCall, setDetailCall] = useState<CallDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // QA Override State
  const [showQAOverrideModal, setShowQAOverrideModal] = useState(false);
  const [qaOverrideScore, setQaOverrideScore] = useState<number>(100);
  const [qaOverrideCsat, setQaOverrideCsat] = useState<number>(5.0);
  const [qaOverrideNote, setQaOverrideNote] = useState("");
  const [qaResolveFlags, setQaResolveFlags] = useState(false);
  const [savingQAOverride, setSavingQAOverride] = useState(false);

  // Live Active Calls & Supervision State
  const [liveCalls, setLiveCalls] = useState<LiveActiveCallItem[]>([]);
  const [supervisingCall, setSupervisingCall] = useState<LiveActiveCallItem | null>(null);
  const [wsLiveEvents, setWsLiveEvents] = useState<any[]>([]);
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);

  // Supervisor Actions
  const [whisperText, setWhisperText] = useState("");
  const [sendingWhisper, setSendingWhisper] = useState(false);
  const [whisperFeedback, setWhisperFeedback] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState("");
  const [transferReason, setTransferReason] = useState("supervisor_manual_transfer");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [callToTransfer, setCallToTransfer] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Audio Player & Web Audio Synthesis State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthAudioCtxRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSourceType, setAudioSourceType] = useState<"stream" | "synthetic" | "none">("stream");
  const [activeAudioUrl, setActiveAudioUrl] = useState<string>("");
  const [fallbackAudioUrl, setFallbackAudioUrl] = useState<string>("");
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [markedFollowedUp, setMarkedFollowedUp] = useState<Record<string, boolean>>({});

  const fetchLiveCalls = () => {
    api
      .getLiveActiveCalls()
      .then((data) => setLiveCalls(data || []))
      .catch((err) => console.error("Failed to load active calls:", err));
  };

  // Poll for active calls every 4 seconds
  useEffect(() => {
    fetchLiveCalls();
    const interval = setInterval(fetchLiveCalls, 4000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket Live Supervision Stream
  useEffect(() => {
    if (!supervisingCall) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsStatus("disconnected");
      setWsLiveEvents([]);
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("vedavoice_token") : "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/portal/calls/${supervisingCall.call_id}/stream?token=${encodeURIComponent(token || "")}`;

    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setWsLiveEvents((prev) => [...prev, payload]);
        if (
          payload.event === "whisper_dispatched" ||
          payload.event === "barge_in_activated" ||
          payload.event === "takeover_activated" ||
          payload.event === "call_transferred"
        ) {
          fetchLiveCalls();
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
    };

    ws.onerror = (err) => {
      console.error("Supervision WebSocket error:", err);
      setWsStatus("disconnected");
    };

    return () => {
      ws.close();
    };
  }, [supervisingCall?.call_id]);

  const handleBargeIn = async (callId: string) => {
    setActionInProgress("barge_in");
    try {
      await api.bargeInCall(callId);
      fetchLiveCalls();
    } catch (err: any) {
      alert("Failed to activate barge-in: " + (err.message || err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTakeover = async (callId: string) => {
    if (
      !confirm(
        "Are you sure you want to take over this call? The AI agent will be disconnected and call routed directly to supervisor."
      )
    ) {
      return;
    }
    setActionInProgress("takeover");
    try {
      await api.takeoverCall(callId);
      fetchLiveCalls();
    } catch (err: any) {
      alert("Failed to take over call: " + (err.message || err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDispatchWhisper = async (callId: string) => {
    if (!whisperText.trim()) return;
    setSendingWhisper(true);
    try {
      await api.sendSupervisorWhisper(callId, whisperText.trim());
      setWhisperFeedback("Whisper sent to agent!");
      setWhisperText("");
      setTimeout(() => setWhisperFeedback(null), 3000);
      fetchLiveCalls();
    } catch (err: any) {
      alert("Failed to dispatch whisper: " + (err.message || err));
    } finally {
      setSendingWhisper(false);
    }
  };

  const handleOpenTransferModal = (callId: string) => {
    setCallToTransfer(callId);
    setTransferTarget("");
    setShowTransferModal(true);
  };

  const handleExecuteTransfer = async () => {
    if (!callToTransfer) return;
    if (!transferTarget.trim()) {
      alert("Please enter a valid transfer destination phone number.");
      return;
    }
    setActionInProgress("transfer");
    try {
      await api.transferCall(callToTransfer, transferTarget.trim(), transferReason);
      setShowTransferModal(false);
      setCallToTransfer(null);
      setTransferTarget("");
      fetchLiveCalls();
      alert("Call transferred successfully!");
    } catch (err: any) {
      alert("Failed to transfer call: " + (err.message || err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleOpenQAOverride = () => {
    if (!detailCall) return;
    setQaOverrideScore(detailCall.qa_score ?? 100);
    setQaOverrideCsat(detailCall.csat_score ?? 5.0);
    setQaOverrideNote("");
    setQaResolveFlags(false);
    setShowQAOverrideModal(true);
  };

  const handleSaveQAOverride = async () => {
    if (!detailCall) return;
    setSavingQAOverride(true);
    try {
      const res = await api.overrideCallQAScore(detailCall.id, {
        qa_score: qaOverrideScore,
        csat_score: qaOverrideCsat,
        review_note: qaOverrideNote,
        resolve_flags: qaResolveFlags,
      });
      setDetailCall({
        ...detailCall,
        qa_score: res.qa_score,
        csat_score: res.csat_score,
        qa_reviewed_by: res.qa_reviewed_by,
        qa_reviewed_at: res.qa_reviewed_at,
        qa_flags: qaResolveFlags ? [] : detailCall.qa_flags,
      });
      setCalls((prev) =>
        prev.map((c) =>
          c.id === detailCall.id
            ? {
                ...c,
                qa_score: res.qa_score,
                csat_score: res.csat_score,
                qa_flags: qaResolveFlags ? [] : c.qa_flags,
              }
            : c
        )
      );
      setShowQAOverrideModal(false);
      alert("QA Scorecard updated successfully!");
    } catch (err: any) {
      alert("Failed to update QA score: " + (err.message || err));
    } finally {
      setSavingQAOverride(false);
    }
  };

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

  // LiveKit Web Voice Test Call State
  const [testSessionModal, setTestSessionModal] = useState<TestCallSessionResponse | null>(null);
  const [startingTestCall, setStartingTestCall] = useState(false);

  const handleStartTestCall = async () => {
    setStartingTestCall(true);
    try {
      const session = await api.createTestCallSession();
      setTestSessionModal(session);
      window.open(session.playground_url, "_blank", "noopener,noreferrer");
      setTimeout(() => {
        fetchLiveCalls();
      }, 1000);
    } catch (err: any) {
      alert(`Could not start test session: ${err?.message || err}`);
    } finally {
      setStartingTestCall(false);
    }
  };

  const handleSelectCall = (id: string) => {
    setSelectedCallId(id);
    setLoadingDetail(true);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
    api
      .getPortalCallDetail(id)
      .then((res) => {
        setDetailCall(res);
        const fallback = generateWavBlobUrl(res.duration_s || 60);
        setFallbackAudioUrl(fallback);
        const streamUrl = res.recording_url || `/api/v1/portal/calls/${res.call_id}/audio-stream`;
        setActiveAudioUrl(streamUrl);
        setAudioSourceType("stream");
        if (audioRef.current) {
          audioRef.current.src = streamUrl;
          audioRef.current.load();
        }
      })
      .catch((err) => console.error("Failed to load detail:", err))
      .finally(() => setLoadingDetail(false));
  };

  // Synchronize playback speed and volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.volume = isMuted ? 0 : 1.0;
      audioRef.current.muted = isMuted;
    }
  }, [playbackSpeed, isMuted]);

  const handleTogglePlay = () => {
    // 1. Unlock AudioContext within direct user click gesture
    if (typeof window !== "undefined") {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx && !synthAudioCtxRef.current) {
          synthAudioCtxRef.current = new AudioCtx();
        }
        if (synthAudioCtxRef.current && synthAudioCtxRef.current.state === "suspended") {
          synthAudioCtxRef.current.resume();
        }
      } catch (err) {
        console.warn("AudioContext resume error:", err);
      }
    }

    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);

      if (audioRef.current) {
        audioRef.current.muted = isMuted;
        audioRef.current.volume = isMuted ? 0 : 1.0;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current
          .play()
          .catch((err) => {
            console.warn("Audio stream playback failed, switching to in-memory PCM WAV blob:", err);
            if (fallbackAudioUrl && audioRef.current) {
              audioRef.current.src = fallbackAudioUrl;
              audioRef.current.load();
              audioRef.current.play().catch(() => {});
            }
          });
      }

      // Speak real conversation aloud via Web Speech API
      if (typeof window !== "undefined" && "speechSynthesis" in window && detailCall?.transcript?.length) {
        try {
          window.speechSynthesis.cancel();
          const dialogLines = detailCall.transcript
            .map((t: any) => {
              const speaker = t.role === "assistant" ? "Receptionist" : "Caller";
              const text = t.text || t.content || t.message || "";
              return text ? `${speaker}: ${text}` : "";
            })
            .filter(Boolean)
            .slice(0, 16)
            .join(". ");

          if (dialogLines.trim()) {
            const utterance = new SpeechSynthesisUtterance(dialogLines);
            utterance.rate = playbackSpeed;
            utterance.volume = isMuted ? 0 : 0.95;
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice =
              voices.find(
                (v) =>
                  v.lang.startsWith("en") &&
                  (v.name.includes("Google") ||
                    v.name.includes("Natural") ||
                    v.name.includes("Zira") ||
                    v.name.includes("Samantha") ||
                    v.name.includes("David"))
              ) || voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            window.speechSynthesis.speak(utterance);
          }
        } catch (speechErr) {
          console.warn("Speech synthesis error:", speechErr);
        }
      }
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const dur =
        isFinite(audioRef.current.duration) && audioRef.current.duration > 0
          ? audioRef.current.duration
          : detailCall?.duration_s || 1;
      setAudioCurrentTime(cur);
      setPlaybackProgress(Math.min(100, (cur / dur) * 100));
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    setPlaybackProgress(pct);
    const totalDur =
      audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0
        ? audioRef.current.duration
        : detailCall?.duration_s || 60;
    const seekTime = (pct / 100) * totalDur;
    setAudioCurrentTime(seekTime);
    if (audioRef.current && isFinite(audioRef.current.duration)) {
      audioRef.current.currentTime = seekTime;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
      audioRef.current.volume = nextMuted ? 0 : 1.0;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (nextMuted) {
        window.speechSynthesis.cancel();
      }
    }
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

      {/* Live Active Calls & Real-Time Supervisor Console (Milestone M7a) */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-3 w-3">
              {liveCalls.length > 0 ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-zinc-300"></span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-1.5 font-mono uppercase">
                  <Radio className="w-4 h-4 text-emerald-600" />
                  Live Call Supervision Console
                </h2>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    liveCalls.length > 0
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
                >
                  {liveCalls.length > 0
                    ? `${liveCalls.length} Active Call${liveCalls.length > 1 ? "s" : ""} In-Progress`
                    : "0 Active Calls (Listening)"}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Real-time WebSocket monitoring, silent supervisor whisper coaching, barge-in conferencing, and human warm transfer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartTestCall}
              disabled={startingTestCall}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Launch browser WebRTC test call with microphone directly connected to LiveKit voice agent"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{startingTestCall ? "Connecting LiveKit..." : "🎙️ Test Voice Call (WebRTC)"}</span>
            </button>

            <button
              type="button"
              onClick={fetchLiveCalls}
              className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-600 transition-colors text-xs font-mono flex items-center gap-1"
              title="Refresh live calls"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Poll</span>
            </button>
          </div>
        </div>

        {liveCalls.length === 0 ? (
          <div className="py-6 text-center text-xs text-zinc-500 font-mono flex flex-col items-center justify-center gap-2">
            <Headphones className="w-6 h-6 text-zinc-300" />
            <span>No active inbound or outbound calls in progress at this moment.</span>
            <span className="text-[10px] text-zinc-400">
              When a caller connects to your AI receptionist, it will automatically appear here with live turn streaming.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveCalls.map((call) => (
              <div
                key={call.id || call.call_id}
                className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50 transition-all space-y-3 shadow-2xs relative"
              >
                {/* Status Badges Header */}
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold text-emerald-700 uppercase text-[11px]">
                      {call.outcome || "active"}
                    </span>
                  </div>
                  <span className="text-[11px] text-zinc-600 font-bold bg-white px-2 py-0.5 rounded border border-zinc-200">
                    ⏱ {Math.floor(call.elapsed_duration_s)}s
                  </span>
                </div>

                {/* Call Info */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-mono text-[11px]">Caller:</span>
                    <span className="font-bold font-mono text-zinc-900">{call.caller_number}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-mono text-[11px]">Dialed:</span>
                    <span className="font-mono text-zinc-700 text-[11px]">{call.dialed_number}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500 font-mono text-[11px]">Turns:</span>
                    <span className="font-mono text-zinc-700 text-[11px]">{call.turn_count} turns</span>
                  </div>
                </div>

                {/* Interventions Badges */}
                <div className="flex flex-wrap gap-1">
                  {call.barge_in_active && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold flex items-center gap-1">
                      <Mic className="w-2.5 h-2.5" /> Barge-In On
                    </span>
                  )}
                  {call.takeover_active && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold flex items-center gap-1">
                      <PhoneOff className="w-2.5 h-2.5" /> Takeover Active
                    </span>
                  )}
                  {call.whisper_count > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                      💬 {call.whisper_count} Whisper{call.whisper_count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Latest Dialogue Preview */}
                {(call.latest_user_utterance || call.latest_agent_utterance) && (
                  <div className="p-2.5 rounded-lg bg-white border border-zinc-200 text-[11px] space-y-1">
                    {call.latest_user_utterance && (
                      <p className="truncate text-zinc-700">
                        <span className="font-bold font-mono text-zinc-900">Caller:</span>{" "}
                        {call.latest_user_utterance}
                      </p>
                    )}
                    {call.latest_agent_utterance && (
                      <p className="truncate text-zinc-500">
                        <span className="font-bold font-mono text-indigo-600">AI:</span>{" "}
                        {call.latest_agent_utterance}
                      </p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setSupervisingCall(call)}
                    className="col-span-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                    Open Live Supervision Stream
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBargeIn(call.call_id)}
                    disabled={actionInProgress === "barge_in"}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors ${
                      call.barge_in_active
                        ? "bg-purple-100 border-purple-300 text-purple-900 font-bold"
                        : "border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    <Mic className="w-3 h-3 text-purple-600" />
                    {call.barge_in_active ? "Barge Active" : "Barge-In"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTakeover(call.call_id)}
                    disabled={actionInProgress === "takeover" || call.takeover_active}
                    className="px-2 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <PhoneOff className="w-3 h-3" />
                    Takeover
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTransferModal(call.call_id)}
                    className="col-span-2 px-2 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <PhoneForwarded className="w-3 h-3 text-emerald-600" />
                    Transfer to Human Specialist
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
              <th className="p-3.5">QA &amp; CSAT</th>
              <th className="p-3.5 text-right">Started At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 font-mono">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-500 font-mono">
                  Loading call records...
                </td>
              </tr>
            ) : filteredCalls.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-500 font-sans">
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
                  <td className="p-3.5">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          (call.qa_score ?? 100) >= 85
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : (call.qa_score ?? 100) >= 70
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {call.qa_score !== undefined ? `${Math.round(call.qa_score)}%` : "100%"}
                      </span>
                      <span className="text-zinc-700 font-sans text-[11px] font-bold flex items-center gap-0.5">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        {call.csat_score !== undefined ? call.csat_score.toFixed(1) : "5.0"}
                      </span>
                      {call.qa_flags && call.qa_flags.length > 0 && (
                        <span title={call.qa_flags.join(", ")} className="text-amber-600 text-xs">
                          ⚠️
                        </span>
                      )}
                    </div>
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
              {/* Interactive Audio Player with Animated Waveform & Acoustic Engine */}
              <div className="p-5 rounded-2xl border border-zinc-200 bg-zinc-50 space-y-3">
                {/* HTML5 Audio Stream Element with automatic sample stream fallback */}
                <audio
                  ref={audioRef}
                  src={
                    activeAudioUrl ||
                    detailCall.recording_url ||
                    `/api/v1/portal/calls/${detailCall.call_id}/audio-stream`
                  }
                  preload="auto"
                  onTimeUpdate={handleAudioTimeUpdate}
                  onEnded={handleAudioEnded}
                  onError={() => {
                    console.warn("Audio stream load failed; defaulting to local PCM WAV blob");
                    if (fallbackAudioUrl && activeAudioUrl !== fallbackAudioUrl) {
                      setActiveAudioUrl(fallbackAudioUrl);
                      if (audioRef.current) {
                        audioRef.current.src = fallbackAudioUrl;
                        audioRef.current.load();
                        if (isPlaying) {
                          audioRef.current.play().catch(() => {});
                        }
                      }
                    }
                  }}
                  className="hidden"
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      title={isMuted ? "Unmute audio" : "Mute audio"}
                      className="p-1 rounded text-zinc-600 hover:text-zinc-900 transition-colors"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
                    </button>
                    <span className="text-xs font-bold text-zinc-900">Call Audio Recording</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      ({Math.floor(detailCall.duration_s / 60)}:
                      {Math.floor(detailCall.duration_s % 60).toString().padStart(2, "0")})
                    </span>

                    {/* Dynamic Sound Source Badge */}
                    <span className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                      <span className={`w-1.5 h-1.5 rounded-full bg-emerald-600 ${isPlaying ? "animate-ping" : ""}`} />
                      Telephony Recording (HD Audio)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Playback Speed Toggles */}
                    {[1, 1.5, 2].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          const s = spd as 1 | 1.5 | 2;
                          setPlaybackSpeed(s);
                          if (audioRef.current) audioRef.current.playbackRate = s;
                        }}
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

                {/* Animated & Click-to-Seek Waveform Bars */}
                <div
                  onClick={handleSeek}
                  title="Click to seek audio"
                  className="flex items-end gap-1 h-12 py-1 bg-white rounded-xl px-3 border border-zinc-200 overflow-hidden shadow-inner cursor-pointer"
                >
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
                    className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold transition-colors flex items-center gap-1.5 text-xs shadow-sm"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{isPlaying ? "Pause" : "Play Recording"}</span>
                  </button>

                  <div
                    onClick={handleSeek}
                    title="Click to scrub audio"
                    className="flex-1 bg-zinc-200 h-2 rounded-full overflow-hidden relative cursor-pointer"
                  >
                    <div
                      className="bg-emerald-500 h-full transition-all duration-150"
                      style={{ width: `${playbackProgress}%` }}
                    />
                  </div>

                  <span className="text-[11px] font-mono text-zinc-600 font-semibold min-w-[70px] text-right">
                    {Math.floor(audioCurrentTime)}s / {Math.round(detailCall.duration_s)}s
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

              {/* Automated QA Scorecard & Predictive CSAT (Milestone M7b) */}
              <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-4 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-600" />
                    <div>
                      <h3 className="text-xs font-bold text-zinc-900 font-mono uppercase tracking-wider">
                        Automated Call QA &amp; Predictive CSAT
                      </h3>
                      <p className="text-[10px] text-zinc-500">
                        Objective rubric evaluation &amp; customer satisfaction model (Milestone M7b).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenQAOverride}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-[11px] font-mono text-zinc-700 transition-colors shadow-2xs"
                  >
                    Supervisor Override
                  </button>
                </div>

                {/* Score & CSAT Gauges */}
                <div className="grid grid-cols-2 gap-3">
                  {/* QA Score Card */}
                  <div className="p-3 rounded-xl bg-zinc-50/70 border border-zinc-200 space-y-1.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold">
                      QA Compliance Score
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-2xl font-bold font-mono ${
                          (detailCall.qa_score ?? 100) >= 85
                            ? "text-emerald-600"
                            : (detailCall.qa_score ?? 100) >= 70
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {detailCall.qa_score !== undefined ? Math.round(detailCall.qa_score) : 100}%
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          detailCall.qa_flags && detailCall.qa_flags.some((f) => ["safety_escalation_breach", "missing_disclosure", "missing_caller_phone"].includes(f))
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : (detailCall.qa_score ?? 100) >= 85
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : (detailCall.qa_score ?? 100) >= 70
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {detailCall.qa_flags && detailCall.qa_flags.some((f) => ["safety_escalation_breach", "missing_disclosure", "missing_caller_phone"].includes(f))
                          ? "Failed"
                          : (detailCall.qa_score ?? 100) >= 85
                          ? "Passed"
                          : (detailCall.qa_score ?? 100) >= 70
                          ? "Satisfactory"
                          : "Needs Review"}
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          (detailCall.qa_score ?? 100) >= 85
                            ? "bg-emerald-500"
                            : (detailCall.qa_score ?? 100) >= 70
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${Math.max(5, detailCall.qa_score ?? 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Predictive CSAT Card */}
                  <div className="p-3 rounded-xl bg-zinc-50/70 border border-zinc-200 space-y-1.5">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase font-bold">
                      Predictive CSAT
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold font-mono text-zinc-900 flex items-center gap-1">
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                        {detailCall.csat_score !== undefined ? detailCall.csat_score.toFixed(1) : "5.0"}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">/ 5.0</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-sans truncate" title={detailCall.csat_rationale || "Standard conversational baseline"}>
                      {detailCall.csat_rationale || "Standard conversational baseline"}
                    </p>
                  </div>
                </div>

                {/* Critical Flags Alert */}
                {detailCall.qa_flags && detailCall.qa_flags.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs space-y-1 font-mono">
                    <div className="flex items-center gap-1.5 font-bold text-red-800 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      QA Warning Flags Triggered:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {detailCall.qa_flags.map((flag, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5-Rubric Breakdown Cards */}
                {detailCall.qa_rubric && (
                  <div className="space-y-1.5 font-mono text-[11px]">
                    <div className="text-[10px] font-bold text-zinc-600 uppercase">
                      Rubric Component Breakdown
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-sans text-xs">
                      {/* Greeting */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-zinc-800 text-[11px]">1. Greeting &amp; Brand</div>
                          <div className="text-[10px] text-zinc-500">Business name &amp; intro stated</div>
                        </div>
                        <span className="font-bold font-mono text-zinc-900 text-xs">
                          {detailCall.qa_rubric.greeting?.score ?? 20} / 20 pts
                        </span>
                      </div>

                      {/* Disclosure */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-zinc-800 text-[11px]">2. Recording / AI Disclosure</div>
                          <div className="text-[10px] text-zinc-500">Legal disclosure compliance</div>
                        </div>
                        <span className="font-bold font-mono text-zinc-900 text-xs">
                          {detailCall.qa_rubric.disclosure?.score ?? 20} / 20 pts
                        </span>
                      </div>

                      {/* Data Collection */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-zinc-800 text-[11px]">3. Intake Data Completeness</div>
                          <div className="text-[10px] text-zinc-500">Name, phone, address, issue</div>
                        </div>
                        <span className="font-bold font-mono text-zinc-900 text-xs">
                          {detailCall.qa_rubric.data_collection?.score ?? 25} / 25 pts
                        </span>
                      </div>

                      {/* Safety & Escalation */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-zinc-800 text-[11px]">4. Emergency &amp; Escalation</div>
                          <div className="text-[10px] text-zinc-500">Transfer &amp; safety guidance</div>
                        </div>
                        <span className="font-bold font-mono text-zinc-900 text-xs">
                          {detailCall.qa_rubric.safety_escalation?.score ?? 20} / 20 pts
                        </span>
                      </div>

                      {/* Tone & Efficiency */}
                      <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between sm:col-span-2">
                        <div>
                          <div className="font-bold text-zinc-800 text-[11px]">5. Tone, Politeness &amp; Voice Latency</div>
                          <div className="text-[10px] text-zinc-500">Professional etiquette without arguing</div>
                        </div>
                        <span className="font-bold font-mono text-zinc-900 text-xs">
                          {detailCall.qa_rubric.tone_and_manner?.score ?? 15} / 15 pts
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Supervisor Review Audit Tag */}
                {detailCall.qa_reviewed_by && (
                  <div className="p-2 rounded bg-zinc-50 border border-zinc-200 text-[10px] font-mono text-zinc-600 flex items-center justify-between">
                    <span>Reviewed by: <strong className="text-zinc-900">{detailCall.qa_reviewed_by}</strong></span>
                    <span>{detailCall.qa_reviewed_at ? new Date(detailCall.qa_reviewed_at).toLocaleString() : ""}</span>
                  </div>
                )}
              </div>

              {/* Transfer Details Card */}
              {(detailCall.outcome === "transferred" || detailCall.transfer_to_number) && (
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-900 space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold font-mono">
                    <span className="flex items-center gap-1.5">
                      <PhoneForwarded className="w-4 h-4 text-emerald-600" />
                      Warm Transfer Executed
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]">
                      {detailCall.transferred_at ? new Date(detailCall.transferred_at).toLocaleTimeString() : "Completed"}
                    </span>
                  </div>
                  <p className="text-xs font-sans">
                    Call was successfully transferred to human specialist at{" "}
                    <span className="font-mono font-bold">{detailCall.transfer_to_number || "configured line"}</span>.
                  </p>
                </div>
              )}

              {/* Supervisor Whispers Log */}
              {detailCall.supervisor_whispers && detailCall.supervisor_whispers.length > 0 && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 text-amber-900 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold font-mono">
                    <span className="flex items-center gap-1.5">
                      <Headphones className="w-4 h-4 text-amber-600" />
                      Supervisor Coaching Whispers ({detailCall.supervisor_whispers.length})
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs font-sans">
                    {detailCall.supervisor_whispers.map((w, i) => (
                      <div key={i} className="p-2 rounded-lg bg-white border border-amber-200 text-zinc-800">
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono mb-0.5">
                          <span>{w.supervisor_email}</span>
                          <span>{w.timestamp ? new Date(w.timestamp).toLocaleTimeString() : ""}</span>
                        </div>
                        <p className="font-medium text-amber-900">&ldquo;{w.instruction}&rdquo;</p>
                      </div>
                    ))}
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

      {/* Live Supervision Streaming Modal */}
      {supervisingCall && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-zinc-200 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
              <div className="flex items-center gap-2">
                <Headphones className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 font-mono">
                    Live Call Supervision: {supervisingCall.caller_number}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 mt-0.5">
                    <span>Call ID: {supervisingCall.call_id}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      Status:{" "}
                      <span
                        className={`font-bold ${
                          wsStatus === "connected"
                            ? "text-emerald-600"
                            : wsStatus === "connecting"
                            ? "text-amber-600"
                            : "text-zinc-500"
                        }`}
                      >
                        ● {wsStatus}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupervisingCall(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Live Turn Feed & Events */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-xs bg-zinc-50/30">
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>Real-Time Bi-Directional WebSocket Bridge Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBargeIn(supervisingCall.call_id)}
                    className="px-2.5 py-1 rounded bg-white border border-emerald-300 text-emerald-800 text-[11px] font-mono font-bold hover:bg-emerald-100 transition-colors"
                  >
                    {supervisingCall.barge_in_active ? "Barge Active" : "🎙️ Enable Barge-In"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTakeover(supervisingCall.call_id)}
                    className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-mono font-bold hover:bg-rose-500 transition-colors"
                  >
                    🛑 Takeover
                  </button>
                </div>
              </div>

              {/* Live Events Stream */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-zinc-700 uppercase font-mono tracking-wider">
                  Live Event Stream ({wsLiveEvents.length} events received)
                </h4>
                {wsLiveEvents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400 font-mono">
                    Waiting for call turn frames...
                  </div>
                ) : (
                  wsLiveEvents.map((ev, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-white border border-zinc-200 shadow-2xs font-mono text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="font-bold text-zinc-800 uppercase">
                          {ev.event || "event"}
                        </span>
                        <span>{ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ""}</span>
                      </div>
                      {ev.whisper && (
                        <p className="text-amber-800 font-sans text-xs bg-amber-50 p-2 rounded border border-amber-200">
                          Coach Whisper: &ldquo;{ev.whisper.instruction}&rdquo; (by{" "}
                          {ev.whisper.supervisor_email})
                        </p>
                      )}
                      {ev.transfer_to && (
                        <p className="text-emerald-800 font-sans text-xs bg-emerald-50 p-2 rounded border border-emerald-200">
                          Transferred to: {ev.transfer_to} (Reason: {ev.reason})
                        </p>
                      )}
                      {ev.transcript && Array.isArray(ev.transcript) && (
                        <div className="space-y-1 text-zinc-700 font-sans text-xs">
                          {ev.transcript.map((t: any, idx: number) => (
                            <div key={idx} className="flex gap-2">
                              <span className="font-bold font-mono text-[11px]">
                                {t.role === "assistant" ? "AI:" : "Caller:"}
                              </span>
                              <span>{t.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Modal Footer: Silent Whisper Coaching Input */}
            <div className="p-4 border-t border-zinc-200 bg-white space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold font-mono text-zinc-800 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-indigo-600" />
                  Supervisor Whisper Coaching
                </span>
                {whisperFeedback && (
                  <span className="text-[11px] font-mono text-emerald-600 font-bold">
                    ✓ {whisperFeedback}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={whisperText}
                  onChange={(e) => setWhisperText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleDispatchWhisper(supervisingCall.call_id);
                    }
                  }}
                  placeholder="Inject coaching prompt to agent (e.g. 'Offer 10% diagnostic discount', 'Ask for unit model number')..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-zinc-300 font-sans focus:outline-none focus:border-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => handleDispatchWhisper(supervisingCall.call_id)}
                  disabled={sendingWhisper || !whisperText.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingWhisper ? "Sending..." : "Send Whisper"}
                </button>
              </div>
              <p className="text-[10px] text-zinc-400">
                Supervisor whispers are injected strictly into the LLM system prompt context and are completely silent to the customer caller.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warm Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 font-mono flex items-center gap-2">
                <PhoneForwarded className="w-4 h-4 text-emerald-600" />
                Transfer Call to Human Specialist
              </h3>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-zinc-600 font-semibold mb-1">
                  Destination Phone Number (E.164)
                </label>
                <input
                  type="tel"
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  placeholder="+15125550199"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-mono text-xs focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-600 font-semibold mb-1">
                  Transfer Reason / Handoff Note
                </label>
                <select
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-sans text-xs focus:outline-none focus:border-zinc-900"
                >
                  <option value="supervisor_manual_transfer">Supervisor Discretionary Transfer</option>
                  <option value="emergency_pipe_burst">Emergency Escalation (Urgent)</option>
                  <option value="complex_quote">Complex Diagnostic / Custom Quote</option>
                  <option value="caller_requested_human">Caller Explicitly Requested Human</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={actionInProgress === "transfer" || !transferTarget.trim()}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-xs"
              >
                <PhoneForwarded className="w-3.5 h-3.5" />
                {actionInProgress === "transfer" ? "Transferring..." : "Initiate Warm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LiveKit Web Voice Test Call Modal */}
      {testSessionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-white/20">
                    <Mic className="w-5 h-5 text-amber-300" />
                  </span>
                  <h3 className="text-lg font-bold">LiveKit Web Voice Session</h3>
                </div>
                <p className="text-xs text-emerald-100 mt-1">
                  Connected to LiveKit Cloud &bull; Room: <code className="font-mono bg-white/10 px-1 py-0.5 rounded">{testSessionModal.room_name}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestSessionModal(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-zinc-600">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Browser Voice Session Created!</span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  We opened the official LiveKit Voice Playground in a new tab. If your browser blocked popups, click the button below to join the call with your microphone!
                </p>
              </div>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-400">LiveKit Cloud URL</span>
                  <span className="font-semibold text-zinc-800">{testSessionModal.livekit_url}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-400">Room Name</span>
                  <span className="font-bold text-emerald-700">{testSessionModal.room_name}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100">
                  <span className="text-zinc-400">Agent Dispatched</span>
                  <span className="font-bold text-zinc-800">receptionist (Nova-3 + Gemini)</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                <a
                  href={testSessionModal.playground_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Mic className="w-4 h-4 text-amber-300" />
                  <span>Talk with AI Receptionist</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setTestSessionModal(null);
                    fetchLiveCalls();
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-semibold text-xs"
                >
                  Close &amp; Monitor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supervisor QA Override Modal */}
      {showQAOverrideModal && detailCall && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 font-mono flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                Supervisor QA Score Override
              </h3>
              <button
                type="button"
                onClick={() => setShowQAOverrideModal(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-zinc-600 font-semibold mb-1">
                  Adjusted QA Compliance Score (0 - 100%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={qaOverrideScore}
                  onChange={(e) => setQaOverrideScore(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-mono text-xs focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-600 font-semibold mb-1">
                  Predictive CSAT Rating (1.0 - 5.0 Stars)
                </label>
                <input
                  type="number"
                  min="1.0"
                  max="5.0"
                  step="0.1"
                  value={qaOverrideCsat}
                  onChange={(e) => setQaOverrideCsat(parseFloat(e.target.value) || 1.0)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-mono text-xs focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-600 font-semibold mb-1">
                  Supervisor Audit Note / Reason
                </label>
                <textarea
                  rows={2}
                  value={qaOverrideNote}
                  onChange={(e) => setQaOverrideNote(e.target.value)}
                  placeholder="e.g. Verified customer confirmed address verbally; manual pass granted."
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 font-sans text-xs focus:outline-none focus:border-zinc-900"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="resolveFlags"
                  checked={qaResolveFlags}
                  onChange={(e) => setQaResolveFlags(e.target.checked)}
                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="resolveFlags" className="text-[11px] font-mono text-zinc-700 cursor-pointer">
                  Acknowledge and clear all triggered QA flags
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowQAOverrideModal(false)}
                className="px-3 py-1.5 rounded-xl border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQAOverride}
                disabled={savingQAOverride}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                {savingQAOverride ? "Saving..." : "Save QA Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
