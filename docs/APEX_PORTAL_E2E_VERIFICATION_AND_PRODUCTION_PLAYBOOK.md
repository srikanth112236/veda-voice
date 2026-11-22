# Apex Plumbing & Heating: Complete End-to-End Client Portal Verification & Production Readiness Playbook

**Tenant Name:** Apex Plumbing & Heating  
**Tenant ID:** `ab1dec11-d70d-4c26-ad0f-62c507a0c356`  
**Production Portal URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/dashboard`  
**API Endpoint:** `https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io`  
**Telephony Engine:** LiveKit Cloud Scale Project (`ST_inbound_livekit_scale` / `ST_outbound_twilio_elastic`)  
**Document Purpose:** Exhaustive action-by-action QA checklist for the Business Owner / Admin to execute, test, log Pass/Fail statuses, and verify all credentials before production launch.

---

## Part 1: Action-by-Action Portal Verification Matrix

Execute each test case in order. Record your findings in the **Status** (`[PASS]` / `[FAIL]`) and **Tester Notes / Errors** columns.

---

### Module 1: Dashboard Overview
**Route:** `/portal/dashboard`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/dashboard`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 1.1 | **Initial Page Load & Auth** | Navigate to `/portal/dashboard` with active tenant session. | Page loads within < 1.5s; top bar shows "Apex Plumbing & Heating", tenant ID `ab1dec11-d70d-4c26-ad0f-62c507a0c356`, and SIP Link Active indicator. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.2 | **KPI Stat Cards Hydration** | Observe Total Calls, Inquiries, Bookings, and Escalated Call metrics. | Numbers load from `/api/v1/portal/dashboard` without spinning forever or rendering `NaN`. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.3 | **SIP Forwarding Carrier Selector** | Toggle carrier tabs: **Verizon**, **AT&T**, **T-Mobile**, **Spectrum**. | Dynamic dial code updates immediately (e.g. `*72` for Verizon, `*21*` for AT&T). | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.4 | **Copy Phone Number** | Click the copy button next to the assigned Apex Twilio/Telnyx forwarding number. | Button shows checkmark icon; clipboard contains valid E.164 phone number. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.5 | **Copy Carrier Forward Dial Code** | Click the copy button next to the carrier dial string. | Dial code with the phone number appended is copied cleanly to clipboard. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.6 | **Webhook URL Copy** | Click copy on the inbound Webhook URL card. | Inbound webhook URL pointing to `api.kindstone-eaab21b4...` is copied. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.7 | **Actionable Leads Queue: Quick Dispatch** | Click "Call Back Now" / "Dispatch Tech" on an active lead in the queue. | Outbound call job triggers via API; dispatch button reflects initiating state without crash. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.8 | **Actionable Leads Queue: Pagination** | Click Next/Previous page buttons on the Actionable Leads table. | Table shifts to page 2 and updates records smoothly. | `[ ] PASS`<br>`[ ] FAIL` | |
| 1.9 | **Recent Calls Quick Link** | Click any recent call record in the mini call log. | Directly navigates to `/portal/calls` with that specific call opened in detail. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 2: Call Explorer & Live Audio
**Route:** `/portal/calls`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/calls`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 2.1 | **Call Table Hydration & Filtering** | Filter by Direction (**Inbound** / **Outbound**), Status (**Completed**, **Failed**), and Disposition (**Emergency**, **Booked**). | Table queries `/api/v1/portal/calls` with filter parameters and renders matching records. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.2 | **Phone / Customer Search** | Type caller number or customer name in the search bar. | Live filtering updates the table matching query without debounce freezing. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.3 | **WebRTC Live Browser Test Call** | Click **"Launch Browser Test Call"** / Mic Simulator. | Browser requests mic permission; connects to LiveKit Room via WebRTC; AI receptionist greets immediately ("Hello, thank you for calling Apex Plumbing..."). | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.4 | **Interactive Speech & Barge-in** | Speak into your microphone: *"I have an emergency pipe leak in my basement"*. | Receptionist detects voice activity (VAD ~380ms), stops speaking immediately, and answers empathetically with shutoff instructions. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.5 | **Live Streaming Transcript** | While on the test call, observe the live transcript pane. | User and Agent speech turns stream in real time with correct speaker attribution. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.6 | **Call Control: End Call** | Click red **"End Call"** / Disconnect button. | Room session terminates cleanly; LiveKit participant leaves; call summary processing begins. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.7 | **Historical Call Audio Playback** | Select a completed call and click **Play** on the audio player widget. | Waveform visualizer animates; audio plays through speakers with clear sound quality. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.8 | **Audio Seeking & Speed Control** | Click `+5s`, `-5s`, and change speed between `1.0x`, `1.25x`, and `1.5x`. | Audio seeks accurately; playback pitch remains natural at higher speeds. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.9 | **Download Call Audio** | Click the **Download Recording** button. | Browser triggers download of the `.wav` / `.mp3` audio recording file. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.10 | **AI Analysis & Telemetry Drawer** | Open call details drawer. Check Sentiment Score, Problem Category, and Urgency Flag. | Details render: Sentiment score (-1.0 to +1.0 badge), classified problem (e.g. `Pipe Burst / Emergency`), and caller summary. | `[ ] PASS`<br>`[ ] FAIL` | |
| 2.11 | **Export Call Logs** | Click **"Export CSV"** and **"Export JSON"** buttons. | Generates and downloads clean CSV/JSON dataset with all call metadata. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 3: Outbound Campaigns
**Route:** `/portal/campaigns`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/campaigns`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 3.1 | **Campaign List View** | Open campaigns page. | Displays existing campaigns (e.g. Winter Pipe Inspection, AC Tuneup Followup) with progress bars. | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.2 | **New Campaign Modal** | Click **"Create Outbound Campaign"**. | Modal opens with fields: Campaign Name, Purpose, Caller ID, Calling Window, Max Attempts. | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.3 | **Compliance Window Verification** | Set calling window to valid hours (e.g. 09:00 - 18:00 Local). Attempt invalid window (e.g. 23:00). | Form prevents illegal calling hours per TCPA regulations (only 08:00 - 20:00 allowed). | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.4 | **Contact CSV Upload & Schema Mapping** | Upload a CSV file with columns: `Name`, `Phone`, `Address`, `Notes`. | Parser auto-maps columns, validates phone numbers to E.164 format, and previews valid contacts. | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.5 | **DNC / Consent Gate Enforcement** | Include a number that opted out or is on the suppression list. | System flags contact as `SUPPRESSED / DO NOT CALL` and excludes it from active dial queue. | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.6 | **Save & Launch Campaign** | Save campaign and click **"Start Campaign"**. | Campaign status changes to `Active / In Progress`; dialer worker initiates calls per throttle limits. | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.7 | **Pause & Resume Campaign** | Click **Pause**, wait 5 seconds, then click **Resume**. | Status toggles to `Paused` (stops new dispatches); on Resume, queue resumes without duplicating calls. | `[ ] PASS`<br>`[ ] FAIL` | |
| 3.8 | **Campaign Analytics & Detail Drawer** | Click a campaign to open the detail drawer. | Displays: Contact status breakdown (Pending, Answered, Voicemail, Failed, Booked) and conversion rate. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 4: Native CRM Pipeline
**Route:** `/portal/crm`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/crm`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 4.1 | **Pipeline Kanban Board Load** | Navigate to `/portal/crm`. | Displays 6 pipeline stages: New Inquiries, Qualified, Booked Jobs, Dispatched, Won, Lost. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.2 | **Drag & Drop / Stage Update** | Move a contact card from "New Inquiries" to "Qualified Leads". | Card moves smoothly; backend updates contact stage via API; UI persists stage upon reload. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.3 | **Create New Contact** | Click **"+ New Contact"**; fill Name, Phone, Email, Tag (`Emergency Plumber`). | Contact is created; appears in the designated stage with tag pill rendered. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.4 | **Contact Detail Drawer** | Click any contact card to open the CRM Drawer. | Drawer opens showing full conversation history, past call recordings, notes, and booking dates. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.5 | **Add Manual Note & Task** | Type a note: *"Basement valve replaced, follow up on Tuesday"* and click **Save Note**. | Note is saved to timeline with author and timestamp. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.6 | **TCPA Consent Audit Verification** | Inspect the Consent section on contact profile. | Shows consent source (e.g. `Inbound Voice Call`, `Web Form`), opt-in timestamp, and consent status. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.7 | **Duplicate Contact Detection & Merge** | Trigger the duplicate scanner (or view suggested duplicates). Click **"Merge Contacts"**. | Merges duplicate profiles into the primary record, preserving unified call and note history. | `[ ] PASS`<br>`[ ] FAIL` | |
| 4.8 | **Recovered Revenue Widget** | Check the top analytics summary on the CRM page. | Displays Total Pipeline Value and Recovered Revenue metrics calculated from won/booked jobs. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 5: Integrations & Sync
**Route:** `/portal/integrations`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/integrations`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 5.1 | **Integrations Hub Load** | Navigate to `/portal/integrations`. Filter by tabs: **All**, **Calendars**, **CRM**, **Webhooks**. | Displays integration cards for Google Calendar, Calendly, HubSpot, GoHighLevel, Pipedrive, and Webhooks. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.2 | **Google Calendar OAuth Connection** | Click **"Connect Google Calendar"**. | Redirects to Google OAuth consent screen with correct client ID and redirect URI. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.3 | **Calendar Sync Verification** | After OAuth completion, click **"Test Calendar Sync"**. | API validates token, fetches available slots, and shows green checkmark `Calendar Sync Active`. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.4 | **HubSpot CRM Integration** | Click **"Configure HubSpot"**; enter API Key / OAuth. | Status updates to Connected; enables bidirectional sync for new leads and call activities. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.5 | **GoHighLevel (GHL) Integration** | Click **"Connect GHL"**; verify Location ID / Token entry. | GHL pipeline syncs with native pipeline; tags map correctly. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.6 | **Add New Outbound Webhook** | Click **"+ New Webhook"**; enter URL `https://webhook.site/...` and select event `call.completed`. | Webhook is saved and listed with active toggle. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.7 | **Trigger Test Webhook Ping** | Click **"Send Test Payload"** next to the webhook. | Test ping sends immediately; modal displays HTTP 200 response and delivery latency. | `[ ] PASS`<br>`[ ] FAIL` | |
| 5.8 | **Delete Webhook** | Click delete icon on a test webhook; confirm deletion. | Webhook is removed from database and UI. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 6: Knowledge Base RAG & Prompts
**Route:** `/portal/knowledge`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/knowledge`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 6.1 | **Document Ingestion (PDF / TXT)** | Drag and drop a plumbing service price list or FAQ PDF. | Document uploads, undergoes chunking and embedding, and appears as `Status: Indexed`. | `[ ] PASS`<br>`[ ] FAIL` | |
| 6.2 | **Document Preview & Deletion** | Click the eye icon to preview parsed chunks; click trash icon on a test file. | Chunks view renders properly; delete removes embeddings from the vector store. | `[ ] PASS`<br>`[ ] FAIL` | |
| 6.3 | **Add Structured FAQ** | Click **"+ Add FAQ"**; enter Question: *"What is your service call fee?"*, Answer: *"Our diagnostic visit is $89, waived if you proceed with repair."* | FAQ is saved and immediately accessible to the RAG retriever. | `[ ] PASS`<br>`[ ] FAIL` | |
| 6.4 | **Phonetic Pronunciation Dictionary** | Add term: `Sloan Valve` -> Phonetic: `SLOHN VALVE`; `Navien` -> `NAY-vee-en`. | Phonetics save cleanly; voice engine uses exact pronunciation during speech synthesis. | `[ ] PASS`<br>`[ ] FAIL` | |
| 6.5 | **RAG Query Simulator** | In the test query box, type: *"How much do you charge to inspect a leaking tankless water heater?"* | Simulator returns retrieved document chunks with similarity scores (> 0.78) and simulated agent answer. | `[ ] PASS`<br>`[ ] FAIL` | |
| 6.6 | **Prompt Variant Switcher** | Switch between **Daytime**, **After-Hours**, and **Speed-to-Lead** prompt tabs. | Form loads preset greetings and emergency triage protocols; allows custom edits and saving. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 7: Staff & Dispatch Scheduling
**Route:** `/portal/calendar`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/calendar`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 7.1 | **Staff Roster Hydration** | Open `/portal/calendar`. | Lists technicians and dispatchers (e.g. Master Plumber, Drain Tech) with phone numbers and skills. | `[ ] PASS`<br>`[ ] FAIL` | |
| 7.2 | **Add New Technician** | Click **"+ Add Staff"**; enter Name, Phone, Role: `Emergency Drain Specialist`, Skill tags. | Technician is saved with active toggle and assigned on-call slot. | `[ ] PASS`<br>`[ ] FAIL` | |
| 7.3 | **Shift & Operating Hours Schedule** | Configure daily working hours (e.g. 07:00 - 19:00) and On-Call night shifts. | Operating hours persist; agent uses schedule to determine availability for booking. | `[ ] PASS`<br>`[ ] FAIL` | |
| 7.4 | **Dispatch Routing Simulation** | In the Dispatch Rules Simulator, input an emergency scenario: *"Burst main pipe at 2 AM"*. | Simulator selects on-call emergency plumber based on skill match and shift schedule. | `[ ] PASS`<br>`[ ] FAIL` | |
| 7.5 | **Booking Management & Reschedule** | View upcoming bookings list; click **"Reschedule"** on a test appointment. | Modal allows picking a new valid slot; updates calendar and dispatches confirmation. | `[ ] PASS`<br>`[ ] FAIL` | |
| 7.6 | **Send Test Dispatch SMS** | Enter a test phone number and click **"Send Test Dispatch Alert"**. | Test SMS is dispatched via Telnyx/Twilio API; logs delivery confirmation. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 8: Locations & Branches
**Route:** `/portal/locations`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/locations`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 8.1 | **Multi-Branch List View** | Open `/portal/locations`. | Shows branches (e.g. Apex Central, Apex West Metro) with address and assigned numbers. | `[ ] PASS`<br>`[ ] FAIL` | |
| 8.2 | **Add New Branch / Location** | Click **"+ Add Location"**; enter Name, Street, City, State, ZIP, and Phone. | Location is created with its own geographic identifier. | `[ ] PASS`<br>`[ ] FAIL` | |
| 8.3 | **Geofence & Service Area Setup** | Enter covered ZIP codes: `07001, 07002, 07003` or radius `25 miles`. | Geofence rules are saved; agent cross-checks caller ZIP to verify service availability. | `[ ] PASS`<br>`[ ] FAIL` | |
| 8.4 | **Branch-Specific Overrides** | Set specific after-hours emergency transfer number for a particular branch. | Calls originating for this branch route to the branch-specific transfer line rather than default. | `[ ] PASS`<br>`[ ] FAIL` | |
| 8.5 | **Unserved Demand Analytics** | Check the Unserved Demand report table. | Logs callers whose location was outside service coverage, showing potential new markets. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 9: Industry Packs
**Route:** `/portal/packs`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/packs`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 9.1 | **Industry Pack Catalog** | Open `/portal/packs`. | Shows pre-built packs: Plumbing & HVAC, Legal, Medical, Real Estate, Field Services. | `[ ] PASS`<br>`[ ] FAIL` | |
| 9.2 | **Inspect Plumbing & HVAC Pack** | Click **"View Details"** on Plumbing & HVAC Pack. | Displays built-in triage questions (gas leak, water shutoff, sewage backup) and sample services. | `[ ] PASS`<br>`[ ] FAIL` | |
| 9.3 | **One-Click Pack Activation** | Click **"Activate / Apply Pack"** for Apex Plumbing. | Pack installs prompt blueprints, triage trees, and common FAQs into the active agent profile. | `[ ] PASS`<br>`[ ] FAIL` | |
| 9.4 | **Customization of Pack Defaults** | Modify emergency water shutoff instructions to include: *"Turn valve clockwise 90 degrees"*. | Customization overrides default pack text without breaking the base template. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 10: Receptionist Config (Agent Profile)
**Route:** `/portal/profile`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/profile`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 10.1 | **Agent Identity Configuration** | Change Agent Name to *"Alex - Apex Plumbing"*; update Greeting message. | Input persists; banner shows unsaved changes alert until clicking Save. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.2 | **Voice Catalog Preview** | Browse voice list (Inworld Alex, Cartesia British Plumber, ElevenLabs Professional). Click **Play Audio Preview**. | Sample audio plays cleanly through browser without delay or clipping. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.3 | **Voice Selection & Save** | Select desired voice (e.g. `inworld/inworld-tts-1` with voice ID `Alex`); click **"Save Receptionist Profile"**. | Success toast appears; backend updates `agent_profile` in database. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.4 | **Voice Slider Adjustments** | Adjust Speaking Speed (`1.05x`), Temperature (`0.4`), and Empathy level. | Sliders update values; persisted on Save. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.5 | **Emergency Call Transfer Number** | Enter Transfer Number (e.g. `+12015550199`). | Form validates E.164 format; saves as the live SIP transfer destination. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.6 | **Intake Questions Builder** | Add required question: *"Is water actively leaking right now?"* (Yes/No). | Question is saved in intake sequence; agent asks this before proceeding with booking. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.7 | **Pricing Sheet Entries** | Add standard pricing items (e.g. *Camera Inspection: $199*, *Drain Snaking: $150*). | Agent references these exact dollar amounts when callers ask about service costs. | `[ ] PASS`<br>`[ ] FAIL` | |
| 10.8 | **Carrier Diagnostics Health Indicator** | Scroll to Carrier Diagnostics widget. | Shows Green status: `SIP Registration: Connected`, `Latency: < 45ms`, `Packet Loss: 0%`. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 11: Lead Form Builder
**Route:** `/portal/forms`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/forms`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 11.1 | **Lead Forms Hub Load** | Navigate to `/portal/forms`. | Displays existing lead capture forms, total submission counts, and conversion percentages. | `[ ] PASS`<br>`[ ] FAIL` | |
| 11.2 | **Create New Lead Form** | Click **"+ New Form"**; name it *"Emergency Plumbing Request"*. | Form editor opens with drag-and-drop or checklist of input fields. | `[ ] PASS`<br>`[ ] FAIL` | |
| 11.3 | **Configure Custom Fields** | Add fields: Customer Name, Phone, Email, Service Needed (Dropdown: Water Heater, Leak, Drain), Urgency (High/Medium/Low). | Fields are configured; preview updates in real-time. | `[ ] PASS`<br>`[ ] FAIL` | |
| 11.4 | **Speed-to-Lead Auto-Dial Toggle** | Toggle **"Enable Instant Voice Callback"** (Auto-dial lead within 15 seconds of submit). | Setting saves with outbound campaign link. | `[ ] PASS`<br>`[ ] FAIL` | |
| 11.5 | **Embed Code & Share Link** | Click **"Copy Embed Code"** (`<iframe>`) and **"Copy Public Link"**. | Clipboard contains valid iframe HTML and public URL. | `[ ] PASS`<br>`[ ] FAIL` | |
| 11.6 | **Public Form Submission Test** | Open the copied public link in an incognito tab; fill the form and click Submit. | Form shows success confirmation ("Thank you! A technician is reviewing your request"). | `[ ] PASS`<br>`[ ] FAIL` | |
| 11.7 | **Captured Leads Table & Verification** | Return to `/portal/forms` and inspect the Captured Leads table. | The newly submitted lead appears with timestamp, captured inputs, and status `New`. | `[ ] PASS`<br>`[ ] FAIL` | |

