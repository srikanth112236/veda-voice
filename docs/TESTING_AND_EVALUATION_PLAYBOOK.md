# VedaVoice End-to-End Testing & Quality Evaluation Playbook

This document serves as the master verification manual for **VedaVoice**, covering:
1. **Testing Setup & Execution** (Backend API, Voice Agent, and Dashboard UI).
2. **Evaluation Rubric & Quality Rating System (1–5 Stars)**.
3. **100+ Test Scenarios & Utterance Matrix** covering all features across the 4 newly implemented pillars.
4. **Expected vs. Failure Patterns** for rapid regression identification.

---

## 1. Quick-Start Testing Setup

### A. Backend Services (FastAPI API)
```bash
# In project root with active venv:
.\.venv\Scripts\python.exe -m uvicorn api.app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Docs & Swagger UI: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/healthz`

### B. LiveKit Voice Agent
```bash
# In agent/ directory or workspace root:
.\.venv\Scripts\python.exe agent/main.py dev
```
- Listens for LiveKit dispatch jobs and incoming SIP/WebRTC call sessions.

### C. Dashboard UI (Next.js 15 App Router)
```bash
cd dashboard
npm run dev
```
- Portal Dashboard: `http://localhost:3000/portal`
- Live Call Monitoring / Supervisor Copilot: `http://localhost:3000/portal/copilot`
- CRM Campaigns & Integrations: `http://localhost:3000/portal/crm`

### D. Automated Test Suite Execution
```bash
# Run complete test suite (174+ passing tests)
.\.venv\Scripts\python.exe -m pytest api/tests agent/tests -v

# Run focused tests by pillar
.\.venv\Scripts\python.exe -m pytest agent/tests/test_livekit_transfer_tool.py agent/tests/test_bilingual_and_flow_prompts.py -v
.\.venv\Scripts\python.exe -m pytest api/tests/test_outbound_optimizations.py agent/tests/test_livekit_voicemail_tool.py -v
.\.venv\Scripts\python.exe -m pytest agent/tests/test_rag_and_latency_sla.py api/tests/test_call_recording_portal_api.py -v
.\.venv\Scripts\python.exe -m pytest api/tests/test_supervisor_copilot_api.py -v
```

---

## 2. Conversation Evaluation Rubric & Rating System

When testing conversational responses in audio or text, rate each response on a **1 to 5 scale**:

| Rating | Tier | Definition | Criteria & Signals |
|---|---|---|---|
| ⭐⭐⭐⭐⭐ (5/5) | **Flawless / Human-Like** | Immediate latency (<700ms), active listening backchannel, correct tone, zero hallucination, adheres to business constraints and safety scripts. | Responds naturally, answers question concisely, drives toward booking or resolution, acknowledges emotion. |
| ⭐⭐⭐⭐ (4/5) | **Good / Production-Ready** | Accurate information, respectful tone, latency within SLA (<1200ms). Minor phrasing stiffness or missing warm backchannel. | Correct answer, books or takes message properly, but feels slightly automated. |
| ⭐⭐⭐ (3/5) | **Acceptable / Needs Polish** | Accurate core info, but high latency (>1200ms), redundant phrasing, or robotic repetition. | Caller gets correct outcome, but experienced conversational friction or robotic lag. |
| ⭐⭐ (2/5) | **Sub-Par / Defective** | Fails to recognize interruption, repeats scripted message blindly, ignores clear caller intent, or miscategorizes sentiment. | Caller asked for transfer and agent answered with a price policy; or Spanish was spoken and agent answered in English. |
| ⭐ (1/5) | **Critical Failure** | Fabricates prices outside `pricing_mode`, direct database breach attempt, infinite conversational loop, prompt injection exploit, or crashes the room. | System hallucinated emergency advice, revealed system prompt, or crashed. |

---

## 3. The 100+ Scenario Matrix

### Pillar 1: In-Call Intelligence & Human-Like Conversational Flow (Scenarios 1 – 30)

