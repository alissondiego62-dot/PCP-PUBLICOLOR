"use client";

import type { Order } from "@/lib/pcp-types";

const THUMBNAIL_CACHE = "publicolor-order-thumbnails-v1";

function endpoint(order: Order) {
  return `/api/order-thumbnails/${encodeURIComponent(order.id)}`;
}

export async function fetchCachedOrderThumbnails(orders: Order[]) {
  if (!("caches" in window)) return {} as Record<string, string>;
  const cache = await window.caches.open(THUMBNAIL_CACHE);
  const result: Record<string, string> = {};
  const candidates = orders.filter((order) => Boolean(order.main_image_path?.trim()));

  for (let index = 0; index < candidates.length; index += 24) {
    const group = candidates.slice(index, index + 24);
    const cached = await Promise.all(group.map(async (order) => ({
      orderId: order.id,
      response: await cache.match(endpoint(order)),
    })));
    for (const item of cached) {
      if (item.response) result[item.orderId] = URL.createObjectURL(await item.response.blob());
    }
  }
  return result;
}

export async function fetchOptimizedOrderThumbnail(order: Order, accessToken: string) {
  if (!order.main_image_path?.trim()) return null;
  const url = endpoint(order);
  const cache = "caches" in window ? await window.caches.open(THUMBNAIL_CACHE) : null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Miniatura indisponível (${response.status}).`);
    if (cache) await cache.put(url, response.clone());
    return URL.createObjectURL(await response.blob());
  } catch {
    const cached = await cache?.match(url);
    return cached ? URL.createObjectURL(await cached.blob()) : null;
  }
}
