// Génère les icônes PWA (PNG) sans aucune dépendance : encodeur PNG minimal
// (zlib de Node) + rendu du vaisseau HYPERNOVA par remplissage de pixels.
// Usage : node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---- Encodeur PNG minimal (couleur 8 bits RGBA, filtre 0) ----

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtre "none"
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Rendu du vaisseau (supersampling ×2 pour lisser les bords) ----

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function renderIcon(size, { maskable = false } = {}) {
  const S = size * 2; // supersampling
  const px = new Float64Array(S * S * 4);
  const scale = maskable ? 0.62 : 0.82; // zone sûre maskable = 80 % du canevas
  const cx = S / 2;
  const cy = S / 2;

  // Silhouette du logo (pointe en haut, deux ailes, creux central), comme le favicon.
  const P = (x, y) => [cx + (x - 0.5) * S * scale, cy + (y - 0.47) * S * scale];
  const nose = P(0.5, 0.04);
  const right = P(0.82, 0.9);
  const notch = P(0.5, 0.66);
  const left = P(0.18, 0.9);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Fond spatial.
      let r = 5,
        g = 4,
        b = 15,
        a = 255;
      // Halo cyan radial derrière le vaisseau.
      const d = Math.hypot(x - cx, y - cy) / (S * 0.5);
      if (d < 0.95) {
        const glow = Math.pow(1 - d / 0.95, 2.2) * 0.55;
        r += 79 * glow;
        g += 242 * glow;
        b += 255 * glow;
      }
      // Vaisseau : deux triangles (concave au centre).
      if (inTriangle(x, y, nose, right, notch) || inTriangle(x, y, nose, notch, left)) {
        const t = (y - nose[1]) / (left[1] - nose[1]); // dégradé blanc → cyan
        r = 255 - (255 - 79) * t;
        g = 255 - (255 - 242) * t;
        b = 255;
      }
      px[i] = Math.min(255, r);
      px[i + 1] = Math.min(255, g);
      px[i + 2] = Math.min(255, b);
      px[i + 3] = a;
    }
  }

  // Downsample 2×2 → taille finale.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < 4; c++) {
        const sum =
          px[(y * 2 * S + x * 2) * 4 + c] +
          px[(y * 2 * S + x * 2 + 1) * 4 + c] +
          px[((y * 2 + 1) * S + x * 2) * 4 + c] +
          px[((y * 2 + 1) * S + x * 2 + 1) * 4 + c];
        out[(y * size + x) * 4 + c] = Math.round(sum / 4);
      }
    }
  }
  return encodePng(size, out);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', renderIcon(192));
writeFileSync('public/icons/icon-512.png', renderIcon(512));
writeFileSync('public/icons/icon-180.png', renderIcon(180));
writeFileSync('public/icons/icon-maskable-512.png', renderIcon(512, { maskable: true }));
console.log('Icônes générées dans public/icons/');
