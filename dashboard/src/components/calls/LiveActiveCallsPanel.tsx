"use client";

import React, { useState } from "react";
import { LiveActiveCallItem } from "@/lib/api";
import { LiveRadarRing } from "@/components/ui/motion";
import {
  Headphones,
  LayoutGrid,
  List,
  Mic,
  PhoneForwarded,
  PhoneOff,
  Radio,
  RefreshCw,
} from "lucide-react";

interface LiveActiveCallsPanelProps {
  liveCalls: LiveActiveCallItem[];
  actingCallId: string | null;
  onRefresh: () => void;
  onOpenSupervision: (call: LiveActiveCallItem) => void;
  onBargeIn: (callId: string) => void;
  onTakeover: (callId: string) => void;
  onTransfer: (callId: string) => void;
  onEndCall: (callId: string) => void;
}

function formatDurationMMSS(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function LiveActiveCallsPanel({
  liveCalls,
  actingCallId,
  onRefresh,
  onOpenSupervision,
  onBargeIn,
  onTakeover,
  onTransfer,
  onEndCall,
}: LiveActiveCallsPanelProps) {
  const [viewMode, setViewMode] = useState<"grid" | "table">(
    liveCalls.length > 6 ? "table" : "grid"
  );
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [confirmTakeoverId, setConfirmTakeoverId] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-[var(--ink-primary)]">
              Live Active Calls &amp; Supervision
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 font-semibold">
            <LiveRadarRing color="emerald" size="sm" />
            {liveCalls.length} Active Now
          </span>
        </div>

        <div className="flex items-center gap-2">
          {liveCalls.length > 0 && (
            <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 transition-colors ${
                  viewMode === "grid"
                    ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-2 py-1 rounded-md text-[11px] font-mono flex items-center gap-1 transition-colors ${
                  viewMode === "table"
                    ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                <List className="w-3 h-3" />
                Dense
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-mono px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-subtle)] text-[var(--ink-primary)] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {liveCalls.length === 0 ? (
        <div className="text-center py-8 text-xs font-mono text-[var(--ink-muted)] bg-[var(--surface-canvas)] rounded-lg border border-dashed border-[var(--border-hairline)]">
          No calls currently active. Live incoming and test calls appear here in real time.
        </div>
      ) : viewMode === "table" ? (
        <div className="max-h-[460px] overflow-y-auto overflow-x-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--surface-subtle)] border-b border-[var(--border-hairline)] font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] z-10">
              <tr>
                <th className="py-2.5 px-3">Room / Status</th>
                <th className="py-2.5 px-3">Caller</th>
                <th className="py-2.5 px-3">Line</th>
                <th className="py-2.5 px-3 text-right">Elapsed</th>
                <th className="py-2.5 px-3 text-right">Turns</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {liveCalls.map((call) => {
                const isBusy = actingCallId === call.call_id;
                const isEnded = call.outcome === "completed" || call.outcome === "ended";
                return (
                  <tr
                    key={call.id || call.call_id}
                    className="hover:bg-[var(--surface-panel)] transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono">
                      <div className="flex items-center gap-2">
                        <LiveRadarRing color="emerald" size="sm" />
                        <span className="font-semibold text-[var(--ink-primary)]">
                          {call.call_id}
                        </span>
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                          {call.outcome || "active"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--ink-primary)]">
                      {call.caller_number}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--ink-secondary)]">
                      {call.dialed_number}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-right text-[var(--ink-primary)] font-semibold">
                      {formatDurationMMSS(call.elapsed_duration_s)}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-right text-[var(--ink-secondary)]">
                      {call.turn_count}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSupervision(call)}
                          className="px-2.5 py-1 rounded-md bg-[var(--ink-primary)] text-[var(--surface-panel)] font-mono text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-90"
                        >
                          <Headphones className="w-3 h-3 text-emerald-400" />
                          Stream
                        </button>
                        <button
                          type="button"
                          onClick={() => onBargeIn(call.call_id)}
                          disabled={isBusy || isEnded}
                          className="px-2 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)] font-mono text-[11px] disabled:opacity-50"
                        >
                          {call.barge_in_active ? "Barge On" : "Barge"}
                        </button>
                        {confirmEndId === call.call_id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmEndId(null);
                              onEndCall(call.call_id);
                            }}
                            className="px-2 py-1 rounded-md bg-rose-600 text-white font-mono text-[11px] font-semibold"
                          >
                            Confirm End
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmEndId(call.call_id)}
                            disabled={isBusy}
                            className="px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-700 font-mono text-[11px] disabled:opacity-50"
                          >
                            End
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {liveCalls.map((call) => {
            const isBusy = actingCallId === call.call_id;
            const isEnded = call.outcome === "completed" || call.outcome === "ended";
            return (
              <div
                key={call.id || call.call_id}
                className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-3"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <LiveRadarRing color="emerald" size="sm" />
                    <span className="font-bold text-emerald-700 uppercase text-[11px]">
                      {call.outcome || "active"}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[var(--ink-primary)] font-bold bg-[var(--surface-panel)] px-2 py-0.5 rounded border border-[var(--border-hairline)]">
                    {formatDurationMMSS(call.elapsed_duration_s)}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-muted)] font-mono text-[11px]">Room:</span>
                    <span className="font-mono text-[11px] font-semibold text-[var(--ink-primary)]">
                      {call.call_id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-muted)] font-mono text-[11px]">Caller:</span>
                    <span className="font-bold font-mono tabular-nums text-[var(--ink-primary)]">
                      {call.caller_number}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--ink-muted)] font-mono text-[11px]">Turns:</span>
                    <span className="font-mono tabular-nums text-[var(--ink-secondary)] text-[11px]">
                      {call.turn_count} turns
                    </span>
                  </div>
                </div>

                {(call.barge_in_active || call.takeover_active || call.whisper_count > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {call.barge_in_active && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--ink-primary)] border border-[var(--border-hairline)] font-bold flex items-center gap-1">
                        <Mic className="w-2.5 h-2.5 text-[var(--accent-signal)]" /> Barge-In On
                      </span>
                    )}
                    {call.takeover_active && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 border border-rose-500/20 font-bold flex items-center gap-1">
                        <PhoneOff className="w-2.5 h-2.5" /> Takeover Active
                      </span>
                    )}
                    {call.whisper_count > 0 && (
                      <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/20 font-bold">
                        {call.whisper_count} Whisper{call.whisper_count > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}

                {(call.latest_user_utterance || call.latest_agent_utterance) && (
                  <div className="p-2.5 rounded-lg bg-[var(--surface-panel)] border border-[var(--border-hairline)] text-[11px] space-y-1">
                    {call.latest_user_utterance && (
                      <p className="truncate text-[var(--ink-primary)]">
                        <span className="font-bold font-mono">Caller:</span>{" "}
                        {call.latest_user_utterance}
                      </p>
                    )}
                    {call.latest_agent_utterance && (
                      <p className="truncate text-[var(--ink-secondary)]">
                        <span className="font-bold font-mono text-[var(--accent-signal)]">AI:</span>{" "}
                        {call.latest_agent_utterance}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onOpenSupervision(call)}
                    className="col-span-2 px-2.5 py-1.5 rounded-lg bg-[var(--ink-primary)] hover:opacity-90 text-[var(--surface-panel)] font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity"
                  >
                    <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                    Open Live Supervision Stream
                  </button>

                  <button
                    type="button"
                    onClick={() => onBargeIn(call.call_id)}
                    disabled={isBusy || isEnded}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50 ${
                      call.barge_in_active
                        ? "bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] border-[var(--accent-signal)] font-bold"
                        : "border-[var(--border-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    {call.barge_in_active ? "Barge Active" : "Barge-In"}
                  </button>

                  {confirmTakeoverId === call.call_id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmTakeoverId(null);
                        onTakeover(call.call_id);
                      }}
                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-mono font-semibold"
                    >
                      Confirm Takeover
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmTakeoverId(call.call_id)}
                      disabled={isBusy || call.takeover_active || isEnded}
                      className="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <PhoneOff className="w-3 h-3" />
                      Takeover
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onTransfer(call.call_id)}
                    className="px-2 py-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-subtle)] text-[var(--ink-primary)] text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors"
                  >
                    <PhoneForwarded className="w-3 h-3 text-emerald-600" />
                    Transfer
                  </button>

                  {confirmEndId === call.call_id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmEndId(null);
                        onEndCall(call.call_id);
                      }}
                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-mono font-semibold"
                    >
                      Confirm End
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmEndId(call.call_id)}
                      disabled={isBusy}
                      className="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 text-[11px] font-mono font-medium flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <PhoneOff className="w-3 h-3" />
                      End / Dismiss
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
