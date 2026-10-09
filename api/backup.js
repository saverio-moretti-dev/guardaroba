import { guard, listBackups, readBackup, replaceDb, readDb } from './_lib.js';

// GET              -> elenco backup automatici
// GET ?name=...    -> contenuto di un backup (per scaricarlo)
// POST {name}      -> ripristina un backup automatico
// POST {data}      -> ripristina da un file esportato
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (req.query.name) return res.status(200).json(await readBackup(String(req.query.name)));
      if (req.query.export) { const { db } = await readDb({ fresh: true }); return res.status(200).json(db); }
      return res.status(200).json({ backups: await listBackups() });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const by = String(body.by || '').slice(0, 40);
      const data = body.name ? await readBackup(String(body.name)) : body.data;
      const db = await replaceDb(data, by);
      return res.status(200).json(db);
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
}
