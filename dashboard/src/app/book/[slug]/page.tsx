"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { PublicDocumentShell } from "@/components/public/PublicDocumentShell";
import { Calendar, CheckCircle2, Clock } from "lucide-react";

interface SlotOption {
  start?: string;
  end?: string;
  start_iso?: string;
  end_iso?: string;
  label?: string;
  display_time?: string;
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";
  const [businessName, setBusinessName] = useState("Book Appointment");
  const [timezone, setTimezone] = useState("America/New_York");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [serviceType, setServiceType] = useState("Service Appointment");
  const [notes, setNotes] = useState("");

  const [confirmed, setConfirmed] = useState<{
    booking_id: string;
    start_at: string;
    reschedule_token: string;
  } | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    api
      .getPublicBookingAvailability(slug, targetDate)
      .then((res) => {
        setBusinessName(res.business_name);
        setTimezone(res.timezone);
        const list: SlotOption[] = res.availability.slots || res.availability.available_slots || [];
        setSlots(list);
        if (list.length > 0) {
          setSelectedSlot(list[0].start || list[0].start_iso || "");
        } else {
          setSelectedSlot("");
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load available times.");
      })
      .finally(() => setLoading(false));
  }, [slug, targetDate]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setError("Please select an available time slot.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createPublicBooking(slug, {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || null,
        service_type: serviceType.trim() || "Service Appointment",
        slot_start: selectedSlot,
        duration_minutes: 60,
        notes: notes.trim() || undefined,
      });
      setConfirmed({
        booking_id: res.booking_id,
        start_at: res.start_at,
        reschedule_token: res.reschedule_token,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not confirm booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicDocumentShell businessName={businessName} eyebrow="Online Booking">
      {confirmed ? (
        <div className="rounded-xl border border-emerald-500/30 bg-[var(--surface-panel)] p-6 space-y-4">
          <div className="inline-flex items-center gap-2 text-emerald-700 font-semibold text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>Appointment Confirmed</span>
          </div>
          <p className="text-xs text-[var(--ink-secondary)]">
            Scheduled with <strong className="text-[var(--ink-primary)]">{businessName}</strong> for{" "}
            <span className="font-mono tabular-nums text-[var(--ink-primary)]">
              {new Date(confirmed.start_at).toLocaleString()}
            </span>{" "}
            ({timezone}).
          </p>
          {confirmed.reschedule_token && (
            <Link
              href={`/reschedule/${confirmed.reschedule_token}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs font-semibold text-[var(--ink-primary)]"
            >
              Manage / Reschedule Appointment
            </Link>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleBook}
          className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 space-y-6 text-xs"
        >
          <div className="border-b border-[var(--border-hairline)] pb-4 space-y-1">
            <div className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-signal)]">
              <Calendar className="w-3.5 h-3.5" />
              <span>Real-Time Availability</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--ink-primary)]">
              Book with {businessName}
            </h1>
            <p className="text-[var(--ink-secondary)]">
              Times shown in <span className="font-mono">{timezone}</span>.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 font-mono">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Preferred Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Service Type</label>
              <input
                type="text"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-[var(--ink-primary)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
              <span>Available Time Slots</span>
            </label>
            {loading ? (
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono text-[var(--ink-muted)]">
                Checking calendar availability...
              </div>
            ) : slots.length === 0 ? (
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono text-[var(--ink-muted)]">
                No open slots on {targetDate}. Try another date above.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.slice(0, 12).map((slot, idx) => {
                  const slotStart = slot.start || slot.start_iso || "";
                  const isSelected = selectedSlot === slotStart;
                  const parsedDate = slotStart ? new Date(slotStart) : null;
                  const fallbackTime =
                    parsedDate && !Number.isNaN(parsedDate.getTime())
                      ? parsedDate.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : slotStart;
                  const label = slot.label || slot.display_time || fallbackTime;
                  return (
                    <button
                      key={slotStart || idx}
                      type="button"
                      onClick={() => setSelectedSlot(slotStart)}
                      className={`min-h-[44px] px-3 py-2 rounded-lg border font-mono tabular-nums text-xs transition-colors ${
                        isSelected
                          ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] border-[var(--ink-primary)] font-semibold"
                          : "bg-[var(--surface-canvas)] text-[var(--ink-primary)] border-[var(--border-hairline)] hover:border-[var(--ink-muted)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-hairline)]">
            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Your Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Phone Number *</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+15551234567"
                required
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] font-mono tabular-nums"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Email (Optional)</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="font-semibold text-[var(--ink-primary)]">Notes (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !selectedSlot}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Confirming..." : "Confirm Appointment"}
          </button>
        </form>
      )}
    </PublicDocumentShell>
  );
}
