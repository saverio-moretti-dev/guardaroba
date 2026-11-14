// Collaudo dell'app contro test/mock-server.mjs (handler veri, archivio in memoria, finto Cloudinary).
// Gira su WebKit con iPhone 13 (come Safari sul telefono) e su Chromium 390 px, poi lancia reorder-check.
// Uso: npm run collaudo   (PW=<cartella playwright-core>, WEBKIT=<pw_run.sh>, CHROME=<eseguibile> per cambiarli)
// Il service worker è bloccato: qui si prova la pagina; la coda del service worker resta da provare a mano.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = process.env.HOME;
const require = createRequire(import.meta.url);
const { webkit, chromium, devices } = require(process.env.PW || `${HOME}/.claude/skills/mobile-responsive/node_modules/playwright-core`);
const WEBKIT = process.env.WEBKIT || `${HOME}/Library/Caches/ms-playwright/webkit-2386/pw_run.sh`; // il playwright-core installato cerca 2388
const CHROME = process.env.CHROME || `${HOME}/Library/Caches/ms-playwright/chromium-1252/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const PORT = 8799, BASE = `http://localhost:${PORT}`, CODE = 'collaudo1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`); };
async function until(fn, ms = 8000) { const t = Date.now(); let v; while (Date.now() - t < ms) { if ((v = await fn())) return v; await sleep(150); } return v; }

const srv = spawn('node', ['test/mock-server.mjs', String(PORT)], { env: { ...process.env, APP_CODE: CODE }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r) => srv.stdout.once('data', r));
const state = async () => (await fetch(`${BASE}/__test/state`)).json();

// archivio di partenza: 30 schede (servono per reorder-check), una con una foto del vecchio Blob bloccato
const cookie = (await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: CODE }) })).headers.get('set-cookie').split(';')[0];
const ops = Array.from({ length: 30 }, (_, i) => ({ op: 'upsert', id: 'collaudo' + String(i).padStart(2, '0'), data: { title: `Capo di prova ${i}`, brand: 'Prova', status: 'compilare' } }));
ops.push({ op: 'addPhotos', id: 'collaudo29', photos: [{ url: `${BASE}/blob/photos/collaudo29/bloccata.jpg`, size: 22 }] });
const seed = await fetch(`${BASE}/api/db`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ ops, by: 'collaudo' }) });
if (!seed.ok) { console.log('archivio di prova non creato:', seed.status, await seed.text()); srv.kill(); process.exit(1); }

