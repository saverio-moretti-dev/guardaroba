// Prova: un aggiornamento in background (pull) non deve spostare le righe della lista sotto il dito.
// Telefono 390 px con tocco; archivio finto servito da page.route, nessuna rete vera.
// Uso: DB=<archivio.json> node test/reorder-check.mjs   (PW=<cartella playwright-core>, CHROME=<eseguibile> per cambiarli)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = process.env.HOME;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || `${HOME}/.claude/skills/mobile-responsive/node_modules/playwright-core`);
const CHROME = process.env.CHROME || `${HOME}/Library/Caches/ms-playwright/chromium-1252/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
let db = JSON.parse(fs.readFileSync(process.env.DB, 'utf8'));

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname !== 'guardaroba.test') return r.abort(); // immagini Cloudinary/Blob: misure fisse in CSS, non servono
  if (u.pathname === '/api/db') return r.fulfill({ json: db });
  if (u.pathname.startsWith('/api/')) return r.fulfill({ json: {} });
  const f = path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname);
  return fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' });
});
await page.goto('http://guardaroba.test/'); await page.waitForTimeout(500);
await page.tap('[data-go="items"]'); await page.tap('[data-filter="tutti"]');
await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(100);

// riga che l'utente sta per toccare: la prima tutta visibile sotto metà schermo
const target = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.list .it')].find((b) => b.getBoundingClientRect().top > 300);
  const b = r.getBoundingClientRect(); return { id: r.dataset.open, x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
// aggiornamento da un altro dispositivo: una scheda più in basso viene modificata e salterebbe in cima
const rows = await page.$$eval('.list .it', (a) => a.map((b) => b.dataset.open));
const moved = rows[rows.length - 1];
db = structuredClone(db); db.rev++; db.items[moved].updatedAt = Date.now() + 1000; db.items[moved].notes = 'modificata altrove';
await page.evaluate(() => pull()); await page.waitForTimeout(300);
const rev = await page.evaluate(() => S.db.rev);

await page.touchscreen.tap(target.x, target.y); await page.waitForTimeout(200);
const opened = await page.evaluate(() => S.view === 'edit' ? S.editId : null);
const ok = rev === db.rev && opened === target.id && !errors.length;
console.log(`${ok ? 'PASS' : 'FAIL'}  tocco dopo aggiornamento apre la riga toccata — atteso ${target.id}, aperto ${opened}, rev ${rev}/${db.rev}${errors.length ? ', errori: ' + errors.join(' | ') : ''}`);

// «indietro» dalla scheda: la lista torna allo stesso punto e allo stesso ordine, sotto il dito c'è la stessa riga
await page.goBack(); await page.waitForTimeout(200);
const under = await page.evaluate(({ x, y }) => { const b = document.elementFromPoint(x, y); return { y: scrollY, id: b && b.closest('[data-open]') && b.closest('[data-open]').dataset.open }; }, target);
const ok3 = under.y === 400 && under.id === target.id;
console.log(`${ok3 ? 'PASS' : 'FAIL'}  indietro torna allo stesso punto — scrollY ${under.y}/400, sotto il dito ${under.id}, atteso ${target.id}`);

// tornando alla lista (azione dell'utente) l'ordine si aggiorna: la scheda modificata va in cima
await page.evaluate(() => go('items')); await page.waitForTimeout(100);
const first = await page.$eval('.list .it', (b) => b.dataset.open);
const ok2 = first === moved;
console.log(`${ok2 ? 'PASS' : 'FAIL'}  dopo una navigazione l'ordine si aggiorna — prima riga ${first}, attesa ${moved}`);
await browser.close();
process.exit(ok && ok2 && ok3 ? 0 : 1);
