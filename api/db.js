import { del } from '@vercel/blob';
import { guard, readDb, writeDb, isBlobUrl } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const { db } = await readDb();
      return res.status(200).json(db);
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const ops = Array.isArray(body.ops) ? body.ops.slice(0, 200) : [];
      const by = String(body.by || '').slice(0, 40);
      // Foto da cancellare dallo spazio (del() è gratuito)
      const toDelete = [];
      for (const op of ops) {
        if (op.op === 'deletePhotos') for (const u of op.urls || []) if (isBlobUrl(u)) toDelete.push(u);
      }
      const db = await writeDb(ops.filter((o) => o.op !== 'deletePhotos'), by);
      if (toDelete.length) await del(toDelete).catch((e) => console.error('del', e));
      return res.status(200).json(db);
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
