export const runtime = "nodejs";

import { getSupabaseAdmin, requestOrigin, requireAppUser, responseMessage } from "@/lib/server/supabase-server";

type UserAction = "activate" | "deactivate" | "resend_invite" | "cancel_invite" | "change_role";
type AppRole = "admin" | "manager" | "production" | "viewer";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as { user_id?: string; email?: string; action?: UserAction; role?: AppRole };
    const userId = String(body.user_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const action = body.action;
    if (!userId || !action) return Response.json({ error: "Usuário e ação são obrigatórios." }, { status: 400 });
    if (userId === actor.user.id && action !== "resend_invite") return Response.json({ error: "A conta atual não pode ser desativada, cancelada ou ter o papel alterado por esta tela." }, { status: 400 });

    const admin = getSupabaseAdmin();
    if (action === "change_role") {
      const role = body.role;
      if (!role || !["admin", "manager", "production", "viewer"].includes(role)) {
        return Response.json({ error: "Nível de acesso inválido." }, { status: 400 });
      }
      const { data: previousProfile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      const { data, error } = await admin.from("profiles").update({ role }).eq("id", userId).select("id,name,email,role,active,created_at,last_seen_at,invited_at,invite_status").single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({
        actor_id: actor.user.id,
        action: "user_role_changed",
        entity_type: "profile",
        entity_id: userId,
        metadata: { email, previous_role: previousProfile?.role || null, role },
      });
      return Response.json({ ok: true, user: data, message: "Nível de acesso atualizado." });
    }

    if (action === "activate" || action === "deactivate") {
      const active = action === "activate";
      const { data, error } = await admin.from("profiles").update({ active, invite_status: active ? "accepted" : "cancelled" }).eq("id", userId).select("id,name,email,role,active,created_at,last_seen_at,invited_at,invite_status").single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: active ? "user_activated" : "user_deactivated", entity_type: "profile", entity_id: userId, metadata: { email } });
      return Response.json({ ok: true, user: data, message: active ? "Usuário ativado." : "Usuário inativado." });
    }

    if (action === "cancel_invite") {
      const { data, error } = await admin.from("profiles").update({ active: false, invite_status: "cancelled" }).eq("id", userId).select("id,name,email,role,active,created_at,last_seen_at,invited_at,invite_status").single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "invite_cancelled", entity_type: "profile", entity_id: userId, metadata: { email } });
      return Response.json({ ok: true, user: data, message: "Convite cancelado e acesso bloqueado." });
    }

    if (!email) return Response.json({ error: "E-mail não informado." }, { status: 400 });
    const { error: resendError } = await admin.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${requestOrigin(request)}/?invite=1` } });
    if (resendError) return Response.json({ error: resendError.message }, { status: 400 });
    const { data, error } = await admin.from("profiles").update({ invited_at: new Date().toISOString(), invite_status: "pending", active: true }).eq("id", userId).select("id,name,email,role,active,created_at,last_seen_at,invited_at,invite_status").single();
    if (error) throw error;
    await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "invite_resent", entity_type: "profile", entity_id: userId, metadata: { email } });
    return Response.json({ ok: true, user: data, message: "Convite reenviado." });
  } catch (error) {
    return responseMessage(error);
  }
}
