"use client";

import type { Order, Sector } from "@/lib/pcp-types";
import { dueLabel, initials, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";

export type OrderFamilyView = {
  parentOp: string;
  orders: Order[];
  hasSubOrders: boolean;
};

function responsibleName(order: Order) {
  return order.consultant_name?.trim() || "Não definido";
}

function normalizedResponsibleName(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase("pt-BR") || "";
}

function targetDateLabel(order: Order) {
  return shortDateOnlyLabel(targetDateForOrder(order.installation_scheduled_at, order.delivery_date));
}

export function OrdersView({
  search,
  responsibleFilter,
  unassignedResponsibleValue,
  consultantOptions,
  families,
  visibleOrderCount,
  sectors,
  expandedFamilies,
  onSearchChange,
  onResponsibleFilterChange,
  onClearFilters,
  onToggleFamily,
  onOpenOrder,
}: {
  search: string;
  responsibleFilter: string;
  unassignedResponsibleValue: string;
  consultantOptions: string[];
  families: OrderFamilyView[];
  visibleOrderCount: number;
  sectors: Sector[];
  expandedFamilies: Set<string>;
  onSearchChange: (value: string) => void;
  onResponsibleFilterChange: (value: string) => void;
  onClearFilters: () => void;
  onToggleFamily: (parentOp: string) => void;
  onOpenOrder: (order: Order) => void;
}) {
  return <section className="management-view orders-management-view">
    <div className="view-toolbar orders-view-toolbar">
      <label className="orders-search-field">⌕<input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar OP, subpedido, cliente, serviço ou responsável…" /></label>
      <label className="orders-responsible-filter"><span>Responsável</span><select value={responsibleFilter} onChange={(event) => onResponsibleFilterChange(event.target.value)}><option value="all">Todos</option><option value={unassignedResponsibleValue}>Sem responsável</option>{consultantOptions.map((consultant) => <option key={consultant} value={normalizedResponsibleName(consultant)}>{consultant}</option>)}</select></label>
      {(search || responsibleFilter !== "all") && <button type="button" className="orders-clear-filter" onClick={onClearFilters}>Limpar</button>}
      <span>{families.length} OP(s) · {visibleOrderCount} pedido(s) ativo(s)</span>
    </div>
    <div className="responsive-table grouped-orders-table">
      <div className="table-head"><span>OP</span><span>Cliente e serviço</span><span>Setor</span><span>Responsável</span><span>Instalação / entrega</span><span>Ação</span></div>
      {families.map((family) => {
        const isFamily = family.hasSubOrders || family.orders.length > 1;
        const isExpanded = expandedFamilies.has(family.parentOp);
        const firstOrder = family.orders[0];
        const clientsInFamily = Array.from(new Set(family.orders.map((order) => order.client_name)));
        const sectorNames = Array.from(new Set(family.orders.map((order) => sectors.find((sector) => sector.id === order.sector_id)?.name || "—")));
        const responsibleNames = Array.from(new Set(family.orders.map(responsibleName)));
        const familyResponsible = responsibleNames.length === 1 ? responsibleNames[0] : `${responsibleNames.length} responsáveis`;
        const nextDeliveryOrder = [...family.orders].sort((first, second) => targetDateForOrder(first.installation_scheduled_at, first.delivery_date).localeCompare(targetDateForOrder(second.installation_scheduled_at, second.delivery_date)))[0];
        const familyIsLate = family.orders.some((order) => dueLabel(order.delivery_date).startsWith("Atrasado"));
        const familyId = `order-family-${firstOrder.id}`;

        return <div className={`order-family ${isExpanded ? "expanded" : ""}`} key={family.parentOp}>
          <article className={`table-row order-parent-row ${isFamily ? "has-children" : "single-order"}`}>
            <b className="order-parent-op">
              {isFamily ? <button
                type="button"
                className="order-family-toggle"
                aria-expanded={isExpanded}
                aria-controls={familyId}
                aria-label={`${isExpanded ? "Recolher" : "Expandir"} OP ${family.parentOp}`}
                onClick={() => onToggleFamily(family.parentOp)}
              ><span aria-hidden="true">›</span></button> : <span className="order-family-toggle-placeholder" />}
              <span>OP {family.parentOp}</span>
              {isFamily && <small>{family.orders.length} subpedido(s)</small>}
            </b>
            <div className="order-client-cell" data-label="Cliente e serviço">
              <strong>{clientsInFamily.length === 1 ? clientsInFamily[0] : `${clientsInFamily.length} clientes`}</strong>
              <small>{isFamily ? `Pedido pai com ${family.orders.length} itens vinculados. Expanda para consultar cada subpedido.` : firstOrder.description}</small>
            </div>
            <span className="order-sector-cell" data-label="Setor">{sectorNames.length === 1 ? sectorNames[0] : `${sectorNames.length} setores`}</span>
            <span className="order-responsible-cell" data-label="Responsável"><i>{initials(familyResponsible)}</i><b>{familyResponsible}</b></span>
            <span className={`order-delivery-cell ${familyIsLate ? "table-late" : ""}`} data-label="Instalação / entrega"><b>{isFamily ? `Próxima: ${targetDateLabel(nextDeliveryOrder)}` : targetDateLabel(firstOrder)}</b><small>Produção: {isFamily ? dueLabel(nextDeliveryOrder.delivery_date) : dueLabel(firstOrder.delivery_date)}</small></span>
            <button type="button" onClick={() => isFamily ? onToggleFamily(family.parentOp) : onOpenOrder(firstOrder)}>
              {isFamily ? isExpanded ? "Recolher" : "Ver subpedidos" : "Ver pedido"}
            </button>
          </article>

          {isFamily && isExpanded && <div className="order-family-children" id={familyId}>
            {family.orders.map((order) => <article className="table-row order-child-row" key={order.id}>
              <b className="order-child-op"><span aria-hidden="true">↳</span> OP {order.op_number}</b>
              <div className="order-client-cell" data-label="Cliente e serviço"><strong>{order.client_name}</strong><small>{order.description}</small></div>
              <span className="order-sector-cell" data-label="Setor">{sectors.find((sector) => sector.id === order.sector_id)?.name || "—"}</span>
              <span className="order-responsible-cell" data-label="Responsável"><i>{initials(responsibleName(order))}</i><b>{responsibleName(order)}</b></span>
              <span className={`order-delivery-cell ${dueLabel(order.delivery_date).startsWith("Atrasado") ? "table-late" : ""}`} data-label="Instalação / entrega"><b>{targetDateLabel(order)}</b><small>Produção: {dueLabel(order.delivery_date)}</small></span>
              <button type="button" onClick={() => onOpenOrder(order)}>Ver pedido</button>
            </article>)}
          </div>}
        </div>;
      })}
    </div>
    {!families.length && <div className="view-empty">Nenhum pedido ativo encontrado.</div>}
  </section>;
}
