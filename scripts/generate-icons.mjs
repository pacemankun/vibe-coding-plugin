import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Resize the transparent head cutout while preserving its alpha channel.
const source = `data:image/png;base64,${readFileSync('assets/brand/shiba-head.png').toString('base64')}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const icons = await page.evaluate(async source => {
    const photo = new Image();
    photo.src = source;
    await photo.decode();
    return [16, 32, 48, 128].map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const scale = size / Math.max(photo.width, photo.height);
      const width = photo.width * scale, height = photo.height * scale;
      context.drawImage(photo, (size - width) / 2, (size - height) / 2, width, height);
      const pixels = context.getImageData(0, 0, size, size).data;
      const corners = [0, size - 1, size * (size - 1), size * size - 1];
      if (corners.some(index => pixels[index * 4 + 3] !== 0)) throw new Error('Icon background must stay transparent');
      if (pixels[(Math.floor(size / 2) * size + Math.floor(size / 2)) * 4 + 3] === 0) throw new Error('Icon head is missing');
      return { size, data: canvas.toDataURL('image/png').split(',')[1] };
    });
  }, source);
  mkdirSync('public/icons', { recursive: true });
  for (const { size, data } of icons) writeFileSync(`public/icons/${size}.png`, Buffer.from(data, 'base64'));
  console.log('Verified transparent Shiba head toolbar PNGs (16 / 32 / 48 / 128).');
} finally {
  await browser.close();
}
