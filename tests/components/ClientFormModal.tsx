"use client";

import type { FormEvent } from "react";
import type { Client } from "@/lib/pcp-types";

type Props = {
  open: boolean;
  busy: boolean;
  error: string;
  client?: Client | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ClientFormModal({ open, busy, error, client = null, onClose, onSubmit }: Props) {
  if (!open) return null;
  const editing = Boolean(client);

  return (
    <div className="overlay" onMouseDown={() => !busy && onClose()}>
      <div className="modal client-form-modal" role="dialog" aria-modal="true" aria-labelledby="client-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" type="button" aria-label="Fechar cadastro de cliente" disabled={busy} onClick={onClose}>×</button>
        <p className="eyebrow">BASE DE CLIENTES</p>
        <h2 id="client-form-title">{editing ? "Editar cadastro do cliente" : "Cadastrar novo cliente"}</h2>
        <p>{editing ? "As alterações serão refletidas nos pedidos vinculados a este cliente." : "O cliente será criado e poderá ser selecionado imediatamente no pedido."}</p>
        {error && <div className="auth-error">{error}</div>}
        <form key={client?.id || "new-client"} onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="wide">Nome ou razão social<input name="name" defaultValue={client?.name || ""} required /></label>
            <label>Nome fantasia<input name="trade_name" defaultValue={client?.trade_name || ""} /></label>
            <label>CPF ou CNPJ<input name="document" defaultValue={client?.document || ""} /></label>
            <label>Telefone<input name="phone" defaultValue={client?.phone || ""} /></label>
            <label>WhatsApp<input name="whatsapp" defaultValue={client?.whatsapp || ""} /></label>
            <label>E-mail<input name="email" type="email" defaultValue={client?.email || ""} /></label>
            <label>Contato responsável<input name="contact_name" defaultValue={client?.contact_name || ""} /></label>
            <label className="wide">Endereço<input name="address" defaultValue={client?.address || ""} /></label>
            <label>Bairro<input name="district" defaultValue={client?.district || ""} /></label>
            <label>Cidade<input name="city" defaultValue={client?.city || "Boa Vista"} /></label>
            <label>Estado<input name="state" defaultValue={client?.state || "RR"} maxLength={2} /></label>
            <label className="wide">Observações<textarea name="notes" defaultValue={client?.notes || ""} /></label>
            {editing && <label className="client-active-field"><input name="active" type="checkbox" defaultChecked={client?.active !== false} /> Cliente ativo para novos pedidos</label>}
          </div>
          <div className="actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar cliente"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
