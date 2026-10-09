'use strict';
// ====================== Costanti Vinted ======================
const CONDIZIONI = ['Nuovo con cartellino','Nuovo senza cartellino','Ottime condizioni','Buone condizioni','Discrete condizioni'];
const TAGLIE = ['XXS','XS','S','M','L','XL','XXL','3XL','Taglia unica'];
const COLORI = ['Nero','Bianco','Grigio','Beige','Marrone','Panna','Blu','Blu marino','Azzurro','Verde','Verde scuro','Cachi','Rosso','Bordeaux','Rosa','Rosa cipria','Viola','Lilla','Giallo','Senape','Arancione','Oro','Argento','Multicolore'];
const PACCHI = ['Piccolo','Medio','Grande'];
const STATI = [
  ['compilare','Da compilare'],['pronto','Pronto'],['bozza','Bozza su Vinted'],['online','Online'],['venduto','Venduto']
];
const STATO_LABEL = Object.fromEntries(STATI);

// ====================== Stato ======================
const LS = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null? d : JSON.parse(v);}catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
};
const S = {
  db: LS.get('dbCache', {rev:0, items:{}, settings:{}}),
  me: LS.get('me', ''),
  view: LS.get('view', 'foto'),
  editId: null,
  filter: LS.get('filter', 'attivi'),
  q: '',
  folder: LS.get('folder', null), // {id, photos:[{url}]}
  uploads: [], // {key, thumb, status, blob, target, inboxKey}
  ops: LS.get('opsQueue', []), saving: false, saveErr: false, // le modifiche non ancora salvate sopravvivono a chiusure e riavvii
  copied: {}, // itemId -> Set(campo)
  installEvt: null,
  authed: true,
};
const $ = (s, r=document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(-12);
const items = () => Object.values(S.db.items || {});
const isAndroid = /Android/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

// ====================== Icone ======================
const I = {
  cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  gal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/></svg>',
  share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  ext:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7M21 3l-9 9M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
};

// ====================== Rete ======================
async function api(path, opts={}){
  const r = await fetch(path, {credentials:'same-origin', ...opts});
  if (r.status === 401){ S.authed = false; render(); throw new Error('auth'); }
  if (!r.ok){ let m = r.statusText; try{ m = (await r.json()).error || m; }catch{} throw new Error(m); }
  return r.json();
}
function setDb(db){
  if (!db || typeof db.rev !== 'number') return;
  if (db.rev < (S.db.rev || 0)) return; // risposta vecchia (cache): ignora
  const changed = db.rev !== S.db.rev;
  S.db = db; LS.set('dbCache', db);
  if (changed) refresh();
}
async function pull(){
  if (!S.authed || document.hidden || S.ops.length || S.saving) return;
  try{ setDb(await api('/api/db')); }catch{}
}

// Coda di salvataggi: le modifiche ravvicinate partono insieme
let flushT = null;
function queue(op){
  if (op.op === 'upsert'){
    const prev = S.ops.find(o => o.op === 'upsert' && o.id === op.id);
    if (prev){ Object.assign(prev.data, op.data); applyLocal(op); persistOps(); return scheduleFlush(); }
    op = {op:'upsert', id:op.id, data:{...op.data}};
  }
  S.ops.push(op);
  // Applica subito in locale per una UI immediata
  applyLocal(op);
  persistOps();
  scheduleFlush();
}
const persistOps = () => LS.set('opsQueue', S.ops);
// Anteprima locale delle modifiche (il server resta l'unica fonte di verità e la sua risposta sostituisce questa)
function applyLocal(op){
  const db = S.db; db.items ||= {}; db.trash ||= {items:{}, photos:[]}; db.trash.items ||= {}; db.trash.photos ||= [];
  if (op.op === 'settings'){ Object.assign(db.settings ||= {}, op.data); return; }
  if (op.op === 'delete'){ const it = db.items[op.id]; if (it){ db.trash.items[op.id] = {...it, deletedAt:Date.now()}; delete db.items[op.id]; } return; }
  if (op.op === 'restore'){ const it = db.trash.items[op.id]; if (it && !db.items[op.id]){ db.items[op.id] = it; delete db.trash.items[op.id]; } return; }
  if (op.op === 'purge'){ for (const id of op.ids || []) delete db.trash.items[id]; db.trash.photos = db.trash.photos.filter(p => !(op.urls || []).includes(p.url)); return; }
  if (op.op === 'emptyTrash'){ db.trash = {items:{}, photos:[]}; return; }
  if (op.op === 'trashPhotos'){ for (const p of op.photos || []) db.trash.photos.push({...p, at:Date.now()}); return; }
  if (op.op === 'restorePhoto'){ const i = db.trash.photos.findIndex(p => p.url === op.url); if (i >= 0){ const p = db.trash.photos[i]; const it = db.items[p.itemId]; if (it){ db.trash.photos.splice(i,1); it.photos.push({url:p.url, size:p.size}); } } return; }
  if (!op.id) return;
  let it = db.items[op.id];
  if (!it){ if (op.op !== 'upsert' && op.op !== 'addPhotos') return; it = db.items[op.id] = {id:op.id, createdAt:Date.now(), createdBy:S.me, status:'foto', photos:[]}; }
  if (op.op === 'upsert') Object.assign(it, op.data);
  if (op.op === 'addPhotos') for (const p of op.photos) if (!it.photos.some(x=>x.url===p.url)) it.photos.push({url:p.url, size:p.size});
  if (op.op === 'setPhotos'){
    const keep = new Set(op.photos.map(p => p.url));
    for (const p of it.photos) if (!keep.has(p.url)) db.trash.photos.push({...p, itemId:it.id, at:Date.now()});
    const byUrl = new Map(it.photos.map(p => [p.url, p]));
    it.photos = op.photos.map(p => byUrl.get(p.url)).filter(Boolean);
  }
  it.updatedAt = Date.now();
}
function scheduleFlush(ms=700){ clearTimeout(flushT); flushT = setTimeout(flush, ms); updateSaveBar(); }
async function flush(){
  if (S.saving || !S.ops.length) return;
  S.saving = true; updateSaveBar();
  const ops = S.ops; S.ops = [];
  LS.set('opsSending', ops); // in volo: se la pagina si chiude ora, al riavvio vengono rimandate (il server ignora i duplicati)
  try{
    const db = await api('/api/db', {method:'POST', keepalive:true, headers:{'content-type':'application/json'}, body:JSON.stringify({ops, by:S.me})});
    S.saveErr = false;
    // Ri-applica eventuali modifiche fatte durante il salvataggio
    for (const op of S.ops) applyOpOn(db, op);
    S.db.rev = -1; setDb(db);
    LS.set('opsSending', []);
  }catch(e){
    S.ops = ops.concat(S.ops); S.saveErr = true; LS.set('opsSending', []);
    if (e.message !== 'auth') setTimeout(flush, 4000);
  }finally{
    S.saving = false; persistOps(); updateSaveBar();
    if (S.ops.length) scheduleFlush(300);
  }
}
function applyOpOn(db, op){ const keep = S.db; S.db = db; applyLocal(op); S.db = keep; }

// ====================== Foto: qualità e caricamento ======================
// 100 = file originale del telefono, byte per byte, nessuna perdita.
// Sotto 100 = stessa risoluzione (mai ridotta), ricompressa JPEG da 0.82 (a 0) a 0.98 (a 99).
// Se la ricompressione non fa risparmiare spazio si usa comunque l'originale.
const photoQuality = () => { const q = Math.round(+LS.get('photoQ', 100)); return Number.isFinite(q) ? Math.max(0, Math.min(100, q)) : 100; };
const jpegQ = (q) => 0.82 + 0.16 * (q / 99);
const IMG_TYPES = ['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif'];
function fileType(f){
  const t = (f.type || '').toLowerCase();
  if (IMG_TYPES.includes(t)) return t;
  const ext = ((f.name || '').split('.').pop() || '').toLowerCase();
  return {jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', heic:'image/heic', heif:'image/heif', avif:'image/avif'}[ext] || (t ? '' : 'image/jpeg');
}
async function prepareFile(file){
  const type = fileType(file);
  const q = photoQuality();
  if (q >= 100 || !/^image\/(jpeg|png|webp)$/.test(type)) return {blob:file, type};
  try{
    const bmp = await createImageBitmap(file, {imageOrientation:'from-image'});
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0); if (bmp.close) bmp.close();
    const out = await new Promise(r => c.toBlob(r, 'image/jpeg', jpegQ(q)));
    c.width = c.height = 0;
    if (out && out.size < file.size) return {blob:out, type:'image/jpeg'};
  }catch(e){ console.warn('ricompressione non riuscita, uso l\'originale', e); }
  return {blob:file, type};
}
function putWithProgress(endpoint, headers, body, onProgress){
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', endpoint);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300){ try{ return res(JSON.parse(x.responseText)); }catch{ return rej(new Error('risposta non valida')); } }
      rej(new Error(`caricamento rifiutato (${x.status})`));
    };
    x.onerror = () => rej(new Error('rete'));
    x.ontimeout = () => rej(new Error('tempo scaduto'));
    x.timeout = 15 * 60 * 1000;
    x.send(body);
  });
}