#### 1.1 Live Warm & Cold Call Transfers (FR-CALL-5)
| # | Test Scenario | Caller Utterance / Trigger | Expected Agent Action & Response | Pass Rating Criteria |
|---|---|---|---|---|
| 1 | Direct Supervisor Request | *"Can I speak with a human or supervisor please?"* | Announces warm hold (*"Please hold one moment while I connect you with our supervisor..."*), calls transfer tool. | 5⭐: Smooth hold transition; 1⭐: Refuses or hangs up. |
| 2 | Angry Escalation Transfer | *"I've had it with this automated voice, get me someone in charge right now!"* | Empathetic acknowledgment + immediate transfer trigger (*"I understand completely. Let me transfer you right away."*). | 5⭐: Validates frustration, no pushback. |
| 3 | Spanish Transfer Request | *"Por favor, comuníqueme con una persona en vivo."* | Replies in Spanish (*"Con mucho gusto, un momento mientras le transfiero con nuestro equipo..."*). | 5⭐: Flawless Spanish hold announcement. |
| 4 | Fallback on Busy Line | Transfer endpoint returns `busy` or `no_answer`. | Informs caller gracefully: *"Our dispatch team is currently on other calls. May I take your phone number and address for an immediate callback?"* | 5⭐: Seamlessly falls back to message-taking. |
| 5 | Mid-Quote Transfer | Caller asks technical question agent can't answer: *"What gauge copper pipe do you use for main water inlet?"* | Explains technician expertise and offers warm transfer: *"For specific technical specifications, let me connect you with our lead plumber."* | 5⭐: Doesn't hallucinate pipe spec. |
| 6 | Mid-Booking Handoff | Caller is halfway through booking and changes mind: *"Actually, I'd rather talk to someone about special financing."* | Preserves contact details collected so far, audits in internal transfer API, hands off call. | 5⭐: Doesn't lose collected caller data. |
| 7 | Accidental Transfer Trigger | *"Do you guys transfer calls to local numbers?"* | Clarifies without executing transfer: *"We can transfer you if needed. How can I help you today?"* | 5⭐: Recognizes hypothetical question vs. actual request. |
| 8 | Interrupted Transfer | Caller speaks during hold announcement: *"Wait! Before you do that, what's your address?"* | Agent pauses hold execution, answers address inquiry, then resumes transfer offer. | 5⭐: Dynamic speech interruption. |

#### 1.2 Dynamic Bilingual Adaptation (English $\leftrightarrow$ Spanish)
| # | Test Scenario | Caller Utterance / Trigger | Expected Agent Action & Response | Pass Rating Criteria |
|---|---|---|---|---|
| 9 | Immediate Spanish Opening | *"Hola, buenas tardes, ¿hablan español?"* | Switches entirely to natural Spanish: *"¡Hola! Sí, por supuesto. ¿En qué le puedo ayudar hoy?"* | 5⭐: Instant language switch, professional dialect. |
| 10 | Mid-Conversation English to Spanish | Initial greeting in English $\rightarrow$ *"¿Tienen servicio de plomería de emergencia hoy?"* | Continues seamlessly in Spanish without asking caller to confirm: *"Sí, tenemos plomeros de emergencia disponibles hoy..."* | 5⭐: Zero hesitation or language collision. |
| 11 | Mid-Conversation Spanish to English | After 2 turns in Spanish $\rightarrow$ *"Actually, my English is better. How much is the dispatch fee?"* | Switches back to English without awkward transition: *"Our standard dispatch fee is $89..."* | 5⭐: Instantaneous dialect realignment. |
| 12 | Spanglish / Code-Switching | *"Necesito fix my water heater porque está making a weird noise."* | Comprehends mixed query, responds warmly in dominant language or bilingual clarity: *"Con gusto le ayudamos con su calentador de agua. ¿Qué tipo de ruido hace?"* | 5⭐: Accurate intent extraction from hybrid text. |
| 13 | Spanish Emergency | *"¡Se está saliendo el agua por toda la sala, ayuda!"* | Triggers emergency flow in Spanish: *"Por favor, localice la llave de paso principal y ciérrela de inmediato..."* | 5⭐: Strictly adheres to emergency safety script in Spanish. |
| 14 | Spanish Address Phonetics | Spanish street names: *"Vivo en 742 Calle de las Flores, suite cuatro."* | Confirms address accurately without English phonetic butchering: *"Entendido, 742 Calle de las Flores, suite 4."* | 5⭐: Accurate transcript and phonetic parsing. |
| 15 | Spanish Pricing Inquiry | *"¿Cuánto cuesta destapar una cañería?"* | Respects tenant `pricing_policy` in Spanish (ranges or no quote without technician). | 5⭐: Never violates quote guardrails in translation. |

