"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  dateOnlyLabel,
  dueLabel,
  installationDateTimeLabel,
  targetDateForOrder,
  toInstallationInputValue,
} from "@/lib/pcp-formatters";
import type { DetailTab, Order, Sector } from "@/lib/pcp-types";

type InstallationAgendaViewProps = {
  orders: Order[];
  sectors: Sector[];
  installationSector: Sector | null;
  canOperate: boolean;
  busyOrderId: string | null;
  onOpenOrder: (order: Order, tab: DetailTab) => void;
  onSchedule: (event: FormEvent<HTMLFormElement>, order: Order) => void;
};

const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function currentManausDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthKeyFromDateKey(value: string) {
  return value.slice(0, 7);
}

function monthDate(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function moveMonth(value: string, amount: number) {
  const date = monthDate(value);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return dateKey(date).slice(0, 7);
}

function monthLabel(value: string) {
  return monthDate(value).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function calendarDays(value: string) {
  const firstDay = monthDate(value);
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(gridStart.getUTCDate() - firstDay.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + index);
    return {
      key: dateKey(day),
      dayNumber: day.getUTCDate(),
      inMonth: day.getUTCMonth() === firstDay.getUTCMonth(),
    };
  });
}

function targetDate(order: Order) {
  return targetDateForOrder(order.installation_scheduled_at, order.delivery_date);
}

