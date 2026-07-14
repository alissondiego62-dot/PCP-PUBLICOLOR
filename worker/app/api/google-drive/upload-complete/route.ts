export const runtime = "nodejs";

import {
  findDriveFileForUploadSession,
  verifyDriveFile,
  type DriveFile,
} from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function driveUrl(file: DriveFile) {
  return file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request);
    const body = await request.json() as { session_id?: string; drive_file_id?: string };
    const sessionId = String(body.session_id || "").trim();
    const fileId = String(body.drive_file_id || "").trim();
    if (!sessionId) return Response.json({ error: "Sessão de upload inválida." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: pending, error: pendingError } = await admin
      .from("google_drive_upload_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", actor.user.id)
      .maybeSingle();
    if (pendingError || !pending) return Response.json({ error: "Sessão de upload não encontrada." }, { status: 404 });
    if (new Date(pending.expires_at).getTime() < Date.now()) {
      await admin.from("google_drive_upload_sessions").delete().eq("id", sessionId);
      return Response.json({ error: "A sessão de upload expirou." }, { status: 410 });
    }

    let driveFile: DriveFile | null = null;
    if (fileId) {
      driveFile = await verifyDriveFile(fileId);
    } else {
      // Quando o navegador não consegue ler a resposta final do Google por CORS,
      // o arquivo pode já ter sido salvo. A rota pesquisa o arquivo e conclui o
      // vínculo sem exigir um segundo upload.
      for (let attempt = 0; attempt < 5 && !driveFile; attempt += 1) {
        driveFile = await findDriveFileForUploadSession({
          uploadSessionId: sessionId,
          orderId: pending.order_id,
          folderId: pending.drive_folder_id,
          fileName: pending.file_name,
          category: pending.file_category,
        });
        if (!driveFile) await sleep(600);
      }
      if (!driveFile) {
        return Response.json({
          error: "O Google Drive ainda não confirmou o arquivo. Aguarde alguns segundos e use Sincronizar arquivos.",
        }, { status: 409 });
      }
    }

    if (!driveFile.parents?.includes(pending.drive_folder_id)) {
      return Response.json({ error: "O arquivo não pertence à pasta preparada para este pedido." }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("order_files")
      .select("id,order_id,uploaded_by,updated_by,origin,file_name,file_path,file_type,file_size,drive_url,drive_file_id,drive_folder_id,file_category,version,notes,is_approved,drive_modified_at,drive_last_modified_by_name,drive_last_modified_by_email,updated_at,created_at")
      .eq("drive_file_id", driveFile.id)
      .maybeSingle();

    if (existing) {
      await admin.from("google_drive_upload_sessions").delete().eq("id", sessionId);
      return Response.json({ ok: true, file: existing, recovered: !fileId });
    }

    const { data: record, error: recordError } = await admin
      .from("order_files")
      .insert({
        order_id: pending.order_id,
        uploaded_by: actor.user.id,
        updated_by: null,
        origin: "drive_upload",
        file_name: driveFile.name || pending.file_name,
        file_path: null,
        file_type: driveFile.mimeType || pending.mime_type,
        file_size: Number(driveFile.size || pending.file_size || 0),
        drive_url: driveUrl(driveFile),
        drive_file_id: driveFile.id,
        drive_folder_id: pending.drive_folder_id,
        file_category: pending.file_category,
        version: pending.version,
        notes: pending.notes,
        is_approved: pending.is_approved,
        drive_modified_at: driveFile.modifiedTime || driveFile.createdTime || null,
        drive_last_modified_by_name: driveFile.lastModifyingUser?.displayName || null,
        drive_last_modified_by_email: driveFile.lastModifyingUser?.emailAddress || null,
        drive_md5_checksum: driveFile.md5Checksum || null,
      })
      .select("id,order_id,uploaded_by,updated_by,origin,file_name,file_path,file_type,file_size,drive_url,drive_file_id,drive_folder_id,file_category,version,notes,is_approved,drive_modified_at,drive_last_modified_by_name,drive_last_modified_by_email,updated_at,created_at")
      .single();

    if (recordError) {
      const migrationHint = /file_path|drive_url|drive_file_id|file_category|is_approved/i.test(recordError.message)
        ? " Execute a migração de reparo dos arquivos do Drive no Supabase."
        : "";
      throw new Error(`Arquivo enviado, mas não foi possível vinculá-lo ao pedido: ${recordError.message}.${migrationHint}`);
    }

    await admin.from("google_drive_upload_sessions").delete().eq("id", sessionId);
    return Response.json({ ok: true, file: record, recovered: !fileId });
  } catch (error) {
    return responseMessage(error);
  }
}
