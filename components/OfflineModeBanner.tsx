"use client";

export function OfflineModeBanner({ visible, savedAt }: { visible: boolean; savedAt?: string | null }) {
  if (!visible) return null;
  return <div className="offline-mode-banner" role="status">
    <b>Modo offline — somente leitura</b>
    <span>Exibindo a última cópia disponível{savedAt ? `, salva em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(savedAt))}` : ""}. Alterações serão liberadas quando a conexão voltar.</span>
  </div>;
}
