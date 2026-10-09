'use strict';
// ====================== Viste ======================
function render(){
  const app = $('#app');
  let html = '';
  if (S.view === 'edit' && S.db.items[S.editId]) html = viewEdit();
  else if (S.view === 'copy' && S.db.items[S.editId]) html = viewCopy();
  else {
    if (S.view === 'edit' || S.view === 'copy') S.view = LS.get('view', 'items');
    html = S.view === 'items' ? viewItems() : S.view === 'publish' ? viewPublish() : viewFoto();
  }
  app.innerHTML = html + (['edit','copy'].includes(S.view) ? '' : viewTabs());
  bind();
  updateSaveBar();
}
// Aggiorna senza perdere il cursore nei campi di testo
function refresh(){
  if (S.view === 'edit' && document.activeElement && document.activeElement.matches('input.t,textarea.t')){ syncEdit(); return; }
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

function viewTabs(){
  const nComp = items().filter(i => i.status === 'compilare').length;
  const nBozze = items().filter(i => i.status === 'bozza').length;
  const t = (v, ic, label, badge) => `<button data-go="${v}" class="${S.view===v?'on':''}">${ic}${label}${badge?`<span class="badge">${badge}</span>`:''}</button>`;
  return `<nav class="tabs"><div class="in">${t('foto', I.cam, 'Foto', S.folder && S.folder.photos.length ? S.folder.photos.length : '')}${t('items', I.list, 'Articoli', nComp)}${t('publish', I.send, 'Pubblica', nBozze)}</div></nav>`;
}
function topBar(title){
  return `<header class="top"><h1>${esc(title)}</h1><span id="savebar" class="savebar"></span>${S.authed ? '' : '<button class="pill-btn" data-act="settings">Attiva</button>'}<button class="iconbtn" data-act="help" aria-label="Aiuto">?</button><button class="iconbtn" data-act="settings" aria-label="Impostazioni">${I.gear}</button></header>`;
}
function thumbsHtml(photos, uploads, mode, id){
  const ph = photos.map((p, i) => `<div class="thumb"><img loading="lazy" src="${esc(p.url)}" alt=""><span class="n">${i+1}</span>
    <div class="tools"><button data-ph="first" data-i="${i}" data-id="${id||''}" data-m="${mode}" aria-label="Metti come copertina">★</button><button data-ph="l" data-i="${i}" data-id="${id||''}" data-m="${mode}" aria-label="Sposta a sinistra">‹</button><button data-ph="r" data-i="${i}" data-id="${id||''}" data-m="${mode}" aria-label="Sposta a destra">›</button><button data-ph="x" data-i="${i}" data-id="${id||''}" data-m="${mode}" aria-label="Elimina" style="color:var(--bad)">✕</button></div></div>`).join('');
  const up = uploads.map(u => `<div class="thumb"><img src="${u.thumb}" alt=""><div class="st" data-up="${u.key}">${u.status==='errore' ? '⚠︎ riprovo…' : u.status==='su' ? Math.round((u.progress||0)*100) + '%' : 'in coda'}</div></div>`).join('');
  return ph + up;
}

function viewFoto(){
  const f = S.folder;
  const n = f ? f.photos.length : 0;
  const ups = f ? pendingFor(f.id) : [];
  const busy = ups.some(u => u.status !== 'errore');
  const errs = ups.some(u => u.status === 'errore');
  return `<div class="wrap">${topBar('Nuovo articolo')}
    <div class="card stack">
      <div class="row"><div class="grow"><div class="counter">${n}${ups.length ? `<span class="muted" style="font-size:22px"> +${ups.length}</span>`:''}</div>
      <div class="muted small">foto${busy ? ' · caricamento…' : ''}</div></div>
      ${f && (n || ups.length) ? `<button class="btn danger" data-act="discard">Scarta</button>` : ''}</div>
      <div class="two">
        <button class="btn primary big" data-act="cam">${I.cam}Scatta</button>
        <button class="btn soft big" data-act="gal">${I.gal}Galleria</button>
      </div>
      ${n || ups.length ? `<div class="thumbs">${thumbsHtml(f.photos, ups, 'folder')}</div>` : ''}
      ${errs ? `<button class="btn block" data-act="retry">Riprova ora</button>` : ''}
      <button class="btn primary block big" data-act="close" ${!n || busy ? 'disabled' : ''}>${busy ? 'Caricamento…' : 'Salva articolo →'}</button>
    </div>
    ${recentStrip()}
  </div>`;
}
function recentStrip(){
  const todo = items().filter(i => i.status === 'compilare').sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
  if (!todo.length) return '';
  return `<h3 style="margin:22px 0 10px;font-size:16px">Da compilare</h3><div class="list">${todo.map(itemRow).join('')}</div>`;
}
// Spunte di stato: Da creare → Bozza → Pubblicata → Venduta
const STEPS = [['crea','Da creare'],['bozza','Bozza'],['online','Pubblicata'],['venduto','Venduta']];
const stepIndex = (st) => ({compilare:0, pronto:0, bozza:1, online:2, venduto:3})[st] ?? 0;
function stepsMini(it){
  const cur = stepIndex(it.status);
  return `<span class="steps">${STEPS.map(([k,l], i) => `<span class="${i < cur ? 'done' : i === cur ? 'cur' : ''}">${i <= cur ? '✓ ' : ''}${l}</span>`).join('')}</span>`;
}
function stepsTracker(it){
  const cur = stepIndex(it.status);
  return `<div class="tracker">${STEPS.map(([k,l], i) => `<button type="button" data-step="${k}" class="${i < cur ? 'done' : i === cur ? 'cur' : ''}" aria-pressed="${i <= cur}"><span class="box">${i <= cur ? '✓' : ''}</span>${l}</button>`).join('')}</div>`;
}
function itemRow(it){
  const cover = it.photos && it.photos[0];
  return `<button class="it" data-open="${it.id}">
    ${cover ? `<img loading="lazy" src="${esc(cover.url)}" alt="">` : `<span class="ph"></span>`}
    <span class="grow"><div class="ti">${esc(it.title || [it.brand, it.category].filter(Boolean).join(' ') || 'Senza titolo')}</div>
    <div class="small muted" style="margin:2px 0 5px">${esc([it.size && 'Tg ' + it.size, it.owner].filter(Boolean).join(' · '))}${it.photos ? ` · ${it.photos.length} foto` : ''}</div>
    ${stepsMini(it)}</span>
    <span class="price">${it.status === 'venduto' && it.soldPrice ? esc(it.soldPrice) + ' €' : it.price ? esc(it.price) + ' €' : ''}</span>
  </button>`;
}

function viewItems(){
  const filters = [['attivi','Attivi'],['crea','Da creare'],['bozza','Bozze'],['online','Pubblicate'],['venduto','Vendute'],['tutti','Tutti']];
  const q = S.q.trim().toLowerCase();
  let list = items().filter(i => i.status !== 'foto');
  if (S.filter === 'attivi') list = list.filter(i => i.status !== 'venduto');
  else if (S.filter === 'crea') list = list.filter(i => stepIndex(i.status) === 0);
  else if (S.filter !== 'tutti') list = list.filter(i => i.status === S.filter);
  if (q) list = list.filter(i => [i.title, i.brand, i.category, i.size, i.owner, i.location, i.notes].join(' ').toLowerCase().includes(q));
  list.sort((a,b) => (b.updatedAt||b.createdAt) - (a.updatedAt||a.createdAt));
  const all = items();
  const sold = all.filter(i => i.status === 'venduto');
  const incasso = sold.reduce((s,i) => s + num(i.soldPrice || i.price), 0);
  const costi = sold.reduce((s,i) => s + num(i.cost), 0);
  return `<div class="wrap">${topBar('Articoli')}
    <input class="t" id="q" placeholder="Cerca brand, titolo, taglia…" value="${esc(S.q)}" style="margin-bottom:10px">
    <div class="chips scroll" style="margin-bottom:12px">${filters.map(([k,l]) => `<button class="chip ${S.filter===k?'on':''}" data-filter="${k}">${l} <span class="small" style="opacity:.7">${countFor(k)}</span></button>`).join('')}</div>
    ${list.length ? `<div class="list">${list.map(itemRow).join('')}</div>` : `<div class="empty">Nessun articolo qui.</div>`}
    ${sold.length ? `<div class="card small muted" style="margin-top:16px">Venduti: <b>${sold.length}</b> · Incasso <b>${fmt(incasso)} €</b>${costi ? ` · Guadagno <b>${fmt(incasso - costi)} €</b>` : ''}</div>` : ''}
  </div>`;
}
const num = (v) => { const n = parseFloat(String(v||'').replace(',', '.')); return isFinite(n) ? n : 0; };
const fmt = (n) => n.toLocaleString('it-IT', {maximumFractionDigits:2});
function countFor(k){
  const l = items().filter(i => i.status !== 'foto');
  if (k === 'tutti') return l.length;
  if (k === 'attivi') return l.filter(i => i.status !== 'venduto').length;
  if (k === 'crea') return l.filter(i => stepIndex(i.status) === 0).length;
  return l.filter(i => i.status === k).length;
}

function viewPublish(){
  const bozze = items().filter(i => i.status === 'bozza').sort((a,b) => (a.draftAt||a.createdAt) - (b.draftAt||b.createdAt));
  const pronti = items().filter(i => i.status === 'pronto').sort((a,b) => a.createdAt - b.createdAt);
  const today = new Date().toDateString();
  const pubOggi = items().filter(i => i.publishedAt && new Date(i.publishedAt).toDateString() === today);
  const profile = (S.db.settings || {}).vintedProfile;
  const next = bozze[0];
  return `<div class="wrap">${topBar('Pubblica')}
    <div class="card stack ${next ? 'today' : ''}">
      <div class="row"><b class="grow">Oggi</b>${pubOggi.length ? `<span class="small muted">${pubOggi.length} pubblicat${pubOggi.length === 1 ? 'a' : 'e'} ✓</span>` : ''}</div>
      ${next ? `<div class="list">${itemRow(next)}</div>
        <div class="two"><a class="btn" href="https://www.vinted.it/" target="_blank" rel="noopener">${I.ext}Apri Vinted</a>
        <button class="btn primary" data-act="published" data-id="${next.id}">Pubblicato ✓</button></div>`
      : `<div class="muted small">Nessuna bozza in coda.</div>`}
    </div>
    <h3 style="margin:22px 0 10px;font-size:16px">Bozze (${bozze.length})</h3>
    ${bozze.length ? `<div class="list">${bozze.map(itemRow).join('')}</div>` : '<div class="muted small">—</div>'}
    <h3 style="margin:22px 0 10px;font-size:16px">Pronti da copiare (${pronti.length})</h3>
    ${pronti.length ? `<div class="list">${pronti.map(itemRow).join('')}</div>` : '<div class="muted small">—</div>'}
    <div class="card stack" style="margin-top:22px">
      <b>Redrip</b>
      <div class="two">${profile ? `<a class="btn" href="${esc(profile)}" target="_blank" rel="noopener">${I.ext}Il mio guardaroba</a>` : `<button class="btn" data-act="settings">Imposta profilo</button>`}
      <a class="btn" href="https://chromewebstore.google.com/search/redrip" target="_blank" rel="noopener">${I.ext}Redrip</a></div>
    </div>
  </div>`;
}

function chipGroup(field, options, value, multi=false){
  const vals = multi ? (value || []) : [value];
  return `<div class="chips">${options.map(o => `<button type="button" class="chip ${vals.includes(o)?'on':''}" data-chip="${field}" data-v="${esc(o)}" ${multi?'data-multi="1"':''}>${esc(o)}</button>`).join('')}</div>`;
}
function viewEdit(){
  const it = S.db.items[S.editId];
  const ups = pendingFor(it.id);
  const owners = [...new Set([S.me, ...items().map(i => i.owner).filter(Boolean)])];
  const tf = (k, label, ph='', mode='text', extra='') => `<div class="field"><label class="f" for="f_${k}">${label}</label><input class="t" id="f_${k}" data-f="${k}" type="text" ${mode==='num'?'inputmode="decimal"':''} placeholder="${esc(ph)}" value="${esc(it[k])}" ${extra}></div>`;
  return `<div class="wrap">
    <div class="sub"><button class="iconbtn" data-act="back" aria-label="Indietro">${I.back}</button><h2>${esc(it.title || 'Scheda articolo')}</h2><span id="savebar" class="savebar"></span></div>
    <div class="card stack">
      <div class="row"><span class="grow small muted">${it.photos.length} foto${it.createdBy ? ' · di ' + esc(it.createdBy) : ''}</span></div>
      <div class="thumbs">${thumbsHtml(it.photos, ups, 'item', it.id)}</div>
      <div class="two"><button class="btn soft" data-act="cam-item">${I.cam}Scatta</button><button class="btn soft" data-act="gal-item">${I.gal}Galleria</button></div>
    </div>
    <button class="btn primary block big" data-act="copymode" style="margin:14px 0">${I.copy}Copia su Vinted</button>
    <div class="card">
      ${tf('title', 'Titolo', 'es. Maglione Zara in lana beige', 'text', 'maxlength="100"')}
      <div class="small muted" style="margin-top:4px;display:flex;justify-content:space-between"><span id="tcount">${(it.title||'').length}/100</span><button type="button" class="small" style="color:var(--acc);font-weight:600" data-act="gentitle">Genera</button></div>
      ${tf('brand', 'Brand', 'es. Zara')}
      ${tf('category', 'Categoria', 'es. Maglione, Jeans, Vestito…')}
      <div class="field"><label class="f">Taglia</label>${chipGroup('size', TAGLIE, it.size)}<input class="t" style="margin-top:8px" data-f="size" id="f_size" placeholder="Altra taglia (es. 42, W30)" value="${esc(TAGLIE.includes(it.size) ? '' : it.size)}"></div>
      <div class="field"><label class="f">Condizioni</label>${chipGroup('condition', CONDIZIONI, it.condition)}</div>
      <div class="field"><label class="f">Colore (max 2)</label>${chipGroup('colors', COLORI, it.colors, true)}</div>
      ${tf('material', 'Materiale (facoltativo)', 'es. 100% cotone')}
      ${tf('measures', 'Misure', 'es. ascelle 52 cm, lungh. 68 cm')}
      <div class="field"><label class="f" for="f_description">Descrizione</label><textarea class="t" id="f_description" data-f="description" placeholder="">${esc(it.description)}</textarea>
        <button type="button" class="btn soft block" style="margin-top:8px" data-act="gendesc">Genera descrizione</button></div>
      <div class="two" style="margin-top:16px">${tf('price', 'Prezzo €', '15', 'num')}${tf('cost', 'Pagato € (privato)', '', 'num')}</div>
      <div class="field"><label class="f">Pacco</label>${chipGroup('parcel', PACCHI, it.parcel)}</div>
      <hr class="sep">
      <div class="field"><label class="f">Di chi è</label>${chipGroup('owner', owners, it.owner)}</div>
      ${tf('location', 'Dove si trova', 'es. scatola 2, armadio camera')}
      ${tf('vintedUrl', 'Link annuncio Vinted', 'https://www.vinted.it/items/…')}
      <div class="field"><label class="f" for="f_notes">Note interne</label><textarea class="t" style="min-height:70px" id="f_notes" data-f="notes" placeholder="Visibili solo a voi">${esc(it.notes)}</textarea></div>
    </div>
    <div class="card stack" style="margin-top:14px">
      <label class="f" style="margin:0">Stato</label>
      ${stepsTracker(it)}

      ${it.status === 'venduto' ? `<div class="two">${tf('soldPrice', 'Venduto a €', it.price || '', 'num')}<div></div></div>` : ''}
      ${it.vintedUrl ? `<a class="btn block" href="${esc(it.vintedUrl)}" target="_blank" rel="noopener">${I.ext}Apri annuncio su Vinted</a>` : ''}
      ${it.status === 'venduto' && it.photos.length ? `<button class="btn block" data-act="freephotos">Cancella foto (libera spazio)</button>` : ''}
      <button class="btn danger block" data-act="delitem">Elimina articolo</button>
    </div>
  </div>`;
}
// Aggiorna i campi della scheda con le modifiche arrivate dall'altro telefono, senza toccare quello che stai scrivendo
function syncEdit(){
  const it = S.db.items[S.editId]; if (!it) return;
  const pendingKeys = new Set(S.ops.filter(o => o.op === 'upsert' && o.id === it.id).flatMap(o => Object.keys(o.data)));
  document.querySelectorAll('[data-f]').forEach(el => {
    const k = el.dataset.f; if (el === document.activeElement || pendingKeys.has(k)) return;
    const v = k === 'size' && TAGLIE.includes(it.size) ? '' : (it[k] ?? '');
    if (el.value !== String(v)) el.value = v;
  });
  updateSaveBar();
}

function copyFields(it){
  const R = (k, label, value, kind='copy', hint='') => ({k, label, value, kind, hint});
  return [
    R('foto', 'Foto', `${it.photos.length} foto`, 'photos'),
    R('title', 'Titolo', it.title),
    R('description', 'Descrizione', it.description),
    R('category', 'Categoria', it.category),
    R('brand', 'Brand', it.brand),
    R('size', 'Taglia', it.size, 'rem'),
    R('condition', 'Condizioni', it.condition, 'rem'),
    R('colors', 'Colore', (it.colors||[]).join(', '), 'rem'),
    R('material', 'Materiale', it.material, 'copy'),
    R('price', 'Prezzo', it.price),
    R('parcel', 'Pacco', it.parcel, 'rem'),
  ].filter(f => f.kind === 'photos' || f.value);
}
function markCopied(id, k){
  (S.copied[id] ||= new Set()).add(k);
  if (S.view === 'copy') { const y = scrollY; render(); scrollTo(0, y); const n = $('.copyrow.next'); if (n) n.scrollIntoView({block:'center', behavior:'smooth'}); }
}
function viewCopy(){
  const it = S.db.items[S.editId];
  const done = S.copied[it.id] || new Set();
  const fields = copyFields(it);
  const nextK = (fields.find(f => !done.has(f.k)) || {}).k;
  const missing = [!it.title && 'titolo', !it.description && 'descrizione', !it.price && 'prezzo', !it.condition && 'condizioni', !it.size && 'taglia'].filter(Boolean);
  return `<div class="wrap">
    <div class="sub"><button class="iconbtn" data-act="back" aria-label="Indietro">${I.back}</button><h2>Copia su Vinted</h2><button class="iconbtn" data-act="help" aria-label="Aiuto">?</button></div>
    ${missing.length ? `<div class="hint" style="margin-bottom:12px;color:var(--warn)">Mancano: ${missing.join(', ')}</div>` : ''}
    ${fields.map(f => {
      const cls = `copyrow ${done.has(f.k) ? 'done' : ''} ${f.k === nextK ? 'next' : ''}`;
      if (f.kind === 'photos') return `<div class="${cls}" style="flex-wrap:wrap"><span class="grow"><div class="k">${f.label}</div><div class="v">${esc(f.value)}</div></span>
        <button class="btn soft" data-act="dl" style="min-height:44px">${I.dl}Scarica</button>${navigator.canShare ? `<button class="btn soft" data-act="shareph" style="min-height:44px">${I.share}</button>` : ''}</div>`;
      return `<button class="${cls}" data-copy="${f.k}" data-kind="${f.kind}"><span class="grow"><div class="k">${f.label}${f.hint ? ` · <span style="text-transform:none;font-weight:500">${f.hint}</span>` : ''}</div><div class="v">${esc(f.value)}</div></span>
        <span class="go ${f.kind==='rem'?'rem':''}">${done.has(f.k) ? '✓' : f.kind === 'rem' ? 'Scegli' : 'Copia'}</span></button>`;
    }).join('')}
    <div class="card stack" style="margin-top:16px">
      <div class="two"><button class="btn soft" data-act="mark-bozza">Salvata bozza</button><button class="btn primary" data-act="mark-online">Pubblicato</button></div>
      <button class="btn block" data-act="resetcopy">Ricomincia</button>
    </div>
  </div>`;
}

function helpSheet(){
  const Q = (t, b) => `<details class="help"><summary>${t}</summary><div>${b}</div></details>`;
  sheet(`<h3>Come funziona</h3>
    ${Q('1 · Foto', 'Tocca <b>Scatta</b> per ogni foto (o <b>Galleria</b>). Su Android puoi anche condividere da Google Foto → <b>Guardaroba</b>. Quando hai finito tocca <b>Salva articolo</b>: il contatore torna a 0.')}
    ${Q('2 · Scheda', 'Compila brand, categoria, taglia, condizioni, colore e prezzo. <b>Genera</b> crea titolo e descrizione. Salva da sola.')}
    ${Q('3 · Copia su Vinted', 'Apri Vinted → Vendi. Nell\'app tocca un campo: è copiato. Incollalo su Vinted e passa al successivo. <b>Scarica</b> salva le foto nel telefono, così le trovi nel selettore di Vinted. Alla fine salva come bozza su Vinted e tocca <b>Salvata bozza</b>.')}
    ${Q('4 · Pubblica', 'In <b>Pubblica</b> trovi la bozza di oggi: su Vinted apri Profilo → Bozze → Carica, poi tocca <b>Pubblicato</b>.')}
    ${Q('Spunte di stato', 'Da creare → Bozza → Pubblicata → Venduta. Toccale nella scheda per cambiare stato.')}
    ${Q('Redrip', 'Si usa dal computer in Chrome sul tuo guardaroba Vinted. Imposta il link del profilo in ⚙︎.')}
    ${Q('Installare l\'app', 'Android: Chrome → ⋮ → Installa app. iPhone: Safari → Condividi → Aggiungi a Home.')}
    ${Q('Qualità foto', 'A 100 la foto resta identica all\'originale del telefono. Sotto 100 viene ricompressa alla stessa risoluzione per occupare meno spazio.')}
    ${Q('Sicurezza dei dati', 'Ogni foto resta salvata sul telefono finché non è online, anche se chiudi l\'app. Articoli e foto eliminati restano nel cestino 30 giorni. Anche dopo l\'eliminazione definitiva le foto restano recuperabili altri 14 giorni. Ogni giorno viene fatto un backup automatico (ultimi 60 giorni) e puoi esportare tutto in un file.')}
    ${Q('In due', 'Aprite lo stesso link: le modifiche dell\'altro arrivano in meno di un minuto.')}
    <button class="btn primary block" style="margin-top:14px" data-close>OK</button>`).addEventListener('click', e => { if (e.target.closest('[data-close]')) e.currentTarget.remove(); });
}
function applyTheme(){
  const t = LS.get('theme', 'auto');
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
function needActivation(){
  toast('Attiva l\'app con il codice');
  settingsSheet();
}
async function activate(code, name){
  const r = await fetch('/api/login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({code}), credentials:'same-origin'});
  if (!r.ok) throw new Error('Codice errato');
  if (name){ S.me = name; LS.set('me', name); }
  S.authed = true;
  await pull(); flush(); restorePending(); drainInbox();
}
function settingsSheet(){
  const st = S.db.settings || {};
  const sp = storageStats();
  const local = {theme: LS.get('theme','auto'), parcel: st.defaultParcel || ''};
  const q0 = photoQuality();
  const nTrash = Object.keys((S.db.trash || {}).items || {}).length + ((S.db.trash || {}).photos || []).length;
  const opt = (key, list, cur) => `<div class="chips">${list.map(([v,l]) => `<button type="button" class="chip ${String(cur)===String(v)?'on':''}" data-sopt="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const s = sheet(`<h3>Impostazioni</h3>
    <div class="sec"><h4>Tu</h4>
      <input class="t" id="s_me" placeholder="Il tuo nome" value="${esc(S.me)}">
    </div>
    <div class="sec"><h4>Vinted</h4>
      <div class="field"><label class="f">Link profilo (per Redrip)</label><input class="t" id="s_prof" placeholder="https://www.vinted.it/member/…" value="${esc(st.vintedProfile)}"></div>
      <div class="field"><label class="f">Pacco predefinito</label>${opt('parcel', [['','Nessuno'],['Piccolo','Piccolo'],['Medio','Medio'],['Grande','Grande']], local.parcel)}</div>
      <div class="field"><label class="f">Frase finale della descrizione</label><textarea class="t" id="s_footer" style="min-height:80px" placeholder="${esc(DEFAULT_FOOTER)}">${esc(st.descFooter || '')}</textarea></div>
      <label class="switch"><span>Hashtag nella descrizione</span><input type="checkbox" id="s_tags" ${hashtagsOn() ? 'checked' : ''}></label>
    </div>
    <div class="sec"><h4>App</h4>
      <div class="field"><label class="f">Tema</label>${opt('theme', [['auto','Automatico'],['light','Chiaro'],['dark','Scuro']], local.theme)}</div>
      <div class="field"><label class="f" for="s_qn">Qualità foto (0–100)</label>
        <div class="qbox"><input type="range" id="s_q" min="0" max="100" step="1" value="${q0}"><input class="t" type="number" id="s_qn" min="0" max="100" step="1" inputmode="numeric" value="${q0}"></div>
        <div class="small muted" id="s_qh">${qualityHint(q0)}</div></div>
      ${S.installEvt ? `<button class="btn block" data-a="install" style="margin-top:12px">Installa app</button>` : ''}
    </div>
    <div class="sec"><h4>Dati e backup</h4>
      <div class="meter"><span style="width:${Math.min(100, sp.pct)}%"></span></div>
      <div class="small muted" style="margin-top:6px">${sp.usedMB} MB di ${sp.limitMB} MB · ancora circa <b>${sp.left}</b> foto${nTrash ? ` · cestino ${sp.trashMB} MB` : ''}</div>
      <div class="two" style="margin-top:12px"><button class="btn" data-a="trash">Cestino${nTrash ? ` (${nTrash})` : ''}</button><button class="btn" data-a="backups">Backup</button></div>
      <div class="two" style="margin-top:10px"><button class="btn" data-a="export">Esporta</button><button class="btn" data-a="import">Importa</button></div>
    </div>
    <button class="btn primary block" data-a="save" style="margin-top:18px">Salva</button>`);
  const qr = $('#s_q', s), qn = $('#s_qn', s), qh = $('#s_qh', s);
  const setQ = (v) => { v = Math.max(0, Math.min(100, Math.round(+v || 0))); qr.value = v; qn.value = v; qh.textContent = qualityHint(v); return v; };
  qr.addEventListener('input', () => setQ(qr.value));
  qn.addEventListener('change', () => setQ(qn.value));
  s.addEventListener('click', async e => {
    const c = e.target.closest('[data-sopt]');
    if (c){
      local[c.dataset.sopt] = c.dataset.v;
      c.parentElement.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
      if (c.dataset.sopt === 'theme'){ LS.set('theme', local.theme); applyTheme(); }
      return;
    }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a;
    if (act === 'activate'){
      a.disabled = true; $('#s_err', s).textContent = '';
      try{
        await activate($('#s_code', s).value, $('#s_me', s).value.trim());
        s.remove(); render(); toast('App attivata ✓'); settingsSheet();
      }catch(err){ $('#s_err', s).textContent = err.message; a.disabled = false; }
    } else if (act === 'logout'){
      await fetch('/api/logout', {method:'POST'}); S.authed = false; s.remove(); render(); toast('Disattivata su questo dispositivo');
    } else if (act === 'trash'){ s.remove(); trashSheet();
    } else if (act === 'backups'){ s.remove(); backupsSheet();
    } else if (act === 'export'){ exportBackup();
    } else if (act === 'import'){ importBackup();
    } else if (act === 'install'){
      S.installEvt.prompt(); S.installEvt = null; a.remove();
    } else if (act === 'save'){
      const me = $('#s_me', s).value.trim(); if (me){ S.me = me; LS.set('me', me); }
      LS.set('photoQ', setQ(qn.value));
      const data = {};
      const prof = $('#s_prof', s).value.trim(); if (prof !== (st.vintedProfile || '')) data.vintedProfile = prof;
      if (local.parcel !== (st.defaultParcel || '')) data.defaultParcel = local.parcel;
      const footer = $('#s_footer', s).value.trim(); if (footer !== (st.descFooter || '')) data.descFooter = footer;
      const tags = $('#s_tags', s).checked; if (tags !== hashtagsOn()) data.hashtags = tags ? 'true' : 'false';
      if (Object.keys(data).length) queue({op:'settings', data});
      s.remove(); render(); toast('Salvato');
    }
  });
}

// ====================== Eventi ======================
let pickTarget = {kind:'folder'};
function bind(){
  const app = $('#app');
  app.onclick = async (e) => {
    const t = e.target.closest('button,[data-open]'); if (!t) return;
    const d = t.dataset;
    if (d.go) return go(d.go);
    if (d.open) return openEdit(d.open);
    if (d.filter){ S.filter = d.filter; LS.set('filter', d.filter); return render(); }
    if (d.ph){
      const i = +d.i;
      if (d.m === 'folder'){ if (d.ph==='l') folderMove(i,-1); if (d.ph==='r') folderMove(i,1); if (d.ph==='first') folderFirst(i); if (d.ph==='x') folderDel(i); }
      else { if (d.ph==='l') itemMove(d.id,i,-1); if (d.ph==='r') itemMove(d.id,i,1); if (d.ph==='first') itemFirst(d.id,i); if (d.ph==='x') itemDelPhoto(d.id,i); }
      return;
    }
    if (d.chip){
      const it = S.db.items[S.editId]; const f = d.chip, v = d.v;
      let val;
      if (d.multi){ const cur = (it[f]||[]).slice(); const i = cur.indexOf(v); if (i>=0) cur.splice(i,1); else { cur.push(v); if (cur.length > 2) cur.shift(); } val = cur; }
      else val = it[f] === v ? '' : v;
      queue({op:'upsert', id:it.id, data:{[f]:val}});
      if (it.status === 'compilare' && readyEnough({...it, [f]:val})) queue({op:'upsert', id:it.id, data:{status:'pronto'}});
      return refreshKeep();
    }
    if (d.step){
      const it = S.db.items[S.editId];
      const map = {crea: readyEnough(it) ? 'pronto' : 'compilare', bozza:'bozza', online:'online', venduto:'venduto'};
      const st = map[d.step];
      if (st === 'venduto') setStatus(it.id, 'venduto', {soldPrice: it.soldPrice || it.price || ''});
      else setStatus(it.id, st);
      toast(`Stato: ${STEPS.find(x => x[0] === d.step)[1]}`);
      return;
    }
    if (d.status){
      if (d.status === 'venduto') setStatus(S.editId, 'venduto', {soldPrice: S.db.items[S.editId].soldPrice || S.db.items[S.editId].price || ''});
      else setStatus(S.editId, d.status);
      return;
    }
    if (d.copy){
      const it = S.db.items[S.editId]; const f = copyFields(it).find(x => x.k === d.copy);
      if (d.kind === 'rem'){ markCopied(it.id, d.copy); toast(`Su Vinted scegli: ${f.value}`); return; }
      const ok = await copyText(f.value);
      if (ok){ markCopied(it.id, d.copy); toast(`${f.label} copiato`); } else toast('Copia non riuscita');
      return;
    }
    switch (d.act){
      case 'cam': if (!S.authed) return needActivation(); pickTarget = {kind:'folder'}; $('#camIn').click(); break;
      case 'gal': if (!S.authed) return needActivation(); pickTarget = {kind:'folder'}; $('#galIn').click(); break;
      case 'cam-item': if (!S.authed) return needActivation(); pickTarget = {kind:'item', id:S.editId}; $('#camIn').click(); break;
      case 'gal-item': if (!S.authed) return needActivation(); pickTarget = {kind:'item', id:S.editId}; $('#galIn').click(); break;
      case 'close': closeFolder(); break;
      case 'discard': discardFolder(); break;
      case 'retry': retryUploads(); break;
      case 'install': S.installEvt.prompt(); S.installEvt = null; render(); break;
      case 'settings': settingsSheet(); break;
      case 'help': helpSheet(); break;
      case 'back': (history.state && history.state.v) ? history.back() : go(LS.get('view','items')); break;
      case 'copymode': await flush(); go('copy'); break;
      case 'dl': downloadPhotos(S.editId); break;
      case 'shareph': sharePhotos(S.editId); break;
      case 'mark-bozza': setStatus(S.editId, 'bozza'); toast('Segnato come bozza su Vinted'); backToList(); break;
      case 'mark-online': setStatus(S.editId, 'online'); toast('Segnato come pubblicato'); backToList(); break;
      case 'resetcopy': delete S.copied[S.editId]; render(); break;
      case 'published': setStatus(d.id, 'online'); toast('Pubblicato ✓ — a domani!'); break;
      case 'gendesc': {
        const it = S.db.items[S.editId];
        if (it.description && !(await ask('Sostituire la descrizione attuale?', 'Sostituisci'))) break;
        queue({op:'upsert', id:it.id, data:{description:buildDescription(it)}}); refreshKeep(true); break;
      }
      case 'gentitle': {
        const it = S.db.items[S.editId]; const t = buildTitle(it);
        if (!t) { toast('Compila prima brand, categoria o taglia'); break; }
        queue({op:'upsert', id:it.id, data:{title:t}}); refreshKeep(true); break;
      }
      case 'delitem': deleteItem(S.editId); break;
      case 'freephotos': freePhotos(S.editId); break;
    }
  };
  app.oninput = (e) => {
    const el = e.target;
    if (el.id === 'q'){ S.q = el.value; const pos = el.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos,pos); return; }
    if (el.dataset.f){
      const it = S.db.items[S.editId]; const k = el.dataset.f;
      queue({op:'upsert', id:it.id, data:{[k]:el.value}});
      if (k === 'title'){ const c = $('#tcount'); if (c) c.textContent = `${el.value.length}/100`; }
      if (it.status === 'compilare' && readyEnough(S.db.items[it.id])) queue({op:'upsert', id:it.id, data:{status:'pronto'}});
      scheduleFlush(1200);
    }
  };
}
function readyEnough(it){ return !!(it.title && it.description && it.price && it.condition && it.size); }
function refreshKeep(force){ if (force && document.activeElement) document.activeElement.blur(); const y = scrollY; render(); scrollTo(0, y); }

['camIn','galIn'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    const files = e.target.files; if (files && files.length) addFiles(files, pickTarget);
    e.target.value = '';
  });
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; if (S.view === 'foto') refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden){ pull(); drainInbox(); retryUploads(); flush(); } else flush(); });
window.addEventListener('online', () => { toast('Di nuovo online'); retryUploads(); flush(); });
window.addEventListener('pagehide', () => { if (S.ops.length) flush(); });
window.addEventListener('beforeunload', (e) => { if (S.uploads.some(u => u.status !== 'errore')){ e.preventDefault(); e.returnValue = ''; } });

// ====================== Avvio ======================
async function start(){
  const sending = LS.get('opsSending', []);
  if (sending.length){ S.ops = sending.concat(S.ops); LS.set('opsSending', []); persistOps(); }
  for (const op of S.ops) applyLocal(op);
  render();
  if (S.authed){ flush(); restorePending(); }
  pull(); drainInbox();
  const p = new URLSearchParams(location.search);
  if (p.has('shared')) history.replaceState(null, '', '/');
}
(async function boot(){
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  applyTheme();
  S.authed = true;
  start();
  setInterval(pull, 12000);
})();
