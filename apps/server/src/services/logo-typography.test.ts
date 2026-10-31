import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { composeLogoTypography } from './logo-typography.js';

const input = { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><path d="M0 0H100V100Z"/></svg>', width: 300, height: 200, text: '毛球星球 & Pet', weight: 400, color: '#123456', size: 48, spacing: 1 };
test('composes editable Unicode text and portable vector outlines without removing the source', async () => {
  const result = composeLogoTypography(input);
  assert.match(result.editable, /<text\b/);
  assert.match(result.editable, /毛球星球 &amp; Pet/);
  assert.doesNotMatch(result.outlined, /<text\b/);
  assert.match(result.outlined, /<path/);
  assert.ok(result.outlined.includes('M0 0H100V100Z'));
  const meta = await sharp(Buffer.from(result.outlined)).metadata();
  assert.equal(meta.width, result.width);
  assert.equal(meta.height, result.height);
  const bold = composeLogoTypography({ ...input, weight: 700 });
  assert.notEqual(bold.outlined, result.outlined);
  await sharp(Buffer.from(bold.outlined)).png().toBuffer();
});
test('rejects unsupported glyphs and dangerous SVG input', () => {
  assert.throws(() => composeLogoTypography({ ...input, text: '\u{10ffff}' }), /不支持字符/);
  assert.throws(() => composeLogoTypography({ ...input, svg: '<svg><script/></svg>' }), /不受支持/);
});