---

### Module 12: Billing & Minutes
**Route:** `/portal/billing`  
**Target URL:** `https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io/portal/billing`

| # | Action / Feature | Steps to Execute | Expected Result | Status | Tester Notes / Errors |
|---|-------------------|------------------|-----------------|:------:|-----------------------|
| 12.1 | **Subscription & Balance Overview** | Navigate to `/portal/billing`. | Displays Current Plan (e.g. Growth), Minute Balance, Included Minutes, and Overage Rate. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.2 | **Billing Mode Toggle** | Toggle between **Per-Minute** (rounded up to nearest min) and **Per-Second** billing. | Modal confirms change; updates billing calculations via API. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.3 | **Coupon Code Validation** | Enter promo/coupon code (e.g. `LAUNCH50`); click **Validate**. | API checks code; applies discount percentage to upgrade modal calculation. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.4 | **Plan Upgrade Modal** | Select **Scale / Enterprise Tier**; click **"Upgrade Plan"**. | Modal opens displaying prorated charge, included minutes expansion, and Stripe payment form. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.5 | **Top-Up Minutes Pack Purchase** | Select a top-up pack (e.g. *1,000 Minutes for $120*); click **"Purchase Top-Up"**. | Stripe Checkout modal opens; executing test card purchase adds minutes to balance instantly. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.6 | **Stripe Customer Portal Redirect** | Click **"Manage Billing in Stripe Portal"**. | Opens secure Stripe Customer Portal session for updating credit cards or viewing tax invoices. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.7 | **Invoice History & Receipts** | Inspect Invoices table. Click on an invoice record. | Displays invoice number, date, amount, settlement status, and receipt details. | `[ ] PASS`<br>`[ ] FAIL` | |
| 12.8 | **Refund Request Workflow** | Click **"Request Dispute / Refund"**; select an invoice, input reason, and submit. | Refund ticket is created; logged in tenant audit history. | `[ ] PASS`<br>`[ ] FAIL` | |