// Coda di caricamento persistente: ogni foto resta salvata sul telefono finché non è al sicuro online.
const PEND = 'pending-uploads';
const pendMeta = () => LS.get('pendingMeta', []);
const setPendMeta = (m) => LS.set('pendingMeta', m);
async function savePending(u){
  try{
    const c = await caches.open(PEND);
    await c.put('/pending/' + u.key, new Response(u.file, {headers:{'content-type': u.file.type || 'application/octet-stream', 'x-name': encodeURIComponent(u.file.name || 'foto')}}));
    setPendMeta([...pendMeta().filter(m => m.key !== u.key), {key:u.key, target:u.target, seq:u.seq}]);
    return true;
  }catch(e){ console.warn('coda non salvata', e); return false; }
}
async function dropPending(key){
  setPendMeta(pendMeta().filter(m => m.key !== key));
  try{ await (await caches.open(PEND)).delete('/pending/' + key); }catch{}
}
async function restorePending(){
  if (!('caches' in window)) return;
  const metas = pendMeta(); if (!metas.length) return;
  try{
    const c = await caches.open(PEND);
    const known = new Set(S.uploads.map(u => u.key));
    let n = 0;
    for (const m of metas){
      if (known.has(m.key)) continue;
      const r = await c.match('/pending/' + m.key);
      if (!r){ setPendMeta(pendMeta().filter(x => x.key !== m.key)); continue; }
      const blob = await r.blob();
      const file = new File([blob], decodeURIComponent(r.headers.get('x-name') || 'foto'), {type: blob.type});
      S.uploads.push({key:m.key, seq:m.seq, thumb:URL.createObjectURL(file), status:'attesa', file, target:m.target, tries:0});
      n++;
    }
    if (n){ toast(`Riprendo ${n} foto non ancora caricate`); refresh(); pumpUploads(); }
  }catch(e){ console.warn(e); }
}

