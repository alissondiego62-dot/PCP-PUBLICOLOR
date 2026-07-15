import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { decryptDriveSecret, encryptDriveSecret } from "@/lib/server/drive-crypto";
import { getSupabaseAdmin, type AuthorizedAppUser } from "@/lib/server/supabase-server";

export type PlatformSettingsRow = {
  singleton_id: number;
  vercel_access_token_ciphertext: string | null;
  vercel_project_id: string;
  vercel_team_id: string;
  vercel_deploy_hook_ciphertext: string | null;
  supabase_management_token_ciphertext: string | null;
  supabase_project_ref: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TargetSupabaseInput = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  projectRef?: string;
};

const REQUIRED_TARGET_TABLES = [
  "profiles",
  "sectors",
  "clients",
  "orders",
  "order_history",
  "google_drive_settings",
  "system_platform_settings",
] as const;

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeSupabaseUrl(value: string) {
  const url = new URL(clean(value));
  if (url.protocol !== "https:") throw new Error("A URL do Supabase deve usar HTTPS.");
  return url.origin.replace(/\/$/, "");
}

export function projectRefFromUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    const hostname = new URL(value).hostname;
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function maskText(value: string | null | undefined, visibleStart = 5, visibleEnd = 4) {
  const normalized = clean(value);
  if (!normalized) return "Não configurado";
  if (normalized.length <= visibleStart + visibleEnd) return "••••••••";
  return `${normalized.slice(0, visibleStart)}••••••••${normalized.slice(-visibleEnd)}`;
}

export async function getPlatformSettings() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("system_platform_settings")
    .select("*")
    .eq("singleton_id", 1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível ler as configurações administrativas: ${error.message}`);
  if (!data) throw new Error("Execute a migração do módulo Banco, Ambiente e SQL.");
  return data as PlatformSettingsRow;
}

export function publicPlatformSettings(settings: PlatformSettingsRow) {
  const currentUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const currentPublishable = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const currentServiceRole = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const currentAppUrl = clean(process.env.NEXT_PUBLIC_APP_URL);

  return {
    vercel_project_id: settings.vercel_project_id,
    vercel_team_id: settings.vercel_team_id,
    vercel_token_configured: Boolean(settings.vercel_access_token_ciphertext),
    deploy_hook_configured: Boolean(settings.vercel_deploy_hook_ciphertext),
    supabase_project_ref: settings.supabase_project_ref || projectRefFromUrl(currentUrl),
    supabase_management_token_configured: Boolean(settings.supabase_management_token_ciphertext),
    updated_at: settings.updated_at,
    current_environment: {
      supabase_url: currentUrl,
      project_ref: projectRefFromUrl(currentUrl),
      publishable_key_masked: maskText(currentPublishable, 12, 5),
      service_role_key_masked: maskText(currentServiceRole, 8, 5),
      app_url: currentAppUrl,
      encryption_root_configured: Boolean(process.env.DRIVE_SETTINGS_ENCRYPTION_KEY),
    },
  };
}

export async function savePlatformSettings(input: {
  vercelProjectId: string;
  vercelTeamId: string;
  vercelAccessToken?: string;
  deployHookUrl?: string;
  supabaseProjectRef: string;
  supabaseManagementToken?: string;
  userId: string;
}) {
  const current = await getPlatformSettings();
  const patch: Record<string, unknown> = {
    vercel_project_id: clean(input.vercelProjectId),
    vercel_team_id: clean(input.vercelTeamId),
    supabase_project_ref: clean(input.supabaseProjectRef),
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
  };

  if (clean(input.vercelAccessToken)) {
    patch.vercel_access_token_ciphertext = encryptDriveSecret(clean(input.vercelAccessToken));
  }
  if (clean(input.deployHookUrl)) {
    const deployHook = new URL(clean(input.deployHookUrl));
    if (deployHook.protocol !== "https:") throw new Error("O Deploy Hook deve usar HTTPS.");
    patch.vercel_deploy_hook_ciphertext = encryptDriveSecret(deployHook.toString());
  }
  if (clean(input.supabaseManagementToken)) {
    patch.supabase_management_token_ciphertext = encryptDriveSecret(clean(input.supabaseManagementToken));
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("system_platform_settings")
    .update(patch)
    .eq("singleton_id", current.singleton_id)
    .select("*")
    .single();
  if (error) throw new Error(`Não foi possível salvar as configurações administrativas: ${error.message}`);
  return data as PlatformSettingsRow;
}

function platformCredentials(settings: PlatformSettingsRow) {
  return {
    vercelAccessToken: decryptDriveSecret(settings.vercel_access_token_ciphertext),
    deployHookUrl: decryptDriveSecret(settings.vercel_deploy_hook_ciphertext),
    supabaseManagementToken: decryptDriveSecret(settings.supabase_management_token_ciphertext),
  };
}

function vercelQuery(teamId: string) {
  const query = new URLSearchParams();
  if (teamId) query.set("teamId", teamId);
  return query.toString() ? `?${query.toString()}` : "";
}

async function vercelRequest(settings: PlatformSettingsRow, path: string, init: RequestInit = {}) {
  const { vercelAccessToken } = platformCredentials(settings);
  if (!vercelAccessToken) throw new Error("Informe e salve o token de acesso da Vercel.");
  const response = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      authorization: `Bearer ${vercelAccessToken}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const nested = payload.error as { message?: string } | undefined;
    throw new Error(nested?.message || String(payload.message || `A Vercel respondeu com status ${response.status}.`));
  }
  return payload;
}

