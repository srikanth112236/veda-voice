import { LegalShell } from "@/components/public/LegalShell";

export default function TermsPage() {
  return (
    <LegalShell eyebrow="TERMS OF SERVICE" title="Platform Terms & Acceptable Use">
      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">1. Authorized Use</h2>
        <p>
          Tenants may use VedaVoice for inbound customer reception, appointment scheduling, message
          intake, warm human transfers, and consented outbound callbacks/reminders. Cold unsolicited
          telemarketing, robocalling, and deceptive caller ID spoofing are strictly prohibited.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          2. Emergency Services Disclaimer
        </h2>
        <p>
          VedaVoice is not a replacement for 911, 999, 112, or emergency dispatch services. When
          life-safety hazards (gas leaks, fire, electrical arcing) are detected, the agent instructs
          callers to evacuate and contact local emergency services directly.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          3. Tenant Responsibilities
        </h2>
        <p>
          Tenants are responsible for maintaining accurate business hours, service territories,
          recording-disclosure settings for their operating state/country, and valid consent
          records for all outbound contacts.
        </p>
      </section>
    </LegalShell>
  );
}
