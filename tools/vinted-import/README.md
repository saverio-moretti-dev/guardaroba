# Strumenti Vinted → Guardaroba

Piccoli script per tenere l'app allineata agli annunci **attivi** del proprio profilo Vinted, che restano la
versione di riferimento: titolo, descrizione, foto e prezzo si copiano da Vinted verso l'app, mai al contrario.
I venduti e le bozze di Vinted non si riportano.

## Cosa serve
- Chrome con il proprio account Vinted già aperto. Gli script di raccolta girano nella pagina, nel browser
  dell'utente: nessuna password viene letta o salvata.
- Un file `.env.local` nella radice della repo (escluso da git) con l'indirizzo dell'app (`APP_URL`) e quello
  del proprio profilo Vinted (`VINTED_PROFILE`). Entrambi restano fuori dalla repo pubblica.
- La cartella `vinted-articoli/` (esclusa da git) dove finiscono testi e foto scaricati.

## Allineamento in cinque passi
1. **Elenco**: con il profilo aperto, eseguire `elenco.js` nella console della pagina. Attiva il filtro «Attivi»,
   scorre la pagina a passi e scarica `vinted-elenco.json`. Il numero letto deve coincidere con quello dichiarato
   dal profilo; altrimenti si rilancia.
2. **Differenze**: `node tools/vinted-import/allinea.mjs --diff` stampa gli annunci nuovi o con titolo cambiato.
   Una descrizione cambiata a titolo uguale non si vede: quell'id si passa a mano al passo 3.
3. **Scaricamento**: mettere gli id in `IDS` dentro `estrai.js` (al massimo 5 per volta) ed eseguirlo nella
   pagina Vinted; scarica un json per annuncio, uno ogni 5 secondi. Poi, per ogni file scaricato:
   `python3 -I tools/vinted-import/salva_articolo.py <file>` crea `vinted-articoli/<id>-<titolo>/` con
   `testo.txt` e le foto `01.jpg…`. Ripetere 2–3 finché non resta niente da scaricare.
4. **App**: `node tools/vinted-import/allinea.mjs --dry` mostra cosa cambierebbe; senza `--dry` applica,
   prima su un solo articolo e poi su tutti. Abbina gli articoli per link Vinted (la prima volta per titolo),
   aggiorna testi, prezzo e stato «Pubblicata»; le foto si ricaricano solo se il numero è diverso e le vecchie
   vanno nel cestino dell'app per 30 giorni. Gli articoli pubblicati nell'app ma non più attivi su Vinted
   vengono solo elencati: venduti o ritirati lo decide una persona.
5. **Verifica**: rilanciare `--dry`, che deve dire «Nuovi 0, aggiornati 0».

## Spostare le foto su Cloudinary
`foto-cloudinary.mjs` ricarica su Cloudinary le foto degli articoli Vinted usando le copie in `vinted-articoli/`
(gli stessi file caricati la prima volta) e sostituisce gli indirizzi nell'app. Tocca un articolo solo se numero,
dimensione e ordine delle foto coincidono; senza `--go` è solo una prova. Prima di ogni modifica salva una mappa
vecchio → nuovo, che `--undo <mappa>` usa per tornare indietro entro i 30 giorni del cestino.
`verifica-cloudinary.py` controlla poi ordine, numero e contenuto di ogni foto spostata.

## Cose imparate
- Nella pagina di un annuncio sono visibili solo le prime 5 foto: l'elenco completo sta nei dati dell'annuncio.
- I dati si scaricano come file json invece di copiarli dalla console: i testi lunghi e gli URL firmati si
  troncano.
- Il filtro «Attivi» è un interruttore: cliccarlo da acceso lo spegne. `elenco.js` controlla `aria-pressed`.
- Saltare in fondo alla pagina non carica tutti gli annunci: bisogna scorrere a passi.
- Alcuni annunci non hanno il blocco `ld+json`: `estrai.js` ripiega su `<title>` e sui dati della pagina.
- Le foto arrivano in webp alla risoluzione caricata in origine e diventano JPG con `sips` (macOS).
- Vinted non ammette la raccolta automatica: solo il proprio profilo, dal proprio browser, a ritmo umano, mai
  chiamate dirette alle sue API.
- Sul piano gratuito di Vercel Blob ogni foto costava una scrittura (limite 2.000 al mese): è uno dei motivi per
  cui le foto ora stanno su Cloudinary.
