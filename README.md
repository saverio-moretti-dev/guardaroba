# Vinted-manager — "Guardaroba"

Gestionale condiviso (PWA) per preparare e tracciare le vendite su Vinted.

- **Foto**: scatta o condividi da Google Foto → cartella con contatore → "Salva articolo".
- **Scheda**: brand, categoria, taglia, condizioni, colori, prezzo; titolo e descrizione generati.
- **Copia su Vinted**: un tocco per campo, foto scaricabili sul telefono.
- **Stato**: Da creare → Bozza → Pubblicata → Venduta.
- **Pubblica**: una bozza al giorno.

## Stack
- Frontend statico in `public/` (HTML + JS vanilla, service worker con Web Share Target).
- Funzioni Vercel in `api/` (Node, ESM).
- Dati e foto su Vercel Blob (un file JSON con scritture condizionate + foto originali, senza perdita a qualità 100).

## Deploy
- Ogni push su `main` va online da solo su (indirizzo privato) (progetto Vercel collegato al repository).

## Variabili d'ambiente (Vercel)
- `APP_CODE` — non è più un codice d'accesso, ma serve a calcolare il percorso del database: non cambiarlo.
- `BLOB_READ_WRITE_TOKEN` — creato collegando lo store Blob al progetto.

## Limiti del piano gratuito Vercel Blob
1 GB, 2.000 scritture/mese. Ogni foto = 1 scrittura, ogni salvataggio scheda = 1 scrittura.

## Foto e sicurezza dei dati
- Qualità 100 (predefinita): la foto caricata è identica byte per byte all'originale. Sotto 100: stessa risoluzione, ricompressa.
- Le foto vanno dal telefono direttamente a Vercel Blob (`api/upload.js` rilascia un permesso per singola foto): nessun limite di 4,5 MB.
- Coda persistente: foto e modifiche restano sul telefono finché non sono online (anche dopo chiusura/riavvio).
- Cestino 30 giorni; dopo l'eliminazione definitiva i file restano altri 14 giorni (un ripristino li salva).
- Backup automatico giornaliero del database (ultimi 60), copia di sicurezza prima di ogni ripristino, esporta/importa JSON.
- Accesso libero: chiunque abbia il link può usare l'app.

## Test
- `node --test test/lib.test.mjs` — logica dati (cestino, backup, concorrenza, import)
- `node test/mock-server.mjs 8787` + `IMG=<cartella immagini> node test/e2e.mjs` — collaudo completo nel browser
