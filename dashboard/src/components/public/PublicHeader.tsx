"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

const NAV_LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/industries", label: "Industries" },
  { href: "/legal", label: "Compliance" },
];

export function PublicHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] sticky top-0 z-30">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 py-3.5 sm:py-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ink-primary)] font-mono text-sm font-bold text-[var(--surface-panel)]">
            V
          </span>
          <span className="text-sm font-semibold tracking-tight whitespace-nowrap text-[var(--ink-primary)]">
            VedaVoice
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`touch-target inline-flex items-center px-3 text-sm font-medium whitespace-nowrap rounded-md transition-colors ${
                  active
                    ? "text-[var(--ink-primary)] bg-[var(--surface-subtle)]"
                    : "text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/login"
            className="touch-target inline-flex items-center whitespace-nowrap px-2.5 sm:px-3 text-sm font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="touch-target interactive-lift inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--ink-primary)] px-3 sm:px-4 text-sm font-medium text-[var(--surface-panel)]"
          >
            <span className="sm:hidden">Deploy</span>
            <span className="hidden sm:inline">Deploy receptionist</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        </div>
      </div>

      {/* Mobile secondary nav strip */}
      <div className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-4 py-1.5">
        {NAV_LINKS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-2.5 py-1.5 text-xs font-medium whitespace-nowrap rounded transition-colors ${
                active
                  ? "bg-[var(--ink-primary)] text-[var(--surface-panel)]"
                  : "text-[var(--ink-secondary)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
