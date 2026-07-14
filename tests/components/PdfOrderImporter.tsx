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
const MAX_THUMBNAIL_SIZE = 4.8 * 1024 * 1024;

type ImportedPage = ParsedPdfOrderPage & {
  key: string;
  enabled: boolean;
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
  const baseViewport = page.getViewport({ scale: 1 });
  let scale = Math.min(1.6, 1500 / Math.max(1, baseViewport.width));
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("O navegador não conseguiu preparar a imagem da página.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    blob = await canvasToBlob(canvas);
    canvas.width = 1;
    canvas.height = 1;
    if (blob.size <= MAX_THUMBNAIL_SIZE) break;
    scale *= 0.78;
  }

  if (!blob) throw new Error("Não foi possível gerar a miniatura da página.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("A miniatura gerada ficou maior que 5 MB. Reduza a complexidade do PDF.");
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

  async function submitImport() {
    setError("");
    if (!sourceFile || !enabledPages.length) {
      setError("Selecione pelo menos uma página para importar.");
      return;
    }
    const suffixes = enabledPages.map((page) => page.suffix.trim());
    if (enabledPages.length > 1 && suffixes.some((suffix) => !/^\d+$/.test(suffix))) {
      setError("Todas as páginas precisam de um número de subpedido válido.");
      return;
    }
    if (new Set(suffixes).size !== suffixes.length) {
      setError("Existem páginas com o mesmo número de subpedido.");
      return;
    }

    let resolvedPages = enabledPages.map((page) => ({ ...page }));
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

    const isBatch = resolvedPages.length > 1;
    const success = await onSubmit({
      mode: isBatch ? "batch" : "single",
      baseOp: baseOp.trim(),
      items: resolvedPages.map((page) => ({
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
        notes: page.orderNotes.trim(),
        image: page.image,
        imageSource: "pdf_page",
      })),
    });
    if (success) onCancel();
  }

  return <div className="pdf-importer">
    <section className={`pdf-import-drop-section ${dragActive ? "drag-active" : ""}`} onDragEnter={(event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()} onDragLeave={(event: DragEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event: DragEvent<HTMLElement>) => { event.preventDefault(); setDragActive(false); const file = event.dataTransfer.files?.[0]; if (file) void readPdf(file); }}>
      <div>
        <small>IMPORTAÇÃO INTELIGENTE</small>
        <h3>Selecione a ordem de serviço em PDF</h3>
        <p>Cada página será transformada em um pedido ou subpedido, enviada ao Google Drive em Documentos e usada como miniatura.</p>{sourceFile && <span className="pdf-source-file">{sourceFile.name} · {(sourceFile.size / 1024 / 1024).toFixed(2)} MB</span>}
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
        <header><div><small>DADOS IDENTIFICADOS</small><h3>Informações gerais da OP</h3></div><span>{pages.length} página(s) lida(s) · {enabledPages.length} selecionada(s)</span></header>
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
        <header><div><small>REVISÃO POR PÁGINA</small><h3>Subpedidos que serão cadastrados</h3></div><p>Revise os campos antes de confirmar. Você pode desmarcar uma página.</p></header>
        <div className="pdf-page-list">
          {pages.map((page) => {
            const client = clients.find((item) => item.id === page.clientId);
            return <article className={`pdf-page-card ${page.enabled ? "" : "disabled"}`} key={page.key}>
              <div className="pdf-page-preview">
                <img src={page.previewUrl} alt={`Página ${page.pageNumber} do PDF`} />
                <span>Página {page.pageNumber}/{page.totalPages}</span>
              </div>
              <div className="pdf-page-editor">
                <header>
                  <label className="pdf-page-toggle"><input type="checkbox" checked={page.enabled} onChange={(event: ChangeEvent<HTMLInputElement>) => updatePage(page.key, "enabled", event.target.checked)} /><span>Importar esta página</span></label>
                  <b>{requiresAutomaticOrderNumber(baseOp) ? `Número automático · item ${page.suffix}` : `${baseOp}-${page.suffix}`}</b>
                </header>
                <div className="form-grid pdf-page-fields">
                  {pages.length > 1 && <label>Número do subpedido<input inputMode="numeric" value={page.suffix} onChange={(event: ChangeEvent<HTMLInputElement>) => updatePage(page.key, "suffix", event.target.value.replace(/\D/g, ""))} disabled={!page.enabled} /></label>}
                  <label className={pages.length > 1 ? "wide" : ""}>Serviço<textarea value={page.job} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "job", event.target.value)} disabled={!page.enabled} /></label>
                  <label>Cliente<select value={page.clientId} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "clientId", event.target.value)} disabled={!page.enabled}><option value="">Selecione</option>{activeClients.map((item) => <option key={item.id} value={item.id}>{activeClientName(item)}</option>)}</select></label>
                  <label>Setor inicial<select value={page.sectorId} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "sectorId", event.target.value)} disabled={!page.enabled}><option value="">Selecione</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
                  <label>Data da instalação/entrega<input type="date" value={page.target} onChange={(event: ChangeEvent<HTMLInputElement>) => updatePage(page.key, "target", event.target.value)} disabled={!page.enabled} /></label>
                  <label>Responsável<select value={page.consultant} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "consultant", event.target.value)} disabled={!page.enabled}><option value="">Não definido</option>{consultants.map((consultant) => <option key={consultant} value={consultant}>{consultant}</option>)}</select></label>
                  <label>Prioridade<select value={page.priority} onChange={(event: ChangeEvent<HTMLSelectElement>) => updatePage(page.key, "priority", event.target.value as Priority)} disabled={!page.enabled}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baixa</option></select></label>
                  <label className="wide">Endereço<textarea value={page.installationAddress} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "installationAddress", event.target.value)} disabled={!page.enabled} /></label>
                  <label className="wide">Materiais e especificações<textarea value={page.materials} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "materials", event.target.value)} disabled={!page.enabled} /></label>
                  <label className="wide">Observações<textarea value={page.orderNotes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updatePage(page.key, "orderNotes", event.target.value)} disabled={!page.enabled} /></label>
                </div>
                <div className="pdf-page-detection"><span>Cliente lido: <b>{page.clientName || "não identificado"}</b></span><span>Cadastro selecionado: <b>{activeClientName(client)}</b></span><span>Arquivo no Drive: <b>{page.image.name}</b> · pasta Documentos</span></div>
              </div>
            </article>;
          })}
        </div>
      </section>
    </>}

    <div className="actions pdf-import-actions">
      <button type="button" onClick={onCancel} disabled={busy || parsing}>Cancelar</button>
      {!!pages.length && <button type="button" className="primary" onClick={() => void submitImport()} disabled={busy || parsing || !enabledPages.length}>{busy ? "Cadastrando…" : `Importar ${enabledPages.length} pedido(s)`}</button>}
    </div>
  </div>;
}
