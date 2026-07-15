"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Diagnostics = {
  summary: {
    connected: boolean;
    connectedEmail: string | null;
    lastUpdatedAt: string | null;
    errors24h: number;
    averageDurationMs: number;
    orphanFiles: number;
    activeUploads: number;
  };
  events: Array<{
    id: string;
    level: string;
    source: string;
    action: string;
    status: string | null;
    message: string;
    order_id: string | null;
    duration_ms: number | null;
    created_at: string;
  }>;
  uploadSessions: Array<{
    id: string;
    order_id: string;
    file_name: string;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;
};

async function loadDiagnostics() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");
  const response = await fetch("/api/admin/integration-diagnostics", {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({})) as Diagnostics & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Falha ao carregar o diagnóstico.");
  return payload;
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function IntegrationDiagnosticsPanel() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadDiagnostics());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o diagnóstico.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return <section className="integration-diagnostics platform-card">
    <div className="platform-card-title">
      <span>◉</span>
      <div><small>DIAGNÓSTICO E OBSERVABILIDADE</small><h3>Integrações e erros recentes</h3></div>
    </div>
    <p className="platform-card-description">Acompanha o Google Drive, uploads, arquivos sem OP, duração das operações e erros do frontend ou das APIs.</p>
    {error && <div className="platform-feedback error">{error}</div>}
    <div className="diagnostics-summary">
      <article><small>Google Drive</small><b>{data?.summary.connected ? "Conectado" : "Desconectado"}</b><span>{data?.summary.connectedEmail || "—"}</span></article>
      <article><small>Erros em 24 h</small><b>{data?.summary.errors24h ?? "—"}</b><span>Frontend e APIs</span></article>
      <article><small>Tempo médio</small><b>{data ? `${data.summary.averageDurationMs} ms` : "—"}</b><span>Integrações concluídas</span></article>
      <article><small>Uploads ativos</small><b>{data?.summary.activeUploads ?? "—"}</b><span>Em processamento</span></article>
      <article><small>Arquivos sem OP</small><b>{data?.summary.orphanFiles ?? "—"}</b><span>Precisam de revisão</span></article>
    </div>
    <div className="platform-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar diagnóstico"}</button></div>
    {data?.events?.length ? <details className="platform-sql-preview">
      <summary>Últimos eventos ({data.events.length})</summary>
      <div className="platform-history-list diagnostics-events">
        {data.events.slice(0, 30).map((event) => <article key={event.id} data-level={event.level}>
          <header><b>{event.source} · {event.action}</b><span>{timeLabel(event.created_at)}</span></header>
          <p>{event.message}</p>
          <small>{event.status || event.level}{event.duration_ms ? ` · ${event.duration_ms} ms` : ""}{event.order_id ? ` · OP vinculada` : ""}</small>
        </article>)}
      </div>
    </details> : null}
  </section>;
}
