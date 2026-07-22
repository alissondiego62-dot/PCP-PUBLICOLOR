"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ClientSelector } from "@/components/ClientSelector";
import type { OrderBatchSubmission } from "@/components/OrderBatchForm";
import {
  findMatchingClientId,
  groupPdfTextItems,
  parsePublicolorPdfPage,
  suggestSectorId,
  type ParsedPdfOrderPage,
} from "@/lib/pdf-order-import";
import type { Client, Priority, Sector } from "@/lib/pcp-types";
import { automaticOrderNumberHint, requiresAutomaticOrderNumber } from "@/lib/order-number";

const PDFJS_VERSION = "4.10.38";
const MAX_PDF_SIZE = 50 * 1024 * 1024;
const MAX_PAGES = 80;
const A4_LANDSCAPE_WIDTH = 1600;
const A4_LANDSCAPE_HEIGHT = Math.round((A4_LANDSCAPE_WIDTH * 210) / 297);
const A4_PADDING = 28;

type PdfPageImportMode = "new_order" | "complement";

type ImportedPage = ParsedPdfOrderPage & {
  key: string;
  enabled: boolean;
  importMode: PdfPageImportMode;
  complementTargetKey: string;
  suffix: string;
  clientId: string;
  job: string;
  priority: Priority;
  consultant: string;
  sectorId: string;
  target: string;
  installationAddress: string;
  materials: string;
  orderNotes: string;
  image: File;
  previewUrl: string;
  useAsThumbnail: boolean;
};

type Props = {
  clients: Client[];
  sectors: Sector[];
  consultants: string[];
  busy: boolean;
  onSubmit: (submission: OrderBatchSubmission) => Promise<boolean>;
  onCancel: () => void;
  onCreateClient: (onCreated: (client: Client) => void) => void;
  onEditClient: (client: Client, onSaved?: (client: Client) => void) => void;
  onEnsureClient: (name: string) => Promise<Client>;
};

type PdfPageLike = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: Array<{ str?: string; width?: number; transform?: number[] }> }>;
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  cleanup?: () => void;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  cleanup?: () => void;
  destroy?: () => Promise<void>;
};

function activeClientName(client: Client | undefined) {
  return client?.trade_name || client?.name || "Cliente não selecionado";
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível gerar a miniatura da página.")), "image/png");
  });
}

async function renderPageAsPng(page: PdfPageLike, fileName: string) {
  const sourceViewport = page.getViewport({ scale: 1 });
  const availableWidth = A4_LANDSCAPE_WIDTH - A4_PADDING * 2;
  const availableHeight = A4_LANDSCAPE_HEIGHT - A4_PADDING * 2;
  const fitScale = Math.min(
    availableWidth / Math.max(1, sourceViewport.width),
    availableHeight / Math.max(1, sourceViewport.height),
  );
  const pageViewport = page.getViewport({ scale: fitScale });

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = Math.max(1, Math.round(pageViewport.width));
  pageCanvas.height = Math.max(1, Math.round(pageViewport.height));
  const pageContext = pageCanvas.getContext("2d", { alpha: false });
  if (!pageContext) throw new Error("O navegador não conseguiu preparar a imagem da página.");
  pageContext.fillStyle = "#ffffff";
  pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  await page.render({ canvasContext: pageContext, viewport: pageViewport }).promise;

  const a4Canvas = document.createElement("canvas");
  a4Canvas.width = A4_LANDSCAPE_WIDTH;
  a4Canvas.height = A4_LANDSCAPE_HEIGHT;
  const a4Context = a4Canvas.getContext("2d", { alpha: false });
  if (!a4Context) throw new Error("O navegador não conseguiu preparar a folha A4 em paisagem.");
  a4Context.fillStyle = "#ffffff";
  a4Context.fillRect(0, 0, a4Canvas.width, a4Canvas.height);
  const offsetX = Math.round((a4Canvas.width - pageCanvas.width) / 2);
  const offsetY = Math.round((a4Canvas.height - pageCanvas.height) / 2);
  a4Context.drawImage(pageCanvas, offsetX, offsetY);

  const blob = await canvasToBlob(a4Canvas);
  pageCanvas.width = 1;
  pageCanvas.height = 1;
  a4Canvas.width = 1;
  a4Canvas.height = 1;
  if (blob.size > 5 * 1024 * 1024) throw new Error("A miniatura A4 gerada ficou maior que 5 MB. Reduza a complexidade do PDF.");
  return new File([blob], fileName, { type: "image/png", lastModified: Date.now() });
}

