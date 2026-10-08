import { guard, isBlobUrl } from './_lib.js';

// Scarica una foto come file (finisce in Download del telefono, visibile dal selettore foto di Vinted).
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  const url = String(req.query.url || '');
  if (!isBlobUrl(url)) return res.status(400).end();
  const name = String(req.query.name || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const r = await fetch(url);
  if (!r.ok) return res.status(502).end();
  const buf = Buffer.from(await r.arrayBuffer());
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.status(200).send(buf);
}
