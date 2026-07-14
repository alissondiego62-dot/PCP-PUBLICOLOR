"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { installationDateToIso, previousBusinessDay } from "@/lib/pcp-formatters";
import type { Client, DbStatus, InstallationStatus, Order, Priority, Sector } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { requiresAutomaticOrderNumber } from "@/lib/order-number";

type Dataset = "clients" | "orders";
type FileFormat = "csv" | "xml";
type ImportRow = Record<string, string>;
type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

type Props = {
  orders: Order[];
  clients: Client[];
  sectors: Sector[];
  onImportComplete: () => void;
};

const CLIENT_EXPORT_FIELDS = [
  "id",
  "nome_razao_social",
  "nome_fantasia",
  "cpf_cnpj",
  "telefone",
  "whatsapp",
  "email",
  "contato_responsavel",
  "endereco",
  "bairro",
  "cidade",
  "estado",
  "observacoes",
  "ativo",
  "criado_em",
  "atualizado_em",
] as const;

const ORDER_EXPORT_FIELDS = [
  "id",
  "numero_op",
  "cliente_id",
  "cliente",
  "cliente_documento",
  "servico",
  "data_instalacao_entrega",
  "horario_confirmado",
  "prazo_producao",
  "prioridade",
  "setor_id",
  "setor",
  "status",
  "responsavel",
  "endereco_instalacao",
  "materiais",
  "observacoes",
  "equipe_instalacao",
  "veiculo_instalacao",
  "status_instalacao",
  "orientacoes_instalacao",
  "concluido_em",
  "criado_em",
] as const;

const clientAliases = {
  id: ["id", "cliente_id"],
  name: ["nome_razao_social", "nome", "razao_social", "cliente", "name"],
  tradeName: ["nome_fantasia", "fantasia", "trade_name"],
  document: ["cpf_cnpj", "documento", "document", "cnpj", "cpf"],
  phone: ["telefone", "fone", "phone"],
  whatsapp: ["whatsapp", "celular"],
  email: ["email", "e_mail"],
  contactName: ["contato_responsavel", "contato", "responsavel_contato", "contact_name"],
  address: ["endereco", "logradouro", "address"],
  district: ["bairro", "district"],
  city: ["cidade", "city"],
  state: ["estado", "uf", "state"],
  notes: ["observacoes", "observacao", "notas", "notes"],
  active: ["ativo", "active", "status_cliente"],
} as const;

const orderAliases = {
  id: ["id", "pedido_id"],
  opNumber: ["numero_op", "op", "op_number", "ordem", "ordem_producao"],
  clientId: ["cliente_id", "client_id"],
  clientName: ["cliente", "nome_cliente", "client_name"],
  clientDocument: ["cliente_documento", "cpf_cnpj", "documento_cliente"],
  description: ["servico", "descricao", "description", "produto"],
  targetDate: ["data_instalacao_entrega", "data_entrega", "data_instalacao", "installation_scheduled_at", "prazo"],
  timeConfirmed: ["horario_confirmado", "installation_time_confirmed"],
  priority: ["prioridade", "priority"],
  sectorId: ["setor_id", "sector_id"],
  sectorName: ["setor", "setor_producao", "sector"],
  status: ["status", "status_producao"],
  consultant: ["responsavel", "consultor", "consultant_name"],
  installationAddress: ["endereco_instalacao", "endereco_entrega", "installation_address", "endereco"],
  materials: ["materiais", "materials", "especificacoes"],
  notes: ["observacoes", "observacao", "notes"],
  installationTeam: ["equipe_instalacao", "installation_team", "equipe"],
  installationVehicle: ["veiculo_instalacao", "installation_vehicle", "veiculo"],
  installationStatus: ["status_instalacao", "installation_status"],
  installationNotes: ["orientacoes_instalacao", "installation_notes", "observacoes_instalacao"],
  completedAt: ["concluido_em", "completed_at"],
} as const;

function normalizeKey(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ");
}

