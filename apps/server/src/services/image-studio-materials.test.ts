import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPdfSignature, isValidStudioMaterialType } from './image-studio-materials.js';

test('检测报告限制私有工作台 PDF，不能作为商品图片归类', () => {
  const report = { kind: 'source-file', mimetype: 'application/pdf', size: 400, ossOriginalKey: 'private/image-studio/test.pdf' };
  assert.equal(isValidStudioMaterialType(report, 'report'), true);
  assert.equal(isValidStudioMaterialType(report, 'product'), false);
  assert.equal(isValidStudioMaterialType({ ...report, ossOriginalKey: 'private/source-files/test.pdf' }, 'report'), false);
  assert.equal(isValidStudioMaterialType({ ...report, size: 26 * 1024 * 1024 }, 'report'), false);
  assert.equal(isValidStudioMaterialType({ ...report, mimetype: 'image/png', kind: 'image' }, 'report'), false);
  assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\n')), true);
  assert.equal(hasPdfSignature(Buffer.from('<html>')), false);
});