export function InstallationAgendaView({
  orders,
  sectors,
  installationSector,
  canOperate,
  busyOrderId,
  onOpenOrder,
  onSchedule,
}: InstallationAgendaViewProps) {
  const today = currentManausDateKey();
  const initialMonth = monthKeyFromDateKey(today);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(today);

  const ordersByDate = useMemo(() => {
    const grouped = new Map<string, Order[]>();
    orders.forEach((order) => {
      const key = targetDate(order);
      const entries = grouped.get(key) || [];
      entries.push(order);
      grouped.set(key, entries);
    });
    grouped.forEach((entries) => {
      entries.sort((first, second) => {
        const firstTime = first.installation_scheduled_at
          ? new Date(first.installation_scheduled_at).getTime()
          : 0;
        const secondTime = second.installation_scheduled_at
          ? new Date(second.installation_scheduled_at).getTime()
          : 0;
        return firstTime - secondTime || first.op_number.localeCompare(second.op_number, "pt-BR", { numeric: true });
      });
    });
    return grouped;
  }, [orders]);

  const monthOrderDates = useMemo(
    () => Array.from(ordersByDate.keys()).filter((key) => monthKeyFromDateKey(key) === visibleMonth).sort(),
    [ordersByDate, visibleMonth],
  );

  useEffect(() => {
    if (monthKeyFromDateKey(selectedDate) === visibleMonth) return;
    setSelectedDate(monthOrderDates[0] || `${visibleMonth}-01`);
  }, [monthOrderDates, selectedDate, visibleMonth]);

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth]);
  const selectedOrders = ordersByDate.get(selectedDate) || [];
  const inInstallationCount = orders.filter(
    (order) => order.sector_id === installationSector?.id,
  ).length;
  const scheduledCount = orders.filter((order) => order.installation_scheduled_at).length;
  const monthOrderCount = monthOrderDates.reduce(
    (total, key) => total + (ordersByDate.get(key)?.length || 0),
    0,
  );

  function goToMonth(month: string) {
    setVisibleMonth(month);
    const firstDate = Array.from(ordersByDate.keys())
      .filter((key) => monthKeyFromDateKey(key) === month)
      .sort()[0];
    setSelectedDate(firstDate || `${month}-01`);
  }

  function goToToday() {
    const month = monthKeyFromDateKey(today);
    setVisibleMonth(month);
    setSelectedDate(today);
  }

  return (
    <section className="installation-agenda installation-calendar-view">
      <div className="agenda-summary agenda-summary-responsive">
        <article>
          <small>NO SETOR INSTALAÇÃO</small>
          <strong>{inInstallationCount}</strong>
        </article>
        <article>
          <small>COM DATA DEFINIDA</small>
          <strong>{scheduledCount}</strong>
        </article>
        <article>
          <small>NO MÊS EXIBIDO</small>
          <strong>{monthOrderCount}</strong>
        </article>
      </div>

      <div className="agenda-calendar-layout">
        <section className="agenda-calendar-panel" aria-label="Calendário de instalações e entregas">
          <header className="agenda-calendar-toolbar">
            <div>
              <small>AGENDA DE INSTALAÇÃO E ENTREGA</small>
              <h2>{monthLabel(visibleMonth)}</h2>
            </div>
            <div className="agenda-calendar-navigation">
              <button type="button" onClick={() => goToMonth(moveMonth(visibleMonth, -1))} aria-label="Mês anterior">‹</button>
              <button type="button" className="today-button" onClick={goToToday}>Hoje</button>
              <button type="button" onClick={() => goToMonth(moveMonth(visibleMonth, 1))} aria-label="Próximo mês">›</button>
            </div>
          </header>

          <div className="agenda-weekdays" aria-hidden="true">
            {WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="agenda-month-grid">
            {days.map((day) => {
              const dayOrders = ordersByDate.get(day.key) || [];
              const isSelected = day.key === selectedDate;
              const isToday = day.key === today;
              return (
                <button
                  type="button"
                  key={day.key}
                  className={`${day.inMonth ? "in-month" : "outside-month"} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${dayOrders.length ? "has-orders" : ""}`}
                  onClick={() => {
                    setSelectedDate(day.key);
                    if (!day.inMonth) setVisibleMonth(monthKeyFromDateKey(day.key));
                  }}
                  aria-label={`${dateOnlyLabel(day.key)}: ${dayOrders.length} pedido(s)`}
                  aria-pressed={isSelected}
                >
                  <span className="calendar-day-number">{day.dayNumber}</span>
                  {dayOrders.length > 0 && (
                    <span className="calendar-order-marker">
                      <i />
                      <b>{dayOrders.length}</b>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="agenda-selected-day" aria-live="polite">
          <header>
            <div>
              <small>PEDIDOS DO DIA</small>
              <h2>{dateOnlyLabel(selectedDate)}</h2>
            </div>
            <span>{selectedOrders.length} pedido(s)</span>
          </header>

          {selectedOrders.length ? (
            <div className="agenda-day-orders">
              {selectedOrders.map((order) => {
                const currentSectorName =
                  sectors.find((sector) => sector.id === order.sector_id)?.name ||
                  "Setor não identificado";
                const alreadyInInstallation = order.sector_id === installationSector?.id;

                return (
                  <article className="agenda-day-order-card" key={order.id}>
                    <div className="agenda-day-order-heading">
                      <div>
                        <b>OP {order.op_number}</b>
                        <h3>{order.client_name}</h3>
                        <p>{order.description}</p>
                      </div>
                      <time>
                        {order.installation_time_confirmed && order.installation_scheduled_at
                          ? new Date(order.installation_scheduled_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "America/Manaus",
                            })
                          : "Horário a definir"}
                      </time>
                    </div>

                    <div className="agenda-order-details">
                      <span>
                        <small>PRODUÇÃO</small>
                        <b className={dueLabel(order.delivery_date).startsWith("Atrasado") ? "late" : ""}>
                          {dueLabel(order.delivery_date)}
                        </b>
                      </span>
                      <span>
                        <small>SETOR ATUAL</small>
                        <b>{alreadyInInstallation ? "INSTALAÇÃO" : currentSectorName}</b>
                      </span>
                      <span>
                        <small>RESPONSÁVEL</small>
                        <b>{order.consultant_name || "Não definido"}</b>
                      </span>
                      <span>
                        <small>EQUIPE</small>
                        <b>{order.installation_team || "Não definida"}</b>
                      </span>
                    </div>

                    {canOperate ? (
                      <form className="agenda-reschedule-form" onSubmit={(event) => onSchedule(event, order)}>
                        <label>
                          Data e hora
                          <input
                            key={`${order.id}:${order.installation_scheduled_at || "new"}`}
                            type="datetime-local"
                            name="scheduled_at"
                            defaultValue={toInstallationInputValue(order.installation_scheduled_at) || `${targetDate(order)}T08:00`}
                            required
                          />
                        </label>
                        <button className="primary" disabled={busyOrderId === order.id}>
                          {busyOrderId === order.id ? "Salvando…" : order.installation_time_confirmed ? "Reagendar" : "Definir horário"}
                        </button>
                      </form>
                    ) : (
                      <p className="agenda-readonly-date">
                        {order.installation_time_confirmed && order.installation_scheduled_at
                          ? installationDateTimeLabel(order.installation_scheduled_at)
                          : `Data prevista: ${dateOnlyLabel(targetDate(order))} · horário não definido`}
                      </p>
                    )}

                    <button type="button" className="agenda-open-order" onClick={() => onOpenOrder(order, "installation")}>
                      Abrir pedido
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="agenda-day-empty">
              <span>○</span>
              <b>Nenhuma instalação ou entrega neste dia</b>
              <p>Selecione outro dia marcado no calendário ou altere o mês.</p>
            </div>
          )}
        </section>
      </div>

      {!installationSector && (
        <div className="agenda-sector-warning">
          O setor INSTALAÇÃO não está ativo. O calendário continua exibindo as datas dos pedidos, mas o status do setor não poderá ser identificado.
        </div>
      )}
    </section>
  );
}