async function loadPdfJs() {
  const moduleUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
  const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  const pdfjs = await import(/* @vite-ignore */ moduleUrl) as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (options: { data: Uint8Array; useSystemFonts?: boolean }) => { promise: Promise<PdfDocumentLike>; destroy?: () => Promise<void> };
  };
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

function combineNotes(page: ParsedPdfOrderPage, sourceName: string) {
  return [
    page.notes,
    page.period ? `Período indicado: ${page.period}` : "",
    `Importado do PDF: ${sourceName} - página ${page.pageNumber}/${page.totalPages}`,
  ].filter(Boolean).join("\n");
}

export function PdfOrderImporter({
  clients,
  sectors,
  consultants,
  busy,
  onSubmit,
  onCancel,
  onCreateClient,
  onEditClient,
  onEnsureClient,
}: Props) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [pages, setPages] = useState<ImportedPage[]>([]);
  const [baseOp, setBaseOp] = useState("");
  const [sharedClientId, setSharedClientId] = useState("");
  const [sharedTarget, setSharedTarget] = useState("");
  const [sharedConsultant, setSharedConsultant] = useState("");
  const [sharedPriority, setSharedPriority] = useState<Priority>("normal");
  const [sharedAddress, setSharedAddress] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  const activeClients = useMemo(() => clients.filter((client) => client.active), [clients]);
  const enabledPages = useMemo(() => pages.filter((page) => page.enabled), [pages]);
  const orderPages = useMemo(() => enabledPages.filter((page) => page.importMode === "new_order"), [enabledPages]);
  const complementPages = useMemo(() => enabledPages.filter((page) => page.importMode === "complement"), [enabledPages]);
  const sharedClient = clients.find((client) => client.id === sharedClientId);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function clearPreviews() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
  }

  function updatePage<K extends keyof ImportedPage>(key: string, field: K, value: ImportedPage[K]) {
    setPages((current) => current.map((page) => page.key === key ? { ...page, [field]: value } : page));
  }

  function setPageEnabled(key: string, enabled: boolean) {
    setPages((current) => {
      const remainingTargets = current.filter((page) => page.key !== key && page.enabled && page.importMode === "new_order");
      const fallbackTarget = remainingTargets[0]?.key || "";
      return current.map((page) => {
        if (page.key === key) return { ...page, enabled };
        if (!enabled && page.importMode === "complement" && page.complementTargetKey === key) {
          return { ...page, complementTargetKey: fallbackTarget };
        }
        return page;
      });
    });
  }

  function setPageImportMode(key: string, importMode: PdfPageImportMode) {
    setPages((current) => {
      const pageIndex = current.findIndex((page) => page.key === key);
      if (pageIndex < 0) return current;
      const previousTarget = [...current.slice(0, pageIndex)].reverse().find((page) => page.enabled && page.importMode === "new_order" && page.key !== key);
      const anyTarget = current.find((page) => page.enabled && page.importMode === "new_order" && page.key !== key);
      const fallbackTargetKey = previousTarget?.key || anyTarget?.key || "";
      const next = current.map((page) => page.key === key
        ? {
          ...page,
          importMode,
          complementTargetKey: importMode === "complement" ? (page.complementTargetKey || fallbackTargetKey) : "",
          useAsThumbnail: importMode === "complement" ? page.useAsThumbnail : false,
        }
        : page);
      if (importMode === "complement") {
        const remainingOrderTarget = next.find((page) => page.enabled && page.importMode === "new_order" && page.key !== key)?.key || "";
        return next.map((page) => page.importMode === "complement" && page.complementTargetKey === key
          ? { ...page, complementTargetKey: remainingOrderTarget }
          : page);
      }
      return next;
    });
  }

  function setComplementThumbnail(key: string, enabled: boolean) {
    setPages((current) => {
      const source = current.find((page) => page.key === key);
      if (!source) return current;
      return current.map((page) => {
        if (page.key === key) return { ...page, useAsThumbnail: enabled };
        if (enabled && source.complementTargetKey && page.key !== key && page.importMode === "complement" && page.complementTargetKey === source.complementTargetKey) {
          return { ...page, useAsThumbnail: false };
        }
        return page;
      });
    });
  }

  function applySharedClient(clientId: string, providedClient?: Client) {
    const previous = sharedClientId;
    setSharedClientId(clientId);
    const nextClient = providedClient || clients.find((client) => client.id === clientId);
    const nextAddress = [nextClient?.address, nextClient?.district, [nextClient?.city, nextClient?.state].filter(Boolean).join(" - ")].filter(Boolean).join(", ");
    setPages((current) => current.map((page) => page.clientId === previous || !page.clientId
      ? { ...page, clientId, installationAddress: page.installationAddress || nextAddress }
      : page));
  }

  function applySharedField(field: "target" | "consultant" | "priority" | "installationAddress", value: string) {
    if (field === "target") setSharedTarget(value);
    if (field === "consultant") setSharedConsultant(value);
    if (field === "priority") setSharedPriority(value as Priority);
    if (field === "installationAddress") setSharedAddress(value);
    setPages((current) => current.map((page) => ({ ...page, [field]: value })));
  }

  async function readPdf(file: File) {
    setError("");
    setWarnings([]);
    if (file.type !== "application/pdf" && !file.name.toLocaleLowerCase("pt-BR").endsWith(".pdf")) {
      setError("Selecione um arquivo PDF.");
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      setError("O PDF pode ter no máximo 50 MB.");
      return;
    }

    setParsing(true);
    setProgress(0);
    clearPreviews();
    setPages([]);
    setSourceFile(file);

    let pdf: PdfDocumentLike | null = null;
    try {
      const pdfjs = await loadPdfJs();
      const bytes = new Uint8Array(await file.arrayBuffer());
      pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
      if (!pdf.numPages) throw new Error("O PDF não possui páginas.");
      if (pdf.numPages > MAX_PAGES) throw new Error(`O importador aceita no máximo ${MAX_PAGES} páginas por arquivo.`);

      const parsedPages: Array<{ parsed: ParsedPdfOrderPage; image: File; previewUrl: string }> = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setProgress(Math.round(((pageNumber - 1) / pdf.numPages) * 100));
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const lines = groupPdfTextItems(textContent.items);
        const parsed = parsePublicolorPdfPage(lines, pageNumber, pdf.numPages, consultants);
        if (parsed.rawText.replace(/\s/g, "").length < 30) {
          parsed.warnings.push(`Página ${pageNumber}: pouco texto foi encontrado. Revise os campos; a página pode ser uma imagem digitalizada.`);
        }
        const baseName = (parsed.opNumber || file.name.replace(/\.pdf$/i, "OP")).replace(/[^a-zA-Z0-9_-]+/g, "-");
        const image = await renderPageAsPng(page, `${baseName}-pagina-${String(pageNumber).padStart(2, "0")}.png`);
        const previewUrl = URL.createObjectURL(image);
        previewUrlsRef.current.push(previewUrl);
        parsedPages.push({ parsed, image, previewUrl });
        page.cleanup?.();
      }

      const first = parsedPages[0]?.parsed;
      const detectedClientId = findMatchingClientId(first?.clientName || "", activeClients);
      const detectedOp = parsedPages.find((page) => page.parsed.opNumber)?.parsed.opNumber || "";
      const detectedTarget = parsedPages.find((page) => page.parsed.targetDate)?.parsed.targetDate || "";
      const detectedConsultant = parsedPages.find((page) => page.parsed.consultantName)?.parsed.consultantName || "";
      const detectedAddress = parsedPages.find((page) => page.parsed.address)?.parsed.address || "";

      setBaseOp(detectedOp);
      setSharedClientId(detectedClientId);
      setSharedTarget(detectedTarget);
      setSharedConsultant(detectedConsultant);
      setSharedPriority("normal");
      setSharedAddress(detectedAddress);
      setPages(parsedPages.map(({ parsed, image, previewUrl }) => ({
        ...parsed,
        key: crypto.randomUUID(),
        enabled: true,
        importMode: "new_order",
        complementTargetKey: "",
        suffix: String(parsed.pageNumber).padStart(parsed.totalPages >= 10 ? 2 : 1, "0"),
        clientId: detectedClientId,
        job: parsed.serviceTitle,
        priority: "normal",
        consultant: parsed.consultantName || detectedConsultant,
        sectorId: sectors.find((sector) => sector.name.trim().toLocaleUpperCase("pt-BR") === "PCP")?.id
          || suggestSectorId(parsed.serviceTitle, parsed.specifications, sectors),
        target: parsed.targetDate || detectedTarget,
        installationAddress: parsed.address || detectedAddress,
        materials: parsed.specifications,
        orderNotes: combineNotes(parsed, file.name),
        image,
        previewUrl,
        useAsThumbnail: false,
      })));
      setWarnings(parsedPages.flatMap((page) => page.parsed.warnings));
      setProgress(100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível ler o PDF.");
      setPages([]);
      clearPreviews();
    } finally {
      pdf?.cleanup?.();
      await pdf?.destroy?.().catch(() => undefined);
      setParsing(false);
    }
  }

  function orderNumberLabel(page: ImportedPage) {
    const batch = orderPages.length > 1;
    if (requiresAutomaticOrderNumber(baseOp)) return batch ? `Número automático · item ${page.suffix}` : "Número automático";
    if (!baseOp.trim()) return batch ? `OP não informada · item ${page.suffix}` : "OP não informada";
    return batch ? `${baseOp.trim()}-${page.suffix}` : baseOp.trim();
  }

  async function submitImport() {
    setError("");
    if (!sourceFile || !enabledPages.length) {
      setError("Selecione pelo menos uma página para importar.");
      return;
    }
    if (!orderPages.length) {
      setError("Defina pelo menos uma página como novo pedido.");
      return;
    }

    const selectedOrderKeys = new Set(orderPages.map((page) => page.key));
    const invalidComplement = complementPages.find((page) => !page.complementTargetKey || !selectedOrderKeys.has(page.complementTargetKey));
    if (invalidComplement) {
      setError(`Página ${invalidComplement.pageNumber}: selecione o pedido que receberá esta página complementar.`);
      return;
    }

    const repeatedThumbnailTarget = complementPages.reduce<Record<string, number>>((acc, page) => {
      if (!page.useAsThumbnail || !page.complementTargetKey) return acc;
      acc[page.complementTargetKey] = (acc[page.complementTargetKey] || 0) + 1;
      return acc;
    }, {});
    const duplicatedThumbnailTarget = Object.entries(repeatedThumbnailTarget).find(([, count]) => count > 1);
    if (duplicatedThumbnailTarget) {
      const target = orderPages.find((page) => page.key === duplicatedThumbnailTarget[0]);
      setError(`Escolha somente uma página complementar como miniatura principal para ${target ? orderNumberLabel(target) : "o pedido selecionado"}.`);
      return;
    }

    const suffixes = orderPages.map((page) => page.suffix.trim());
    if (orderPages.length > 1 && suffixes.some((suffix) => !/^\d+$/.test(suffix))) {
      setError("Todos os novos pedidos precisam de um número de subpedido válido.");
      return;
    }
    if (new Set(suffixes).size !== suffixes.length) {
      setError("Existem novos pedidos com o mesmo número de subpedido.");
      return;
    }

    let resolvedPages = orderPages.map((page) => ({ ...page }));
    const ensuredClients = new Map<string, Client>();

    try {
      for (const page of resolvedPages) {
        if (clients.some((client) => client.id === page.clientId)) continue;
        const clientName = page.clientName.trim() || pages[0]?.clientName.trim() || "";
        if (!clientName) {
          setError(`Página ${page.pageNumber}: o nome do cliente não foi identificado no PDF.`);
          return;
        }
        const normalizedName = clientName.toLocaleUpperCase("pt-BR").replace(/\s+/g, " ").trim();
        const cached = ensuredClients.get(normalizedName);
        const ensured = cached || await onEnsureClient(clientName);
        ensuredClients.set(normalizedName, ensured);
        page.clientId = ensured.id;
      }
    } catch (clientError) {
      setError(clientError instanceof Error ? clientError.message : "Não foi possível cadastrar automaticamente o cliente identificado no PDF.");
      return;
    }

    if (ensuredClients.size) {
      const firstEnsured = ensuredClients.values().next().value as Client | undefined;
      if (firstEnsured) {
        setSharedClientId(firstEnsured.id);
        setPages((current) => current.map((page) => {
          const resolved = resolvedPages.find((item) => item.key === page.key);
          return resolved ? { ...page, clientId: resolved.clientId } : page;
        }));
      }
    }

    for (const page of resolvedPages) {
      if (!page.clientId) {
        setError(`Página ${page.pageNumber}: selecione ou cadastre o cliente.`);
        return;
      }
      if (!page.job.trim()) {
        setError(`Página ${page.pageNumber}: confirme o serviço.`);
        return;
      }
      if (!page.target) {
        setError(`Página ${page.pageNumber}: confirme a data da instalação ou entrega.`);
        return;
      }
      if (!page.sectorId) {
        setError(`Página ${page.pageNumber}: selecione o setor inicial.`);
        return;
      }
    }

    const complementsByTarget = new Map<string, ImportedPage[]>();
    for (const complement of complementPages) {
      const list = complementsByTarget.get(complement.complementTargetKey) || [];
      list.push(complement);
      complementsByTarget.set(complement.complementTargetKey, list);
    }

    const isBatch = resolvedPages.length > 1;
    const success = await onSubmit({
      mode: isBatch ? "batch" : "single",
      baseOp: baseOp.trim(),
      items: resolvedPages.map((page) => {
        const complements = complementsByTarget.get(page.key) || [];
        const selectedComplement = complements.find((item) => item.useAsThumbnail);
        const selectedThumbnail = selectedComplement || page;
        const galleryPages = selectedComplement
          ? [page, ...complements.filter((item) => item.key !== selectedComplement.key)]
          : complements;
        const complementNoteLines = complements.map((item) => `Página complementar ${item.pageNumber}/${item.totalPages}: ${item.job.trim() || "documento complementar"}.`);
        return {
          opNumber: isBatch
            ? `${requiresAutomaticOrderNumber(baseOp) ? "0000" : baseOp.trim()}-${page.suffix.trim()}`
            : baseOp.trim(),
          suffix: page.suffix.trim(),
          clientId: page.clientId,
          job: page.job.trim(),
          targetDate: page.target,
          priority: page.priority,
          consultantName: page.consultant.trim(),
          sectorId: page.sectorId,
          installationAddress: page.installationAddress.trim(),
          materials: page.materials.trim(),
          notes: [page.orderNotes.trim(), ...complementNoteLines].filter(Boolean).join("\n"),
          image: selectedThumbnail.image,
          sourceDocument: sourceFile,
          imageSource: "pdf_page" as const,
          additionalDocuments: galleryPages.map((item) => item.image),
          additionalDocumentNotes: galleryPages.map((item) => [
            item.key === page.key
              ? `Página principal original ${page.pageNumber}/${page.totalPages}, preservada como página complementar porque outra página foi selecionada para a miniatura.`
              : `Página ${item.pageNumber}/${item.totalPages} adicionada como complemento da página ${page.pageNumber}.`,
            item.job.trim() ? `Descrição: ${item.job.trim()}` : "",
            item.orderNotes.trim(),
          ].filter(Boolean).join("\n")),
        };
      }),
    });
    if (success) onCancel();
  }

  return <div className="pdf-importer">
    <section className={`pdf-import-drop-section ${dragActive ? "drag-active" : ""}`} onDragEnter={(event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()} onDragLeave={(event: DragEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files?.[0]; if (file) void readPdf(file); }}>
      <div>
        <small>IMPORTAÇÃO INTELIGENTE</small>
        <h3>Selecione a ordem de serviço em PDF</h3>
        <p>Cada página pode criar um novo pedido ou ser anexada como complemento de outro pedido do mesmo PDF. O PDF original também será anexado automaticamente ao Google Drive de cada pedido criado.</p>{sourceFile && <span className="pdf-source-file">{sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(2)} MB</span>}
      </div>
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) void readPdf(file);
        event.currentTarget.value = "";
      }} />
      <button type="button" className="pdf-pick-button" onClick={() => fileInputRef.current?.click()} disabled={parsing || busy}>
        {sourceFile ? "Trocar PDF" : "Selecionar PDF"}
      </button>
    </section>

    {parsing && <div className="pdf-import-progress"><span style={{ width: `${progress}%` }} /><b>Lendo páginas, identificando campos e gerando miniaturas… {progress}%</b></div>}
    {error && <div className="auth-error">{error}</div>}
    {!!warnings.length && <details className="pdf-import-warnings"><summary>{warnings.length} informação(ões) precisam de conferência</summary>{warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}</details>}

    {!!pages.length && <>
      <section className="pdf-import-shared">
        <header><div><small>DADOS IDENTIFICADOS</small><h3>Informações gerais da OP</h3></div><span>{pages.length} página(s) lida(s) · {orderPages.length} pedido(s) · {complementPages.length} complemento(s)</span></header>
        <div className="form-grid pdf-import-shared-grid">
          <label>Número da OP<input value={baseOp} onChange={(event: ChangeEvent<HTMLInputElement>) => setBaseOp(event.target.value)} placeholder="Ex.: 959 ou 0000" /><small>{automaticOrderNumberHint()}</small></label>
          <label className="wide">Cliente
            <ClientSelector
              clients={activeClients}
              value={sharedClientId}
              onChange={applySharedClient}
              onCreate={() => onCreateClient((client) => applySharedClient(client.id, client))}
              onEdit={(client: Client) => onEditClient(client, (saved) => applySharedClient(saved.id, saved))}
            />
            {!sharedClientId && <small className="pdf-field-warning">O nome foi lido como “{pages[0]?.clientName || "não identificado"}”. Ao confirmar a importação, o cliente será cadastrado automaticamente apenas com esse nome.</small>}
          </label>
          <label>Data da instalação ou entrega<input type="date" value={sharedTarget} onChange={(event: ChangeEvent<HTMLInputElement>) => applySharedField("target", event.target.value)} /></label>
          <label>Responsável<select value={sharedConsultant} onChange={(event: ChangeEvent<HTMLSelectElement>) => applySharedField("consultant", event.target.value)}><option value="">Não definido</option>{consultants.map((consultant) => <option key={consultant} value={consultant}>{consultant}</option>)}</select></label>
          <label>Prioridade<select value={sharedPriority} onChange={(event: ChangeEvent<HTMLSelectElement>) => applySharedField("priority", event.target.value)}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baixa</option></select></label>
          <label className="wide">Endereço da instalação ou entrega<textarea value={sharedAddress} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => applySharedField("installationAddress", event.target.value)} /></label>
        </div>
      </section>

      <section className="pdf-import-pages">
        <header><div><small>REVISÃO POR PÁGINA</small><h3>Pedidos e páginas complementares</h3></div><p>Em cada página, escolha se será um novo pedido ou um complemento de outro pedido.</p></header>
        <div className="pdf-page-list">
          {pages.map((page) => {
            const client = clients.find((item) => item.id === page.clientId);
            const targetCandidates = pages.filter((item) => item.key !== page.key && item.enabled && item.importMode === "new_order");
            const targetPage = pages.find((item) => item.key === page.complementTargetKey);
            const targetLabel = targetPage
              ? `Página ${targetPage.pageNumber} · ${orderNumberLabel(targetPage)}`
              : "Selecione o pedido";
            return <article className={`pdf-page-card ${page.enabled ? "" : "disabled"} ${page.importMode === "complement" ? "complement-page" : "new-order-page"}`} key={page.key}>
              <div className="pdf-page-preview">
                <img src={page.previewUrl} alt={`Página ${page.pageNumber} do PDF`} />
                <span>Página {page.pageNumber}/{page.totalPages}</span>
              </div>
              <div className="pdf-page-editor">
                <header>
                  <div className="pdf-page-header-controls">
                    <label className="pdf-page-toggle"><input type="checkbox" checked={page.enabled} onChange={(event: ChangeEvent<HTMLInputElement>) => setPageEnabled(page.key, event.target.checked)} /><span>Importar esta página</span></label>
                    <label className="pdf-page-mode-label">Como importar
                      <select value={page.importMode} disabled={!page.enabled} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPageImportMode(page.key, event.target.value as PdfPageImportMode)}>
                        <option value="new_order">Novo pedido</option>
                        <option value="complement" disabled={!targetCandidates.length}>Complemento de outro pedido</option>
                      </select>
                    </label>
                  </div>
                  <b>{page.importMode === "complement"
                    ? `Complemento · ${targetLabel}`
                    : orderNumberLabel(page)}</b>
                </header>

                {page.importMode === "complement" ? <div className="pdf-page-complement-editor">
                  <div className="pdf-complement-callout"><b>Esta página não criará um novo pedido.</b><span>Ela será salva na pasta Documentos e vinculada ao pedido escolhido abaixo.</span></div>
                  <label>Adicionar como complemento de
                    <select value={page.complementTargetKey} disabled={!page.enabled} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                      const nextTarget = event.target.value;
                      updatePage(page.key, "complementTargetKey", nextTarget);
                      if (!nextTarget) updatePage(page.key, "useAsThumbnail", false);
                    }}>
                      <option value="">Selecione o pedido</option>
                      {targetCandidates.map((item) => <option key={item.key} value={item.key}>{`Página ${item.pageNumber} · ${orderNumberLabel(item)}`}</option>)}
                    </select>
                  </label>
                  <label className="pdf-page-toggle"><input type="checkbox" checked={page.useAsThumbnail} disabled={!page.enabled || !page.complementTargetKey} onChange={(event: ChangeEvent<HTMLInputElement>) => setComplementThumbnail(page.key, event.target.checked)} /><span>Usar esta página como miniatura principal do pedido selecionado</span></label>
                  <label>Descrição do complemento<textarea value={page.job} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "job", event.target.value)} disabled={!page.enabled} placeholder="Ex.: detalhe técnico, vista lateral ou continuação do projeto" /></label>
                  <label>Observações da página<textarea value={page.orderNotes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "orderNotes", event.target.value)} disabled={!page.enabled} /></label>
                </div> : <div className="form-grid pdf-page-fields">
                  {orderPages.length > 1 && <label>Número do subpedido<input inputMode="numeric" value={page.suffix} onChange={(event: ChangeEvent<HTMLInputElement>) => updatePage(page.key, "suffix", event.target.value.replace(/\D/g, ""))} disabled={!page.enabled} /></label>}
                  <label className={orderPages.length > 1 ? "wide" : ""}>Serviço<textarea value={page.job} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "job", event.target.value)} disabled={!page.enabled} /></label>
                  <label>Cliente<select value={page.clientId} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "clientId", event.target.value)} disabled={!page.enabled}><option value="">Selecione</option>{activeClients.map((item) => <option key={item.id} value={item.id}>{activeClientName(item)}</option>)}</select></label>
                  <label>Setor inicial<select value={page.sectorId} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "sectorId", event.target.value)} disabled={!page.enabled}><option value="">Selecione</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
                  <label>Data da instalação/entrega<input type="date" value={page.target} onChange={(event: ChangeEvent<HTMLInputElement>) => updatePage(page.key, "target", event.target.value)} disabled={!page.enabled} /></label>
                  <label>Responsável<select value={page.consultant} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "consultant", event.target.value)} disabled={!page.enabled}><option value="">Não definido</option>{consultants.map((consultant) => <option key={consultant} value={consultant}>{consultant}</option>)}</select></label>
                  <label>Prioridade<select value={page.priority} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "priority", event.target.value as Priority)} disabled={!page.enabled}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baixa</option></select></label>
                  <label className="wide">Endereço<textarea value={page.installationAddress} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "installationAddress", event.target.value)} disabled={!page.enabled} /></label>
                  <label className="wide">Materiais e especificações<textarea value={page.materials} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "materials", event.target.value)} disabled={!page.enabled} /></label>
                  <label className="wide">Observações<textarea value={page.orderNotes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "orderNotes", event.target.value)} disabled={!page.enabled} /></label>
                </div>}
                <div className="pdf-page-detection"><span>Cliente lido: <b>{page.clientName || "não identificado"}</b></span>{page.importMode === "new_order" && <span>Cadastro selecionado: <b>{activeClientName(client)}</b></span>}<span>Arquivo no Drive: <b>{page.image.name}</b> · pasta Documentos</span></div>
              </div>
            </article>;
          })}
        </div>
      </section>
    </>}

    <div className="actions pdf-import-actions">
      <button type="button" onClick={onCancel} disabled={busy || parsing}>Cancelar</button>
      {!!pages.length && <button type="button" className="primary" onClick={() => void submitImport()} disabled={busy || parsing || !orderPages.length}>{busy ? "Cadastrando…" : `Importar ${orderPages.length} pedido(s)${complementPages.length ? ` + ${complementPages.length} complemento(s)` : ""}`}</button>}
    </div>
  </div>;
}
