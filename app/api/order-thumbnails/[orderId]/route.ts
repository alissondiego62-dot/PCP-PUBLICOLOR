export const runtime = "nodejs";

import crypto from "node:crypto";
import sharp from "sharp";
import { downloadDriveFile } from "@/lib/server/google-drive";
import { getSupabaseAdmin, requireAppUser, responseMessage, type AuthorizedAppUser } from "@/lib/server/supabase-server";
import { driveThumbnailFileId } from "@/lib/order-thumbnail";
import { logSystemEvent } from "@/lib/server/observability";

const BUCKET = "order-thumbnails";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

async function originalImage(path: string) {
  const admin = getSupabaseAdmin();
  const driveFileId = driveThumbnailFileId(path);
  if (driveFileId) {
    const download = await downloadDriveFile(driveFileId);
    return Buffer.from(await download.response.arrayBuffer());
  }
  if (/^https?:\/\//i.test(path)) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível baixar a imagem original.");
    return Buffer.from(await response.arrayBuffer());
  }
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Miniatura original não encontrada.");
  return Buffer.from(await data.arrayBuffer());
}

async function signedUrl(path: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function removeObsoleteOptimizedFiles(orderId: string, keepFileName: string) {
  const admin = getSupabaseAdmin();
  const folder = `optimized/${orderId}`;
  const { data } = await admin.storage.from(BUCKET).list(folder, { limit: 100 });
  const obsolete = (data || [])
    .filter((file) => file.name.endsWith(".webp") && file.name !== keepFileName)
    .map((file) => `${folder}/${file.name}`);
  if (obsolete.length) await admin.storage.from(BUCKET).remove(obsolete);
}

function redirectToImage(url: string) {
  return new Response(null, {
    status: 307,
    headers: {
      location: url,
      "cache-control": "private, max-age=3600, stale-while-revalidate=86400",
      vary: "authorization",
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const startedAt = Date.now();
  let actor: AuthorizedAppUser | null = null;
  let requestedOrderId: string | null = null;

  try {
    actor = await requireAppUser(request);
    const { orderId } = await context.params;
    requestedOrderId = orderId;
    const admin = getSupabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select("id,op_number,main_image_path")
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order?.main_image_path) {
      return Response.json({ error: "Pedido sem miniatura vinculada." }, { status: 404 });
    }

    const signature = crypto
      .createHash("sha256")
      .update(order.main_image_path)
      .digest("hex")
      .slice(0, 20);
    const fileName = `${signature}.webp`;
    const cachePath = `optimized/${order.id}/${fileName}`;

    const existingSignedUrl = await signedUrl(cachePath);
    if (existingSignedUrl) return redirectToImage(existingSignedUrl);

    const original = await originalImage(order.main_image_path);
    const image = await sharp(original)
      .rotate()
      .resize({ width: 520, height: 420, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 74, effort: 3 })
      .toBuffer();

    const upload = await admin.storage.from(BUCKET).upload(cachePath, image, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (upload.error) throw new Error(`Falha ao armazenar WebP: ${upload.error.message}`);

    await removeObsoleteOptimizedFiles(order.id, fileName);
    await logSystemEvent({
      kind: "integration",
      level: "info",
      source: "thumbnail_optimizer",
      action: "generate_webp",
      status: "success",
      message: `Miniatura WebP gerada para a OP ${order.op_number}.`,
      orderId: order.id,
      durationMs: Date.now() - startedAt,
      metadata: { cachePath, bytes: image.byteLength },
      actor,
    });

    const generatedSignedUrl = await signedUrl(cachePath);
    if (!generatedSignedUrl) throw new Error("A miniatura foi criada, mas não foi possível gerar o link temporário.");
    return redirectToImage(generatedSignedUrl);
  } catch (error) {
    await logSystemEvent({
      kind: "api_error",
      level: "error",
      source: "thumbnail_optimizer",
      action: "serve_webp",
      status: "error",
      message: error instanceof Error ? error.message : "Falha desconhecida ao gerar miniatura.",
      orderId: requestedOrderId,
      durationMs: Date.now() - startedAt,
      actor,
    });
    return responseMessage(error, "Não foi possível gerar a miniatura otimizada.");
  }
}
