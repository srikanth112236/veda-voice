"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  accentColor?: "indigo" | "emerald" | "amber" | "violet" | "cyan";
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor = "indigo",
  className = "",
}: StatCardProps) {
  const accentStyles = {
    indigo: {
      iconBg: "bg-[var(--surface-subtle)] border-[var(--border-hairline)] text-[var(--accent-signal)]",
      indicator: "bg-[var(--accent-signal)]",
    },
    emerald: {
      iconBg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700",
      indicator: "bg-emerald-600",
    },
    amber: {
      iconBg: "bg-amber-500/10 border-amber-500/20 text-amber-700",
      indicator: "bg-amber-600",
    },
    violet: {
      iconBg: "bg-[var(--surface-subtle)] border-[var(--border-hairline)] text-[var(--ink-primary)]",
      indicator: "bg-[var(--ink-primary)]",
    },
    cyan: {
      iconBg: "bg-sky-500/10 border-sky-500/20 text-sky-700",
      indicator: "bg-sky-600",
    },
  };

  const style = accentStyles[accentColor];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`p-5 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-hairline)] hover:border-[var(--ink-muted)] transition-colors flex flex-col justify-between space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
          {title}
        </span>
        <div className={`p-2 rounded-lg border ${style.iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-2xl sm:text-3xl font-bold text-[var(--ink-primary)] font-mono tabular-nums tracking-tight">
          {value}
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                trend.isPositive
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                  : "bg-amber-50 text-amber-700 border border-amber-200/60"
              }`}
            >
              {trend.isPositive ? "↑" : "↓"} {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-[11px] text-slate-400 font-mono truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
