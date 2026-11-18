"use client";

import React, { Suspense, useEffect } from "react";
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
} from "lucide-react";

function AdminSidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "telemetry";

  const getLinkClass = (tabName: string) => {
    const isActive = pathname === "/admin/dashboard" && currentTab === tabName;
    return `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
      isActive
        ? "bg-zinc-900 text-white shadow-sm"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    }`;
  };

  return (
    <nav className="space-y-1">
      <Link
        href="/admin/dashboard?tab=telemetry"
        className={getLinkClass("telemetry")}
      >
        <LayoutDashboard className="w-4 h-4 text-indigo-500" />
        Platform Command Center
      </Link>

      <div className="pt-3 pb-1">
        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold px-3">
          Agency Operations
        </span>
      </div>

      <Link
        href="/admin/dashboard?tab=tenants"
        className={getLinkClass("tenants")}
      >
        <Building2 className="w-4 h-4 text-blue-600" />
        Client Tenants &amp; RLS
      </Link>

      <Link
        href="/admin/dashboard?tab=subaccounts"
        className={getLinkClass("subaccounts")}
      >
        <UserCheck className="w-4 h-4 text-indigo-600" />
        Sub-Accounts &amp; Proxy
      </Link>

      <Link
        href="/admin/dashboard?tab=audit"
        className={getLinkClass("audit")}
      >
        <History className="w-4 h-4 text-purple-600" />
        Immutable Audit Trail
      </Link>

      <Link
        href="/admin/dashboard?tab=billing"
        className={getLinkClass("billing")}
      >
        <CreditCard className="w-4 h-4 text-emerald-600" />
        Minute Billing &amp; Rollovers
      </Link>

      <Link
        href="/admin/dashboard?tab=inventory"
        className={getLinkClass("inventory")}
      >
        <PhoneCall className="w-4 h-4 text-indigo-600" />
        Inbound Phone Inventory
      </Link>

      <Link
        href="/admin/dashboard?tab=coupons"
        className={getLinkClass("coupons")}
      >
        <Tag className="w-4 h-4 text-amber-600" />
        Coupons &amp; Bonus Credits
      </Link>

      <div className="pt-3 pb-1">
        <span className="text-[10px] font-mono uppercase text-zinc-400 font-bold px-3">
          Expansion
        </span>
      </div>

      <Link
        href="/onboarding"
        className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
          pathname === "/onboarding"
            ? "bg-zinc-900 text-white shadow-sm"
            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
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
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 font-mono text-xs text-zinc-500">
        Authenticating platform super-admin...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Fixed Admin Sidebar */}
      <aside className="w-64 fixed inset-y-0 left-0 bg-white border-r border-zinc-200 z-30 flex flex-col justify-between">
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-widest text-indigo-600 uppercase font-bold">
                Agency Control Plane
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-semibold">
                Super-Admin
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-indigo-600" />
              VedaVoice Platform
            </h2>
          </div>

          {/* Navigation Links wrapped in Suspense for searchParams */}
          <Suspense fallback={<div className="h-64" />}>
            <AdminSidebarNav />
          </Suspense>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-zinc-200 flex items-center justify-between">
          <div className="space-y-0.5 truncate pr-2">
            <div className="text-xs font-bold text-zinc-900 truncate">{user.full_name}</div>
            <div className="text-[10px] text-indigo-600 font-mono">Platform Admin</div>
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Pane (Offset by fixed sidebar width) */}
      <main className="ml-64 flex-1 min-h-screen bg-zinc-50 p-6 sm:p-8 space-y-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
