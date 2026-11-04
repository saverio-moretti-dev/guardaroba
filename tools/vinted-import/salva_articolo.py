#!/usr/bin/env python3
"""Salva un articolo Vinted dal JSON scaricato dalla pagina (vinted-<id>.json in ~/Downloads).
JSON: {id, title, description, photos:[url...]} -> <repo>/vinted-articoli/<id>-<slug>/ con testo.txt + 01.jpg...
Vinted comanda: se la cartella di quell'annuncio esiste già, la vecchia va nel Cestino e si riscarica."""
import json, re, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

src = Path(sys.argv[1])
d = json.loads(src.read_text())
assert d.get("id") and d.get("photos"), "JSON senza id o foto"
slug = re.sub(r"[^a-z0-9]+", "-", d["title"].lower())[:50].strip("-")
root = Path(__file__).resolve().parents[2] / "vinted-articoli"  # dentro la repo, ignorata da git
out = root / f"{d['id']}-{slug}"
testo = f"{d['title']}\n\n{d['description']}\n"
for t in root.glob("*/testo.txt"):
    if t.parent.name.startswith(f"{d['id']}-"):  # stesso annuncio: versione vecchia nel Cestino
        dest = Path.home() / ".Trash" / f"{t.parent.name}-{int(time.time())}"
        shutil.move(str(t.parent), dest)
        print(f"vecchia versione nel Cestino: {dest.name}")
    elif t.read_text() == testo:  # altro annuncio con stesso titolo+descrizione: doppione
        src.unlink()
        sys.exit(f"DOPPIONE, saltato: già in {t.parent.name}")
out.mkdir(parents=True)

(out / "testo.txt").write_text(testo)

for i, u in enumerate(d["photos"], 1):
    assert u.startswith("https://images1.vinted.net/"), f"URL foto inatteso: {u}"
    webp = out / f"{i:02d}.webp"
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
    webp.write_bytes(urllib.request.urlopen(req, timeout=30).read())
    # sips è di macOS: jpg si apre ovunque su iPhone; se fallisce resta il webp
    if subprocess.run(["sips", "-s", "format", "jpeg", str(webp), "--out", str(webp.with_suffix(".jpg"))],
                      capture_output=True).returncode == 0:
        webp.unlink()

src.unlink()
print(f"OK {out.name} — {len(d['photos'])} foto")
