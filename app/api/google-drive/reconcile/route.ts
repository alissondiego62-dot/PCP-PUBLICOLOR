export const runtime = "nodejs";

import {
  listDriveFilesForOrder,
  rememberOrderDriveFolder,
  type DriveFile,
} from "@/lib/server/google-drive";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

const allowedCategories = new Set(["art", "approval", "production", "photo", "installation", "document", "other"]);

type ExistingFileRow = {
  id: string;
  order_id: string;
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
  removal_mode: string | null;
  removed_from_order_at: string | null;
  removed_from_order_by: string | null;
};

const visibleFileSelect = "id,order_id,uploaded_by,updated_by,origin,file_name,file_path,file_type,file_size,drive_url,drive_file_id,drive_folder_id,file_category,version,notes,is_approved,drive_modified_at,drive_last_modified_by_name,drive_last_modified_by_email,updated_at,created_at";

function driveUrl(file: DriveFile) {
  const webViewLink = file.webViewLink?.trim() || "";
  if (/^https:\/\/(drive|docs)[.]google[.]com\//i.test(webViewLink)) return webViewLink;
  return `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`;
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
    || current.drive_md5_checksum !== text(file.md5Checksum)
    || current.removed_from_order_at !== null;
}

async function visibleOrderFiles(orderId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("order_files")
    .select(visibleFileSelect)
    .eq("order_id", orderId)
    .is("removed_from_order_at", null)
    .order("drive_modified_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Não foi possível carregar os arquivos sincronizados: ${error.message}`);
  return data || [];
}

function pendingMatch(
  pendingRows: Array<{
    user_id: string;
    drive_folder_id: string;
    file_name: string;
    file_category: string;
    version: string | null;
    notes: string | null;
    is_approved: boolean;
  }>,
  file: DriveFile,
  category: string,
) {
  return pendingRows.find((row) =>
    row.drive_folder_id === file.parents?.[0]
    && row.file_name === file.name
    && row.file_category === category,
  );
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

    const [fileFoldersResult, pendingResult, registryResult] = await Promise.all([
      admin
        .from("order_files")
        .select("drive_folder_id,file_category")
        .eq("order_id", orderId)
        .not("drive_folder_id", "is", null),
      admin
        .from("google_drive_upload_sessions")
        .select("user_id,order_id,drive_folder_id,file_name,file_category,version,notes,is_approved,created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      admin
        .from("order_drive_folders")
        .select("drive_folder_id,file_category,folder_kind")
        .eq("order_id", orderId)
        .order("last_seen_at", { ascending: false }),
    ]);

    if (fileFoldersResult.error) throw new Error(`Não foi possível localizar as pastas já vinculadas à ordem: ${fileFoldersResult.error.message}`);
    if (pendingResult.error) throw new Error(`Não foi possível consultar os envios pendentes: ${pendingResult.error.message}`);
    if (registryResult.error) {
      const migrationHint = /order_drive_folders|does not exist|schema cache/i.test(registryResult.error.message)
        ? " Execute a migração de registro das pastas do Google Drive."
        : "";
      throw new Error(`Não foi possível consultar o registro das pastas: ${registryResult.error.message}.${migrationHint}`);
    }

    const pendingRows = (pendingResult.data || []) as Array<{
      user_id: string;
      drive_folder_id: string;
      file_name: string;
      file_category: string;
      version: string | null;
      notes: string | null;
      is_approved: boolean;
    }>;

    const knownFolders = [
      ...(fileFoldersResult.data || []).map((row: { drive_folder_id: string | null; file_category: string | null }) => ({
        id: row.drive_folder_id || "",
        category: row.file_category || "other",
        kind: "category",
      })),
      ...pendingRows.map((row) => ({
        id: row.drive_folder_id,
        category: row.file_category || "other",
        kind: "category",
      })),
      ...(registryResult.data || []).map((row: { drive_folder_id: string; file_category: string | null; folder_kind: string }) => ({
        id: row.drive_folder_id,
        category: row.file_category || "other",
        kind: row.folder_kind,
      })),
    ].filter((folder) => folder.id);

    const scan = await listDriveFilesForOrder(order, knownFolders);
    const driveFiles = scan.files;

    for (const folder of scan.orderFolders || []) {
      await rememberOrderDriveFolder({
        orderId,
        folderId: folder.id,
        folderName: folder.name,
        parentFolderId: folder.parentId,
        folderKind: "order_root",
        userId: actor.user.id,
      });
    }
    for (const folder of scan.categoryFolders || []) {
      await rememberOrderDriveFolder({
        orderId,
        folderId: folder.id,
        folderName: folder.name,
        parentFolderId: folder.parentId,
        folderKind: "category",
        category: folder.category,
        userId: actor.user.id,
      });
    }

    const { data: existingRows, error: existingError } = await admin
      .from("order_files")
      .select("id,order_id,drive_file_id,file_name,file_type,file_size,drive_url,drive_folder_id,file_category,drive_modified_at,drive_last_modified_by_name,drive_last_modified_by_email,drive_md5_checksum,removal_mode,removed_from_order_at,removed_from_order_by")
      .eq("order_id", orderId);
    if (existingError) throw new Error(`Não foi possível verificar os vínculos atuais: ${existingError.message}`);

    const existingByDriveId = new Map<string, ExistingFileRow>();
    for (const row of (existingRows || []) as ExistingFileRow[]) {
      if (!row.drive_file_id) continue;
      const current = existingByDriveId.get(row.drive_file_id);
      // Prefere o vínculo visível. Em bancos antigos que ainda possuam registros
      // duplicados, isso garante que a atualização não permaneça em uma linha oculta.
      if (!current || (current.removed_from_order_at && !row.removed_from_order_at)) {
        existingByDriveId.set(row.drive_file_id, row);
      }
    }

    let linked = 0;
    let updated = 0;
    let restored = 0;
    const errors: string[] = (scan.warnings || []).map((warning) => `Google Drive: ${warning}`);

    for (const file of driveFiles) {
      const category = normalizedCategory(file);
      const current = existingByDriveId.get(file.id);

      if (current) {
        if (!needsUpdate(current, file, category)) continue;

        const wasRemovedFromOrder = Boolean(current.removed_from_order_at);
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
            removal_mode: null,
            removed_from_order_at: null,
            removed_from_order_by: null,
            updated_by: actor.user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", current.id);

        if (error) {
          errors.push(`${file.name}: ${error.message}`);
        } else {
          updated += 1;
          if (wasRemovedFromOrder) {
            restored += 1;
            const { error: historyError } = await admin.from("order_history").insert({
              order_id: orderId,
              user_id: actor.user.id,
              action_type: "file_restored_from_drive",
              description: `Arquivo restaurado na OS pela sincronização da pasta do Google Drive: ${file.name}`,
            });
            if (historyError) errors.push(`${file.name} (histórico): ${historyError.message}`);
          }
        }
        continue;
      }

      const pending = pendingMatch(pendingRows, file, category);
      const newFileRecord = {
        order_id: orderId,
        uploaded_by: pending?.user_id || actor.user.id,
        updated_by: actor.user.id,
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
        removal_mode: null,
        removed_from_order_at: null,
        removed_from_order_by: null,
        updated_at: new Date().toISOString(),
      };

      // A lista atual já foi consultada acima. Portanto, para um arquivo novo,
      // INSERT é suficiente e não depende da inferência de ON CONFLICT do banco.
      // A restrição única permanece no Supabase para proteger contra concorrência.
      let { data: inserted, error } = await admin
        .from("order_files")
        .insert(newFileRecord)
        .select("id")
        .maybeSingle();

      // Se outra sincronização vinculou o arquivo no mesmo instante, recupera o
      // registro existente e atualiza os metadados, sem criar duplicidade.
      if (error?.code === "23505") {
        const { data: concurrentRecord, error: concurrentLookupError } = await admin
          .from("order_files")
          .select("id")
          .eq("order_id", orderId)
          .eq("drive_file_id", file.id)
          .limit(1)
          .maybeSingle();

        if (concurrentLookupError || !concurrentRecord) {
          error = concurrentLookupError || error;
        } else {
          const { error: concurrentUpdateError } = await admin
            .from("order_files")
            .update({
              ...newFileRecord,
              uploaded_by: pending?.user_id || actor.user.id,
            })
            .eq("id", concurrentRecord.id);
          error = concurrentUpdateError;
          inserted = concurrentUpdateError ? null : concurrentRecord;
        }
      }

      if (error || !inserted) errors.push(`${file.name}: ${error?.message || "o banco não confirmou o vínculo"}`);
      else linked += 1;
    }

    const files = await visibleOrderFiles(orderId);
    const visibleDriveIds = new Set(
      files.map((file: { drive_file_id?: string | null }) => file.drive_file_id).filter(Boolean),
    );
    const missingFiles = driveFiles.filter((file) => !visibleDriveIds.has(file.id));
    const displayedDriveFiles = driveFiles.length - missingFiles.length;

    const syncTimestamp = new Date().toISOString();
    const { error: syncStateError } = await admin
      .from("orders")
      .update({
        drive_last_synced_at: syncTimestamp,
        drive_last_sync_file_count: driveFiles.length,
      })
      .eq("id", orderId);
    if (syncStateError) errors.push(`Resumo da sincronização: ${syncStateError.message}`);

    if (linked || updated || restored) {
      const { error: summaryHistoryError } = await admin.from("order_history").insert({
        order_id: orderId,
        user_id: actor.user.id,
        action_type: "file_sync_completed",
        description: `Sincronização do Google Drive concluída: ${driveFiles.length} arquivo(s) encontrado(s), ${linked} novo(s), ${updated} atualizado(s) e ${restored} restaurado(s).`,
      });
      if (summaryHistoryError) errors.push(`Histórico da sincronização: ${summaryHistoryError.message}`);
    }

    if (missingFiles.length) {
      errors.push(`Não apareceram na OS: ${missingFiles.slice(0, 8).map((file) => file.name).join(", ")}`);
    }

    if (errors.length) {
      return Response.json({
        error: `A pasta foi varrida, mas a sincronização não ficou completa: ${errors.slice(0, 5).join(" | ")}`,
        linked,
        updated,
        restored,
        found: driveFiles.length,
        displayed: displayedDriveFiles,
        missing: missingFiles.map((file) => ({ id: file.id, name: file.name })),
        scanned_folders: scan.scannedFolderIds.length,
        scanned_category_folders: scan.scannedCategoryFolderIds?.length || 0,
        order_folder_ids: (scan.orderFolders || []).map((folder) => folder.id),
        category_folder_ids: (scan.categoryFolders || []).map((folder) => folder.id),
        category_counts: scan.categoryCounts || {},
        warnings: scan.warnings || [],
        files,
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      linked,
      updated,
      restored,
      found: driveFiles.length,
      displayed: displayedDriveFiles,
      missing: [],
      scanned_folders: scan.scannedFolderIds.length,
      scanned_category_folders: scan.scannedCategoryFolderIds?.length || 0,
      order_folder_ids: (scan.orderFolders || []).map((folder) => folder.id),
      category_folder_ids: (scan.categoryFolders || []).map((folder) => folder.id),
      category_counts: scan.categoryCounts || {},
      warnings: scan.warnings || [],
      files,
    });
  } catch (error) {
    return responseMessage(error);
  }
}
