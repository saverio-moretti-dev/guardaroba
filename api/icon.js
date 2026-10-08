import zlib from 'node:zlib';

// Genera l'icona PNG dell'app (gruccia bianca su fondo verde acqua).
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function draw(s, maskable) {
  const raw = Buffer.alloc((s * 4 + 1) * s);
  const r = maskable ? 0 : s * 0.22;
  const k = maskable ? 0.62 : 0.74;
  const w = s * k, ox = (s - w) / 2, oy = s * 0.5 - w * 0.36, cx = s / 2;
  const lw = Math.max(2, s * 0.03) / 2;
  const segs = [
    [cx, oy + w * 0.12, cx, oy + w * 0.24],
    [cx, oy + w * 0.24, ox, oy + w * 0.62],
    [cx, oy + w * 0.24, ox + w, oy + w * 0.62],
    [ox, oy + w * 0.62, ox + w, oy + w * 0.62],
  ];
  const hcx = cx, hcy = oy + w * 0.05, hr = w * 0.07;
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      const px = x + 0.5, py = y + 0.5;
      // fondo con angoli arrotondati
      let a = 1;
      if (r) {
        const qx = Math.max(r - px, px - (s - r), 0), qy = Math.max(r - py, py - (s - r), 0);
        a = Math.max(0, Math.min(1, r - Math.hypot(qx, qy) + 0.5));
      }
      let d = Infinity;
      for (const g of segs) d = Math.min(d, segDist(px, py, ...g));
      d = Math.min(d, Math.abs(Math.hypot(px - hcx, py - hcy) - hr));
      const wht = Math.max(0, Math.min(1, lw - d + 0.5));
      const i = y * (s * 4 + 1) + 1 + x * 4;
      raw[i] = Math.round(14 + (255 - 14) * wht);
      raw[i + 1] = Math.round(124 + (255 - 124) * wht);
      raw[i + 2] = Math.round(123 + (255 - 123) * wht);
      raw[i + 3] = Math.round(255 * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export default function handler(req, res) {
  const s = Math.min(512, Math.max(32, parseInt(req.query.s, 10) || 192));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).send(draw(s, req.query.m === '1'));
}
