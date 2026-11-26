"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { useLeadModal } from "@/context/lead-modal-context";

const CORE_PLANS = [
  {
    id: "lite",
    name: "Lite",
    price: 99,
    minutes: "300",
    overage: "$0.40/min",
    fit: "Solo trades & after-hours overflow",
    features: [
      "1 dedicated SIP / DID number",
      "Locked Turn-1 TCPA disclosure",
      "Google Calendar slot booking",
      "Automated QA & call transcript",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 299,
    minutes: "1,000",
    overage: "$0.35/min",
    fit: "Growing local service businesses",
    features: [
      "BVC telephony noise cancellation",
      "Deepgram Nova-3 keyterm boosting",
      "Emergency safety & warm transfer",
      "Native CRM & instant owner alerts",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 399,
    minutes: "1,500",
    overage: "$0.35/min",
    fit: "Multi-tech teams & clinics",
    popular: true,
    features: [
      "Everything in Starter",
      "10% monthly unused minute rollover",
      "Live supervisor whisper & barge-in",
      "Bilingual EN / ES code-switching",
    ],
  },
  {
    id: "pro",
    name: "Professional",
    price: 499,
    minutes: "2,000",
    overage: "$0.35/min",
    fit: "High-volume dispatch & multi-staff",
    features: [
      "Multi-staff ZIP territory routing",
      "Consented outbound reminder dialer",
      "Arrival windows & calendar buffers",
      "Priority onboarding fee waived",
    ],
  },
];

const SCALE_PLANS = [
  {
    id: "scale",
    name: "Scale",
    price: 999,
    minutes: "4,000",
    overage: "$0.30/min",
    note: "Multi-location & regional dispatch",
  },
  {
    id: "agency",
    name: "Agency",
    price: 1000,
    minutes: "5,000",
    overage: "$0.25/min",
    note: "Sub-account management & impersonation",
  },
  {
    id: "enterprise",
    name: "Enterprise Scale",
    price: 1999,
    minutes: "10,000",
    overage: "$0.20/min",
    note: "Custom concurrency & dedicated SLA",
  },
];

const TOPUP_PACKS = [
  { name: "Bronze Pack", minutes: "250 mins", price: "$75", rate: "$0.30/min" },
  { name: "Silver Pack", minutes: "500 mins", price: "$140", rate: "$0.28/min" },
  { name: "Gold Pack", minutes: "1,000 mins", price: "$250", rate: "$0.25/min" },
  { name: "Platinum Pack", minutes: "2,500 mins", price: "$550", rate: "$0.22/min" },
];

export function PricingSection() {
  const [showScale, setShowScale] = useState(false);
  const { openLeadModal } = useLeadModal();

  return (
    <section
      id="pricing"
      className="border-t border-[var(--border-hairline)] bg-[var(--surface-panel)]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 space-y-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
              Transparent 7-Plan Ladder
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
              Predictable voice minutes. Zero hidden per-seat fees.
            </h2>
          </div>

          <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-1 self-start">
            <button
              type="button"
              onClick={() => setShowScale(false)}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                !showScale
                  ? "bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                  : "text-[var(--ink-secondary)]"
              }`}
            >
              Business Tiers
            </button>
            <button
              type="button"
              onClick={() => setShowScale(true)}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                showScale
                  ? "bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                  : "text-[var(--ink-secondary)]"
              }`}
            >
              Scale &amp; Agency
            </button>
          </div>
        </div>

        {!showScale ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CORE_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`interactive-lift rounded-xl border p-5 flex flex-col justify-between space-y-5 ${
                  plan.popular
                    ? "border-2 border-[var(--ink-primary)] bg-[var(--surface-canvas)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--ink-primary)]">{plan.name}</span>
                    {plan.popular && (
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--accent-signal)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--accent-signal-ink)]">
                        <Sparkles className="h-2.5 w-2.5" />
                        POPULAR
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 font-mono tabular-nums">
                    <span className="text-3xl font-bold text-[var(--ink-primary)]">
                      ${plan.price}
                    </span>
                    <span className="text-xs text-[var(--ink-muted)]">/mo</span>
                  </div>

                  <div className="font-mono text-xs text-[var(--accent-signal)] font-semibold tabular-nums">
                    {plan.minutes} included mins · {plan.overage} overage
                  </div>
                  <p className="text-xs text-[var(--ink-secondary)]">{plan.fit}</p>

                  <ul className="space-y-2 pt-2 border-t border-[var(--border-hairline)] text-xs text-[var(--ink-secondary)]">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-[var(--accent-signal)] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/onboarding"
                  className={`touch-target flex w-full items-center justify-center gap-1.5 rounded-md px-4 text-xs font-semibold transition-colors ${
                    plan.popular
                      ? "bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                      : "border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)] hover:border-[var(--ink-primary)]"
                  }`}
                >
                  Start {plan.name}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {SCALE_PLANS.map((plan) => (
              <div
                key={plan.id}
                className="interactive-lift rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-2">
                  <div className="text-base font-bold text-[var(--ink-primary)]">{plan.name}</div>
                  <div className="flex items-baseline gap-1 font-mono tabular-nums">
                    <span className="text-3xl font-bold text-[var(--ink-primary)]">
                      ${plan.price.toLocaleString()}
                    </span>
                    <span className="text-xs text-[var(--ink-muted)]">/mo</span>
                  </div>
                  <div className="font-mono text-xs font-semibold text-[var(--accent-signal)] tabular-nums">
                    {plan.minutes} mins · {plan.overage} overage
                  </div>
                  <p className="text-xs text-[var(--ink-secondary)] pt-1">{plan.note}</p>
                </div>

                <button
                  type="button"
                  onClick={() => openLeadModal()}
                  className="touch-target flex w-full items-center justify-center gap-2 rounded-md bg-[var(--ink-primary)] px-4 text-xs font-semibold text-[var(--surface-panel)]"
                >
                  Request {plan.name} Setup
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Standalone Top-Up Packs */}
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                On-Demand Minute Packs
              </div>
              <div className="text-sm font-bold text-[var(--ink-primary)]">
                Top up anytime without changing your monthly tier
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs tabular-nums">
              {TOPUP_PACKS.map((p) => (
                <div
                  key={p.name}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 py-2"
                >
                  <div className="text-[10px] text-[var(--ink-muted)]">{p.name}</div>
                  <div className="font-bold text-[var(--ink-primary)]">
                    {p.price} · {p.minutes}
                  </div>
                  <div className="text-[10px] text-[var(--accent-signal)]">{p.rate}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
