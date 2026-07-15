"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { unzipSync } from "fflate";
import { driveAuthenticatedJson, uploadFileToOrderDrive } from "@/lib/google-drive-client";
import { driveThumbnailFileId } from "@/lib/order-thumbnail";

type ThumbnailOrder = {
  id: string;
  op_number: string;
  client_name: string;
  main_image_path: string | null;
};

type OrdersPayload = {
  orders: ThumbnailOrder[];
};

type FinalizePayload = {
  ok: boolean;
  replaced_previous: boolean;
  previous_warning: string | null;
};

type PlannedThumbnail = {
  entryName: string;
  order: ThumbnailOrder;
  bytes: Uint8Array;
  score: number;
};

type AnalysisSummary = {
  zipName: string;
  pngFiles: number;
  matchedOrders: number;
  unmatchedFiles: string[];
  duplicateFiles: string[];
  oversizedFiles: string[];
};

type ImportResult = {
  uploaded: number;
  replaced: number;
  errors: Array<{ opNumber: string; fileName: string; message: string }>;
  warnings: Array<{ opNumber: string; message: string }>;
};

const MAX_ZIP_SIZE = 300 * 1024 * 1024;
const MAX_PNG_SIZE = 25 * 1024 * 1024;
const MAX_PNG_FILES = 1500;

