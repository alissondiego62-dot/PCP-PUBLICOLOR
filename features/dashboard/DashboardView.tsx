"use client";

import type { Order, Sector, ViewKey } from "@/lib/pcp-types";
import { dueLabel } from "@/lib/pcp-formatters";

type DashboardViewProps = {
  activeOrderCounts: { orders: number; suborders: number };
  activeOrders: Order[];
  completedOrders: Order[];
  installationOrders: Order[];
  sectorReport: Array<{ sector: Sector; count: number }>;
  largestSectorCount: number;
  onNavigate: (view: ViewKey) => void;
  onOpenOrder: (order: Order, tab: "installation") => void;
};

export function DashboardView(props: DashboardViewProps) {
  const {
    activeOrderCounts,
    activeOrders,
    completedOrders,
    installationOrders,
    sectorReport,
    largestSectorCount,
    onNavigate,
    onOpenOrder,
  } = props;

  return <section className="v3-dashboard">
    <div className="v3-hero">
      <div><span>PUBLICOLOR PCP</span><h2>Visão geral da operação</h2><p>Prioridades, gargalos e compromissos de instalação atualizados em tempo real.</p></div>
    </div>
    <div className="v3-kpi-grid">
      <article><i>▦</i><small>Pedidos ativos</small><strong>{activeOrderCounts.orders}</strong><span>Ordens principais no fluxo</span></article>
      <article><i>≡</i><small>Subpedidos ativos</small><strong>{activeOrderCounts.suborders}</strong><span>Itens vinculados às OPs</span></article>
      <article><i>◷</i><small>Aguardando</small><strong>{activeOrders.filter((order) => order.status === "waiting").length}</strong><span>Dependem de ação</span></article>
      <article className="danger"><i>!</i><small>Atrasados</small><strong>{activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado")).length}</strong><span>Fora do prazo</span></article>
      <article><i>↗</i><small>Em produção</small><strong>{activeOrders.filter((order) => order.status === "in_progress").length}</strong><span>Trabalho ativo</span></article>
      <article><i>⌂</i><small>Instalações/entregas</small><strong>{installationOrders.filter((order) => order.installation_scheduled_at).length}</strong><span>Com data definida</span></article>
      <article><i>✓</i><small>Concluídos</small><strong>{completedOrders.length}</strong><span>Histórico total</span></article>
    </div>
    <div className="v3-dashboard-grid">
      <article className="v3-panel">
        <header><div><span>CAPACIDADE</span><h3>Pedidos por setor</h3></div><button type="button" onClick={() => onNavigate("kanban")}>Abrir Kanban →</button></header>
        <div className="v3-sector-list">{sectorReport.map((item) => <div key={item.sector.id}><label><span>{item.sector.name}</span><b>{item.count}</b></label><div><i style={{ width: `${(item.count / largestSectorCount) * 100}%` }} /></div></div>)}</div>
      </article>
      <article className="v3-panel">
        <header><div><span>AGENDA</span><h3>Próximas instalações/entregas</h3></div><button type="button" onClick={() => onNavigate("installation")}>Ver agenda →</button></header>
        <div className="v3-install-list">{installationOrders.filter((order) => order.installation_scheduled_at).slice(0, 5).map((order) => <button type="button" key={order.id} onClick={() => onOpenOrder(order, "installation")}><time>{new Date(order.installation_scheduled_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Manaus" })}<small>{order.installation_time_confirmed ? new Date(order.installation_scheduled_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" }) : "Horário a definir"}</small></time><span><b>OP {order.op_number}</b><small>{order.client_name}</small></span><i>›</i></button>)}{!installationOrders.some((order) => order.installation_scheduled_at) && <div className="view-empty">Nenhuma instalação ou entrega programada.</div>}</div>
      </article>
    </div>
  </section>;
}
