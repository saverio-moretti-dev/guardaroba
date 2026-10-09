import test from 'node:test';
import assert from 'node:assert/strict';
process.env.APP_CODE = 'testcode';
const L = await import('../api/_lib.js');

// Archivio in memoria che imita Vercel Blob (etag, conflitti, liste)
function memStore() {
  const m = new Map(); let n = 0; const deleted = [];
  return {
    m, deleted,
    async getJson(p) { const v = m.get(p); return v ? { data: JSON.parse(v.body), etag: v.etag } : null; },
    async putJson(p, obj, o = {}) {
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      const cur = m.get(p); // controllo e scrittura atomici, come Vercel Blob
      if (o.ifMatch && (!cur || cur.etag !== o.ifMatch)) throw new L.Conflict();
      if (o.noOverwrite && cur) throw new L.Conflict();
      m.set(p, { body: JSON.stringify(obj), etag: 'e' + (++n), at: Date.now() + n });
    },
    async del(urls) { deleted.push(...urls); },
    async list(prefix) { return [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ pathname: k, url: 'https://x/' + k, size: v.body.length, uploadedAt: v.at })); },
  };
}
const U = (id, n) => `https://abc.public.blob.vercel-storage.com/photos/${id}/${n}.jpg`;
const DAY = 864e5;

test('cestino: elimina, ripristina, foto mai cancellate subito', () => {
  const db = { items: {} };
  L.applyOps(db, [{ op: 'upsert', id: 'aaaaaa01', data: { title: 'A' } }, { op: 'addPhotos', id: 'aaaaaa01', photos: [{ url: U('aaaaaa01', 1), size: 100 }, { url: U('aaaaaa01', 2) }] }], 'S');
  let purge = L.applyOps(db, [{ op: 'delete', id: 'aaaaaa01' }], 'S');
  assert.equal(purge.length, 0); assert.ok(db.trash.items.aaaaaa01); assert.ok(!db.items.aaaaaa01);
  // upsert su articolo cestinato NON lo ricrea vuoto
  L.applyOps(db, [{ op: 'upsert', id: 'aaaaaa01', data: { title: 'X' } }]);
  assert.ok(!db.items.aaaaaa01);
  L.applyOps(db, [{ op: 'restore', id: 'aaaaaa01' }]);
  assert.equal(db.items.aaaaaa01.photos.length, 2); assert.equal(db.items.aaaaaa01.title, 'A');
  assert.equal(db.items.aaaaaa01.photos[0].size, 100);
});

test('foto rimossa va nel cestino e si ripristina; riordino conserva tutto', () => {
  const db = { items: {} };
  L.applyOps(db, [{ op: 'addPhotos', id: 'bbbbbb01', photos: [1, 2, 3].map((i) => ({ url: U('bbbbbb01', i) })) }]);
  L.applyOps(db, [{ op: 'setPhotos', id: 'bbbbbb01', photos: [{ url: U('bbbbbb01', 3) }, { url: U('bbbbbb01', 1) }] }]);
  assert.deepEqual(db.items.bbbbbb01.photos.map((p) => p.url), [U('bbbbbb01', 3), U('bbbbbb01', 1)]);
  assert.equal(db.trash.photos.length, 1);
  L.applyOps(db, [{ op: 'restorePhoto', url: U('bbbbbb01', 2) }]);
  assert.equal(db.items.bbbbbb01.photos.length, 3); assert.equal(db.trash.photos.length, 0);
  // setPhotos con URL estranei non aggiunge nulla
  L.applyOps(db, [{ op: 'setPhotos', id: 'bbbbbb01', photos: [{ url: U('zzzzzz01', 9) }, ...db.items.bbbbbb01.photos] }]);
  assert.equal(db.items.bbbbbb01.photos.length, 3);
});

test('pulizia automatica dopo 30 giorni, mai foto ancora usate', () => {
  const db = { items: {} };
  const t0 = Date.now();
  L.applyOps(db, [{ op: 'addPhotos', id: 'cccccc01', photos: [{ url: U('cccccc01', 1) }, { url: U('cccccc01', 2) }] }], '', t0);
  L.applyOps(db, [{ op: 'delete', id: 'cccccc01' }], '', t0);
  assert.equal(L.applyOps(db, [], '', t0 + 29 * DAY).length, 0);
  assert.equal(L.applyOps(db, [], '', t0 + 31 * DAY).length, 0); // uscito dal cestino ma file ancora tenuti
  assert.ok(!db.trash.items.cccccc01); assert.equal(db.purgeQueue.length, 2);
  assert.equal(L.applyOps(db, [], '', t0 + 44 * DAY).length, 0);
  const purged = L.applyOps(db, [], '', t0 + 46 * DAY);
  assert.equal(purged.length, 2); assert.equal(db.purgeQueue.length, 0);
  // stessa foto usata da un altro articolo: non va cancellata
  const db2 = { items: {} };
  L.applyOps(db2, [{ op: 'addPhotos', id: 'dddddd01', photos: [{ url: U('dddddd01', 1) }] }, { op: 'addPhotos', id: 'dddddd02', photos: [{ url: U('dddddd01', 1) }] }]);
  L.applyOps(db2, [{ op: 'delete', id: 'dddddd01' }]);
  assert.deepEqual(L.applyOps(db2, [{ op: 'purge', ids: ['dddddd01'] }]), []);
});

