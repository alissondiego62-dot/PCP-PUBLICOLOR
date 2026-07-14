export const runtime = "nodejs";

import { downloadDriveFile } from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

export async function GET(request: Request) {
  try {
    await requireAppUser(request);
    const url = new URL(request.url);
    const fileId = String(url.searchParams.get("file_id") || "").trim();
    if (!fileId) return Response.json({ error: "Miniatura inválida." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: linkedFile, error } = await admin
      .from("order_files")
      .select("id,file_type,drive_file_id")
      .eq("drive_file_id", fileId)
      .limit(1)
      .maybeSingle();

    if (error || !linkedFile?.drive_file_id) {
      return Response.json({ error: "A miniatura não está vinculada a uma ordem de serviço." }, { status: 404 });
    }

    const download = await downloadDriveFile(linkedFile.drive_file_id);
    const contentType = download.response.headers.get("content-type") || download.mimeType || linkedFile.file_type || "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return Response.json({ error: "O arquivo vinculado não é uma imagem válida para miniatura." }, { status: 415 });
    }

    const headers = new Headers();
    headers.set("content-type", contentType);
    const contentLength = download.response.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);
    headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(download.fileName || "miniatura.png")}`);
    headers.set("cache-control", "private, max-age=300");

    return new Response(download.response.body, { status: 200, headers });
  } catch (error) {
    return responseMessage(error);
  }
}
