"use client";

import { supabase } from "@/lib/supabase";
import type { OrderFileEntry } from "@/lib/pcp-types";

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
  file: OrderFileEntry;
};

export type DriveConnectionStatus = {
  enabled: boolean;
  connected: boolean;
  connected_email: string | null;
  root_folder_name: string;
  root_folder_id: string | null;
  root_folder_url: string | null;
};

async function sessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sessão expirada. Entre novamente no sistema.");
  }
  return data.session.access_token;
}

export async function driveAuthenticatedJson<T>(path: string, init: RequestInit = {}) {
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
  onProgress?: (percent: number) => void;
}) {
  return new Promise<{ completed: boolean; file?: GoogleUploadedFile }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.uploadUrl);
    xhr.setRequestHeader("Content-Type", input.mimeType || "application/octet-stream");
    xhr.setRequestHeader("Content-Range", `bytes ${input.start}-${input.end}/${input.total}`);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !input.onProgress) return;
      input.onProgress(Math.min(99, Math.round(((input.start + event.loaded) / input.total) * 100)));
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

async function uploadResumable(file: File, uploadUrl: string, onProgress?: (percent: number) => void) {
  const chunkSize = 8 * 1024 * 1024;
  let start = 0;

  while (start < file.size) {
    const endExclusive = Math.min(start + chunkSize, file.size);
    const result = await uploadChunk({
      uploadUrl,
      chunk: file.slice(start, endExclusive),
      start,
      end: endExclusive - 1,
      total: file.size,
      mimeType: file.type || "application/octet-stream",
      onProgress,
    });
    if (result.completed && result.file) {
      onProgress?.(100);
      return result.file;
    }
    start = endExclusive;
  }

  throw new Error("O Google Drive não confirmou a conclusão do arquivo.");
}

export async function uploadFileToOrderDrive(input: {
  orderId: string;
  file: File;
  category?: "art" | "approval" | "production" | "photo" | "installation" | "document" | "other";
  version?: string;
  notes?: string;
  isApproved?: boolean;
  onProgress?: (percent: number) => void;
}) {
  const session = await driveAuthenticatedJson<UploadSession>("/api/google-drive/upload-session", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      file_name: input.file.name,
      mime_type: input.file.type || "application/octet-stream",
      file_size: input.file.size,
      file_category: input.category || "other",
      version: input.version || "",
      notes: input.notes || "",
      is_approved: Boolean(input.isApproved),
    }),
  });

  let uploaded: GoogleUploadedFile | null = null;
  try {
    uploaded = await uploadResumable(input.file, session.upload_url, input.onProgress);
  } catch {
    // A confirmação abaixo também consegue recuperar uploads concluídos quando
    // o navegador não consegue ler a última resposta do Google por CORS.
  }

  const completion = await driveAuthenticatedJson<UploadCompletion>("/api/google-drive/upload-complete", {
    method: "POST",
    body: JSON.stringify({
      session_id: session.session_id,
      drive_file_id: uploaded?.id || undefined,
    }),
  });

  if (!completion.file?.drive_file_id) {
    throw new Error("O arquivo foi enviado, mas o Google Drive não retornou a identificação necessária para a miniatura.");
  }

  return completion.file;
}
