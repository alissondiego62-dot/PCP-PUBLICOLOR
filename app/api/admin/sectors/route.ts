export const runtime = "nodejs";

import { getSupabaseAdmin, requireAppPermission, responseMessage } from "@/lib/server/supabase-server";

type SectorSpecialType = "production_completed" | "installation" | null;
type SectorAction = "create" | "update" | "toggle" | "delete" | "reorder";

type SectorPayload = {
  id?: string;
  name?: string;
  active?: boolean;
  wip_limit?: number | null;
  uses_status?: boolean;
  requires_scheduling?: boolean;
  show_in_agenda?: boolean;
  allow_manual_move?: boolean;
  special_type?: SectorSpecialType;
  color?: string | null;
  icon?: string | null;
};

type RequestBody = SectorPayload & {
  action?: SectorAction;
  ordered_ids?: string[];
};

const selection = "id,name,position,active,wip_limit,uses_status,requires_scheduling,show_in_agenda,allow_manual_move,special_type,color,icon";

function normalizeName(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

function normalizeColor(value: unknown) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function specialRules(payload: SectorPayload) {
  const specialType = payload.special_type || null;
  return {
    name: normalizeName(payload.name),
    active: payload.active !== false,
    wip_limit: payload.wip_limit && Number(payload.wip_limit) > 0 ? Number(payload.wip_limit) : null,
    uses_status: specialType ? false : payload.uses_status !== false,
    requires_scheduling: specialType === "installation" ? true : Boolean(payload.requires_scheduling),
    show_in_agenda: specialType ? true : Boolean(payload.show_in_agenda),
    allow_manual_move: payload.allow_manual_move !== false,
    special_type: specialType,
    color: normalizeColor(payload.color),
    icon: String(payload.icon || "").trim() || null,
  };
}

async function listSectors() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("sectors").select(selection).order("position").order("name");
  if (error) throw error;
  return data || [];
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppPermission(request, "settings.operation");
    const body = await request.json() as RequestBody;
    const action = body.action;
    if (!action) return Response.json({ error: "Ação não informada." }, { status: 400 });

    const admin = getSupabaseAdmin();

    if (action === "reorder") {
      const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids.map(String).filter(Boolean) : [];
      if (!orderedIds.length) return Response.json({ error: "Informe a ordem dos setores." }, { status: 400 });
      const { error } = await admin.rpc("reorder_kanban_sectors", { p_sector_ids: orderedIds });
      if (error) throw error;
      await admin.from("admin_audit_log").insert({
        actor_id: actor.user.id,
        action: "kanban_sectors_reordered",
        entity_type: "sector",
        metadata: { ordered_ids: orderedIds },
      });
      return Response.json({ ok: true, sectors: await listSectors(), message: "Ordem dos setores atualizada." });
    }

    const sectorId = String(body.id || "").trim();
    const { data: previous } = sectorId
      ? await admin.from("sectors").select(selection).eq("id", sectorId).maybeSingle()
      : { data: null };

    if (["update", "toggle", "delete"].includes(action) && !previous) {
      return Response.json({ error: "Setor não localizado." }, { status: 404 });
    }

    if (action === "toggle") {
      const nextActive = !previous!.active;
      if (!nextActive) {
        const { count, error: countError } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("sector_id", sectorId).neq("status", "completed");
        if (countError) throw countError;
        if ((count || 0) > 0) return Response.json({ error: `Este setor possui ${count} pedido(s) ativo(s). Transfira-os antes de inativar.` }, { status: 409 });
      }
      const { error } = await admin.from("sectors").update({ active: nextActive }).eq("id", sectorId);
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: nextActive ? "sector_activated" : "sector_deactivated", entity_type: "sector", entity_id: sectorId, metadata: { name: previous!.name } });
      return Response.json({ ok: true, sectors: await listSectors(), message: nextActive ? "Setor ativado." : "Setor inativado." });
    }

    if (action === "delete") {
      if (previous!.special_type) return Response.json({ error: "Setores especiais não podem ser excluídos. Eles podem ser inativados quando não houver pedidos ativos." }, { status: 409 });
      const { count, error: countError } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("sector_id", sectorId);
      if (countError) throw countError;
      if ((count || 0) > 0) return Response.json({ error: `Este setor possui ${count} pedido(s) vinculados. Transfira-os ou inative o setor.` }, { status: 409 });
      const { error } = await admin.from("sectors").delete().eq("id", sectorId);
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "sector_deleted", entity_type: "sector", entity_id: sectorId, metadata: { name: previous!.name } });
      return Response.json({ ok: true, sectors: await listSectors(), message: "Setor excluído." });
    }

    const patch = specialRules(body);
    if (patch.name.length < 2) return Response.json({ error: "Informe um nome válido para o setor." }, { status: 400 });
    if (patch.special_type && !["production_completed", "installation"].includes(patch.special_type)) return Response.json({ error: "Tipo especial inválido." }, { status: 400 });
    if (previous?.special_type && previous.special_type !== patch.special_type) return Response.json({ error: "O tipo de um setor especial não pode ser removido ou trocado. Edite apenas as demais configurações." }, { status: 409 });

    if (action === "create") {
      const { data: maxPositionRow, error: positionError } = await admin.from("sectors").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
      if (positionError) throw positionError;
      const { data, error } = await admin.from("sectors").insert({ ...patch, position: Number(maxPositionRow?.position || 0) + 1 }).select(selection).single();
      if (error) throw error;
      await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "sector_created", entity_type: "sector", entity_id: data.id, metadata: data });
      return Response.json({ ok: true, sector: data, sectors: await listSectors(), message: "Setor criado." });
    }

    if (previous?.active && patch.active === false) {
      const { count, error: countError } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("sector_id", sectorId).neq("status", "completed");
      if (countError) throw countError;
      if ((count || 0) > 0) return Response.json({ error: `Este setor possui ${count} pedido(s) ativo(s). Transfira-os antes de inativar.` }, { status: 409 });
    }

    const { data, error } = await admin.from("sectors").update(patch).eq("id", sectorId).select(selection).single();
    if (error) throw error;
    await admin.from("admin_audit_log").insert({ actor_id: actor.user.id, action: "sector_updated", entity_type: "sector", entity_id: sectorId, metadata: { previous, next: data } });
    return Response.json({ ok: true, sector: data, sectors: await listSectors(), message: "Setor atualizado." });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code || "") : "";
    if (code === "23505") return Response.json({ error: "Já existe um setor com esse tipo especial ou configuração exclusiva." }, { status: 409 });
    return responseMessage(error, "Não foi possível atualizar a configuração do Kanban.");
  }
}
