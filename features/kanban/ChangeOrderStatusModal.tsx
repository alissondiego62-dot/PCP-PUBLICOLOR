"use client";

import type { DbStatus, Order } from "@/lib/pcp-types";
import { AppIcon } from "@/components/ui/AppIcon";
import { isPcpSectorName } from "@/lib/pcp-config";

const options: Array<{ value: DbStatus; label: string }> = [
  { value: "waiting", label: "Aguardando" },
  { value: "in_progress", label: "Em andamento" },
  { value: "waiting_client", label: "Aguardando cliente" },
  { value: "in_transport", label: "Em transporte" },
  { value: "paused", label: "Pausado" },
];

export function ChangeOrderStatusModal({order,sectorName,busy,onClose,onChange}:{order:Order;sectorName:string;busy:boolean;onClose:()=>void;onChange:(status:DbStatus)=>Promise<void>}) {
  const allowedOptions = options.filter((option) => {
    if (option.value === "paused" || option.value === "waiting") return true;
    return isPcpSectorName(sectorName)
      ? option.value === "waiting_client" || option.value === "in_transport"
      : option.value === "in_progress";
  });
  return <div className="overlay quick-action-overlay" onMouseDown={()=>{if(!busy)onClose();}}><section className="modal quick-action-sheet" onMouseDown={(event)=>event.stopPropagation()}><button type="button" className="close" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button><p className="eyebrow">ALTERAR STATUS</p><h2>OP {order.op_number}</h2><p>Selecione o novo status. A alteração será salva imediatamente.</p><div className="quick-action-options status-options">{allowedOptions.map((option)=><button type="button" key={option.value} className={option.value===order.status?"current":""} disabled={busy||option.value===order.status} onClick={()=>void onChange(option.value)}><AppIcon name={option.value==="paused"?"pause":"status"}/><span>{option.label}</span>{option.value===order.status&&<small>Atual</small>}</button>)}</div>{busy&&<div className="quick-action-saving">Salvando alteração…</div>}</section></div>;
}
