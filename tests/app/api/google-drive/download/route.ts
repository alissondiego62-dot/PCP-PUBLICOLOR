export const runtime = "nodejs";

import { downloadDriveFile } from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

function safeFileName(value: string) {
  return value.replace(/[\r\n"]/g, "_").trim() || "arquivo";
}

export async function GET(request: Request) {
  try {
    await requireAppUser(request);
    const url = new URL(request.url);
    const recordId = String(url.searchParams.get("record_id") || "").trim();
    if (!recordId) return Response.json({ error: "Arquivo inválido." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: record, error } = await admin
      .from("order_files")
      .select("file_name,file_type,file_size,drive_file_id")
      .eq("id", recordId)
      .maybeSingle();
    if (error || !record?.drive_file_id) {
      return Response.json({ error: "Arquivo do Google Drive não encontrado." }, { status: 404 });
    }

    const download = await downloadDriveFile(record.drive_file_id);
    const headers = new Headers();
    headers.set("content-type", download.response.headers.get("content-type") || download.mimeType || record.file_type || "application/octet-stream");
    const contentLength = download.response.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);
    const downloadName = download.fileName || record.file_name;
    headers.set("content-disposition", `attachment; filename="${safeFileName(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    headers.set("cache-control", "private, no-store");

    return new Response(download.response.body, { status: 200, headers });
  } catch (error) {
    return responseMessage(error);
  }
}
