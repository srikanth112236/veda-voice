"use client";

import React, { useState } from "react";
import Link from "next/link";
import { LegalShell } from "@/components/public/LegalShell";
import { ArrowRight } from "lucide-react";

type JurisdictionCode = "US" | "UK" | "CA" | "UAE" | "IN";

const JURISDICTIONS: Record<
  JurisdictionCode,
  {
    name: string;
    privacyLaw: string;
    telecomLaw: string;
    recordingRule: string;
    outboundRule: string;
    controls: string[];
  }
> = {
  US: {
    name: "United States",
    privacyLaw: "CCPA / CPRA (California) & State Consumer Privacy Acts",
    telecomLaw: "TCPA, FCC AI-Voice Declaratory Ruling, TSR & STIR/SHAKEN",
    recordingRule:
      "All-party consent in states like CA, FL, IL, PA, WA; VedaVoice speaks mandatory recording disclosure in Turn 1 with interruptions locked off.",
    outboundRule:
      "Prior express written consent (PEWC) for automated/AI outbound calls, DNC suppression, calling-window checks, and frequency caps.",
    controls: [
      "Non-interruptible Turn-1 recording & AI disclosure",
      "5-year ConsentRecord retention with source & timestamp",
      "Pre-dial compliance gate (consent, suppression, window, caps)",
    ],
  },
  UK: {
    name: "United Kingdom",
    privacyLaw: "UK GDPR & Data Protection Act 2018",
    telecomLaw: "PECR (Privacy and Electronic Communications Regulations) & Ofcom",
    recordingRule:
      "Clear lawful basis & upfront notice before call recording or AI transcription begins.",
    outboundRule:
      "TPS / CTPS screening required; automated marketing calls require explicit prior opt-in consent.",
    controls: [
      "Upfront AI assistant & recording notice",
      "Opt-out tool (`end_call` / suppression list) honoring immediate withdrawal",
      "Tenant-isolated data export & deletion support",
    ],
  },
  CA: {
    name: "Canada",
    privacyLaw: "PIPEDA & Quebec Law 25",
    telecomLaw: "CRTC Unsolicited Telecommunications Rules & National DNCL",
    recordingRule:
      "Express notification at the start of the call stating recording and automated assistance purpose.",
    outboundRule:
      "ADAD (automated dialing-announcing device) restrictions require express prior consent unless exempted.",
    controls: [
      "Explicit consent capture on web forms with AI-voice disclosure",
      "National/internal suppression list enforcement before outbound dispatch",
      "Bilingual & French/English extensible prompt routing",
    ],
  },
  UAE: {
    name: "United Arab Emirates",
    privacyLaw: "UAE Federal Decree-Law No. 45 of 2021 (PDPL)",
    telecomLaw: "TDRA Telemarketing & Unsolicited Communication Regulations",
    recordingRule:
      "Explicit notification prior to call recording and processing of voice/personal data.",
    outboundRule:
      "Strict calling-window enforcement (9:00 AM – 6:00 PM local time), DNCR registry compliance, and no cold AI telemarketing.",
    controls: [
      "Local timezone calling-window gate enforced per tenant",
      "Consented callback & appointment reminder workflows only",
      "PII masking toggle in Call Explorer for reviewer access",
    ],
  },
  IN: {
    name: "India",
    privacyLaw: "Digital Personal Data Protection Act, 2023 (DPDP Act)",
    telecomLaw: "TRAI TCCCPR 2018 (DND / DLT Header & Consent Templates)",
    recordingRule:
      "Clear, itemized notice in English or regional language explaining purpose of collection and recording.",
    outboundRule:
      "DLT-registered headers/templates for transactional SMS/voice; strict DND preference enforcement for promotional traffic.",
    controls: [
      "Purpose-limited intake & explicit consent checkbox on lead forms",
      "DND/opt-out persistence blocking future outbound retries",
      "Tenant-scoped data isolation via PostgreSQL RLS",
    ],
  },
};

export default function LegalIndexPage() {
  const [region, setRegion] = useState<JurisdictionCode>("US");
  const active = JURISDICTIONS[region];

  return (
    <LegalShell eyebrow="COMPLIANCE HUB" title="Global Legal & Regulatory Alignment">
      <p>
        VedaVoice is architected for multi-region voice operations across the United States, United
        Kingdom, Canada, UAE, and India. Select a jurisdiction below to inspect applicable privacy
        and telecommunications rules.
      </p>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(JURISDICTIONS) as JurisdictionCode[]).map((code) => {
          const selected = region === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setRegion(code)}
              className={`rounded-md border px-3.5 py-2 font-mono text-xs font-semibold transition-colors ${
                selected
                  ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:border-[var(--ink-secondary)]"
              }`}
            >
              {code} · {JURISDICTIONS[code].name}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-5 space-y-4">
        <div className="border-b border-[var(--border-hairline)] pb-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-signal)]">
            {region} REGULATORY PROFILE
          </div>
          <h2 className="text-lg font-bold text-[var(--ink-primary)]">{active.name}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5 space-y-1">
            <div className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              Privacy Framework
            </div>
            <p className="font-medium text-[var(--ink-primary)]">{active.privacyLaw}</p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3.5 space-y-1">
            <div className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              Telephony Framework
            </div>
            <p className="font-medium text-[var(--ink-primary)]">{active.telecomLaw}</p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <p>
            <strong className="text-[var(--ink-primary)]">Recording &amp; AI Disclosure:</strong>{" "}
            {active.recordingRule}
          </p>
          <p>
            <strong className="text-[var(--ink-primary)]">Outbound Calling Rules:</strong>{" "}
            {active.outboundRule}
          </p>
        </div>

        <ul className="list-disc pl-5 space-y-1 text-xs">
          {active.controls.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-4 pt-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          Technical Enforcement Architecture
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 space-y-1">
            <div className="font-mono text-[10px] uppercase text-[var(--accent-signal)]">
              TURN-1 LOCKED DISCLOSURE
            </div>
            <p className="font-semibold text-[var(--ink-primary)]">
              Non-Interruptible Legal Notice
            </p>
            <p>
              Mandatory recording &amp; AI disclosure plays with caller barge-in disabled before
              greeting intake begins.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 space-y-1">
            <div className="font-mono text-[10px] uppercase text-[var(--accent-signal)]">
              4-GATE OUTBOUND GUARD
            </div>
            <p className="font-semibold text-[var(--ink-primary)]">
              Zero-Bypass Compliance Check
            </p>
            <p>
              Every outbound call must pass ConsentRecord, DNC suppression, local calling window,
              and daily frequency caps.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
        <Link
          href="/legal/telephony-compliance"
          className="interactive-lift flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 text-xs font-semibold text-[var(--ink-primary)]"
        >
          <span>Telephony &amp; AI Voice</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/legal/privacy"
          className="interactive-lift flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 text-xs font-semibold text-[var(--ink-primary)]"
        >
          <span>Global Privacy Notice</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/legal/dpa"
          className="interactive-lift flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 text-xs font-semibold text-[var(--ink-primary)]"
        >
          <span>DPA &amp; Sub-Processors</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/legal/security"
          className="interactive-lift flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 text-xs font-semibold text-[var(--ink-primary)]"
        >
          <span>Security &amp; RLS Isolation</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/legal/terms"
          className="interactive-lift flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] p-4 text-xs font-semibold text-[var(--ink-primary)]"
        >
          <span>Terms of Service</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </LegalShell>
  );
}
