"use client";

import type { Order, Sector } from "@/lib/pcp-types";
import { AppIcon } from "@/components/ui/AppIcon";

export function MoveOrderModal({ order, sectors, busy, onClose, onMove }: {
  order: Order;
  sectors: Sector[];
  busy: boolean;
  onClose: () => void;
  onMove: (sectorId: string) => Promise<void>;
}) {
  return <div className="overlay quick-action-overlay" onMouseDown={() => { if (!busy) onClose(); }}>
    <section className="modal quick-action-sheet" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button>
      <p className="eyebrow">MOVER SETOR</p><h2>OP {order.op_number}</h2><p>Selecione o setor de destino. Instalação solicitará data e hora antes de concluir o movimento.</p>
      <div className="quick-action-options">{sectors.map((sector) => {
        const current = sector.id === order.sector_id;
        const manualBlocked = sector.allow_manual_move === false;
        return <button type="button" key={sector.id} className={current ? "current" : ""} disabled={busy || current || manualBlocked} onClick={() => void onMove(sector.id)} title={manualBlocked ? "Este setor não permite movimentação manual" : undefined}><AppIcon name={sector.special_type === "installation" ? "calendar" : "move"}/><span>{sector.name}</span>{current && <small>Atual</small>}{sector.special_type === "installation" && !current && <small>Exige agenda</small>}{manualBlocked && <small>Movimento bloqueado</small>}</button>;
      })}</div>
      {busy && <div className="quick-action-saving">Salvando alteração…</div>}
    </section>
  </div>;
}
