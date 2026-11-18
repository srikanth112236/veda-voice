"use client";

import React, { useEffect, useState } from "react";
import {
  Calendar as CalendarIcon,
  Users,
  MapPin,
  Wrench,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  ShieldAlert,
  Zap,
} from "lucide-react";
import {
  api,
  StaffMember,
  DispatchPreviewResult,
  RosterSchedule,
} from "@/lib/api";

export default function StaffAndDispatchPage() {
  const [activeTab, setActiveTab] = useState<"roster" | "simulator" | "schedule">("roster");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rosterSchedule, setRosterSchedule] = useState<RosterSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New staff modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("technician");
  const [newSkills, setNewSkills] = useState("hvac_repair, water_heater");
  const [newTerritories, setNewTerritories] = useState("78701, 78702, 787*");
  const [newPriority, setNewPriority] = useState(1);

  // Dispatch Simulator state
  const [simService, setSimService] = useState("water_heater");
  const [simZip, setSimZip] = useState("78701");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<DispatchPreviewResult | null>(null);

  // Schedule date state
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [staffData, scheduleData] = await Promise.all([
        api.listStaffMembers(true),
        api.getRosterSchedule(targetDate),
      ]);
      setStaffList(staffData);
      setRosterSchedule(scheduleData);
    } catch (err: any) {
      setError(err?.message || "Failed to load technician roster.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [targetDate]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    setSubmitting(true);
    try {
      const parsedSkills = newSkills
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const parsedTerritories = newTerritories
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

      await api.createStaffMember({
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        role: newRole,
        skills: parsedSkills,
        service_territory_zips: parsedTerritories,
        priority_weight: newPriority,
        is_active: true,
      });

      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error creating technician.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStaff = async (staffId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove technician ${name}?`)) return;
    try {
      await api.deleteStaffMember(staffId);
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error removing staff member.");
    }
  };

  const handleToggleActive = async (staff: StaffMember) => {
    try {
      await api.updateStaffMember(staff.id, { is_active: !staff.is_active });
      await loadData();
    } catch (err: any) {
      alert(err?.message || "Error updating technician status.");
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulating(true);
    try {
      const result = await api.previewDispatchRouting({
        service_type: simService.trim(),
        postal_code: simZip.trim(),
      });
      setSimResult(result);
    } catch (err: any) {
      alert(err?.message || "Dispatch simulation failed.");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Milestone M10b
            </span>
            <span className="text-xs font-mono text-zinc-500">FR-CAL-9 to 15</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mt-1">
            Staff Rosters & Dispatch Routing
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Manage multi-technician dispatch calendars, skill-based trade routing, and territory zip codes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800 transition"
          >
            <Plus className="w-4 h-4" />
            Add Technician
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            className="p-2 border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-100 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("roster")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "roster"
              ? "border-zinc-900 text-zinc-900 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Users className="w-4 h-4" />
          Technician Rosters ({staffList.length})
        </button>
        <button
          onClick={() => setActiveTab("simulator")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "simulator"
              ? "border-zinc-900 text-zinc-900 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          Dispatch Simulator
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition ${
            activeTab === "schedule"
              ? "border-zinc-900 text-zinc-900 font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Daily Schedule Matrix
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* TAB 1: TECHNICIAN ROSTER */}
      {activeTab === "roster" && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-sm font-mono text-zinc-400">Loading technician roster...</div>
          ) : staffList.length === 0 ? (
            <div className="border border-dashed border-zinc-300 rounded-xl p-10 text-center">
              <Users className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-zinc-800">No Technicians Registered</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1 mb-4">
                Add technicians with specialized skills and service territories to enable automated round-robin voice scheduling.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-semibold"
              >
                Add Your First Technician
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffList.map((staff) => (
                <div
                  key={staff.id}
                  className={`border rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between transition ${
                    staff.is_active ? "border-zinc-200" : "border-zinc-200 bg-zinc-50 opacity-75"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900">{staff.name}</h3>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                              staff.is_active
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                            }`}
                          >
                            {staff.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-mono capitalize mt-0.5">
                          {staff.role.replace("_", " ")}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono text-[10px]">
                        Weight: {staff.priority_weight}x
                      </span>
                    </div>

                    <div className="text-xs space-y-1 text-zinc-600 font-mono">
                      <div>Email: {staff.email}</div>
                      {staff.phone && <div>Phone: {staff.phone}</div>}
                    </div>

                    {/* Skills */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-zinc-400" />
                        Qualified Skills:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {staff.skills.length > 0 ? (
                          staff.skills.map((skill, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-mono"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">All skills (General Tech)</span>
                        )}
                      </div>
                    </div>

                    {/* Territories */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-zinc-400" />
                        Service Territories:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {staff.service_territory_zips.length > 0 ? (
                          staff.service_territory_zips.map((zip, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-zinc-100 text-zinc-700 border border-zinc-200 rounded text-[10px] font-mono"
                            >
                              {zip}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">All areas</span>
                        )}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span>Jobs Today: {staff.today_bookings_count}</span>
                      <span>
                        {staff.last_assigned_at
                          ? `Last: ${new Date(staff.last_assigned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : "Never assigned"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-end gap-2 border-t border-zinc-100 mt-4">
                    <button
                      onClick={() => handleToggleActive(staff)}
                      className="px-2.5 py-1 text-xs border border-zinc-200 rounded text-zinc-600 hover:bg-zinc-50"
                    >
                      {staff.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(staff.id, staff.name)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 rounded transition"
                      title="Delete Technician"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DISPATCH SIMULATOR */}
      {activeTab === "simulator" && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Real-Time Dispatch Simulator
            </h2>
            <p className="text-xs text-zinc-500 mt-1 mb-4">
              Simulate an incoming voice call: test which technicians match the service skill and postal code territory, and observe the round-robin routing decision.
            </p>

            <form onSubmit={handleRunSimulation} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Service Type</label>
                <input
                  type="text"
                  value={simService}
                  onChange={(e) => setSimService(e.target.value)}
                  placeholder="e.g. water_heater, hvac_repair, drain_snaking"
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Customer Zip Code</label>
                <input
                  type="text"
                  value={simZip}
                  onChange={(e) => setSimZip(e.target.value)}
                  placeholder="e.g. 78701 or 90210"
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={simulating}
                  className="w-full py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold hover:bg-zinc-800 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {simulating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Simulate Dispatch
                </button>
              </div>
            </form>
          </div>

          {simResult && (
            <div className="space-y-4">
              {/* Decision Box */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Dispatcher Decision: Round-Robin Selected
                </div>
                {simResult.chosen_technician ? (
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-emerald-100 shadow-sm">
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900">{simResult.chosen_technician.name}</h4>
                      <p className="text-xs text-zinc-500 font-mono capitalize">
                        Role: {simResult.chosen_technician.role.replace("_", " ")}
                      </p>
                    </div>
                    <div className="text-xs font-mono text-zinc-600">
                      <div>Email: {simResult.chosen_technician.email}</div>
                      <div>Phone: {simResult.chosen_technician.phone || "N/A"}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      Assigned to Appointment
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600 mt-2 font-mono">
                    No available technician matched both requirements or all qualified staff are fully booked at this slot.
                  </div>
                )}
              </div>

              {/* Eligible Pool */}
              <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider mb-3">
                  Qualified Pool ({simResult.eligible_technicians_count} Eligible)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {simResult.eligible_technicians.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border text-xs font-mono ${
                        simResult.chosen_technician?.id === t.id
                          ? "border-emerald-500 bg-emerald-50/50"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <div className="font-bold text-zinc-900">{t.name}</div>
                      <div className="text-[11px] text-zinc-500 capitalize">{t.role.replace("_", " ")}</div>
                      <div className="text-[10px] text-zinc-400 mt-1">Weight: {t.priority_weight}x</div>
                      <div className="text-[10px] text-zinc-400">
                        Last Assigned:{" "}
                        {t.last_assigned_at
                          ? new Date(t.last_assigned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "None"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DAILY ROSTER SCHEDULE */}
      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-zinc-500" />
              <div>
                <h3 className="text-xs font-bold text-zinc-900">Select Date for Schedule Overview</h3>
                <p className="text-[11px] text-zinc-500 font-mono">Inspecting booked appointments across technicians</p>
              </div>
            </div>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="text-xs px-3 py-1.5 border border-zinc-300 rounded-lg font-mono focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div className="space-y-3">
            {rosterSchedule.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-400">No appointments scheduled for {targetDate}.</div>
            ) : (
              rosterSchedule.map((entry) => (
                <div key={entry.technician_id} className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-zinc-900">{entry.technician_name}</span>
                      <span className="text-[10px] font-mono text-zinc-500 capitalize">({entry.role.replace("_", " ")})</span>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                      {entry.bookings.length} {entry.bookings.length === 1 ? "Job" : "Jobs"}
                    </span>
                  </div>

                  {entry.bookings.length === 0 ? (
                    <div className="text-[11px] font-mono text-zinc-400 italic py-1">No bookings for this date. Available for dispatch.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {entry.bookings.map((b) => (
                        <div key={b.id} className="p-2.5 rounded bg-zinc-50 border border-zinc-200 text-xs font-mono">
                          <div className="font-bold text-zinc-900 truncate">{b.customer_name}</div>
                          <div className="text-[11px] text-zinc-500">{b.service_type.replace("_", " ")}</div>
                          <div className="text-[10px] text-zinc-400 mt-1">
                            {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                            {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          {b.postal_code && <div className="text-[10px] text-blue-600 mt-0.5">Zip: {b.postal_code}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CREATE STAFF MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">Add Dispatch Technician</h3>
            <p className="text-xs text-zinc-500">
              Configure technician credentials, certified skills, and territory zip code routing.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Technician Full Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Mike Callahan"
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="mike@contractor.com"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+15125550199"
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="technician">General Technician</option>
                    <option value="master_plumber">Master Plumber</option>
                    <option value="hvac_specialist">HVAC Specialist</option>
                    <option value="electrician">Journeyman Electrician</option>
                    <option value="estimator">Senior Estimator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Priority Weight</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(parseInt(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                  >
                    <option value="1">1x (Standard)</option>
                    <option value="2">2x (High)</option>
                    <option value="3">3x (Preferred)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Skills (comma separated)
                </label>
                <input
                  type="text"
                  value={newSkills}
                  onChange={(e) => setNewSkills(e.target.value)}
                  placeholder="water_heater, drain_snaking, gas_leak"
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-0.5">Leave empty if technician handles all calls.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Service Territories / Zip Codes (comma separated)
                </label>
                <input
                  type="text"
                  value={newTerritories}
                  onChange={(e) => setNewTerritories(e.target.value)}
                  placeholder="78701, 78702, 787*"
                  className="w-full text-xs px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-0.5">Supports exact zip codes or wildcards (e.g. 787*).</p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 text-xs bg-zinc-900 text-white rounded-lg font-semibold hover:bg-zinc-800 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Save Technician"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
