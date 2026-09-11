// ============================================================================
// Service worker — guarda una copia de la app en el propio dispositivo para
// que abra igual aunque se corte internet. Los datos (pedidos, caja, menú)
// siguen viajando a Supabase; esto solo cachea los archivos de la app y la
// librería de Supabase, no los datos.
// ============================================================================
const CACHE_NAME = "buffet-app-v1";
const ARCHIVOS_PROPIOS = [
  "./",
  "./index.html",
  "./mesas.html",
  "./pedido.html",
  "./cocina.html",
  "./caja.html",
  "./admin.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/config.js",
  "./js/supabaseClient.js",
  "./js/auth.js",
  "./js/offlineQueue.js",
  "./js/audit.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_PROPIOS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear las llamadas a Supabase: esas tienen que ir siempre a red
  // (o fallar limpio, para que la cola offline se haga cargo).
  if (url.hostname.endsWith("supabase.co")) return;

  // La librería de Supabase (CDN) y las tipografías: cache-first para que
  // funcionen sin conexión una vez que se cargaron alguna vez.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname.includes("fonts.g")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cacheada = await cache.match(event.request);
        if (cacheada) return cacheada;
        try {
          const resp = await fetch(event.request);
          cache.put(event.request, resp.clone());
          return resp;
        } catch (e) {
          return cacheada || Response.error();
        }
      })
    );
    return;
  }

  // Archivos propios de la app: red primero (para tener siempre la última
  // versión), y si no hay conexión, se sirve la copia guardada.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          return resp;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match("./index.html")))
    );
  }
});
