"use client";

import React from "react";

export interface StatusBadgeProps {
  label: string;
  variant?: "emerald" | "indigo" | "amber" | "slate" | "rose" | "violet";
  size?: "sm" | "md";
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({
  label,
  variant = "slate",
  size = "md",
  pulse = false,
  className = "",
}: StatusBadgeProps) {
  const variantStyles = {
    emerald: {
      container: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
      dot: "bg-emerald-500",
    },
    indigo: {
      container: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
      dot: "bg-indigo-600",
    },
    amber: {
      container: "bg-amber-50 text-amber-900 border-amber-200/80",
      dot: "bg-amber-500",
    },
    slate: {
      container: "bg-slate-100 text-slate-700 border-slate-200",
      dot: "bg-slate-400",
    },
    rose: {
      container: "bg-rose-50 text-rose-800 border-rose-200/80",
      dot: "bg-rose-500",
    },
    violet: {
      container: "bg-violet-50 text-violet-800 border-violet-200/80",
      dot: "bg-violet-600",
    },
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-xs",
  };

  const style = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono font-semibold border ${style.container} ${sizeStyles[size]} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${style.dot} ${pulse ? "animate-pulse" : ""}`}
      />
      <span>{label}</span>
    </span>
  );
}
