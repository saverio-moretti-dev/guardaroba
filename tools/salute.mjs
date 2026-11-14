// Salute dell'app online, SOLA LETTURA: consumi dei piani gratuiti, foto raggiungibili, codice online uguale a public/.
// Uso: npm run salute   (APP_URL e APP_CODE in .env.local, come gli strumenti in tools/vinted-import)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(REPO, '.env.local')); } catch {}
const APP = (process.env.APP_URL || '').replace(/\/$/, '');
if (!APP) throw new Error('manca APP_URL in .env.local');
const COOKIE = `sess=${crypto.createHmac('sha256', process.env.APP_CODE || '').update('session-v1').digest('hex')}`;
const CLD = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\//i;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let bad = 0;
const line = (ok, name, info = '') => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'NO  '} ${name}${info ? ' — ' + info : ''}`); };
line(!!process.env.APP_CODE, 'APP_CODE in .env.local', process.env.APP_CODE ? '' : 'manca: con il codice d\'accesso online le API risponderanno 401');

// 1. consumi (Cloudinary, Redis, app)
const s = await fetch(APP + '/api/salute', { headers: { cookie: COOKIE } });
if (s.status === 404) line(false, '/api/salute', '404: non ancora online (manca il deploy)');
else if (!s.ok) line(false, '/api/salute', 'http ' + s.status);
else {
  const j = await s.json();
  line(j.ok, '/api/salute', `picco Cloudinary ${j.maxPct ?? '?'} % (avviso al ${j.warnAt} %)${j.errors.length ? ', errori: ' + j.errors.join('; ') : ''}`);
  console.log(JSON.stringify({ cloudinary: j.cloudinary, redis: j.redis, app: j.app }, null, 2));
}

// 2. foto dell'archivio: tutte su Cloudinary e raggiungibili
const r = await fetch(APP + '/api/db', { headers: { cookie: COOKIE } });
if (!r.ok) line(false, 'archivio', 'http ' + r.status);
else {
  const db = await r.json();
  const urls = [];
  for (const it of Object.values(db.items || {})) for (const p of it.photos || []) urls.push({ url: p.url, id: it.id });
  const foreign = urls.filter((u) => !CLD.test(u.url));
  line(!foreign.length, 'foto solo su Cloudinary', `${urls.length - foreign.length}/${urls.length}` + (foreign.length ? `; fuori: ${foreign.length} in ${new Set(foreign.map((u) => u.id)).size} schede (${[...new Set(foreign.map((u) => u.id))].slice(0, 8).join(', ')}…)` : ''));
  const broken = [];
  const todo = urls.filter((u) => CLD.test(u.url));
  await Promise.all(Array.from({ length: 8 }, async () => { // HEAD: nessun byte d'immagine scaricato
    for (let u; (u = todo.shift());) {
      try { const h = await fetch(u.url, { method: 'HEAD' }); if (!h.ok || !/^image\//.test(h.headers.get('content-type') || '')) broken.push(`${u.id} ${h.status}`); }
      catch (e) { broken.push(`${u.id} ${e.message}`); }
    }
  }));
  line(!broken.length, 'foto Cloudinary raggiungibili (200 + image/*)', broken.length ? `${broken.length} rotte: ${broken.slice(0, 8).join(', ')}` : '');
}

// 3. file online uguali a public/
const diff = [];
for (const f of fs.readdirSync(path.join(REPO, 'public'))) {
  const o = await fetch(`${APP}/${f}`);
  if (!o.ok || sha(Buffer.from(await o.arrayBuffer())) !== sha(fs.readFileSync(path.join(REPO, 'public', f)))) diff.push(`${f}${o.ok ? '' : ' ' + o.status}`);
}
line(!diff.length, 'online = public/ locale', diff.length ? 'diversi: ' + diff.join(', ') : '');

console.log(bad ? `\n${bad} controlli non a posto` : '\nTutto a posto');
process.exit(bad ? 1 : 0);
