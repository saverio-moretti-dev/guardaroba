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
  folder: LS.get('folder', null),     // {id, photos:[{url}]}
  uploads: [],                         // {key, thumb, status, blob, target, inboxKey}
  ops: [], saving: false, saveErr: false,
  copied: {},                          // itemId -> Set(campo)
  installEvt: null,
  authed: false,
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
  if (db.rev < (S.db.rev || 0)) return;           // risposta vecchia (cache): ignora
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
    if (prev){ Object.assign(prev.data, op.data); applyLocal(op); return scheduleFlush(); }
    op = {op:'upsert', id:op.id, data:{...op.data}};
  }
  S.ops.push(op);
  // Applica subito in locale per una UI immediata
  applyLocal(op);
  scheduleFlush();
}
function applyLocal(op){
  const db = S.db; db.items ||= {};
  if (op.op === 'delete'){ delete db.items[op.id]; return; }
  if (op.op === 'settings'){ Object.assign(db.settings ||= {}, op.data); return; }
  if (!op.id) return;
  let it = db.items[op.id];
  if (!it){ if (op.op !== 'upsert' && op.op !== 'addPhotos') return; it = db.items[op.id] = {id:op.id, createdAt:Date.now(), createdBy:S.me, status:'foto', photos:[]}; }
  if (op.op === 'upsert') Object.assign(it, op.data);
  if (op.op === 'addPhotos') for (const p of op.photos) if (!it.photos.some(x=>x.url===p.url)) it.photos.push({url:p.url});
  if (op.op === 'setPhotos') it.photos = op.photos.map(p=>({url:p.url}));
  it.updatedAt = Date.now();
}
function scheduleFlush(ms=700){ clearTimeout(flushT); flushT = setTimeout(flush, ms); updateSaveBar(); }
async function flush(){
  if (S.saving || !S.ops.length) return;
  S.saving = true; updateSaveBar();
  const ops = S.ops; S.ops = [];
  try{
    const db = await api('/api/db', {method:'POST', keepalive:true, headers:{'content-type':'application/json'}, body:JSON.stringify({ops, by:S.me})});
    S.saveErr = false;
    // Ri-applica eventuali modifiche fatte durante il salvataggio
    for (const op of S.ops) applyOpOn(db, op);
    S.db.rev = -1; setDb(db);
  }catch(e){
    S.ops = ops.concat(S.ops); S.saveErr = true;
    if (e.message !== 'auth') setTimeout(flush, 4000);
  }finally{
    S.saving = false; updateSaveBar();
    if (S.ops.length) scheduleFlush(300);
  }
}
function applyOpOn(db, op){ const keep = S.db; S.db = db; applyLocal(op); S.db = keep; }

