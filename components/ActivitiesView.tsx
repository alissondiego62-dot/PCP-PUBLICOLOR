"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import type { DetailTab, Order, OrderMaterial, Profile, PurchaseActivityStatus } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { MaterialEditorModal } from "@/components/MaterialEditorModal";
import { ORDER_MATERIAL_COLUMNS, type MaterialEditorSubmission } from "@/lib/order-materials";

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
  deleted_at?: string | null;
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

type PricingSaveStatus = "idle" | "saving" | "saved" | "error";
type ActivityIconName = "add" | "copy" | "edit" | "delete" | "lock" | "check" | "info" | "view";
type ActivityViewMode = "active" | "purchases" | "completed";

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

function readStoredSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try { return new Set<string>(JSON.parse(window.localStorage.getItem(key) || "[]")); }
  catch { return new Set<string>(); }
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

function ActivityIcon({ name }: { name: ActivityIconName }) {
  const paths: Record<ActivityIconName, ReactNode> = {
    add: <><path d="M12 5v14M5 12h14" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    delete: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    view: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

export function ActivitiesView({
  profiles,
  orders,
  currentUserId,
  canOperate,
  onOpenOrder,
}: {
  profiles: Profile[];
  orders: Order[];
  currentUserId: string;
  canOperate: boolean;
  onOpenOrder: (order: Order, tab: DetailTab) => void;
}) {
  const [groups, setGroups] = useState<ActivityGroup[]>([]);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [purchaseMaterials, setOrderMaterials] = useState<Map<string, OrderMaterial>>(new Map());
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, PricingDraft>>({});
  const [pricingSaveState, setPricingSaveState] = useState<Record<string, PricingSaveStatus>>({});
  const [materialNameDrafts, setMaterialNameDrafts] = useState<Record<string, string>>({});
  const [materialNameSaveState, setMaterialNameSaveState] = useState<Record<string, PricingSaveStatus>>({});
  const [viewMode, setViewMode] = useState<ActivityViewMode>(() => typeof window !== "undefined" ? (window.localStorage.getItem("pcp-activities-view") as ActivityViewMode || "active") : "active");
  const [copiedId, setCopiedId] = useState("");
  const [continuousAddCount, setContinuousAddCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => readStoredSet("pcp-activities-collapsed-groups"));
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(() => readStoredSet("pcp-activities-collapsed-tasks"));
  const [showCompletedGroups, setShowCompletedGroups] = useState<Set<string>>(new Set());
  const [completedLimit, setCompletedLimit] = useState(100);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [groupEditor, setGroupEditor] = useState<GroupEditorState | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditorState | null>(null);
  const [statusCascade, setStatusCascade] = useState<StatusCascadeState | null>(null);
  const [purchaseDetailMaterial, setPurchaseDetailMaterial] = useState<OrderMaterial | null>(null);
  const pricingDraftsRef = useRef<Record<string, PricingDraft>>({});
  const materialNameDraftsRef = useRef<Record<string, string>>({});
  const pricingTimersRef = useRef<Map<string, number>>(new Map());
  const materialNameTimersRef = useRef<Map<string, number>>(new Map());
  const pricingVersionsRef = useRef<Map<string, number>>(new Map());
  const materialNameVersionsRef = useRef<Map<string, number>>(new Map());
  const pricingInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const taskFormRef = useRef<HTMLFormElement>(null);
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const continueAfterSaveRef = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);

  const activeProfiles = useMemo(
    () => profiles.filter((profile) => profile.active).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "pt-BR")),
    [profiles],
  );

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);

  async function loadActivities(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    const activityColumns = "id,group_id,parent_id,title,description,due_date,due_at,priority,assigned_to,completed,activity_status,activity_type,order_id,order_material_id,completed_at,completed_by,position,created_by,created_at,updated_at,deleted_at";
    const [groupResult, activeResult, completedResult, completedCountResult] = await Promise.all([
      supabase.from("activity_groups").select("id,name,description,position,created_by,created_at,updated_at").order("position").order("created_at"),
      supabase.from("activities").select(activityColumns).eq("completed", false).is("deleted_at", null).order("position").order("created_at"),
      supabase.from("activities").select(activityColumns).eq("completed", true).is("deleted_at", null).order("completed_at", { ascending: false, nullsFirst: false }).limit(completedLimit),
      supabase.from("activities").select("id", { count: "exact", head: true }).eq("completed", true).is("deleted_at", null),
    ]);
    const groupRows = groupResult.data;
    const groupError = groupResult.error;
    const itemRows = [...(activeResult.data || []), ...(completedResult.data || [])];
    const itemError = activeResult.error || completedResult.error;
    setCompletedTotal(completedCountResult.count || 0);

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
    const materialResult = materialIds.length
      ? await supabase.from("order_materials").select(ORDER_MATERIAL_COLUMNS).in("id", materialIds).is("deleted_at", null)
      : { data: [], error: null };

    if (materialResult.error) {
      const schemaHint = /column|schema cache|availability|unit_price|purchase_status/i.test(materialResult.error.message)
        ? " O banco conectado ainda não possui a estrutura completa de Materiais e Compras. Execute o SQL cumulativo 3.4.1."
        : "";
      setError(`As atividades foram carregadas, mas os dados de compra não puderam ser consultados: ${materialResult.error.message}.${schemaHint}`);
    }

    const materialMap = new Map<string, OrderMaterial>();
    for (const material of (materialResult.data || []) as OrderMaterial[]) materialMap.set(material.id, material);

    setGroups((groupRows || []) as ActivityGroup[]);
    setItems(nextItems);
    setOrderMaterials(materialMap);
    setMaterialNameDrafts((current) => {
      const next = { ...current };
      for (const material of materialMap.values()) {
        if (!materialNameTimersRef.current.has(material.id)) next[material.id] = material.material_name;
      }
      materialNameDraftsRef.current = next;
      return next;
    });
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
      pricingDraftsRef.current = next;
      return next;
    });
    setLoading(false);
  }

  useEffect(() => {
    void loadActivities();

    const channel = supabase
      .channel(`publicolor-activities-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_groups" }, () => void loadActivities(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, (payload) => {
        const event = payload.eventType;
        const next = payload.new as ActivityItem;
        const previous = payload.old as Partial<ActivityItem>;
        setItems((current) => {
          if (event === "DELETE" || next?.deleted_at) return current.filter((item) => item.id !== (previous.id || next.id));
          const exists = current.some((item) => item.id === next.id);
          return exists ? current.map((item) => item.id === next.id ? next : item) : [...current, next];
        });
        if (next?.order_material_id) {
          void supabase.from("order_materials").select(ORDER_MATERIAL_COLUMNS).eq("id", next.order_material_id).is("deleted_at", null).maybeSingle().then(({ data }) => {
            if (!data) return;
            setOrderMaterials((current) => new Map(current).set(data.id, data as OrderMaterial));
          });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_materials" }, (payload) => {
        const event = payload.eventType;
        const next = payload.new as OrderMaterial & { deleted_at?: string | null };
        const previous = payload.old as Partial<OrderMaterial>;
        setOrderMaterials((current) => {
          const map = new Map(current);
          const id = previous.id || next.id;
          if (event === "DELETE" || next?.deleted_at) map.delete(id); else if (map.has(next.id)) map.set(next.id, next);
          return map;
        });
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, completedLimit]);

  useEffect(() => { window.localStorage.setItem("pcp-activities-view", viewMode); }, [viewMode]);
  useEffect(() => { window.localStorage.setItem("pcp-activities-collapsed-groups", JSON.stringify(Array.from(collapsedGroups))); }, [collapsedGroups]);
  useEffect(() => { window.localStorage.setItem("pcp-activities-collapsed-tasks", JSON.stringify(Array.from(collapsedTasks))); }, [collapsedTasks]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    for (const timer of pricingTimersRef.current.values()) window.clearTimeout(timer);
    for (const timer of materialNameTimersRef.current.values()) window.clearTimeout(timer);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
  }, []);

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

  const itemMatchesViewMode = useCallback((item: ActivityItem) => {
    if (viewMode === "purchases") return (item.activity_type === "purchase_order" || item.activity_type === "material_purchase") && !item.completed;
    if (viewMode === "completed") return item.completed;
    return !item.completed;
  }, [viewMode]);

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      const groupItems = items.filter((item) => item.group_id === group.id);
      const modeMatch = groupItems.some((item) => itemMatchesViewMode(item) || (item.parent_id === null && groupItems.some((child) => child.parent_id === item.id && itemMatchesViewMode(child))));
      if (!modeMatch) return false;
      if (!normalizedSearch) return true;
      if (`${group.name} ${group.description || ""}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch)) return true;
      return groupItems.some((item) => `${item.title} ${item.description || ""} ${activityStatusLabel[item.activity_status]}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });
  }, [groups, itemMatchesViewMode, items, normalizedSearch]);

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
    if (!taskEditor || !canOperate || busyId === "task-editor") return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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

    const continueAdding = taskEditor.mode === "create" && continueAfterSaveRef.current;
    continueAfterSaveRef.current = false;
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
        await loadActivities(true);
        if (continueAdding) {
          const titleInput = formElement.elements.namedItem("title");
          const descriptionInput = formElement.elements.namedItem("description");
          if (titleInput instanceof HTMLInputElement) titleInput.value = "";
          if (descriptionInput instanceof HTMLTextAreaElement) descriptionInput.value = "";
          setContinuousAddCount((current) => current + 1);
          setNotice(parentId ? "Subatividade adicionada. Digite a próxima." : "Atividade adicionada. Digite a próxima.");
          window.requestAnimationFrame(() => taskTitleRef.current?.focus());
        } else {
          setNotice(parentId ? "Subatividade criada." : "Atividade criada.");
          setTaskEditor(null);
          setContinuousAddCount(0);
        }
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
      const { error: cascadeError } = await supabase.rpc("cascade_activity_status", { p_activity_id: item.id, p_status: activityStatus, p_include_children: true });
      if (cascadeError) {
        setError(`Não foi possível atualizar a atividade e suas subatividades: ${cascadeError.message}`);
        setBusyId("");
        return;
      }
      await loadActivities(true);
      setNotice(`Status alterado para ${activityStatusLabel[activityStatus]} na atividade principal e em ${childIds.length} subatividade${childIds.length === 1 ? "" : "s"}.`);
      setBusyId("");
      return;
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

  function getPricingDraft(material: OrderMaterial) {
    return pricingDraftsRef.current[material.id] || {
      quantity: String(material.quantity),
      unit: material.unit,
      unitPrice: material.unit_price == null ? "" : String(material.unit_price),
    };
  }

  function validatePricingDraft(draft: PricingDraft) {
    const quantity = parseDecimal(draft.quantity);
    const unitPrice = draft.unitPrice.trim() ? parseDecimal(draft.unitPrice) : null;
    const unit = draft.unit.trim();
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantidade inválida." } as const;
    if (!unit) return { error: "Unidade obrigatória." } as const;
    if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) return { error: "Preço inválido." } as const;
    return { quantity, unit, unitPrice, error: "" } as const;
  }

  async function persistPurchasePricing(material: OrderMaterial, draft: PricingDraft, announceError = false) {
    if (!canOperate) return false;
    const timer = pricingTimersRef.current.get(material.id);
    if (timer !== undefined) window.clearTimeout(timer);
    pricingTimersRef.current.delete(material.id);

    const parsed = validatePricingDraft(draft);
    if (parsed.error) {
      setPricingSaveState((current) => ({ ...current, [material.id]: "error" }));
      if (announceError) setError(parsed.error);
      return false;
    }

    const latestMaterial = purchaseMaterials.get(material.id) || material;
    const unchanged = Number(latestMaterial.quantity) === parsed.quantity
      && latestMaterial.unit === parsed.unit
      && (latestMaterial.unit_price == null ? null : Number(latestMaterial.unit_price)) === parsed.unitPrice;
    if (unchanged) {
      setPricingSaveState((current) => ({ ...current, [material.id]: "saved" }));
      return true;
    }

    const version = (pricingVersionsRef.current.get(material.id) || 0) + 1;
    pricingVersionsRef.current.set(material.id, version);
    setPricingSaveState((current) => ({ ...current, [material.id]: "saving" }));
    const { error: updateError } = await supabase
      .from("order_materials")
      .update({ quantity: parsed.quantity, unit: parsed.unit, unit_price: parsed.unitPrice })
      .eq("id", material.id);

    if (pricingVersionsRef.current.get(material.id) !== version) return !updateError;
    if (updateError) {
      setPricingSaveState((current) => ({ ...current, [material.id]: "error" }));
      setError(`Não foi possível salvar os valores de ${material.material_name}: ${updateError.message}`);
      return false;
    }

    setOrderMaterials((current) => {
      const next = new Map(current);
      next.set(material.id, {
        ...latestMaterial,
        quantity: parsed.quantity,
        unit: parsed.unit,
        unit_price: parsed.unitPrice,
      });
      return next;
    });
    setPricingSaveState((current) => ({ ...current, [material.id]: "saved" }));
    return true;
  }

  function updatePricingDraft(material: OrderMaterial, field: keyof PricingDraft, value: string) {
    const currentDraft = getPricingDraft(material);
    const nextDraft = { ...currentDraft, [field]: value };
    pricingDraftsRef.current = { ...pricingDraftsRef.current, [material.id]: nextDraft };
    pricingVersionsRef.current.set(material.id, (pricingVersionsRef.current.get(material.id) || 0) + 1);
    setPricingDrafts(pricingDraftsRef.current);
    setPricingSaveState((current) => ({ ...current, [material.id]: "idle" }));

    const previousTimer = pricingTimersRef.current.get(material.id);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      void persistPurchasePricing(material, pricingDraftsRef.current[material.id] || nextDraft);
    }, 850);
    pricingTimersRef.current.set(material.id, timer);
  }

  function flushPurchasePricing(material: OrderMaterial, announceError = false) {
    return persistPurchasePricing(material, getPricingDraft(material), announceError);
  }

  async function persistMaterialName(item: ActivityItem, material: OrderMaterial, announceError = false) {
    if (!canOperate) return false;
    const timer = materialNameTimersRef.current.get(material.id);
    if (timer !== undefined) window.clearTimeout(timer);
    materialNameTimersRef.current.delete(material.id);

    const nextName = String(materialNameDraftsRef.current[material.id] ?? material.material_name).trim();
    if (!nextName) {
      setMaterialNameSaveState((current) => ({ ...current, [material.id]: "error" }));
      if (announceError) setError("O nome do material não pode ficar vazio.");
      return false;
    }
    if (nextName === material.material_name && nextName === item.title) {
      setMaterialNameSaveState((current) => ({ ...current, [material.id]: "saved" }));
      return true;
    }

    const version = (materialNameVersionsRef.current.get(material.id) || 0) + 1;
    materialNameVersionsRef.current.set(material.id, version);
    setMaterialNameSaveState((current) => ({ ...current, [material.id]: "saving" }));
    let { error: updateError } = await supabase.rpc("rename_linked_order_material", {
      p_activity_id: item.id,
      p_material_name: nextName,
    });
    if (updateError && ["42883", "PGRST202"].includes(updateError.code || "")) {
      const fallbackResult = await supabase
        .from("order_materials")
        .update({ material_name: nextName })
        .eq("id", material.id);
      updateError = fallbackResult.error;
    }

    if (materialNameVersionsRef.current.get(material.id) !== version) return !updateError;
    if (updateError) {
      setMaterialNameSaveState((current) => ({ ...current, [material.id]: "error" }));
      setError(`Não foi possível renomear ${material.material_name}: ${updateError.message}`);
      return false;
    }

    setOrderMaterials((current) => {
      const next = new Map(current);
      next.set(material.id, { ...material, material_name: nextName });
      return next;
    });
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, title: nextName } : candidate));
    setMaterialNameSaveState((current) => ({ ...current, [material.id]: "saved" }));
    setNotice("Nome atualizado na atividade e nos materiais da OS.");
    return true;
  }

  function updateMaterialNameDraft(item: ActivityItem, material: OrderMaterial, value: string) {
    const nextDrafts = { ...materialNameDraftsRef.current, [material.id]: value };
    materialNameDraftsRef.current = nextDrafts;
    setMaterialNameDrafts(nextDrafts);
    setMaterialNameSaveState((current) => ({ ...current, [material.id]: "idle" }));
    materialNameVersionsRef.current.set(material.id, (materialNameVersionsRef.current.get(material.id) || 0) + 1);
    const previousTimer = materialNameTimersRef.current.get(material.id);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    materialNameTimersRef.current.set(material.id, window.setTimeout(() => {
      void persistMaterialName(item, material);
    }, 850));
  }

  function focusPricingInput(materialId: string, field: keyof PricingDraft) {
    window.requestAnimationFrame(() => {
      const input = pricingInputRefs.current.get(`${materialId}:${field}`);
      input?.focus();
      input?.select();
    });
  }

  function handlePricingKeyDown(event: KeyboardEvent<HTMLInputElement>, item: ActivityItem, material: OrderMaterial, field: keyof PricingDraft) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void flushPurchasePricing(material, true);
    if (field === "quantity") {
      focusPricingInput(material.id, "unit");
      return;
    }
    if (field === "unit") {
      focusPricingInput(material.id, "unitPrice");
      return;
    }
    const purchaseItems = items.filter((candidate) => candidate.activity_type === "material_purchase" && candidate.order_material_id);
    const index = purchaseItems.findIndex((candidate) => candidate.id === item.id);
    const nextItem = index >= 0 ? purchaseItems[index + 1] : null;
    if (nextItem?.order_material_id) focusPricingInput(nextItem.order_material_id, "unitPrice");
    else event.currentTarget.blur();
  }

  function markCopied(id: string, message: string) {
    setCopiedId(id);
    setNotice(message);
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedId(""), 1800);
  }

  function purchaseLine(item: ActivityItem) {
    const material = item.order_material_id ? purchaseMaterials.get(item.order_material_id) : null;
    const draft = material ? getPricingDraft(material) : null;
    const name = material?.material_name || item.title.replace(/^Comprar\s+/i, "");
    const parsedQuantity = draft ? parseDecimal(draft.quantity) : Number.NaN;
    const quantity = Number.isFinite(parsedQuantity)
      ? quantityFormatter.format(parsedQuantity)
      : material
        ? quantityFormatter.format(Number(material.quantity || 0))
        : "1";
    const unit = draft?.unit.trim() || material?.unit || "un";
    return `${name} — ${quantity} ${unit}`;
  }

  async function copyPurchaseList(item: ActivityItem, childItems: ActivityItem[]) {
    const purchaseChildren = childItems.filter((child) => child.activity_type === "material_purchase" && child.order_material_id);
    if (!purchaseChildren.length) {
      setError("Esta atividade ainda não possui produtos vinculados para copiar.");
      return;
    }
    try {
      await copyText(purchaseChildren.map(purchaseLine).join("\n"));
      markCopied(item.id, "Produtos e quantidades copiados.");
    } catch (copyError) {
      setError(`Não foi possível copiar a lista: ${copyError instanceof Error ? copyError.message : "erro desconhecido"}`);
    }
  }

  async function copySingleActivity(item: ActivityItem) {
    try {
      const message = item.activity_type === "material_purchase" ? purchaseLine(item) : item.title;
      await copyText(message);
      markCopied(item.id, item.activity_type === "material_purchase" ? "Produto e quantidade copiados." : "Subatividade copiada.");
    } catch (copyError) {
      setError(`Não foi possível copiar: ${copyError instanceof Error ? copyError.message : "erro desconhecido"}`);
    }
  }

  async function deleteTask(item: ActivityItem) {
    if (!canOperate || !window.confirm(`Excluir “${item.title}” e todas as subatividades vinculadas?`)) return;
    setBusyId(item.id);
    const now = new Date().toISOString();
    const relatedIds = [item.id, ...items.filter((candidate) => candidate.parent_id === item.id).map((candidate) => candidate.id)];
    const { error: deleteError } = await supabase.from("activities").update({ deleted_at: now, deleted_by: currentUserId }).in("id", relatedIds);
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
    continueAfterSaveRef.current = false;
    setContinuousAddCount(0);
    setTaskEditor({ mode: "create", item: null, groupId, parentId });
  }

  function closeTaskEditor() {
    if (busyId === "task-editor") return;
    continueAfterSaveRef.current = false;
    setContinuousAddCount(0);
    setTaskEditor(null);
  }

  function submitTaskAndContinue() {
    if (!taskEditor || taskEditor.mode !== "create" || busyId === "task-editor") return;
    continueAfterSaveRef.current = true;
    taskFormRef.current?.requestSubmit();
  }

  function handleTaskTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.shiftKey || !taskEditor || taskEditor.mode !== "create") return;
    event.preventDefault();
    submitTaskAndContinue();
  }

  function taskMatchesSearch(item: ActivityItem) {
    if (!normalizedSearch) return true;
    const material = item.order_material_id ? purchaseMaterials.get(item.order_material_id) : null;
    return `${item.title} ${item.description || ""} ${material?.material_name || ""} ${activityStatusLabel[item.activity_status]}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
  }

  async function saveMaterialEditorFromActivities(submission: MaterialEditorSubmission) {
    if (!purchaseDetailMaterial || !canOperate) return;
    const material = purchaseDetailMaterial;
    setBusyId(`purchase-detail-${material.id}`);
    setError("");
    try {
      const { error: materialError } = await supabase
        .from("order_materials")
        .update(submission.patch)
        .eq("id", material.id);
      if (materialError) throw new Error(`Não foi possível salvar o material: ${materialError.message}`);

      const linkedActivity = items.find((item) => item.order_material_id === material.id);
      if (linkedActivity && linkedActivity.activity_status !== submission.purchaseStatus) {
        const { error: activityError } = await supabase
          .from("activities")
          .update({
            activity_status: submission.purchaseStatus,
            completed: submission.purchaseStatus === "finalized",
            updated_at: new Date().toISOString(),
          })
          .eq("id", linkedActivity.id);
        if (activityError) throw new Error(`O material foi salvo, mas o status da atividade não pôde ser atualizado: ${activityError.message}`);
      }

      await loadActivities(true);
      setPurchaseDetailMaterial(null);
      setNotice("Material, compra e dados da OS atualizados.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Não foi possível salvar o material.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusyId("");
    }
  }


  function renderTask(item: ActivityItem, childItems: ActivityItem[], showCompleted: boolean, isSubtask = false) {
    const assigned = item.assigned_to ? profileById.get(item.assigned_to) : null;
    const visibleChildren = childItems.filter((child) => {
      const modeVisible = viewMode === "completed" ? child.completed : viewMode === "purchases" ? !child.completed : (showCompleted || !child.completed);
      return modeVisible && (taskMatchesSearch(child) || taskMatchesSearch(item));
    });
    const completedChildren = childItems.filter((child) => child.completed).length;
    const state = dueState(item.due_date, item.due_at, item.completed);
    const isChildrenCollapsed = collapsedTasks.has(item.id);
    const material = item.order_material_id ? purchaseMaterials.get(item.order_material_id) : null;
    const linkedOrder = item.order_id ? orderById.get(item.order_id) : null;
    const draft = material ? pricingDrafts[material.id] || getPricingDraft(material) : null;
    const draftQuantity = draft ? parseDecimal(draft.quantity) : Number.NaN;
    const draftUnitPrice = draft?.unitPrice.trim() ? parseDecimal(draft.unitPrice) : Number.NaN;
    const subtotal = Number.isFinite(draftQuantity) && Number.isFinite(draftUnitPrice)
      ? draftQuantity * draftUnitPrice
      : material && (material.actual_unit_price ?? material.unit_price) != null
        ? Number(material.received_quantity ?? material.purchased_quantity ?? material.quantity) * Number(material.actual_unit_price ?? material.unit_price)
        : null;
    const purchaseChildren = childItems.filter((child) => child.activity_type === "material_purchase" && child.order_material_id);
    const purchaseSummary = purchaseChildren.reduce((summary, child) => {
      const childMaterial = child.order_material_id ? purchaseMaterials.get(child.order_material_id) : null;
      if (!childMaterial) return { ...summary, missing: summary.missing + 1 };
      const childDraft = pricingDrafts[childMaterial.id] || getPricingDraft(childMaterial);
      const draftQuantity = parseDecimal(childDraft.quantity);
      const quantity = Number(childMaterial.received_quantity ?? childMaterial.purchased_quantity ?? draftQuantity);
      const estimatedPrice = childDraft.unitPrice.trim() ? parseDecimal(childDraft.unitPrice) : Number.NaN;
      const price = Number(childMaterial.actual_unit_price ?? estimatedPrice);
      if (!Number.isFinite(quantity) || !Number.isFinite(price)) return { ...summary, missing: summary.missing + 1 };
      return { ...summary, total: summary.total + quantity * price, priced: summary.priced + 1 };
    }, { total: 0, priced: 0, missing: 0 });
    const hasOpenChildren = childItems.some((child) => !child.completed);
    const saveStatus = material ? pricingSaveState[material.id] || "idle" : "idle";
    const nameSaveStatus = material ? materialNameSaveState[material.id] || "idle" : "idle";
    const saveStatusLabel: Record<PricingSaveStatus, string> = {
      idle: "Salvamento automático ativo",
      saving: "Salvando valores",
      saved: "Valores salvos",
      error: "Erro ao salvar",
    };

    return <div className={`activity-task activity-task-compact ${isSubtask ? "is-subtask" : ""} ${item.activity_type === "purchase_order" ? "is-purchase-order" : ""} ${item.activity_type === "material_purchase" ? "is-purchase-item" : ""} ${item.completed ? "is-completed" : ""} ${hasOpenChildren ? "has-open-children" : ""}`} key={item.id}>
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
          <div className="activity-task-topline">
            <div className="activity-task-title-row">
              {!isSubtask && childItems.length > 0 && <button
                type="button"
                className="activity-subtask-toggle"
                onClick={() => toggleSet(setCollapsedTasks, item.id)}
                aria-expanded={!isChildrenCollapsed}
                aria-label={isChildrenCollapsed ? "Expandir subatividades" : "Recolher subatividades"}
                title={isChildrenCollapsed ? "Expandir subatividades" : "Recolher subatividades"}
              >{isChildrenCollapsed ? "›" : "⌄"}</button>}
              {item.activity_type === "material_purchase" && material ? <label className="activity-material-name-editor" title="Edite o nome; a alteração também será aplicada aos materiais da OS">
                <input
                  aria-label={`Nome do material ${material.material_name}`}
                  value={materialNameDrafts[material.id] ?? material.material_name}
                  onChange={(event) => updateMaterialNameDraft(item, material, event.target.value)}
                  onBlur={() => void persistMaterialName(item, material, true)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void persistMaterialName(item, material, true);
                    event.currentTarget.blur();
                  }}
                  disabled={!canOperate}
                />
                <span className={`activity-name-save-state is-${nameSaveStatus}`} aria-live="polite" title={saveStatusLabel[nameSaveStatus]}>
                  {nameSaveStatus === "saving" ? "…" : nameSaveStatus === "saved" ? "✓" : nameSaveStatus === "error" ? "!" : ""}
                </span>
              </label> : <b title={item.title}>{item.title}</b>}
              {!isSubtask && childItems.length > 0 && <span className="activity-subtask-progress">{completedChildren}/{childItems.length}</span>}
            </div>

            <div className="activity-task-inline-meta">
              {item.priority !== "normal" && <span data-priority={item.priority}>{priorityLabel[item.priority]}</span>}
              {!canOperate && <span data-activity-status={item.activity_status}>{activityStatusLabel[item.activity_status]}</span>}
              <span data-due={state} title={`Prazo: ${dateLabel(item.due_date, item.due_at)}`}>{state === "late" ? "Atrasada" : state === "today" ? "Hoje" : dateLabel(item.due_date, item.due_at)}</span>
              <span className="activity-assignee" title={assigned ? `Responsável: ${assigned.name || assigned.email}` : "Sem responsável"}>{assigned ? assigned.name || assigned.email : "Sem responsável"}</span>
            </div>

            {item.activity_type === "purchase_order" && purchaseChildren.length > 0 && <div className="activity-purchase-summary activity-purchase-summary-inline">
              <span><b>{purchaseChildren.length}</b> itens</span>
              <span><b>{completedChildren}/{purchaseChildren.length}</b> concluídos</span>
              <span className="total"><small>{purchaseSummary.missing ? "Total parcial" : "Total"}</small><strong>{currencyFormatter.format(purchaseSummary.total)}</strong></span>
              {purchaseSummary.missing > 0 && <span className="missing" title="Itens aguardando preço">{purchaseSummary.missing} sem preço</span>}
            </div>}
          </div>

          {item.description && <p className="activity-task-description" title={item.description}>{item.description}</p>}

          {item.activity_type === "material_purchase" && material && draft && <div className="activity-purchase-pricing activity-purchase-pricing-inline">
            <label title="Quantidade">
              <span>Qtd.</span>
              <input
                ref={(node) => { const key = `${material.id}:quantity`; if (node) pricingInputRefs.current.set(key, node); else pricingInputRefs.current.delete(key); }}
                inputMode="decimal"
                aria-label={`Quantidade de ${material.material_name}`}
                value={draft.quantity}
                onChange={(event) => updatePricingDraft(material, "quantity", event.target.value)}
                onBlur={() => void flushPurchasePricing(material, true)}
                onKeyDown={(event) => handlePricingKeyDown(event, item, material, "quantity")}
                disabled={!canOperate}
              />
            </label>
            <label title="Unidade">
              <span>Un.</span>
              <input
                ref={(node) => { const key = `${material.id}:unit`; if (node) pricingInputRefs.current.set(key, node); else pricingInputRefs.current.delete(key); }}
                aria-label={`Unidade de ${material.material_name}`}
                value={draft.unit}
                onChange={(event) => updatePricingDraft(material, "unit", event.target.value)}
                onBlur={() => void flushPurchasePricing(material, true)}
                onKeyDown={(event) => handlePricingKeyDown(event, item, material, "unit")}
                placeholder="un"
                disabled={!canOperate}
              />
            </label>
            <label className="activity-price-field" title="Preço unitário">
              <span>Unitário</span>
              <div className="currency-input"><i>R$</i><input
                ref={(node) => { const key = `${material.id}:unitPrice`; if (node) pricingInputRefs.current.set(key, node); else pricingInputRefs.current.delete(key); }}
                inputMode="decimal"
                aria-label={`Preço unitário de ${material.material_name}`}
                value={draft.unitPrice}
                onChange={(event) => updatePricingDraft(material, "unitPrice", event.target.value)}
                onBlur={() => void flushPurchasePricing(material, true)}
                onKeyDown={(event) => handlePricingKeyDown(event, item, material, "unitPrice")}
                placeholder="0,00"
                disabled={!canOperate}
              /></div>
            </label>
            <div className="activity-purchase-subtotal" title="Quantidade multiplicada pelo preço unitário">
              <span>Subtotal</span>
              <b>{subtotal == null ? "Sem preço" : currencyFormatter.format(subtotal)}</b>
            </div>
            <span className={`activity-price-save-state is-${saveStatus}`} title={saveStatusLabel[saveStatus]} role="status" aria-live="polite">
              {saveStatus === "saving" ? "…" : saveStatus === "saved" ? "✓" : saveStatus === "error" ? "!" : "○"}
            </span>
          </div>}
        </div>

        {(canOperate || item.activity_type === "purchase_order" || isSubtask) && <div className="activity-task-actions activity-icon-actions">
          {canOperate && <label className="activity-status-control" title="Status da atividade">
            <span>Status</span>
            <select
              value={item.activity_status}
              aria-label={`Status de ${item.title}`}
              onChange={(event) => requestStatusChange(item, event.target.value as PurchaseActivityStatus)}
              disabled={busyId === item.id}
            >
              {activityStatusOptions.map((status) => <option key={status} value={status}>{activityStatusLabel[status]}</option>)}
            </select>
          </label>}

          {linkedOrder && <button type="button" className="activity-icon-button" onClick={() => onOpenOrder(linkedOrder, item.activity_type === "material_purchase" ? "materials" : "summary")} title={`Visualizar OP ${linkedOrder.op_number}`} aria-label={`Visualizar OP ${linkedOrder.op_number}`}><ActivityIcon name="view" /></button>}

          {!isSubtask && item.activity_type === "purchase_order" && childItems.length > 0 && <button type="button" className="activity-icon-button" onClick={() => void copyPurchaseList(item, childItems)} title="Copiar todos os produtos e quantidades" aria-label="Copiar todos os produtos e quantidades">
            <ActivityIcon name={copiedId === item.id ? "check" : "copy"} />
          </button>}

          {isSubtask && <button type="button" className="activity-icon-button" onClick={() => void copySingleActivity(item)} title="Copiar esta subatividade" aria-label={`Copiar ${item.title}`}>
            <ActivityIcon name={copiedId === item.id ? "check" : "copy"} />
          </button>}

          {canOperate && !isSubtask && item.activity_type === "general" && <button type="button" className="activity-icon-button" onClick={() => openNewTask(item.group_id, item.id)} title="Adicionar subatividade" aria-label={`Adicionar subatividade em ${item.title}`}><ActivityIcon name="add" /></button>}
          {canOperate && item.activity_type === "material_purchase" && material && <button type="button" className="activity-icon-button" onClick={() => setPurchaseDetailMaterial(material)} title="Editar todos os dados do material" aria-label={`Editar todos os dados de ${material.material_name}`}><ActivityIcon name="edit" /></button>}
          {canOperate && item.activity_type === "general" && <button type="button" className="activity-icon-button" onClick={() => { setContinuousAddCount(0); setTaskEditor({ mode: "edit", item, groupId: item.group_id, parentId: item.parent_id || "" }); }} title="Editar atividade" aria-label={`Editar ${item.title}`}><ActivityIcon name="edit" /></button>}
          {canOperate && (item.activity_type === "general"
            ? <button type="button" className="activity-icon-button danger" onClick={() => void deleteTask(item)} disabled={busyId === item.id} title="Excluir atividade" aria-label={`Excluir ${item.title}`}><ActivityIcon name="delete" /></button>
            : <span className="activity-managed-label activity-managed-icon" title="Gerenciada automaticamente pela OS" aria-label="Gerenciada automaticamente pela OS"><ActivityIcon name="lock" /></span>)}
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

    <div className="activities-mode-tabs" role="tablist" aria-label="Visualização de atividades">
      <button type="button" role="tab" aria-selected={viewMode === "active"} className={viewMode === "active" ? "active" : ""} onClick={() => setViewMode("active")}><span>Atividades</span><b>{totals.pending}</b></button>
      <button type="button" role="tab" aria-selected={viewMode === "purchases"} className={viewMode === "purchases" ? "active" : ""} onClick={() => setViewMode("purchases")}><span>Compras</span><b>{items.filter((item) => !item.completed && (item.activity_type === "purchase_order" || item.activity_type === "material_purchase")).length}</b></button>
      <button type="button" role="tab" aria-selected={viewMode === "completed"} className={viewMode === "completed" ? "active" : ""} onClick={() => setViewMode("completed")}><span>Finalizadas</span><b>{totals.completed}</b></button>
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
        const allGroupItems = items.filter((item) => item.group_id === group.id);
        const groupItems = viewMode === "purchases"
          ? allGroupItems.filter((item) => item.activity_type === "purchase_order" || item.activity_type === "material_purchase")
          : allGroupItems;
        const mainItems = groupItems.filter((item) => !item.parent_id);
        const completedCount = groupItems.filter((item) => item.completed).length;
        const pendingCount = groupItems.length - completedCount;
        const showCompleted = viewMode === "completed" || showCompletedGroups.has(group.id);
        const isCollapsed = collapsedGroups.has(group.id);
        const visibleMainItems = mainItems.filter((item) => {
          const children = groupItems.filter((child) => child.parent_id === item.id);
          const searchMatch = taskMatchesSearch(item) || children.some(taskMatchesSearch);
          const hasOpenChildren = children.some((child) => !child.completed);
          const hasCompletedChildren = children.some((child) => child.completed);
          const modeVisible = viewMode === "completed"
            ? item.completed || hasCompletedChildren
            : viewMode === "purchases"
              ? (!item.completed || hasOpenChildren)
              : (showCompleted || !item.completed || hasOpenChildren);
          return searchMatch && modeVisible;
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
            {viewMode === "active" && completedCount > 0 && <button type="button" className="activity-show-completed" onClick={() => toggleSet(setShowCompletedGroups, group.id)}>{showCompleted ? "Ocultar concluídas" : `Mostrar concluídas (${completedCount})`}</button>}
          </div>}
        </article>;
      })}
    </div>}
    {viewMode === "completed" && items.filter((item) => item.completed).length < completedTotal && <div className="pagination-load-more"><button type="button" onClick={() => setCompletedLimit((value) => value + 100)}>Carregar mais finalizadas</button><span>{items.filter((item) => item.completed).length} de {completedTotal}</span></div>}

    {purchaseDetailMaterial && <MaterialEditorModal
      material={purchaseDetailMaterial}
      busy={Boolean(busyId)}
      contextLabel="ATIVIDADES E COMPRAS"
      onClose={() => !busyId && setPurchaseDetailMaterial(null)}
      onSave={saveMaterialEditorFromActivities}
    />}

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

    {taskEditor && <div className="overlay activities-overlay" onMouseDown={closeTaskEditor}><form ref={taskFormRef} className="modal activity-editor-modal task-editor" onSubmit={saveTask} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar" onClick={closeTaskEditor} disabled={busyId === "task-editor"}>×</button>
      <p className="eyebrow">PLANEJAMENTO</p>
      <h2>{taskEditor.mode === "edit" ? "Editar atividade" : taskEditor.parentId ? "Nova subatividade" : "Nova atividade"}</h2>
      <p>{taskEditor.mode === "create" ? "Digite o título e pressione Enter para salvar e continuar adicionando itens." : "Atualize as informações da atividade."}</p>
      {taskEditor.mode === "create" && <div className="activity-continuous-add-hint"><kbd>Enter</kbd><span>adiciona o item e deixa o formulário pronto para o próximo</span>{continuousAddCount > 0 && <b>{continuousAddCount} adicionado{continuousAddCount === 1 ? "" : "s"} nesta sequência</b>}</div>}
      <div className="activity-editor-grid">
        <label>Grupo<select name="group_id" value={taskEditor.groupId} required disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)} onChange={(event) => setTaskEditor((current) => current ? { ...current, groupId: event.target.value, parentId: "" } : current)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label>Tipo<select name="parent_id" value={taskEditor.parentId} disabled={Boolean((taskEditor.item && taskEditor.item.activity_type !== "general") || (taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id)))} onChange={(event) => setTaskEditor((current) => current ? { ...current, parentId: event.target.value } : current)}><option value="">Atividade principal</option>{items.filter((item) => !item.parent_id && item.id !== taskEditor.item?.id && item.group_id === taskEditor.groupId && item.activity_type === "general").map((item) => <option key={item.id} value={item.id}>Subatividade de: {item.title}</option>)}</select>{taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id) && <small>Atividades com subatividades permanecem como atividade principal.</small>}</label>
        <label className="wide">Título<input ref={taskTitleRef} name="title" defaultValue={taskEditor.item?.title || ""} disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)} placeholder="Ex.: Conferir pedidos com entrega amanhã" required autoFocus onKeyDown={handleTaskTitleKeyDown} /></label>
        <label className="wide">Descrição<textarea name="description" defaultValue={taskEditor.item?.description || ""} placeholder="Orientações, detalhes ou observações (opcional)." /></label>
        <label>Prazo<input type="datetime-local" name="due_at" defaultValue={toDueInputValue(taskEditor.item?.due_at || null, taskEditor.item?.due_date || null)} disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)} />{taskEditor.item && taskEditor.item.activity_type !== "general" && <small>Prazo automático de 24 horas após criação ou reabertura.</small>}</label>
        <label>Prioridade<select name="priority" defaultValue={taskEditor.item?.priority || "normal"}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
        <label>Status<select name="activity_status" defaultValue={taskEditor.item?.activity_status || "pending"} disabled={Boolean(taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id))}>{activityStatusOptions.map((status) => <option key={status} value={status}>{activityStatusLabel[status]}</option>)}</select>{taskEditor.item && items.some((item) => item.parent_id === taskEditor.item?.id) && <small>Use o seletor do cartão para decidir se o status será aplicado às subatividades.</small>}</label>
        <label>Responsável<select name="assigned_to" defaultValue={taskEditor.item?.assigned_to || ""} disabled={taskEditor.item?.activity_type !== "general" && Boolean(taskEditor.item)}><option value="">Sem responsável definido</option>{activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || profile.email}</option>)}</select></label>
      </div>
      <div className={`modal-actions ${taskEditor.mode === "create" ? "has-continuous-add" : ""}`}>
        <button type="button" className="secondary" onClick={closeTaskEditor}>Cancelar</button>
        {taskEditor.mode === "create" && <button type="button" className="secondary" onClick={submitTaskAndContinue} disabled={busyId === "task-editor"}>＋ Adicionar e próxima</button>}
        <button type="submit" className="primary" onClick={() => { continueAfterSaveRef.current = false; }} disabled={busyId === "task-editor"}>{busyId === "task-editor" ? "Salvando…" : taskEditor.mode === "create" ? "Salvar e fechar" : "Salvar atividade"}</button>
      </div>
    </form></div>}
  </section>;
}