function ensureFolder(){
  if (!S.folder){ S.folder = {id:newId(), photos:[], createdAt:Date.now(), seq:0}; LS.set('folder', S.folder); }
  return S.folder;
}
async function addFiles(files, target, inboxKeys){
  // target: {kind:'folder'} oppure {kind:'item', id}
  if (!S.authed){ needActivation(); return; }
  const list = Array.from(files || []);
  let seqBase = Date.now() * 100;
  const added = [];
  list.forEach((f, i) => {
    const t = target.kind === 'folder' ? {kind:'folder', id:ensureFolder().id} : target;
    const u = {key:newId() + i, seq:seqBase + i, thumb:URL.createObjectURL(f), status:'attesa', file:f, target:t, tries:0};
    S.uploads.push(u); added.push(u);
  });
  refresh();
  for (let i = 0; i < added.length; i++){
    await savePending(added[i]);
    if (inboxKeys && inboxKeys[i]){ try{ (await caches.open('share-inbox')).delete(inboxKeys[i]); }catch{} }
  }
  pumpUploads();
}
let pumping = false;
async function pumpUploads(){
  if (pumping || !S.authed) return;
  pumping = true;
  try{
    for (;;){
      const u = S.uploads.find(x => x.status === 'attesa');
      if (!u) break;
      u.status = 'su'; u.progress = 0; refresh();
      try{
        const {blob, type} = await prepareFile(u.file);
        if (!type) throw new Error('formato non supportato');
        const id = u.target.id;
        const ticket = await api('/api/upload', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({item:id, contentType:type, size:blob.size})});
        const res = await putWithProgress(ticket.endpoint, ticket.headers, blob, (p) => {
          u.progress = p; const el = document.querySelector(`[data-up="${u.key}"]`); if (el) el.textContent = Math.round(p * 100) + '%';
        });
        const photo = {url:res.url, size:blob.size};
        if (u.target.kind === 'folder' && S.folder && S.folder.id === id){
          S.folder.photos.push({...photo, seq:u.seq});
          S.folder.photos.sort((a, b) => (a.seq || 0) - (b.seq || 0));
          LS.set('folder', S.folder);
        } else if (u.target.kind === 'folder'){
          // la cartella è già stata salvata come articolo: la foto va all'articolo
          queue({op:'addPhotos', id, photos:[photo]});
        } else {
          queue({op:'addPhotos', id, photos:[photo]});
        }
        u.status = 'ok';
        await dropPending(u.key);
      }catch(e){
        u.status = 'errore'; u.err = e.message; u.tries = (u.tries || 0) + 1;
        if (e.message === 'auth') break;
        if (u.tries < 6) setTimeout(() => { if (u.status === 'errore'){ u.status = 'attesa'; pumpUploads(); } }, Math.min(30000, 1500 * 2 ** u.tries));
      }
      if (u.status === 'ok'){ URL.revokeObjectURL(u.thumb); S.uploads = S.uploads.filter(x => x !== u); }
      refresh();
    }
  }finally{ pumping = false; }
}
function retryUploads(){ S.uploads.forEach(u => { if (u.status === 'errore'){ u.status = 'attesa'; u.tries = 0; } }); pumpUploads(); }
const pendingFor = (id) => S.uploads.filter(u => u.target.id === id);

