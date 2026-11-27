"use client";

import React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export interface InlineNotice {
  type: "success" | "error" | "info";
  text: string;
}

export function InlineNoticeBanner({
  notice,
  onDismiss,
}: {
  notice: InlineNotice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const tone =
    notice.type === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
      : notice.type === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-primary)]";

  const Icon =
    notice.type === "error" ? AlertCircle : notice.type === "success" ? CheckCircle2 : Info;

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-2.5 text-xs font-mono flex items-center justify-between gap-3 ${tone}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="break-words">{notice.text}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 opacity-70 hover:opacity-100"
        aria-label="Dismiss notice"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
