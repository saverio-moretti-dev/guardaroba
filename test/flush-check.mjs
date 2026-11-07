// Avvio: node test/flush-check.mjs  (Chrome in CHROME, default macOS). Prova: coda da ~250 modifiche (~250 KB) nel localStorage → l'app deve salvarle tutte sul server.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const PORT = 8798, DBG = 9333, N = 250;
const srv = spawn('node', ['test/mock-server.mjs', String(PORT)], { env: { ...process.env, APP_CODE: 't' }, stdio: 'ignore' });
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${DBG}`, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'flush-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2000);
const tgt = (await (await fetch(`http://localhost:${DBG}/json`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r) => ws.onopen = r);
let n = 0; const send = (method, params = {}) => new Promise((r) => { const id = ++n; ws.addEventListener('message', function h(e) { const m = JSON.parse(e.data); if (m.id === id) { ws.removeEventListener('message', h); r(m); } }); ws.send(JSON.stringify({ id, method, params })); });
const ops = Array.from({ length: N }, (_, i) => ({ op: 'upsert', id: 'it' + String(i).padStart(6, '0'), data: { title: 't' + i, description: 'x'.repeat(1000) } }));
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(!localStorage.getItem('seeded')){localStorage.setItem('seeded','1');localStorage.setItem('opsQueue',${JSON.stringify(JSON.stringify(ops))});}` });
await send('Page.navigate', { url: `http://localhost:${PORT}/` });
let st; for (let t = 0; t < 30; t++) { await sleep(500); st = await (await fetch(`http://localhost:${PORT}/__test/state`)).json(); if (Object.keys(st.db.items).length >= N) break; }
const bar = (await send('Runtime.evaluate', { expression: "(document.querySelector('#savebar')||{}).textContent" })).result.result.value;
const items = Object.keys(st.db.items).length;
console.log(`articoli sul server: ${items}/${N}, rev ${st.db.rev}, barra: "${bar}"`);
chrome.kill(); srv.kill();
process.exit(items === N ? 0 : 1);
