// Keeps the card pictures and flags saved on the phone, so they show instantly and work on a weak signal.
// Only pictures are cached; the game itself always loads fresh.
// Also receives picture packs shared from other apps (e.g. WhatsApp → Share → Head to Head) and hands them to the page.
const CACHE = "h2h-img-v1";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.searchParams.has("share-pack")) {
    e.respondWith((async () => {
      try {
        const f = (await e.request.formData()).get("pack");
        if (f) { const c = await caches.open("h2h-shared"); await c.put("shared-pack", new Response(f, { headers: { "x-name": encodeURIComponent(f.name || "pack.json") } })); }
      } catch (err) { }
      return Response.redirect(url.pathname + "?shared-pack", 303);
    })());
    return;
  }
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.includes("/img/")) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) c.put(e.request, res.clone());
    return res;
  }));
});
