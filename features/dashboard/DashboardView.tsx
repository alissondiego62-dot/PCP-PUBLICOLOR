"use client";

import { useEffect, useMemo, useState } from "react";
import type { Order, PurchaseActivityStatus, Sector, ViewKey } from "@/lib/pcp-types";
import { dueLabel } from "@/lib/pcp-formatters";
import { supabase } from "@/lib/supabase";
import type { KanbanMetricKey } from "@/features/kanban/KanbanView";

type DashboardViewProps = {
  activeOrderCounts: { orders: number; suborders: number };
  activeOrders: Order[];
  completedOrders: Order[];
  installationOrders: Order[];
  sectorReport: Array<{ sector: Sector; count: number }>;
  largestSectorCount: number;
  currentUserId: string;
  isOnline: boolean;
  onNavigate: (view: ViewKey) => void;
  onApplyKanbanMetric: (metric: KanbanMetricKey) => void;
  onOpenOrder: (order: Order, tab: "installation" | "history" | "materials") => void;
};

type PurchaseDashboardRow = {
  id: string;
  activity_status: PurchaseActivityStatus;
  due_at: string | null;
  completed: boolean;
  order_id: string | null;
};

type MaterialDashboardRow = {
  id: string;
  availability: "available" | "unavailable";
  purchase_status: PurchaseActivityStatus | null;
  quantity: number;
  unit_price: number | null;
};

type HistoryDashboardRow = {
  id: number;
  order_id: string;
  action_type: string;
  description: string;
  created_at: string;
};

