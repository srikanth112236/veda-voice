"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading) return;

    const target = !user
      ? "/login"
      : user.role === "platform_admin"
      ? "/admin/dashboard"
      : "/portal/dashboard";

    setRedirecting(true);
    // Reliable hard redirect to destination workspace
    window.location.replace(target);
  }, [user, loading]);

  // Safety fallback: if loading takes longer than 2.0s, redirect to /login
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("vedavoice_token");
        if (!token) {
          window.location.replace("/login");
        }
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center bg-zinc-50 font-sans p-4 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center font-bold text-white text-xl shadow-md mb-2">
        V
      </div>
      <div className="flex items-center gap-3 text-sm text-zinc-700 font-mono font-medium">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
        {redirecting ? "Routing to workspace..." : "Initializing VedaVoice Platform..."}
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-400 mt-4 font-mono">
        <Link href="/login" className="hover:text-zinc-800 underline underline-offset-4">
          Sign In
        </Link>
        <span>•</span>
        <Link href="/onboarding" className="hover:text-zinc-800 underline underline-offset-4">
          Client Onboarding
        </Link>
        <span>•</span>
        <Link href="/admin/dashboard" className="hover:text-zinc-800 underline underline-offset-4">
          Agency Admin
        </Link>
      </div>
    </div>
  );
}
