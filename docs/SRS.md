# AI Voice Agent Platform: SRS, Architecture, Azure Deployment and Build Plan

**Version:** 1.0 | **Date:** 2026-11-12 | **Audience:** you, plus your AI coding agent (Antigravity)
**Purpose:** a single spec the coding agent can read and build from, milestone by milestone.

> Facts about LiveKit limits and pricing were checked on 2026-11-12 against docs.livekit.io and livekit.com/pricing. Vendor limits change. Where a detail is marked **VERIFY**, confirm it in the current docs before building on it. Cost numbers are estimates, not quotes.

---

## 0. How to use this document with Antigravity

1. Create a Git repo. Put this file at `docs/SRS.md`.
2. Create `AGENTS.md` in the repo root using Appendix A.
3. Run milestones **one at a time** (section 20). Each milestone has a prompt, a definition of done, and tests. Do not ask the agent to "build everything".
4. Fix the API contract (OpenAPI) in milestone M2 before running parallel agents on backend and frontend.
5. Review every diff. Commit after each task. Never let the agent hold production secrets.
6. Give the agent the LiveKit docs (the LiveKit docs MCP server, or paste the relevant doc pages) so it does not guess APIs.

### 0.1 Which coding tool to use (OpenCode, Antigravity or Cursor)

| | Antigravity | Cursor | OpenCode (incl. OpenCode Go) |
|---|---|---|---|
| Type | Agent-first IDE from Google, with a manager view for parallel agents and a browser sub-agent | VS Code based editor, strongest editor experience | Open-source terminal agent, bring your own models, parallel agents |
| Cost | Free tier with weekly limits; Google AI Pro about $19.99/month for higher limits refreshed every 5 hours | Free tier is limited; Pro about $20/month; heavy agent use can cost far more | Free software; OpenCode Go is about $10/month for hosted coding models (verify current terms) |
| Limits | Opaque: tied to the amount of agent work, not a fixed prompt count; has been tightened before | Dollar-based usage pool, easier to predict | Depends on the model provider or plan you attach |
| Best at | Multi-file builds, planning artifacts, testing UI in a browser, parallel work | Daily editing, quick targeted changes, polish | Cheap overflow, scripted and terminal workflows, model flexibility |
| Weak at | Quota surprises mid-build; younger product | Cost at heavy use | Less hand-holding, no built-in browser testing |

**Recommendation for you:** use **Antigravity as the main builder** (you already have access, it suits a large multi-file build, and its browser agent can test your dashboard). Upgrade to Google AI Pro for the build period if you hit the weekly limit. Keep **OpenCode Go as the overflow tool** for when Antigravity quota runs out, because it is cheap and uses different models. You do **not** need Cursor for this project unless you prefer its editor and are happy paying for it.

The tool matters less than three habits: a precise spec (this file), small milestones with tests, and reviewing every diff. A weak spec with the best tool still produces a broken system.

---

## 1. Introduction

### 1.1 Purpose
Define the requirements, architecture and deployment of a **multi-tenant AI voice receptionist and outbound calling platform** that an agency operates for many small-business clients (tenants), from one LiveKit Cloud project on the Scale plan, with a CRM, Google Calendar booking and an Azure-hosted control plane.

### 1.2 Scope
In scope for v1:
- Inbound calls answered by an AI agent, per tenant (greeting, FAQs, booking, messages, transfer to humans).
- Outbound calls by the same agent, for **consented** use cases: appointment reminders and confirmations, missed-call call-backs, follow-up on opted-in leads, scheduled call-backs the caller asked for.
- Per-tenant CRM: contacts, calls, leads, bookings, tasks, notes, campaigns, reports.
- Booking against Google Calendar (primary), with Google Meet links for video meetings, plus a provider interface for other calendars.
- Agency admin console: tenants, numbers, usage, cost, margin.
- Deployment on Azure, with the voice workers on LiveKit Cloud.

Out of scope for v1 (listed in section 21): cold outbound sales calling, native mobile apps, full billing engine, SMS at scale (needs per-tenant carrier registration), non-US telephony at launch.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Tenant | One client business, with its own data, numbers, agent settings and users |
| Agency | You: the operator of the platform |
| Call | One inbound or outbound phone conversation |
| Room | A LiveKit room, created per call |
| SIP trunk | The link between a phone carrier (Twilio or Telnyx) and LiveKit |
| Dispatch | Telling LiveKit to start an agent worker in a room |
| STT / LLM / TTS | Speech-to-text, language model, text-to-speech |

### 1.4 References
- LiveKit docs: https://docs.livekit.io (Agents, Telephony, Deploy, Quotas)
- LiveKit pricing and calculator: https://livekit.com/pricing
- Google Calendar API and OAuth documentation
- Azure Container Apps, Database for PostgreSQL, Key Vault documentation

---

## 2. Overall description

### 2.1 Product perspective
Three layers:
1. **Voice layer (LiveKit Cloud):** SIP, rooms, agent hosting, LiveKit Inference (STT, LLM, TTS).
2. **Control plane (Azure):** API, database, job workers, dashboard, secrets, storage, monitoring.
3. **External services:** phone carrier (Twilio or Telnyx), Google Calendar, email provider, optional SMS.

### 2.2 User classes
| User | Needs |
|---|---|
| Agency owner (super admin) | Create and manage tenants, numbers, plans; see usage, cost and margin; support access with audit |
| Tenant owner | Configure agent, hours, FAQs, calendar; see calls, leads, bookings; manage team |
| Tenant staff | Handle callbacks, view and edit contacts and bookings |
| Caller / contact | Talk to the agent, book, get confirmations |
| Developer (you and the AI agent) | Clear APIs, local dev, tests, deploy scripts |

### 2.3 Constraints (verified facts that shape the design)
- **One LiveKit project.** Your startup credit code applies to one project, so all tenants live in one project. Isolation is built in the application layer (section 4).
- **LiveKit Phone Numbers are US-only and inbound-only**, and `TransferSIPParticipant` is **not supported on them** at the time of writing. **Therefore production numbers must come from Twilio or Telnyx (or another SIP carrier)** to get outbound, call transfer and non-US numbers. Use a LiveKit number only for a demo line. (VERIFY current status before building.)
- **Scale plan concurrency (livekit.com/pricing, 2026-11-12):** concurrent agent sessions and LiveKit Inference concurrency both **start at 50 and can be raised up to 600** by requesting an increase in the dashboard (project settings); WebRTC connections up to 5,000. Check your current approved limits in the dashboard (Settings, Project). Design for about 20 concurrent calls expected; treat 80% of your currently approved limit as the working ceiling and request increases early.
- **Agent hosting on LiveKit Cloud** includes session minutes on Scale (50,000 per month per the pricing page at time of writing) and supports explicit dispatch and non-production deployments (Scale: 5 per agent).
- **Outbound calls** need an explicitly created SIP participant (`CreateSIPParticipant`) through an outbound trunk to a carrier.

### 2.4 Assumptions
- 50 tenants active within the first months; average about 1,000 minutes per tenant per month (about 50,000 minutes per month, about 20,000 calls per month).
- Tenants are mainly US small businesses; UK and EU come later through carrier trunks and regional pinning.
- Credits cover LiveKit and model usage for year 1; carrier, Azure, email and Google costs are paid in cash.

---

## 3. System architecture

```
                 PSTN callers / call recipients
                          |
              Twilio or Telnyx (numbers, SIP trunks)
                          |
        +-----------------+------------------+
        |        LiveKit Cloud (ONE project, Scale plan)        |
        |  SIP service -> rooms -> agent worker "receptionist"  |
        |  Inference: STT (Deepgram) / LLM (Gemini or Gemma) / TTS (Rime or Inworld)
        +-----------------+------------------+
                          | HTTPS (service token)      ^ CreateDispatch + CreateSIPParticipant
                          v                            |
   +----------------------- Azure (control plane) ----------------------------+
   |  api (FastAPI)  <->  PostgreSQL Flexible Server (RLS)                     |
   |  dialer-worker (outbound scheduler)    notifier-worker (email/SMS/remind) |
   |  dashboard (Next.js)    Key Vault    Blob Storage    App Insights         |
   +---------------------------------------------------------------------------+
          |                          |                         |
     Google Calendar API        Email (Resend/Postmark)    SMS (optional)
```

