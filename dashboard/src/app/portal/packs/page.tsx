"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCw,
  Sparkles,
  Sliders,
  FileCode,
  ShieldCheck,
  Clock,
  ClipboardList,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Plus,
  X,
  Radio,
  Cpu,
  Flame,
  PhoneCall,
  Terminal,
  FileText,
  UploadCloud,
  Search,
  Trash2,
  Eye,
  BookOpen,
  HelpCircle,
  Layers,
} from "lucide-react";
import {
  api,
  IndustryPackSummary,
  IndustryPackDetail,
  KnowledgeDocument,
  FAQItem,
  RAGQueryResponse,
} from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  is_emergency?: boolean;
  timestamp: string;
  cited_source?: string;
  cited_snippet?: string;
  cited_score?: number;
}

interface SandboxHudState {
  detectedEmergency: boolean;
  emergencyTrigger?: string;
  safetyAdvice?: string;
  escalatedTo?: string;
  extractedIntake: Record<string, any>;
  turnCount: number;
  citedSource?: string;
  citedScore?: number;
  citedSnippet?: string;
}

export default function IndustryPacksPage() {
  const [activeTab, setActiveTab] = useState<
    "catalog" | "studio" | "grounding" | "sandbox" | "test"
  >("catalog");
  const [packs, setPacks] = useState<IndustryPackSummary[]>([]);
  const [selectedPackSlug, setSelectedPackSlug] = useState<string>("home_services");
  const [packDetail, setPackDetail] = useState<IndustryPackDetail | null>(null);
  const [currentApplied, setCurrentApplied] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [savingOverrides, setSavingOverrides] = useState<boolean>(false);
  const [runningTests, setRunningTests] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Customization Studio state
  const [studioVars, setStudioVars] = useState<Record<string, string>>({});
  const [studioEmergencyKeywords, setStudioEmergencyKeywords] = useState<string[]>([]);
  const [newKeywordInput, setNewKeywordInput] = useState<string>("");
  const [studioSafetyScript, setStudioSafetyScript] = useState<string>("");
  const [studioCompiledPrompt, setStudioCompiledPrompt] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewStats, setPreviewStats] = useState<{
    substitutionsCount: number;
    triggersCount: number;
    intakeActive: boolean;
    fieldsCount: number;
  }>({ substitutionsCount: 0, triggersCount: 0, intakeActive: false, fieldsCount: 0 });

  // Sandbox state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [isSendingTurn, setIsSendingTurn] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [speechSynthesisEnabled, setSpeechSynthesisEnabled] = useState<boolean>(true);
  const [hudState, setHudState] = useState<SandboxHudState>({
    detectedEmergency: false,
    extractedIntake: {},
    turnCount: 0,
  });

  // Knowledge Grounding state (Grounded in business info, Milestone M10a)
  const [kbDocs, setKbDocs] = useState<KnowledgeDocument[]>([]);
  const [kbFaqs, setKbFaqs] = useState<FAQItem[]>([]);
  const [kbLoading, setKbLoading] = useState<boolean>(false);
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [newFaqQuestion, setNewFaqQuestion] = useState<string>("");
  const [newFaqAnswer, setNewFaqAnswer] = useState<string>("");
  const [newFaqCategory, setNewFaqCategory] = useState<string>("Pricing & Fees");
  const [newFaqAlts, setNewFaqAlts] = useState<string>("");
  const [ragQuery, setRagQuery] = useState<string>("");
  const [ragResult, setRagResult] = useState<RAGQueryResponse | null>(null);
  const [ragSearching, setRagSearching] = useState<boolean>(false);
  const [inspectingDoc, setInspectingDoc] = useState<{
    document: KnowledgeDocument;
    chunks: Array<{ id: string; chunk_index: number; content: string; token_count: number }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  const loadGroundingData = async () => {
    try {
      setKbLoading(true);
      const [docs, faqs] = await Promise.all([
        api.listKnowledgeDocuments().catch(() => []),
        api.listDirectFAQs().catch(() => []),
      ]);
      setKbDocs(docs || []);
      setKbFaqs(faqs || []);
    } catch (err: any) {
      console.error("Failed to load grounding data", err);
    } finally {
      setKbLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingDoc(true);
      await api.uploadKnowledgeDocument(file);
      setMessage({ type: "success", text: `Successfully indexed and grounded "${file.name}".` });
      await loadGroundingData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to upload document" });
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDoc = async (docId: string, filename: string) => {
    try {
      await api.deleteKnowledgeDocument(docId);
      setMessage({ type: "success", text: `Removed "${filename}".` });
      await loadGroundingData();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete document" });
    }
  };

  const handleInspectDoc = async (docId: string) => {
    try {
      const details = await api.getKnowledgeDocument(docId);
      setInspectingDoc(details);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to retrieve document chunks" });
    }
  };

  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) return;
    try {
      const alts = newFaqAlts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.createDirectFAQ({
        question: newFaqQuestion.trim(),
        answer: newFaqAnswer.trim(),
        category: newFaqCategory.trim() || "Pricing & Fees",
        alternate_phrasings: alts,
      });
      setNewFaqQuestion("");
      setNewFaqAnswer("");
      setNewFaqAlts("");
      setMessage({ type: "success", text: "Added verified FAQ. Synchronized into RAG vector index." });
      await loadGroundingData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to add FAQ" });
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    try {
      await api.deleteDirectFAQ(faqId);
      setMessage({ type: "success", text: "Deleted verified FAQ from knowledge base." });
      await loadGroundingData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete FAQ" });
    }
  };

  const handleTestRag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    try {
      setRagSearching(true);
      const res = await api.testRAGQuery(ragQuery.trim(), 3, 0.30);
      setRagResult(res);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Search failed" });
    } finally {
      setRagSearching(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const packsList = await api.listIndustryPacks();
      let applied: Record<string, any> = {};
      try {
        applied = await api.getCurrentAppliedPack();
      } catch {
        applied = {};
      }

      const activeSlug = applied?.pack_slug || applied?.applied_pack?.slug;

      const normalizedPacks: IndustryPackSummary[] = (packsList || []).map((p) => ({
        ...p,
        is_applied: p.slug === activeSlug,
      }));

      setPacks(normalizedPacks);
      setCurrentApplied(applied);

      const targetSlug = activeSlug || normalizedPacks[0]?.slug || "home_services";
      setSelectedPackSlug(targetSlug);

      const detail = await api.getIndustryPackDetails(targetSlug);
      setPackDetail({
        ...detail,
        is_applied: detail.slug === activeSlug,
      });

      // Hydrate Studio State
      hydrateStudio(detail, applied?.overrides);

      // Hydrate Grounding Knowledge Base
      loadGroundingData();
    } catch (err: any) {
      console.error("Failed to load industry packs", err);
      setMessage({ type: "error", text: err.message || "Failed to load industry packs" });
    } finally {
      setLoading(false);
    }
  };

  const hydrateStudio = (detail: IndustryPackDetail, overrides?: Record<string, any>) => {
    // 1. Prompt Variables
    const defaultVars: Record<string, string> = {};
    if (detail.prompt_vars_schema) {
      for (const [k, v] of Object.entries(detail.prompt_vars_schema)) {
        defaultVars[k] = (v as any)?.default || "";
      }
    }
    const mergedVars = { ...defaultVars, ...(overrides?.vars || {}) };
    setStudioVars(mergedVars);

    // 2. Emergency Keywords
    const defaultKeywords = detail.emergency_rules?.keywords || detail.emergency_protocol?.triggers || [];
    const mergedKeywords = Array.from(
      new Set([...defaultKeywords, ...(overrides?.emergency_keywords || [])])
    );
    setStudioEmergencyKeywords(mergedKeywords);

    // 3. Safety Script
    const safetyScript =
      overrides?.custom_safety_script ||
      detail.emergency_rules?.safety_advice ||
      detail.emergency_protocol?.script ||
      "";
    setStudioSafetyScript(safetyScript);

    // Initial recompile preview
    triggerPromptPreview(detail.slug, mergedVars, mergedKeywords, safetyScript);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isSendingTurn]);

  const triggerPromptPreview = async (
    slug: string,
    vars: Record<string, string>,
    keywords: string[],
    safetyScript: string
  ) => {
    try {
      setPreviewLoading(true);
      const res = await api.previewPackPrompt({
        pack_slug: slug,
        vars,
        emergency_keywords: keywords,
        custom_safety_script: safetyScript,
      });
      setStudioCompiledPrompt(res.compiled_prompt);
      setPreviewStats({
        substitutionsCount: Object.keys(res.substitutions || {}).length,
        triggersCount: res.emergency_triggers?.length || 0,
        intakeActive: res.intake_tree_active,
        fieldsCount: res.fields_count,
      });
    } catch (err) {
      console.warn("Failed to preview prompt", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSelectPack = async (slug: string) => {
    setSelectedPackSlug(slug);
    try {
      const detail = await api.getIndustryPackDetails(slug);
      const activeSlug = currentApplied?.pack_slug || currentApplied?.applied_pack?.slug;
      setPackDetail({
        ...detail,
        is_applied: detail.slug === activeSlug,
      });
      hydrateStudio(detail, currentApplied?.overrides);
      resetSandboxSession(slug);
    } catch (err: any) {
      console.error("Failed to fetch pack detail", err);
    }
  };

  const handleApplyPack = async (slug: string) => {
    try {
      setApplying(true);
      setMessage(null);
      await api.applyIndustryPack({ pack_slug: slug });
      setMessage({
        type: "success",
        text: `Successfully applied ${slug.replace(/_/g, " ")} industry pack to your voice agent!`,
      });
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to apply industry pack" });
    } finally {
      setApplying(false);
    }
  };

  const handleSaveStudioOverrides = async () => {
    try {
      setSavingOverrides(true);
      setMessage(null);

      await api.updatePackOverrides({
        vars: studioVars,
        emergency_keywords: studioEmergencyKeywords,
        custom_safety_script: studioSafetyScript,
      });

      setMessage({ type: "success", text: "Studio customizations compiled and saved to voice agent!" });
      await loadData();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save studio customizations" });
    } finally {
      setSavingOverrides(false);
    }
  };

  const handleAddKeyword = () => {
    const trimmed = newKeywordInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!studioEmergencyKeywords.includes(trimmed)) {
      const updated = [...studioEmergencyKeywords, trimmed];
      setStudioEmergencyKeywords(updated);
      setNewKeywordInput("");
      triggerPromptPreview(selectedPackSlug, studioVars, updated, studioSafetyScript);
    }
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    const updated = studioEmergencyKeywords.filter((k) => k !== keywordToRemove);
    setStudioEmergencyKeywords(updated);
    triggerPromptPreview(selectedPackSlug, studioVars, updated, studioSafetyScript);
  };

  const handleVarChange = (key: string, value: string) => {
    const updated = { ...studioVars, [key]: value };
    setStudioVars(updated);
    triggerPromptPreview(selectedPackSlug, updated, studioEmergencyKeywords, studioSafetyScript);
  };

  // Sandbox Speech & Interaction
  const speakText = (text: string) => {
    if (!speechSynthesisEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessage({ type: "error", text: "Speech recognition is not supported in this browser. Please use Chrome or Edge." });
      return;
    }

    if (isListening) {
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setUserInput(transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Speech recognition failed to start", err);
      setIsListening(false);
    }
  };

  const handleSendTurn = async (forcedText?: string) => {
    const textToSend = (forcedText || userInput).trim();
    if (!textToSend || isSendingTurn) return;

    const userMessage: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatHistory((prev) => [...prev, userMessage]);
    setUserInput("");
    setIsSendingTurn(true);

    try {
      const historyPayload = chatHistory.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await api.simulateSandboxTurn({
        pack_slug: selectedPackSlug,
        message: textToSend,
        history: historyPayload,
        vars: studioVars,
        emergency_keywords: studioEmergencyKeywords,
        custom_safety_script: studioSafetyScript,
      });

      const assistantMessage: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: "assistant",
        text: res.reply,
        is_emergency: res.detected_emergency,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        cited_source: res.cited_source,
        cited_snippet: res.cited_snippet,
        cited_score: res.cited_score,
      };

      setChatHistory((prev) => [...prev, assistantMessage]);

      setHudState((prev) => ({
        detectedEmergency: res.detected_emergency || prev.detectedEmergency,
        emergencyTrigger: res.emergency_trigger || prev.emergencyTrigger,
        safetyAdvice: res.safety_advice || prev.safetyAdvice,
        escalatedTo: res.escalated_to || prev.escalatedTo,
        extractedIntake: { ...prev.extractedIntake, ...(res.extracted_intake || {}) },
        turnCount: res.turn_count,
        citedSource: res.cited_source || prev.citedSource,
        citedSnippet: res.cited_snippet || prev.citedSnippet,
        citedScore: res.cited_score || prev.citedScore,
      }));

      // Speak assistant reply
      speakText(res.reply);
    } catch (err: any) {
      console.error("Failed sandbox turn", err);
      const errMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: "assistant",
        text: "Error executing turn: " + (err.message || "Failed to reach simulation agent."),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatHistory((prev) => [...prev, errMsg]);
    } finally {
      setIsSendingTurn(false);
    }
  };

  const resetSandboxSession = (slug?: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const currentSlug = slug || selectedPackSlug;
    const biz = studioVars["business_name"] || studioVars["practice_name"] || "our company";
    setChatHistory([
      {
        id: `msg_init_${Date.now()}`,
        role: "assistant",
        text: `Thanks for calling ${biz}! How can I help you today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setHudState({
      detectedEmergency: false,
      extractedIntake: {},
      turnCount: 0,
    });
  };

  useEffect(() => {
    resetSandboxSession();
  }, [selectedPackSlug]);

  const handleRunTests = async () => {
    try {
      setRunningTests(true);
      setMessage(null);
      const res = await api.runPackTestScenarios();
      setTestResult(res);
      setMessage({
        type: "success",
        text: `Evaluated ${res.total_scenarios} scenarios. Score: ${res.score_pct}% (${res.passed_scenarios}/${res.total_scenarios} passed)`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to run test scenarios" });
    } finally {
      setRunningTests(false);
    }
  };

  const currentPackName = currentApplied?.pack_name || currentApplied?.applied_pack?.name || currentApplied?.pack_slug;
  const currentPackVersion = currentApplied?.version_semver || currentApplied?.applied_pack?.active_version || "1.0.0";

  // Scenario pills tailored to current industry pack
  const getScenarioPills = () => {
    if (selectedPackSlug === "home_services") {
      return [
        { label: "🚨 Burst Pipe Emergency", text: "Help! There is a burst pipe in my basement and water is pouring everywhere!" },
        { label: "🚨 Gas Odor Emergency", text: "I smell strong natural gas near the water heater." },
        { label: "📅 Schedule Plumbing Service", text: "I need to schedule a residential plumbing inspection for tomorrow morning." },
        { label: "💰 Diagnostic Fee Query", text: "How much is your diagnostic dispatch fee for coming out?" },
      ];
    } else if (selectedPackSlug === "dental_clinic") {
      return [
        { label: "🚨 Severe Abscess Emergency", text: "I have severe unbearable toothache and swelling under my jaw!" },
        { label: "📅 Schedule Routine Cleaning", text: "I'd like to book a routine dental cleaning and checkup this Friday." },
        { label: "💰 Consultation Pricing", text: "What are your fees for new patient examinations?" },
      ];
    } else if (selectedPackSlug === "legal_intake") {
      return [
        { label: "🚨 Urgent Arrest / Bail", text: "My family member was arrested an hour ago and is being held in custody." },
        { label: "⚖️ Personal Injury Claim", text: "I was injured in a car collision and need to consult with an attorney." },
        { label: "📅 Book Legal Consultation", text: "Can I book a 30-minute consultation regarding an employment contract dispute?" },
      ];
    }
    return [
      { label: "🚨 Urgent Life Safety Alert", text: "We have an urgent emergency and need immediate technician assistance!" },
      { label: "📅 Appointment Scheduling", text: "I would like to schedule an appointment for tomorrow afternoon." },
      { label: "💰 Service Rates Query", text: "Could you tell me your standard rates and business hours?" },
    ];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-hairline)] pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Briefcase className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Industry Packs Engine</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              FR-PACK-1..7
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Operational blueprints, interactive studio prompt synthesizers, live voice sandbox, and automated QA suites.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentPackName && (
            <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-1.5 text-xs text-indigo-900">
              <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              <span>Active Pack:</span>
              <strong className="font-semibold capitalize">
                {currentPackName} ({currentPackVersion})
              </strong>
            </div>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 font-bold text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-[var(--border-hairline)] gap-x-6 gap-y-2 text-sm font-medium">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "catalog"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Blueprint Catalog
        </button>
        <button
          onClick={() => setActiveTab("studio")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "studio"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Customization Studio
        </button>
        <button
          onClick={() => setActiveTab("grounding")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "grounding"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Knowledge Grounding Studio
          {kbDocs.length > 0 && (
            <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-mono font-semibold">
              {kbDocs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("sandbox")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "sandbox"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Radio className="h-4 w-4" />
          Live Voice & Text Sandbox
        </button>
        <button
          onClick={() => setActiveTab("test")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "test"
              ? "border-indigo-600 text-indigo-600 font-semibold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Play className="h-4 w-4" />
          10-Scenario QA Test Runner
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === "catalog" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Pack Cards List */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Available Industry Blueprints
            </h3>
            {packs.map((p) => {
              const isSelected = selectedPackSlug === p.slug;
              const outboundCats = p.allowed_outbound_categories || p.permitted_outbound_categories || [];
              const packVersion = p.latest_version || p.active_version || "1.0.0";
              const packCategory = p.category ? p.category.replace(/_/g, " ") : "General";

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPack(p.slug)}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/30 ring-1 ring-indigo-500 shadow-sm"
                      : "border-[var(--border-hairline)] bg-[var(--surface-panel)] hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{p.icon || "📦"}</span>
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">{p.name}</h4>
                        <span className="text-[11px] font-mono text-zinc-500 capitalize">
                          {p.badge || packCategory} • v{packVersion}
                        </span>
                      </div>
                    </div>
                    {p.is_applied && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 line-clamp-2">{p.description}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-100">
                    {p.validation_status === "incomplete" && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        <AlertTriangle className="h-3 w-3 text-amber-600" />
                        Draft / Fallback Mode
                      </span>
                    )}
                    {p.requires_hipaa_baa && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                        <ShieldCheck className="h-3 w-3" />
                        Requires HIPAA BAA
                      </span>
                    )}
                    {outboundCats.length > 0 && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                        Permitted Outbound: {outboundCats.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Pack Details Preview */}
          <div className="lg:col-span-7">
            {packDetail ? (
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-zinc-100 pb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-2xl">{packDetail.icon || "📦"}</span>
                      <h3 className="text-lg font-bold text-zinc-900">{packDetail.name}</h3>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-600">
                        v{packDetail.version_semver || packDetail.latest_version || packDetail.active_version || "1.0.0"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{packDetail.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => setActiveTab("studio")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      Open Studio
                    </button>
                    <button
                      onClick={() => handleApplyPack(packDetail.slug)}
                      disabled={applying || packDetail.is_applied}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition ${
                        packDetail.is_applied
                          ? "bg-zinc-400 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-700 shadow-sm"
                      }`}
                    >
                      {applying ? "Applying Blueprint..." : packDetail.is_applied ? "Already Active" : "Apply Blueprint"}
                    </button>
                  </div>
                </div>

                {packDetail.validation_status === "incomplete" && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Incomplete / Draft Industry Pack:</strong>
                      <p className="mt-0.5 text-[11px] text-amber-800 leading-relaxed">
                        This blueprint is currently in draft mode. When activated, the AI voice agent automatically applies safe commercial baseline fallbacks for any missing prompts or emergency triggers, guaranteeing complete operational safety during calls.
                      </p>
                    </div>
                  </div>
                )}

                {/* Appointment Types */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Pre-Configured Appointment Types ({packDetail.appointment_types?.length || 0})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {packDetail.appointment_types?.map((apt: any) => (
                      <div key={apt.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 text-xs">
                        <div className="flex items-center justify-between font-semibold text-zinc-800">
                          <span>{apt.title || apt.name}</span>
                          <span className="font-mono text-zinc-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {apt.duration_minutes || apt.duration_min || 45}m
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500 line-clamp-1">{apt.description || apt.fee || "Standard Booking"}</p>
                        {apt.deposit_required && (
                          <span className="mt-1 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-700">
                            Deposit Required
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dynamic Intake Questionnaire Tree */}
                {((packDetail.intake_schema?.fields && packDetail.intake_schema.fields.length > 0) ||
                  (packDetail.intake_questions && packDetail.intake_questions.length > 0)) && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
                      {packDetail.intake_schema?.title || "Dynamic Trade Intake Questionnaire Tree"}
                    </h4>
                    <p className="text-[11px] text-zinc-500 mb-2.5">
                      The voice receptionist automatically conducts this conversational triage during calls and extracts structured answers directly into CRM contact timelines.
                    </p>
                    <div className="space-y-2">
                      {packDetail.intake_schema?.fields?.map((fld: any) => (
                        <div
                          key={fld.key}
                          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-3 text-xs shadow-2xs hover:border-indigo-200 transition"
                        >
                          <div className="flex items-center justify-between font-medium text-zinc-800 mb-1">
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-900">{fld.label}</span>
                              <code className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-mono">
                                {fld.key}
                              </code>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-mono text-indigo-700 uppercase font-medium">
                                {fld.type || "text"}
                              </span>
                              {fld.required ? (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                  Required
                                </span>
                              ) : (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
                                  Optional
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-600 italic mb-1.5">
                            &ldquo;{fld.prompt || fld.label}&rdquo;
                          </p>
                          {fld.options && fld.options.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 pt-1.5 border-t border-zinc-100">
                              <span className="text-[10px] text-zinc-400 mr-1 self-center">Options:</span>
                              {fld.options.map((opt: string, oIdx: number) => (
                                <span
                                  key={oIdx}
                                  className="rounded bg-zinc-50 border border-[var(--border-hairline)] px-1.5 py-0.2 text-[10px] text-zinc-600 font-mono"
                                >
                                  {opt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emergency Protocol */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>Emergency Safety Protocol & Triggers</span>
                  </div>
                  <p className="text-zinc-600 text-[11px] mb-2">
                    Action: <strong>{packDetail.emergency_rules?.escalation_mode || packDetail.emergency_protocol?.immediate_action || "Immediate Dispatch Escalation"}</strong>
                  </p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(packDetail.emergency_rules?.keywords || packDetail.emergency_protocol?.triggers || []).map((t: string, idx: number) => (
                      <span key={idx} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-mono text-amber-800">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="font-mono text-[10px] text-amber-900 bg-amber-100/60 p-2 rounded border border-amber-200">
                    &ldquo;{packDetail.emergency_rules?.safety_advice || packDetail.emergency_protocol?.script || "If experiencing severe emergencies, please evacuate and call 911 immediately."}&rdquo;
                  </p>
                </div>

                {/* System Prompt Template Excerpt */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5" />
                    Specialized Agent System Prompt
                  </h4>
                  <pre className="max-h-48 overflow-y-auto rounded-lg bg-indigo-600 p-3 font-mono text-[11px] text-zinc-200 whitespace-pre-wrap">
                    {packDetail.prompt_base || packDetail.system_prompt_template || "Blueprint prompt not configured."}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400">
                Select an industry pack to view its blueprint details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Customization Studio */}
      {activeTab === "studio" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Form Controls */}
          <div className="lg:col-span-6 space-y-5">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Customization Studio Controls</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Fine-tune variables, life safety rules, and emergency routing for {packDetail?.name || selectedPackSlug}.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("sandbox")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <Radio className="h-3.5 w-3.5" />
                  Test in Sandbox
                </button>
              </div>

              {/* Dynamic Variables from Schema */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2.5 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-indigo-600" />
                  Prompt Variable Substitutions
                </h4>
                <div className="space-y-3">
                  {packDetail?.prompt_vars_schema && Object.keys(packDetail.prompt_vars_schema).length > 0 ? (
                    Object.entries(packDetail.prompt_vars_schema).map(([key, schema]: [string, any]) => (
                      <div key={key}>
                        <label className="block text-xs font-medium text-zinc-700 mb-1">
                          {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          <code className="ml-1.5 text-[10px] font-mono text-zinc-400">({`{${key}}`})</code>
                        </label>
                        <input
                          type="text"
                          value={studioVars[key] || ""}
                          onChange={(e) => handleVarChange(key, e.target.value)}
                          placeholder={schema.default || `Enter ${key}`}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-zinc-400 italic">No variables required for this blueprint.</div>
                  )}
                </div>
              </div>

              {/* Emergency Triggers Tags Manager */}
              <div className="border-t border-zinc-100 pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1 flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                  Emergency Detection Keywords
                </h4>
                <p className="text-[11px] text-zinc-400 mb-2">
                  Keywords that instantly flag life safety emergencies, whisper briefing alerts, and trigger warm transfers.
                </p>

                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {studioEmergencyKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-medium text-amber-900"
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className="text-amber-600 hover:text-amber-800 focus:outline-none"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeywordInput}
                    onChange={(e) => setNewKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddKeyword();
                      }
                    }}
                    placeholder="Add trigger keyword (e.g. electrical fire, severe collapse)..."
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddKeyword}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 transition"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
              </div>

              {/* Safety Guidance Script */}
              <div className="border-t border-zinc-100 pt-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-1">
                  Agent Life Safety Guidance Script
                </label>
                <p className="text-[11px] text-zinc-400 mb-2">
                  What the voice receptionist must calmly speak to the caller while immediately bridging the technician.
                </p>
                <textarea
                  rows={3}
                  value={studioSafetyScript}
                  onChange={(e) => {
                    setStudioSafetyScript(e.target.value);
                    triggerPromptPreview(selectedPackSlug, studioVars, studioEmergencyKeywords, e.target.value);
                  }}
                  placeholder="e.g. Please step outside into a well-ventilated area away from the premises immediately. I am escalating directly to our emergency dispatch team right now."
                  className="w-full rounded-lg border border-zinc-300 p-2.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="border-t border-zinc-100 pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    triggerPromptPreview(
                      selectedPackSlug,
                      studioVars,
                      studioEmergencyKeywords,
                      studioSafetyScript
                    )
                  }
                  disabled={previewLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
                >
                  <RotateCw className={`h-3 w-3 ${previewLoading ? "animate-spin" : ""}`} />
                  Recompile Preview
                </button>

                <button
                  type="button"
                  onClick={handleSaveStudioOverrides}
                  disabled={savingOverrides}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition shadow-sm"
                >
                  {savingOverrides ? "Saving Changes..." : "Save & Apply to Voice Agent"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Prompt Preview */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-zinc-900">Live Compiled Prompt Preview</h3>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">
                    {previewStats.substitutionsCount} vars
                  </span>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                    {previewStats.triggersCount} triggers
                  </span>
                  {previewStats.intakeActive && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      {previewStats.fieldsCount} triage fields
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                This shows the exact compiled system prompt that your LiveKit voice agent loads for incoming calls, incorporating all variable substitutions, life safety rules, and intake triage trees.
              </p>

              <div className="relative">
                <pre className="max-h-[540px] overflow-y-auto rounded-lg bg-zinc-950 p-4 font-mono text-[11px] text-zinc-200 leading-relaxed whitespace-pre-wrap selection:bg-indigo-800">
                  {studioCompiledPrompt || "Loading compiled prompt..."}
                </pre>
                {previewLoading && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center rounded-lg text-white text-xs font-mono">
                    Compiling preview...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Knowledge Grounding Studio */}
      {activeTab === "grounding" && (
        <div className="space-y-6">
          {/* Header Policy Banner */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-emerald-50/50 p-5 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 mb-2">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Grounded in Your Business Info
                </span>
                <h3 className="text-base font-bold text-zinc-900">
                  Client Knowledge Grounding Studio
                </h3>
                <p className="mt-1 text-xs text-zinc-600 max-w-2xl leading-relaxed">
                  Upload verified price sheets, warranties, and business policies. VedaVoice retrieves relevant excerpts at call time so answers and quoted prices come strictly from your approved documents.
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <span className="text-xs font-mono font-medium text-zinc-500">
                  Retrieval Latency Target: &lt;50ms
                </span>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Hybrid BM25 + Dense Semantic Chunks
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]/80 p-3 shadow-2xs">
                <div className="font-semibold text-zinc-800 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Strict Document Grounding
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Quoted prices come only from approved documents. If no match exists, the agent states it will have someone follow up.
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]/80 p-3 shadow-2xs">
                <div className="font-semibold text-zinc-800 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                  Prompt Injection Defense
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Uploaded documents pass through sanitizer rules to strip adversarial tokens and prevent system instruction override.
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]/80 p-3 shadow-2xs">
                <div className="font-semibold text-zinc-800 flex items-center gap-1.5 mb-1">
                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                  Life Safety Directive
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  VedaVoice never gives DIY gas, electrical, or plumbing repair advice. Callers are directed to public utilities / 911.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (7 cols): Document Upload & Verified FAQs */}
            <div className="lg:col-span-7 space-y-6">
              {/* Section 1: Approved Business Documents */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      Approved Business Documents &amp; Price Sheets
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      PDF, Word (.docx), CSV, Markdown, or plain text (max 10MB each).
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.csv,.md,.markdown"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDoc}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50 shadow-2xs"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    {uploadingDoc ? "Indexing..." : "Upload Document"}
                  </button>
                </div>

                {kbLoading ? (
                  <div className="py-8 text-center text-xs text-zinc-400">Loading grounded documents...</div>
                ) : kbDocs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center">
                    <BookOpen className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-zinc-700">No documents uploaded yet</p>
                    <p className="text-[11px] text-zinc-400 mt-1 max-w-sm mx-auto">
                      Upload your standard service menu, price sheet, or warranty guidelines so your voice agent can answer customer inquiries accurately.
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Upload First Price Sheet
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 border border-[var(--border-hairline)] rounded-lg overflow-hidden">
                    {kbDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-[var(--surface-panel)] hover:bg-zinc-50/60 transition">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2 rounded bg-zinc-100 text-zinc-600 shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-zinc-900 truncate">
                                {doc.filename}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                {doc.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5 font-mono">
                              <span>{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
                              <span>•</span>
                              <span>{doc.chunk_count} chunks</span>
                              <span>•</span>
                              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          <button
                            onClick={() => handleInspectDoc(doc.id)}
                            title="Inspect sentence chunks"
                            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                            title="Delete document"
                            className="p-1.5 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Verified Direct FAQs & Policies */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-4">
                <div className="border-b border-zinc-100 pb-3">
                  <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-emerald-600" />
                    Verified Direct FAQs &amp; Policies
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Direct Q&amp;A pairs immediately synchronize into vector chunks for sub-50ms voice retrieval.
                  </p>
                </div>

                {/* Add FAQ Form */}
                <form onSubmit={handleAddFaq} className="space-y-3 bg-zinc-50/70 p-3.5 rounded-lg border border-[var(--border-hairline)] text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-2 space-y-1">
                      <label className="font-semibold text-zinc-700">Question / Customer Inquiry</label>
                      <input
                        type="text"
                        value={newFaqQuestion}
                        onChange={(e) => setNewFaqQuestion(e.target.value)}
                        placeholder="e.g. What is your diagnostic dispatch fee?"
                        required
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none bg-[var(--surface-panel)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-zinc-700">Category</label>
                      <select
                        value={newFaqCategory}
                        onChange={(e) => setNewFaqCategory(e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none bg-[var(--surface-panel)]"
                      >
                        <option value="Pricing & Fees">Pricing &amp; Fees</option>
                        <option value="Emergency Protocol">Emergency Protocol</option>
                        <option value="Warranties & Guarantees">Warranties &amp; Guarantees</option>
                        <option value="Hours & Service Area">Hours &amp; Service Area</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-700">Verified Answer</label>
                    <textarea
                      rows={2}
                      value={newFaqAnswer}
                      onChange={(e) => setNewFaqAnswer(e.target.value)}
                      placeholder="e.g. Our standard diagnostic dispatch fee is $89 during regular business hours, which is credited toward any completed repair."
                      required
                      className="w-full rounded-md border border-zinc-300 p-2.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none bg-[var(--surface-panel)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-zinc-700">Alternate Phrasings (Comma-separated)</label>
                    <input
                      type="text"
                      value={newFaqAlts}
                      onChange={(e) => setNewFaqAlts(e.target.value)}
                      placeholder="e.g. service call rate, diagnostic charge, how much to come look"
                      className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none bg-[var(--surface-panel)]"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Save &amp; Sync FAQ
                    </button>
                  </div>
                </form>

                {/* FAQ List */}
                {kbFaqs.length > 0 && (
                  <div className="divide-y divide-zinc-100 border border-[var(--border-hairline)] rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                    {kbFaqs.map((faq, idx) => (
                      <div key={faq.id || idx} className="p-3 bg-[var(--surface-panel)] hover:bg-zinc-50/50 transition flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900">Q: {faq.question}</span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] font-medium text-zinc-600">
                              {faq.category || "General"}
                            </span>
                          </div>
                          <p className="text-zinc-600 leading-relaxed text-[11px]">A: {faq.answer}</p>
                          {faq.alternate_phrasings && faq.alternate_phrasings.length > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                              <span>Synonyms:</span>
                              <span>{faq.alternate_phrasings.join(", ")}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteFaq(faq.id || faq.question)}
                          className="p-1.5 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                          title="Delete FAQ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (5 cols): Sub-50ms RAG Query & Simulator */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-4">
                <div className="border-b border-zinc-100 pb-3">
                  <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                    <Search className="h-4 w-4 text-indigo-600" />
                    Sub-50ms Grounding Simulator
                  </h4>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Test live queries against your indexed business info to verify citation accuracy before real callers connect.
                  </p>
                </div>

                <form onSubmit={handleTestRag} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ragQuery}
                      onChange={(e) => setRagQuery(e.target.value)}
                      placeholder="e.g. How much is your diagnostic fee?"
                      required
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={ragSearching}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50 shrink-0 shadow-2xs"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {ragSearching ? "Searching..." : "Test Query"}
                    </button>
                  </div>
                </form>

                {ragResult && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-700">Retrieval Outcome:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {ragResult.latency_ms} ms
                        </span>
                        {ragResult.out_of_scope ? (
                          <span className="rounded bg-amber-100 text-amber-900 px-2 py-0.5 font-semibold text-[11px]">
                            Out of Scope / Follow-Up Required
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 text-emerald-900 px-2 py-0.5 font-semibold text-[11px]">
                            Grounded ({Math.round(ragResult.confidence_score * 100)}% Match)
                          </span>
                        )}
                      </div>
                    </div>

                    {ragResult.top_matches && ragResult.top_matches.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase text-zinc-500 tracking-wider">
                          Top Cited Documents:
                        </span>
                        {ragResult.top_matches.map((m, idx) => (
                          <div key={idx} className="rounded-lg border border-[var(--border-hairline)] bg-zinc-50/80 p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between font-mono text-[11px]">
                              <span className="font-bold text-zinc-800">{m.filename}</span>
                              <span className="text-emerald-700 font-semibold">{Math.round(m.score * 100)}%</span>
                            </div>
                            <p className="text-zinc-700 font-serif italic text-[11px] leading-relaxed">
                              &quot;{m.content}&quot;
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1 pt-1">
                      <span className="text-[11px] font-semibold uppercase text-zinc-500 tracking-wider">
                        Agent Grounding Prompt Directive:
                      </span>
                      <pre className="rounded-lg bg-zinc-900 p-3 text-[10px] font-mono text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                        {ragResult.grounding_prompt}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Inspect Document Modal */}
          {inspectingDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl rounded-xl bg-[var(--surface-panel)] shadow-2xl border border-[var(--border-hairline)] overflow-hidden max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900">{inspectingDoc.document.filename}</h4>
                    <p className="text-xs text-zinc-500 font-mono">
                      {inspectingDoc.chunks.length} sentence-aware chunks • {(inspectingDoc.document.file_size_bytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => setInspectingDoc(null)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
                  {inspectingDoc.chunks.map((chk) => (
                    <div key={chk.id} className="rounded-lg border border-[var(--border-hairline)] bg-zinc-50/50 p-3 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
                        <span>Chunk #{chk.chunk_index}</span>
                        <span>{chk.token_count} tokens</span>
                      </div>
                      <p className="text-zinc-800 leading-relaxed font-serif text-[11px]">
                        {chk.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Live Voice & Text Sandbox */}
      {activeTab === "sandbox" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Chat Area */}
          <div className="lg:col-span-7 flex flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] shadow-sm overflow-hidden h-[640px]">
            {/* Sandbox Header */}
            <div className="border-b border-[var(--border-hairline)] bg-zinc-50/70 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-zinc-800">
                  Interactive Voice Sandbox • {packDetail?.name || selectedPackSlug}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpeechSynthesisEnabled(!speechSynthesisEnabled)}
                  title={speechSynthesisEnabled ? "Audio speech is ON" : "Audio speech is MUTED"}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border transition ${
                    speechSynthesisEnabled
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-[var(--border-hairline)] bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {speechSynthesisEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {speechSynthesisEnabled ? "Speech On" : "Muted"}
                </button>

                <button
                  onClick={() => resetSandboxSession()}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition"
                >
                  <RotateCw className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </div>

            {/* Quick Scenario Pills */}
            <div className="border-b border-zinc-100 bg-zinc-50/40 p-2.5 overflow-x-auto flex gap-1.5 scrollbar-thin">
              <span className="text-[10px] uppercase font-semibold text-zinc-400 self-center mr-1 whitespace-nowrap">
                Quick Utterances:
              </span>
              {getScenarioPills().map((pill, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendTurn(pill.text)}
                  disabled={isSendingTurn}
                  className="whitespace-nowrap rounded-full border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50/50 transition shadow-2xs"
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Messages Transcript */}
            <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-zinc-50/20">
              {chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-zinc-400 font-mono">
                    <span>{msg.role === "user" ? "Caller" : "AI Receptionist"}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-2xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] rounded-br-none"
                        : msg.is_emergency
                        ? "bg-amber-50 border border-amber-300 text-amber-950 font-medium rounded-bl-none ring-1 ring-amber-400/50"
                        : "bg-[var(--surface-panel)] border border-[var(--border-hairline)] text-zinc-800 rounded-bl-none"
                    }`}
                  >
                    {msg.is_emergency && (
                      <div className="flex items-center gap-1.5 text-amber-800 font-bold mb-1 border-b border-amber-200 pb-1">
                        <Flame className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                        <span>Life Safety Emergency Escalation Activated</span>
                      </div>
                    )}
                    <p>{msg.text}</p>
                    {msg.cited_source && (
                      <div className="mt-2 pt-1.5 border-t border-[var(--border-hairline)]/80 flex items-center justify-between text-[11px] text-emerald-800 bg-emerald-50/80 rounded-md px-2 py-1">
                        <div className="flex items-center gap-1.5 font-medium truncate">
                          <FileText className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span>Cited Source: {msg.cited_source}</span>
                        </div>
                        {typeof msg.cited_score === "number" && (
                          <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded font-mono shrink-0 ml-2">
                            {Math.round(msg.cited_score * 100)}% match
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isSendingTurn && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 italic py-1 px-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                  AI Receptionist is synthesizing response...
                </div>
              )}
            </div>

            {/* Input Row */}
            <div className="border-t border-[var(--border-hairline)] p-3 bg-[var(--surface-panel)]">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendTurn();
                }}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={toggleVoiceListening}
                  className={`p-2 rounded-lg border transition ${
                    isListening
                      ? "border-rose-500 bg-rose-50 text-rose-600 animate-pulse"
                      : "border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  }`}
                  title={isListening ? "Listening... click to stop" : "Speak via Microphone"}
                >
                  {isListening ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-zinc-400" />}
                </button>

                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={
                    isListening
                      ? "Listening to your voice..."
                      : "Type a caller inquiry or speak via microphone..."
                  }
                  className="flex-1 rounded-lg border border-zinc-300 px-3.5 py-2 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={!userInput.trim() || isSendingTurn}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Live Extraction & Life Safety HUD */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h3 className="text-sm font-bold text-zinc-900">Real-Time Extraction & Safety HUD</h3>
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-mono text-zinc-600">
                  Turn {hudState.turnCount}
                </span>
              </div>

              {/* Emergency Status Banner */}
              <div
                className={`rounded-xl border p-3.5 text-xs transition ${
                  hudState.detectedEmergency
                    ? "border-rose-300 bg-rose-50 text-rose-950 shadow-xs"
                    : "border-emerald-200 bg-emerald-50/60 text-emerald-950"
                }`}
              >
                <div className="flex items-center justify-between font-bold mb-1.5">
                  <span className="flex items-center gap-1.5">
                    {hudState.detectedEmergency ? (
                      <>
                        <Flame className="h-4 w-4 text-rose-600 animate-bounce" />
                        <span className="text-rose-900 uppercase tracking-wide">
                          Life Safety Emergency Active
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-900">Standard Operational Mode</span>
                      </>
                    )}
                  </span>
                </div>

                {hudState.detectedEmergency ? (
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-1">
                      <span className="text-rose-700">Trigger Detected:</span>
                      <strong className="rounded bg-rose-100 px-1.5 py-0.2 font-mono text-rose-900">
                        {hudState.emergencyTrigger || "life safety alert"}
                      </strong>
                    </div>
                    {hudState.escalatedTo && (
                      <div className="flex items-center gap-1">
                        <PhoneCall className="h-3 w-3 text-rose-600" />
                        <span className="text-rose-700">Warm SIP Escalation:</span>
                        <strong className="font-mono text-rose-950">{hudState.escalatedTo}</strong>
                      </div>
                    )}
                    {hudState.safetyAdvice && (
                      <div className="rounded bg-rose-100/70 p-2 font-mono text-[10px] text-rose-900 border border-rose-200">
                        {hudState.safetyAdvice}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-800">
                    No life safety hazards triggered. Agent is conducting conversational triage and qualification.
                  </p>
                )}
              </div>

              {/* Dynamic Intake Extraction View */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5 text-indigo-600" />
                    Live CRM Extracted Intake Fields
                  </span>
                  <span className="text-[10px] font-normal text-zinc-400">
                    {Object.keys(hudState.extractedIntake).length} extracted
                  </span>
                </h4>

                {Object.keys(hudState.extractedIntake).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(hudState.extractedIntake).map(([key, val]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border border-[var(--border-hairline)] bg-zinc-50/70 p-2.5 text-xs"
                      >
                        <span className="font-mono font-medium text-zinc-600 text-[11px]">{key}</span>
                        <span className="rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 text-xs">
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--border-hairline)] p-4 text-center text-xs text-zinc-400">
                    No intake fields extracted yet. Speak or type answers (e.g. trade type, urgency level, property type) to watch live CRM extraction.
                  </div>
                )}
              </div>

              {/* Grounded Business Info Cited (Milestone M10a) */}
              <div className="rounded-xl border border-[var(--border-hairline)] bg-zinc-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    Grounded Document Citation
                  </span>
                  {typeof hudState.citedScore === "number" && (
                    <span className="text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                      {Math.round(hudState.citedScore * 100)}% match
                    </span>
                  )}
                </div>
                {hudState.citedSource ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-1 font-semibold text-zinc-900">
                      <span className="text-zinc-500 font-normal">Source:</span>
                      <span className="font-mono text-[11px] text-emerald-800 bg-[var(--surface-panel)] border border-emerald-200 px-1.5 py-0.5 rounded">
                        {hudState.citedSource}
                      </span>
                    </div>
                    {hudState.citedSnippet && (
                      <div className="rounded bg-[var(--surface-panel)] p-2 text-[11px] text-zinc-700 border border-[var(--border-hairline)] font-serif italic max-h-24 overflow-y-auto leading-relaxed">
                        &quot;{hudState.citedSnippet}&quot;
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400 italic">
                    No specific business document chunk was cited in the latest turn.
                  </p>
                )}
              </div>

              {/* Pack Metadata */}
              <div className="border-t border-zinc-100 pt-3 text-xs space-y-1 text-zinc-500">
                <div className="flex justify-between">
                  <span>Tested Blueprint:</span>
                  <span className="font-mono font-medium text-zinc-800">{selectedPackSlug}</span>
                </div>
                <div className="flex justify-between">
                  <span>Simulation Engine:</span>
                  <span className="font-mono text-zinc-600">VedaVoice Prompt Synthesizer v2</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: QA Test Runner */}
      {activeTab === "test" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Automated 10-Scenario QA Test Runner</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Execute the standard test matrix against your effective industry pack prompt and safety guards.
              </p>
            </div>
            <button
              onClick={handleRunTests}
              disabled={runningTests}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-indigo-700 transition shadow-sm"
            >
              <Play className={`h-4 w-4 ${runningTests ? "animate-spin" : ""}`} />
              {runningTests ? "Simulating 10 Scenarios..." : "Run Test Suite"}
            </button>
          </div>

          {testResult && (
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-zinc-900">Scorecard:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      testResult.score_pct >= 90
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {testResult.score_pct}% ({testResult.passed_scenarios}/{testResult.total_scenarios} passed)
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">Pack: {testResult.pack_slug}</span>
                </div>
                <span className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                  Status: {testResult.status}
                </span>
              </div>

              <div className="divide-y divide-zinc-100">
                {testResult.scenarios?.map((sc: any, idx: number) => (
                  <div key={sc.id || idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5">
                        {sc.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600" />
                        )}
                      </span>
                      <div>
                        <div className="font-medium text-zinc-800">{sc.name}</div>
                        <div className="text-[11px] text-zinc-500 italic mt-0.5">&ldquo;{sc.user_utterance}&rdquo;</div>
                        <div className="text-[11px] text-zinc-400 mt-1">Expected: {sc.expected_action} ({sc.expected_urgency})</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono text-right">{sc.rationale}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
