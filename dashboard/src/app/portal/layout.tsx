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
  Sparkles,
} from "lucide-react";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 font-mono text-xs text-zinc-500">
        Loading tenant portal...
      </div>
    );
  }

  const navItems = [
    { label: "Dashboard", href: "/portal/dashboard", icon: LayoutDashboard },
    { label: "Call Explorer", href: "/portal/calls", icon: PhoneCall },
    { label: "Receptionist Config", href: "/portal/profile", icon: Settings2 },
  ];

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/40 flex flex-col justify-between shrink-0">
        <div className="p-4 space-y-6">
          {/* Brand header */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase font-semibold">
                Client Portal
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <h2 className="text-sm font-bold text-zinc-100 truncate">
              {user.tenant_name || "VedaVoice Client"}
            </h2>
            <div className="text-[11px] text-zinc-400 font-mono">
              Agent: <span className="text-zinc-200">receptionist</span>
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
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-800 space-y-3">
          {user.role === "platform_admin" && (
            <Link
              href="/admin/dashboard"
              className="flex items-center justify-between p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors text-xs font-medium"
            >
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Agency Admin
              </span>
              <span>&rarr;</span>
            </Link>
          )}

          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5 truncate pr-2">
              <div className="text-xs font-medium text-zinc-200 truncate">{user.full_name}</div>
              <div className="text-[10px] text-zinc-400 font-mono capitalize">{user.role.replace("_", " ")}</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto space-y-8">
        {children}
      </main>
    </div>
  );
}
