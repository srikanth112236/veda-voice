"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  HelpCircle,
  X,
  ShieldCheck,
  PhoneCall,
  PhoneForwarded,
  DollarSign,
  Flame,
  Clock,
  MapPin,
  Lock,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export interface InfoTopicDetails {
  title: string;
  category:
    | "Telephony & Carrier"
    | "Compliance & Legal"
    | "Multi-Tenant Security"
    | "AI Persona & Acoustics"
    | "Knowledge Grounding"
    | "Pricing Guardrails"
    | "Emergency Protocols"
    | "Operating Hours & Geofence"
    | "Latency & Analytics";
  summary: string;
  howItWorks: string[];
  complianceOrBestPractice?: string;
  callerExperience?: string;
}

export const INFO_TOPICS: Record<string, InfoTopicDetails> = {
  inbound_telephony: {
    title: "Inbound Telephony Architecture",
    category: "Telephony & Carrier",
    summary:
      "How incoming customer phone calls reach the AI receptionist and resolve the correct business context.",
    howItWorks: [
      "1. Customer dials the tenant's dedicated business phone number.",
      "2. SIP Carrier (Twilio or Telnyx) sends SIP INVITE to LiveKit Cloud through an Elastic SIP Trunk.",
      "3. LiveKit SIP Dispatch Rule routes call to a room named 'in-<random>' and starts the voice agent.",
      "4. Agent reads dialed number (E.164) from SIP attributes and calls GET /internal/tenants/by-number/{e164}.",
      "5. Internal API verifies tenant status, loads custom profile/knowledge base, and returns a short-lived call-scoped token.",
    ],
    complianceOrBestPractice:
      "Each dialed number is uniquely mapped to one tenant. Two tenants cannot share a number. Unassigned numbers route to a safe default that records zero caller data.",
    callerExperience:
      "Caller hears 1-2 rings, receptionist answers with the tenant's brand greeting, and converses with sub-second voice latency.",
  },

  outbound_telephony: {
    title: "Outbound Calling & TCPA Compliance",
    category: "Compliance & Legal",
    summary:
      "Automated phone outreach strictly for consented customer touchpoints (reminders, callbacks, opt-in leads).",
    howItWorks: [
      "1. Trigger event occurs (e.g. appointment reminder scheduled 24h prior, or caller requested a 3 PM callback).",
      "2. Dialer worker evaluates the 8-Point Compliance Gate (consent, suppression, recipient timezone window, frequency caps).",
      "3. If all checks pass, dialer calls LiveKit CreateAgentDispatch and CreateSIPParticipant using the tenant's registered Caller ID.",
      "4. The AI handles voicemail detection (AMD), live conversation, or immediate opt-out.",
    ],
    complianceOrBestPractice:
      "CRITICAL: Unsolicited cold calling with AI synthetic voices is illegal under TCPA (up to $1,500 penalty per violation). Outbound is restricted to strictly consented contacts with recorded consent timestamps.",
    callerExperience:
      "Recipient's phone shows the business's verified caller ID. Receptionist identifies itself as an automated assistant in the first sentence and respects opt-out requests instantly.",
  },

  multitenant_isolation: {
    title: "Zero-Leak Multi-Tenant Security",
    category: "Multi-Tenant Security",
    summary:
      "How VedaVoice ensures 100% cryptographic and structural isolation between business tenants.",
    howItWorks: [
      "1. Zero Direct DB Access: The voice agent running on LiveKit Cloud never has database credentials.",
      "2. Call-Scoped JWT: Agent authenticates with internal API using a short-lived token scoped strictly to that single call and tenant ID.",
      "3. Database RLS: Every table (calls, contacts, bookings, suppressions) enforces tenant_id scoping. Tenant users cannot provide or override tenant_id in requests.",
      "4. Dynamic In-Memory Prompts: Prompts are generated on the fly per call. Offline isolation tests verify Tenant A's prompt never contains Tenant B's text.",
      "5. Storage Partitioning: Audio recordings and call JSONs are partitioned under data/calls/<tenant_id>/.",
    ],
    complianceOrBestPractice:
      "Enforces SOC-2 and HIPAA multi-tenant data residency standards. No cross-tenant queries are possible.",
  },

  telephony_carriers: {
    title: "Carrier Trunks vs LiveKit Native Numbers",
    category: "Telephony & Carrier",
    summary:
      "Why production business deployments require carrier SIP trunks (Twilio/Telnyx) instead of direct LiveKit numbers.",
    howItWorks: [
      "LiveKit Native Phone Numbers are US-only and strictly inbound-only. They do not support outbound calling or TransferSIPParticipant (SIP REFER).",
      "Production tenants use Twilio or Telnyx Elastic SIP Trunks connected to LiveKit SIP inbounds.",
      "Allows full outbound caller ID attestation (STIR/SHAKEN A-rating), warm transfers to human technicians, and international numbers.",
    ],
    complianceOrBestPractice:
      "Use LiveKit direct numbers only for quick sandbox development. Production agency clients must be configured with an Elastic SIP trunk.",
  },

  module1_persona: {
    title: "Module 1: Brand Persona & Acoustic Tuning",
    category: "AI Persona & Acoustics",
    summary:
      "Configures the conversational tone archetype, speech pace, and neural acoustic timbre for the receptionist.",
    howItWorks: [
      "Direct & Agile: <15 words per turn, rapid triage. Ideal for emergency trades, plumbing, HVAC, and towing.",
      "Warm & Consultative: ~20 words per turn, patient active listening. Ideal for clinics and residential services.",
      "Formal & Executive: Polished, corporate phrasing. Ideal for legal, wealth management, and B2B consulting.",
      "Neural Timbre Selection: Powered by partner-credit inference models (Inworld TTS and Rime TTS).",
    ],
    callerExperience:
      "The voice sounds natural with proper inflection and breathing pauses rather than robotic or synthetic.",
  },

  module1_recording_disclosure: {
    title: "Two-Party Call Recording Disclosure",
    category: "Compliance & Legal",
    summary:
      "Mandatory legal disclosure notifying callers that the call is being recorded and handled by an AI assistant.",
    howItWorks: [
      "When enabled, the receptionist greeting automatically includes: 'This call may be recorded and transcribed for quality assurance.'",
      "Mandatory for all-party consent states: California, Florida, Pennsylvania, Massachusetts, Washington, Illinois, Connecticut, Maryland, Montana, New Hampshire.",
      "Also satisfies California BOT Act (AB 947) requiring AI systems to disclose their automated nature.",
    ],
    complianceOrBestPractice:
      "Leave this switch enabled to ensure full legal immunity against unauthorized wiretapping claims.",
  },

  module1_phonetics: {
    title: "Phonetic Pronunciation Glossary",
    category: "AI Persona & Acoustics",
    summary:
      "Teaches the neural voice model how to articulate trade acronyms, medical terms, and local street names.",
    howItWorks: [
      "Voice synthesis models frequently mispronounce acronyms (e.g. saying 'huh-vak' instead of 'H-V-A-C', or 'p-e-x' instead of 'pecks').",
      "The phonetic glossary injects explicit pronunciation hints into the system prompt.",
      "Examples: PEX -> 'pecks', Worcester -> 'Wooster', Carrier -> 'CARE-ee-er'.",
    ],
    callerExperience:
      "Technically accurate pronunciation builds immediate trust with trade professionals and local callers.",
  },

  module2_faq_grounding: {
    title: "Module 2: Zero-Hallucination Knowledge Engine",
    category: "Knowledge Grounding",
    summary:
      "Strictly grounds the AI's answers in verified canonical facts, backed by caller phrasing variation triggers.",
    howItWorks: [
      "1. Grounded Facts: The AI is legally instructed to speak ONLY verified information from the active FAQ table.",
      "2. Caller Phrasing Triggers: Maps natural spoken variations (e.g. 'Can someone come tonight?', 'Do you work weekends?') to the exact canonical answer.",
      "3. Safe Deflection: If a caller asks an unlisted question, the AI politely explains it does not have that specific detail and offers to take a message.",
    ],
    complianceOrBestPractice:
      "Prevents false promises regarding warranties, certifications, licensing, or services your business does not provide.",
  },

  module3_pricing_engine: {
    title: "Module 3: 3-Tier Pricing Guardrail Engine",
    category: "Pricing Guardrails",
    summary:
      "Prevents the AI from hallucinating quotes or making unauthorized price promises over the phone.",
    howItWorks: [
      "Tier 1 (Zero Phone Quoting): The AI is barred from speaking any dollar amounts. Explains that pricing requires in-person diagnostic inspection.",
      "Tier 2 (Fixed-Price Menu): AI quotes only exact catalog prices (e.g. '$89 trip fee'). Unlisted repairs are explicitly disclaimed as requiring on-site assessment.",
      "Tier 3 (Estimated Price Brackets): AI provides ranges (e.g. '$150 - $250') and must recite the mandatory verbal disclaimer: 'Final pricing depends on an on-site assessment.'",
    ],
    callerExperience:
      "Callers receive clear, consistent pricing information with transparent expectations, protecting technicians from price disputes.",
  },

  module4_emergency_platform_gate: {
    title: "Module 4: Non-Negotiable Platform Safety Gate",
    category: "Emergency Protocols",
    summary:
      "Platform Level-1 safety rules that override any tenant custom instructions to protect human life.",
    howItWorks: [
      "Gas Odor / Gas Leak: AI immediately commands the caller to evacuate the building, avoid touching electrical switches, and call 911 or the gas company from outside.",
      "Active Electrical Fire / Hazard: Directs caller to dial 911 immediately.",
      "Zero Dispatch Promises: AI is programmatically barred from promising immediate technician arrival times or claiming someone will be dispatched right away.",
      "Universal Compliance Statement: 'I've written down your details.'",
    ],
    complianceOrBestPractice:
      "These rules protect business owners from gross negligence liability during severe structural or life-safety emergencies.",
  },

  module4_safety_script: {
    title: "Tenant Approved Damage Mitigation Script",
    category: "Emergency Protocols",
    summary:
      "Custom spoken instructions written by the business to guide the caller in preventing property damage.",
    howItWorks: [
      "When a water or property hazard keyword (e.g. 'burst pipe', 'flooding') is triggered, the AI speaks this approved script.",
      "Example: 'If it is safe to do so, locate and shut off your main water valve right away to prevent further flooding.'",
      "Platform Default: If left empty, the platform authorizes zero repair or valve shutoff advice, defaulting to standard emergency message intake.",
    ],
  },

  module4_escalation_transfer: {
    title: "Emergency Escalation Routing Protocol",
    category: "Emergency Protocols",
    summary:
      "How confirmed emergencies are routed to human on-call personnel.",
    howItWorks: [
      "Priority Message Intake: Captures emergency message, tags call as URGENT_EMERGENCY, and dispatches instant webhook/SMS alerts.",
      "Live Telephony Transfer: Uses LiveKit warm/cold transfer to bridge caller to the on-call emergency E.164 phone number.",
      "Hybrid Mode: Attempts live transfer to on-call phone; if unanswered within 25 seconds, gracefully takes emergency callback message.",
    ],
  },

  module5_temporal_clock: {
    title: "Module 5: Real-Time Temporal Awareness",
    category: "Operating Hours & Geofence",
    summary:
      "How the voice model understands time of day, day of week, and holiday schedules in the business's timezone.",
    howItWorks: [
      "Every inbound call dynamically evaluates the current date and time in the tenant's configured timezone (e.g. America/New_York).",
      "Injected into system prompt: 'Current Date: Friday, Nov 13, 2026 | Current Time: 10:45 AM (America/Chicago)'.",
      "Allows the receptionist to accurately answer: 'Are you open right now?', 'When do you close today?', and 'Can someone come tomorrow morning?'.",
    ],
  },

  module5_after_hours: {
    title: "After-Hours Call Handling Protocols",
    category: "Operating Hours & Geofence",
    summary:
      "Determines how calls arriving outside normal working hours are triaged.",
    howItWorks: [
      "Option A (Full Message Intake): Explains the office is closed, states next reopen time, and captures message for the morning dispatch crew.",
      "Option B (Emergency Gate Only): Informs routine callers that office is closed. Only processes urgent emergency dispatch (floods/gas).",
      "Option C (Informational Voicemail): Announces business hours and website, directing callers to online booking without taking phone messages.",
    ],
  },

  module5_geofence: {
    title: "Service Territory & Geofence Engine",
    category: "Operating Hours & Geofence",
    summary:
      "Prevents booking jobs outside your team's physical dispatch service radius.",
    howItWorks: [
      "1. Territory Definition: Stores primary radius (e.g. 25-mile radius) and approved municipality tags (e.g. Austin, Round Rock).",
      "2. Out-of-Area Guardrail Action: If caller gives an address in another city, the AI applies the configured policy.",
      "3. Policies: 'Politely Decline & Capture Lead', 'Hard Disqualification (Refer local)', or 'Disclose Travel Surcharge'.",
    ],
    callerExperience:
      "Example: 'Since you are in Dallas, which is outside our service area, we unfortunately cannot dispatch a technician to your location. However, may I write down your details for management review?'",
  },

  call_latency_metrics: {
    title: "3-Stage Voice Telephony Latency Telemetry",
    category: "Latency & Analytics",
    summary:
      "Real-time breakdown of conversational latency to ensure natural voice cadence.",
    howItWorks: [
      "1. End-of-Utterance (EOU) Detection: Silero VAD detects speech pause (tuned to 750ms).",
      "2. LLM Time to First Token (TTFT): Gemini 2.5 Flash / Gemma generates first conversational token (<350ms).",
      "3. Voice TTS Time to First Byte (TTFB): Inworld / Rime synthesizes voice audio frames (<250ms).",
      "Target End-to-End Latency: p50 under 1,100ms, p95 under 1,400ms for seamless human-like pacing.",
    ],
  },
};

