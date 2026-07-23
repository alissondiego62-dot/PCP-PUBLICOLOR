"use client";

import type { Order } from "@/lib/pcp-types";

type ThumbnailOrder = Pick<Order, "id" | "main_image_path">;
export type ThumbnailRequestPriority = "foreground" | "background";

const THUMBNAIL_CACHE_PREFIX = "publicolor-order-thumbnails-v3-png";
const LEGACY_CACHES = ["publicolor-order-thumbnails-v1", "publicolor-order-thumbnails-v2"];
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_BACKGROUND_REQUESTS = 2;

type QueueTicket = {
  resolve: (release: () => void) => void;
};

let activeRequests = 0;
let activeBackgroundRequests = 0;
const foregroundQueue: QueueTicket[] = [];
const backgroundQueue: QueueTicket[] = [];
const pendingRequests = new Map<string, Promise<string | null>>();
const cachePromises = new Map<string, Promise<Cache>>();
let legacyCacheCleanupStarted = false;

function versionToken(path: string) {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function endpoint(order: ThumbnailOrder) {
  const path = order.main_image_path?.trim() || "";
  return `/api/order-thumbnails/${encodeURIComponent(order.id)}?v=${versionToken(path)}`;
}

function cacheName(userId: string) {
  return `${THUMBNAIL_CACHE_PREFIX}:${userId}`;
}

function openUserCache(userId: string) {
  const name = cacheName(userId);
  const existing = cachePromises.get(name);
  if (existing) return existing;
  const created = window.caches.open(name);
  cachePromises.set(name, created);
  return created;
}

async function cleanupLegacyCache() {
  if (legacyCacheCleanupStarted || !("caches" in window)) return;
  legacyCacheCleanupStarted = true;
  await Promise.all(LEGACY_CACHES.map((name) => window.caches.delete(name).catch(() => false)));
}

function pumpRequestQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS) {
    let priority: ThumbnailRequestPriority | null = null;
    let ticket: QueueTicket | undefined;

    if (foregroundQueue.length) {
      priority = "foreground";
      ticket = foregroundQueue.shift();
    } else if (backgroundQueue.length && activeBackgroundRequests < MAX_BACKGROUND_REQUESTS) {
      priority = "background";
      ticket = backgroundQueue.shift();
    }

    if (!priority || !ticket) return;

    activeRequests += 1;
    if (priority === "background") activeBackgroundRequests += 1;

    let released = false;
    ticket.resolve(() => {
      if (released) return;
      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
      if (priority === "background") {
        activeBackgroundRequests = Math.max(0, activeBackgroundRequests - 1);
      }
      pumpRequestQueue();
    });
  }
}

async function withRequestSlot<T>(
  task: () => Promise<T>,
  priority: ThumbnailRequestPriority,
): Promise<T> {
  const release = await new Promise<() => void>((resolve) => {
    const queue = priority === "foreground" ? foregroundQueue : backgroundQueue;
    queue.push({ resolve });
    pumpRequestQueue();
  });

  try {
    return await task();
  } finally {
    release();
  }
}

async function responseObjectUrl(response: Response) {
  const blob = await response.blob();
  if (!blob.size) return null;
  return URL.createObjectURL(blob);
}

export async function fetchOptimizedOrderThumbnail(
  order: ThumbnailOrder,
  accessToken: string,
  userId: string,
  priority: ThumbnailRequestPriority = "foreground",
) {
  const imagePath = order.main_image_path?.trim();
  if (!imagePath) return null;

  const url = endpoint(order);
  const key = `${userId}:${url}`;
  const existingRequest = pendingRequests.get(key);
  if (existingRequest) return existingRequest;

  const request = withRequestSlot(async () => {
    await cleanupLegacyCache();

    const cache = "caches" in window
      ? await openUserCache(userId)
      : null;
    const cacheRequest = new Request(url, { method: "GET" });

    const cached = await cache?.match(cacheRequest);
    if (cached) return responseObjectUrl(cached);

    if (typeof navigator !== "undefined" && !navigator.onLine) return null;

    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "default",
      });
      if (!response.ok) throw new Error(`Miniatura indisponível (${response.status}).`);
      if (cache) await cache.put(cacheRequest, response.clone());
      return responseObjectUrl(response);
    } catch {
      const fallback = await cache?.match(cacheRequest);
      return fallback ? responseObjectUrl(fallback) : null;
    }
  }, priority);

  pendingRequests.set(key, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(key);
  }
}

export async function clearOrderThumbnailCaches(userId?: string) {
  if (!("caches" in window)) return;
  const names = await window.caches.keys();
  const expected = userId ? cacheName(userId) : null;
  const targets = names.filter((name) =>
    LEGACY_CACHES.includes(name) || (expected ? name === expected : name.startsWith(THUMBNAIL_CACHE_PREFIX)),
  );
  targets.forEach((name) => cachePromises.delete(name));
  await Promise.all(targets.map((name) => window.caches.delete(name)));
}

export type OrderThumbnailGalleryPage = {
  key: string;
  fileName: string;
  pageNumber: number;
  isMain: boolean;
  src: string;
  ownedObjectUrl: boolean;
};

type GalleryMetadataResponse = {
  pages?: Array<{
    key: string;
    file_name: string;
    page_number: number;
    is_main: boolean;
    preview_url: string | null;
  }>;
};

async function authenticatedImageObjectUrl(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Página complementar indisponível (${response.status}).`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("O arquivo complementar está vazio.");
  return URL.createObjectURL(blob);
}

export async function fetchOrderThumbnailGallery(
  order: ThumbnailOrder,
  initialUrl: string,
  accessToken: string,
): Promise<OrderThumbnailGalleryPage[]> {
  const response = await fetch(`/api/order-thumbnails/${encodeURIComponent(order.id)}/pages`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as GalleryMetadataResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível localizar as páginas da miniatura.");

  const metadata = payload.pages || [];
  if (!metadata.length) {
    return [{
      key: "main",
      fileName: "Miniatura principal.png",
      pageNumber: 1,
      isMain: true,
      src: initialUrl,
      ownedObjectUrl: false,
    }];
  }

  const pages: OrderThumbnailGalleryPage[] = [];
  for (const page of metadata) {
    if (page.is_main) {
      pages.push({
        key: page.key,
        fileName: page.file_name,
        pageNumber: page.page_number,
        isMain: true,
        src: initialUrl,
        ownedObjectUrl: false,
      });
      continue;
    }
    if (!page.preview_url) continue;
    try {
      const src = await authenticatedImageObjectUrl(page.preview_url, accessToken);
      pages.push({
        key: page.key,
        fileName: page.file_name,
        pageNumber: page.page_number,
        isMain: false,
        src,
        ownedObjectUrl: true,
      });
    } catch {
      // Uma página com falha não bloqueia a visualização das demais.
    }
  }

  return pages.length ? pages : [{
    key: "main",
    fileName: "Miniatura principal.png",
    pageNumber: 1,
    isMain: true,
    src: initialUrl,
    ownedObjectUrl: false,
  }];
}

export function releaseOrderThumbnailGallery(pages: OrderThumbnailGalleryPage[]) {
  for (const page of pages) {
    if (page.ownedObjectUrl && page.src.startsWith("blob:")) URL.revokeObjectURL(page.src);
  }
}
