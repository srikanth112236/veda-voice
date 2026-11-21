"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  api,
  KnowledgeDocument,
  RAGQueryResponse,
  FAQItem,
  AgentProfile,
  PhoneticEntry,
} from "@/lib/api";
import {
  BookOpen,
  Upload,
  FileText,
  Trash2,
  Search,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  FileCode,
  Layers,
  Sparkles,
  Eye,
  X,
  ShieldCheck,
  Plus,
  HelpCircle,
  Volume2,
  VolumeX,
  Tag,
  Filter,
  Check,
  Bot,
  Mic,
  Sliders,
  Copy,
  Clock,
  ShieldAlert,
  MessageSquare,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";

interface PromptVariantConfig {
  id: "daytime" | "after_hours" | "speed_to_lead" | "custom";
  name: string;
  badge: string;
  description: string;
  greeting: string;
  instructions: string;
}

const DEFAULT_PROMPT_VARIANTS: PromptVariantConfig[] = [
  {
    id: "daytime",
    name: "Standard Daytime Receptionist",
    badge: "Daytime Active",
    description: "Warm, professional, customer-first tone focused on booking appointments, answering service inquiries, and qualifying needs.",
    greeting: "Thank you for calling {{business_name}}! This is {{agent_name}}, your virtual receptionist. How can I assist you with your home services today?",
    instructions: `You are {{agent_name}}, the official AI receptionist for {{business_name}}.
Your role is to warmly assist callers during normal business hours ({{hours}} in {{timezone}}).
1. Answer caller questions directly using authorized FAQs and knowledge documents.
2. Check real-time technician calendar availability and book scheduled appointments.
3. If the caller mentions an urgent situation (gas leak, flooding, electrical fire), immediately switch to safety triage mode.
4. Keep spoken turns concise, natural, and conversational (under 3 sentences per turn).`,
  },
  {
    id: "after_hours",
    name: "After-Hours & Emergency Triage",
    badge: "Emergency Standby",
    description: "Direct safety triage, hazard advice, and on-call technician dispatch instructions for when the office is closed.",
    greeting: "Thank you for calling {{business_name}}. Our administrative offices are currently closed, but our 24/7 emergency dispatch line is open. Are you experiencing an active emergency?",
    instructions: `You are {{agent_name}}, operating the after-hours emergency line for {{business_name}}.
Regular hours are {{hours}}.
1. Immediately qualify whether the call is an urgent property-threatening emergency.
2. If true emergency: collect address, caller name, and callback number; provide immediate safety guidance, and dispatch the on-call technician.
3. If non-emergency inquiry: offer to schedule a priority morning callback during standard business hours.`,
  },
  {
    id: "speed_to_lead",
    name: "Speed-to-Lead Outbound Closer",
    badge: "High Conversion",
    description: "Fast-paced, assertive qualification and immediate calendar reservation for warm incoming leads and callbacks.",
    greeting: "Hi there! This is {{agent_name}} calling from {{business_name}} following up on your recent service request. Did I catch you at a good time?",
    instructions: `You are {{agent_name}} with {{business_name}} performing speed-to-lead qualification.
Acknowledge that they recently submitted an inquiry for service.
Keep responses concise, confident, and direct. Offer two concrete time windows to lock in the appointment.
Never argue or push past explicit opt-outs.`,
  },
  {
    id: "custom",
    name: "Custom AI Persona & Rules",
    badge: "Bespoke",
    description: "Full customization of the system prompt template with dynamic token interpolation.",
    greeting: "Thank you for calling {{business_name}}. This is {{agent_name}}. How can I assist you?",
    instructions: `You are {{agent_name}}, the virtual voice receptionist for {{business_name}}.
Operate strictly according to the tenant's custom policy rules, pricing guidelines, and business knowledge base.`,
  },
];

const COMMON_PHONETIC_PRESETS = [
  { term: "HVAC", spoken_as: "H-V-A-C", note: "Spells out heating, ventilation, and air conditioning" },
  { term: "PEX", spoken_as: "Pecks", note: "Cross-linked polyethylene water pipe" },
  { term: "SEER2", spoken_as: "SEER-two", note: "Seasonal energy efficiency ratio rating" },
  { term: "GFCI", spoken_as: "G-F-C-I", note: "Ground fault circuit interrupter outlet" },
  { term: "Lennox", spoken_as: "LEN-ucks", note: "HVAC equipment manufacturer" },
  { term: "Navien", spoken_as: "NAH-vee-en", note: "Tankless water heater brand" },
  { term: "VedaVoice", spoken_as: "VAY-duh Voice", note: "Platform brand pronunciation" },
  { term: "BTU", spoken_as: "B-T-U", note: "British thermal units heating capacity" },
];

export default function KnowledgeBasePage() {
  // Navigation & Mode
  const [activeTab, setActiveTab] = useState<"prompts" | "phonetics" | "faqs" | "documents">("prompts");

  // Agent Profile & Prompt State
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<"daytime" | "after_hours" | "speed_to_lead" | "custom">("daytime");
  const [agentName, setAgentName] = useState("Alex");
  const [greetingText, setGreetingText] = useState("");
  const [selectedTone, setSelectedTone] = useState("Warm & Professional");
  const [promptInstructions, setPromptInstructions] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptDeploySuccess, setPromptDeploySuccess] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Guardrails State
  const [guardrails, setGuardrails] = useState<string[]>([
    "Never disclose internal dispatch numbers to callers",
    "State diagnostic dispatch fee before confirming appointment",
    "Require immediate evacuation for gas leaks or sparking electrical",
  ]);
  const [newGuardrailInput, setNewGuardrailInput] = useState("");

  // Phonetic Glossary State
  const [phoneticList, setPhoneticList] = useState<PhoneticEntry[]>([]);
  const [showAddPhoneticModal, setShowAddPhoneticModal] = useState(false);
  const [newPhoneticTerm, setNewPhoneticTerm] = useState("");
  const [newPhoneticSpoken, setNewPhoneticSpoken] = useState("");
  const [newPhoneticNote, setNewPhoneticNote] = useState("");
  const [savingPhonetics, setSavingPhonetics] = useState(false);
  const [phoneticActionMsg, setPhoneticActionMsg] = useState<string | null>(null);

  // Documents State
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docPage, setDocPage] = useState(1);
  const [docPageSize, setDocPageSize] = useState(5);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document Chunk Inspection Drawer
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [docChunks, setDocChunks] = useState<Array<{ id: string; chunk_index: number; content: string; token_count: number }>>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Direct FAQs State
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(true);
  const [faqPage, setFaqPage] = useState(1);
  const [faqPageSize, setFaqPageSize] = useState(6);
  const [faqSearchQuery, setFaqSearchQuery] = useState("");
  const [faqCategoryFilter, setFaqCategoryFilter] = useState("all");
  const [showAddFaqModal, setShowAddFaqModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newAlternatePhrasings, setNewAlternatePhrasings] = useState("");
  const [submittingFaq, setSubmittingFaq] = useState(false);
  const [faqActionSuccess, setFaqActionSuccess] = useState<string | null>(null);

  // Live RAG Testing Sandbox State
  const [testQuery, setTestQuery] = useState("What are your business hours and pricing policies?");
  const [topK, setTopK] = useState(3);
  const [confidenceCutoff, setConfidenceCutoff] = useState(0.30);
  const [testingRAG, setTestingRAG] = useState(false);
  const [ragResult, setRagResult] = useState<RAGQueryResponse | null>(null);

  // Speech Synthesis Audio Simulator State
  const [currentlySpeaking, setCurrentlySpeaking] = useState<string | null>(null);

  // Loaders
  const loadProfile = async () => {
    setLoadingProfile(true);
    try {
      const p = await api.getPortalProfile();
      setProfile(p);
      setAgentName(p.agent_name || "Alex");
      setGreetingText(p.greeting || DEFAULT_PROMPT_VARIANTS[0].greeting);
      setSelectedTone(p.tone || "Warm & Professional");
      setPhoneticList(p.phonetic_glossary || []);
      setPromptInstructions(DEFAULT_PROMPT_VARIANTS[0].instructions);
    } catch (err) {
      console.error("Failed to load agent profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadDocuments = () => {
    setLoadingDocs(true);
    api
      .listKnowledgeDocuments()
      .then((docs) => setDocuments(docs))
      .catch((err) => console.error("Failed to load documents:", err))
      .finally(() => setLoadingDocs(false));
  };

  const loadFaqs = () => {
    setLoadingFaqs(true);
    api
      .listDirectFAQs()
      .then((items) => setFaqs(items || []))
      .catch((err) => console.error("Failed to load FAQs:", err))
      .finally(() => setLoadingFaqs(false));
  };

  useEffect(() => {
    loadProfile();
    loadDocuments();
    loadFaqs();
  }, []);

  // Voice Audio Simulator Handler
  const handleSpeakText = (text: string, identifier: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported in this browser.");
      return;
    }

    if (currentlySpeaking === identifier) {
      window.speechSynthesis.cancel();
      setCurrentlySpeaking(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Replace live tokens if text has them
    const interpolated = interpolateTokens(text);
    const utterance = new SpeechSynthesisUtterance(interpolated);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = "en-US";

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) =>
        v.name.includes("Natural") ||
        v.name.includes("Google") ||
        v.name.includes("Samantha") ||
        v.name.includes("Jenny")
    );
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onend = () => setCurrentlySpeaking(null);
    utterance.onerror = () => setCurrentlySpeaking(null);

    setCurrentlySpeaking(identifier);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Token Interpolator Helper
  const interpolateTokens = (template: string) => {
    return template
      .replace(/{{business_name}}/g, profile?.business_name || "Apex Services")
      .replace(/{{agent_name}}/g, agentName || "Alex")
      .replace(/{{hours}}/g, profile?.hours || "Mon-Fri 8:00 AM - 5:00 PM")
      .replace(/{{timezone}}/g, profile?.timezone || "America/Chicago")
      .replace(/{{transfer_number}}/g, profile?.transfer_number || "+1-555-0199");
  };

  // Switch Prompt Variant
  const handleSelectVariant = (variantId: "daytime" | "after_hours" | "speed_to_lead" | "custom") => {
    setSelectedVariant(variantId);
    const found = DEFAULT_PROMPT_VARIANTS.find((v) => v.id === variantId);
    if (found) {
      setGreetingText(found.greeting);
      setPromptInstructions(found.instructions);
    }
  };

  // Deploy Prompt & Persona to LiveKit
  const handleDeployPrompt = async () => {
    setSavingPrompt(true);
    setPromptDeploySuccess(null);
    try {
      await api.updatePortalProfile({
        agent_name: agentName.trim(),
        greeting: greetingText.trim(),
        tone: selectedTone,
      });
      setPromptDeploySuccess(
        `Prompt persona and greeting deployed to LiveKit SIP trunk workers! Runtime synchronized.`
      );
      setTimeout(() => setPromptDeploySuccess(null), 5000);
    } catch (err: any) {
      alert(`Failed to deploy prompt: ${err?.message || err}`);
    } finally {
      setSavingPrompt(false);
    }
  };

  // Phonetic Glossary Handlers
  const handleSavePhoneticEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoneticTerm.trim() || !newPhoneticSpoken.trim()) return;

    setSavingPhonetics(true);
    const updated = [
      ...phoneticList.filter((p) => p.term.toLowerCase() !== newPhoneticTerm.trim().toLowerCase()),
      {
        term: newPhoneticTerm.trim(),
        spoken_as: newPhoneticSpoken.trim(),
        note: newPhoneticNote.trim() || undefined,
      },
    ];

    try {
      await api.updatePortalProfile({ phonetic_glossary: updated });
      setPhoneticList(updated);
      setPhoneticActionMsg(`Pronunciation rule for "${newPhoneticTerm}" saved & deployed to LiveKit.`);
      setShowAddPhoneticModal(false);
      setNewPhoneticTerm("");
      setNewPhoneticSpoken("");
      setNewPhoneticNote("");
      setTimeout(() => setPhoneticActionMsg(null), 4000);
    } catch (err: any) {
      alert(`Failed to save phonetic term: ${err?.message || err}`);
    } finally {
      setSavingPhonetics(false);
    }
  };

  const handleDeletePhoneticEntry = async (term: string) => {
    if (!confirm(`Delete pronunciation rule for "${term}"?`)) return;
    const updated = phoneticList.filter((p) => p.term !== term);
    try {
      await api.updatePortalProfile({ phonetic_glossary: updated });
      setPhoneticList(updated);
      setPhoneticActionMsg(`Removed pronunciation rule for "${term}".`);
      setTimeout(() => setPhoneticActionMsg(null), 3000);
    } catch (err: any) {
      alert(`Failed to delete rule: ${err?.message || err}`);
    }
  };

  const handleApplyPhoneticPreset = (preset: { term: string; spoken_as: string; note: string }) => {
    setNewPhoneticTerm(preset.term);
    setNewPhoneticSpoken(preset.spoken_as);
    setNewPhoneticNote(preset.note);
  };

  // Guardrail Handlers
  const handleAddGuardrail = () => {
    if (!newGuardrailInput.trim()) return;
    setGuardrails((prev) => [...prev, newGuardrailInput.trim()]);
    setNewGuardrailInput("");
  };

  const handleRemoveGuardrail = (index: number) => {
    setGuardrails((prev) => prev.filter((_, i) => i !== index));
  };

  // Document Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const doc = await api.uploadKnowledgeDocument(file);
      setUploadSuccess(`Successfully indexed "${doc.filename}" into ${doc.chunk_count} sentence-aware chunks.`);
      loadDocuments();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}" and all its indexed chunks?`)) return;

    try {
      await api.deleteKnowledgeDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setDocChunks([]);
      }
    } catch (err: any) {
      alert(`Failed to delete document: ${err.message || err}`);
    }
  };

  const handleInspectChunks = async (doc: KnowledgeDocument) => {
    setSelectedDoc(doc);
    setLoadingChunks(true);
    try {
      const res = await api.getKnowledgeDocument(doc.id);
      setDocChunks(res.chunks);
    } catch (err) {
      console.error("Failed to inspect chunks:", err);
    } finally {
      setLoadingChunks(false);
    }
  };

  // Direct FAQ Actions
  const handleCreateFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;

    setSubmittingFaq(true);
    try {
      const altList = newAlternatePhrasings
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);

      const created = await api.createDirectFAQ({
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        category: newCategory.trim() || "General",
        alternate_phrasings: altList,
      });

      setFaqs((prev) => [...prev, created]);
      setFaqActionSuccess(`FAQ "${created.question}" created & vectorized for instant voice retrieval.`);
      setShowAddFaqModal(false);
      setNewQuestion("");
      setNewAnswer("");
      setNewCategory("General");
      setNewAlternatePhrasings("");
      setTimeout(() => setFaqActionSuccess(null), 5000);
      loadDocuments();
    } catch (err: any) {
      alert(`Failed to create FAQ: ${err.message || err}`);
    } finally {
      setSubmittingFaq(false);
    }
  };

  const handleDeleteFaq = async (faq: FAQItem) => {
    const identifier = faq.question;
    if (!confirm(`Are you sure you want to delete this FAQ: "${identifier}"?`)) return;

    try {
      await api.deleteDirectFAQ(identifier);
      setFaqs((prev) => prev.filter((f) => f.question !== identifier));
      setFaqActionSuccess(`FAQ removed and vector chunks updated.`);
      setTimeout(() => setFaqActionSuccess(null), 4000);
      loadDocuments();
    } catch (err: any) {
      alert(`Failed to delete FAQ: ${err.message || err}`);
    }
  };

  // Run Live RAG Query
  const handleRunRAGQuery = async () => {
    if (!testQuery.trim()) return;
    setTestingRAG(true);
    try {
      const res = await api.testRAGQuery(testQuery, topK, confidenceCutoff);
      setRagResult(res);
    } catch (err: any) {
      alert(`Query failed: ${err.message || err}`);
    } finally {
      setTestingRAG(false);
    }
  };

  // Calculations
  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0);

  const categories = Array.from(
    new Set(faqs.map((f) => f.category || "General"))
  ).sort();

  const filteredFaqs = faqs.filter((f) => {
    const matchesCategory =
      faqCategoryFilter === "all" ||
      (f.category || "General").toLowerCase() === faqCategoryFilter.toLowerCase();
    const query = faqSearchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      f.question.toLowerCase().includes(query) ||
      f.answer.toLowerCase().includes(query) ||
      (f.alternate_phrasings || []).some((alt) => alt.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  const getFormatIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "csv") return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
    if (ext === "pdf") return <FileText className="w-4 h-4 text-red-600" />;
    if (ext === "md" || ext === "markdown") return <FileCode className="w-4 h-4 text-blue-600" />;
    return <FileText className="w-4 h-4 text-zinc-600" />;
  };

  // Compiled Prompt for Inspector
  const compiledSystemPrompt = `### SYSTEM PERSONA: ${agentName.toUpperCase()}
${interpolateTokens(promptInstructions)}

### GREETING INITIAL UTTERANCE:
"${interpolateTokens(greetingText)}"

### CONVERSATIONAL TONE & STYLE:
- Tone: ${selectedTone}
- Latency Pacing: Sub-400ms Turn Pacing
- Dynamic Bilingual Rule: Spanish detection triggered on "¿Habla español?" or "Español por favor"
- Recording Disclosure: Enabled (Disclosed at turn 1)

### PHONETIC PRONUNCIATION LEXICON (${phoneticList.length} rules):
${phoneticList.map((p) => `- ${p.term} -> spoken as "${p.spoken_as}" (${p.note || "General trade term"})`).join("\n")}

### OPERATIONAL GUARDRAILS:
${guardrails.map((g) => `- [STRICT] ${g}`).join("\n")}`;

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-mono font-bold uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            AI Voice Prompts &amp; Knowledge Base Studio
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mt-1">Prompt Persona, Phonetic Lexicon &amp; RAG Hub</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configure LiveKit voice agent system prompts, phonetic pronunciation dictionaries, business FAQs, and grounding document libraries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "prompts" && (
            <button
              type="button"
              disabled={savingPrompt || loadingProfile}
              onClick={handleDeployPrompt}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {savingPrompt ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 fill-white text-white" />
              )}
              <span>{savingPrompt ? "Deploying to LiveKit..." : "Deploy to LiveKit Workers"}</span>
            </button>
          )}

          {activeTab === "phonetics" && (
            <button
              type="button"
              onClick={() => setShowAddPhoneticModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Phonetic Term
            </button>
          )}

          {activeTab === "faqs" && (
            <button
              type="button"
              onClick={() => setShowAddFaqModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Direct FAQ
            </button>
          )}

          {activeTab === "documents" && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.csv,.md,.markdown"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading ? "Extracting & Indexing..." : "Upload Document"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Intelligence Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* KPI 1: LiveKit Voice Persona */}
        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Voice Agent Persona</span>
            <Bot className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{agentName}</div>
          <div className="text-[10px] text-purple-700 font-mono font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            LiveKit Cloud SIP Synced
          </div>
        </div>

        {/* KPI 2: Phonetic Glossary */}
        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Phonetic Lexicon</span>
            <Mic className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{phoneticList.length} Rules</div>
          <div className="text-[10px] text-zinc-400 font-mono">Brand &amp; Jargon Pronunciation</div>
        </div>

        {/* KPI 3: Direct FAQs */}
        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Direct Business FAQs</span>
            <HelpCircle className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{faqs.length}</div>
          <div className="text-[10px] text-zinc-400 font-mono">Sub-15ms Vector Chunks</div>
        </div>

        {/* KPI 4: Knowledge Documents & Chunks */}
        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Grounding Documents</span>
            <Layers className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{documents.length} docs</div>
          <div className="text-[10px] text-emerald-600 font-mono font-medium">{totalChunks} sentence chunks</div>
        </div>
      </div>

      {/* Notifications */}
      {promptDeploySuccess && (
        <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span className="font-semibold">{promptDeploySuccess}</span>
          </div>
          <button onClick={() => setPromptDeploySuccess(null)} className="text-purple-700 hover:text-purple-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {phoneticActionMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{phoneticActionMsg}</span>
          </div>
          <button onClick={() => setPhoneticActionMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {faqActionSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{faqActionSuccess}</span>
          </div>
          <button onClick={() => setFaqActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {uploadSuccess && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{uploadSuccess}</span>
          </div>
          <button onClick={() => setUploadSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {uploadError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-700 hover:text-red-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4-Tab Studio Navigation */}
      <div className="flex items-center border-b border-zinc-200 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("prompts")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "prompts"
              ? "border-purple-600 text-purple-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <Bot className="w-4 h-4" />
          Voice Prompts &amp; Persona Studio
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("phonetics")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "phonetics"
              ? "border-indigo-600 text-indigo-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <Mic className="w-4 h-4" />
          Pronunciation &amp; Phonetic Lexicon ({phoneticList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("faqs")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "faqs"
              ? "border-indigo-600 text-indigo-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          Direct Business FAQs &amp; Policies ({faqs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "documents"
              ? "border-indigo-600 text-indigo-700 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <FileText className="w-4 h-4" />
          Document Library &amp; RAG Playground ({documents.length})
        </button>
      </div>

      {/* TAB 1: VOICE PROMPTS & PERSONA STUDIO */}
      {activeTab === "prompts" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Variant Selector, Tone, Greeting, Guardrails (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Prompt Variant Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase font-mono">
                  <Sliders className="w-3.5 h-3.5 text-purple-600" />
                  Select LiveKit System Prompt Variant
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">Hot-swappable in runtime</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DEFAULT_PROMPT_VARIANTS.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleSelectVariant(variant.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all space-y-2 ${
                      selectedVariant === variant.id
                        ? "bg-purple-50/70 border-purple-400 ring-2 ring-purple-300/60 shadow-xs"
                        : "bg-white border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-900">{variant.name}</h4>
                      <span
                        className={`text-[9.5px] px-2 py-0.5 rounded-full font-mono font-bold ${
                          selectedVariant === variant.id
                            ? "bg-purple-200 text-purple-900"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {variant.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2">
                      {variant.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Persona Identity & Tone Controls */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wide flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-purple-600" />
                Receptionist Identity &amp; Voice Tone
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Agent Spoken Name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Conversational Tone
                  </label>
                  <select
                    value={selectedTone}
                    onChange={(e) => setSelectedTone(e.target.value)}
                    className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Warm & Professional">Warm &amp; Professional</option>
                    <option value="Friendly & Crisp">Friendly &amp; Crisp</option>
                    <option value="Direct & Urgent">Direct &amp; Urgent (Emergency Triage)</option>
                    <option value="Assertive Closer">Assertive Closer (Speed-to-Lead)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Greeting Script Editor */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wide flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                  Greeting &amp; Opening Line
                </label>
                <button
                  type="button"
                  onClick={() => handleSpeakText(greetingText, "greeting-test")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    currentlySpeaking === "greeting-test"
                      ? "bg-purple-700 text-white border-purple-700 animate-pulse"
                      : "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
                  }`}
                  title="Audition greeting with speech synthesizer"
                >
                  {currentlySpeaking === "greeting-test" ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  <span>{currentlySpeaking === "greeting-test" ? "Stop Audio" : "Audition Greeting"}</span>
                </button>
              </div>

              <textarea
                rows={3}
                value={greetingText}
                onChange={(e) => setGreetingText(e.target.value)}
                placeholder="Opening greeting spoken to caller..."
                className="w-full text-xs rounded-xl border border-zinc-300 p-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500 leading-relaxed font-sans"
              />

              {/* Variable Token Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px]">
                <span className="font-mono text-zinc-400 font-bold uppercase">Insert Tokens:</span>
                {[
                  "{{business_name}}",
                  "{{agent_name}}",
                  "{{hours}}",
                  "{{timezone}}",
                  "{{transfer_number}}",
                ].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setGreetingText((prev) => `${prev} ${token}`)}
                    className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-purple-100 border border-zinc-200 hover:border-purple-300 text-zinc-700 hover:text-purple-800 font-mono transition"
                    title={`Insert ${token}`}
                  >
                    + {token}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Instructions Editor */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wide flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-purple-600" />
                  Behavioral Directives &amp; Variant Instructions
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {promptInstructions.length} characters
                </span>
              </div>
              <textarea
                rows={6}
                value={promptInstructions}
                onChange={(e) => setPromptInstructions(e.target.value)}
                placeholder="System instructions and persona rules..."
                className="w-full text-xs rounded-xl border border-zinc-300 p-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500 leading-relaxed font-mono"
              />
            </div>

            {/* Conversational Guardrails */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wide flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  Conversational Guardrails &amp; Safety Boundaries
                </h3>
                <span className="text-[10px] text-zinc-400 font-mono">{guardrails.length} active rules</span>
              </div>
              <div className="space-y-2">
                {guardrails.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-950 text-xs flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{rule}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuardrail(idx)}
                      className="text-amber-700 hover:text-amber-900 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newGuardrailInput}
                  onChange={(e) => setNewGuardrailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddGuardrail();
                    }
                  }}
                  placeholder="Add custom safety rule (e.g. Do not quote roof replacements over the phone)..."
                  className="flex-1 text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={handleAddGuardrail}
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  Add Rule
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Compiled LiveKit System Prompt Inspector (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl border border-purple-200 bg-white shadow-sm space-y-4 sticky top-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h3 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wide">
                    Live LiveKit Prompt Inspector
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(compiledSystemPrompt);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-purple-700 hover:text-purple-900 font-semibold transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedPrompt ? "Copied!" : "Copy"}</span>
                </button>
              </div>

              <p className="text-xs text-zinc-500 leading-snug">
                This shows the evaluated system prompt that will be loaded into the LiveKit agent worker when a caller dials your SIP trunk numbers.
              </p>

              <div className="bg-zinc-950 text-zinc-200 rounded-xl p-4 font-mono text-[11px] max-h-[500px] overflow-y-auto leading-relaxed border border-zinc-800 space-y-2 whitespace-pre-wrap select-text">
                {compiledSystemPrompt}
              </div>

              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                <span className="text-[11px] text-zinc-500 font-mono">
                  Estimated prompt tokens: ~{Math.round(compiledSystemPrompt.length / 4)}
                </span>
                <button
                  type="button"
                  disabled={savingPrompt || loadingProfile}
                  onClick={handleDeployPrompt}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-semibold shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {savingPrompt ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-white text-white" />
                  )}
                  <span>Deploy to LiveKit</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRONUNCIATION & PHONETIC LEXICON */}
      {activeTab === "phonetics" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200">
            <div className="space-y-0.5">
              <h3 className="text-xs font-bold text-indigo-950 uppercase font-mono tracking-wide flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-700" />
                Speech Synthesis Phonetic Pronunciation Lexicon
              </h3>
              <p className="text-xs text-indigo-800">
                Ensure your LiveKit voice agent flawlessly articulates brand names, trade abbreviations, and technical terms.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddPhoneticModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custom Term</span>
            </button>
          </div>

          {/* Phonetic Rules Table */}
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-mono uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Original Written Term</th>
                  <th className="py-3 px-4">Phonetic Spoken Replacement</th>
                  <th className="py-3 px-4">Domain Note / Context</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {phoneticList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-zinc-400">
                      <div className="space-y-2">
                        <Mic className="w-8 h-8 text-zinc-300 mx-auto" />
                        <div className="font-semibold text-zinc-700">No phonetic substitutions registered yet</div>
                        <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                          Add custom pronunciations like &quot;HVAC&quot; &rarr; &quot;H-V-A-C&quot; or your brand name so the AI speaks naturally.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  phoneticList.map((entry, idx) => {
                    const isSpeakingThis = currentlySpeaking === `phonetic-${idx}`;
                    return (
                      <tr key={idx} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="py-3 px-4 font-bold text-zinc-900 font-mono text-xs">
                          {entry.term}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-semibold text-xs">
                            {entry.spoken_as}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-500 text-[11px]">
                          {entry.note || "General trade term"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleSpeakText(entry.spoken_as, `phonetic-${idx}`)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                                isSpeakingThis
                                  ? "bg-indigo-600 text-white border-indigo-600 animate-pulse"
                                  : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                              }`}
                              title="Audition phonetic pronunciation"
                            >
                              {isSpeakingThis ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                              <span>{isSpeakingThis ? "Stop" : "Audition"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePhoneticEntry(entry.term)}
                              className="p-1 rounded-lg hover:bg-rose-50 text-rose-600 transition"
                              title="Delete rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DIRECT BUSINESS FAQs & POLICIES */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3" />
              <input
                type="text"
                value={faqSearchQuery}
                onChange={(e) => setFaqSearchQuery(e.target.value)}
                placeholder="Search questions, answers, or phrasings..."
                className="w-full text-xs rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={faqCategoryFilter}
                  onChange={(e) => setFaqCategoryFilter(e.target.value)}
                  className="bg-transparent text-xs font-medium text-zinc-700 focus:outline-none"
                >
                  <option value="all">All Categories ({faqs.length})</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={loadFaqs}
                className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
                title="Refresh FAQs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* FAQs Card List */}
          {loadingFaqs ? (
            <div className="p-8 text-center text-zinc-400 font-mono text-xs bg-white rounded-2xl border border-zinc-200">
              Loading business FAQs...
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 bg-white rounded-2xl border border-zinc-200 space-y-3">
              <HelpCircle className="w-8 h-8 text-zinc-300 mx-auto" />
              <div className="text-xs font-semibold text-zinc-700">No FAQs match your search or filter</div>
              <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
                Add standard questions like warranty details, accepted payment methods, service radii, or emergency hours.
              </p>
              <button
                type="button"
                onClick={() => setShowAddFaqModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First FAQ
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {filteredFaqs
                  .slice((faqPage - 1) * faqPageSize, faqPage * faqPageSize)
                  .map((faq, index) => {
                  const isSpeakingThis = currentlySpeaking === `faq-${index}`;
                  return (
                    <div
                      key={index}
                      className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-semibold">
                              {faq.category || "General"}
                            </span>
                            <h3 className="text-xs font-bold text-slate-900">{faq.question}</h3>
                          </div>
                          <p className="text-xs text-slate-700 leading-relaxed font-sans">{faq.answer}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSpeakText(faq.answer, `faq-${index}`)}
                            className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 ${
                              isSpeakingThis
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm animate-pulse"
                                : "border-slate-200 hover:bg-indigo-50 text-indigo-700 hover:border-indigo-200"
                            }`}
                            title={isSpeakingThis ? "Stop Voice Simulation" : "Audition Voice Receptionist Response"}
                          >
                            {isSpeakingThis ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            <span className="text-[10px] hidden sm:inline">
                              {isSpeakingThis ? "Stop" : "Listen"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(faq)}
                            className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 text-xs"
                            title="Delete FAQ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Alternate Phrasings */}
                      {faq.alternate_phrasings && faq.alternate_phrasings.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                            <Tag className="w-2.5 h-2.5" />
                            Phrasings:
                          </span>
                          {faq.alternate_phrasings.map((alt, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium"
                            >
                              {alt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {filteredFaqs.length > 6 && (
                <div className="pt-1">
                  <PaginationBar
                    currentPage={faqPage}
                    totalItems={filteredFaqs.length}
                    pageSize={faqPageSize}
                    onPageChange={setFaqPage}
                    onPageSizeChange={setFaqPageSize}
                    pageSizeOptions={[6, 12, 24]}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DOCUMENT LIBRARY & LIVE RAG PLAYGROUND */}
      {activeTab === "documents" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Documents Table (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-zinc-900 flex items-center gap-2 uppercase font-mono">
                <FileText className="w-4 h-4 text-zinc-600" />
                Indexed Documents Library
              </h2>
              <button
                onClick={loadDocuments}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                title="Refresh Documents"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-mono text-[11px] uppercase">
                  <tr>
                    <th className="p-3">Document</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Chunks</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loadingDocs ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-400 font-mono">
                        Loading tenant documents...
                      </td>
                    </tr>
                  ) : documents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-400">
                        <div className="space-y-2">
                          <BookOpen className="w-8 h-8 text-zinc-300 mx-auto" />
                          <div className="font-semibold text-zinc-700">No documents uploaded yet</div>
                          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                            Upload your business price lists, warranty terms, or service catalogs to give your voice receptionist instant factual answers.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    documents
                      .slice((docPage - 1) * docPageSize, docPage * docPageSize)
                      .map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            {getFormatIcon(doc.filename)}
                            <span className="truncate max-w-[180px]">{doc.filename}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {doc.file_size_bytes > 1024 * 1024
                            ? `${(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                            : `${Math.round(doc.file_size_bytes / 1024)} KB`}
                        </td>
                        <td className="p-3 font-mono text-slate-900 font-bold">
                          {doc.chunk_count} chunks
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {doc.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleInspectChunks(doc)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                              title="Inspect Chunks"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                              className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold"
                              title="Delete Document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {documents.length > 5 && (
              <div className="pt-2">
                <PaginationBar
                  currentPage={docPage}
                  totalItems={documents.length}
                  pageSize={docPageSize}
                  onPageChange={setDocPage}
                  onPageSizeChange={setDocPageSize}
                  pageSizeOptions={[5, 10, 20]}
                />
              </div>
            )}
          </div>

          {/* Right Column: Live RAG Testing Sandbox (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl border border-indigo-200 bg-white shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Live RAG Simulator
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold">
                  Dual Search
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Test how the voice receptionist queries your FAQs and indexed documents in real-time, and listen to the voice output.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700">Caller Inquiry Question</label>
                <div className="relative">
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    placeholder="e.g. Do you charge diagnostic fees or do weekend emergency work?"
                    className="w-full text-xs rounded-xl border border-zinc-300 pr-9 pl-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleRunRAGQuery}
                    disabled={testingRAG || !testQuery.trim()}
                    className="absolute right-1.5 top-1.5 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    title="Run RAG Search"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-600">Top Chunks ({topK})</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-600">Confidence Cutoff ({confidenceCutoff})</label>
                  <input
                    type="range"
                    min="0.10"
                    max="0.80"
                    step="0.05"
                    value={confidenceCutoff}
                    onChange={(e) => setConfidenceCutoff(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              </div>

              {/* RAG Query Results Display */}
              {ragResult && (
                <div className="space-y-3 pt-2 border-t border-zinc-100 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-800">Status:</span>
                      {ragResult.out_of_scope ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                          Out of Scope (Safe Fallback)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          Grounded Answer Ready
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <strong>{ragResult.latency_ms}ms</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-600">
                    <span>Confidence: <strong>{(ragResult.confidence_score * 100).toFixed(1)}%</strong></span>
                    {ragResult.top_matches.length > 0 && !ragResult.out_of_scope && (
                      <button
                        type="button"
                        onClick={() => handleSpeakText(ragResult.top_matches[0].content, "rag-top")}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                          currentlySpeaking === "rag-top"
                            ? "bg-indigo-600 text-white border-indigo-600 animate-pulse"
                            : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        }`}
                      >
                        {currentlySpeaking === "rag-top" ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                        {currentlySpeaking === "rag-top" ? "Stop Audio" : "Audition Voice"}
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {ragResult.top_matches.map((match, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                          <span className="font-bold text-indigo-700 truncate max-w-[200px]">{match.filename}</span>
                          <span>Score: {(match.score * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-[11px] text-zinc-800 line-clamp-3 leading-relaxed">
                          {match.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Phonetic Term */}
      {showAddPhoneticModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Mic className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-zinc-900">Add Phonetic Pronunciation Rule</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPhoneticModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold block">
                Quick Trade Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PHONETIC_PRESETS.map((preset) => (
                  <button
                    key={preset.term}
                    type="button"
                    onClick={() => handleApplyPhoneticPreset(preset)}
                    className="px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-indigo-50 border border-zinc-200 hover:border-indigo-200 text-zinc-700 hover:text-indigo-700 text-[10px] font-mono font-medium transition"
                  >
                    {preset.term} ({preset.spoken_as})
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSavePhoneticEntry} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Original Written Word / Acronym <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPhoneticTerm}
                  onChange={(e) => setNewPhoneticTerm(e.target.value)}
                  placeholder="e.g. HVAC, PEX, Lennox, VedaVoice"
                  className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Spoken Phonetic Replacement <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newPhoneticSpoken}
                  onChange={(e) => setNewPhoneticSpoken(e.target.value)}
                  placeholder="e.g. H-V-A-C, Pecks, LEN-ucks, VAY-duh Voice"
                  className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Domain Context / Notes
                </label>
                <input
                  type="text"
                  value={newPhoneticNote}
                  onChange={(e) => setNewPhoneticNote(e.target.value)}
                  placeholder="e.g. Spell out acronym letters individually"
                  className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddPhoneticModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPhonetics || !newPhoneticTerm.trim() || !newPhoneticSpoken.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {savingPhonetics ? "Saving & Syncing..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Direct FAQ */}
      {showAddFaqModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-zinc-900">Add Direct Business FAQ</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddFaqModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFaq} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Inquiry Question <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="e.g. What is your warranty policy on parts and labor?"
                  className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Receptionist Answer <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={newAnswer}
                  onChange={(e) => setNewAnswer(e.target.value)}
                  placeholder="e.g. We provide a full 1-year warranty on all replacement parts and 90 days on labor for residential repairs."
                  className="w-full text-xs rounded-xl border border-zinc-300 p-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-xs rounded-xl border border-zinc-300 px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="General">General</option>
                    <option value="Pricing & Quotes">Pricing &amp; Quotes</option>
                    <option value="Hours & Location">Hours &amp; Location</option>
                    <option value="Warranty & Policies">Warranty &amp; Policies</option>
                    <option value="Emergency Service">Emergency Service</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Alternate Phrasings (1 per line)
                  </label>
                  <textarea
                    rows={2}
                    value={newAlternatePhrasings}
                    onChange={(e) => setNewAlternatePhrasings(e.target.value)}
                    placeholder="guarantee terms&#10;repair warranty"
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddFaqModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFaq || !newQuestion.trim() || !newAnswer.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {submittingFaq ? "Vectorizing & Saving..." : "Save & Index FAQ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chunk Inspection Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-zinc-200 shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Chunk Inspector: {selectedDoc.filename}
                </h3>
                <div className="text-xs text-zinc-500 font-mono">
                  {selectedDoc.chunk_count} sentence-bounded chunks
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {loadingChunks ? (
                <div className="p-8 text-center text-zinc-400 font-mono">Loading chunks...</div>
              ) : (
                docChunks.map((chunk) => (
                  <div key={chunk.id} className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span className="font-bold text-indigo-600">Chunk #{chunk.chunk_index}</span>
                      <span>~{chunk.token_count} tokens</span>
                    </div>
                    <p className="text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed font-sans">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
