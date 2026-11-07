# Verifica dopo foto-cloudinary.mjs: per ogni articolo delle mappe in vinted-articoli/, l'app ha esattamente
# le URL nuove nell'ordine della mappa (stesso numero delle vecchie) e ogni foto risponde 200 image/* con i byte giusti.
# Avvio dalla radice della repo: python3 tools/vinted-import/verifica-cloudinary.py
import json, glob, os, urllib.request

APP = next(l.split('=', 1)[1].strip() for l in open('.env.local') if l.startswith('APP_URL='))
m = {}
for f in sorted(glob.glob('vinted-articoli/_foto-cloudinary-*.json')): m.update(json.load(open(f)))
db = json.load(urllib.request.urlopen(APP + '/api/db'))
bad = 0
for i, e in m.items():
    app = [p['url'] for p in db['items'][i]['photos']]
    if app != [p['url'] for p in e['new']] or len(app) != len(e['old']): print('ORDINE/CONTEGGIO DIVERSO', i); bad += 1
    size = {p['url']: p['size'] for p in e['new']}
    for u in app:
        r = urllib.request.urlopen(urllib.request.Request(u, method='HEAD'))
        if r.status != 200 or not r.headers['content-type'].startswith('image/') or int(r.headers.get('content-length', 0)) != size.get(u):
            print('FOTO KO', u, r.status, r.headers['content-type'], r.headers.get('content-length')); bad += 1
online = [it for it in db['items'].values() if it.get('status') == 'online' and it.get('vintedUrl')]
cld = sum('res.cloudinary.com' in p['url'] for it in online for p in it['photos'])
blob = sum('blob.vercel-storage.com' in p['url'] for it in online for p in it['photos'])
print(f'articoli {len(m)}, foto {sum(len(e["new"]) for e in m.values())}, errori {bad} | online con vintedUrl: {cld} Cloudinary, {blob} Blob')
