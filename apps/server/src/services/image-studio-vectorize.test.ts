import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { compareVectorPreview } from './image-studio-vectorize.js';

test('difference preview is transparent for identical pixels and highlights changed pixels', async () => {
  const original = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const same = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="white"/></svg>';
  const changed = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="black"/></svg>';
  const equal = await compareVectorPreview(original, same, 4, 4);
  assert.equal(equal.meanDifference, 0);
  const different = await compareVectorPreview(original, changed, 4, 4);
  assert.equal(different.meanDifference, 255);
  const raw = await sharp(Buffer.from(different.differencePng, 'base64')).ensureAlpha().raw().toBuffer();
  assert.equal(raw[3], 255);
});
