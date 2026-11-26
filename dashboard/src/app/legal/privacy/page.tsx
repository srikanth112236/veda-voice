import { LegalShell } from "@/components/public/LegalShell";

export default function PrivacyPage() {
  return (
    <LegalShell eyebrow="GLOBAL PRIVACY NOTICE" title="Privacy Policy (US, UK, Canada, UAE & India)">
      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">1. Scope &amp; Roles</h2>
        <p>
          VedaVoice operates as a multi-tenant B2B voice receptionist platform. Each client business
          (Tenant) acts as Data Controller for its callers&apos; personal information, while VedaVoice
          acts as Data Processor / Service Provider under applicable law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">2. Categories of Data</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Telephony metadata: caller number (ANI), dialed number (DID), call duration, SIP ID.</li>
          <li>Conversational data: audio stream, speech-to-text transcripts, intake details, bookings.</li>
          <li>Evidentiary consent records: timestamp, consent text, method, and 5-year audit trail.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          3. Regional Privacy Rights
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>United States (CCPA / CPRA):</strong> Right to know, delete, and correct
            personal information. VedaVoice does not sell personal information.
          </li>
          <li>
            <strong>United Kingdom (UK GDPR &amp; DPA 2018):</strong> Rights of access,
            rectification, erasure, restriction, and portability; ICO complaint right.
          </li>
          <li>
            <strong>Canada (PIPEDA &amp; Law 25):</strong> Meaningful consent, purpose limitation,
            and cross-border transfer transparency.
          </li>
          <li>
            <strong>UAE (PDPL Federal Decree-Law No. 45/2021):</strong> Consent-backed processing,
            right to cessation of processing, and breach notification controls.
          </li>
          <li>
            <strong>India (DPDP Act 2023):</strong> Clear itemized notice, withdrawal of consent as
            easily as given, and grievance redressal mechanism.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">4. Retention &amp; PII Masking</h2>
        <p>
          Call transcripts support one-click PII masking in the portal. Consent records are retained
          for 5 years to evidence regulatory compliance unless earlier lawful deletion is required.
        </p>
      </section>
    </LegalShell>
  );
}
