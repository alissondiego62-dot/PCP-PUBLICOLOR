"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { DbStatus, DeadlineFilter, Order, Priority, Sector, SortMode, UiStatus } from "@/lib/pcp-types";
import { priorityLabel, statusDotClass, statusesForSector, statusToDb } from "@/lib/pcp-config";
import { dueLabel, initials, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import { driveThumbnailFileId } from "@/lib/order-thumbnail";

const UNASSIGNED_RESPONSIBLE_FILTER = "__unassigned__";
const sortLabels: Record<SortMode, string> = { newest: "Mais recentes", oldest: "Mais antigos", delivery: "Prazo" };

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
  onFinishOrder: (order: Order) => void;
};

export function KanbanView(props: KanbanViewProps) {
  const {
    activeOrderCounts, activeOrders, installationOrders, filtered, activeSectors, visibleSectors,
    search, filtersOpen, activeFilterCount, activeMetric, thumbnailProgress, sortMode, loading, sectorFilter, statusFilter,
    priorityFilter, responsibleFilter, deadlineFilter, consultantOptions, activeKanbanSectorIndex,
    boardScrollWidth, boardRef, topScrollRef, dragOverLane, canOperate, isAdmin, busyOrderId,
    commentCounts, hasActiveSearch, error, cardImageUrl, onSearchChange, onToggleFilters,
    onCloseFilters, onCycleSort, onSectorFilterChange, onStatusFilterChange, onPriorityFilterChange,
    onResponsibleFilterChange, onDeadlineFilterChange, onMetricSelect, onClearFilters, onScrollToSector,
    onTopScroll, onBoardScroll, onDragStart, onDragEnd, onDragOverLane, onDrop, onOpenOrder,
    onDeleteOrder, onPreview, onThumbnailVisible, onMoveOrder, onFinishOrder,
  } = props;
  const [displayMode, setDisplayMode] = useState<"compact" | "detailed">(() => {
    if (typeof window === "undefined") return "detailed";
    return window.localStorage.getItem("pcp-kanban-display-mode") === "compact" ? "compact" : "detailed";
  });

  useEffect(() => { window.localStorage.setItem("pcp-kanban-display-mode", displayMode); }, [displayMode]);

  const groupedOrders = useMemo(() => {
    const groups = new Map<string, Order[]>();
    filtered.forEach((order) => {
      const statuses = order.status === "paused" ? ["Aguardando"] : Object.entries(statusToDb).filter(([, value]) => value === order.status).map(([label]) => label);
      const status = statuses[0] || "Aguardando";
      const key = `${order.sector_id}:${status}`;
      const bucket = groups.get(key) || [];
      bucket.push(order);
      groups.set(key, bucket);
    });
    return groups;
  }, [filtered]);

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
          <div className="sector-body">{statusesForSector(sector.name).map((status) => {
            const laneOrders = groupedOrders.get(`${sector.id}:${status}`) || [];
            return <div className={`lane ${dragOverLane === `${sector.id}:${status}` ? "drag-over" : ""}`} key={status} aria-label={`${sector.name} — ${status}`} onDragOver={(event) => { if (!canOperate) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDragOverLane(`${sector.id}:${status}`); }} onDrop={() => onDrop(sector.id, status)}>
              <div className="lane-head"><b><i className={`dot ${statusDotClass(status)}`} />{status}</b><span>{laneOrders.length}</span></div>
              {laneOrders.map((order) => <div draggable={canOperate && busyOrderId !== order.id} aria-disabled={!canOperate} onDragStart={(event) => { if (!canOperate) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; onDragStart(order.id); }} onDragEnd={onDragEnd} onClick={() => onOpenOrder(order, "history")} className={`order ${priorityLabel[order.priority].toLowerCase()} ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-order" : ""} ${order.blocked || order.status === "paused" ? "blocked-order" : ""}`} key={order.id}>
                {isAdmin && <button type="button" className="delete-order-button" aria-label={`Apagar OP ${order.op_number}`} title="Apagar pedido" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDeleteOrder(order); }}>⌫</button>}
                <OrderThumbnail order={order} url={cardImageUrl(order)} onVisible={onThumbnailVisible} onPreview={onPreview} />
                <div className="order-top"><b>OP {order.op_number}</b><div className="order-badges"><span className={`tag ${priorityLabel[order.priority].toLowerCase()}`}>{priorityLabel[order.priority]}</span>{(order.blocked || order.status === "paused") && <span className="tag blocked">{order.status === "paused" ? "Pausado" : "Bloqueado"}</span>}</div></div>
                <h3>{order.client_name}</h3><p className="order-service">{order.description}</p>
                <div className="order-operational-meta"><span>{sectorAgeLabel(order)}</span>{sectorAgeLabel(order).startsWith("2d") || Number(sectorAgeLabel(order).match(/^(\d+)d/)?.[1] || 0) >= 2 ? <b>Sem movimentação</b> : null}</div>
                <div className="order-responsible" title={`Responsável: ${orderResponsibleName(order)}`}><span>{initials(orderResponsibleName(order))}</span><div><small>RESPONSÁVEL</small><b>{orderResponsibleName(order)}</b></div></div>
                <div className={`due order-deadlines ${dueLabel(order.delivery_date).startsWith("Atrasado") ? "late" : ""}`}><span>Inst./entrega: <b>{orderTargetDateLabel(order)}</b></span><small>Produção: {dueLabel(order.delivery_date)}</small></div>
                {canOperate && <div className="workflow-actions"><button type="button" className="move-order-button" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onMoveOrder(order); }}>↪ Mover</button><button type="button" className="finish-order" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onFinishOrder(order); }}>✓ Finalizar</button></div>}
                <footer className="card-actions"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenOrder(order, "history"); }}>↺ Histórico</button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenOrder(order, "comments"); }}>◌ {commentCounts[order.id] || 0} Comentários</button></footer>
              </div>)}
              {!laneOrders.length && <div className="empty-lane">{canOperate ? "Solte um pedido aqui" : "Nenhum pedido"}</div>}
            </div>;
          })}</div>
        </article>;
      })}
      {!loading && hasActiveSearch && !filtered.length && <div className="search-empty"><span>⌕</span><b>Nenhum pedido encontrado</b><p>Tente alterar o termo pesquisado ou limpar os filtros.</p><button type="button" onClick={onClearFilters}>Limpar busca e filtros</button></div>}
      {!loading && !activeSectors.length && !error && <div className="empty-board">Nenhum setor cadastrado.</div>}
    </section>
  </>;
}