// Foto condivise da Google Foto (arrivano tramite il service worker)
async function drainInbox(){
  if (!('caches' in window) || !S.authed) return;
  try{
    const c = await caches.open('share-inbox');
    const keys = await c.keys();
    if (!keys.length) return;
    const files = [], ks = [];
    for (const k of keys){ const r = await c.match(k); if (r){ const b = await r.blob(); files.push(new File([b], decodeURIComponent(r.headers.get('x-name') || 'foto.jpg'), {type:b.type})); ks.push(k.url); } }
    if (files.length){
      await addFiles(files, {kind:'folder'}, ks);
      go('foto');
      toast(`${files.length} foto ricevute`);
    }
  }catch(e){ console.warn(e); }
}

// ====================== Azioni ======================
function closeFolder(){
  const f = S.folder;
  if (!f || !f.photos.length) return;
  const parcel = (S.db.settings || {}).defaultParcel;
  queue({op:'upsert', id:f.id, data:{status:'compilare', owner:S.me, ...(parcel ? {parcel} : {})}});
  queue({op:'addPhotos', id:f.id, photos:f.photos.map(p => ({url:p.url, size:p.size}))});
  S.folder = null; LS.set('folder', null);
  toast('Articolo salvato. Contatore azzerato.');
  openEdit(f.id);
}
function movePhoto(list, i, d){
  const j = i + d; if (j < 0 || j >= list.length) return list;
  const a = list.slice(); [a[i], a[j]] = [a[j], a[i]]; return a;
}
function folderMove(i, d){ S.folder.photos = movePhoto(S.folder.photos, i, d); LS.set('folder', S.folder); refresh(); }
function folderFirst(i){ const a = S.folder.photos.slice(); const [x] = a.splice(i,1); a.unshift(x); S.folder.photos = a; LS.set('folder', S.folder); refresh(); }
async function folderDel(i){
  const [p] = S.folder.photos.splice(i, 1); LS.set('folder', S.folder); refresh();
  queue({op:'trashPhotos', id:S.folder.id, photos:[{url:p.url, size:p.size}]});
  toast('Foto nel cestino');
}
async function discardFolder(){
  if (!S.folder) return;
  if (!(await ask('Scartare questa cartella e le sue foto?', 'Scarta'))) return;
  const photos = S.folder.photos.map(p => ({url:p.url, size:p.size}));
  const id = S.folder.id;
  S.folder = null; LS.set('folder', null);
  if (photos.length) queue({op:'trashPhotos', id, photos});
  refresh();
}
function itemMove(id, i, d){ const it = S.db.items[id]; queue({op:'setPhotos', id, photos:movePhoto(it.photos, i, d)}); refresh(); }
function itemFirst(id, i){ const a = S.db.items[id].photos.slice(); const [x] = a.splice(i,1); a.unshift(x); queue({op:'setPhotos', id, photos:a}); refresh(); }
async function itemDelPhoto(id, i){
  const it = S.db.items[id]; const p = it.photos[i];
  if (!(await ask('Spostare questa foto nel cestino?', 'Sposta'))) return;
  queue({op:'setPhotos', id, photos:it.photos.filter((_,k)=>k!==i)});
  refresh(); toast('Foto nel cestino (recuperabile per 30 giorni)');
}
async function deleteItem(id){
  const it = S.db.items[id]; if (!it) return;
  if (!(await ask('Spostare questo articolo nel cestino? Potrai recuperarlo per 30 giorni.', 'Sposta'))) return;
  queue({op:'delete', id});
  go('items'); toast('Articolo nel cestino');
}
async function freePhotos(id){
  const it = S.db.items[id]; if (!it || !it.photos.length) return;
  if (!(await ask('Tenere la scheda ma eliminare le foto per liberare spazio? Lo spazio si libera tra 14 giorni.', 'Elimina foto'))) return;
  const urls = it.photos.map(p => p.url);
  queue({op:'setPhotos', id, photos:[]}); queue({op:'purge', urls});
  refresh();
}
function setStatus(id, status, extra={}){
  const data = {status, ...extra};
  if (status === 'bozza' && !S.db.items[id].draftAt) data.draftAt = Date.now();
  if (status === 'online' && !S.db.items[id].publishedAt) data.publishedAt = Date.now();
  if (status === 'venduto' && !S.db.items[id].soldAt) data.soldAt = Date.now();
  queue({op:'upsert', id, data});
  refresh();
}

