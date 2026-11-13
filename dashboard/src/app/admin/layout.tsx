"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  ShieldAlert,
  Users,
  PhoneCall,
  LayoutDashboard,
  LogOut,
  Building2,
  PlusCircle,
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== "platform_admin")) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== "platform_admin") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 font-mono text-xs text-zinc-500">
        Authenticating platform super-admin...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Admin Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 flex flex-col justify-between shrink-0">
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase font-semibold">
                Agency Control Plane
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono font-medium">
                Super-Admin
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              VedaVoice Platform
            </h2>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <Link
              href="/admin/dashboard"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                pathname === "/admin/dashboard"
                  ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-400" />
              Platform Overview
            </Link>

            <Link
              href="/onboarding"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              Onboard Client
            </Link>

            <Link
              href="/portal/dashboard"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
            >
              <Building2 className="w-4 h-4 text-zinc-500" />
              View Default Tenant
            </Link>
          </nav>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
          <div className="space-y-0.5 truncate pr-2">
            <div className="text-xs font-medium text-zinc-200 truncate">{user.full_name}</div>
            <div className="text-[10px] text-indigo-400 font-mono">Platform Admin</div>
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto space-y-8">
        {children}
      </main>
    </div>
  );
}
