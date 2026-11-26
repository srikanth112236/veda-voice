"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useLeadModal } from "@/context/lead-modal-context";
import {
  ArrowRight,
  PhoneCall,
  ShieldCheck,
  Activity,
  Calendar,
  Headphones,
  Languages,
  Award,
  Globe,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { CuratedScenarioTicker } from "@/components/public/CuratedScenarioTicker";
import { PricingSection } from "@/components/public/PricingSection";
import { WhyBestSection } from "@/components/public/WhyBestSection";
import {
  ParallaxFrame,
  ScrubRevealSection,
  PinnedStorySection,
  StackedCardsSection,
} from "@/components/public/ScrollShowcase";
import { INDUSTRY_CONCEPTS } from "@/data/industries";

type ScenarioKey = "booking" | "emergency" | "wrong_number";

const SCENARIOS: Record<
  ScenarioKey,
  {
    label: string;
    caller: string;
    duration: string;
    turns: string;
    notice: string;
    responseTime: string;
    steps: Array<{ label: string; value: string }>;
    messages: Array<{ speaker: string; meta: string; time: string; text: string }>;
  }
> = {
  booking: {
    label: "Appointment Booking",
    caller: "Apex Plumbing & Heating · Incoming Call",
    duration: "01m 42s",
    turns: "6 turns",
    notice: "Recording notice spoken cleanly on Turn 1",
    responseTime: "Under 1s",
    steps: [
      { label: "1. Listened to caller", value: "Patient pause" },
      { label: "2. Checked calendar", value: "Live slots" },
      { label: "3. Confirmed visit", value: "Booked 2 PM" },
    ],
    messages: [
      {
        speaker: "RECEPTIONIST",
        meta: "Turn 1 · Natural Voice",
        time: "09:14:02",
        text: "This call may be recorded for quality assurance. Thanks for calling Apex Plumbing & Heating—how can I help?",
      },
      {
        speaker: "CALLER",
        meta: "BACKGROUND NOISE FILTERED",
        time: "09:14:09",
        text: "Our water heater is leaking near the shutoff valve on Congress Ave. Can someone come out today?",
      },
    ],
  },
  emergency: {
    label: "Urgent Safety Call",
    caller: "Apex Plumbing & Heating · Priority Line",
    duration: "00m 54s",
    turns: "4 turns",
    notice: "Recording notice spoken cleanly on Turn 1",
    responseTime: "Under 1s",
    steps: [
      { label: "1. Detected hazard", value: "Gas smell" },
      { label: "2. Gave safety steps", value: "Evacuate + 911" },
      { label: "3. Connected team", value: "Live transfer" },
    ],
    messages: [
      {
        speaker: "CALLER",
        meta: "URGENT CALL",
        time: "14:02:11",
        text: "I smell strong gas near the furnace in our basement right now.",
      },
      {
        speaker: "RECEPTIONIST",
        meta: "SAFETY PROTOCOL",
        time: "14:02:12",
        text: "Please leave the building immediately, avoid touching any light switches, and call 911 from outside. I am transferring you to our on-call specialist now.",
      },
    ],
  },
  wrong_number: {
    label: "Wrong-Number Guard",
    caller: "Apex Plumbing & Heating · Incoming Call",
    duration: "00m 28s",
    turns: "3 turns",
    notice: "Recording notice spoken cleanly on Turn 1",
    responseTime: "Under 1s",
    steps: [
      { label: "1. Spotted off-topic", value: "Wrong number" },
      { label: "2. Clarified business", value: "Polite reply" },
      { label: "3. Ended call cleanly", value: "Saved minutes" },
    ],
    messages: [
      {
        speaker: "CALLER",
        meta: "WRONG NUMBER",
        time: "17:50:44",
        text: "Hey, is this the software support line for reverse engineering?",
      },
      {
        speaker: "RECEPTIONIST",
        meta: "POLITE EXIT",
        time: "17:50:45",
        text: "I believe you have the wrong number—this is Apex Plumbing & Heating. Have a great day, goodbye.",
      },
    ],
  },
};

const FAQS = [
  {
    q: "What is VedaVoice AI Receptionist?",
    a: "VedaVoice is a 24/7 AI phone receptionist that answers your business line on the first ring, filters out background noise, books appointments directly into Google Calendar, and transfers emergencies to your on-call team.",
  },
  {
    q: "How fast does it respond during a live conversation?",
    a: "VedaVoice responds in under one second with natural pacing—and waits patiently when callers pause to look up an address or calendar date.",
  },
  {
    q: "Can it speak both English and Spanish?",
    a: "Yes. If a caller greets your business in Spanish or asks to switch languages, VedaVoice transitions smoothly into fluent Spanish while following your exact pricing and safety rules.",
  },
  {
    q: "How does it handle call recording laws across countries?",
    a: "VedaVoice delivers your recording and AI assistant notice at the start of the call before taking customer details, and supports compliance standards for the US, UK, Canada, UAE, and India.",
  },
];

export default function Home() {
  const { user, loading } = useAuth();
  const { openLeadModal } = useLeadModal();
  const [routing, setRouting] = useState(false);
  const [scenario, setScenario] = useState<ScenarioKey>("booking");

  useEffect(() => {
    if (loading || !user) return;
    const target = user.role === "platform_admin" ? "/admin/dashboard" : "/portal/dashboard";
    setRouting(true);
    window.location.replace(target);
  }, [user, loading]);

  if (loading || routing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] px-6">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3 font-mono text-xs text-[var(--ink-secondary)]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-signal)] animate-pulse" />
          <span>{routing ? "Opening workspace..." : "Checking session..."}</span>
        </div>
      </main>
    );
  }

  const active = SCENARIOS[scenario];

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />
      {/* Section 1: Curated Scenario & Early-Bird Ticker */}
      <CuratedScenarioTicker />

      {/* Section 2: Hero with Parallax Architectural Visual */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 py-14 lg:grid-cols-12 lg:py-20">
        <div className="space-y-6 lg:col-span-6" data-enter="hero">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)] font-semibold">
            24/7 AI Voice Receptionist
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-4xl lg:text-[2.85rem] lg:leading-[1.08]">
            Never miss another customer call—day, night, or weekend.
          </h1>
          <p className="max-w-[50ch] text-base leading-relaxed text-[var(--ink-secondary)]">
            VedaVoice answers your business line on the first ring, hears callers clearly over
            street or background noise, books jobs straight into your calendar, and sends instant
            call summaries.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => openLeadModal()}
              className="touch-target interactive-lift inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Request live demo
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
            <Link
              href="/onboarding"
              className="touch-target interactive-lift inline-flex items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-medium text-[var(--ink-primary)]"
            >
              Start free setup
            </Link>
            <Link
              href="#pricing"
              className="touch-target inline-flex items-center whitespace-nowrap px-3 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            >
              See pricing
            </Link>
          </div>
        </div>

        <ParallaxFrame className="lg:col-span-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
          <img
            src="/images/hero-voice-engine.jpg"
            alt="VedaVoice AI phone receptionist voice wave illustration"
            className="w-full h-auto object-cover"
          />
        </ParallaxFrame>
      </section>

      {/* Section 3: Scroll-Scrubbed Narrative Reveal */}
      <ScrubRevealSection
        eyebrow="Built For Real Conversations"
        headline="Missed calls cost local businesses thousands every month. Voicemail doesn’t book jobs."
        subtext="Customers who hit voicemail call the next business on Google. VedaVoice answers every call immediately, collects their details, checks your live calendar, and locks in the appointment before they hang up."
      />

      {/* Section 4: Interactive Live Call Preview */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                Interactive Call Preview
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                See how VedaVoice handles real caller situations.
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScenario(key)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    scenario === key
                      ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-secondary)]"
                  }`}
                >
                  {SCENARIOS[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-3">
              <div className="flex items-center gap-2 font-mono text-xs text-[var(--ink-secondary)]">
                <PhoneCall className="h-3.5 w-3.5 text-[var(--accent-signal)] shrink-0" />
                <span>{active.caller}</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-[var(--ink-muted)]">
                {active.duration} · {active.turns}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-hairline)]">
              <div className="lg:col-span-7 space-y-3 p-5 text-xs leading-relaxed">
                <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>{active.notice}</span>
                </div>
                {active.messages.map((msg, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3.5"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[var(--ink-muted)]">
                      <span>
                        {msg.speaker} · {msg.meta}
                      </span>
                      <span className="tabular-nums">{msg.time}</span>
                    </div>
                    <p className="text-[var(--ink-primary)]">{msg.text}</p>
                  </div>
                ))}
              </div>

              <div className="lg:col-span-5 p-5 space-y-4">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Activity className="h-3.5 w-3.5 text-[var(--accent-signal)]" />
                    Call Flow Summary
                  </span>
                  <span className="tabular-nums text-[var(--accent-signal)] font-semibold">
                    {active.responseTime}
                  </span>
                </div>

                <div className="space-y-2.5 font-mono text-xs tabular-nums">
                  {active.steps.map((s) => (
                    <div
                      key={s.label}
                      className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3 flex items-center justify-between"
                    >
                      <span className="text-[var(--ink-secondary)]">{s.label}</span>
                      <span className="font-bold text-[var(--ink-primary)]">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Pinned Sticky Storytelling Section */}
      <PinnedStorySection />

      {/* Section 6: Stacked Scrolling Feature Cards */}
      <StackedCardsSection />

      {/* Section 7: Noise Shield Parallax Spotlight */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 py-16 lg:grid-cols-12">
          <ParallaxFrame className="lg:col-span-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
            <img
              src="/images/bvc-noise-shield.jpg"
              alt="Noise filtering illustration separating clear voice from background sound"
              className="w-full h-auto object-cover"
            />
          </ParallaxFrame>
          <div className="lg:col-span-6 space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)]">
              Crystal-Clear Listening
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Built for highways, basements, and noisy job sites.
            </h2>
            <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
              Callers rarely phone from a quiet room. VedaVoice filters out background television,
              traffic, and shop tools before listening—so names, numbers, and addresses are always
              accurate.
            </p>
            <Link
              href="/features"
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-signal)]"
            >
              See all capabilities
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Section 8: Why VedaVoice Wins Comparison Matrix */}
      <WhyBestSection />

      {/* Section 9: Calendar & Dispatch Parallax Spotlight */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 py-16 lg:grid-cols-12">
          <div className="lg:col-span-6 space-y-4 order-2 lg:order-1">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)]">
              Calendar &amp; Team Scheduling
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Real openings only. Zero double-bookings.
            </h2>
            <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
              Connects to Google Calendar, respects your travel buffers and arrival windows, routes
              jobs to the right neighborhood technician, and texts callers a 1-tap reschedule link.
            </p>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-signal)]"
            >
              See how scheduling works
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ParallaxFrame className="lg:col-span-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] order-1 lg:order-2">
            <img
              src="/images/dispatch-calendar-grid.jpg"
              alt="Automated appointment calendar grid illustration"
              className="w-full h-auto object-cover"
            />
          </ParallaxFrame>
        </div>
      </section>

      {/* Section 10: 3-Pillar Speed & Reliability */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              icon: Zap,
              metric: "First Ring",
              title: "Zero Hold Music",
              desc: "Picks up every call immediately—even when your whole team is out on jobs or after hours.",
            },
            {
              icon: Languages,
              metric: "EN + ES",
              title: "Bilingual Fluency",
              desc: "Switches naturally between English and Spanish during the call without losing context.",
            },
            {
              icon: Award,
              metric: "100-Pt QA",
              title: "Automatic Call Grading",
              desc: "Every call is scored for greeting, legal notice, caller details, and politeness.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-[var(--accent-signal)]" />
                  <span className="font-mono text-xs font-bold text-[var(--ink-primary)]">
                    {item.metric}
                  </span>
                </div>
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 11: Live Owner & Manager Controls */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5 grid grid-cols-3 gap-2 font-mono text-xs text-center">
            {["Listen Live", "Whisper Tip", "Take Over"].map((action) => (
              <div
                key={action}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-3.5 font-semibold text-[var(--ink-primary)]"
              >
                {action}
              </div>
            ))}
          </div>
          <div className="lg:col-span-7 space-y-3">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
              <Headphones className="h-4 w-4" />
              <span>STAY IN CONTROL</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Listen in live, send a quiet hint, or jump onto any call in one click.
            </h2>
            <p className="text-sm text-[var(--ink-secondary)]">
              Follow the live conversation from your dashboard, guide your receptionist silently, or
              step in personally for VIP customers.
            </p>
          </div>
        </div>
      </section>

      {/* Section 12: 20 Pre-Trained Industry Verticals */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                20 Ready-Made Industry Packs
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Trained for trades, clinics, salons, and local offices.
              </h2>
            </div>
            <Link
              href="/industries"
              className="touch-target inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ink-primary)] hover:text-[var(--accent-signal)]"
            >
              Inspect all 20 industries
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {INDUSTRY_CONCEPTS.map((ind) => (
              <button
                key={ind.slug}
                type="button"
                onClick={() => openLeadModal(ind.slug)}
                className="interactive-lift rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 text-left space-y-1"
              >
                <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-muted)]">
                  {ind.category}
                </div>
                <div className="text-xs font-semibold text-[var(--ink-primary)]">{ind.name}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Section 13: Complete 7-Plan Pricing Ladder + Top-Up Packs */}
      <PricingSection />

      {/* Section 14: AEO / GEO Frequently Asked Questions + Global Compliance */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <Globe className="h-4 w-4" />
                <span>COMMON QUESTIONS &amp; GLOBAL COMPLIANCE</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Everything business owners ask before going live.
              </h2>
            </div>
            <Link
              href="/legal"
              className="touch-target inline-flex items-center gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-xs font-semibold text-[var(--ink-primary)] self-start"
            >
              US · UK · CA · UAE · India Compliance
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {FAQS.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 space-y-2"
              >
                <h3 className="flex items-start gap-2 text-sm font-bold text-[var(--ink-primary)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                  <span>{item.q}</span>
                </h3>
                <p className="text-xs leading-relaxed text-[var(--ink-secondary)] pl-6">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 15: Final Conversion Band + Footer */}
      <section className="border-t border-[var(--border-hairline)] bg-[var(--ink-primary)] text-[var(--surface-panel)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
              Early-Bird Cohort Open
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Deploy your AI receptionist in minutes.
            </h2>
            <p className="text-sm text-slate-300">
              Includes 500 founder voice minutes and priority phone number setup.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openLeadModal()}
              className="touch-target interactive-lift inline-flex items-center gap-2 rounded-md bg-[var(--accent-signal)] px-5 text-sm font-semibold text-[var(--accent-signal-ink)]"
            >
              Claim Early-Bird Demo
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              href="/onboarding"
              className="touch-target inline-flex items-center rounded-md border border-slate-600 px-4 text-sm font-medium text-[var(--surface-panel)] hover:bg-slate-800"
            >
              Start Self-Serve Setup
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
