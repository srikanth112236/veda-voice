"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, CustomerInvoiceRecord } from "@/lib/api";
import {
  DocumentLineItems,
  PublicDocumentShell,
} from "@/components/public/PublicDocumentShell";
import { CheckCircle2, ExternalLink, Printer, Receipt } from "lucide-react";

export default function PublicInvoicePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [businessName, setBusinessName] = useState("Service Provider");
  const [invoice, setInvoice] = useState<CustomerInvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getPublicInvoice(token)
      .then((res) => {
        setBusinessName(res.business_name);
        setInvoice(res.invoice);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Invoice link could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <PublicDocumentShell businessName={businessName} eyebrow="Customer Invoice">
      {loading ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-10 text-center font-mono text-xs text-[var(--ink-muted)]">
          Loading invoice...
        </div>
      ) : error && !invoice ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-xs font-mono text-rose-700">
          {error}
        </div>
      ) : invoice ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">
                <Receipt className="w-3.5 h-3.5 text-[var(--accent-signal)]" />
                <span className="tabular-nums">{invoice.invoice_number}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--ink-primary)]">
                {invoice.title}
              </h1>
              <p className="text-xs text-[var(--ink-secondary)]">
                Billed to <span className="font-semibold text-[var(--ink-primary)]">{invoice.customer_name}</span>
              </p>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] uppercase border font-semibold ${
                  invoice.status === "paid"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                    : "border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]"
                }`}
              >
                {invoice.status}
              </span>
              {invoice.due_at && (
                <div className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
                  Due {new Date(invoice.due_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          <DocumentLineItems
            items={invoice.line_items}
            subtotalCents={invoice.subtotal_cents}
            taxRateBps={invoice.tax_rate_bps}
            taxCents={invoice.tax_cents}
            totalCents={invoice.total_cents}
            currency={invoice.currency}
            amountPaidCents={invoice.amount_paid_cents}
          />

          {invoice.notes && (
            <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--ink-secondary)]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)] block mb-1">
                Invoice Notes
              </span>
              {invoice.notes}
            </div>
          )}

          {invoice.status === "paid" && (
            <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Paid in full{invoice.paid_at ? ` on ${new Date(invoice.paid_at).toLocaleDateString()}` : ""}.
              </span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:bg-[var(--surface-subtle)]"
            >
              <Printer className="w-4 h-4" />
              Print / Save Receipt
            </button>

            {invoice.status !== "paid" && invoice.status !== "void" && invoice.payment_link_url && (
              <a
                href={invoice.payment_link_url}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-5 py-2 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90"
              >
                <span>Pay Online</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      ) : null}
    </PublicDocumentShell>
  );
}
