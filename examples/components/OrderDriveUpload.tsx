"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  found: number;
};

type Props = {
  orderId: string;
  opNumber: string;
  canOperate: boolean;
  onUploaded: () => Promise<void> | void;
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
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Falha na comunicação com o Google Drive.");
  return payload;
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

export function OrderDriveUpload({ orderId, opNumber, canOperate, onUploaded, onError, onNotice }: Props) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
    onError("");
    try {
      const result = await authenticatedJson<ReconcileResult>("/api/google-drive/reconcile", {
        method: "POST",
        body: JSON.stringify({ order_id: orderId }),
      });
      await onUploaded();
      if (result.linked > 0 || result.updated > 0) {
        const parts = [];
        if (result.linked > 0) parts.push(`${result.linked} novo(s) arquivo(s) vinculado(s)`);
        if (result.updated > 0) parts.push(`${result.updated} arquivo(s) atualizado(s)`);
        onNotice(`${parts.join(" e ")} na OP ${opNumber}.`);
      } else if (result.found > 0) {
        onNotice("A pasta foi atualizada. Todos os arquivos desta ordem já estavam sincronizados.");
      } else {
        onNotice("A pasta desta ordem está vazia ou ainda não foi criada no Google Drive.");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível sincronizar os arquivos do Drive.");
    } finally {
      setSyncing(false);
    }
  }

  if (statusLoading) return <div className="drive-upload-status loading">Verificando conexão com o Google Drive…</div>;
  if (!status?.enabled || !status.connected) return <div className="drive-upload-status disconnected"><b>Upload automático indisponível</b><span>O administrador precisa salvar as credenciais e conectar a conta Google em Configurações. O vínculo manual por link continua disponível abaixo.</span></div>;

  return <form className="drive-upload-form" onSubmit={submit}>
    <div className="drive-upload-connection"><span>☁</span><div><b>Enviar diretamente para {status.connected_email}</b><small>Pasta: {status.root_folder_name} → cliente → OP {opNumber} → categoria</small></div><div className="drive-connection-actions"><button className="drive-refresh-button" type="button" title="Consultar novamente somente a pasta desta ordem" aria-label="Atualizar arquivos desta ordem" onClick={() => void reconcileOrderFiles()} disabled={syncing || uploading}><span aria-hidden="true">↻</span>{syncing ? "Atualizando…" : "Atualizar arquivos"}</button>{status.root_folder_url && <a href={status.root_folder_url} target="_blank" rel="noreferrer">Abrir raiz</a>}</div></div>
    <div className="drive-upload-fields">
      <label className="drive-file-picker"><input ref={fileInputRef} name="files" type="file" multiple disabled={!canOperate || uploading} /><span>＋ Selecionar arquivos</span><small>É possível selecionar vários arquivos de uma vez.</small></label>
      <select name="file_category" defaultValue="art" disabled={uploading}><option value="art">Arte</option><option value="approval">Aprovação</option><option value="production">Produção</option><option value="photo">Fotos</option><option value="installation">Instalação</option><option value="document">Documento</option><option value="other">Outro</option></select>
      <input name="version" placeholder="Versão (ex.: V3)" disabled={uploading} />
      <input name="notes" placeholder="Observação" disabled={uploading} />
      <label className="drive-approved-check"><input name="is_approved" type="checkbox" disabled={uploading} /> Arte aprovada</label>
      <button className="primary" disabled={!canOperate || uploading}>{uploading ? "Enviando…" : "Enviar ao Drive"}</button>
    </div>
    {uploading && <div className="drive-upload-progress"><div><b>{currentFile}</b><span>{progress}%</span></div><progress max="100" value={progress} /></div>}
  </form>;
}
