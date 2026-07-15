"use client";

import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Profile, PurchaseActivityStatus } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";

type ActivityPriority = "low" | "normal" | "high" | "urgent";
type ActivityType = "general" | "material_purchase" | "purchase_order";

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
  due_at: string | null;
  priority: ActivityPriority;
  assigned_to: string | null;
  completed: boolean;
  activity_status: PurchaseActivityStatus;
  activity_type: ActivityType;
  order_id: string | null;
  order_material_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type PurchaseMaterial = {
  id: string;
  order_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
};

type OrderSummary = {
  id: string;
  op_number: string;
  client_name: string;
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

type StatusCascadeState = {
  item: ActivityItem;
  nextStatus: PurchaseActivityStatus;
  childIds: string[];
};

type PricingDraft = {
  quantity: string;
  unit: string;
  unitPrice: string;
};

const priorityLabel: Record<ActivityPriority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

const activityStatusLabel: Record<PurchaseActivityStatus, string> = {
  pending: "Pendente",
  awaiting_quote: "Aguardando orçamento",
  awaiting_separation: "Aguardando separação",
  awaiting_delivery: "Aguardando entrega",
  finalized: "Finalizada",
};

const activityStatusOptions: PurchaseActivityStatus[] = [
  "pending",
  "awaiting_quote",
  "awaiting_separation",
  "awaiting_delivery",
  "finalized",
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantityFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function isoToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function dateLabel(value: string | null, dueAt: string | null = null) {
  if (dueAt) {
    const date = new Date(dueAt);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }
  }
  if (!value) return "Sem prazo";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function toDueInputValue(dueAt: string | null, dueDate: string | null) {
  if (dueAt) {
    const date = new Date(dueAt);
    if (!Number.isNaN(date.getTime())) {
      const offset = date.getTimezoneOffset();
      return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
    }
  }
  return dueDate ? `${dueDate}T17:00` : "";
}

function dueState(value: string | null, dueAt: string | null, completed: boolean) {
  if (completed) return "none";
  if (dueAt) {
    const dueTime = new Date(dueAt).getTime();
    if (!Number.isNaN(dueTime)) {
      const now = Date.now();
      const today = isoToday();
      const localDueDate = new Date(dueAt);
      const offset = localDueDate.getTimezoneOffset();
      const dueDay = new Date(localDueDate.getTime() - offset * 60_000).toISOString().slice(0, 10);
      if (dueTime < now) return "late";
      if (dueDay === today) return "today";
      return "future";
    }
  }
  if (!value) return "none";
  const today = isoToday();
  if (value < today) return "late";
  if (value === today) return "today";
  return "future";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseDecimal(value: string) {
  const compact = value.replace(/\s/g, "").trim();
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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
  const [purchaseMaterials, setPurchaseMaterials] = useState<Map<string, PurchaseMaterial>>(new Map());
  const [ordersById, setOrdersById] = useState<Map<string, OrderSummary>>(new Map());
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, PricingDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [showCompletedGroups, setShowCompletedGroups] = useState<Set<string>>(new Set());
  const [groupEditor, setGroupEditor] = useState<GroupEditorState | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null);
  const [statusCascade, setStatusCascade] = useState<StatusCascadeState | null>(null);

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
      supabase.from("activities").select("id,group_id,parent_id,title,description,due_date,due_at,priority,assigned_to,completed,activity_status,activity_type,order_id,order_material_id,completed_at,completed_by,position,created_by,created_at,updated_at").order("position").order("created_at"),
    ]);

    const loadError = groupError || itemError;
    if (loadError) {
      const lowerMessage = loadError.message.toLowerCase();
      const missingTable = lowerMessage.includes("activity_groups") || lowerMessage.includes("activities");
      setError(missingTable
        ? "O módulo de Atividades ainda não foi criado no banco. Execute a migração SQL enviada com esta versão."
        : `Não foi possível carregar as atividades: ${loadError.message}`);
      setLoading(false);
      return;
    }

    const nextItems = (itemRows || []) as ActivityItem[];
    const materialIds = Array.from(new Set(nextItems.map((item) => item.order_material_id).filter((value): value is string => Boolean(value))));
    const orderIds = Array.from(new Set(nextItems.map((item) => item.order_id).filter((value): value is string => Boolean(value))));

    const [materialResult, orderResult] = await Promise.all([
      materialIds.length
        ? supabase.from("order_materials").select("id,order_id,material_name,quantity,unit,unit_price").in("id", materialIds)
        : Promise.resolve({ data: [], error: null }),
      orderIds.length
        ? supabase.from("orders").select("id,op_number,client_name").in("id", orderIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (materialResult.error || orderResult.error) {
      const detail = materialResult.error?.message || orderResult.error?.message || "Erro desconhecido";
      setError(`As atividades foram carregadas, mas os dados de compra não puderam ser consultados: ${detail}`);
    }

    const materialMap = new Map<string, PurchaseMaterial>();
    for (const material of (materialResult.data || []) as PurchaseMaterial[]) materialMap.set(material.id, material);
    const orderMap = new Map<string, OrderSummary>();
    for (const order of (orderResult.data || []) as OrderSummary[]) orderMap.set(order.id, order);

    setGroups((groupRows || []) as ActivityGroup[]);
    setItems(nextItems);
    setPurchaseMaterials(materialMap);
    setOrdersById(orderMap);
    setPricingDrafts((current) => {
      const next = { ...current };
      for (const material of materialMap.values()) {
        if (!next[material.id]) {
          next[material.id] = {
            quantity: String(material.quantity ?? 1),
            unit: material.unit || "un",
            unitPrice: material.unit_price == null ? "" : String(material.unit_price),
          };
        }
      }
      return next;
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadActivities();

    const channel = supabase
      .channel(`publicolor-activities-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_groups" }, () => void loadActivities(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => void loadActivities(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_materials" }, () => void loadActivities(true))
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
    return {
      groups: groups.length,
      pending: pending.length,
      today: pending.filter((item) => dueState(item.due_date, item.due_at, false) === "today").length,
      late: pending.filter((item) => dueState(item.due_date, item.due_at, false) === "late").length,
      completed: items.filter((item) => item.completed).length,
    };
  }, [groups.length, items]);

  const normalizedSearch = normalizeSearch(search);

  const filteredGroups = useMemo(() => {
    if (!normalizedSearch) return groups;
    return groups.filter((group) => {
      if (`${group.name} ${group.description || ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch)) return true;
      return items.some((item) => item.group_id === group.id && `${item.title} ${item.description || ""} ${activityStatusLabel[item.activity_status]}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
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
    const managedPurchase = taskEditor.item?.activity_type === "material_purchase" || taskEditor.item?.activity_type === "purchase_order";
    const groupId = managedPurchase ? taskEditor.item!.group_id : String(form.get("group_id") || "").trim();
    const parentId = managedPurchase ? taskEditor.item?.parent_id || "" : String(form.get("parent_id") || "").trim();
    const title = managedPurchase ? taskEditor.item!.title : String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const dueAtInput = managedPurchase
      ? toDueInputValue(taskEditor.item!.due_at, taskEditor.item!.due_date)
      : String(form.get("due_at") || "").trim();
    const dueDate = dueAtInput ? dueAtInput.slice(0, 10) : "";
    const dueAt = dueAtInput ? new Date(dueAtInput).toISOString() : null;
    const priority = String(form.get("priority") || "normal") as ActivityPriority;
    const itemHasChildren = Boolean(taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id));
    const activityStatus = itemHasChildren && taskEditor.item
      ? taskEditor.item.activity_status
      : String(form.get("activity_status") || "pending") as PurchaseActivityStatus;
    const assignedTo = managedPurchase ? taskEditor.item!.assigned_to || currentUserId : String(form.get("assigned_to") || "").trim();
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
          due_at: dueAt,
          priority,
          activity_status: activityStatus,
          completed: activityStatus === "finalized",
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
        due_at: dueAt,
        priority,
        activity_status: activityStatus,
        activity_type: "general",
        completed: activityStatus === "finalized",
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

  function requestStatusChange(item: ActivityItem, nextStatus: PurchaseActivityStatus) {
    if (!canOperate || busyId || item.activity_status === nextStatus) return;
    const childIds = items.filter((child) => child.parent_id === item.id).map((child) => child.id);
    if (childIds.length) {
      setStatusCascade({ item, nextStatus, childIds });
      return;
    }
    void updateActivityStatus(item, nextStatus, false);
  }

  async function updateActivityStatus(item: ActivityItem, activityStatus: PurchaseActivityStatus, includeChildren: boolean) {
    if (!canOperate || busyId || (item.activity_status === activityStatus && !includeChildren)) return;
    setBusyId(item.id);
    setError("");

    const completed = activityStatus === "finalized";
    const patch = { activity_status: activityStatus, completed, updated_at: new Date().toISOString() };
    const childIds = includeChildren ? items.filter((child) => child.parent_id === item.id).map((child) => child.id) : [];

    if (childIds.length) {
      const { error: childError } = await supabase.from("activities").update(patch).in("id", childIds);
      if (childError) {
        setError(`Não foi possível atualizar as subatividades: ${childError.message}`);
        setBusyId("");
        return;
      }
    }

    const { error: updateError } = await supabase.from("activities").update(patch).eq("id", item.id);
    if (updateError) {
      setError(`Não foi possível atualizar o status: ${updateError.message}`);
    } else {
      await loadActivities(true);
      setNotice(includeChildren && childIds.length
        ? `Status alterado para ${activityStatusLabel[activityStatus]} na atividade principal e em ${childIds.length} subatividade${childIds.length === 1 ? "" : "s"}.`
        : completed && item.activity_type === "material_purchase"
          ? "Compra finalizada. O material já consta como disponível na OS."
          : `Status alterado para ${activityStatusLabel[activityStatus]}.`);

      if (item.parent_id) {
        const siblings = items.filter((sibling) => sibling.parent_id === item.parent_id && sibling.id !== item.id);
        const allFinalized = activityStatus === "finalized" && siblings.every((sibling) => sibling.activity_status === "finalized");
        const parent = items.find((candidate) => candidate.id === item.parent_id);
        if (allFinalized && parent && parent.activity_status !== "finalized") {
          const shouldFinalize = window.confirm("Todas as subatividades foram finalizadas. Deseja finalizar também a atividade principal?");
          if (shouldFinalize) {
            const { error: parentError } = await supabase.from("activities").update({ activity_status: "finalized", completed: true, updated_at: new Date().toISOString() }).eq("id", parent.id);
            if (parentError) setError(`As subatividades foram concluídas, mas a atividade principal não pôde ser finalizada: ${parentError.message}`);
            else {
              await loadActivities(true);
              setNotice("Subatividades e atividade principal finalizadas.");
            }
          }
        }
      }
    }
    setBusyId("");
  }

  function toggleCompleted(item: ActivityItem) {
    requestStatusChange(item, item.completed ? "pending" : "finalized");
  }

  async function savePurchasePricing(event: FormEvent<HTMLFormElement>, item: ActivityItem, material: PurchaseMaterial) {
    event.preventDefault();
    if (!canOperate || busyId) return;
    const draft = pricingDrafts[material.id] || {
      quantity: String(material.quantity),
      unit: material.unit,
      unitPrice: material.unit_price == null ? "" : String(material.unit_price),
    };
    const quantity = parseDecimal(draft.quantity);
    const unitPrice = draft.unitPrice.trim() ? parseDecimal(draft.unitPrice) : null;
    const unit = draft.unit.trim();
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    if (!unit) {
      setError("Informe a unidade do material.");
      return;
    }
    if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      setError("Informe um preço unitário válido.");
      return;
    }

    setBusyId(`price-${item.id}`);
    setError("");
    const { error: updateError } = await supabase
      .from("order_materials")
      .update({ quantity, unit, unit_price: unitPrice })
      .eq("id", material.id);

    if (updateError) setError(`Não foi possível salvar quantidade e preço: ${updateError.message}`);
    else {
      setPurchaseMaterials((current) => {
        const next = new Map(current);
        next.set(material.id, { ...material, quantity, unit, unit_price: unitPrice });
        return next;
      });
      setNotice("Quantidade e preço atualizados.");
    }
    setBusyId("");
  }

  async function copyPurchaseList(item: ActivityItem, childItems: ActivityItem[]) {
    const purchaseChildren = childItems.filter((child) => child.activity_type === "material_purchase" && child.order_material_id);
    if (!purchaseChildren.length) {
      setError("Esta atividade ainda não possui produtos vinculados para copiar.");
      return;
    }
    const order = item.order_id ? ordersById.get(item.order_id) : null;
    const lines = purchaseChildren.map((child, index) => {
      const material = child.order_material_id ? purchaseMaterials.get(child.order_material_id) : null;
      const name = material?.material_name || child.title.replace(/^Comprar\s+/i, "");
      const quantity = material ? quantityFormatter.format(Number(material.quantity || 0)) : "1";
      const unit = material?.unit || "un";
      return `${index + 1}. ${name} — ${quantity} ${unit}`;
    });
    const heading = order ? `PEDIDO DE COMPRA — OP ${order.op_number}` : "PEDIDO DE COMPRA";
    const client = order?.client_name ? `\nCliente: ${order.client_name}` : "";
    const message = `${heading}${client}\n\n${lines.join("\n")}`;
    try {
      await copyText(message);
      setNotice("Lista de produtos e quantidades copiada.");
    } catch (copyError) {
      setError(`Não foi possível copiar a lista: ${copyError instanceof Error ? copyError.message : "erro desconhecido"}`);
    }
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
    if (!canOperate) return;
    if (items.some((item) => item.group_id === group.id && (item.activity_type === "material_purchase" || item.activity_type === "purchase_order"))) {
      setError("O grupo Compras possui atividades automáticas vinculadas a materiais de OS e não pode ser excluído.");
      return;
    }
    if (!window.confirm(`Excluir o grupo “${group.name}” e todas as atividades dele?`)) return;
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
    const material = item.order_material_id ? purchaseMaterials.get(item.order_material_id) : null;
    return `${item.title} ${item.description || ""} ${material?.material_name || ""} ${activityStatusLabel[item.activity_status]}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
  }

  function updatePricingDraft(materialId: string, field: keyof PricingDraft, value: string) {
    setPricingDrafts((current) => ({
      ...current,
      [materialId]: {
        quantity: current[materialId]?.quantity ?? "1",
        unit: current[materialId]?.unit ?? "un",
        unitPrice: current[materialId]?.unitPrice ?? "",
        [field]: value,
      },
    }));
  }

  function renderTask(item: ActivityItem, childItems: ActivityItem[], showCompleted: boolean, isSubtask = false) {
    const assigned = item.assigned_to ? profileById.get(item.assigned_to) : null;
    const visibleChildren = childItems.filter((child) => (showCompleted || !child.completed) && (taskMatchesSearch(child) || taskMatchesSearch(item)));
    const completedChildren = childItems.filter((child) => child.completed).length;
    const state = dueState(item.due_date, item.due_at, item.completed);
    const isChildrenCollapsed = collapsedTasks.has(item.id);
    const material = item.order_material_id ? purchaseMaterials.get(item.order_material_id) : null;
    const draft = material ? pricingDrafts[material.id] || {
      quantity: String(material.quantity),
      unit: material.unit,
      unitPrice: material.unit_price == null ? "" : String(material.unit_price),
    } : null;
    const draftQuantity = draft ? parseDecimal(draft.quantity) : Number.NaN;
    const draftUnitPrice = draft?.unitPrice.trim() ? parseDecimal(draft.unitPrice) : Number.NaN;
    const subtotal = Number.isFinite(draftQuantity) && Number.isFinite(draftUnitPrice)
      ? draftQuantity * draftUnitPrice
      : material && material.unit_price != null
        ? Number(material.quantity) * Number(material.unit_price)
        : null;
    const purchaseChildren = childItems.filter((child) => child.activity_type === "material_purchase" && child.order_material_id);
    const purchaseSummary = purchaseChildren.reduce((summary, child) => {
      const childMaterial = child.order_material_id ? purchaseMaterials.get(child.order_material_id) : null;
      if (!childMaterial || childMaterial.unit_price == null) return { ...summary, missing: summary.missing + 1 };
      return { ...summary, total: summary.total + Number(childMaterial.quantity) * Number(childMaterial.unit_price), priced: summary.priced + 1 };
    }, { total: 0, priced: 0, missing: 0 });

    const hasOpenChildren = childItems.some((child) => !child.completed);

    return <div className={`activity-task ${isSubtask ? "is-subtask" : ""} ${item.completed ? "is-completed" : ""} ${hasOpenChildren ? "has-open-children" : ""}`} key={item.id}>
      <div className="activity-task-main">
        <button
          type="button"
          className="activity-check"
          data-checked={item.completed ? "true" : "false"}
          aria-label={item.completed ? `Reabrir ${item.title}` : `Concluir ${item.title}`}
          title={item.completed ? "Reabrir atividade" : "Marcar como concluída"}
          disabled={!canOperate || busyId === item.id}
          onClick={() => toggleCompleted(item)}
        >{item.completed ? "✓" : ""}</button>
        <div className="activity-task-copy">
          <div className="activity-task-title-row">
            {!isSubtask && childItems.length > 0 && <button
              type="button"
              className="activity-subtask-toggle"
              onClick={() => toggleSet(setCollapsedTasks, item.id)}
              aria-expanded={!isChildrenCollapsed}
              aria-label={isChildrenCollapsed ? "Expandir subatividades" : "Recolher subatividades"}
              title={isChildrenCollapsed ? "Expandir subatividades" : "Recolher subatividades"}
            >{isChildrenCollapsed ? "›" : "⌄"}</button>}
            <b>{item.title}</b>
            {!isSubtask && childItems.length > 0 && <span className="activity-subtask-progress">{completedChildren}/{childItems.length} subatividades</span>}
          </div>
          {item.description && <p>{item.description}</p>}
          <div className="activity-task-meta">
            <span data-priority={item.priority}>{priorityLabel[item.priority]}</span>
            <span data-activity-status={item.activity_status}>{activityStatusLabel[item.activity_status]}</span>
            {item.activity_type === "purchase_order" && <span data-activity-type="purchase_order">Compra consolidada da OS</span>}
            {item.activity_type === "material_purchase" && <span data-activity-type="material_purchase">Produto vinculado à OS</span>}
            <span data-due={state}>{state === "late" ? "Atrasada · " : state === "today" ? "Hoje · " : ""}{dateLabel(item.due_date, item.due_at)}</span>
            <span>{assigned ? `Responsável: ${assigned.name || assigned.email}` : "Sem responsável"}</span>
          </div>
          {item.activity_type === "purchase_order" && purchaseChildren.length > 0 && <div className="activity-purchase-summary">
            <div><small>PRODUTOS</small><strong>{purchaseChildren.length}</strong></div>
            <div><small>COM PREÇO</small><strong>{purchaseSummary.priced}</strong></div>
            <div className="total"><small>{purchaseSummary.missing ? "TOTAL PARCIAL" : "TOTAL ESTIMADO"}</small><strong>{currencyFormatter.format(purchaseSummary.total)}</strong></div>
            {purchaseSummary.missing > 0 && <span>{purchaseSummary.missing} item(ns) ainda sem preço</span>}
          </div>}
          {item.activity_type === "material_purchase" && material && draft && <form className="activity-purchase-pricing" onSubmit={(event) => void savePurchasePricing(event, item, material)}>
            <label><span>Quantidade</span><input inputMode="decimal" value={draft.quantity} onChange={(event) => updatePricingDraft(material.id, "quantity", event.target.value)} disabled={!canOperate || busyId === `price-${item.id}`} /></label>
            <label><span>Unidade</span><input value={draft.unit} onChange={(event) => updatePricingDraft(material.id, "unit", event.target.value)} placeholder="un, chapa, barra…" disabled={!canOperate || busyId === `price-${item.id}`} /></label>
            <label><span>Preço unitário</span><div className="currency-input"><i>R$</i><input inputMode="decimal" value={draft.unitPrice} onChange={(event) => updatePricingDraft(material.id, "unitPrice", event.target.value)} placeholder="0,00" disabled={!canOperate || busyId === `price-${item.id}`} /></div></label>
            <div className="activity-purchase-subtotal"><span>Subtotal</span><b>{subtotal == null ? "Preço não informado" : currencyFormatter.format(subtotal)}</b></div>
            {canOperate && <button type="submit" disabled={busyId === `price-${item.id}`}>{busyId === `price-${item.id}` ? "Salvando…" : "Salvar valores"}</button>}
          </form>}
        </div>
        {(canOperate || (!isSubtask && item.activity_type === "purchase_order" && childItems.length > 0)) && <div className="activity-task-actions">
          {canOperate && <label className="activity-status-control">
            <span>Status</span>
            <select
              value={item.activity_status}
              onChange={(event) => requestStatusChange(item, event.target.value as PurchaseActivityStatus)}
              disabled={busyId === item.id}
            >
              {activityStatusOptions.map((status) => <option key={status} value={status}>{activityStatusLabel[status]}</option>)}
            </select>
          </label>}
          {!isSubtask && item.activity_type === "purchase_order" && childItems.length > 0 && <button type="button" className="copy-purchase-button" onClick={() => void copyPurchaseList(item, childItems)} title="Copiar produtos e quantidades"><span aria-hidden="true">⧉</span> Copiar lista</button>}
          {canOperate && !isSubtask && item.activity_type === "general" && <button type="button" onClick={() => openNewTask(item.group_id, item.id)}>＋ Subatividade</button>}
          {canOperate && <button type="button" onClick={() => setTaskEditor({ mode: "edit", item, groupId: item.group_id, parentId: item.parent_id || "" })}>Editar</button>}
          {canOperate && (item.activity_type === "general"
            ? <button type="button" className="danger" onClick={() => void deleteTask(item)} disabled={busyId === item.id}>Excluir</button>
            : <span className="activity-managed-label">Gerenciada pela OS</span>)}
        </div>}
      </div>
      {!isChildrenCollapsed && visibleChildren.length > 0 && <div className="activity-subtasks">{visibleChildren.map((child) => renderTask(child, [], showCompleted, true))}</div>}
      {!isSubtask && childItems.length > 0 && isChildrenCollapsed && <button type="button" className="activity-subtasks-collapsed" onClick={() => toggleSet(setCollapsedTasks, item.id)}>Mostrar {childItems.length} subatividade{childItems.length === 1 ? "" : "s"}</button>}
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
      <label className="activities-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar grupo, atividade, material ou descrição..." /></label>
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
          const hasOpenChildren = children.some((child) => !child.completed);
          return searchMatch && (showCompleted || !item.completed || hasOpenChildren);
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

    {statusCascade && <div className="overlay activities-overlay" onMouseDown={() => !busyId && setStatusCascade(null)}><div className="modal activity-status-cascade-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar" onClick={() => setStatusCascade(null)} disabled={Boolean(busyId)}>×</button>
      <p className="eyebrow">ALTERAÇÃO DE STATUS</p>
      <h2>Aplicar também às subatividades?</h2>
      <p>A atividade <b>{statusCascade.item.title}</b> possui {statusCascade.childIds.length} subatividade{statusCascade.childIds.length === 1 ? "" : "s"}.</p>
      <div className="activity-status-change-preview"><span>Novo status</span><strong>{activityStatusLabel[statusCascade.nextStatus]}</strong></div>
      {statusCascade.nextStatus === "finalized" && <div className="activity-status-warning">Finalizar somente a principal manterá as subatividades abertas. A atividade principal continuará visível enquanto houver itens pendentes.</div>}
      <div className="activity-cascade-actions">
        <button type="button" className="secondary" onClick={() => setStatusCascade(null)} disabled={Boolean(busyId)}>Cancelar</button>
        <button type="button" className="secondary" onClick={() => { const state = statusCascade; setStatusCascade(null); void updateActivityStatus(state.item, state.nextStatus, false); }} disabled={Boolean(busyId)}>Somente principal</button>
        <button type="button" className="primary" onClick={() => { const state = statusCascade; setStatusCascade(null); void updateActivityStatus(state.item, state.nextStatus, true); }} disabled={Boolean(busyId)}>Principal e todas as subs</button>
      </div>
    </div></div>}

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
        <label>Grupo<select name="group_id" value={taskEditor.groupId} required disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)} onChange={(event) => setTaskEditor((current) => current ? { ...current, groupId: event.target.value, parentId: "" } : current)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label>Tipo<select name="parent_id" value={taskEditor.parentId} disabled={Boolean((taskEditor.item && taskEditor.item.activity_type !== "general") || (taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id)))} onChange={(event) => setTaskEditor((current) => current ? { ...current, parentId: event.target.value } : current)}><option value="">Atividade principal</option>{items.filter((item) => !item.parent_id && item.id !== taskEditor.item?.id && item.group_id === taskEditor.groupId && item.activity_type === "general").map((item) => <option key={item.id} value={item.id}>Subatividade de: {item.title}</option>)}</select>{taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id) && <small>Atividades com subatividades permanecem como atividade principal.</small>}</label>
        <label className="wide">Título<input name="title" defaultValue={taskEditor.item?.title || ""} disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)} placeholder="Ex.: Conferir pedidos com entrega amanhã" required autoFocus /></label>
        <label className="wide">Descrição<textarea name="description" defaultValue={taskEditor.item?.description || ""} placeholder="Orientações, detalhes ou observações (opcional)." /></label>
        <label>Prazo<input type="datetime-local" name="due_at" defaultValue={toDueInputValue(taskEditor.item?.due_at || null, taskEditor.item?.due_date || null)} disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)} />{taskEditor.item && taskEditor.item.activity_type !== "general" && <small>Prazo automático de 24 horas após criação ou reabertura.</small>}</label>
        <label>Prioridade<select name="priority" defaultValue={taskEditor.item?.priority || "normal"}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
        <label>Status<select name="activity_status" defaultValue={taskEditor.item?.activity_status || "pending"} disabled={Boolean(taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id))}>{activityStatusOptions.map((status) => <option key={status} value={status}>{activityStatusLabel[status]}</option>)}</select>{taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id) && <small>Use o seletor do cartão para decidir se o status será aplicado às subatividades.</small>}</label>
        <label>Responsável<select name="assigned_to" defaultValue={taskEditor.item?.assigned_to || ""} disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)}><option value="">Sem responsável definido</option>{activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || profile.email}</option>)}</select></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setTaskEditor(null)}>Cancelar</button><button type="submit" className="primary" disabled={busyId === "task-editor"}>{busyId === "task-editor" ? "Salvando…" : "Salvar atividade"}</button></div>
    </form></div>}
  </section>;
}
