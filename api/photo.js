import { list } from '@vercel/blob';
import { guard, cloudinary, cldAdmin } from './_lib.js';

// Recupero delle foto di una cartella (se il telefono ha perso l'elenco locale).
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const id = String(req.query.item || '');
  if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: 'id' });
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const found = [];
    if (cloudinary()) {
      const r = await cldAdmin(`resources/image/upload?prefix=${encodeURIComponent(`photos/${id}/`)}&max_results=200`);
      found.push(...r.resources.map((x) => ({ key: x.public_id, url: x.secure_url, size: x.bytes })));
    }
    try { // le foto vecchie restano su Blob (store sospeso dal 6/11/2026: errore ignorato se c'è Cloudinary)
      const r = await list({ prefix: `photos/${id}/`, limit: 200 });
      found.push(...r.blobs.map((b) => ({ key: b.pathname, url: b.url, size: b.size })));
    } catch (e) { if (!cloudinary()) throw e; console.error(e); }
    const photos = found.sort((a, b) => a.key.localeCompare(b.key)).map(({ url, size }) => ({ url, size }));
    res.status(200).json({ photos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
