import { guard, readDb, writeDb, liveUsage } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const { db } = await readDb({ fresh: true });
      return res.status(200).json({ ...db, usage: liveUsage(db) });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const ops = Array.isArray(body.ops) ? body.ops.slice(0, 500) : [];
      const by = String(body.by || '').slice(0, 40);
      const db = await writeDb(ops, by);
      return res.status(200).json({ ...db, usage: liveUsage(db) });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
