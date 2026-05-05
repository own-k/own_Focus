const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const outDir = path.resolve(__dirname, '..', 'icons');

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([len, name, data, crc]);
}

function pngEncode(width, height, rgba) {
  const zlib = require('zlib');
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPx(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function blend(buf, size, x, y, r, g, b, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  const a = alpha / 255;
  buf[i] = Math.round(buf[i] * (1 - a) + r * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
  buf[i + 3] = 255;
}

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.24;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(Math.abs(x + 0.5 - cx) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(y + 0.5 - cy) - (size / 2 - radius), 0);
      if (dx * dx + dy * dy > radius * radius) continue;

      const t = (x + y) / (size * 2);
      const bg = Math.round(14 + t * 18);
      setPx(buf, size, x, y, bg, bg - 2, bg - 2, 255);
    }
  }

  const ringR = size * 0.24;
  const ringW = Math.max(2, size * 0.09);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (Math.abs(dist - ringR) <= ringW) blend(buf, size, x, y, 245, 240, 232, 255);
    }
  }

  const x1 = size * 0.63;
  const y1 = size * 0.3;
  const x2 = size * 0.43;
  const y2 = size * 0.72;
  const thickness = Math.max(2, size * 0.08);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
      const lx = x1 + t * dx;
      const ly = y1 + t * dy;
      const dist = Math.hypot(px - lx, py - ly);
      if (dist <= thickness) {
        const g = Math.round(18 - t * 10);
        blend(buf, size, x, y, 196, 22 + g, 42 + g, 255);
      }
    }
  }

  const dotR = Math.max(1.5, size * 0.04);
  const dotX = size * 0.68;
  const dotY = size * 0.32;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (Math.hypot(x + 0.5 - dotX, y + 0.5 - dotY) <= dotR) {
        blend(buf, size, x, y, 248, 244, 236, 255);
      }
    }
  }

  return buf;
}

for (const size of sizes) {
  const png = pngEncode(size, size, drawIcon(size));
  fs.writeFileSync(path.join(outDir, `icons${size}.png`), png);
}

console.log(`Exported icons to ${outDir}`);
