"use client";

import type { RefObject } from "react";
import type { DbStatus, DeadlineFilter, Order, Priority, Sector, SortMode, UiStatus } from "@/lib/pcp-types";
import { priorityLabel, statusDotClass, statusesForSector, statusToDb } from "@/lib/pcp-config";
import { dueLabel, initials, shortDateOnlyLabel, targetDateForOrder } from "@/lib/pcp-formatters";
import { driveThumbnailFileId } from "@/lib/order-thumbnail";

const UNASSIGNED_RESPONSIBLE_FILTER = "__unassigned__";
const sortLabels: Record<SortMode, string> = { newest: "Mais recentes", oldest: "Mais antigos", delivery: "Prazo" };

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
  onMoveOrder: (order: Order) => void;
  onFinishOrder: (order: Order) => void;
};

export function KanbanView(props: KanbanViewProps) {
  const {
    activeOrderCounts, activeOrders, installationOrders, filtered, activeSectors, visibleSectors,
    search, filtersOpen, activeFilterCount, sortMode, loading, sectorFilter, statusFilter,
    priorityFilter, responsibleFilter, deadlineFilter, consultantOptions, activeKanbanSectorIndex,
    boardScrollWidth, boardRef, topScrollRef, dragOverLane, canOperate, isAdmin, busyOrderId,
    commentCounts, hasActiveSearch, error, cardImageUrl, onSearchChange, onToggleFilters,
    onCloseFilters, onCycleSort, onSectorFilterChange, onStatusFilterChange, onPriorityFilterChange,
    onResponsibleFilterChange, onDeadlineFilterChange, onClearFilters, onScrollToSector,
    onTopScroll, onBoardScroll, onDragStart, onDragEnd, onDragOverLane, onDrop, onOpenOrder,
    onDeleteOrder, onPreview, onMoveOrder, onFinishOrder,
  } = props;

  return <>
    <section className="metrics">
      <article><span className="metric-icon blue">▦</span><div><small>Pedidos ativos</small><strong>{activeOrderCounts.orders}</strong><em>Ordens principais</em></div></article>
      <article><span className="metric-icon purple">≡</span><div><small>Subpedidos ativos</small><strong>{activeOrderCounts.suborders}</strong><em>Itens das OPs</em></div></article>
      <article><span className="metric-icon yellow">◷</span><div><small>Aguardando</small><strong>{activeOrders.filter((order) => order.status === "waiting").length}</strong><em>Em fila de produção</em></div></article>
      <article><span className="metric-icon red">!</span><div><small>Atrasados</small><strong>{activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado")).length}</strong><em className="danger">Requer atenção</em></div></article>
      <article><span className="metric-icon amber">⌑</span><div><small>Produção para hoje</small><strong>{activeOrders.filter((order) => dueLabel(order.delivery_date) === "Prazo hoje").length}</strong><em>Prioridade do dia</em></div></article>
      <article><span className="metric-icon green">↗</span><div><small>Em andamento</small><strong>{activeOrders.filter((order) => order.status === "in_progress").length}</strong><em>Produção ativa</em></div></article>
      <article><span className="metric-icon magenta">◉</span><div><small>Instalações/entregas</small><strong>{installationOrders.filter((order) => order.installation_scheduled_at).length}</strong><em>Com data definida</em></div></article>
    </section>
    <section className="toolbar"><label className="search-field">⌕<input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar por OP, cliente ou serviço…" />{search && <button type="button" className="search-clear" aria-label="Limpar busca" onClick={() => onSearchChange("")}>×</button>}</label><button type="button" className={filtersOpen ? "active" : ""} onClick={onToggleFilters} aria-expanded={filtersOpen}>☷ Filtros {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button><button type="button" className="sort-button" onClick={onCycleSort} title="Clique para alterar a ordenação">↕ {sortLabels[sortMode]}</button><span>{loading ? "Atualizando…" : `${filtered.length} pedido${filtered.length === 1 ? "" : "s"} encontrado${filtered.length === 1 ? "" : "s"}`}</span></section>
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
      <div className="kanban-sector-dots" role="tablist" aria-label="Setores disponíveis">{visibleSectors.map((sector, index) => <button type="button" key={sector.id} role="tab" aria-selected={index === activeKanbanSectorIndex} aria-label={`Ir para ${sector.name}`} className={index === activeKanbanSectorIndex ? "active" : ""} onClick={() => onScrollToSector(index)} />)}</div>
    </nav>}
    <div className="board-top-scroll" ref={topScrollRef} onScroll={onTopScroll} aria-label="Rolagem horizontal superior do Kanban"><div className="board-top-scroll-spacer" style={{ width: `${boardScrollWidth}px` }} /></div>
    <section className="board" ref={boardRef} onScroll={onBoardScroll}>
      {visibleSectors.map((sector, sectorIndex) => <article className="sector" key={sector.id} data-sector-index={sectorIndex} data-sector-id={sector.id}>
        <div className="sector-head"><div><i>{String(sector.position).padStart(2, "0")}</i><h2>{sector.name}</h2></div><span>{filtered.filter((order) => order.sector_id === sector.id).length}</span></div>
        <div className="sector-body">{statusesForSector(sector.name).map((status) => <div className={`lane ${dragOverLane === `${sector.id}:${status}` ? "drag-over" : ""}`} key={status} aria-label={`${sector.name} — ${status}`} onDragOver={(event) => { if (!canOperate) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; onDragOverLane(`${sector.id}:${status}`); }} onDrop={() => onDrop(sector.id, status)}>
          <div className="lane-head"><b><i className={`dot ${statusDotClass(status)}`} />{status}</b><span>{filtered.filter((order) => order.sector_id === sector.id && order.status === statusToDb[status]).length}</span></div>
          {filtered.filter((order) => order.sector_id === sector.id && order.status === statusToDb[status]).map((order) => <div draggable={canOperate && busyOrderId !== order.id} aria-disabled={!canOperate} onDragStart={(event) => { if (!canOperate) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; onDragStart(order.id); }} onDragEnd={onDragEnd} onClick={() => onOpenOrder(order, "history")} className={`order ${priorityLabel[order.priority].toLowerCase()} ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-order" : ""}`} key={order.id}>
            {isAdmin && <button type="button" className="delete-order-button" aria-label={`Apagar OP ${order.op_number}`} title="Apagar pedido" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onDeleteOrder(order); }}>⌫</button>}
            {cardImageUrl(order) ? <button type="button" className={`order-thumbnail ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-thumbnail" : ""}`} aria-label={`Ampliar miniatura da OP ${order.op_number}`} title="Clique para ampliar" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onPreview(order, cardImageUrl(order)); }}><img src={cardImageUrl(order)} alt={`Miniatura da OP ${order.op_number}`} width={160} height={160} loading="lazy" /></button> : <div className={`order-thumbnail ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-thumbnail" : ""}`}><div className="order-thumbnail-empty" aria-label="Pedido sem miniatura"><span>PNG</span><small>Sem miniatura</small></div></div>}
            <div className="order-top"><b>OP {order.op_number}</b><div className="order-badges"><span className={`tag ${priorityLabel[order.priority].toLowerCase()}`}>{priorityLabel[order.priority]}</span></div></div>
            <h3>{order.client_name}</h3><p className="order-service">{order.description}</p>
            <div className="order-responsible" title={`Responsável: ${orderResponsibleName(order)}`}><span>{initials(orderResponsibleName(order))}</span><div><small>RESPONSÁVEL</small><b>{orderResponsibleName(order)}</b></div></div>
            <div className={`due order-deadlines ${dueLabel(order.delivery_date).startsWith("Atrasado") ? "late" : ""}`}><span>Inst./entrega: <b>{orderTargetDateLabel(order)}</b></span><small>Produção: {dueLabel(order.delivery_date)}</small></div>
            {canOperate && <div className="workflow-actions"><button type="button" className="move-order-button" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onMoveOrder(order); }}>↪ Mover</button><button type="button" className="finish-order" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onFinishOrder(order); }}>✓ Finalizar</button></div>}
            <footer className="card-actions"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenOrder(order, "history"); }}>↺ Histórico</button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpenOrder(order, "comments"); }}>◌ {commentCounts[order.id] || 0} Comentários</button></footer>
          </div>)}
          {!filtered.some((order) => order.sector_id === sector.id && order.status === statusToDb[status]) && <div className="empty-lane">{canOperate ? "Solte um pedido aqui" : "Nenhum pedido"}</div>}
        </div>)}</div>
      </article>)}
      {!loading && hasActiveSearch && !filtered.length && <div className="search-empty"><span>⌕</span><b>Nenhum pedido encontrado</b><p>Tente alterar o termo pesquisado ou limpar os filtros.</p><button type="button" onClick={onClearFilters}>Limpar busca e filtros</button></div>}
      {!loading && !activeSectors.length && !error && <div className="empty-board">Nenhum setor cadastrado.</div>}
    </section>
  </>;
}
