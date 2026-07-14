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

    const driveResponse = await downloadDriveFile(record.drive_file_id);
    const headers = new Headers();
    headers.set("content-type", driveResponse.headers.get("content-type") || record.file_type || "application/octet-stream");
    const contentLength = driveResponse.headers.get("content-length") || (record.file_size ? String(record.file_size) : "");
    if (contentLength) headers.set("content-length", contentLength);
    headers.set("content-disposition", `attachment; filename="${safeFileName(record.file_name)}"; filename*=UTF-8''${encodeURIComponent(record.file_name)}`);
    headers.set("cache-control", "private, no-store");

    return new Response(driveResponse.body, { status: 200, headers });
  } catch (error) {
    return responseMessage(error);
  }
}
