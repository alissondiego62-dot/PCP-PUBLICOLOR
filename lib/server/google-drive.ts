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
  shortcutDetails?: {
    targetId?: string;
    targetMimeType?: string;
    targetResourceKey?: string;
  };
  resolvedCategory?: string;
};

export class DriveReconnectRequiredError extends Error {
  status = 401;
  code = "GOOGLE_DRIVE_RECONNECT_REQUIRED";
  reconnectRequired = true;

  constructor(message = "A autorização do Google Drive expirou ou foi revogada. Reconecte a conta em Configurações → Integração com Google Drive.") {
    super(message);
    this.name = "DriveReconnectRequiredError";
  }
}

const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

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
  refreshToken?: string;
  expiresIn: number;
  connectedEmail: string;
  userId: string;
}) {
  const current = await getDriveSettings();
  const refreshToken = input.refreshToken?.trim() || "";
  if (!refreshToken && !current.refresh_token_ciphertext) {
    throw new DriveReconnectRequiredError(
      "O Google não forneceu um token de renovação. Reconecte a conta e confirme novamente todas as permissões solicitadas.",
    );
  }

  return updateSettings({
    access_token_ciphertext: encryptDriveSecret(input.accessToken),
    ...(refreshToken ? { refresh_token_ciphertext: encryptDriveSecret(refreshToken) } : {}),
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

async function markDriveReconnectRequired() {
  return updateSettings({
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    token_expires_at: null,
    connected_email: null,
  });
}

function revokedOrExpiredGoogleToken(error: string, description: string) {
  return error === "invalid_grant"
    || /expired|revoked|invalid grant|token has been expired|token has been revoked/i.test(`${error} ${description}`);
}

export function driveCredentials(settings: DriveSettingsRow) {
  const clientSecret = decryptDriveSecret(settings.oauth_client_secret_ciphertext);
  if (!settings.oauth_client_id || !clientSecret) {
    throw new Error("Client ID e Client Secret ainda não foram configurados.");
  }
  return { clientId: settings.oauth_client_id, clientSecret };
}

const FULL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const READONLY_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

async function assertCompleteDriveAccess(retry = true) {
  const { accessToken } = await validDriveAccessToken(!retry);
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store" },
  );
  const payload = await response.json().catch(() => ({})) as { scope?: string; error_description?: string };
  if (!response.ok) {
    if (retry) return assertCompleteDriveAccess(false);
    if (revokedOrExpiredGoogleToken("", payload.error_description || "")) {
      await markDriveReconnectRequired();
      throw new DriveReconnectRequiredError();
    }
    throw new Error(payload.error_description || "Não foi possível validar as permissões atuais do Google Drive.");
  }

  const grantedScopes = new Set(String(payload.scope || "").split(/\s+/).filter(Boolean));
  if (!grantedScopes.has(FULL_DRIVE_SCOPE) && !grantedScopes.has(READONLY_DRIVE_SCOPE)) {
    throw new Error(
      "A conta Google ainda está autorizada com acesso limitado. Para sincronizar todos os arquivos adicionados manualmente, "
      + "abra Configurações → Integração com Google Drive, desconecte e conecte novamente aceitando o acesso completo ao Drive.",
    );
  }
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
  if (!refreshToken) throw new DriveReconnectRequiredError("O Google Drive não está conectado. Reconecte a conta nas Configurações.");
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
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    if (revokedOrExpiredGoogleToken(payload.error || "", payload.error_description || "")) {
      await markDriveReconnectRequired();
      throw new DriveReconnectRequiredError();
    }
    throw new Error(payload.error_description || "Não foi possível renovar a autorização do Google Drive.");
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
  let googleCode = "";
  try {
    const payload = await response.json() as { error?: { message?: string; status?: string; code?: number } | string };
    if (typeof payload.error === "string") {
      detail = payload.error;
      googleCode = payload.error;
    } else {
      detail = payload.error?.message || "";
      googleCode = payload.error?.status || String(payload.error?.code || "");
    }
  } catch {
    detail = await response.text().catch(() => "");
  }

  if (response.status === 401 || revokedOrExpiredGoogleToken(googleCode, detail)) {
    await markDriveReconnectRequired();
    return new DriveReconnectRequiredError();
  }
  return new Error(detail || `Google Drive respondeu com erro ${response.status}.`);
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}


function withSharedDriveOptions(params: URLSearchParams) {
  params.set("supportsAllDrives", "true");
  params.set("includeItemsFromAllDrives", "true");
  return params;
}

async function queryDriveFiles(query: string, fields: string, pageSize = 1000) {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = withSharedDriveOptions(new URLSearchParams({
      q: query,
      spaces: "drive",
      pageSize: String(Math.min(1000, Math.max(1, pageSize))),
      fields,
    }));
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveFetch<{ files?: DriveFile[]; nextPageToken?: string }>(`/drive/v3/files?${params.toString()}`);
    files.push(...(result.files || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return files;
}

export function sanitizeDriveName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150) || "Sem nome";
}

const folderEnsureLocks = new Map<string, Promise<DriveFile>>();

function folderIdentity(value: string) {
  return comparableDriveName(sanitizeDriveName(value));
}

async function matchingChildFolders(name: string, parentId: string) {
  const expected = folderIdentity(name);
  const query = [
    `mimeType = '${DRIVE_FOLDER_MIME}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    "trashed = false",
  ].join(" and ");
  const files = await queryDriveFiles(
    query,
    "nextPageToken,files(id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,appProperties)",
    1000,
  );
  return files.filter((file) => folderIdentity(file.name) === expected);
}

async function moveDriveItem(itemId: string, fromParentId: string, toParentId: string) {
  if (fromParentId === toParentId) return;
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    addParents: toParentId,
    removeParents: fromParentId,
    fields: "id,name,mimeType,webViewLink,parents,createdTime,modifiedTime",
  });
  await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(itemId)}?${params.toString()}`, {
    method: "PATCH",
  });
}

async function trashDriveItem(itemId: string) {
  await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(itemId)}?supportsAllDrives=true&fields=id,name,mimeType,parents`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
}

async function mergeFolderContents(sourceFolderId: string, targetFolderId: string, visited = new Set<string>()) {
  const visitKey = `${sourceFolderId}:${targetFolderId}`;
  if (sourceFolderId === targetFolderId || visited.has(visitKey)) return;
  visited.add(visitKey);

  const [sourceChildren, targetChildren] = await Promise.all([
    listFolderChildren(sourceFolderId),
    listFolderChildren(targetFolderId),
  ]);
  const targetFolders = new Map<string, DriveFile>();
  for (const child of targetChildren) {
    if (child.mimeType === DRIVE_FOLDER_MIME) {
      const key = folderIdentity(child.name);
      if (!targetFolders.has(key)) targetFolders.set(key, child);
    }
  }

  for (const child of sourceChildren) {
    if (child.mimeType === DRIVE_FOLDER_MIME) {
      const sameFolder = targetFolders.get(folderIdentity(child.name));
      if (sameFolder) {
        await mergeFolderContents(child.id, sameFolder.id, visited);
        await trashDriveItem(child.id);
        continue;
      }
      targetFolders.set(folderIdentity(child.name), child);
    }
    await moveDriveItem(child.id, sourceFolderId, targetFolderId);
  }
}

async function consolidateMatchingFolders(name: string, parentId: string, folders: DriveFile[]) {
  if (!folders.length) return null;
  if (folders.length === 1) return folders[0];

  const ranked = await Promise.all(folders.map(async (folder) => {
    try {
      const children = await listFolderChildren(folder.id);
      return { folder, children: children.length };
    } catch {
      return { folder, children: 0 };
    }
  }));
  ranked.sort((a, b) =>
    b.children - a.children
    || String(a.folder.createdTime || "").localeCompare(String(b.folder.createdTime || ""))
    || a.folder.id.localeCompare(b.folder.id),
  );

  const canonical = ranked[0].folder;
  for (const duplicate of ranked.slice(1).map((item) => item.folder)) {
    try {
      await mergeFolderContents(duplicate.id, canonical.id);
      await trashDriveItem(duplicate.id);
    } catch (error) {
      console.error(`Não foi possível consolidar a pasta duplicada ${duplicate.name} (${duplicate.id}).`, error);
    }
  }

  if (canonical.name !== sanitizeDriveName(name)) {
    try {
      return await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(canonical.id)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents,createdTime,modifiedTime`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: sanitizeDriveName(name) }),
      });
    } catch {
      return canonical;
    }
  }
  return canonical;
}

