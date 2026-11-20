/**
 * Universal Semantic Industry Abstraction Layer for VedaVoice Calendar & Scheduling.
 *
 * Dynamically adapts terminology, role labels, simulation engines, service types,
 * and operational workflows to match any business niche:
 * - Home Services & Trade Dispatch (HVAC, Plumbing, Electrical)
 * - Dental & Healthcare Practices (Doctors, Hygienists, Operatories)
 * - Law Firms & Legal Counsel (Attorneys, Paralegals, Retainers)
 * - MedSpas, Salons & Wellness (Specialists, Estheticians, Treatment Rooms)
 * - General Professional Appointments & Advisory
 */

export interface IndustrySemanticProfile {
  slug: string;
  name: string;
  category: "home_services" | "dental_clinic" | "legal_intake" | "beauty_wellness" | "general";
  iconName: string;
  // Tab Labels
  staffTabLabel: string;
  staffSingular: string;
  simulatorTabLabel: string;
  simulatorActionLabel: string;
  scheduleMatrixLabel: string;
  // Badges & Metrics
  activeStaffLabel: string;
  readyStatusText: string;
  // Staff Role Options
  staffRoleOptions: Array<{ value: string; label: string }>;
  // Form & Territory Labels
  serviceFieldLabel: string;
  territoryFieldLabel: string;
  territoryPlaceholder: string;
  skillsFieldLabel: string;
  skillsPlaceholder: string;
  emptyStaffTitle: string;
  emptyStaffDesc: string;
  addStaffBtnText: string;
  // Appointment Types & Simulation
  defaultServiceTypes: Array<{ id: string; title: string; durationMinutes: number; fee: string }>;
  defaultSimulationService: string;
  defaultSimulationTerritory: string;
  simulationExplainText: string;
  simulationResultRoleLabel: string;
  simulationPoolLabel: string;
}

