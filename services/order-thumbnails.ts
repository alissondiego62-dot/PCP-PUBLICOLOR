"use client";

import type { Order } from "@/lib/pcp-types";

type ThumbnailOrder = Pick<Order, "id" | "main_image_path">;

const THUMBNAIL_CACHE_PREFIX = "publicolor-order-thumbnails-v2";
const LEGACY_CACHE = "publicolor-order-thumbnails-v1";
const MAX_CONCURRENT_REQUESTS = 4;

let activeRequests = 0;
const requestQueue: Array<() => void> = [];
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

async function withRequestSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => requestQueue.push(resolve));
  }

  activeRequests += 1;
  try {
    return await task();
  } finally {
    activeRequests -= 1;
    requestQueue.shift()?.();
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
  });

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
