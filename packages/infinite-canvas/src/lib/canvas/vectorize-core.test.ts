import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { buildTracePalette, traceCanvasImage } from './vectorize-core';

const require = createRequire(new URL('../../../../../apps/server/package.json', import.meta.url));
const sharp = require('sharp') as typeof import('sharp');

test('描摹彩色透明 Logo 为可渲染的原生 SVG 路径', async () => {
  const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="12" y="12" width="40" height="40" fill="#de2837"/></svg>');
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = traceCanvasImage({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) });
  assert.match(source, /viewBox="0 0 64 64"/);
  assert.match(source, /<path\b/);
  assert.doesNotMatch(source, /<(?:image|script|foreignObject)\b/i);
  const rendered = await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer();
  const at = (x: number, y: number) => [...rendered.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
  assert.ok(at(0, 0)[3] < 30, `透明区域应保留，实际为 ${at(0, 0)}`);
  assert.ok(at(32, 32)[0] > 150 && at(32, 32)[3] > 200, `中心应保留颜色，实际为 ${at(32, 32)}`);
});

test('空白透明图片及过大图像不会生成无效 SVG', () => {
  assert.throws(() => traceCanvasImage({ width: 2, height: 2, data: new Uint8ClampedArray(16) }), /完全透明/);
  assert.throws(() => traceCanvasImage({ width: 513, height: 1, data: new Uint8ClampedArray(513 * 4) }), /尺寸无效/);
});

test('大面积背景不会掩盖 Logo 的小面积主色', () => {
  const pixels = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) pixels.set(i < 80 ? [245, 239, 227, 255] : i < 90 ? [50, 75, 95, 255] : [220, 145, 115, 255], i * 4);
  const palette = buildTracePalette(pixels, 6);
  assert.ok(palette.some((c) => c.b > c.r && c.r < 100));
  assert.ok(palette.some((c) => c.r > 180 && c.r > c.b + 50));
  const svg = traceCanvasImage({ width: 10, height: 10, data: pixels, colors: 6 });
  assert.match(svg, /<rect\b[^>]*fill=/, '不透明原图应使用底色填补描摹路径的缝隙');
});
