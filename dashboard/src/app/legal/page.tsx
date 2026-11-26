import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { ShieldCheck } from "lucide-react";

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] flex flex-col">
      <PublicHeader />
      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 py-12 space-y-6">
        <div className="flex items-center gap-2 font-mono text-xs text-[var(--accent-signal)]">
          <ShieldCheck className="h-4 w-4" />
          <span>COMPLIANCE &amp; TRUST</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Global Legal &amp; Telephony Compliance Hub
        </h1>
        <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">
          Multi-jurisdiction compliance documentation covering United States, United Kingdom,
          Canada, UAE, and India is being rolled out in Phase W4.
        </p>
        <Link
          href="/how-it-works"
          className="inline-flex items-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-2 text-sm font-medium"
        >
          View architecture &amp; isolation safeguards
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
