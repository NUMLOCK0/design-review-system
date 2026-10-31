import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPdfInWorker } from './product-report-reader.js';

function pdfFixture(text: string) {
  const stream = text ? `BT /F1 12 Tf 30 120 Td (${text}) Tj ET` : '';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('提取文字型 PDF 并保留页码', async () => {
  const result = await extractPdfInWorker(pdfFixture('Test report product model and item 12345'), 8, 0);
  assert.equal(result.totalPages, 1); assert.equal(result.pages[0].page, 1); assert.match(result.pages[0].text, /Test report/);
});
test('无文字页可渲染为图片供视觉模型识别', async () => {
  const result = await extractPdfInWorker(pdfFixture(''), 8, 1);
  assert.ok(result.pages[0].scan); assert.equal(Buffer.from(result.pages[0].scan!, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
test('损坏的 PDF 返回错误', async () => { await assert.rejects(extractPdfInWorker(Buffer.from('%PDF-1.7\ninvalid'), 8, 0)); });
