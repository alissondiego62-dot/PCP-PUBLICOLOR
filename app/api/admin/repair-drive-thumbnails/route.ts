export const runtime = "nodejs";

import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";
import {
  buildDriveThumbnailPath,
  isPdfImportedPageThumbnail,
  isPngThumbnailCandidate,
} from "@/lib/order-thumbnail";

const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 25;
const MAX_REPORT_ITEMS = 100;

type RepairRequest = {
  apply?: boolean;
  confirmation?: string;
};

type OrderRow = {
  id: string;
  op_number: string;
  client_name: string;
  main_image_path: string | null;
};

type OrderFileRow = {
  id: string;
  order_id: string;
  file_name: string;
  file_type: string | null;
  file_category: string | null;
  drive_file_id: string | null;
  notes: string | null;
  drive_modified_at: string | null;
  created_at: string;
};

type PlannedRepair = {
  orderId: string;
  opNumber: string;
  clientName: string;
  previousPath: string | null;
  nextPath: string;
  fileId: string;
  fileName: string;
};

function normalizedText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isPng(file: OrderFileRow) {
  return isPngThumbnailCandidate(file);
}

function fileTimestamp(file: OrderFileRow) {
  const value = file.drive_modified_at || file.created_at;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newest(files: OrderFileRow[]) {
  return [...files].sort((first, second) => fileTimestamp(second) - fileTimestamp(first))[0] || null;
}

function chooseThumbnail(files: OrderFileRow[]) {
  const pngFiles = files.filter((file) => Boolean(file.drive_file_id) && isPng(file));
  if (pngFiles.length === 0) return null;

  // Regra principal: o PNG criado a partir da página importada do PDF da OS
  // é sempre a miniatura oficial do pedido ou subpedido.
  const importedPdfPages = pngFiles.filter(isPdfImportedPageThumbnail);
  if (importedPdfPages.length > 0) return newest(importedPdfPages);

  // Compatibilidade para arquivos antigos da pasta 04 - DOCUMENTOS.
  const documentPngs = pngFiles.filter((file) => normalizedText(file.file_category) === "document");
  if (documentPngs.length > 0) return newest(documentPngs);

  const explicitlyMarked = pngFiles.filter((file) => {
    const notes = normalizedText(file.notes);
    const name = normalizedText(file.file_name);
    return /miniatura|thumbnail|pagina|capa/.test(`${notes} ${name}`);
  });
  if (explicitlyMarked.length > 0) return newest(explicitlyMarked);

  return newest(pngFiles);
}

async function loadAllOrders(): Promise<OrderRow[]> {
  const admin = getSupabaseAdmin();
  const rows: OrderRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("orders")
      .select("id,op_number,client_name,main_image_path")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Não foi possível carregar os pedidos: ${error.message}`);
    const page = (data || []) as OrderRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadPngRowsFromView(): Promise<OrderFileRow[] | null> {
  const admin = getSupabaseAdmin();
  const rows: OrderFileRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("order_thumbnail_candidates")
      .select("id,order_id,file_name,file_type,file_category,drive_file_id,notes,drive_modified_at,created_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // Compatibilidade com bancos que ainda não executaram o SQL 3.0.
      if (["42P01", "PGRST205"].includes(error.code || "")) return null;
      throw new Error(`Não foi possível carregar a visão de miniaturas: ${error.message}`);
    }

    const page = (data || []) as OrderFileRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function loadAllPngFiles(): Promise<OrderFileRow[]> {
  const optimizedRows = await loadPngRowsFromView();
  if (optimizedRows) return optimizedRows;

  const admin = getSupabaseAdmin();
  const rows: OrderFileRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin
      .from("order_files")
      .select("id,order_id,file_name,file_type,file_category,drive_file_id,notes,drive_modified_at,created_at")
      .not("drive_file_id", "is", null)
      .is("removed_from_order_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Não foi possível carregar os arquivos vinculados: ${error.message}`);
    const page = ((data || []) as OrderFileRow[]).filter(isPng);
    rows.push(...page);
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function limited<T>(items: T[]) {
  return items.slice(0, MAX_REPORT_ITEMS);
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json().catch(() => ({})) as RepairRequest;
    const apply = body.apply === true;

    if (apply && String(body.confirmation || "").trim().toUpperCase() !== "SINCRONIZAR MINIATURAS") {
      return Response.json({ error: "Confirmação inválida." }, { status: 400 });
    }

    const [orders, files] = await Promise.all([loadAllOrders(), loadAllPngFiles()]);
    const filesByOrder = new Map<string, OrderFileRow[]>();

    for (const file of files) {
      const current = filesByOrder.get(file.order_id) || [];
      current.push(file);
      filesByOrder.set(file.order_id, current);
    }

    const planned: PlannedRepair[] = [];
    const alreadyLinked: Array<{ opNumber: string; fileName: string }> = [];
    const missing: Array<{ opNumber: string; clientName: string }> = [];

    for (const order of orders) {
      const selected = chooseThumbnail(filesByOrder.get(order.id) || []);
      if (!selected?.drive_file_id) {
        missing.push({ opNumber: order.op_number, clientName: order.client_name });
        continue;
      }

      const nextPath = buildDriveThumbnailPath(selected.drive_file_id);
      if (order.main_image_path?.trim() === nextPath) {
        alreadyLinked.push({ opNumber: order.op_number, fileName: selected.file_name });
        continue;
      }

      planned.push({
        orderId: order.id,
        opNumber: order.op_number,
        clientName: order.client_name,
        previousPath: order.main_image_path,
        nextPath,
        fileId: selected.drive_file_id,
        fileName: selected.file_name,
      });
    }

    const updated: PlannedRepair[] = [];
    const errors: Array<{ opNumber: string; message: string }> = [];
    const historyWarnings: Array<{ opNumber: string; message: string }> = [];

    if (apply) {
      const admin = getSupabaseAdmin();
      for (let index = 0; index < planned.length; index += UPDATE_BATCH_SIZE) {
        const batch = planned.slice(index, index + UPDATE_BATCH_SIZE);
        const results = await Promise.all(batch.map(async (item) => {
          const { error } = await admin
            .from("orders")
            .update({ main_image_path: item.nextPath })
            .eq("id", item.orderId);

          if (error) return { item, error: error.message, historyError: null as string | null };

          const { error: historyError } = await admin.from("order_history").insert({
            order_id: item.orderId,
            user_id: actor.user.id,
            action_type: "thumbnail_synced_from_files",
            description: `Miniatura sincronizada usando o PNG da aba Arquivos: ${item.fileName}`,
          });

          return { item, error: null, historyError: historyError?.message || null };
        }));

        for (const result of results) {
          if (result.error) errors.push({ opNumber: result.item.opNumber, message: result.error });
          else {
            updated.push(result.item);
            if (result.historyError) historyWarnings.push({ opNumber: result.item.opNumber, message: result.historyError });
          }
        }
      }
    }

    return Response.json({
      ok: true,
      mode: apply ? "applied" : "dry-run",
      message: apply
        ? `${updated.length} miniatura(s) sincronizada(s). Atualize a página com Ctrl + F5.`
        : `${planned.length} pedido(s) precisam sincronizar a miniatura.`,
      totals: {
        orders: orders.length,
        pngFiles: files.length,
        repairable: planned.length,
        alreadyLinked: alreadyLinked.length,
        missingPng: missing.length,
        updated: updated.length,
        errors: errors.length,
        historyWarnings: historyWarnings.length,
      },
      repairable: limited(planned),
      updated: limited(updated),
      alreadyLinked: limited(alreadyLinked),
      missing: limited(missing),
      errors: limited(errors),
      historyWarnings: limited(historyWarnings),
      reportLimitedTo: MAX_REPORT_ITEMS,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return responseMessage(error);
  }
}
