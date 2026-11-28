"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { PhoneCall, ShieldCheck, Calendar, Headphones } from "lucide-react";

export function ParallaxFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], prefersReduced ? [0, 0] : [24, -24]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], prefersReduced ? [1, 1, 1] : [0.97, 1.01, 0.99]);

  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div style={{ y, scale }}>{children}</motion.div>
    </div>
  );
}

export function ScrubRevealSection({
  eyebrow,
  headline,
  subtext,
}: {
  eyebrow: string;
  headline: string;
  subtext: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 85%", "center 45%"],
  });
  const opacity = useTransform(scrollYProgress, [0, 1], [0.25, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [32, 0]);
  const barWidth = useTransform(scrollYProgress, [0, 1], ["12%", "100%"]);

  return (
    <section
      ref={ref}
      className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)] py-20 px-4 sm:px-6"
    >
      <motion.div style={{ opacity, y }} className="mx-auto max-w-4xl space-y-5">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)] font-semibold">
            {eyebrow}
          </p>
          <div className="h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--surface-subtle)]">
            <motion.div
              style={{ width: barWidth }}
              className="h-full bg-[var(--accent-signal)]"
            />
          </div>
        </div>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--ink-primary)] leading-[1.08]">
          {headline}
        </h2>
        <p className="max-w-[56ch] text-base sm:text-lg leading-relaxed text-[var(--ink-secondary)]">
          {subtext}
        </p>
      </motion.div>
    </section>
  );
}

const PINNED_STEPS = [
  {
    step: "01",
    icon: PhoneCall,
    title: "Picks up on the first ring, day or night",
    body: "Whether a homeowner calls at 2 PM or 2 AM with a burst pipe, VedaVoice answers immediately with your business name and warm, natural voice.",
  },
  {
    step: "02",
    icon: ShieldCheck,
    title: "Speaks your legal notice clearly before anything else",
    body: "Background noise or impatient callers never cut off your required recording disclosure—giving you clean compliance in every state and country.",
  },
  {
    step: "03",
    icon: Calendar,
    title: "Checks real openings and books the job",
    body: "No sticky notes or missed voicemails. VedaVoice checks your team's live calendar, matches the right service area, and confirms the appointment on the spot.",
  },
  {
    step: "04",
    icon: Headphones,
    title: "Transfers emergencies and texts you a clean summary",
    body: "Urgent safety issues route straight to your on-call mobile with a spoken summary, while routine calls arrive in your inbox in under 60 seconds.",
  },
];

export function PinnedStorySection() {
  return (
    <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 lg:py-24 grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Sticky Left Column */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)] font-semibold">
            How Every Call Unfolds
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ink-primary)] leading-[1.1]">
            From first ring to booked customer—without lifting a finger.
          </h2>
          <p className="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed">
            Built for busy owners who lose thousands every month to missed calls, voicemail
            hang-ups, and slow callbacks.
          </p>
        </div>

        {/* Scrolling Right Cards */}
        <div className="lg:col-span-7 space-y-5">
          {PINNED_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 sm:p-7 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[var(--accent-signal)]">
                    STEP {item.step}
                  </span>
                  <Icon className="h-5 w-5 text-[var(--ink-primary)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--ink-primary)]">{item.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">{item.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const STACK_CARDS = [
  {
    badge: "NOISE-FREE CLARITY",
    title: "Hears your customer, not the highway or TV",
    desc: "Smart voice isolation strips wind, traffic, tools, and background chatter so names, phone numbers, and street addresses are captured right the first time.",
    topOffset: "lg:top-24",
  },
  {
    badge: "PATIENT LISTENING",
    title: "Never rushes or talks over your callers",
    desc: "Understands natural pauses when someone is checking their calendar or reading an address—no awkward interruptions.",
    topOffset: "lg:top-28",
  },
  {
    badge: "BILINGUAL FLUENCY",
    title: "Switches between English & Spanish effortlessly",
    desc: "If a caller greets you in Spanish, your receptionist responds fluently in Spanish while keeping all your pricing and safety rules intact.",
    topOffset: "lg:top-32",
  },
  {
    badge: "QUALITY SCORING",
    title: "Every single call graded for courtesy & accuracy",
    desc: "Listen to recordings, read clean transcripts with sensitive info masked, and see an instant quality score on every conversation.",
    topOffset: "lg:top-36",
  },
];

export function StackedCardsSection() {
  return (
    <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 lg:py-24 space-y-10">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)] font-semibold">
            Why Customers Love Talking To It
          </p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-[var(--ink-primary)]">
            Sounds like your best front-desk hire. Works 24/7.
          </h2>
        </div>

        <div className="space-y-6">
          {STACK_CARDS.map((card, i) => (
            <div
              key={card.badge}
              className={`lg:sticky ${card.topOffset} rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-6 sm:p-8 shadow-sm`}
            >
              <div className="flex items-center justify-between font-mono text-[11px] text-[var(--accent-signal)] mb-3">
                <span>{card.badge}</span>
                <span className="text-[var(--ink-muted)]">0{i + 1} / 04</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[var(--ink-primary)] mb-2">
                {card.title}
              </h3>
              <p className="text-sm sm:text-base leading-relaxed text-[var(--ink-secondary)] max-w-[60ch]">
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
