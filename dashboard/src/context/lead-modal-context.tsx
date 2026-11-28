"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LeadCaptureModal } from "@/components/public/LeadCaptureModal";

interface LeadModalContextValue {
  isOpen: boolean;
  initialIndustry: string;
  openLeadModal: (industrySlug?: string) => void;
  closeLeadModal: () => void;
}

const LeadModalContext = createContext<LeadModalContextValue | undefined>(undefined);

const PUBLIC_PATHS = ["/", "/how-it-works", "/features", "/industries", "/legal"];

export function LeadModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialIndustry, setInitialIndustry] = useState("plumbing");
  const pathname = usePathname();

  const openLeadModal = (industrySlug?: string) => {
    if (industrySlug) setInitialIndustry(industrySlug);
    setIsOpen(true);
  };

  const closeLeadModal = () => {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("vedavoice_lead_modal_dismissed", "1");
    }
  };

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`))
    );
    if (!isPublic) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("vedavoice_lead_modal_dismissed") === "1") return;

    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <LeadModalContext.Provider value={{ isOpen, initialIndustry, openLeadModal, closeLeadModal }}>
      {children}
      {isOpen && (
        <LeadCaptureModal initialIndustry={initialIndustry} onClose={closeLeadModal} />
      )}
    </LeadModalContext.Provider>
  );
}

export function useLeadModal() {
  const ctx = useContext(LeadModalContext);
  if (!ctx) {
    throw new Error("useLeadModal must be used inside LeadModalProvider");
  }
  return ctx;
}
