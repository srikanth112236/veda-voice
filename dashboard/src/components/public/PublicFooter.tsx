"use client";

import React from "react";
import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="font-mono text-xs font-semibold text-[var(--ink-primary)]">
            VedaVoice Control Plane
          </div>
          <p className="font-mono text-[11px] text-[var(--ink-muted)]">
            Multi-tenant SIP &amp; WebRTC voice reception · Azure &amp; LiveKit Cloud
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-[var(--ink-secondary)]">
          <Link href="/how-it-works" className="hover:text-[var(--ink-primary)]">
            How it works
          </Link>
          <Link href="/features" className="hover:text-[var(--ink-primary)]">
            Features
          </Link>
          <Link href="/industries" className="hover:text-[var(--ink-primary)]">
            Industries
          </Link>
          <Link href="/legal" className="hover:text-[var(--ink-primary)]">
            Compliance Hub
          </Link>
          <Link href="/legal/privacy" className="hover:text-[var(--ink-primary)]">
            Privacy
          </Link>
          <Link href="/legal/telephony-compliance" className="hover:text-[var(--ink-primary)]">
            TCPA &amp; Telecom
          </Link>
          <Link href="/legal/terms" className="hover:text-[var(--ink-primary)]">
            Terms
          </Link>
          <Link href="/legal/dpa" className="hover:text-[var(--ink-primary)]">
            DPA
          </Link>
          <Link href="/legal/security" className="hover:text-[var(--ink-primary)]">
            Security
          </Link>
          <Link href="/login" className="hover:text-[var(--ink-primary)]">
            Sign in
          </Link>
          <Link href="/onboarding" className="hover:text-[var(--ink-primary)]">
            Onboarding
          </Link>
        </div>
      </div>
    </footer>
  );
}
