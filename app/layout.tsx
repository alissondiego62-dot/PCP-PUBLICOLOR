import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./supabase.css";
import "./details.css";
import "./search.css";
import "./results.css";
import "./navigation.css";
import "./recovery.css";
import "./kanban-cards.css";
import "./pcp-v2.css";
import "./responsive-v4.css";
import "./agenda-calendar.css";
import "./order-batch-form.css";
import "./data-transfer.css";
import "./google-drive.css";
import "./platform-admin.css";
import "./site-audit.css";
import "./pdf-import.css";
import "./activities.css";
import "./responsive-2026.css";
import "./kanban-mobile.css";
import "./pwa.css";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f1765",
};

export const metadata: Metadata = {
  title: "Publicolor | Controle de Produção",
  description: "Sistema PCP da Publicolor para acompanhamento de ordens de produção.",
  applicationName: "Publicolor PCP",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Publicolor",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/publicolor-logo.png", type: "image/png" },
      { url: "/icons/publicolor-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/publicolor-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/publicolor-logo.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}<PwaInstallPrompt /></body>
    </html>
  );
}
