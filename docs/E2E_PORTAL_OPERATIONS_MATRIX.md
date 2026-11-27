# VedaVoice — Complete Operations & Intelligence E2E QA Matrix

**Live Base URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io`  
**Companion Voice Suite:** [VOICE_AGENT_500_QUESTIONS_SUITE.md](file:///c:/Users/USER/Documents/vedasynk-applications/veda-voice/docs/VOICE_AGENT_500_QUESTIONS_SUITE.md)

---

## Global Verification Gate (Apply to Every Route)
- [ ] **Network:** `0` HTTP `500` / `404` / `401` errors on authorized pages.
- [ ] **Console:** `0` uncaught JS errors or React hydration warnings.
- [ ] **Desktop (`1440x900`) & Mobile (`390x844`):** `document.documentElement.scrollWidth <= window.innerWidth` (`0` horizontal overflow).
- [ ] **Persistence:** After every Create/Update/Delete, refresh the page (`F5`) and verify state persists from PostgreSQL.
- [ ] **Tenant Isolation:** Log in as a second tenant and confirm zero records leak across tenants.

---

## 0. Client Onboarding, Auth & PWA Install
1. **Onboarding (`/onboarding`):**
   - [ ] Fill Business Name, Owner Name, Email, Password, Timezone, Operating Hours.
   - [ ] Select Industry Pack blueprint and complete onboarding wizard.
   - [ ] Confirm redirect to `/portal/dashboard` (or `/login`) with provisioned `Tenant` and `AgentProfile`.
2. **Authentication (`/login` & `/admin/tenants`):**
   - [ ] Test invalid password -> clear error message, no crash.
   - [ ] Test valid owner login -> JWT stored, portal loads.
   - [ ] Test Admin impersonation (`/admin/tenants` -> `Open Portal`) -> header shows target tenant name + SIP Active status.
3. **PWA Installability:**
   - [ ] Verify `/manifest.webmanifest`, `/sw.js`, `/icons/icon-192.png` return HTTP `200`.
   - [ ] In non-installed browser (fresh `localStorage`), verify `[data-testid="pwa-install-prompt"]` appears after ~2s.
   - [ ] Click `Not now` -> prompt hides and stays hidden after reload.
   - [ ] Click `Install App` (Chrome/Edge/Android) -> native install dialog triggers; after install, prompt never shows in `standalone` mode.

---

## 1. Dashboard Overview (`/portal/dashboard`)
- **APIs Expected `200`:** `/api/v1/auth/me`, `/api/v1/portal/dashboard`
- **Actions to Test:**
  - [ ] Verify KPI cards (Total Calls, Answered, Bookings, Emergencies, Minutes Remaining) show real numbers and zero stuck loading skeletons.
  - [ ] Click **Test Voice Call (WebRTC)** in top bar -> grant mic permission -> connect to LiveKit room -> speak 1 turn -> end call cleanly.
  - [ ] Verify Recent Calls / Recent Activity rows link directly to `/portal/calls`.
  - [ ] Resize to `390x844` -> verify KPI cards stack cleanly with `0` clipping.

---

## 2. Call Explorer & Audio (`/portal/calls`)
- **APIs Expected `200`:** `/api/v1/portal/calls`, `/api/v1/portal/calls/{id}`
- **Actions to Test:**
  - [ ] **Filters:** Filter by Urgency (`emergency`, `urgent`, `normal`), Outcome (`completed`, `booked`, `transferred`, `message_taken`), and Search by phone/keyword.
  - [ ] **Pagination:** Switch page size (`10` / `25`) and navigate Next/Previous page.
  - [ ] **Audio Player:** Select a call -> click Play/Pause -> adjust playback speed -> scrub timeline.
  - [ ] **Transcript & Jump-to-Turn:** Click any turn -> verify audio/highlight jumps to that turn; verify latency badges (`SLA Pass` / `SLA Target` / `Breach`) display ms values.
  - [ ] **PII Redaction Toggle:** Toggle PII mask ON -> confirm phone numbers/emails redact; toggle OFF -> restored.
  - [ ] **Fix This Answer Modal (Phase 3):**
    - [ ] Click `Fix This Answer` on an AI turn.
    - [ ] Mode 1 (`Objection Rule`): enter caller trigger + better response -> click `Save & Test` -> verify confirmation + simulated answer preview.
    - [ ] Mode 2 (`Add FAQ`): add question + answer -> click `Save & Test` -> verify saved to `/portal/profile` FAQs.
    - [ ] Mode 3 (`Bar Phrase`): save phrase -> verify added to `barred_phrases`.
  - [ ] **Follow-Up & QA Override:** Mark call `Followed Up` -> refresh and confirm persisted; open `QA Override`, set score/notes, save.

---

## 3. Outbound Campaigns (`/portal/campaigns`)
- **APIs Expected `200`:** `/api/v1/portal/campaigns`
- **Actions to Test:**
  - [ ] **Create Campaign:** Set Name, Purpose (`speed_to_lead`, `appointment_reminder`, `callback_scheduled`, `reactivation`), Script/Notes, Target Contacts.
  - [ ] **Compliance Gate Verification:**
    - [ ] Add a number on the DNC/opt-out list -> confirm compliance gate blocks/skips it.
    - [ ] Verify calling-window hours enforcement.
  - [ ] **Lifecycle Controls:** Start/Launch -> Pause -> Resume -> Inspect attempt/completion counters.

---

## 4. Native CRM Pipeline (`/portal/crm`)
- **APIs Expected `200`:** `/api/v1/portal/crm/contacts` (and pipeline endpoints)
- **Actions to Test:**
  - [ ] **View Modes & Search:** Search contact by name, phone, or email; filter by pipeline stage/status.
  - [ ] **Create Contact:** Add manual contact -> verify appears in pipeline.
  - [ ] **Contact Detail & Timeline:** Open contact -> verify unified timeline shows inbound/outbound calls, bookings, quotes, and invoices.
  - [ ] **Stage Move & Notes:** Change contact stage (e.g. `New Lead` -> `Quoted` -> `Booked` -> `Won`), add internal note -> refresh to confirm persisted.

---

## 5. Integrations & Sync (`/portal/integrations`)
- **APIs Expected `200`:** `/api/v1/portal/integrations`, `/api/v1/portal/calendar/status`
- **Actions to Test:**
  - [ ] **Google Calendar:** Check connection status; test OAuth connect/reconnect flow or sync trigger.
  - [ ] **Calendly:** Enter/toggle Calendly scheduling URL -> save -> verify persistence.
  - [ ] **Webhooks / External CRM:** Configure webhook endpoint URL + secret -> click **Send Test Event** -> verify HTTP status feedback.
  - [ ] **Google Sheets Sync:** Toggle/configure sheet ID if enabled -> save.

---

## 6. Knowledge Base RAG (`/portal/knowledge`)
- **APIs Expected `200`:** `/api/v1/portal/knowledge/documents`, `/api/v1/portal/knowledge/faqs`
- **Actions to Test:**
  - [ ] **Document Upload:** Upload `.txt`, `.md`, or `.pdf` -> verify document appears with chunk count and `indexed` status.
  - [ ] **Manual FAQ CRUD:** Add FAQ (Question, Answer, Category, Alternate Phrasings) -> Edit -> Delete.
  - [ ] **RAG Query Tester:** Enter a natural-language caller question -> run test query -> verify top matching snippet, source title, and confidence score.

---

## 7. Staff & Dispatch (`/portal/calendar`)
- **APIs Expected `200`:** `/api/v1/portal/calendar/staff`, `roster`, `status`, `bookings`, `settings`
- **Actions to Test:**
  - [ ] **Staff Management:** Add Staff Member (Name, Role/Specialty, Phone, Email, Active toggle) -> Edit -> Save.
  - [ ] **Roster & Working Hours:** Set Mon–Sun open/close hours and breaks per staff -> save.
  - [ ] **Scheduling Settings:** Toggle `Exact Time` vs `Arrival Window` (`2-Hr` / `4-Hr`); change `Buffer Minutes` (`15`/`20`/`30`/`45`) and `Buffer Mode` (`after`/`both`) -> save.
  - [ ] **Bookings CRUD:** Create booking -> verify appears in schedule grid -> attempt overlapping booking on same staff/slot -> verify double-booking rejection.
  - [ ] **Reschedule & Cancel:** Move booking to new time; cancel booking -> verify slot frees up immediately.

---

## 8. Quotes & Estimates (`/portal/quotes`)
- **APIs Expected `200`:** `/api/v1/portal/quotes`
- **Actions to Test:**
  - [ ] **Create Quote:** Fill Customer Name, Phone, Email, Title, multiple Line Items (Description, Qty, Unit Price), Tax Rate, Notes -> Save -> verify Subtotal/Tax/Total math.
  - [ ] **Edit & Send:** Edit draft quote -> click **Send Quote** -> status becomes `sent`, copy `/quote/[public_token]` URL.
  - [ ] **Public Approval Sync:** Approve via `/quote/[token]` -> return to `/portal/quotes` and refresh -> verify status = `approved`.
  - [ ] **One-Click Conversions:**
    - [ ] Click **Convert to Invoice** -> verify new invoice opens/created with matching line items and total.
    - [ ] Click **Convert to Booking** -> verify booking created on `/portal/calendar`.
  - [ ] **Filter & Search:** Filter by status (`draft`, `sent`, `viewed`, `approved`, `declined`).

---

## 9. Customer Invoices (`/portal/invoices`)
- **APIs Expected `200`:** `/api/v1/portal/invoices`
- **Actions to Test:**
  - [ ] **Create Invoice:** Create standalone invoice with line items, tax, and due date -> verify total math.
  - [ ] **Send Invoice:** Click **Send** -> copy `/invoice/[public_token]` link -> open in new tab.
  - [ ] **Record Payment:** Click **Record Payment / Mark Paid** (partial or full amount) -> verify status updates (`paid`) and `amount_paid_cents` persists after reload.
  - [ ] **Void / Filter:** Filter by `draft`, `sent`, `paid`, `overdue`.

---

## 10. Locations & Branches (`/portal/locations`)
- **APIs Expected `200`:** `/api/v1/portal/locations?include_inactive=true`
- **Actions to Test:**
  - [ ] **Add / Edit Branch:** Create branch (Name, Code, Address, City, State, ZIP, Phone, Transfer #, Emergency #) -> toggle `Primary` -> toggle `Active/Inactive`.
  - [ ] **Local FAQs & Branch AI Overrides (Phase 4):**
    - [ ] Click `Local FAQs` -> fill Parking Directions, Diagnostic Fee, Regional License #.
    - [ ] Fill **Branch AI Behavior Overrides**: `Branch Greeting Override`, `Branch Operational Instructions`, `Pricing Mode Override` (`listed`/`range`/`no_quote`).
    - [ ] Add Branch Q&A override -> click `Save` -> reopen modal and confirm persisted.
  - [ ] **Smart Geofencing:** Click `Geofence` -> set Territory ZIPs (`78701`, `787*`), Neighborhoods, Cities, Out-of-Area toggle, Extended Dispatch Surcharge -> save.
  - [ ] **Interactive Territory Dispatch Simulator:** Test a covered ZIP (`78701`), a covered City, and an unserved ZIP (`99999`) -> verify branch match vs unserved demand logging.

---

## 11. Industry Packs (`/portal/packs`)
- **APIs Expected `200`:** `/api/v1/portal/industry-packs`, `industry-packs/current`, `industry-packs/{slug}`
- **Actions to Test:**
  - [ ] **Catalog Browse & Filter:** Search across 62+ packs; click different industry cards (Plumbing, Dental, Legal, HVAC, Auto, Salon).
  - [ ] **Apply Blueprint:** Click `Apply Blueprint` on a pack -> verify `Already Active` badge updates.
  - [ ] **Customization Studio (`Open Studio`):** Edit template variables, emergency keywords, safety script -> preview compiled prompt -> save overrides.
  - [ ] **Run AI QA Suite (Phase 5):** Click `Run AI QA Suite` -> verify Golden Call QA Suite modal runs all 6 scenarios (`happy_booking`, `price_objection`, `emergency_triage`, `out_of_area`, `strict_grounding`, `compliance_guardrails`) and shows readiness score (`100%` / `6/6`). Click `Re-Run`.
  - [ ] **Grounding / Sandbox / Test Tabs:** Test sandbox chat with normal & emergency queries; run test scenarios.
  - [ ] **Mobile (`390x844`):** Verify header buttons (`Run AI QA Suite`, `Open Studio`, `Already Active`) wrap cleanly with `0` horizontal overflow.

---

## 12. Receptionist Config (`/portal/profile`)
- **APIs Expected `200`:** `/api/v1/portal/profile`, `/api/v1/portal/carrier-diagnostics`
- **Actions to Test:**
  - [ ] **Voice & Identity Tab:** Update Business Name, Agent Name, Greeting, Tone (`direct`/`warm`/`formal`), Voice ID -> click **Audition Greeting**.
  - [ ] **Phonetic Glossary:** Add `term` -> `spoken_as` -> click Speak button.
  - [ ] **AI Rules, Objections & Strict Grounding Card (Phase 1, 3 & 5):**
    - [ ] Enter `Custom Operational Instructions`.
    - [ ] Add/remove `Always Do` rules and `Never Do` rules.
    - [ ] Add/edit/delete `Objection & Tough-Caller Playbook` rows (`trigger`, `response`, `action`).
    - [ ] Add/edit/delete `Custom Escalation Triggers` (`condition`, `target_number`, `label`).
    - [ ] Toggle `Strict Grounding (Zero Guessing)` ON -> set `Unknown Answer Fallback Script`.
    - [ ] Toggle `Auto-Draft Quote on Price Call` ON.
    - [ ] Test **Voice & Glossary Preview** (`Speak` button) -> verify glossary substitution applies.
    - [ ] Test **Quick Answer Simulator** (`Test` button) with an objection, an FAQ, and an unknown question.
    - [ ] Click `Run AI QA Suite` -> verify `6/6` modal passes.
  - [ ] **Pacing, Guardrails, Notifications & SMS Tabs:** Configure cadence, silence timeout, barge-in, barred phrases, intake questions, office override mode, VIP returning caller greeting, SMS templates.
  - [ ] **Save & Reload:** Click `Save Changes` -> refresh page -> verify every setting persisted.

---

## 13. Lead Form Builder (`/portal/forms`)
- **APIs Expected `200`:** `/api/v1/portal/forms` (and form endpoints)
- **Actions to Test:**
  - [ ] Edit form heading, description, and fields (add/reorder/required toggle) -> save.
  - [ ] Open public lead form URL in incognito/new tab -> submit form with name, phone, service needed.
  - [ ] Verify new lead appears in `/portal/crm` and triggers speed-to-lead workflow if enabled.

---

## 14. Billing & Minutes (`/portal/billing`)
- **APIs Expected `200`:** `/api/v1/subscriptions/current`, `topup-packs`, `invoices`, `quote`
- **Actions to Test:**
  - [ ] Verify active plan card, included minutes, remaining minutes, rollover balance, and rate limits render (`0` HTTP 500s).
  - [ ] Test **Quote Calculator** across tiers (`starter`, `growth`, `pro`) and billing cycles.
  - [ ] Verify **Top-Up Packs** and **Invoices** table render cleanly on both `1440x900` and `390x844`.

---

## 15. End-Customer Self-Service Routes
- [ ] **`/book/[slug]`:** Pick date -> verify real formatted time slots (no `Invalid Date`) -> book appointment -> click **Manage / Reschedule Appointment**.
- [ ] **`/reschedule/[token]`:** Reschedule to a new slot -> confirm updated time; test cancel flow.
- [ ] **`/quote/[token]`:** Inspect line items & total -> click **Approve Quote** (and test **Decline** on a second quote).
- [ ] **`/invoice/[token]`:** Inspect line items, balance due, and status badge on desktop and mobile.
