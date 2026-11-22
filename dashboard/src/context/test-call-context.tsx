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
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-full max-w-2xl bg-white text-slate-900 rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              {/* Premium Gradient Accent Header Line */}
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600" />

              {/* Title & Connection Header */}
              <div className="px-6 py-4 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-800 shadow-xs">
                    <Radio className="w-5 h-5 animate-pulse text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
                        AI Receptionist Live Audition
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-300">
                        WebRTC HD
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-mono mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>{isCallActive ? "Live Audio Stream Connected • Sub-400ms" : "Establishing WebRTC Signal..."}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-emerald-400 font-mono text-xs font-bold tracking-wider shadow-inner">
                    {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
                  </div>
                  <button
                    onClick={endTestCall}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 transition-colors"
                    title="Close session"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Live Status & Audio Visualizer Banner */}
              <div className="px-6 py-3.5 bg-emerald-50/50 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Headphones className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>Apex Plumbing AI Receptionist</span>
                      {activeSpeaker === "agent" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono font-bold animate-pulse">
                          Speaking
                        </span>
                      )}
                      {activeSpeaker === "user" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-mono font-bold animate-pulse">
                          Listening
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Try asking: <span className="text-emerald-800 font-bold">&ldquo;Hi, my water heater is leaking into my basement.&rdquo;</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs shrink-0 self-start sm:self-auto">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-700" />
                  <AcousticWaveformEqualizer isPlaying={isCallActive && !isMuted && activeSpeaker !== "idle"} />
                </div>
              </div>

              {/* Real-time Streaming Transcript Console */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-[220px] max-h-[380px] bg-slate-50/70">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Live Spoken Dialogue
                  </span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Synchronized Live
                  </span>
                </div>

                {transcripts.length === 0 && !streamingTurn ? (
                  <div className="h-40 flex flex-col items-center justify-center text-center text-slate-400 text-xs gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center">
                      <Headphones className="w-6 h-6 text-emerald-600 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-bold text-slate-800 text-sm">Listening to your microphone...</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Speak naturally. The receptionist will respond with conversational sub-400ms latency.
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
                          className={`flex items-start gap-3 ${isCaller ? "justify-end" : "justify-start"} animate-in fade-in duration-150`}
                        >
                          {!isCaller && (
                            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                              <Bot className="w-4 h-4" />
                            </div>
                          )}

                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                              isCaller
                                ? "bg-emerald-600 text-white rounded-tr-xs border border-emerald-700"
                                : "bg-white border border-slate-200/90 text-slate-900 rounded-tl-xs"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-mono opacity-90">
                              <span className="font-bold tracking-wide">
                                {isCaller ? "You (Caller)" : "Apex AI Receptionist"}
                              </span>
                              {turn.time && (
                                <span className={`text-[9px] ${isCaller ? "text-emerald-100" : "text-slate-400"}`}>
                                  {new Date(turn.time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <p className={`${isCaller ? "text-white font-medium" : "text-slate-800 font-normal"}`}>
                              {turn.text}
                            </p>
                          </div>

                          {isCaller && (
                            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
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
                          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
                            <Bot className="w-4 h-4 animate-pulse" />
                          </div>
                        )}

                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed border shadow-xs ${
                            streamingTurn.role === "user"
                              ? "bg-indigo-50 border-indigo-300 text-slate-900 rounded-tr-xs"
                              : "bg-emerald-50 border-emerald-300 text-slate-900 rounded-tl-xs"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-[10px] font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                            <span className="font-bold text-slate-800">
                              {streamingTurn.role === "user" ? "You (Speaking...)" : "Apex AI Receptionist (Speaking...)"}
                            </span>
                          </div>
                          <p className="font-semibold text-slate-900">
                            {streamingTurn.text}
                            <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-600 animate-pulse align-middle" />
                          </p>
                        </div>

                        {streamingTurn.role === "user" && (
                          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
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
              <div className="p-4 px-6 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Acoustic echo cancellation active • Headphones recommended</span>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-xs ${
                      isMuted
                        ? "bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                        : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300"
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4 text-amber-700" /> : <Mic className="w-4 h-4 text-emerald-700" />}
                    <span>{isMuted ? "Unmute Mic" : "Mute Mic"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={endTestCall}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xs font-semibold transition-all shadow-sm"
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
