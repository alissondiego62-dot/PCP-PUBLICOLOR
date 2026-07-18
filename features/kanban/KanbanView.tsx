"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { DbStatus, DeadlineFilter, Order, Priority, Sector, SortMode, UiStatus } from "@/lib/pcp-types";
import { isPcpSectorName, priorityLabel, statusDotClass, statusesForSector, statusToDb } from "@/lib/pcp-config";
import { dueLabel, initials, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import { driveThumbnailFileId } from "@/lib/order-thumbnail";
import { AppIcon } from "@/components/ui/AppIcon";

const UNASSIGNED_RESPONSIBLE_FILTER = "__unassigned__";
const sortLabels: Record<SortMode, string> = { newest: "Mais recentes", oldest: "Mais antigos", delivery: "Prazo" };

const STACK_STATUS_OPTIONS: Array<{ value: DbStatus; label: string }> = [
  { value: "waiting", label: "Aguardando" },
  { value: "in_progress", label: "Em andamento" },
  { value: "waiting_client", label: "Aguardando cliente" },
  { value: "in_transport", label: "Em transporte" },
  { value: "paused", label: "Pausado" },
];

function stackStatusLabel(status: DbStatus) {
  return STACK_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

type StackViewerState = {
  parentOp: string;
  orders: Order[];
  tab: "history" | "comments";
};

type StackActionState = {
  mode: "move" | "status" | "finish";
  parentOp: string;
  orders: Order[];
  selectedIds: Set<string>;
};

export type KanbanMetricKey =
  | "active"
  | "in_progress"
  | "waiting_action"
  | "late"
  | "today"
  | "installation_today"
  | "blocked";

type ThumbnailProgress = {
  phase: "idle" | "priority" | "background" | "complete";
  loaded: number;
  total: number;
};

function dateKeyInManaus(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function normalizedResponsibleName(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase("pt-BR") || "";
}
function orderResponsibleName(order: Order) {
  return order.consultant_name?.trim() || "Não definido";
}
function orderTargetDateLabel(order: Order) {
  return shortDateOnlyLabel(targetDateForOrder(order.installation_scheduled_at, order.delivery_date));
}
function isPdfPageThumbnailPath(path: string | null | undefined) {
  return Boolean(path?.includes("/pdf-pages/") || driveThumbnailFileId(path));
}

function orderMatchesLane(order: Order, status: UiStatus) {
  if (order.status === "paused") return status === "Aguardando";
  return order.status === statusToDb[status];
}

function sectorAgeLabel(order: Order) {
  const source = order.sector_entered_at || order.updated_at || order.created_at;
  const time = new Date(source).getTime();
  if (!Number.isFinite(time)) return "";
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3_600_000));
  if (hours < 24) return `${hours}h no setor`;
  const days = Math.floor(hours / 24);
  return `${days}d no setor`;
}


function OrderThumbnail({
  order,
  url,
  onVisible,
  onPreview,
}: {
  order: Order;
  url: string;
  onVisible: (order: Order) => void;
  onPreview: (order: Order, url: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasThumbnail = Boolean(order.main_image_path?.trim());

  useEffect(() => {
    if (!hasThumbnail || url) return;
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      onVisible(order);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      onVisible(order);
    }, { rootMargin: "360px 240px", threshold: 0.01 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasThumbnail, onVisible, order, url]);

  if (url) {
    return <button
      type="button"
      className={`order-thumbnail ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-thumbnail" : ""}`}
      aria-label={`Ampliar miniatura da OP ${order.op_number}`}
      title="Clique para ampliar"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onPreview(order, url); }}
    ><img src={url} alt={`Miniatura da OP ${order.op_number}`} width={160} height={160} decoding="async" /></button>;
  }

  return <div
    ref={containerRef}
    className={`order-thumbnail ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-thumbnail" : ""} ${hasThumbnail ? "thumbnail-loading" : ""}`}
  ><div className="order-thumbnail-empty" aria-label={hasThumbnail ? "Miniatura sendo carregada" : "Pedido sem miniatura"}>
    <span>{hasThumbnail ? "◌" : "PNG"}</span>
    <small>{hasThumbnail ? "Carregando…" : "Sem miniatura"}</small>
  </div></div>;
}

type KanbanOrderCardProps = {
  order: Order;
  canOperate: boolean;
  canFinalize: boolean;
  isAdmin: boolean;
  busyOrderId: string | null;
  commentCount: number;
  cardImageUrl: (order: Order) => string;
  onDragStart: (orderId: string) => void;
  onDragEnd: () => void;
  onOpenOrder: (order: Order, tab: "history" | "comments") => void;
  onDeleteOrder: (order: Order) => void;
  onPreview: (order: Order, url: string) => void;
  onThumbnailVisible: (order: Order) => void;
  onMoveOrder: (order: Order) => void;
  onChangeStatus: (order: Order) => void;
  onFinishOrder: (order: Order) => void;
  showStatusAction: boolean;
  stackedChild?: boolean;
};

function KanbanOrderCard({
  order, canOperate, canFinalize, isAdmin, busyOrderId, commentCount, cardImageUrl,
  onDragStart, onDragEnd, onOpenOrder, onDeleteOrder, onPreview,
  onThumbnailVisible, onMoveOrder, onChangeStatus, onFinishOrder, showStatusAction, stackedChild = false,
}: KanbanOrderCardProps) {
  const ageLabel = sectorAgeLabel(order);
  const ageInDays = Number(ageLabel.match(/^(\d+)d/)?.[1] || 0);

  return <div
    draggable={canOperate && busyOrderId !== order.id}
    aria-disabled={!canOperate}
    onDragStart={(event) => {
      if (!canOperate) { event.preventDefault(); return; }
      event.dataTransfer.effectAllowed = "move";
      onDragStart(order.id);
    }}
    onDragEnd={onDragEnd}
    onClick={() => onOpenOrder(order, "history")}
    className={`order ${priorityLabel[order.priority].toLowerCase()} ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-order" : ""} ${order.blocked || order.status === "paused" ? "blocked-order" : ""} ${stackedChild ? "stack-child-order" : ""}`}
  >
    {isAdmin && <button type="button" className="delete-order-button" aria-label={`Apagar OP ${order.op_number}`} title="Apagar pedido" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDeleteOrder(order); }}><AppIcon name="trash" /></button>}
    <OrderThumbnail order={order} url={cardImageUrl(order)} onVisible={onThumbnailVisible} onPreview={onPreview} />
    <div className="order-top"><b>OP {order.op_number}</b><div className="order-badges"><span className={`tag ${priorityLabel[order.priority].toLowerCase()}`}>{priorityLabel[order.priority]}</span>{(order.blocked || order.status === "paused") && <span className="tag blocked">{order.status === "paused" ? "Pausado" : "Bloqueado"}</span>}</div></div>
    <h3>{order.client_name}</h3><p className="order-service">{order.description}</p>
    <div className="order-operational-meta"><span>{ageLabel}</span>{ageLabel.startsWith("2d") || ageInDays >= 2 ? <b>Sem movimentação</b> : null}</div>
    <div className="order-responsible" title={`Responsável: ${orderResponsibleName(order)}`}><span>{initials(orderResponsibleName(order))}</span><div><small>RESPONSÁVEL</small><b>{orderResponsibleName(order)}</b></div></div>
    <div className={`due order-deadlines ${dueLabel(order.delivery_date).startsWith("Atrasado") ? "late" : ""}`}><span>Inst./entrega: <b>{orderTargetDateLabel(order)}</b></span><small>Produção: {dueLabel(order.delivery_date)}</small></div>
    <footer className="kanban-card-icon-actions">
      <button type="button" title="Histórico" aria-label={`Abrir histórico da OP ${order.op_number}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenOrder(order, "history"); }}><AppIcon name="history" /></button>
      <button type="button" title="Comentários" aria-label={`Abrir comentários da OP ${order.op_number}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenOrder(order, "comments"); }}><AppIcon name="comments" />{Boolean(commentCount) && <span>{commentCount}</span>}</button>
      {canOperate && <button type="button" title="Mover setor" aria-label={`Mover OP ${order.op_number} de setor`} disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onMoveOrder(order); }}><AppIcon name="move" /></button>}
      {canOperate && showStatusAction && <button type="button" className={`status-${order.status}`} title="Alterar status" aria-label={`Alterar status da OP ${order.op_number}`} disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onChangeStatus(order); }}><AppIcon name={order.status === "paused" ? "pause" : "status"} /></button>}
      {canFinalize && <button type="button" className="finish-icon" title="Finalizar ordem" aria-label={`Finalizar OP ${order.op_number}`} disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onFinishOrder(order); }}><AppIcon name="check" /></button>}
    </footer>
  </div>;
}