### 3.1 Components
| Component | Tech | Hosted on | Responsibility |
|---|---|---|---|
| Voice agent worker | Python, LiveKit Agents | **LiveKit Cloud** (`lk agent deploy`) | Real-time conversation; calls the API for everything stateful |
| API | Python FastAPI, SQLAlchemy, Alembic | Azure Container Apps | Business logic, tenant isolation, calendar, CRM, webhooks, auth |
| Dialer worker | Python, same codebase | Azure Container Apps | Pulls due outbound jobs, applies compliance rules, starts calls |
| Notifier worker | Python | Azure Container Apps | Reminders, confirmations, daily digests, report emails |
| Dashboard | Next.js (React, TypeScript) | Azure Container Apps (or Static Web Apps) | Tenant CRM and agency admin |
| Database | PostgreSQL 16 | Azure Database for PostgreSQL Flexible Server | System of record, row-level security |
| Queue | Postgres-backed queue in v1 (Service Bus later if needed) | Azure | Outbound jobs, notifications |
| Secrets | Azure Key Vault + managed identity | Azure | All credentials and OAuth token encryption keys |
| Files | Azure Blob Storage | Azure | Report PDFs, exported transcripts, optional recordings |
| Monitoring | Application Insights, Log Analytics, LiveKit Agent Insights | Azure and LiveKit | Logs, traces, alerts |

### 3.2 Why the voice workers stay on LiveKit Cloud
Agent workers connect outbound to LiveKit and need low latency to media and inference. Hosting them on LiveKit Cloud avoids running your own autoscaling for real-time workers, counts against the included session minutes, and avoids the extra limits on **self-hosted** agents (concurrency limits per model, development allowances for turn detection). Azure runs the parts that are stateful business logic. If you later must run workers on Azure (data residency or contract reasons), the same code can run on Container Apps with outbound connectivity to LiveKit; budget for the self-hosted limits.

### 3.3 Design rule: the agent never touches the database
The worker calls the API with a signed per-call token containing `tenant_id` and `call_id`. The API enforces tenant scope. This means a prompt-injected or buggy agent cannot read or write another tenant's data.

---

## 4. Multi-tenancy design (single LiveKit project)

### 4.1 Principles
1. **One LiveKit project, one agent deployment** (`receptionist`), many tenants.
2. **Tenant identity travels with the call**, as dispatch metadata or participant attributes, plus the dialed number lookup as a fallback.
3. **All per-tenant behavior is data**, loaded at call start (prompt variables, voice, hours, calendar, transfer numbers, language).
4. **Isolation is enforced in the API and the database**, not in the agent.
5. **Metering is yours.** LiveKit billing is per project, so record every call's seconds per tenant to compute cost and margin.

### 4.2 How a call maps to a tenant
| Direction | Mapping |
|---|---|
| Inbound | A single inbound trunk per carrier account and one dispatch rule. The agent reads the dialed number from SIP participant attributes (`sip.trunkPhoneNumber`, VERIFY attribute name in the SIP participant reference), and calls `GET /internal/tenants/by-number/{e164}`. Optionally add `tenant_id` through dispatch-rule attributes when you create per-number rules. |
| Outbound | The dialer creates an **explicit dispatch** with JSON metadata `{tenant_id, call_id, contact_id, purpose}` and then places the SIP call with the tenant's caller ID. |

Dispatch rule (inbound, shared by all tenants):
```json
{
  "dispatchRule": {
    "name": "all-tenants-inbound",
    "rule": { "dispatchRuleIndividual": { "roomPrefix": "in-" } },
    "roomConfig": { "agents": [ { "agentName": "receptionist" } ] }
  }
}
```
```bash
lk sip inbound create inbound-trunk.json          # numbers list or empty to accept all numbers on the trunk
lk sip dispatch create dispatch-rule.json --trunks <trunk-id>
```
Naming convention for rooms: `in-<random>` (inbound), `out-<tenant>-<call_id>` (outbound). The tenant is stored in your `calls` table, not parsed from the room name.

### 4.3 Per-tenant limits (noisy neighbor control)
- `tenants.max_concurrent_calls` (default 3), enforced in the API when the agent calls `POST /internal/calls/start`. If exceeded, the agent plays a short "we are very busy, we will call you back" message, creates a callback task, and ends.
- Global ceiling `GLOBAL_MAX_CONCURRENT` = 80% of the currently approved LiveKit limit (40 while the limit is the default 50), alert at 60% (30). Update it whenever LiveKit raises the limit.
- Outbound has its own caps: `max_concurrent_outbound` per tenant (default 2) and global 10.
- Minutes plan per tenant: soft alert at 80% of included minutes; hard cap optional.

### 4.4 Data isolation
- Every tenant-owned table has `tenant_id uuid not null`.
- PostgreSQL **row-level security** with `SET app.tenant_id` per request/transaction. Super-admin role bypasses RLS and is audited.
- Object storage paths: `tenants/<tenant_id>/...`.
- Secrets per tenant (Google refresh token, API keys) are encrypted with a key held in Key Vault (envelope encryption); the database stores ciphertext only.
- Tenant users get JWTs with `tenant_id` and role; the API never accepts `tenant_id` from the request body for tenant users.

