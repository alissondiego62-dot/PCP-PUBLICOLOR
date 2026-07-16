export const runtime = "nodejs";

import { permissionCatalog, type PermissionKey } from "@/lib/permissions";
import { getSupabaseAdmin, requireAppUser, responseMessage } from "@/lib/server/supabase-server";

const allowedKeys = new Set<PermissionKey>(permissionCatalog.map((permission) => permission.key));
type OverrideValue = "inherit" | "allow" | "deny";

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const userId = new URL(request.url).searchParams.get("user_id")?.trim() || "";
    if (!userId) return Response.json({ error: "Usuário não informado." }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("user_permission_overrides")
      .select("permission_key,allowed,updated_at")
      .eq("user_id", userId);
    if (error) throw error;
    return Response.json({ ok: true, overrides: data || [] });
  } catch (error) {
    return responseMessage(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as { user_id?: string; values?: Partial<Record<PermissionKey, OverrideValue>> };
    const userId = String(body.user_id || "").trim();
    if (!userId) return Response.json({ error: "Usuário não informado." }, { status: 400 });
    if (userId === actor.user.id) {
      return Response.json({ error: "Não é permitido elevar ou reduzir as próprias permissões individuais." }, { status: 400 });
    }

    const values = body.values || {};
    for (const [key, value] of Object.entries(values)) {
      if (!allowedKeys.has(key as PermissionKey) || !["inherit", "allow", "deny"].includes(String(value))) {
        return Response.json({ error: "Foi informada uma exceção inválida." }, { status: 400 });
      }
    }

    const admin = getSupabaseAdmin();
    const { data: target, error: targetError } = await admin.from("profiles").select("id,role,active,email").eq("id", userId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return Response.json({ error: "Usuário não localizado." }, { status: 404 });

    const { data: previous, error: previousError } = await admin
      .from("user_permission_overrides")
      .select("permission_key,allowed")
      .eq("user_id", userId);
    if (previousError) throw previousError;

    const rows = Object.entries(values)
      .filter(([, value]) => value !== "inherit")
      .map(([permissionKey, value]) => ({
        user_id: userId,
        permission_key: permissionKey,
        allowed: value === "allow",
        updated_by: actor.user.id,
        updated_at: new Date().toISOString(),
      }));

    const { error: deleteError } = await admin.from("user_permission_overrides").delete().eq("user_id", userId);
    if (deleteError) throw deleteError;
    if (rows.length) {
      const { error: insertError } = await admin.from("user_permission_overrides").insert(rows);
      if (insertError) throw insertError;
    }

    await admin.from("admin_audit_log").insert({
      actor_id: actor.user.id,
      action: "user_permission_overrides_updated",
      entity_type: "profile",
      entity_id: userId,
      metadata: { email: target.email, previous: previous || [], next: rows.map(({ permission_key, allowed }) => ({ permission_key, allowed })) },
    });

    return Response.json({ ok: true, overrides: rows, message: "Permissões especiais atualizadas." });
  } catch (error) {
    return responseMessage(error);
  }
}