// ====================== Foto: compressione e caricamento ======================
async function compress(file){
  const MAX = 1600;
  let src;
  try{ src = await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch{
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height, k = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w*k); c.height = Math.round(h*k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}
function ensureFolder(){
  if (!S.folder){ S.folder = {id:newId(), photos:[], createdAt:Date.now()}; LS.set('folder', S.folder); }
  return S.folder;
}
function addFiles(files, target, inboxKeys){
  // target: {kind:'folder'} oppure {kind:'item', id}
  const list = Array.from(files || []);
  list.forEach((f, i) => {
    const folderId = target.kind === 'folder' ? ensureFolder().id : null;
    S.uploads.push({key:newId()+i, thumb:URL.createObjectURL(f), status:'attesa', file:f,
      target: target.kind === 'folder' ? {kind:'folder', id:folderId} : target,
      inboxKey: inboxKeys ? inboxKeys[i] : null});
  });
  refresh(); pumpUploads();
}
let pumping = 0;
async function pumpUploads(){
  while (pumping < 2){
    const u = S.uploads.find(x => x.status === 'attesa');
    if (!u) break;
    pumping++; u.status = 'su'; refresh();
    (async () => {
      try{
        const blob = await compress(u.file);
        const id = u.target.id;
        const r = await fetch(`/api/photo?item=${id}`, {method:'POST', body:blob, headers:{'content-type':'image/jpeg'}, credentials:'same-origin'});
        if (!r.ok) throw new Error((await r.json().catch(()=>({}))).error || 'errore');
        const {url} = await r.json();
        u.status = 'ok'; u.url = url;
        if (u.target.kind === 'folder' && S.folder && S.folder.id === id){
          S.folder.photos.push({url, key:u.key}); LS.set('folder', S.folder);
        } else if (u.target.kind === 'item'){
          queue({op:'addPhotos', id, photos:[{url}]});
        }
        if (u.inboxKey){ try{ (await caches.open('share-inbox')).delete(u.inboxKey); }catch{} }
      }catch(e){
        u.status = 'errore'; u.err = e.message;
      }finally{
        pumping--;
        if (u.status === 'ok'){ URL.revokeObjectURL(u.thumb); S.uploads = S.uploads.filter(x => x !== u); }
        refresh(); pumpUploads();
      }
    })();
  }
}
function retryUploads(){ S.uploads.forEach(u => { if (u.status === 'errore') u.status = 'attesa'; }); pumpUploads(); }
const pendingFor = (id) => S.uploads.filter(u => u.target.id === id);

// Foto condivise da Google Foto (arrivano tramite il service worker)
async function drainInbox(){
  if (!('caches' in window)) return;
  try{
    const c = await caches.open('share-inbox');
    const keys = await c.keys();
    const already = new Set(S.uploads.map(u => u.inboxKey).filter(Boolean));
    const todo = keys.filter(k => !already.has(k.url));
    if (!todo.length) return;
    const files = [], ks = [];
    for (const k of todo){ const r = await c.match(k); if (r){ files.push(await r.blob()); ks.push(k.url); } }
    if (files.length){
      addFiles(files, {kind:'folder'}, ks);
      go('foto');
      toast(`${files.length} foto ricevute`);
    }
  }catch(e){ console.warn(e); }
}

// ====================== Azioni ======================
function closeFolder(){
  const f = S.folder;
  if (!f || !f.photos.length) return;
  queue({op:'upsert', id:f.id, data:{status:'compilare', owner:S.me}});
  queue({op:'addPhotos', id:f.id, photos:f.photos.map(p => ({url:p.url}))});
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
  queue({op:'deletePhotos', urls:[p.url]});
}
async function discardFolder(){
  if (!S.folder) return;
  if (!(await ask('Scartare questa cartella e le sue foto?', 'Scarta'))) return;
  const urls = S.folder.photos.map(p => p.url);
  S.folder = null; LS.set('folder', null);
  if (urls.length) queue({op:'deletePhotos', urls});
  refresh();
}
function itemMove(id, i, d){ const it = S.db.items[id]; queue({op:'setPhotos', id, photos:movePhoto(it.photos, i, d)}); refresh(); }
function itemFirst(id, i){ const a = S.db.items[id].photos.slice(); const [x] = a.splice(i,1); a.unshift(x); queue({op:'setPhotos', id, photos:a}); refresh(); }
async function itemDelPhoto(id, i){
  const it = S.db.items[id]; const p = it.photos[i];
  if (!(await ask('Eliminare questa foto?', 'Elimina'))) return;
  queue({op:'setPhotos', id, photos:it.photos.filter((_,k)=>k!==i)});
  queue({op:'deletePhotos', urls:[p.url]});
  refresh();
}
async function deleteItem(id){
  const it = S.db.items[id]; if (!it) return;
  if (!(await ask('Eliminare definitivamente questo articolo e le sue foto?', 'Elimina'))) return;
  const urls = (it.photos||[]).map(p => p.url);
  queue({op:'delete', id});
  if (urls.length) queue({op:'deletePhotos', urls});
  go('items');
}
async function freePhotos(id){
  const it = S.db.items[id]; if (!it || !it.photos.length) return;
  if (!(await ask('Tenere la scheda ma cancellare le foto per liberare spazio?', 'Cancella foto'))) return;
  const urls = it.photos.map(p => p.url);
  queue({op:'setPhotos', id, photos:[]}); queue({op:'deletePhotos', urls});
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
async function downloadPhotos(id){
  const it = S.db.items[id]; if (!it || !it.photos.length) return;
  toast(`Scarico ${it.photos.length} foto…`);
  const base = slug(it.title || it.brand);
  for (let i = 0; i < it.photos.length; i++){
    const a = document.createElement('a');
    const name = `${base}-${String(i+1).padStart(2,'0')}.jpg`;
    a.href = `/api/file?url=${encodeURIComponent(it.photos[i].url)}&name=${encodeURIComponent(name)}`;
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    await new Promise(r => setTimeout(r, 700));
  }
  markCopied(id, 'foto');
  toast('Foto salvate in Download: le trovi nel selettore di Vinted');
}
async function sharePhotos(id){
  const it = S.db.items[id]; if (!it || !it.photos.length) return;
  try{
    toast('Preparo le foto…');
    const base = slug(it.title || it.brand);
    const files = await Promise.all(it.photos.map(async (p, i) => {
      const b = await (await fetch(p.url)).blob();
      return new File([b], `${base}-${String(i+1).padStart(2,'0')}.jpg`, {type:'image/jpeg'});
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
  lines.push('Spedisco in giornata o il giorno dopo. Per altre foto o domande scrivimi pure!');
  const tags = [it.brand, it.category, ...(it.colors||[]), it.size && !/unica/i.test(it.size) ? 'taglia' + it.size : ''].filter(Boolean).map(hashtag);
  if (tags.length){ lines.push(''); lines.push([...new Set(tags)].join(' ')); }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
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
  if (S.saveErr) el.innerHTML = '<span class="err">Offline, riprovo…</span>';
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

