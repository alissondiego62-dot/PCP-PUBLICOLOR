"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

type AuditRow = { id: string; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string; actor: { name?: string; email?: string } | null };

export function AdminAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.from("admin_audit_log").select("id,action,entity_type,entity_id,metadata,created_at,actor:profiles!admin_audit_log_actor_id_fkey(name,email)").order("created_at", { ascending: false }).limit(100).then(({ data }) => {
      if (!active) return;
      setRows((data || []) as unknown as AuditRow[]); setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const filtered = rows.filter((row) => !query.trim() || `${row.action} ${row.entity_type} ${row.entity_id || ""} ${row.actor?.name || ""} ${row.actor?.email || ""}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  return <section className="settings-module audit-panel"><header><div><small>AUDITORIA ADMINISTRATIVA</small><h2>Alterações sensíveis</h2><p>Últimas ações administrativas registradas pelo sistema.</p></div><label className="audit-search"><AppIcon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar auditoria…"/></label></header>{loading ? <div className="settings-loading"><span className="app-spinner"/> Consultando auditoria…</div> : <div className="audit-list">{filtered.map((row) => <article key={row.id}><div><b>{row.action.replaceAll("_", " ")}</b><small>{row.entity_type}{row.entity_id ? ` · ${row.entity_id}` : ""}</small></div><span><b>{row.actor?.name || row.actor?.email || "Sistema"}</b><small>{new Date(row.created_at).toLocaleString("pt-BR")}</small></span></article>)}{!filtered.length && <div className="view-empty">Nenhum evento encontrado.</div>}</div>}</section>;
}
