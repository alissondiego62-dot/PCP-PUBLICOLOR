import { randomUUID } from "node:crypto";
import { decryptDriveSecret, encryptDriveSecret } from "@/lib/server/drive-crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-server";

export type DriveSettingsRow = {
  singleton_id: number;
  account_email: string;
  oauth_client_id: string;
  oauth_client_secret_ciphertext: string | null;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  connected_email: string | null;
  root_folder_name: string;
  root_folder_id: string | null;
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  lastModifyingUser?: {
    displayName?: string;
    emailAddress?: string;
  };
  appProperties?: Record<string, string>;
  resolvedCategory?: string;
};

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export const DRIVE_SCOPES = [
  "openid",
  "email",
  // O escopo completo é necessário para localizar arquivos adicionados
  // manualmente às pastas da OP, e não apenas arquivos criados pelo sistema.
  "https://www.googleapis.com/auth/drive",
];

export async function getDriveSettings() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("google_drive_settings")
    .select("*")
    .eq("singleton_id", 1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler as configurações do Drive: ${error.message}`);
  if (!data) throw new Error("Execute a migração de integração com o Google Drive.");
  return data as DriveSettingsRow;
}

export function publicDriveSettings(settings: DriveSettingsRow, redirectUri: string) {
  return {
    account_email: settings.account_email,
    oauth_client_id: settings.oauth_client_id,
    client_secret_configured: Boolean(settings.oauth_client_secret_ciphertext),
    connected: Boolean(settings.refresh_token_ciphertext && settings.connected_email),
    connected_email: settings.connected_email,
    root_folder_name: settings.root_folder_name,
    root_folder_id: settings.root_folder_id,
    root_folder_url: settings.root_folder_id
      ? `https://drive.google.com/drive/folders/${settings.root_folder_id}`
      : null,
    enabled: settings.enabled,
    redirect_uri: redirectUri,
    updated_at: settings.updated_at,
  };
}

async function updateSettings(values: Record<string, unknown>) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("google_drive_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("singleton_id", 1)
    .select("*")
    .single();
  if (error) throw new Error(`Não foi possível atualizar as configurações do Drive: ${error.message}`);
  return data as DriveSettingsRow;
}

export async function saveDriveSettings(input: {
  accountEmail: string;
  clientId: string;
  clientSecret?: string;
  rootFolderName: string;
  enabled: boolean;
  userId: string;
}) {
  const current = await getDriveSettings();
  const normalizedEmail = input.accountEmail.trim().toLowerCase();
  const normalizedClientId = input.clientId.trim();
  const normalizedFolder = sanitizeDriveName(input.rootFolderName || "PUBLICOLOR - SISTEMA PCP");
  const secretChanged = Boolean(input.clientSecret?.trim());
  const credentialsChanged =
    current.oauth_client_id !== normalizedClientId ||
    current.account_email.toLowerCase() !== normalizedEmail ||
    secretChanged;

  const patch: Record<string, unknown> = {
    account_email: normalizedEmail,
    oauth_client_id: normalizedClientId,
    root_folder_name: normalizedFolder,
    enabled: input.enabled,
    updated_by: input.userId,
  };

  if (secretChanged) {
    patch.oauth_client_secret_ciphertext = encryptDriveSecret(input.clientSecret?.trim());
  }

  if (credentialsChanged) {
    patch.access_token_ciphertext = null;
    patch.refresh_token_ciphertext = null;
    patch.token_expires_at = null;
    patch.connected_email = null;
    patch.root_folder_id = null;
  }

  return updateSettings(patch);
}

export async function storeDriveTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  connectedEmail: string;
  userId: string;
}) {
  return updateSettings({
    access_token_ciphertext: encryptDriveSecret(input.accessToken),
    refresh_token_ciphertext: encryptDriveSecret(input.refreshToken),
    token_expires_at: new Date(Date.now() + Math.max(60, input.expiresIn - 30) * 1000).toISOString(),
    connected_email: input.connectedEmail.toLowerCase(),
    enabled: true,
    updated_by: input.userId,
  });
}