test('svuota cestino e input malevoli', () => {
  const db = { items: {} };
  L.applyOps(db, [{ op: 'trashPhotos', photos: [{ url: U('eeeeee01', 1) }, { url: 'https://evil.com/x.jpg' }, { url: 'javascript:alert(1)' }] }]);
  assert.equal(db.trash.photos.length, 1);
  const t1 = Date.now();
  assert.equal(L.applyOps(db, [{ op: 'emptyTrash' }], '', t1).length, 0); // mai subito
  assert.equal(db.purgeQueue.length, 1);
  assert.equal(L.applyOps(db, [], '', t1 + 15 * DAY).length, 1);
  L.applyOps(db, [null, 5, { op: 'upsert', id: '../../x', data: {} }, { op: 'upsert', id: 'ffffff01', data: { title: '<img src=x onerror=alert(1)>', hack: 1, __proto__: { a: 1 } } }]);
  assert.equal(Object.keys(db.items).length, 1); assert.equal(db.items.ffffff01.hack, undefined);
  assert.equal(db.items.ffffff01.title, '<img src=x onerror=alert(1)>'); // il testo resta testo: l'interfaccia lo mostra senza eseguirlo
});

test('ripristino entro 14 giorni salva le foto eliminate definitivamente', async () => {
  const s = memStore(); L.setStore(s);
  await L.writeDb([{ op: 'addPhotos', id: 'kkkkkk01', photos: [{ url: U('kkkkkk01', 1), size: 9 }] }, { op: 'upsert', id: 'kkkkkk01', data: { title: 'salvami' } }]);
  const snap = structuredClone((await L.readDb({ fresh: true })).db);
  await L.writeDb([{ op: 'delete', id: 'kkkkkk01' }]); await L.writeDb([{ op: 'emptyTrash' }]);
  let { db } = await L.readDb({ fresh: true });
  assert.equal(db.purgeQueue.length, 1); assert.equal(s.deleted.length, 0);
  const restored = await L.replaceDb(snap, 'S');
  assert.equal(restored.items.kkkkkk01.photos.length, 1); assert.equal(restored.purgeQueue.length, 0);
  // e dopo 15 giorni nulla viene cancellato, perché la foto è di nuovo in uso
  await L.writeDb([], '', { now: Date.now() + 15 * DAY });
  assert.equal(s.deleted.length, 0);
  // importare un backup vecchio senza quella foto non la cancella subito
  await L.replaceDb({ items: {} }, 'S');
  ({ db } = await L.readDb({ fresh: true }));
  assert.equal(db.purgeQueue.length, 1); assert.equal(s.deleted.length, 0);
});

test('import: pulisce e valida', () => {
  assert.throws(() => L.sanitizeImport(null)); assert.throws(() => L.sanitizeImport({}));
  const out = L.sanitizeImport({ items: { gggggg01: { title: 'ok', photos: [{ url: U('gggggg01', 1), size: 5 }, { url: 'bad' }], evil: 1 }, 'bad id': {} }, settings: { descFooter: 'x', foo: 1 } });
  assert.equal(Object.keys(out.items).length, 1); assert.equal(out.items.gggggg01.photos.length, 1); assert.equal(out.items.gggggg01.evil, undefined);
  assert.deepEqual(out.settings, { descFooter: 'x' });
});

test('writeDb: 40 scritture concorrenti senza perdite + backup giornaliero + ripristino', async () => {
  const s = memStore(); L.setStore(s);
  await L.writeDb([{ op: 'upsert', id: 'hhhhhh01', data: { title: 't' } }], 'S');
  await Promise.all(Array.from({ length: 40 }, (_, i) => L.writeDb([{ op: 'upsert', id: 'hhhhhh01', data: { ['notes']: undefined } }, { op: 'upsert', id: `iiii${String(i).padStart(4, '0')}`, data: { title: 'n' + i } }], 'X')));
  const { db } = await L.readDb({ fresh: true });
  assert.equal(Object.keys(db.items).length, 41);
  assert.equal(db.rev, 41);
  // il backup del giorno esiste ed è uno solo
  const backups = await L.listBackups();
  assert.equal(backups.filter((b) => /^\d{4}-\d{2}-\d{2}\.json$/.test(b.name)).length, 1);
  // ripristino dal backup (stato prima della prima modifica del giorno) + copia di sicurezza
  const daily = backups.find((b) => /^\d{4}/.test(b.name));
  const data = await L.readBackup(daily.name);
  const restored = await L.replaceDb(data, 'S');
  assert.equal(Object.keys(restored.items).length, Object.keys(data.items).length);
  assert.ok((await L.listBackups()).some((b) => b.name.startsWith('prima-del-ripristino')));
  await assert.rejects(L.readBackup('../../x'), /non valido/);
  await assert.rejects(L.readBackup('inesistente.json'), /non trovato/);
});

test('writeDb: i 60 backup più recenti vengono tenuti, i vecchi rimossi', async () => {
  const s = memStore(); L.setStore(s);
  for (let i = 0; i < 65; i++) await s.putJson(`${L.BACKUP_PREFIX()}2025-01-${String(i).padStart(2, '0')}.json`, { i });
  await L.writeDb([{ op: 'upsert', id: 'jjjjjj01', data: {} }]);
  await L.writeDb([{ op: 'upsert', id: 'jjjjjj01', data: { title: 'a' } }]);
  assert.ok(s.deleted.length >= 5);
});
