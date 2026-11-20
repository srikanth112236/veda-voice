"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  api,
  KnowledgeDocument,
  RAGQueryResponse,
  FAQItem,
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
} from "lucide-react";

export default function KnowledgeBasePage() {
  // Navigation & Mode
  const [activeTab, setActiveTab] = useState<"faqs" | "documents">("faqs");

  // Documents State
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
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

    window.speechSynthesis.cancel(); // Stop any active speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = "en-US";

    // Try to pick a natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Jenny")
    );
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    utterance.onend = () => setCurrentlySpeaking(null);
    utterance.onerror = () => setCurrentlySpeaking(null);

    setCurrentlySpeaking(identifier);
    window.speechSynthesis.speak(utterance);
  };

  // Stop all speech on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
      loadDocuments(); // Virtual document chunks updated
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

  // Calculations & Filtered lists
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 text-xs font-mono font-bold uppercase tracking-wider">
            <BookOpen className="w-4 h-4" />
            Knowledge Base RAG Engine
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mt-1">Dual-Mode Knowledge Grounding &amp; FAQ Studio</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Empower your AI receptionist with instant business knowledge via Direct Q&amp;A FAQs or uploaded manuals, price sheets, and policies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "faqs" ? (
            <button
              type="button"
              onClick={() => setShowAddFaqModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Direct FAQ
            </button>
          ) : (
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Direct Business FAQs</span>
            <HelpCircle className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{faqs.length}</div>
          <div className="text-[10px] text-zinc-400 font-mono">Synchronized &amp; Vectorized</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Indexed Documents</span>
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{documents.length}</div>
          <div className="text-[10px] text-zinc-400 font-mono">PDF, DOCX, CSV, TXT</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Total Grounding Chunks</span>
            <Layers className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{totalChunks}</div>
          <div className="text-[10px] text-emerald-600 font-mono font-medium">Sentence-bounded RAG</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Anti-Hallucination Gate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">&lt; 15ms Latency</div>
          <div className="text-[10px] text-zinc-500 font-mono">Strict confidence cutoff</div>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab("faqs")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "faqs"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          Direct Business FAQs &amp; Policies ({faqs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === "documents"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
          }`}
        >
          <FileText className="w-4 h-4" />
          Document Library ({documents.length})
        </button>
      </div>

      {/* Main Grid: Left Column (Content) & Right Column (Live RAG Simulator) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {activeTab === "faqs" ? (
            /* TAB 1: DIRECT FAQs BUILDER */
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
                <div className="space-y-3">
                  {filteredFaqs.map((faq, index) => {
                    const isSpeakingThis = currentlySpeaking === `faq-${index}`;
                    return (
                      <div
                        key={index}
                        className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm hover:border-zinc-300 transition-all space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-semibold">
                                {faq.category || "General"}
                              </span>
                              <h3 className="text-xs font-bold text-zinc-900">{faq.question}</h3>
                            </div>
                            <p className="text-xs text-zinc-700 leading-relaxed font-sans">{faq.answer}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Voice Simulation Button */}
                            <button
                              type="button"
                              onClick={() => handleSpeakText(faq.answer, `faq-${index}`)}
                              className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1 ${
                                isSpeakingThis
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm animate-pulse"
                                  : "border-zinc-200 hover:bg-indigo-50 text-indigo-700 hover:border-indigo-200"
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
                          <div className="pt-2 border-t border-zinc-100 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              Phrasings:
                            </span>
                            {faq.alternate_phrasings.map((alt, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-medium"
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
              )}
            </div>
          ) : (
            /* TAB 2: DOCUMENT LIBRARY */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-zinc-900 flex items-center gap-2">
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
                      documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-zinc-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-semibold text-zinc-900 flex items-center gap-2">
                              {getFormatIcon(doc.filename)}
                              <span className="truncate max-w-[180px]">{doc.filename}</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-zinc-600">
                            {doc.file_size_bytes > 1024 * 1024
                              ? `${(doc.file_size_bytes / (1024 * 1024)).toFixed(1)} MB`
                              : `${Math.round(doc.file_size_bytes / 1024)} KB`}
                          </td>
                          <td className="p-3 font-mono text-zinc-900 font-bold">
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
                                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-semibold"
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
            </div>
          )}
        </div>

        {/* Right Column: Live RAG Testing Sandbox & Voice Audition (5 cols) */}
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
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 text-white hover:bg-zinc-800"
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
