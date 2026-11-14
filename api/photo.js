import { guard, cloudinary, cldAdmin } from './_lib.js';

// Recupero delle foto di una cartella (se il telefono ha perso l'elenco locale).
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const id = String(req.query.item || '');
  if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: 'id' });
  if (req.method !== 'GET') return res.status(405).end();
  try {
    if (!cloudinary()) return res.status(503).json({ error: 'deposito foto non configurato (CLOUDINARY_URL mancante)' });
    const r = await cldAdmin(`resources/image/upload?prefix=${encodeURIComponent(`photos/${id}/`)}&max_results=200`);
    const found = r.resources.map((x) => ({ key: x.public_id, url: x.secure_url, size: x.bytes }));
    const photos = found.sort((a, b) => a.key.localeCompare(b.key)).map(({ url, size }) => ({ url, size }));
    res.status(200).json({ photos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
