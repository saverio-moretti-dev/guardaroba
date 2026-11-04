# Vinted → cartella → Guardaroba: allineamento ripetibile

**Vinted comanda.** Titolo, descrizione, foto e prezzo degli annunci **attivi** del proprio profilo Vinted sono la
versione giusta: la cartella `vinted-articoli/` (in questa repo, ignorata da git) e l'app Guardaroba si adeguano.
I venduti non si riportano (scelta dell'utente). Le bozze Vinted nemmeno: solo gli annunci in vendita.

Richiesta tipo dell'utente: «allinea Vinted» / «aggiorna guardaroba da Vinted». Si eseguono i passi sotto, senza
chiedere, e alla fine si dice il conteggio.

## Cosa serve
- Chrome con l'estensione **Claude in Chrome** collegata e l'account Vinted già aperto (mai inserire password).
- `.env.local` nella radice della repo con `APP_URL=https://<app>.vercel.app` (ignorato da git: la repo è
  **pubblica** e l'app è aperta a chi conosce l'indirizzo). Se manca, l'indirizzo è nelle sessioni passate:
  `grep -rhoE "https://[a-z0-9-]*(guard|vinted)[a-z0-9-]*\.vercel\.app" ~/.claude/projects/ | sort -u`.
- Profilo Vinted: in `.env.local`, `VINTED_PROFILE=https://www.vinted.it/member/<id>` (tenuto fuori dalla repo
  pubblica per non legare l'account GitHub a quello Vinted). Se manca: l'id è nei dati della home di Vinted
  (`"initialUserState":{"user":{"id":…`).

## Passi
1. **Elenco** — aprire il profilo in Chrome, eseguire `elenco.js` con `javascript_tool`.
   Seleziona il filtro «Attivi», scorre la pagina a passi, scarica `~/Downloads/vinted-elenco.json`.
   Deve dire «N letti, il profilo ne dichiara N»: se i numeri differiscono, rilanciarlo.
2. **Diff** — `node tools/vinted-import/allinea.mjs --diff`
   Sposta l'elenco in `vinted-articoli/elenco.json` e stampa gli annunci da (ri)scaricare: NUOVO (nessuna
   cartella) o TITOLO CAMBIATO. Il confronto è per id Vinted + titolo (una descrizione cambiata a titolo
   uguale non si vede: in quel caso passare a mano l'id al passo 3).
3. **Scarica** — in `estrai.js` mettere gli id in `IDS` (**massimo 5 per volta**), eseguirlo nella pagina Vinted.
   Scarica un `~/Downloads/vinted-<id>.json` per annuncio, uno ogni 5 s. Poi:
   `for f in ~/Downloads/vinted-[0-9]*.json; do python3 -I tools/vinted-import/salva_articolo.py "$f"; done`
   → `vinted-articoli/<id>-<titolo>/` con `testo.txt` (solo titolo + descrizione) e `01.jpg…`. Se la cartella di
   quell'id c'era già, la vecchia va nel Cestino di macOS. Ripetere 2–3 finché il diff dice «Da scaricare: 0».
4. **App** — `node tools/vinted-import/allinea.mjs --dry` (prova), poi senza `--dry` (con un solo id per
   provare il primo, poi tutti). Per ogni annuncio attivo: abbina l'articolo dell'app per `vintedUrl`, o la prima
   volta per titolo esatto; imposta titolo, descrizione, stato **Pubblicata** (`online`), `vintedUrl`, prezzo.
   Le foto si ricaricano solo se il numero è diverso (le vecchie vanno nel cestino dell'app, 30 giorni).
   Un salvataggio per articolo, `by: 'allinea-vinted'`. Articoli dell'app «Pubblicata» senza annuncio attivo:
   **solo elencati**, mai toccati (venduti o tolti: decide l'utente).
5. **Verifica** — rilanciare `--dry`: deve dire «Nuovi 0, aggiornati 0, già in pari N». Poi
   `curl -s $APP_URL/api/db` e contare gli `online` con `vintedUrl`, e che una foto risponda 200.

## Cose imparate (non rifarle)
- **Le foto visibili nella pagina sono solo le prime 5.** L'elenco completo sta nei dati dell'annuncio
  (`"photos":[…]`, `full_size_url`). Errore fatto alla prima prova.
- **Non passare i dati nella risposta dello strumento JS**: oltre qualche riga viene troncata e gli URL firmati si
  rompono. Per questo si scaricano file json.
- **Lo strumento JS di Chrome va in timeout a 45 s**: con 8 annunci è successo (il codice però continua nella pagina).
- **Il filtro «Attivi» è un interruttore**: cliccarlo quando è già acceso lo spegne (e compaiono le bozze).
  `elenco.js` guarda `aria-pressed`.
- **Saltare direttamente in fondo alla pagina non carica tutto** (40 su 46): bisogna scorrere a passi.
- **Alcuni annunci non hanno il blocco `ld+json`** (es. 9498784201, sempre): `estrai.js` prende il titolo da
  `<title>` e la descrizione dai dati della pagina. Altre volte manca solo al primo colpo: c'è un secondo tentativo.
- Dimensione massima delle foto: l'originale caricato (es. 600×800). `f1600` e simili danno 404.
- Le foto arrivano in webp e diventano JPG con `sips` (macOS), comode da passare su iPhone.
- Gli screenshot di Chrome vanno spesso in timeout su Vinted e sull'app: lavorare con JS e verificare via API.
- Vinted vieta lo scraping automatico: **solo il proprio profilo**, dal Chrome dell'utente, a ritmo umano;
  mai chiamate dirette alle API di Vinted.
- Costo sul piano gratuito Vercel Blob (2.000 scritture/mese): circa 1 scrittura per foto + 2–4 per salvataggio.
  Prima esecuzione completa (2026-11-04): 46 annunci, 337 foto.
