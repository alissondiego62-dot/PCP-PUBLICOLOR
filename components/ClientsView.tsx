"use client";

import { useEffect, useMemo, useState } from "react";
import { dueLabel, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import type { Client, DetailTab, Order } from "@/lib/pcp-types";
import { AppIcon } from "@/components/ui/AppIcon";

type Props = { clients: Client[]; orders: Order[]; canOperate: boolean; onOpenOrder: (order: Order, tab: DetailTab) => void; onNewClient: () => void; onEditClient: (client: Client) => void };
const PAGE_SIZE = 30;
function normalize(value: string | null | undefined) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\D/g, "").toLowerCase(); }
function normalizeName(value: string | null | undefined) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }
function orderBelongsToClient(order: Order, client: Client) { if (order.client_id) return order.client_id === client.id; return [client.name, client.trade_name].filter(Boolean).includes(order.client_name); }
function openExternal(url: string) { window.open(url, "_blank", "noopener,noreferrer"); }

export function ClientsView({ clients, orders, canOperate, onOpenOrder, onNewClient, onEditClient }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  useEffect(() => { setPage(1); }, [query, status]);

  const ordersByClient = useMemo(() => {
    const map = new Map<string, Order[]>();
    orders.forEach((order) => {
      if (order.client_id) { const bucket = map.get(order.client_id) || []; bucket.push(order); map.set(order.client_id, bucket); return; }
      const match = clients.find((client) => orderBelongsToClient(order, client));
      if (match) { const bucket = map.get(match.id) || []; bucket.push(order); map.set(match.id, bucket); }
    });
    return map;
  }, [clients, orders]);

  const duplicateIds = useMemo(() => {
    const buckets = new Map<string, string[]>();
    clients.forEach((client) => {
      const keys = [client.document && `d:${normalize(client.document)}`, (client.whatsapp || client.phone) && `p:${normalize(client.whatsapp || client.phone)}`, `n:${normalizeName(client.trade_name || client.name)}`].filter(Boolean) as string[];
      keys.forEach((key) => { if (key.endsWith(":")) return; const list = buckets.get(key) || []; list.push(client.id); buckets.set(key, list); });
    });
    return new Set(Array.from(buckets.values()).filter((items) => items.length > 1).flat());
  }, [clients]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return clients.filter((client) => status === "all" || client.active === (status === "active")).filter((client) => !term || [client.name, client.trade_name, client.document, client.phone, client.whatsapp, client.email].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [clients, query, status]);
  const visible = filtered.slice(0, page * PAGE_SIZE);
  const selected = clients.find((client) => client.id === selectedId) || null;
  const selectedOrders = selected ? ordersByClient.get(selected.id) || [] : [];
  const active = selectedOrders.filter((order) => order.status !== "completed");
  const completed = selectedOrders.filter((order) => order.status === "completed");
  const late = active.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado"));

  if (selected) return <section className="client-detail-view"><div className="client-detail-header"><button type="button" onClick={() => setSelectedId(null)}>← Voltar</button><div><small>CLIENTE</small><h2>{selected.trade_name || selected.name}</h2><p>{selected.name}</p></div><div className="client-detail-actions">{(selected.whatsapp || selected.phone) && <button type="button" title="Abrir WhatsApp" onClick={() => openExternal(`https://wa.me/55${normalize(selected.whatsapp || selected.phone)}`)}><AppIcon name="tasks"/> WhatsApp</button>}{selected.email && <button type="button" title="Enviar e-mail" onClick={() => { window.location.href = `mailto:${selected.email}`; }}><AppIcon name="orders"/> E-mail</button>}{selected.address && <button type="button" title="Abrir endereço" onClick={() => openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selected.address, selected.city, selected.state].filter(Boolean).join(", "))}`)}><AppIcon name="calendar"/> Endereço</button>}{canOperate && <button type="button" onClick={() => onEditClient(selected)}><AppIcon name="edit"/> Editar</button>}</div></div><div className="summary-strip client-detail-summary"><article><small>Pedidos ativos</small><strong>{active.length}</strong></article><article><small>Atrasados</small><strong>{late.length}</strong></article><article><small>Concluídos</small><strong>{completed.length}</strong></article><article><small>Total</small><strong>{selectedOrders.length}</strong></article></div><div className="client-profile-grid"><article><small>DOCUMENTO</small><b>{selected.document || "Não informado"}</b></article><article><small>WHATSAPP</small><b>{selected.whatsapp || selected.phone || "Não informado"}</b></article><article><small>E-MAIL</small><b>{selected.email || "Não informado"}</b></article><article><small>CONTATO</small><b>{selected.contact_name || "Não informado"}</b></article><article className="client-profile-address"><small>ENDEREÇO</small><b>{[selected.address, selected.district, [selected.city, selected.state].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Não informado"}</b></article><article><small>STATUS</small><b>{selected.active ? "Ativo" : "Inativo"}</b></article></div><ClientOrderGroup title="Pedidos ativos" orders={active} onOpen={onOpenOrder}/><ClientOrderGroup title="Pedidos concluídos recentes" orders={completed.slice(0,30)} onOpen={onOpenOrder}/></section>;

  return <section className="management-view clients-management-view"><div className="view-toolbar"><label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, CPF/CNPJ, telefone ou e-mail…" /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="active">Clientes ativos</option><option value="inactive">Clientes inativos</option><option value="all">Todos</option></select>{canOperate && <button type="button" className="primary" onClick={onNewClient}>＋ Novo cliente</button>}</div><div className="summary-strip"><article><small>Clientes cadastrados</small><strong>{clients.length}</strong></article><article><small>Com pedidos ativos</small><strong>{Array.from(ordersByClient.values()).filter((entries) => entries.some((order) => order.status !== "completed")).length}</strong></article><article><small>Possíveis duplicidades</small><strong>{duplicateIds.size}</strong></article><article><small>Total de pedidos</small><strong>{orders.length}</strong></article></div><div className="clients-cards-grid">{visible.map((client) => { const clientOrders = ordersByClient.get(client.id) || []; const activeCount = clientOrders.filter((order) => order.status !== "completed").length; const lateCount = clientOrders.filter((order) => order.status !== "completed" && dueLabel(order.delivery_date).startsWith("Atrasado")).length; return <article className={`client-record-card ${duplicateIds.has(client.id) ? "possible-duplicate" : ""}`} key={client.id}><button type="button" className="client-record-open" onClick={() => setSelectedId(client.id)}><i>{(client.trade_name || client.name).slice(0,2).toUpperCase()}</i><div><b>{client.trade_name || client.name}</b><small>{client.document || client.whatsapp || client.phone || "Sem documento"}</small>{duplicateIds.has(client.id) && <em>Possível duplicidade</em>}</div><span><b>{activeCount}</b> ativos<br/><small>{lateCount} atrasados · {clientOrders.length} total</small></span></button>{canOperate && <button type="button" className="client-record-edit" onClick={() => onEditClient(client)} aria-label={`Editar ${client.name}`}><AppIcon name="edit"/></button>}</article>; })}</div>{!visible.length && <div className="view-empty">Nenhum cliente encontrado.</div>}{visible.length < filtered.length && <div className="pagination-load-more"><button type="button" onClick={() => setPage((value) => value + 1)}>Carregar mais clientes</button><span>{visible.length} de {filtered.length}</span></div>}</section>;
}
function ClientOrderGroup({ title, orders, onOpen }: { title: string; orders: Order[]; onOpen: (order: Order, tab: DetailTab) => void }) { return <section className="client-orders-group"><h3>{title} <span>{orders.length}</span></h3>{orders.length ? <div className="client-orders-list">{orders.map((order) => <button key={order.id} type="button" onClick={() => onOpen(order,"summary")}><b>OP {order.op_number}</b><span>{order.description}</span><small>Inst./entrega: {shortDateOnlyLabel(targetDateForOrder(order.installation_scheduled_at,order.delivery_date))} · Produção: {dueLabel(order.delivery_date)}</small></button>)}</div> : <div className="view-empty">Nenhum pedido nesta categoria.</div>}</section>; }