type KanbanStack = {
  key: string;
  parentOp: string;
  orders: Order[];
};

function orderFamilyKey(opNumber: string) {
  const normalized = opNumber.trim();
  const subOrderMatch = normalized.match(/^(.+?)-([1-9]\d{0,2})$/);
  return {
    parentOp: subOrderMatch?.[1]?.trim() || normalized,
    childNumber: subOrderMatch ? Number(subOrderMatch[2]) : null,
  };
}

function groupLaneOrdersAsStacks(laneKey: string, orders: Order[]): KanbanStack[] {
  const buckets = new Map<string, KanbanStack>();
  orders.forEach((order) => {
    const family = orderFamilyKey(order.op_number);
    const key = `${laneKey}:${family.parentOp.toLocaleUpperCase("pt-BR")}`;
    const current = buckets.get(key);
    if (current) current.orders.push(order);
    else buckets.set(key, { key, parentOp: family.parentOp, orders: [order] });
  });
  return [...buckets.values()];
}

function compareStackChildren(first: Order, second: Order) {
  const firstKey = orderFamilyKey(first.op_number);
  const secondKey = orderFamilyKey(second.op_number);
  if (firstKey.childNumber !== null && secondKey.childNumber !== null) return firstKey.childNumber - secondKey.childNumber;
  if (firstKey.childNumber === null && secondKey.childNumber !== null) return -1;
  if (firstKey.childNumber !== null && secondKey.childNumber === null) return 1;
  return first.op_number.localeCompare(second.op_number, "pt-BR", { numeric: true });
}

type KanbanOrderStackProps = {
  stack: KanbanStack;
  expanded: boolean;
  onToggle: () => void;
  orderCardProps: Omit<KanbanOrderCardProps, "order" | "commentCount" | "stackedChild">;
  commentCounts: Record<string, number>;
  onOpenStackViewer: (stack: KanbanStack, tab: "history" | "comments") => void;
  onOpenStackAction: (stack: KanbanStack, mode: "move" | "status" | "finish") => void;
};

