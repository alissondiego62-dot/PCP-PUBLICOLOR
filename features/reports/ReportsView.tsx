"use client";

import type { Order, Sector } from "@/lib/pcp-types";
import { dueLabel } from "@/lib/pcp-formatters";

export function ReportsView({ activeOrders, sectorReport, largestSectorCount }: {
  activeOrders: Order[];
  sectorReport: Array<{ sector: Sector; count: number }>;
  largestSectorCount: number;
}) {
  return <section className="management-view">
    <div className="summary-strip">
      <article><small>Pedidos ativos</small><strong>{activeOrders.length}</strong></article>
      <article><small>Em andamento</small><strong>{activeOrders.filter((order) => order.status === "in_progress").length}</strong></article>
      <article><small>Atrasados</small><strong>{activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado")).length}</strong></article>
      <article><small>Urgentes</small><strong>{activeOrders.filter((order) => order.priority === "urgent").length}</strong></article>
    </div>
    <div className="report-card">
      <div className="report-heading"><div><b>Distribuição por setor</b><small>Pedidos ativos neste momento</small></div><span>Atualização automática</span></div>
      <div className="sector-bars">{sectorReport.map((item) => <div className="sector-bar" key={item.sector.id}><label><span>{item.sector.name}</span><b>{item.count}</b></label><div><i style={{ width: `${(item.count / largestSectorCount) * 100}%` }} /></div></div>)}</div>
    </div>
  </section>;
}
