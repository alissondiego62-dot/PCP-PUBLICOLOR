import type { Sector } from "@/lib/pcp-types";

export type PdfTextItemLike = {
  str?: string;
  width?: number;
  transform?: number[];
};

export type ParsedPdfOrderPage = {
  pageNumber: number;
  totalPages: number;
  rawText: string;
  lines: string[];
  opNumber: string;
  clientName: string;
  entryDate: string;
  targetDate: string;
  period: string;
  contactName: string;
  phone: string;
  consultantName: string;
  serviceTitle: string;
  address: string;
  specifications: string;
  notes: string;
  warnings: string[];
};

const HEADER_WORDS = [
  "CLIENTE:",
  "CONTATO DO CLIENTE",
  "ENTRADA:",
  "PRAZO ENTREGA:",
  "PERIODO:",
  "PERÍODO:",
  "ORDEM DE SERVICO",
  "ORDEM DE SERVIÇO",
  "ENVELOPAMENTO",
  "IMPRESSAO",
  "IMPRESSÃO",
  "PINTURA",
  "SOL. LETRAS",
  "MONTAGEM",
  "ELETRICA",
  "ELÉTRICA",
  "SER. FERRO",
  "CNC PLASMA",
  "CNC ROUTER",
  "CNC LASER",
];

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizePdfText(value: string) {
  return stripAccents(value)
    .replace(/[•●◉○◦]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function compactText(value: string) {
  return normalizePdfText(value).replace(/[^A-Z0-9]/g, "");
}

function cleanLine(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export function groupPdfTextItems(items: PdfTextItemLike[]) {
  const positioned = items
    .map((item) => {
      const text = cleanLine(String(item.str || ""));
      const transform = Array.isArray(item.transform) ? item.transform : [];
      return {
        text,
        x: Number(transform[4] || 0),
        y: Number(transform[5] || 0),
        width: Number(item.width || 0),
      };
    })
    .filter((item) => item.text);

  const rows: Array<{ y: number; items: typeof positioned }> = [];
  const tolerance = 3.2;

  positioned
    .sort((first, second) => second.y - first.y || first.x - second.x)
    .forEach((item) => {
      const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
      if (row) {
        row.items.push(item);
        row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length;
      } else {
        rows.push({ y: item.y, items: [item] });
      }
    });

  return rows
    .sort((first, second) => second.y - first.y)
    .map((row) => {
      const sorted = row.items.sort((first, second) => first.x - second.x);
      let line = "";
      let previousEnd = 0;
      sorted.forEach((item, index) => {
        const gap = index === 0 ? 0 : item.x - previousEnd;
        const separator = index === 0 ? "" : gap > 8 ? "  " : " ";
        line += `${separator}${item.text}`;
        previousEnd = Math.max(previousEnd, item.x + item.width);
      });
      return cleanLine(line);
    })
    .filter(Boolean);
}

function dateToInput(value: string) {
  const match = value.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (Number(day) > 31 || Number(month) > 12) return "";
  return `${year}-${month}-${day}`;
}

function valueAfterLabel(lines: string[], label: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(label);
    if (!match) continue;
    const inlineValue = cleanLine(match[1] || "");
    if (inlineValue) return inlineValue;
    const next = cleanLine(lines[index + 1] || "");
    if (next && !next.includes(":")) return next;
  }
  return "";
}

function extractPhone(text: string) {
  const matches = Array.from(text.matchAll(/(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[\s.-]?\d{4}/g));
  return cleanLine(matches.at(-1)?.[0] || "");
}

function findServiceTitle(lines: string[]) {
  const exact = lines.find((line) => /\bCONFEC(?:ÇÃO|CAO)\b/i.test(line));
  if (exact) return cleanLine(exact).replace(/\s+\d{1,2}\s*$/, "");

  const candidates = lines.filter((line) => {
    const normalized = normalizePdfText(line);
    return /LETREIRO|FACHADA|ADESIV|PLACA|BANNER|ENVELOPAMENTO/.test(normalized)
      && line.length >= 10
      && line.length <= 150
      && !HEADER_WORDS.some((word) => normalized.includes(normalizePdfText(word)));
  });
  return cleanLine(candidates[0] || "Serviço importado do PDF");
}

function extractAddress(lines: string[]) {
  const labelIndex = lines.findIndex((line) => /ENDERE(?:Ç|C)O DE ENTREGA\s*\/\s*INSTALA(?:Ç|C)(?:ÃO|AO)/i.test(line));
  if (labelIndex < 0) return "";
  const firstLine = lines[labelIndex].replace(/^.*?ENDERE(?:Ç|C)O DE ENTREGA\s*\/\s*INSTALA(?:Ç|C)(?:ÃO|AO)\s*:\s*/i, "");
  const pieces = [firstLine];
  for (let index = labelIndex + 1; index < Math.min(lines.length, labelIndex + 3); index += 1) {
    const candidate = lines[index];
    if (!candidate || /DESCRI(?:Ç|C)(?:ÃO|AO)|CLIENTE:|ENTRADA:|PRAZO/i.test(candidate)) break;
    pieces.push(candidate);
  }
  return cleanLine(pieces.join(" "));
}

function extractNotes(lines: string[]) {
  const descriptionIndex = lines.findIndex((line) => /^DESCRI(?:Ç|C)(?:ÃO|AO)\s*:/i.test(line));
  if (descriptionIndex < 0) return "";
  const addressIndex = lines.findIndex((line, index) => index > descriptionIndex && /ENDERE(?:Ç|C)O DE ENTREGA/i.test(line));
  const end = addressIndex >= 0 ? addressIndex : lines.length;
  const inline = lines[descriptionIndex].replace(/^DESCRI(?:Ç|C)(?:ÃO|AO)\s*:\s*/i, "");
  return [inline, ...lines.slice(descriptionIndex + 1, end)]
    .map(cleanLine)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function isHeaderOrFooterLine(line: string, serviceTitle: string) {
  const normalized = normalizePdfText(line);
  if (!normalized) return true;
  if (normalized.startsWith(normalizePdfText(serviceTitle))) return true;
  if (HEADER_WORDS.some((word) => normalized.startsWith(normalizePdfText(word)))) return true;
  if (/^N[º°O]?\s*\d+/.test(normalized)) return true;
  if (/^PG\b/.test(normalized)) return true;
  if (/^\d{1,2}\s*-+\s*\d{1,2}$/.test(normalized)) return true;
  if (/^(?:PG\s*)?\d{1,2}\s*-+\s*\d{1,2}(?:\s+.*)?$/.test(normalized)) return true;
  if (/^\d{1,2}\s*-+\s*\d{1,2}\s+\d{1,2}\s*-+\s*\d{1,2}(?:\s+.*)?$/.test(normalized)) return true;
  if (/^\d{1,2}\s+\(?\d{2}\)?$/.test(normalized)) return true;
  if (/^\d{4}[\s.-]?\d{4}$/.test(normalized)) return true;
  if (/ENDERECO DE ENTREGA|DESCRICAO:/.test(normalized)) return true;
  if (/^\(?\d{2}\)?\s*9?\d{4}/.test(normalized)) return true;
  const departmentHits = ["ENVELOPAMENTO", "IMPRESSAO", "PINTURA", "MONTAGEM", "ELETRICA", "CNC"].filter((word) => normalized.includes(word)).length;
  return departmentHits >= 3;
}

function extractSpecifications(lines: string[], serviceTitle: string) {
  const normalizedTitle = normalizePdfText(serviceTitle);
  const titleIndex = lines.findIndex((line) => normalizePdfText(line).startsWith(normalizedTitle));
  const installationIndex = lines.findIndex((line) => /\bLOCAL DE INSTALA(?:Ç|C)(?:ÃO|AO)\b/i.test(line));
  const descriptionIndex = lines.findIndex((line) => /^DESCRI(?:Ç|C)(?:ÃO|AO)\s*:/i.test(line));

  // Nas OSs da Publicolor, a linha imediatamente acima de "Local de instalação"
  // contém paginação (ex.: 01 - 04 / 01 - 01), nomes e telefones do consultor.
  // Esses dados são cabeçalho operacional e não fazem parte dos materiais.
  // Quando o marcador existe, o conteúdo técnico começa nele e segue até Descrição.
  const start = installationIndex >= 0
    ? installationIndex
    : titleIndex >= 0
      ? titleIndex + 1
      : 0;
  const end = descriptionIndex >= 0 ? descriptionIndex : lines.length;
  const selected = lines
    .slice(start, end)
    .filter((line) => !isHeaderOrFooterLine(line, serviceTitle))
    .map(cleanLine)
    .filter(Boolean);

  const deduplicated = selected.filter((line, index) => normalizePdfText(line) !== normalizePdfText(selected[index - 1] || ""));
  return deduplicated.join("\n").trim();
}

function detectConsultant(rawText: string, consultants: string[]) {
  const compact = compactText(rawText);
  const matches = consultants.filter((consultant) => compact.includes(compactText(consultant)));
  return matches.length === 1 ? matches[0] : "";
}

function detectContactName(lines: string[], consultants: string[]) {
  const consultant = detectConsultant(lines.join(" "), consultants);
  if (consultant) return consultant;

  const phoneLine = lines.findIndex((line) => /\(?\d{2}\)?\s*9?\d{4}[\s.-]?\d{4}/.test(line));
  if (phoneLine > 0) {
    const previous = cleanLine(lines[phoneLine - 1]);
    if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{4,60}$/i.test(previous) && !/ORDEM|CLIENTE|PRAZO|ENTRADA|PG/.test(normalizePdfText(previous))) {
      return previous;
    }
  }
  return "";
}

export function parsePublicolorPdfPage(
  linesInput: string[],
  pageNumber: number,
  totalPages: number,
  consultants: string[],
): ParsedPdfOrderPage {
  const lines = linesInput.map(cleanLine).filter(Boolean);
  const rawText = lines.join("\n");
  const flatText = lines.join(" ");
  const warnings: string[] = [];

  const clientName = valueAfterLabel(lines, /CLIENTE\s*:\s*(.*?)(?=\s{2,}|CONTATO DO CLIENTE|ENTRADA\s*:|$)/i)
    || cleanLine(flatText.match(/CLIENTE\s*:\s*(.*?)\s+(?:CONTATO DO CLIENTE|ENTRADA\s*:)/i)?.[1] || "");
  const entryRaw = valueAfterLabel(lines, /ENTRADA\s*:\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i);
  const targetRaw = valueAfterLabel(lines, /PRAZO\s+ENTREGA\s*:\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i);
  const period = valueAfterLabel(lines, /PER[IÍ]ODO\s*:\s*(.*?)(?=\s{2,}|$)/i);
  const opNumber = cleanLine(
    flatText.match(/ORDEM DE SERVI(?:Ç|C)O\s*(?:N[º°O]?\s*)?(\d{1,20})/i)?.[1]
      || flatText.match(/N[º°]\s*(\d{1,20})/i)?.[1]
      || "",
  );
  const serviceTitle = findServiceTitle(lines);
  const address = extractAddress(lines);
  const notes = extractNotes(lines);
  const specifications = extractSpecifications(lines, serviceTitle);
  const phone = extractPhone(rawText);
  const consultantName = detectConsultant(rawText, consultants);
  const contactName = detectContactName(lines, consultants);

  if (!opNumber) warnings.push(`Página ${pageNumber}: número da OP não identificado.`);
  if (!clientName) warnings.push(`Página ${pageNumber}: cliente não identificado.`);
  if (!targetRaw) warnings.push(`Página ${pageNumber}: prazo de entrega não identificado.`);
  if (!serviceTitle) warnings.push(`Página ${pageNumber}: serviço não identificado.`);

  return {
    pageNumber,
    totalPages,
    rawText,
    lines,
    opNumber,
    clientName,
    entryDate: dateToInput(entryRaw),
    targetDate: dateToInput(targetRaw),
    period,
    contactName,
    phone,
    consultantName,
    serviceTitle,
    address,
    specifications,
    notes,
    warnings,
  };
}

export function findMatchingClientId(clientName: string, clients: Array<{ id: string; name: string; trade_name: string | null }>) {
  const wanted = normalizePdfText(clientName);
  if (!wanted) return "";
  const exact = clients.find((client) => [client.name, client.trade_name || ""].some((name) => normalizePdfText(name) === wanted));
  if (exact) return exact.id;
  const fuzzy = clients.find((client) => [client.name, client.trade_name || ""].some((name) => {
    const normalized = normalizePdfText(name);
    return normalized.length >= 4 && (wanted.includes(normalized) || normalized.includes(wanted));
  }));
  return fuzzy?.id || "";
}

export function suggestSectorId(serviceTitle: string, specifications: string, sectors: Sector[]) {
  const content = normalizePdfText(`${serviceTitle} ${specifications}`);
  const normalizedSectors = sectors.map((sector) => ({ ...sector, normalized: normalizePdfText(sector.name) }));
  const find = (...terms: string[]) => normalizedSectors.find((sector) => terms.some((term) => sector.normalized.includes(normalizePdfText(term))))?.id;

  if (/ADESIV|ENVELOPAMENTO/.test(content)) return find("ADESIVAGEM", "ENVELOPAMENTO", "ADESIVO") || sectors[0]?.id || "";
  if (/IMPRESSAO|BANNER|LONA/.test(content)) return find("IMPRESSAO") || sectors[0]?.id || "";
  if (/ESTRUTURA|SERRALHER|FERRO|METAL/.test(content)) return find("SERRALHERIA", "METALURGIA", "SER. FERRO") || sectors[0]?.id || "";
  if (/PVC|ACRILICO|RECORTADO|LASER/.test(content) && /SEM ILUMINACAO|INTERNO/.test(content)) return find("LASER", "RECORTE") || find("MONTAGEM LETRAS") || sectors[0]?.id || "";
  if (/LETREIRO|LETRA CAIXA|LUMINOS/.test(content)) return find("MONTAGEM LETRAS", "LETREIRO", "MONTAGEM") || sectors[0]?.id || "";
  if (/ACM|FACHADA/.test(content)) return find("MONTAGEM ACM", "ACM") || sectors[0]?.id || "";
  return sectors[0]?.id || "";
}
