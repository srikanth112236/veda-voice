# Telephony Inbound Setup Guide (LiveKit + Twilio SIP Trunk)

This guide walks through configuring inbound telephony for the `receptionist` voice agent.
Follow these steps in the Twilio Console and LiveKit CLI (`lk`).

---

## Verified Documentation References
All configurations in this guide were verified against live LiveKit documentation:
- **Twilio Inbound Trunk Integration:** [https://docs.livekit.io/telephony/accepting-calls/inbound-twilio/](https://docs.livekit.io/telephony/accepting-calls/inbound-twilio/)
- **LiveKit Inbound Trunk Reference:** [https://docs.livekit.io/telephony/accepting-calls/inbound-trunk/](https://docs.livekit.io/telephony/accepting-calls/inbound-trunk/)
- **LiveKit SIP Dispatch Rules Reference:** [https://docs.livekit.io/telephony/accepting-calls/dispatch-rule/](https://docs.livekit.io/telephony/accepting-calls/dispatch-rule/)
- **LiveKit Phone Numbers (Inbound Testing):** [https://docs.livekit.io/telephony/start/phone-numbers/](https://docs.livekit.io/telephony/start/phone-numbers/)
- **LiveKit Voice Agent Telephony Integration:** [https://docs.livekit.io/agents/voice-agent/telephony/](https://docs.livekit.io/agents/voice-agent/telephony/)

---

## Part 1: Twilio Console Setup (Elastic SIP Trunk)

Perform the following numbered steps in your Twilio Console:

1. **Create an Elastic SIP Trunk**:
   - Navigate to **Voice** > **Manage** > **Trunks**.
   - Click **Create new SIP Trunk**.
   - Give it a friendly name (e.g. `veda-voice-inbound`).

2. **Configure Origination URI**:
   - In the trunk settings, select the **Origination** tab.
   - Click **Add new Origination URI**.
   - Set the URI to your LiveKit SIP domain:
     `sip:<your-livekit-project-id>.sip.livekit.cloud`
     *(Replace `<your-livekit-project-id>` with your LiveKit Cloud Project ID).*
   - Priority: `10`, Weight: `10`, Status: **Enabled**.

3. **Attach Phone Number**:
   - In the trunk settings, select the **Numbers** tab.
   - Click **Add a Number** and associate your Twilio phone number (e.g. `+15551234567`).

4. **Authentication**:
   - Inbound calls from Twilio to LiveKit do not require SIP Digest authentication unless customized. LiveKit matches incoming SIP traffic by dialed trunk number or IP range.

---

## Part 2: LiveKit Inbound Trunk & Dispatch Rule Deployment

Use the LiveKit CLI (`lk`) to create the trunk and dispatch rule on LiveKit Cloud.

1. **Create the Inbound Trunk**:
   Edit `infra/sip/inbound-trunk.json` to include your actual assigned Twilio phone number in the `numbers` array, then run:
   ```bash
   lk sip inbound create infra/sip/inbound-trunk.json
   ```
   Save the returned Trunk ID (e.g., `ST_xxxxxx`).

2. **Create the SIP Dispatch Rule**:
   Deploy the individual dispatch rule configured with explicit agent dispatch:
   ```bash
   lk sip dispatch create infra/sip/dispatch-rule.json --trunks <TRUNK_ID>
   ```
   > **Note on Explicit Dispatch**: `roomConfig.agents` with `agentName: "receptionist"` is mandatory. Without it, LiveKit creates the room for the incoming caller, but does not launch or attach the `receptionist` worker, leaving the caller with silence.

3. **Verify Configuration**:
   List active inbound trunks and dispatch rules to ensure status is active:
   ```bash
   lk sip inbound list
   ```

---

## Part 3: Security & Minute Theft Prevention

Public SIP endpoints can receive unauthorized automated scans. To prevent third parties from dialing your SIP domain and consuming your billable LLM/TTS/LiveKit minutes:

1. **Restricted Phone Numbers (`numbers`)**:
   - Always declare explicit E.164 phone numbers in `infra/sip/inbound-trunk.json` (`numbers: ["+15551234567"]`).
   - LiveKit rejects incoming SIP INVITE packets targeted at phone numbers not listed in your inbound trunks.

2. **Twilio Signaling IP Whitelisting (`allowed_addresses`)**:
   - Set `allowed_addresses` to only permit connections from official Twilio SIP origination CIDR ranges:
     - North America Virginia: `54.172.60.0/30`
     - North America Oregon: `54.244.51.0/30`
     - Europe Ireland: `54.171.127.192/30`
     - Europe Frankfurt: `35.156.191.128/30`
   - Any SIP INVITE originating from an unlisted IP address is immediately dropped before spinning up an LLM or room.

---

## Part 4: Path B — Alternative Testing via LiveKit Phone Numbers

For rapid inbound testing without configuring a Twilio account or Elastic SIP trunk, LiveKit provides hosted phone numbers:

1. Go to the LiveKit Cloud Dashboard: **Telephony** > **Phone Numbers**.
2. Select **Buy Number** (or assign an available US test number).
3. Attach the dispatch rule `infra/sip/dispatch-rule.json` to this phone number.
4. Call the number to immediately test the local agent running in dev mode (`python -m agent.main dev`).

> **CRITICAL LIMITATION**:
> LiveKit phone numbers are **inbound-only**, available in the **US only**, and **cannot perform SIP call transfers (REFER / warm transfer)**.
> When implementing Milestone M1c (Warm Transfer), you **must** use a Twilio or Telnyx SIP trunk. Do not rely on Path B for transfer verification.
