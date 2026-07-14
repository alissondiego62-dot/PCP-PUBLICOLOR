import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Publicolor | Controle de Produção",
  description: "Sistema PCP da Publicolor para acompanhamento de ordens de produção.",
  icons: {
    icon: "/publicolor-logo.png",
    shortcut: "/publicolor-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