function normalizeDocument(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function pick(row: ImportRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row[normalizeKey(alias)];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

function parseBoolean(value: string, fallback = false) {
  const normalized = normalizeText(value);
  if (["1", "SIM", "S", "TRUE", "VERDADEIRO", "ATIVO"].includes(normalized)) return true;
  if (["0", "NAO", "N", "FALSE", "FALSO", "INATIVO"].includes(normalized)) return false;
  return fallback;
}

function parsePriority(value: string): Priority {
  const normalized = normalizeText(value);
  if (["LOW", "BAIXA", "BAIXO"].includes(normalized)) return "low";
  if (["HIGH", "ALTA", "ALTO"].includes(normalized)) return "high";
  if (["URGENT", "URGENTE"].includes(normalized)) return "urgent";
  return "normal";
}

function parseStatus(value: string): DbStatus {
  const normalized = normalizeText(value);
  if (["IN_PROGRESS", "EM ANDAMENTO", "ANDAMENTO", "PRODUCAO"].includes(normalized)) return "in_progress";
  if (["IN_TRANSPORT", "EM TRANSPORTE", "TRANSPORTE"].includes(normalized)) return "in_transport";
  if (["WAITING_CLIENT", "AGUARDANDO CLIENTE", "CLIENTE"].includes(normalized)) return "waiting_client";
  if (["COMPLETED", "CONCLUIDO", "FINALIZADO", "ENTREGUE"].includes(normalized)) return "completed";
  if (["PAUSED", "PAUSADO", "PARADO", "BLOQUEADO"].includes(normalized)) return "paused";
  return "waiting";
}

function parseInstallationStatus(value: string, orderStatus: DbStatus): InstallationStatus {
  const normalized = normalizeText(value);
  if (["COMPLETED", "CONCLUIDO", "FINALIZADO"].includes(normalized)) return "completed";
  if (["IN_PROGRESS", "EM ANDAMENTO", "ANDAMENTO"].includes(normalized)) return "in_progress";
  if (["CANCELLED", "CANCELADO"].includes(normalized)) return "cancelled";
  if (["PENDING", "PENDENTE"].includes(normalized)) return "pending";
  if (["SCHEDULED", "AGENDADO", "PROGRAMADO"].includes(normalized)) return "scheduled";
  return orderStatus === "completed" ? "completed" : "scheduled";
}

function validDateOnly(year: string, month: string, day: string) {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const date = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  if (
    date.getUTCFullYear() !== numericYear ||
    date.getUTCMonth() !== numericMonth - 1 ||
    date.getUTCDate() !== numericDay
  ) return "";
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeDateOnly(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const international = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (international) return validDateOnly(international[1], international[2], international[3]);
  const brazilian = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazilian) return validDateOnly(brazilian[3], brazilian[2], brazilian[1]);
  return "";
}

function dateInManaus(isoValue: string) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function parseTargetDate(value: string) {
  try {
    const dateOnly = normalizeDateOnly(value);
    if (dateOnly) return { iso: installationDateToIso(dateOnly), dateOnly, hasTime: false };
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const iso = parsed.toISOString();
    const localDate = dateInManaus(iso);
    return localDate ? { iso, dateOnly: localDate, hasTime: true } : null;
  } catch {
    return null;
  }
}

function detectDelimiter(text: string) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
  const counts = [";", ",", "\t"].map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  return counts.sort((a, b) => b.count - a.count)[0]?.delimiter || ";";
}

function parseDelimited(text: string): ImportRow[] {
  const delimiter = detectDelimiter(text);
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) matrix.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) matrix.push(row);
  if (matrix.length < 2) throw new Error("O CSV precisa ter uma linha de cabeçalho e pelo menos um registro.");

  const headers = matrix[0].map(normalizeKey);
  if (headers.some((header) => !header)) throw new Error("O CSV possui uma coluna sem nome.");
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function parseXml(text: string, dataset: Dataset): ImportRow[] {
  const document = new DOMParser().parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) throw new Error("O arquivo XML está inválido ou incompleto.");
  const tagName = dataset === "clients" ? "cliente" : "pedido";
  const elements = Array.from(document.getElementsByTagName(tagName));
  if (!elements.length) throw new Error(`O XML não possui elementos <${tagName}>.`);
  return elements.map((element) => {
    const row: ImportRow = {};
    Array.from(element.children).forEach((child) => {
      row[normalizeKey(child.tagName)] = child.textContent?.trim() || "";
    });
    return row;
  });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function serializeCsv(fields: readonly string[], rows: ImportRow[]) {
  return `\uFEFF${fields.map(csvCell).join(";")}\r\n${rows.map((row) => fields.map((field) => csvCell(row[field] || "")).join(";")).join("\r\n")}`;
}

