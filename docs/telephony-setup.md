# Telephony Inbound & Outbound Setup Guide (LiveKit + Telnyx SIP Trunk)

This guide provides end-to-end instructions for configuring SIP trunking between **Telnyx** and **LiveKit Cloud** for the `receptionist` voice agent.

---

## 1. Verified Documentation References

All procedures and attributes cited in this guide are verified against live official documentation:

| Resource | HTTP Status | Key Verified Claim / Line |
|---|---|---|
| [LiveKit SIP Participant Reference](https://docs.livekit.io/reference/telephony/sip-participant/) | **200 OK** | Defines standard participant attributes: `sip.phoneNumber` (*"User's phone number. For inbound trunks, this is the phone number the call originates from"*), `sip.trunkPhoneNumber` (*"Phone number associated with SIP trunk. For inbound trunks, this is the number dialed in to by an end user"*), and `sip.callID` (*"LiveKit's SIP call ID. A unique ID used as a SIP call tag to identify a conversation"*). |
| [Telnyx LiveKit Configuration Guide](https://developers.telnyx.com/docs/voice/sip-trunking/livekit-configuration-guide) | **200 OK** | Defines FQDN SIP connection setup, setting LiveKit SIP URI without `sip:` prefix, DNS record type SRV when port is omitted, `address: "sip.telnyx.com"`, Credentials authentication, and +E.164 number format. |
| [LiveKit Inbound Dispatch Rules](https://docs.livekit.io/telephony/accepting-calls/dispatch-rule/) | **200 OK** | Verifies `rule.dispatchRuleIndividual.roomPrefix` and mandatory `roomConfig.agents` with `agentName: "receptionist"`. |
| [LiveKit Phone Numbers Reference](https://docs.livekit.io/telephony/start/phone-numbers/) | **200 OK** | Confirms procedure to attach dispatch rules to LiveKit numbers via Cloud Dashboard or `lk number update --id <PHONE_NUMBER_ID> --sip-dispatch-rule-id <DISPATCH_RULE_ID>`. |

*(Alternative Carrier: If using Twilio Elastic SIP Trunking instead of Telnyx, refer to the [LiveKit Twilio Integration Guide](https://docs.livekit.io/telephony/accepting-calls/inbound-twilio/) and [Twilio Elastic SIP Trunking IP Addresses](https://www.twilio.com/docs/sip-trunking/ip-addresses)).*

---

## 2. Telnyx Mission Control Portal Setup

Follow these numbered steps in your Telnyx Mission Control Portal ([portal.telnyx.com](https://portal.telnyx.com)):

1. **Create an FQDN SIP Connection**:
   - Go to **Voice** > **SIP Trunking**.
   - Click **Add SIP Connection** and name it (e.g. `veda-voice-telnyx`).
   - Under **Connection Type**, select **FQDN**.
   - Enter your LiveKit SIP URI obtained from your LiveKit Cloud Project Settings (e.g., `<project-id>.sip.livekit.cloud`).
     > **Important**: Do **NOT** prefix with `sip:`. Enter purely the FQDN domain. Leave the port field blank so Telnyx performs DNS **SRV** lookups for automatic load balancing and failover across LiveKit SIP gateways.
   - Click **Add** to save the FQDN settings.

2. **Configure Outbound Calls Authentication**:
   - In the **Authentication & Routing Configuration** section, click the **Outbound Calls Authentication** tab.
   - Set Authentication Method to **Credentials**.
   - Enter a username and password. Save these in `.env.local` as `TELNYX_SIP_USERNAME` and `TELNYX_SIP_PASSWORD`.

3. **Assign Outbound Voice Profile**:
   - On top of the SIP Connection page, switch to the **Outbound** tab.
   - Select your active Outbound Voice Profile (or create one to permit US/international routing).
   - Click **Save** at the bottom of the page.

4. **Associate Phone Number**:
   - Go to **Numbers** > **My Numbers**.
   - Select your purchased number, click **Connection / App**, and assign it to your new SIP Connection (`veda-voice-telnyx`).
   - Ensure the number is formatted in standard **+E.164** format (e.g., `+15551234567`).

---

## 3. LiveKit Trunk & Dispatch Rule Deployment

Using the LiveKit CLI (`lk`), deploy your trunk definitions and explicit agent dispatch rules:

1. **Deploy Inbound Trunk**:
   Edit `infra/sip/inbound-trunk.json` to insert your assigned Telnyx number in `numbers`:
   ```bash
   lk sip inbound create infra/sip/inbound-trunk.json
   ```
   Save the output `SIPTrunkID: ST_xxxxxx`.

2. **Deploy Outbound Trunk**:
   Render the template using the PowerShell helper to securely inject credentials from `.env.local` without committing secrets:
   ```powershell
   .\scripts\render_sip_config.ps1 -Template infra/sip/outbound-trunk.example.json -Output infra/sip/outbound-trunk.local.json
   lk sip outbound create infra/sip/outbound-trunk.local.json
   ```

3. **Deploy Explicit Dispatch Rule**:
   Create the room dispatch rule referencing the inbound trunk:
   ```bash
   lk sip dispatch create infra/sip/dispatch-rule.json --trunks <INBOUND_TRUNK_ID>
   ```
   > **Note on Explicit Dispatch**: `roomConfig.agents` with `agentName: "receptionist"` is required. Without it, LiveKit creates an empty room for the incoming caller without spinning up the receptionist worker, resulting in silence.

---

## 4. Inbound Security & Compensating Controls

Public SIP endpoints are subject to automated scans that attempt to generate unauthorized calls and deplete billable LLM/TTS minutes. The following controls must be implemented:

1. **Numbers Allowlist (`numbers`)**:
   - `infra/sip/inbound-trunk.json` restricts incoming calls strictly to your verified +E.164 numbers. LiveKit drops any SIP INVITE directed to an unregistered number.
   - *TODO*: Add `allowed_addresses` to `inbound-trunk.json` once Telnyx published signaling IP ranges are officially verified and cited.
2. **Per-Tenant Concurrency Limits**:
   - Enforce maximum simultaneous inbound calls per tenant (e.g., max 2 concurrent lines on the starter tier) in the API router before accepting additional calls.
3. **Maximum Call Duration Cap**:
   - The voice agent enforces a hard session limit (e.g., max 10 or 15 minutes) and terminates the session automatically via `end_call("max_duration_exceeded")`.
4. **Daily Minute Alerts**:
   - Monitor aggregate usage across telephony and speech models; trigger email/SMS alerts if tenant exceeds 80% of daily allotted minutes.

---

## 5. Path B: Quick Inbound Test via LiveKit Phone Numbers

For rapid inbound testing without configuring carrier trunks, LiveKit provides hosted US phone numbers:

1. **Purchase Number**:
   - In the LiveKit Cloud Dashboard, navigate to **Telephony** > **Phone Numbers**.
   - Click **Rent a Number**, choose your desired US area code, and complete checkout.
2. **Deploy Dispatch Rule**:
   - Deploy `infra/sip/dispatch-rule.json`:
     ```bash
     lk sip dispatch create infra/sip/dispatch-rule.json
     ```
   - Note the returned `SIPDispatchRuleID: DR_xxxxxx`.
3. **Assign Dispatch Rule to the Number**:
   - **Via Dashboard**: On the **Phone Numbers** page, find your number, click the more menu (`⋮`), select **Assign dispatch rule**, choose `all-tenants-inbound`, and click **Save**.
   - **Via CLI**: Run:
     ```bash
     lk number update --id <PHONE_NUMBER_ID> --sip-dispatch-rule-id <DISPATCH_RULE_ID>
     ```
     *(Ref: https://docs.livekit.io/telephony/start/phone-numbers/)*
4. **Start Agent & Test Call**:
   - Start the agent in development mode:
     ```bash
     python -m agent.main dev
     ```
   - Dial the LiveKit phone number from any cell phone. The agent will answer, state the greeting, and log pipeline latencies turn-by-turn.

> **Path B Limitation**: LiveKit phone numbers are **inbound-only**, available in the **US only**, and **cannot perform SIP call transfers (REFER / warm transfer)**. Milestone M1c transfer testing requires Telnyx or Twilio.
