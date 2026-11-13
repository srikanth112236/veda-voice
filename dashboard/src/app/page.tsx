"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
    } else if (user.role === "platform_admin") {
      router.replace("/admin/dashboard");
    } else {
      router.replace("/portal/dashboard");
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        Initializing VedaVoice Platform...
      </div>
    </div>
  );
}