export const INDUSTRY_SEMANTIC_PROFILES: Record<string, IndustrySemanticProfile> = {
  home_services: {
    slug: "home_services",
    name: "Home Services (Plumbing, HVAC, Electrical)",
    category: "home_services",
    iconName: "Wrench",
    staffTabLabel: "Technicians",
    staffSingular: "Technician",
    simulatorTabLabel: "Dispatch Simulator",
    simulatorActionLabel: "Simulate Dispatch Routing",
    scheduleMatrixLabel: "Daily Staff Matrix",
    activeStaffLabel: "Active Technicians",
    readyStatusText: "Ready for Dispatch",
    staffRoleOptions: [
      { value: "technician", label: "General Technician" },
      { value: "master_plumber", label: "Master Plumber" },
      { value: "hvac_specialist", label: "HVAC Specialist" },
      { value: "electrician", label: "Journeyman Electrician" },
      { value: "estimator", label: "Senior Estimator" },
    ],
    serviceFieldLabel: "Trade Service Needed",
    territoryFieldLabel: "Service Territory (ZIP Codes)",
    territoryPlaceholder: "78701, 78702, 787*",
    skillsFieldLabel: "Certified Trade Skills",
    skillsPlaceholder: "hvac_repair, water_heater, leak_detection, electrical",
    emptyStaffTitle: "No Technicians Registered",
    emptyStaffDesc: "Add service technicians with specialized trade skills and postal territories to enable automated voice dispatch.",
    addStaffBtnText: "Add Technician",
    defaultServiceTypes: [
      { id: "diagnostic_visit", title: "In-Home Diagnostic & Estimate", durationMinutes: 60, fee: "$89" },
      { id: "emergency_dispatch", title: "24/7 Priority Emergency Dispatch", durationMinutes: 90, fee: "$149" },
      { id: "seasonal_tuneup", title: "HVAC / Water Heater Annual Tune-Up", durationMinutes: 60, fee: "$99" },
      { id: "drain_clearing", title: "Standard Main Line Snaking", durationMinutes: 60, fee: "$189" },
    ],
    defaultSimulationService: "water_heater",
    defaultSimulationTerritory: "78701",
    simulationExplainText: "Simulate an incoming voice call: test which technicians match the trade skill and postal code territory, and observe the round-robin dispatch decision.",
    simulationResultRoleLabel: "Dispatched Technician",
    simulationPoolLabel: "Eligible Technicians",
  },
  dental_clinic: {
    slug: "dental_clinic",
    name: "Dental & Healthcare Practices",
    category: "dental_clinic",
    iconName: "Stethoscope",
    staffTabLabel: "Doctors & Providers",
    staffSingular: "Provider",
    simulatorTabLabel: "Chair & Triage Matcher",
    simulatorActionLabel: "Simulate Patient Assignment",
    scheduleMatrixLabel: "Daily Provider Schedule",
    activeStaffLabel: "Active Providers",
    readyStatusText: "Available for Patients",
    staffRoleOptions: [
      { value: "dentist", label: "General Dentist (DDS / DMD)" },
      { value: "hygienist", label: "Registered Dental Hygienist (RDH)" },
      { value: "orthodontist", label: "Orthodontist Specialist" },
      { value: "periodontist", label: "Periodontist Specialist" },
      { value: "assistant", label: "Certified Dental Assistant" },
    ],
    serviceFieldLabel: "Clinical Treatment Needed",
    territoryFieldLabel: "Operatories & Treatment Rooms",
    territoryPlaceholder: "Operatory 1, Operatory 2, Chair A, Suite 300",
    skillsFieldLabel: "Clinical Specialties & Licensing",
    skillsPlaceholder: "general_dentistry, prophylaxis, endodontics, orthodontics, oral_surgery",
    emptyStaffTitle: "No Healthcare Providers Registered",
    emptyStaffDesc: "Add doctors, dentists, hygienists, and specialists with clinical credentials to enable automated voice scheduling.",
    addStaffBtnText: "Add Healthcare Provider",
    defaultServiceTypes: [
      { id: "routine_cleaning", title: "Comprehensive Dental Exam & Cleaning", durationMinutes: 60, fee: "$150" },
      { id: "emergency_pain", title: "Emergency Toothache & Triage Exam", durationMinutes: 45, fee: "$95" },
      { id: "invisalign_consult", title: "Cosmetic & Orthodontic Consultation", durationMinutes: 30, fee: "Free" },
      { id: "restorative_crown", title: "Crown / Filling Consultation", durationMinutes: 60, fee: "$220" },
    ],
    defaultSimulationService: "routine_cleaning",
    defaultSimulationTerritory: "Operatory 1",
    simulationExplainText: "Simulate an incoming patient call: test which provider matches the clinical treatment specialty and operatory chair, and observe the intelligent triage decision.",
    simulationResultRoleLabel: "Matched Clinical Provider",
    simulationPoolLabel: "Eligible Providers",
  },
  legal_intake: {
    slug: "legal_intake",
    name: "Law Firms & Legal Practices",
    category: "legal_intake",
    iconName: "Scale",
    staffTabLabel: "Attorneys & Counsel",
    staffSingular: "Attorney",
    simulatorTabLabel: "Case Intake Matcher",
    simulatorActionLabel: "Simulate Attorney Matching",
    scheduleMatrixLabel: "Daily Attorney Calendar",
    activeStaffLabel: "Active Attorneys",
    readyStatusText: "Available for Consultations",
    staffRoleOptions: [
      { value: "managing_partner", label: "Managing Partner" },
      { value: "associate_attorney", label: "Associate Attorney" },
      { value: "trial_counsel", label: "Litigation & Trial Counsel" },
      { value: "paralegal", label: "Senior Paralegal" },
      { value: "intake_specialist", label: "Legal Intake Specialist" },
    ],
    serviceFieldLabel: "Practice Area / Case Type",
    territoryFieldLabel: "Offices & Court Jurisdictions",
    territoryPlaceholder: "Travis County, Federal District, Austin Office",
    skillsFieldLabel: "Practice Areas & Retainer Tier",
    skillsPlaceholder: "family_law, personal_injury, criminal_defense, estate_planning, corporate",
    emptyStaffTitle: "No Attorneys Registered",
    emptyStaffDesc: "Add partners, associates, and paralegals with practice area specializations to enable automated client consultation bookings.",
    addStaffBtnText: "Add Attorney",
    defaultServiceTypes: [
      { id: "initial_consult", title: "Initial Confidential Legal Consultation", durationMinutes: 45, fee: "$150" },
      { id: "personal_injury_eval", title: "Free Accident Case Evaluation", durationMinutes: 30, fee: "Free" },
      { id: "estate_planning", title: "Will & Trust Estate Planning Session", durationMinutes: 60, fee: "$250" },
      { id: "corporate_retainer", title: "Business & Contract Advisory Review", durationMinutes: 60, fee: "$350" },
    ],
    defaultSimulationService: "initial_consult",
    defaultSimulationTerritory: "Austin Office",
    simulationExplainText: "Simulate an incoming client call: test which attorney matches the practice area and legal jurisdiction, and observe the round-robin consultation assignment.",
    simulationResultRoleLabel: "Matched Legal Counsel",
    simulationPoolLabel: "Eligible Attorneys",
  },
  beauty_wellness: {
    slug: "beauty_wellness",
    name: "MedSpas, Salons & Wellness Centers",
    category: "beauty_wellness",
    iconName: "Sparkles",
    staffTabLabel: "Specialists & Therapists",
    staffSingular: "Specialist",
    simulatorTabLabel: "Treatment Room Matcher",
    simulatorActionLabel: "Simulate Treatment Booking",
    scheduleMatrixLabel: "Daily Specialist Matrix",
    activeStaffLabel: "Active Specialists",
    readyStatusText: "Available for Clients",
    staffRoleOptions: [
      { value: "esthetician", label: "Lead Licensed Esthetician" },
      { value: "injector", label: "Medical Aesthetic Injector (RN/NP)" },
      { value: "therapist", label: "Licensed Massage Therapist (LMT)" },
      { value: "laser_specialist", label: "Certified Laser Specialist" },
      { value: "spa_coordinator", label: "Spa Coordinator" },
    ],
    serviceFieldLabel: "Treatment / Modality Requested",
    territoryFieldLabel: "Treatment Rooms & Stations",
    territoryPlaceholder: "Room 1 (Laser), Room 2 (Facials), Cabana A",
    skillsFieldLabel: "Treatment Certifications",
    skillsPlaceholder: "hydrafacial, botox_injections, deep_tissue, laser_hair_removal",
    emptyStaffTitle: "No Specialists Registered",
    emptyStaffDesc: "Add licensed estheticians, massage therapists, and injectors to enable automated voice booking.",
    addStaffBtnText: "Add Specialist",
    defaultServiceTypes: [
      { id: "hydrafacial_deluxe", title: "Deluxe Medical Grade HydraFacial", durationMinutes: 60, fee: "$199" },
      { id: "botox_consultation", title: "Injectables & Botox Consultation", durationMinutes: 30, fee: "Free" },
      { id: "deep_tissue_massage", title: "60-Minute Therapeutic Deep Tissue", durationMinutes: 60, fee: "$120" },
      { id: "laser_consult", title: "Laser Skin Resurfacing Assessment", durationMinutes: 45, fee: "$75" },
    ],
    defaultSimulationService: "hydrafacial_deluxe",
    defaultSimulationTerritory: "Room 1 (Laser)",
    simulationExplainText: "Simulate an incoming client call: test which specialist matches the treatment modality and room equipment, and observe the booking assignment.",
    simulationResultRoleLabel: "Assigned Specialist",
    simulationPoolLabel: "Eligible Specialists",
  },
  general: {
    slug: "general",
    name: "General Appointments & Advisory",
    category: "general",
    iconName: "Calendar",
    staffTabLabel: "Team Members & Staff",
    staffSingular: "Staff Member",
    simulatorTabLabel: "Smart Booking Matcher",
    simulatorActionLabel: "Simulate Smart Routing",
    scheduleMatrixLabel: "Daily Staff Matrix",
    activeStaffLabel: "Active Staff",
    readyStatusText: "Ready for Appointments",
    staffRoleOptions: [
      { value: "consultant", label: "Senior Consultant" },
      { value: "advisor", label: "Client Advisor" },
      { value: "manager", label: "Practice / Operations Manager" },
      { value: "specialist", label: "Client Specialist" },
      { value: "associate", label: "Associate" },
    ],
    serviceFieldLabel: "Appointment Type",
    territoryFieldLabel: "Service Areas / Locations",
    territoryPlaceholder: "Main Office, Virtual / Zoom, Downtown Branch",
    skillsFieldLabel: "Services & Expertise",
    skillsPlaceholder: "consulting, customer_support, sales_demo, onboarding",
    emptyStaffTitle: "No Team Members Registered",
    emptyStaffDesc: "Add team members with specialized expertise to enable automated voice agent scheduling.",
    addStaffBtnText: "Add Staff Member",
    defaultServiceTypes: [
      { id: "initial_meeting", title: "Introductory Discovery Call", durationMinutes: 30, fee: "Free" },
      { id: "strategy_session", title: "In-Depth Strategy & Consultation", durationMinutes: 60, fee: "$150" },
      { id: "general_appointment", title: "Standard Service Appointment", durationMinutes: 45, fee: "$75" },
    ],
    defaultSimulationService: "initial_meeting",
    defaultSimulationTerritory: "Main Office",
    simulationExplainText: "Simulate an incoming voice call: test which staff member matches the appointment type and location, and observe the round-robin scheduling decision.",
    simulationResultRoleLabel: "Assigned Staff Member",
    simulationPoolLabel: "Eligible Team Members",
  },
};