type DashboardOperations = {
  purchases: PurchaseDashboardRow[];
  materials: MaterialDashboardRow[];
  history: HistoryDashboardRow[];
  loading: boolean;
  schemaPending: boolean;
  error: string;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function localDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function statusLabel(status: PurchaseActivityStatus) {
  if (status === "awaiting_quote") return "Aguardando orçamento";
  if (status === "awaiting_separation") return "Aguardando separação";
  if (status === "awaiting_delivery") return "Aguardando entrega";
  if (status === "finalized") return "Finalizada";
  return "Pendente";
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

export function DashboardView(props: DashboardViewProps) {
  const {
    activeOrderCounts,
    activeOrders,
    completedOrders,
    installationOrders,
    sectorReport,
    largestSectorCount,
    currentUserId,
    isOnline,
    onNavigate,
    onApplyKanbanMetric,
    onOpenOrder,
  } = props;

  const [operations, setOperations] = useState<DashboardOperations>({
    purchases: [],
    materials: [],
    history: [],
    loading: true,
    schemaPending: false,
    error: "",
  });

  useEffect(() => {
    let active = true;
    if (!isOnline) {
      setOperations((current) => ({ ...current, loading: false, error: "Modo offline: indicadores de compras usam a última informação carregada." }));
      return () => { active = false; };
    }

    async function loadOperationalSummary() {
      setOperations((current) => ({ ...current, loading: true, error: "" }));
      const [purchaseResult, materialResult, historyResult] = await Promise.all([
        supabase
          .from("activities")
          .select("id,activity_status,due_at,completed,order_id")
          .in("activity_type", ["material_purchase", "purchase_order"]),
        supabase
          .from("order_materials")
          .select("id,availability,purchase_status,quantity,unit_price"),
        supabase
          .from("order_history")
          .select("id,order_id,action_type,description,created_at")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      if (!active) return;

      const mainError = purchaseResult.error || materialResult.error;
      const missingSchema = Boolean(mainError && ["42703", "PGRST204", "PGRST205"].includes(mainError.code || ""));
      setOperations({
        purchases: mainError ? [] : (purchaseResult.data || []) as PurchaseDashboardRow[],
        materials: mainError ? [] : (materialResult.data || []) as MaterialDashboardRow[],
        history: historyResult.error ? [] : (historyResult.data || []) as HistoryDashboardRow[],
        loading: false,
        schemaPending: missingSchema,
        error: mainError && !missingSchema ? mainError.message : historyResult.error?.message || "",
      });
    }

    void loadOperationalSummary();
    const channel = supabase
      .channel(`dashboard-operations-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => void loadOperationalSummary())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_materials" }, () => void loadOperationalSummary())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_history" }, () => void loadOperationalSummary())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, isOnline]);

  const today = localDateKey(new Date());
  const operational = useMemo(() => {
    const late = activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado"));
    const productionToday = activeOrders.filter((order) => dueLabel(order.delivery_date) === "Prazo hoje");
    const inProgress = activeOrders.filter((order) => order.status === "in_progress");
    const blocked = activeOrders.filter((order) => order.blocked || order.status === "paused");
    const withoutResponsible = activeOrders.filter((order) => !order.consultant_name?.trim());
    const installationToday = installationOrders.filter((order) => order.installation_scheduled_at && localDateKey(order.installation_scheduled_at) === today);
    const waitingMaterials = operations.materials.filter((material) => material.availability === "unavailable");
    const openPurchaseItems = operations.purchases.filter((activity) => !activity.completed && activity.activity_status !== "finalized");
    const purchaseStatusCounts = openPurchaseItems.reduce<Record<string, number>>((result, activity) => {
      result[activity.activity_status] = (result[activity.activity_status] || 0) + 1;
      return result;
    }, {});
    const estimatedPurchaseTotal = operations.materials.reduce((total, material) => {
      const quantity = Number(material.quantity);
      const price = material.unit_price == null ? Number.NaN : Number(material.unit_price);
      return Number.isFinite(quantity) && Number.isFinite(price) ? total + quantity * price : total;
    }, 0);
    const withoutPrice = operations.materials.filter((material) => material.availability === "unavailable" && material.unit_price == null).length;
    const purchasesDue24h = openPurchaseItems.filter((activity) => {
      if (!activity.due_at) return false;
      const due = new Date(activity.due_at).getTime();
      return Number.isFinite(due) && due <= Date.now() + 24 * 60 * 60 * 1000;
    }).length;
    return {
      late,
      productionToday,
      inProgress,
      blocked,
      withoutResponsible,
      installationToday,
      waitingMaterials,
      openPurchaseItems,
      purchaseStatusCounts,
      estimatedPurchaseTotal,
      withoutPrice,
      purchasesDue24h,
    };
  }, [activeOrders, installationOrders, operations.materials, operations.purchases, today]);

  const priorityRows = [
    { label: "Pedidos atrasados", value: operational.late.length, tone: "danger", action: () => onApplyKanbanMetric("late") },
    { label: "Produção com prazo hoje", value: operational.productionToday.length, tone: "warning", action: () => onApplyKanbanMetric("today") },
    { label: "Compras vencendo em 24h", value: operational.purchasesDue24h, tone: "warning", action: () => onNavigate("activities") },
    { label: "Pedidos bloqueados/pausados", value: operational.blocked.length, tone: "danger", action: () => onApplyKanbanMetric("blocked") },
    { label: "Pedidos sem responsável", value: operational.withoutResponsible.length, tone: "neutral", action: () => onNavigate("orders") },
  ];

  const orderById = useMemo(() => new Map([...activeOrders, ...completedOrders].map((order) => [order.id, order])), [activeOrders, completedOrders]);

  return <section className="v32-dashboard">
    <div className="v32-dashboard-hero">
      <div>
        <span>PUBLICOLOR PCP · PAINEL OPERACIONAL</span>
        <h2>O que exige atenção agora</h2>
        <p>Produção, compras, prazos e instalações em uma visão única. Os cartões levam diretamente ao ponto de trabalho.</p>
      </div>
      <div className="v32-dashboard-health" data-online={isOnline ? "true" : "false"}>
        <i>{isOnline ? "●" : "○"}</i>
        <span><b>{isOnline ? "Sistema conectado" : "Modo offline"}</b><small>Atualização em tempo real {isOnline ? "ativa" : "indisponível"}</small></span>
      </div>
    </div>

    <div className="v32-kpi-grid" aria-label="Indicadores operacionais">
      <button type="button" onClick={() => onApplyKanbanMetric("active")}><i>▦</i><span><small>Pedidos ativos</small><strong>{activeOrderCounts.orders}</strong><em>{activeOrderCounts.suborders} subpedidos</em></span></button>
      <button type="button" onClick={() => onApplyKanbanMetric("in_progress")}><i>↗</i><span><small>Em produção</small><strong>{operational.inProgress.length}</strong><em>Trabalho em andamento</em></span></button>
      <button type="button" className="warning" onClick={() => onNavigate("activities")}><i>◇</i><span><small>Aguardando materiais</small><strong>{operational.waitingMaterials.length}</strong><em>{operational.openPurchaseItems.length} atividades abertas</em></span></button>
      <button type="button" className="danger" onClick={() => onApplyKanbanMetric("late")}><i>!</i><span><small>Atrasados</small><strong>{operational.late.length}</strong><em>Prazo anterior a hoje</em></span></button>
      <button type="button" onClick={() => onApplyKanbanMetric("today")}><i>⌑</i><span><small>Produção hoje</small><strong>{operational.productionToday.length}</strong><em>Prazo do dia</em></span></button>
      <button type="button" onClick={() => onApplyKanbanMetric("installation_today")}><i>◉</i><span><small>Instalações hoje</small><strong>{operational.installationToday.length}</strong><em>Compromissos do dia</em></span></button>
      <button type="button" className="danger" onClick={() => onApplyKanbanMetric("blocked")}><i>Ⅱ</i><span><small>Bloqueados/pausados</small><strong>{operational.blocked.length}</strong><em>Exigem intervenção</em></span></button>
    </div>

    {operations.schemaPending && <div className="v32-dashboard-alert">O banco conectado ainda não possui todas as colunas do módulo de Compras. Execute o SQL cumulativo da versão 3.2.0 para ativar os indicadores completos.</div>}
    {operations.error && !operations.schemaPending && <div className="v32-dashboard-alert">Alguns indicadores não puderam ser atualizados: {operations.error}</div>}

    <div className="v32-dashboard-layout">
      <article className="v32-panel v32-priority-panel">
        <header><div><span>PRIORIDADES</span><h3>Fila de atenção</h3></div><button type="button" onClick={() => onNavigate("kanban")}>Abrir produção</button></header>
        <div className="v32-priority-list">
          {priorityRows.map((row) => <button type="button" key={row.label} data-tone={row.tone} onClick={row.action}><span>{row.label}</span><strong>{row.value}</strong><i>›</i></button>)}
        </div>
      </article>

      <article className="v32-panel v32-purchases-panel">
        <header><div><span>COMPRAS</span><h3>Materiais e cotações</h3></div><button type="button" onClick={() => onNavigate("activities")}>Abrir compras</button></header>
        <div className="v32-purchase-total"><span><small>Total estimado</small><strong>{currency.format(operational.estimatedPurchaseTotal)}</strong></span><em>{operational.withoutPrice} item(ns) sem preço</em></div>
        <div className="v32-purchase-statuses">
          {(["pending", "awaiting_quote", "awaiting_separation", "awaiting_delivery"] as PurchaseActivityStatus[]).map((status) => <button type="button" key={status} onClick={() => onNavigate("activities")}><span>{statusLabel(status)}</span><strong>{operational.purchaseStatusCounts[status] || 0}</strong></button>)}
        </div>
        {operations.loading && <small className="v32-loading-note">Atualizando compras…</small>}
      </article>

      <article className="v32-panel v32-sector-panel">
        <header><div><span>CAPACIDADE</span><h3>Pedidos por setor</h3></div><button type="button" onClick={() => onNavigate("kanban")}>Abrir Kanban</button></header>
        <div className="v32-sector-list">{sectorReport.map((item) => <button type="button" key={item.sector.id} onClick={() => onNavigate("kanban")}><label><span>{item.sector.name}</span><b>{item.count}</b></label><div><i style={{ width: `${(item.count / largestSectorCount) * 100}%` }} /></div></button>)}</div>
      </article>

      <article className="v32-panel v32-install-panel">
        <header><div><span>AGENDA</span><h3>Próximas instalações/entregas</h3></div><button type="button" onClick={() => onNavigate("installation")}>Ver agenda</button></header>
        <div className="v32-install-list">{installationOrders.filter((order) => order.installation_scheduled_at).slice(0, 5).map((order) => <button type="button" key={order.id} onClick={() => onOpenOrder(order, "installation")}><time>{new Date(order.installation_scheduled_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Manaus" })}<small>{order.installation_time_confirmed ? new Date(order.installation_scheduled_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" }) : "Horário a definir"}</small></time><span><b>OP {order.op_number}</b><small>{order.client_name}</small></span><i>›</i></button>)}{!installationOrders.some((order) => order.installation_scheduled_at) && <div className="view-empty">Nenhuma instalação ou entrega programada.</div>}</div>
      </article>

      <article className="v32-panel v32-history-panel">
        <header><div><span>ATUALIZAÇÕES</span><h3>Movimentações recentes</h3></div><button type="button" onClick={() => onNavigate("orders")}>Ver pedidos</button></header>
        <div className="v32-history-list">{operations.history.map((entry) => {
          const order = orderById.get(entry.order_id);
          return <button type="button" key={entry.id} onClick={() => order && onOpenOrder(order, "history")} disabled={!order}><i>•</i><span><b>{order ? `OP ${order.op_number}` : "Registro operacional"}</b><small>{entry.description}</small></span><time>{relativeTime(entry.created_at)}</time></button>;
        })}{!operations.history.length && <div className="view-empty">Nenhuma movimentação recente disponível.</div>}</div>
      </article>
    </div>
  </section>;
}
