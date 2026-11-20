/**
 * Human-Readable Tag Formatter for CRM and Call Records.
 *
 * Replaces raw technical and internal tags (e.g., "webhook_reconciled", "inbound_outbound")
 * with professional, business-friendly English terminology and distinct badge colors.
 */

export interface FormattedTag {
  label: string;
  color: string;
  isUrgent?: boolean;
}

const TAG_DICTIONARY: Record<string, FormattedTag> = {
  // Urgency & Critical Actions
  emergency: { label: "🚨 Emergency Repair", color: "bg-red-50 text-red-700 border-red-200 font-bold", isUrgent: true },
  emergency_burst: { label: "🚨 Emergency Burst", color: "bg-red-50 text-red-700 border-red-200 font-bold", isUrgent: true },
  pipe_burst: { label: "🚨 Burst Pipe", color: "bg-red-50 text-red-700 border-red-200 font-bold", isUrgent: true },
  urgent: { label: "⚠️ Urgent Request", color: "bg-amber-50 text-amber-700 border-amber-200 font-bold", isUrgent: true },

  // Conversion & Appointments
  appointment_booked: { label: "📅 Booked Appointment", color: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" },
  booked: { label: "📅 Booked", color: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" },
  calendly_booking: { label: "📅 Calendly Booking", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  quote_requested: { label: "💼 Quote Requested", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  message_taken: { label: "📝 Message Taken", color: "bg-blue-50 text-blue-700 border-blue-200" },

  // Channel & Source
  inbound: { label: "📞 Inbound Call", color: "bg-blue-50 text-blue-700 border-blue-200" },
  inbound_call: { label: "📞 Inbound Call", color: "bg-blue-50 text-blue-700 border-blue-200" },
  inbound_outbound: { label: "📞 Phone Line", color: "bg-blue-50 text-blue-700 border-blue-200" },
  outbound: { label: "Outgoing Call", color: "bg-purple-50 text-purple-700 border-purple-200" },
  outbound_call: { label: "Outgoing Call", color: "bg-purple-50 text-purple-700 border-purple-200" },
  webrtc: { label: "🌐 Web Inquiry", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  webrtc_call: { label: "🌐 Web Inquiry", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  website_form: { label: "🌐 Website Form", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  direct: { label: "Direct Triage", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  self_serve: { label: "Self-Service", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  webhook_reconciled: { label: "✓ Verified Record", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  reconciled: { label: "✓ Verified Record", color: "bg-zinc-100 text-zinc-600 border-zinc-200" },

  // Trade Services
  water_heater: { label: "Water Heater", color: "bg-orange-50 text-orange-700 border-orange-200" },
  water_heater_repair: { label: "Water Heater Repair", color: "bg-orange-50 text-orange-700 border-orange-200" },
  drain_cleaning: { label: "Drain Cleaning", color: "bg-teal-50 text-teal-700 border-teal-200" },
  drain_clearing: { label: "Drain Clearing", color: "bg-teal-50 text-teal-700 border-teal-200" },
  boiler: { label: "Boiler Service", color: "bg-amber-50 text-amber-700 border-amber-200" },
  boiler_repair: { label: "Boiler Repair", color: "bg-amber-50 text-amber-700 border-amber-200" },
  pipe_leak: { label: "Pipe Leak Repair", color: "bg-sky-50 text-sky-700 border-sky-200" },
  general_inquiry: { label: "General Inquiry", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  general_appointment: { label: "General Appointment", color: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  interested: { label: "Interested Lead", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export function formatHumanReadableTag(rawTag: string): FormattedTag {
  if (!rawTag || typeof rawTag !== "string") {
    return { label: "General", color: "bg-zinc-100 text-zinc-600 border-zinc-200" };
  }

  const normalized = rawTag.trim().toLowerCase();

  // 1. Direct dictionary match
  if (TAG_DICTIONARY[normalized]) {
    return TAG_DICTIONARY[normalized];
  }

  // 2. Partial keyword matching
  if (normalized.includes("emergency") || normalized.includes("flood") || normalized.includes("burst")) {
    return {
      label: `🚨 ${toTitleCase(normalized)}`,
      color: "bg-red-50 text-red-700 border-red-200 font-bold",
      isUrgent: true,
    };
  }
  if (normalized.includes("book") || normalized.includes("schedul")) {
    return {
      label: `📅 ${toTitleCase(normalized)}`,
      color: "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold",
    };
  }

  // 3. Clean up technical tokens (underscores, dashes) into clean English Title Case
  const cleanLabel = toTitleCase(normalized);
  return {
    label: cleanLabel,
    color: "bg-zinc-100 text-zinc-700 border-zinc-200",
  };
}

function toTitleCase(str: string): string {
  return str
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
