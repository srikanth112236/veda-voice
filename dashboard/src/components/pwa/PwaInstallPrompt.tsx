"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, Smartphone, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

const DISMISS_STORAGE_KEY = "vedavoice_pwa_dismissed_at";
const INSTALLED_STORAGE_KEY = "vedavoice_pwa_installed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  if (document.referrer.startsWith("android-app://")) return true;
  return false;
}

function detectIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isTouchMac =
    navigator.platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || isTouchMac;
}

export function PwaInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showFallbackSteps, setShowFallbackSteps] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register service worker for installability & offline shell
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    // Never show if already running as installed app or recorded as installed
    if (isStandaloneMode() || window.localStorage.getItem(INSTALLED_STORAGE_KEY) === "1") {
      return;
    }

    // Respect recent dismissal
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_STORAGE_KEY) || "0");
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) {
      return;
    }

    const iosDevice = detectIos();
    setIsIos(iosDevice);

    let promptCaptured = false;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      promptCaptured = true;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowFallbackSteps(false);
      setVisible(true);
    };

    const handleAppInstalled = () => {
      window.localStorage.setItem(INSTALLED_STORAGE_KEY, "1");
      setDeferredPrompt(null);
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Show iOS Add-to-Home-Screen or browser install guide if native prompt didn't fire
    const fallbackTimer = window.setTimeout(() => {
      if (!promptCaptured && !isStandaloneMode()) {
        setVisible(true);
      }
    }, 2000);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // Ignore storage quota errors
    }
    setVisible(false);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowFallbackSteps((prev) => !prev);
      return;
    }
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        window.localStorage.setItem(INSTALLED_STORAGE_KEY, "1");
        setVisible(false);
      }
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  if (!visible) return null;

  return (
    <aside
      role="dialog"
      aria-label="Install VedaVoice App"
      data-testid="pwa-install-prompt"
      className="fixed bottom-3 left-3 right-3 z-50 sm:left-auto sm:bottom-5 sm:right-5 sm:w-[380px] rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-panel)]/95 backdrop-blur-md shadow-[0_18px_40px_-14px_rgba(15,23,42,0.22)] p-4 text-[var(--ink-primary)] animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-11 w-11 rounded-xl bg-slate-900 flex items-center justify-center shadow-sm border border-slate-800 overflow-hidden">
          <img
            src="/icons/icon-192.png"
            alt="VedaVoice"
            width={44}
            height={44}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold leading-tight text-[var(--ink-primary)]">
                Install VedaVoice App
              </p>
              <p className="mt-0.5 text-xs text-[var(--ink-secondary)] leading-snug">
                {isIos
                  ? "Add VedaVoice to your Home Screen for one-tap access and full-screen mode."
                  : "Launch faster from your home screen or dock with an app-like experience."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className="shrink-0 -mt-1 -mr-1 rounded-lg p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isIos ? (
            <div className="mt-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-hairline)] px-3 py-2.5 text-xs text-[var(--ink-secondary)] space-y-1.5">
              <div className="flex items-center gap-2">
                <Share className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>
                  1. Tap <strong className="font-semibold text-[var(--ink-primary)]">Share</strong> in Safari&apos;s toolbar
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PlusSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>
                  2. Choose <strong className="font-semibold text-[var(--ink-primary)]">Add to Home Screen</strong>
                </span>
              </div>
            </div>
          ) : (
            <>
              {showFallbackSteps && !deferredPrompt && (
                <div className="mt-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-hairline)] px-3 py-2 text-xs text-[var(--ink-secondary)]">
                  Use your browser&apos;s address bar install icon or menu (
                  <strong className="font-semibold text-[var(--ink-primary)]">Install VedaVoice</strong> /{" "}
                  <strong className="font-semibold text-[var(--ink-primary)]">Add to Dock</strong>).
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors"
                >
                  {deferredPrompt ? (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      {installing ? "Installing..." : "Install App"}
                    </>
                  ) : (
                    <>
                      <Smartphone className="h-3.5 w-3.5" />
                      {showFallbackSteps ? "Got It" : "Install App"}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] hover:bg-[var(--surface-subtle)] px-3 py-2 text-xs font-medium text-[var(--ink-secondary)] transition-colors"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
