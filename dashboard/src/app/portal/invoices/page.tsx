"use client";

import React, { useEffect, useMemo, useState } from "react";
import { api, CustomerInvoiceRecord } from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { QuoteInvoiceFormModal, formatCents } from "@/components/billing/QuoteInvoiceFormModal";
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";

const STATUS_FILTERS = ["all", "draft", "issued", "paid", "overdue", "void"] as const;

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<CustomerInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await api.listPortalInvoices();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load invoices.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.invoice_number.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.customer_name.toLowerCase().includes(q)
      );
    });
  }, [invoices, statusFilter, searchQuery]);

  const metrics = useMemo(() => {
    const collectedCents = invoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.amount_paid_cents, 0);
    const outstandingCents = invoices
      .filter((i) => i.status === "issued" || i.status === "overdue")
      .reduce((sum, i) => sum + Math.max(0, i.total_cents - i.amount_paid_cents), 0);
    const issuedCount = invoices.filter((i) => i.status === "issued").length;
    const paidCount = invoices.filter((i) => i.status === "paid").length;
    return { collectedCents, outstandingCents, issuedCount, paidCount };
  }, [invoices]);

  const handleCopyLink = (inv: CustomerInvoiceRecord) => {
    const url = `${window.location.origin}/invoice/${inv.public_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleIssue = async (invoiceId: string) => {
    setActingId(invoiceId);
    try {
      const updated = await api.issuePortalInvoice(invoiceId);
      setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? updated : i)));
      setBanner({ type: "success", text: `Invoice ${updated.invoice_number} issued.` });
    } catch (err: unknown) {
      setBanner({ type: "error", text: err instanceof Error ? err.message : "Failed to issue invoice." });
    } finally {
      setActingId(null);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    setActingId(invoiceId);
    try {
      const updated = await api.markPortalInvoicePaid(invoiceId);
      setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? updated : i)));
      setBanner({ type: "success", text: `Payment recorded for ${updated.invoice_number}.` });
    } catch (err: unknown) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to record payment.",
      });
    } finally {
      setActingId(null);
    }
  };

  const handleVoid = async (invoiceId: string) => {
    setActingId(invoiceId);
    try {
      const updated = await api.voidPortalInvoice(invoiceId);
      setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? updated : i)));
      setConfirmVoidId(null);
      setBanner({ type: "success", text: `Invoice ${updated.invoice_number} voided.` });
    } catch (err: unknown) {
      setBanner({ type: "error", text: err instanceof Error ? err.message : "Failed to void invoice." });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink-primary)]">
            Customer Service Invoices
          </h1>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)] mt-1">
            Issue itemized job invoices, track collected payments, and share customer receipt links.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={loadInvoices}
            disabled={loading}
            className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] disabled:opacity-50"
            title="Refresh invoices"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Invoice
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-mono flex items-center justify-between gap-3 ${
            banner.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss banner">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Collected Revenue"
          value={formatCents(metrics.collectedCents)}
          icon={DollarSign}
          accentColor="emerald"
          subtitle="Paid customer invoices"
        />
        <StatCard
          title="Outstanding Due"
          value={formatCents(metrics.outstandingCents)}
          icon={Receipt}
          accentColor="amber"
          subtitle="Issued + overdue balance"
        />
        <StatCard
          title="Open Issued"
          value={metrics.issuedCount}
          icon={Send}
          accentColor="indigo"
          subtitle="Awaiting customer payment"
        />
        <StatCard
          title="Paid Invoices"
          value={metrics.paidCount}
          icon={CheckCircle2}
          accentColor="cyan"
          subtitle="Settled in full"
        />
      </div>

      <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-mono text-[11px] uppercase shrink-0 transition-colors ${
                statusFilter === st
                  ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                  : "bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-secondary)]"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice # or customer..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--ink-primary)]"
          />
        </div>
      </div>

      <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center font-mono text-xs text-[var(--ink-muted)]">
            Loading customer invoices...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-[var(--ink-primary)]">No invoices match your filter</p>
            <p className="text-xs text-[var(--ink-secondary)]">
              Create an invoice directly or convert an approved quote.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--surface-canvas)] border-b border-[var(--border-hairline)] font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Customer &amp; Job</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[var(--surface-canvas)] transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-[var(--ink-primary)]">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--ink-primary)]">{inv.customer_name}</div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">{inv.title}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono text-[10px] uppercase border ${
                          inv.status === "paid"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                            : inv.status === "void"
                            ? "border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-muted)]"
                            : "border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[var(--ink-primary)]">
                      {formatCents(inv.total_cents, inv.currency)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(inv)}
                          className="px-2 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono text-[11px] inline-flex items-center gap-1"
                        >
                          {copiedId === inv.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copiedId === inv.id ? "Copied" : "Link"}
                        </button>
                        {inv.status === "draft" && (
                          <button
                            type="button"
                            disabled={actingId === inv.id}
                            onClick={() => handleIssue(inv.id)}
                            className="px-2.5 py-1 rounded-md bg-[var(--ink-primary)] text-[var(--surface-panel)] font-mono text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            Issue
                          </button>
                        )}
                        {(inv.status === "draft" || inv.status === "issued" || inv.status === "overdue") && (
                          <button
                            type="button"
                            disabled={actingId === inv.id}
                            onClick={() => handleMarkPaid(inv.id)}
                            className="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-mono text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Mark Paid
                          </button>
                        )}
                        {inv.status !== "paid" && inv.status !== "void" && (
                          confirmVoidId === inv.id ? (
                            <button
                              type="button"
                              disabled={actingId === inv.id}
                              onClick={() => handleVoid(inv.id)}
                              className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-mono text-[11px] font-semibold"
                            >
                              Confirm Void
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmVoidId(inv.id)}
                              className="px-2 py-1 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-700 font-mono text-[11px] inline-flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              Void
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuoteInvoiceFormModal
        mode="invoice"
        open={showCreateModal}
        submitting={submitting}
        onClose={() => setShowCreateModal(false)}
        onSubmit={async (payload) => {
          setSubmitting(true);
          try {
            const created = await api.createPortalInvoice(payload);
            setInvoices((prev) => [created, ...prev]);
            setShowCreateModal(false);
            setBanner({ type: "success", text: `Invoice ${created.invoice_number} created.` });
          } catch (err: unknown) {
            setBanner({
              type: "error",
              text: err instanceof Error ? err.message : "Failed to create invoice.",
            });
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </div>
  );
}
