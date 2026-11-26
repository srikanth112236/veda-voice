"use client";

import React from "react";

interface VoiceIllustrationProps {
  bars: number[];
  label: string;
}

export function VoiceIllustration({ bars, label }: VoiceIllustrationProps) {
  return (
    <div
      aria-label={label}
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 space-y-3"
    >
      <div className="flex items-center justify-between font-mono text-[10px] text-[var(--ink-muted)]">
        <span>ACOUSTIC STREAM · BVC FILTERED</span>
        <span className="text-[var(--accent-signal)] font-semibold">16kHz PCM</span>
      </div>

      <svg
        viewBox="0 0 240 64"
        className="w-full h-16"
        role="img"
        aria-label={`${label} acoustic waveform`}
      >
        {/* Center baseline */}
        <line
          x1="0"
          y1="32"
          x2="240"
          y2="32"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="1"
        />
        {bars.map((val, idx) => {
          const x = 10 + idx * 19;
          const h = Math.max(8, Math.min(54, Math.round((val / 100) * 54)));
          const y = 32 - h / 2;
          const isPeak = val >= 70;
          return (
            <rect
              key={idx}
              x={x}
              y={y}
              width="9"
              height={h}
              rx="4.5"
              fill={isPeak ? "var(--accent-signal)" : "var(--ink-primary)"}
              fillOpacity={isPeak ? 0.9 : 0.35}
            />
          );
        })}
      </svg>
    </div>
  );
}
