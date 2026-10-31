import test from 'node:test';
import assert from 'node:assert/strict';
import { materialClipboardFiles } from './material-clipboard';

test('粘贴图片和 PDF 文件时保留类型并补全可上传的文件名', () => {
  const image = new File(['image'], '', { type: 'image/png' });
  const pdf = new File(['%PDF-1.7'], '检测报告.pdf');
  const result = materialClipboardFiles({ files: [image, pdf], items: [] } as unknown as DataTransfer);
  assert.equal(result.length, 2);
  assert.match(result[0].name, /\.png$/);
  assert.equal(result[1].name, '检测报告.pdf');
  assert.equal(result[1].type, 'application/pdf');
});

test('剪贴板只提供 items 时读取文件；普通文本不转换为素材', () => {
  const file = new File(['image'], 'logo.jpeg', { type: 'image/jpeg' });
  const clipboard = { files: [], items: [{ kind: 'string' }, { kind: 'file', getAsFile: () => file }] } as unknown as DataTransfer;
  assert.deepEqual(materialClipboardFiles(clipboard), [file]);
  assert.deepEqual(materialClipboardFiles({ files: [], items: [{ kind: 'string' }] } as unknown as DataTransfer), []);
});