async function run(label, browserType, launch, ctxOpts, id) {
  console.log(`\n== ${label} ==`);
  const browser = await browserType.launch(launch);
  const ctx = await browser.newContext({ ...ctxOpts, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  // Web Share finto (in headless non apre un vero menu): calcola l'impronta dei file ricevuti. Su Chromium non serve: «Salva» scarica.
  if (browserType === webkit) await page.addInitScript(() => {
    navigator.canShare = (d) => !!(d && d.files);
    navigator.share = async (d) => { window.__shared = await Promise.all(d.files.map(async (f) => ({ name: f.name, size: f.size, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('') }))); };
  });
  await page.route(`${BASE}/blob/photos/collaudo29/**`, (r) => r.fulfill({ status: 403, body: 'Store is blocked' })); // come lo store Blob sospeso
  const toasts = () => page.evaluate(() => window.__toasts || []);

  try {
    await page.goto(BASE + '/'); await sleep(800);
    await page.evaluate(() => { const t = toast; window.__toasts = []; window.toast = (m) => { window.__toasts.push(m); return t(m); }; });
    const locked = await page.evaluate(async () => ({ api: (await fetch('/api/db')).status, authed: S.authed }));
    check('senza codice resta bloccata', locked.api === 401 && locked.authed === false, `api ${locked.api}, authed ${locked.authed}`);

    await page.evaluate(() => settingsSheet());
    await page.fill('#s_code', 'sbagliato'); await page.tap('[data-a="activate"]'); await sleep(1500);
    const bad = await page.evaluate(() => ({ authed: S.authed, err: (document.querySelector('#s_err') || {}).textContent }));
    check('codice errato resta bloccata', bad.authed === false && !!bad.err, `authed ${bad.authed}, messaggio «${bad.err}»`);

    await page.fill('#s_code', CODE); await page.tap('[data-a="activate"]');
    const ok = await until(() => page.evaluate(() => S.authed && S.db.items.collaudo00 ? true : false));
    check('codice giusto sblocca e carica l\'archivio', !!ok);
    await page.evaluate(() => document.querySelectorAll('.sheet,.sheet-bg,[class*=sheet]').forEach((e) => e.remove()));

    // caricamento di una foto dalla galleria nella scheda
    const jpeg = Buffer.from(await page.evaluate(async () => {
      const c = Object.assign(document.createElement('canvas'), { width: 64, height: 48 }); const g = c.getContext('2d');
      g.fillStyle = '#3a6'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#fff'; g.fillRect(8, 8, 20, 20);
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); return [...new Uint8Array(await b.arrayBuffer())];
    }));
    await page.evaluate((i) => openEdit(i), id); await sleep(300);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.tap('[data-act="gal-item"]')]);
    await chooser.setFiles({ name: 'prova.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    const st = await until(async () => { const s = await state(); return (s.db.items[id].photos || []).length && s.files.some((f) => f.startsWith(`photos/${id}/`)) ? s : null; }, 15000);
    const photo = st && st.db.items[id].photos[0];
    const stored = photo && Buffer.from(await (await fetch(`${BASE}/__test/file?p=${encodeURIComponent(photo.url.replace(`${BASE}/blob/`, ''))}`)).arrayBuffer());
    check('foto caricata finisce nella scheda e nel deposito', !!(stored && stored.length > 100 && stored[0] === 0xff && stored[1] === 0xd8), photo ? `${photo.url.replace(BASE, '')}, ${stored.length} byte` : 'nessuna foto');
    await until(() => page.evaluate((i) => (S.db.items[i].photos || []).length > 0, id));

    // «Scarica tutto»: i file che arrivano al telefono sono identici alla foto in archivio
    await page.evaluate((i) => { go('items'); openEdit(i); }, id); await sleep(300);
    if (browserType === webkit) {
      await page.tap('[data-act="dl"]');
      const go = await until(() => page.$('[data-s="go"]'));
      if (go) await go.tap();
      const shared = await until(() => page.evaluate(() => window.__shared));
      check('Scarica tutto (iPhone): file uguali all\'archivio', !!(shared && shared.length === 1 && shared[0].hash === sha(stored)), shared ? `${shared[0].name}, ${shared[0].size} byte` : 'nessun file condiviso, avvisi: ' + (await toasts()).join(' / '));
    } else {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.tap('[data-act="dl"]')]);
      const got = dl && fs.readFileSync(await dl.path());
      check('Scarica tutto (Chromium): file uguale all\'archivio', !!(got && sha(got) === sha(stored)), dl ? `${dl.suggestedFilename()}, ${got.length} byte` : 'nessun download');
    }

    // foto del vecchio Blob (403): messaggio chiaro, nessun file al telefono
    await page.evaluate(() => { window.__shared = null; window.__toasts = []; go('items'); openEdit('collaudo29'); }); await sleep(300);
    let dl403 = null; page.once('download', (d) => { dl403 = d; });
    await page.tap('[data-act="dl"]');
    const msg = await until(async () => (await toasts()).find((t) => /non disponibili/.test(t)) || '', 6000);
    await sleep(800);
    const sent = await page.evaluate(() => window.__shared);
    check('foto 403: messaggio e nessun file', !!msg && !sent && !dl403, `«${msg || (await toasts()).join(' / ')}»${sent ? ', file condivisi!' : ''}${dl403 ? ', download partito!' : ''}`);

    // modifica offline: resta in coda e si salva al ritorno della rete
    await page.evaluate(() => { go('items'); openEdit('collaudo05'); }); await sleep(300);
    await ctx.setOffline(true);
    const note = 'scritta offline ' + label;
    await page.fill('#f_description', note); await page.locator('#f_description').blur(); await sleep(1500);
    const before = (await state()).db.items.collaudo05.description;
    await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const after = await until(async () => (await state()).db.items.collaudo05.description === note, 10000);
    check('modifica offline salvata al ritorno online', before !== note && !!after, `prima ${JSON.stringify(before || '')}, dopo ${after ? 'salvata' : 'non salvata'}`);

    check('nessun errore JavaScript', !errors.length, errors.join(' | '));
  } catch (e) {
    check('esecuzione', false, e.message.split('\n')[0]);
  }
  await browser.close();
}

await run('WebKit · iPhone 13', webkit, { executablePath: WEBKIT }, devices['iPhone 13'], 'collaudo01');
await run('Chromium · 390 px', chromium, { executablePath: CHROME }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'collaudo02');

// lista ferma e ritorno allo stesso punto, sull'archivio di prova
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'collaudo-')), 'db.json');
fs.writeFileSync(dbFile, JSON.stringify((await state()).db));
srv.kill();
console.log('\n== reorder-check ==');
const rc = spawnSync('node', ['test/reorder-check.mjs'], { env: { ...process.env, DB: dbFile, CHROME }, stdio: 'inherit' });
results.push(rc.status === 0);

const fails = results.filter((r) => !r).length;
console.log(`\n${fails ? 'FAIL' : 'PASS'}: ${results.length - fails}/${results.length}`);
process.exit(fails ? 1 : 0);
