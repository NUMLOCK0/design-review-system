import { Worker } from 'node:worker_threads';
import { getObjectFromOss } from '../config/oss-client.js';
import { loadImageStudioAsset } from './image-studio.js';

export type ReportPage = { assetId: string; filename: string; page: number; text: string; source: 'pdf_text' | 'vision_ocr'; };
export type ReportStatus = { assetId: string; filename: string; status: 'read' | 'partial' | 'needs_ocr' | 'failed' | 'limit'; totalPages?: number; message?: string };
export type ReportReadResult = { pages: ReportPage[]; statuses: ReportStatus[]; scannedImages: Array<{ assetId: string; page: number; mediaType: 'image/png'; data: string }> };

export async function extractPdfInWorker(buffer: Buffer, maxPages: number, maxScans: number): Promise<{ totalPages: number; pages: Array<{ page: number; text: string; scan?: string }> }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { pathToFileURL } = require('node:url');
      const path = require('node:path');
      (async () => {
        const pdfjs = await import(pathToFileURL(workerData.pdfPath).href);
        const root = path.dirname(workerData.packagePath);
        const doc = await pdfjs.getDocument({ data: new Uint8Array(workerData.data), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, useWasm: false, stopAtErrors: true, cMapUrl: path.join(root, 'cmaps') + '/', cMapPacked: true, standardFontDataUrl: path.join(root, 'standard_fonts') + '/' }).promise;
        const pages = []; let scans = 0;
        try {
          for (let n = 1; n <= Math.min(doc.numPages, workerData.maxPages); n++) {
            const page = await doc.getPage(n);
            const content = await page.getTextContent();
            const text = content.items.map(i => typeof i.str === 'string' ? i.str + (i.hasEOL ? '\\n' : ' ') : '').join('').replace(/[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]/g, '').trim().slice(0, 2000);
            let scan;
            if (text.replace(/\\s/g, '').length < 24 && scans < workerData.maxScans) {
              const { createCanvas } = require(workerData.canvasPath);
              const initial = page.getViewport({ scale: 1 });
              const scale = Math.min(1.5, 1600 / Math.max(initial.width, initial.height));
              const viewport = page.getViewport({ scale });
              const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
              await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
              const png = canvas.toBuffer('image/png');
              if (png.length <= 4 * 1024 * 1024) { scan = png.toString('base64'); scans++; }
            }
            pages.push({ page: n, text, scan }); page.cleanup();
          }
          parentPort.postMessage({ totalPages: doc.numPages, pages });
        } finally { await doc.destroy(); }
      })().catch((error) => parentPort.postMessage({ error: String(error.message || 'PDF 解析失败').slice(0, 200) }));`, { eval: true, workerData: { data: buffer, maxPages, maxScans, pdfPath: require.resolve('pdfjs-dist/legacy/build/pdf.mjs'), packagePath: require.resolve('pdfjs-dist/package.json'), canvasPath: require.resolve('@napi-rs/canvas') }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('PDF 解析超时')); }, 25_000);
    worker.once('message', (result) => { clearTimeout(timer); void worker.terminate(); if (result.error) reject(new Error(`PDF 解析失败：${result.error}`)); else resolve(result); });
    worker.once('error', () => { clearTimeout(timer); reject(new Error('PDF 解析失败')); });
    worker.once('exit', (code) => { if (code !== 0) { clearTimeout(timer); reject(new Error('PDF 解析进程退出')); } });
  });
}

export async function readProductReports(projectId: string, ownerId: string, reports: Array<{ id: string; filename: string }>, canOcr: boolean): Promise<ReportReadResult> {
  const pages: ReportPage[] = []; const statuses: ReportStatus[] = []; const scannedImages: ReportReadResult['scannedImages'] = [];
  for (const report of reports.slice(0, 3)) {
    try {
      const asset = await loadImageStudioAsset(projectId, report.id, ownerId);
      if (!asset || asset.role !== 'report' || asset.kind !== 'document' || asset.mime_type !== 'application/pdf' || Number(asset.size_bytes) > 25 * 1024 * 1024) throw new Error('报告不可用');
      const object = await getObjectFromOss(String(asset.object_key)); const buffer = Buffer.from(object.content as Buffer);
      if (buffer.length > 25 * 1024 * 1024 || !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('报告格式无效');
      const extracted = await extractPdfInWorker(buffer, 8, canOcr ? Math.max(0, 3 - scannedImages.length) : 0);
      let missing = 0;
      for (const page of extracted.pages) {
        if (page.text) pages.push({ assetId: report.id, filename: report.filename, page: page.page, text: page.text, source: 'pdf_text' });
        if (page.scan) scannedImages.push({ assetId: report.id, page: page.page, mediaType: 'image/png', data: page.scan });
        else if (page.text.replace(/\s/g, '').length < 24) missing++;
      }
      const limited = extracted.totalPages > 8;
      statuses.push({ assetId: report.id, filename: report.filename, totalPages: extracted.totalPages, status: limited || missing ? pages.some((page) => page.assetId === report.id) || scannedImages.some((page) => page.assetId === report.id) ? 'partial' : 'needs_ocr' : 'read', ...(limited || missing ? { message: [limited ? '仅检查前 8 页' : '', missing ? `${missing} 页文字不足或未识别` : ''].filter(Boolean).join('；') } : {}) });
    } catch { statuses.push({ assetId: report.id, filename: report.filename, status: 'failed', message: '无法解析，可能是加密、损坏或格式不受支持' }); }
  }
  for (const report of reports.slice(3)) statuses.push({ assetId: report.id, filename: report.filename, status: 'limit', message: '每次最多读取 3 份报告' });
  return { pages, statuses, scannedImages };
}
