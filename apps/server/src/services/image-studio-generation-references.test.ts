import assert from 'node:assert/strict';
import test from 'node:test';
import { isUsableGenerationReference, readGenerationReferenceAssetIds } from './image-studio-generation-references.js';

const assetId = '14c550c9-205e-4661-8e4a-3c2c9fc11dd6';

test('参考素材同时支持上传图片和生成图片，排除竞品、聊天截图与不支持的格式', () => {
  assert.equal(isUsableGenerationReference({ kind: 'generated', role: 'generation', mimeType: 'image/png' }), true);
  assert.equal(isUsableGenerationReference({ kind: 'image', role: 'product', mimeType: 'image/jpeg' }), true);
  assert.equal(isUsableGenerationReference({ kind: 'reference', role: 'reference', mimeType: 'image/webp' }), true);
  assert.equal(isUsableGenerationReference({ kind: 'image', role: 'competitor', mimeType: 'image/png' }), false);
  assert.equal(isUsableGenerationReference({ kind: 'image', role: 'chat_screenshot', mimeType: 'image/png' }), false);
  assert.equal(isUsableGenerationReference({ kind: 'generated', role: 'generation', mimeType: 'image/svg+xml' }), false);
  assert.equal(isUsableGenerationReference({ kind: 'video', role: 'generation', mimeType: 'video/mp4' }), false);
});

test('accepts the mysql2 native JSON array that caused the production parse error', () => {
  const references = [assetId];
  assert.throws(() => JSON.parse(String(references)), SyntaxError);
  assert.deepEqual(readGenerationReferenceAssetIds(references), references);
  assert.notEqual(readGenerationReferenceAssetIds(references), references);
});

test('accepts multiple native references and serialized JSON without losing image IDs', () => {
  const references = [assetId, 'asset_reference_2'];
  assert.deepEqual(readGenerationReferenceAssetIds(references), references);
  assert.deepEqual(readGenerationReferenceAssetIds(JSON.stringify(references)), references);
});

test('supports text-to-image jobs without references in both database representations', () => {
  for (const value of [[], '[]', '', null, undefined]) {
    assert.deepEqual(readGenerationReferenceAssetIds(value), []);
  }
});

test('rejects corrupt reference data instead of silently generating without the product image', () => {
  for (const value of [assetId, {}, [null], [42], [''], Array(13).fill(assetId)]) {
    assert.throws(() => readGenerationReferenceAssetIds(value), { code: 'IMAGE_STUDIO_REFERENCE_INVALID' });
  }
});
