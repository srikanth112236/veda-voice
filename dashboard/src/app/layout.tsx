import type { Metadata } from "next";
import { AuthProvider } from "@/context/auth-context";
import { InfoModalProvider } from "@/context/info-modal-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "VedaVoice | Enterprise Voice Receptionist Platform",
  description: "Multi-tenant autonomous voice receptionist and telephony intelligence control plane.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-zinc-800 selection:text-zinc-100">
        <AuthProvider>
          <InfoModalProvider>{children}</InfoModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
