// Allinea cartella vinted-articoli/ e app Guardaroba agli annunci ATTIVI del proprio profilo Vinted. Vinted comanda.
// Ingressi: vinted-articoli/elenco.json (da elenco.js; preso da ~/Downloads/vinted-elenco.json se c'è) e le cartelle
// <idVinted>-<slug>/ con testo.txt + 01.jpg... (da estrai.js + salva_articolo.py).
// Uso (dalla cartella della repo):
//   node tools/vinted-import/allinea.mjs --diff   quali annunci vanno (ri)scaricati: nuovi o con titolo cambiato
//   node tools/vinted-import/allinea.mjs --dry    cosa cambierebbe nell'app, senza scrivere
//   node tools/vinted-import/allinea.mjs [id...]  scrive nell'app (tutti, o solo gli id Vinted indicati)
// Non cancella e non tocca mai articoli dell'app che non corrispondono a un annuncio attivo: li elenca e basta.
import { readdir, readFile, rename, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
try { process.loadEnvFile(join(REPO, '.env.local')); } catch {} // APP_URL sta qui: la repo è pubblica
const APP = process.env.APP_URL;
if (!APP) throw new Error('manca APP_URL: crea .env.local nella repo con APP_URL=https://<app>.vercel.app');
const ROOT = join(REPO, 'vinted-articoli');
const ELENCO = join(ROOT, 'elenco.json');
const args = process.argv.slice(2);
const diff = args.includes('--diff'), dry = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('--'));

const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(-12); // come public/app1.js
const norm = (s) => String(s || '').trim().toLowerCase();
const vid = (url) => (String(url || '').match(/items\/(\d+)/) || [])[1];
const price = (p) => String(p || '').replace(/[^\d,]/g, '').replace(/,00$/, '').replace(',', '.');

async function api(path, body) {
  const r = await fetch(APP + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return r.json();
}

// elenco fresco scaricato dal browser → dentro la repo
const dl = join(homedir(), 'Downloads', 'vinted-elenco.json');
if (await access(dl).then(() => true, () => false)) await rename(dl, ELENCO);
const elenco = JSON.parse(await readFile(ELENCO, 'utf8'));
if (elenco.total && elenco.total !== elenco.items.length) throw new Error(`elenco incompleto: ${elenco.items.length} su ${elenco.total}, rilanciare elenco.js`);
console.log(`Elenco Vinted del ${elenco.at}: ${elenco.items.length} annunci attivi`);

// cartelle per id Vinted
const folders = new Map();
for (const d of await readdir(ROOT, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const dir = join(ROOT, d.name);
  const [title, ...rest] = (await readFile(join(dir, 'testo.txt'), 'utf8')).split('\n\n');
  const photos = (await readdir(dir)).filter((f) => /^\d+\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
  folders.set(d.name.split('-')[0], { dir, name: d.name, title, description: rest.join('\n\n').replace(/\n$/, ''), photos });
}

if (diff) {
  const todo = elenco.items.filter((v) => !folders.has(v.id) || norm(folders.get(v.id).title) !== norm(v.title));
  for (const v of todo) console.log(`https://www.vinted.it/items/${v.id}  ${folders.has(v.id) ? 'TITOLO CAMBIATO' : 'NUOVO'}  ${v.title}`);
  const gone = [...folders.keys()].filter((id) => !elenco.items.some((v) => v.id === id));
  for (const id of gone) console.log(`cartella non più attiva su Vinted (non toccata): ${folders.get(id).name}`);
  console.log(`\nDa scaricare: ${todo.length}`);
  process.exit(0);
}

const db = await api('/api/db');
const items = Object.values(db.items);
const linked = new Map(items.filter((i) => vid(i.vintedUrl)).map((i) => [vid(i.vintedUrl), i]));
const used = new Set([...linked.values()].map((i) => i.id));
let nNew = 0, nUpd = 0, nSame = 0, nMiss = 0;

for (const v of elenco.items) {
  if (only.length && !only.includes(v.id)) continue;
  const f = folders.get(v.id);
  if (!f || norm(f.title) !== norm(v.title)) { console.log(`MANCA CARTELLA AGGIORNATA (lanciare --diff): ${v.title}`); nMiss++; continue; }
  // abbinamento: prima il link Vinted salvato, poi (una volta sola) il titolo esatto; poi il link resta salvato
  let it = linked.get(v.id) || items.find((i) => !used.has(i.id) && !vid(i.vintedUrl) && norm(i.title) === norm(f.title));
  if (it) used.add(it.id);
  const want = { title: f.title, description: f.description, status: 'online', vintedUrl: `https://www.vinted.it/items/${v.id}`, price: price(v.price) };
  if (!it?.publishedAt) want.publishedAt = Date.now();
  const changed = Object.keys(want).filter((k) => k !== 'publishedAt' && String(it?.[k] ?? '') !== String(want[k]));
  // foto: si rifanno solo se il numero è diverso (ogni foto costa una scrittura sul piano gratuito)
  const redoPhotos = !it || (it.photos || []).length !== f.photos.length;
  if (it && !changed.length && !redoPhotos) { nSame++; continue; }
  const what = it ? `AGGIORNO ${changed.join(',')}${redoPhotos ? `,foto ${(it.photos || []).length}→${f.photos.length}` : ''}` : `NUOVO ${f.photos.length} foto`;
  if (dry) { console.log(`[prova] ${what}: ${f.title}`); it ? nUpd++ : nNew++; continue; }

  const id = it ? it.id : newId();
  const uploaded = [];
  if (redoPhotos) for (const name of f.photos) {
    const buf = await readFile(join(f.dir, name));
    const type = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const t = await api('/api/upload', { item: id, contentType: type, size: buf.length });
    // Cloudinary (fields → POST multipart) o Blob (headers → PUT), come foto-cloudinary.mjs
    let r;
    if (t.fields) { const fd = new FormData(); for (const [k, v] of Object.entries(t.fields)) fd.append(k, v); fd.append('file', new Blob([buf], { type })); r = await fetch(t.endpoint, { method: 'POST', body: fd }); }
    else r = await fetch(t.endpoint, { method: 'PUT', headers: t.headers, body: buf });
    if (!r.ok) throw new Error(`foto ${name} rifiutata (${r.status} ${await r.text()}) in ${f.name}`);
    const j = await r.json();
    uploaded.push({ url: j.secure_url || j.url, size: buf.length });
  }
  // un solo salvataggio per articolo; le foto vecchie sostituite vanno nel cestino dell'app (30 giorni)
  const ops = [{ op: 'upsert', id, data: it ? want : { ...want, owner: '' } }];
  if (it && redoPhotos) ops.push({ op: 'setPhotos', id, photos: [] });
  if (redoPhotos) ops.push({ op: 'addPhotos', id, photos: uploaded });
  await api('/api/db', { by: 'allinea-vinted', ops });
  console.log(`OK ${what}: ${f.title}`);
  it ? nUpd++ : nNew++;
}

// articoli dell'app «Pubblicata» senza annuncio attivo corrispondente: solo segnalati (venduti/tolti: decide l'utente)
const orphans = only.length ? [] : items.filter((i) => i.status === 'online' && !used.has(i.id));
for (const i of orphans) console.log(`IN APP «Pubblicata» MA NON ATTIVO SU VINTED (non toccato): ${i.title || i.id}`);
console.log(`\nNuovi ${nNew}, aggiornati ${nUpd}, già in pari ${nSame}, senza cartella ${nMiss}${dry ? ' (prova, nulla scritto)' : ''}`);
