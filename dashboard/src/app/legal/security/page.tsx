import { LegalShell } from "@/components/public/LegalShell";

export default function SecurityPage() {
  return (
    <LegalShell eyebrow="SECURITY & ISOLATION" title="Multi-Tenant Isolation & Cryptography">
      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          1. Mandatory Multi-Tenant Isolation
        </h2>
        <p>
          Every tenant-owned PostgreSQL table includes a non-null `tenant_id` column and row-level
          security (RLS) policies. Tenant portal users never supply `tenant_id`; scope is derived
          exclusively from signed JWT claims.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          2. Zero Direct Database Access from Voice Workers
        </h2>
        <p>
          Real-time LiveKit voice agents never connect to PostgreSQL or Google Calendar directly. All
          stateful operations traverse authenticated internal API endpoints using short-lived
          call-scoped tokens bound to `tenant_id` and `call_id`.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          3. Encryption &amp; Secret Management
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>TLS 1.2+ in transit across SIP/TLS, HTTPS, and WebRTC SRTP.</li>
          <li>Envelope encryption for OAuth calendar tokens and CRM integration secrets.</li>
          <li>Phone number redaction in worker telemetry logs (`***-***-XXXX`).</li>
        </ul>
      </section>
    </LegalShell>
  );
}
