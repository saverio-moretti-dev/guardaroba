import { guard, cloudinary, cldAdmin, redisHealth, readDb, liveUsage } from './_lib.js';

// Consumi dei piani gratuiti, solo numeri e percentuali: la salute avvisa al 70 % prima di un blocco come quello di Blob.
const WARN = 70;
export default async function handler(req, res) {
  if (!guard(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const out = { warnAt: WARN, cloudinary: null, redis: null, app: null, errors: [] };
  try {
    if (!cloudinary()) throw new Error('CLOUDINARY_URL mancante');
    const u = await cldAdmin('usage');
    const pick = (k) => u[k] && { used: u[k].usage, limit: u[k].limit ?? null, pct: u[k].used_percent ?? null };
    out.cloudinary = { plan: u.plan, credits: pick('credits'), storage: pick('storage'), bandwidth: pick('bandwidth'), transformations: pick('transformations'), objects: pick('objects') };
  } catch (e) { out.errors.push('cloudinary: ' + e.message.slice(0, 120)); }
  try { out.redis = await redisHealth(); } catch (e) { out.errors.push('redis: ' + e.message.slice(0, 120)); }
  try { const { db } = await readDb({ fresh: true }); out.app = liveUsage(db); } catch (e) { out.errors.push('db: ' + e.message.slice(0, 120)); }
  const pcts = out.cloudinary ? Object.values(out.cloudinary).filter((v) => v && typeof v.pct === 'number').map((v) => v.pct) : [];
  out.maxPct = pcts.length ? Math.max(...pcts) : null;
  out.ok = !out.errors.length && (out.maxPct === null || out.maxPct < WARN);
  res.status(200).json(out);
}
