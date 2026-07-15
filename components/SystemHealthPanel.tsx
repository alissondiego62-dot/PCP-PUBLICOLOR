"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

type HealthStatus = "checking" | "ok" | "warning" | "error";
type HealthItem = { label: string; status: HealthStatus; detail: string };

type DiagnosticsPayload = {
  summary?: {
    connected?: boolean;
    activeJobs?: number;
    failedJobs?: number;
    orphanFiles?: number;
    activeUploads?: number;
  };
};

type VersionPayload = { version?: string; commit?: string; environment?: string };

function StatusIcon({ status }: { status: HealthStatus }) {
  return <AppIcon name={status === "ok" ? "check" : status === "checking" ? "refresh" : "alert"}/>;
}

export function SystemHealthPanel() {
  const [items, setItems] = useState<HealthItem[]>([
    { label: "Banco de dados", status: "checking", detail: "Verificando…" },
    { label: "Realtime", status: "checking", detail: "Verificando…" },
    { label: "Google Drive", status: "checking", detail: "Verificando…" },
    { label: "Fila de integrações", status: "checking", detail: "Verificando…" },
    { label: "Versão publicada", status: "checking", detail: "Verificando…" },
  ]);

  useEffect(() => {
    let active = true;
    let healthChannel: ReturnType<typeof supabase.channel> | null = null;
    const replace = (label: string, status: HealthStatus, detail: string) => {
      if (!active) return;
      setItems((current) => current.map((item) => item.label === label ? { label, status, detail } : item));
    };

    const run = async () => {
      const { count, error: databaseError } = await supabase.from("orders").select("id", { count: "exact", head: true });
      replace("Banco de dados", databaseError ? "error" : "ok", databaseError ? databaseError.message : `${count || 0} pedido(s) acessível(is)`);

      const realtimePromise = new Promise<void>((resolve) => {
        let resolved = false;
        const finish = (status: HealthStatus, detail: string) => {
          if (resolved) return;
          resolved = true;
          replace("Realtime", status, detail);
          resolve();
        };
        healthChannel = supabase.channel(`system-health-${Date.now()}`).subscribe((status) => {
          if (status === "SUBSCRIBED") finish("ok", "Canal conectado");
          if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) finish("warning", "Canal indisponível no momento");
        });
        window.setTimeout(() => finish("warning", "Tempo de conexão excedido"), 4500);
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const diagnosticsResponse = await fetch("/api/admin/integration-diagnostics", { cache: "no-store", headers: { authorization: `Bearer ${token}` } });
        const diagnostics = await diagnosticsResponse.json().catch(() => ({})) as DiagnosticsPayload;
        if (diagnosticsResponse.ok) {
          replace("Google Drive", diagnostics.summary?.connected ? "ok" : "warning", diagnostics.summary?.connected ? `Conectado · ${diagnostics.summary?.orphanFiles || 0} arquivo(s) sem OP` : "Conexão não confirmada");
          const failed = diagnostics.summary?.failedJobs || 0;
          const activeJobs = diagnostics.summary?.activeJobs || 0;
          replace("Fila de integrações", failed ? "warning" : "ok", `${activeJobs} ativo(s) · ${failed} falha(s)`);
        } else {
          replace("Google Drive", "warning", "Diagnóstico indisponível");
          replace("Fila de integrações", "warning", "Diagnóstico indisponível");
        }
      } else {
        replace("Google Drive", "warning", "Sessão não disponível");
        replace("Fila de integrações", "warning", "Sessão não disponível");
      }

      const versionResponse = await fetch("/api/system/version", { cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : undefined });
      const version = await versionResponse.json().catch(() => ({})) as VersionPayload;
      replace("Versão publicada", versionResponse.ok ? "ok" : "warning", versionResponse.ok ? `${version.version || "—"} · ${version.environment || "ambiente não informado"}${version.commit ? ` · ${version.commit.slice(0, 7)}` : ""}` : "Não foi possível consultar");
      await realtimePromise;
    };

    void run();
    return () => {
      active = false;
      if (healthChannel) void supabase.removeChannel(healthChannel);
    };
  }, []);

  return <section className="system-health-panel platform-card">
    <div className="platform-card-title"><AppIcon name="activity"/><div><small>SAÚDE DO SISTEMA</small><h3>Serviços essenciais</h3></div></div>
    <div className="system-health-grid">{items.map((item) => <article key={item.label} data-status={item.status}><StatusIcon status={item.status}/><div><b>{item.label}</b><span>{item.detail}</span></div></article>)}</div>
  </section>;
}
