"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  ShieldAlert,
  LayoutDashboard,
  LogOut,
  Building2,
  PlusCircle,
  CreditCard,
  Tag,
  PhoneCall,
  UserCheck,
  History,
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

function AdminSidebarNav({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "telemetry";

  const getLinkClass = (tabName: string) => {
    const isActive = pathname === "/admin/dashboard" && currentTab === tabName;
    return `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
      isActive
        ? "bg-purple-50 text-purple-700 border border-purple-200/80 shadow-2xs font-bold"
        : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
    }`;
  };

  return (
    <nav className="space-y-1">
      <Link
        href="/admin/dashboard?tab=telemetry"
        onClick={onLinkClick}
        className={getLinkClass("telemetry")}
      >
        <LayoutDashboard className="w-4 h-4 text-purple-600" />
        Platform Command Center
      </Link>

      <div className="pt-3 pb-1">
        <span className="text-[10px] font-mono uppercase text-slate-400 font-bold px-3">
          Agency Operations
        </span>
      </div>

      <Link
        href="/admin/dashboard?tab=tenants"
        onClick={onLinkClick}
        className={getLinkClass("tenants")}
      >
        <Building2 className="w-4 h-4 text-blue-600" />
        Client Tenants &amp; RLS
      </Link>

      <Link
        href="/admin/dashboard?tab=subaccounts"
        onClick={onLinkClick}
        className={getLinkClass("subaccounts")}
      >
        <UserCheck className="w-4 h-4 text-indigo-600" />
        Sub-Accounts &amp; Proxy
      </Link>

      <Link
        href="/admin/dashboard?tab=audit"
        onClick={onLinkClick}
        className={getLinkClass("audit")}
      >
        <History className="w-4 h-4 text-purple-600" />
        Immutable Audit Trail
      </Link>

      <Link
        href="/admin/dashboard?tab=billing"
        onClick={onLinkClick}
        className={getLinkClass("billing")}
      >
        <CreditCard className="w-4 h-4 text-emerald-600" />
        Minute Billing &amp; Rollovers
      </Link>

      <Link
        href="/admin/dashboard?tab=inventory"
        onClick={onLinkClick}
        className={getLinkClass("inventory")}
      >
        <PhoneCall className="w-4 h-4 text-indigo-600" />
        Inbound Phone Inventory
      </Link>

      <Link
        href="/admin/dashboard?tab=coupons"
        onClick={onLinkClick}
        className={getLinkClass("coupons")}
      >
        <Tag className="w-4 h-4 text-amber-600" />
        Coupons &amp; Bonus Credits
      </Link>

      <div className="pt-3 pb-1">
        <span className="text-[10px] font-mono uppercase text-slate-400 font-bold px-3">
          Expansion
        </span>
      </div>

      <Link
        href="/onboarding"
        onClick={onLinkClick}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
          pathname === "/onboarding"
            ? "bg-purple-50 text-purple-700 border border-purple-200/80 font-bold shadow-2xs"
            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
        }`}
      >
        <PlusCircle className="w-4 h-4 text-emerald-600" />
        Onboard New Client
      </Link>
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        const hasToken = typeof window !== "undefined" && !!localStorage.getItem("vedavoice_token");
        if (!hasToken) {
          router.replace("/login");
        }
      } else if (user.role !== "platform_admin") {
        router.replace("/portal/dashboard");
      }
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "platform_admin") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#f8fafc] font-mono text-xs text-slate-500">
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
          <span>Authenticating platform super-admin...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col">
      {/* Mobile Sticky Header (< 1024px) */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-700">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-900 leading-tight">VedaVoice Platform</h2>
            <div className="text-[10px] text-purple-700 font-mono font-semibold">Super-Admin Plane</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle admin menu"
          className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Drawer */}
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
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span className="font-extrabold text-sm tracking-tight text-slate-900">
                      Super-Admin Control
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <Suspense fallback={<div className="h-48" />}>
                  <AdminSidebarNav onLinkClick={() => setMobileMenuOpen(false)} />
                </Suspense>
              </div>

              <div className="p-3 border-t border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
                <div className="truncate pr-2">
                  <div className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</div>
                  <div className="text-[10px] text-purple-700 font-mono">Platform Admin</div>
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

      {/* Desktop Fixed Admin Sidebar */}
      <aside className="hidden lg:flex w-64 fixed inset-y-0 left-0 bg-white border-r border-slate-200/80 z-30 flex-col justify-between">
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-purple-50/50 border border-purple-200/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-widest text-purple-700 uppercase font-bold">
                Control Plane
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-mono font-bold">
                Super-Admin
              </span>
            </div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5 pt-0.5">
              <ShieldAlert className="w-4 h-4 text-purple-600" />
              VedaVoice Platform
            </h2>
          </div>

          {/* Navigation Links wrapped in Suspense for searchParams */}
          <Suspense fallback={<div className="h-64" />}>
            <AdminSidebarNav />
          </Suspense>
        </div>

        {/* User Card */}
        <div className="p-3 border-t border-slate-200/80 bg-slate-50/50">
          <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between shadow-2xs">
            <div className="space-y-0.5 truncate pr-2">
              <div className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</div>
              <div className="text-[10px] text-purple-700 font-mono">Platform Admin</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 active:scale-[0.95]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="lg:ml-64 flex-1 min-h-screen bg-[#f8fafc] p-4 sm:p-8 space-y-8">
        <div className="max-w-7xl mx-auto space-y-8">{children}</div>
      </main>
    </div>
  );
}
