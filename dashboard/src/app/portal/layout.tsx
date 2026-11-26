"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  PhoneCall,
  LayoutDashboard,
  Settings2,
  LogOut,
  FileText,
  CreditCard,
  Users,
  Share2,
  AlertTriangle,
  BookOpen,
  Calendar,
  Briefcase,
  MapPin,
  Radio,
  ChevronRight,
  Menu,
  X,
  Sparkles,
  Mic,
  FileCheck2,
  Receipt,
} from "lucide-react";
import { api } from "@/lib/api";
import { LiveRadarRing } from "@/components/ui/motion";
import { AnimatePresence, motion } from "framer-motion";
import { TestCallProvider, useTestCall } from "@/context/test-call-context";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <TestCallProvider>
      <PortalLayoutInner>{children}</PortalLayoutInner>
    </TestCallProvider>
  );
}

function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { startTestCall, isConnecting, isCallActive, duration } = useTestCall();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        const hasToken = typeof window !== "undefined" && !!localStorage.getItem("vedavoice_token");
        if (!hasToken) {
          router.replace("/login");
        }
      } else if (user.role === "platform_admin" && !user.is_impersonated) {
        router.replace("/admin/dashboard");
      }
    }
  }, [user, loading, router]);

  // Close mobile drawer when navigating
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (loading || !user || (user.role === "platform_admin" && !user.is_impersonated)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-canvas)] font-mono text-xs text-[var(--ink-muted)]">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[var(--surface-panel)] border border-[var(--border-hairline)] shadow-xs">
          <LiveRadarRing color="emerald" size="sm" />
          <span>Authenticating client workspace...</span>
        </div>
      </div>
    );
  }

  const handleExitImpersonation = async () => {
    await api.exitImpersonation();
    window.location.href = "/admin/dashboard?tab=subaccounts";
  };

  const navItems = [
    { label: "Dashboard Overview", href: "/portal/dashboard", icon: LayoutDashboard },
    { label: "Call Explorer & Audio", href: "/portal/calls", icon: PhoneCall },
    { label: "Outbound Campaigns", href: "/portal/campaigns", icon: Radio },
    { label: "Native CRM Pipeline", href: "/portal/crm", icon: Users },
    { label: "Integrations & Sync", href: "/portal/integrations", icon: Share2 },
    { label: "Knowledge Base RAG", href: "/portal/knowledge", icon: BookOpen },
    { label: "Staff & Dispatch", href: "/portal/calendar", icon: Calendar },
    { label: "Quotes & Estimates", href: "/portal/quotes", icon: FileCheck2 },
    { label: "Customer Invoices", href: "/portal/invoices", icon: Receipt },
    { label: "Locations & Branches", href: "/portal/locations", icon: MapPin },
    { label: "Industry Packs", href: "/portal/packs", icon: Briefcase },
    { label: "Receptionist Config", href: "/portal/profile", icon: Settings2 },
    { label: "Lead Form Builder", href: "/portal/forms", icon: FileText },
    { label: "Billing & Minutes", href: "/portal/billing", icon: CreditCard },
  ];

  return (
    <div
      className={`min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-sans antialiased flex flex-col ${
        user.is_impersonated ? "pt-10" : ""
      }`}
    >
      {/* Sticky Impersonation Session Banner */}
      {user.is_impersonated && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm border-b border-amber-600/30">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-amber-950 shrink-0" />
            <span className="px-1.5 py-0.5 rounded bg-amber-900 text-amber-100 font-mono uppercase text-[10px] tracking-wider font-bold">
              Impersonation Active
            </span>
            <span className="truncate">
              Operating on behalf of <strong>{user.tenant_name}</strong> ({user.tenant_id}) as{" "}
              <em>{user.impersonator_email || "Agency Operator"}</em>.
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="px-3 py-1 bg-amber-950 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors flex items-center gap-1.5 shrink-0 ml-4 active:scale-[0.98]"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      {/* Mobile Sticky Header (< 1024px) */}
      <header className="lg:hidden sticky top-0 z-40 bg-[var(--surface-panel)]/95 backdrop-blur-md border-b border-[var(--border-hairline)] px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 truncate">
          <div className="w-8 h-8 rounded-lg bg-[var(--ink-primary)] flex items-center justify-center font-mono font-bold text-[var(--surface-panel)] text-xs shrink-0">
            {user.tenant_name ? user.tenant_name.charAt(0).toUpperCase() : "V"}
          </div>
          <div className="truncate">
            <h2 className="text-xs font-bold text-[var(--ink-primary)] leading-tight truncate">
              {user.tenant_name || "VedaVoice Client"}
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-mono font-semibold">
              <LiveRadarRing color="emerald" size="sm" />
              <span>SIP Active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={startTestCall}
            disabled={isConnecting}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-signal)] text-[var(--accent-signal-ink)] active:scale-[0.98] text-xs font-semibold flex items-center gap-1.5"
            title="Launch in-browser WebRTC test call"
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono tabular-nums">
              {isConnecting ? "Connecting..." : isCallActive ? `Live (${duration}s)` : "Test Call"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
            className="p-2 rounded-lg border border-[var(--border-hairline)] text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-in Drawer with Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="lg:hidden fixed inset-y-0 left-0 w-72 bg-white z-50 flex flex-col justify-between shadow-xl border-r border-slate-200"
            >
              <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(100vh-80px)]">
                {/* Header in Drawer */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="font-extrabold text-sm tracking-tight text-slate-900">
                      VedaVoice Client
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tenant Card */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-white text-xs shadow-xs">
                      {user.tenant_name ? user.tenant_name.charAt(0).toUpperCase() : "V"}
                    </div>
                    <div className="truncate">
                      <h2 className="text-xs font-bold text-slate-900 truncate leading-tight">
                        {user.tenant_name || "VedaVoice Client"}
                      </h2>
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        ID: {user.tenant_id}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[10px] font-mono">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <LiveRadarRing color="emerald" size="sm" />
                      <span>SIP Link Active</span>
                    </div>
                    <span className="text-slate-500">LiveKit Scale</span>
                  </div>
                </div>

                {/* Nav Links */}
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                          active
                            ? "bg-indigo-50 border border-indigo-200/80 text-indigo-700 font-bold shadow-2xs"
                            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              active ? "text-indigo-600" : "text-slate-400"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {active && <ChevronRight className="w-3.5 h-3.5 text-indigo-500" />}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Mobile Drawer Footer */}
              <div className="p-3 border-t border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
                <div className="truncate pr-2">
                  <div className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</div>
                  <div className="text-[10px] text-slate-500 font-mono capitalize truncate">
                    {user.role.replace("_", " ")}
                  </div>
                </div>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar (lg:flex) */}
      <aside
        className={`hidden lg:flex w-64 fixed inset-y-0 left-0 bg-[var(--surface-panel)] border-r border-[var(--border-hairline)] z-30 flex-col justify-between ${
          user.is_impersonated ? "top-10" : ""
        }`}
      >
        <div className="p-4 space-y-6">
          {/* Tenant Identity & Status */}
          <div className="p-3.5 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-hairline)] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 truncate">
                <div className="w-8 h-8 rounded-lg bg-[var(--ink-primary)] flex items-center justify-center font-mono font-bold text-[var(--surface-panel)] text-xs shrink-0">
                  {user.tenant_name ? user.tenant_name.charAt(0).toUpperCase() : "V"}
                </div>
                <div className="truncate">
                  <h2 className="text-xs font-bold text-[var(--ink-primary)] truncate leading-tight">
                    {user.tenant_name || "VedaVoice Client"}
                  </h2>
                  <div className="text-[10px] text-[var(--ink-muted)] font-mono truncate">
                    ID: {user.tenant_id}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border-hairline)] text-[10px] font-mono">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <LiveRadarRing color="emerald" size="sm" />
                <span>SIP Link Active</span>
              </div>
              <span className="text-[var(--ink-muted)]">LiveKit Scale</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-muted)] font-bold">
              Operations &amp; Intelligence
            </div>
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors group active:scale-[0.98] ${
                      active
                        ? "bg-[var(--ink-primary)] text-[var(--surface-panel)] font-semibold"
                        : "text-[var(--ink-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-primary)]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          active
                            ? "text-[var(--accent-signal)]"
                            : "text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)]"
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {active && (
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--accent-signal)] shrink-0" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer User Card */}
        <div className="p-3 border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
          <div className="p-2.5 rounded-lg bg-[var(--surface-panel)] border border-[var(--border-hairline)] flex items-center justify-between">
            <div className="space-y-0.5 truncate pr-2">
              <div className="text-xs font-semibold text-[var(--ink-primary)] truncate">{user.full_name}</div>
              <div className="text-[10px] text-[var(--ink-muted)] font-mono capitalize truncate">
                {user.role.replace("_", " ")}
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-rose-600 hover:bg-rose-500/10 transition-colors shrink-0 active:scale-[0.95]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="lg:ml-64 flex-1 min-h-screen bg-[var(--surface-canvas)] p-4 sm:p-8 lg:p-10">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Universal Sticky Action Header across all modules */}
          <div className="bg-[var(--surface-panel)]/90 backdrop-blur-md rounded-xl border border-[var(--border-hairline)] px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-mono font-medium text-emerald-700">
                <LiveRadarRing color="emerald" size="sm" />
                <span>LiveKit Telephony Online</span>
              </div>
              <span className="text-[var(--border-hairline)] hidden md:inline">•</span>
              <span className="text-xs text-[var(--ink-muted)] hidden md:inline font-mono">
                Sub-second Browser &amp; SIP Voice
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={startTestCall}
                disabled={isConnecting}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[var(--accent-signal)] hover:opacity-90 active:scale-[0.98] disabled:opacity-50 text-[var(--accent-signal-ink)] text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                title="Launch instant browser WebRTC test call connected to your AI receptionist"
              >
                <Mic className="w-4 h-4" />
                <span className="font-mono tabular-nums">
                  {isConnecting
                    ? "Connecting LiveKit..."
                    : isCallActive
                    ? `In Test Call (${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")})`
                    : "Test Voice Call (WebRTC)"}
                </span>
              </button>
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
