"use client";

import React, { useEffect, useState, useRef } from "react";
import { Room, RoomEvent, Track, RemoteTrack, RemoteTrackPublication, RemoteParticipant, ConnectionState } from "livekit-client";
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
  SkipBack,
  SkipForward,
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
  AlertTriangle,
  Users,
} from "lucide-react";
import { api, CallListItem, CallDetail, LiveActiveCallItem, TestCallSessionResponse } from "@/lib/api";
import { PaginationBar } from "@/components/ui/pagination";
import { AcousticWaveformEqualizer, EmptyCallsIllustration } from "@/components/ui/illustrations";

/**
 * Sanitizes dialog text so TTS does not narrate robotic labels like "Apex AI Receptionist:" or "Caller:"
 */
function cleanDialogueText(rawText: string): string {
  if (!rawText) return "";
  let cleaned = rawText
    .replace(
      /^(apex\s*ai(\s*receptionist)?|ai\s*receptionist|receptionist|assistant|caller|customer|user)\s*:\s*/i,
      ""
    )
    .trim();
  cleaned = cleaned.replace(/\*\*?([^*]+)\*\*?/g, "$1");
  return cleaned;
}

/**
 * Redacts customer PII (phone numbers, card numbers, street addresses)
 */
function redactPII(rawText: string): string {
  if (!rawText) return "";
  let out = rawText.replace(/(\+?1\s*[-.]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[PHONE_MASKED]");
  out = out.replace(/\b\d{1,5}\s+[A-Za-z0-9.\s]+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln|Court|Ct)\b/gi, "[ADDRESS_MASKED]");
  out = out.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "[CARD_MASKED]");
  return out;
}

/**
 * Selects contrasting high-quality voices for receptionist (female) vs caller (male/distinct)
 */
