"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OrderFileEntry } from "@/lib/pcp-types";

type DriveStatus = {
  enabled: boolean;
  connected: boolean;
  connected_email: string | null;
  root_folder_name: string;
  root_folder_id: string | null;
  root_folder_url: string | null;
};

type UploadSession = {
  session_id: string;
  upload_url: string;
  folder_id: string;
  folder_url: string;
};

type GoogleUploadedFile = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
};

type UploadCompletion = {
  ok: boolean;
  recovered?: boolean;
};

type ReconcileResult = {
  ok: boolean;
  linked: number;
  updated: number;
  restored: number;
  found: number;
  displayed: number;
  scanned_folders?: number;
  scanned_category_folders?: number;
  order_folder_ids?: string[];
  category_folder_ids?: string[];
  category_counts?: Record<string, number>;
  missing?: Array<{ id: string; name: string }>;
  warnings?: string[];
  files: OrderFileEntry[];
};

type Props = {
  orderId: string;
  opNumber: string;
  canOperate: boolean;
  onUploaded: () => Promise<void> | void;
  onSynchronized: (files: OrderFileEntry[]) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

async function sessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sessão expirada. Entre novamente no sistema.");
  return data.session.access_token;
}

async function authenticatedJson<T>(path: string, init: RequestInit = {}) {
  const token = await sessionToken();
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const raw = await response.text();
  let payload: (T & { error?: string }) | null = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as T & { error?: string };
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail = payload?.error || raw.trim();
    throw new Error(detail || `Falha na comunicação com o Google Drive (${response.status}).`);
  }

  return (payload || {}) as T;
}

