"use client";

import { useEffect, useMemo, useState } from "react";
import type { Order, ViewKey } from "@/lib/pcp-types";
import { dueLabel } from "@/lib/pcp-formatters";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

type PendingCounts = { purchases: number; withoutPrice: number; driveFailures: number; overdueActivities: number };

export function PendingCenter({ open, orders, onClose, onNavigate }: { open: boolean; orders: Order[]; onClose: () => void; onNavigate: (view: ViewKey) => void }) {
  const [remote, setRemote] = useState<PendingCounts>({ purchases: 0, withoutPrice: 0, driveFailures: 0, overdueActivities: 0 });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void Promise.all([
      supabase.from("activities").select("id", { count: "exact", head: true }).eq("completed", false).eq("activity_type", "material_purchase").is("deleted_at", null),
      supabase.from("order_materials").select("id", { count: "exact", head: true }).eq("availability", "unavailable").is("unit_price", null).is("deleted_at", null),
      supabase.from("system_observability_events").select("id", { count: "exact", head: true }).eq("level", "error").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from("activities").select("id", { count: "exact", head: true }).eq("completed", false).lt("due_at", new Date().toISOString()).is("deleted_at", null),
    ]).then(([purchases, withoutPrice, driveFailures, overdue]) => {
      setRemote({ purchases: purchases.count || 0, withoutPrice: withoutPrice.count || 0, driveFailures: driveFailures.count || 0, overdueActivities: overdue.count || 0 });
      setLoading(false);
    });
  }, [open]);

  const local = useMemo(() => ({
    late: orders.filter((order) => order.status !== "completed" && dueLabel(order.delivery_date).startsWith("Atrasado")).length,
    blocked: orders.filter((order) => order.status !== "completed" && (order.blocked || order.status === "paused")).length,
    withoutResponsible: orders.filter((order) => order.status !== "completed" && !order.consultant_name?.trim()).length,
    installationWithoutTeam: orders.filter((order) => order.status !== "completed" && order.installation_scheduled_at && !order.installation_team?.trim()).length,
  }), [orders]);

  if (!open) return null;
  const rows = [
    ["Pedidos atrasados", local.late, "kanban" as ViewKey],
    ["Pedidos bloqueados ou pausados", local.blocked, "kanban" as ViewKey],
    ["Pedidos sem responsável", local.withoutResponsible, "orders" as ViewKey],
    ["Instalações sem equipe", local.installationWithoutTeam, "installation" as ViewKey],
    ["Compras abertas", remote.purchases, "activities" as ViewKey],
    ["Materiais sem preço", remote.withoutPrice, "activities" as ViewKey],
    ["Atividades vencidas", remote.overdueActivities, "activities" as ViewKey],
    ["Falhas recentes de integração", remote.driveFailures, "settings" as ViewKey],
  ] as const;
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="app-drawer pending-drawer" role="dialog" aria-modal="true" aria-label="Central de pendências" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span>CENTRAL OPERACIONAL</span><h2>Pendências <b>{total}</b></h2></div><button onClick={onClose} aria-label="Fechar"><AppIcon name="close"/></button></header>
      <p>Itens que exigem ação ou revisão. As contagens são atualizadas quando o painel é aberto.</p>
      <div className="pending-list">{rows.map(([label, value, view]) => <button key={label} disabled={!value} onClick={() => { onNavigate(view); onClose(); }}><span>{label}</span><strong>{loading && label.includes("Compra") ? "…" : value}</strong><AppIcon name="chevronRight"/></button>)}</div>
    </aside>
  </div>;
}
