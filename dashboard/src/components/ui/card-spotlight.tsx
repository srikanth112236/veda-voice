"use client";

import React, { useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

export const CardSpotlight = ({
  children,
  radius = 280,
  color = "oklch(52% 0.15 158 / 0.16)",
  className,
  ...props
}: {
  radius?: number;
  color?: string;
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        "group/spotlight relative rounded-2xl border border-zinc-200/90 bg-white p-6 transition-all duration-300 hover:border-zinc-300 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.05)]",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition duration-300 group-hover/spotlight:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              ${radius}px circle at ${mouseX}px ${mouseY}px,
              ${color}12,
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
