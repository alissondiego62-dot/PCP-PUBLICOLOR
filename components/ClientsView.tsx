"use client";

import { useMemo, useState } from "react";
import { dueLabel, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import type { Client, DetailTab, Order } from "@/lib/pcp-types";

type Props = {
  clients: Client[];
  orders: Order[];
  canOperate: boolean;
  onOpenOrder: (order: Order, tab: DetailTab) => void;
  onNewClient: () => void;
  onEditClient: (client: Client) => void;
};


function orderBelongsToClient(order: Order, client: Client) {
  if (order.client_id) return order.client_id === client.id;
  const legacyNames = new Set([client.name, client.trade_name].filter(Boolean));
  return legacyNames.has(order.client_name);
}

export function ClientsView({ clients, orders, canOperate, onOpenOrder, onNewClient, onEditClient }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = clients.find((client) => client.id === selectedId) || null;
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return clients;
    return clients.filter((client) =>
      [client.name, client.trade_name, client.document, client.phone, client.whatsapp]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [clients, query]);

  const selectedOrders = selected ? orders.filter((order) => orderBelongsToClient(order, selected)) : [];
  const active = selectedOrders.filter((order) => order.status !== "completed");
  const completed = selectedOrders.filter((order) => order.status === "completed");

  if (selected) {
    return (
      <section className="client-detail-view">
        <div className="client-detail-header">
          <button type="button" onClick={() => setSelectedId(null)}>← Voltar</button>
          <div>
            <small>CLIENTE</small>
            <h2>{selected.trade_name || selected.name}</h2>
            <p>{selected.name}</p>
          </div>
          {canOperate && <div className="client-detail-actions"><button type="button" onClick={() => onEditClient(selected)}>Editar cadastro</button></div>}
        </div>
        <div className="summary-strip client-detail-summary">
          <article><small>Pedidos ativos</small><strong>{active.length}</strong></article>
          <article><small>Concluídos</small><strong>{completed.length}</strong></article>
          <article><small>Total</small><strong>{selectedOrders.length}</strong></article>
        </div>
        <div className="client-profile-grid">
          <article><small>DOCUMENTO</small><b>{selected.document || "Não informado"}</b></article>
          <article><small>WHATSAPP</small><b>{selected.whatsapp || selected.phone || "Não informado"}</b></article>
          <article><small>E-MAIL</small><b>{selected.email || "Não informado"}</b></article>
          <article><small>CONTATO</small><b>{selected.contact_name || "Não informado"}</b></article>
          <article className="client-profile-address"><small>ENDEREÇO</small><b>{[selected.address, selected.district, [selected.city, selected.state].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Não informado"}</b></article>
          <article><small>STATUS</small><b>{selected.active ? "Ativo" : "Inativo"}</b></article>
        </div>
        <ClientOrderGroup title="Pedidos ativos" orders={active} onOpen={onOpenOrder} />
        <ClientOrderGroup title="Pedidos concluídos" orders={completed} onOpen={onOpenOrder} />
      </section>
    );
  }

  return (
    <section className="management-view clients-management-view">
      <div className="view-toolbar">
        <label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, CPF/CNPJ ou telefone..." /></label>
        {canOperate && <button type="button" className="primary" onClick={onNewClient}>＋ Novo cliente</button>}
      </div>
      <div className="summary-strip">
        <article><small>Clientes cadastrados</small><strong>{clients.length}</strong></article>
        <article><small>Com pedidos ativos</small><strong>{clients.filter((client) => orders.some((order) => order.client_id === client.id && order.status !== "completed")).length}</strong></article>
        <article><small>Total de pedidos</small><strong>{orders.length}</strong></article>
      </div>
      <div className="clients-cards-grid">
        {filtered.map((client) => {
          const clientOrders = orders.filter((order) => orderBelongsToClient(order, client));
          const activeCount = clientOrders.filter((order) => order.status !== "completed").length;
          return (
            <article className="client-record-card" key={client.id}>
              <button type="button" className="client-record-open" onClick={() => setSelectedId(client.id)}>
                <i>{(client.trade_name || client.name).slice(0, 2).toUpperCase()}</i>
                <div><b>{client.trade_name || client.name}</b><small>{client.document || client.whatsapp || client.phone || "Sem documento"}</small></div>
                <span><b>{activeCount}</b> ativos<br /><small>{clientOrders.length} no total</small></span>
              </button>
              {canOperate && <button type="button" className="client-record-edit" onClick={() => onEditClient(client)}>Editar</button>}
            </article>
          );
        })}
      </div>
      {!filtered.length && <div className="view-empty">Nenhum cliente encontrado.</div>}
    </section>
  );
}

function ClientOrderGroup({ title, orders, onOpen }: { title: string; orders: Order[]; onOpen: (order: Order, tab: DetailTab) => void }) {
  return (
    <section className="client-orders-group">
      <h3>{title} <span>{orders.length}</span></h3>
      {orders.length ? <div className="client-orders-list">{orders.map((order) => (
        <button key={order.id} type="button" onClick={() => onOpen(order, "summary")}>
          <b>OP {order.op_number}</b><span>{order.description}</span><small>Inst./entrega: {shortDateOnlyLabel(targetDateForOrder(order.installation_scheduled_at, order.delivery_date))} · Produção: {dueLabel(order.delivery_date)}</small>
        </button>
      ))}</div> : <div className="view-empty">Nenhum pedido nesta categoria.</div>}
    </section>
  );
}