interface InfoModalContextType {
  openModal: (topicKey: string) => void;
  closeModal: () => void;
}

const InfoModalContext = createContext<InfoModalContextType | undefined>(undefined);

export function InfoModalProvider({ children }: { children: ReactNode }) {
  const [activeTopicKey, setActiveTopicKey] = useState<string | null>(null);

  const openModal = (topicKey: string) => {
    setActiveTopicKey(topicKey);
  };

  const closeModal = () => {
    setActiveTopicKey(null);
  };

  const activeTopic = activeTopicKey ? INFO_TOPICS[activeTopicKey] : null;

  return (
    <InfoModalContext.Provider value={{ openModal, closeModal }}>
      {children}

      {/* Global Interactive Info Modal */}
      {activeTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-emerald-500/5 space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-3 gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  {activeTopic.category}
                </div>
                <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  {activeTopic.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900 transition-colors"
                title="Close dialog (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary */}
            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              {activeTopic.summary}
            </p>

            {/* How It Works Steps */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase font-mono tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                How It Works in the Voice Engine
              </h3>
              <div className="p-3.5 rounded-lg border border-zinc-800/80 bg-zinc-900/60 space-y-2 text-xs text-zinc-300 font-sans">
                {activeTopic.howItWorks.map((step, idx) => (
                  <div key={idx} className="leading-relaxed flex items-start gap-2">
                    <span className="text-emerald-400 font-mono text-[11px] shrink-0">▸</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance / Best Practice Note */}
            {activeTopic.complianceOrBestPractice && (
              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 space-y-1 text-xs">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5 text-[11px] font-mono uppercase">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Compliance &amp; Best Practice
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  {activeTopic.complianceOrBestPractice}
                </p>
              </div>
            )}

            {/* Caller Experience Simulation */}
            {activeTopic.callerExperience && (
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-1 text-xs">
                <div className="font-semibold text-emerald-300 flex items-center gap-1.5 text-[11px] font-mono uppercase">
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  What the Caller Hears
                </div>
                <p className="text-zinc-300 text-[11px] leading-relaxed italic">
                  &quot;{activeTopic.callerExperience}&quot;
                </p>
              </div>
            )}

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </InfoModalContext.Provider>
  );
}

export function useInfoModal() {
  const context = useContext(InfoModalContext);
  if (!context) {
    throw new Error("useInfoModal must be used within an InfoModalProvider");
  }
  return context;
}

/**
 * Clickable Info Trigger Button
 */
export function InfoTrigger({
  topic,
  label,
  className = "",
}: {
  topic: string;
  label?: string;
  className?: string;
}) {
  const { openModal } = useInfoModal();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(topic);
      }}
      className={`inline-flex items-center gap-1 text-zinc-500 hover:text-emerald-400 transition-colors p-0.5 rounded group ${className}`}
      title="Click for deep-dive explanation & compliance rules"
    >
      <HelpCircle className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
      {label && <span className="text-[10px] font-medium underline underline-offset-2">{label}</span>}
    </button>
  );
}
