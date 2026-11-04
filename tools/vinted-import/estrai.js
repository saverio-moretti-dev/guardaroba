// Da eseguire in una pagina www.vinted.it del PROPRIO account, sessione già aperta in Chrome.
// IDS = id Vinted da scaricare (quelli che stampa `allinea.mjs --diff`); vuoto = l'annuncio aperto nella pagina.
// Per ogni annuncio rilegge la pagina (dati freschi), prende titolo, descrizione e TUTTE le foto in qualità piena
// (non solo le 5 visibili) e scarica vinted-<id>.json in ~/Downloads. Uno ogni 5 s: ritmo umano, mai a raffica.
// Al massimo 5 annunci per esecuzione: lo strumento JS di Chrome va in timeout a 45 s (con 8 è successo).
const IDS = [];
const ids = IDS.length ? IDS : [location.pathname.match(/items\/(\d+)/)[1]];
const out = [];
for (const id of ids) {
  // a volte la pagina arriva incompleta (senza dati prodotto): un secondo tentativo dopo 4 s basta
  let raw, ldEl, page;
  for (let k = 0; k < 2 && !ldEl; k++) {
    if (k) await new Promise((r) => setTimeout(r, 4000));
    raw = await fetch(`/items/${id}`, { credentials: 'include' }).then((r) => r.text());
    page = new DOMParser().parseFromString(raw, 'text/html');
    ldEl = page.querySelector('script[type="application/ld+json"]');
  }
  let ld = ldEl && JSON.parse(ldEl.textContent);
  if (!ld) { // alcuni annunci non hanno mai il blocco ld+json (es. 9498784201): titolo da <title>, descrizione dai dati (stringa doppiamente escapata)
    const m = raw.match(/\\"description\\":(\\"(?:[^\\]|\\\\[^"]|\\\\\\")*?\\")/);
    if (!m) { out.push(`${id} | ERRORE pagina senza dati, riprovare`); continue; }
    ld = { name: page.title.replace(/ \| Vinted$/, ''), description: JSON.parse(JSON.parse('"' + m[1] + '"')) };
  }
  const html = raw.replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
  const s = html.indexOf('[', html.indexOf('"photos":['));
  let d = 0, e = s;
  for (; e < html.length; e++) { const c = html[e]; if (c === '[') d++; else if (c === ']') { d--; if (!d) break; } }
  const ph = JSON.parse(html.slice(s, e + 1)).sort((a, b) => a.image_no - b.image_no);
  const data = { id, title: ld.name, description: ld.description, photos: ph.map((p) => p.full_size_url) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `vinted-${id}.json`;
  a.click();
  out.push(`${id} | ${data.photos.length} foto`);
  if (ids.length > 1) await new Promise((r) => setTimeout(r, 5000));
}
out.join('\n');