export async function clearDriveTokens(userId: string) {
  return updateSettings({
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    token_expires_at: null,
    connected_email: null,
    root_folder_id: null,
    updated_by: userId,
  });
}

export function driveCredentials(settings: DriveSettingsRow) {
  const clientSecret = decryptDriveSecret(settings.oauth_client_secret_ciphertext);
  if (!settings.oauth_client_id || !clientSecret) {
    throw new Error("Client ID e Client Secret ainda não foram configurados.");
  }
  return { clientId: settings.oauth_client_id, clientSecret };
}

export async function validDriveAccessToken(forceRefresh = false) {
  const settings = await getDriveSettings();
  if (!settings.enabled) throw new Error("A integração com o Google Drive está desativada.");

  const currentToken = decryptDriveSecret(settings.access_token_ciphertext);
  const expiry = settings.token_expires_at ? new Date(settings.token_expires_at).getTime() : 0;
  if (!forceRefresh && currentToken && expiry > Date.now() + 60_000) {
    return { accessToken: currentToken, settings };
  }

  const refreshToken = decryptDriveSecret(settings.refresh_token_ciphertext);
  if (!refreshToken) throw new Error("O Google Drive ainda não está conectado. Acesse Configurações e autorize a conta.");
  const { clientId, clientSecret } = driveCredentials(settings);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || "A autorização do Google Drive expirou. Reconecte a conta nas Configurações.");
  }

  const refreshed = await updateSettings({
    access_token_ciphertext: encryptDriveSecret(payload.access_token),
    token_expires_at: new Date(Date.now() + Math.max(60, (payload.expires_in || 3600) - 30) * 1000).toISOString(),
  });
  return { accessToken: payload.access_token, settings: refreshed };
}

async function driveFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = await validDriveAccessToken();
  const response = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && retry) {
    const refreshed = await validDriveAccessToken(true);
    const retried = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${refreshed.accessToken}`,
        ...(init.headers || {}),
      },
    });
    if (!retried.ok) throw await driveApiError(retried);
    return await retried.json() as T;
  }

  if (!response.ok) throw await driveApiError(response);
  return await response.json() as T;
}

async function driveApiError(response: Response) {
  let detail = "";
  try {
    const payload = await response.json() as { error?: { message?: string } };
    detail = payload.error?.message || "";
  } catch {
    detail = await response.text().catch(() => "");
  }
  return new Error(detail || `Google Drive respondeu com erro ${response.status}.`);
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function sanitizeDriveName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150) || "Sem nome";
}

async function findFolder(name: string, parentId: string) {
  const query = [
    `name = '${escapeDriveQuery(name)}'`,
    `mimeType = '${DRIVE_FOLDER_MIME}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    "trashed = false",
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "10",
    fields: "files(id,name,mimeType,webViewLink,parents)",
  });
  const result = await driveFetch<{ files?: DriveFile[] }>(`/drive/v3/files?${params.toString()}`);
  return result.files?.[0] || null;
}

async function createFolder(name: string, parentId?: string) {
  return driveFetch<DriveFile>("/drive/v3/files?fields=id,name,mimeType,webViewLink,parents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
}

async function ensureFolder(name: string, parentId: string) {
  return await findFolder(name, parentId) || await createFolder(name, parentId);
}

export async function ensureRootFolder() {
  let settings = await getDriveSettings();
  const rootName = sanitizeDriveName(settings.root_folder_name || "PUBLICOLOR - SISTEMA PCP");

  if (settings.root_folder_id) {
    try {
      const existing = await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(settings.root_folder_id)}?fields=id,name,mimeType,webViewLink,parents`);
      if (existing.mimeType === DRIVE_FOLDER_MIME) {
        if (existing.name !== rootName) {
          return driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(existing.id)}?fields=id,name,mimeType,webViewLink,parents`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: rootName }),
          });
        }
        return existing;
      }
    } catch {
      settings = await updateSettings({ root_folder_id: null });
    }
  }

  const rootFolder = await ensureFolder(rootName, "root");
  await updateSettings({ root_folder_id: rootFolder.id });
  return rootFolder;
}

