"use client";

/**
 * Standard US 12-Hour Time & Explicit Timezone Formatting Suite
 *
 * Implements high-contrast, human-grade US 12-hour time formatting (e.g., "10:00 AM EST")
 * with tabular numeric figures and explicit timezone indicators across all calendar views.
 */

import React from "react";

export const DEFAULT_US_TIMEZONE = "America/New_York";

/**
 * Common US Timezone Friendly Labels
 */
export const US_TIMEZONE_MAP: Record<string, { label: string; standardAbbr: string; daylightAbbr: string }> = {
  "America/New_York": { label: "Eastern Time", standardAbbr: "EST", daylightAbbr: "EDT" },
  "America/Detroit": { label: "Eastern Time", standardAbbr: "EST", daylightAbbr: "EDT" },
  "America/Chicago": { label: "Central Time", standardAbbr: "CST", daylightAbbr: "CDT" },
  "America/Denver": { label: "Mountain Time", standardAbbr: "MST", daylightAbbr: "MDT" },
  "America/Phoenix": { label: "Mountain Time (No DST)", standardAbbr: "MST", daylightAbbr: "MST" },
  "America/Los_Angeles": { label: "Pacific Time", standardAbbr: "PST", daylightAbbr: "PDT" },
  "America/Anchorage": { label: "Alaska Time", standardAbbr: "AKST", daylightAbbr: "AKDT" },
  "Pacific/Honolulu": { label: "Hawaii Time", standardAbbr: "HST", daylightAbbr: "HST" },
};

export function parseDateSafe(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  try {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Returns explicit short timezone code (e.g. "EST", "EDT", "CST", "PST")
 */
export function getTimezoneAbbr(dateInput: Date | string = new Date(), timeZone: string = DEFAULT_US_TIMEZONE): string {
  const d = parseDateSafe(dateInput) || new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || DEFAULT_US_TIMEZONE,
      timeZoneName: "short",
    }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart && tzPart.value) {
      return tzPart.value.replace(/GMT[+-]\d+/, "").trim() || fallbackAbbr(timeZone);
    }
  } catch {
    // fallback
  }
  return fallbackAbbr(timeZone);
}

function fallbackAbbr(timeZone: string): string {
  if (US_TIMEZONE_MAP[timeZone]) {
    return US_TIMEZONE_MAP[timeZone].standardAbbr;
  }
  if (timeZone.includes("New_York") || timeZone.includes("Detroit")) return "EST";
  if (timeZone.includes("Chicago")) return "CST";
  if (timeZone.includes("Denver") || timeZone.includes("Phoenix")) return "MST";
  if (timeZone.includes("Los_Angeles")) return "PST";
  return "US";
}

/**
 * Returns human-friendly US timezone name (e.g., "Eastern Time (ET • America/New_York)")
 */
export function getTimezoneFriendlyName(timeZone: string = DEFAULT_US_TIMEZONE): string {
  const meta = US_TIMEZONE_MAP[timeZone];
  if (meta) {
    return `${meta.label} (${meta.standardAbbr} • ${timeZone})`;
  }
  return timeZone;
}

export interface US12HourParts {
  time: string;
  hour: string;
  minute: string;
  ampm: "AM" | "PM";
  tz: string;
  full: string;
}

/**
 * Decomposes date into standard US 12-hour components for clean typography
 */
