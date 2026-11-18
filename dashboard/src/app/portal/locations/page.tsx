"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin,
  Building2,
  Plus,
  RotateCw,
  Phone,
  Clock,
  Users,
  Compass,
  CheckCircle2,
  Trash2,
  Edit2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { api, TenantLocation } from "@/lib/api";

export default function LocationsPage() {
  const [locations, setLocations] = useState<TenantLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingLoc, setEditingLoc] = useState<TenantLocation | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Simulator state
  const [simZip, setSimZip] = useState<string>("");
  const [simCity, setSimCity] = useState<string>("");
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    phone: "",
    timezone: "America/New_York",
    hours: "Monday to Friday, 8:00 AM to 6:00 PM",
    service_territory_zips: "",
    transfer_number: "",
    emergency_phone: "",
    is_primary: false,
    is_active: true,
    notes: "",
  });

  const loadLocations = async () => {
    try {
      setLoading(true);
      const res = await api.listLocations(true);
      setLocations(res);
    } catch (err: any) {
      console.error("Failed to load locations", err);
      setMessage({ type: "error", text: err.message || "Failed to load locations" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const openCreateModal = () => {
    setEditingLoc(null);
    setFormData({
      name: "",
      code: "",
      address_line1: "",
      city: "",
      state: "",
      postal_code: "",
      phone: "",
      timezone: "America/New_York",
      hours: "Monday to Friday, 8:00 AM to 6:00 PM",
      service_territory_zips: "",
      transfer_number: "",
      emergency_phone: "",
      is_primary: locations.length === 0,
      is_active: true,
      notes: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (loc: TenantLocation) => {
    setEditingLoc(loc);
    setFormData({
      name: loc.name,
      code: loc.code,
      address_line1: loc.address_line1,
      city: loc.city,
      state: loc.state,
      postal_code: loc.postal_code,
      phone: loc.phone,
      timezone: loc.timezone,
      hours: loc.hours,
      service_territory_zips: (loc.service_territory_zips || []).join(", "),
      transfer_number: loc.transfer_number,
      emergency_phone: loc.emergency_phone,
      is_primary: loc.is_primary,
      is_active: loc.is_active,
      notes: loc.notes || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage(null);

      const zips = formData.service_territory_zips
        .split(",")
        .map((z) => z.trim())
        .filter((z) => z.length > 0);

      const payload = {
        ...formData,
        service_territory_zips: zips,
      };

      if (editingLoc) {
        await api.updateLocation(editingLoc.id, payload);
        setMessage({ type: "success", text: `Location "${formData.name}" updated successfully.` });
      } else {
        await api.createLocation(payload);
        setMessage({ type: "success", text: `New location "${formData.name}" registered successfully.` });
      }
      setModalOpen(false);
      await loadLocations();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save location" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (loc: TenantLocation) => {
    if (!confirm(`Are you sure you want to delete ${loc.name}? Associated phone numbers will revert to tenant unassigned.`)) {
      return;
    }
    try {
      await api.deleteLocation(loc.id);
      setMessage({ type: "success", text: `Location "${loc.name}" deleted.` });
      await loadLocations();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete location" });
    }
  };

  const handleTestRoute = async () => {
    try {
      setSimulating(true);
      setSimResult(null);
      const res = await api.resolveLocation({
        postal_code: simZip.trim() || undefined,
        spoken_city: simCity.trim() || undefined,
      });
      setSimResult(res);
    } catch (err: any) {
      console.error("Failed to simulate location routing", err);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Building2 className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Multi-Location Architecture</h1>
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              FR-LOC-1..6
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Manage multi-branch business entities, store operating hours, local phone lines, and postal code territory routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadLocations}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            <Plus className="h-4 w-4" />
            Add Location
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

      {/* Territory Routing Simulator Banner */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-teal-50/50 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2 font-semibold text-xs text-indigo-950">
          <Compass className="h-4 w-4 text-indigo-600" />
          <span>Interactive Territory Dispatch Simulator</span>
        </div>
        <p className="text-xs text-zinc-600 mb-3">
          Test which branch location and emergency transfer number will handle a customer call based on zip code or city.
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={simZip}
            onChange={(e) => setSimZip(e.target.value)}
            placeholder="Caller Zip Code (e.g. 78701)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500 w-48"
          />
          <input
            type="text"
            value={simCity}
            onChange={(e) => setSimCity(e.target.value)}
            placeholder="Spoken City (e.g. Austin)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500 w-44"
          />
          <button
            onClick={handleTestRoute}
            disabled={simulating}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition"
          >
            {simulating ? "Evaluating..." : "Simulate Routing"}
          </button>

          {simResult && (
            <div className="ml-auto flex items-center gap-2 text-xs">
              {simResult.resolved && simResult.location ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Routes to: <strong>{simResult.location.name}</strong> ({simResult.location.code}) • {simResult.location.timezone}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-800 font-medium">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Fallback: Primary HQ
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Locations Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:shadow transition flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-zinc-900">{loc.name}</h3>
                    {loc.is_primary && (
                      <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 uppercase tracking-wider">
                        Primary HQ
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-zinc-500">{loc.code}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(loc)}
                    className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
                    title="Edit Location"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(loc)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded"
                    title="Delete Location"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Address & Contact */}
              <div className="mt-3 space-y-1.5 text-xs text-zinc-600">
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <span>
                    {loc.address_line1 ? `${loc.address_line1}, ` : ""}
                    {loc.city ? `${loc.city}, ` : ""}
                    {loc.state} {loc.postal_code}
                  </span>
                </div>
                {loc.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                    <span className="font-mono">{loc.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" />
                  <span className="truncate">{loc.hours} ({loc.timezone})</span>
                </div>
              </div>

              {/* Service Territories */}
              <div className="mt-3 pt-2.5 border-t border-zinc-100">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                  Covered Postal Codes ({loc.service_territory_zips?.length || 0})
                </span>
                <div className="flex flex-wrap gap-1">
                  {loc.service_territory_zips && loc.service_territory_zips.length > 0 ? (
                    loc.service_territory_zips.map((zip, idx) => (
                      <span
                        key={idx}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-700"
                      >
                        {zip}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-zinc-400 italic">Universal territory (All zips)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics Footer */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-zinc-400" />
                {loc.metrics?.staff_count || 0} Staff
              </span>
              <span>{loc.metrics?.phone_count || 0} Lines</span>
              <span>{loc.metrics?.total_calls || 0} Calls</span>
              <span>{loc.metrics?.total_bookings || 0} Bookings</span>
            </div>
          </div>
        ))}
      </div>

      {locations.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center">
          <Building2 className="mx-auto h-8 w-8 text-zinc-400 mb-2" />
          <h3 className="text-sm font-semibold text-zinc-800">No Branch Locations Configured</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Add physical locations, store branches, or territory service dispatch centers to enable multi-location call routing.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            Add First Location
          </button>
        </div>
      )}

      {/* Location Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-zinc-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-bold text-zinc-900">
                {editingLoc ? `Edit Location: ${editingLoc.name}` : "Create New Branch Location"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Austin North Service Hub"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Location Code (Identifier) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. AUSTIN_NORTH"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500 uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  placeholder="e.g. 10401 Research Blvd"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Austin"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="TX"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    placeholder="78759"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+15125550199"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Timezone</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="America/New_York">Eastern (America/New_York)</option>
                    <option value="America/Chicago">Central (America/Chicago)</option>
                    <option value="America/Denver">Mountain (America/Denver)</option>
                    <option value="America/Phoenix">Arizona (America/Phoenix)</option>
                    <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Working Hours</label>
                <input
                  type="text"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                  placeholder="Monday to Friday, 8:00 AM to 6:00 PM"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Service Territory Postal Codes (Comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.service_territory_zips}
                  onChange={(e) => setFormData({ ...formData, service_territory_zips: e.target.value })}
                  placeholder="78759, 78758, 787*"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                />
                <p className="mt-1 text-[11px] text-zinc-400">
                  Matches customer zip code to route incoming appointments to this branch. Wildcards supported (e.g. 787*).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Human Transfer Number
                  </label>
                  <input
                    type="text"
                    value={formData.transfer_number}
                    onChange={(e) => setFormData({ ...formData, transfer_number: e.target.value })}
                    placeholder="+15125550188"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Emergency Phone
                  </label>
                  <input
                    type="text"
                    value={formData.emergency_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
                    placeholder="+15125550911"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_primary}
                    onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Designate as Primary HQ Location
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Active
                </label>
              </div>

              <div className="pt-3 border-t border-zinc-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-zinc-300 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition"
                >
                  {submitting ? "Saving..." : editingLoc ? "Update Location" : "Create Location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
