import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { readPsd } from 'ag-psd';
import { composeLayeredPsd, layeredPsdSchema } from './image-studio-layered-psd.js';

test('PSD roundtrip preserves bitmap layers, native text and canvas dimensions', async () => {
  const image = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#123456' } }).png().toBuffer();
  const bytes = await composeLayeredPsd({ width: 128, height: 128, layers: [
    { kind: 'image', assetId: 'a', name: '背景', left: 0, top: 0, width: 128, height: 128 },
    { kind: 'text', name: '标题', text: 'BRAND', font: 'Arial', fontSize: 16, color: '#FFFFFF', left: 10, top: 10 },
  ] }, async (id) => { assert.equal(id, 'a'); return image; });
  const psd = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  assert.equal(psd.width, 128); assert.equal(psd.height, 128);
  assert.equal(psd.children?.length, 2);
  assert.equal(psd.children?.[0].text?.text, 'BRAND');
  assert.equal(psd.children?.[1].name, '背景');
});

test('PSD rejects oversized canvas and layers outside bounds', () => {
  assert.equal(layeredPsdSchema.safeParse({ width: 4096, height: 4096, layers: [{ kind: 'image', assetId: 'a', name: 'x', left: 0, top: 0, width: 1, height: 1 }] }).success, false);
  assert.equal(layeredPsdSchema.safeParse({ width: 10, height: 10, layers: [{ kind: 'image', assetId: 'a', name: 'x', left: 9, top: 0, width: 10, height: 1 }] }).success, false);
});