function getDualVoices(): {
  assistantVoice: SpeechSynthesisVoice | null;
  callerVoice: SpeechSynthesisVoice | null;
} {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { assistantVoice: null, callerVoice: null };
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return { assistantVoice: null, callerVoice: null };
  }

  const englishVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // 1. Assistant Voice: Crisp, professional female voice
  const assistantVoice =
    pool.find((v) =>
      /zira|samantha|karen|victoria|jenny|female|google\s+us\s+english/i.test(v.name)
    ) ||
    pool.find((v) => /natural/i.test(v.name)) ||
    pool[0];

  // 2. Caller Voice: Distinct male or contrasting voice
  const callerVoice =
    pool.find(
      (v) =>
        v.name !== assistantVoice?.name &&
        /david|guy|daniel|mark|male|george|google\s+uk\s+english\s+male/i.test(v.name)
    ) ||
    pool.find((v) => v.name !== assistantVoice?.name) ||
    assistantVoice;

  return { assistantVoice, callerVoice };
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

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
  const [liveDialogue, setLiveDialogue] = useState<{ role: string; text: string; time?: string }[]>([]);
  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const livekitRoomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const [isBargeMicActive, setIsBargeMicActive] = useState<boolean>(false);
  const [webrtcAudioActive, setWebrtcAudioActive] = useState<boolean>(false);

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
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.25 | 1.5 | 2>(1);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioSourceType, setAudioSourceType] = useState<"stream" | "synthetic" | "none">("stream");
  const [activeAudioUrl, setActiveAudioUrl] = useState<string>("");
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [markedFollowedUp, setMarkedFollowedUp] = useState<Record<string, boolean>>({});
  const [isRedactedPII, setIsRedactedPII] = useState(true);
  const [activePreset, setActivePreset] = useState<
    "all" | "emergencies" | "bookings" | "messages" | "needs_followup"
  >("all");

  const handleToggleFollowup = async (callId: string, nextFollowedUp: boolean) => {
    // Optimistic update
    setMarkedFollowedUp((prev) => ({ ...prev, [callId]: nextFollowedUp }));
    setCalls((prev) =>
      prev.map((c) =>
        c.id === callId || c.call_id === callId ? { ...c, is_followed_up: nextFollowedUp } : c
      )
    );
    if (detailCall && (detailCall.id === callId || detailCall.call_id === callId)) {
      setDetailCall({ ...detailCall, is_followed_up: nextFollowedUp });
    }
    try {
      await api.updateCallFollowup(callId, nextFollowedUp);
    } catch (err) {
      console.error("Failed to update call follow-up status:", err);
      // Revert on error
      setMarkedFollowedUp((prev) => ({ ...prev, [callId]: !nextFollowedUp }));
      setCalls((prev) =>
        prev.map((c) =>
          c.id === callId || c.call_id === callId ? { ...c, is_followed_up: !nextFollowedUp } : c
        )
      );
    }
  };

  // Dual-Voice Dialogue Engine State & Refs
  const [activePlayingTurnIndex, setActivePlayingTurnIndex] = useState<number | null>(null);
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const activeTurnRef = useRef<number | null>(null);
  const turnPauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHistoricalCalls = () => {
    api
      .getPortalCalls({
        urgency: filterUrgency || undefined,
        outcome: filterOutcome || undefined,
        limit: 100,
      })
      .then((data) => setCalls(data || []))
      .catch((err) => console.error("Failed to load calls:", err))
      .finally(() => setLoading(false));
  };

  const fetchLiveCalls = () => {
    api
      .getLiveActiveCalls()
      .then((data) => {
        const raw = data || [];
        // Deduplicate live calls by call_id or id so duplicate cards never render
        const unique = raw.filter(
          (c, idx, arr) =>
            arr.findIndex(
              (x) =>
                (x.call_id && c.call_id && x.call_id.trim() === c.call_id.trim()) ||
                (x.id && c.id && x.id.trim() === c.id.trim())
            ) === idx
        );
        setLiveCalls(unique);
      })
      .catch((err) => console.error("Failed to load active calls:", err));
  };

  // Poll for active calls every 4s and historical calls every 8s
  useEffect(() => {
    fetchLiveCalls();
    fetchHistoricalCalls();
    const liveInterval = setInterval(fetchLiveCalls, 4000);
    const histInterval = setInterval(fetchHistoricalCalls, 8000);

    // Deep link from CRM or external notification (?call_id=...&autoplay=true)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const targetCallId = params.get("call_id") || params.get("search");
      const shouldAutoPlay = params.get("autoplay") === "true" || params.get("play") === "true";
      if (targetCallId) {
        setSearchQuery(targetCallId);
        handleSelectCall(targetCallId, shouldAutoPlay);
      }
    }

    return () => {
      clearInterval(liveInterval);
      clearInterval(histInterval);
    };
  }, [filterUrgency, filterOutcome]);

  // LiveKit WebRTC Audio Stream & WebSocket Supervision Event Bridge
  useEffect(() => {
    if (!supervisingCall) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
      audioElementsRef.current.forEach((el) => {
        try {
          el.pause();
          el.srcObject = null;
          el.remove();
        } catch {}
      });
      audioElementsRef.current = [];
      setWsStatus("disconnected");
      setWsLiveEvents([]);
      setLiveDialogue([]);
      setIsBargeMicActive(false);
      setWebrtcAudioActive(false);
      return;
    }

    let isMounted = true;

    // 1. Establish LiveKit WebRTC Room Connection for Real-Time Audio (Listening & Barging)
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    livekitRoomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach();
        audioElement.volume = 1.0;
        document.body.appendChild(audioElement);
        audioElementsRef.current.push(audioElement);
        audioElement.play().catch(() => {});
        if (isMounted) setWebrtcAudioActive(true);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((el) => {
        try {
          el.remove();
        } catch {}
      });
    });

    // Real-time spoken dialogue data packets over LiveKit WebRTC data channel
    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      try {
        const decoded = JSON.parse(new TextDecoder().decode(payload));
        if (decoded.type === "transcript_turn") {
          setLiveDialogue((prev) => {
            const exists = prev.some((t) => t.text === decoded.text && t.role === decoded.role);
            if (!exists) {
              return [...prev, { role: decoded.role, text: decoded.text, time: decoded.time || new Date().toISOString() }];
            }
            return prev;
          });
        }
      } catch {}
    });

    room.on(RoomEvent.Disconnected, () => {
      if (isMounted) {
        setWebrtcAudioActive(false);
        setIsBargeMicActive(false);
      }
    });

    // Request LiveKit Token and join audio room
    api.getSupervisionToken(supervisingCall.call_id)
      .then((res) => {
        if (!isMounted) return;
        return room.connect(res.livekit_url, res.token);
      })
      .then(() => {
        if (!isMounted) return;
        setWebrtcAudioActive(true);
        // Play any tracks already published in the room
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            if (pub.track && pub.track.kind === Track.Kind.Audio) {
              const audioElement = pub.track.attach();
              audioElement.volume = 1.0;
              document.body.appendChild(audioElement);
              audioElementsRef.current.push(audioElement);
              audioElement.play().catch(() => {});
            }
          });
        });
      })
      .catch((err) => {
        console.warn("LiveKit WebRTC supervision stream notice:", err);
      });

    // 2. Establish WebSocket Bridge for real-time text events & supervisor telemetry
    const token = typeof window !== "undefined" ? localStorage.getItem("vedavoice_token") : "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let host = window.location.host;
    if (host.startsWith("dashboard.")) {
      host = host.replace(/^dashboard\./, "api.");
    } else if (host.includes("localhost") || host.includes("127.0.0.1")) {
      host = "127.0.0.1:8000";
    }
    const wsUrl = `${protocol}//${host}/api/v1/portal/calls/${supervisingCall.call_id}/stream?token=${encodeURIComponent(token || "")}`;

    setWsStatus("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isMounted) setWsStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setWsLiveEvents((prev) => [...prev, payload]);

        // Real-time dialogue turns from API
        if (payload.event === "call_turn" && payload.turn) {
          setLiveDialogue((prev) => {
            const exists = prev.some((t) => t.text === payload.turn.text && t.role === payload.turn.role);
            if (!exists) {
              return [...prev, payload.turn];
            }
            return prev;
          });
        }
        if (payload.event === "call_snapshot" && payload.transcript && payload.transcript.length > 0) {
          setLiveDialogue((prev) => (prev.length === 0 ? payload.transcript : prev));
        }

        if (
          payload.event === "whisper_dispatched" ||
          payload.event === "barge_in_activated" ||
          payload.event === "takeover_activated" ||
          payload.event === "call_transferred" ||
          payload.event === "call_turn"
        ) {
          fetchLiveCalls();
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };

    ws.onclose = () => {
      if (isMounted) setWsStatus("disconnected");
    };

    ws.onerror = (err) => {
      console.error("Supervision WebSocket error:", err);
      if (isMounted) setWsStatus("disconnected");
    };

    return () => {
      isMounted = false;
      ws.close();
      room.disconnect();
      audioElementsRef.current.forEach((el) => {
        try {
          el.pause();
          el.srcObject = null;
          el.remove();
        } catch {}
      });
      audioElementsRef.current = [];
    };
  }, [supervisingCall?.call_id]);

  const handleBargeIn = async (callId: string) => {
    if (wsStatus === "disconnected" || supervisingCall?.outcome === "completed" || supervisingCall?.outcome === "ended") {
      alert("This call session has already concluded and is no longer active for barge-in.");
      return;
    }

    setActionInProgress("barge_in");
    const nextMicState = !isBargeMicActive;
    setLiveCalls((prev) =>
      prev.map((c) => (c.call_id === callId ? { ...c, barge_in_active: nextMicState } : c))
    );
    try {
      if (livekitRoomRef.current && (livekitRoomRef.current.state === ConnectionState.Connected || (livekitRoomRef.current.state as any) === "connected")) {
        try {
          await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(nextMicState);
        } catch (micErr: any) {
          console.warn("Local WebRTC microphone track notice:", micErr?.message || micErr);
        }
      }
      setIsBargeMicActive(nextMicState);
      await api.bargeInCall(callId, nextMicState);
      fetchLiveCalls();
    } catch (err: any) {
      console.warn("Notice updating barge-in status:", err?.message || err);
      fetchLiveCalls();
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTakeover = async (callId: string) => {
    if (wsStatus === "disconnected" || supervisingCall?.outcome === "completed" || supervisingCall?.outcome === "ended") {
      alert("This call session has already concluded and cannot be taken over.");
      return;
    }

    if (
      !confirm(
        "Are you sure you want to take over this call? The AI agent will be disconnected from the room and the customer will hear you directly."
      )
    ) {
      return;
    }
    setActionInProgress("takeover");
    setLiveCalls((prev) =>
      prev.map((c) => (c.call_id === callId ? { ...c, takeover_active: true } : c))
    );
    try {
      if (livekitRoomRef.current && (livekitRoomRef.current.state === ConnectionState.Connected || (livekitRoomRef.current.state as any) === "connected")) {
        try {
          await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(true);
          setIsBargeMicActive(true);
        } catch (micErr: any) {
          console.warn("Local WebRTC takeover mic notice:", micErr?.message || micErr);
        }
      }
      await api.takeoverCall(callId);
      fetchLiveCalls();
    } catch (err: any) {
      console.warn("Notice updating takeover status:", err?.message || err);
      fetchLiveCalls();
    } finally {
      setActionInProgress(null);
    }
  };

  const handleEndCall = async (callId: string) => {
    if (!confirm("Are you sure you want to end and dismiss this call session?")) {
      return;
    }
    // Optimistically remove card and close modal immediately
    setLiveCalls((prev) => prev.filter((c) => c.call_id !== callId && c.id !== callId));
    if (supervisingCall?.call_id === callId) {
      setSupervisingCall(null);
    }
    setActionInProgress("end_call");
    try {
      if (livekitRoomRef.current && supervisingCall?.call_id === callId) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
        setIsBargeMicActive(false);
      }
      await api.endCall(callId);
      fetchLiveCalls();
      fetchHistoricalCalls();
    } catch (err: any) {
      console.warn("Notice ending call:", err?.message || err);
      fetchLiveCalls();
      fetchHistoricalCalls();
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

  // Preload and cache browser speech synthesis voices
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const handleVoices = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handleVoices);
      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoices);
      };
    }
  }, []);

  // Stop playback on unmount
  useEffect(() => {
    return () => {
      stopAudioPlayback();
    };
  }, []);

  const stopAudioPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (turnPauseTimeoutRef.current) {
      clearTimeout(turnPauseTimeoutRef.current);
      turnPauseTimeoutRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setActivePlayingTurnIndex(null);
    activeTurnRef.current = null;
  };

  const playDialogueTurn = (
    turnIndex: number,
    transcript: any[],
    speed: number,
    muted: boolean
  ) => {
    if (muted || !transcript || turnIndex >= transcript.length) {
      setIsPlaying(false);
      setActivePlayingTurnIndex(null);
      activeTurnRef.current = null;
      setPlaybackProgress(100);
      return;
    }

    const turn = transcript[turnIndex];
    const rawText = turn?.text || turn?.content || turn?.message || "";
    const cleanedText = cleanDialogueText(rawText);

    if (!cleanedText) {
      playDialogueTurn(turnIndex + 1, transcript, speed, muted);
      return;
    }

    setActivePlayingTurnIndex(turnIndex);
    activeTurnRef.current = turnIndex;
    setPlaybackProgress(Math.min(100, Math.round(((turnIndex + 1) / transcript.length) * 100)));

    if (autoScrollTranscript && typeof document !== "undefined") {
      const turnEl = document.getElementById(`transcript-turn-${turnIndex}`);
      if (turnEl) {
        turnEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    const isAssistant = turn.role === "assistant";
    const { assistantVoice, callerVoice } = getDualVoices();

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = speed;
    utterance.volume = muted ? 0 : 0.95;

    if (isAssistant) {
      if (assistantVoice) utterance.voice = assistantVoice;
      utterance.pitch = 1.05; // Friendly, crisp receptionist tone
    } else {
      if (callerVoice) utterance.voice = callerVoice;
      // Lower pitch ensures distinct vocal contrast between caller and receptionist
      utterance.pitch = 0.88;
    }

    utterance.onend = () => {
      // 250ms conversational breathing pause between turns
      turnPauseTimeoutRef.current = setTimeout(() => {
        playDialogueTurn(turnIndex + 1, transcript, speed, muted);
      }, 250);
    };

    utterance.onerror = (e) => {
      if (e.error === "canceled" || e.error === "interrupted") {
        return;
      }
      turnPauseTimeoutRef.current = setTimeout(() => {
        playDialogueTurn(turnIndex + 1, transcript, speed, muted);
      }, 250);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleSelectCall = (id: string, autoPlay: boolean = false) => {
    setSelectedCallId(id);
    setLoadingDetail(true);
    stopAudioPlayback();
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
    api
      .getPortalCallDetail(id)
      .then((res) => {
        setDetailCall(res);
        const hasDirectRecording = Boolean(
          res.recording_url &&
          res.recording_url.startsWith("http") &&
          !res.recording_url.includes("audio-stream")
        );
        const streamUrl = res.recording_url || (res.call_id ? `/api/v1/portal/calls/${res.call_id}/audio-stream` : "");
        setActiveAudioUrl(streamUrl);
        setAudioSourceType(hasDirectRecording ? "stream" : "synthetic");
        if (audioRef.current && streamUrl) {
          audioRef.current.src = streamUrl;
          audioRef.current.load();
        }

        if (autoPlay) {
          setTimeout(() => {
            setIsPlaying(true);
            if (hasDirectRecording && audioRef.current) {
              audioRef.current.play().catch(() => {});
            } else if (
              typeof window !== "undefined" &&
              "speechSynthesis" in window &&
              res.transcript &&
              res.transcript.length > 0
            ) {
              window.speechSynthesis.cancel();
              playDialogueTurn(0, res.transcript, 1, false);
            } else if (audioRef.current) {
              audioRef.current.play().catch(() => {});
            }
          }, 400);
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
    if (isPlaying) {
      stopAudioPlayback();
    } else {
      setIsPlaying(true);

      const hasCloudRecording = Boolean(
        detailCall?.recording_url &&
        detailCall.recording_url.startsWith("http") &&
        !detailCall.recording_url.includes("audio-stream")
      );

      if (hasCloudRecording && audioRef.current) {
        audioRef.current.muted = isMuted;
        audioRef.current.volume = isMuted ? 0 : 1.0;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.play().catch((err) => {
          console.warn("Direct recording playback failed:", err);
        });
      } else if (
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        detailCall?.transcript &&
        detailCall.transcript.length > 0
      ) {
        window.speechSynthesis.cancel();
        if (turnPauseTimeoutRef.current) clearTimeout(turnPauseTimeoutRef.current);
        const startIdx =
          activeTurnRef.current !== null && activeTurnRef.current < detailCall.transcript.length
            ? activeTurnRef.current
            : 0;
        playDialogueTurn(startIdx, detailCall.transcript, playbackSpeed, isMuted);
      } else if (audioRef.current) {
        audioRef.current.muted = isMuted;
        audioRef.current.volume = isMuted ? 0 : 1.0;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleSkipTurn = (direction: -1 | 1) => {
    const hasCloudRecording = Boolean(
      detailCall?.recording_url &&
      detailCall.recording_url.startsWith("http") &&
      !detailCall.recording_url.includes("audio-stream")
    );

    if (hasCloudRecording && audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + direction * 5);
      return;
    }

    if (!detailCall?.transcript || detailCall.transcript.length === 0) return;
    const current = activeTurnRef.current ?? 0;
    const target = Math.max(0, Math.min(detailCall.transcript.length - 1, current + direction));

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      if (turnPauseTimeoutRef.current) clearTimeout(turnPauseTimeoutRef.current);
      if (isPlaying) {
        playDialogueTurn(target, detailCall.transcript, playbackSpeed, isMuted);
      } else {
        setActivePlayingTurnIndex(target);
        activeTurnRef.current = target;
        setPlaybackProgress(Math.min(100, Math.round(((target + 1) / detailCall.transcript.length) * 100)));
        const turnEl = document.getElementById(`transcript-turn-${target}`);
        if (turnEl) turnEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  };

  const handleJumpToTurn = (index: number) => {
    if (!detailCall?.transcript || index >= detailCall.transcript.length) return;
    stopAudioPlayback();
    setIsPlaying(true);
    playDialogueTurn(index, detailCall.transcript, playbackSpeed, isMuted);
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
    stopAudioPlayback();
    setPlaybackProgress(0);
    setAudioCurrentTime(0);
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
        stopAudioPlayback();
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
    const summaryMatch = c.summary?.toLowerCase().includes(q) ?? false;
    const serviceMatch = c.service_requested?.toLowerCase().includes(q) ?? false;
    const matchesSearch =
      !q || nameMatch || phoneMatch || addrMatch || idMatch || summaryMatch || serviceMatch;

    if (!matchesSearch) return false;

    if (activePreset === "emergencies") {
      return c.urgency === "emergency";
    }
    if (activePreset === "bookings") {
      return (
        c.outcome === "appointment_scheduled" ||
        c.outcome === "quote_provided" ||
        c.outcome === "transfer_requested"
      );
    }
    if (activePreset === "messages") {
      return c.outcome === "message_taken";
    }
    if (activePreset === "needs_followup") {
      const isDone = c.is_followed_up ?? markedFollowedUp[c.id] ?? false;
      return (
        !isDone &&
        (c.urgency === "emergency" || c.urgency === "urgent" || c.outcome === "message_taken")
      );
    }
    return true;
  });

  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

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
                    disabled={actionInProgress === "barge_in" || call.outcome === "completed" || call.outcome === "ended"}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50 ${
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
                    disabled={actionInProgress === "takeover" || call.takeover_active || call.outcome === "completed" || call.outcome === "ended"}
                    className="px-2 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <PhoneOff className="w-3 h-3" />
                    Takeover
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTransferModal(call.call_id)}
                    className="px-2 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <PhoneForwarded className="w-3 h-3 text-emerald-600" />
                    Transfer
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEndCall(call.call_id)}
                    disabled={actionInProgress === "end_call"}
                    className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <PhoneOff className="w-3 h-3 text-rose-600" />
                    End / Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Filter Presets for Shop Owners */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setActivePreset("all")}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            activePreset === "all"
              ? "bg-zinc-900 text-white shadow-sm"
              : "bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          }`}
        >
          <span>All Calls</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activePreset === "all" ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {calls.length}
          </span>
        </button>

        <button
          onClick={() => setActivePreset("emergencies")}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            activePreset === "emergencies"
              ? "bg-red-600 text-white shadow-sm"
              : "bg-white border border-zinc-200 text-red-700 hover:bg-red-50/50"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-red-500 fill-current" />
          <span>Emergencies &amp; Leaks</span>
          {calls.filter((c) => c.urgency === "emergency").length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                activePreset === "emergencies"
                  ? "bg-red-700 text-white"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {calls.filter((c) => c.urgency === "emergency").length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActivePreset("bookings")}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            activePreset === "bookings"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-white border border-zinc-200 text-indigo-700 hover:bg-indigo-50/50"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Bookings &amp; Quotes</span>
          {calls.filter(
            (c) =>
              c.outcome === "appointment_scheduled" ||
              c.outcome === "quote_provided" ||
              c.outcome === "transfer_requested"
          ).length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activePreset === "bookings"
                  ? "bg-indigo-700 text-white"
                  : "bg-indigo-100 text-indigo-800"
              }`}
            >
              {
                calls.filter(
                  (c) =>
                    c.outcome === "appointment_scheduled" ||
                    c.outcome === "quote_provided" ||
                    c.outcome === "transfer_requested"
                ).length
              }
            </span>
          )}
        </button>

        <button
          onClick={() => setActivePreset("messages")}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            activePreset === "messages"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-white border border-zinc-200 text-emerald-700 hover:bg-emerald-50/50"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Messages Taken</span>
          {calls.filter((c) => c.outcome === "message_taken").length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activePreset === "messages"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {calls.filter((c) => c.outcome === "message_taken").length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActivePreset("needs_followup")}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
            activePreset === "needs_followup"
              ? "bg-amber-500 text-zinc-950 shadow-sm"
              : "bg-white border border-zinc-200 text-amber-800 hover:bg-amber-50/50"
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Needs Follow-up</span>
          {calls.filter((c) => {
            const isDone = c.is_followed_up ?? markedFollowedUp[c.id] ?? false;
            return (
              !isDone &&
              (c.urgency === "emergency" || c.urgency === "urgent" || c.outcome === "message_taken")
            );
          }).length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black ${
                activePreset === "needs_followup"
                  ? "bg-amber-600 text-zinc-950"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              {
                calls.filter((c) => {
                  const isDone = c.is_followed_up ?? markedFollowedUp[c.id] ?? false;
                  return (
                    !isDone &&
                    (c.urgency === "emergency" ||
                      c.urgency === "urgent" ||
                      c.outcome === "message_taken")
                  );
                }).length
              }
            </span>
          )}
        </button>
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
            placeholder="Search by caller, phone, address, or service issue..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-300 bg-white text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 font-mono shadow-xs"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Urgency Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl border border-zinc-200 bg-white text-xs shadow-xs">
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
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 font-medium focus:outline-none focus:border-zinc-900 shadow-xs"
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

      {/* Responsive Call List: Desktop Table (hidden on mobile) */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 font-mono text-[10px] uppercase text-zinc-500 font-bold">
            <tr>
              <th className="p-3.5 w-28">Status / Urgency</th>
              <th className="p-3.5">Customer &amp; Request</th>
              <th className="p-3.5 w-44">Callback &amp; Address</th>
              <th className="p-3.5 w-32">Duration &amp; Turns</th>
              <th className="p-3.5 w-28">
                <span className="flex items-center gap-1">
                  QA &amp; CSAT
                  <InfoTrigger topic="call_latency_metrics" />
                </span>
              </th>
              <th className="p-3.5 w-28 text-right">Date &amp; Time</th>
              <th className="p-3.5 w-52 text-right">Quick Actions</th>
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
                <td colSpan={7} className="p-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <EmptyCallsIllustration className="w-16 h-16" />
                    <p className="text-xs font-semibold text-slate-600">No calls matching your criteria.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedCalls.map((call) => {
                const isDone = call.is_followed_up ?? markedFollowedUp[call.id] ?? false;

                return (
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
                    <td className="p-3.5 font-sans">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-zinc-900 text-xs">
                          {call.caller_name || "Unknown Caller"}
                        </span>
                        {call.service_requested && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {call.service_requested}
                          </span>
                        )}
                      </div>
                      {call.summary && (
                        <p
                          className="text-[11px] text-zinc-600 italic line-clamp-1 max-w-sm mt-0.5"
                          title={call.summary}
                        >
                          &ldquo;{call.summary}&rdquo;
                        </p>
                      )}
                    </td>
                    <td className="p-3.5">
                      <div className="text-zinc-800 font-semibold font-mono text-xs">
                        {call.caller_number || "Unavailable"}
                      </div>
                      <div
                        className="text-[11px] text-zinc-500 font-sans truncate max-w-[170px]"
                        title={call.service_address || "None specified"}
                      >
                        {call.service_address || "None specified"}
                      </div>
                    </td>
                    <td className="p-3.5 text-zinc-600 font-mono">
                      <div>
                        {Math.floor(call.duration_s / 60)}m {Math.floor(call.duration_s % 60)}s
                      </div>
                      <div className="text-[10px] text-zinc-400 font-sans">
                        {call.turn_count} turns
                      </div>
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
                      </div>
                    </td>
                    <td className="p-3.5 text-right font-sans">
                      <div className="font-semibold text-zinc-900 text-xs">
                        {new Date(call.started_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {new Date(call.started_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </td>
                    <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 font-sans">
                        {call.caller_number && (
                          <a
                            href={`tel:${call.caller_number}`}
                            className="p-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1 border border-emerald-200 transition-colors shadow-2xs"
                            title="Call customer back"
                          >
                            <PhoneCall className="w-3 h-3 text-emerald-600" />
                            <span>Call</span>
                          </a>
                        )}
                        {call.caller_number && (
                          <a
                            href={`sms:${call.caller_number}?body=Hi%20${encodeURIComponent(
                              call.caller_name || ""
                            )},%20this%20is%20regarding%20your%20call.`}
                            className="p-1.5 px-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-bold flex items-center gap-1 border border-zinc-200 transition-colors shadow-2xs"
                            title="Send SMS"
                          >
                            <Send className="w-3 h-3" />
                            <span>SMS</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectCall(call.id);
                            setTimeout(() => {
                              handleTogglePlay();
                            }, 300);
                          }}
                          className="p-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors"
                          title="Play Call Audio"
                        >
                          <Play className="w-3 h-3 fill-current text-white" />
                          <span>Play</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleFollowup(call.id, !isDone)}
                          className={`p-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 border transition-colors shadow-2xs ${
                            isDone
                              ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold"
                              : "border-zinc-200 text-zinc-500 hover:bg-zinc-100"
                          }`}
                          title="Toggle Handled / Contacted status"
                        >
                          {isDone ? "✓ Handled" : "Contact"}
                        </button>
                        <a
                          href={`/portal/crm?contact_id=${call.contact_id || ""}&phone=${encodeURIComponent(call.caller_number || "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 px-2 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 border border-zinc-200 text-zinc-600 hover:text-purple-700 hover:bg-purple-50 hover:border-purple-200 transition-colors shadow-2xs"
                          title="View lead card in CRM Pipeline"
                        >
                          <Users className="w-3 h-3 text-purple-600" />
                          <span>CRM</span>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Responsive Call List: Mobile Cards (< 768px) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="p-8 text-center text-zinc-500 font-mono text-xs bg-white rounded-2xl border border-zinc-200">
            Loading call records...
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-sans text-xs bg-white rounded-2xl border border-slate-200">
            <div className="flex flex-col items-center justify-center space-y-3">
              <EmptyCallsIllustration className="w-16 h-16" />
              <p className="text-xs font-semibold text-slate-600">No calls matching your criteria.</p>
            </div>
          </div>
        ) : (
          paginatedCalls.map((call) => {
            const isDone = call.is_followed_up ?? markedFollowedUp[call.id] ?? false;

            return (
              <div
                key={call.id}
                onClick={() => handleSelectCall(call.id)}
                className={`p-4 rounded-2xl border bg-white shadow-xs space-y-3 transition-colors cursor-pointer ${
                  selectedCallId === call.id
                    ? "border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                {/* Header: Urgency + Time + Handled status */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
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

                    <span className="text-[11px] font-mono text-zinc-500">
                      {Math.floor(call.duration_s / 60)}m {Math.floor(call.duration_s % 60)}s
                    </span>
                  </div>

                  <span className="text-[11px] font-sans text-zinc-500 font-medium">
                    {new Date(call.started_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Caller & Contact Info */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-zinc-900 font-sans">
                      {call.caller_name || "Unknown Caller"}
                    </span>
                    <span className="text-xs font-mono font-semibold text-zinc-700">
                      {call.caller_number || "Unavailable"}
                    </span>
                  </div>
                  {call.service_address && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-sans truncate">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{call.service_address}</span>
                    </div>
                  )}
                  <div className="pt-1">
                    <a
                      href={`/portal/crm?contact_id=${call.contact_id || ""}&phone=${encodeURIComponent(call.caller_number || "")}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors shadow-2xs font-sans"
                      title="Open lead profile and timeline in CRM"
                    >
                      <Users className="w-3.5 h-3.5 text-purple-600" />
                      <span>View in CRM Pipeline →</span>
                    </a>
                  </div>
                </div>

                {/* Customer Request Summary Box */}
                {(call.summary || call.service_requested) && (
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-800 space-y-1">
                    {call.service_requested && (
                      <div className="font-semibold text-zinc-900 text-[11px]">
                        🛠 {call.service_requested}
                      </div>
                    )}
                    {call.summary && (
                      <p className="text-zinc-600 italic line-clamp-2">
                        &ldquo;{call.summary}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Mobile Quick Action Buttons (Large, Touch-Friendly) */}
                <div
                  className="grid grid-cols-4 gap-1.5 pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {call.caller_number ? (
                    <a
                      href={`tel:${call.caller_number}`}
                      className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      Call
                    </a>
                  ) : (
                    <div />
                  )}
                  {call.caller_number ? (
                    <a
                      href={`sms:${call.caller_number}?body=Hi%20${encodeURIComponent(
                        call.caller_name || ""
                      )},%20this%20is%20regarding%20your%20call.`}
                      className="py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs flex items-center justify-center gap-1 border border-zinc-200 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      SMS
                    </a>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectCall(call.id);
                      setTimeout(() => {
                        handleTogglePlay();
                      }, 300);
                    }}
                    className="py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-colors"
                  >
                    <Play className="w-3 h-3 fill-current text-white" />
                    Play
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFollowup(call.id, !isDone)}
                    className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 border transition-colors ${
                      isDone
                        ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold"
                        : "border-zinc-200 bg-white text-zinc-600"
                    }`}
                  >
                    {isDone ? "✓ Done" : "Mark"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      {filteredCalls.length > 0 && (
        <PaginationBar
          currentPage={currentPage}
          totalItems={filteredCalls.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50]}
        />
      )}

      {/* Slide-out Call Detail Drawer with Audio Waveform & Turn Waterfall */}
      {selectedCallId && (
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-zinc-200 shadow-2xl p-6 z-50 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 font-bold">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" />
                  Call Telemetry &amp; Audio Inspection
                </span>
                {detailCall?.outcome && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      detailCall.outcome === "message_taken"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : detailCall.outcome === "ended_by_supervisor"
                        ? "bg-purple-50 text-purple-700 border border-purple-200"
                        : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                    }`}
                  >
                    {detailCall.outcome.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-zinc-900 font-mono">
                {detailCall?.call_id || "Loading..."}
              </h2>
              {detailCall?.started_at && (
                <div className="text-[11px] font-sans text-zinc-500">
                  {new Date(detailCall.started_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  at{" "}
                  {new Date(detailCall.started_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  • Duration: {Math.floor(detailCall.duration_s / 60)}m{" "}
                  {Math.floor(detailCall.duration_s % 60)}s ({detailCall.turn_count} turns)
                </div>
              )}
            </div>
            <button
              onClick={() => {
                stopAudioPlayback();
                setSelectedCallId(null);
              }}
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
                {/* HTML5 Audio Stream Element */}
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
                    {audioSourceType === "stream" ? (
                      <span className="text-[9px] uppercase tracking-wider bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                        <span className={`w-1.5 h-1.5 rounded-full bg-emerald-600 ${isPlaying ? "animate-ping" : ""}`} />
                        Telephony HD Recording
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-wider bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                        <span className={`w-1.5 h-1.5 rounded-full bg-indigo-600 ${isPlaying ? "animate-ping" : ""}`} />
                        Dual-Voice Replay (Receptionist ♀ &amp; Caller ♂)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Playback Speed Toggles */}
                    {([1, 1.25, 1.5, 2] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => {
                          setPlaybackSpeed(spd);
                          if (audioRef.current) audioRef.current.playbackRate = spd;
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

                {/* Player Controls Bar with Skip and Turn-by-Turn Telemetry */}
                <div className="flex items-center justify-between gap-2.5 pt-1">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSkipTurn(-1)}
                      title="Previous Turn / Skip -5s"
                      className="p-2 rounded-lg bg-zinc-200/80 hover:bg-zinc-300 text-zinc-800 transition-colors shadow-2xs"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      className="p-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold transition-colors flex items-center gap-1.5 text-xs shadow-sm"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{isPlaying ? "Pause" : "Play Recording"}</span>
                      <AcousticWaveformEqualizer isPlaying={isPlaying} barCount={5} className="h-3.5 ml-1" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkipTurn(1)}
                      title="Next Turn / Skip +5s"
                      className="p-2 rounded-lg bg-zinc-200/80 hover:bg-zinc-300 text-zinc-800 transition-colors shadow-2xs"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>

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

                  <span className="text-[11px] font-mono text-zinc-600 font-semibold min-w-[85px] text-right">
                    {activePlayingTurnIndex !== null && detailCall.transcript?.length
                      ? `Turn ${activePlayingTurnIndex + 1}/${detailCall.transcript.length}`
                      : `${Math.floor(audioCurrentTime)}s / ${Math.round(detailCall.duration_s)}s`}
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

                      <div className="flex items-center gap-1.5">
                        <a
                          href={`tel:${detailCall.message.phone}`}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 transition-colors shadow-xs"
                          title="Call customer"
                        >
                          <PhoneForwarded className="w-3 h-3" />
                          Call Back
                        </a>
                        <a
                          href={`sms:${detailCall.message.phone}?body=Hi%20${encodeURIComponent(
                            detailCall.message.name || ""
                          )},%20this%20is%20regarding%20your%20call.`}
                          className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold flex items-center gap-1 transition-colors border border-zinc-200 shadow-xs"
                          title="Text customer"
                        >
                          <Send className="w-3 h-3" />
                          SMS
                        </a>
                      </div>
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
                      onClick={() => {
                        const current =
                          detailCall.is_followed_up ?? markedFollowedUp[detailCall.id] ?? false;
                        handleToggleFollowup(detailCall.id, !current);
                      }}
                      className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                        detailCall.is_followed_up ?? markedFollowedUp[detailCall.id]
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold shadow-xs"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      {detailCall.is_followed_up ?? markedFollowedUp[detailCall.id]
                        ? "✓ Followed Up (Saved)"
                        : "Mark as Contacted"}
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

              {/* Emergency Whisper Briefing Card (Phase D) */}
              {detailCall.whisper_briefing && (
                <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/80 text-red-950 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold font-mono">
                    <span className="flex items-center gap-1.5 text-red-700">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      Life Safety Emergency Briefing (On-Call Tech)
                    </span>
                    {detailCall.emergency_alert_dispatched && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                        🚨 Urgent SMS Dispatched
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/90 border border-red-200 text-xs font-mono text-red-900">
                    &ldquo;{detailCall.whisper_briefing}&rdquo;
                  </div>
                  {detailCall.emergency_recipient_phone && (
                    <p className="text-[11px] text-red-800">
                      Dispatched to On-Call Tech Line:{" "}
                      <span className="font-mono font-bold text-red-950">
                        {detailCall.emergency_recipient_phone}
                      </span>
                    </p>
                  )}
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

              {/* Turn-by-Turn Transcript with Micro-Latency Badges & Real-Time Speaking Sync */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                      Turn-by-Turn Transcript ({detailCall.transcript.length} turns)
                    </h3>
                    <span className="text-[10px] text-zinc-500 font-sans hidden sm:inline">
                      • Click any turn to play
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsRedactedPII(!isRedactedPII)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono border transition-colors flex items-center gap-1.5 ${
                        isRedactedPII
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-bold"
                          : "bg-zinc-100 border-zinc-200 text-zinc-500"
                      }`}
                      title="Toggle Customer PII Masking"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      PII Masking {isRedactedPII ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoScrollTranscript(!autoScrollTranscript)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono border transition-colors flex items-center gap-1.5 ${
                        autoScrollTranscript
                          ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold"
                          : "bg-zinc-100 border-zinc-200 text-zinc-500"
                      }`}
                      title="Toggle auto-scrolling to active speech turn"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          autoScrollTranscript ? "bg-emerald-600 animate-pulse" : "bg-zinc-400"
                        }`}
                      />
                      Auto-scroll {autoScrollTranscript ? "On" : "Off"}
                    </button>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Dialed: {detailCall.dialed_number}
                    </span>
                  </div>
                </div>

                {/* TCPA Recording Notice Indicator */}
                {detailCall.transcript.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-xl bg-zinc-50 border border-zinc-200">
                    {detailCall.transcript.slice(0, 2).some((t) => {
                      const txt = ((t.text || (t as any).content || "") as string).toLowerCase();
                      return (
                        txt.includes("recorded") ||
                        txt.includes("recording") ||
                        txt.includes("quality assurance") ||
                        txt.includes("automated assistant")
                      );
                    }) ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>TCPA Compliance: In-Call Recording &amp; AI Disclosure verified in Turn 1</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>TCPA Notice: AI Recording disclosure was not detected in introductory turns</span>
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {detailCall.transcript.map((entry, idx) => {
                    const isAssistant = entry.role === "assistant";
                    const isCurrentSpeaking = activePlayingTurnIndex === idx;
                    const turnLatency =
                      isAssistant && detailCall.turn_latencies_ms
                        ? detailCall.turn_latencies_ms[Math.floor(idx / 2)]
                        : undefined;
                    const cleanedTurnText = cleanDialogueText(
                      entry.text || (entry as any).content || ""
                    );
                    const displayedTurnText = isRedactedPII
                      ? redactPII(cleanedTurnText || entry.text)
                      : cleanedTurnText || entry.text;

                    return (
                      <div
                        key={idx}
                        id={`transcript-turn-${idx}`}
                        onClick={() => handleJumpToTurn(idx)}
                        title="Click to play from this sentence"
                        className={`group p-3.5 rounded-2xl text-xs leading-relaxed space-y-2 cursor-pointer transition-all duration-200 relative ${
                          isCurrentSpeaking
                            ? "bg-emerald-50/95 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-300/40 scale-[1.01]"
                            : isAssistant
                            ? "bg-violet-50/60 border border-violet-100/90 text-zinc-900 hover:border-violet-300"
                            : "bg-white border border-zinc-200 text-zinc-900 font-medium shadow-2xs hover:border-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                          <div className="flex items-center gap-2">
                            <span
                              className={`uppercase font-bold flex items-center gap-1.5 ${
                                isCurrentSpeaking
                                  ? "text-emerald-700 font-black"
                                  : isAssistant
                                  ? "text-violet-700"
                                  : "text-zinc-700"
                              }`}
                            >
                              {isAssistant ? (
                                <>
                                  <span className="px-1 py-0.2 rounded bg-violet-100 text-violet-800">
                                    🤖
                                  </span>
                                  AI Receptionist (Female)
                                </>
                              ) : (
                                <>
                                  <span className="px-1 py-0.2 rounded bg-zinc-100 text-zinc-700">
                                    👤
                                  </span>
                                  Caller (Male)
                                </>
                              )}
                            </span>

                            {isCurrentSpeaking && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold shadow-2xs animate-pulse">
                                <Volume2 className="w-2.5 h-2.5 text-emerald-600 animate-bounce" />
                                Speaking now
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Hover Play Turn action indicator */}
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-emerald-700 font-sans flex items-center gap-0.5 font-bold">
                              <Play className="w-2.5 h-2.5 fill-current" /> Play Turn
                            </span>

                            {typeof turnLatency === "number" && (
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider font-mono ${
                                  turnLatency < 1000
                                    ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                                    : turnLatency < 1800
                                    ? "text-amber-700 bg-amber-50 border border-amber-200"
                                    : "text-red-700 bg-red-50 border border-red-200"
                                }`}
                                title={`SLA Benchmark (<1.0s P50, <1.8s P95). Full Turnaround: ${Math.round(turnLatency)}ms`}
                              >
                                {turnLatency < 1000 ? "⚡ SLA Pass " : turnLatency < 1800 ? "⏱️ SLA Target " : "⚠️ Breach "}
                                ({Math.round(turnLatency)}ms)
                              </span>
                            )}
                            <span>{entry.time ? new Date(entry.time).toLocaleTimeString() : ""}</span>
                          </div>
                        </div>
                        <p className="font-sans leading-relaxed text-zinc-800 text-xs">
                          {displayedTurnText}
                        </p>
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
                        ● {wsStatus === "connected" ? "Live Stream Active" : wsStatus === "connecting" ? "Connecting to Stream..." : "Session Concluded / Dismissed"}
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
              {wsStatus === "disconnected" ? (
                <div className="p-4 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-800 flex items-center justify-between shadow-2xs">
                  <div>
                    <div className="font-bold text-xs text-zinc-900 flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-400"></span>
                      Call Session Concluded
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      The LiveKit audio room has concluded and capacity has been released.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleEndCall(supervisingCall.call_id);
                        setSupervisingCall(null);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-mono text-[11px] font-semibold transition-colors"
                    >
                      Dismiss from Active
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSupervisingCall(null);
                        fetchLiveCalls();
                        fetchHistoricalCalls();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-[11px] font-semibold transition-colors"
                    >
                      Close Supervision
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <Radio className={`w-4 h-4 ${webrtcAudioActive ? "text-emerald-600 animate-pulse" : "text-amber-500"}`} />
                    <span>
                      {webrtcAudioActive ? "🎧 Live WebRTC Audio Stream Connected" : "Connecting Live Audio Stream..."}
                    </span>
                    {isBargeMicActive && (
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold text-[10px] animate-pulse">
                        🎙️ MIC ACTIVE (CALLER HEARS YOU)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBargeIn(supervisingCall.call_id)}
                      disabled={actionInProgress === "barge_in"}
                      className={`px-2.5 py-1 rounded border text-[11px] font-mono font-bold transition-colors ${
                        isBargeMicActive || supervisingCall.barge_in_active
                          ? "bg-purple-600 border-purple-700 text-white hover:bg-purple-500"
                          : "bg-white border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                      }`}
                    >
                      {isBargeMicActive || supervisingCall.barge_in_active ? "🎙️ Mute Barge Mic" : "🎙️ Enable Barge-In"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTakeover(supervisingCall.call_id)}
                      disabled={actionInProgress === "takeover"}
                      className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-mono font-bold hover:bg-rose-500 transition-colors"
                    >
                      🛑 Takeover
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEndCall(supervisingCall.call_id)}
                      disabled={actionInProgress === "end_call"}
                      className="px-2.5 py-1 rounded bg-zinc-800 text-white text-[11px] font-mono font-bold hover:bg-zinc-700 transition-colors"
                    >
                      ⏹️ End Call
                    </button>
                  </div>
                </div>
              )}

              {/* Live Spoken Dialogue Stream */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold text-zinc-700 uppercase font-mono tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                    Live Spoken Dialogue ({liveDialogue.length} Turns)
                  </h4>
                  <span className="text-[10px] text-zinc-400 font-mono">Real-Time WebRTC Data Stream</span>
                </div>

                {liveDialogue.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-zinc-200 bg-white text-center space-y-2">
                    <Headphones className="w-6 h-6 text-emerald-500 mx-auto animate-pulse" />
                    <div className="font-semibold text-xs text-zinc-800">Listening to Live Call Audio...</div>
                    <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                      Dialogue turns from the caller and AI receptionist will stream here in real time as they speak.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {liveDialogue.map((turn, idx) => {
                      const isAI = turn.role === "assistant" || turn.role === "agent";
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl text-xs space-y-1 shadow-2xs ${
                            isAI
                              ? "bg-indigo-50/70 border border-indigo-100 text-zinc-900"
                              : "bg-white border border-zinc-200 text-zinc-900"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className={`font-bold ${isAI ? "text-indigo-700" : "text-zinc-700"}`}>
                              {isAI ? "🤖 AI Receptionist" : "👤 Caller"}
                            </span>
                            <span className="text-zinc-400">
                              {turn.time ? new Date(turn.time).toLocaleTimeString() : ""}
                            </span>
                          </div>
                          <p className="font-sans text-xs leading-relaxed text-zinc-800">{turn.text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Interventions & Whispers Audit */}
              {wsLiveEvents.some((ev) => ev.whisper || ev.transfer_to) && (
                <div className="space-y-2 pt-2 border-t border-zinc-100">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase font-mono tracking-wider">
                    Supervisor Actions &amp; Coaching
                  </h4>
                  {wsLiveEvents
                    .filter((ev) => ev.whisper || ev.transfer_to)
                    .map((ev, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-white border border-zinc-200 text-xs font-mono space-y-1">
                        {ev.whisper && (
                          <p className="text-amber-800 font-sans text-xs bg-amber-50 p-2 rounded border border-amber-200">
                            Coach Whisper: &ldquo;{ev.whisper.instruction}&rdquo; (by {ev.whisper.supervisor_email})
                          </p>
                        )}
                        {ev.transfer_to && (
                          <p className="text-emerald-800 font-sans text-xs bg-emerald-50 p-2 rounded border border-emerald-200">
                            Transferred to: {ev.transfer_to} (Reason: {ev.reason})
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
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

              {/* Quick Coaching Suggestion Chips */}
              {wsStatus !== "disconnected" && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {[
                    "Offer $20 Diagnostic Fee Waiver",
                    "Confirm 2-4 PM Arrival Window",
                    "Ask for Gate Code & Access Notes",
                    "Emergency Safety: Locate Main Shut-Off",
                    "Ask for Equipment Serial / Model Number",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setWhisperText(chip)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-zinc-200 text-[10px] font-medium text-zinc-600 transition-colors"
                    >
                      ⚡ {chip}
                    </button>
                  ))}
                </div>
              )}

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
                  disabled={wsStatus === "disconnected"}
                  placeholder={
                    wsStatus === "disconnected"
                      ? "Call session has concluded (whisper coaching is unavailable)."
                      : "Inject coaching prompt to agent (e.g. 'Offer 10% diagnostic discount', 'Ask for unit model number')..."
                  }
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-zinc-300 font-sans focus:outline-none focus:border-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
                <button
                  type="button"
                  onClick={() => handleDispatchWhisper(supervisingCall.call_id)}
                  disabled={sendingWhisper || !whisperText.trim() || wsStatus === "disconnected"}
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