---

## Part 2: Production Credentials & Secrets Blueprint (Going Live)

To ensure **zero downtime, zero broken WebRTC/SIP calls, and zero API crashes** when going live, every component must have its exact production secrets configured in **Azure Key Vault** and the production environment.

### 1. Azure Key Vault Reference
All backend and agent secrets must be stored in Key Vault:
* **Key Vault Name:** `kv-vagency-prod-6eac`
* **Key Vault URI:** `https://kv-vagency-prod-6eac.vault.azure.net/`
* **Resource Group:** `rg-vagency-prod`

---

### 2. Frontend (Next.js Dashboard) Production Configuration
The dashboard is deployed on Azure Container Apps at:  
`https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io`

| Environment Variable | Production Value / Requirement | Purpose |
|-----------------------|--------------------------------|---------|
| `NEXT_PUBLIC_API_URL` | `https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io` | Points frontend queries to the production FastAPI backend. |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://ydagefj8ich.livekit.cloud` | Connects browser audio monitor and test calls to LiveKit Cloud. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (Stripe Live Key) | Renders Stripe Elements for in-app minute top-ups and subscriptions. |
| `NEXT_PUBLIC_APP_ENV` | `production` | Suppresses dev warnings and optimizes production bundle assets. |

---

### 3. Backend API (FastAPI & Azure Services) Configuration
Deployed on Azure Container Apps: `api.kindstone-eaab21b4.eastus2.azurecontainerapps.io`

