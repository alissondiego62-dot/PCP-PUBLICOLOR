export const runtime = "nodejs";

import type { AppRole } from "@/lib/pcp-types";
import { permissionCatalog, type PermissionKey } from "@/lib/permissions";
import { getSupabaseAdmin, requireAppUser, responseMessage } from "@/lib/server/supabase-server";

const allowedRoles = new Set<AppRole>(["admin", "manager", "production", "viewer"]);
const allowedKeys = new Set<PermissionKey>(permissionCatalog.map((permission) => permission.key));

type PermissionRow = { role: AppRole; permission_key: PermissionKey; allowed: boolean };

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("role_permissions")
      .select("role,permission_key,allowed,updated_at")
      .order("role")
      .order("permission_key");
    if (error) throw error;
    return Response.json({ ok: true, permissions: data || [] });
  } catch (error) {
    return responseMessage(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as { permissions?: PermissionRow[] };
    const incoming = Array.isArray(body.permissions) ? body.permissions : [];
    const unique = new Map<string, PermissionRow>();

    for (const row of incoming) {
      if (!allowedRoles.has(row.role) || !allowedKeys.has(row.permission_key) || typeof row.allowed !== "boolean") {
        return Response.json({ error: "A matriz contém uma permissão inválida." }, { status: 400 });
      }
      unique.set(`${row.role}:${row.permission_key}`, row);
    }

    const expected = allowedRoles.size * allowedKeys.size;
    if (unique.size !== expected) {
      return Response.json({ error: "A matriz enviada está incompleta." }, { status: 400 });
    }

    const rows = [...unique.values()].map((row) => ({
      ...row,
      allowed: row.role === "admin"
        ? true
        : row.permission_key === "settings.permissions"
          ? false
          : row.allowed,
      updated_by: actor.user.id,
      updated_at: new Date().toISOString(),
    }));

    const admin = getSupabaseAdmin();
    const { data: previous, error: readError } = await admin
      .from("role_permissions")
      .select("role,permission_key,allowed");
    if (readError) throw readError;

    const { error } = await admin.from("role_permissions").upsert(rows, { onConflict: "role,permission_key" });
    if (error) throw error;

    await admin.from("admin_audit_log").insert({
      actor_id: actor.user.id,
      action: "role_permissions_updated",
      entity_type: "role_permissions",
      entity_id: null,
      metadata: { previous: previous || [], next: rows.map(({ role, permission_key, allowed }) => ({ role, permission_key, allowed })) },
    });

    return Response.json({ ok: true, permissions: rows, message: "Permissões por nível atualizadas." });
  } catch (error) {
    return responseMessage(error);
  }
}