export function getUS12HourParts(
  dateInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE
): US12HourParts {
  const d = parseDateSafe(dateInput) || new Date();
  const tz = timeZone || DEFAULT_US_TIMEZONE;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(d);

    let hour = "";
    let minute = "00";
    let ampm: "AM" | "PM" = "AM";
    let tzCode = "";

    for (const p of parts) {
      if (p.type === "hour") hour = p.value;
      else if (p.type === "minute") minute = p.value;
      else if (p.type === "dayPeriod") ampm = (p.value.toUpperCase() === "PM" ? "PM" : "AM");
      else if (p.type === "timeZoneName") tzCode = p.value.replace(/GMT[+-]\d+/, "").trim();
    }

    if (!tzCode) tzCode = fallbackAbbr(tz);
    const time = `${hour}:${minute}`;
    return {
      time,
      hour,
      minute,
      ampm,
      tz: tzCode,
      full: `${time} ${ampm} ${tzCode}`.trim(),
    };
  } catch {
    return {
      time: "12:00",
      hour: "12",
      minute: "00",
      ampm: "PM",
      tz: "EST",
      full: "12:00 PM EST",
    };
  }
}

/**
 * Formats time string to standard US 12-hour: e.g. "10:00 AM"
 */
export function formatUS12Hour(
  dateInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE
): string {
  const parts = getUS12HourParts(dateInput, timeZone);
  return `${parts.time} ${parts.ampm}`;
}

/**
 * Formats time string with explicit timezone: e.g. "10:00 AM EST"
 */
export function formatUS12HourWithTz(
  dateInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE
): string {
  const parts = getUS12HourParts(dateInput, timeZone);
  return `${parts.time} ${parts.ampm} ${parts.tz}`;
}

/**
 * Formats an appointment interval in standard US 12-hour range:
 * e.g. "10:00 AM – 11:00 AM EST"
 */
export function formatUSTimeRange(
  startInput: Date | string,
  endInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE,
  includeTz: boolean = true
): string {
  const s = getUS12HourParts(startInput, timeZone);
  const e = getUS12HourParts(endInput, timeZone);
  const tzSuffix = includeTz ? ` ${s.tz}` : "";
  return `${s.time} ${s.ampm} – ${e.time} ${e.ampm}${tzSuffix}`;
}

/**
 * Formats arrival window in standard US 12-hour:
 * e.g. "8:00 AM – 10:00 AM EST (2-Hr Arrival Window)"
 */
export function formatUSArrivalWindow(
  startInput: Date | string,
  endInput: Date | string,
  hours: number = 2,
  timeZone: string = DEFAULT_US_TIMEZONE
): string {
  const range = formatUSTimeRange(startInput, endInput, timeZone, true);
  return `${range} (${hours}-Hr Arrival Window)`;
}

/**
 * Formats date into standard US format: e.g. "Wed, Nov 20, 2026"
 */
export function formatUSDate(
  dateInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE,
  options?: { weekday?: "short" | "long"; includeYear?: boolean }
): string {
  const d = parseDateSafe(dateInput) || new Date();
  const tz = timeZone || DEFAULT_US_TIMEZONE;
  const weekday = options?.weekday || "short";
  const includeYear = options?.includeYear !== false;

  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday,
      month: "short",
      day: "numeric",
      year: includeYear ? "numeric" : undefined,
      timeZone: tz,
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

/**
 * Formats complete date and time with explicit timezone:
 * e.g. "Wed, Nov 20, 2026 • 10:00 AM – 11:00 AM EST"
 */
export function formatUSDateAndRange(
  startInput: Date | string,
  endInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE
): string {
  const dateStr = formatUSDate(startInput, timeZone, { weekday: "short", includeYear: true });
  const rangeStr = formatUSTimeRange(startInput, endInput, timeZone, true);
  return `${dateStr} • ${rangeStr}`;
}

/**
 * Extracts 0-23 hour in given timezone for schedule grid cell positioning
 */
export function getHourInTimezone(
  dateInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE
): number {
  const d = parseDateSafe(dateInput);
  if (!d) return 0;
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timeZone || DEFAULT_US_TIMEZONE,
    }).format(d);
    return parseInt(hourStr, 10);
  } catch {
    return d.getHours();
  }
}

/**
 * Extracts YYYY-MM-DD date string in given timezone for schedule grid cell matching
 */
