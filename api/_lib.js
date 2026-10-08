import crypto from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const secret = () => process.env.APP_CODE || 'x';
const hmac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex');

// ---------- Accesso con codice condiviso ----------
export function authed(req) {
  const m = /(?:^|;\s*)sess=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(hmac('session-v1'));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function guard(req, res) {
  if (!authed(req)) {
    res.status(401).json({ error: 'auth' });
    return false;
  }
  return true;
}

export const sessionCookie = () =>
  `sess=${hmac('session-v1')}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;

export function codeOk(code) {
  const a = Buffer.from(String(code || '').trim().toLowerCase());
  const b = Buffer.from(String(process.env.APP_CODE || '').toLowerCase());
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Archivio dati: un solo file JSON nel Blob ----------
// Nome non indovinabile, derivato dal codice.
const DB_PATH = () => `data/db-${hmac('db-path').slice(0, 20)}.json`;
const emptyDb = () => ({ rev: 0, items: {}, settings: {} });

// Ultima versione vista da questa istanza (riduce le letture non in cache).
let memo = null;

async function streamText(stream) {
  return await new Response(stream).text();
}

export async function readDb({ fresh = false } = {}) {
  const r = await get(DB_PATH(), { access: 'public', useCache: !fresh });
  if (!r || r.statusCode !== 200) return { db: memo || emptyDb(), etag: null };
  const db = JSON.parse(await streamText(r.stream));
  if (!memo || db.rev >= memo.rev) memo = db;
  return { db: fresh ? db : memo, etag: r.blob.etag };
}

// Applica le modifiche con scrittura condizionata: se l'altro ha salvato nel frattempo, rilegge e riapplica.
export async function writeDb(ops, by) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { db, etag } = await readDb({ fresh: true });
    applyOps(db, ops, by);
    db.rev = (db.rev || 0) + 1;
    db.savedAt = Date.now();
    try {
      await put(DB_PATH(), JSON.stringify(db), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      memo = db;
      return db;
    } catch (e) {
      const conflict =
        e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(String(e.message));
      if (!conflict) throw e;
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 400));
    }
  }
  throw new Error('Troppi salvataggi in contemporanea, riprova');
}

const ITEM_FIELDS = [
  'title', 'description', 'category', 'brand', 'size', 'condition', 'colors', 'material',
  'measures', 'price', 'parcel', 'cost', 'location', 'owner', 'notes', 'status',
  'vintedUrl', 'soldPrice', 'soldAt', 'publishedAt', 'draftAt', 'queue',
];

const isId = (s) => typeof s === 'string' && /^[a-z0-9]{6,16}$/.test(s);
const isPhoto = (p) =>
  p && typeof p.url === 'string' && /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\/photos\//i.test(p.url);

function applyOps(db, ops, by) {
  db.items ||= {};
  db.settings ||= {};
  for (const op of ops || []) {
    if (op.op === 'settings') {
      for (const k of ['vintedProfile', 'redripNote']) if (op.data && op.data[k] !== undefined) db.settings[k] = String(op.data[k]).slice(0, 500);
      continue;
    }
    if (!isId(op.id)) continue;
    const now = Date.now();
    if (op.op === 'delete') {
      delete db.items[op.id];
      continue;
    }
    let it = db.items[op.id];
    if (!it) {
      if (op.op !== 'upsert' && op.op !== 'addPhotos') continue;
      it = db.items[op.id] = { id: op.id, createdAt: now, createdBy: by || '', status: 'foto', photos: [] };
    }
    if (op.op === 'upsert') {
      // Unione per campo: due persone che modificano campi diversi non si sovrascrivono.
      for (const f of ITEM_FIELDS) if (op.data && op.data[f] !== undefined) it[f] = op.data[f];
    } else if (op.op === 'addPhotos') {
      const have = new Set(it.photos.map((p) => p.url));
      for (const p of op.photos || []) if (isPhoto(p) && !have.has(p.url)) it.photos.push({ url: p.url });
    } else if (op.op === 'setPhotos') {
      const have = new Set(it.photos.map((p) => p.url));
      it.photos = (op.photos || []).filter((p) => isPhoto(p) && have.has(p.url)).map((p) => ({ url: p.url }));
    }
    it.updatedAt = now;
    it.updatedBy = by || '';
  }
}

// ---------- Utilità ----------
export async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export const isBlobUrl = (u) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && x.hostname.endsWith('.public.blob.vercel-storage.com') && x.pathname.startsWith('/photos/');
  } catch {
    return false;
  }
};
