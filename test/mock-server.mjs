// Server di prova: usa i VERI handler in api/ con un archivio in memoria e un finto Cloudinary.
// Avvio: APP_CODE=6gfy6gbx node test/mock-server.mjs [porta]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || 8787);
const BASE = `http://localhost:${PORT}`;
process.env.APP_CODE ||= '6gfy6gbx';
process.env.CLOUDINARY_URL = 'cloudinary://mockkey:mocksecret@mockcloud'; // finto: /api/upload vero firma, /cldup controlla la firma

const L = await import(path.join(ROOT, 'api/_lib.js'));
const handlers = {};
for (const n of ['db', 'backup', 'login', 'logout', 'me', 'salute', 'upload']) handlers[n] = (await import(path.join(ROOT, `api/${n}.js`))).default;

// ---- archivio in memoria ----
const files = new Map(); // pathname -> {body:Buffer, type, etag, at}
let etagN = 0;
const stats = { puts: 0, dels: 0, lists: 0 };
L.setPhotoPattern(new RegExp(`^${BASE.replace(/[.:/]/g, (c) => '\\' + c)}/blob/photos/[a-z0-9]{6,16}/[A-Za-z0-9._-]+$`));
L.setStore({
  async getJson(p) { const f = files.get(p); return f ? { data: JSON.parse(f.body.toString()), etag: f.etag } : null; },
  async putJson(p, obj, o = {}) {
    await new Promise((r) => setTimeout(r, 3 + Math.random() * 10));
    const cur = files.get(p);
    if (o.ifMatch && (!cur || cur.etag !== o.ifMatch)) throw new L.Conflict();
    if (o.noOverwrite && cur) throw new L.Conflict();
    stats.puts++;
    files.set(p, { body: Buffer.from(JSON.stringify(obj)), type: 'application/json', etag: 'e' + (++etagN), at: Date.now() });
  },
  async del(urls) { for (const u of urls) { stats.dels++; files.delete(decodeURIComponent(new URL(u).pathname.replace(/^\/blob\//, ''))); } },
  async list(prefix) { stats.lists++; return [...files.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ pathname: k, url: `${BASE}/blob/${k}`, size: v.body.length, uploadedAt: v.at })); },
});

const readBody = (req) => new Promise((r) => { const a = []; req.on('data', (c) => a.push(c)); req.on('end', () => r(Buffer.concat(a))); });
function vres(res) {
  let code = 200;
  return {
    setHeader: (k, v) => res.setHeader(k, /^set-cookie$/i.test(k) ? String(v).replace('; Secure', '') : v), // http://localhost: WebKit scarta i cookie Secure
    status(c) { code = c; return this; },
    json(o) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); },
    send(b) { res.writeHead(code); res.end(b); },
    end(b) { res.writeHead(code); res.end(b); },
  };
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
let failNextUploads = 0;

http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  const p = u.pathname;
  try {
    // --- strumenti di test ---
    if (p === '/__test/state') { const r = await L.readDb({ fresh: true }); res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ db: r.db, files: [...files.keys()], stats })); }
    if (p === '/__test/file') { const f = files.get(u.searchParams.get('p')); res.writeHead(f ? 200 : 404); return res.end(f ? f.body : ''); }
    if (p === '/__test/failUploads') { failNextUploads = +u.searchParams.get('n'); res.writeHead(200); return res.end('ok'); }
    if (p === '/__test/setBackupDay') { const r = await L.readDb({ fresh: true }); r.db.backupDay = '2000-01-01'; await L.setStore; files.get([...files.keys()].find((k) => k.startsWith('data/db-'))).body = Buffer.from(JSON.stringify(r.db)); res.writeHead(200); return res.end('ok'); }

    // --- caricamento diretto (imita https://api.cloudinary.com/v1_1/<cloud>/image/upload) ---
    if (p === '/cldup' && req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST' }); return res.end(); }
    if (p === '/cldup' && req.method === 'POST') {
      const fd = await new Request(BASE + p, { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: await readBody(req) }).formData();
      const file = fd.get('file'), f = Object.fromEntries([...fd].filter(([k]) => k !== 'file'));
      const head = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
      if (failNextUploads > 0) { failNextUploads--; res.writeHead(503, head); return res.end('{"error":"busy"}'); }
      const sig = L.cldSign({ public_id: f.public_id, timestamp: f.timestamp }, 'mocksecret');
      if (f.api_key !== 'mockkey' || f.signature !== sig || !/^photos\/[a-z0-9]{6,16}\/[A-Za-z0-9._-]+$/.test(f.public_id || '') || !file) { res.writeHead(401, head); return res.end('{"error":{"message":"Invalid Signature"}}'); }
      const pathname = `${f.public_id}.${(file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
      if (files.has(pathname)) { res.writeHead(409, head); return res.end('{"error":"exists"}'); }
      stats.puts++;
      files.set(pathname, { body: Buffer.from(await file.arrayBuffer()), type: file.type, etag: 'e' + (++etagN), at: Date.now() });
      res.writeHead(200, head);
      return res.end(JSON.stringify({ secure_url: `${BASE}/blob/${pathname}`, public_id: f.public_id }));
    }
    if (p.startsWith('/blob/')) {
      const f = files.get(decodeURIComponent(p.slice(6)));
      if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': f.type, 'access-control-allow-origin': '*' });
      return res.end(f.body);
    }

    // --- API reali ---
    const m = /^\/api\/(\w+)$/.exec(p);
    if (m && handlers[m[1]]) {
      const raw = await readBody(req);
      const vreq = Object.assign(req, { query: Object.fromEntries(u.searchParams), body: raw.length && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw.toString()) : undefined });
      const r = vres(res);
      if (m[1] === 'upload') { const j = r.json; r.json = (o) => j.call(r, o.endpoint ? { ...o, endpoint: BASE + '/cldup' } : o); } // il permesso vero punta a api.cloudinary.com
      return await handlers[m[1]](vreq, r);
    }

    // --- file statici ---
    let f = path.join(ROOT, 'public', p === '/' ? 'index.html' : p);
    if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'public/index.html');
    if (p.startsWith('/icon')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end(String(e));
  }
}).listen(PORT, () => console.log('mock su', BASE));
