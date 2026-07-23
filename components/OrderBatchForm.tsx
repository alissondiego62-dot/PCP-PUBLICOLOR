"use client";

import { FormEvent, useMemo, useState } from "react";
import { ClientSelector } from "@/components/ClientSelector";
import type { Client, Priority, Sector } from "@/lib/pcp-types";
import { automaticOrderNumberHint, requiresAutomaticOrderNumber } from "@/lib/order-number";

export type OrderDraftSubmissionItem = {
  opNumber: string;
  clientId: string;
  job: string;
  targetDate: string;
  priority: Priority;
  consultantName: string;
  sectorId: string;
  installationAddress: string;
  materials: string;
  notes: string;
  image: File | null;
  imageSource?: "manual" | "pdf_page";
  additionalDocuments?: File[];
  additionalDocumentNotes?: string[];
  sourceDocument?: File | null;
  suffix?: string;
};

export type OrderBatchSubmission = {
  mode: "single" | "batch";
  baseOp: string;
  items: OrderDraftSubmissionItem[];
};

type DraftItem = {
  key: string;
  suffix: string;
  clientId: string;
  job: string;
  targetDate: string;
  priority: Priority;
  consultantName: string;
  sectorId: string;
  installationAddress: string;
  materials: string;
  notes: string;
  image: File | null;
  sourceDocument: File | null;
};

type SharedDefaults = Pick<DraftItem,
  "clientId" | "targetDate" | "priority" | "consultantName" | "sectorId" | "installationAddress"
>;

type SharedKey = keyof SharedDefaults;

type Props = {
  clients: Client[];
  sectors: Sector[];
  consultants: string[];
  initialClientId?: string;
  busy: boolean;
  externalError?: string;
  onSubmit: (submission: OrderBatchSubmission) => Promise<void> | void;
  onCancel: () => void;
  onCreateClient: (onCreated: (client: Client) => void) => void;
  onEditClient: (client: Client, onSaved?: (client: Client) => void) => void;
};

function clientAddress(client: Client | null | undefined) {
  if (!client) return "";
  const locality = [client.city, client.state].filter(Boolean).join(" - ");
  return [client.address, client.district, locality].filter(Boolean).join(", ");
}

function createDraft(shared: SharedDefaults, index: number): DraftItem {
  return {
    key: crypto.randomUUID(),
    suffix: String(index + 1),
    clientId: shared.clientId,
    job: "",
    targetDate: shared.targetDate,
    priority: shared.priority,
    consultantName: shared.consultantName,
    sectorId: shared.sectorId,
    installationAddress: shared.installationAddress,
    materials: "",
    notes: "",
    image: null,
    sourceDocument: null,
  };
}


function nextSuffix(items: DraftItem[]) {
  const highest = items.reduce((maximum, item) => {
    const parsed = Number(item.suffix);
    return Number.isFinite(parsed) ? Math.max(maximum, parsed) : maximum;
  }, 0);
  return String(highest + 1);
}

function displayClientName(client: Client | undefined) {
  return client ? client.trade_name || client.name : "Cliente não selecionado";
}

