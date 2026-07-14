"use client";

import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Profile } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";

type ActivityPriority = "low" | "normal" | "high" | "urgent";

type ActivityGroup = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ActivityItem = {
  id: string;
  group_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: ActivityPriority;
  assigned_to: string | null;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type TaskEditorState = {
  mode: "create" | "edit";
  item: ActivityItem | null;
  groupId: string;
  parentId: string;
};

type GroupEditorState = {
  mode: "create" | "edit";
  group: ActivityGroup | null;
};

const priorityLabel: Record<ActivityPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

function isoToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function dateLabel(value: string | null) {
  if (!value) return "Sem prazo";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function dueState(value: string | null, completed: boolean) {
  if (!value || completed) return "none";
  const today = isoToday();
  if (value < today) return "late";
  if (value === today) return "today";
  return "future";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function ActivitiesView({
  profiles,
  currentUserId,
  canOperate,
}: {
  profiles: Profile[];
  currentUserId: string;
  canOperate: boolean;
}) {
  const [groups, setGroups] = useState<ActivityGroup[]>([]);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showCompletedGroups, setShowCompletedGroups] = useState<Set<string>>(new Set());
  const [groupEditor, setGroupEditor] = useState<GroupEditorState | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null);

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => profile.active).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "pt-BR")),
    [profiles],
  );

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  async function loadActivities(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    const [{ data: groupRows, error: groupError }, { data: itemRows, error: itemError }] = await Promise.all([
      supabase.from("activity_groups").select("id,name,description,position,created_by,created_at,updated_at").order("position").order("created_at"),
      supabase.from("activities").select("id,group_id,parent_id,title,description,due_date,priority,assigned_to,completed,completed_at,completed_by,position,created_by,created_at,updated_at").order("position").order("created_at"),
    ]);

    const loadError = groupError || itemError;
    if (loadError) {
      const missingTable = loadError.message.toLowerCase().includes("activity_groups") || loadError.message.toLowerCase().includes("activities");
      setError(missingTable
        ? "O módulo de Atividades ainda não foi criado no banco. Execute a migração SQL enviada com esta versão."
        : `Não foi possível carregar as atividades: ${loadError.message}`);
      setLoading(false);
      return;
    }

    setGroups((groupRows || []) as ActivityGroup[]);
    setItems((itemRows || []) as ActivityItem[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadActivities();

    const channel = supabase
      .channel(`publicolor-activities-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_groups" }, () => void loadActivities(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => void loadActivities(true))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // A assinatura deve ser recriada apenas quando o usuário autenticado mudar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const totals = useMemo(() => {
    const pending = items.filter((item) => !item.completed);
    const today = isoToday();
    return {
      groups: groups.length,
      pending: pending.length,
      today: pending.filter((item) => item.due_date === today).length,
      late: pending.filter((item) => item.due_date && item.due_date < today).length,
      completed: items.filter((item) => item.completed).length,
    };
  }, [groups.length, items]);

  const normalizedSearch = normalizeSearch(search);

  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return groups;
    return groups.filter((group) => {
      if (`${group.name} ${group.description || ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch)) return true;
      return items.some((item) => item.group_id === group.id && `${item.title} ${item.description || ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });
  }, [groups, items, normalizedSearch]);

  function toggleSet(setter: Dispatch<SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupEditor || !canOperate) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!name) return;

    setBusyId("group-editor");
    setError("");

    if (groupEditor.mode === "edit" && groupEditor.group) {
      const { error: updateError } = await supabase
        .from("activity_groups")
        .update({ name, description: description || null, updated_at: new Date().toISOString() })
        .eq("id", groupEditor.group.id);
      if (updateError) setError(`Não foi possível atualizar o grupo: ${updateError.message}`);
      else {
        setNotice("Grupo atualizado.");
        setGroupEditor(null);
        await loadActivities(true);
      }
    } else {
      const nextPosition = groups.length ? Math.max(...groups.map((group) => group.position)) + 1 : 0;
      const { error: insertError } = await supabase.from("activity_groups").insert({
        name,
        description: description || null,
        position: nextPosition,
        created_by: currentUserId,
      });
      if (insertError) setError(`Não foi possível criar o grupo: ${insertError.message}`);
      else {
        setNotice("Grupo criado.");
        setGroupEditor(null);
        await loadActivities(true);
      }
    }

    setBusyId("");
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskEditor || !canOperate) return;
    const form = new FormData(event.currentTarget);
    const groupId = String(form.get("group_id") || "").trim();
    const parentId = String(form.get("parent_id") || "").trim();
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const dueDate = String(form.get("due_date") || "").trim();
    const priority = String(form.get("priority") || "normal") as ActivityPriority;
    const assignedTo = String(form.get("assigned_to") || "").trim();
    if (!groupId || !title) return;

    setBusyId("task-editor");
    setError("");

    if (taskEditor.mode === "edit" && taskEditor.item) {
      const { error: updateError } = await supabase
        .from("activities")
        .update({
          group_id: groupId,
          parent_id: parentId || null,
          title,
          description: description || null,
          due_date: dueDate || null,
          priority,
          assigned_to: assignedTo || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskEditor.item.id);
      if (updateError) setError(`Não foi possível atualizar a atividade: ${updateError.message}`);
      else {
        setNotice("Atividade atualizada.");
        setTaskEditor(null);
        await loadActivities(true);
      }
    } else {
      const siblings = items.filter((item) => item.group_id === groupId && (item.parent_id || "") === parentId);
      const nextPosition = siblings.length ? Math.max(...siblings.map((item) => item.position)) + 1 : 0;
      const { error: insertError } = await supabase.from("activities").insert({
        group_id: groupId,
        parent_id: parentId || null,
        title,
        description: description || null,
        due_date: dueDate || null,
        priority,
        assigned_to: assignedTo || null,
        position: nextPosition,
        created_by: currentUserId,
      });
      if (insertError) setError(`Não foi possível criar a atividade: ${insertError.message}`);
      else {
        setNotice(parentId ? "Subatividade criada." : "Atividade criada.");
        setTaskEditor(null);
        await loadActivities(true);
      }
    }

    setBusyId("");
  }

  async function toggleCompleted(item: ActivityItem) {
    if (!canOperate || busyId) return;
    setBusyId(item.id);
    setError("");
    const nextCompleted = !item.completed;
    const { error: updateError } = await supabase
      .from("activities")
      .update({ completed: nextCompleted, updated_at: new Date().toISOString() })
      .eq("id", item.id);

    if (updateError) setError(`Não foi possível atualizar a atividade: ${updateError.message}`);
    else {
      setItems((current) => current.map((currentItem) => currentItem.id === item.id
        ? { ...currentItem, completed: nextCompleted, completed_at: nextCompleted ? new Date().toISOString() : null, completed_by: nextCompleted ? currentUserId : null }
        : currentItem));
      setNotice(nextCompleted ? "Atividade concluída e ocultada no grupo." : "Atividade reaberta.");
    }
    setBusyId("");
  }

  async function deleteTask(item: ActivityItem) {
    if (!canOperate || !window.confirm(`Excluir “${item.title}” e todas as subatividades vinculadas?`)) return;
    setBusyId(item.id);
    const { error: deleteError } = await supabase.from("activities").delete().eq("id", item.id);
    if (deleteError) setError(`Não foi possível excluir a atividade: ${deleteError.message}`);
    else {
      setNotice("Atividade excluída.");
      await loadActivities(true);
    }
    setBusyId("");
  }

  async function deleteGroup(group: ActivityGroup) {
    if (!canOperate || !window.confirm(`Excluir o grupo “${group.name}” e todas as atividades dele?`)) return;
    setBusyId(group.id);
    const { error: deleteError } = await supabase.from("activity_groups").delete().eq("id", group.id);
    if (deleteError) setError(`Não foi possível excluir o grupo: ${deleteError.message}`);
    else {
      setNotice("Grupo excluído.");
      await loadActivities(true);
    }
    setBusyId("");
  }

  function openNewTask(groupId = groups[0]?.id || "", parentId = "") {
    if (!canOperate) return;
    if (!groups.length) {
      setGroupEditor({ mode: "create", group: null });
      setNotice("Crie primeiro um grupo para organizar as atividades.");
      return;
    }
    setTaskEditor({ mode: "create", item: null, groupId, parentId });
  }

  function taskMatchesSearch(item: ActivityItem) {
    if (!normalizedSearch) return true;
    return `${item.title} ${item.description || ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
  }

  function renderTask(item: ActivityItem, childItems: ActivityItem[], showCompleted: boolean, isSubtask = false) {
    const assigned = item.assigned_to ? profileById.get(item.assigned_to) : null;
    const visibleChildren = childItems.filter((child) => (showCompleted || !child.completed) && (taskMatchesSearch(child) || taskMatchesSearch(item)));
    const completedChildren = childItems.filter((child) => child.completed).length;
    const state = dueState(item.due_date, item.completed);

    return <div className={`activity-task ${isSubtask ? "is-subtask" : ""} ${item.completed ? "is-completed" : ""}`} key={item.id}>
      <div className="activity-task-main">
        <button
          type="button"
          className="activity-check"
          data-checked={item.completed ? "true" : "false"}
          aria-label={item.completed ? `Reabrir ${item.title}` : `Concluir ${item.title}`}
          title={item.completed ? "Reabrir atividade" : "Marcar como concluída"}
          disabled={!canOperate || busyId === item.id}
          onClick={() => void toggleCompleted(item)}
        >{item.completed ? "✓" : ""}</button>
        <div className="activity-task-copy">
          <div className="activity-task-title-row">
            <b>{item.title}</b>
            {!isSubtask && childItems.length > 0 && <span className="activity-subtask-progress">{completedChildren}/{childItems.length} subtarefas</span>}
          </div>
          {item.description && <p>{item.description}</p>}
          <div className="activity-task-meta">
            <span data-priority={item.priority}>{priorityLabel[item.priority]}</span>
            <span data-due={state}>{state === "late" ? "Atrasada · " : state === "today" ? "Hoje · " : ""}{dateLabel(item.due_date)}</span>
            <span>{assigned ? `Responsável: ${assigned.name || assigned.email}` : "Sem responsável"}</span>
          </div>
        </div>
        {canOperate && <div className="activity-task-actions">
          {!isSubtask && <button type="button" onClick={() => openNewTask(item.group_id, item.id)}>＋ Subatividade</button>}
          <button type="button" onClick={() => setTaskEditor({ mode: "edit", item, groupId: item.group_id, parentId: item.parent_id || "" })}>Editar</button>
          <button type="button" className="danger" onClick={() => void deleteTask(item)} disabled={busyId === item.id}>Excluir</button>
        </div>}
      </div>
      {visibleChildren.length > 0 && <div className="activity-subtasks">{visibleChildren.map((child) => renderTask(child, [], showCompleted, true))}</div>}
    </div>;
  }

  return <section className="activities-view">
    <div className="activities-summary">
      <article><small>GRUPOS</small><strong>{totals.groups}</strong><span>Áreas organizadas</span></article>
      <article><small>PENDENTES</small><strong>{totals.pending}</strong><span>Atividades abertas</span></article>
      <article><small>PARA HOJE</small><strong>{totals.today}</strong><span>Com prazo hoje</span></article>
      <article data-alert={totals.late > 0 ? "true" : "false"}><small>ATRASADAS</small><strong>{totals.late}</strong><span>Precisam de atenção</span></article>
      <article><small>CONCLUÍDAS</small><strong>{totals.completed}</strong><span>Ocultas por padrão</span></article>
    </div>

    <div className="activities-toolbar">
      <label className="activities-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar grupo, atividade ou descrição..." /></label>
      <div>
        {canOperate && <button type="button" className="secondary" onClick={() => setGroupEditor({ mode: "create", group: null })}>＋ Novo grupo</button>}
        {canOperate && <button type="button" className="primary" onClick={() => openNewTask()}>＋ Nova atividade</button>}
      </div>
    </div>

    {error && <div className="activities-feedback error">{error}</div>}
    {notice && <div className="activities-feedback success">✓ {notice}</div>}

    {loading ? <div className="activities-empty">Carregando atividades…</div> : filteredGroups.length === 0 ? <div className="activities-empty">
      <span>✓</span>
      <h2>{groups.length ? "Nenhum resultado encontrado" : "Nenhum grupo de atividades"}</h2>
      <p>{groups.length ? "Ajuste a busca para localizar uma atividade." : "Crie um grupo para começar a organizar tarefas principais e subatividades."}</p>
      {!groups.length && canOperate && <button type="button" className="primary" onClick={() => setGroupEditor({ mode: "create", group: null })}>Criar primeiro grupo</button>}
    </div> : <div className="activity-groups">
      {filteredGroups.map((group) => {
        const groupItems = items.filter((item) => item.group_id === group.id);
        const mainItems = groupItems.filter((item) => !item.parent_id);
        const completedCount = groupItems.filter((item) => item.completed).length;
        const pendingCount = groupItems.length - completedCount;
        const showCompleted = showCompletedGroups.has(group.id);
        const isCollapsed = collapsedGroups.has(group.id);
        const visibleMainItems = mainItems.filter((item) => {
          const children = groupItems.filter((child) => child.parent_id === item.id);
          const searchMatch = taskMatchesSearch(item) || children.some(taskMatchesSearch);
          return searchMatch && (showCompleted || !item.completed);
        });
        const progress = groupItems.length ? Math.round((completedCount / groupItems.length) * 100) : 0;

        return <article className="activity-group" key={group.id}>
          <header className="activity-group-header">
            <button type="button" className="activity-group-toggle" onClick={() => toggleSet(setCollapsedGroups, group.id)} aria-expanded={!isCollapsed}>{isCollapsed ? "›" : "⌄"}</button>
            <div className="activity-group-copy">
              <div><h2>{group.name}</h2><span>{pendingCount} pendente{pendingCount === 1 ? "" : "s"}</span></div>
              {group.description && <p>{group.description}</p>}
              <div className="activity-group-progress"><i style={{ width: `${progress}%` }} /><span>{progress}% concluído</span></div>
            </div>
            {canOperate && <div className="activity-group-actions">
              <button type="button" onClick={() => openNewTask(group.id)}>＋ Atividade</button>
              <button type="button" onClick={() => setGroupEditor({ mode: "edit", group })}>Editar</button>
              <button type="button" className="danger" onClick={() => void deleteGroup(group)} disabled={busyId === group.id}>Excluir</button>
            </div>}
          </header>

          {!isCollapsed && <div className="activity-group-body">
            {visibleMainItems.length === 0 ? <div className="activity-group-empty">{pendingCount === 0 && groupItems.length ? "Todas as atividades deste grupo foram concluídas." : "Nenhuma atividade pendente neste grupo."}</div> : visibleMainItems.map((item) => {
              const children = groupItems.filter((child) => child.parent_id === item.id);
              return renderTask(item, children, showCompleted);
            })}
            {completedCount > 0 && <button type="button" className="activity-show-completed" onClick={() => toggleSet(setShowCompletedGroups, group.id)}>{showCompleted ? "Ocultar concluídas" : `Mostrar concluídas (${completedCount})`}</button>}
          </div>}
        </article>;
      })}
    </div>}

    {groupEditor && <div className="overlay activities-overlay" onMouseDown={() => busyId !== "group-editor" && setGroupEditor(null)}><form className="modal activity-editor-modal" onSubmit={saveGroup} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar" onClick={() => setGroupEditor(null)} disabled={busyId === "group-editor"}>×</button>
      <p className="eyebrow">ORGANIZAÇÃO</p>
      <h2>{groupEditor.mode === "edit" ? "Editar grupo" : "Novo grupo de atividades"}</h2>
      <p>Use grupos para separar rotinas, setores, projetos ou prioridades.</p>
      <label>Nome do grupo<input name="name" defaultValue={groupEditor.group?.name || ""} placeholder="Ex.: Rotina do PCP" required autoFocus /></label>
      <label>Descrição<textarea name="description" defaultValue={groupEditor.group?.description || ""} placeholder="Explique o objetivo deste grupo (opcional)." /></label>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setGroupEditor(null)}>Cancelar</button><button type="submit" className="primary" disabled={busyId === "group-editor"}>{busyId === "group-editor" ? "Salvando…" : "Salvar grupo"}</button></div>
    </form></div>}

    {taskEditor && <div className="overlay activities-overlay" onMouseDown={() => busyId !== "task-editor" && setTaskEditor(null)}><form className="modal activity-editor-modal task-editor" onSubmit={saveTask} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar" onClick={() => setTaskEditor(null)} disabled={busyId === "task-editor"}>×</button>
      <p className="eyebrow">PLANEJAMENTO</p>
      <h2>{taskEditor.mode === "edit" ? "Editar atividade" : taskEditor.parentId ? "Nova subatividade" : "Nova atividade"}</h2>
      <p>Defina o que precisa ser feito. Ao concluir, o item será ocultado dentro do grupo.</p>
      <div className="activity-editor-grid">
        <label>Grupo<select name="group_id" value={taskEditor.groupId} required onChange={(event) => setTaskEditor((current) => current ? { ...current, groupId: event.target.value, parentId: "" } : current)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label>Tipo<select name="parent_id" value={taskEditor.parentId} disabled={Boolean(taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id))} onChange={(event) => setTaskEditor((current) => current ? { ...current, parentId: event.target.value } : current)}><option value="">Atividade principal</option>{items.filter((item) => !item.parent_id && item.id !== taskEditor.item?.id && item.group_id === taskEditor.groupId).map((item) => <option key={item.id} value={item.id}>Subatividade de: {item.title}</option>)}</select>{taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id) && <small>Atividades com subatividades permanecem como atividade principal.</small>}</label>
        <label className="wide">Título<input name="title" defaultValue={taskEditor.item?.title || ""} placeholder="Ex.: Conferir pedidos com entrega amanhã" required autoFocus /></label>
        <label className="wide">Descrição<textarea name="description" defaultValue={taskEditor.item?.description || ""} placeholder="Orientações, detalhes ou observações (opcional)." /></label>
        <label>Prazo<input type="date" name="due_date" defaultValue={taskEditor.item?.due_date || ""} /></label>
        <label>Prioridade<select name="priority" defaultValue={taskEditor.item?.priority || "normal"}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
        <label className="wide">Responsável<select name="assigned_to" defaultValue={taskEditor.item?.assigned_to || ""}><option value="">Sem responsável definido</option>{activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || profile.email}</option>)}</select></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setTaskEditor(null)}>Cancelar</button><button type="submit" className="primary" disabled={busyId === "task-editor"}>{busyId === "task-editor" ? "Salvando…" : "Salvar atividade"}</button></div>
    </form></div>}
  </section>;
}
