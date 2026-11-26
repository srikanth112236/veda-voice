"use client";

import React, { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { INDUSTRY_CONCEPTS } from "@/data/industries";
import { VoiceIllustration } from "@/components/public/VoiceIllustration";

interface LeadCaptureModalProps {
  initialIndustry: string;
  onClose: () => void;
}

const REGIONS = [
  { code: "US", label: "United States (TCPA / FCC)" },
  { code: "UK", label: "United Kingdom (UK GDPR / PECR)" },
  { code: "CA", label: "Canada (PIPEDA / CRTC)" },
  { code: "UAE", label: "United Arab Emirates (PDPL / TDRA)" },
  { code: "IN", label: "India (DPDP Act / TRAI)" },
];

export function LeadCaptureModal({ initialIndustry, onClose }: LeadCaptureModalProps) {
  const initialIdx = Math.max(
    0,
    INDUSTRY_CONCEPTS.findIndex((c) => c.slug === initialIndustry)
  );
  const [conceptIndex, setConceptIndex] = useState(initialIdx);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState(INDUSTRY_CONCEPTS[initialIdx].slug);
  const [region, setRegion] = useState("US");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    setIndustry(INDUSTRY_CONCEPTS[conceptIndex].slug);
  }, [conceptIndex]);

  const activeConcept = INDUSTRY_CONCEPTS[conceptIndex];

  const handlePrev = () =>
    setConceptIndex((prev) => (prev - 1 + INDUSTRY_CONCEPTS.length) % INDUSTRY_CONCEPTS.length);
  const handleNext = () => setConceptIndex((prev) => (prev + 1) % INDUSTRY_CONCEPTS.length);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consent) {
      setError("Please confirm contact & AI-voice disclosure consent.");
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch("/api/v1/public/website-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          business_name: businessName,
          email,
          phone,
          industry,
          region,
          consent_accepted: consent,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || "Failed to submit request");
      }
      setSubmittedId(data.lead_id || "submitted");
      if (typeof window !== "undefined") {
        sessionStorage.setItem("vedavoice_lead_modal_dismissed", "1");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Request a VedaVoice Demo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 my-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="touch-target absolute right-3 top-3 z-10 inline-flex items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Left Pane: 20 Industry Concepts + Early-Bird Offer */}
        <div className="lg:col-span-6 bg-[var(--surface-canvas)] border-b lg:border-b-0 lg:border-r border-[var(--border-hairline)] p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pr-10">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-signal)] font-semibold">
                Concept {conceptIndex + 1} / {INDUSTRY_CONCEPTS.length} · {activeConcept.category}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Previous industry concept"
                  className="rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Next industry concept"
                  className="rounded border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <h2 className="text-xl font-bold tracking-tight text-[var(--ink-primary)]">
              {activeConcept.name} Receptionist
            </h2>

            <VoiceIllustration bars={activeConcept.waveform} label={activeConcept.name} />

            <div className="space-y-2 text-xs leading-relaxed">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
                <div className="font-mono text-[10px] text-[var(--ink-muted)] mb-0.5">
                  SAMPLE GREETING
                </div>
                <p>{activeConcept.sampleGreeting}</p>
              </div>
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3">
                <div className="font-mono text-[10px] text-[var(--accent-signal)] mb-0.5">
                  AUTONOMOUS ACTION · {activeConcept.latencyMs}ms P50
                </div>
                <p className="font-medium">{activeConcept.agentAction}</p>
              </div>
            </div>
          </div>

          {/* Early-Bird Offer */}
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Early-Bird Founder Offer</span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)]">
              Includes 500 voice minutes and priority SIP trunk provisioning for new workspaces.
            </p>
          </div>
        </div>

        {/* Right Pane: Lead Capture Form */}
        <div className="lg:col-span-6 p-6 flex flex-col justify-center">
          {submittedId ? (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--accent-signal)]" />
              <h3 className="text-lg font-bold text-[var(--ink-primary)]">Request Captured</h3>
              <p className="text-sm text-[var(--ink-secondary)]">
                We logged your {activeConcept.name} demo request ({region}) with consent record{" "}
                <span className="font-mono text-xs">{submittedId.slice(0, 8)}</span>.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="touch-target inline-flex items-center justify-center rounded-md bg-[var(--ink-primary)] px-5 text-sm font-medium text-[var(--surface-panel)]"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="pr-8">
                <h3 className="text-lg font-bold text-[var(--ink-primary)]">
                  Book a live voice walkthrough
                </h3>
                <p className="text-xs text-[var(--ink-secondary)]">
                  Test your own greeting, calendar rules, and regional compliance setup.
                </p>
              </div>

              {error && (
                <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase text-[var(--ink-muted)] mb-1">
                    Full Name
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Priya Nair"
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--ink-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase text-[var(--ink-muted)] mb-1">
                    Business Name
                  </label>
                  <input
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Cedar Dental"
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--ink-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase text-[var(--ink-muted)] mb-1">
                    Work Email
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@business.example"
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--ink-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase text-[var(--ink-muted)] mb-1">
                    Phone Number
                  </label>
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 512 555 0144"
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--ink-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase text-[var(--ink-muted)] mb-1">
                    Industry
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => {
                      setIndustry(e.target.value);
                      const idx = INDUSTRY_CONCEPTS.findIndex((c) => c.slug === e.target.value);
                      if (idx >= 0) setConceptIndex(idx);
                    }}
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--ink-primary)]"
                  >
                    {INDUSTRY_CONCEPTS.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase text-[var(--ink-muted)] mb-1">
                    Region
                  </label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--ink-primary)]"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-[11px] leading-snug text-[var(--ink-secondary)] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--border-hairline)]"
                />
                <span>
                  I consent to VedaVoice contacting me (including via automated AI voice demo
                  callback) in accordance with regional privacy &amp; telecom rules.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="touch-target interactive-lift flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent-signal)] px-4 text-sm font-semibold text-[var(--accent-signal-ink)] disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />
                {submitting ? "Submitting..." : "Claim Early-Bird Walkthrough"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
