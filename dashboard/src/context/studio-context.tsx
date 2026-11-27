"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface StudioConfigData {
  terminology: Record<string, string>;
  nav_labels: Record<string, string>;
  enabled_pages: Record<string, boolean>;
  hidden_sections: string[];
  theme: Record<string, string>;
  voice_defaults: {
    tone?: string;
    greeting_template?: string;
    emergency_keywords?: string[];
    custom_system_instructions?: string;
  };
  plan_overrides: Record<string, unknown>;
}

interface StudioContextValue {
  studio: StudioConfigData | null;
  t: (key: string, fallback: string) => string;
  navLabel: (slug: string, fallback: string) => string;
  isPageEnabled: (slug: string) => boolean;
}

const StudioContext = createContext<StudioContextValue>({
  studio: null,
  t: (_key, fallback) => fallback,
  navLabel: (_slug, fallback) => fallback,
  isPageEnabled: () => true,
});

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [studio, setStudio] = useState<StudioConfigData | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("vedavoice_token") : null;
    if (!token) return;

    fetch("/api/v1/portal/studio", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.resolved) return;
        const resolved = data.resolved as StudioConfigData;
        setStudio(resolved);

        // Apply white-label theme CSS variables if customized
        const theme = resolved.theme || {};
        const root = document.documentElement.style;
        if (theme.accent_signal) root.setProperty("--accent-signal", theme.accent_signal);
        if (theme.accent_signal_ink) root.setProperty("--accent-signal-ink", theme.accent_signal_ink);
        if (theme.surface_canvas) root.setProperty("--surface-canvas", theme.surface_canvas);
        if (theme.surface_panel) root.setProperty("--surface-panel", theme.surface_panel);
      })
      .catch(() => {
        // Fallback silently to default labels
      });
  }, []);

  const t = (key: string, fallback: string): string =>
    studio?.terminology?.[key] || fallback;

  const navLabel = (slug: string, fallback: string): string =>
    studio?.nav_labels?.[slug] || fallback;

  const isPageEnabled = (slug: string): boolean => {
    if (!studio?.enabled_pages) return true;
    return studio.enabled_pages[slug] !== false;
  };

  return (
    <StudioContext.Provider value={{ studio, t, navLabel, isPageEnabled }}>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  return useContext(StudioContext);
}