// Clipboard
async function copyText(t){
  t = String(t ?? '');
  try{ await navigator.clipboard.writeText(t); return true; }
  catch{
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); let ok = false; try{ ok = document.execCommand('copy'); }catch{}
    ta.remove(); return ok;
  }
}

// Foto → telefono
const slug = (s) => (String(s||'articolo').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30) || 'articolo');
const extOf = (url) => ((url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().replace('jpeg','jpg'));
async function downloadPhotos(id){
  const it = S.db.items[id]; if (!it || !it.photos.length) return;
  toast(`Scarico ${it.photos.length} foto…`);
  const base = slug(it.title || it.brand);
  let ok = 0;
  for (let i = 0; i < it.photos.length; i++){
    const url = it.photos[i].url;
    const name = `${base}-${String(i+1).padStart(2,'0')}.${extOf(url)}`;
    const a = document.createElement('a');
    try{
      const b = await (await fetch(url)).blob();
      a.href = URL.createObjectURL(b); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      ok++;
    }catch{
      a.href = url + (url.includes('?') ? '&' : '?') + 'download=1'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove(); ok++;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  markCopied(id, 'foto');
  toast(`${ok} foto salvate in Download: le trovi nel selettore di Vinted`);
}
async function sharePhotos(id){
  const it = S.db.items[id]; if (!it || !it.photos.length) return;
  try{
    toast('Preparo le foto…');
    const base = slug(it.title || it.brand);
    const files = await Promise.all(it.photos.map(async (p, i) => {
      const b = await (await fetch(p.url)).blob();
      return new File([b], `${base}-${String(i+1).padStart(2,'0')}.${extOf(p.url)}`, {type:b.type || 'image/jpeg'});
    }));
    if (navigator.canShare && navigator.canShare({files})){ await navigator.share({files}); markCopied(id, 'foto'); }
    else { toast('Condivisione non supportata qui: uso il download'); downloadPhotos(id); }
  }catch(e){ if (e.name !== 'AbortError') toast('Condivisione non riuscita'); }
}

// Descrizione automatica
function hashtag(s){ return '#' + String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function buildDescription(it){
  const lines = [];
  const head = [it.category, it.brand].filter(Boolean).join(' ');
  if (head) lines.push(`${head}${it.colors && it.colors.length ? ' ' + it.colors.join('/').toLowerCase() : ''}.`);
  lines.push('');
  if (it.brand) lines.push(`• Brand: ${it.brand}`);
  if (it.size) lines.push(`• Taglia: ${it.size}`);
  if (it.condition) lines.push(`• Condizioni: ${it.condition.toLowerCase()}`);
  if (it.colors && it.colors.length) lines.push(`• Colore: ${it.colors.join(', ').toLowerCase()}`);
  if (it.material) lines.push(`• Materiale: ${it.material}`);
  if (it.measures) lines.push(`• Misure: ${it.measures}`);
  lines.push('');
  const st = S.db.settings || {};
  const footer = st.descFooter != null && st.descFooter !== '' ? st.descFooter : DEFAULT_FOOTER;
  if (footer.trim()) lines.push(footer.trim());
  const tags = [it.brand, it.category, ...(it.colors||[]), it.size && !/unica/i.test(it.size) ? 'taglia' + it.size : ''].filter(Boolean).map(hashtag);
  if (hashtagsOn() && tags.length){ lines.push(''); lines.push([...new Set(tags)].join(' ')); }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const DEFAULT_FOOTER = 'Spedisco in giornata o il giorno dopo. Per altre foto o domande scrivimi pure!';
const hashtagsOn = () => { const v = (S.db.settings || {}).hashtags; return v !== false && v !== 'false'; };
function buildTitle(it){
  return [it.category, it.brand, it.colors && it.colors[0] ? it.colors[0].toLowerCase() : '', it.size ? 'tg ' + it.size : ''].filter(Boolean).join(' ').slice(0, 100);
}

// ====================== UI di supporto ======================
let toastT;
function toast(msg){
  let el = $('#toast');
  if (!el){ el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.remove('hide');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hide'), 2600);
}
function sheet(html){
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg); return bg;
}
function ask(msg, okLabel='OK'){
  return new Promise(res => {
    const s = sheet(`<h3>${esc(msg)}</h3><div class="two"><button class="btn" data-a="no">Annulla</button><button class="btn primary" data-a="si" style="background:var(--bad)">${esc(okLabel)}</button></div>`);
    s.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (!a) return; s.remove(); res(a.dataset.a === 'si'); });
  });
}
function updateSaveBar(){
  const el = $('#savebar'); if (!el) return;
  if (!S.authed) el.textContent = '';
  else if (S.saveErr) el.innerHTML = '<span class="err">Offline, riprovo…</span>';
  else if (S.saving || S.ops.length) el.innerHTML = '<span class="spin"></span>';
  else el.textContent = 'Salvato ✓';
}
function go(view, id){
  S.view = view; if (id !== undefined) S.editId = id;
  if (['foto','items','publish'].includes(view)) LS.set('view', view);
  render(); window.scrollTo(0, 0);
  if (view === 'edit' || view === 'copy') history.pushState({v:view, id:S.editId}, '');
}
// Torna alla lista chiudendo scheda e modalità copia
function backToList(){
  const v = history.state && history.state.v;
  const steps = v === 'copy' ? 2 : v === 'edit' ? 1 : 0;
  if (steps) history.go(-steps); else go(LS.get('view','items'));
}
function openEdit(id){ go('edit', id); }
window.addEventListener('popstate', () => {
  const st = history.state || {};
  if ((st.v === 'edit' || st.v === 'copy') && S.db.items[st.id]){ S.view = st.v; S.editId = st.id; }
  else S.view = LS.get('view', 'items');
  render(); window.scrollTo(0, 0);
});
