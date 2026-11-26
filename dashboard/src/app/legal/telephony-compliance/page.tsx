import { LegalShell } from "@/components/public/LegalShell";

export default function TelephonyCompliancePage() {
  return (
    <LegalShell
      eyebrow="TELEPHONY & AI VOICE"
      title="Multi-Jurisdiction Telecom & AI Disclosure Standards"
    >
      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          1. Mandatory Recording &amp; AI Voice Disclosure
        </h2>
        <p>
          Every inbound and outbound call configured with recording disclosure speaks the notice in
          Turn 1 with caller barge-in disabled (`allow_interruptions=False`) so ambient noise
          cannot truncate legal disclosure. Automated post-call QA flags any call missing Turn-1
          disclosure as a critical compliance failure.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          2. Outbound Compliance Gate (Zero Bypass)
        </h2>
        <p>
          VedaVoice prohibits cold outbound sales calling. Every consented outbound call (missed-call
          callbacks, appointment reminders, opted-in web leads) must pass four mandatory gates:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Verified `ConsentRecord` with AI-voice disclosure.</li>
          <li>DNC / internal opt-out suppression list check.</li>
          <li>Recipient local timezone calling-window enforcement.</li>
          <li>Per-contact and per-tenant daily frequency caps.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-[var(--ink-primary)]">
          3. Regional Telecom Authorities
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>US:</strong> TCPA, FCC AI-generated voice rules, STIR/SHAKEN attestation via
            Twilio/Telnyx, all-party recording state compliance.
          </li>
          <li>
            <strong>UK:</strong> Ofcom CLI presentation rules and PECR automated calling consent.
          </li>
          <li>
            <strong>Canada:</strong> CRTC Unsolicited Telecommunications Rules &amp; DNCL.
          </li>
          <li>
            <strong>UAE:</strong> TDRA telemarketing hours (9 AM – 6 PM) and DNCR screening.
          </li>
          <li>
            <strong>India:</strong> TRAI TCCCPR 2018, DND preference honoring, and DLT template
            registration for SMS confirmations.
          </li>
        </ul>
      </section>
    </LegalShell>
  );
}
