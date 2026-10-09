import { list } from '@vercel/blob';
import { guard } from './_lib.js';

// Recupero delle foto di una cartella (se il telefono ha perso l'elenco locale).
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const id = String(req.query.item || '');
  if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: 'id' });
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const r = await list({ prefix: `photos/${id}/`, limit: 200 });
    const photos = r.blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).map((b) => ({ url: b.url, size: b.size }));
    res.status(200).json({ photos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
