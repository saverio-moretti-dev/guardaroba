// Service worker: riceve le foto condivise dal telefono ("Condividi" -> Guardaroba)
// e le mette in una coda locale; la pagina le carica nella cartella aperta.
const SHELL = 'shell-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/app1.js', '/app2.js', '/icon-192.png'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname === '/share-target') {
    e.respondWith(
      (async () => {
        try {
          const fd = await req.formData();
          const files = fd.getAll('photos').filter((f) => f && f.size);
          const inbox = await caches.open('share-inbox');
          let i = 0;
          for (const f of files) {
            const key = `/inbox/${Date.now()}-${i++}-${Math.random().toString(36).slice(2, 7)}.jpg`;
            await inbox.put(key, new Response(f, { headers: { 'content-type': f.type || 'image/jpeg' } }));
          }
          return Response.redirect(`/?shared=${files.length}`, 303);
        } catch (err) {
          return Response.redirect('/?shared=0', 303);
        }
      })()
    );
    return;
  }

  if (req.method === 'GET' && req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
  }
});
