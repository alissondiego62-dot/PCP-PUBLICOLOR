"use client";

import { useMemo, useState } from "react";
import type { Sector } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

type Props = { sectors: Sector[]; onChanged: () => void };
type Draft = Omit<Sector, "id" | "position"> & { id?: string };
type ApiAction = "create" | "update" | "toggle" | "delete" | "reorder";

const emptyDraft: Draft = {
  name: "",
  active: true,
  wip_limit: null,
  uses_status: true,
  requires_scheduling: false,
  show_in_agenda: false,
  allow_manual_move: true,
  special_type: null,
  color: "#6b2b7d",
  icon: null,
};

export function KanbanSettingsPanel({ sectors, onChanged }: Props) {
  const ordered = useMemo(() => [...sectors].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR")), [sectors]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function edit(sector?: Sector) {
    setMessage("");
    setError("");
    setDraft(sector ? {
      id: sector.id,
      name: sector.name,
      active: sector.active,
      wip_limit: sector.wip_limit ?? null,
      uses_status: sector.uses_status !== false,
      requires_scheduling: Boolean(sector.requires_scheduling),
      show_in_agenda: Boolean(sector.show_in_agenda),
      allow_manual_move: sector.allow_manual_move !== false,
      special_type: sector.special_type || null,
      color: sector.color || "#6b2b7d",
      icon: sector.icon || null,
    } : { ...emptyDraft });
  }

  async function request(action: ApiAction, payload: Record<string, unknown> = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente no sistema.");
    const response = await fetch("/api/admin/sectors", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível atualizar o Kanban.");
    return result.message || "Configuração atualizada.";
  }

  async function run(action: ApiAction, payload: Record<string, unknown>, closeEditor = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const nextMessage = await request(action, payload);
      if (closeEditor) setDraft(null);
      setMessage(nextMessage);
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível atualizar o Kanban.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft?.name.trim()) return;
    await run(draft.id ? "update" : "create", { ...draft }, true);
  }

  async function toggle(sector: Sector) {
    await run("toggle", { id: sector.id });
  }

  async function remove(sector: Sector) {
    if (!window.confirm(`Excluir o setor ${sector.name}? A operação será bloqueada se houver pedidos vinculados.`)) return;
    await run("delete", { id: sector.id });
  }

  async function movePosition(index: number, delta: number) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const ids = ordered.map((sector) => sector.id);
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    await run("reorder", { ordered_ids: ids });
  }

  return <section className="settings-module kanban-settings-panel">
    <header className="kanban-settings-header"><div><small>KANBAN</small><h2>Setores e fluxo operacional</h2><p>Crie, reorganize, ative ou inative setores. A exclusão só é permitida quando não existem pedidos vinculados.</p></div><button type="button" className="primary" onClick={() => edit()} disabled={busy}><span aria-hidden="true">＋</span> Novo setor</button></header>

    <div className="kanban-settings-flow-note"><AppIcon name="info"/><div><b>Fluxo especial</b><p><strong>Produção concluída</strong> e <strong>Instalação</strong> não utilizam status. A entrada em Instalação exige data e hora confirmadas.</p></div></div>

    <div className="kanban-sector-settings-list">{ordered.map((sector, index) => <article key={sector.id} className={!sector.active ? "inactive" : ""}>
      <i style={{ background: sector.color || "#6b2b7d" }}>{String(index + 1).padStart(2, "0")}</i>
      <div className="kanban-sector-description"><b>{sector.name}</b><small>{sector.special_type === "production_completed" ? "Produção concluída · sem status · aparece na agenda" : sector.special_type === "installation" ? "Instalação · sem status · agendamento obrigatório" : sector.uses_status === false ? "Setor sem status" : "Setor com status"}</small></div>
      <span className={sector.active ? "active" : "inactive"}>{sector.active ? "Ativo" : "Inativo"}</span>
      <div className="kanban-sector-row-actions">
        <button type="button" disabled={busy || index === 0} onClick={() => void movePosition(index, -1)} title="Mover para a esquerda" aria-label={`Mover ${sector.name} para a esquerda`}><AppIcon name="chevronLeft"/></button>
        <button type="button" disabled={busy || index === ordered.length - 1} onClick={() => void movePosition(index, 1)} title="Mover para a direita" aria-label={`Mover ${sector.name} para a direita`}><AppIcon name="chevronRight"/></button>
        <button type="button" disabled={busy} onClick={() => edit(sector)} title="Editar setor"><AppIcon name="edit"/></button>
        <button type="button" disabled={busy} onClick={() => void toggle(sector)}>{sector.active ? "Inativar" : "Ativar"}</button>
        <button type="button" className="danger" disabled={busy || Boolean(sector.special_type)} onClick={() => void remove(sector)} title={sector.special_type ? "Setor especial não pode ser excluído" : "Excluir setor"}><AppIcon name="trash"/></button>
      </div>
    </article>)}</div>

    {draft && <div className="kanban-sector-editor">
      <div className="kanban-sector-editor-title"><div><small>{draft.id ? "EDIÇÃO" : "NOVO SETOR"}</small><h3>{draft.id ? draft.name : "Cadastrar setor"}</h3></div><button type="button" aria-label="Fechar" onClick={() => setDraft(null)}>×</button></div>
      <div className="kanban-sector-editor-grid">
        <label><span>Nome</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome do setor"/></label>
        <label><span>Tipo do setor</span><select value={draft.special_type || ""} disabled={Boolean(draft.id && draft.special_type)} onChange={(event) => { const specialType = (event.target.value || null) as Draft["special_type"]; setDraft({ ...draft, special_type: specialType, uses_status: specialType ? false : draft.uses_status, requires_scheduling: specialType === "installation" || draft.requires_scheduling, show_in_agenda: Boolean(specialType) || draft.show_in_agenda }); }}><option value="">Setor comum</option><option value="production_completed">Produção concluída</option><option value="installation">Instalação</option></select></label>
        <label><span>Cor de identificação</span><input type="color" value={draft.color || "#6b2b7d"} onChange={(event) => setDraft({ ...draft, color: event.target.value })}/></label>
        <label><span>Limite WIP</span><input type="number" min="1" value={draft.wip_limit || ""} onChange={(event) => setDraft({ ...draft, wip_limit: event.target.value ? Number(event.target.value) : null })} placeholder="Sem limite"/></label>
        <label className="check"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })}/><span>Setor ativo</span></label>
        <label className="check"><input type="checkbox" checked={draft.uses_status !== false} disabled={Boolean(draft.special_type)} onChange={(event) => setDraft({ ...draft, uses_status: event.target.checked })}/><span>Utiliza status</span></label>
        <label className="check"><input type="checkbox" checked={Boolean(draft.requires_scheduling)} disabled={draft.special_type === "installation"} onChange={(event) => setDraft({ ...draft, requires_scheduling: event.target.checked })}/><span>Exige agendamento</span></label>
        <label className="check"><input type="checkbox" checked={Boolean(draft.show_in_agenda)} disabled={Boolean(draft.special_type)} onChange={(event) => setDraft({ ...draft, show_in_agenda: event.target.checked })}/><span>Aparece na agenda</span></label>
        <label className="check"><input type="checkbox" checked={draft.allow_manual_move !== false} onChange={(event) => setDraft({ ...draft, allow_manual_move: event.target.checked })}/><span>Permite movimentação manual</span></label>
      </div>
      {draft.special_type === "installation" && <p className="kanban-special-warning">Instalação sempre será um setor sem status e exigirá data e hora antes da entrada do pedido.</p>}
      {draft.special_type === "production_completed" && <p className="kanban-special-warning">Pedidos neste setor aparecerão em Pendentes de agendamento na Agenda.</p>}
      <div className="actions"><button type="button" onClick={() => setDraft(null)} disabled={busy}>Cancelar</button><button type="button" className="primary" disabled={busy || draft.name.trim().length < 2} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar setor"}</button></div>
    </div>}

    {message && <p className="settings-message success">{message}</p>}
    {error && <p className="settings-message error">{error}</p>}
  </section>;
}
