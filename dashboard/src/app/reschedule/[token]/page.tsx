"use client";

import React, { useEffect, useState, use } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Building2,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Sparkles,
  MapPin,
  CalendarPlus,
  Loader2,
  MessageSquare,
} from "lucide-react";
import {
  api,
  PublicBookingDetails,
  PublicRescheduleSlot,
  PublicRescheduleResult,
} from "@/lib/api";

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export default function PublicReschedulePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [booking, setBooking] = useState<PublicBookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date selection state (generate next 14 days)
  const [availableDays, setAvailableDays] = useState<
    Array<{ dateStr: string; dayName: string; dayNum: number; monthName: string }>
  >([]);
  const [selectedDateStr, setSelectedDateStr] = useState<string>("");

  // Slots state
  const [slots, setSlots] = useState<PublicRescheduleSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<PublicRescheduleSlot | null>(null);

  // Reschedule execution state
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState<PublicRescheduleResult | null>(null);

  // 1. Initial Load: Fetch booking by token
  useEffect(() => {
    async function loadBooking() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getPublicBooking(token);
        setBooking(data);

        // Generate next 14 days starting from tomorrow
        const days = [];
        const today = new Date();
        for (let i = 1; i <= 14; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = d.getDate();
          const monthName = d.toLocaleDateString("en-US", { month: "short" });
          days.push({ dateStr, dayName, dayNum, monthName });
        }
        setAvailableDays(days);
        if (days.length > 0) {
          setSelectedDateStr(days[0].dateStr);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load appointment details.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadBooking();
    }
  }, [token]);

  // 2. Fetch slots when selectedDateStr changes
  useEffect(() => {
    async function loadSlots() {
      if (!token || !selectedDateStr) return;
      try {
        setLoadingSlots(true);
        setSelectedSlot(null);
        const resp = await api.getPublicRescheduleSlots(token, selectedDateStr);
        setSlots(resp.slots || []);
      } catch (err) {
        console.error("Error loading slots:", err);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }

    loadSlots();
  }, [token, selectedDateStr]);

  // 3. Confirm reschedule
  async function handleConfirmReschedule() {
    if (!selectedSlot || !token) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.executePublicReschedule(token, {
        slot_start: selectedSlot.start_iso,
        notes: notes.trim() || undefined,
      });
      setRescheduleResult(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not complete reschedule.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Google Calendar URL generator for confirmation screen
  function generateGoogleCalendarUrl(
    res: PublicRescheduleResult,
    b: PublicBookingDetails
  ): string {
    const title = encodeURIComponent(`${b.service_label} with ${b.business_name}`);
    const details = encodeURIComponent(
      `Appointment rescheduled online.\nService: ${b.service_label}\nProvider: ${b.business_name}\nSupport: ${b.business_phone}`
    );
    // Format YYYYMMDDTHHmmssZ
    const startIso = res.new_start_at.replace(/-|:|\.\d\d\d/g, "");
    const endIso = res.new_end_at.replace(/-|:|\.\d\d\d/g, "");
    const dates = `${startIso}/${endIso}`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
  }

  // -------------------------------------------------------------------------
  // RENDER: Loading Skeleton
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm font-medium text-zinc-400">
            Locating your appointment and checking live schedule...
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Error / Expired Link
  // -------------------------------------------------------------------------
  if (error && !booking) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">
            Reschedule Link Unavailable
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {error || "This appointment link has expired or is no longer valid."}
          </p>
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-xs text-zinc-400">
            Please call our office directly to arrange or update your booking.
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Success Screen
  // -------------------------------------------------------------------------
  if (rescheduleResult && booking) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Appointment Successfully Rescheduled
            </h1>
            <p className="text-xs text-zinc-400">
              A text confirmation has been dispatched to {booking.customer_phone}.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                Service Provider
              </span>
              <span className="text-xs font-semibold text-zinc-200">
                {booking.business_name}
              </span>
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                Service
              </span>
              <span className="text-xs font-semibold text-zinc-200">
                {booking.service_label}
              </span>
            </div>

            <div className="flex items-start justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                New Time
              </span>
              <div className="text-right">
                <span className="text-sm font-bold text-emerald-400 block">
                  {rescheduleResult.formatted_date}
                </span>
                <span className="text-xs font-medium text-zinc-300">
                  {rescheduleResult.formatted_time}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href={generateGoogleCalendarUrl(rescheduleResult, booking)}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700/80 text-zinc-100 text-xs font-semibold border border-zinc-700/80 transition-all active:scale-[0.98]"
            >
              <CalendarPlus className="w-4 h-4 text-emerald-400" />
              <span>Add to Google Calendar</span>
            </a>

            {booking.business_phone && (
              <a
                href={`tel:${booking.business_phone}`}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call {booking.business_name} ({booking.business_phone})</span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Main Reschedule Form
  // -------------------------------------------------------------------------
  if (!booking) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center py-8 px-4 sm:px-6">
      <div className="max-w-2xl w-full space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified Service Portal</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 mt-1">
              {booking.business_name}
            </h1>
          </div>

          {booking.business_phone && (
            <a
              href={`tel:${booking.business_phone}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-zinc-400" />
              <span>{booking.business_phone}</span>
            </a>
          )}
        </header>

        {/* Current Appointment Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Current Scheduled Appointment
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold bg-zinc-800 text-zinc-300 border border-zinc-700/60">
              {booking.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">
                Service
              </span>
              <span className="text-xs font-semibold text-zinc-200">
                {booking.service_label}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                Approx. {booking.duration_minutes} minutes
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
              <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">
                Currently Booked For
              </span>
              <span className="text-xs font-semibold text-zinc-200 block">
                {booking.formatted_date}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">
                {booking.formatted_time}
              </span>
            </div>
          </div>
        </div>

        {/* Step 1: Select New Date */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>1. Select New Date</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              Timezone: {booking.timezone}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {availableDays.map((day) => {
              const isSelected = selectedDateStr === day.dateStr;
              return (
                <button
                  key={day.dateStr}
                  type="button"
                  onClick={() => setSelectedDateStr(day.dateStr)}
                  className={`shrink-0 flex flex-col items-center justify-center p-3 w-16 sm:w-20 rounded-xl border text-center transition-all duration-150 active:scale-[0.98] ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-[10px] font-mono uppercase tracking-wider">
                    {day.dayName}
                  </span>
                  <span className="text-lg font-bold my-0.5 leading-none">
                    {day.dayNum}
                  </span>
                  <span className="text-[10px] font-mono uppercase text-zinc-500">
                    {day.monthName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Select New Time Slot */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>2. Select Open Time Slot</span>
            </span>
            {slots.length > 0 && (
              <span className="text-[11px] font-mono text-zinc-500">
                {slots.filter((s) => s.is_available).length} slots open
              </span>
            )}
          </div>

          {loadingSlots ? (
            <div className="p-8 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
              <span>Checking real-time calendar availability...</span>
            </div>
          ) : slots.length === 0 ? (
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-center text-xs text-zinc-400 space-y-1">
              <p className="font-semibold text-zinc-300">
                No slots available on this date.
              </p>
              <p>Please select another day from the calendar above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {slots.map((slot) => {
                const isSelected = selectedSlot?.start_iso === slot.start_iso;
                const isAvail = slot.is_available;

                return (
                  <button
                    key={slot.start_iso}
                    type="button"
                    disabled={!isAvail}
                    onClick={() => setSelectedSlot(slot)}
                    className={`py-3 px-2 rounded-xl text-xs font-semibold border text-center transition-all duration-150 flex flex-col items-center justify-center gap-1 active:scale-[0.98] ${
                      !isAvail
                        ? "bg-zinc-950/40 border-zinc-900 text-zinc-600 cursor-not-allowed line-through"
                        : isSelected
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm ring-1 ring-emerald-500/30"
                        : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850"
                    }`}
                  >
                    <span>{slot.display_time}</span>
                    {slot.is_arrival_window && (
                      <span className="text-[9px] font-mono uppercase text-zinc-500">
                        Arrival Window
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Optional Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
            <span>3. Special Instructions (Optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, parking instructions, or reason for rescheduling..."
            rows={2}
            className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Action Button */}
        <button
          type="button"
          disabled={!selectedSlot || submitting}
          onClick={handleConfirmReschedule}
          className={`w-full py-3.5 px-6 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 ${
            !selectedSlot || submitting
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-800"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50 active:scale-[0.98] border border-emerald-500/40"
          }`}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Rescheduling your appointment...</span>
            </>
          ) : selectedSlot ? (
            <>
              <span>
                Confirm Reschedule to {selectedSlot.display_time}
              </span>
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <span>Please Select an Open Time Slot Above</span>
          )}
        </button>

        {/* Privacy & Anti-Spam Footer */}
        <footer className="text-center text-[10px] font-mono uppercase tracking-wider text-zinc-600 pt-4">
          Encrypted 1-Tap Reschedule • Powered by VedaVoice Platform
        </footer>
      </div>
    </div>
  );
}