| Variable / Secret Name | Production Requirement | Purpose |
|-------------------------|------------------------|---------|
| `DATABASE_URL` | `postgresql+psycopg://vaadmin:<STRONG_PASSWORD>@pg-vagency-prod-1459.postgres.database.azure.com:5432/vedavoice?sslmode=require` | Connection to Azure Database for PostgreSQL Flexible Server. Must use SSL. |
| `JWT_SECRET` | Minimum 32 random cryptographically secure characters (e.g. generated via `openssl rand -hex 32`). | Signs customer & admin JWT session tokens. |
| `INTERNAL_SIGNING_KEY` | Minimum 32 random characters. | Signs short-lived, call-scoped security tokens passed between LiveKit and API. |
| `ENCRYPTION_SECRET` | 32-byte AES key for envelope encryption. | Encrypts third-party OAuth tokens (Google, HubSpot, GHL) stored in the database. |
| `CORS_ORIGINS` | `["https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io","https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io"]` | Enforces CORS security; blocks unauthorized origins. |
| `AZURE_STORAGE_ACCOUNT` | `stvagencyprod6eac3` | Azure Blob Storage account name for call recordings and transcripts. |
| `AZURE_STORAGE_CONTAINER` | `recordings` | Blob container for storing call audio files. |
| `GLOBAL_MAX_CONCURRENT` | `40` (or your approved Scale limit) | Global concurrent call safety ceiling to prevent unexpected budget spikes. |
| `GLOBAL_MAX_OUTBOUND` | `10` | Concurrency ceiling for automated outbound dialers. |

