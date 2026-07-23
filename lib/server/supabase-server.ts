import { createClient, type User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/pcp-types";

let adminClient: ReturnType<typeof createClient> | null = null;

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }
  return adminClient;
}

function getSupabaseAuthClient() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

export type AuthorizedAppUser = {
  user: User;
  role: AppRole;
  name: string;
  email: string;
};

export async function requireAppUser(
  request: Request,
  allowedRoles: AppRole[] = ["admin", "manager", "production", "viewer"],
): Promise<AuthorizedAppUser> {
  const token = bearerToken(request);
  if (!token) throw new Response("Sessão não informada.", { status: 401 });

  const authClient = getSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Response("Sessão inválida ou expirada.", { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("name,email,role,active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.active) {
    throw new Response("Usuário sem acesso ativo ao sistema.", { status: 403 });
  }

  const role = profile.role as AppRole;
  if (!allowedRoles.includes(role)) {
    throw new Response("Você não possui permissão para esta operação.", { status: 403 });
  }

  return {
    user: data.user,
    role,
    name: profile.name || data.user.email?.split("@")[0] || "Usuário",
    email: profile.email || data.user.email || "",
  };
}

export async function requireAppPermission(request: Request, permissionKey: string): Promise<AuthorizedAppUser> {
  const actor = await requireAppUser(request);
  if (actor.role === "admin") return actor;
  const admin = getSupabaseAdmin();
  const [{ data: override }, { data: rolePermission }] = await Promise.all([
    admin.from("user_permission_overrides").select("allowed").eq("user_id", actor.user.id).eq("permission_key", permissionKey).maybeSingle(),
    admin.from("role_permissions").select("allowed").eq("role", actor.role).eq("permission_key", permissionKey).maybeSingle(),
  ]);
  const allowed = override?.allowed ?? rolePermission?.allowed ?? false;
  if (!allowed) throw new Response("Você não possui permissão para esta operação.", { status: 403 });
  return actor;
}

export function responseMessage(error: unknown, fallback = "Não foi possível concluir a operação.") {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : fallback;
  const structured = error as {
    status?: unknown;
    code?: unknown;
    reconnectRequired?: unknown;
  } | null;
  const status = typeof structured?.status === "number" && structured.status >= 400 && structured.status <= 599
    ? structured.status
    : 500;
  const code = typeof structured?.code === "string" ? structured.code : undefined;
  const reconnectRequired = structured?.reconnectRequired === true;
  return Response.json({
    error: message,
    ...(code ? { code } : {}),
    ...(reconnectRequired ? { reconnect_required: true } : {}),
  }, { status });
}

export function requestOrigin(request: Request) {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (host) return `${forwardedProto || "https"}://${host}`;

  return new URL(request.url).origin;
}
