export const runtime = "nodejs";

import { getSupabaseAdmin, requireAppPermission, responseMessage } from "@/lib/server/supabase-server";

type UserAction = "activate" | "deactivate" | "resend_invite" | "cancel_invite" | "change_role" | "edit_profile";
type AppRole = "admin" | "manager" | "production" | "viewer";
const profileSelection = "id,name,email,role,active,created_at,last_seen_at,invited_at,invite_status,display_title,admin_notes";

export async function POST(request: Request) {
  try {
    const actor = await requireAppPermission(request, "users.manage");
    const body = await request.json() as { user_id?: string; email?: string; action?: UserAction; role?: AppRole; name?: string; active?: boolean; display_title?: string | null; admin_notes?: string | null };
    const userId = String(body.user_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const action = body.action;
    if (!userId || !action) return Response.json({ error: "Usuário e ação são obrigatórios." }, { status: 400 });
    if (userId === actor.user.id && ["deactivate","cancel_invite","change_role"].includes(action)) return Response.json({ error: "A conta atual não pode ser desativada, cancelada ou ter o nível alterado por esta tela." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: previousProfile } = await admin.from("profiles").select(profileSelection).eq("id", userId).maybeSingle();
    if (!previousProfile) return Response.json({ error: "Usuário não localizado." }, { status: 404 });

    if (action === "change_role" || action === "edit_profile") {
      const role = (body.role || previousProfile.role) as AppRole;
      if (!["admin", "manager", "production", "viewer"].includes(role)) return Response.json({ error: "Nível de acesso inválido." }, { status: 400 });
      const nextActive = action === "edit_profile" ? Boolean(body.active) : previousProfile.active;
      if (userId === actor.user.id && (!nextActive || role !== previousProfile.role)) return Response.json({ error: "A conta atual não pode alterar o próprio nível ou situação." }, { status: 400 });
      const patch = action === "edit_profile" ? {
        name: String(body.name || "").trim(), role, active: nextActive,
        display_title: String(body.display_title || "").trim() || null,
        admin_notes: String(body.admin_notes || "").trim() || null,
      } : { role };
      if (action === "edit_profile" && String(patch.name || "").length < 2) return Response.json({ error: "Informe um nome válido." }, { status: 400 });
      const { data, error } = await admin.from("profiles").update(patch).eq("id", userId).select(profileSelection).single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: action === "edit_profile" ? "user_profile_edited" : "user_role_changed", entity_type: "profile", entity_id: userId, metadata: { email, previous: previousProfile, next: data } });
      return Response.json({ ok: true, user: data, message: action === "edit_profile" ? "Usuário atualizado." : "Nível de acesso atualizado." });
    }

    if (action === "activate" || action === "deactivate") {
      const active = action === "activate";
      const { data, error } = await admin.from("profiles").update({ active, invite_status: active ? "accepted" : "cancelled" }).eq("id", userId).select(profileSelection).single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: active ? "user_activated" : "user_deactivated", entity_type: "profile", entity_id: userId, metadata: { email } });
      return Response.json({ ok: true, user: data, message: active ? "Usuário ativado." : "Usuário inativado." });
    }

    if (action === "cancel_invite") {
      const { data, error } = await admin.from("profiles").update({ active: false, invite_status: "cancelled" }).eq("id", userId).select(profileSelection).single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "invite_cancelled", entity_type: "profile", entity_id: userId, metadata: { email } });
      return Response.json({ ok: true, user: data, message: "Convite cancelado e acesso bloqueado." });
    }

    if (!email) return Response.json({ error: "E-mail não informado." }, { status: 400 });
    const { error: resendError } = await admin.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${new URL(request.url).origin}/?invite=1` } });
    if (resendError) return Response.json({ error: resendError.message }, { status: 400 });
    const { data, error } = await admin.from("profiles").update({ invited_at: new Date().toISOString(), invite_status: "pending", active: true }).eq("id", userId).select(profileSelection).single();
    if (error) throw error;
    await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "invite_resent", entity_type: "profile", entity_id: userId, metadata: { email } });
    return Response.json({ ok: true, user: data, message: "Convite reenviado." });
  } catch (error) { return responseMessage(error); }
}
