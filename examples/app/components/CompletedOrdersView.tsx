"use client";

import { dueLabel, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import type { DetailTab, Order, Sector } from "../domain/types";

type CompletedOrdersViewProps = {
  search: string;
  orders: Order[];
  sectors: Sector[];
  canOperate: boolean;
  onSearchChange: (value: string) => void;
  onOpenOrder: (order: Order, tab: DetailTab) => void;
  onReopenOrder: (order: Order) => void;
};

export function CompletedOrdersView({
  search,
  orders,
  sectors,
  canOperate,
  onSearchChange,
  onOpenOrder,
  onReopenOrder,
}: CompletedOrdersViewProps) {
  return (
    <section className="management-view completed-management-view">
      <div className="view-toolbar completed-toolbar">
        <label>
          ⌕
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar nos concluídos…"
          />
        </label>
        <span>{orders.length} concluídos</span>
      </div>

      {orders.length ? (
        <div className="completed-cards-grid">
          {orders.map((order) => {
            const sectorName =
              sectors.find((sector) => sector.id === order.sector_id)?.name ||
              "Concluído";

            return (
              <article className="completed-order-card" key={order.id}>
                <header className="completed-card-header">
                  <div>
                    <span className="completed-card-label">ORDEM DE SERVIÇO</span>
                    <strong>OP {order.op_number}</strong>
                  </div>
                  <span className="completed-card-status">Concluído</span>
                </header>

                <section className="completed-card-main">
                  <div className="completed-card-client">
                    <small>CLIENTE</small>
                    <h3>{order.client_name}</h3>
                    <p>{order.description}</p>
                  </div>

                  <div className="completed-card-details">
                    <div>
                      <small>SETOR FINAL</small>
                      <strong>{sectorName}</strong>
                    </div>
                    <div>
                      <small>INSTALAÇÃO / ENTREGA</small>
                      <strong>{shortDateOnlyLabel(targetDateForOrder(order.installation_scheduled_at, order.delivery_date))}</strong>
                      <em>Produção: {dueLabel(order.delivery_date)}</em>
                    </div>
                  </div>
                </section>

                <footer className="completed-order-actions">
                  <button
                    type="button"
                    className="history-order-button"
                    onClick={() => onOpenOrder(order, "history")}
                  >
                    <span className="completed-action-icon" aria-hidden="true">
                      🕘
                    </span>
                    <span>Ver Histórico</span>
                  </button>

                  {canOperate && (
                    <button
                      type="button"
                      className="reopen-order-button"
                      onClick={() => onReopenOrder(order)}
                    >
                      <span className="completed-action-icon" aria-hidden="true">
                        ↩
                      </span>
                      <span>Reabrir Produção</span>
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="view-empty">
          <b>Nenhum pedido concluído</b>
          <span>Os pedidos finalizados aparecerão aqui.</span>
        </div>
      )}
    </section>
  );
}
