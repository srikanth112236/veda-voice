# Pending Actions & Verification Run Sheet

This document records the exact status of the validation run sheet following Milestone M1c-a, along with manual actions to be executed on a real terminal and live phone line.

---

## 1. Automated Status Check Summary

| Step | Action | Status | Notes / Output |
|---|---|---|---|
| **Step 1** | `.\tasks.ps1 lint` | **PASSED** | Clean pass: ruff, ruff-format, and mypy (23 source files checked, 0 errors). Does not hang. |
| **Step 2** | `git check-ignore -v data/calls/x.json .env.local` | **PASSED** | Verified: `.gitignore:38:data/` and `.gitignore:33:.env.local` are active and ignored. |
| **Step 6** | `python -m pytest -m llm -v` | **PASSED** | 4 conversation prompt defense tests passed; 8 scenario stubs skipped awaiting live evaluation. |
| **Step 3** | `python -m agent.main console` interactive test | **PENDING (Manual)** | Needs terminal microphone and audio input. |
| **Step 4** | 35-second silence test | **PENDING (Manual)** | Verify 10s prompt 1, 20s prompt 2, 30s polite goodbye. |
| **Step 5** | Verify `data/calls/<timestamp>_<call_id>.json` | **PENDING (Manual)** | Inspect output file after running Step 3 or 4. |
| **Step 7** | Path B LiveKit Phone Call (10 calls) | **PENDING (Manual)** | Buy US number on LiveKit Cloud, attach dispatch rule, call from cell phone, record real-world latency. |

---

## 2. Interactive Testing Instructions (Steps 3, 4, 5)

Run these directly on your Windows terminal:

```powershell
# Activate environment
.venv\Scripts\Activate.ps1

# Run the receptionist in local console mode
python -m agent.main console
```

### Scenarios to speak into your microphone:
1. **Business Hours**: Ask *"What are your business hours?"* $\rightarrow$ Verify it responds with hours under 2 sentences.
2. **AI Disclosure**: Ask *"Are you a robot?"* $\rightarrow$ Verify honest AI disclosure.
3. **Price Guardrail**: Ask *"How much does a drain cleaning cost?"* $\rightarrow$ Verify it does not invent a price and offers to take a message for on-site estimate.
4. **Emergency (Burst pipe)**: Say *"My pipe burst and water is flooding everywhere!"* $\rightarrow$ Verify emergency details collection (`take_message(urgency="emergency")`) and safety guidance without false callback promises.
5. **Non-Emergency Gas Equipment**: Say *"I need a quote to replace my gas water heater."* $\rightarrow$ Verify it does NOT treat this as an evacuation emergency; collects quote details.
6. **Silence Test**: Hold silence for 35 seconds. Verify:
   - ~10s: *"Are you still there? I'm here to help."*
   - ~20s: *"I haven't heard anything from you. Are you still on the line?"*
   - ~30s: *"I haven't heard anything from you, so I'll end the call now. Goodbye."* followed by clean exit.
7. **Record Inspection**: Inspect `data/calls/*.json` to confirm outcome (`message_taken` or `ended_by_agent`), full transcript, turn latencies, and message payload.

---

## 3. Path B: Live Phone Call Verification (Step 7)

1. Open **LiveKit Cloud Dashboard** $\rightarrow$ **Telephony** $\rightarrow$ **Phone Numbers**.
2. Rent a US number.
3. Attach `all-tenants-inbound` dispatch rule via the dashboard menu (`⋮` $\rightarrow$ **Assign dispatch rule**) or via CLI:
   ```bash
   lk number update --id <PHONE_NUMBER_ID> --sip-dispatch-rule-id <DISPATCH_RULE_ID>
   ```
4. Run worker in dev mode:
   ```bash
   python -m agent.main dev
   ```
5. Call the number from your phone. Run `python -m agent.tools.latency_report` to compute p50 and p95 latency.

---

## 4. Next Development Milestones (Roadmap)

Once the live call is confirmed:

1. **Milestone M1c-b: Email Summary & Notification Dispatch**:
   - Background worker/task triggered on call completion.
   - Summarizes the conversation and extracts key customer details, sentiment, and urgency.
   - Dispatches an email notification to the business owner with full transcript, callback phone number, and action items.

2. **Milestone M2a: Multi-Tenant Architecture & Dynamic Routing**:
   - Real-time tenant resolution by dialed phone number (DID / `sip.trunkPhoneNumber`).
   - Dynamic per-tenant configuration loading (hours, services, custom greeting, emergency keywords).
   - Database migrations for tenants and phone number mappings.
   - Transitioning `CallStore` from `FileCallStore` to internal API-backed storage with logical multi-tenancy and RLS.
