// A2: toglie dalle schede le foto rimaste sul vecchio Vercel Blob (store sospeso, foto perse) e scrive nelle note «N foto perse».
// Le foto tolte vanno nel cestino dell'app (30 giorni, ripristinabili); prima di scrivere salva il backup dell'archivio.
// Prova:      node tools/togli-blob.mjs                 (non scrive niente)
// Esecuzione: node tools/togli-blob.mjs --go --rev <N>  (N = rev mostrata dalla prova: se l'archivio è cambiato, si ferma)
// Indietro:   node tools/togli-blob.mjs --undo <file mappa .json>
import crypto from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(join(REPO, '.env.local')); } catch {}
const APP = (process.env.APP_URL || '').replace(/\/$/, '');
if (!APP) throw new Error('manca APP_URL in .env.local');
const COOKIE = `sess=${crypto.createHmac('sha256', process.env.APP_CODE || '').update('session-v1').digest('hex')}`;
const args = process.argv.slice(2);
const GO = args.includes('--go');
const REV = args.includes('--rev') ? Number(args[args.indexOf('--rev') + 1]) : null;
const undoFile = args.includes('--undo') ? args[args.indexOf('--undo') + 1] : null;
const BY = 'togli-blob';
const BLOB = /\.public\.blob\.vercel-storage\.com\//;

async function api(path, body) {
  const r = await fetch(APP + path, body ? { method: 'POST', headers: { 'content-type': 'application/json', cookie: COOKIE }, body: JSON.stringify(body) } : { headers: { cookie: COOKIE } });
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

if (undoFile) { // rimette le foto (dal cestino, ordine originale) e le note di prima
  const map = JSON.parse(await readFile(undoFile, 'utf8'));
  for (const [id, m] of Object.entries(map)) {
    await api('/api/db', { by: BY, ops: [...m.removed.map((u) => ({ op: 'restorePhoto', id, url: u })), { op: 'setPhotos', id, photos: m.order.map((url) => ({ url })) }, { op: 'upsert', id, data: { notes: m.notes } }] });
    console.log('RIPRISTINATO', id);
  }
  process.exit(0);
}

const db = await api('/api/db');
const todo = Object.values(db.items).filter((it) => (it.photos || []).some((p) => BLOB.test(p.url))).map((it) => {
  const keep = it.photos.filter((p) => !BLOB.test(p.url)), lost = it.photos.length - keep.length;
  const line = `${lost} foto ${lost === 1 ? "persa" : "perse"} (vecchio archivio Blob bloccato, 11/2026): vanno rifatte`;
  return { it, keep, lost, notes: it.notes ? `${it.notes}\n${line}` : line };
});
for (const t of todo) console.log(`${t.it.id}  ${t.it.status || '-'}  tolte ${t.lost}/${t.it.photos.length}, restano ${t.keep.length}  ${t.it.title || t.it.brand || ''}`);
console.log(`rev ${db.rev}: ${todo.length} schede, ${todo.reduce((s, t) => s + t.lost, 0)} foto${GO ? '' : ` — prova, niente scritto (esecuzione: --go --rev ${db.rev})`}`);
if (!GO) process.exit(0);
if (REV !== db.rev) { console.log(`FERMO: l'archivio è alla rev ${db.rev}, la prova era sulla ${REV}. Rifai la prova.`); process.exit(1); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(REPO, 'vinted-articoli', `_backup-a2-${stamp}.json`); // dentro vinted-articoli/: fuori da git (repo pubblica)
await writeFile(backup, JSON.stringify(db));
const map = Object.fromEntries(todo.map((t) => [t.it.id, { order: t.it.photos.map((p) => p.url), removed: t.it.photos.filter((p) => BLOB.test(p.url)).map((p) => p.url), notes: t.it.notes || '' }]));
const mapFile = join(REPO, 'vinted-articoli', `_togli-blob-${stamp}.json`);
await writeFile(mapFile, JSON.stringify(map, null, 1));
console.log('backup:', backup, '\nmappa per tornare indietro:', mapFile);
// una sola scrittura: setPhotos manda le foto tolte nel cestino (30 giorni)
const after = await api('/api/db', { by: BY, ops: todo.flatMap((t) => [{ op: 'setPhotos', id: t.it.id, photos: t.keep.map((p) => ({ url: p.url })) }, { op: 'upsert', id: t.it.id, data: { notes: t.notes } }]) });
const left = Object.values(after.items).reduce((s, it) => s + (it.photos || []).filter((p) => BLOB.test(p.url)).length, 0);
console.log(`FATTO: rev ${after.rev}, foto Blob rimaste nelle schede: ${left}`);
process.exit(left ? 1 : 0);
