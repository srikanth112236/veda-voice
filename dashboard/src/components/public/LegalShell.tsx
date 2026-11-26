"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { ShieldCheck } from "lucide-react";

const LEGAL_NAV = [
  { href: "/legal", label: "Compliance Hub" },
  { href: "/legal/telephony-compliance", label: "Telephony & AI Voice" },
  { href: "/legal/privacy", label: "Global Privacy Notice" },
  { href: "/legal/dpa", label: "Data Processing Addendum" },
  { href: "/legal/security", label: "Security & Isolation" },
  { href: "/legal/terms", label: "Terms of Service" },
];

export function LegalShell({
  eyebrow,
  title,
  updated = "November 26, 2026",
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 lg:py-14">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Sidebar */}
          <aside className="lg:col-span-3 space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] px-3 pb-1">
              Legal &amp; Compliance
            </div>
            <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
              {LEGAL_NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                        : "text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-primary)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <article className="lg:col-span-9 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 sm:p-8 space-y-6">
            <header className="space-y-2 border-b border-[var(--border-hairline)] pb-5">
              <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--accent-signal)]">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>{eyebrow}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--ink-primary)]">
                {title}
              </h1>
              <p className="font-mono text-[11px] text-[var(--ink-muted)]">
                Last updated: {updated} · Jurisdictions: US · UK · Canada · UAE · India
              </p>
            </header>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-[var(--ink-secondary)]">
              <strong className="text-[var(--ink-primary)]">Compliance Notice:</strong> This
              documentation describes VedaVoice&apos;s technical controls and standard legal
              templates. Have qualified legal counsel in your operating jurisdiction review terms
              before commercial deployment.
            </div>

            <div className="space-y-6 text-sm leading-relaxed text-[var(--ink-secondary)]">
              {children}
            </div>
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
