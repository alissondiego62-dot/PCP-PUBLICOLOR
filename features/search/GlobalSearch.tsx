"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Client, DetailTab, Order, ViewKey } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

type RemoteResult = {
  id: string;
  title: string;
  subtitle: string;
  order_id: string | null;
  kind: "order" | "client" | "activity" | "material";
  order?: Order;
};

const orderColumns = "id,op_number,client_id,client_name,description,delivery_date,priority,sector_id,status,responsible_user_id,consultant_name,main_image_path,blocked,completed_at,installation_scheduled_at,installation_address,installation_team,installation_vehicle,installation_status,installation_notes,installation_completed_at,installation_time_confirmed,materials,notes,created_at,updated_at,sector_entered_at";

export function GlobalSearch({ open, orders, clients, onClose, onOpenOrder, onNavigate }: {
  open: boolean;
  orders: Order[];
  clients: Client[];
  onClose: () => void;
  onOpenOrder: (order: Order, tab: DetailTab) => void;
  onNavigate: (view: ViewKey) => void;
}) {
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRemote([]);
    setSearchError("");
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || term.length < 2) { setRemote([]); setSearchError(""); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError("");
      const safeTerm = term.replace(/[%_,()]/g, " ").trim();
      const pattern = `%${safeTerm}%`;
      const [orderResult, clientResult, activityResult, materialResult] = await Promise.all([
        supabase.from("orders").select(orderColumns).or(`op_number.ilike.${pattern},client_name.ilike.${pattern},description.ilike.${pattern}`).order("updated_at", { ascending: false }).limit(8),
        supabase.from("clients").select("id,name,trade_name,document,phone,whatsapp,email,active,created_at,updated_at").or(`name.ilike.${pattern},trade_name.ilike.${pattern},document.ilike.${pattern},phone.ilike.${pattern},whatsapp.ilike.${pattern}`).limit(8),
        supabase.from("activities").select("id,title,description,order_id").ilike("title", pattern).is("deleted_at", null).limit(8),
        supabase.from("order_materials").select("id,material_name,order_id,unit,quantity").ilike("material_name", pattern).is("deleted_at", null).limit(8),
      ]);
      if (!active) return;
      const firstError = orderResult.error || clientResult.error || activityResult.error || materialResult.error;
      if (firstError) setSearchError("Parte da busca não pôde ser consultada agora.");
      const localOrderIds = new Set(orders.map((order) => order.id));
      const localClientIds = new Set(clients.map((client) => client.id));
      const remoteOrders = ((orderResult.data || []) as Order[])
        .filter((order) => !localOrderIds.has(order.id))
        .map((order) => ({ id: order.id, title: `OP ${order.op_number}`, subtitle: `${order.client_name} · ${order.description}`, order_id: order.id, kind: "order" as const, order }));
      const remoteClients = (clientResult.data || [])
        .filter((client) => !localClientIds.has(client.id))
        .map((client) => ({ id: client.id, title: client.trade_name || client.name, subtitle: client.document || client.whatsapp || client.phone || "Cadastro de cliente", order_id: null, kind: "client" as const }));
      const activities = (activityResult.data || []).map((item) => ({ id: item.id, title: item.title, subtitle: item.description || "Atividade", order_id: item.order_id, kind: "activity" as const }));
      const materials = (materialResult.data || []).map((item) => ({ id: item.id, title: item.material_name, subtitle: `${item.quantity} ${item.unit}`, order_id: item.order_id, kind: "material" as const }));
      setRemote([...remoteOrders, ...remoteClients, ...activities, ...materials]);
      setLoading(false);
    }, 280);
    return () => { active = false; window.clearTimeout(timer); };
  }, [clients, open, orders, query]);

  const local = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return { orders: [] as Order[], clients: [] as Client[] };
    return {
      orders: orders.filter((order) => `${order.op_number} ${order.client_name} ${order.description}`.toLocaleLowerCase("pt-BR").includes(term)).slice(0, 10),
      clients: clients.filter((client) => `${client.name} ${client.trade_name || ""} ${client.document || ""} ${client.phone || ""}`.toLocaleLowerCase("pt-BR").includes(term)).slice(0, 8),
    };
  }, [clients, orders, query]);

  async function openRemoteItem(item: RemoteResult) {
    if (item.kind === "order" && item.order) {
      onOpenOrder(item.order, "summary");
      onClose();
      return;
    }
    if (item.kind === "client") {
      onNavigate("clients");
      onClose();
      return;
    }
    if (item.order_id) {
      const localOrder = orders.find((entry) => entry.id === item.order_id);
      if (localOrder) {
        onOpenOrder(localOrder, item.kind === "material" ? "materials" : "summary");
        onClose();
        return;
      }
      const { data } = await supabase.from("orders").select(orderColumns).eq("id", item.order_id).maybeSingle();
      if (data) {
        onOpenOrder(data as Order, item.kind === "material" ? "materials" : "summary");
        onClose();
        return;
      }
    }
    onNavigate("activities");
    onClose();
  }

  if (!open) return null;
  return <div className="command-overlay" role="presentation" onMouseDown={onClose}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="Busca global" onMouseDown={(event) => event.stopPropagation()}>
      <header><AppIcon name="search"/><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar OP, cliente, material ou atividade…"/><kbd>Esc</kbd></header>
      <div className="command-results">
        {!query.trim() && <div className="command-help"><b>Comandos rápidos</b><button onClick={() => { onNavigate("orders"); onClose(); }}>Nova ou localizar OS</button><button onClick={() => { onNavigate("activities"); onClose(); }}>Abrir Atividades e Compras</button><button onClick={() => { onNavigate("installation"); onClose(); }}>Abrir Agenda</button></div>}
        {local.orders.length > 0 && <section><h3>Ordens de serviço</h3>{local.orders.map((order) => <button key={order.id} onClick={() => { onOpenOrder(order, "summary"); onClose(); }}><span><b>OP {order.op_number}</b><small>{order.client_name} · {order.description}</small></span><em>Abrir</em></button>)}</section>}
        {local.clients.length > 0 && <section><h3>Clientes</h3>{local.clients.map((client) => <button key={client.id} onClick={() => { onNavigate("clients"); onClose(); }}><span><b>{client.trade_name || client.name}</b><small>{client.document || client.whatsapp || client.phone || "Cadastro de cliente"}</small></span><em>Clientes</em></button>)}</section>}
        {remote.length > 0 && <section><h3>Resultados na base</h3>{remote.map((item) => <button key={`${item.kind}-${item.id}`} onClick={() => void openRemoteItem(item)}><span><b>{item.title}</b><small>{item.subtitle}</small></span><em>{item.kind === "order" ? "OS" : item.kind === "client" ? "Cliente" : item.kind === "material" ? "Material" : "Atividade"}</em></button>)}</section>}
        {searchError && <div className="command-loading">{searchError}</div>}
        {query.trim() && !loading && !local.orders.length && !local.clients.length && !remote.length && <div className="view-empty">Nenhum resultado encontrado.</div>}
        {loading && <div className="command-loading">Pesquisando em toda a base…</div>}
      </div>
    </section>
  </div>;
}
