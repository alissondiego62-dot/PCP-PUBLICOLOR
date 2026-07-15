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
    activeJobs: number;
    failedJobs: number;
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
  integrationJobs: Array<{ id:string; job_type:string; status:string; attempts:number; max_attempts:number; last_error:string|null; payload:Record<string,unknown>; created_at:string; updated_at:string }>;
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

  async function retryJob(job: Diagnostics["integrationJobs"][number]) {
    if (job.job_type !== "drive_reconcile" || !job.payload?.order_id) return;
    setLoading(true); setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");
      const response = await fetch("/api/google-drive/reconcile", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ order_id: job.payload.order_id }) });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A nova tentativa falhou.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A nova tentativa falhou."); setLoading(false); }
  }

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
      <article><small>Jobs ativos</small><b>{data?.summary.activeJobs ?? "—"}</b><span>Fila de integrações</span></article>
      <article><small>Jobs com falha</small><b>{data?.summary.failedJobs ?? "—"}</b><span>Tentativa manual necessária</span></article>
    </div>
    <div className="platform-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar diagnóstico"}</button></div>
    {data?.integrationJobs?.length ? <details className="platform-sql-preview"><summary>Fila de integrações ({data.integrationJobs.length})</summary><div className="platform-history-list diagnostics-events">{data.integrationJobs.slice(0,20).map((job)=><article key={job.id} data-level={job.status === "failed" ? "error" : "info"}><header><b>{job.job_type}</b><span>{timeLabel(job.created_at)}</span></header><p>{job.last_error || `Status: ${job.status}`}</p><small>{job.attempts}/{job.max_attempts} tentativa(s)</small>{job.status === "failed" && job.job_type === "drive_reconcile" && job.payload?.order_id && <button type="button" onClick={() => void retryJob(job)} disabled={loading}>Tentar novamente</button>}</article>)}</div></details> : null}
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
