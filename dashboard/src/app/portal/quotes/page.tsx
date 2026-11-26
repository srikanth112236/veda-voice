"use client";

import React, { useEffect, useMemo, useState } from "react";
import { api, CustomerQuoteRecord } from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { QuoteInvoiceFormModal, formatCents } from "@/components/billing/QuoteInvoiceFormModal";
import {
  CalendarPlus,
  Check,
  Copy,
  FileCheck2,
  FileText,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";

const STATUS_FILTERS = ["all", "draft", "sent", "approved", "converted", "declined"] as const;

export default function PortalQuotesPage() {
  const [quotes, setQuotes] = useState<CustomerQuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [bookingQuote, setBookingQuote] = useState<CustomerQuoteRecord | null>(null);
  const [bookingStartAt, setBookingStartAt] = useState(() => {
    const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const data = await api.listPortalQuotes();
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to load quotes.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuotes();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return quotes.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.quote_number.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.customer_name.toLowerCase().includes(q)
      );
    });
  }, [quotes, statusFilter, searchQuery]);

  const metrics = useMemo(() => {
    const openCents = quotes
      .filter((q) => q.status === "draft" || q.status === "sent")
      .reduce((sum, q) => sum + q.total_cents, 0);
    const approvedCount = quotes.filter(
      (q) => q.status === "approved" || q.status === "converted"
    ).length;
    const sentCount = quotes.filter((q) => q.status === "sent").length;
    const rate = quotes.length > 0 ? Math.round((approvedCount / quotes.length) * 100) : 0;
    return { openCents, approvedCount, sentCount, rate };
  }, [quotes]);

  const handleCopyLink = (quote: CustomerQuoteRecord) => {
    const url = `${window.location.origin}/quote/${quote.public_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(quote.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (quoteId: string) => {
    setActingId(quoteId);
    try {
      const updated = await api.sendPortalQuote(quoteId);
      setQuotes((prev) => prev.map((q) => (q.id === quoteId ? updated : q)));
      setBanner({ type: "success", text: `Quote ${updated.quote_number} marked as sent.` });
    } catch (err: unknown) {
      setBanner({ type: "error", text: err instanceof Error ? err.message : "Failed to send quote." });
    } finally {
      setActingId(null);
    }
  };

  const handleConvertToInvoice = async (quoteId: string) => {
    setActingId(quoteId);
    try {
      const inv = await api.convertQuoteToInvoice(quoteId);
      setQuotes((prev) =>
        prev.map((q) => (q.id === quoteId ? { ...q, status: "converted" } : q))
      );
      setBanner({
        type: "success",
        text: `Converted to invoice ${inv.invoice_number} (${formatCents(inv.total_cents, inv.currency)}).`,
      });
    } catch (err: unknown) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to convert quote to invoice.",
      });
    } finally {
      setActingId(null);
    }
  };

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingQuote) return;
    setActingId(bookingQuote.id);
    try {
      const iso = new Date(bookingStartAt).toISOString();
      const res = await api.convertQuoteToBooking(bookingQuote.id, {
        start_at: iso,
        duration_minutes: 60,
      });
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === bookingQuote.id ? { ...q, booking_id: res.booking_id, status: "approved" } : q
        )
      );
      setBanner({ type: "success", text: `Booking confirmed for ${bookingQuote.customer_name}.` });
      setBookingQuote(null);
    } catch (err: unknown) {
      setBanner({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to convert quote to booking.",
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink-primary)]">
            Customer Quotes &amp; Estimates
          </h1>
          <p className="text-xs sm:text-sm text-[var(--ink-secondary)] mt-1">
            Build itemized service estimates, share 1-click approval links, and convert approved jobs to bookings or invoices.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={loadQuotes}
            disabled={loading}
            className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] disabled:opacity-50"
            title="Refresh quotes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New Quote
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
          title="Open Pipeline Value"
          value={formatCents(metrics.openCents)}
          icon={FileText}
          accentColor="indigo"
          subtitle="Draft + awaiting customer sign-off"
        />
        <StatCard
          title="Sent & Pending"
          value={metrics.sentCount}
          icon={Send}
          accentColor="amber"
          subtitle="Shared approval links"
        />
        <StatCard
          title="Approved / Converted"
          value={metrics.approvedCount}
          icon={FileCheck2}
          accentColor="emerald"
          subtitle="Ready for dispatch or billing"
        />
        <StatCard
          title="Approval Rate"
          value={`${metrics.rate}%`}
          icon={Receipt}
          accentColor="cyan"
          subtitle="Across all quotes issued"
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
            placeholder="Search quote # or customer..."
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--ink-primary)]"
          />
        </div>
      </div>

      <div className="bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center font-mono text-xs text-[var(--ink-muted)]">
            Loading customer quotes...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-bold text-[var(--ink-primary)]">No quotes match your filter</p>
            <p className="text-xs text-[var(--ink-secondary)]">
              Create your first estimate to send a customer approval link.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--surface-canvas)] border-b border-[var(--border-hairline)] font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                <tr>
                  <th className="py-3 px-4">Quote #</th>
                  <th className="py-3 px-4">Customer &amp; Job</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-[var(--surface-canvas)] transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-[var(--ink-primary)]">
                      {q.quote_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--ink-primary)]">{q.customer_name}</div>
                      <div className="text-[11px] text-[var(--ink-secondary)]">{q.title}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full font-mono text-[10px] uppercase border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)]">
                        {q.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[var(--ink-primary)]">
                      {formatCents(q.total_cents, q.currency)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(q)}
                          className="px-2 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono text-[11px] inline-flex items-center gap-1"
                        >
                          {copiedId === q.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copiedId === q.id ? "Copied" : "Link"}
                        </button>
                        {q.status === "draft" && (
                          <button
                            type="button"
                            disabled={actingId === q.id}
                            onClick={() => handleSend(q.id)}
                            className="px-2.5 py-1 rounded-md bg-[var(--ink-primary)] text-[var(--surface-panel)] font-mono text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <Send className="w-3 h-3" />
                            Send
                          </button>
                        )}
                        {q.status !== "converted" && (
                          <button
                            type="button"
                            disabled={actingId === q.id}
                            onClick={() => handleConvertToInvoice(q.id)}
                            className="px-2.5 py-1 rounded-md bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] font-mono text-[11px] inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <Receipt className="w-3 h-3" />
                            Invoice
                          </button>
                        )}
                        {!q.booking_id && (
                          <button
                            type="button"
                            disabled={actingId === q.id}
                            onClick={() => setBookingQuote(q)}
                            className="px-2 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono text-[11px] inline-flex items-center gap-1"
                          >
                            <CalendarPlus className="w-3 h-3" />
                            Book
                          </button>
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
        mode="quote"
        open={showCreateModal}
        submitting={submitting}
        onClose={() => setShowCreateModal(false)}
        onSubmit={async (payload) => {
          setSubmitting(true);
          try {
            const created = await api.createPortalQuote(payload);
            setQuotes((prev) => [created, ...prev]);
            setShowCreateModal(false);
            setBanner({ type: "success", text: `Quote ${created.quote_number} created.` });
          } catch (err: unknown) {
            setBanner({
              type: "error",
              text: err instanceof Error ? err.message : "Failed to create quote.",
            });
          } finally {
            setSubmitting(false);
          }
        }}
      />

      {bookingQuote && (
        <div
          onClick={() => setBookingQuote(null)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmBooking}
            className="w-full max-w-md bg-[var(--surface-panel)] border border-[var(--border-hairline)] rounded-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--ink-primary)]">
                Convert {bookingQuote.quote_number} to Booking
              </h3>
              <button type="button" onClick={() => setBookingQuote(null)}>
                <X className="w-4 h-4 text-[var(--ink-muted)]" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Appointment Start</label>
              <input
                type="datetime-local"
                value={bookingStartAt}
                onChange={(e) => setBookingStartAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono tabular-nums"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBookingQuote(null)}
                className="px-3 py-2 rounded-lg border border-[var(--border-hairline)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actingId === bookingQuote.id}
                className="px-4 py-2 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] font-semibold"
              >
                Confirm Booking
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
