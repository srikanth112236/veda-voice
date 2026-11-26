import { LegalShell } from "@/components/public/LegalShell";

const SUBPROCESSORS = [
  { name: "LiveKit Cloud", role: "WebRTC/SIP media rooms & real-time agent hosting", region: "US / Global" },
  { name: "Microsoft Azure", role: "API control plane, PostgreSQL 16, Key Vault, Blob Storage", region: "US East 2" },
  { name: "Deepgram", role: "Real-time speech-to-text (Nova-3) via LiveKit Inference", region: "US" },
  { name: "Google (Gemini & Calendar)", role: "LLM turn generation & tenant-authorized OAuth calendar sync", region: "US / Global" },
  { name: "Inworld AI", role: "Real-time neural text-to-speech synthesis", region: "US" },
  { name: "Twilio / Telnyx", role: "SIP trunking, DID provisioning, and transactional SMS", region: "Global" },
];

export default function DpaPage() {
  return (
    <LegalShell eyebrow="DATA PROCESSING ADDENDUM" title="DPA & Sub-Processor Registry">
      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">1. Processing Instructions</h2>
        <p>
          VedaVoice processes caller audio, transcripts, and CRM records solely on documented
          instructions from the Tenant and isolates every query by `tenant_id` with PostgreSQL
          row-level security.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          2. Authorized Sub-Processors
        </h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
          <table className="w-full text-left text-xs data-table">
            <thead className="bg-[var(--surface-canvas)] font-mono text-[10px] uppercase text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-2.5">Sub-Processor</th>
                <th className="px-4 py-2.5">Purpose</th>
                <th className="px-4 py-2.5">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name}>
                  <td className="px-4 py-2.5 font-semibold text-[var(--ink-primary)]">{s.name}</td>
                  <td className="px-4 py-2.5">{s.role}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{s.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </LegalShell>
  );
}
