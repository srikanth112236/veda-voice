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
  ShieldAlert,
  FileText,
  CreditCard,
  User,
} from "lucide-react";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/login");
      } else if (user.role === "platform_admin") {
        router.replace("/admin/dashboard");
      }
    }
  }, [user, loading, router]);

  if (loading || !user || user.role === "platform_admin") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 font-mono text-xs text-zinc-500">
        Authenticating client workspace...
      </div>
    );
  }

  const navItems = [
    { label: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
    { label: "Call Explorer", href: "/portal/calls", icon: PhoneCall },
    { label: "Receptionist Config", href: "/portal/profile", icon: Settings2 },
    { label: "Lead Form Builder", href: "/portal/forms", icon: FileText },
    { label: "Billing & Minutes", href: "/portal/billing", icon: CreditCard },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Fixed Modern Sidebar */}
      <aside className="w-64 fixed inset-y-0 left-0 bg-white border-r border-zinc-200 z-30 flex flex-col justify-between">
        <div className="p-4 space-y-6">
          {/* Brand header */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase font-bold">
                Client Portal
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Line
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-900 truncate">
              {user.tenant_name || "VedaVoice Client"}
            </h2>
            <div className="text-[11px] text-zinc-500 font-mono">
              Agent: <span className="text-zinc-800 font-semibold">receptionist</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-white" : "text-zinc-500"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-200 space-y-3">
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5 truncate pr-2">
              <div className="text-xs font-bold text-zinc-900 truncate">{user.full_name}</div>
              <div className="text-[10px] text-zinc-500 font-mono capitalize">{user.role.replace("_", " ")}</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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
