"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Order, Sector, UiStatus } from "@/lib/pcp-types";
import { statusesForSector } from "@/lib/pcp-config";

function orderUiStatus(order: Order): UiStatus {
  if (order.status === "in_progress") return "Em andamento";
  if (order.status === "in_transport") return "Em transporte";
  if (order.status === "waiting_client") return "Aguardando cliente";
  return "Aguardando";
}

export function MoveOrderModal({ order, sectors, busy, onClose, onMove }: {
  order: Order;
  sectors: Sector[];
  busy: boolean;
  onClose: () => void;
  onMove: (sectorId: string, status: UiStatus) => Promise<void>;
}) {
  const [sectorId, setSectorId] = useState(order.sector_id);
  const selectedSector = useMemo(() => sectors.find((sector) => sector.id === sectorId) || sectors[0], [sectors, sectorId]);
  const availableStatuses = useMemo(() => statusesForSector(selectedSector?.name), [selectedSector?.name]);
  const initialStatus = orderUiStatus(order);
  const [status, setStatus] = useState<UiStatus>(availableStatuses.includes(initialStatus) ? initialStatus : availableStatuses[0]);

  function changeSector(nextSectorId: string) {
    const nextSector = sectors.find((sector) => sector.id === nextSectorId);
    const nextStatuses = statusesForSector(nextSector?.name);
    setSectorId(nextSectorId);
    setStatus((current) => nextStatuses.includes(current) ? current : nextStatuses[0]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectorId || !status) return;
    await onMove(sectorId, status);
  }

  return <div className="overlay move-order-overlay" onMouseDown={() => { if (!busy) onClose(); }}>
    <form className="modal move-order-modal" onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button>
      <p className="eyebrow">MOVIMENTO RÁPIDO</p>
      <h2>Mover OP {order.op_number}</h2>
      <p>Selecione o setor e o status. Esta opção é indicada para celular e tablet.</p>
      <label>Setor
        <select value={sectorId} required onChange={(event) => changeSector(event.target.value)}>
          {sectors.map((sector) => <option value={sector.id} key={sector.id}>{sector.name}</option>)}
        </select>
      </label>
      <label>Status
        <select value={status} onChange={(event) => setStatus(event.target.value as UiStatus)}>
          {availableStatuses.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
      <div className="modal-actions">
        <button type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Movendo…" : "Mover pedido"}</button>
      </div>
    </form>
  </div>;
}