async function findFolder(name: string, parentId: string) {
  const files = await matchingChildFolders(name, parentId);
  return consolidateMatchingFolders(name, parentId, files);
}

async function createFolder(name: string, parentId?: string) {
  const normalizedName = sanitizeDriveName(name);
  return driveFetch<DriveFile>("/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents,createdTime,modifiedTime,appProperties", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: normalizedName,
      mimeType: DRIVE_FOLDER_MIME,
      appProperties: {
        publicolorManaged: "true",
        publicolorFolderIdentity: folderIdentity(normalizedName).slice(0, 120),
      },
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
}

async function ensureFolderUnlocked(name: string, parentId: string) {
  const normalizedName = sanitizeDriveName(name);
  const existing = await findFolder(normalizedName, parentId);
  if (existing) return existing;

  const created = await createFolder(normalizedName, parentId);
  // O importador pode abrir várias requisições quase ao mesmo tempo. Uma nova
  // consulta após a criação detecta uma eventual pasta concorrente e consolida
  // o conteúdo antes de qualquer arquivo ser enviado.
  await new Promise((resolve) => setTimeout(resolve, 250));
  const matches = await matchingChildFolders(normalizedName, parentId);
  return await consolidateMatchingFolders(normalizedName, parentId, matches) || created;
}

async function ensureFolder(name: string, parentId: string) {
  const lockKey = `${parentId}:${folderIdentity(name)}`;
  const active = folderEnsureLocks.get(lockKey);
  if (active) return active;

  const pending = ensureFolderUnlocked(name, parentId).finally(() => {
    if (folderEnsureLocks.get(lockKey) === pending) folderEnsureLocks.delete(lockKey);
  });
  folderEnsureLocks.set(lockKey, pending);
  return pending;
}

export async function ensureRootFolder() {
  let settings = await getDriveSettings();
  const rootName = sanitizeDriveName(settings.root_folder_name || "PUBLICOLOR - SISTEMA PCP");

  if (settings.root_folder_id) {
    try {
      const existing = await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(settings.root_folder_id)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents`);
      if (existing.mimeType === DRIVE_FOLDER_MIME) {
        if (existing.name !== rootName) {
          return driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(existing.id)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents`, {
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

async function directChildFolders(parentId: string) {
  const children = await listFolderChildren(parentId);
  return children.filter((child) => child.mimeType === DRIVE_FOLDER_MIME);
}

function comparableDriveName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(ORDEM DE SERVICO|ORDEM|SUBPEDIDO|PEDIDO|OP)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function orderNameTokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\b(ORDEM DE SERVICO|ORDEM|SUBPEDIDO|PEDIDO|OP)\b/g, " ")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

function folderMatchesOrder(folderName: string, opNumber: string) {
  const folderValue = comparableDriveName(folderName);
  const orderValue = comparableDriveName(opNumber);
  if (!folderValue || !orderValue) return false;

  // Estruturas atuais e antigas que preservam o número completo da OP.
  if (folderValue.includes(orderValue)) return true;

  // Algumas estruturas antigas usam somente o último número do subpedido,
  // por exemplo "OP 0672 - LETREIRO" para LEG-2026-0672. O fallback só é
  // habilitado para números compostos com pelo menos três partes, evitando
  // confundir uma OP pai curta (como LEG-2026) com outras ordens do mesmo ano.
  const orderTokens = orderNameTokens(opNumber);
  if (orderTokens.length < 3) return false;
  const suffix = orderTokens.at(-1) || "";
  if (suffix.length < 3) return false;
  return orderNameTokens(folderName).includes(suffix);
}

function addUniqueFolder(target: Map<string, DriveFile>, folder: DriveFile | null | undefined) {
  if (folder?.id && folder.mimeType === DRIVE_FOLDER_MIME) target.set(folder.id, folder);
}

async function folderIsInsideRoot(folderId: string, rootId: string) {
  let currentId = folderId;
  const visited = new Set<string>();

  for (let level = 0; level < 30 && currentId && !visited.has(currentId); level += 1) {
    if (currentId === rootId) return true;
    visited.add(currentId);
    const current = await driveFolderMetadata(currentId);
    currentId = current.parents?.[0] || "";
  }

  return false;
}

async function searchExactOrderFolders(opNumber: string, configuredRootId: string) {
  const matches = new Map<string, DriveFile>();
  const sanitized = sanitizeDriveName(opNumber);
  const suffix = sanitized.split(/[-_/\s]+/).filter(Boolean).at(-1) || sanitized;
  const exactNames = Array.from(new Set([
    `OP ${sanitized}`,
    `SUBPEDIDO ${sanitized}`,
    sanitized,
  ]));
  const queries = [
    ...exactNames.map((name) => [
      `name = '${escapeDriveQuery(name)}'`,
      `mimeType = '${DRIVE_FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and ")),
    [
      `name contains '${escapeDriveQuery(suffix)}'`,
      `mimeType = '${DRIVE_FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and "),
  ];

  for (const query of queries) {
    const folders = await queryDriveFiles(
      query,
      "nextPageToken,files(id,name,mimeType,webViewLink,parents)",
      1000,
    );
    for (const folder of folders) {
      if (folderMatchesOrder(folder.name, opNumber) && await folderIsInsideRoot(folder.id, configuredRootId)) {
        addUniqueFolder(matches, folder);
      }
    }
  }
  return Array.from(matches.values());
}

async function collectMatchingDescendantFolders(parentId: string, opNumber: string, maxDepth = 4) {
  const matches = new Map<string, DriveFile>();
  const queue: Array<{ id: string; depth: number }> = [{ id: parentId, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.id) || current.depth >= maxDepth) continue;
    visited.add(current.id);

    for (const child of await directChildFolders(current.id)) {
      if (folderMatchesOrder(child.name, opNumber)) addUniqueFolder(matches, child);
      queue.push({ id: child.id, depth: current.depth + 1 });
    }
  }

  return Array.from(matches.values());
}

async function findOrderFolders(order: { op_number: string; client_name: string }) {
  const settings = await getDriveSettings();
  let root: DriveFile | null = null;

  if (settings.root_folder_id) {
    try {
      root = await driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(settings.root_folder_id)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents`);
    } catch {
      root = null;
    }
  }

  if (!root) root = await findFolder(sanitizeDriveName(settings.root_folder_name || "PUBLICOLOR - SISTEMA PCP"), "root");
  if (!root) return [];

  const matches = new Map<string, DriveFile>();
  const clients = await findFolder("CLIENTES", root.id);

  if (clients) {
    const client = await findFolder(sanitizeDriveName(order.client_name), clients.id);
    if (client) {
      for (const candidate of [
        `OP ${sanitizeDriveName(order.op_number)}`,
        `SUBPEDIDO ${sanitizeDriveName(order.op_number)}`,
        sanitizeDriveName(order.op_number),
      ]) {
        addUniqueFolder(matches, await findFolder(candidate, client.id));
      }

      for (const folder of await collectMatchingDescendantFolders(client.id, order.op_number, 4)) {
        addUniqueFolder(matches, folder);
      }

      // Compatibilidade com a estrutura OP pai → SUBPEDIDO.
      const family = orderFamily(order.op_number);
      if (family.isSubOrder) {
        const parentFolders = (await directChildFolders(client.id))
          .filter((folder) => folderMatchesOrder(folder.name, family.parent));
        for (const parent of parentFolders) {
          for (const child of await directChildFolders(parent.id)) {
            if (folderMatchesOrder(child.name, order.op_number)) addUniqueFolder(matches, child);
          }
        }
      }
    }
  }

  // Procura também pastas duplicadas ou antigas com o mesmo número da ordem,
  // desde que continuem dentro da pasta principal configurada do Publicolor.
  for (const folder of await searchExactOrderFolders(order.op_number, root.id)) {
    addUniqueFolder(matches, folder);
  }

  return Array.from(matches.values());
}

export async function ensureOrderFolder(order: { id?: string; op_number: string; client_name: string }) {
  // Normaliza primeiro toda a cadeia principal. O ensureFolder pesquisa por
  // nome equivalente, consolida duplicatas e só cria quando realmente não há
  // uma pasta correspondente sob o mesmo pai.
  const root = await ensureRootFolder();
  const clients = await ensureFolder("CLIENTES", root.id);
  const client = await ensureFolder(sanitizeDriveName(order.client_name), clients.id);

  // Preserva compatibilidade com estruturas antigas ou pastas renomeadas.
  // Depois da consolidação do cliente, todas as OPs antes espalhadas entre
  // pastas duplicadas passam a estar sob o mesmo cliente canônico.
  const existingFolders = await findOrderFolders(order);
  if (existingFolders.length) return existingFolders[0];

  const family = orderFamily(order.op_number);
  const op = await ensureFolder(`OP ${sanitizeDriveName(family.parent)}`, client.id);
  return family.isSubOrder
    ? await ensureFolder(`SUBPEDIDO ${sanitizeDriveName(order.op_number)}`, op.id)
    : op;
}

export async function ensureOrderCategoryFolder(
  order: { id?: string; op_number: string; client_name: string },
  category: string,
) {
  const orderFolder = await ensureOrderFolder(order);
  const folder = await ensureFolder(categoryFolder[category] || categoryFolder.other, orderFolder.id);
  return { ...folder, orderFolderId: orderFolder.id, orderFolderName: orderFolder.name };
}

export async function rememberOrderDriveFolder(input: {
  orderId: string;
  folderId: string;
  folderName?: string | null;
  parentFolderId?: string | null;
  folderKind: "order_root" | "category" | "discovered";
  category?: string | null;
  userId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  const folderRecord = {
    order_id: input.orderId,
    drive_folder_id: input.folderId,
    drive_folder_name: input.folderName || null,
    parent_drive_folder_id: input.parentFolderId || null,
    folder_kind: input.folderKind,
    file_category: input.category || null,
    discovered_by: input.userId || null,
    last_seen_at: new Date().toISOString(),
  };
  const { data: existingFolder, error: lookupError } = await admin
    .from("order_drive_folders")
    .select("id")
    .eq("order_id", input.orderId)
    .eq("drive_folder_id", input.folderId)
    .limit(1)
    .maybeSingle();

  let error = lookupError;
  if (!error) {
    const result = existingFolder
      ? await admin.from("order_drive_folders").update(folderRecord).eq("id", existingFolder.id)
      : await admin.from("order_drive_folders").insert(folderRecord);
    error = result.error;
  }

  if (error) {
    const migrationHint = /order_drive_folders|does not exist|schema cache/i.test(error.message)
      ? " Execute a migração de registro das pastas do Google Drive."
      : "";
    throw new Error(`Não foi possível registrar a pasta da ordem: ${error.message}.${migrationHint}`.replace(/\.\s*\./g, "."));
  }
}

const categoryAliases: Record<string, string[]> = {
  art: ["ARTE", "ARTES", "ARQUIVO DE ARTE", "ARQUIVOS DE ARTE"],
  approval: ["APROVACAO", "APROVACOES", "APROVADO", "APROVADOS"],
  production: ["PRODUCAO", "PRODUCOES", "ARQUIVO DE PRODUCAO", "ARQUIVOS DE PRODUCAO"],
  document: ["DOCUMENTO", "DOCUMENTOS", "DOC", "DOCS"],
  photo: ["FOTO", "FOTOS", "IMAGEM", "IMAGENS"],
  installation: ["INSTALACAO", "INSTALACOES", "ENTREGA", "ENTREGAS", "INSTALACAO E ENTREGA"],
  other: ["OUTRO", "OUTROS", "DIVERSOS", "GERAL", "GERAIS"],
};

function normalizedFolderLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/^\s*\d+\s*(?:[-_.:)]\s*)?/, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function resolveFolderCategory(folderName: string) {
  const normalized = normalizedFolderLabel(folderName);
  for (const [category, aliases] of Object.entries(categoryAliases)) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `))) {
      return category;
    }
  }
  return null;
}

const driveListFields = "nextPageToken,files(id,name,mimeType,size,webViewLink,parents,createdTime,modifiedTime,md5Checksum,lastModifyingUser(displayName,emailAddress),appProperties,shortcutDetails(targetId,targetMimeType,targetResourceKey))";

async function listFolderChildren(folderId: string) {
  return queryDriveFiles(
    `'${escapeDriveQuery(folderId)}' in parents and trashed = false`,
    driveListFields,
    1000,
  );
}

async function collectOrderFolderFiles(
  folderId: string,
  inheritedCategory = "other",
  visitedFolders = new Set<string>(),
  categoryFolders = new Map<string, DriveFile & { resolvedCategory?: string }>(),
  warnings: unknown[] = [],
): Promise<DriveFile[]> {
  // Um único conjunto é compartilhado por toda a sincronização. Isso impede
  // ciclos de atalhos e evita consultar novamente a mesma pasta quando ela é
  // encontrada por mais de um caminho (registro, arquivo antigo ou busca).
  if (visitedFolders.has(folderId)) return [];
  visitedFolders.add(folderId);

  let children: DriveFile[] = [];
  try {
    children = await listFolderChildren(folderId);
  } catch (error) {
    // Uma subpasta sem permissão ou um atalho quebrado não pode impedir que as
    // demais pastas da OP sejam sincronizadas. O erro segue no campo warnings.
    warnings.push(error);
    return [];
  }
  const result: DriveFile[] = [];

  for (const child of children) {
    if (child.mimeType === DRIVE_FOLDER_MIME) {
      const explicitCategory = resolveFolderCategory(child.name);
      const nestedCategory = explicitCategory || inheritedCategory;
      if (explicitCategory) {
        categoryFolders.set(child.id, { ...child, resolvedCategory: explicitCategory });
      }
      result.push(...await collectOrderFolderFiles(
        child.id,
        nestedCategory,
        visitedFolders,
        categoryFolders,
        warnings,
      ));
      continue;
    }

    // Atalhos para pastas também são percorridos. Isso é comum quando Fotos,
    // Produção ou Instalação foram adicionadas à OP por atalho.
    if (
      child.mimeType === DRIVE_SHORTCUT_MIME
      && child.shortcutDetails?.targetMimeType === DRIVE_FOLDER_MIME
      && child.shortcutDetails.targetId
    ) {
      const explicitCategory = resolveFolderCategory(child.name);
      const nestedCategory = explicitCategory || inheritedCategory;
      if (explicitCategory) {
        categoryFolders.set(child.shortcutDetails.targetId, {
          id: child.shortcutDetails.targetId,
          name: child.name,
          mimeType: DRIVE_FOLDER_MIME,
          parents: [folderId],
          webViewLink: child.webViewLink,
          resolvedCategory: explicitCategory,
        });
      }
      result.push(...await collectOrderFolderFiles(
        child.shortcutDetails.targetId,
        nestedCategory,
        visitedFolders,
        categoryFolders,
        warnings,
      ));
      continue;
    }

    // Nenhum filtro por extensão ou MIME. Arquivos Google, CDR, AI, PSD, ZIP,
    // vídeos e qualquer outro item não-pasta são vinculados à OS.
    result.push({
      ...child,
      resolvedCategory: child.appProperties?.publicolor_category || inheritedCategory || "other",
    });
  }

  return result;
}

async function driveFolderMetadata(folderId: string) {
  return driveFetch<DriveFile>(
    `/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,name,mimeType,parents,webViewLink,shortcutDetails(targetId,targetMimeType,targetResourceKey)`,
  );
}

async function candidateOrderRootsFromKnownFolders(
  order: { op_number: string; client_name: string },
  knownFolders: Array<{ id: string; category?: string | null }>,
) {
  const roots = new Map<string, string>();

  for (const known of knownFolders) {
    const folderId = known.id?.trim();
    if (!folderId) continue;

    try {
      const folder = await driveFolderMetadata(folderId);
      if (folder.mimeType !== DRIVE_FOLDER_MIME) continue;

      const folderCategory = resolveFolderCategory(folder.name);
      const parentId = folder.parents?.[0];

      // Se o ID salvo é uma pasta de categoria, o pai imediato é a raiz real da
      // OP/subpedido. Essa regra é prioritária e garante que todas as categorias
      // irmãs (Arte, Aprovação, Produção, Documentos, Fotos, Instalação e Outros)
      // sejam consultadas, não apenas as categorias já vinculadas.
      if (folderCategory && parentId) {
        roots.set(parentId, "other");
      }

      let current = folder;
      let nearestOrderFolder: DriveFile | null = null;
      for (let level = 0; level < 12; level += 1) {
        if (folderMatchesOrder(current.name, order.op_number)) {
          nearestOrderFolder = current;
          break;
        }

        const currentParentId = current.parents?.[0];
        if (!currentParentId) break;
        const parent = await driveFolderMetadata(currentParentId);
        if (parent.name === "CLIENTES") break;
        current = parent;
      }

      if (nearestOrderFolder) roots.set(nearestOrderFolder.id, "other");
      else if (parentId) roots.set(parentId, "other");

      // Consulta direta continua como fallback para estruturas antigas.
      roots.set(folder.id, known.category?.trim() || folderCategory || "other");
    } catch {
      // ID apagado ou sem acesso: outras formas de localização continuam.
    }
  }

  return roots;
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
  return driveFetch<DriveFile>(`/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,parents,createdTime,modifiedTime,md5Checksum,lastModifyingUser(displayName,emailAddress),appProperties,shortcutDetails(targetId,targetMimeType,targetResourceKey)`);
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

  const exactParams = withSharedDriveOptions(new URLSearchParams({
    q: [...common, `appProperties has { key='publicolor_upload_session' and value='${escapeDriveQuery(input.uploadSessionId)}' }`].join(" and "),
    spaces: "drive",
    pageSize: "10",
    orderBy: "createdTime desc",
    fields,
  }));
  const exact = await driveFetch<{ files?: DriveFile[] }>(`/drive/v3/files?${exactParams.toString()}`);
  if (exact.files?.[0]) return exact.files[0];

  // Compatibilidade com sessões criadas antes da correção do identificador único.
  const legacyParams = withSharedDriveOptions(new URLSearchParams({
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
  }));
  const legacy = await driveFetch<{ files?: DriveFile[] }>(`/drive/v3/files?${legacyParams.toString()}`);
  return legacy.files?.[0] || null;
}

export async function listDriveFilesForOrder(
  order: { id: string; op_number: string; client_name: string },
  knownFolders: Array<{ id: string; category?: string | null; kind?: string | null }> = [],
) {
  // Sem o escopo completo, a API só enxerga arquivos criados pelo próprio
  // aplicativo. Validar antes da varredura evita uma falsa mensagem de sucesso
  // quando existem arquivos adicionados manualmente pelo usuário no Drive.
  await assertCompleteDriveAccess();
  const filesById = new Map<string, DriveFile>();
  const failures: unknown[] = [];
  const normalizedKnownFolders = [...knownFolders];
  try {
    // A atualização de arquivos também normaliza a estrutura. Assim, clicar em
    // “Atualizar arquivos” consolida pastas repetidas de cliente, OP,
    // subpedido e categoria antes de iniciar a varredura.
    const canonicalOrderFolder = await ensureOrderFolder(order);
    normalizedKnownFolders.unshift({
      id: canonicalOrderFolder.id,
      category: null,
      kind: "order_root",
    });
  } catch (error) {
    failures.push(error);
  }
  const scannedRoots = new Set<string>();
  const scannedFolders = new Set<string>();
  const resolvedRoots = new Map<string, DriveFile>();
  let successfulLookup = false;

  const append = (files: DriveFile[]) => {
    for (const file of files) {
      if (file.mimeType === DRIVE_FOLDER_MIME) continue;
      filesById.set(file.id, file);
    }
  };

  const scannedCategoryFolderIds = new Set<string>();
  const resolvedCategoryFolders = new Map<string, DriveFile & { resolvedCategory?: string }>();

  const scanRoot = async (folderId: string, category = "other") => {
    const normalized = folderId.trim();
    if (!normalized || scannedRoots.has(normalized)) return;
    scannedRoots.add(normalized);

    const metadata = await driveFolderMetadata(normalized);
    if (metadata.mimeType !== DRIVE_FOLDER_MIME) return;
    // Pastas de categoria podem ser usadas como fallback, mas nunca substituem
    // a raiz da ordem no registro persistente.
    if (!resolveFolderCategory(metadata.name)) resolvedRoots.set(metadata.id, metadata);

    // Uma única varredura recursiva percorre a raiz, todas as sete categorias,
    // subpastas livres e atalhos. O conjunto global evita chamadas duplicadas.
    const discoveredCategories = new Map<string, DriveFile & { resolvedCategory?: string }>();
    append(await collectOrderFolderFiles(
      normalized,
      category,
      scannedFolders,
      discoveredCategories,
      failures,
    ));
    for (const [id, categoryFolder] of discoveredCategories) {
      scannedCategoryFolderIds.add(id);
      resolvedCategoryFolders.set(id, categoryFolder);
    }

    successfulLookup = true;
  };

  // 1. Todas as estruturas localizadas pelo número completo da OP/subpedido.
  try {
    const orderFolders = await findOrderFolders(order);
    successfulLookup = true;
    for (const orderFolder of orderFolders) {
      try {
        await scanRoot(orderFolder.id);
      } catch (error) {
        failures.push(error);
      }
    }
  } catch (error) {
    failures.push(error);
  }

  // 2. Pastas registradas e pastas dos arquivos já vinculados. Ao subir pela
  // árvore, a rotina encontra a raiz real mesmo após renomeações ou mudanças de
  // cliente e consulta todas as pastas irmãs da ordem.
  const derivedRoots = await candidateOrderRootsFromKnownFolders(order, normalizedKnownFolders);
  for (const [folderId, category] of derivedRoots) {
    try {
      await scanRoot(folderId, category);
    } catch (error) {
      failures.push(error);
    }
  }

  // 3. Consulta direta de cada pasta conhecida como fallback. Isso cobre
  // arquivos em categorias externas ou estruturas que não possuem uma raiz
  // reconhecível pelo nome da OP.
  const uniqueKnownFolders = new Map<string, string>();
  for (const folder of normalizedKnownFolders) {
    const id = folder.id?.trim();
    if (!id) continue;
    uniqueKnownFolders.set(id, folder.category?.trim() || "other");
  }
  for (const [folderId, category] of uniqueKnownFolders) {
    try {
      await scanRoot(folderId, category);
    } catch (error) {
      failures.push(error);
    }
  }

  // 4. Compatibilidade com arquivos enviados por versões anteriores, que podem
  // estar identificados somente pelas appProperties do Google Drive.
  try {
    const legacyFiles = await queryDriveFiles([
      "trashed = false",
      `mimeType != '${DRIVE_FOLDER_MIME}'`,
      `appProperties has { key='publicolor_order_id' and value='${escapeDriveQuery(order.id)}' }`,
    ].join(" and "), driveListFields, 1000);
    successfulLookup = true;
    append(legacyFiles.map((file) => ({
      ...file,
      resolvedCategory: file.appProperties?.publicolor_category || "other",
    })));
  } catch (error) {
    failures.push(error);
  }

  if (!successfulLookup && failures.length) throw failures[0];

  const files = Array.from(filesById.values()).sort((first, second) => {
    const firstTime = new Date(first.modifiedTime || first.createdTime || 0).getTime();
    const secondTime = new Date(second.modifiedTime || second.createdTime || 0).getTime();
    return secondTime - firstTime;
  });
  const categoryCounts = files.reduce<Record<string, number>>((counts, file) => {
    const category = file.appProperties?.publicolor_category || file.resolvedCategory || "other";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});

  return {
    files,
    categoryCounts,
    scannedFolderIds: Array.from(new Set([...scannedFolders, ...scannedRoots, ...scannedCategoryFolderIds])),
    scannedCategoryFolderIds: Array.from(scannedCategoryFolderIds),
    orderFolderId: Array.from(resolvedRoots.keys())[0] || null,
    orderFolders: Array.from(resolvedRoots.values()).map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parents?.[0] || null,
    })),
    categoryFolders: Array.from(resolvedCategoryFolders.values()).map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parents?.[0] || null,
      category: folder.resolvedCategory || "other",
    })),
    warnings: failures.map((error) => error instanceof Error ? error.message : String(error)).filter(Boolean),
  };
}

