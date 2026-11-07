// Ricarica su Cloudinary le foto degli articoli Vinted usando le copie locali in vinted-articoli/
// (sono gli originali caricati su Blob da allinea.mjs: stessi byte, stesso ordine) e sostituisce gli URL nell'app.
// Prova:     node tools/vinted-import/foto-cloudinary.mjs [--only id1,id2]          (non scrive niente)
// Esecuzione: node tools/vinted-import/foto-cloudinary.mjs --go [--only id1,id2]
// Indietro:  node tools/vinted-import/foto-cloudinary.mjs --undo <file mappa .json>
// Un articolo si tocca solo se numero, dimensioni e ordine delle foto locali coincidono con quelle nell'app.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(join(REPO, '.env.local')); } catch {} // APP_URL sta qui: la repo è pubblica
const APP = process.env.APP_URL;
if (!APP) throw new Error('manca APP_URL in .env.local');
const DIR = process.env.VINTED_DIR || join(REPO, 'vinted-articoli');
const args = process.argv.slice(2);
const GO = args.includes('--go');
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const undoFile = args.includes('--undo') ? args[args.indexOf('--undo') + 1] : null;

async function api(path, body) {
  const r = await fetch(APP + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return r.json();
}
const BY = 'foto-cloudinary';

if (undoFile) { // rimette le foto Blob (dal cestino, nello stesso ordine) e manda nel cestino quelle Cloudinary
  const map = JSON.parse(await readFile(undoFile, 'utf8'));
  for (const [id, m] of Object.entries(map)) {
    await api('/api/db', { by: BY, ops: [{ op: 'setPhotos', id, photos: [] }, ...m.old.map((p) => ({ op: 'restorePhoto', id, url: p.url }))] });
    console.log('RIPRISTINATO', id);
  }
  process.exit(0);
}

const db = await api('/api/db');
const folders = new Map((await readdir(DIR)).filter((f) => !f.startsWith('_')).map((f) => [f.split('-')[0], f]));
const todo = [];
for (const it of Object.values(db.items)) {
  if (only && !only.has(it.id)) continue;
  const vid = /\/items\/(\d+)/.exec(it.vintedUrl || '')?.[1];
  const f = vid && folders.get(vid);
  if (!f) continue;
  if ((it.photos || []).every((p) => p.url.includes('res.cloudinary.com'))) continue; // già fatto
  const names = (await readdir(join(DIR, f))).filter((n) => /^\d+\.(jpg|jpeg|png|webp)$/i.test(n)).sort();
  const bufs = await Promise.all(names.map((n) => readFile(join(DIR, f, n))));
  const same = bufs.length === it.photos.length && bufs.every((b, i) => b.length === it.photos[i].size);
  console.log(`${same ? 'OK   ' : 'SALTO'} ${it.id} ${it.photos.length} foto  ${f}`);
  if (same) todo.push({ it, names, bufs });
}
console.log(`${todo.length} articoli, ${todo.reduce((s, t) => s + t.bufs.length, 0)} foto${GO ? '' : ' — prova, niente scritto (aggiungi --go)'}`);
if (!GO) process.exit(0);

const mapFile = join(DIR, `_foto-cloudinary-${Date.now()}.json`); // dentro vinted-articoli/: fuori da git (repo pubblica)
const map = {};
for (const { it, names, bufs } of todo) {
  const fresh = [];
  for (let i = 0; i < bufs.length; i++) {
    const type = names[i].endsWith('.png') ? 'image/png' : names[i].endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const t = await api('/api/upload', { item: it.id, contentType: type, size: bufs[i].length });
    let r;
    if (t.fields) { const fd = new FormData(); for (const [k, v] of Object.entries(t.fields)) fd.append(k, v); fd.append('file', new Blob([bufs[i]], { type })); r = await fetch(t.endpoint, { method: 'POST', body: fd }); }
    else r = await fetch(t.endpoint, { method: 'PUT', headers: t.headers, body: bufs[i] });
    if (!r.ok) throw new Error(`foto ${names[i]} di ${it.id} rifiutata (${r.status})`);
    const j = await r.json();
    fresh.push({ url: j.secure_url || j.url, size: bufs[i].length });
  }
  map[it.id] = { old: it.photos.map((p) => ({ url: p.url, size: p.size })), new: fresh };
  await writeFile(mapFile, JSON.stringify(map, null, 1)); // prima di toccare l'app: serve per --undo
  // le foto Blob vanno nel cestino dell'app (30 giorni), le nuove prendono il loro posto nello stesso ordine
  await api('/api/db', { by: BY, ops: [{ op: 'setPhotos', id: it.id, photos: [] }, { op: 'addPhotos', id: it.id, photos: fresh }] });
  console.log('FATTO', it.id, fresh.length, 'foto');
}
console.log('mappa per tornare indietro:', mapFile);
