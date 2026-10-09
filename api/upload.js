import crypto from 'node:crypto';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { guard, countOp } from './_lib.js';

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
    const rw = process.env.BLOB_READ_WRITE_TOKEN || '';
    const storeId = rw.split('_')[3] || '';
    const token = await generateClientTokenFromReadWriteToken({
      token: rw,
      pathname,
      allowedContentTypes: [contentType],
      maximumSizeInBytes: MAX,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31536000,
      validUntil: Date.now() + 15 * 60 * 1000,
    });
    countOp('adv'); countOp('uploads');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      pathname,
      endpoint: `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-version': '12',
        'x-vercel-blob-store-id': storeId,
        'x-vercel-blob-access': 'public',
        'x-content-type': contentType,
        'x-add-random-suffix': '0',
        'x-allow-overwrite': '0',
        'x-cache-control-max-age': '31536000',
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