function escapeXml(value: unknown) {
  return (value === null || value === undefined ? "" : String(value))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function serializeXml(dataset: Dataset, fields: readonly string[], rows: ImportRow[]) {
  const collectionTag = dataset === "clients" ? "clientes" : "pedidos";
  const itemTag = dataset === "clients" ? "cliente" : "pedido";
  const records = rows.map((row) => `    <${itemTag}>\n${fields.map((field) => `      <${field}>${escapeXml(row[field] || "")}</${field}>`).join("\n")}\n    </${itemTag}>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<publicolor_export tipo="${dataset}" versao="1.0" gerado_em="${new Date().toISOString()}">\n  <${collectionTag}>\n${records}\n  </${collectionTag}>\n</publicolor_export>\n`;
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function clientExportRows(clients: Client[]): ImportRow[] {
  return clients.map((client) => ({
    id: client.id,
    nome_razao_social: client.name,
    nome_fantasia: client.trade_name || "",
    cpf_cnpj: client.document || "",
    telefone: client.phone || "",
    whatsapp: client.whatsapp || "",
    email: client.email || "",
    contato_responsavel: client.contact_name || "",
    endereco: client.address || "",
    bairro: client.district || "",
    cidade: client.city || "",
    estado: client.state || "",
    observacoes: client.notes || "",
    ativo: client.active ? "sim" : "não",
    criado_em: client.created_at,
    atualizado_em: client.updated_at,
  }));
}

function orderExportRows(orders: Order[], clients: Client[], sectors: Sector[]): ImportRow[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const sectorsById = new Map(sectors.map((sector) => [sector.id, sector]));
  return orders.map((order) => ({
    id: order.id,
    numero_op: order.op_number,
    cliente_id: order.client_id || "",
    cliente: order.client_name,
    cliente_documento: order.client_id ? clientsById.get(order.client_id)?.document || "" : "",
    servico: order.description,
    data_instalacao_entrega: order.installation_scheduled_at || "",
    horario_confirmado: order.installation_time_confirmed ? "sim" : "não",
    prazo_producao: order.delivery_date,
    prioridade: order.priority,
    setor_id: order.sector_id,
    setor: sectorsById.get(order.sector_id)?.name || "",
    status: order.status,
    responsavel: order.consultant_name || "",
    endereco_instalacao: order.installation_address || "",
    materiais: order.materials || "",
    observacoes: order.notes || "",
    equipe_instalacao: order.installation_team || "",
    veiculo_instalacao: order.installation_vehicle || "",
    status_instalacao: order.installation_status || "",
    orientacoes_instalacao: order.installation_notes || "",
    concluido_em: order.completed_at || "",
    criado_em: order.created_at,
  }));
}

function templateRows(dataset: Dataset, sectors: Sector[]): ImportRow[] {
  if (dataset === "clients") {
    return [{
      id: "",
      nome_razao_social: "Empresa Exemplo LTDA",
      nome_fantasia: "Empresa Exemplo",
      cpf_cnpj: "12345678000199",
      telefone: "(95) 3000-0000",
      whatsapp: "(95) 99999-0000",
      email: "contato@exemplo.com.br",
      contato_responsavel: "Maria Silva",
      endereco: "Rua Exemplo, 100",
      bairro: "Centro",
      cidade: "Boa Vista",
      estado: "RR",
      observacoes: "Cliente importado pelo modelo.",
      ativo: "sim",
      criado_em: "",
      atualizado_em: "",
    }];
  }
  const sector = sectors.find((item) => item.active) || sectors[0];
  return [{
    id: "",
    numero_op: "OP-EXEMPLO-001",
    cliente_id: "",
    cliente: "Empresa Exemplo",
    cliente_documento: "12345678000199",
    servico: "Fachada em ACM com letra caixa",
    data_instalacao_entrega: "2026-08-10",
    horario_confirmado: "não",
    prazo_producao: "",
    prioridade: "normal",
    setor_id: sector?.id || "",
    setor: sector?.name || "",
    status: "waiting",
    responsavel: "",
    endereco_instalacao: "Rua Exemplo, 100, Centro",
    materiais: "ACM 3 mm; adesivo; estrutura metálica",
    observacoes: "",
    equipe_instalacao: "",
    veiculo_instalacao: "",
    status_instalacao: "scheduled",
    orientacoes_instalacao: "",
    concluido_em: "",
    criado_em: "",
  }];
}

function reportMessage(report: ImportReport) {
  return `${report.created} criado(s), ${report.updated} atualizado(s), ${report.skipped} ignorado(s)${report.errors.length ? ` e ${report.errors.length} erro(s)` : ""}.`;
}

export function DataImportExportSettings({ orders, clients, sectors, onImportComplete }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dataset, setDataset] = useState<Dataset>("orders");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileFormat, setFileFormat] = useState<FileFormat | null>(null);
  const [parseError, setParseError] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [createMissingClients, setCreateMissingClients] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const previewColumns = useMemo(() => {
    if (!rows.length) return [];
    const preferred = dataset === "clients"
      ? ["nome_razao_social", "nome_fantasia", "cpf_cnpj", "whatsapp", "cidade"]
      : ["numero_op", "cliente", "servico", "data_instalacao_entrega", "setor", "responsavel"];
    const available = new Set(Object.keys(rows[0]));
    return preferred.filter((column) => available.has(column)).concat(Object.keys(rows[0]).filter((column) => !preferred.includes(column)).slice(0, 2));
  }, [dataset, rows]);

  function resetFile() {
    setRows([]);
    setFileName("");
    setFileFormat(null);
    setParseError("");
    setReport(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function changeDataset(nextDataset: Dataset) {
    setDataset(nextDataset);
    resetFile();
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setParseError("");
    setReport(null);
    setRows([]);
    setFileName("");
    setFileFormat(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setParseError("O arquivo pode ter no máximo 10 MB.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("pt-BR");
    if (extension !== "csv" && extension !== "xml") {
      setParseError("Selecione um arquivo CSV ou XML.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = extension === "csv" ? parseDelimited(text) : parseXml(text, dataset);
      if (parsed.length > 5000) throw new Error("O limite é de 5.000 registros por importação.");
      setRows(parsed);
      setFileName(file.name);
      setFileFormat(extension);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  function exportData(targetDataset: Dataset, format: FileFormat, template = false) {
    const fields = targetDataset === "clients" ? CLIENT_EXPORT_FIELDS : ORDER_EXPORT_FIELDS;
    const data = template
      ? templateRows(targetDataset, sectors)
      : targetDataset === "clients"
        ? clientExportRows(clients)
        : orderExportRows(orders, clients, sectors);
    const suffix = template ? "modelo" : new Date().toISOString().slice(0, 10);
    const filename = `publicolor-${targetDataset === "clients" ? "clientes" : "pedidos"}-${suffix}.${format}`;
    if (format === "csv") downloadText(filename, serializeCsv(fields, data), "text/csv;charset=utf-8");
    else downloadText(filename, serializeXml(targetDataset, fields, data), "application/xml;charset=utf-8");
  }

  async function importClients(): Promise<ImportReport> {
    const result: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [] };
    const currentClients = [...clients];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const line = index + 2;
      const name = pick(row, clientAliases.name);
      if (!name) {
        result.errors.push(`Linha ${line}: nome ou razão social não informado.`);
        continue;
      }
      const document = normalizeDocument(pick(row, clientAliases.document));
      const importedId = pick(row, clientAliases.id);
      const normalizedName = normalizeText(name);
      const existing = currentClients.find((client) =>
        (importedId && client.id === importedId) ||
        (document && normalizeDocument(client.document) === document) ||
        normalizeText(client.name) === normalizedName ||
        normalizeText(client.trade_name) === normalizedName,
      );
      const payload = {
        name,
        trade_name: pick(row, clientAliases.tradeName) || null,
        document: document || null,
        phone: pick(row, clientAliases.phone) || null,
        whatsapp: pick(row, clientAliases.whatsapp) || null,
        email: pick(row, clientAliases.email).toLocaleLowerCase("pt-BR") || null,
        contact_name: pick(row, clientAliases.contactName) || null,
        address: pick(row, clientAliases.address) || null,
        district: pick(row, clientAliases.district) || null,
        city: pick(row, clientAliases.city) || null,
        state: pick(row, clientAliases.state).toLocaleUpperCase("pt-BR").slice(0, 2) || null,
        notes: pick(row, clientAliases.notes) || null,
        active: parseBoolean(pick(row, clientAliases.active), true),
      };

      if (existing) {
        if (!updateExisting) {
          result.skipped += 1;
          continue;
        }
        const { data, error } = await supabase.from("clients").update(payload).eq("id", existing.id).select("*").single();
        if (error || !data) {
          result.errors.push(`Linha ${line} (${name}): ${error?.message || "falha ao atualizar"}.`);
          continue;
        }
        const savedClient = data as Client;
        Object.assign(existing, savedClient);
        const { error: orderSyncError } = await supabase
          .from("orders")
          .update({ client_name: savedClient.trade_name || savedClient.name })
          .eq("client_id", savedClient.id);
        if (orderSyncError) {
          result.errors.push(`Linha ${line} (${name}): cliente atualizado, mas os pedidos vinculados não foram sincronizados: ${orderSyncError.message}.`);
        }
        result.updated += 1;
      } else {
        const { data, error } = await supabase.from("clients").insert(payload).select("*").single();
        if (error || !data) {
          result.errors.push(`Linha ${line} (${name}): ${error?.message || "falha ao criar"}.`);
          continue;
        }
        currentClients.push(data as Client);
        result.created += 1;
      }
    }
    return result;
  }

  async function importOrders(): Promise<ImportReport> {
    const result: ImportReport = { created: 0, updated: 0, skipped: 0, errors: [] };
    const currentClients = [...clients];
    const currentOrders = [...orders];
    const seenOps = new Set<string>();
    const sectorsById = new Map(sectors.map((sector) => [sector.id, sector]));

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const line = index + 2;
      let opNumber = pick(row, orderAliases.opNumber).toLocaleUpperCase("pt-BR");
      if (requiresAutomaticOrderNumber(opNumber)) {
        const { data: generatedOrderNumber, error: generatedOrderNumberError } = await supabase.rpc("generate_unique_order_number");
        if (generatedOrderNumberError || !generatedOrderNumber) {
          result.errors.push(`Linha ${line}: não foi possível gerar o número automático da OP: ${generatedOrderNumberError?.message || "resposta inválida do banco"}.`);
          continue;
        }
        opNumber = String(generatedOrderNumber).trim().toLocaleUpperCase("pt-BR");
      }
      const opKey = normalizeText(opNumber);
      if (seenOps.has(opKey)) {
        result.errors.push(`Linha ${line} (OP ${opNumber}): número repetido no mesmo arquivo.`);
        continue;
      }
      seenOps.add(opKey);

      const description = pick(row, orderAliases.description);
      if (!description) {
        result.errors.push(`Linha ${line} (OP ${opNumber}): serviço não informado.`);
        continue;
      }
      const parsedTarget = parseTargetDate(pick(row, orderAliases.targetDate));
      if (!parsedTarget) {
        result.errors.push(`Linha ${line} (OP ${opNumber}): data de instalação/entrega inválida.`);
        continue;
      }

      const sectorIdInput = pick(row, orderAliases.sectorId);
      const sectorNameInput = normalizeText(pick(row, orderAliases.sectorName));
      const sector = (sectorIdInput ? sectorsById.get(sectorIdInput) : undefined)
        || sectors.find((item) => normalizeText(item.name) === sectorNameInput);
      if (!sector) {
        result.errors.push(`Linha ${line} (OP ${opNumber}): setor não encontrado. Use o nome ou ID de um setor cadastrado.`);
        continue;
      }

      const clientIdInput = pick(row, orderAliases.clientId);
      const clientDocument = normalizeDocument(pick(row, orderAliases.clientDocument));
      const clientName = pick(row, orderAliases.clientName);
      let client = currentClients.find((item) =>
        (clientIdInput && item.id === clientIdInput) ||
        (clientDocument && normalizeDocument(item.document) === clientDocument) ||
        (clientName && (normalizeText(item.name) === normalizeText(clientName) || normalizeText(item.trade_name) === normalizeText(clientName))),
      );

      if (!client && createMissingClients && clientName) {
        const { data, error } = await supabase.from("clients").insert({
          name: clientName,
          trade_name: clientName,
          document: clientDocument || null,
          active: true,
        }).select("*").single();
        if (error || !data) {
          result.errors.push(`Linha ${line} (OP ${opNumber}): não foi possível criar o cliente ${clientName}: ${error?.message || "erro desconhecido"}.`);
          continue;
        }
        client = data as Client;
        currentClients.push(client);
      }
      if (!client) {
        result.errors.push(`Linha ${line} (OP ${opNumber}): cliente não encontrado. Importe os clientes primeiro ou habilite a criação automática.`);
        continue;
      }

      const orderStatus = parseStatus(pick(row, orderAliases.status));
      const explicitCompletedAt = pick(row, orderAliases.completedAt);
      const completedAt = orderStatus === "completed"
        ? (explicitCompletedAt && !Number.isNaN(new Date(explicitCompletedAt).getTime()) ? new Date(explicitCompletedAt).toISOString() : new Date().toISOString())
        : null;
      const payload = {
        op_number: opNumber,
        client_id: client.id,
        client_name: client.trade_name || client.name,
        description,
        installation_scheduled_at: parsedTarget.iso,
        delivery_date: previousBusinessDay(parsedTarget.dateOnly),
        installation_time_confirmed: parseBoolean(pick(row, orderAliases.timeConfirmed), parsedTarget.hasTime),
        priority: parsePriority(pick(row, orderAliases.priority)),
        sector_id: sector.id,
        status: orderStatus,
        consultant_name: pick(row, orderAliases.consultant) || null,
        installation_address: pick(row, orderAliases.installationAddress) || null,
        materials: pick(row, orderAliases.materials) || null,
        notes: pick(row, orderAliases.notes) || null,
        installation_team: pick(row, orderAliases.installationTeam) || null,
        installation_vehicle: pick(row, orderAliases.installationVehicle) || null,
        installation_status: parseInstallationStatus(pick(row, orderAliases.installationStatus), orderStatus),
        installation_notes: pick(row, orderAliases.installationNotes) || null,
        completed_at: completedAt,
      };
      const importedId = pick(row, orderAliases.id);
      const existing = currentOrders.find((order) =>
        (importedId && order.id === importedId) || normalizeText(order.op_number) === opKey,
      );

      if (existing) {
        if (!updateExisting) {
          result.skipped += 1;
          continue;
        }
        const { data, error } = await supabase.from("orders").update(payload).eq("id", existing.id).select("id,op_number").single();
        if (error || !data) {
          const message = error?.code === "23505"
            ? "número de OS já cadastrado em outro pedido"
            : error?.message || "falha ao atualizar";
          result.errors.push(`Linha ${line} (OP ${opNumber}): ${message}.`);
          continue;
        }
        result.updated += 1;
      } else {
        const { data, error } = await supabase.from("orders").insert(payload).select("id,op_number").single();
        if (error || !data) {
          const message = error?.code === "23505"
            ? "número de OS já cadastrado"
            : error?.message || "falha ao criar";
          result.errors.push(`Linha ${line} (OP ${opNumber}): ${message}.`);
          continue;
        }
        currentOrders.push({ ...payload, id: String(data.id), main_image_path: null, responsible_user_id: null, blocked: false, installation_completed_at: null, created_at: new Date().toISOString() } as Order);
        result.created += 1;
      }
    }
    return result;
  }

  async function runImport() {
    if (!rows.length || busy) return;
    setBusy(true);
    setReport(null);
    try {
      const nextReport = dataset === "clients" ? await importClients() : await importOrders();
      setReport(nextReport);
      if (nextReport.created || nextReport.updated) onImportComplete();
    } catch (error) {
      setReport({ created: 0, updated: 0, skipped: 0, errors: [error instanceof Error ? error.message : "Falha inesperada durante a importação."] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="data-transfer-module">
      <header className="data-transfer-heading">
        <div><small>IMPORTAÇÃO E EXPORTAÇÃO</small><h2>Pedidos e clientes</h2><p>Transfira dados em CSV ou XML. Faça uma exportação de segurança antes de uma importação em massa.</p></div>
        <span>Somente administrador</span>
      </header>

      <div className="data-export-grid">
        <article className="data-export-card">
          <div className="data-export-card-title"><i>▤</i><div><small>BASE DE CLIENTES</small><b>{clients.length} cadastro(s)</b></div></div>
          <p>Inclui dados cadastrais, contatos, endereço, observações e situação do cliente.</p>
          <div className="data-transfer-actions"><button type="button" onClick={() => exportData("clients", "csv")}>Exportar CSV</button><button type="button" onClick={() => exportData("clients", "xml")}>Exportar XML</button></div>
          <div className="data-template-actions"><span>Modelos para preenchimento:</span><button type="button" onClick={() => exportData("clients", "csv", true)}>CSV</button><button type="button" onClick={() => exportData("clients", "xml", true)}>XML</button></div>
        </article>
        <article className="data-export-card">
          <div className="data-export-card-title"><i>▦</i><div><small>PEDIDOS E SUBPEDIDOS</small><b>{orders.length} registro(s)</b></div></div>
          <p>Cada pedido ou subpedido é exportado em uma linha, com cliente, setor, responsável, datas e informações de produção.</p>
          <div className="data-transfer-actions"><button type="button" onClick={() => exportData("orders", "csv")}>Exportar CSV</button><button type="button" onClick={() => exportData("orders", "xml")}>Exportar XML</button></div>
          <div className="data-template-actions"><span>Modelos para preenchimento:</span><button type="button" onClick={() => exportData("orders", "csv", true)}>CSV</button><button type="button" onClick={() => exportData("orders", "xml", true)}>XML</button></div>
        </article>
      </div>

      <article className="data-import-card">
        <div className="data-import-title"><div><small>IMPORTAR ARQUIVO</small><h3>Validar e gravar dados</h3></div><div className="data-type-switch"><button type="button" className={dataset === "orders" ? "active" : ""} onClick={() => changeDataset("orders")}>Pedidos</button><button type="button" className={dataset === "clients" ? "active" : ""} onClick={() => changeDataset("clients")}>Clientes</button></div></div>

        <label className={`data-file-drop ${rows.length ? "ready" : ""}`}>
          <input ref={fileInputRef} type="file" accept=".csv,.xml,text/csv,application/xml,text/xml" onChange={handleFile} />
          <i>{rows.length ? "✓" : "⇧"}</i>
          <span><b>{fileName || "Selecione um arquivo CSV ou XML"}</b><small>{rows.length ? `${rows.length} registro(s) reconhecido(s) · ${fileFormat?.toUpperCase()}` : "Tamanho máximo de 10 MB e até 5.000 registros."}</small></span>
          <em>{rows.length ? "Trocar arquivo" : "Procurar arquivo"}</em>
        </label>

        {parseError && <div className="data-import-error">{parseError}</div>}

        {rows.length > 0 && <>
          <div className="data-import-options">
            <label><input type="checkbox" checked={updateExisting} onChange={(event: ChangeEvent<HTMLInputElement>) => setUpdateExisting(event.target.checked)} /><span><b>Atualizar registros existentes</b><small>{dataset === "orders" ? "Identificação pelo número da OP." : "Identificação pelo ID, CPF/CNPJ ou nome."}</small></span></label>
            {dataset === "orders" && <label><input type="checkbox" checked={createMissingClients} onChange={(event: ChangeEvent<HTMLInputElement>) => setCreateMissingClients(event.target.checked)} /><span><b>Criar clientes não encontrados</b><small>Cria um cadastro básico usando o nome e documento do arquivo.</small></span></label>}
          </div>

          <div className="data-preview-wrap">
            <header><b>Prévia do arquivo</b><span>Exibindo até 5 registros</span></header>
            <div className="data-preview-table"><table><thead><tr>{previewColumns.map((column) => <th key={column}>{column.replace(/_/g, " ")}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={index}>{previewColumns.map((column) => <td key={column}>{row[column] || "—"}</td>)}</tr>)}</tbody></table></div>
          </div>

          <div className="data-import-footer"><button type="button" onClick={resetFile} disabled={busy}>Cancelar</button><button type="button" className="primary" onClick={() => void runImport()} disabled={busy}>{busy ? "Importando…" : `Importar ${rows.length} ${dataset === "orders" ? "pedido(s)" : "cliente(s)"}`}</button></div>
        </>}

        {report && <div className={`data-import-report ${report.errors.length ? "warning" : "success"}`}><b>{report.errors.length ? "Importação concluída com observações" : "Importação concluída"}</b><p>{reportMessage(report)}</p>{report.errors.length > 0 && <details><summary>Ver erros encontrados</summary><ul>{report.errors.slice(0, 100).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>{report.errors.length > 100 && <small>Foram ocultados {report.errors.length - 100} erros adicionais.</small>}</details>}</div>}
      </article>

      <div className="data-transfer-note"><b>Regras da importação</b><span>Pedidos existentes são localizados pelo número da OP. Clientes são localizados por ID, CPF/CNPJ ou nome. O prazo de produção continua sendo calculado automaticamente para um dia útil antes da instalação ou entrega.</span></div>
    </section>
  );
}
