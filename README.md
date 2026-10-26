# Guardaroba — gestionale per vendere su Vinted

App web installabile (PWA) per preparare, tracciare e pubblicare le vendite di abbigliamento usato su Vinted.
La uso ogni giorno in due, da due telefoni diversi, sullo stesso archivio.

*English: a shared PWA to prepare and track second-hand clothing listings. Vanilla JS front end, Node
serverless functions on Vercel, Vercel Blob storage with conditional writes, an offline queue and tests.*

## Il problema
Vinted non ha API pubbliche. Preparare un annuncio vuol dire scattare le foto, scegliere marca, taglia,
condizioni e colori, scrivere titolo e descrizione, poi ricopiare tutto a mano nell'app. Fatto in due e
su decine di capi, le schede si perdono, si duplicano e nessuno sa a che punto è ciascun articolo.

## Cosa fa
- **Foto**: scatto dalla fotocamera o condivisione da Google Foto direttamente nell'app (Web Share Target).
- **Caricamento in background**: le foto partono subito e si caricano mentre si continua a lavorare; su Android anche ad app chiusa (Background Sync), su iPhone riprendono alla riapertura. Nelle liste si vedono miniature leggere, non gli originali.
- **Scheda**: titolo e descrizione; gli altri campi di Vinted (marca, taglia, condizioni, prezzo…) si accendono uno per uno nelle Impostazioni.
- **Copia su Vinted**: un tocco per copiare ogni campo; **Scarica tutto** mette le foto in galleria (anche su iPhone), **Seleziona…** salva o condivide solo alcune foto; **Inoltra tutte le foto** le passa a un'app di AI per farsi scrivere i testi.
- **Stato di ogni capo**: Da creare → Bozza → Pubblicata → Venduta; una bozza al giorno da pubblicare.
- **Sicurezza dei dati**: cestino di 30 giorni, backup automatico giornaliero (ultimi 60), esporta/importa.

## Come è fatta
| parte | scelta | perché |
| --- | --- | --- |
| Frontend | HTML + JavaScript senza framework, service worker | si apre all'istante sul telefono, funziona anche offline |
| Backend | funzioni serverless Node su Vercel (`api/`) | nessun server da mantenere, costo zero |
| Dati | un file JSON su Vercel Blob con **scritture condizionate** | due persone salvano insieme senza sovrascriversi |
| Foto | caricate dal telefono direttamente sull'archivio, con permesso per singola foto | nessun limite di dimensione delle funzioni, originali identici byte per byte |
| Offline | coda persistente sul telefono | foto e modifiche non si perdono se cade la rete o si chiude l'app |

## Problemi veri risolti
- **Salvataggi "offline" anche online.** Le letture di Vercel Blob possono restituire per minuti una versione
  vecchia di un file sovrascritto. Ho spostato la versione autorevole su `head()` (sempre aggiornata) e
  scrivo una copia immutabile per ogni versione: le letture non sono più ambigue.
- **Caricamento delle foto rotto su un solo modello di telefono.** La causa erano intestazioni HTTP non ammesse
  dalle regole CORS dell'archivio. Ora il server di prova usato nei test ammette solo le intestazioni reali,
  così l'errore non può ripresentarsi senza che un test fallisca.
- **Limiti del piano gratuito.** Il vincolo vero non è lo spazio ma il numero di scritture al mese: un contatore
  nelle Impostazioni mostra il consumo rispetto ai limiti.

## Test
```
npm ci
node --test test/lib.test.mjs          # logica dati: cestino, backup, concorrenza, import
node test/mock-server.mjs 8787          # archivio finto in locale
IMG=<cartella di immagini> node test/e2e.mjs   # collaudo completo nel browser
```

## Come l'ho costruita
L'ho progettata e diretta io; il codice è scritto in gran parte con **Claude Code**, come si vede dagli autori
dei commit. Il mio lavoro: definire i requisiti con chi usa l'app, decidere architettura e compromessi,
pretendere test e prove prima di ogni rilascio, diagnosticare i guasti in produzione (i due sopra) e
verificarne la correzione. È lo stesso metodo che uso sui progetti di lavoro.

## Configurazione
Variabili d'ambiente su Vercel: `BLOB_READ_WRITE_TOKEN` (store Blob collegato al progetto) e `APP_CODE`
(chiave privata da cui si ricava il percorso dei dati).

**Nota**: l'app è pensata per un piccolo gruppo di persone di fiducia e l'accesso è libero per chi conosce
l'indirizzo. Per un uso aperto servirebbe un'autenticazione vera (la base c'è in `api/_lib.js`).
