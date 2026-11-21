"use client";

import React from "react";
import { motion } from "framer-motion";

export function AcousticWaveformEqualizer({
  isPlaying = false,
  barCount = 5,
  className = "",
}: {
  isPlaying?: boolean;
  barCount?: number;
  className?: string;
}) {
  const bars = Array.from({ length: barCount }, (_, i) => i);
  const baseHeights = [30, 70, 100, 50, 85, 40, 95, 60].slice(0, barCount);

  return (
    <div className={`flex items-center gap-1 h-5 ${className}`}>
      {bars.map((i) => (
        <motion.span
          key={i}
          animate={
            isPlaying
              ? {
                  height: ["20%", "100%", "40%", "85%", "25%"],
                }
              : {
                  height: `${baseHeights[i % baseHeights.length]}%`,
                }
          }
          transition={
            isPlaying
              ? {
                  duration: 0.8 + (i % 3) * 0.2,
                  repeat: Infinity,
                  repeatType: "reverse",
                  ease: "easeInOut",
                  delay: i * 0.1,
                }
              : { duration: 0.2 }
          }
          className="w-1 rounded-full bg-indigo-600/90"
          style={{ minHeight: "4px" }}
        />
      ))}
    </div>
  );
}

export function EmptyCallsIllustration({ className = "w-28 h-28" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} text-indigo-600/30 mx-auto`}
    >
      <circle cx="60" cy="60" r="54" className="stroke-slate-200 fill-slate-50/50" strokeWidth="1.5" />
      {/* Soundwaves */}
      <path
        d="M38 52C38 42.0589 47.8497 34 60 34C72.1503 34 82 42.0589 82 52"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <path
        d="M30 52C30 36.536 43.4315 24 60 24C76.5685 24 90 36.536 90 52"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      {/* Acoustic Headset */}
      <path
        d="M44 64V56C44 47.1634 51.1634 40 60 40C68.8366 40 76 47.1634 76 56V64"
        stroke="#4f46e5"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Earcups */}
      <rect x="40" y="58" width="8" height="16" rx="4" fill="#4f46e5" />
      <rect x="72" y="58" width="8" height="16" rx="4" fill="#4f46e5" />
      {/* Mic Arm */}
      <path
        d="M44 70C44 76.6274 49.3726 82 56 82H64"
        stroke="#4f46e5"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="66" cy="82" r="3.5" fill="#10b981" />
    </svg>
  );
}

export function EmptyLeadsIllustration({ className = "w-28 h-28" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} text-slate-300 mx-auto`}
    >
      <circle cx="60" cy="60" r="54" className="stroke-slate-200 fill-slate-50/50" strokeWidth="1.5" />
      {/* Card stack */}
      <rect
        x="36"
        y="32"
        width="48"
        height="56"
        rx="8"
        className="stroke-slate-300 fill-white"
        strokeWidth="1.5"
      />
      {/* Contact avatar & lines */}
      <circle cx="60" cy="48" r="8" fill="#e0e7ff" />
      <path d="M48 64H72" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      <path d="M52 70H68" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      {/* Verified check badge */}
      <circle cx="80" cy="36" r="7" fill="#10b981" />
      <path d="M77 36L79.5 38.5L83.5 34.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ComplianceShieldIllustration({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} text-emerald-600 mx-auto`}
    >
      <path
        d="M50 14L24 24V46C24 64 35 80 50 86C65 80 76 64 76 46V24L50 14Z"
        className="fill-emerald-50 stroke-emerald-500"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="48" r="14" fill="#10b981" />
      <path
        d="M44 48L48 52L56 44"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