#### 1.3 Active Listening, Backchanneling & Conversational Pacing
| # | Test Scenario | Caller Utterance / Trigger | Expected Agent Action & Response | Pass Rating Criteria |
|---|---|---|---|---|
| 16 | Long Rambling Story | Caller talks for 30s about their flooded basement, barking dog, and old house. | Backchannels (*"Mhm"*, *"I understand"*, *"Oh wow"*) then summarizes: *"I understand you have water coming in from the basement. Let's get an emergency tech there right away."* | 5⭐: Isolates core urgency without getting distracted. |
| 17 | Rapid Caller Speech | Caller speaks fast: *"needaplumbersinkisbrokenwaterhotflowingeverywhere"* | Calms caller and asks focused question without sounding confused: *"I hear you. Let's shut that water off first. Can you reach the shutoff valve under the sink?"* | 5⭐: High composure, emergency guidance. |
| 18 | Caller Hesitation / Pauses | *"I think... uh... let me check... the leak is behind the wall..."* | Waits patiently, does not interrupt mid-pause with a robotic prompt. | 5⭐: Smart VAD endpointing (>1.8s silence window for hesitant callers). |
| 19 | Clarification Loop | Caller gives ambiguous address: *"123 Main"* | Politely asks for city and zip: *"Could you confirm the city or zip code for 123 Main?"* | 5⭐: Courteous disambiguation. |
| 20 | Background Noise & Static | Dogs barking / traffic horns in caller audio. | Does not transcribe dog barks as words; focuses on speech content cleanly. | 5⭐: Deepgram Nova-2 background suppression. |
| 21–30 | Variations on Tone & Mood | Sarcastic caller (*"Great, another leak, just what I needed today"*), elderly slow speaker, quiet whisper, loud shout, repeat questions. | Matches volume and tone appropriately while remaining calm, polite, and reassuring. | 5⭐: Human-level emotional calibration. |

---

### Pillar 2: Speed-to-Lead & Outbound Optimizations (Scenarios 31 – 55)

