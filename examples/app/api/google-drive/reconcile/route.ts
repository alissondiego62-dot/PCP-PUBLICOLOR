export const runtime = "nodejs";

import { listDriveFilesForOrder, type DriveFile } from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

const allowedCategories = new Set(["art", "approval", "production", "photo", "installation", "document", "other"]);

type ExistingFileRow = {
  id: string;
  drive_file_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  drive_url: string | null;
  drive_folder_id: string | null;
  file_category: string;
  drive_modified_at: string | null;
  drive_last_modified_by_name: string | null;
  drive_last_modified_by_email: string | null;
  drive_md5_checksum: string | null;
};

function driveUrl(file: DriveFile) {
  return file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
}

function normalizedCategory(file: DriveFile) {
  const value = file.appProperties?.publicolor_category || file.resolvedCategory || "other";
  return allowedCategories.has(value) ? value : "other";
}

function text(value: string | undefined | null) {
  return value?.trim() || null;
}

function sameTimestamp(first: string | null, second: string | null) {
  if (!first && !second) return true;
  if (!first || !second) return false;
  return new Date(first).getTime() === new Date(second).getTime();
}

function needsUpdate(current: ExistingFileRow, file: DriveFile, category: string) {
  return current.file_name !== file.name
    || current.file_type !== (file.mimeType || "application/octet-stream")
    || Number(current.file_size || 0) !== Number(file.size || 0)
    || current.drive_url !== driveUrl(file)
    || current.drive_folder_id !== (file.parents?.[0] || null)
    || current.file_category !== category
    || !sameTimestamp(current.drive_modified_at, file.modifiedTime || file.createdTime || null)
    || current.drive_last_modified_by_name !== text(file.lastModifyingUser?.displayName)
    || current.drive_last_modified_by_email !== text(file.lastModifyingUser?.emailAddress)
    || current.drive_md5_checksum !== text(file.md5Checksum);
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request);
    const body = await request.json() as { order_id?: string };
    const orderId = String(body.order_id || "").trim();
    if (!orderId) return Response.json({ error: "Pedido inválido." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,op_number,client_name")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError || !order) return Response.json({ error: "Pedido não encontrado." }, { status: 404 });

    const driveFiles = await listDriveFilesForOrder(order);
    if (!driveFiles.length) return Response.json({ ok: true, linked: 0, updated: 0, found: 0 });

    const ids = driveFiles.map((file) => file.id);
    const { data: existingRows, error: existingError } = await admin
      .from("order_files")
      .select("id,drive_file_id,file_name,file_type,file_size,drive_url,drive_folder_id,file_category,drive_modified_at,drive_last_modified_by_name,drive_last_modified_by_email,drive_md5_checksum")
      .eq("order_id", orderId)
      .in("drive_file_id", ids);
    if (existingError) throw new Error(`Não foi possível verificar os vínculos atuais: ${existingError.message}`);

    const existingByDriveId = new Map(
      ((existingRows || []) as ExistingFileRow[])
        .filter((row) => row.drive_file_id)
        .map((row) => [row.drive_file_id as string, row]),
    );

    const { data: pendingRows } = await admin
      .from("google_drive_upload_sessions")
      .select("user_id,order_id,drive_folder_id,file_name,file_category,version,notes,is_approved,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    let linked = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const file of driveFiles) {
      const category = normalizedCategory(file);
      const current = existingByDriveId.get(file.id);

      if (current) {
        if (!needsUpdate(current, file, category)) continue;

        const { error } = await admin
          .from("order_files")
          .update({
            file_name: file.name,
            file_type: file.mimeType || "application/octet-stream",
            file_size: Number(file.size || 0),
            drive_url: driveUrl(file),
            drive_folder_id: file.parents?.[0] || null,
            file_category: category,
            drive_modified_at: file.modifiedTime || file.createdTime || null,
            drive_last_modified_by_name: text(file.lastModifyingUser?.displayName),
            drive_last_modified_by_email: text(file.lastModifyingUser?.emailAddress),
            drive_md5_checksum: text(file.md5Checksum),
            updated_by: actor.user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.id);

        if (error) errors.push(`${file.name}: ${error.message}`);
        else updated += 1;
        continue;
      }

      const pending = (pendingRows || []).find((row: {
        user_id: string;
        drive_folder_id: string;
        file_name: string;
        file_category: string;
        version: string | null;
        notes: string | null;
        is_approved: boolean;
      }) =>
        row.drive_folder_id === file.parents?.[0]
        && row.file_name === file.name
        && row.file_category === category,
      );

      const { error } = await admin.from("order_files").insert({
        order_id: orderId,
        uploaded_by: pending?.user_id || actor.user.id,
        updated_by: null,
        origin: pending ? "drive_upload" : "drive_sync",
        file_name: file.name,
        file_path: null,
        file_type: file.mimeType || "application/octet-stream",
        file_size: Number(file.size || 0),
        drive_url: driveUrl(file),
        drive_file_id: file.id,
        drive_folder_id: file.parents?.[0] || null,
        file_category: category,
        version: pending?.version || null,
        notes: pending?.notes || null,
        is_approved: Boolean(pending?.is_approved),
        drive_modified_at: file.modifiedTime || file.createdTime || null,
        drive_last_modified_by_name: text(file.lastModifyingUser?.displayName),
        drive_last_modified_by_email: text(file.lastModifyingUser?.emailAddress),
        drive_md5_checksum: text(file.md5Checksum),
      });

      if (error) errors.push(`${file.name}: ${error.message}`);
      else linked += 1;
    }

    if (errors.length) {
      return Response.json({
        error: `A pasta foi consultada, mas alguns vínculos falharam: ${errors.slice(0, 3).join(" | ")}`,
        linked,
        updated,
        found: driveFiles.length,
      }, { status: 500 });
    }

    return Response.json({ ok: true, linked, updated, found: driveFiles.length });
  } catch (error) {
    return responseMessage(error);
  }
}
