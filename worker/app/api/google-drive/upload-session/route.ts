export const runtime = "nodejs";

import {
  createPendingUpload,
  createResumableUploadSession,
  ensureOrderCategoryFolder,
  getDriveSettings,
} from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requestOrigin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

const categories = new Set(["art", "approval", "production", "photo", "installation", "document", "other"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request);
    const settings = await getDriveSettings();
    if (!settings.enabled || !settings.refresh_token_ciphertext) {
      return Response.json({ error: "Google Drive não conectado. Solicite ao administrador que configure a integração." }, { status: 409 });
    }

    const body = await request.json() as {
      order_id?: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
      file_category?: string;
      version?: string;
      notes?: string;
      is_approved?: boolean;
    };
    const orderId = String(body.order_id || "").trim();
    const fileName = String(body.file_name || "").trim();
    const mimeType = String(body.mime_type || "application/octet-stream").trim() || "application/octet-stream";
    const fileSize = Number(body.file_size || 0);
    const category = categories.has(String(body.file_category)) ? String(body.file_category) : "other";

    if (!orderId || !fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
      return Response.json({ error: "Arquivo ou pedido inválido." }, { status: 400 });
    }
    if (fileSize > MAX_FILE_SIZE) {
      return Response.json({ error: "O arquivo excede o limite de 5 GB desta integração." }, { status: 413 });
    }

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,op_number,client_name")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError || !order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });

    const folder = await ensureOrderCategoryFolder(order, category);
    const sessionId = await createPendingUpload({
      userId: actor.user.id,
      orderId,
      folderId: folder.id,
      fileName,
      mimeType,
      fileSize,
      category,
      version: String(body.version || "").trim() || null,
      notes: String(body.notes || "").trim() || null,
      isApproved: Boolean(body.is_approved),
    });

    let uploadUrl = "";
    try {
      uploadUrl = await createResumableUploadSession({
        folderId: folder.id,
        fileName,
        mimeType,
        fileSize,
        orderId,
        category,
        uploadSessionId: sessionId,
        browserOrigin: requestOrigin(request),
      });
    } catch (error) {
      await admin.from("google_drive_upload_sessions").delete().eq("id", sessionId);
      throw error;
    }

    return Response.json({
      session_id: sessionId,
      upload_url: uploadUrl,
      folder_id: folder.id,
      folder_url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
      expires_in: 3600,
    });
  } catch (error) {
    return responseMessage(error);
  }
}
