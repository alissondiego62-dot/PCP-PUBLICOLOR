export const runtime = "nodejs";

import {
  driveThumbnailFileId,
  isOfficialOrderThumbnail,
  isPdfComplementPage,
  isPngThumbnailCandidate,
  thumbnailPageNumber,
} from "@/lib/order-thumbnail";
import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

type FileRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  file_category: string | null;
  notes: string | null;
  drive_file_id: string | null;
  created_at: string;
};

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    await requireAppUser(request);
    const { orderId } = await context.params;
    const admin = getSupabaseAdmin();

    const [{ data: order, error: orderError }, { data: rows, error: filesError }] = await Promise.all([
      admin
        .from("orders")
        .select("id,op_number,main_image_path")
        .eq("id", orderId)
        .maybeSingle(),
      admin
        .from("order_files")
        .select("id,file_name,file_type,file_category,notes,drive_file_id,created_at")
        .eq("order_id", orderId)
        .is("removed_from_order_at", null)
        .order("created_at", { ascending: true }),
    ]);

    if (orderError || !order) {
      return Response.json({ error: "Pedido não encontrado." }, { status: 404 });
    }
    if (filesError) throw new Error(`Não foi possível localizar as páginas da miniatura: ${filesError.message}`);

    const mainDriveFileId = driveThumbnailFileId(order.main_image_path);
    const files = ((rows || []) as FileRow[])
      .filter((file) => isPngThumbnailCandidate(file))
      .filter((file) => file.drive_file_id === mainDriveFileId || isOfficialOrderThumbnail(file) || isPdfComplementPage(file));

    const unique = new Map<string, FileRow>();
    for (const file of files) {
      const key = file.drive_file_id || file.id;
      if (!unique.has(key)) unique.set(key, file);
    }

    const sorted = Array.from(unique.values()).sort((first, second) => {
      const firstMain = first.drive_file_id === mainDriveFileId ? 0 : 1;
      const secondMain = second.drive_file_id === mainDriveFileId ? 0 : 1;
      if (firstMain !== secondMain) return firstMain - secondMain;
      const firstPage = thumbnailPageNumber(first) ?? Number.MAX_SAFE_INTEGER;
      const secondPage = thumbnailPageNumber(second) ?? Number.MAX_SAFE_INTEGER;
      if (firstPage !== secondPage) return firstPage - secondPage;
      return first.created_at.localeCompare(second.created_at);
    });

    const pages = sorted.map((file, index) => ({
      key: file.drive_file_id || file.id,
      file_name: file.file_name,
      page_number: thumbnailPageNumber(file) || index + 1,
      is_main: file.drive_file_id === mainDriveFileId || (!mainDriveFileId && index === 0),
      preview_url: file.drive_file_id
        ? `/api/google-drive/preview?file_id=${encodeURIComponent(file.drive_file_id)}`
        : null,
    }));

    // Pedidos manuais ou antigos podem ter a miniatura apenas no bucket. A rota
    // principal entra como página 1 mesmo quando existem complementos no Drive.
    if (order.main_image_path && !pages.some((page) => page.is_main)) {
      pages.unshift({
        key: "main",
        file_name: `OP ${order.op_number}.png`,
        page_number: 1,
        is_main: true,
        preview_url: `/api/order-thumbnails/${encodeURIComponent(order.id)}`,
      });
    }

    return Response.json({
      order_id: order.id,
      op_number: order.op_number,
      pages,
    });
  } catch (error) {
    return responseMessage(error, "Não foi possível carregar as páginas da miniatura.");
  }
}
