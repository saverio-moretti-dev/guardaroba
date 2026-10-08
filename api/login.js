import { codeOk, sessionCookie } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const code = req.body && req.body.code;
  if (!codeOk(code)) {
    await new Promise((r) => setTimeout(r, 800));
    return res.status(401).json({ error: 'codice errato' });
  }
  res.setHeader('Set-Cookie', sessionCookie());
  res.status(200).json({ ok: true });
}