export async function testVercelConnection(settings?: PlatformSettingsRow) {
  const resolvedSettings = settings || await getPlatformSettings();
  if (!resolvedSettings.vercel_project_id) throw new Error("Informe o ID ou nome do projeto da Vercel.");
  const result = await vercelRequest(
    resolvedSettings,
    `/v9/projects/${encodeURIComponent(resolvedSettings.vercel_project_id)}${vercelQuery(resolvedSettings.vercel_team_id)}`,
  );
  return {
    project_id: String(result.id || resolvedSettings.vercel_project_id),
    project_name: String(result.name || resolvedSettings.vercel_project_id),
    framework: String(result.framework || "Não informado"),
  };
}

async function testRequiredTable(client: ReturnType<typeof createClient>, table: string) {
  const { error } = await client.from(table).select("*").limit(1);
  if (error) throw new Error(`O banco de destino não possui acesso válido à tabela ${table}: ${error.message}`);
}

export async function testTargetSupabase(input: TargetSupabaseInput, actorEmail: string) {
  const supabaseUrl = normalizeSupabaseUrl(input.supabaseUrl);
  const publishableKey = clean(input.publishableKey);
  const serviceRoleKey = clean(input.serviceRoleKey);
  if (!publishableKey) throw new Error("Informe a Publishable Key do novo Supabase.");
  if (!serviceRoleKey) throw new Error("Informe a Service Role Key do novo Supabase.");

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  for (const table of REQUIRED_TARGET_TABLES) await testRequiredTable(adminClient, table);
  await testRequiredTable(publicClient, "profiles");

  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(`A Service Role Key não conseguiu consultar os usuários: ${usersError.message}`);
  const targetUser = usersData.users.find((item: { email?: string | null; id: string }) => item.email?.toLowerCase() === actorEmail.toLowerCase());

  let adminReady = false;
  let targetUserId = "";
  if (targetUser) {
    targetUserId = targetUser.id;
    const { data: targetProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("id,role,active,email")
      .eq("id", targetUser.id)
      .maybeSingle();
    if (profileError) throw new Error(`Não foi possível validar o perfil administrador no destino: ${profileError.message}`);
    adminReady = Boolean(targetProfile?.active && targetProfile.role === "admin");
  }

  return {
    ok: true,
    supabase_url: supabaseUrl,
    project_ref: clean(input.projectRef) || projectRefFromUrl(supabaseUrl),
    admin_ready: adminReady,
    target_user_id: targetUserId,
    message: adminReady
      ? "Conexão validada. O administrador atual existe e está ativo no banco de destino."
      : `Conexão validada, mas ${actorEmail} ainda não possui perfil administrador ativo no banco de destino.`,
  };
}

async function upsertVercelVariable(settings: PlatformSettingsRow, input: {
  key: string;
  value: string;
  type: "plain" | "encrypted";
}) {
  const teamQuery = vercelQuery(settings.vercel_team_id);
  const separator = teamQuery ? "&" : "?";
  return vercelRequest(
    settings,
    `/v10/projects/${encodeURIComponent(settings.vercel_project_id)}/env${teamQuery}${separator}upsert=true`,
    {
      method: "POST",
      body: JSON.stringify({
        key: input.key,
        value: input.value,
        type: input.type,
        target: ["production"],
        comment: "Atualizado pelo painel administrativo do Publicolor 3.0",
      }),
    },
  );
}

async function copyProtectedSettingsToTarget(
  target: TargetSupabaseInput,
  targetUserId: string,
  currentSettings: PlatformSettingsRow,
) {
  const targetClient = createClient(normalizeSupabaseUrl(target.supabaseUrl), clean(target.serviceRoleKey), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const currentAdmin = getSupabaseAdmin();

  const { error: platformError } = await targetClient.from("system_platform_settings").upsert({
    singleton_id: 1,
    vercel_access_token_ciphertext: currentSettings.vercel_access_token_ciphertext,
    vercel_project_id: currentSettings.vercel_project_id,
    vercel_team_id: currentSettings.vercel_team_id,
    vercel_deploy_hook_ciphertext: currentSettings.vercel_deploy_hook_ciphertext,
    supabase_management_token_ciphertext: currentSettings.supabase_management_token_ciphertext,
    supabase_project_ref: clean(target.projectRef) || projectRefFromUrl(target.supabaseUrl),
    updated_by: targetUserId || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "singleton_id" });
  if (platformError) throw new Error(`Não foi possível copiar as configurações administrativas para o banco de destino: ${platformError.message}`);

  const { data: driveSettings, error: driveReadError } = await currentAdmin
    .from("google_drive_settings")
    .select("*")
    .eq("singleton_id", 1)
    .maybeSingle();
  if (driveReadError) throw new Error(`Não foi possível ler a configuração atual do Google Drive: ${driveReadError.message}`);
  if (driveSettings) {
    const { error: driveCopyError } = await targetClient.from("google_drive_settings").upsert({
      ...driveSettings,
      singleton_id: 1,
      updated_by: targetUserId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "singleton_id" });
    if (driveCopyError) throw new Error(`Não foi possível copiar a configuração do Google Drive para o banco de destino: ${driveCopyError.message}`);
  }
}

export async function applyEnvironmentChange(input: {
  target: TargetSupabaseInput;
  appUrl?: string;
  actor: AuthorizedAppUser;
}) {
  const settings = await getPlatformSettings();
  if (!process.env.DRIVE_SETTINGS_ENCRYPTION_KEY) {
    throw new Error("Defina DRIVE_SETTINGS_ENCRYPTION_KEY na Vercel antes de trocar o banco. Sem uma raiz fixa, os segredos cifrados deixariam de funcionar após a mudança da Service Role.");
  }
  const credentials = platformCredentials(settings);
  if (!settings.vercel_project_id || !credentials.vercelAccessToken) {
    throw new Error("Configure o projeto e o token da Vercel antes de aplicar a troca.");
  }
  if (!credentials.deployHookUrl) {
    throw new Error("Configure um Deploy Hook da Vercel para publicar a troca automaticamente.");
  }

  const targetTest = await testTargetSupabase(input.target, input.actor.email);
  if (!targetTest.admin_ready || !targetTest.target_user_id) {
    throw new Error("A troca foi bloqueada: o administrador atual precisa existir como perfil admin ativo no banco de destino.");
  }

  const admin = getSupabaseAdmin();
  const changedKeys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    ...(clean(input.appUrl) ? ["NEXT_PUBLIC_APP_URL"] : []),
  ];
  const { data: audit, error: auditError } = await admin.from("system_environment_changes").insert({
    actor_id: input.actor.user.id,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    target_project_ref: targetTest.project_ref,
    target_supabase_url_masked: targetTest.supabase_url.replace(/^(https:\/\/).+?(\.supabase\.co)$/i, "$1••••••$2"),
    changed_keys: changedKeys,
    status: "validated",
  }).select("id").single();
  if (auditError) throw new Error(`Não foi possível iniciar a auditoria da troca: ${auditError.message}`);

  try {
    await copyProtectedSettingsToTarget(input.target, targetTest.target_user_id, settings);

    const variables = [
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: targetTest.supabase_url, type: "plain" as const },
      { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value: clean(input.target.publishableKey), type: "encrypted" as const },
      { key: "SUPABASE_SERVICE_ROLE_KEY", value: clean(input.target.serviceRoleKey), type: "encrypted" as const },
      ...(clean(input.appUrl)
        ? [{ key: "NEXT_PUBLIC_APP_URL", value: clean(input.appUrl).replace(/\/$/, ""), type: "plain" as const }]
        : []),
    ];

    for (const variable of variables) await upsertVercelVariable(settings, variable);
    await admin.from("system_environment_changes").update({ status: "variables_updated" }).eq("id", audit.id);

    const deploymentResponse = await fetch(credentials.deployHookUrl, { method: "POST", cache: "no-store" });
    const deploymentPayload = await deploymentResponse.json().catch(() => ({})) as { job?: { id?: string }; error?: string };
    if (!deploymentResponse.ok) {
      throw new Error(deploymentPayload.error || `O Deploy Hook respondeu com status ${deploymentResponse.status}.`);
    }
    const deploymentJobId = deploymentPayload.job?.id || "";
    await admin.from("system_environment_changes").update({
      status: "deployment_triggered",
      deployment_job_id: deploymentJobId || null,
    }).eq("id", audit.id);

    await admin.from("system_environment_changes").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", audit.id);

    return {
      message: "As variáveis foram atualizadas e um novo deployment foi iniciado. Ao concluir, entre novamente no sistema.",
      deployment_job_id: deploymentJobId || null,
      target_project_ref: targetTest.project_ref,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao trocar o ambiente.";
    await admin.from("system_environment_changes").update({
      status: "failed",
      error_message: message.slice(0, 4000),
      completed_at: new Date().toISOString(),
    }).eq("id", audit.id);
    throw error;
  }
}

export function analyzeSql(sql: string) {
  const normalized = sql.replace(/^\uFEFF/, "").trim();
  const risks: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bdrop\s+(table|schema|view|function|type|policy|trigger)\b/i, "DROP de objeto"],
    [/\btruncate\b/i, "TRUNCATE"],
    [/\bdelete\s+from\b/i, "DELETE"],
    [/\balter\s+table\b/i, "ALTER TABLE"],
    [/\bcreate\s+or\s+replace\s+function\b/i, "Função SQL"],
    [/\brevoke\b|\bgrant\b/i, "Permissões"],
  ];
  for (const [pattern, label] of checks) if (pattern.test(normalized)) risks.push(label);
  const statementCount = normalized
    .split(/;\s*(?:\r?\n|$)/)
    .map((part) => part.trim())
    .filter(Boolean).length;
  return { normalized, risks, statementCount };
}

