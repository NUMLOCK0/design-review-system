import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { dbPool } from '../config/database.js';
import { getObjectFromOss } from '../config/oss-client.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { getImageStudioProject, loadImageStudioAsset } from './image-studio.js';

/** Compare both images on the same white background; this is a diagnostic, not an aesthetic score. */
export async function compareVectorPreview(original: Buffer, svg: string, width: number, height: number) {
  const size = { width: Math.max(1, Math.round(width * Math.min(1, 512 / Math.max(width, height)))), height: Math.max(1, Math.round(height * Math.min(1, 512 / Math.max(width, height)))) };
  const render = (input: Buffer) => sharp(input, { limitInputPixels: 100_000_000 }).rotate().resize(size.width, size.height, { fit: 'fill' }).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer();
  const [source, traced] = await Promise.all([render(original), render(Buffer.from(svg))]);
  const pixels = Buffer.alloc(size.width * size.height * 4);
  let total = 0;
  for (let i = 0; i < size.width * size.height; i++) {
    const delta = Math.max(...[0, 1, 2].map((channel) => Math.abs(source[i * 3 + channel] - traced[i * 3 + channel])));
    total += delta; pixels[i * 4] = 235; pixels[i * 4 + 1] = 40; pixels[i * 4 + 2] = 80; pixels[i * 4 + 3] = delta < 8 ? 0 : Math.min(255, delta * 3);
  }
  const png = await sharp(pixels, { raw: { ...size, channels: 4 } }).png().toBuffer();
  return { differencePng: png.toString('base64'), meanDifference: Math.round(total / (size.width * size.height) * 100) / 100 };
}

let active = 0;
export type VectorInput = { assetId: string; source: 'studio' | 'workspace'; mode: 'detail' | 'smooth' | 'ocr'; visionProfileId?: string };

export async function createVectorJob(projectId: string, user: AuthUserPayload, input: VectorInput, idempotencyKey: string) {
  if (!dbPool) throw Object.assign(new Error('数据库不可用'), { status: 503 });
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [user.id]);
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL', [projectId, user.id]);
    if (!projects[0]) throw Object.assign(new Error('项目不存在或无权访问'), { status: 404 });
    const [existing]: any = await connection.query('SELECT id,project_id,job_type,request_json,status FROM image_studio_jobs WHERE owner_id=? AND idempotency_key=?', [user.id, idempotencyKey]);
    if (existing[0]) {
      const request = typeof existing[0].request_json === 'string' ? JSON.parse(existing[0].request_json) : existing[0].request_json;
      if (existing[0].project_id !== projectId || existing[0].job_type !== 'vectorize' || request.assetId !== input.assetId || request.source !== input.source || request.mode !== input.mode || (request.visionProfileId || '') !== (input.visionProfileId || ''))
        throw Object.assign(new Error('请求标识已用于其他任务'), { status: 409 });
      await connection.commit(); return { id: String(existing[0].id), status: String(existing[0].status), duplicate: true };
    }
    const [activeJobs]: any = await connection.query("SELECT COUNT(*) AS total FROM image_studio_jobs WHERE owner_id=? AND status IN ('queued','running','cancelling')", [user.id]);
    if (Number(activeJobs[0].total) >= Number(process.env.IMAGE_STUDIO_MAX_ACTIVE_JOBS_PER_USER || 5)) throw Object.assign(new Error('当前后台任务较多，请稍后再试'), { status: 429 });
    const id = randomUUID();
    await connection.query("INSERT INTO image_studio_jobs (id,project_id,owner_id,job_type,status,idempotency_key,request_json,progress,attempt_count,created_at,updated_at) VALUES (?,?,?,'vectorize','queued',?,?,0,0,NOW(3),NOW(3))", [id, projectId, user.id, idempotencyKey, JSON.stringify(input)]);
    await connection.query("INSERT INTO image_studio_outbox (id,job_id,queue_name,job_name,payload_json,status,attempts,available_at,created_at) VALUES (?,?,?,?,?,'pending',0,NOW(3),NOW(3))", [randomUUID(), id, 'image-studio-export', input.mode === 'ocr' ? 'recognize-logo-text' : 'vectorize-logo', JSON.stringify({ jobId: id })]);
    await connection.commit(); return { id, status: 'queued', duplicate: false };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

