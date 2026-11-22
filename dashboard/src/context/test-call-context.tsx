"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, RemoteTrack, Participant } from "livekit-client";
import { api, TestCallSessionResponse } from "@/lib/api";
import {
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  X,
  User,
  Bot,
  Volume2,
  Sparkles,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { AcousticWaveformEqualizer } from "@/components/ui/illustrations";
import { AnimatePresence, motion } from "framer-motion";

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant" | "agent";
  text: string;
  time?: string;
}

interface StreamingTurn {
  role: "user" | "assistant";
  text: string;
}

interface TestCallContextType {
  isCallActive: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  duration: number;
  transcripts: TranscriptTurn[];
  activeSpeaker: "agent" | "user" | "idle";
  startTestCall: () => Promise<void>;
  endTestCall: () => void;
  toggleMute: () => Promise<void>;
}

const TestCallContext = createContext<TestCallContextType>({
  isCallActive: false,
  isConnecting: false,
  isMuted: false,
  duration: 0,
  transcripts: [],
  activeSpeaker: "idle",
  startTestCall: async () => {},
  endTestCall: () => {},
  toggleMute: async () => {},
});

export function useTestCall() {
  return useContext(TestCallContext);
}

export function TestCallProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<TestCallSessionResponse | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);
  const [streamingTurn, setStreamingTurn] = useState<StreamingTurn | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<"agent" | "user" | "idle">("idle");

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript container on new messages or streaming speech
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts, streamingTurn]);

  const endTestCall = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    const el = document.getElementById("in-portal-test-audio");
    if (el) el.remove();
    setIsCallActive(false);
    setIsConnecting(false);
    setStreamingTurn(null);
    setActiveSpeaker("idle");
    setSession(null);
  };

  const startTestCall = async () => {
    if (isCallActive || isConnecting) return;
    setIsConnecting(true);
    setTranscripts([]);
    setStreamingTurn(null);
    setDuration(0);
    setIsMuted(false);
    setActiveSpeaker("idle");

    try {
      const sess = await api.createTestCallSession();
      setSession(sess);

      // Initialize WebRTC Room with resilient streaming
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Handle incoming assistant voice stream
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const prev = document.getElementById("in-portal-test-audio");
          if (prev) prev.remove();

          const audioElement = track.attach();
          audioElement.id = "in-portal-test-audio";
          audioElement.volume = 1.0;
          audioElement.autoplay = true;
          document.body.appendChild(audioElement);
          audioElement.play().catch((err) => {
            console.warn("Audio autoplay prompt notice:", err);
          });
        }
      });

      // Active speaker detection for voice animation
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (!speakers || speakers.length === 0) {
          setActiveSpeaker("idle");
          return;
        }
        const hasRemote = speakers.some((s) => !s.isLocal);
        const hasLocal = speakers.some((s) => s.isLocal);
        if (hasRemote) {
          setActiveSpeaker("agent");
        } else if (hasLocal) {
          setActiveSpeaker("user");
        } else {
          setActiveSpeaker("idle");
        }
      });

      // Authoritative complete turn packets from agent engine (agent/main.py)
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const decoded = JSON.parse(new TextDecoder().decode(payload));
          if (decoded.type === "transcript_turn" && decoded.text) {
            const textClean = decoded.text.trim();
            if (!textClean) return;

            const turnRole = decoded.role === "agent" ? "assistant" : decoded.role;

            // Clear any active streaming bubble for this turn
            setStreamingTurn(null);

            setTranscripts((prev) => {
              // Deduplicate if identical turn already committed
              const isDuplicate = prev.some(
                (t) => t.role === turnRole && t.text.trim() === textClean
              );
              if (isDuplicate) return prev;

              return [
                ...prev,
                {
                  id: `${turnRole}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  role: turnRole,
                  text: textClean,
                  time: decoded.time || new Date().toISOString(),
                },
              ];
            });
          }
        } catch (parseErr) {
          console.debug("DataReceived parse notice:", parseErr);
        }
      });

      // Streaming STT updates: update in-progress text IN-PLACE (never duplicate bubbles)
      room.on(
        RoomEvent.TranscriptionReceived,
        (transcriptions: any[], participant?: Participant) => {
          if (!Array.isArray(transcriptions) || transcriptions.length === 0) return;

          const isLocal = participant?.isLocal ?? false;
          const role: "user" | "assistant" = isLocal ? "user" : "assistant";

          // Take the latest non-empty segment text
          const latestSegment = transcriptions[transcriptions.length - 1];
          const text = (latestSegment?.text || "").trim();
          if (!text) return;

          if (latestSegment.final) {
            // Commit final segment and clear streaming preview
            setStreamingTurn(null);
            setTranscripts((prev) => {
              const exists = prev.some((t) => t.text.trim() === text && t.role === role);
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: `stt-${latestSegment.id || Date.now()}`,
                  role,
                  text,
                  time: new Date().toISOString(),
                },
              ];
            });
          } else {
            // Only update current interim preview in place
            setStreamingTurn({ role, text });
          }
        }
      );

      room.on(RoomEvent.Disconnected, () => {
        endTestCall();
      });

      await room.connect(sess.livekit_url, sess.token);

      // WebRTC Microphone configuration with active acoustic echo cancellation & noise suppression
      await room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
      });

      setIsCallActive(true);

      // Duration counter
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err: any) {
      alert(`Could not start in-portal test voice call: ${err?.message || err}`);
      endTestCall();
    } finally {
      setIsConnecting(false);
    }
  };

  const toggleMute = async () => {
    if (!roomRef.current) return;
    const nextState = !isMuted;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!nextState);
    setIsMuted(nextState);
  };

  return (
    <TestCallContext.Provider
      value={{
        isCallActive,
        isConnecting,
        isMuted,
        duration,
        transcripts,
        activeSpeaker,
        startTestCall,
        endTestCall,
        toggleMute,
      }}
    >
      {children}

      {/* Global In-Portal Interactive WebRTC Studio Audition Modal */}
      <AnimatePresence>
        {(session || isCallActive) && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="w-full max-w-2xl bg-[#0d0f12] text-white rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              {/* Premium Gradient Accent Header */}
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500" />

              {/* Title & Connection Header */}
              <div className="px-6 py-4 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-inner">
                    <Radio className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold tracking-tight text-white">
                        AI Receptionist Live Audition
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-semibold border border-emerald-500/30">
                        WebRTC HD
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-mono mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>{isCallActive ? "Live Audio Stream Connected • Sub-400ms" : "Establishing WebRTC Signal..."}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700/80 font-mono text-xs font-bold tracking-wider text-emerald-300 shadow-inner">
                    {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
                  </div>
                  <button
                    onClick={endTestCall}
                    className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Close session"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Live Status & Audio Visualizer Banner */}
              <div className="px-6 py-3.5 bg-zinc-950/80 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Headphones className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                      <span>Apex Plumbing AI Receptionist</span>
                      {activeSpeaker === "agent" && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono animate-pulse">
                          Speaking
                        </span>
                      )}
                      {activeSpeaker === "user" && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-teal-500/20 text-teal-300 font-mono animate-pulse">
                          Listening
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Try asking: <span className="text-emerald-300 font-medium">&ldquo;Hi, my water heater is leaking into my basement.&rdquo;</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 shrink-0 self-start sm:self-auto">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <AcousticWaveformEqualizer isPlaying={isCallActive && !isMuted && activeSpeaker !== "idle"} />
                </div>
              </div>

              {/* Real-time Streaming Transcript Console */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-[220px] max-h-[380px] bg-[#090a0c]">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    Live Spoken Dialogue
                  </span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Synchronized Live
                  </span>
                </div>

                {transcripts.length === 0 && !streamingTurn ? (
                  <div className="h-40 flex flex-col items-center justify-center text-center text-zinc-400 text-xs gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      <Headphones className="w-6 h-6 text-emerald-400/80 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-zinc-200">Listening to your microphone...</p>
                      <p className="text-[11px] text-zinc-400 max-w-sm">
                        Speak naturally. The receptionist will respond with natural sub-400ms latency.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Finalized Conversation Turns */}
                    {transcripts.map((turn) => {
                      const isCaller = turn.role === "user";
                      return (
                        <div
                          key={turn.id}
                          className={`flex items-start gap-3 ${isCaller ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}
                        >
                          {!isCaller && (
                            <div className="w-7 h-7 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 shadow-xs">
                              <Bot className="w-4 h-4" />
                            </div>
                          )}

                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                              isCaller
                                ? "bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-tr-xs border border-emerald-500/40"
                                : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-tl-xs"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-mono opacity-80">
                              <span className="font-bold tracking-wide">
                                {isCaller ? "You (Caller)" : "Apex AI Receptionist"}
                              </span>
                              {turn.time && (
                                <span className="text-[9px] opacity-70">
                                  {new Date(turn.time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-50 font-normal selection:bg-emerald-800">{turn.text}</p>
                          </div>

                          {isCaller && (
                            <div className="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5 shadow-xs">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Single In-Progress Streaming Turn (Updates In-Place) */}
                    {streamingTurn && streamingTurn.text && (
                      <div
                        className={`flex items-start gap-3 ${
                          streamingTurn.role === "user" ? "justify-end" : "justify-start"
                        } animate-in fade-in duration-150`}
                      >
                        {streamingTurn.role !== "user" && (
                          <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5 shadow-xs">
                            <Bot className="w-4 h-4 animate-pulse" />
                          </div>
                        )}

                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed border ${
                            streamingTurn.role === "user"
                              ? "bg-emerald-700/80 border-emerald-500 text-white rounded-tr-xs"
                              : "bg-zinc-800/80 border-zinc-700 text-zinc-100 rounded-tl-xs"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-[10px] font-mono text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            <span className="font-semibold">
                              {streamingTurn.role === "user" ? "You (Speaking...)" : "AI Receptionist (Speaking...)"}
                            </span>
                          </div>
                          <p className="font-medium text-white">
                            {streamingTurn.text}
                            <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                          </p>
                        </div>

                        {streamingTurn.role === "user" && (
                          <div className="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5 shadow-xs">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Bottom Controls Bar */}
              <div className="p-4 px-6 border-t border-zinc-800 bg-[#0d0f12] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Acoustic echo cancellation active • Headphones recommended</span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-sm ${
                      isMuted
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                    <span>{isMuted ? "Unmute Mic" : "Mute Mic"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={endTestCall}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white text-xs font-semibold transition-all shadow-lg shadow-red-950/60"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Test Call</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </TestCallContext.Provider>
  );
}
