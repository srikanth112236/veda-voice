"use client";

import React, { useMemo, useState } from "react";
import { LineItemInput } from "@/lib/api";
import { Plus, Trash2, X } from "lucide-react";

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

interface QuoteInvoiceFormModalProps {
  mode: "quote" | "invoice";
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    tax_rate_bps: number;
    notes: string;
    line_items: LineItemInput[];
  }) => Promise<void>;
}

export function QuoteInvoiceFormModal({
  mode,
  open,
  submitting,
  onClose,
  onSubmit,
}: QuoteInvoiceFormModalProps) {
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [taxPct, setTaxPct] = useState("8.0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{ description: string; qty: string; priceUsd: string; category: string }>>([
    { description: "Diagnostic & Service Inspection", qty: "1", priceUsd: "125.00", category: "service" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const subtotalCents = items.reduce((sum, item) => {
      const qty = Math.max(0, parseFloat(item.qty) || 0);
      const unitCents = Math.max(0, Math.round((parseFloat(item.priceUsd) || 0) * 100));
      return sum + Math.round(qty * unitCents);
    }, 0);
    const bps = Math.max(0, Math.min(5000, Math.round((parseFloat(taxPct) || 0) * 100)));
    const taxCents = Math.round((subtotalCents * bps) / 10000);
    return {
      subtotalCents,
      taxBps: bps,
      taxCents,
      totalCents: subtotalCents + taxCents,
    };
  }, [items, taxPct]);

  if (!open) return null;

  const handleAddLine = () => {
    setItems((prev) => [...prev, { description: "", qty: "1", priceUsd: "0.00", category: "service" }]);
  };

  const handleRemoveLine = (index: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !customerName.trim()) {
      setError("Title and customer name are required.");
      return;
    }
    const lineItems: LineItemInput[] = items
      .filter((i) => i.description.trim().length > 0)
      .map((i) => ({
        description: i.description.trim(),
        qty: Math.max(0.25, parseFloat(i.qty) || 1),
        unit_price_cents: Math.max(0, Math.round((parseFloat(i.priceUsd) || 0) * 100)),
        category: i.category || "service",
      }));

    if (lineItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    await onSubmit({
      title: title.trim(),
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim() || null,
      tax_rate_bps: totals.taxBps,
      notes: notes.trim(),
      line_items: lineItems,
    });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-2xl shadow-2xl"
      >
        <div className="p-5 border-b border-[var(--border-hairline)] flex items-center justify-between bg-[var(--surface-canvas)] sticky top-0 z-10">
          <div>
            <h2 className="text-base font-bold text-[var(--ink-primary)]">
              {mode === "quote" ? "Create Customer Quote" : "Create Customer Invoice"}
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              {mode === "quote"
                ? "Generate a shareable estimate with 1-click customer approval."
                : "Issue an itemized service invoice with live balance tracking."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 font-mono">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Job / Service Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Water Heater Replacement & Valve Upgrade"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Customer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Jordan Rivera"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Customer Phone</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+15551234567"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Customer Email</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Tax Rate (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="50"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--ink-primary)]">Line Items</span>
              <button
                type="button"
                onClick={handleAddLine}
                className="px-2.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono text-[11px] inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
                >
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                      )
                    }
                    className="col-span-12 sm:col-span-6 px-2.5 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)]"
                  />
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, qty: e.target.value } : row))
                      )
                    }
                    className="col-span-4 sm:col-span-2 px-2.5 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] font-mono tabular-nums text-[var(--ink-primary)]"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price ($)"
                    value={item.priceUsd}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, priceUsd: e.target.value } : row))
                      )
                    }
                    className="col-span-6 sm:col-span-3 px-2.5 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] font-mono tabular-nums text-[var(--ink-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(idx)}
                    disabled={items.length <= 1}
                    className="col-span-2 sm:col-span-1 p-1.5 rounded-md text-[var(--ink-muted)] hover:text-rose-600 disabled:opacity-30 flex justify-center"
                    aria-label="Remove line item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[var(--ink-primary)]">Notes / Terms</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Includes 12-month labor warranty..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]"
            />
          </div>

          <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono tabular-nums">
            <div className="space-y-0.5 text-[var(--ink-secondary)]">
              <div>Subtotal: {formatCents(totals.subtotalCents)}</div>
              <div>Tax ({taxPct || 0}%): {formatCents(totals.taxCents)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-[var(--ink-muted)]">Total</div>
              <div className="text-xl font-bold text-[var(--ink-primary)]">
                {formatCents(totals.totalCents)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] font-semibold disabled:opacity-50"
            >
              {submitting ? "Saving..." : mode === "quote" ? "Save Quote" : "Save Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
