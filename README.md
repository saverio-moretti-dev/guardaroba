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
- Dati e foto su Vercel Blob (un file JSON con scritture condizionate + foto JPEG compresse).

## Variabili d'ambiente (Vercel)
- `APP_CODE` — codice di accesso condiviso.
- `BLOB_READ_WRITE_TOKEN` — creato collegando lo store Blob al progetto.

## Limiti del piano gratuito Vercel Blob
1 GB, 2.000 scritture/mese. Ogni foto = 1 scrittura, ogni salvataggio scheda = 1 scrittura.
