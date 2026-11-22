"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, RemoteTrack } from "livekit-client";
import { api, TestCallSessionResponse } from "@/lib/api";
import { PhoneCall, PhoneOff, Mic, MicOff, Headphones, X, User, Bot, Volume2 } from "lucide-react";
import { AcousticWaveformEqualizer } from "@/components/ui/illustrations";
import { AnimatePresence, motion } from "framer-motion";

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant" | "agent";
  text: string;
  time?: string;
}

interface TestCallContextType {
  isCallActive: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  duration: number;
  transcripts: TranscriptTurn[];
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

  const roomRef = useRef<Room | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript container on new messages
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts]);

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
    setSession(null);
  };

  const startTestCall = async () => {
    if (isCallActive || isConnecting) return;
    setIsConnecting(true);
    setTranscripts([]);
    setDuration(0);
    setIsMuted(false);

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

      // Real-time dialogue packets from agent over LiveKit data channel
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const decoded = JSON.parse(new TextDecoder().decode(payload));
          if (decoded.type === "transcript_turn" && decoded.text) {
            setTranscripts((prev) => {
              const textClean = decoded.text.trim();
              const isDuplicate = prev.some(
                (t) => t.role === decoded.role && t.text.trim() === textClean
              );
              if (isDuplicate) return prev;
              return [
                ...prev,
                {
                  id: `${decoded.role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  role: decoded.role === "agent" ? "assistant" : decoded.role,
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

      // LiveKit Transcription event support (if server emits STT segments)
      room.on(RoomEvent.TranscriptionReceived, (transcriptions: any[]) => {
        if (Array.isArray(transcriptions)) {
          transcriptions.forEach((item) => {
            if (item?.text) {
              setTranscripts((prev) => {
                const textClean = item.text.trim();
                const isDuplicate = prev.some((t) => t.text.trim() === textClean);
                if (isDuplicate) return prev;
                return [
                  ...prev,
                  {
                    id: `transcription-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    role: item.isAgent ? "assistant" : "user",
                    text: textClean,
                    time: new Date().toISOString(),
                  },
                ];
              });
            }
          });
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        endTestCall();
      });

      await room.connect(sess.livekit_url, sess.token);

      // Microphone configuration with echo cancellation & noise suppression
      // This stops speaker feedback from looping into the mic and chopping audio
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
        startTestCall,
        endTestCall,
        toggleMute,
      }}
    >
      {children}

      {/* Global In-Portal Interactive WebRTC Test Call Modal */}
      <AnimatePresence>
        {(session || isCallActive) && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-xl bg-zinc-900 text-white rounded-3xl border border-zinc-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 rounded-2xl bg-white/20 text-white shadow-inner">
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold tracking-tight">AI Receptionist Live Audition</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
                      <p className="text-xs text-emerald-100 font-mono">
                        {isCallActive ? "Connected • In-Portal WebRTC" : "Connecting audio stream..."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="px-3 py-1.5 rounded-full bg-black/30 backdrop-blur-md font-mono text-xs font-semibold tracking-wider text-emerald-200 border border-white/10">
                    {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
                  </div>
                  <button
                    onClick={endTestCall}
                    className="p-1.5 rounded-xl bg-black/20 hover:bg-black/40 text-emerald-100 transition-colors"
                    title="Close and end call"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Receptionist Status & Audio Waveform */}
              <div className="p-5 border-b border-zinc-800 bg-zinc-950/40 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Headphones className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-100">AI Receptionist</h4>
                    <p className="text-[11px] text-zinc-400">
                      Say: <span className="text-emerald-400 font-medium">&ldquo;Hi, I have a water leak in my kitchen.&rdquo;</span>
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800/80 border border-zinc-700/60">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <AcousticWaveformEqualizer isPlaying={isCallActive && !isMuted} />
                </div>
              </div>

              {/* Real-time Streaming Transcripts Window */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-[200px] max-h-[340px] bg-zinc-950/70">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  <span>Live Call Turn Stream</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Real-time
                  </span>
                </div>

                {transcripts.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center text-center text-zinc-400 text-xs gap-2">
                    <Headphones className="w-6 h-6 text-zinc-600 animate-pulse" />
                    <p>Speak naturally into your microphone...</p>
                    <p className="text-[10px] text-zinc-400">Live caller questions and AI responses will transcribe here in real time.</p>
                  </div>
                ) : (
                  transcripts.map((turn) => {
                    const isCaller = turn.role === "user";
                    return (
                      <div
                        key={turn.id}
                        className={`flex items-start gap-2.5 ${isCaller ? "justify-end" : "justify-start"}`}
                      >
                        {!isCaller && (
                          <div className="w-6 h-6 rounded-lg bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                        )}

                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed ${
                            isCaller
                              ? "bg-emerald-600 text-white rounded-br-xs"
                              : "bg-zinc-800 border border-zinc-700/80 text-zinc-100 rounded-bl-xs"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1 text-[10px] font-mono opacity-80">
                            <span className="font-semibold">{isCaller ? "You (Caller)" : "AI Receptionist"}</span>
                            {turn.time && (
                              <span>
                                {new Date(turn.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                            )}
                          </div>
                          <p>{turn.text}</p>
                        </div>

                        {isCaller && (
                          <div className="w-6 h-6 rounded-lg bg-zinc-700/60 border border-zinc-600 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                            <User className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Bottom Controls */}
              <div className="p-5 border-t border-zinc-800 bg-zinc-900 flex items-center justify-between gap-4">
                <div className="text-[11px] text-zinc-400 hidden sm:block">
                  Echo cancellation &amp; noise suppression active
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all shadow-md ${
                      isMuted
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                        : "bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700"
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                    <span>{isMuted ? "Unmute Mic" : "Mute Mic"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={endTestCall}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white text-xs font-semibold transition-all shadow-lg shadow-red-950/50"
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
