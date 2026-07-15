import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design-system.css";
import "./supabase.css";
import "./details.css";
import "./search.css";
import "./results.css";
import "./navigation.css";
import "./recovery.css";
import "./kanban-cards.css";
import "./pcp-v2.css";
import "./agenda-calendar.css";
import "./order-batch-form.css";
import "./data-transfer.css";
import "./google-drive.css";
import "./platform-admin.css";
import "./pdf-import.css";
import "./activities.css";
import "@/features/kanban/kanban-actions.css";
import "@/features/settings/settings-enhancements.css";
import "./responsive.css";
import "@/features/kanban/kanban-indicators.css";
import "@/features/dashboard/dashboard-3-2.css";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";

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
      <body>{children}<PwaInstallPrompt /><PwaUpdatePrompt /></body>
    </html>
  );
}