---

### 4. LiveKit Cloud Voice Pipeline & AI Engine
Configured via LiveKit Cloud CLI (`lk agent deploy`) and Azure secrets:

| Variable / Secret Name | Production Requirement | Purpose |
|-------------------------|------------------------|---------|
| `LIVEKIT_URL` | `wss://ydagefj8ich.livekit.cloud` | Your LiveKit Cloud project endpoint. |
| `LIVEKIT_API_KEY` | `APIxxxx...` (From LiveKit Cloud Project Settings) | Authenticates API requests for creating dispatches and SIP participants. |
| `LIVEKIT_API_SECRET` | `secretxxxx...` (LiveKit Cloud Secret) | Secret key for generating LiveKit room access tokens. |
| `GOOGLE_API_KEY` | Google AI Studio Production API Key (Gemini) | Powers the LLM core for real-time conversation and intent classification (`gemini-2.5-flash`). |
| `DEEPGRAM_API_KEY` | Deepgram Production API Key | Powers low-latency real-time Speech-to-Text (`deepgram/nova-3`). |
| `INWORLD_API_KEY` | Inworld AI Production API Key | Powers realistic human-sounding Voice Synthesis (`inworld/inworld-tts-1`). |
| `VAD_MIN_SILENCE_DURATION` | `0.38` (seconds) | Turn-detection sensitivity; prevents agent from interrupting caller pauses prematurely. |
| `VAD_PREFIX_PADDING_DURATION` | `0.30` (seconds) | Audio buffer padding to ensure the beginning of words isn't clipped. |

