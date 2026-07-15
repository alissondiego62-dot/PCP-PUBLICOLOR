"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, PurchaseActivityStatus, Sector, ViewKey } from "@/lib/pcp-types";
import { dueLabel } from "@/lib/pcp-formatters";
import { supabase } from "@/lib/supabase";
import type { KanbanMetricKey } from "@/features/kanban/KanbanView";
import { AppIcon } from "@/components/ui/AppIcon";

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

type DashboardSummary = {
  unavailable_order_count: number;
  unavailable_material_count: number;
  open_purchase_count: number;
  purchase_overdue_count: number;
  purchase_due_24h_count: number;
  missing_price_count: number;
  estimated_open_purchase_total: number;
  created_last_7d: number;
  completed_last_7d: number;
  installation_overdue_count: number;
  purchases_by_status: Partial<Record<PurchaseActivityStatus, number>>;
};

type HistoryDashboardRow = { id: number; order_id: string; action_type: string; description: string; created_at: string };

const EMPTY_SUMMARY: DashboardSummary = {
  unavailable_order_count: 0,
  unavailable_material_count: 0,
  open_purchase_count: 0,
  purchase_overdue_count: 0,
  purchase_due_24h_count: 0,
  missing_price_count: 0,
  estimated_open_purchase_total: 0,
  created_last_7d: 0,
  completed_last_7d: 0,
  installation_overdue_count: 0,
  purchases_by_status: {},
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function dateKeyManaus(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function purchaseStatusLabel(status: PurchaseActivityStatus) {
  if (status === "awaiting_quote") return "Aguardando orçamento";
  if (status === "awaiting_separation") return "Aguardando separação";
  if (status === "awaiting_delivery") return "Aguardando entrega";
  if (status === "finalized") return "Finalizada";
  return "Pendente";
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}
function orderAgeHours(order: Order) {
  const source = order.sector_entered_at || order.updated_at || order.created_at;
  const time = new Date(source).getTime();
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3_600_000) : 0;
}

export function DashboardView(props: DashboardViewProps) {
  const { activeOrderCounts, activeOrders, completedOrders, installationOrders, sectorReport, largestSectorCount, currentUserId, isOnline, onNavigate, onApplyKanbanMetric, onOpenOrder } = props;
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [history, setHistory] = useState<HistoryDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaPending, setSchemaPending] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!isOnline) { setLoading(false); return; }
    setLoading(true);
    const [summaryResult, historyResult] = await Promise.all([
      supabase.rpc("get_dashboard_operational_summary"),
      supabase.from("order_history").select("id,order_id,action_type,description,created_at").order("created_at", { ascending: false }).limit(8),
    ]);
    if (summaryResult.error) {
      setSchemaPending(["42883", "PGRST202", "PGRST205"].includes(summaryResult.error.code || ""));
      setError(["42883", "PGRST202", "PGRST205"].includes(summaryResult.error.code || "") ? "" : summaryResult.error.message);
    } else {
      const row = (Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data) as DashboardSummary | null;
      setSummary({ ...EMPTY_SUMMARY, ...(row || {}) });
      setSchemaPending(false);
      setError("");
    }
    if (!historyResult.error) setHistory((historyResult.data || []) as HistoryDashboardRow[]);
    setLoading(false);
  }, [isOnline]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (!isOnline) return;
    const channel = supabase.channel(`dashboard-summary-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dashboard_refresh_events" }, () => void loadSummary())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_history" }, () => void loadSummary())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, isOnline, loadSummary]);

  const today = dateKeyManaus(new Date());
  const operational = useMemo(() => {
    const late = activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado"));
    const productionToday = activeOrders.filter((order) => dueLabel(order.delivery_date) === "Prazo hoje");
    const inProgress = activeOrders.filter((order) => order.status === "in_progress");
    const blocked = activeOrders.filter((order) => order.blocked || order.status === "paused");
    const withoutResponsible = activeOrders.filter((order) => !order.consultant_name?.trim());
    const withoutMovement = activeOrders.filter((order) => orderAgeHours(order) >= 48);
    const installationToday = installationOrders.filter((order) => order.installation_scheduled_at && dateKeyManaus(order.installation_scheduled_at) === today);
    const futureInstallations = installationOrders.filter((order) => order.installation_scheduled_at && dateKeyManaus(order.installation_scheduled_at) >= today).slice(0, 6);
    const pastInstallations = installationOrders.filter((order) => order.installation_scheduled_at && dateKeyManaus(order.installation_scheduled_at) < today && order.installation_status !== "completed");
    return { late, productionToday, inProgress, blocked, withoutResponsible, withoutMovement, installationToday, futureInstallations, pastInstallations };
  }, [activeOrders, installationOrders, today]);

  const fallbackSummary = useMemo<DashboardSummary>(() => ({
    ...EMPTY_SUMMARY,
    created_last_7d: activeOrders.filter((order) => new Date(order.created_at).getTime() >= Date.now() - 7 * 86400000).length,
    completed_last_7d: completedOrders.filter((order) => order.completed_at && new Date(order.completed_at).getTime() >= Date.now() - 7 * 86400000).length,
    installation_overdue_count: operational.pastInstallations.length,
  }), [activeOrders, completedOrders, operational.pastInstallations.length]);
  const metrics = schemaPending ? fallbackSummary : summary;
  const orderById = useMemo(() => new Map([...activeOrders, ...completedOrders].map((order) => [order.id, order])), [activeOrders, completedOrders]);
  const throughputDelta = metrics.created_last_7d ? Math.round((metrics.completed_last_7d / metrics.created_last_7d) * 100) : 0;

  const priorityRows = [
    { label: "Pedidos atrasados", value: operational.late.length, tone: "danger", action: () => onApplyKanbanMetric("late") },
    { label: "Produção com prazo hoje", value: operational.productionToday.length, tone: "warning", action: () => onApplyKanbanMetric("today") },
    { label: "Compras vencidas", value: metrics.purchase_overdue_count, tone: "danger", action: () => onNavigate("activities") },
    { label: "Compras vencendo em 24h", value: metrics.purchase_due_24h_count, tone: "warning", action: () => onNavigate("activities") },
    { label: "Sem movimentação há 48h", value: operational.withoutMovement.length, tone: "neutral", action: () => onNavigate("orders") },
    { label: "Instalações atrasadas", value: metrics.installation_overdue_count, tone: "danger", action: () => onNavigate("installation") },
  ];

  return <section className="v34-dashboard">
    <div className="v34-dashboard-hero">
      <div><span>PUBLICOLOR PCP · CONTROLE OPERACIONAL</span><h2>Prioridades, capacidade e compras</h2><p>O Dashboard concentra os indicadores que antes dependiam de relatórios separados.</p></div>
      <div className="v34-hero-actions"><button onClick={() => void loadSummary()} disabled={loading}><AppIcon name="refresh"/>Atualizar</button><div data-online={isOnline}><i>{isOnline ? "●" : "○"}</i><span><b>{isOnline ? "Conectado" : "Offline"}</b><small>{loading ? "Atualizando indicadores…" : "Resumo operacional"}</small></span></div></div>
    </div>

    <div className="v34-kpi-grid">
      <Kpi icon="kanban" label="Pedidos ativos" value={activeOrderCounts.orders} detail={`${activeOrderCounts.suborders} subpedidos`} onClick={() => onApplyKanbanMetric("active")} />
      <Kpi icon="orders" label="Em produção" value={operational.inProgress.length} detail="Trabalho em andamento" onClick={() => onApplyKanbanMetric("in_progress")} />
      <Kpi icon="tasks" tone="warning" label="OS aguardando materiais" value={metrics.unavailable_order_count} detail={`${metrics.unavailable_material_count} itens indisponíveis`} onClick={() => onNavigate("activities")} />
      <Kpi icon="alert" tone="danger" label="Atrasados" value={operational.late.length} detail="Prazo de produção vencido" onClick={() => onApplyKanbanMetric("late")} />
      <Kpi icon="calendar" tone="warning" label="Produção hoje" value={operational.productionToday.length} detail="Prazo interno do dia" onClick={() => onApplyKanbanMetric("today")} />
      <Kpi icon="calendar" label="Instalações hoje" value={operational.installationToday.length} detail="Entrega ou instalação" onClick={() => onNavigate("installation")} />
      <Kpi icon="alert" tone="danger" label="Bloqueados/pausados" value={operational.blocked.length} detail="Exigem intervenção" onClick={() => onApplyKanbanMetric("blocked")} />
    </div>

    {(schemaPending || error) && <div className="v34-dashboard-alert">{schemaPending ? "Aplique o SQL 3.4.1 para ativar o resumo otimizado do Dashboard. Os indicadores locais continuam disponíveis." : error}</div>}

    <div className="v34-dashboard-grid">
      <article className="v34-panel priority"><PanelHeader eyebrow="AÇÃO IMEDIATA" title="Pendências prioritárias" action="Abrir produção" onClick={() => onNavigate("kanban")} />
        <div className="v34-priority-list">{priorityRows.map((item) => <button key={item.label} data-tone={item.tone} onClick={item.action}><span>{item.label}</span><strong>{item.value}</strong><AppIcon name="chevronRight"/></button>)}</div>
      </article>

      <article className="v34-panel purchases"><PanelHeader eyebrow="COMPRAS" title="Materiais e valores" action="Abrir compras" onClick={() => onNavigate("activities")} />
        <div className="v34-purchase-total"><span><small>Total parcial em aberto</small><strong>{currency.format(metrics.estimated_open_purchase_total || 0)}</strong></span><em>{metrics.missing_price_count} sem preço</em></div>
        <div className="v34-purchase-statuses">{(["pending", "awaiting_quote", "awaiting_separation", "awaiting_delivery"] as PurchaseActivityStatus[]).map((status) => <button key={status} onClick={() => onNavigate("activities")}><span>{purchaseStatusLabel(status)}</span><strong>{metrics.purchases_by_status?.[status] || 0}</strong></button>)}</div>
      </article>

      <article className="v34-panel throughput"><PanelHeader eyebrow="ÚLTIMOS 7 DIAS" title="Fluxo de entrada e saída" />
        <div className="v34-throughput"><div><small>Novas OS</small><strong>{metrics.created_last_7d}</strong></div><div><small>Concluídas</small><strong>{metrics.completed_last_7d}</strong></div><div><small>Relação saída/entrada</small><strong>{throughputDelta}%</strong></div></div>
      </article>

      <article className="v34-panel sectors"><PanelHeader eyebrow="CAPACIDADE" title="Carga por setor" action="Abrir Kanban" onClick={() => onNavigate("kanban")} />
        <div className="v34-sector-list">{sectorReport.map((item) => { const wip = item.count; const capacity = item.sector.wip_limit || Math.max(1, largestSectorCount); const pressure = Math.min(1, wip / capacity); return <button key={item.sector.id} onClick={() => onNavigate("kanban")}><label><span>{item.sector.name}</span><b>{wip}{item.sector.wip_limit ? `/${item.sector.wip_limit}` : ""}</b></label><div><i data-pressure={pressure >= .8 ? "high" : pressure >= .55 ? "medium" : "normal"} style={{ width: `${pressure * 100}%` }}/></div></button>; })}</div>
      </article>

      <article className="v34-panel agenda"><PanelHeader eyebrow="AGENDA" title="Próximas instalações/entregas" action="Ver agenda" onClick={() => onNavigate("installation")} />
        <div className="v34-agenda-list">{operational.futureInstallations.map((order) => <button key={order.id} onClick={() => onOpenOrder(order, "installation")}><time>{new Date(order.installation_scheduled_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Manaus" })}<small>{order.installation_time_confirmed ? new Date(order.installation_scheduled_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" }) : "Horário a definir"}</small></time><span><b>OP {order.op_number}</b><small>{order.client_name}</small></span><AppIcon name="chevronRight"/></button>)}{!operational.futureInstallations.length && <div className="view-empty">Nenhuma instalação futura.</div>}</div>
      </article>

      <article className="v34-panel history"><PanelHeader eyebrow="AUDITORIA" title="Movimentações recentes" action="Ver pedidos" onClick={() => onNavigate("orders")} />
        <div className="v34-history-list">{history.map((entry) => { const order = orderById.get(entry.order_id); return <button key={entry.id} disabled={!order} onClick={() => order && onOpenOrder(order, "history")}><i>•</i><span><b>{order ? `OP ${order.op_number}` : "Registro operacional"}</b><small>{entry.description}</small></span><time>{relativeTime(entry.created_at)}</time></button>; })}{!history.length && <div className="view-empty">Nenhuma movimentação recente.</div>}</div>
      </article>
    </div>
  </section>;
}

function Kpi({ icon, label, value, detail, tone = "neutral", onClick }: { icon: Parameters<typeof AppIcon>[0]["name"]; label: string; value: number; detail: string; tone?: string; onClick: () => void }) {
  return <button className="v34-kpi" data-tone={tone} onClick={onClick}><i><AppIcon name={icon}/></i><span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span></button>;
}
function PanelHeader({ eyebrow, title, action, onClick }: { eyebrow: string; title: string; action?: string; onClick?: () => void }) {
  return <header><div><span>{eyebrow}</span><h3>{title}</h3></div>{action && <button onClick={onClick}>{action}</button>}</header>;
}
