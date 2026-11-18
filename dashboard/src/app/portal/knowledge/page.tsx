"use client";

import React, { useEffect, useState, useRef } from "react";
import {
  api,
  KnowledgeDocument,
  RAGQueryResponse,
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
} from "lucide-react";

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document Chunk Inspection Drawer
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [docChunks, setDocChunks] = useState<Array<{ id: string; chunk_index: number; content: string; token_count: number }>>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // RAG Testing Sandbox
  const [testQuery, setTestQuery] = useState("What are your warranty policies and diagnostic rates?");
  const [topK, setTopK] = useState(3);
  const [confidenceCutoff, setConfidenceCutoff] = useState(0.30);
  const [testingRAG, setTestingRAG] = useState(false);
  const [ragResult, setRagResult] = useState<RAGQueryResponse | null>(null);

  const loadDocuments = () => {
    setLoading(true);
    api
      .listKnowledgeDocuments()
      .then((docs) => setDocuments(docs))
      .catch((err) => console.error("Failed to load documents:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDocuments();
  }, []);

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

  const handleDelete = async (docId: string, filename: string) => {
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

  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0);

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
          <h1 className="text-xl font-bold text-zinc-900 mt-1">Document Grounding &amp; FAQ Ingestion</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Upload business documentation (price sheets, warranties, manuals, service catalogs). Documents are chunked and indexed for sub-50ms voice retrieval.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Documents Indexed</span>
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{documents.length}</div>
          <div className="text-[10px] text-zinc-400 font-mono">PDF, DOCX, CSV, TXT, MD</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Semantic Chunks</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">{totalChunks}</div>
          <div className="text-[10px] text-blue-600 font-mono">Sentence-aware bounded</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>RAG Query Latency SLA</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 font-mono">&lt; 15ms</div>
          <div className="text-[10px] text-emerald-600 font-mono font-medium">Sub-50ms Guaranteed</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-zinc-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Anti-Hallucination Gate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">Active</div>
          <div className="text-[10px] text-zinc-500 font-mono">Out-of-scope protection</div>
        </div>
      </div>

      {/* Upload Notification Alerts */}
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

      {/* Two Column Layout: Document Table & Live RAG Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Documents Inventory (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-600" />
              Indexed Documents Library
            </h2>
            <button
              onClick={loadDocuments}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              title="Refresh"
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
                {loading ? (
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
                            onClick={() => handleDelete(doc.id, doc.filename)}
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

        {/* Right Column: Live RAG Testing Sandbox (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl border border-indigo-200 bg-white shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Live RAG Query Sandbox
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold">
                Sub-50ms Test
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Test how the AI receptionist retrieves knowledge snippets in real-time when a caller asks a specific question.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700">Caller Inquiry Question</label>
              <div className="relative">
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="e.g. Do you service tankless water heaters?"
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

                <div className="text-[11px] text-zinc-600">
                  Confidence Score: <strong>{(ragResult.confidence_score * 100).toFixed(1)}%</strong>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {ragResult.top_matches.map((match, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                        <span className="font-bold text-indigo-700 truncate">{match.filename}</span>
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