function uploadChunk(input: {
  uploadUrl: string;
  chunk: Blob;
  start: number;
  end: number;
  total: number;
  mimeType: string;
  onProgress: (loaded: number) => void;
}) {
  return new Promise<{ completed: boolean; file?: GoogleUploadedFile }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.uploadUrl);
    xhr.setRequestHeader("Content-Type", input.mimeType || "application/octet-stream");
    xhr.setRequestHeader("Content-Range", `bytes ${input.start}-${input.end}/${input.total}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress(event.loaded);
    };
    xhr.onerror = () => reject(new Error("O envio ao Google Drive foi interrompido. Verifique a internet e tente novamente."));
    xhr.onload = () => {
      if (xhr.status === 308) {
        resolve({ completed: false });
        return;
      }
      if (xhr.status === 200 || xhr.status === 201) {
        try {
          resolve({ completed: true, file: JSON.parse(xhr.responseText) as GoogleUploadedFile });
        } catch {
          reject(new Error("O Google Drive concluiu o envio, mas retornou uma resposta inválida."));
        }
        return;
      }
      let detail = "";
      try {
        const payload = JSON.parse(xhr.responseText) as { error?: { message?: string } };
        detail = payload.error?.message || "";
      } catch {
        detail = xhr.responseText;
      }
      reject(new Error(detail || `Google Drive respondeu com erro ${xhr.status}.`));
    };
    xhr.send(input.chunk);
  });
}

async function uploadResumable(file: File, uploadUrl: string, onProgress: (percent: number) => void) {
  const chunkSize = 8 * 1024 * 1024;
  let start = 0;
  while (start < file.size) {
    const endExclusive = Math.min(start + chunkSize, file.size);
    const end = endExclusive - 1;
    const chunk = file.slice(start, endExclusive);
    const result = await uploadChunk({
      uploadUrl,
      chunk,
      start,
      end,
      total: file.size,
      mimeType: file.type || "application/octet-stream",
      onProgress: (loaded) => onProgress(Math.min(99, Math.round(((start + loaded) / file.size) * 100))),
    });
    if (result.completed && result.file) {
      onProgress(100);
      return result.file;
    }
    start = endExclusive;
  }
  throw new Error("O Google Drive não confirmou a conclusão do arquivo.");
}

export function OrderDriveUpload({ orderId, opNumber, canOperate, onUploaded, onSynchronized, onError, onNotice }: Props) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: "working" | "success" | "error"; text: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    void authenticatedJson<DriveStatus>("/api/google-drive/status")
      .then((result) => { if (active) setStatus(result); })
      .catch((error) => { if (active) onError(error instanceof Error ? error.message : "Não foi possível verificar o Drive."); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [onError, orderId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canOperate || uploading) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const files = Array.from(fileInputRef.current?.files || []);
    if (!files.length) {
      onError("Selecione pelo menos um arquivo.");
      return;
    }

    setUploading(true);
    setProgress(0);
    onError("");
    let completed = 0;
    try {
      for (const file of files) {
        setCurrentFile(file.name);
        setProgress(0);
        const session = await authenticatedJson<UploadSession>("/api/google-drive/upload-session", {
          method: "POST",
          body: JSON.stringify({
            order_id: orderId,
            file_name: file.name,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
            file_category: String(form.get("file_category") || "other"),
            version: String(form.get("version") || ""),
            notes: String(form.get("notes") || ""),
            is_approved: form.get("is_approved") === "on",
          }),
        });
        let uploaded: GoogleUploadedFile | null = null;
        try {
          uploaded = await uploadResumable(file, session.upload_url, setProgress);
        } catch {
          // O arquivo pode ter sido concluído no Drive mesmo quando o navegador
          // não consegue ler a resposta final. A confirmação abaixo reconcilia.
        }

        try {
          await authenticatedJson<UploadCompletion>("/api/google-drive/upload-complete", {
            method: "POST",
            body: JSON.stringify({
              session_id: session.session_id,
              drive_file_id: uploaded?.id || undefined,
            }),
          });
        } catch (completionError) {
          // Se o navegador perdeu somente a resposta final do Google, a rota acima
          // tenta localizar o arquivo já enviado. Se ainda não estiver disponível,
          // exibimos a orientação de sincronização em vez de um falso erro de internet.
          throw completionError;
        }

        completed += 1;
      }
      formElement.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      await onUploaded();
      onNotice(`${completed} arquivo(s) enviado(s) ao Google Drive e vinculado(s) à OP ${opNumber}.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível enviar os arquivos.");
    } finally {
      setUploading(false);
      setCurrentFile("");
      setProgress(0);
    }
  }


  async function reconcileOrderFiles() {
    if (syncing || uploading) return;

    setSyncing(true);
    setSyncFeedback({ type: "working", text: "Consultando a pasta desta ordem no Google Drive…" });
    onError("");

    try {
      const result = await authenticatedJson<ReconcileResult>("/api/google-drive/reconcile", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId }),
      });

      // A resposta da própria rota é a fonte imediata da tela. Assim a contagem
      // não fica presa a uma leitura anterior do Supabase. O carregamento geral é
      // feito depois apenas para atualizar histórico e demais abas da OS.
      onSynchronized(result.files || []);
      await onUploaded();

      const operationalFolders = result.category_folder_ids?.length || result.scanned_category_folders || 0;
      const roots = result.order_folder_ids?.length || 0;
      const changedParts: string[] = [];
      if (result.linked > 0) changedParts.push(`${result.linked} novo(s)`);
      if (result.restored > 0) changedParts.push(`${result.restored} restaurado(s)`);
      const metadataUpdates = Math.max(0, result.updated - result.restored);
      if (metadataUpdates > 0) changedParts.push(`${metadataUpdates} atualizado(s)`);

      let message = result.found > 0
        ? `Sincronização concluída: ${result.found} arquivo(s) encontrado(s) no Drive e ${result.displayed} exibido(s) na OS.`
        : "Nenhum arquivo foi localizado na raiz ou nas subpastas desta ordem.";
      if (changedParts.length) message += ` Alterações: ${changedParts.join(", ")}.`;
      if (roots || operationalFolders) message += ` Foram verificadas ${roots || 1} raiz(es) e ${operationalFolders} pasta(s) de categoria.`;
      const categoryLabels: Record<string, string> = {
        art: "Arte",
        approval: "Aprovação",
        production: "Produção",
        document: "Documentos",
        photo: "Fotos",
        installation: "Instalação",
        other: "Outros",
      };
      const categorySummary = Object.entries(result.category_counts || {})
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${categoryLabels[category] || category}: ${count}`);
      if (categorySummary.length) message += ` Arquivos por pasta: ${categorySummary.join(" · ")}.`;

      setSyncFeedback({ type: "success", text: message });
      onNotice(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar os arquivos do Drive.";
      const permissionHint = /insufficient|permission|scope|permiss|forbidden|403/i.test(message)
        ? `${message} Reconecte a conta em Configurações para renovar a permissão do Google Drive.`
        : message;
      setSyncFeedback({ type: "error", text: permissionHint });
      onError(permissionHint);
    } finally {
      setSyncing(false);
    }
  }

  if (statusLoading) return <div className="drive-upload-status loading">Verificando conexão com o Google Drive…</div>;
  if (!status?.enabled || !status.connected) return <div className="drive-upload-status disconnected"><b>Upload automático indisponível</b><span>O administrador precisa salvar as credenciais e conectar a conta Google em Configurações. O vínculo manual por link continua disponível abaixo.</span></div>;

  return <form className="drive-upload-form" onSubmit={submit}>
    <div className="drive-upload-connection">
      <span className="drive-cloud-icon" aria-hidden="true">☁</span>
      <div className="drive-connection-copy">
        <b>Enviar diretamente para {status.connected_email}</b>
        <small>Pasta: {status.root_folder_name} → cliente → OP {opNumber} → categoria</small>
      </div>
      <div className="drive-connection-actions">
        <button
          className="drive-refresh-button"
          type="button"
          title="Sincronizar todos os arquivos atuais das pastas desta ordem, inclusive os removidos somente da OS"
          aria-label="Atualizar arquivos desta ordem"
          aria-busy={syncing}
          onClick={() => void reconcileOrderFiles()}
          disabled={syncing || uploading}
        >
          <span aria-hidden="true">↻</span>
          {syncing ? "Atualizando…" : "Atualizar arquivos"}
        </button>
        {status.root_folder_url && <a href={status.root_folder_url} target="_blank" rel="noreferrer">Abrir raiz</a>}
      </div>
    </div>
    {syncFeedback && <div className={`drive-sync-feedback ${syncFeedback.type}`} role="status" aria-live="polite">{syncFeedback.text}</div>}
    <div className="drive-upload-fields">
      <label className="drive-file-picker"><input ref={fileInputRef} name="files" type="file" multiple disabled={!canOperate || uploading} /><span>＋ Selecionar arquivos</span><small>É possível selecionar vários arquivos de uma vez.</small></label>
      <select name="file_category" defaultValue="art" disabled={uploading}><option value="art">Arte</option><option value="approval">Aprovação</option><option value="production">Produção</option><option value="photo">Fotos</option><option value="installation">Instalação</option><option value="document">Documento</option><option value="other">Outro</option></select>
      <input name="version" placeholder="Versão (ex.: V3)" disabled={uploading} />
      <input name="notes" placeholder="Observação" disabled={uploading} />
      <label className="drive-approved-check"><input name="is_approved" type="checkbox" disabled={uploading} /> Arte aprovada</label>
      <button type="submit" className="primary" disabled={!canOperate || uploading}>{uploading ? "Enviando…" : "Enviar ao Drive"}</button>
    </div>
    {uploading && <div className="drive-upload-progress"><div><b>{currentFile}</b><span>{progress}%</span></div><progress max="100" value={progress} /></div>}
  </form>;
}