function normalizedOp(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\.(PNG|JPG|JPEG|WEBP)$/i, "")
    .replace(/\b(ORDEM DE SERVICO|ORDEM|SUBPEDIDO|PEDIDO|MINIATURA|THUMBNAIL|CAPA|OP)\b/g, " ")
    .replace(/[–—_\s]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeFileOrderNumber(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "SEM-OP";
}

function entryBaseName(path: string) {
  return path.split("/").pop() || path;
}

function matchScore(fileName: string, orderNumber: string) {
  const normalizedFile = normalizedOp(entryBaseName(fileName));
  const normalizedOrder = normalizedOp(orderNumber);
  if (!normalizedFile || !normalizedOrder) return 0;
  if (normalizedFile === normalizedOrder) return 1000 + normalizedOrder.length;

  const paddedFile = `-${normalizedFile}-`;
  const paddedOrder = `-${normalizedOrder}-`;
  if (paddedFile.includes(paddedOrder)) return 500 + normalizedOrder.length;
  return 0;
}

function selectOrderForFile(fileName: string, orders: ThumbnailOrder[]) {
  let selected: ThumbnailOrder | null = null;
  let selectedScore = 0;

  for (const order of orders) {
    const score = matchScore(fileName, order.op_number);
    if (score > selectedScore) {
      selected = order;
      selectedScore = score;
    }
  }

  return selected ? { order: selected, score: selectedScore } : null;
}

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ThumbnailZipImportPanel() {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"analyzing" | "uploading" | "">("");
  const [feedback, setFeedback] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);
  const [currentFile, setCurrentFile] = useState("");
  const [overallProgress, setOverallProgress] = useState(0);
  const [fileProgress, setFileProgress] = useState(0);
  const plannedRef = useRef<PlannedThumbnail[]>([]);
  const cancelRequestedRef = useRef(false);

  const canImport = Boolean(analysis?.matchedOrders && plannedRef.current.length && !busy);
  const analysisHasWarnings = Boolean(
    analysis && (analysis.unmatchedFiles.length || analysis.duplicateFiles.length || analysis.oversizedFiles.length),
  );

  const resultStatus = useMemo(() => {
    if (!result) return null;
    if (result.errors.length) return "warning" as const;
    return "success" as const;
  }, [result]);

  async function analyzeSelectedZip(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Selecione um arquivo ZIP.");
    if (file.size > MAX_ZIP_SIZE) throw new Error("O ZIP deve ter no máximo 300 MB.");

    const ordersPayload = await driveAuthenticatedJson<OrdersPayload>("/api/admin/thumbnail-zip/orders");
    if (!ordersPayload.orders.length) throw new Error("Nenhum pedido foi encontrado no banco.");

    const archive = unzipSync(new Uint8Array(await file.arrayBuffer())) as Record<string, Uint8Array>;
    const pngEntries = Object.entries(archive)
      .filter(([name]) => !name.endsWith("/") && !name.includes("/__MACOSX/") && name.toLowerCase().endsWith(".png"));

    if (!pngEntries.length) throw new Error("O ZIP não contém arquivos PNG.");
    if (pngEntries.length > MAX_PNG_FILES) throw new Error(`O ZIP possui mais de ${MAX_PNG_FILES} imagens PNG.`);

    const unmatchedFiles: string[] = [];
    const oversizedFiles: string[] = [];
    const candidates = new Map<string, PlannedThumbnail[]>();

    for (const [entryName, bytes] of pngEntries) {
      if (bytes.byteLength > MAX_PNG_SIZE) {
        oversizedFiles.push(`${entryBaseName(entryName)} (${bytesLabel(bytes.byteLength)})`);
        continue;
      }

      const match = selectOrderForFile(entryName, ordersPayload.orders);
      if (!match) {
        unmatchedFiles.push(entryBaseName(entryName));
        continue;
      }

      const current = candidates.get(match.order.id) || [];
      current.push({ entryName, order: match.order, bytes, score: match.score });
      candidates.set(match.order.id, current);
    }

    const duplicateFiles: string[] = [];
    const planned: PlannedThumbnail[] = [];

    for (const group of candidates.values()) {
      const sorted = [...group].sort((first, second) => {
        if (second.score !== first.score) return second.score - first.score;
        return second.entryName.localeCompare(first.entryName, "pt-BR", { numeric: true });
      });
      planned.push(sorted[0]);
      for (const duplicate of sorted.slice(1)) {
        duplicateFiles.push(`${entryBaseName(duplicate.entryName)} → OP ${duplicate.order.op_number}`);
      }
    }

    planned.sort((first, second) => first.order.op_number.localeCompare(second.order.op_number, "pt-BR", { numeric: true }));
    plannedRef.current = planned;
    setAnalysis({
      zipName: file.name,
      pngFiles: pngEntries.length,
      matchedOrders: planned.length,
      unmatchedFiles,
      duplicateFiles,
      oversizedFiles,
    });
    setResult(null);

    return planned.length;
  }

  async function selectZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setZipFile(file);
    setAnalysis(null);
    setResult(null);
    plannedRef.current = [];
    setOverallProgress(0);
    setFileProgress(0);
    setCurrentFile("");
    setFeedback(null);
    if (!file) return;

    setBusy("analyzing");
    try {
      const matched = await analyzeSelectedZip(file);
      setFeedback({
        type: matched ? "success" : "warning",
        text: matched
          ? `${matched} miniatura(s) pronta(s) para importação.`
          : "Nenhum arquivo pôde ser relacionado aos pedidos atuais.",
      });
    } catch (error) {
      setZipFile(null);
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao analisar o ZIP." });
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function importThumbnails() {
    const planned = plannedRef.current;
    if (!planned.length || busy) return;
    if (!window.confirm(
      `Importar ${planned.length} miniatura(s)? A nova imagem substituirá a miniatura atual e o PNG anterior será excluído do Google Drive quando existir.`,
    )) return;

    cancelRequestedRef.current = false;
    setBusy("uploading");
    setResult(null);
    setFeedback(null);
    setOverallProgress(0);
    const importResult: ImportResult = { uploaded: 0, replaced: 0, errors: [], warnings: [] };

    for (let index = 0; index < planned.length; index += 1) {
      if (cancelRequestedRef.current) break;
      const item = planned[index];
      const previousDriveFileId = driveThumbnailFileId(item.order.main_image_path);
      const targetName = `OP-${safeFileOrderNumber(item.order.op_number)}-MINIATURA.png`;
      const fileBytes = new Uint8Array(item.bytes.byteLength);
      fileBytes.set(item.bytes);
      const file = new File([fileBytes.buffer], targetName, { type: "image/png", lastModified: Date.now() });

      setCurrentFile(`OP ${item.order.op_number} · ${entryBaseName(item.entryName)}`);
      setFileProgress(0);

      try {
        const uploaded = await uploadFileToOrderDrive({
          orderId: item.order.id,
          file,
          category: "document",
          version: "MINIATURA-ZIP",
          notes: `MINIATURA_ZIP_PUBLICOLOR | Miniatura importada em lote por ZIP e definida como miniatura oficial da OP ${item.order.op_number}. Arquivo de origem: ${entryBaseName(item.entryName)}.`,
          isApproved: true,
          onProgress: setFileProgress,
        });

        const finalized = await driveAuthenticatedJson<FinalizePayload>("/api/admin/thumbnail-zip/finalize", {
          method: "POST",
          body: JSON.stringify({
            order_id: item.order.id,
            new_drive_file_id: uploaded.drive_file_id,
            previous_drive_file_id: previousDriveFileId || null,
          }),
        });

        importResult.uploaded += 1;
        if (finalized.replaced_previous) importResult.replaced += 1;
        if (finalized.previous_warning) {
          importResult.warnings.push({ opNumber: item.order.op_number, message: finalized.previous_warning });
        }
      } catch (error) {
        importResult.errors.push({
          opNumber: item.order.op_number,
          fileName: entryBaseName(item.entryName),
          message: error instanceof Error ? error.message : "Falha desconhecida.",
        });
      }

      setOverallProgress(Math.round(((index + 1) / planned.length) * 100));
    }

    setResult(importResult);
    setCurrentFile("");
    setFileProgress(0);
    setBusy("");
    setFeedback({
      type: importResult.errors.length ? "warning" : "success",
      text: cancelRequestedRef.current
        ? `Importação interrompida. ${importResult.uploaded} arquivo(s) concluído(s).`
        : `${importResult.uploaded} miniatura(s) importada(s); ${importResult.replaced} anterior(es) substituída(s).`,
    });
  }

  return <div className="platform-card thumbnail-zip-card">
    <div className="platform-card-title">
      <span>ZIP</span>
      <div>
        <small>IMPORTAÇÃO EM LOTE</small>
        <h3>Importar miniaturas por número da OP</h3>
      </div>
    </div>

    <p className="platform-card-description">
      Envie um ZIP com arquivos PNG nomeados pelo número da OP ou do subpedido. Cada imagem será enviada para a pasta <b>04 - DOCUMENTOS</b> da ordem correspondente e passará a ser a miniatura oficial do Dashboard e do Kanban.
    </p>

    <div className="thumbnail-zip-rules">
      <span><b>Exemplos aceitos</b><code>776.png</code><code>776-02.png</code><code>OP 776-02 miniatura.png</code></span>
      <span><b>Substituição</b><small>Quando já existir miniatura, a nova assume o lugar e a anterior é excluída do Drive após a conclusão.</small></span>
    </div>

    <label className={`thumbnail-zip-picker ${zipFile ? "ready" : ""}`}>
      <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={(event) => void selectZip(event)} disabled={Boolean(busy)} />
      <span>{busy === "analyzing" ? "Analisando o ZIP…" : zipFile?.name || "Selecionar arquivo ZIP"}</span>
      <small>Até 300 MB · somente PNG · máximo de 1.500 imagens</small>
    </label>

    {feedback && <div className={`platform-feedback ${feedback.type}`}>{feedback.text}</div>}

    {analysis && <div className="thumbnail-zip-summary">
      <span><b>PNG no ZIP</b>{analysis.pngFiles}</span>
      <span><b>OPs localizadas</b>{analysis.matchedOrders}</span>
      <span><b>Sem pedido</b>{analysis.unmatchedFiles.length}</span>
      <span><b>Duplicadas ignoradas</b>{analysis.duplicateFiles.length}</span>
      <span><b>Acima de 25 MB</b>{analysis.oversizedFiles.length}</span>
    </div>}

    {analysisHasWarnings && <details className="thumbnail-zip-details">
      <summary>Ver arquivos ignorados ou com aviso</summary>
      <div>
        {analysis?.unmatchedFiles.map((name) => <p key={`unmatched-${name}`}><b>Sem OP:</b> {name}</p>)}
        {analysis?.duplicateFiles.map((name) => <p key={`duplicate-${name}`}><b>Duplicada:</b> {name}</p>)}
        {analysis?.oversizedFiles.map((name) => <p key={`oversized-${name}`}><b>Grande demais:</b> {name}</p>)}
      </div>
    </details>}

    {busy === "uploading" && <div className="thumbnail-zip-progress">
      <header><b>{currentFile}</b><span>{overallProgress}% do lote</span></header>
      <div><i style={{ width: `${overallProgress}%` }} /></div>
      <small>Arquivo atual: {fileProgress}%</small>
    </div>}

    <div className="platform-actions">
      {busy === "uploading" && <button type="button" className="danger" onClick={() => { cancelRequestedRef.current = true; }}>Interromper após o arquivo atual</button>}
      <button type="button" className="primary" onClick={() => void importThumbnails()} disabled={!canImport}>
        {busy === "uploading" ? "Importando…" : `Importar ${analysis?.matchedOrders || 0} miniatura(s)`}
      </button>
    </div>

    {result && <div className={`platform-feedback ${resultStatus}`}>
      Importadas: <b>{result.uploaded}</b> · Substituídas: <b>{result.replaced}</b> · Erros: <b>{result.errors.length}</b>
    </div>}

    {(result?.errors.length || result?.warnings.length) ? <details className="thumbnail-zip-details">
      <summary>Ver resultado detalhado</summary>
      <div>
        {result.warnings.map((item) => <p key={`warning-${item.opNumber}-${item.message}`}><b>OP {item.opNumber}:</b> {item.message}</p>)}
        {result.errors.map((item) => <p key={`error-${item.opNumber}-${item.fileName}`}><b>OP {item.opNumber}:</b> {item.message}</p>)}
      </div>
    </details> : null}
  </div>;
}
