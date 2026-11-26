"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, CustomerQuoteRecord } from "@/lib/api";
import {
  DocumentLineItems,
  PublicDocumentShell,
} from "@/components/public/PublicDocumentShell";
import { CheckCircle2, FileText, XCircle } from "lucide-react";

export default function PublicQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [businessName, setBusinessName] = useState("Service Provider");
  const [quote, setQuote] = useState<CustomerQuoteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getPublicQuote(token)
      .then((res) => {
        setBusinessName(res.business_name);
        setQuote(res.quote);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Quote link could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleRespond = async (decision: "approve" | "decline") => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.respondPublicQuote(token, decision);
      setQuote(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record your response.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicDocumentShell businessName={businessName} eyebrow="Service Estimate">
      {loading ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-10 text-center font-mono text-xs text-[var(--ink-muted)]">
          Loading estimate...
        </div>
      ) : error && !quote ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-xs font-mono text-rose-700">
          {error}
        </div>
      ) : quote ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                <FileText className="w-3.5 h-3.5 text-[var(--accent-signal)]" />
                <span className="tabular-nums">{quote.quote_number}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--ink-primary)]">
                {quote.title}
              </h1>
              <p className="text-xs text-[var(--ink-secondary)]">
                Prepared for <span className="font-semibold text-[var(--ink-primary)]">{quote.customer_name}</span>
              </p>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] uppercase border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-semibold">
                {quote.status}
              </span>
              {quote.valid_until && (
                <div className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
                  Valid until {new Date(quote.valid_until).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs font-mono text-rose-700">
              {error}
            </div>
          )}

          <DocumentLineItems
            items={quote.line_items}
            subtotalCents={quote.subtotal_cents}
            taxRateBps={quote.tax_rate_bps}
            taxCents={quote.tax_cents}
            totalCents={quote.total_cents}
            currency={quote.currency}
          />

          {quote.notes && (
            <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--ink-secondary)]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] block mb-1">
                Notes &amp; Scope
              </span>
              {quote.notes}
            </div>
          )}

          {quote.status === "approved" || quote.status === "converted" ? (
            <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Estimate approved. {businessName} will confirm your dispatch schedule shortly.</span>
            </div>
          ) : quote.status === "declined" ? (
            <div className="p-4 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 text-xs font-medium flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>This estimate was declined. Contact {businessName} if you need an updated scope.</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleRespond("approve")}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? "Submitting..." : "Approve Estimate"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleRespond("decline")}
                className="min-h-[44px] px-4 py-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] text-xs font-semibold disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          )}
        </div>
      ) : null}
    </PublicDocumentShell>
  );
}