const GOOGLE_EXPORT_FORMATS: Record<string, { mimeType: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: ".pptx",
  },
  "application/vnd.google-apps.drawing": {
    mimeType: "application/pdf",
    extension: ".pdf",
  },
};

function fileNameWithExtension(name: string, extension: string) {
  return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`;
}

export async function downloadDriveFile(fileId: string) {
  let metadata = await verifyDriveFile(fileId);

  // Atalhos de arquivos são resolvidos antes do download. Atalhos de pasta não
  // são baixáveis e permanecem disponíveis apenas pelo botão Abrir no Drive.
  if (metadata.mimeType === DRIVE_SHORTCUT_MIME && metadata.shortcutDetails?.targetId) {
    if (metadata.shortcutDetails.targetMimeType === DRIVE_FOLDER_MIME) {
      throw new Error("Este item é um atalho de pasta. Use Abrir no Drive para consultar o conteúdo.");
    }
    metadata = await verifyDriveFile(metadata.shortcutDetails.targetId);
    fileId = metadata.id;
  }

  const exportFormat = metadata.mimeType ? GOOGLE_EXPORT_FORMATS[metadata.mimeType] : null;
  const requestPath = exportFormat
    ? `/drive/v3/files/${encodeURIComponent(fileId)}/export?supportsAllDrives=true&mimeType=${encodeURIComponent(exportFormat.mimeType)}`
    : `/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&alt=media`;

  const execute = async (accessToken: string) => fetch(
    `https://www.googleapis.com${requestPath}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  let token = await validDriveAccessToken();
  let response = await execute(token.accessToken);
  if (response.status === 401) {
    token = await validDriveAccessToken(true);
    response = await execute(token.accessToken);
  }
  if (!response.ok) throw await driveApiError(response);

  return {
    response,
    fileName: exportFormat ? fileNameWithExtension(metadata.name, exportFormat.extension) : metadata.name,
    mimeType: exportFormat?.mimeType || metadata.mimeType || response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function deleteDriveFile(fileId: string) {
  const execute = async (accessToken: string) => fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
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
  await assertCompleteDriveAccess();
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
