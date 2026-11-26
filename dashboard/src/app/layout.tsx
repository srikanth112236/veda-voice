import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import { InfoModalProvider } from "@/context/info-modal-context";
import { LeadModalProvider } from "@/context/lead-modal-context";
import { SeoJsonLd } from "@/components/public/SeoJsonLd";
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
  metadataBase: new URL("https://dashboard.kindstone-eaab21b4.eastus2.azurecontainerapps.io"),
  title: {
    default: "VedaVoice | 24/7 AI Voice Receptionist & Appointment Booking",
    template: "%s | VedaVoice AI Receptionist",
  },
  description:
    "Never miss a customer call again. VedaVoice answers business calls in under a second, filters background noise, speaks English & Spanish, and books straight into Google Calendar.",
  keywords: [
    "AI voice receptionist",
    "24/7 AI phone answering service",
    "automated appointment booking",
    "bilingual AI receptionist",
    "home service call answering",
    "dental AI receptionist",
    "HVAC plumbing call answering",
    "VedaVoice",
  ],
  openGraph: {
    type: "website",
    title: "VedaVoice | 24/7 AI Voice Receptionist & Appointment Booking",
    description:
      "Answers every call on the first ring, filters background noise, and books directly into your calendar.",
    siteName: "VedaVoice",
  },
  twitter: {
    card: "summary_large_image",
    title: "VedaVoice | 24/7 AI Voice Receptionist",
    description:
      "24/7 AI phone answering, bilingual support, and live calendar booking for service businesses.",
  },
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
        <SeoJsonLd />
        <AuthProvider>
          <InfoModalProvider>
            <LeadModalProvider>{children}</LeadModalProvider>
          </InfoModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