function KanbanOrderStack({
  stack,
  expanded,
  onToggle,
  orderCardProps,
  commentCounts,
  onOpenStackViewer,
  onOpenStackAction,
}: KanbanOrderStackProps) {
  const orders = [...stack.orders].sort(compareStackChildren);
  const firstOrder = orders[0];
  const clients = [...new Set(orders.map((order) => order.client_name.trim()).filter(Boolean))];
  const responsibles = [...new Set(orders.map(orderResponsibleName))];
  const nearestOrder = [...orders].sort((first, second) => targetDateForOrder(first.installation_scheduled_at, first.delivery_date).localeCompare(targetDateForOrder(second.installation_scheduled_at, second.delivery_date)))[0];
  const lateCount = orders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado")).length;
  const pausedCount = orders.filter((order) => order.status === "paused" || order.blocked).length;
  const totalComments = orders.reduce((total, order) => total + (commentCounts[order.id] || 0), 0);
  const clientLabel = clients.length === 1 ? clients[0] : `${clients.length} clientes`;
  const responsibleLabel = responsibles.length === 1 ? responsibles[0] : `${responsibles.length} responsáveis`;

  return <section className={`kanban-order-stack ${expanded ? "expanded" : "collapsed"}`}>
    <article className={`order kanban-stack-summary ${lateCount ? "stack-has-late" : ""} ${pausedCount ? "blocked-order" : ""}`} onClick={onToggle}>
      <button type="button" className="kanban-stack-toggle" aria-expanded={expanded} aria-label={`${expanded ? "Recolher" : "Abrir"} pilha da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggle(); }}><AppIcon name={expanded ? "chevronDown" : "chevronRight"} /></button>
      <div className="kanban-stack-thumbnail">
        <OrderThumbnail order={firstOrder} url={orderCardProps.cardImageUrl(firstOrder)} onVisible={orderCardProps.onThumbnailVisible} onPreview={orderCardProps.onPreview} />
      </div>
      <div className="kanban-stack-heading">
        <div className="kanban-stack-op-row"><b>OP {stack.parentOp}</b><div className="order-badges"><span className="tag stack-count">{orders.length} itens</span>{lateCount > 0 && <span className="tag urgent">{lateCount} atrasado{lateCount === 1 ? "" : "s"}</span>}{pausedCount > 0 && <span className="tag blocked">{pausedCount} pausado{pausedCount === 1 ? "" : "s"}</span>}</div></div>
        <h3>{clientLabel}</h3>
        <p className="kanban-stack-caption">Subpedidos no mesmo setor e status.</p>
      </div>
      <div className="kanban-stack-metrics"><span><small>Itens</small><b>{orders.length}</b></span><span><small>Próximo prazo</small><b>{orderTargetDateLabel(nearestOrder)}</b></span><span><small>Responsável</small><b>{responsibleLabel}</b></span></div>
      <div className={`kanban-stack-alert ${lateCount ? "late" : ""}`}><span>Produção mais próxima: <b>{dueLabel(nearestOrder.delivery_date)}</b></span><small>{totalComments ? `${totalComments} comentário${totalComments === 1 ? "" : "s"} na pilha` : "Sem comentários"}</small></div>
      <footer className="kanban-stack-icon-actions" aria-label={`Ações coletivas da OP ${stack.parentOp}`}>
        <button type="button" className="stack-expand-action" title={expanded ? "Recolher pedidos" : "Abrir pedidos"} aria-label={`${expanded ? "Recolher" : "Abrir"} pedidos da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggle(); }}><AppIcon name={expanded ? "chevronDown" : "chevronRight"} /></button>
        <button type="button" title="Históricos da pilha" aria-label={`Visualizar históricos dos pedidos da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenStackViewer(stack, "history"); }}><AppIcon name="history" /></button>
        <button type="button" title="Comentários da pilha" aria-label={`Visualizar comentários dos pedidos da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenStackViewer(stack, "comments"); }}><AppIcon name="comments" />{Boolean(totalComments) && <span>{totalComments}</span>}</button>
        {orderCardProps.canOperate && <button type="button" title={`Mover ${orders.length} pedidos`} aria-label={`Mover todos os pedidos da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenStackAction(stack, "move"); }}><AppIcon name="move" /></button>}
        {orderCardProps.canOperate && orderCardProps.showStatusAction && <button type="button" className={`status-${firstOrder.status}`} title={`Alterar status de ${orders.length} pedidos`} aria-label={`Alterar status de todos os pedidos da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenStackAction(stack, "status"); }}><AppIcon name={firstOrder.status === "paused" ? "pause" : "status"} /></button>}
        {orderCardProps.canFinalize && <button type="button" className="finish-icon" title={`Finalizar ${orders.length} pedidos`} aria-label={`Finalizar todos os pedidos da OP ${stack.parentOp}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenStackAction(stack, "finish"); }}><AppIcon name="check" /></button>}
      </footer>
      <div className="kanban-stack-collective-label">{orders.length} pedidos · ações coletivas disponíveis</div>
    </article>
    {expanded && <div className="kanban-stack-children" aria-label={`Subpedidos da OP ${stack.parentOp}`}>{orders.map((order) => <KanbanOrderCard key={order.id} order={order} commentCount={commentCounts[order.id] || 0} stackedChild {...orderCardProps} />)}</div>}
  </section>;
}

export type KanbanViewProps = {
  activeOrderCounts: { orders: number; suborders: number };
  activeOrders: Order[];
  installationOrders: Order[];
  filtered: Order[];
  activeSectors: Sector[];
  visibleSectors: Sector[];
  search: string;
  filtersOpen: boolean;
  activeFilterCount: number;
  activeMetric: KanbanMetricKey | null;
  thumbnailProgress: ThumbnailProgress;
  sortMode: SortMode;
  loading: boolean;
  sectorFilter: string;
  statusFilter: "all" | DbStatus;
  priorityFilter: "all" | Priority;
  responsibleFilter: string;
  deadlineFilter: DeadlineFilter;
  consultantOptions: string[];
  activeKanbanSectorIndex: number;
  boardScrollWidth: number;
  boardRef: RefObject<HTMLElement | null>;
  topScrollRef: RefObject<HTMLDivElement | null>;
  dragOverLane: string | null;
  canOperate: boolean;
  canFinalize: boolean;
  isAdmin: boolean;
  busyOrderId: string | null;
  commentCounts: Record<string, number>;
  hasActiveSearch: boolean;
  error: string;
  cardImageUrl: (order: Order) => string;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onCloseFilters: () => void;
  onCycleSort: () => void;
  onSectorFilterChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | DbStatus) => void;
  onPriorityFilterChange: (value: "all" | Priority) => void;
  onResponsibleFilterChange: (value: string) => void;
  onDeadlineFilterChange: (value: DeadlineFilter) => void;
  onMetricSelect: (metric: KanbanMetricKey) => void;
  onClearFilters: () => void;
  onScrollToSector: (index: number) => void;
  onTopScroll: () => void;
  onBoardScroll: () => void;
  onDragStart: (orderId: string) => void;
  onDragEnd: () => void;
  onDragOverLane: (lane: string) => void;
  onDrop: (sectorId: string, status: UiStatus) => void;
  onOpenOrder: (order: Order, tab: "history" | "comments") => void;
  onDeleteOrder: (order: Order) => void;
  onPreview: (order: Order, url: string) => void;
  onThumbnailVisible: (order: Order) => void;
  onMoveOrder: (order: Order) => void;
  onChangeStatus: (order: Order) => void;
  onFinishOrder: (order: Order) => void;
  onBulkMoveOrders: (orders: Order[], sectorId: string) => Promise<boolean>;
  onBulkChangeStatus: (orders: Order[], status: DbStatus) => Promise<boolean>;
  onBulkFinishOrders: (orders: Order[]) => Promise<boolean>;
};

export function KanbanView(props: KanbanViewProps) {
  const {
    activeOrderCounts, activeOrders, installationOrders, filtered, activeSectors, visibleSectors,
    search, filtersOpen, activeFilterCount, activeMetric, thumbnailProgress, sortMode, loading, sectorFilter, statusFilter,
    priorityFilter, responsibleFilter, deadlineFilter, consultantOptions, activeKanbanSectorIndex,
    boardScrollWidth, boardRef, topScrollRef, dragOverLane, canOperate, canFinalize, isAdmin, busyOrderId,
    commentCounts, hasActiveSearch, error, cardImageUrl, onSearchChange, onToggleFilters,
    onCloseFilters, onCycleSort, onSectorFilterChange, onStatusFilterChange, onPriorityFilterChange,
    onResponsibleFilterChange, onDeadlineFilterChange, onMetricSelect, onClearFilters, onScrollToSector,
    onTopScroll, onBoardScroll, onDragStart, onDragEnd, onDragOverLane, onDrop, onOpenOrder,
    onDeleteOrder, onPreview, onThumbnailVisible, onMoveOrder, onChangeStatus, onFinishOrder,
    onBulkMoveOrders, onBulkChangeStatus, onBulkFinishOrders,
  } = props;
  const [displayMode, setDisplayMode] = useState<"compact" | "detailed">(() => {
    if (typeof window === "undefined") return "detailed";
    return window.localStorage.getItem("pcp-kanban-display-mode") === "compact" ? "compact" : "detailed";
  });

  useEffect(() => { window.localStorage.setItem("pcp-kanban-display-mode", displayMode); }, [displayMode]);

  // As pilhas começam recolhidas em toda nova carga. O estado não é persistido
  // em localStorage nem no banco, mas permanece durante atualizações Realtime.
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(() => new Set());
  function toggleStack(stackKey: string) {
    setExpandedStacks((current) => {
      const next = new Set(current);
      if (next.has(stackKey)) next.delete(stackKey);
      else next.add(stackKey);
      return next;
    });
  }

  const [stackViewer, setStackViewer] = useState<StackViewerState | null>(null);
  const [stackAction, setStackAction] = useState<StackActionState | null>(null);
  const [stackActionBusy, setStackActionBusy] = useState(false);

  function openStackViewer(stack: KanbanStack, tab: "history" | "comments") {
    setStackViewer({ parentOp: stack.parentOp, orders: [...stack.orders].sort(compareStackChildren), tab });
  }

  function openStackAction(stack: KanbanStack, mode: StackActionState["mode"]) {
    const ordered = [...stack.orders].sort(compareStackChildren);
    setStackAction({
      mode,
      parentOp: stack.parentOp,
      orders: ordered,
      selectedIds: new Set(ordered.map((order) => order.id)),
    });
  }

  function toggleStackActionOrder(orderId: string) {
    setStackAction((current) => {
      if (!current) return current;
      const selectedIds = new Set(current.selectedIds);
      if (selectedIds.has(orderId)) selectedIds.delete(orderId);
      else selectedIds.add(orderId);
      return { ...current, selectedIds };
    });
  }

  function selectAllStackActionOrders() {
    setStackAction((current) => current ? { ...current, selectedIds: new Set(current.orders.map((order) => order.id)) } : current);
  }

  function clearStackActionOrders() {
    setStackAction((current) => current ? { ...current, selectedIds: new Set() } : current);
  }

  async function runStackMove(sectorId: string) {
    if (!stackAction || stackActionBusy) return;
    const selectedOrders = stackAction.orders.filter((order) => stackAction.selectedIds.has(order.id));
    if (!selectedOrders.length) return;
    setStackActionBusy(true);
    const updated = await onBulkMoveOrders(selectedOrders, sectorId);
    setStackActionBusy(false);
    if (updated) setStackAction(null);
  }

  async function runStackStatus(status: DbStatus) {
    if (!stackAction || stackActionBusy) return;
    const selectedOrders = stackAction.orders.filter((order) => stackAction.selectedIds.has(order.id));
    if (!selectedOrders.length) return;
    setStackActionBusy(true);
    const updated = await onBulkChangeStatus(selectedOrders, status);
    setStackActionBusy(false);
    if (updated) setStackAction(null);
  }

  async function runStackFinish() {
    if (!stackAction || stackActionBusy) return;
    const selectedOrders = stackAction.orders.filter((order) => stackAction.selectedIds.has(order.id));
    if (!selectedOrders.length) return;
    setStackActionBusy(true);
    const updated = await onBulkFinishOrders(selectedOrders);
    setStackActionBusy(false);
    if (updated) setStackAction(null);
  }

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, Order[]>();
    filtered.forEach((order) => {
      const sector = activeSectors.find((item) => item.id === order.sector_id);
      const statuses = sector?.uses_status === false ? ["Aguardando"] : order.status === "paused" ? ["Aguardando"] : Object.entries(statusToDb).filter(([, value]) => value === order.status).map(([label]) => label);
      const status = statuses[0] || "Aguardando";
      const key = `${order.sector_id}:${status}`;
      const bucket = groups.get(key) || [];
      bucket.push(order);
      groups.set(key, bucket);
    });
    return groups;
  }, [filtered, activeSectors]);

  const sectorCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filtered.forEach((order) => counts.set(order.sector_id, (counts.get(order.sector_id) || 0) + 1));
    return counts;
  }, [filtered]);

  const metricSummary = useMemo(() => {
    const todayKey = dateKeyInManaus(new Date());
    const waitingOrders = activeOrders.filter((order) => ["waiting", "waiting_client"].includes(order.status));
    const lateOrders = activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado"));
    const productionToday = activeOrders.filter((order) => dueLabel(order.delivery_date) === "Prazo hoje");
    const inProgress = activeOrders.filter((order) => order.status === "in_progress");
    const blocked = activeOrders.filter((order) => order.blocked || order.status === "paused");
    const installationToday = installationOrders.filter((order) =>
      Boolean(order.installation_scheduled_at) && dateKeyInManaus(order.installation_scheduled_at!) === todayKey,
    );
    const futureInstallations = installationOrders.filter((order) =>
      Boolean(order.installation_scheduled_at) && dateKeyInManaus(order.installation_scheduled_at!) > todayKey,
    );

    return {
      waiting: waitingOrders.length,
      waitingWithoutResponsible: waitingOrders.filter((order) => !order.consultant_name?.trim()).length,
      late: lateOrders.length,
      lateWaiting: lateOrders.filter((order) => ["waiting", "waiting_client"].includes(order.status)).length,
      lateInProgress: lateOrders.filter((order) => order.status === "in_progress").length,
      productionToday: productionToday.length,
      inProgress: inProgress.length,
      blocked: blocked.length,
      installationToday: installationToday.length,
      futureInstallations: futureInstallations.length,
      withoutResponsible: activeOrders.filter((order) => !order.consultant_name?.trim()).length,
      withoutDate: activeOrders.filter((order) => !order.delivery_date?.trim()).length,
    };
  }, [activeOrders, installationOrders]);

  const metricCards: Array<{
    key: KanbanMetricKey;
    icon: string;
    tone: string;
    title: string;
    value: number;
    detail: string;
  }> = [
    { key: "active", icon: "▦", tone: "blue", title: "Pedidos ativos", value: activeOrderCounts.orders, detail: "Ordens principais abertas" },
    { key: "in_progress", icon: "↗", tone: "purple", title: "Em produção", value: metricSummary.inProgress, detail: "Itens em andamento" },
    { key: "waiting_action", icon: "◷", tone: "yellow", title: "Aguardando ação", value: metricSummary.waiting, detail: `${metricSummary.waitingWithoutResponsible} sem responsável` },
    { key: "late", icon: "!", tone: "red", title: "Atrasados", value: metricSummary.late, detail: `${metricSummary.lateWaiting} aguardando · ${metricSummary.lateInProgress} produzindo` },
    { key: "today", icon: "⌑", tone: "amber", title: "Produção hoje", value: metricSummary.productionToday, detail: "Prazo interno do dia" },
    { key: "installation_today", icon: "◉", tone: "magenta", title: "Instalações hoje", value: metricSummary.installationToday, detail: "Compromissos do dia" },
    { key: "blocked", icon: "Ⅱ", tone: "dark-red", title: "Bloqueados/pausados", value: metricSummary.blocked, detail: "Exigem intervenção" },
  ];

  const thumbnailStatusText = thumbnailProgress.phase === "priority"
    ? "Priorizando miniaturas visíveis…"
    : thumbnailProgress.phase === "background"
      ? `Preparando miniaturas ${thumbnailProgress.loaded}/${thumbnailProgress.total}`
      : thumbnailProgress.phase === "complete" && thumbnailProgress.total > 0
        ? thumbnailProgress.loaded === thumbnailProgress.total
          ? `Miniaturas prontas ${thumbnailProgress.loaded}/${thumbnailProgress.total}`
          : `Miniaturas carregadas ${thumbnailProgress.loaded}/${thumbnailProgress.total}`
        : "";

  return <>
    <section className="metrics production-metrics" aria-label="Indicadores operacionais do Kanban">
      {metricCards.map((metric) => {
        const selected = activeMetric === metric.key
          || (metric.key === "active" && !activeMetric && activeFilterCount === 0 && !search.trim());
        return <button
          type="button"
          key={metric.key}
          className={`production-metric-card ${selected ? "active" : ""} ${metric.key === "late" || metric.key === "blocked" ? "critical" : ""}`}
          aria-pressed={selected}
          onClick={() => onMetricSelect(metric.key)}
        >
          <span className={`metric-icon ${metric.tone}`}>{metric.icon}</span>
          <span className="production-metric-copy"><small>{metric.title}</small><strong>{metric.value}</strong><em>{metric.detail}</em></span>
          <span className="metric-filter-hint">{metric.key === "installation_today" ? "Abrir agenda" : metric.key === "active" ? "Ver todos" : "Filtrar"}</span>
        </button>;
      })}
    </section>
    <section className="metric-secondary-strip" aria-label="Indicadores complementares">
      <span><b>{activeOrderCounts.suborders}</b> subpedidos ativos</span>
      <span><b>{metricSummary.withoutResponsible}</b> sem responsável</span>
      <span><b>{metricSummary.withoutDate}</b> sem prazo</span>
      <span><b>{metricSummary.futureInstallations}</b> instalações futuras</span>
      <span className="metric-live-status">● Atualização em tempo real</span>
    </section>
    <section className="toolbar"><label className="search-field">⌕<input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar por OP, cliente ou serviço…" />{search && <button type="button" className="search-clear" aria-label="Limpar busca" onClick={() => onSearchChange("")}>×</button>}</label><button type="button" className={filtersOpen ? "active" : ""} onClick={onToggleFilters} aria-expanded={filtersOpen}>☷ Filtros {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button><button type="button" className="sort-button" onClick={onCycleSort} title="Clique para alterar a ordenação">↕ {sortLabels[sortMode]}</button><div className="kanban-display-toggle" role="group" aria-label="Densidade dos cartões"><button type="button" className={displayMode === "compact" ? "active" : ""} onClick={() => setDisplayMode("compact")}>Compacto</button><button type="button" className={displayMode === "detailed" ? "active" : ""} onClick={() => setDisplayMode("detailed")}>Detalhado</button></div>{thumbnailStatusText && <span className={`thumbnail-load-status ${thumbnailProgress.phase}`} aria-live="polite">{thumbnailProgress.phase !== "complete" && <i />} {thumbnailStatusText}</span>}<span>{loading ? "Atualizando…" : `${filtered.length} pedido${filtered.length === 1 ? "" : "s"} encontrado${filtered.length === 1 ? "" : "s"}`}</span></section>
    {filtersOpen && <>
      <button type="button" className="filters-backdrop" aria-label="Fechar filtros" onClick={onCloseFilters} />
      <section className="filters-panel" aria-label="Filtros do Kanban">
        <div className="filters-panel-head"><div><b>Filtros</b><span>Refine os pedidos exibidos no Kanban.</span></div><button type="button" aria-label="Fechar filtros" onClick={onCloseFilters}>×</button></div>
        <label>Setor<select value={sectorFilter} onChange={(event) => onSectorFilterChange(event.target.value)}><option value="all">Todos os setores</option>{activeSectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as "all" | DbStatus)}><option value="all">Todos os status</option><option value="waiting">Aguardando</option><option value="in_progress">Em andamento</option><option value="in_transport">Em transporte</option><option value="waiting_client">Aguardando cliente</option></select></label>
        <label>Prioridade<select value={priorityFilter} onChange={(event) => onPriorityFilterChange(event.target.value as "all" | Priority)}><option value="all">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select></label>
        <label>Responsável<select value={responsibleFilter} onChange={(event) => onResponsibleFilterChange(event.target.value)}><option value="all">Todos os responsáveis</option><option value={UNASSIGNED_RESPONSIBLE_FILTER}>Sem responsável</option>{consultantOptions.map((consultant) => <option key={consultant} value={normalizedResponsibleName(consultant)}>{consultant}</option>)}</select></label>
        <label>Prazo de produção<select value={deadlineFilter} onChange={(event) => onDeadlineFilterChange(event.target.value as DeadlineFilter)}><option value="all">Todos os prazos</option><option value="late">Atrasados</option><option value="today">Produção para hoje</option><option value="next7">Próximos 7 dias</option></select></label>
        <button type="button" className="clear-filters" onClick={onClearFilters} disabled={!activeFilterCount && !search}>Limpar busca e filtros</button>
        <button className="apply-filters" type="button" onClick={onCloseFilters}>Aplicar filtros</button>
      </section>
    </>}
    {visibleSectors.length > 0 && <nav className="kanban-mobile-nav" aria-label="Navegação entre setores do Kanban">
      <button type="button" className="kanban-sector-arrow" aria-label="Setor anterior" onClick={() => onScrollToSector(activeKanbanSectorIndex - 1)} disabled={activeKanbanSectorIndex <= 0}>‹</button>
      <div className="kanban-sector-current" aria-live="polite"><small>SETOR {Math.min(activeKanbanSectorIndex + 1, visibleSectors.length)} DE {visibleSectors.length}</small><strong>{visibleSectors[activeKanbanSectorIndex]?.name || visibleSectors[0]?.name}</strong><span>Deslize para os lados ou use as setas.</span></div>
      <button type="button" className="kanban-sector-arrow" aria-label="Próximo setor" onClick={() => onScrollToSector(activeKanbanSectorIndex + 1)} disabled={activeKanbanSectorIndex >= visibleSectors.length - 1}>›</button>
      {visibleSectors.length > 8 ? <select className="kanban-sector-select" value={activeKanbanSectorIndex} onChange={(event) => onScrollToSector(Number(event.target.value))} aria-label="Selecionar setor">{visibleSectors.map((sector, index) => <option key={sector.id} value={index}>{sector.name}</option>)}</select> : <div className="kanban-sector-dots" role="tablist" aria-label="Setores disponíveis">{visibleSectors.map((sector, index) => <button type="button" key={sector.id} role="tab" aria-selected={index === activeKanbanSectorIndex} aria-label={`Ir para ${sector.name}`} className={index === activeKanbanSectorIndex ? "active" : ""} onClick={() => onScrollToSector(index)} />)}</div>}
    </nav>}
    <div className="board-top-scroll" ref={topScrollRef} onScroll={onTopScroll} aria-label="Rolagem horizontal superior do Kanban"><div className="board-top-scroll-spacer" style={{ width: `${boardScrollWidth}px` }} /></div>
    <section className="board" ref={boardRef} onScroll={onBoardScroll}>
      {visibleSectors.map((sector, sectorIndex) => {
        const sectorCount = sectorCounts.get(sector.id) || 0;
        const overWip = Boolean(sector.wip_limit && sectorCount > sector.wip_limit);
        return <article className={`sector ${displayMode === "compact" ? "compact-mode" : "detailed-mode"} ${overWip ? "over-wip" : ""}`} key={sector.id} data-sector-index={sectorIndex} data-sector-id={sector.id}>
          <div className="sector-head"><div><i>{String(sector.position).padStart(2, "0")}</i><h2>{sector.name}</h2></div><span title={sector.wip_limit ? `Limite recomendado: ${sector.wip_limit}` : "Sem limite configurado"}>{sectorCount}{sector.wip_limit ? `/${sector.wip_limit}` : ""}</span></div>
          <div className={`sector-body ${sector.uses_status === false ? "sector-without-status" : ""}`}>{(sector.uses_status === false ? ["Aguardando" as UiStatus] : statusesForSector(sector.name)).map((status) => {
            const laneOrders = groupedOrders.get(`${sector.id}:${status}`) || [];
            const manualMoveAllowed = sector.allow_manual_move !== false;
            return <div className={`lane ${sector.uses_status === false ? "lane-without-status" : ""} ${!manualMoveAllowed ? "manual-move-disabled" : ""} ${dragOverLane === `${sector.id}:${status}` ? "drag-over" : ""}`} key={status} aria-label={`${sector.name}${sector.uses_status === false ? "" : ` — ${status}`}`} onDragOver={(event) => { if (!canOperate || !manualMoveAllowed) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDragOverLane(`${sector.id}:${status}`); }} onDrop={() => { if (manualMoveAllowed) onDrop(sector.id, status); }}>
              {sector.uses_status !== false && <div className="lane-head"><b><i className={`dot ${statusDotClass(status)}`} />{status}</b><span>{laneOrders.length}</span></div>}
              {!manualMoveAllowed && <div className="lane-manual-move-note">Movimentação manual desativada</div>}
              {groupLaneOrdersAsStacks(`${sector.id}:${status}`, laneOrders).map((stack) => {
                const sharedOrderCardProps: Omit<KanbanOrderCardProps, "order" | "commentCount" | "stackedChild"> = {
                  canOperate, canFinalize, isAdmin, busyOrderId, cardImageUrl, onDragStart, onDragEnd, onOpenOrder,
                  onDeleteOrder, onPreview, onThumbnailVisible, onMoveOrder, onChangeStatus, onFinishOrder,
                  showStatusAction: sector.uses_status !== false,
                };
                if (stack.orders.length === 1) {
                  const order = stack.orders[0];
                  return <KanbanOrderCard key={order.id} order={order} commentCount={commentCounts[order.id] || 0} {...sharedOrderCardProps} />;
                }
                return <KanbanOrderStack
                  key={stack.key}
                  stack={stack}
                  expanded={expandedStacks.has(stack.key)}
                  onToggle={() => toggleStack(stack.key)}
                  orderCardProps={sharedOrderCardProps}
                  commentCounts={commentCounts}
                  onOpenStackViewer={openStackViewer}
                  onOpenStackAction={openStackAction}
                />;
              })}
              {!laneOrders.length && <div className="empty-lane">{canOperate ? "Solte um pedido aqui" : "Nenhum pedido"}</div>}
            </div>;
          })}</div>
        </article>;
      })}
      {!loading && hasActiveSearch && !filtered.length && <div className="search-empty"><span>⌕</span><b>Nenhum pedido encontrado</b><p>Tente alterar o termo pesquisado ou limpar os filtros.</p><button type="button" onClick={onClearFilters}>Limpar busca e filtros</button></div>}
      {!loading && !activeSectors.length && !error && <div className="empty-board">Nenhum setor cadastrado.</div>}
    </section>

    {stackViewer && <div className="overlay quick-action-overlay" onMouseDown={() => setStackViewer(null)}>
      <section className="modal quick-action-sheet kanban-stack-viewer-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" aria-label="Fechar" onClick={() => setStackViewer(null)}>×</button>
        <p className="eyebrow">{stackViewer.tab === "history" ? "HISTÓRICOS DA PILHA" : "COMENTÁRIOS DA PILHA"}</p>
        <h2>OP {stackViewer.parentOp}</h2>
        <p>Selecione o subpedido que deseja visualizar.</p>
        <div className="kanban-stack-viewer-list">
          {stackViewer.orders.map((order) => <button type="button" key={order.id} onClick={() => { setStackViewer(null); onOpenOrder(order, stackViewer.tab); }}>
            <AppIcon name={stackViewer.tab === "history" ? "history" : "comments"} />
            <span><b>OP {order.op_number}</b><small>{order.description}</small></span>
            {stackViewer.tab === "comments" && Boolean(commentCounts[order.id]) && <em>{commentCounts[order.id]}</em>}
            <AppIcon name="chevronRight" />
          </button>)}
        </div>
      </section>
    </div>}

    {stackAction && <div className="overlay quick-action-overlay" onMouseDown={() => { if (!stackActionBusy) setStackAction(null); }}>
      <section className="modal quick-action-sheet kanban-stack-action-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" aria-label="Fechar" disabled={stackActionBusy} onClick={() => setStackAction(null)}>×</button>
        <p className="eyebrow">{stackAction.mode === "move" ? "MOVER PILHA" : stackAction.mode === "status" ? "ALTERAR STATUS DA PILHA" : "FINALIZAR PILHA"}</p>
        <h2>OP {stackAction.parentOp}</h2>
        <p>{stackAction.selectedIds.size} de {stackAction.orders.length} pedidos serão alterados.</p>

        <div className="kanban-stack-selection-toolbar">
          <button type="button" disabled={stackActionBusy} onClick={selectAllStackActionOrders}>Selecionar todos</button>
          <button type="button" disabled={stackActionBusy} onClick={clearStackActionOrders}>Limpar seleção</button>
        </div>

        <div className="kanban-stack-selection-list" aria-label="Pedidos que receberão a alteração">
          {stackAction.orders.map((order) => <label key={order.id} className={stackAction.selectedIds.has(order.id) ? "selected" : ""}>
            <input type="checkbox" checked={stackAction.selectedIds.has(order.id)} disabled={stackActionBusy} onChange={() => toggleStackActionOrder(order.id)} />
            <span><b>OP {order.op_number}</b><small>{order.description}</small></span>
            <em>{stackStatusLabel(order.status)}</em>
          </label>)}
        </div>

        {stackAction.mode === "move" && <div className="quick-action-options kanban-stack-target-options">
          {activeSectors.map((sector) => {
            const currentSector = stackAction.orders.every((order) => order.sector_id === sector.id);
            return <button type="button" key={sector.id} className={currentSector ? "current" : ""} disabled={stackActionBusy || !stackAction.selectedIds.size || currentSector} onClick={() => void runStackMove(sector.id)}>
              <AppIcon name="move" /><span>{sector.name}</span>{currentSector && <small>Atual</small>}
            </button>;
          })}
        </div>}

        {stackAction.mode === "status" && <div className="quick-action-options status-options kanban-stack-target-options">
          {STACK_STATUS_OPTIONS.filter((option) => {
            if (option.value === "paused" || option.value === "waiting") return true;
            const sectorName = activeSectors.find((sector) => sector.id === stackAction.orders[0]?.sector_id)?.name || "";
            return isPcpSectorName(sectorName)
              ? option.value === "waiting_client" || option.value === "in_transport"
              : option.value === "in_progress";
          }).map((option) => {
            const currentStatus = stackAction.orders.every((order) => order.status === option.value);
            return <button type="button" key={option.value} className={currentStatus ? "current" : ""} disabled={stackActionBusy || !stackAction.selectedIds.size || currentStatus} onClick={() => void runStackStatus(option.value)}>
              <AppIcon name={option.value === "paused" ? "pause" : "status"} /><span>{option.label}</span>{currentStatus && <small>Atual</small>}
            </button>;
          })}
        </div>}

        {stackAction.mode === "finish" && <div className="kanban-stack-finish-panel">
          <div><AppIcon name="alert" /><span><b>Finalização coletiva</b><small>Os pedidos selecionados sairão do Kanban ativo e irão para Concluídos.</small></span></div>
          <button type="button" className="primary" disabled={stackActionBusy || !stackAction.selectedIds.size} onClick={() => void runStackFinish()}><AppIcon name="check" /> Finalizar {stackAction.selectedIds.size} pedido{stackAction.selectedIds.size === 1 ? "" : "s"}</button>
        </div>}

        {stackActionBusy && <div className="quick-action-saving">Aplicando alteração aos pedidos selecionados…</div>}
      </section>
    </div>}
  </>;
}
