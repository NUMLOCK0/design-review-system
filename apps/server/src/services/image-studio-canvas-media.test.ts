import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { assertRemoteMediaUsesOss } from './image-studio-canvas.js';

test('accepts an OSS preview with a canonical key but rejects an unowned URL', () => {
  assert.doesNotThrow(() => assertRemoteMediaUsesOss({ type: 'image', metadata: { storageKey: 'image:oss:asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', content: '/api/upload/previews/asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }));
  assert.throws(() => assertRemoteMediaUsesOss({ type: 'image', metadata: { content: 'https://example.com/picture.png' } }), /必须先上传/);
  assert.throws(() => assertRemoteMediaUsesOss({ type: 'image', metadata: { storageKey: 'image:oss:asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', content: 'https://example.com/picture.png' } }), /不匹配/);
  assert.throws(() => assertRemoteMediaUsesOss({ type: 'image', metadata: { storageKey: 'image:oss:asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', references: ['https://example.com/picture.png'] } }), /必须先上传/);
});