export function sqlSha256(sql: string) {
  return createHash("sha256").update(sql).digest("hex");
}

export async function executeSupabaseSql(input: {
  sql: string;
  projectRef: string;
  fileName: string;
  fileSize: number;
  allowRepeat: boolean;
  actor: AuthorizedAppUser;
}) {
  const settings = await getPlatformSettings();
  const { supabaseManagementToken } = platformCredentials(settings);
  if (!supabaseManagementToken) throw new Error("Informe o token do Supabase Management API nas configurações administrativas.");
  const projectRef = clean(input.projectRef) || settings.supabase_project_ref || projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!projectRef) throw new Error("Informe a referência do projeto Supabase que receberá o SQL.");

  const { normalized, risks, statementCount } = analyzeSql(input.sql);
  if (!normalized) throw new Error("O arquivo SQL está vazio.");
  if (/^\s*\\/m.test(normalized)) throw new Error("Comandos internos do psql, como \\i ou \\copy, não são aceitos pelo executor web.");
  const fileHash = sqlSha256(normalized);
  const admin = getSupabaseAdmin();

  if (!input.allowRepeat) {
    const { data: previous, error: previousError } = await admin
      .from("system_sql_updates")
      .select("id,started_at")
      .eq("project_ref", projectRef)
      .eq("file_sha256", fileHash)
      .eq("status", "success")
      .maybeSingle();
    if (previousError) throw new Error(`Não foi possível verificar o histórico do SQL: ${previousError.message}`);
    if (previous) throw new Error("Este mesmo arquivo SQL já foi executado com sucesso nesse projeto. Marque a opção de repetição apenas quando necessário.");
  }

  const { data: audit, error: auditError } = await admin.from("system_sql_updates").insert({
    actor_id: input.actor.user.id,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    project_ref: projectRef,
    file_name: input.fileName,
    file_sha256: fileHash,
    file_size: input.fileSize,
    statement_count: statementCount,
    risk_flags: risks,
    sql_preview: normalized.slice(0, 4000),
    status: "running",
  }).select("id").single();
  if (auditError) throw new Error(`Não foi possível registrar a execução do SQL: ${auditError.message}`);

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${supabaseManagementToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: normalized, read_only: false }),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = String(payload.message || payload.error || `O Supabase respondeu com status ${response.status}.`);
      throw new Error(message);
    }

    const summary = { response: JSON.stringify(payload).slice(0, 12_000) };
    await admin.from("system_sql_updates").update({
      status: "success",
      result_summary: summary,
      completed_at: new Date().toISOString(),
    }).eq("id", audit.id);

    return {
      message: `SQL executado com sucesso no projeto ${projectRef}.`,
      id: audit.id,
      sha256: fileHash,
      statement_count: statementCount,
      risk_flags: risks,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao executar o SQL.";
    await admin.from("system_sql_updates").update({
      status: "failed",
      error_message: message.slice(0, 4000),
      completed_at: new Date().toISOString(),
    }).eq("id", audit.id);
    throw error;
  }
}

export async function listAdministrativeHistory() {
  const admin = getSupabaseAdmin();
  const [{ data: sqlUpdates, error: sqlError }, { data: environmentChanges, error: environmentError }] = await Promise.all([
    admin.from("system_sql_updates")
      .select("id,actor_name,actor_email,project_ref,file_name,file_sha256,file_size,statement_count,risk_flags,status,error_message,started_at,completed_at")
      .order("started_at", { ascending: false })
      .limit(20),
    admin.from("system_environment_changes")
      .select("id,actor_name,actor_email,target_project_ref,target_supabase_url_masked,changed_keys,status,deployment_job_id,error_message,created_at,completed_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (sqlError) throw new Error(`Não foi possível ler o histórico de SQL: ${sqlError.message}`);
  if (environmentError) throw new Error(`Não foi possível ler o histórico de ambiente: ${environmentError.message}`);
  return { sql_updates: sqlUpdates || [], environment_changes: environmentChanges || [] };
}
