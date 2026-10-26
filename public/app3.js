'use strict';
// ====================== Qualità, spazio, cestino, backup ======================
function qualityHint(q){
  if (q >= 100) return 'Originale: file identico a quello del telefono, nessuna perdita.';
  const saving = Math.round(15 + (99 - q) * 0.45); // stima indicativa sul file originale
  return `Stessa risoluzione, ricompressa: circa ${saving}% di spazio in meno.`;
}

const LIMIT_MB = 1000;
const AVG_PHOTO = 4 * 1024 * 1024; // stima per foto senza dimensione nota (Pixel 12 MP ≈ 3–5 MB)
function storageStats(){
  const db = S.db || {};
  const sizes = [], trashSizes = [];
  for (const it of Object.values(db.items || {})) for (const p of it.photos || []) sizes.push(p.size || 0);
  for (const it of Object.values((db.trash || {}).items || {})) for (const p of it.photos || []) trashSizes.push(p.size || 0);
  for (const p of (db.trash || {}).photos || []) trashSizes.push(p.size || 0);
  for (const p of (S.folder || {}).photos || []) sizes.push(p.size || 0);
  for (const p of db.purgeQueue || []) trashSizes.push(p.size || 0); // eliminate, file ancora tenuti 14 giorni
  const known = [...sizes, ...trashSizes].filter(Boolean);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : AVG_PHOTO;
  const sum = (arr) => arr.reduce((a, b) => a + (b || avg), 0);
  const used = sum(sizes) + sum(trashSizes);
  const usedMB = Math.round(used / 1048576);
  const left = Math.max(0, Math.floor((LIMIT_MB * 1048576 - used) / avg));
  return {usedMB, limitMB: LIMIT_MB, pct: used / (LIMIT_MB * 1048576) * 100, left, trashMB: Math.round(sum(trashSizes) / 1048576), avgMB: avg / 1048576};
}

const fmtDate = (t) => new Date(t).toLocaleDateString('it-IT', {day:'numeric', month:'short'}) + ' ' + new Date(t).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
const daysLeft = (t) => Math.max(0, 30 - Math.floor((Date.now() - t) / 864e5));

function trashSheet(){
  const T = (S.db.trash || {items:{}, photos:[]});
  const its = Object.values(T.items || {}).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const phs = (T.photos || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
  const s = sheet(`<h3>Cestino</h3>
    <div class="small muted" style="margin-bottom:12px">Gli elementi restano qui 30 giorni. Anche dopo l'eliminazione le foto si possono ancora recuperare per 14 giorni con un backup.</div>
    ${!its.length && !phs.length ? '<div class="empty">Il cestino è vuoto.</div>' : ''}
    ${its.length ? `<h4 class="lbl">Articoli (${its.length})</h4><div class="list">${its.map(it => `
      <div class="it" style="cursor:default">
        ${it.photos && it.photos[0] ? miniImg(it.photos[0].url, 256) : '<span class="ph"></span>'}
        <span class="grow"><div class="ti">${esc(it.title || [it.brand, it.category].filter(Boolean).join(' ') || 'Senza titolo')}</div>
        <div class="small muted">${(it.photos || []).length} foto · ancora ${daysLeft(it.deletedAt)} giorni</div></span>
        <button class="btn soft" style="min-height:40px;padding:0 12px" data-t="restore" data-id="${it.id}">Ripristina</button>
      </div>`).join('')}</div>` : ''}
    ${phs.length ? `<h4 class="lbl">Foto (${phs.length})</h4><div class="thumbs">${phs.map(p => `
      <div class="thumb">${miniImg(p.url)}
        <div class="tools" style="justify-content:center"><button data-t="restorePhoto" data-url="${esc(p.url)}" ${S.db.items[p.itemId] ? '' : 'disabled title="Articolo non disponibile"'} aria-label="Ripristina" style="width:auto;padding:0 8px;font-size:12px">↺</button></div></div>`).join('')}</div>` : ''}
    ${its.length || phs.length ? `<button class="btn danger block" data-t="empty" style="margin-top:16px">Svuota cestino ora</button>` : ''}
    <button class="btn block" data-t="close" style="margin-top:10px">Chiudi</button>`);
  s.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = b.dataset.t;
    if (t === 'close') return s.remove();
    if (t === 'restore'){ queue({op:'restore', id:b.dataset.id}); toast('Articolo ripristinato'); }
    if (t === 'restorePhoto'){ queue({op:'restorePhoto', url:b.dataset.url}); toast('Foto ripristinata'); }
    if (t === 'empty'){
      if (!(await ask('Svuotare il cestino? Lo spazio si libera tra 14 giorni; fino ad allora un backup può ancora recuperare tutto.', 'Svuota'))) return;
      queue({op:'emptyTrash'}); toast('Cestino svuotato');
    }
    s.remove(); refresh(); setTimeout(trashSheet, 50);
  });
}