export async function latestVectorJobs(projectId: string, user: AuthUserPayload, assetId: string, source: string) {
  await getImageStudioProject(projectId, user);
  if (!dbPool) throw Object.assign(new Error('数据库不可用'), { status: 503 });
  const [rows]: any = await dbPool.query("SELECT id,status,request_json FROM image_studio_jobs WHERE project_id=? AND owner_id=? AND job_type='vectorize' AND JSON_UNQUOTE(JSON_EXTRACT(request_json,'$.assetId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(request_json,'$.source'))=? ORDER BY created_at DESC LIMIT 10", [projectId, user.id, assetId, source]);
  const found: Record<string, { id: string; status: string }> = {};
  for (const row of rows) { const request = typeof row.request_json === 'string' ? JSON.parse(row.request_json) : row.request_json; if (!found[request.mode]) found[request.mode] = { id: row.id, status: row.status }; }
  return found;
}

export async function loadVectorSource(projectId: string, user: AuthUserPayload, input: Pick<VectorInput, 'assetId' | 'source'>) {
  await getImageStudioProject(projectId, user);
  if (!dbPool) throw Object.assign(new Error('数据库不可用'), { status: 503 });
  let asset: any;
  if (input.source === 'studio') asset = await loadImageStudioAsset(projectId, input.assetId, user.id);
  else {
    const [rows]: any = await dbPool.query('SELECT kind,mimetype AS mime_type,size AS size_bytes,oss_original_key AS object_key FROM media_assets WHERE id=? AND owner_id=?', [input.assetId, user.id]);
    asset = rows[0];
    if (!String(asset?.object_key || '').startsWith('private/canvas-workspace/')) asset = null;
  }
  if (!asset || !['image', 'reference', 'generated'].includes(String(asset.kind)) || ['competitor', 'chat_screenshot'].includes(String(asset.role))
    || !/^image\/(png|jpe?g|webp|gif)$/i.test(String(asset.mime_type)) || Number(asset.size_bytes) > 25 * 1024 * 1024)
    throw Object.assign(new Error('图片不存在、无权访问或格式不受支持'), { status: 400 });
  const object = await getObjectFromOss(String(asset.object_key));
  const original = Buffer.from(object.content as Buffer);
  if (original.length > 25 * 1024 * 1024) throw Object.assign(new Error('图片超过 25 MB'), { status: 413 });
  return original;
}

export async function vectorizeStudioImage(projectId: string, user: AuthUserPayload, input: { assetId: string; source: 'studio' | 'workspace'; mode: 'detail' | 'smooth' }) {
  if (active >= 2) throw Object.assign(new Error('当前转换任务较多，请稍后重试'), { status: 429 });
  active++;
  try {
    const original = await loadVectorSource(projectId, user, input);
    const { data, info } = await sharp(original, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rawSvg = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(`const { parentPort, workerData } = require('node:worker_threads');
        try { const tracer = require(workerData.modulePath); const svg = tracer.convertPixels(new Uint8Array(workerData.data), workerData.width, workerData.height, workerData.options); parentPort.postMessage({ svg }); }
        catch (error) { parentPort.postMessage({ error: error.message }); }`, { eval: true, workerData: { modulePath: require.resolve('@visioncortex/vtracer'), data, width: info.width, height: info.height,
        options: { preset: 'poster', mode: 'spline', hierarchical: 'cutout', filterSpeckle: input.mode === 'detail' ? 2 : 8, colorPrecision: input.mode === 'detail' ? 7 : 6, layerDifference: 16, ...(input.mode === 'smooth' ? { simplify: 1 } : {}) } } });
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error('矢量转换超时，请使用更简洁的图片')); }, 60_000);
      worker.once('message', (message: { svg?: string; error?: string }) => { clearTimeout(timer); void worker.terminate(); message.svg ? resolve(message.svg) : reject(new Error(message.error || '矢量转换失败')); });
      worker.once('error', (error) => { clearTimeout(timer); reject(error); });
      worker.once('exit', (code) => { if (code !== 0) { clearTimeout(timer); reject(new Error('矢量转换进程意外退出，请重试')); } });
    });
    const svg = rawSvg.replace(/^\s*<\?xml[^?]*\?>\s*/i, '').replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();
    if (Buffer.byteLength(svg, 'utf8') > 1024 * 1024 || !/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg) || !/<path\b/i.test(svg) || /<!|<\s*(?:image|script|foreignObject|style)\b|\bon\w+\s*=|\b(?:href|src)\s*=|url\s*\(/i.test(svg)) throw new Error('转换结果过大或不包含安全的矢量路径');
    await sharp(Buffer.from(svg), { limitInputPixels: 16_000_000 }).metadata();
    const difference = await compareVectorPreview(original, svg, info.width, info.height);
    return { svg, width: info.width, height: info.height, mode: input.mode, pathCount: (svg.match(/<path\b/gi) || []).length, bytes: Buffer.byteLength(svg), ...difference };
  } finally { active--; }
}
