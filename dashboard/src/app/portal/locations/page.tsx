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
  Calendar,
  UserCheck,
  UserX,
  X,
  BookOpen,
  HelpCircle,
  Map,
  DollarSign,
  Award,
  TrendingUp,
} from "lucide-react";
import { PaginationBar } from "@/components/ui/pagination";
import {
  api,
  TenantLocation,
  LocationStaffMember,
  LocationOverrides,
  LocationGeofence,
  UnservedDemandItem,
} from "@/lib/api";

export default function LocationsPage() {
  const [locations, setLocations] = useState<TenantLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingLoc, setEditingLoc] = useState<TenantLocation | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Pagination
  const [locPage, setLocPage] = useState<number>(1);
  const [locPageSize, setLocPageSize] = useState<number>(6);

  // Simulator state
  const [simZip, setSimZip] = useState<string>("");
  const [simCity, setSimCity] = useState<string>("");
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  // Staff Management State
  const [staffModalOpen, setStaffModalOpen] = useState<boolean>(false);
  const [selectedLocForStaff, setSelectedLocForStaff] = useState<TenantLocation | null>(null);
  const [staffList, setStaffList] = useState<LocationStaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>("");
  const [newStaffEmail, setNewStaffEmail] = useState<string>("");
  const [newStaffPhone, setNewStaffPhone] = useState<string>("");
  const [newStaffRole, setNewStaffRole] = useState<string>("technician");
  const [newStaffSkills, setNewStaffSkills] = useState<string>("");
  const [addingStaff, setAddingStaff] = useState<boolean>(false);

  // Live Slots Inspector State
  const [slotsModalOpen, setSlotsModalOpen] = useState<boolean>(false);
  const [selectedLocForSlots, setSelectedLocForSlots] = useState<TenantLocation | null>(null);
  const [targetSlotDate, setTargetSlotDate] = useState<string>(
    new Date(Date.now() + 86400000).toISOString().split("T")[0]
  );
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  // Phase A: Local FAQs & Policies State
  const [overridesModalOpen, setOverridesModalOpen] = useState<boolean>(false);
  const [selectedLocForOverrides, setSelectedLocForOverrides] = useState<TenantLocation | null>(null);
  const [overridesParking, setOverridesParking] = useState<string>("");
  const [overridesFee, setOverridesFee] = useState<string>("");
  const [overridesLicense, setOverridesLicense] = useState<string>("");
  const [overridesFaqs, setOverridesFaqs] = useState<Array<{ question: string; answer: string }>>([]);
  const [overridesGreeting, setOverridesGreeting] = useState<string>("");
  const [overridesInstructions, setOverridesInstructions] = useState<string>("");
  const [overridesPricingMode, setOverridesPricingMode] = useState<string>("");
  const [savingOverrides, setSavingOverrides] = useState<boolean>(false);

  // Phase B: Smart Geofencing State
  const [geofenceModalOpen, setGeofenceModalOpen] = useState<boolean>(false);
  const [selectedLocForGeofence, setSelectedLocForGeofence] = useState<TenantLocation | null>(null);
  const [geofenceZips, setGeofenceZips] = useState<string>("");
  const [geofenceHoods, setGeofenceHoods] = useState<string>("");
  const [geofenceCities, setGeofenceCities] = useState<string>("");
  const [geofenceAllowsOut, setGeofenceAllowsOut] = useState<boolean>(true);
  const [geofenceSurcharge, setGeofenceSurcharge] = useState<string>("");
  const [savingGeofence, setSavingGeofence] = useState<boolean>(false);

  // Unserved Demand State
  const [unservedModalOpen, setUnservedModalOpen] = useState<boolean>(false);
  const [unservedItems, setUnservedItems] = useState<UnservedDemandItem[]>([]);
  const [loadingUnserved, setLoadingUnserved] = useState<boolean>(false);

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
    try {
      await api.deleteLocation(loc.id);
      setMessage({ type: "success", text: `Location "${loc.name}" deleted.` });
      await loadLocations();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to delete location" });
    }
  };

  const openStaffModal = async (loc: TenantLocation) => {
    setSelectedLocForStaff(loc);
    setStaffModalOpen(true);
    setNewStaffName("");
    setNewStaffEmail("");
    setNewStaffPhone("");
    setNewStaffSkills("");
    try {
      setLoadingStaff(true);
      const staff = await api.listLocationStaff(loc.id);
      setStaffList(staff);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load staff for location" });
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleToggleStaffDutyStatus = async (staff: LocationStaffMember) => {
    if (!selectedLocForStaff) return;
    const nextStatus = staff.duty_status === "on_duty" ? "off_duty" : "on_duty";
    try {
      await api.updateStaffDutyStatus(selectedLocForStaff.id, staff.id, nextStatus);
      setStaffList((prev) =>
        prev.map((s) => (s.id === staff.id ? { ...s, duty_status: nextStatus as any } : s))
      );
    } catch (err: unknown) {
      setMessage({ type: "error", text: `Failed to update technician duty status: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocForStaff) return;
    try {
      setAddingStaff(true);
      const skillsArray = newStaffSkills
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const created = await api.createLocationStaff(selectedLocForStaff.id, {
        name: newStaffName,
        email: newStaffEmail,
        phone: newStaffPhone,
        role: newStaffRole,
        skills: skillsArray,
        duty_status: "on_duty",
      });
      setStaffList((prev) => [...prev, created]);
      setNewStaffName("");
      setNewStaffEmail("");
      setNewStaffPhone("");
      setNewStaffSkills("");
    } catch (err: unknown) {
      setMessage({ type: "error", text: `Failed to add staff: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setAddingStaff(false);
    }
  };

  const openSlotsModal = async (loc: TenantLocation) => {
    setSelectedLocForSlots(loc);
    setSlotsModalOpen(true);
    fetchSlotsForDate(loc.id, targetSlotDate);
  };

  const fetchSlotsForDate = async (locationId: string, dateStr: string) => {
    try {
      setLoadingSlots(true);
      const res = await api.getLocationAvailability(locationId, dateStr);
      setAvailableSlots(res.slots || []);
    } catch (err: any) {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const openOverridesModal = async (loc: TenantLocation) => {
    setSelectedLocForOverrides(loc);
    setOverridesModalOpen(true);
    try {
      const res = await api.getLocationOverrides(loc.id);
      setOverridesParking(res.parking_directions || "");
      setOverridesFee(res.diagnostic_fee || "");
      setOverridesLicense(res.regional_license_number || "");
      setOverridesFaqs(res.faq_overrides || []);
      setOverridesGreeting(res.greeting_override || "");
      setOverridesInstructions(res.custom_instructions_override || "");
      setOverridesPricingMode(res.pricing_mode_override || "");
    } catch {
      setOverridesParking(loc.parking_directions || "");
      setOverridesFee(loc.diagnostic_fee || "");
      setOverridesLicense(loc.regional_license_number || "");
      setOverridesFaqs(loc.faq_overrides || []);
      setOverridesGreeting("");
      setOverridesInstructions("");
      setOverridesPricingMode("");
    }
  };

  const handleSaveOverrides = async () => {
    if (!selectedLocForOverrides) return;
    try {
      setSavingOverrides(true);
      await api.updateLocationOverrides(selectedLocForOverrides.id, {
        parking_directions: overridesParking,
        diagnostic_fee: overridesFee,
        regional_license_number: overridesLicense,
        faq_overrides: overridesFaqs.filter((f) => f.question.trim()),
        greeting_override: overridesGreeting,
        custom_instructions_override: overridesInstructions,
        pricing_mode_override: overridesPricingMode,
      });
      setOverridesModalOpen(false);
      loadLocations();
    } catch (err: unknown) {
      setMessage({ type: "error", text: `Failed to save overrides: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingOverrides(false);
    }
  };

  const openGeofenceModal = async (loc: TenantLocation) => {
    setSelectedLocForGeofence(loc);
    setGeofenceModalOpen(true);
    try {
      const res = await api.getLocationGeofence(loc.id);
      setGeofenceZips((res.service_territory_zips || []).join(", "));
      setGeofenceHoods((res.service_neighborhoods || []).join(", "));
      setGeofenceCities((res.service_cities || []).join(", "));
      setGeofenceAllowsOut(res.allows_out_of_area_dispatch ?? true);
      setGeofenceSurcharge(res.extended_dispatch_surcharge || "");
    } catch {
      setGeofenceZips((loc.service_territory_zips || []).join(", "));
      setGeofenceHoods((loc.service_neighborhoods || []).join(", "));
      setGeofenceCities((loc.service_cities || []).join(", "));
      setGeofenceAllowsOut(loc.allows_out_of_area_dispatch ?? true);
      setGeofenceSurcharge(loc.extended_dispatch_surcharge || "");
    }
  };

  const handleSaveGeofence = async () => {
    if (!selectedLocForGeofence) return;
    try {
      setSavingGeofence(true);
      await api.updateLocationGeofence(selectedLocForGeofence.id, {
        service_territory_zips: geofenceZips.split(",").map((s) => s.trim()).filter(Boolean),
        service_neighborhoods: geofenceHoods.split(",").map((s) => s.trim()).filter(Boolean),
        service_cities: geofenceCities.split(",").map((s) => s.trim()).filter(Boolean),
        allows_out_of_area_dispatch: geofenceAllowsOut,
        extended_dispatch_surcharge: geofenceSurcharge.trim(),
      });
      setGeofenceModalOpen(false);
      loadLocations();
    } catch (err: unknown) {
      setMessage({ type: "error", text: `Failed to save geofence settings: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSavingGeofence(false);
    }
  };

  const openUnservedModal = async () => {
    setUnservedModalOpen(true);
    try {
      setLoadingUnserved(true);
      const res = await api.getUnservedDemand(50);
      setUnservedItems(res.items || []);
    } catch {
      setUnservedItems([]);
    } finally {
      setLoadingUnserved(false);
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
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-hairline)] pb-5 sm:flex-row sm:items-center">
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
            onClick={openUnservedModal}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
          >
            <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
            Unserved Demand
          </button>
          <button
            onClick={loadLocations}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition"
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
            className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500 w-48"
          />
          <input
            type="text"
            value={simCity}
            onChange={(e) => setSimCity(e.target.value)}
            placeholder="Spoken City (e.g. Austin)"
            className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-indigo-500 w-44"
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
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {locations
            .slice((locPage - 1) * locPageSize, locPage * locPageSize)
            .map((loc) => (
          <div
            key={loc.id}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-5 shadow-sm hover:shadow transition flex flex-col justify-between space-y-4"
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

            {/* Quick Actions & Metrics Footer */}
            <div className="pt-3 border-t border-zinc-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-zinc-400" />
                  {loc.metrics?.staff_count || 0} Staff
                </span>
                <span>{loc.metrics?.phone_count || 0} Lines</span>
                <span>{loc.metrics?.total_calls || 0} Calls</span>
                <span>{loc.metrics?.total_bookings || 0} Bookings</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-50">
                <button
                  type="button"
                  onClick={() => openStaffModal(loc)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-zinc-50 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 transition"
                >
                  <Users className="h-3 w-3 text-indigo-600" />
                  Technicians
                </button>
                <button
                  type="button"
                  onClick={() => openSlotsModal(loc)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-zinc-50 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 transition"
                >
                  <Calendar className="h-3 w-3 text-teal-600" />
                  Slots
                </button>
                <button
                  type="button"
                  onClick={() => openOverridesModal(loc)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-zinc-50 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 transition"
                >
                  <BookOpen className="h-3 w-3 text-amber-600" />
                  Local FAQs
                </button>
                <button
                  type="button"
                  onClick={() => openGeofenceModal(loc)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-zinc-50 px-2 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 transition"
                >
                  <Compass className="h-3 w-3 text-blue-600" />
                  Geofencing
                </button>
              </div>
            </div>
          </div>
        ))}
        </div>

        {locations.length > 6 && (
          <div className="pt-2">
            <PaginationBar
              currentPage={locPage}
              totalItems={locations.length}
              pageSize={locPageSize}
              onPageChange={setLocPage}
              onPageSizeChange={setLocPageSize}
              pageSizeOptions={[6, 12, 24]}
            />
          </div>
        )}
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
          <div className="w-full max-w-xl rounded-xl bg-[var(--surface-panel)] shadow-xl border border-[var(--border-hairline)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5">
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

              <div className="pt-3 border-t border-[var(--border-hairline)] flex justify-end gap-2">
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

      {/* Staff / Technicians Roster Modal */}
      {staffModalOpen && selectedLocForStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-[var(--surface-panel)] shadow-xl border border-[var(--border-hairline)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5 bg-zinc-50/70">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Technicians Roster &bull; {selectedLocForStaff.name} ({selectedLocForStaff.code})
                </h3>
              </div>
              <button
                onClick={() => setStaffModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* Add New Technician Form */}
              <form onSubmit={handleAddStaff} className="rounded-xl border border-[var(--border-hairline)] bg-zinc-50/50 p-4 space-y-3">
                <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider block">
                  Add Technician to Branch
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Full Name (e.g. Dave Miller)"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email (e.g. dave@example.com)"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Mobile Phone (for SMS dispatch)"
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Skills (e.g. water_heater, drain_cleaning)"
                    value={newStaffSkills}
                    onChange={(e) => setNewStaffSkills(e.target.value)}
                    className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={addingStaff}
                    className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                  >
                    {addingStaff ? "Adding..." : "+ Add to Roster"}
                  </button>
                </div>
              </form>

              {/* Staff List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-700 block">
                  Assigned Technicians ({staffList.length})
                </span>
                {loadingStaff ? (
                  <div className="py-6 text-center text-xs text-zinc-500">Loading technician roster...</div>
                ) : staffList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-400 italic border border-dashed rounded-lg">
                    No technicians currently assigned to this branch location.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 border border-[var(--border-hairline)] rounded-xl overflow-hidden">
                    {staffList.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between p-3 bg-[var(--surface-panel)] hover:bg-zinc-50/50 transition text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900">{st.name}</span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 font-mono">
                              {st.role}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {st.email} {st.phone ? `&bull; ${st.phone}` : ""}
                          </div>
                          {st.skills && st.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {st.skills.map((sk, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
                                >
                                  {sk}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleToggleStaffDutyStatus(st)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                              st.duty_status === "on_duty"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            }`}
                            title="Click to toggle Shift Status"
                          >
                            {st.duty_status === "on_duty" ? (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                On Duty
                              </>
                            ) : (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                                Off Shift
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Calendar Availability Inspector Modal */}
      {slotsModalOpen && selectedLocForSlots && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-[var(--surface-panel)] shadow-xl border border-[var(--border-hairline)] overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5 bg-zinc-50/70">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Live Slots Inspector &bull; {selectedLocForSlots.name}
                </h3>
              </div>
              <button
                onClick={() => setSlotsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-zinc-700">Target Date:</label>
                <input
                  type="date"
                  value={targetSlotDate}
                  onChange={(e) => {
                    setTargetSlotDate(e.target.value);
                    if (selectedLocForSlots) {
                      fetchSlotsForDate(selectedLocForSlots.id, e.target.value);
                    }
                  }}
                  className="rounded-lg border border-zinc-300 bg-[var(--surface-panel)] px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => selectedLocForSlots && fetchSlotsForDate(selectedLocForSlots.id, targetSlotDate)}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition"
                >
                  Refresh Slots
                </button>
              </div>

              <div>
                <span className="text-xs font-bold text-zinc-700 block mb-2">
                  Open Bookable Slots on {targetSlotDate} ({availableSlots.length})
                </span>
                {loadingSlots ? (
                  <div className="py-8 text-center text-xs text-zinc-500">Calculating real-time slots...</div>
                ) : availableSlots.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-400 italic border border-dashed rounded-lg">
                    No conflict-free slots available on this date for this branch. Ensure technicians are set to On Duty.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableSlots.map((slot, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-teal-200 bg-teal-50/50 p-2 text-center text-xs text-teal-900 font-semibold"
                      >
                        {slot.display_time || slot.start_iso?.split("T")[1]?.slice(0, 5)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase A: Hyper-Local Knowledge & FAQs Modal */}
      {overridesModalOpen && selectedLocForOverrides && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-[var(--surface-panel)] shadow-xl border border-[var(--border-hairline)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5 bg-zinc-50/70">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Local Knowledge &amp; Policies &bull; {selectedLocForOverrides.name}
                </h3>
              </div>
              <button
                onClick={() => setOverridesModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <p className="text-xs text-zinc-500">
                These branch policies are directly injected into the voice AI agent runtime, ensuring 100% accurate hyper-local responses for parking, dispatch fees, and regional licenses.
              </p>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Parking &amp; Arrival Instructions
                </label>
                <textarea
                  rows={2}
                  value={overridesParking}
                  onChange={(e) => setOverridesParking(e.target.value)}
                  placeholder="e.g. Free parking in rear garage off 4th St, enter via Gate B"
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Diagnostic / Dispatch Fee
                  </label>
                  <input
                    type="text"
                    value={overridesFee}
                    onChange={(e) => setOverridesFee(e.target.value)}
                    placeholder="e.g. $89 fee waived with accepted repair"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    State / Trade License #
                  </label>
                  <input
                    type="text"
                    value={overridesLicense}
                    onChange={(e) => setOverridesLicense(e.target.value)}
                    placeholder="e.g. TACLA001234E Master HVAC"
                    className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Branch AI Behavior Overrides */}
              <div className="pt-2 border-t border-zinc-100 space-y-2.5">
                <span className="text-xs font-bold text-zinc-800 block">Branch AI Behavior Overrides</span>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                    Branch Greeting Override (optional)
                  </label>
                  <input
                    type="text"
                    value={overridesGreeting}
                    onChange={(e) => setOverridesGreeting(e.target.value)}
                    placeholder="Thanks for calling our Austin North branch..."
                    className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                      Branch Operational Instructions
                    </label>
                    <input
                      type="text"
                      value={overridesInstructions}
                      onChange={(e) => setOverridesInstructions(e.target.value)}
                      placeholder="e.g. Mention free parking behind Building B."
                      className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-600 block mb-1">
                      Pricing Mode Override
                    </label>
                    <select
                      value={overridesPricingMode}
                      onChange={(e) => setOverridesPricingMode(e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 bg-white"
                    >
                      <option value="">Inherit Tenant Default</option>
                      <option value="no_quote">No Quote</option>
                      <option value="listed">Listed Menu</option>
                      <option value="range">Estimate Range</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Dynamic Q&A editor */}
              <div className="pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-zinc-800">Branch Q&amp;A Overrides ({overridesFaqs.length})</span>
                  <button
                    type="button"
                    onClick={() => setOverridesFaqs([...overridesFaqs, { question: "", answer: "" }])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                  >
                    <Plus className="h-3 w-3" />
                    Add FAQ
                  </button>
                </div>

                <div className="space-y-3">
                  {overridesFaqs.map((faq, idx) => (
                    <div key={idx} className="rounded-lg border border-[var(--border-hairline)] bg-zinc-50/50 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Question #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => setOverridesFaqs(overridesFaqs.filter((_, i) => i !== idx))}
                          className="text-zinc-400 hover:text-rose-600 text-xs"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. Do you service commercial rooftop units?"
                        value={faq.question}
                        onChange={(e) => {
                          const updated = [...overridesFaqs];
                          updated[idx].question = e.target.value;
                          setOverridesFaqs(updated);
                        }}
                        className="w-full rounded border border-zinc-300 bg-[var(--surface-panel)] p-1.5 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                      />
                      <textarea
                        rows={2}
                        placeholder="e.g. Yes, our Austin North crew has commercial cranes and certified journeymen."
                        value={faq.answer}
                        onChange={(e) => {
                          const updated = [...overridesFaqs];
                          updated[idx].answer = e.target.value;
                          setOverridesFaqs(updated);
                        }}
                        className="w-full rounded border border-zinc-300 bg-[var(--surface-panel)] p-1.5 text-xs text-zinc-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  ))}
                  {overridesFaqs.length === 0 && (
                    <div className="py-4 text-center text-xs text-zinc-400 italic border border-dashed rounded-lg">
                      No custom FAQs configured for this location. Click &apos;Add FAQ&apos; to specify branch-specific answers.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
                <button
                  type="button"
                  onClick={() => setOverridesModalOpen(false)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveOverrides}
                  disabled={savingOverrides}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {savingOverrides ? "Saving..." : "Save Policies & FAQs"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase B: Smart Geofencing & Territories Modal */}
      {geofenceModalOpen && selectedLocForGeofence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-[var(--surface-panel)] shadow-xl border border-[var(--border-hairline)] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5 bg-zinc-50/70">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Smart Geofencing &bull; {selectedLocForGeofence.name}
                </h3>
              </div>
              <button
                onClick={() => setGeofenceModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <p className="text-xs text-zinc-500">
                Configure postal codes, neighborhoods, landmarks, and out-of-area fallback surcharges for automated voice routing.
              </p>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Postal / ZIP Codes (comma separated)
                </label>
                <input
                  type="text"
                  value={geofenceZips}
                  onChange={(e) => setGeofenceZips(e.target.value)}
                  placeholder="e.g. 78701, 78702, 78758, 787*"
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-blue-500 font-mono"
                />
                <span className="text-[10px] text-zinc-400 mt-1 block">Wildcard format &apos;787*&apos; matches any zip starting with 787.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Covered Neighborhoods &amp; Landmarks (comma separated)
                </label>
                <input
                  type="text"
                  value={geofenceHoods}
                  onChange={(e) => setGeofenceHoods(e.target.value)}
                  placeholder="e.g. The Domain, Arboretum, Downtown, Westlake, Mueller"
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Covered Cities &amp; Municipalities (comma separated)
                </label>
                <input
                  type="text"
                  value={geofenceCities}
                  onChange={(e) => setGeofenceCities(e.target.value)}
                  placeholder="e.g. Austin, Round Rock, Pflugerville, Cedar Park"
                  className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-zinc-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-zinc-800 block">Allow Out-of-Area Dispatches</span>
                    <span className="text-[10px] text-zinc-400 block">If caller is just outside this territory, dispatch with an extended surcharge instead of declining.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={geofenceAllowsOut}
                    onChange={(e) => setGeofenceAllowsOut(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {geofenceAllowsOut && (
                  <div>
                    <label className="text-xs font-semibold text-zinc-700 block mb-1">
                      Extended Dispatch Surcharge
                    </label>
                    <input
                      type="text"
                      value={geofenceSurcharge}
                      onChange={(e) => setGeofenceSurcharge(e.target.value)}
                      placeholder="e.g. $45 extended travel surcharge"
                      className="w-full rounded-lg border border-zinc-300 p-2 text-xs text-zinc-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
                <button
                  type="button"
                  onClick={() => setGeofenceModalOpen(false)}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGeofence}
                  disabled={savingGeofence}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {savingGeofence ? "Saving..." : "Save Geofence Settings"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unserved Demand Inquiries Modal */}
      {unservedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-[var(--surface-panel)] shadow-xl border border-[var(--border-hairline)] overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-3.5 bg-zinc-50/70">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-zinc-900">
                  Unserved Territory Customer Demand
                </h3>
              </div>
              <button
                onClick={() => setUnservedModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <p className="text-xs text-zinc-500">
                Callers whose location fell outside all active service boundaries. Use these demand signals to prioritize your next technician recruitment or branch expansion.
              </p>

              {loadingUnserved ? (
                <div className="py-8 text-center text-xs text-zinc-500">Loading demand signals...</div>
              ) : unservedItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-400 italic border border-dashed rounded-lg">
                  No unserved territory inquiries recorded yet. All caller inquiries have matched active branches.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-[var(--border-hairline)] rounded-lg overflow-hidden">
                  {unservedItems.map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between bg-[var(--surface-panel)] hover:bg-zinc-50 text-xs">
                      <div>
                        <div className="font-semibold text-zinc-900">{item.requested_location_raw}</div>
                        <div className="text-[11px] font-mono text-zinc-500">{item.caller_phone || "Unknown Phone"} {item.postal_code ? `&bull; ${item.postal_code}` : ""}</div>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