export function OrderBatchForm({
  clients,
  sectors,
  consultants,
  initialClientId = "",
  busy,
  externalError,
  onSubmit,
  onCancel,
  onCreateClient,
  onEditClient,
}: Props) {
  const initialClient = clients.find((client) => client.id === initialClientId) || null;
  const initialShared: SharedDefaults = {
    clientId: initialClientId,
    targetDate: "",
    priority: "normal",
    consultantName: "",
    sectorId: sectors[0]?.id || "",
    installationAddress: clientAddress(initialClient),
  };

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [baseOp, setBaseOp] = useState("");
  const [shared, setShared] = useState<SharedDefaults>(initialShared);
  const [items, setItems] = useState<DraftItem[]>(() => [
    createDraft(initialShared, 0),
    createDraft(initialShared, 1),
  ]);
  const [localError, setLocalError] = useState("");

  const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
  const visibleItems = mode === "single" ? items.slice(0, 1) : items;


  function changeShared<K extends SharedKey>(key: K, value: SharedDefaults[K]) {
    const previousValue = shared[key];
    setShared((current) => ({ ...current, [key]: value }));
    setItems((current) => current.map((item) =>
      item[key] === previousValue ? { ...item, [key]: value } : item,
    ));
  }

  function selectSharedClient(clientId: string, providedClient?: Client) {
    const previousClientId = shared.clientId;
    const previousClient = clients.find((client) => client.id === previousClientId);
    const nextClient = providedClient || clients.find((client) => client.id === clientId);
    const previousDefaultAddress = clientAddress(previousClient);
    const nextDefaultAddress = clientAddress(nextClient);
    const shouldRefreshSharedAddress = !shared.installationAddress || shared.installationAddress === previousDefaultAddress;

    setShared((current) => ({
      ...current,
      clientId,
      installationAddress: shouldRefreshSharedAddress ? nextDefaultAddress : current.installationAddress,
    }));
    setItems((current) => current.map((item) => {
      if (item.clientId !== previousClientId) return item;
      const shouldRefreshItemAddress = !item.installationAddress
        || item.installationAddress === shared.installationAddress
        || item.installationAddress === previousDefaultAddress;
      return {
        ...item,
        clientId,
        installationAddress: shouldRefreshItemAddress ? nextDefaultAddress : item.installationAddress,
      };
    }));
  }


  function refreshSharedClient(savedClient: Client) {
    const previousClient = clients.find((client) => client.id === savedClient.id);
    const previousDefaultAddress = clientAddress(previousClient);
    const nextDefaultAddress = clientAddress(savedClient);
    setShared((current) => current.clientId === savedClient.id && (!current.installationAddress || current.installationAddress === previousDefaultAddress)
      ? { ...current, installationAddress: nextDefaultAddress }
      : current);
    setItems((current) => current.map((item) => item.clientId === savedClient.id && (!item.installationAddress || item.installationAddress === previousDefaultAddress)
      ? { ...item, installationAddress: nextDefaultAddress }
      : item));
  }

  function refreshItemClient(itemKey: string, savedClient: Client) {
    const previousClient = clients.find((client) => client.id === savedClient.id);
    const previousDefaultAddress = clientAddress(previousClient);
    const nextDefaultAddress = clientAddress(savedClient);
    setItems((current) => current.map((item) => item.key === itemKey && (!item.installationAddress || item.installationAddress === previousDefaultAddress)
      ? { ...item, installationAddress: nextDefaultAddress }
      : item));
  }

  function updateItem<K extends keyof DraftItem>(key: string, field: K, value: DraftItem[K]) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, [field]: value } : item));
  }

  function selectItemClient(itemKey: string, clientId: string, providedClient?: Client) {
    setItems((current) => current.map((item) => {
      if (item.key !== itemKey) return item;
      const previousClient = clients.find((client) => client.id === item.clientId);
      const nextClient = providedClient || clients.find((client) => client.id === clientId);
      const previousDefaultAddress = clientAddress(previousClient);
      const nextAddress = !item.installationAddress || item.installationAddress === previousDefaultAddress
        ? clientAddress(nextClient)
        : item.installationAddress;
      return { ...item, clientId, installationAddress: nextAddress };
    }));
  }

  function addSubOrder() {
    setItems((current) => {
      const nextItem = createDraft(shared, current.length);
      return [...current, { ...nextItem, suffix: nextSuffix(current) }];
    });
  }

  function duplicateSubOrder(item: DraftItem) {
    setItems((current) => [...current, {
      ...item,
      key: crypto.randomUUID(),
      suffix: nextSuffix(current),
      image: null,
      sourceDocument: null,
    }]);
  }

  function removeSubOrder(key: string) {
    setItems((current) => current.length <= 2 ? current : current.filter((item) => item.key !== key));
  }

  function applySharedData(key: string) {
    setItems((current) => current.map((item) => item.key === key ? {
      ...item,
      clientId: shared.clientId,
      targetDate: shared.targetDate,
      priority: shared.priority,
      consultantName: shared.consultantName,
      sectorId: shared.sectorId,
      installationAddress: shared.installationAddress,
    } : item));
  }

  function switchMode(nextMode: "single" | "batch") {
    setMode(nextMode);
    setLocalError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setLocalError("");

    const normalizedBaseOp = baseOp.trim();

    const selectedItems = mode === "single" ? items.slice(0, 1) : items;
    const suffixes = selectedItems.map((item) => item.suffix.trim());
    if (mode === "batch" && suffixes.some((suffix) => !/^\d+$/.test(suffix))) {
      setLocalError("Cada subpedido precisa de um número de item válido, como 1, 2 ou 3.");
      return;
    }
    if (mode === "batch" && new Set(suffixes).size !== suffixes.length) {
      setLocalError("Existem subpedidos com o mesmo número de item.");
      return;
    }

    for (const [index, item] of selectedItems.entries()) {
      const label = mode === "batch" ? `Subpedido ${item.suffix || index + 1}` : "Pedido";
      if (!clients.some((client) => client.id === item.clientId)) {
        setLocalError(`${label}: selecione um cliente.`);
        return;
      }
      if (!item.job.trim()) {
        setLocalError(`${label}: informe o serviço.`);
        return;
      }
      if (!item.targetDate) {
        setLocalError(`${label}: informe a data da instalação ou entrega.`);
        return;
      }
      if (!item.sectorId) {
        setLocalError(`${label}: selecione o setor inicial.`);
        return;
      }
      if (item.image && item.image.type !== "image/png") {
        setLocalError(`${label}: a miniatura precisa ser um arquivo PNG.`);
        return;
      }
      if (item.image && item.image.size > 5 * 1024 * 1024) {
        setLocalError(`${label}: a miniatura pode ter no máximo 5 MB.`);
        return;
      }
      if (item.sourceDocument && item.sourceDocument.type !== "application/pdf" && !item.sourceDocument.name.toLocaleLowerCase("pt-BR").endsWith(".pdf")) {
        setLocalError(`${label}: o arquivo original precisa ser um PDF.`);
        return;
      }
      if (item.sourceDocument && item.sourceDocument.size > 200 * 1024 * 1024) {
        setLocalError(`${label}: o PDF original pode ter no máximo 200 MB.`);
        return;
      }
    }

    await onSubmit({
      mode,
      baseOp: normalizedBaseOp,
      items: selectedItems.map((item) => ({
        opNumber: mode === "batch"
          ? `${requiresAutomaticOrderNumber(normalizedBaseOp) ? "0000" : normalizedBaseOp}-${item.suffix.trim()}`
          : normalizedBaseOp,
        suffix: item.suffix.trim(),
        clientId: item.clientId,
        job: item.job.trim(),
        targetDate: item.targetDate,
        priority: item.priority,
        consultantName: item.consultantName.trim(),
        sectorId: item.sectorId,
        installationAddress: item.installationAddress.trim(),
        materials: item.materials.trim(),
        notes: item.notes.trim(),
        image: item.image,
        sourceDocument: item.sourceDocument,
        imageSource: "manual",
      })),
    });
  }

  return (
    <form className="order-batch-form" onSubmit={submit}>
      <div className="order-mode-switch" role="group" aria-label="Tipo de pedido">
        <button type="button" className={mode === "single" ? "active" : ""} onClick={() => switchMode("single")}>
          <b>Pedido único</b><small>Uma OP com um serviço</small>
        </button>
        <button type="button" className={mode === "batch" ? "active" : ""} onClick={() => switchMode("batch")}>
          <b>OP com subpedidos</b><small>Cadastre todos os itens de uma vez</small>
        </button>
      </div>

      {(localError || externalError) && <div className="auth-error">{localError || externalError}</div>}

      <section className="shared-order-data">
        <header>
          <div><small>DADOS GERAIS</small><h3>Informações reaproveitadas</h3></div>
          <p>Os subpedidos recebem estes dados inicialmente, mas cada item pode ser alterado separadamente.</p>
        </header>
        <div className="form-grid order-shared-grid">
          <label>Número da OP principal<input value={baseOp} onChange={(event) => setBaseOp(event.target.value)} placeholder="Ex.: 959 ou 0000" /><small>{automaticOrderNumberHint()}</small></label>
          <label className="wide">Cliente padrão
            <ClientSelector
              clients={activeClients}
              value={shared.clientId}
              onChange={selectSharedClient}
              onCreate={() => onCreateClient((client) => selectSharedClient(client.id, client))}
              onEdit={(client) => onEditClient(client, refreshSharedClient)}
            />
          </label>
          <label>Data padrão da instalação ou entrega<input type="date" value={shared.targetDate} onChange={(event) => changeShared("targetDate", event.target.value)} /><small>O prazo de produção será calculado para 1 dia útil antes.</small></label>
          <label>Responsável padrão<select value={shared.consultantName} onChange={(event) => changeShared("consultantName", event.target.value)}><option value="">Não definido</option>{consultants.map((consultant) => <option key={consultant} value={consultant}>{consultant}</option>)}</select></label>
          <label>Prioridade padrão<select value={shared.priority} onChange={(event) => changeShared("priority", event.target.value as Priority)}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baixa</option></select></label>
          <label>Setor inicial padrão<select value={shared.sectorId} onChange={(event) => changeShared("sectorId", event.target.value)}>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
          <label className="wide">Endereço padrão da instalação ou entrega<textarea value={shared.installationAddress} onChange={(event) => changeShared("installationAddress", event.target.value)} placeholder="Endereço completo, ponto de referência e contato no local" /></label>
        </div>
      </section>

      <section className="suborders-section">
        <header>
          <div><small>{mode === "batch" ? "SUBPEDIDOS" : "PEDIDO"}</small><h3>{mode === "batch" ? `${visibleItems.length} itens nesta OP` : "Dados específicos do serviço"}</h3></div>
          {mode === "batch" && <button type="button" className="add-suborder-button" onClick={addSubOrder}>＋ Adicionar subpedido</button>}
        </header>

        <div className="suborders-list">
          {visibleItems.map((item, index) => {
            const selectedClient = clients.find((client) => client.id === item.clientId);
            const inheritsShared = item.clientId === shared.clientId
              && item.targetDate === shared.targetDate
              && item.priority === shared.priority
              && item.consultantName === shared.consultantName
              && item.sectorId === shared.sectorId
              && item.installationAddress === shared.installationAddress;
            const opPreview = baseOp.trim()
              ? mode === "batch" ? `${baseOp.trim()}-${item.suffix || index + 1}` : baseOp.trim()
              : mode === "batch" ? `OP-ITEM ${item.suffix || index + 1}` : "NOVA OP";

            return <article className="suborder-editor-card" key={item.key}>
              <header>
                <div className="suborder-number"><span>{index + 1}</span><div><small>{opPreview}</small><b>{item.job || (mode === "batch" ? "Novo subpedido" : "Novo pedido")}</b><em>{displayClientName(selectedClient)}</em></div></div>
                <div className="suborder-card-actions">
                  {!inheritsShared && <button type="button" onClick={() => applySharedData(item.key)}>Aplicar dados gerais</button>}
                  {mode === "batch" && <button type="button" onClick={() => duplicateSubOrder(item)}>Duplicar</button>}
                  {mode === "batch" && <button type="button" className="danger" disabled={items.length <= 2} onClick={() => removeSubOrder(item.key)}>Remover</button>}
                </div>
              </header>

              <div className="form-grid suborder-fields">
                {mode === "batch" && <label>Número do item<input value={item.suffix} inputMode="numeric" pattern="[0-9]+" onChange={(event) => updateItem(item.key, "suffix", event.target.value.replace(/\D/g, ""))} required /></label>}
                <label className={mode === "single" ? "wide" : ""}>Serviço<input value={item.job} onChange={(event) => updateItem(item.key, "job", event.target.value)} placeholder="Ex.: Fachada em ACM" required /></label>
                <label>Cliente<select value={item.clientId} onChange={(event) => selectItemClient(item.key, event.target.value)} required><option value="">Selecione</option>{activeClients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.name}</option>)}</select></label>
                <div className="suborder-client-actions"><span>{selectedClient?.document || selectedClient?.whatsapp || "Cadastro sem documento"}</span><div><button type="button" onClick={() => onCreateClient((client) => selectItemClient(item.key, client.id, client))}>Novo cliente</button>{selectedClient && <button type="button" onClick={() => onEditClient(selectedClient, (savedClient) => { refreshSharedClient(savedClient); refreshItemClient(item.key, savedClient); })}>Editar cadastro</button>}</div></div>
                <label>Data da instalação ou entrega<input type="date" value={item.targetDate} onChange={(event) => updateItem(item.key, "targetDate", event.target.value)} required /><small>Prazo de produção automático: 1 dia útil antes.</small></label>
                <label>Responsável<select value={item.consultantName} onChange={(event) => updateItem(item.key, "consultantName", event.target.value)}><option value="">Não definido</option>{consultants.map((consultant) => <option key={consultant} value={consultant}>{consultant}</option>)}</select></label>
                <label>Prioridade<select value={item.priority} onChange={(event) => updateItem(item.key, "priority", event.target.value as Priority)}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baixa</option></select></label>
                <label>Setor inicial<select value={item.sectorId} onChange={(event) => updateItem(item.key, "sectorId", event.target.value)} required><option value="">Selecione</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
                <label className="wide">Endereço da instalação ou entrega<textarea value={item.installationAddress} onChange={(event) => updateItem(item.key, "installationAddress", event.target.value)} placeholder="Pode ser diferente dos dados gerais" /></label>
                <label className="wide">Materiais e especificações<textarea value={item.materials} onChange={(event) => updateItem(item.key, "materials", event.target.value)} placeholder="Ex.: ACM 3 mm, adesivo automotivo, LED..." /></label>
                <label className="wide">Observações<textarea value={item.notes} onChange={(event) => updateItem(item.key, "notes", event.target.value)} placeholder="Informações para produção, acabamento e instalação" /></label>
                <label className="wide image-upload-field">Miniatura do pedido (PNG)<input type="file" accept="image/png,.png" onChange={(event) => updateItem(item.key, "image", event.target.files?.[0] || null)} /><small>{item.image ? item.image.name : "Arquivo PNG de até 5 MB."}</small></label>
                <label className="wide image-upload-field">Arquivo original da OS (PDF opcional)<input type="file" accept="application/pdf,.pdf" onChange={(event) => updateItem(item.key, "sourceDocument", event.target.files?.[0] || null)} /><small>{item.sourceDocument ? item.sourceDocument.name : "Se informado, o PDF será anexado automaticamente no Google Drive desta OP."}</small></label>
              </div>
            </article>;
          })}
        </div>
      </section>

      <div className="actions order-batch-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Cadastrando…" : mode === "batch" ? `Cadastrar ${visibleItems.length} subpedidos` : "Cadastrar pedido"}</button>
      </div>
    </form>
  );
}
