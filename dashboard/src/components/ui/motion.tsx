"use client";

import React from "react";
import { motion, HTMLMotionProps, Variants, useReducedMotion } from "framer-motion";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const fadeInVariant: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT_EXPO },
  },
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export interface MotionCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export function MotionCard({
  children,
  className = "",
  hoverEffect = true,
  ...props
}: MotionCardProps) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      variants={prefersReduced ? undefined : fadeInVariant}
      whileHover={
        hoverEffect && !prefersReduced
          ? {
              y: -2,
              transition: { duration: 0.15, ease: EASE_OUT_EXPO },
            }
          : undefined
      }
      whileTap={prefersReduced ? undefined : { scale: 0.99 }}
      className={`rounded-2xl border border-slate-200/80 bg-[var(--surface-panel)] shadow-xs transition-shadow hover:shadow-sm ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionFadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function LiveRadarRing({
  color = "emerald",
  size = "md",
}: {
  color?: "emerald" | "indigo" | "amber";
  size?: "sm" | "md" | "lg";
}) {
  const colorMap = {
    emerald: {
      dot: "bg-emerald-500",
      ring: "border-emerald-400 bg-emerald-400/20",
    },
    indigo: {
      dot: "bg-indigo-600",
      ring: "border-indigo-400 bg-indigo-400/20",
    },
    amber: {
      dot: "bg-amber-500",
      ring: "border-amber-400 bg-amber-400/20",
    },
  };

  const sizeMap = {
    sm: "w-2 h-2",
    md: "w-2.5 h-2.5",
    lg: "w-3.5 h-3.5",
  };

  const c = colorMap[color];
  const s = sizeMap[size];

  return (
    <span className="relative flex items-center justify-center shrink-0">
      <motion.span
        animate={{
          scale: [1, 2, 2.5],
          opacity: [0.75, 0.3, 0],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={`absolute rounded-full border ${c.ring}`}
        style={{ width: "100%", height: "100%" }}
      />
      <span className={`relative rounded-full ${s} ${c.dot} shadow-xs`} />
    </span>
  );
}

export function PulseDot({
  color = "emerald",
}: {
  color?: "emerald" | "indigo" | "amber" | "rose";
}) {
  const colorClasses = {
    emerald: "bg-emerald-500",
    indigo: "bg-indigo-600",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };

  return (
    <span className="relative flex h-2 w-2">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colorClasses[color]}`}
      />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${colorClasses[color]}`} />
    </span>
  );
}