---

### 5. Telephony, SIP Trunks & Phone Carriers

| Variable / Setting | Production Requirement | Purpose |
|--------------------|------------------------|---------|
| `CARRIER_PRIMARY_PROVIDER` | Twilio Elastic SIP Trunk | Inbound carrier forwarding phone calls to LiveKit SIP URI. |
| `LIVEKIT_SIP_INBOUND_TRUNK_ID` | `ST_inbound_livekit_scale` | LiveKit Inbound SIP Trunk ID linked to Twilio SIP domain. |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | `ST_outbound_twilio_elastic` | LiveKit Outbound SIP Trunk ID for dispatching outbound campaign calls. |
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx...` (Production Twilio Account) | Telephony management & number provisioning. |
| `TWILIO_AUTH_TOKEN` | Production Twilio Auth Token | Carrier API authentication. |
| `TWILIO_FROM_NUMBER` | Dedicated Apex E.164 phone number (e.g. `+18005550199`) | Caller ID displayed when making outbound calls. |
| `TELNYX_API_KEY` | Production Telnyx API Key | Backup carrier & primary high-deliverability SMS dispatch provider. |
| `TELNYX_SIP_CONNECTION_ID` | `3095939328291899286` | Telnyx SIP connection for hot standby routing. |
| `TELNYX_MESSAGING_PROFILE_ID` | `4001a1ee-faae-4ddc-829e-c0cc6be43379` | 10DLC registered messaging profile for appointment confirmation SMS. |

---

### 6. External Integrations, Email & Billing

| Integration | Required Production Credentials | Verification Step |
|-------------|---------------------------------|-------------------|
| **Stripe Live Billing** | `STRIPE_SECRET_KEY`: `sk_live_...`<br>`STRIPE_WEBHOOK_SECRET`: `whsec_...`<br>`STRIPE_PUBLISHABLE_KEY`: `pk_live_...` | Add webhook endpoint in Stripe Dashboard pointing to: `https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/billing/stripe/webhook` with events `invoice.paid`, `customer.subscription.updated`. |
| **Resend Email Service** | `RESEND_API_KEY`: `re_live_...`<br>`RESEND_FROM_EMAIL`: `alerts@updates.vedasynk.com` | Ensure SPF, DKIM, and DMARC DNS records are verified in your domain DNS manager for `updates.vedasynk.com`. |
| **Google Calendar OAuth** | `GOOGLE_CLIENT_ID`: `...apps.googleusercontent.com`<br>`GOOGLE_CLIENT_SECRET`: `GOCSPX-...`<br>`GOOGLE_REDIRECT_URI`: `https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/portal/calendar/callback` | Ensure Google Cloud Console OAuth consent screen is published to Production (or internal) with scopes: `https://www.googleapis.com/auth/calendar.events`. |
| **HubSpot CRM** | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`<br>`HUBSPOT_REDIRECT_URI`: `https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/integrations/hubspot/callback` | Configured in HubSpot Developer App settings. |
| **GoHighLevel (GHL)** | `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`<br>`GHL_REDIRECT_URI`: `https://api.kindstone-eaab21b4.eastus2.azurecontainerapps.io/api/v1/integrations/gohighlevel/callback` | Configured in GHL Marketplace app. |

---

## Part 3: Pre-Live Go/No-Go Verification Steps

Before cutting live phone traffic to the AI receptionist:

1. **Database Migration Health:**
   Run Alembic check to verify all tenant schema migrations have executed:
   ```bash
   alembic upgrade head
   ```
2. **SIP Trunk Inbound Probe:**
   Dial the assigned Twilio/Telnyx forwarding number from a real mobile phone:
   * Verify ring time is < 2 rings.
   * Verify receptionist answers with Apex Plumbing greeting.
   * Speak for 60 seconds; verify no voice chopping or high packet loss.
   * Hang up and confirm call record and audio recording appear in `/portal/calls` within 10 seconds.
3. **Outbound Compliance Check:**
   Verify that test outbound calls to mobile phones honor the calling window and display the verified Caller ID.
4. **Stripe Webhook Verification:**
   Send a test webhook event from Stripe Dashboard CLI to ensure the API receives and signs the event with `whsec_...` without returning 400 Bad Request.
5. **SSL Certificate & DNS Check:**
   Confirm both `api.kindstone-...` and `dashboard.kindstone-...` have valid TLS 1.3 certificates and zero mixed-content browser console errors.
