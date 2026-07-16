const SHELL_CACHE = "publicolor-pcp-shell-v3.4.2";
const RUNTIME_CACHE = "publicolor-pcp-runtime-v3.4.2";
const THUMBNAIL_CACHE_PREFIX = "publicolor-order-thumbnails-v2";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/producao",
  "/pedidos",
  "/concluidos",
  "/agenda",
  "/atividades-compras",
  "/clientes",
  "/usuarios",
  "/configuracoes",
  "/manifest.webmanifest",
  "/publicolor-logo.png",
  "/icons/publicolor-192.png",
  "/icons/publicolor-512.png",
  "/icons/publicolor-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key) && !key.startsWith(THUMBNAIL_CACHE_PREFIX)).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/")) || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const networkPromise = fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      }).catch(() => null);
      return cached || (await networkPromise) || Response.error();
    })());
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
