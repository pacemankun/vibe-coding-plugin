import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Original geometric mark, supersampled for legible small toolbar icons.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const data = Buffer.concat([Buffer.from(name), bytes]);
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, crc]);
}
mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const u = (x + (sx + .5) / 4) / size, v = (y + (sy + .5) / 4) / size;
      const dx = Math.max(.22 - u, 0, u - .78), dy = Math.max(.22 - v, 0, v - .78);
      const inside = dx * dx + dy * dy < .2 * .2;
      const bar = (u > .22 && u < .35 && v > .51 && v < .76) || (u > .435 && u < .565 && v > .36 && v < .76) || (u > .65 && u < .78 && v > .21 && v < .76);
      const color = inside ? bar ? [110, 243, 177, 255] : [23, 36, 30, 255] : [0, 0, 0, 0];
      color.forEach((value, i) => { sum[i] += value; });
    }
    sum.forEach((value, i) => { rows[y * (size * 4 + 1) + 1 + x * 4 + i] = Math.round(value / 16); });
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(`public/icons/${size}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
console.log('Generated original toolbar icons (16 / 32 / 48 / 128).');
