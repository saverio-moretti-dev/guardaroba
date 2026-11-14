import crypto from 'node:crypto';
import { guard, countOp, cloudinary, cldSign } from './_lib.js';

// Rilascia un permesso di caricamento valido 15 minuti per UNA foto: il telefono la invia
// direttamente all'archivio, così l'originale arriva intatto e senza limiti di dimensione delle funzioni.
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif' };
const MAX = 80 * 1024 * 1024;

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { item, contentType, size } = req.body || {};
    if (!/^[a-z0-9]{6,16}$/.test(String(item || ''))) return res.status(400).json({ error: 'id' });
    const ext = TYPES[String(contentType || '').toLowerCase()];
    if (!ext) return res.status(415).json({ error: 'formato non supportato' });
    if (!(size > 0) || size > MAX) return res.status(413).json({ error: 'foto troppo grande (max 80 MB)' });
    const pathname = `photos/${item}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    const c = cloudinary();
    if (!c) return res.status(503).json({ error: 'deposito foto non configurato (CLOUDINARY_URL mancante)' });
    if (size > 10 * 1024 * 1024) return res.status(413).json({ error: 'foto troppo grande (max 10 MB)' }); // limite del piano gratuito
    const p = { public_id: pathname.replace(/\.[a-z0-9]+$/, ''), timestamp: Math.floor(Date.now() / 1000) }; // firma valida 1 ora
    countOp('uploads');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ pathname, endpoint: `https://api.cloudinary.com/v1_1/${c.cloud}/image/upload`, fields: { ...p, api_key: c.key, signature: cldSign(p, c.secret) } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