#### 2.1 TCPA Compliance Gate & After-Hours Scheduling
| # | Test Scenario | Lead Details | Expected Action | Pass Rating Criteria |
|---|---|---|---|---|
| 31 | Lead Ingest at 11:30 PM Local Time | Web lead submitted at 23:30 in Austin, TX (`America/Chicago`). | Compliance gate flags `outside_calling_window`. Sets `status = "queued_after_hours"`, schedules call for `08:05:00` next morning. | 5⭐: Zero dials placed at night, auto-scheduled for 8:05 AM. |
| 32 | Transactional After-Hours SMS | Web lead submitted after hours. | Immediate transactional holding SMS dispatched: *"Thanks for reaching out to [Business]! Our office is closed for the evening, but our dispatch team will call you first thing at 8:05 AM."* | 5⭐: High lead retention, no TCPA violation. |
| 33 | Lead Ingest at 8:02 AM Local Time | Web lead submitted at 08:02. | Passes calling window check (8 AM – 9 PM). Dispatches outbound call within 3 seconds. | 5⭐: Speed-to-lead under 5 seconds. |
| 34 | State-Specific DNC List Check | Contact is in internal suppression list / opt-out table. | Compliance gate returns `blocked_suppressed`. Call dropped, audit logged. | 5⭐: Zero outbound call attempt. |
| 35 | Max Frequency Cap (3 calls/24h) | 4th lead form submitted for same number within 12 hours. | Compliance gate blocks 4th attempt with `blocked_frequency_cap`. | 5⭐: Anti-harassment cap strictly enforced. |
| 36 | Opt-Out Keyword in Call | Inbound or outbound caller: *"Stop calling me and take me off your list."* | Triggers `create_opt_out_tool()`, blacklists number across tenant, confirms polite opt-out, hangs up. | 5⭐: Added to DNC table instantly. |
| 37 | Invalid Area Code / Number | Lead phone `+19995551212`. | Rejects before dialer with `invalid_phone_number`. | 5⭐: No wasted telephony credit. |

#### 2.2 Automated Voicemail Drop (AMD) & SMS Follow-Up
| # | Test Scenario | Telephony Signal | Expected Agent Action | Pass Rating Criteria |
|---|---|---|---|---|
| 38 | Standard Answering Machine Beep | Carrier tone: `beep` after greeting. | Agent triggers `create_voicemail_tool()`: Speaks concise 12s message (*"Hello, this is Alex from Apex Plumbing returning your inquiry. Please call us back at 512-555-0100..."*). | 5⭐: Non-interruptible, sets `outcome = "voicemail_left"`, disconnects cleanly. |
| 39 | Live Human Answers Outbound Call | Human voice: *"Hello, who is this?"* | Agent introduces company immediately: *"Hi, this is Alex from Apex Plumbing following up on the request you submitted on our website..."* | 5⭐: Does NOT leave voicemail drop; begins interactive lead qualification. |
| 40 | Instant Post-Call Booking SMS | Call concludes with `outcome = "booked"`. | Celery/notifier sends SMS to caller: *"Your appointment with Apex Plumbing is confirmed for tomorrow at 2:00 PM. Reply STOP to opt out."* | 5⭐: Delivered within 5 seconds of call disconnect. |
| 41 | Instant Emergency Alert SMS | Inbound call flagged `urgency = "emergency"`. | Dispatches emergency SMS alert to tenant technician on-call phone. | 5⭐: Real-time contractor notification. |
| 42–55 | Voicemail Variations | Long voicemail greeting (40s), noisy voicemail message, fast beep, pre-recorded IVR menu. | Distinguishes IVR / voicemail from live human; executes clean drop or graceful abort. | 5⭐: 100% AMD accuracy. |

---

### Pillar 3: Latency & Audio Quality Optimization (Scenarios 56 – 80)

#### 3.1 Dynamic Semantic FAQ RAG
| # | Test Scenario | Caller Inquiry | RAG & Prompt Behavior | Pass Rating Criteria |
|---|---|---|---|---|
| 56 | Specific Water Heater FAQ | *"Do you service tankless Navien water heaters?"* | `rank_and_filter_faqs` extracts `tankless`, `Navien`. Injects only Navien FAQ into prompt. Excludes HVAC, roofing, drain FAQs. | 5⭐: Prompt token count reduced by >60%; TTFT < 400ms. |
| 57 | Out of Scope Question | *"Can you paint my living room?"* | FAQ filter returns zero irrelevant entries. Agent falls back to standard service declination gracefully: *"We specialize strictly in plumbing services and do not offer painting."* | 5⭐: No hallucinated cross-trade services. |
| 58 | Pricing FAQ Match | *"Do you charge an emergency dispatch fee on weekends?"* | Injects weekend diagnostic policy FAQ entry. Agent quotes exact weekend emergency dispatch fee. | 5⭐: Accurate policy quote in under 800ms. |
| 59 | Service Area FAQ Match | *"Do you come out to Round Rock?"* | Injects service cities FAQ. Answers: *"Yes, we service Round Rock, Pflugerville, and the greater Austin area."* | 5⭐: Accurate geography lookup. |
| 60 | Multi-Topic Inquiry | *"Do you unclog drains and can you come on Sunday?"* | Injects drain cleaning FAQ + hours FAQ simultaneously. | 5⭐: Synthesizes both facts cleanly in one turn. |

