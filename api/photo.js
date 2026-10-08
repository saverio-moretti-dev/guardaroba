import crypto from 'node:crypto';
import { put, list } from '@vercel/blob';
import { guard, readBody } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const id = String(req.query.item || '');
  if (!/^[a-z0-9]{6,16}$/.test(id)) return res.status(400).json({ error: 'id' });
  try {
    if (req.method === 'POST') {
      const buf = await readBody(req);
      if (!buf.length || buf.length > 4_000_000) return res.status(413).json({ error: 'foto troppo grande' });
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      const blob = await put(`photos/${id}/${name}`, buf, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'image/jpeg',
        cacheControlMaxAge: 31536000,
      });
      return res.status(200).json({ url: blob.url });
    }
    // Recupero foto di una cartella (usato solo se il telefono ha perso l'elenco locale)
    if (req.method === 'GET') {
      const r = await list({ prefix: `photos/${id}/`, limit: 100 });
      const photos = r.blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).map((b) => ({ url: b.url }));
      return res.status(200).json({ photos });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
