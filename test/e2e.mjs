// Collaudo estremo nel browser (Chromium, viewport Pixel) contro test/mock-server.mjs
// Uso: IMG=<cartella immagini> node test/e2e.mjs
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/@playwright/mcp/');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8787';
const IMG = process.env.IMG;
const OUT = process.env.OUT || IMG;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fileSha = (f) => sha(fs.readFileSync(`${IMG}/${f}`));
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name, extra]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const state = async () => (await fetch(`${BASE}/__test/state`)).json();
const stored = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--js-flags=--max-old-space-size=4096'] });
const ua = 'Mozilla/5.0 (Linux; Android 15; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => { page.errors.push('DIALOG ' + d.message()); d.dismiss(); });
  await page.goto(BASE); await page.waitForTimeout(700);
  return { ctx, page, name };
}
const idle = (page, t = 240000) => page.waitForFunction(() => S.uploads.length === 0 && !S.ops.length && !S.saving, null, { timeout: t, polling: 300 });
const activate = async (page, who) => { await page.evaluate((w) => { S.me = w; LS.set('me', w); }, who); };

try {
  // ---------- T1 apertura diretta, nessun codice ----------
  const A = await device('A'); const pa = A.page;
  check('T1 nessun codice, nessun pulsante Attiva', (await pa.locator('#lf').count()) === 0 && (await pa.locator('.pill-btn').count()) === 0 && (await pa.locator('#s_code').count()) === 0);
  await activate(pa, 'Saverio');

  // ---------- T2 qualità 100: originali identici, anche oltre 4,5 MB e fino a 66 MB ----------
  await pa.setInputFiles('#galIn', [`${IMG}/p12mp.jpg`, `${IMG}/p50mp.jpg`, `${IMG}/huge.jpg`]);
  let sawProgress = false;
  for (let i = 0; i < 600 && !(await pa.evaluate(() => S.uploads.length === 0)); i++) {
    const t = await pa.evaluate(() => [...document.querySelectorAll('[data-up]')].map((e) => e.textContent).join(','));
    if (/\d+%/.test(t)) sawProgress = true;
    await pa.waitForTimeout(250);
  }
  await idle(pa);
  let f = await pa.evaluate(() => S.folder.photos);
  check('T2 tre foto caricate', f.length === 3, `${f.length}`);
  const want = ['p12mp.jpg', 'p50mp.jpg', 'huge.jpg'];
  for (let i = 0; i < 3; i++) {
    const b = await stored(f[i].url);
    check(`T2 ${want[i]} identica byte per byte (${(b.length / 1048576).toFixed(1)} MB)`, sha(b) === fileSha(want[i]) && f[i].size === b.length);
  }
  check('T2 percentuale di caricamento visibile', sawProgress);
  await pa.click('[data-act=close]'); await pa.waitForTimeout(400); await idle(pa);
  let st = await state();
  const item1 = Object.values(st.db.items)[0];
  check('T2 articolo salvato con 3 foto e dimensioni', item1 && item1.photos.length === 3 && item1.photos.every((p) => p.size > 0));
  await pa.goBack(); await pa.waitForTimeout(300);

  // ---------- T3 30 foto insieme: ordine di selezione rispettato ----------
  const thirty = Array.from({ length: 30 }, (_, i) => `n${String(i).padStart(2, '0')}.jpg`);
  await pa.click('[data-go=foto]'); await pa.setInputFiles('#galIn', thirty.map((n) => `${IMG}/${n}`));
  await idle(pa);
  f = await pa.evaluate(() => S.folder.photos);
  let orderOk = f.length === 30;
  for (let i = 0; i < f.length && orderOk; i++) orderOk = sha(await stored(f[i].url)) === fileSha(thirty[i]);
  check('T3 30 foto caricate nell\'ordine giusto', orderOk, `${f.length}`);
  check('T3 contatore mostra 30', (await pa.textContent('.counter')).trim().startsWith('30'));
  await pa.click('[data-act=close]'); await pa.waitForTimeout(400); await idle(pa); await pa.goBack(); await pa.waitForTimeout(300);

  // ---------- T4 qualità 0 e 50: stessa risoluzione, file più leggero; mai peggiorare una foto già compressa ----------
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(200);
  check('T4 selettore qualità parte da 100', (await pa.inputValue('#s_qn')) === '100' && /identico/.test(await pa.textContent('#s_qh')));
  await pa.fill('#s_qn', '0'); await pa.dispatchEvent('#s_qn', 'change');
  check('T4 slider e casella allineati', (await pa.inputValue('#s_q')) === '0');
  await pa.fill('#s_qn', '150'); await pa.dispatchEvent('#s_qn', 'change');
  check('T4 valore oltre 100 riportato a 100', (await pa.inputValue('#s_qn')) === '100');
  await pa.fill('#s_qn', '-20'); await pa.dispatchEvent('#s_qn', 'change');
  check('T4 valore negativo riportato a 0', (await pa.inputValue('#s_qn')) === '0');
  await pa.click('[data-a=save]'); await pa.waitForTimeout(500);
  await pa.click('[data-go=foto]'); await pa.setInputFiles('#galIn', [`${IMG}/p12mp.jpg`, `${IMG}/p50mp.jpg`, `${IMG}/lowq.jpg`, `${IMG}/pic.png`, `${IMG}/notype`]);
  await idle(pa);
  f = await pa.evaluate(() => S.folder.photos);
  const b12 = await stored(f[0].url), b50 = await stored(f[1].url), blow = await stored(f[2].url), bpng = await stored(f[3].url), bnt = await stored(f[4].url);
  fs.writeFileSync(`${OUT}/out12.jpg`, b12); fs.writeFileSync(`${OUT}/out50.jpg`, b50);
  check('T4 qualità 0: 12 MP più leggera', b12.length < fs.statSync(`${IMG}/p12mp.jpg`).size, `${(b12.length / 1048576).toFixed(2)} MB invece di ${(fs.statSync(`${IMG}/p12mp.jpg`).size / 1048576).toFixed(2)} MB`);
  check('T4 qualità 0: 50 MP più leggera', b50.length < fs.statSync(`${IMG}/p50mp.jpg`).size, `${(b50.length / 1048576).toFixed(2)} MB invece di ${(fs.statSync(`${IMG}/p50mp.jpg`).size / 1048576).toFixed(2)} MB`);
  check('T4 foto già compressa: tenuto l\'originale', sha(blow) === fileSha('lowq.jpg'));
  check('T4 PNG ricompresso o originale, mai rotto', bpng.length > 0 && bpng.length <= fs.statSync(`${IMG}/pic.png`).size);
  check('T4 file senza tipo caricato', bnt.length > 0);
  await pa.click('[data-act=discard]'); await pa.waitForTimeout(200); await pa.click('[data-a=si]'); await pa.waitForTimeout(400); await idle(pa);
  st = await state();
  check('T4 cartella scartata: foto nel cestino, non cancellate', st.db.trash.photos.length === 5 && st.files.filter((x) => x.startsWith('photos/')).length === 3 + 30 + 5);
  await pa.evaluate(() => LS.set('photoQ', 100));

  // ---------- T5 errori del server di caricamento: nuovo tentativo automatico ----------
  await fetch(`${BASE}/__test/failUploads?n=2`);
  await pa.setInputFiles('#galIn', [`${IMG}/n00.jpg`]);
  await idle(pa, 120000);
  f = await pa.evaluate(() => S.folder.photos);
  check('T5 dopo 2 errori del server la foto arriva comunque, identica', f.length === 1 && sha(await stored(f[0].url)) === fileSha('n00.jpg'));

  // ---------- T6 senza rete + riavvio dell'app: nessuna foto né modifica persa ----------
  await A.ctx.setOffline(true);
  await pa.setInputFiles('#galIn', [`${IMG}/n01.jpg`, `${IMG}/n02.jpg`]);
  await pa.waitForTimeout(1500);
  const itemId = item1.id;
  await pa.evaluate((id) => { queue({ op: 'upsert', id, data: { title: 'Titolo scritto offline ✈️' } }); queue({ op: 'delete', id: 'conc0000' }); }, itemId);
  await pa.waitForTimeout(800);
  check('T6 offline: foto in coda, non perse', await pa.evaluate(() => S.uploads.length === 2 && JSON.parse(localStorage.getItem('pendingMeta')).length === 2));
  await pa.reload(); await pa.waitForTimeout(1500); // ricarica SENZA rete: l'app parte dalla copia salvata
  check('T6 app si apre anche senza rete', (await pa.locator('nav.tabs').count()) === 1);
  check('T6 dopo il riavvio le foto sono ancora in coda', await pa.evaluate(() => S.uploads.length === 2));
  check('T6 dopo il riavvio la modifica offline è ancora lì', await pa.evaluate((id) => S.db.items[id] && S.db.items[id].title === 'Titolo scritto offline ✈️', itemId));
  await A.ctx.setOffline(false);
  await pa.evaluate(() => window.dispatchEvent(new Event('online')));
  await idle(pa, 120000);
  f = await pa.evaluate(() => S.folder.photos);
  st = await state();
  check('T6 tornata la rete: foto caricate identiche e in ordine', f.length === 3 && sha(await stored(f[1].url)) === fileSha('n01.jpg') && sha(await stored(f[2].url)) === fileSha('n02.jpg'));
  check('T6 tornata la rete: modifica salvata sul server', st.db.items[itemId].title === 'Titolo scritto offline ✈️');
  check('T6 coda locale svuotata', await pa.evaluate(() => JSON.parse(localStorage.getItem('pendingMeta') || '[]').length === 0 && JSON.parse(localStorage.getItem('opsQueue') || '[]').length === 0));
  await pa.click('[data-act=close]'); await pa.waitForTimeout(400); await idle(pa); await pa.goBack(); await pa.waitForTimeout(300);

  // ---------- T7 due telefoni insieme ----------
  const B = await device('B'); const pb = B.page;
  await activate(pb, 'Lei');
  await Promise.all([
    pa.evaluate((id) => queue({ op: 'upsert', id, data: { brand: 'Zara' } }), itemId),
    pb.evaluate((id) => queue({ op: 'upsert', id, data: { price: '18' } }), itemId),
  ]);
  await Promise.all([idle(pa), idle(pb)]);
  for (let i = 0; i < 20; i++) await Promise.all([pa.evaluate((n) => queue({ op: 'upsert', id: 'conc' + String(n).padStart(4, '0'), data: { title: 'A' + n } }), i), pb.evaluate((n) => queue({ op: 'upsert', id: 'conb' + String(n).padStart(4, '0'), data: { title: 'B' + n } }), i)]);
  await Promise.all([idle(pa), idle(pb)]);
  st = await state();
  check('T7 modifiche simultanee su campi diversi conservate', st.db.items[itemId].brand === 'Zara' && st.db.items[itemId].price === '18');
  check('T7 40 articoli creati in contemporanea da 2 telefoni, nessuno perso', Object.keys(st.db.items).filter((k) => /^con[cb]/.test(k)).length === 40);
  await pb.evaluate(() => pull()); await pb.waitForTimeout(500);
  check('T7 l\'altro telefono vede le modifiche', await pb.evaluate((id) => S.db.items[id] && S.db.items[id].brand === 'Zara', itemId));

  // ---------- T8 testi pericolosi, emoji, testi lunghissimi ----------
  const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>"\'&';
  const long = ('Maglione 🧶 in lana — perfetto «inverno» ' + 'ñáéíóú ✓ '.repeat(10)).repeat(40).slice(0, 5000);
  await pa.evaluate(([id, evil, long]) => queue({ op: 'upsert', id, data: { title: evil, description: long, brand: '"><b>x</b>' } }), [itemId, evil, long]);
  await idle(pa);
  await pa.click('[data-go=items]'); await pa.waitForTimeout(400);
  check('T8 nessun codice eseguito dai testi', (await pa.evaluate(() => window.__xss)) === undefined && !pa.errors.some((e) => e.startsWith('DIALOG')));
  check('T8 titolo mostrato come testo', (await pa.locator('.list .it .ti', { hasText: '<img src=x' }).count()) >= 1);
  await pa.click(`[data-open="${itemId}"]`); await pa.waitForTimeout(400);
  check('T8 descrizione da 5000 caratteri intatta', (await pa.inputValue('#f_description')) === long);
  await pa.click('[data-act=copymode]'); await pa.waitForTimeout(500);
  await pa.click('[data-copy=description]'); await pa.waitForTimeout(400);
  check('T8 copia della descrizione identica', (await pa.evaluate(() => navigator.clipboard.readText())) === long);
  await pa.goBack(); await pa.waitForTimeout(300);

  // ---------- T9 scrittura velocissima ----------
  await pa.click('#f_title', { clickCount: 3 }); await pa.keyboard.press('Backspace');
  const typed = 'Giacca di jeans vintage anni 90 taglia M ottime condizioni '.repeat(3).slice(0, 100);
  await pa.keyboard.type(typed, { delay: 5 });
  await idle(pa); st = await state();
  check('T9 digitazione veloce salvata identica', st.db.items[itemId].title === typed);

  // ---------- T10 cestino: articolo e foto si recuperano; svuota cancella solo il cestino ----------
  await pa.evaluate((id) => { const it = S.db.items[id]; queue({ op: 'setPhotos', id, photos: it.photos.slice(1) }); }, itemId);
  await idle(pa); st = await state();
  const removedUrl = item1.photos[0].url;
  check('T10 foto tolta finisce nel cestino', st.db.items[itemId].photos.length === 2 && st.db.trash.photos.some((p) => p.url === removedUrl));
  await pa.evaluate((u) => queue({ op: 'restorePhoto', url: u }), removedUrl); await idle(pa); st = await state();
  check('T10 foto ripristinata', st.db.items[itemId].photos.some((p) => p.url === removedUrl));
  await pa.click('[data-act=delitem]'); await pa.waitForTimeout(200); await pa.click('[data-a=si]'); await pa.waitForTimeout(300); await idle(pa); st = await state();
  check('T10 articolo eliminato va nel cestino con le foto', !st.db.items[itemId] && st.db.trash.items[itemId] && st.db.trash.items[itemId].photos.length === 3);
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(200); await pa.click('[data-a=trash]'); await pa.waitForTimeout(300);
  await pa.click(`[data-t=restore][data-id="${itemId}"]`); await pa.waitForTimeout(400); await idle(pa); st = await state();
  check('T10 ripristino dal cestino (interfaccia)', st.db.items[itemId] && st.db.items[itemId].photos.length === 3 && st.db.items[itemId].title === typed);
  const filesBefore = st.files.filter((x) => x.startsWith('photos/')).length;
  const trashCount = st.db.trash.photos.length;
  await pa.click('[data-t=empty]'); await pa.waitForTimeout(200); await pa.click('[data-a=si]'); await pa.waitForTimeout(600); await idle(pa); st = await state();
  await pa.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((x) => x.remove()));
  const filesAfter = st.files.filter((x) => x.startsWith('photos/')).length;
  check('T10 svuota cestino: nessun file distrutto subito (14 giorni di sicurezza)', filesBefore === filesAfter && st.db.trash.photos.length === 0 && st.db.purgeQueue.length === trashCount, `file ${filesBefore}→${filesAfter}, in eliminazione ${st.db.purgeQueue.length}`);

  // ---------- T11 backup automatico + ripristino + esporta/importa ----------
  await fetch(`${BASE}/__test/setBackupDay`);
  await pa.evaluate((id) => queue({ op: 'upsert', id, data: { notes: 'prima del backup' } }), itemId); await idle(pa);
  await pa.evaluate((id) => queue({ op: 'upsert', id, data: { notes: 'dopo il backup' } }), itemId); await idle(pa);
  const nItems = Object.keys((await state()).db.items).length;
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(200); await pa.click('[data-a=backups]'); await pa.waitForTimeout(800);
  check('T11 backup giornaliero presente', (await pa.locator('[data-b=restore]').count()) >= 1);
  // esporta
  await pa.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((x) => x.remove()));
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(200);
  const [dl] = await Promise.all([pa.waitForEvent('download'), pa.click('[data-a=export]')]);
  const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('T11 esportazione completa', Object.keys(exported.items).length === nItems && exported.items[itemId].notes === 'dopo il backup');
  await pa.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((x) => x.remove()));
  // disastro: cancello tutto
  await pa.evaluate(() => { for (const id of Object.keys(S.db.items)) queue({ op: 'delete', id }); queue({ op: 'emptyTrash' }); });
  await idle(pa); st = await state();
  check('T11 (simulazione disastro) tutto cancellato', Object.keys(st.db.items).length === 0);
  // ripristino dal backup automatico
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(200); await pa.click('[data-a=backups]'); await pa.waitForTimeout(800);
  await pa.locator('[data-b=restore]').first().click(); await pa.waitForTimeout(200); await pa.click('[data-a=si]'); await pa.waitForTimeout(1200);
  st = await state();
  check('T11 ripristino dal backup automatico (stato di inizio giornata)', Object.keys(st.db.items).length === nItems && st.db.items[itemId] && st.db.items[itemId].notes === undefined, `${Object.keys(st.db.items).length} articoli`);
  let photosOk = true; for (const p of st.db.items[itemId].photos) photosOk = photosOk && (await fetch(p.url)).ok;
  check('T11 dopo il disastro le foto tornano con il backup', photosOk && st.db.items[itemId].photos.length === 3);
  // importa dal file esportato (stato più recente)
  fs.writeFileSync(`${OUT}/export.json`, JSON.stringify(exported));
  await pa.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((x) => x.remove()));
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(200);
  const [chooser] = await Promise.all([pa.waitForEvent('filechooser'), pa.click('[data-a=import]')]);
  await chooser.setFiles(`${OUT}/export.json`); await pa.waitForTimeout(300); await pa.click('[data-a=si]'); await pa.waitForTimeout(1200);
  st = await state();
  check('T11 importazione dal file esportato', Object.keys(st.db.items).length === nItems && st.db.items[itemId].notes === 'dopo il backup');
  const bk = await (await fetch(`${BASE}/__test/state`)).json();
  check('T11 copia di sicurezza prima di ogni ripristino', bk.files.filter((x) => x.includes('prima-del-ripristino')).length >= 2);
  const photosLeft = st.db.items[itemId].photos;
  let allOk = true; for (const p of photosLeft) allOk = allOk && (await fetch(p.url)).ok;
  check('T11 dopo il disastro e il ripristino le foto ci sono ancora', allOk && photosLeft.length === 3);

  // ---------- T13 aspetto e spazio ----------
  await pa.click('[data-act=settings]'); await pa.waitForTimeout(300);
  const meter = await pa.textContent('.sheet');
  check('T13 indicatore di spazio presente', /MB di 1000 MB/.test(meter) && /foto/.test(meter));
  await pa.locator('.sheet').evaluate((el) => (el.scrollTop = 600)); await pa.screenshot({ path: `${OUT}/e2e-settings.png` });
  await pa.evaluate(() => document.querySelectorAll('.sheet-bg').forEach((x) => x.remove()));
  await pa.click('[data-go=items]'); await pa.waitForTimeout(300); await pa.screenshot({ path: `${OUT}/e2e-items.png` });

  check('NESSUN errore JavaScript nei due telefoni', !pa.errors.length && !pb.errors.length, [...pa.errors, ...pb.errors].join(' | '));
  const finalState = await state();
  console.log('operazioni archivio (put/del/list):', JSON.stringify(finalState.stats));
} catch (e) {
  console.log('ERRORE TEST', e.stack || e);
  results.push([false, 'eccezione', String(e)]);
} finally {
  await browser.close();
  const fails = results.filter((r) => !r[0]);
  console.log(`\nRISULTATO: ${results.length - fails.length}/${results.length} superati`);
  process.exit(fails.length ? 1 : 0);
}