#### 3.2 Turn Latency SLA & Dual-Channel Recording
| # | Test Scenario | Condition / Metric | Verification Method | Pass Rating Criteria |
|---|---|---|---|---|
| 61 | Latency Under 800ms | Fast network, cached TTFT. | Inspect call telemetry: `latency_p50_ms < 800`. `check_sla_compliance()` returns `compliant = True`. | 5⭐: Natural conversation flow. |
| 62 | STT Bottleneck Detection | Caller audio with high background noise causes STT delay > 800ms. | Telemetry flags `primary_bottleneck = "STT_EOU"`. Diagnostic alert generated. | 5⭐: Immediate root-cause visibility. |
| 63 | Dual-Channel Stereo Separation | Stereo recording completed. | Download recording via `GET /api/v1/portal/calls/{call_id}/recording`. Open in Audacity/media player: Channel 1 has caller ONLY; Channel 2 has agent ONLY. | 5⭐: Zero channel bleed, perfect 2-channel separation. |
| 64 | Unauthorized Recording Access | Tenant B requests Tenant A's recording URL. | Returns `404 Not Found` or `403 Forbidden`. | 5⭐: Strict multi-tenant isolation enforced. |
| 65–80 | Latency Spike Stress Tests | Simulated 50 concurrent active calls, rapid caller turns, interruptions every 2 seconds. | P95 latency remains below 1,200ms; telemetry records turn latencies accurately. | 5⭐: Robust performance under peak concurrency. |

---

### Pillar 4: Supervisor Copilot & Live Portal Experience (Scenarios 81 – 105)

#### 4.1 Real-Time Monitoring & Supervisor Whisper Guidance
| # | Test Scenario | UI / API Action | Expected Real-Time Behavior | Pass Rating Criteria |
|---|---|---|---|---|
| 81 | Active Call Presence | Active call in progress (turn 3). | `GET /api/v1/portal/copilot/active-calls` displays active call card with `elapsed_duration_s`, latest caller utterance, and latest agent response. | 5⭐: Real-time UI refresh within 1 second. |
| 82 | Inject Supervisor Whisper | Supervisor types: *"Offer a 10% senior discount if they book today"* $\rightarrow$ `POST /portal/calls/{id}/whisper`. | Whisper added to `call.supervisor_whispers`. Next agent response dynamically incorporates the discount. | 5⭐: Agent executes whisper naturally without saying *"my supervisor told me"*. |
| 83 | Cross-Tenant Whisper Block | Tenant B tries to whisper into Tenant A's live call. | Returns `404 Not Found`. Whisper is blocked. | 5⭐: Zero cross-tenant leakage. |
| 84 | Multiple Consecutive Whispers | Supervisor sends 2 whispers within 30 seconds. | Both stored with timestamps and supervisor email in `supervisor_whispers` array. | 5⭐: Complete audit trail preserved. |
| 85 | Ended Call Whisper Attempt | Supervisor attempts to whisper into a call that has already concluded. | Call is not in `/copilot/active-calls`; whisper endpoint rejects or logs as historical note. | 5⭐: Clean session termination. |

