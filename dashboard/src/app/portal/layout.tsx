"use client";

import React, { useEffect } from "react";
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
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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

  if (loading || !user || (user.role === "platform_admin" && !user.is_impersonated)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#fbfbfd] font-mono text-xs text-zinc-500">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
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
    { label: "Native CRM Pipeline", href: "/portal/crm", icon: Users },
    { label: "Integrations & Sync", href: "/portal/integrations", icon: Share2 },
    { label: "Knowledge Base RAG", href: "/portal/knowledge", icon: BookOpen },
    { label: "Staff & Dispatch", href: "/portal/calendar", icon: Calendar },
    { label: "Locations & Branches", href: "/portal/locations", icon: MapPin },
    { label: "Industry Packs", href: "/portal/packs", icon: Briefcase },
    { label: "Receptionist Config", href: "/portal/profile", icon: Settings2 },
    { label: "Lead Form Builder", href: "/portal/forms", icon: FileText },
    { label: "Billing & Minutes", href: "/portal/billing", icon: CreditCard },
  ];

  return (
    <div className={`flex min-h-screen bg-[#fbfbfd] text-zinc-900 font-sans antialiased ${user.is_impersonated ? "pt-10" : ""}`}>
      {/* Sticky Impersonation Session Banner */}
      {user.is_impersonated && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm border-b border-amber-600/30">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 text-amber-950 shrink-0" />
            <span className="px-1.5 py-0.5 rounded bg-amber-900 text-amber-100 font-mono uppercase text-[10px] tracking-wider font-bold">
              Impersonation Active
            </span>
            <span className="truncate">
              Operating on behalf of <strong>{user.tenant_name}</strong> ({user.tenant_id}) as <em>{user.impersonator_email || "Agency Operator"}</em>.
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

      {/* Modern High-Precision Sidebar */}
      <aside className={`w-64 fixed inset-y-0 left-0 bg-white border-r border-zinc-200/80 z-30 flex flex-col justify-between ${user.is_impersonated ? "top-10" : ""}`}>
        <div className="p-4 space-y-6">
          {/* Tenant Identity & Status */}
          <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center font-bold text-white text-xs shadow-sm">
                  {user.tenant_name ? user.tenant_name.charAt(0).toUpperCase() : "V"}
                </div>
                <div className="truncate">
                  <h2 className="text-xs font-bold text-zinc-900 truncate leading-tight">
                    {user.tenant_name || "VedaVoice Client"}
                  </h2>
                  <div className="text-[10px] text-zinc-500 font-mono truncate">
                    ID: {user.tenant_id}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 text-[10px] font-mono">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>SIP Link Active</span>
              </div>
              <span className="text-zinc-500">LiveKit Scale</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
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
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group active:scale-[0.98] ${
                      active
                        ? "bg-zinc-900 text-white font-semibold shadow-sm"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-700"}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {active && <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer User Card */}
        <div className="p-3 border-t border-zinc-200/80 bg-zinc-50/50">
          <div className="p-2.5 rounded-xl bg-white border border-zinc-200/80 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="space-y-0.5 truncate pr-2">
              <div className="text-xs font-semibold text-zinc-900 truncate">{user.full_name}</div>
              <div className="text-[10px] text-zinc-500 font-mono capitalize truncate">
                {user.role.replace("_", " ")}
              </div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 active:scale-[0.95]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="ml-64 flex-1 min-h-screen bg-[#fbfbfd] p-6 sm:p-10">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
