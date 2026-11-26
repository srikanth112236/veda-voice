import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { InfoModalProvider } from "@/context/info-modal-context";
import { LeadModalProvider } from "@/context/lead-modal-context";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VedaVoice | Autonomous Voice Receptionist Control Plane",
  description:
    "Multi-tenant AI voice receptionist, live call supervision, and Google Calendar dispatch control plane.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-type="software"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <meta name="page-type" content="software" />
        <meta name="site-kind" content="software" />
      </head>
      <body className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-sans antialiased selection:bg-emerald-600/15 selection:text-[var(--ink-primary)]">
        <AuthProvider>
          <InfoModalProvider>
            <LeadModalProvider>{children}</LeadModalProvider>
          </InfoModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