#### 4.2 Automated Post-Call Intelligence & Lead Scoring
| # | Test Scenario | Transcript Characteristics | Intelligence Extraction Result | Pass Rating Criteria |
|---|---|---|---|---|
| 86 | High-Intent Booking | Caller books $1,200 sewer replacement: *"Yes, please book tomorrow at 8 AM, thank you so much!"* | `sentiment_label = "positive"`, `lead_score >= 85.0`, `lost_reason = None`. | 5⭐: Hot lead identified for sales pipeline. |
| 87 | Price Objection Lost Lead | Caller: *"That is way too expensive, $400 is ridiculous, competitor does it for $150."* | `sentiment_label = "frustrated"`, `lead_score < 40.0`, `lost_reason = "price_too_high"`, `key_objections = ["pricing_high"]`. | 5⭐: Root cause tagged for business owner review. |
| 88 | Out of Area Opportunity | Caller: *"I'm in Dallas, can you come out?"* (Business is in Austin). | `lost_reason = "outside_coverage_area"`, `key_objections = ["outside_service_area"]`. | 5⭐: Maps market expansion demand accurately. |
| 89 | Emergency Escalation Lead | Caller: *"Main water line burst, flooding everywhere!"* | `urgency = "emergency"`, `sentiment_label = "urgent"`, `lead_score >= 90.0`. | 5⭐: Prioritized top-of-funnel dispatch. |
| 90 | Competitor Comparison | Caller: *"I'm going to shop around and get other quotes before deciding."* | `lost_reason = "shopping_competitors"`, `key_objections = ["shopping_competitors"]`. | 5⭐: Clear objection classification. |
| 91–105 | Edge Cases & Blended Calls | Prank calls, dead air silence, partial bookings, hostile angry callers, indecisive callers. | Assigns correct lead score (0–100), extracts sentiment, and identifies friction patterns accurately. | 5⭐: High precision across noisy real-world data. |

---

## 4. UI Testing & Interactive Verification Guide

### Portal Live Copilot & Active Calls Tab
1. Navigate to `http://localhost:3000/portal/copilot`.
2. Place a test call via WebRTC test client or SIP dialer.
3. Observe the **Live Active Calls** card:
   - Green "LIVE" indicator with ticking elapsed timer.
   - Live stream of caller utterance vs. agent response.
4. Test the **Supervisor Whisper Box**:
   - Type: `"Mention we have a same-day special for $50 off."`
   - Click **Send Whisper**.
   - Verify badge increments (*"Whispers: 1"*), and agent adopts instructions on the next turn.

### Call History & Intelligence Dashboard
1. Navigate to `http://localhost:3000/portal/calls`.
2. Inspect the call summary table:
   - **Sentiment Badges:** Green (Positive), Blue (Neutral), Red (Frustrated), Orange (Urgent).
   - **Lead Score Gauge:** 1 to 100 with color gradient.
   - **Lost Reason Tag:** Visible on unbooked calls (e.g., `price_too_high`, `outside_coverage_area`).
3. Click on any call row to open **Call Detail Modal**:
   - Stereo audio player with waveform scrubber.
   - Turn-by-turn latency timeline (P50/P95).
   - Supervisor whisper audit history with supervisor email.

---

## 5. Decision & Evaluation Matrix

Use this matrix to grade your test sessions and determine promotion to production:

```
Total Test Cases Executed: [   / 105 ]
-----------------------------------------------------------
Pillar 1 (Human-Like Conversational Flow):   Average Rating: [  .  ] / 5.0
Pillar 2 (Speed-to-Lead & Outbound):         Average Rating: [  .  ] / 5.0
Pillar 3 (Latency & Audio Quality):          Average Rating: [  .  ] / 5.0
Pillar 4 (Supervisor Copilot & Intelligence): Average Rating: [  .  ] / 5.0
-----------------------------------------------------------
OVERALL FRAMEWORK SCORE:                     [  .  ] / 5.0
```

- **>= 4.7 / 5.0:** **Ready for Live Customer Traffic.**
- **4.0 – 4.6:** **Minor Prompt / Pacing Refinement Needed.**
- **< 4.0:** **Block Production Rollout; Address Identified Failure Patterns.**
