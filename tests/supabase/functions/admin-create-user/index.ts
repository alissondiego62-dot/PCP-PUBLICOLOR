import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

type AppRole = "admin" | "production" | "viewer";

const productionOrigin = "https://controle-pedidos-kanban.alissondiego62.chatgpt.site";
const allowedRoles = new Set<AppRole>(["admin", "production", "viewer"]);

function allowedOrigin(origin: string) {
  return origin === productionOrigin
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function responseHeaders(origin: string) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  if (allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

function readDefaultKey(dictionaryName: string, legacyName: string) {
  const dictionary = Deno.env.get(dictionaryName);
  if (dictionary) {
    try {
      const parsed = JSON.parse(dictionary) as Record<string, string>;
      if (parsed.default) return parsed.default;
    } catch {
      // A chave legada abaixo mantém compatibilidade com projetos existentes.
    }
  }
  return Deno.env.get(legacyName) || "";
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || productionOrigin;

  if (!allowedOrigin(origin)) {
    return json(origin, { error: "Origem não autorizada." }, 403);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }

  if (request.method !== "POST") {
    return json(origin, { error: "Método não permitido." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json(origin, { error: "Faça login novamente para continuar." }, 401);
  }

  const contentType = request.headers.get("content-type") || "";
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(origin, { error: "Envie os dados no formato JSON." }, 415);
  }
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return json(origin, { error: "Os dados enviados excedem o limite permitido." }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publishableKey = readDefaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secretKey = readDefaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !secretKey) {
    console.error("Variáveis padrão do Supabase não estão disponíveis.");
    return json(origin, { error: "Serviço de usuários temporariamente indisponível." }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return json(origin, { error: "Sua sessão expirou. Entre novamente." }, 401);
  }

  const { data: callerProfile, error: callerError } = await adminClient
    .from("profiles")
    .select("role,active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (callerError) {
    console.error("Falha ao consultar o perfil administrador.", callerError.code);
    return json(origin, { error: "Não foi possível confirmar sua permissão." }, 500);
  }

  if (!callerProfile?.active || callerProfile.role !== "admin") {
    return json(origin, { error: "Somente administradores podem criar usuários." }, 403);
  }

  let payload: { name?: unknown; email?: unknown; role?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json(origin, { error: "Dados do formulário inválidos." }, 400);
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const role = typeof payload.role === "string" ? payload.role as AppRole : "viewer";

  if (name.length < 2 || name.length > 120) {
    return json(origin, { error: "Informe um nome entre 2 e 120 caracteres." }, 400);
  }
  if (/\p{Cc}/u.test(name)) {
    return json(origin, { error: "O nome contém caracteres inválidos." }, 400);
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(origin, { error: "Informe um e-mail válido." }, 400);
  }
  if (!allowedRoles.has(role)) {
    return json(origin, { error: "Nível de acesso inválido." }, 400);
  }

  const { data: invitation, error: invitationError } = await adminClient.auth.admin
    .inviteUserByEmail(email, {
      data: { name },
      redirectTo: productionOrigin + "/?invite=1",
    });

  if (invitationError || !invitation.user) {
    const invitationCode = invitationError?.code || "";
    console.error("Falha ao convidar usuário.", invitationCode || "unknown");
    const duplicate = ["email_exists", "user_already_exists"].includes(invitationCode)
      || invitationError?.message.toLowerCase().includes("already")
      || invitationError?.message.toLowerCase().includes("registered");
    return json(
      origin,
      { error: duplicate ? "Este e-mail já possui acesso ao sistema." : "Não foi possível enviar o convite. Tente novamente." },
      duplicate ? 409 : 400,
    );
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      id: invitation.user.id,
      name,
      email,
      role,
      active: true,
    }, { onConflict: "id" })
    .select("id,name,email,role,active,created_at")
    .single();

  if (profileError || !profile) {
    console.error("Falha ao configurar o perfil convidado.", profileError?.code || "unknown");
    await adminClient.from("profiles").update({ active: false }).eq("id", invitation.user.id);
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(invitation.user.id);
    if (cleanupError) {
      console.error("Falha ao remover cadastro incompleto.", cleanupError.code || "unknown");
      return json(origin, {
        error: "O convite ficou incompleto e o acesso foi bloqueado. Revise este usuário no painel do Supabase.",
      }, 500);
    }
    return json(origin, { error: "O convite não pôde ser concluído e o cadastro foi revertido." }, 500);
  }

  return json(origin, {
    ok: true,
    message: "Convite enviado com sucesso.",
    user: profile,
  }, 201);
});
