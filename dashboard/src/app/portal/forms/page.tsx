"use client";

import React, { useEffect, useState } from "react";
import {
  api,
  LeadFormItem,
  LeadFormField,
  CapturedLead,
} from "@/lib/api";
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  PhoneCall,
  User,
  MapPin,
  Clock,
  Sparkles,
  Radio,
  ExternalLink,
  Flame,
  Send,
  Eye,
  Sliders,
  Layers,
} from "lucide-react";

export default function LeadFormBuilderPage() {
  const [forms, setForms] = useState<LeadFormItem[]>([]);
  const [leads, setLeads] = useState<CapturedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form Builder Drawer / Creator State
  const [showBuilder, setShowBuilder] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSubmitAction, setNewSubmitAction] = useState<"call_triage" | "log_only">("call_triage");
  const [fields, setFields] = useState<LeadFormField[]>([
    {
      name: "caller_name",
      label: "Full Name",
      type: "text",
      required: true,
      placeholder: "e.g. Jane Doe",
    },
    {
      name: "caller_phone",
      label: "Phone Number",
      type: "tel",
      required: true,
      placeholder: "+1 (512) 555-0199",
    },
    {
      name: "urgency",
      label: "Urgency Level",
      type: "select",
      required: true,
      options: ["emergency", "urgent", "normal"],
    },
    {
      name: "service_requested",
      label: "Service Requested",
      type: "text",
      required: false,
      placeholder: "e.g. Pipe burst repair",
    },
    {
      name: "service_address",
      label: "Service Property Address",
      type: "text",
      required: false,
      placeholder: "123 Main St, Austin, TX",
    },
  ]);

  // Interactive Live Preview Simulation State
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [submittingPreview, setSubmittingPreview] = useState(false);
  const [previewSuccess, setPreviewSuccess] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([api.getLeadForms(), api.getCapturedLeads()])
      .then(([formsRes, leadsRes]) => {
        setForms(formsRes);
        setLeads(leadsRes);
      })
      .catch((err) => console.error("Failed to load forms:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddField = () => {
    const fieldId = `field_${Date.now()}`;
    setFields([
      ...fields,
      {
        name: fieldId,
        label: "New Custom Field",
        type: "text",
        required: false,
        placeholder: "Enter value...",
      },
    ]);
  };

  const handleRemoveField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, key: keyof LeadFormField, val: any) => {
    const copy = [...fields];
    copy[index] = { ...copy[index], [key]: val };
    setFields(copy);
  };

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await api.createLeadForm({
        title: newTitle.trim(),
        description: newDescription.trim(),
        fields,
        submit_action: newSubmitAction,
      });
      setShowBuilder(false);
      setNewTitle("");
      setNewDescription("");
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to create form");
    }
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm("Are you sure you want to delete this lead form?")) return;
    try {
      await api.deleteLeadForm(formId);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete form");
    }
  };

  const copyEmbedCode = (formId: string) => {
    const embed = `<iframe src="http://localhost:8000/api/v1/forms/${formId}/public" width="100%" height="480" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(embed);
    setCopiedId(formId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTestSubmitPreview = async (formId: string) => {
    setSubmittingPreview(true);
    setPreviewSuccess(null);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/forms/${formId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caller_name: previewValues["caller_name"] || "Website Preview Lead",
          caller_phone: previewValues["caller_phone"] || "+15125550188",
          urgency: previewValues["urgency"] || "urgent",
          service_requested: previewValues["service_requested"] || "Pipe Burst Repair",
          service_address: previewValues["service_address"] || "500 Congress Ave",
          custom_data: previewValues,
        }),
      });
      const data = await res.json();
      setPreviewSuccess(data.message);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmittingPreview(false);
    }
  };

  const handleUpdateStatus = async (leadId: string, status: string) => {
    try {
      await api.updateLeadStatus(leadId, status);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-xs font-mono text-zinc-500 bg-white rounded-2xl border border-zinc-200 text-center">
        Loading lead form builder and captured leads...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Lead Intake &amp; Speed-to-Lead Triage Engine
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Multi-Tenant Lead Form Builder &amp; Inbox
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Build custom web intake forms with dynamic fields. Any data submitted immediately lands in your leads inbox and triggers the 2-second AI call triage gate.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBuilder(!showBuilder)}
          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          {showBuilder ? "Close Builder" : "Create New Lead Form"}
        </button>
      </div>

      {/* FORM BUILDER DRAWER */}
      {showBuilder && (
        <form onSubmit={handleCreateForm} className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-md space-y-6 animate-in fade-in duration-150">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-zinc-900">Custom Intake Form Designer</h2>
            <p className="text-xs text-zinc-500">Configure public customer fields, select dropdowns, and automated speed-to-lead callback triggers.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Form Title *</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. 24/7 Water Damage Emergency Dispatch"
                className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Submit Action (Post-Intake)</label>
              <select
                value={newSubmitAction}
                onChange={(e) => setNewSubmitAction(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
              >
                <option value="call_triage">⚡ Sub-2s AI Voice Callback (Instant Call Triage)</option>
                <option value="log_only">📝 Log to Leads Inbox Only (No Automated Call)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700">Form Subheading / Description</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="e.g. Enter your job address and phone number for immediate technician dispatch."
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-xs text-zinc-900 focus:outline-none focus:border-zinc-900"
            />
          </div>

          {/* Dynamic Fields List */}
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                Dynamic Form Fields ({fields.length})
              </span>
              <button
                type="button"
                onClick={handleAddField}
                className="px-3 py-1 rounded-lg border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-xs font-semibold text-zinc-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Custom Field
              </button>
            </div>

            <div className="space-y-2.5">
              {fields.map((f, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/60 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-3 space-y-0.5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Field Key</span>
                    <input
                      type="text"
                      value={f.name}
                      onChange={(e) => handleFieldChange(idx, "name", e.target.value)}
                      className="w-full px-2.5 py-1 rounded-lg bg-white border border-zinc-300 text-xs font-mono text-zinc-800"
                    />
                  </div>

                  <div className="sm:col-span-4 space-y-0.5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">User-Facing Label</span>
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => handleFieldChange(idx, "label", e.target.value)}
                      className="w-full px-2.5 py-1 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-800"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-0.5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase">Type</span>
                    <select
                      value={f.type}
                      onChange={(e) => handleFieldChange(idx, "type", e.target.value)}
                      className="w-full px-2.5 py-1 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-800"
                    >
                      <option value="text">Text</option>
                      <option value="tel">Telephone</option>
                      <option value="email">Email</option>
                      <option value="select">Dropdown</option>
                      <option value="textarea">Textarea</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 flex items-center gap-2 pt-3">
                    <label className="text-xs text-zinc-600 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => handleFieldChange(idx, "required", e.target.checked)}
                        className="rounded border-zinc-300 text-zinc-900"
                      />
                      <span>Required</span>
                    </label>
                  </div>

                  <div className="sm:col-span-1 text-right pt-3">
                    <button
                      type="button"
                      onClick={() => handleRemoveField(idx)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="px-4 py-2 rounded-xl border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-sm"
            >
              Save &amp; Publish Form
            </button>
          </div>
        </form>
      )}

      {/* ACTIVE FORMS GRID & EMBED OPTIONS */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-900">Configured Lead Forms ({forms.length})</h2>
          <p className="text-xs text-zinc-500">Embed these forms on your WordPress, Webflow, or Squarespace site, or share public links.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {forms.map((f) => (
            <div key={f.id} className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-zinc-900">{f.title}</h3>
                    <p className="text-xs text-zinc-500">{f.description}</p>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                    f.submit_action === "call_triage"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-zinc-100 text-zinc-700"
                  }`}>
                    {f.submit_action === "call_triage" ? "⚡ 2s Voice Call" : "📝 Log Only"}
                  </span>
                </div>

                {/* Field Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {f.fields.map((fld, i) => (
                    <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
                      {fld.label} {fld.required && "*"}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-zinc-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => copyEmbedCode(f.id)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-700 flex items-center gap-1.5 font-mono shadow-sm"
                >
                  {copiedId === f.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied Embed
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy iFrame Embed
                    </>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestSubmitPreview(f.id)}
                    disabled={submittingPreview}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" /> Test Submission
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteForm(f.id)}
                    className="p-1.5 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{previewSuccess}</span>
        </div>
      )}

      {/* REAL-TIME LEADS INBOX */}
      <div className="p-6 rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-zinc-900 uppercase font-mono tracking-wider">
                Captured Inbound Leads ({leads.length})
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Customer inquiries submitted through your web forms or ad integrations.
            </p>
          </div>

          <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 font-semibold self-start sm:self-auto">
            {leads.filter((l) => l.status === "pending").length} Pending Triage
          </span>
        </div>

        {leads.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
            No leads captured yet. Submit a test inquiry through your form above!
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => {
              const isEmergency = lead.urgency === "emergency";
              return (
                <div
                  key={lead.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isEmergency
                      ? "border-red-200 bg-red-50/40"
                      : "border-zinc-200 bg-zinc-50/60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center font-bold text-zinc-700 text-xs shadow-sm">
                        {lead.caller_name ? lead.caller_name[0] : "L"}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-zinc-900 flex items-center gap-2">
                          <span>{lead.caller_name || "Website Lead"}</span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                              isEmergency
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {isEmergency ? "🚨 Emergency" : "📝 Normal"}
                          </span>
                        </div>
                        <div className="text-xs font-mono font-bold text-zinc-700">
                          <a href={`tel:${lead.caller_phone}`} className="hover:underline text-emerald-700">
                            {lead.caller_phone}
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-500">
                        {new Date(lead.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <select
                        value={lead.status}
                        onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-zinc-300 text-xs font-semibold text-zinc-800 shadow-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="contacted">Contacted</option>
                        <option value="dispatched">Dispatched</option>
                        <option value="converted">Converted</option>
                      </select>
                    </div>
                  </div>

                  {lead.service_requested && (
                    <div className="text-xs text-zinc-700 font-medium">
                      Service: <strong className="text-zinc-900">{lead.service_requested}</strong>
                      {lead.service_address && ` &bull; Address: ${lead.service_address}`}
                    </div>
                  )}

                  {lead.custom_data && Object.keys(lead.custom_data).length > 0 && (
                    <div className="p-2.5 rounded-lg bg-white border border-zinc-200 text-[11px] font-mono text-zinc-600 flex flex-wrap gap-2">
                      {Object.entries(lead.custom_data).map(([k, v]) => (
                        <span key={k}>
                          <strong>{k}:</strong> {String(v)}
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
    </div>
  );
}
