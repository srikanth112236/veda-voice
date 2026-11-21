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
      iconBg: "bg-indigo-50 border-indigo-100 text-indigo-600",
      indicator: "bg-indigo-600",
    },
    emerald: {
      iconBg: "bg-emerald-50 border-emerald-100 text-emerald-600",
      indicator: "bg-emerald-500",
    },
    amber: {
      iconBg: "bg-amber-50 border-amber-100 text-amber-600",
      indicator: "bg-amber-500",
    },
    violet: {
      iconBg: "bg-violet-50 border-violet-100 text-violet-600",
      indicator: "bg-violet-600",
    },
    cyan: {
      iconBg: "bg-cyan-50 border-cyan-100 text-cyan-600",
      indicator: "bg-cyan-500",
    },
  };

  const style = accentStyles[accentColor];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all flex flex-col justify-between space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 font-sans tracking-wide">
          {title}
        </span>
        <div className={`p-2 rounded-xl border ${style.iconBg} shadow-2xs`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
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
