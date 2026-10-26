// Service worker: riceve le foto condivise dal telefono ("Condividi" -> Guardaroba)
// e le mette in una coda locale; la pagina le carica nella cartella aperta.
const SHELL = 'shell-v3';
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

// Caricamento in background (Android/Chrome, Background Sync): quando l'app va in secondo piano o si chiude
// con foto in coda, il browser sveglia questo worker appena c'è rete e le foto partono da qui.
// Stessa coda della pagina ('pending-uploads') e stesso lucchetto per foto: ognuna parte una volta sola.
// Il risultato va subito sul server (addPhotos) e in 'upload-done', che la pagina legge alla riapertura.
// iPhone non ha Background Sync: lì il caricamento riprende da solo quando si riapre l'app.
self.addEventListener('sync', (e) => { if (e.tag === 'uploads') e.waitUntil(uploadQueue()); });
const withLock = (name, fn) => (self.navigator && navigator.locks ? navigator.locks.request(name, fn) : fn());
async function uploadQueue() {
  const pend = await caches.open('pending-uploads');
  const done = await caches.open('upload-done');
  let failed = 0;
  for (const req of await pend.keys()) {
    const key = new URL(req.url).pathname.replace('/pending/', '');
    try {
      await withLock('up-' + key, async () => {
        const r = await pend.match(req);
        if (!r || !r.headers.get('x-target')) return; // già caricata dalla pagina, o voce di una versione vecchia
        const target = JSON.parse(decodeURIComponent(r.headers.get('x-target')));
        const seq = Number(r.headers.get('x-seq')) || 0;
        const type = r.headers.get('content-type');
        const blob = await r.blob();
        const t = await fetch('/api/upload', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: target.id, contentType: type, size: blob.size }) });
        if (!t.ok) throw new Error('permesso ' + t.status);
        const ticket = await t.json();
        const up = await fetch(ticket.endpoint, { method: 'PUT', headers: ticket.headers, body: blob });
        if (!up.ok) throw new Error('caricamento ' + up.status);
        const { url } = await up.json();
        const photo = { url, size: blob.size };
        await fetch('/api/db', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [{ op: 'addPhotos', id: target.id, photos: [photo] }], by: 'sfondo' }) });
        await done.put('/done/' + key, new Response(JSON.stringify({ key, target, seq, ...photo }), { headers: { 'content-type': 'application/json' } }));
        await pend.delete(req); // solo dopo aver scritto il risultato
      });
    } catch (err) { failed++; }
  }
  if (failed) throw new Error(failed + ' foto da riprovare'); // il browser ritenta più tardi
}

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