function orderFamily(opNumber: string) {
  const normalized = opNumber.trim();
  const match = normalized.match(/^(.+?)-(\d+)$/);
  return { parent: match?.[1]?.trim() || normalized, isSubOrder: Boolean(match) };
}

const categoryFolder: Record<string, string> = {
  art: "01 - ARTE",
  approval: "02 - APROVAÇÃO",
  production: "03 - PRODUÇÃO",
  document: "04 - DOCUMENTOS",
  photo: "05 - FOTOS",
  installation: "06 - INSTALAÇÃO",
  other: "07 - OUTROS",
};

export async function ensureOrderFolder(order: { op_number: string; client_name: string }) {
  const root = await ensureRootFolder();
  const clients = await ensureFolder("CLIENTES", root.id);
  const client = await ensureFolder(sanitizeDriveName(order.client_name), clients.id);
  const family = orderFamily(order.op_number);
  const op = await ensureFolder(`OP ${sanitizeDriveName(family.parent)}`, client.id);
  return family.isSubOrder
    ? await ensureFolder(`SUBPEDIDO ${sanitizeDriveName(order.op_number)}`, op.id)
    : op;
}

async function findOrderFolder(order: { op_number: string; client_name: string }) {
  const settings = await getDriveSettings();
  let root: DriveFile | null = null;

  if (settings.root_folder_id) {
    try {
      root = await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(settings.root_folder_id)}?fields=id,name,mimeType,webViewLink,parents`);
    } catch {
      root = null;
    }
  }

  if (!root) root = await findFolder(sanitizeDriveName(settings.root_folder_name || "PUBLICOLOR - SISTEMA PCP"), "root");
  if (!root) return null;

  const clients = await findFolder("CLIENTES", root.id);
  if (!clients) return null;
  const client = await findFolder(sanitizeDriveName(order.client_name), clients.id);
  if (!client) return null;

  const family = orderFamily(order.op_number);
  const op = await findFolder(`OP ${sanitizeDriveName(family.parent)}`, client.id);
  if (!op) return null;
  if (!family.isSubOrder) return op;
  return findFolder(`SUBPEDIDO ${sanitizeDriveName(order.op_number)}`, op.id);
}

export async function ensureOrderCategoryFolder(order: { op_number: string; client_name: string }, category: string) {
  const orderFolder = await ensureOrderFolder(order);
  return ensureFolder(categoryFolder[category] || categoryFolder.other, orderFolder.id);
}

const folderCategory = Object.fromEntries(
  Object.entries(categoryFolder).map(([category, folderName]) => [folderName, category]),
) as Record<string, string>;

const driveListFields = "nextPageToken,files(id,name,mimeType,size,webViewLink,parents,createdTime,modifiedTime,md5Checksum,lastModifyingUser(displayName,emailAddress),appProperties)";

async function listFolderChildren(folderId: string) {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false`,
      spaces: "drive",
      pageSize: "1000",
      orderBy: "modifiedTime desc",
      fields: driveListFields,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveFetch<{ files?: DriveFile[]; nextPageToken?: string }>(`/drive/v3/files?${params.toString()}`);
    files.push(...(result.files || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function collectOrderFolderFiles(folderId: string, inheritedCategory = "other", depth = 0): Promise<DriveFile[]> {
  if (depth > 5) return [];
  const children = await listFolderChildren(folderId);
  const result: DriveFile[] = [];

  for (const child of children) {
    if (child.mimeType === DRIVE_FOLDER_MIME) {
      const nestedCategory = folderCategory[child.name] || inheritedCategory;
      result.push(...await collectOrderFolderFiles(child.id, nestedCategory, depth + 1));
      continue;
    }

    result.push({
      ...child,
      resolvedCategory: child.appProperties?.publicolor_category || inheritedCategory || "other",
    });
  }

  return result;
}

export async function createResumableUploadSession(input: {
  folderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  orderId: string;
  category: string;
  uploadSessionId: string;
  browserOrigin: string;
}) {
  const { accessToken } = await validDriveAccessToken();
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink,parents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": input.mimeType || "application/octet-stream",
      "x-upload-content-length": String(input.fileSize),
      // A sessão é iniciada no servidor, mas os blocos são enviados pelo navegador.
      // Informar a origem permite que o Google devolva a resposta final ao browser
      // sem bloquear a leitura por CORS.
      origin: input.browserOrigin,
    },
    body: JSON.stringify({
      name: sanitizeDriveName(input.fileName),
      mimeType: input.mimeType || "application/octet-stream",
      parents: [input.folderId],
      appProperties: {
        publicolor_order_id: input.orderId,
        publicolor_category: input.category,
        publicolor_upload_session: input.uploadSessionId,
      },
    }),
  });
  if (!response.ok) throw await driveApiError(response);
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new Error("O Google Drive não retornou a sessão de upload.");
  return uploadUrl;
}

export async function verifyDriveFile(fileId: string) {
  return driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,parents,createdTime,modifiedTime,md5Checksum,lastModifyingUser(displayName,emailAddress),appProperties`);
}

export async function findDriveFileForUploadSession(input: {
  uploadSessionId: string;
  orderId: string;
  folderId: string;
  fileName: string;
  category: string;
}) {
  const fields = "files(id,name,mimeType,size,webViewLink,parents,createdTime,modifiedTime,md5Checksum,lastModifyingUser(displayName,emailAddress),appProperties)";
  const common = [
    `'${escapeDriveQuery(input.folderId)}' in parents`,
    "trashed = false",
  ];

  const exactParams = new URLSearchParams({
    q: [...common, `appProperties has { key='publicolor_upload_session' and value='${escapeDriveQuery(input.uploadSessionId)}' }`].join(" and "),
    spaces: "drive",
    pageSize: "10",
    orderBy: "createdTime desc",
    fields,
  });
  const exact = await driveFetch<{ files?: DriveFile[] }>(`/drive/v3/files?${exactParams.toString()}`);
  if (exact.files?.[0]) return exact.files[0];

  // Compatibilidade com sessões criadas antes da correção do identificador único.
  const legacyParams = new URLSearchParams({
    q: [
      ...common,
      `name = '${escapeDriveQuery(sanitizeDriveName(input.fileName))}'`,
      `appProperties has { key='publicolor_order_id' and value='${escapeDriveQuery(input.orderId)}' }`,
      `appProperties has { key='publicolor_category' and value='${escapeDriveQuery(input.category)}' }`,
    ].join(" and "),
    spaces: "drive",
    pageSize: "10",
    orderBy: "createdTime desc",
    fields,
  });
  const legacy = await driveFetch<{ files?: DriveFile[] }>(`/drive/v3/files?${legacyParams.toString()}`);
  return legacy.files?.[0] || null;
}

export async function listDriveFilesForOrder(
  order: { id: string; op_number: string; client_name: string },
  knownFolders: Array<{ id: string; category?: string | null }> = [],
) {
  const filesById = new Map<string, DriveFile>();
  const failures: unknown[] = [];
  let successfulLookup = false;

  const append = (files: DriveFile[]) => {
    for (const file of files) filesById.set(file.id, file);
  };

  // Caminho principal: localiza a pasta pela estrutura Cliente → OP → Subpedido.
  // Se o cliente ou o número da OP tiver sido alterado depois da criação da pasta,
  // a lista de pastas conhecidas abaixo mantém a sincronização funcional.
  try {
    const orderFolder = await findOrderFolder(order);
    successfulLookup = true;
    if (orderFolder) append(await collectOrderFolderFiles(orderFolder.id));
  } catch (error) {
    failures.push(error);
    // Continua com os IDs de pasta já registrados no banco.
  }

  const uniqueKnownFolders = new Map<string, string>();
  for (const folder of knownFolders) {
    const id = folder.id?.trim();
    if (!id) continue;
    uniqueKnownFolders.set(id, folder.category?.trim() || "other");
  }

  for (const [folderId, category] of uniqueKnownFolders) {
    try {
      append(await collectOrderFolderFiles(folderId, category));
      successfulLookup = true;
    } catch (error) {
      failures.push(error);
      // Pastas apagadas ou sem acesso não impedem a consulta das demais.
    }
  }

  // Compatibilidade com uploads antigos identificados apenas por appProperties.
  try {
    const params = new URLSearchParams({
      q: [
        "trashed = false",
        `appProperties has { key='publicolor_order_id' and value='${escapeDriveQuery(order.id)}' }`,
      ].join(" and "),
      spaces: "drive",
      pageSize: "1000",
      orderBy: "modifiedTime desc",
      fields: driveListFields,
    });
    const result = await driveFetch<{ files?: DriveFile[] }>(`/drive/v3/files?${params.toString()}`);
    successfulLookup = true;
    append((result.files || []).map((file) => ({
      ...file,
      resolvedCategory: file.appProperties?.publicolor_category || "other",
    })));
  } catch (error) {
    failures.push(error);
    // A navegação pelas pastas conhecidas pode continuar atendendo a sincronização.
  }

  if (!successfulLookup && failures.length) throw failures[0];

  return Array.from(filesById.values()).sort((first, second) => {
    const firstTime = new Date(first.modifiedTime || first.createdTime || 0).getTime();
    const secondTime = new Date(second.modifiedTime || second.createdTime || 0).getTime();
    return secondTime - firstTime;
  });
}

export async function downloadDriveFile(fileId: string) {
  const execute = async (accessToken: string) => fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  let token = await validDriveAccessToken();
  let response = await execute(token.accessToken);
  if (response.status === 401) {
    token = await validDriveAccessToken(true);
    response = await execute(token.accessToken);
  }
  if (!response.ok) throw await driveApiError(response);
  return response;
}

export async function deleteDriveFile(fileId: string) {
  const execute = async (accessToken: string) => fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );

  let token = await validDriveAccessToken();
  let response = await execute(token.accessToken);
  if (response.status === 401) {
    token = await validDriveAccessToken(true);
    response = await execute(token.accessToken);
  }

  // Se o arquivo já não existe no Drive, a finalidade da ação já foi atingida.
  if (response.status === 404) return;
  if (!response.ok) throw await driveApiError(response);
}

export async function testDriveConnection() {
  const root = await ensureRootFolder();
  const settings = await getDriveSettings();
  return {
    connected_email: settings.connected_email,
    root_folder_id: root.id,
    root_folder_name: root.name,
    root_folder_url: root.webViewLink || `https://drive.google.com/drive/folders/${root.id}`,
  };
}

export async function revokeDriveToken() {
  const settings = await getDriveSettings();
  const token = decryptDriveSecret(settings.refresh_token_ciphertext) || decryptDriveSecret(settings.access_token_ciphertext);
  if (!token) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => null);
}

export async function createPendingUpload(input: {
  userId: string;
  orderId: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  version: string | null;
  notes: string | null;
  isApproved: boolean;
}) {
  const admin = getSupabaseAdmin();
  await admin.from("google_drive_upload_sessions").delete().lt("expires_at", new Date().toISOString());
  const id = randomUUID();
  const { error } = await admin.from("google_drive_upload_sessions").insert({
    id,
    user_id: input.userId,
    order_id: input.orderId,
    drive_folder_id: input.folderId,
    file_name: input.fileName,
    mime_type: input.mimeType,
    file_size: input.fileSize,
    file_category: input.category,
    version: input.version,
    notes: input.notes,
    is_approved: input.isApproved,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(`Não foi possível registrar a sessão de upload: ${error.message}`);
  return id;
}
