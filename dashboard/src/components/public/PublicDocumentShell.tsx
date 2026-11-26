"use client";

import React from "react";
import Link from "next/link";
import { LineItemInput } from "@/lib/api";
import { formatCents } from "@/components/billing/QuoteInvoiceFormModal";
import { ShieldCheck } from "lucide-react";

interface PublicDocumentShellProps {
  businessName: string;
  eyebrow: string;
  children: React.ReactNode;
}

export function PublicDocumentShell({
  businessName,
  eyebrow,
  children,
}: PublicDocumentShellProps) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-sans flex flex-col">
      <header className="border-b border-[var(--border-hairline)] bg-[var(--surface-panel)] print:hidden">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
              {eyebrow}
            </div>
            <div className="text-sm font-bold text-[var(--ink-primary)] truncate">
              {businessName}
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] shrink-0"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Powered by VedaVoice</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}

interface DocumentLineItemsProps {
  items: LineItemInput[];
  subtotalCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  amountPaidCents?: number;
}

export function DocumentLineItems({
  items,
  subtotalCents,
  taxRateBps,
  taxCents,
  totalCents,
  currency,
  amountPaidCents,
}: DocumentLineItemsProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="border-b border-[var(--border-hairline)] font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
            <tr>
              <th className="py-2.5 px-3">Description</th>
              <th className="py-2.5 px-3 text-right">Qty</th>
              <th className="py-2.5 px-3 text-right">Unit</th>
              <th className="py-2.5 px-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {items.map((item, idx) => {
              const lineTotal =
                item.line_total_cents ?? Math.round((item.qty || 1) * (item.unit_price_cents || 0));
              return (
                <tr key={idx}>
                  <td className="py-2.5 px-3 font-medium text-[var(--ink-primary)]">
                    {item.description}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--ink-secondary)]">
                    {item.qty}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--ink-secondary)]">
                    {formatCents(item.unit_price_cents, currency)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[var(--ink-primary)]">
                    {formatCents(lineTotal, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs space-y-1.5 text-xs font-mono tabular-nums">
        <div className="flex justify-between text-[var(--ink-secondary)]">
          <span>Subtotal</span>
          <span>{formatCents(subtotalCents, currency)}</span>
        </div>
        <div className="flex justify-between text-[var(--ink-secondary)]">
          <span>Tax ({(taxRateBps / 100).toFixed(2)}%)</span>
          <span>{formatCents(taxCents, currency)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-[var(--border-hairline)] text-sm font-bold text-[var(--ink-primary)]">
          <span>Total</span>
          <span>{formatCents(totalCents, currency)}</span>
        </div>
        {typeof amountPaidCents === "number" && (
          <>
            <div className="flex justify-between text-emerald-700">
              <span>Amount Paid</span>
              <span>{formatCents(amountPaidCents, currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-[var(--ink-primary)]">
              <span>Balance Due</span>
              <span>{formatCents(Math.max(0, totalCents - amountPaidCents), currency)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
