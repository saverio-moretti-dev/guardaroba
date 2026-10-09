// Service worker: riceve le foto condivise dal telefono ("Condividi" -> Guardaroba)
// e le mette in una coda locale; la pagina le carica nella cartella aperta.
const SHELL = 'shell-v2';
const ASSETS = ['/', '/app1.js', '/app2.js', '/app3.js', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
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
            const key = `/inbox/${Date.now()}-${String(i++).padStart(3, '0')}-${Math.random().toString(36).slice(2, 7)}`;
            await inbox.put(key, new Response(f, { headers: { 'content-type': f.type || 'image/jpeg', 'x-name': encodeURIComponent(f.name || 'foto.jpg') } }));
          }
          return Response.redirect(`/?shared=${files.length}`, 303);
        } catch (err) {
          return Response.redirect('/?shared=0', 303);
        }
      })()
    );
    return;
  }

  // App sempre aggiornata quando c'è rete; senza rete parte comunque dalla copia salvata
  const isShell = req.method === 'GET' && url.origin === location.origin && (req.mode === 'navigate' || ASSETS.includes(url.pathname));
  if (isShell) {
    e.respondWith((async () => {
      const key = req.mode === 'navigate' ? '/' : url.pathname;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(key, res.clone());
        return res;
      } catch {
        return (await caches.match(key)) || Response.error();
      }
    })());
  }
});
