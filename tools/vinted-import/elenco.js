// Da eseguire nella pagina del PROPRIO profilo Vinted (www.vinted.it/member/<id>), sessione aperta in Chrome.
// Seleziona il filtro «Attivi», scorre la pagina come farebbe una persona finché tutti gli annunci sono caricati,
// e scarica vinted-elenco.json in ~/Downloads: [{id, title, price, status}] (status = etichetta tipo «Riservato», o '').
const f = (k) => document.querySelector(`[data-testid="closet-seller-filters-${k}"]`);
const on = () => f('active').getAttribute('aria-pressed') === 'true'; // il filtro è un interruttore: un clic in più lo spegne
if (!on()) { f('active').click(); await new Promise((r) => setTimeout(r, 3000)); }
if (!on()) throw new Error('filtro «Attivi» non selezionato: controllare la pagina');
const links = () => [...document.querySelectorAll('[data-testid^="product-item-id-"][data-testid$="--overlay-link"]')];
// scorrere a passi come una persona: il salto diretto in fondo non fa caricare le pagine successive (40 su 46)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let prev = -1;
for (let i = 0; i < 20 && links().length !== prev; i++) {
  prev = links().length;
  for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await sleep(250); }
  await sleep(4000);
}
if ([...document.querySelectorAll('[data-testid$="--status-text"]')].some((x) => /bozza/i.test(x.innerText)))
  throw new Error('nella lista ci sono bozze: filtro «Attivi» non applicato');
const items = links().map((a) => {
  const id = a.dataset.testid.match(/product-item-id-(\d+)/)[1];
  const q = (s) => document.querySelector(`[data-testid="product-item-id-${id}--${s}"]`)?.innerText.trim() || '';
  return { id, title: (a.title || '').split(', brand:')[0].split(', condizioni:')[0], price: q('price-text'), status: q('status-text') };
});
// totale annunci attivi dichiarato dal profilo (dati della pagina): se non torna, l'elenco è incompleto
const tot = Number(document.documentElement.innerHTML.replace(/\\"/g, '"').match(/"item_count":(\d+)/)?.[1]) || null;
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify({ at: new Date().toISOString(), total: tot, items })], { type: 'application/json' }));
a.download = 'vinted-elenco.json';
a.click();
`${items.length} annunci attivi letti${tot ? ', il profilo ne dichiara ' + tot : ''}`;
