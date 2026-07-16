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
      <p className="eyebrow">MOVER SETOR</p><h2>OP {order.op_number}</h2><p>Selecione o setor de destino. A alteração será salva imediatamente.</p>
      <div className="quick-action-options">{sectors.map((sector) => <button type="button" key={sector.id} className={sector.id===order.sector_id?"current":""} disabled={busy||sector.id===order.sector_id} onClick={()=>void onMove(sector.id)}><AppIcon name="move"/><span>{sector.name}</span>{sector.id===order.sector_id&&<small>Atual</small>}</button>)}</div>
      {busy&&<div className="quick-action-saving">Salvando alteração…</div>}
    </section>
  </div>;
}
