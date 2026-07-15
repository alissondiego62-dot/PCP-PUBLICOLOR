export const runtime = "nodejs";

import { deleteDriveFile } from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
  type AuthorizedAppUser,
} from "@/lib/server/supabase-server";
import { buildDriveThumbnailPath } from "@/lib/order-thumbnail";
import { logSystemEvent } from "@/lib/server/observability";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let actor: AuthorizedAppUser | null = null;
  let orderIdForLog: string | null = null;
  try {
    actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as {
      order_id?: string;
      new_drive_file_id?: string;
      previous_drive_file_id?: string | null;
    };

    const orderId = String(body.order_id || "").trim();
    orderIdForLog = orderId || null;
    const newFileId = String(body.new_drive_file_id || "").trim();
    const previousFileId = String(body.previous_drive_file_id || "").trim();
    if (!orderId || !newFileId) {
      return Response.json({ error: "Pedido ou nova miniatura inválida." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const [{ data: order, error: orderError }, { data: newFile, error: newFileError }] = await Promise.all([
      admin.from("orders").select("id,op_number,main_image_path").eq("id", orderId).maybeSingle(),
      admin
        .from("order_files")
        .select("id,order_id,file_name,drive_file_id,file_type,file_category,notes")
        .eq("order_id", orderId)
        .eq("drive_file_id", newFileId)
        .is("removed_from_order_at", null)
        .maybeSingle(),
    ]);

    if (orderError || !order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    if (newFileError || !newFile) {
      return Response.json({ error: "A nova imagem ainda não está vinculada à aba Arquivos da OP." }, { status: 409 });
    }
    if (newFile.file_type !== "image/png" && !String(newFile.file_name || "").toLowerCase().endsWith(".png")) {
      return Response.json({ error: "A nova miniatura precisa ser um arquivo PNG." }, { status: 400 });
    }

    const thumbnailPath = buildDriveThumbnailPath(newFileId);
    const { error: updateError } = await admin
      .from("orders")
      .update({ main_image_path: thumbnailPath })
      .eq("id", orderId);
    if (updateError) throw new Error(`Não foi possível definir a nova miniatura: ${updateError.message}`);

    await admin.from("order_history").insert({
      order_id: orderId,
      user_id: actor.user.id,
      action_type: "thumbnail_zip_imported",
      description: `Miniatura substituída por importação ZIP: ${newFile.file_name}`,
    });

    let replacedPrevious = false;
    let previousWarning: string | null = null;

    if (previousFileId && previousFileId !== newFileId) {
      const { data: previousRecords, error: previousLookupError } = await admin
        .from("order_files")
        .select("id,file_name,drive_file_id")
        .eq("order_id", orderId)
        .eq("drive_file_id", previousFileId);

      if (previousLookupError) {
        previousWarning = `A nova miniatura foi definida, mas não foi possível localizar a anterior: ${previousLookupError.message}`;
      } else if ((previousRecords || []).length > 0) {
        const previousIds = (previousRecords || []).map((record: { id: string }) => record.id);
        const { error: markError } = await admin
          .from("order_files")
          .update({
            updated_by: actor.user.id,
            removal_mode: "drive_delete",
            updated_at: new Date().toISOString(),
          })
          .in("id", previousIds);

        if (markError) {
          previousWarning = `A nova miniatura foi definida, mas a anterior não pôde ser preparada para exclusão: ${markError.message}`;
        } else {
          try {
            await deleteDriveFile(previousFileId);
            const { error: deleteRecordError } = await admin.from("order_files").delete().in("id", previousIds);
            if (deleteRecordError) {
              previousWarning = `A miniatura anterior foi excluída do Drive, mas o vínculo antigo permaneceu no banco: ${deleteRecordError.message}`;
            } else {
              replacedPrevious = true;
            }
          } catch (error) {
            await admin
              .from("order_files")
              .update({ removal_mode: null, updated_at: new Date().toISOString() })
              .in("id", previousIds);
            previousWarning = error instanceof Error
              ? `A nova miniatura foi definida, mas a anterior não pôde ser excluída do Drive: ${error.message}`
              : "A nova miniatura foi definida, mas a anterior não pôde ser excluída do Drive.";
          }
        }
      }
    }

    await logSystemEvent({
      kind: "integration",
      level: previousWarning ? "warning" : "info",
      source: "thumbnail_zip",
      action: "finalize",
      status: previousWarning ? "warning" : "success",
      message: previousWarning || `Miniatura ZIP aplicada à OP ${order.op_number}.`,
      orderId,
      durationMs: Date.now() - startedAt,
      metadata: { replacedPrevious, newFileId },
      actor,
    });

    return Response.json({
      ok: true,
      order_id: orderId,
      op_number: order.op_number,
      main_image_path: thumbnailPath,
      replaced_previous: replacedPrevious,
      previous_warning: previousWarning,
    });
  } catch (error) {
    await logSystemEvent({
      kind: "api_error",
      level: "error",
      source: "thumbnail_zip",
      action: "finalize",
      status: "error",
      message: error instanceof Error ? error.message : "Falha desconhecida ao finalizar miniatura ZIP.",
      orderId: orderIdForLog,
      durationMs: Date.now() - startedAt,
      actor,
    });
    return responseMessage(error);
  }
}
