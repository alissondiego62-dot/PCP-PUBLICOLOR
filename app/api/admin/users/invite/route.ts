export const runtime = "nodejs";

import type { AppRole } from "@/lib/pcp-types";
import {
  getSupabaseAdmin,
  requestOrigin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

const allowedRoles = new Set<AppRole>(["admin", "manager", "production", "viewer"]);

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function invitationErrorMessage(error: { code?: string; message?: string } | null | undefined) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  if (
    ["email_exists", "user_already_exists"].includes(code)
    || message.includes("already")
    || message.includes("registered")
    || message.includes("exists")
  ) {
    return { status: 409, message: "Este e-mail já possui cadastro no Supabase Auth." };
  }

  if (message.includes("redirect") || message.includes("site url")) {
    return {
      status: 400,
      message: "A URL do Publicolor ainda não está autorizada no Supabase Auth. Adicione o domínio de produção em Authentication → URL Configuration → Redirect URLs.",
    };
  }

  if (message.includes("rate") || message.includes("limit")) {
    return { status: 429, message: "O limite temporário de envio de convites foi atingido. Aguarde alguns minutos e tente novamente." };
  }

  if (message.includes("smtp") || message.includes("email")) {
    return { status: 502, message: "O Supabase não conseguiu enviar o e-mail. Verifique a configuração de e-mail/SMTP do projeto." };
  }

  return { status: 400, message: error?.message || "Não foi possível enviar o convite pelo Supabase." };
}

export async function POST(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);

    const body = await request.json() as {
      name?: unknown;
      email?: unknown;
      role?: unknown;
    };

    const name = cleanText(body.name);
    const email = cleanText(body.email).toLowerCase();
    const role = cleanText(body.role) as AppRole;

    if (name.length < 2 || name.length > 120) {
      return Response.json({ error: "Informe um nome entre 2 e 120 caracteres." }, { status: 400 });
    }
    if (/\p{Cc}/u.test(name)) {
      return Response.json({ error: "O nome contém caracteres inválidos." }, { status: 400 });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });
    }
    if (!allowedRoles.has(role)) {
      return Response.json({ error: "Nível de acesso inválido." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const redirectTo = `${requestOrigin(request)}/?invite=1`;
    const { data: invitation, error: invitationError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo,
    });

    if (invitationError || !invitation.user) {
      const friendly = invitationErrorMessage(invitationError);
      console.error("Falha ao convidar usuário.", {
        code: invitationError?.code || "unknown",
        message: invitationError?.message || "unknown",
        redirectTo,
      });
      return Response.json({ error: friendly.message }, { status: friendly.status });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: invitation.user.id,
        name,
        email,
        role,
        active: true,
        invited_at: new Date().toISOString(),
        invite_status: "pending",
      }, { onConflict: "id" })
      .select("id,name,email,role,active,created_at,last_seen_at,invited_at,invite_status")
      .single();

    if (profileError || !profile) {
      console.error("Falha ao configurar o perfil convidado.", profileError?.message || "unknown");
      await admin.from("profiles").update({ active: false }).eq("id", invitation.user.id);
      const { error: cleanupError } = await admin.auth.admin.deleteUser(invitation.user.id);
      if (cleanupError) {
        console.error("Falha ao remover cadastro incompleto.", cleanupError.message);
        return Response.json({
          error: "O convite ficou incompleto e o acesso foi bloqueado. Revise o usuário no painel do Supabase.",
        }, { status: 500 });
      }
      return Response.json({ error: "O convite não pôde ser concluído e o cadastro foi revertido." }, { status: 500 });
    }

    return Response.json({
      ok: true,
      message: "Convite enviado com sucesso.",
      user: profile,
    }, { status: 201 });
  } catch (error) {
    return responseMessage(error);
  }
}