async function backupsSheet(){
  if (!S.authed) return needActivation();
  const s = sheet(`<h3>Backup automatici</h3><div class="small muted" style="margin-bottom:12px">Uno al giorno, conservati 60 giorni. Prima di ogni ripristino viene salvata una copia dello stato attuale.</div><div id="bk"><span class="spin"></span></div><button class="btn block" data-b="close" style="margin-top:14px">Chiudi</button>`);
  s.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'close') return s.remove();
    if (b.dataset.b === 'restore'){
      if (!(await ask(`Sostituire tutti i dati attuali con il backup “${b.dataset.label}”?`, 'Ripristina'))) return;
      try{
        await flush();
        const db = await api('/api/backup', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name:b.dataset.name, by:S.me})});
        S.db.rev = -1; setDb(db); s.remove(); toast('Backup ripristinato ✓');
      }catch(err){ toast('Ripristino non riuscito: ' + err.message); }
    }
  });
  try{
    const {backups} = await api('/api/backup');
    const label = (n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) ? 'Giorno ' + new Date(n.slice(0, 10)).toLocaleDateString('it-IT', {day:'numeric', month:'long', year:'numeric'}) : 'Copia prima di un ripristino';
    $('#bk', s).innerHTML = backups.length ? `<div class="list">${backups.map(b => `
      <div class="it" style="cursor:default"><span class="grow"><div class="ti">${esc(label(b.name))}</div><div class="small muted">salvato ${fmtDate(b.at)} · ${Math.max(1, Math.round(b.size / 1024))} KB</div></span>
      <button class="btn soft" style="min-height:40px;padding:0 12px" data-b="restore" data-name="${esc(b.name)}" data-label="${esc(label(b.name))}">Ripristina</button></div>`).join('')}</div>`
      : '<div class="empty">Nessun backup ancora: il primo viene creato alla prima modifica di domani.</div>';
  }catch(err){ $('#bk', s).innerHTML = `<div class="err">Impossibile leggere i backup: ${esc(err.message)}</div>`; }
}

async function exportBackup(){
  let data = S.db;
  if (S.authed){ try{ await flush(); data = await api('/api/backup?export=1'); }catch{} }
  const blob = new Blob([JSON.stringify({app:'guardaroba', version:1, exportedAt:new Date().toISOString(), ...data}, null, 1)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `guardaroba-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast('Backup scaricato');
}

function importBackup(){
  if (!S.authed) return needActivation();
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    let data;
    try{ data = JSON.parse(await f.text()); if (!data || typeof data.items !== 'object') throw 0; }
    catch{ return toast('File non valido'); }
    const n = Object.keys(data.items).length;
    if (!(await ask(`Sostituire tutti i dati attuali con il file (${n} articoli)? Prima viene salvata una copia dello stato attuale.`, 'Importa'))) return;
    try{
      await flush();
      const db = await api('/api/backup', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({data, by:S.me})});
      S.db.rev = -1; setDb(db); document.querySelectorAll('.sheet-bg').forEach(x => x.remove()); toast('Dati importati ✓');
    }catch(err){ toast('Importazione non riuscita: ' + err.message); }
  };
  inp.click();
}

// Operazioni del mese sul piano gratuito (si azzera il 1° del mese)
const OPS_LIMIT = {adv: 2000, simple: 10000};
function usageHtml(){
  const u = (S.db && S.db.usage) || {adv:0, simple:0, uploads:0, saves:0};
  const row = (label, n, max) => {
    const pct = Math.min(100, n / max * 100);
    return `<div class="small muted" style="margin-top:12px">${label}: <b>${n.toLocaleString('it-IT')}</b> di ${max.toLocaleString('it-IT')}${pct >= 80 ? ' <span class="err">quasi al limite</span>' : ''}</div><div class="meter" style="margin-top:4px"><span style="width:${pct}%${pct >= 80 ? ';background:var(--bad)' : ''}"></span></div>`;
  };
  return row('Scritture questo mese', u.adv || 0, OPS_LIMIT.adv)
    + row('Letture questo mese', u.simple || 0, OPS_LIMIT.simple)
    + `<div class="small muted" style="margin-top:6px">${u.uploads || 0} foto caricate · ${u.saves || 0} salvataggi · si azzera il 1° del mese (stima)</div>`;
}
