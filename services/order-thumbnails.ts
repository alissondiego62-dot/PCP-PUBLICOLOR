"use client";

import type { Order } from "@/lib/pcp-types";

type ThumbnailOrder = Pick<Order, "id" | "main_image_path">;
export type ThumbnailRequestPriority = "foreground" | "background";

const THUMBNAIL_CACHE_PREFIX = "publicolor-order-thumbnails-v2";
const LEGACY_CACHE = "publicolor-order-thumbnails-v1";
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
  await window.caches.delete(LEGACY_CACHE).catch(() => false);
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
    name === LEGACY_CACHE || (expected ? name === expected : name.startsWith(THUMBNAIL_CACHE_PREFIX)),
  );
  targets.forEach((name) => cachePromises.delete(name));
  await Promise.all(targets.map((name) => window.caches.delete(name)));
}