### 4.5 Tenant provisioning (target: under 15 minutes of operator time)
1. Create tenant (name, timezone, plan, niche template).
2. Buy or attach a phone number (carrier API), add it to the trunk, store in `phone_numbers`.
3. Apply niche template (prompt, FAQ, appointment types, working hours).
4. Invite the owner; owner connects Google Calendar.
5. Run the built-in **test call** (a button that calls the owner's phone with the new agent).
6. Enable forwarding and go live.

Provide a CLI or admin form and a bulk import (CSV) for onboarding many tenants.

---

## 5. Inbound calling

### 5.1 Flow
1. Caller dials the tenant's number. Carrier sends SIP to LiveKit; the dispatch rule creates a room and starts the agent.
2. Agent worker reads SIP attributes, resolves the tenant, calls `POST /internal/calls/start` (gets config, call_id, concurrency verdict).
3. Agent greets, converses, uses tools: availability, booking, messages, transfer, lead capture.
4. On hangup, the worker posts the call summary, transcript, outcome and usage to `POST /internal/calls/{id}/complete`.
5. API creates or updates the contact, lead, booking, tasks, and queues notifications.

### 5.2 Onboarding methods per tenant
- **Call forwarding** from their existing number (no answer, busy, after hours): easiest; their published number never changes.
- **Number port** to your carrier: later.
- **New number** for ad campaigns or demo.

### 5.3 Transfer to a human
- Cold transfer via `TransferSIPParticipant` (carrier must support SIP REFER; **not supported on LiveKit Phone Numbers**).
- **Warm transfer:** the agent places an outbound call to the human via the outbound trunk, speaks a short brief, and bridges (agent-assisted transfer in the LiveKit telephony docs).
- If the human does not answer within 25 seconds, the agent returns to the caller and takes a message.

---

## 6. Outbound calling

### 6.1 Allowed purposes in v1 (consent-based only)
| Purpose | Trigger | Consent basis |
|---|---|---|
| Appointment reminder / confirmation | Booking exists | Customer booked and gave their number |
| Missed-call call-back | Caller hung up or left a message | Caller initiated contact |
| Scheduled call-back | Caller asked "call me at 3pm" | Explicit request recorded in the call |
| Lead follow-up | Web form or opted-in lead | Stored consent with timestamp and source |
| Reactivation (later) | Opted-in customer list | Stored consent; tenant attests |

**No cold calling with AI voices.** The system enforces this: a campaign cannot start unless each contact has a valid consent record (`consents` table) and is not on a suppression list.

### 6.2 Compliance gate (executed by the dialer before every call)
1. Consent exists for this purpose and is not revoked.
2. Number not in tenant suppression list or national DNC (where applicable).
3. Local calling window for the **recipient's** timezone (US default 8:00 to 21:00 local; tenant can narrow; stricter in some states: configurable per state).
4. Frequency cap (e.g. max 2 attempts per day, 5 per week per contact).
5. Caller ID is a number owned by the tenant and registered with the carrier.
6. Concurrency caps (tenant and global).
7. First sentence always identifies the business and that it is an automated assistant; opt-out is honored immediately (adds to suppression, ends call, confirms).
8. Region rules: UK (PECR/Ofcom), EU (GDPR) enable only after legal review.

If any check fails, the job is marked `skipped` with a reason, not retried blindly.

### 6.3 Outbound mechanics (LiveKit)
```python
# dialer: start one call (simplified; VERIFY exact SDK names against current docs)
from livekit import api

async def place_call(lk: api.LiveKitAPI, job):
    room = f"out-{job.tenant_id}-{job.call_id}"
    meta = json.dumps({"tenant_id": job.tenant_id, "call_id": job.call_id,
                       "contact_id": job.contact_id, "purpose": job.purpose})
    await lk.agent_dispatch.create_dispatch(api.CreateAgentDispatchRequest(
        agent_name="receptionist", room=room, metadata=meta))
    await lk.sip.create_sip_participant(api.CreateSIPParticipantRequest(
        sip_trunk_id=job.outbound_trunk_id,
        sip_call_to=job.to_e164,
        sip_number=job.caller_id_e164,          # tenant's caller ID
        room_name=room,
        participant_identity=f"phone-{job.call_id}",
        wait_until_answered=True))
```
Agent side: when `metadata.purpose` is set, it uses the outbound prompt (opening line, purpose, goal), and handles voicemail (leave a short message or hang up per tenant setting), no-answer and busy outcomes (reported via the call error codes), and DTMF if needed.

### 6.4 Outcomes
`answered_booked`, `answered_confirmed`, `answered_rescheduled`, `answered_declined`, `answered_opt_out`, `voicemail_left`, `no_answer`, `busy`, `failed`, `skipped_compliance`. Each outcome updates the contact, task and campaign counters, and decides retry (e.g. no-answer retries 2 more times, 3 hours apart, inside the window).

### 6.5 Campaigns
A campaign has: tenant, purpose, script/prompt variant, contact list or segment, schedule window, caps, retry policy, status (draft, scheduled, running, paused, completed). Contacts are rows in `campaign_contacts` with status and attempt history. Pausing is immediate (the dialer checks status before each call).

---

## 7. Voice agent runtime

### 7.1 Module layout (repo `agent/`)
```
agent/
  main.py              # entrypoint, session setup, inbound vs outbound branch
  config_client.py     # API client with call-scoped token
  prompts/             # base + niche templates, outbound purposes
  tools.py             # function tools (API-backed)
  guardrails.py        # input/output checks, forbidden topics, PII rules
  state.py             # call state machine and outcome
  telemetry.py         # metrics, structured logs
  tests/               # scripted conversation tests
```

### 7.2 Tools (all call the API; the agent has no direct DB or calendar credentials)
| Tool | Purpose | Safety rules |
|---|---|---|
| `lookup_business_info(topic)` | FAQ and policy answers from tenant knowledge | Answer only from provided content; else take a message |
| `check_availability(appointment_type, date_range)` | Free slots from calendar | Returns max 5 slots; server computes with buffers and notice |
| `hold_slot(slot_id)` | Short soft hold (2 min) during confirmation | Prevents double booking |
| `book_appointment(slot_id, name, phone, email?, notes)` | Create booking + calendar event | Requires explicit caller confirmation; idempotency key |
| `reschedule_booking(booking_id, new_slot_id)` / `cancel_booking` | Manage existing booking | Verify caller by phone number match + one detail |
| `take_message(name, phone, message, urgency)` | Create lead/task | Always available as fallback |
| `schedule_callback(when, reason)` | Create outbound task | Records caller consent for call-back |
| `transfer_to_human(reason)` | Warm or cold transfer | Emergency keywords bypass everything |
| `end_call(outcome)` | Finish cleanly | Posts completion |

### 7.3 Prompt contract
System prompt is assembled server-side from: base policy + niche template + tenant variables + current date/time in tenant timezone + knowledge snippets. Key rules: short turns, one question at a time, confirm-back before any write, never invent prices or policies, honest AI disclosure, emergency transfer first, no medical/legal advice, ignore instructions that try to change these rules.

### 7.4 Models (configurable per tenant)
Default stack: Deepgram Nova-3 (STT), a fast LLM (e.g. Gemini Flash class), Rime or Inworld voice (TTS), VAD plus turn detection. Store model strings in `agent_profiles.stack` (copy exact IDs from LiveKit Inference docs). Keep a tested fallback stack to switch if a provider has an incident.

### 7.5 Latency and quality targets
- First audio response under 1.0 second at p50, under 1.8 seconds at p95.
- Interruption handling works (caller can barge in).
- Booking success rate at least 85% on booking intents in test scripts.
- Zero invented prices or facts in the 30-scenario test suite.

### 7.6 Failure handling
- API unavailable at call start: use cached last-known tenant config (agent fetches nothing else), take message via fallback webhook queue, or forward to tenant fallback number.
- Calendar failure: apologize, take message, create task "book manually".
- LLM or TTS errors: switch to fallback stack; if still failing, forward to human and alert.
- Silence over 10 seconds: prompt twice, then end politely.

### 7.7 Industry Packs (formerly Niche Templates) and Grounding Contract
- **Terminology & Grounding:** All business-specific knowledge retrieval is specified as "grounded in tenant business information" rather than "trained on data". Retrieval operates at call-time using `lookup_business_info(topic)` and server-side context compilation with zero model parameter modification.
- **Five-Part Pack Contract:** Every industry pack definition must contain:
  1. The 4 to 8 structured intake questions to classify caller intent into CRM fields.
  2. What counts as an emergency (domain-specific hazard/life-safety triggers).
  3. Appointment types, standard durations, and arrival window policies.
  4. Inviolable "Must Never Say" guardrails (forbidden words, speculative estimates, and physical safety advice).
  5. 3 to 5 sample golden-turn dialogue scenarios.
- **Emergency Safety Policy (No DIY Advice):** The voice agent must NEVER give DIY mechanical, gas, electrical, or repair safety instructions (e.g. never instruct callers to shut off valves, flip electrical breakers, or inspect gas equipment). When an emergency trigger is matched:
  1. Acknowledge caller distress with brief, calm empathy.
  2. Direct caller immediately to certified 911 / emergency services or public utility providers.
  3. Offer immediate priority on-call team escalation and notification.
  4. Cease routine intake questions immediately.
- **Strict Document-Grounded Pricing:** The agent must never invent, estimate, or speculate on prices or diagnostic fees. Quoted prices must match verified tenant knowledge items or approved pack price disclosures. If no match exists, the agent must state that it will have a staff member follow up with an accurate quote.
- **Outbound Consent & Calling Gates:** Outbound voice campaigns require recorded consent, DNC list scrub, 8am-9pm local calling-window compliance, and immediate opt-out before dialing.

---

## 8. Calendar, booking and meeting scheduling

### 8.1 Provider interface
```python
class CalendarProvider(Protocol):
    async def free_busy(self, cal_ref, start, end) -> list[Interval]
    async def create_event(self, cal_ref, event) -> ExternalEvent      # supports Google Meet
    async def update_event(self, cal_ref, event_id, changes) -> ExternalEvent
    async def delete_event(self, cal_ref, event_id) -> None
    async def watch(self, cal_ref) -> WatchChannel                     # push notifications
```
Implementations: `GoogleCalendarProvider` (v1), `CalComProvider` (fallback for clients who use it), `InternalProvider` (availability stored in your DB for clients with no calendar), later `MicrosoftGraphProvider`.

### 8.2 Google Calendar integration
- OAuth 2.0 per tenant (authorization code, offline access) with the narrowest scopes that work (events and free/busy). Store encrypted refresh tokens.
- **Important:** Google treats calendar scopes as sensitive. An **unverified external app in "Testing" status issues refresh tokens that expire after 7 days** and limits users, so production needs Google OAuth verification (privacy policy, domain verification, demo video). **Start the verification in week 2**; it can take weeks. Until then use test users and a manual re-connect. (VERIFY current Google policy.)
- One booking calendar per tenant (or per staff member in v2). Tenant chooses which calendar to read for conflicts and which to write to.
- Create events with `conferenceData` to attach a **Google Meet link** for video appointments; send invites to the contact's email when provided.
- Subscribe to event change notifications (`events.watch`) to keep bookings in sync when the owner edits or deletes events in Google; renew channels before expiry.

### 8.3 Availability engine (server side, never in the LLM)
Inputs: appointment type (duration, buffer before/after, location mode: in person, phone, video), working hours by weekday, holidays and time-off, minimum notice, maximum days ahead, max bookings per day, calendar free/busy, existing holds.
Output: ordered list of slots in the tenant's timezone. Handle DST, all-day events, and tentative events by tenant policy.

### 8.4 Booking rules
- **Idempotent:** `idempotency_key = call_id + slot_id`; the same request twice yields one booking.
- **No double booking:** re-check free/busy immediately before insert, plus a unique constraint on `(tenant_id, resource_id, start_at)` for active bookings.
- State machine: `held -> confirmed -> completed | cancelled | no_show | rescheduled`.
- Every booking links to call, contact and calendar event IDs.

### 8.5 Meeting schedules and reminders
- Appointment types: duration, price note, mode (in person, phone, video), staff, required fields, intake questions.
- Reminders per tenant policy: email 24h and 2h before; optional **voice reminder call** (outbound, section 6) with "press 1 to confirm, 2 to reschedule" or conversational confirm; optional SMS where registered.
- No-show marking (tenant staff action or automatic if call-back outcome is no-answer plus calendar check-in not recorded).
- Daily agenda email to the owner (tomorrow's bookings), weekly summary of calls and bookings.
- Public booking link (v2): lightweight page per tenant using the same availability engine.

### 8.6 Agency demo and sales meetings
Your own sales demos are tracked in your agency CRM (HubSpot Free or the admin console). Use Cal.com or Google Calendar booking links for those; do not mix them with tenant calendars.

---

## 9. CRM and dashboard

### 9.1 Tenant CRM objects
| Object | Key fields |
|---|---|
| Contact | name, phones, emails, source, tags, consent status, first/last contact, notes, lifetime bookings |
| Call | direction, from/to, started, duration, outcome, summary, transcript, recording link, sentiment, tags, cost estimate, linked contact |
| Lead | contact, status (new, contacted, qualified, booked, won, lost), value estimate, source, owner, next action date |
| Booking | contact, type, start/end, status, calendar event, location or Meet link, reminders sent |
| Task | callback, follow-up, manual booking; due, assignee, status |
| Campaign | purpose, script, schedule, counters (attempted, answered, booked, opt-out) |
| Note / activity | timeline entries on contact, call, lead |

### 9.2 Tenant dashboard pages
1. **Overview:** calls today/week/month, answer rate, after-hours calls, bookings, estimated revenue recovered, minutes used vs plan.
2. **Calls:** filterable list (date, outcome, direction, tag, search transcript); detail with audio, transcript, summary, actions taken, "flag as bad call" button.
3. **Contacts:** list and detail timeline (all calls, bookings, notes, tasks).
4. **Leads pipeline:** kanban by status; drag to update; filters.
5. **Calendar:** day/week/month view of bookings; reschedule and cancel; sync status.
6. **Tasks:** callbacks and follow-ups with due dates.
7. **Campaigns (outbound):** create, schedule, pause, results, consent import.
8. **Agent settings:** greeting, voice, hours, FAQ/knowledge, emergency rules, transfer numbers, languages, appointment types, test-call button.
9. **Numbers and integrations:** numbers, forwarding instructions, Google Calendar connect, email.
10. **Reports:** monthly report (view and PDF export), CSV export.
11. **Team and settings:** users, roles, notifications, data retention.

### 9.3 Agency admin console
Tenants list and health; per-tenant minutes, cost, revenue and margin; number inventory; failed calls queue; QA flags; global concurrency view; feature flags per tenant; impersonation with mandatory audit log entry; provider status and cost per minute trends.

### 9.4 Integrations with outside CRMs (phase 3)
Push contacts, calls and bookings to HubSpot, GoHighLevel, Zoho or Salesforce through an `IntegrationProvider` interface and outbound webhooks with signed payloads. Not required for v1; the built-in CRM is the source of truth.

---

## 10. Functional requirements

Priority: **M** = must (v1), **S** = should (v1.1), **C** = could (later).

### 10.1 Tenants, users and security
| ID | Requirement | Pri |
|---|---|---|
| FR-TEN-1 | Agency can create, suspend and delete tenants | M |
| FR-TEN-2 | Each tenant has timezone, plan, minute allowance, concurrency limits | M |
| FR-TEN-3 | Role-based access: agency admin, tenant owner, manager, staff, read-only | M |
| FR-TEN-4 | All tenant data isolated by `tenant_id` with row-level security | M |
| FR-TEN-5 | Audit log of admin impersonation and sensitive changes | M |
| FR-TEN-6 | Tenant data export and deletion on request | S |

### 10.2 Telephony and calls
| ID | Requirement | Pri |
|---|---|---|
| FR-CALL-1 | Inbound call answered by agent within 2 rings equivalent (under 3 s) | M |
| FR-CALL-2 | Tenant resolved from dialed number; unknown numbers get a safe default message | M |
| FR-CALL-3 | Greeting includes business name and AI disclosure per tenant setting | M |
| FR-CALL-4 | Emergency keywords transfer within two turns | M |
| FR-CALL-5 | Warm transfer to staff with fallback to message taking | M |
| FR-CALL-6 | Call record created for every call with outcome, summary, transcript, duration | M |
| FR-CALL-7 | Concurrency limits per tenant and global; graceful busy handling | M |
| FR-CALL-8 | Optional call recording with disclosure; retention per tenant | S |
| FR-CALL-9 | Voicemail/no-answer detection on outbound | M |
| FR-CALL-10 | Multi-language (English first; Spanish second) | S |

### 10.3 Outbound
| ID | Requirement | Pri |
|---|---|---|
| FR-OUT-1 | Campaigns with contact lists, schedule, caps, retries, pause/resume | M |
| FR-OUT-2 | Consent records required per contact and purpose; blocked otherwise | M |
| FR-OUT-3 | Suppression/opt-out list per tenant; "stop calling" honored instantly | M |
| FR-OUT-4 | Recipient-timezone calling windows; frequency caps | M |
| FR-OUT-5 | Tenant caller ID from owned numbers | M |
| FR-OUT-6 | Appointment reminder calls and missed-call call-backs | M |
| FR-OUT-7 | Scheduled call-backs created by the agent | M |
| FR-OUT-8 | Per-campaign results and outcome reporting | M |
| FR-OUT-9 | Region rules for UK/EU (disabled until reviewed) | C |

### 10.4 Calendar and booking
| ID | Requirement | Pri |
|---|---|---|
| FR-CAL-1 | Connect Google Calendar via OAuth; encrypted token storage | M |
| FR-CAL-2 | Server-side availability from working hours, buffers, notice, free/busy | M |
| FR-CAL-3 | Book, reschedule, cancel with idempotency and double-booking protection | M |
| FR-CAL-4 | Google Meet link for video appointments | M |
| FR-CAL-5 | Two-way sync via event watch notifications | S |
| FR-CAL-6 | Email confirmation and calendar invite to contact | M |
| FR-CAL-7 | Reminders by email; optional voice reminder call | M |
| FR-CAL-8 | Multi-staff calendars and round-robin | S |
| FR-CAL-9 | Calendar provider interface (Cal.com, Microsoft later) | S |
| FR-CAL-10 | Tenants with no calendar use internal availability | M |

### 10.5 CRM
| ID | Requirement | Pri |
|---|---|---|
| FR-CRM-1 | Auto-create/merge contact by phone number on each call | M |
| FR-CRM-2 | Contact timeline of calls, bookings, notes, tasks | M |
| FR-CRM-3 | Lead pipeline with statuses and kanban | M |
| FR-CRM-4 | Tasks with due dates, assignee, notifications | M |
| FR-CRM-5 | Call list with filters, full-text transcript search | M |
| FR-CRM-6 | Dashboard KPIs and estimated revenue recovered | M |
| FR-CRM-7 | Monthly report PDF and CSV export | M |
| FR-CRM-8 | Daily digest and weekly summary emails | M |
| FR-CRM-9 | Outbound webhooks and external CRM sync | C |
| FR-CRM-10 | Tags, custom fields | S |

### 10.6 Agency admin
| ID | Requirement | Pri |
|---|---|---|
| FR-ADM-1 | Tenant list with health, usage, cost, margin | M |
| FR-ADM-2 | Number purchase/attach through carrier API | M |
| FR-ADM-3 | Niche templates and one-click tenant setup | M |
| FR-ADM-4 | Failed/flagged call review queue | M |
| FR-ADM-5 | Feature flags and provider/stack switch per tenant | S |
| FR-ADM-6 | Usage export for invoicing | M |

---

## 11. Data model (PostgreSQL)

```sql
create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique not null,
  timezone text not null default 'America/New_York',
  plan text not null default 'growth',
  included_minutes int not null default 1000,
  max_concurrent_calls int not null default 3,
  max_concurrent_outbound int not null default 2,
  status text not null default 'active',            -- active, suspended
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),            -- null = agency admin
  email citext unique not null, name text,
  role text not null check (role in ('agency_admin','owner','manager','staff','readonly')),
  created_at timestamptz not null default now()
);

create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  e164 text unique not null, provider text not null,  -- twilio, telnyx, livekit
  purpose text not null default 'inbound_outbound',    -- inbound, outbound, both
  forward_from text, label text, active bool not null default true
);

create table agent_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  version int not null, is_active bool not null default false,
  greeting text not null, prompt_vars jsonb not null,
  stack jsonb not null,                               -- stt, llm, tts strings
  transfer_numbers jsonb, emergency_keywords text[],
  outbound_scripts jsonb,
  unique (tenant_id, version)
);

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  title text, body text not null, tags text[]
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text, phone text, email text, source text,
  tags text[] default '{}', custom jsonb default '{}',
  first_contact_at timestamptz, last_contact_at timestamptz,
  unique (tenant_id, phone)
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  purpose text not null, channel text not null,        -- voice, sms, email
  source text not null, evidence jsonb,                 -- form url, call id, timestamp
  granted_at timestamptz not null, revoked_at timestamptz
);

create table suppressions (
  tenant_id uuid not null references tenants(id),
  phone text not null, reason text, created_at timestamptz default now(),
  primary key (tenant_id, phone)
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid references contacts(id),
  direction text not null check (direction in ('inbound','outbound')),
  purpose text, from_e164 text, to_e164 text, room text,
  started_at timestamptz, ended_at timestamptz, duration_s int,
  outcome text, summary text, transcript jsonb, recording_url text,
  sentiment text, tags text[], cost_est numeric(8,4),
  campaign_id uuid, error text
);
create index on calls (tenant_id, started_at desc);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid references contacts(id), call_id uuid references calls(id),
  appointment_type_id uuid, start_at timestamptz not null, end_at timestamptz not null,
  status text not null default 'confirmed',
  external_event_id text, meet_url text, location text, notes text,
  idempotency_key text unique, reminders jsonb default '[]'
);
create unique index on bookings (tenant_id, start_at) where status in ('held','confirmed');

create table appointment_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null, duration_min int not null, buffer_before int default 0,
  buffer_after int default 0, mode text not null default 'in_person',
  min_notice_min int default 120, max_days_ahead int default 60, rules jsonb
);

create table calendar_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  provider text not null, account_email text, calendar_id text,
  token_ciphertext bytea, watch_channel jsonb, status text default 'connected'
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  status text not null default 'new', value_est numeric(10,2),
  source text, owner_id uuid references users(id), next_action_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  kind text not null, contact_id uuid references contacts(id), call_id uuid,
  due_at timestamptz, assignee_id uuid, status text default 'open', payload jsonb
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text, purpose text not null, status text not null default 'draft',
  window jsonb, caps jsonb, retry jsonb, script jsonb
);

create table outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  campaign_id uuid, contact_id uuid not null references contacts(id),
  purpose text not null, not_before timestamptz not null,
  attempt int default 0, status text default 'queued', last_reason text
);
create index on outbound_jobs (status, not_before);

create table usage_events (
  id bigserial primary key, tenant_id uuid not null, call_id uuid,
  kind text not null, seconds int, est_cost numeric(8,4), at timestamptz default now()
);

create table audit_log (
  id bigserial primary key, tenant_id uuid, actor_id uuid, action text,
  target text, detail jsonb, at timestamptz default now()
);

-- Row-level security pattern (apply to every tenant table)
alter table calls enable row level security;
create policy tenant_isolation on calls
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

## 12. API specification (REST, versioned `/v1`)

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/magic-link`, `GET /me` |
| Tenants (agency) | `POST/GET /tenants`, `PATCH /tenants/{id}`, `POST /tenants/{id}/provision` |
| Numbers | `GET/POST /numbers`, `POST /numbers/search`, `POST /numbers/{id}/attach` |
| Agent config | `GET/PUT /agent-profile`, `POST /agent-profile/test-call`, `GET/POST /knowledge` |
| Calls | `GET /calls`, `GET /calls/{id}`, `POST /calls/{id}/flag` |
| Contacts | `GET/POST /contacts`, `GET/PATCH /contacts/{id}`, `GET /contacts/{id}/timeline`, `POST /contacts/import` |
| Leads | `GET/POST /leads`, `PATCH /leads/{id}` |
| Bookings | `GET /bookings`, `POST /bookings`, `PATCH /bookings/{id}`, `DELETE /bookings/{id}` |
| Availability | `GET /availability?type=&from=&to=` |
| Calendar | `GET /integrations/google/connect`, `GET /integrations/google/callback`, `DELETE /integrations/google` |
| Tasks | `GET/POST/PATCH /tasks` |
| Campaigns | `GET/POST /campaigns`, `POST /campaigns/{id}/start|pause|resume`, `GET /campaigns/{id}/results` |
| Consents | `POST /consents`, `POST /suppressions`, `DELETE /suppressions/{phone}` |
| Reports | `GET /reports/overview`, `GET /reports/monthly`, `GET /exports/calls.csv` |
| Admin | `GET /admin/tenants/usage`, `GET /admin/flags`, `POST /admin/impersonate` |
| Webhooks in | `POST /webhooks/livekit`, `POST /webhooks/carrier`, `POST /webhooks/google-calendar` |
| Internal (agent only) | `GET /internal/tenants/by-number/{e164}`, `POST /internal/calls/start`, `POST /internal/availability`, `POST /internal/bookings`, `POST /internal/messages`, `POST /internal/tasks`, `POST /internal/calls/{id}/events`, `POST /internal/calls/{id}/complete` |

Rules: OpenAPI generated and committed (`openapi.json`); tenant users never send `tenant_id`; internal endpoints require the call-scoped signed token (`aud=agent`, short expiry); all list endpoints paginate; all writes accept an `Idempotency-Key`; webhook endpoints verify signatures.

---

## 13. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-PERF-1 | Latency | First agent audio under 1.0 s p50, 1.8 s p95; API p95 under 300 ms for agent tool calls |
| NFR-PERF-2 | Capacity | 50 tenants, 25,000 calls/month; 20 concurrent calls expected; 40 sustained ceiling; load test to 50 |
| NFR-AVAIL-1 | Availability | Control plane 99.5% monthly target; voice path inherits LiveKit and carrier SLAs; no single point of failure in API (2+ replicas) |
| NFR-AVAIL-2 | Resilience | If API is down, agent still answers and forwards or takes a message via fallback |
| NFR-SCALE-1 | Scale | API stateless, horizontal scale; DB connection pooling; queue-based workers |
| NFR-SEC-1 | Security | TLS everywhere; secrets in Key Vault; encryption at rest; least-privilege managed identities |
| NFR-SEC-2 | Isolation | RLS on all tenant tables; automated cross-tenant access tests in CI |
| NFR-PRIV-1 | Privacy | PII minimization; configurable retention (default transcripts 90 days, recordings 30 days); export and delete |
| NFR-OBS-1 | Observability | Structured logs with `tenant_id`, `call_id`; metrics and alerts (section 17) |
| NFR-COST-1 | Cost | Platform cost under 10% of tenant revenue; per-tenant cost tracked daily |
| NFR-MAINT-1 | Maintainability | 80%+ test coverage on core modules; IaC for all infrastructure; one-command local environment |
| NFR-COMP-1 | Compliance | Consent, recording notice, AI disclosure, TCPA/PECR/GDPR/HIPAA controls (section 14) |

---

## 14. Security, privacy and compliance

### 14.1 Security controls
- Authentication: email magic link or OTP plus optional passkeys; short-lived JWT access tokens, rotating refresh tokens; agency admin requires MFA.
- Authorization: role checks in API plus RLS in DB. Test that a tenant A user cannot read tenant B rows.
- Secrets: Azure Key Vault; apps use managed identity; no secrets in code, images or CI logs; rotate LiveKit and carrier keys quarterly.
- Prompt-injection defense: tools are narrow, server-validated, tenant-scoped; the LLM never receives credentials; tool arguments are validated; booking and messages need explicit confirmation; no tool can read other tenants or run arbitrary queries.
- Rate limiting and abuse protection on public endpoints and webhooks (signature verification, replay protection).
- Logging: no raw tokens; redact phone numbers and card-like numbers in application logs; transcripts only in the database.
- Backups: PostgreSQL point-in-time restore; test a restore quarterly.

### 14.2 Compliance matrix (get legal review before launch)
| Area | Requirement in this system |
|---|---|
| Call recording | Disclosure played at start when recording is on; per-tenant setting; all-party-consent states and UK/EU rules respected |
| AI disclosure | Greeting identifies an automated assistant; honest answer when asked |
| US outbound (TCPA) | Consent records, suppression, time windows, caller ID, no cold AI calls; STIR/SHAKEN via carrier |
| UK/EU | PECR, UK GDPR/GDPR: DPA with tenants, lawful basis, regional data pinning, data subject rights |
| HIPAA (dental, medical) | Only if a BAA chain exists (LiveKit Scale BAA, every model/telephony/cloud provider, Azure BAA) and a lawyer reviews; otherwise do not claim HIPAA |
| SMS (US) | Needs carrier registration per tenant brand (A2P 10DLC or toll-free verification); disabled by default |
| Google API | OAuth verification and a privacy policy; user data limited to calendar events |

---

## 15. Azure deployment

### 15.1 Decision summary
- **LiveKit Cloud** runs the voice agent worker (`lk agent deploy`).
- **Azure** runs everything stateful: API, workers, database, dashboard, secrets, storage, monitoring.
- Environments: `dev` (cheap, single replica), `staging` (production-like), `prod`. Separate resource groups and separate LiveKit **non-production deployments** (Scale allows 5) for staging.
- Region: choose the Azure region closest to your main customers and to LiveKit (US: East US 2 or Central US). For EU tenants later, deploy a second stack in West Europe and pin LiveKit region (Scale feature).

### 15.2 Resources
| Resource | SKU (starting point) | Notes |
|---|---|---|
| Resource group | `rg-vagency-{env}` | One per environment |
| Container Registry | Basic | Stores API and dashboard images |
| Container Apps environment | Consumption | With Log Analytics workspace |
| Container App `api` | 0.5 vCPU / 1 GiB, min 2, max 6 replicas | HTTPS ingress, custom domain, autoscale on HTTP concurrency |
| Container App `dialer` | 0.5 vCPU / 1 GiB, min 1, max 2 | No public ingress |
| Container App `notifier` | 0.25 vCPU / 0.5 GiB, min 1 | Reminders, digests, reports |
| Container App `dashboard` | 0.5 vCPU / 1 GiB, min 1, max 3 | Or Azure Static Web Apps for a static export |
| PostgreSQL Flexible Server | Dev: Burstable B2s. Prod: General Purpose D2ds_v5, 64 GB, PITR 14 to 35 days | Built-in PgBouncer; HA zone-redundant when revenue supports it |
| Key Vault | Standard | RBAC mode, managed identity access |
| Storage account | StorageV2, LRS (prod: ZRS) | Blob lifecycle rules for retention |
| Application Insights | Workspace-based | Traces, metrics, alerts |
| Azure Cache for Redis (optional) | Basic or Standard C0 | Only if Postgres-based counters become a bottleneck |
| Front Door + WAF (optional) | Standard | Add when you need WAF and global routing |

### 15.3 Network and identity
- Container Apps environment with VNet integration for production; Postgres reachable via private endpoint or restricted firewall rules (allow only the environment's outbound IPs/VNet).
- Managed identities for `api`, `dialer`, `notifier` with Key Vault `Secrets User` role; no secrets in environment variables except Key Vault references.
- Public ingress only for `api` (webhooks, dashboard API) and `dashboard`.
- Inbound webhooks (LiveKit, carriers, Google) validate signatures and are rate limited.

### 15.4 Bootstrap commands (verify flags with `az <command> --help`)
```bash
# variables
RG=rg-vagency-prod; LOC=eastus2; ACR=vagencyacr$RANDOM; ENV=cae-vagency-prod
PG=pg-vagency-prod; KV=kv-vagency-prod; SA=stvagency$RANDOM

az group create -n $RG -l $LOC
az acr create -g $RG -n $ACR --sku Basic
az monitor log-analytics workspace create -g $RG -n log-vagency-prod
az containerapp env create -g $RG -n $ENV -l $LOC          # attach the workspace in the portal or flags
az postgres flexible-server create -g $RG -n $PG -l $LOC \
   --tier GeneralPurpose --sku-name Standard_D2ds_v5 --version 16 \
   --storage-size 64 --backup-retention 14 --admin-user vaadmin --admin-password '<from-secure-source>'
az keyvault create -g $RG -n $KV --enable-rbac-authorization true
az storage account create -g $RG -n $SA --sku Standard_LRS --kind StorageV2

# build and deploy the API image
az acr build -r $ACR -t api:$(git rev-parse --short HEAD) ./api
az containerapp create -g $RG -n api --environment $ENV \
   --image $ACR.azurecr.io/api:$(git rev-parse --short HEAD) \
   --registry-server $ACR.azurecr.io --target-port 8000 --ingress external \
   --min-replicas 2 --max-replicas 6 --system-assigned
```
Prefer **Bicep or Terraform** for repeatability: have the coding agent generate `infra/` (modules for each resource, parameter files for dev, staging, prod) in milestone M6, and keep the CLI above only as a reference.

### 15.5 Deploying the voice agent (LiveKit Cloud)
```bash
cd agent
lk cloud auth                          # once
lk agent create .                      # creates the agent and its production deployment
lk agent update-secrets --secrets-file .env.prod     # API_BASE_URL, INTERNAL_SIGNING_KEY, etc.
lk agent deploy                        # build and roll out
lk agent logs                          # check logs
```
Use a **non-production deployment** for staging and dispatch to it by deployment name. Roll back with LiveKit's rollback commands if a release misbehaves (VERIFY commands in the Deploy docs).

### 15.6 Database migrations and seeding
Alembic migrations run as a Container Apps **job** before each release (`alembic upgrade head`). Seed niche templates with a script. Never run destructive migrations without a backup and a rollback plan.

### 15.7 Rough Azure monthly cost (estimates, check the Azure pricing calculator)
| Item | Dev | Prod (50 tenants) |
|---|---|---|
| Container Apps (all apps) | $10 to 30 | $80 to 180 |
| PostgreSQL | $25 to 50 | $130 to 200 (more with HA) |
| Storage, Key Vault, Registry | $5 to 10 | $15 to 40 |
| Log Analytics / App Insights | $5 to 20 | $25 to 80 |
| Redis (optional) | none | $0 to 40 |
| **Total** | **$50 to 110** | **$250 to 550** |

Check whether you qualify for **Microsoft for Startups Founders Hub** credits, which can offset Azure costs. (VERIFY eligibility and current terms.)

---

## 16. CI/CD and environments

### 16.1 Branch and release flow
`main` is always deployable. Feature branches with PRs. On PR: lint, type check, unit tests, API contract tests, RLS isolation tests, build images. On merge to `main`: deploy to staging, run smoke tests (including a scripted test call), then manual approval to promote to prod.

### 16.2 GitHub Actions outline
```yaml
name: deploy
on: { push: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: "postgres:16", env: { POSTGRES_PASSWORD: test }, ports: ["5432:5432"] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r api/requirements.txt && pytest api/tests -q
  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }   # OIDC login to Azure, no stored secrets
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with: { client-id: ${{ vars.AZURE_CLIENT_ID }}, tenant-id: ${{ vars.AZURE_TENANT_ID }},
                subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }} }
      - run: az acr build -r ${{ vars.ACR }} -t api:${{ github.sha }} ./api
      - run: az containerapp update -g ${{ vars.RG }} -n api --image ${{ vars.ACR }}.azurecr.io/api:${{ github.sha }}
      # agent: deploy to the LiveKit staging deployment with the lk CLI using a CI API key
```

### 16.3 Configuration and secrets
Document every variable in `.env.example` (Appendix B). Production values live in Key Vault and LiveKit agent secrets only.

---

## 17. Observability and operations

### 17.1 Metrics and alerts
| Signal | Alert threshold |
|---|---|
| Concurrent calls (global) | Warn at 30, page at 40 |
| Agent errors per hour | Over 5 |
| First-response latency p95 | Over 2.5 s for 10 minutes |
| API 5xx rate | Over 2% for 5 minutes |
| Outbound job failures | Over 20% in an hour |
| Calendar sync failures per tenant | Any in 24 h |
| Tenant with zero calls for 48 h | Notify (possible forwarding break) |
| Tenant at 80% of included minutes | Notify tenant and you |
| Postgres CPU / storage | Over 75% |
| Credit balance (LiveKit) | Weekly check; alert if burn projects an early end |

### 17.2 Runbooks (write in M7)
Agent not answering; no audio or one-way audio; booking fails; calendar disconnected; carrier outage failover; cost spike; tenant requests deletion; secret rotation; restore from backup.

### 17.3 Support model
Shared inbox, status page (static), weekly review of flagged calls, 14-day onboarding checklist per tenant, monthly report review.

---

## 18. Capacity plan for 50 tenants

| Assumption | Value |
|---|---|
| Tenants | 50 |
| Minutes per tenant per month | about 1,000 (range 300 to 2,500) |
| Total minutes per month | about 50,000 |
| Average call length | 2.5 minutes |
| Calls per month | about 20,000 (25,000 with outbound) |
| Busy-hour share of daily calls | 15% |
| Peak concurrent calls (expected) | 15 to 25 |
| Working ceiling | 80% of the approved LiveKit limit (starts at 50, raisable to 600 on request) |

Implications:
- Agent session minutes (about 50,000 per month) fit within the Scale allowance; telephony minutes through carriers are billed by the carrier.
- Request a limit increase in the dashboard before peak concurrency passes 60% of the current limit (30 of 50). Limits can go up to 600 on Scale. Bringing your own provider keys for some stages is a secondary option and changes billing (VERIFY).
- Database size is small (about 3 GB of transcripts per year); the main constraint is connection count, handled with pooling.
- Load test target: 50 simultaneous simulated calls for 10 minutes in staging, with latency and error budgets met.

Unit cost reference (Scale rates at time of writing): models about $0.01 to $0.04 per minute depending on stack, plus carrier fees of about $0.005 to $0.015 per minute and $1 to $2 per number per month. Credits cover LiveKit and model usage in year 1; carrier fees are cash.

---

## 19. Testing and acceptance

### 19.1 Test layers
1. **Unit tests:** availability engine (DST, buffers, notice), consent/compliance gate, state machine, prompt assembly.
2. **API contract tests** from OpenAPI; **RLS isolation tests** (tenant A cannot see tenant B).
3. **Agent conversation tests** with scripted callers (text-based tests and simulated audio where available): booking, reschedule, FAQ, emergencies, hostile or confused callers, prompt-injection attempts.
4. **Integration tests:** Google Calendar sandbox calendar; carrier test numbers; email delivery.
5. **End-to-end test calls** on real numbers each release (automated smoke test in staging).
6. **Load test:** 50 concurrent simulated calls.
7. **Chaos checks:** API down, calendar down, LLM error, carrier failure.

### 19.2 Acceptance criteria for v1 (go-live checklist)
| # | Criterion |
|---|---|
| 1 | Inbound call to each of 3 pilot tenants answers with the right business context |
| 2 | A booking made by phone appears in the tenant's Google Calendar with a Meet link when video |
| 3 | The booking appears in the dashboard, contact timeline and daily digest |
| 4 | Double-booking test: two concurrent calls cannot book the same slot |
| 5 | Emergency phrase transfers to a human in two turns |
| 6 | Outbound reminder call is placed inside the recipient's allowed window, honors opt-out, and updates the booking |
| 7 | A campaign cannot start with contacts lacking consent |
| 8 | Tenant A user cannot access tenant B data (automated test) |
| 9 | Latency targets met over 100 test calls |
| 10 | 50-concurrent-call load test passes in staging |
| 11 | Backup restore tested; alerts fire in a drill |
| 12 | Legal review done for recording notice, AI disclosure, outbound consent, and contracts |

---

## 20. Build plan, milestones and Antigravity prompts

**Rhythm:** about 8 weeks at 6 hours per day. **Sell in parallel:** the week-2 demo (single tenant) is enough to start outreach; keep building while clients are onboarded manually.

| Milestone | Weeks | Outcome |
|---|---|---|
| M0 Foundation | 0 | Repo, AGENTS.md, local env, accounts, LiveKit project linked |
| M1 Inbound agent v0 | 1 | Single-tenant agent answers a real call via Twilio, books nothing yet |
| M2 Multi-tenant core | 2 | Postgres, RLS, API, tenant config loaded per call, call logging |
| M3 Calendar and booking | 3 | Google Calendar availability and booking with Meet, idempotent |
| M4 CRM and dashboard | 4 to 5 | Calls, contacts, leads, bookings, tasks, settings, reports |
| M5 Outbound | 6 | Reminders, call-backs, campaigns, consent and compliance gate |
| M6 Azure and CI/CD | 7 | Infrastructure as code, staging and prod, pipelines, monitoring |
| M7 Hardening | 7 to 8 | Security tests, load test, runbooks, legal review inputs |
| M8 Pilot | 8 | 3 pilot tenants live; then onboard toward 50 |

### 20.1 Rules for the coding agent (also in AGENTS.md)
Read `docs/SRS.md` first. Work on one milestone only. Plan before coding and list files to change. Write tests with the code. Never invent LiveKit, Google or Azure APIs: look up the current docs and cite the page in the PR notes. Do not add dependencies without saying why. Never commit secrets. Stop and ask when the spec is ambiguous.

### 20.2 Prompts (paste one at a time)

**M0 prompt**
> Read docs/SRS.md and AGENTS.md. Create the monorepo structure: `api/` (FastAPI, SQLAlchemy 2, Alembic, pytest), `agent/` (LiveKit Agents Python), `dashboard/` (Next.js, TypeScript), `infra/`, `docs/`. Add Docker Compose for local Postgres, a `Makefile` with `make dev`, `make test`, and `.env.example` from Appendix B. Add pre-commit (ruff, mypy). Do not implement features yet. Produce a plan first, then the scaffold, then show me how to run it.

**M1 prompt**
> Implement milestone M1. In `agent/`, build a LiveKit Agents voice agent named `receptionist` using LiveKit Inference model strings loaded from env. It must answer inbound SIP calls, read SIP participant attributes, greet with a fixed business greeting, and end calls cleanly. Add `console` and `dev` run instructions. Look up the current LiveKit Agents quickstart and telephony inbound docs and follow them exactly. Output the Twilio elastic SIP trunk steps and the `lk sip inbound create` and `lk sip dispatch create` JSON files with the agent name. Add a text-based conversation test.

**M2 prompt**
> Implement milestone M2. Create the Postgres schema from SRS section 11 as Alembic migrations with RLS on every tenant table. Build the FastAPI endpoints for tenants, numbers, agent profiles, and the internal endpoints `by-number`, `calls/start`, `calls/{id}/events`, `calls/{id}/complete`. Add call-scoped JWT signing. Update the agent to resolve the tenant from the dialed number, fetch config, enforce concurrency limits, and post call completion with transcript and outcome. Tests must include a cross-tenant isolation test and a concurrency-limit test. Generate and commit `openapi.json`.

**M3 prompt**
> Implement milestone M3. Add the CalendarProvider interface and `GoogleCalendarProvider` with OAuth connect and callback flows, encrypted refresh token storage (envelope encryption with a key from env now, Key Vault later), free/busy, event create with Google Meet conference data, update, delete. Build the availability engine (working hours, buffers, notice, DST) and booking service with idempotency keys, slot holds, and the unique constraint. Expose agent tools `check_availability`, `hold_slot`, `book_appointment`, `reschedule_booking`, `cancel_booking` that call the internal API. Write unit tests for DST and double-booking with concurrency. Use a sandbox calendar for integration tests.

**M4 prompt**
> Implement milestone M4 in `dashboard/`. Build the tenant dashboard pages listed in SRS section 9.2 against the committed OpenAPI client, with role-based UI, tables with filters, call detail with transcript and audio, contact timeline, leads kanban, calendar view, tasks, agent settings with a test-call button, reports with PDF/CSV export. Add the agency admin console from 9.3. Use the browser to verify each page works with seeded demo data, and add Playwright tests for the main flows.

**M5 prompt**
> Implement milestone M5. Build the dialer worker and campaign system from SRS section 6: consent and suppression tables enforcement, compliance gate (windows by recipient timezone, frequency caps, caller ID ownership, concurrency caps), explicit agent dispatch plus CreateSIPParticipant with wait_until_answered, outcome handling (answered, voicemail, no answer, busy, opt-out), retries, pause/resume. Add outbound prompts for reminders and call-backs, and voicemail behavior. Tests: the gate blocks calls without consent, outside windows, and for suppressed numbers; opt-out during a call suppresses the contact immediately.

**M6 prompt**
> Implement milestone M6. Create Bicep (or Terraform) modules in `infra/` for the resources in SRS section 15.2 with dev, staging, prod parameter files, managed identities, Key Vault references, and Application Insights. Add Dockerfiles, a migration job, and the GitHub Actions workflows with OIDC login. Add a staging smoke-test script that places a test call and checks the call record. Add Azure Monitor alerts from section 17.1. Provide a runbook for deploy and rollback.

**M7 prompt**
> Implement milestone M7. Add the security checks from section 14, a load-test harness for 50 concurrent simulated calls, chaos tests for API, calendar and LLM failures, and write the runbooks from section 17.2. Produce a checklist mapping every acceptance criterion in section 19.2 to a test or manual step.

### 20.3 Parallel agents (after M2 contract is stable)
Use the Antigravity manager view to run three agents at once: **backend** (M3), **frontend** (M4 against mocked OpenAPI), **infra** (M6 draft). Merge in small PRs; re-run the full test suite after each merge. Do not parallelize two agents that edit the same files.

### 20.4 Quota management
Check your Antigravity usage after M1. If weekly limits block you, either upgrade for the build period or switch the next milestone to OpenCode. Keep prompts short, point to this spec instead of pasting it, and ask for diffs, not full-file rewrites, when editing.

---

## 21. Risks, open questions and future work

### 21.1 Risks
| Risk | Mitigation |
|---|---|
| Google OAuth verification delay | Start in week 2; fall back to Cal.com or internal calendar for early tenants |
| LiveKit concurrency limit (starts at 50) reached | Alert at 60%; request increase in the dashboard (up to 600 on Scale) well before launch peaks; provider keys as secondary backup |
| Carrier outbound issues (CPS limits, caller ID reputation, spam labels) | Register numbers, use verified caller ID/branded calling where available, warm up numbers, keep volumes modest |
| Misuse for unsolicited calling | Consent gate in code; contract terms; audit logs |
| Hallucinated answers | Tight prompt, FAQ-only facts, test suite, transcript review |
| Cost surprises after credits expire (Nov 12, 2027) | Per-tenant cost tracking; pricing includes real platform costs |
| Solo-operator overload | Automation of provisioning, templated onboarding, hire VA at 8 clients |
| Scope creep | Milestone gates; "Could" items stay out of v1 |

### 21.2 Open questions to resolve early
1. Confirm in writing with LiveKit: partner credits apply via Inference; client use allowed; the December invoice is offset.
2. Twilio or Telnyx for production? (Pick one in M1; Telnyx is often cheaper, Twilio has the most examples.)
3. Do you need HIPAA for dental on day one? If yes, schedule the BAA and legal work before selling to dental.
4. Which email provider and sending domain for confirmations and reports?
5. Where will you incorporate and collect payments (affects billing integration later)?

### 21.3 Future work (v2 and beyond)
White-label branding and partner reseller portal; Stripe usage-based billing; external CRM sync; Microsoft 365 calendar; WhatsApp and web chat channels using the same agent; per-tenant knowledge-base upload and retrieval; multi-staff scheduling and round-robin; public booking pages; EU stack in West Europe with region pinning; analytics on call reasons and sentiment.

---

## Appendix A: `AGENTS.md` (put in the repo root)

```markdown
# Project rules for the AI coding agent

- Read docs/SRS.md before any task. Implement only the milestone I name.
- Stack: Python 3.12 + FastAPI + SQLAlchemy 2 + Alembic (api/), LiveKit Agents Python (agent/), Next.js + TypeScript (dashboard/), Bicep or Terraform (infra/).
- Plan first: list files you will change and the tests you will add. Wait for approval on large changes.
- Never invent library, LiveKit, Google or Azure APIs. Read the current docs (use the LiveKit docs MCP server when available) and mention which page you used.
- Every feature ships with tests. Run `make test` before saying a task is done.
- Multi-tenancy is mandatory: every tenant table has tenant_id and RLS. Tenant users never supply tenant_id. The voice agent never accesses the database or calendar directly; it calls internal API endpoints with a call-scoped token.
- Outbound calls must pass the compliance gate (consent, suppression, calling window, caps). Never bypass it, even for tests; use fixtures.
- No secrets in code, logs, images or commits. Use .env.example for names only.
- Keep PRs small. One logical change per commit with a clear message.
- If something in the spec is ambiguous or contradicts the docs, stop and ask.
```

## Appendix B: `.env.example`

```bash
# LiveKit
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=

# Agent -> API
API_BASE_URL=https://api.example.com
INTERNAL_SIGNING_KEY=

# Database
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/vagency

# Auth and app
JWT_SECRET=
APP_BASE_URL=https://app.example.com
ENCRYPTION_KEY_ID=            # Key Vault key reference in cloud; local dev key only in dev

# Carrier
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=            # or TELNYX_API_KEY

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.example.com/v1/integrations/google/callback

# Email
EMAIL_PROVIDER=resend
EMAIL_API_KEY=
EMAIL_FROM=notifications@example.com

# Limits
GLOBAL_MAX_CONCURRENT=40
GLOBAL_MAX_OUTBOUND=10
```

## Appendix C: Glossary of outcomes and statuses

- **Call outcomes:** `booked`, `rescheduled`, `cancelled`, `message_taken`, `info_provided`, `transferred`, `callback_scheduled`, `no_action`, `abandoned`, `failed`, plus outbound outcomes in section 6.4.
- **Lead statuses:** `new`, `contacted`, `qualified`, `booked`, `won`, `lost`.
- **Booking statuses:** `held`, `confirmed`, `completed`, `cancelled`, `no_show`, `rescheduled`.
- **Campaign statuses:** `draft`, `scheduled`, `running`, `paused`, `completed`.
- **Job statuses:** `queued`, `in_progress`, `done`, `skipped`, `failed`.
