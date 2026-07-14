export const runtime = "nodejs";

import { deleteDriveFile } from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as { record_id?: string };
    const recordId = String(body.record_id || "").trim();
    if (!recordId) return Response.json({ error: "Arquivo inválido." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: record, error: recordError } = await admin
      .from("order_files")
      .select("id,order_id,file_name,drive_file_id")
      .eq("id", recordId)
      .maybeSingle();

    if (recordError || !record) {
      return Response.json({ error: "Arquivo não encontrado nesta ordem." }, { status: 404 });
    }
    if (!record.drive_file_id) {
      return Response.json({
        error: "Este registro não possui um arquivo identificável no Google Drive. Use Remover da OS.",
      }, { status: 400 });
    }

    // Marca a intenção antes da chamada externa. O gatilho do banco usa esse
    // valor para diferenciar remoção do vínculo e exclusão real do Drive.
    const { error: markError } = await admin
      .from("order_files")
      .update({
        updated_by: actor.user.id,
        removal_mode: "drive_delete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id);

    if (markError) {
      const migrationHint = /removal_mode/i.test(markError.message)
        ? " Execute a migração de remoção e exclusão de arquivos no Supabase."
        : "";
      throw new Error(`Não foi possível preparar a exclusão: ${markError.message}.${migrationHint}`);
    }

    try {
      await deleteDriveFile(record.drive_file_id);
    } catch (error) {
      await admin
        .from("order_files")
        .update({ removal_mode: null, updated_at: new Date().toISOString() })
        .eq("id", record.id);
      throw error;
    }

    const { error: deleteRecordError } = await admin
      .from("order_files")
      .delete()
      .eq("id", record.id);

    if (deleteRecordError) {
      throw new Error(
        `O arquivo foi excluído do Google Drive, mas o vínculo ainda não foi removido da OS: ${deleteRecordError.message}. Tente novamente.`,
      );
    }

    return Response.json({
      ok: true,
      message: `Arquivo excluído do Google Drive e removido da OS: ${record.file_name}`,
    });
  } catch (error) {
    return responseMessage(error);
  }
}
