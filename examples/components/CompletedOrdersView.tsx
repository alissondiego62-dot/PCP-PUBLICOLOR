import { dueLabel, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import type { Order, Sector } from "@/lib/pcp-types";

type CompletedOrdersViewProps = {
  search: string;
  orders: Order[];
  sectors: Sector[];
  canOperate: boolean;
  onSearchChange: (value: string) => void;
  onOpenHistory: (order: Order) => void;
  onReopen: (order: Order) => void;
};

export function CompletedOrdersView({
  search,
  orders,
  sectors,
  canOperate,
  onSearchChange,
  onOpenHistory,
  onReopen,
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
                    <span className="completed-card-label">
                      ORDEM DE SERVIÇO
                    </span>
                    <strong>OP {order.op_number}</strong>
                  </div>
                  <span className="completed-card-status">Concluído</span>
                </header>

                <div className="completed-card-body">
                  <section className="completed-card-client">
                    <small>CLIENTE E SERVIÇO</small>
                    <h3>{order.client_name}</h3>
                    <p>{order.description}</p>
                  </section>

                  <section className="completed-card-info-grid">
                    <div>
                      <small>SETOR FINAL</small>
                      <strong>{sectorName}</strong>
                    </div>
                    <div>
                      <small>INSTALAÇÃO / ENTREGA</small>
                      <strong>{shortDateOnlyLabel(targetDateForOrder(order.installation_scheduled_at, order.delivery_date))}</strong>
                      <em>Produção: {dueLabel(order.delivery_date)}</em>
                    </div>
                  </section>
                </div>

                <footer className="completed-card-actions">
                  <button
                    type="button"
                    className="completed-history-button"
                    onClick={() => onOpenHistory(order)}
                  >
                    <span aria-hidden="true">🕘</span>
                    <b>Ver Histórico</b>
                  </button>

                  {canOperate && (
                    <button
                      type="button"
                      className="completed-reopen-button"
                      onClick={() => onReopen(order)}
                    >
                      <span aria-hidden="true">↩</span>
                      <b>Reabrir Produção</b>
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
