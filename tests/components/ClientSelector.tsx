"use client";

import { useMemo, useState } from "react";
import type { Client } from "@/lib/pcp-types";

type Props = {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  onCreate: () => void;
  onEdit?: (client: Client) => void;
};

export function ClientSelector({ clients, value, onChange, onCreate, onEdit }: Props) {
  const [query, setQuery] = useState("");
  const selected = clients.find((client) => client.id === value) || null;
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return clients.slice(0, 8);
    return clients
      .filter((client) =>
        [client.name, client.trade_name, client.document, client.phone, client.whatsapp]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(term),
      )
      .slice(0, 8);
  }, [clients, query]);

  return (
    <div className="client-selector">
      {selected ? (
        <div className="client-selector-selected">
          <div>
            <small>CLIENTE SELECIONADO</small>
            <b>{selected.trade_name || selected.name}</b>
            <span>{selected.document || selected.whatsapp || selected.phone || "Cadastro sem documento"}</span>
          </div>
          <div className="client-selector-selected-actions">
            {onEdit && <button type="button" onClick={() => onEdit(selected)}>Editar cadastro</button>}
            <button type="button" onClick={() => onChange("")}>Trocar</button>
          </div>
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite nome, CPF/CNPJ ou telefone..."
            autoComplete="off"
          />
          <div className="client-selector-results">
            {filtered.map((client) => (
              <button key={client.id} type="button" onClick={() => onChange(client.id)}>
                <b>{client.trade_name || client.name}</b>
                <small>{client.document || client.whatsapp || client.phone || "Sem documento"}</small>
              </button>
            ))}
            {!filtered.length && <span>Nenhum cliente encontrado.</span>}
            <button type="button" className="client-selector-create" onClick={onCreate}>
              ＋ Cadastrar novo cliente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
