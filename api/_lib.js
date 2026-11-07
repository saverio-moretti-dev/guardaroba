import crypto from 'node:crypto';
import { get, head, put, del, list, BlobPreconditionFailedError } from '@vercel/blob';

// 'x' serve solo ai test locali: in produzione APP_CODE è impostato su Vercel (README § Configurazione).
const secret = () => process.env.APP_CODE || 'x';
const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex');

// ---------- Accesso con codice condiviso ----------
// Accesso libero: chi ha il link usa l'app (nessun codice).
export function authed() { return true; }
export function authedWithCode(req) {
  const m = /(?:^|;\s*)sess=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(hmac('session-v1'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Accesso libero per scelta (README § Nota): il link circola fra persone di fiducia.
// authedWithCode e /api/login restano pronti per riattivare il controllo con codice.
export function guard() {
  return true;
}

export const sessionCookie = () =>
  `sess=${hmac('session-v1')}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;

export function codeOk(code) {
  const a = Buffer.from(String(code || '').trim().toLowerCase());
  const b = Buffer.from(String(process.env.APP_CODE || '').toLowerCase());
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Archivio: interfaccia sostituibile (Vercel Blob in produzione, memoria nei test) ----------
class Conflict extends Error {}

const blobStore = {
  // Le sovrascritture di un file pubblico possono restare vecchie in lettura anche per minuti.
  // Per questo: l'etag vero viene da head() (sempre aggiornato) e il contenuto da una copia
  // immutabile data/<file>.v/<md5>.json, scritta prima di ogni salvataggio (l'etag è l'md5 del contenuto).
  async getJson(pathname, { fresh = false } = {}) {
    if (!fresh) {
      const r = await get(pathname, { access: 'public' });
      if (!r || r.statusCode !== 200) return null;
      return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
    }
    let h;
    countOp('simple');
    try { h = await head(pathname); } catch (e) { if (/not.?found/i.test(String(e.message)) || e.name === 'BlobNotFoundError') return null; throw e; }
    const etag = h.etag;
    const want = String(etag).replace(/^W\//, '').replace(/"/g, '');
    const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');
    if (memoText && md5(memoText) === want) return { data: JSON.parse(memoText), etag };
    const v = await get(`${pathname}.v/${want}.json`, { access: 'public' }).catch(() => null);
    if (v && v.statusCode === 200) { const t = await new Response(v.stream).text(); if (md5(t) === want) return { data: JSON.parse(t), etag }; }
    const r = await get(pathname, { access: 'public' });
    const t = r && r.statusCode === 200 ? await new Response(r.stream).text() : null;
    if (t && md5(t) === want) return { data: JSON.parse(t), etag };
    // Copia non ancora leggibile: si usa la più recente disponibile, ma si scrive contro l'etag vero.
    const best = [t, memoText].filter(Boolean).map((x) => JSON.parse(x)).sort((a, b) => (b.rev || 0) - (a.rev || 0))[0];
    if (!best) throw new Error('dati non leggibili, riprova');
    return { data: best, etag, stale: true };
  },
  async putJson(pathname, obj, { ifMatch, noOverwrite, cacheMaxAge = 60, versioned = false } = {}) {
    const text = JSON.stringify(obj);
    if (versioned) {
      const md5 = crypto.createHash('md5').update(text).digest('hex');
      await put(`${pathname}.v/${md5}.json`, text, { access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 31536000, allowOverwrite: true });
    }
    try {
      await put(pathname, text, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
        cacheControlMaxAge: cacheMaxAge,
        ...(ifMatch ? { ifMatch } : noOverwrite ? { allowOverwrite: false } : { allowOverwrite: true }),
      });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(String(e.message))) throw new Conflict();
      throw e;
    }
  },
  async del(urls) {
    const [cld, blob] = [urls.filter((u) => CLD_RE.test(u)), urls.filter((u) => !CLD_RE.test(u))];
    if (cld.length) await cldDelete(cld);
    if (blob.length) await del(blob);
  },
  async list(prefix) {
    const out = [];
    let cursor;
    do {
      const r = await list({ prefix, cursor, limit: 1000 });
      out.push(...r.blobs.map((b) => ({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt).getTime() })));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  },
};
// ---------- Foto su Cloudinary (piano gratuito, senza carta) ----------
// Vercel Blob Hobby ha sospeso lo store foto il 6/11/2026: con CLOUDINARY_URL impostato le foto nuove vanno su
// Cloudinary; quelle vecchie su Blob restano valide. Formato del pannello: cloudinary://<key>:<secret>@<cloud>
export function cloudinary() {
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@([a-z0-9_-]+)$/i.exec(process.env.CLOUDINARY_URL || '');
  return m && { key: m[1], secret: m[2], cloud: m[3] };
}
export const cldSign = (params, secret) =>
  crypto.createHash('sha1').update(Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&') + secret).digest('hex');
const CLD_RE = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/v\d+\/(photos\/[a-z0-9]{6,16}\/[A-Za-z0-9_-]+)\.[a-z0-9]+$/i;
export async function cldAdmin(path, method = 'GET') {
  const c = cloudinary();
  if (!c) throw new Error('CLOUDINARY_URL mancante');
  const r = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/${path}`, { method, headers: { authorization: 'Basic ' + Buffer.from(`${c.key}:${c.secret}`).toString('base64') } });
  if (!r.ok) throw new Error(`Cloudinary ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function cldDelete(urls) { // Admin API: massimo 100 per chiamata, nessun credito consumato
  const ids = urls.map((u) => CLD_RE.exec(u)[1]);
  for (let i = 0; i < ids.length; i += 100) await cldAdmin('resources/image/upload?' + ids.slice(i, i + 100).map((x) => 'public_ids[]=' + encodeURIComponent(x)).join('&'), 'DELETE');
}

// ---------- Database su Redis (Upstash, piano gratuito: 500.000 comandi/mese) ----------
// Il database stava su Vercel Blob: ogni salvataggio costava 2–4 scritture e il 6/11/2026 ha esaurito le 2.000
// del piano gratuito (archivio sospeso, app ferma). Su Redis i salvataggi non consumano scritture Blob:
// su Blob restano solo le foto (1 scrittura per foto). Redis è coerente: niente copie immutabili né head().
const REDIS_URL = () => (process.env.KV_REST_API_URL || '').replace(/\/$/, '');
async function redis(...cmds) { // pipeline: tutti i comandi in un solo giro
  const r = await fetch(`${REDIS_URL()}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  const out = await r.json();
  for (const x of out) if (x.error) throw new Error(`Redis: ${x.error}`);
  return out.map((x) => x.result);
}
const RK = (p) => `guardaroba:${p}`; // prefisso: il database Redis è condiviso con progetti vecchi
const RIDX = 'guardaroba:__index'; // pathname -> data di scrittura, per elencare i backup
// Scrittura condizionata atomica: ARGV[2] = '*' sempre, '' solo se non esiste, altrimenti l'etag atteso.
const CAS = `local e = redis.call('GET', KEYS[2])
if ARGV[2] == '' then if e then return 0 end elseif ARGV[2] ~= '*' then if e ~= ARGV[2] then return 0 end end
redis.call('SET', KEYS[1], ARGV[1]) redis.call('SET', KEYS[2], ARGV[3]) redis.call('ZADD', KEYS[3], ARGV[4], ARGV[5])
return 1`;
const redisStore = {
  async getJson(pathname) {
    const [[text, etag]] = await redis(['MGET', RK(pathname), `${RK(pathname)}:e`]);
    return text == null ? null : { data: JSON.parse(text), etag: etag || '' };
  },
  async putJson(pathname, obj, { ifMatch, noOverwrite } = {}) {
    const etag = crypto.randomBytes(8).toString('hex');
    const want = ifMatch || (noOverwrite ? '' : '*');
    const [ok] = await redis(['EVAL', CAS, 3, RK(pathname), `${RK(pathname)}:e`, RIDX, JSON.stringify(obj), want, etag, Date.now(), pathname]);
    if (ok !== 1) throw new Conflict();
  },
  async del(urls) {
    const keys = urls.filter((u) => u.startsWith('redis:')).map((u) => u.slice(6));
    if (keys.length) await redis(...keys.flatMap((p) => [['DEL', RK(p), `${RK(p)}:e`], ['ZREM', RIDX, p]]));
    await blobStore.del(urls.filter((u) => !u.startsWith('redis:'))); // foto: del() su Blob è gratuita
  },
  async list(prefix) {
    const [flat] = await redis(['ZRANGE', RIDX, 0, -1, 'WITHSCORES']);
    const rows = [];
    for (let i = 0; i < flat.length; i += 2) if (flat[i].startsWith(prefix)) rows.push({ pathname: flat[i], uploadedAt: Number(flat[i + 1]) });
    if (!rows.length) return [];
    const sizes = await redis(...rows.map((r) => ['STRLEN', RK(r.pathname)]));
    return rows.map((r, i) => ({ ...r, url: `redis:${r.pathname}`, size: sizes[i] }));
  },
};

let store = process.env.KV_REST_API_URL ? redisStore : blobStore;
const onBlob = () => store === blobStore; // solo su Blob i salvataggi consumano scritture del piano gratuito
export const setStore = (s) => { store = s; memo = null; memoText = null; };
export { Conflict };

// ---------- Percorsi (non indovinabili: derivati dal codice) ----------
const DB_PATH = () => `data/db-${hmac('db-path').slice(0, 20)}.json`;
export const BACKUP_PREFIX = () => `data/backup-${hmac('backup-path').slice(0, 16)}/`;
const emptyDb = () => ({ rev: 0, items: {}, settings: {}, trash: { items: {}, photos: [] }, purgeQueue: [] });
const TRASH_DAYS = 30;
const GRACE_DAYS = 14; // dopo l'eliminazione definitiva i file restano ancora 14 giorni: un ripristino li salva
const KEEP_BACKUPS = 60;
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// ---------- Contatore operazioni (piano gratuito Vercel Blob: 2.000 scritture e 10.000 letture al mese) ----------
// Le operazioni fatte senza salvare (letture, permessi di caricamento) si accumulano qui e vengono
// registrate nel database al primo salvataggio successivo.
const pending = { adv: 0, simple: 0, uploads: 0 };
export function countOp(kind, n = 1) { pending[kind] = (pending[kind] || 0) + n; }
const month = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);
function applyUsage(db, extraAdv, now) {
  const m = month(now);
  if (!db.usage || db.usage.month !== m) db.usage = { month: m, adv: 0, simple: 0, uploads: 0, saves: 0 };
  const snap = { ...pending };
  db.usage.adv += snap.adv + extraAdv;
  db.usage.simple += snap.simple;
  db.usage.uploads += snap.uploads;
  db.usage.saves += 1;
  return snap;
}
function clearUsage(snap) { for (const k of Object.keys(snap)) pending[k] -= snap[k]; }
export function liveUsage(db) {
  const m = month();
  const u = db.usage && db.usage.month === m ? db.usage : { month: m, adv: 0, simple: 0, uploads: 0, saves: 0 };
  return { ...u, adv: u.adv + pending.adv, simple: u.simple + pending.simple, uploads: u.uploads + pending.uploads };
}

let memo = null;
let memoText = null; // testo esatto dell'ultima versione scritta/letta da questa istanza
function normalize(db) {
  db.items ||= {};
  db.settings ||= {};
  db.trash ||= {};
  db.trash.items ||= {};
  db.trash.photos ||= [];
  db.purgeQueue ||= [];
  return db;
}

export async function readDb({ fresh = false, allowEmpty = false } = {}) {
  const r = await store.getJson(DB_PATH(), { fresh });
  // Redis vuoto (database appena spostato da Blob): rifiutare invece di mostrare e salvare un archivio vuoto,
  // che sul telefono sostituirebbe la copia locale. Si riempie con Impostazioni → Importa (replaceDb).
  if (!r && store === redisStore && !allowEmpty) throw new Error('Database da ripristinare: Impostazioni → Importa un backup');
  if (!r) return { db: normalize(memo ? structuredClone(memo) : emptyDb()), etag: null };
  const db = normalize(r.data);
  if (!memo || db.rev >= memo.rev) memo = db;
  return { db: fresh ? db : normalize(structuredClone(memo)), etag: r.etag };
}

// Backup giornaliero: copia dello stato PRIMA della prima modifica del giorno; tiene gli ultimi 60.
async function dailyBackup(db) {
  if (db.backupDay === day() || !db.rev) return false;
  try {
    await store.putJson(`${BACKUP_PREFIX()}${day()}.json`, db, { cacheMaxAge: 60 });
    const all = (await store.list(BACKUP_PREFIX())).sort((a, b) => b.pathname.localeCompare(a.pathname));
    const old = all.filter((b) => /\d{4}-\d{2}-\d{2}\.json$/.test(b.pathname)).slice(KEEP_BACKUPS);
    if (old.length) await store.del(old.map((b) => b.url));
    return true;
  } catch (e) {
    console.error('backup', e);
    return false;
  }
}

export async function saveSnapshot(db, label) {
  const name = `${BACKUP_PREFIX()}${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await store.putJson(name, db, { cacheMaxAge: 60 });
  return name;
}

// Applica le modifiche con scrittura condizionata: se l'altro ha salvato nel frattempo, rilegge e riapplica.
export async function writeDb(ops, by, { now = Date.now() } = {}) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const { db, etag } = await readDb({ fresh: true });
    const before = structuredClone(db);
    const purge = applyOps(db, ops, by, now);
    let extra = onBlob() ? 2 : 0; // copia immutabile + file principale
    if (await dailyBackup(before)) { db.backupDay = day(now); if (onBlob()) extra += 2; } // backup + elenco per la pulizia
    db.rev = (db.rev || 0) + 1;
    db.savedAt = now;
    const snap = applyUsage(db, extra, now);
    try {
      await store.putJson(DB_PATH(), db, { versioned: true, ...(etag ? { ifMatch: etag } : { noOverwrite: true }) });
      clearUsage(snap);
      memo = db; memoText = JSON.stringify(db);
      if (purge.length) await store.del(purge).catch((e) => console.error('del', e));
      return db;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      if (onBlob()) countOp('adv', 2); // anche un tentativo rifiutato consuma le scritture
      await new Promise((r) => setTimeout(r, Math.min(2000, 80 * (attempt + 1)) * (0.5 + Math.random())));
    }
  }
  throw new Error('Troppi salvataggi in contemporanea, riprova');
}

// Sostituisce tutto il database (ripristino da backup o da file), salvando prima una copia dello stato attuale.
export async function replaceDb(data, by) {
  const clean = sanitizeImport(data);
  for (let attempt = 0; attempt < 6; attempt++) {
    const { db, etag } = await readDb({ fresh: true, allowEmpty: true });
    await saveSnapshot(db, 'prima-del-ripristino');
    // Le foto che il ripristino non usa più non vengono perse subito: entrano in eliminazione differita.
    const used = referencedUrls(clean);
    const queued = new Map((db.purgeQueue || []).map((q) => [q.url, q]));
    for (const p of allPhotos(db)) if (!used.has(p.url) && !queued.has(p.url)) queued.set(p.url, { url: p.url, size: p.size, due: Date.now() + GRACE_DAYS * 864e5 });
    clean.purgeQueue = [...queued.values()].filter((q) => !used.has(q.url));
    // il numero di versione non scende mai: i telefoni scartano come «vecchia» una risposta con rev più basso
    clean.rev = Math.max(db.rev || 0, Number(data && data.rev) || 0) + 1;
    clean.savedAt = Date.now();
    clean.backupDay = db.backupDay;
    clean.restoredBy = by || '';
    clean.usage = db.usage;
    const snap = applyUsage(clean, onBlob() ? 3 : 0, Date.now());
    try {
      await store.putJson(DB_PATH(), clean, { versioned: true, ...(etag ? { ifMatch: etag } : { noOverwrite: true }) });
      clearUsage(snap);
      memo = clean; memoText = JSON.stringify(clean);
      return clean;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
  throw new Error('Ripristino non riuscito, riprova');
}

export async function listBackups() {
  if (onBlob()) countOp('adv');
  const all = await store.list(BACKUP_PREFIX());
  return all
    .map((b) => ({ name: b.pathname.slice(BACKUP_PREFIX().length), size: b.size, at: b.uploadedAt }))
    .sort((a, b) => b.at - a.at);
}
export async function readBackup(name) {
  if (!/^[a-z0-9-]+\.json$/i.test(name)) throw new Error('nome backup non valido');
  const r = await store.getJson(`${BACKUP_PREFIX()}${name}`, { fresh: true });
  if (!r) throw new Error('backup non trovato');
  return r.data;
}

// ---------- Logica dei dati (pura, testabile) ----------
const ITEM_FIELDS = [
  'title', 'description', 'category', 'brand', 'size', 'condition', 'colors', 'material',
  'measures', 'price', 'parcel', 'cost', 'location', 'owner', 'notes', 'status',
  'vintedUrl', 'soldPrice', 'soldAt', 'publishedAt', 'draftAt', 'queue',
];
const SETTINGS_KEYS = ['vintedProfile', 'redripNote', 'defaultParcel', 'descFooter', 'hashtags'];

const isId = (s) => typeof s === 'string' && /^[a-z0-9]{6,16}$/.test(s);
const PHOTO_RE = /^https:\/\/(?:[a-z0-9.-]+\.public\.blob\.vercel-storage\.com|res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\/v\d+)\/photos\/[a-z0-9]{6,16}\/[A-Za-z0-9._-]+$/i;
let photoRe = PHOTO_RE;
export const setPhotoPattern = (re) => { photoRe = re; };
export const isPhotoUrl = (u) => typeof u === 'string' && photoRe.test(u);
const cleanPhoto = (p) => {
  if (!p || !isPhotoUrl(p.url)) return null;
  const o = { url: p.url };
  if (Number.isFinite(p.size) && p.size > 0) o.size = Math.round(p.size);
  return o;
};

function allPhotos(db) {
  const out = [];
  for (const it of Object.values(db.items || {})) out.push(...(it.photos || []));
  for (const it of Object.values((db.trash || {}).items || {})) out.push(...(it.photos || []));
  out.push(...((db.trash || {}).photos || []));
  return out;
}
function referencedUrls(db) { return new Set(allPhotos(db).map((p) => p.url)); }

export function applyOps(db, ops, by, now = Date.now()) {
  normalize(db);
  const T = db.trash;
  const toTrash = (photos, itemId) => {
    const have = new Set(T.photos.map((p) => p.url));
    for (const p of photos) if (p && !have.has(p.url)) T.photos.push({ ...p, itemId: itemId || null, at: now });
  };
  const purgeSet = new Map(); // url -> size
  const sizeOf = (url) => (allPhotos(db).find((p) => p.url === url) || {}).size;

  for (const op of ops || []) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'settings') {
      for (const k of SETTINGS_KEYS) if (op.data && op.data[k] !== undefined) db.settings[k] = String(op.data[k]).slice(0, 500);
      continue;
    }
    if (op.op === 'trashPhotos') { // foto mai salvate in un articolo (cartella scartata): finiscono nel cestino
      toTrash((op.photos || []).map(cleanPhoto).filter(Boolean), isId(op.id) ? op.id : null);
      continue;
    }
    if (op.op === 'restorePhoto') {
      const i = T.photos.findIndex((p) => p.url === op.url);
      if (i < 0) continue;
      const p = T.photos[i];
      const target = db.items[isId(op.id) ? op.id : p.itemId];
      if (!target) continue;
      T.photos.splice(i, 1);
      if (!target.photos.some((x) => x.url === p.url)) target.photos.push(cleanPhoto(p));
      target.updatedAt = now;
      continue;
    }
    if (op.op === 'purge') { // eliminazione definitiva dal cestino
      for (const id of op.ids || []) {
        const it = T.items[id];
        if (!it) continue;
        for (const p of it.photos || []) purgeSet.set(p.url, p.size);
        delete T.items[id];
      }
      for (const u of op.urls || []) {
        const i = T.photos.findIndex((p) => p.url === u);
        if (i >= 0) { purgeSet.set(u, T.photos[i].size); T.photos.splice(i, 1); }
      }
      continue;
    }
    if (op.op === 'emptyTrash') {
      for (const it of Object.values(T.items)) for (const p of it.photos || []) purgeSet.set(p.url, p.size);
      for (const p of T.photos) purgeSet.set(p.url, p.size);
      T.items = {}; T.photos = [];
      continue;
    }
    if (op.op === 'restore') {
      const it = T.items[op.id];
      if (!it || db.items[op.id]) continue;
      delete it.deletedAt; delete it.deletedBy;
      it.updatedAt = now;
      db.items[op.id] = it;
      delete T.items[op.id];
      continue;
    }
    if (!isId(op.id)) continue;
    if (op.op === 'delete') { // non si cancella mai subito: va nel cestino per 30 giorni
      const it = db.items[op.id];
      if (!it) continue;
      it.deletedAt = now; it.deletedBy = by || '';
      T.items[op.id] = it;
      delete db.items[op.id];
      continue;
    }
    let it = db.items[op.id];
    if (!it) {
      if (op.op !== 'upsert' && op.op !== 'addPhotos') continue;
      if (T.items[op.id]) continue; // l'articolo è nel cestino: va prima ripristinato
      it = db.items[op.id] = { id: op.id, createdAt: now, createdBy: by || '', status: 'foto', photos: [] };
    }
    if (op.op === 'upsert') {
      for (const f of ITEM_FIELDS) if (op.data && op.data[f] !== undefined) it[f] = op.data[f];
    } else if (op.op === 'addPhotos') {
      const have = new Set(it.photos.map((p) => p.url));
      for (const p of (op.photos || []).map(cleanPhoto)) if (p && !have.has(p.url)) { it.photos.push(p); have.add(p.url); }
    } else if (op.op === 'setPhotos') { // riordino o rimozione: le foto tolte vanno nel cestino
      const byUrl = new Map(it.photos.map((p) => [p.url, p]));
      const next = [];
      for (const p of op.photos || []) if (p && byUrl.has(p.url) && !next.some((x) => x.url === p.url)) next.push(byUrl.get(p.url));
      const kept = new Set(next.map((p) => p.url));
      toTrash(it.photos.filter((p) => !kept.has(p.url)), it.id);
      it.photos = next;
    } else continue;
    it.updatedAt = now;
    it.updatedBy = by || '';
  }

  // Pulizia automatica del cestino dopo 30 giorni
  const limit = now - TRASH_DAYS * 864e5;
  for (const [id, it] of Object.entries(T.items)) if ((it.deletedAt || 0) < limit) { for (const p of it.photos || []) purgeSet.set(p.url, p.size); delete T.items[id]; }
  T.photos = T.photos.filter((p) => { if ((p.at || 0) < limit) { purgeSet.set(p.url, p.size); return false; } return true; });

  // Le foto eliminate definitivamente entrano in coda: il file sparisce solo dopo GRACE_DAYS.
  const ref = referencedUrls(db);
  const queue = new Map(db.purgeQueue.map((q) => [q.url, q]));
  for (const [url, size] of purgeSet) if (!queue.has(url) && isPhotoUrl(url)) queue.set(url, { url, size: size || sizeOf(url), due: now + GRACE_DAYS * 864e5 });
  // una foto tornata in uso (ripristino) viene salvata dalla coda
  for (const url of [...queue.keys()]) if (ref.has(url)) queue.delete(url);
  const due = [];
  for (const [url, q] of queue) if ((q.due || 0) <= now) { due.push(url); queue.delete(url); }
  db.purgeQueue = [...queue.values()];
  return due;
}

export function sanitizeImport(data) {
  if (!data || typeof data !== 'object' || typeof data.items !== 'object') throw new Error('file di backup non valido');
  const out = emptyDb();
  for (const [id, it] of Object.entries(data.items || {})) {
    if (!isId(id) || !it || typeof it !== 'object') continue;
    const n = { id, createdAt: Number(it.createdAt) || Date.now(), createdBy: String(it.createdBy || ''), photos: (it.photos || []).map(cleanPhoto).filter(Boolean) };
    for (const f of ITEM_FIELDS) if (it[f] !== undefined) n[f] = it[f];
    if (it.updatedAt) n.updatedAt = Number(it.updatedAt);
    out.items[id] = n;
  }
  for (const k of SETTINGS_KEYS) if (data.settings && data.settings[k] !== undefined) out.settings[k] = String(data.settings[k]).slice(0, 500);
  const t = data.trash || {};
  for (const [id, it] of Object.entries(t.items || {})) if (isId(id) && it && !out.items[id]) out.trash.items[id] = { ...it, photos: (it.photos || []).map(cleanPhoto).filter(Boolean) };
  for (const p of t.photos || []) { const c = cleanPhoto(p); if (c) out.trash.photos.push({ ...c, itemId: isId(p.itemId) ? p.itemId : null, at: Number(p.at) || Date.now() }); }
  for (const q of data.purgeQueue || []) { const c = cleanPhoto(q); if (c) out.purgeQueue.push({ ...c, due: Number(q.due) || Date.now() + GRACE_DAYS * 864e5 }); }
  return out;
}

// ---------- Utilità ----------
export async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