export function getDateStringInTimezone(
  dateInput: Date | string,
  timeZone: string = DEFAULT_US_TIMEZONE
): string {
  const d = parseDateSafe(dateInput);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: timeZone || DEFAULT_US_TIMEZONE,
    }).format(d);
  } catch {
    return d.toISOString().split("T")[0];
  }
}

// ============================================================================
// BESPOKE TYPOGRAPHIC REACT COMPONENTS
// ============================================================================

interface USTimeBadgeProps {
  time: Date | string;
  timeZone?: string;
  showTz?: boolean;
  className?: string;
}

/**
 * Renders a single time with high-legibility tabular numbers and subtle AM/PM
 */
export function USTimeBadge({
  time,
  timeZone = DEFAULT_US_TIMEZONE,
  showTz = true,
  className = "",
}: USTimeBadgeProps) {
  const parts = getUS12HourParts(time, timeZone);

  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <span className="tabular-nums font-semibold tracking-tight text-zinc-900">{parts.time}</span>
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{parts.ampm}</span>
      {showTz && (
        <span className="text-[9.5px] font-mono uppercase px-1 py-0.2 rounded bg-zinc-100 text-zinc-600 font-medium ml-0.5 border border-zinc-200/60">
          {parts.tz}
        </span>
      )}
    </span>
  );
}

interface USTimeRangeBadgeProps {
  start: Date | string;
  end: Date | string;
  timeZone?: string;
  isArrivalWindow?: boolean;
  arrivalStart?: Date | string | null;
  arrivalEnd?: Date | string | null;
  className?: string;
}

/**
 * Renders a standard US 12-hour time range (or arrival window) with explicit timezone
 */
export function USTimeRangeBadge({
  start,
  end,
  timeZone = DEFAULT_US_TIMEZONE,
  isArrivalWindow = false,
  arrivalStart = null,
  arrivalEnd = null,
  className = "",
}: USTimeRangeBadgeProps) {
  const targetStart = isArrivalWindow && arrivalStart ? arrivalStart : start;
  const targetEnd = isArrivalWindow && arrivalEnd ? arrivalEnd : end;

  const s = getUS12HourParts(targetStart, timeZone);
  const e = getUS12HourParts(targetEnd, timeZone);

  return (
    <div className={`inline-flex flex-col gap-0.5 ${className}`}>
      <div className="inline-flex items-center gap-1 text-xs">
        <span className="tabular-nums font-semibold text-zinc-900">{s.time}</span>
        <span className="text-[10px] font-bold text-zinc-500 uppercase">{s.ampm}</span>
        <span className="text-zinc-400 font-sans text-[11px] mx-0.5">–</span>
        <span className="tabular-nums font-semibold text-zinc-900">{e.time}</span>
        <span className="text-[10px] font-bold text-zinc-500 uppercase">{e.ampm}</span>
        <span className="text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-semibold border border-zinc-200/80 ml-1">
          {s.tz}
        </span>
      </div>
      {isArrivalWindow && (
        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 rounded px-1.5 py-0.2 w-fit">
          Dispatch Arrival Window
        </span>
      )}
    </div>
  );
}

interface TimezoneIndicatorPillProps {
  timeZone?: string;
  className?: string;
}

/**
 * Header indicator pill showing the active operational US timezone
 */
export function TimezoneIndicatorPill({
  timeZone = DEFAULT_US_TIMEZONE,
  className = "",
}: TimezoneIndicatorPillProps) {
  const tzAbbr = getTimezoneAbbr(new Date(), timeZone);
  const friendlyName = getTimezoneFriendlyName(timeZone);

  return (
    <span
      title={`Active operational timezone: ${friendlyName}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-zinc-100 text-zinc-700 border border-zinc-200/90 shadow-2xs ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
      <span className="font-bold text-zinc-900">{tzAbbr}</span>
      <span className="text-zinc-400 font-sans">•</span>
      <span className="text-zinc-500 font-sans truncate max-w-[140px]">{timeZone}</span>
    </span>
  );
}