export function resolveIndustrySemantics(packSlug?: string | null): IndustrySemanticProfile {
  if (!packSlug) return INDUSTRY_SEMANTIC_PROFILES.home_services;
  const normalized = packSlug.toLowerCase().trim();
  if (
    normalized.includes("dental") ||
    normalized.includes("health") ||
    normalized.includes("clinic") ||
    normalized.includes("medical")
  ) {
    return INDUSTRY_SEMANTIC_PROFILES.dental_clinic;
  }
  if (
    normalized.includes("legal") ||
    normalized.includes("law") ||
    normalized.includes("attorney")
  ) {
    return INDUSTRY_SEMANTIC_PROFILES.legal_intake;
  }
  if (
    normalized.includes("beauty") ||
    normalized.includes("spa") ||
    normalized.includes("salon") ||
    normalized.includes("wellness")
  ) {
    return INDUSTRY_SEMANTIC_PROFILES.beauty_wellness;
  }
  if (
    normalized.includes("home") ||
    normalized.includes("hvac") ||
    normalized.includes("plumb") ||
    normalized.includes("trade") ||
    normalized.includes("electric")
  ) {
    return INDUSTRY_SEMANTIC_PROFILES.home_services;
  }
  return INDUSTRY_SEMANTIC_PROFILES.general;
}
