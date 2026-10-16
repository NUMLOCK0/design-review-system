import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import sharp from 'sharp';
import { getObjectFromOss, headOssObject, isOssConfigured, putPrivateBufferAtOssKey } from '../config/oss-client.js';
import { dbPool } from '../config/database.js';
import { getAiConfigCredentials } from './ai-config.js';
import { fetchAiJson, type AiCallMeta } from './ai-call-log.js';
import { getImageStudioQueue, getImageStudioRedisConnection, IMAGE_STUDIO_QUEUES, type ImageStudioQueueName } from './image-studio-queue.js';
import {
  CREATIVE_DIMENSIONS, claimOutbox, loadGenerationJob, loadImageStudioAsset, loadImageStudioProfile, markGenerationFailed,
  loadImageStudioTextJob, markGenerationRunning, saveGenerationOutput, saveImageStudioTextResult, writeJobEvent,
  loadImageStudioExport, saveImageStudioExport, failImageStudioExport,
} from './image-studio.js';

type GenerationRow = any;
type ProjectJob = { id: string; projectId: string; ownerId: string; profileId: string; generations: GenerationRow[] };
type ProjectContext = Pick<ProjectJob, 'projectId' | 'ownerId'>;

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/https?:\/\/[^\s?]+\?[^\s]*/gi, '[upstream-url]').slice(0, 768);
}

function apiRoot(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, '');
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function isPrivateAddress(address: string) {
  const privateV4 = (value: string) => {
    const v4 = value.split('.').map(Number);
    if (v4.length !== 4 || !v4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return true;
    return v4[0] === 0 || v4[0] === 10 || v4[0] === 127 || (v4[0] === 169 && v4[1] === 254)
      || (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) || (v4[0] === 192 && v4[1] === 168)
      || (v4[0] === 100 && v4[1] >= 64 && v4[1] <= 127) || (v4[0] === 192 && v4[1] === 0 && v4[2] === 0)
      || (v4[0] === 198 && (v4[1] === 18 || v4[1] === 19)) || v4[0] >= 224;
  }
  if (isIP(address) === 4) return privateV4(address);
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return privateV4(normalized.slice(7));
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fe8:') || normalized.startsWith('fe9:')
    || normalized.startsWith('fea:') || normalized.startsWith('feb:') || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('ff');
}

async function downloadImage(urlText: string, allowedHosts: string[], timeoutMs: number, maxBytes: number) {
  const url = new URL(urlText);
  if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.includes(url.hostname.toLowerCase())) {
    throw Object.assign(new Error('上游返回了未获准的图片地址'), { code: 'UPSTREAM_IMAGE_URL_REJECTED' });
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw Object.assign(new Error('上游图片域名解析到非公网地址，已阻止下载'), { code: 'UPSTREAM_IMAGE_URL_REJECTED' });
  }
  const chosen = addresses[0];
  return new Promise<{ buffer: Buffer; contentType: string }>((resolve, reject) => {
    const request = https.request({
      protocol: 'https:', hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`,
      method: 'GET', servername: url.hostname, timeout: timeoutMs, maxHeaderSize: 16 * 1024,
      lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family),
      headers: { Accept: 'image/png,image/jpeg,image/webp' },
    }, (response) => {
      if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
        response.resume(); reject(Object.assign(new Error(`上游图片下载失败（HTTP ${response.statusCode}）`), { code: 'UPSTREAM_IMAGE_DOWNLOAD_FAILED' })); return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        response.resume(); reject(Object.assign(new Error('上游返回的文件不是受支持的图片格式'), { code: 'UPSTREAM_IMAGE_INVALID' })); return;
      }
      const chunks: Buffer[] = []; let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) { request.destroy(Object.assign(new Error('生成图片超过大小限制'), { code: 'IMAGE_TOO_LARGE' })); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType }));
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('下载上游图片超时'), { code: 'UPSTREAM_IMAGE_TIMEOUT' })));
    request.on('error', reject);
    request.end();
  });
}

function parseImagePayload(data: any) {
  const item = data?.data?.[0] || data?.output?.[0] || data?.images?.[0] || data?.result?.[0] || data?.result || data;
  const b64 = item?.b64_json || item?.b64 || item?.image_base64 || item?.base64;
  if (typeof b64 === 'string') return { base64: b64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''), url: null as string | null };
  const url = item?.url || item?.image_url || item?.output_url || data?.url;
  if (typeof url === 'string') return { base64: null as string | null, url };
  throw Object.assign(new Error('上游任务已完成，但没有返回图片内容'), { code: 'UPSTREAM_IMAGE_MISSING' });
}

function getTaskId(data: any) {
  const id = data?.task_id || data?.id || data?.data?.task_id || data?.data?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

async function validateImage(buffer: Buffer, maxBytes: number) {
  if (!buffer.length || buffer.length > maxBytes) throw Object.assign(new Error('图像数据为空或超过大小限制'), { code: 'IMAGE_TOO_LARGE' });
  const signature = buffer.subarray(0, 16).toString('hex');
  if (!signature.startsWith('89504e470d0a1a0a') && !signature.startsWith('ffd8ff') && !signature.startsWith('52494646')) {
    throw Object.assign(new Error('生成结果不是有效的 PNG/JPEG/WebP 图片'), { code: 'UPSTREAM_IMAGE_INVALID' });
  }
}

async function recoverStoredOutput(job: ProjectJob, generation: GenerationRow, maxBytes: number) {
  for (const [ext, mimeType] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']] as const) {
    const objectKey = `private/image-studio/generated/${job.projectId}/${generation.id}.${ext}`;
    let buffer: Buffer;
    try {
      await headOssObject(objectKey);
      const object = await getObjectFromOss(objectKey);
      buffer = Buffer.from(object.content as Buffer);
    } catch { continue; /* Not this output format or not written yet. */ }
    try { await validateImage(buffer, maxBytes); } catch { continue; }
    const assetId = await saveGenerationOutput({ generationId: String(generation.id), projectId: job.projectId, ownerId: job.ownerId,
      objectKey, filename: `generation-${generation.slot_key}.${ext}`, mimeType, size: buffer.length });
    if (!assetId) return null;
    return { assetId, objectKey };
  }
  return null;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number, meta: AiCallMeta) {
  const { response, data } = await fetchAiJson(url, { ...init, redirect: 'error' }, timeoutMs, meta);
  if (data === null) throw Object.assign(new Error(`上游返回格式无效（HTTP ${response.status}）`), { code: 'UPSTREAM_INVALID_RESPONSE' });
  if (!response.ok) {
    const message = String(data?.error?.message || data?.message || `上游请求失败（HTTP ${response.status}）`);
    throw Object.assign(new Error(message.slice(0, 768)), { code: response.status === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_REQUEST_FAILED', retryable: response.status === 429 || response.status >= 500 });
  }
  return data;
}

async function readReferenceImages(job: ProjectContext, ids: string[]) {
  if (ids.length > 12) throw Object.assign(new Error('单个 AI 任务最多使用 12 张参考素材'), { code: 'IMAGE_STUDIO_REFERENCE_LIMIT' });
  const results: Array<{ id: string; filename: string; contentType: string; buffer: Buffer }> = [];
  let sourceBytes = 0; let preparedBytes = 0;
  for (const id of ids) {
    const row = await loadImageStudioAsset(job.projectId, id, job.ownerId);
    if (!row || row.kind !== 'image' && row.kind !== 'reference') throw Object.assign(new Error('参考素材不可用'), { code: 'IMAGE_STUDIO_ASSET_INVALID' });
    const object = await getObjectFromOss(String(row.object_key));
    const original = Buffer.from(object.content as Buffer);
    sourceBytes += original.length;
    if (sourceBytes > 60 * 1024 * 1024) throw Object.assign(new Error('参考素材总大小超过 60 MB，请减少图片或压缩后重试'), { code: 'IMAGE_STUDIO_REFERENCE_SIZE_LIMIT' });
    const image = sharp(original, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'gif'].includes(String(metadata.format))) throw Object.assign(new Error('参考素材不是有效的 PNG/JPEG/WebP/GIF 图片'), { code: 'IMAGE_STUDIO_ASSET_INVALID' });
    const resized = sharp(original, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true });
    const buffer = metadata.hasAlpha ? await resized.png({ compressionLevel: 8 }).toBuffer() : await resized.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    preparedBytes += buffer.length;
    if (buffer.length > 10 * 1024 * 1024 || preparedBytes > 32 * 1024 * 1024) throw Object.assign(new Error('处理后的参考素材总大小超过 AI 请求限制'), { code: 'IMAGE_STUDIO_REFERENCE_SIZE_LIMIT' });
    results.push({ id, filename: String(row.filename), contentType: metadata.hasAlpha ? 'image/png' : 'image/jpeg', buffer });
  }
  return results;
}

async function readChatScreenshots(job: ProjectContext, ids: string[]) {
  if (!ids.length || ids.length > 12) throw Object.assign(new Error('聊天截图任务需要 1 至 12 张素材'), { code: 'IMAGE_STUDIO_CHAT_SCREENSHOT_REQUIRED' });
  const results: Array<{ id: string; filename: string; contentType: string; buffer: Buffer; caption: string }> = [];
  let sourceBytes = 0; let preparedBytes = 0;
  for (const [assetIndex, id] of ids.entries()) {
    const row = await loadImageStudioAsset(job.projectId, id, job.ownerId);
    if (!row || String(row.role) !== 'chat_screenshot') throw Object.assign(new Error('聊天截图不存在或类型不正确'), { code: 'IMAGE_STUDIO_CHAT_SCREENSHOT_INVALID' });
    const object = await getObjectFromOss(String(row.object_key));
    const original = Buffer.from(object.content as Buffer);
    sourceBytes += original.length;
    if (sourceBytes > 60 * 1024 * 1024) throw Object.assign(new Error('聊天截图总大小超过 60 MB，请分批识别'), { code: 'IMAGE_STUDIO_CHAT_SCREENSHOT_SIZE_LIMIT' });
    const resized = await sharp(original, { limitInputPixels: 100_000_000, failOn: 'error' })
      .rotate().resize({ width: 1800, withoutEnlargement: true }).png().toBuffer();
    const metadata = await sharp(resized).metadata();
    const width = metadata.width || 0; const height = metadata.height || 0;
    if (!width || !height) throw Object.assign(new Error('聊天截图不是有效图片'), { code: 'IMAGE_STUDIO_ASSET_INVALID' });
    const tileHeight = 2600; const overlap = 140; const step = tileHeight - overlap;
    const tileCount = Math.max(1, Math.ceil(Math.max(0, height - tileHeight) / step) + 1);
    if (results.length + tileCount > 36) throw Object.assign(new Error('截图过长或数量过多，请每次选择较少截图识别'), { code: 'IMAGE_STUDIO_CHAT_SCREENSHOT_TILE_LIMIT' });
    for (let tileIndex = 0, top = 0; top < height; tileIndex++) {
      const currentHeight = Math.min(tileHeight, height - top);
      const tileBuffer = await sharp(resized).extract({ left: 0, top, width, height: currentHeight })
        .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      preparedBytes += tileBuffer.length;
      if (tileBuffer.length > 8 * 1024 * 1024 || preparedBytes > 32 * 1024 * 1024) {
        throw Object.assign(new Error('处理后的聊天截图超过模型输入限制，请压缩截图或分批识别'), { code: 'IMAGE_STUDIO_CHAT_SCREENSHOT_SIZE_LIMIT' });
      }
      results.push({ id, filename: String(row.filename), contentType: 'image/jpeg', buffer: tileBuffer,
        caption: `聊天截图 ${assetIndex + 1}/${ids.length}，分段 ${tileIndex + 1}/${tileCount}。相邻分段可能有少量重叠，请合并连续对话，不要重复提取。` });
      if (top + currentHeight >= height) break;
      top += step;
    }
  }
  return results;
}

async function generateOpenAiImage(job: ProjectJob, generation: GenerationRow, profile: any, credential: any, workerJob: Job) {
  const options = typeof profile.options_json === 'string' ? JSON.parse(profile.options_json || '{}') : profile.options_json || {};
  const config = typeof generation.parameters_json === 'string' ? JSON.parse(generation.parameters_json || '{}') : generation.parameters_json || {};
  const refs = JSON.parse(String(generation.reference_asset_ids || '[]')) as string[];
  const referenceImages = await readReferenceImages(job, refs);
  const timeoutMs = Math.max(30_000, Math.min(Number(options.timeoutMs || process.env.IMAGE_STUDIO_UPSTREAM_TIMEOUT_MS || 240_000), 900_000));
  const model = String(profile.model_override || credential.model);
  const root = apiRoot(String(credential.baseUrl));
  const headers = { Authorization: `Bearer ${credential.apiKey}`, 'Idempotency-Key': String(generation.id) };
  let payload: any;
  if (referenceImages.length) {
    const form = new FormData();
    form.append('model', model); form.append('prompt', String(generation.prompt)); form.append('n', '1');
    if (config.size && config.size !== 'auto') form.append('size', String(config.size));
    if (config.quality) form.append('quality', String(config.quality));
    referenceImages.forEach((image, index) => form.append('image', new Blob([new Uint8Array(image.buffer)], { type: image.contentType }), `ref-${index + 1}.${image.contentType.split('/')[1] || 'png'}`));
    payload = await fetchJson(`${root}/images/edits`, { method: 'POST', headers, body: form }, timeoutMs,
      { source: 'image_studio', operation: 'image_edit', model, configId: credential.id, profileId: String(profile.id), referenceId: String(generation.id), apiKey: credential.apiKey });
  } else {
    const body: Record<string, unknown> = { model, prompt: String(generation.prompt), n: 1 };
    for (const key of ['size', 'quality', 'background', 'output_format', 'moderation']) if (config[key] !== undefined) body[key] = config[key];
    payload = await fetchJson(`${root}/images/generations`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs,
      { source: 'image_studio', operation: 'image_generation', model, configId: credential.id, profileId: String(profile.id), referenceId: String(generation.id), apiKey: credential.apiKey });
  }

  const imagePayload = parseImagePayload(payload);
  let buffer: Buffer; let contentType = 'image/png';
  if (imagePayload.base64) {
    buffer = Buffer.from(imagePayload.base64, 'base64');
    if (buffer.length > Number(options.maxOutputBytes || 25 * 1024 * 1024)) throw Object.assign(new Error('生成图片超过大小限制'), { code: 'IMAGE_TOO_LARGE' });
  } else {
    const baseHost = new URL(String(credential.baseUrl)).hostname.toLowerCase();
    const allowedHosts = [...new Set([baseHost, ...(Array.isArray(options.resultHosts) ? options.resultHosts.map((host: unknown) => String(host).toLowerCase()) : [])])];
    const downloaded = await downloadImage(imagePayload.url!, allowedHosts, timeoutMs, Number(options.maxOutputBytes || 25 * 1024 * 1024));
    buffer = downloaded.buffer; contentType = downloaded.contentType;
  }
  await workerJob.updateProgress({ phase: 'persisting', progress: 92, generationId: generation.id });
  return { buffer, contentType, model };
}

async function generateNativeImage(job: ProjectJob, generation: GenerationRow, profile: any, credential: any, workerJob: Job) {
  const options = typeof profile.options_json === 'string' ? JSON.parse(profile.options_json || '{}') : profile.options_json || {};
  const config = typeof generation.parameters_json === 'string' ? JSON.parse(generation.parameters_json || '{}') : generation.parameters_json || {};
  const refs = JSON.parse(String(generation.reference_asset_ids || '[]')) as string[];
  const referenceImages = await readReferenceImages(job, refs);
  const timeoutMs = Math.max(30_000, Math.min(Number(options.timeoutMs || process.env.IMAGE_STUDIO_UPSTREAM_TIMEOUT_MS || 600_000), 1_800_000));
  const root = apiRoot(String(credential.baseUrl)); const model = String(profile.model_override || credential.model);
  const params: Record<string, unknown> = { ...config };
  if (String(params.size || '').toLowerCase() === 'auto') {
    delete params.size;
    if (!params.resolution) params.resolution = 'auto';
  }
  if (referenceImages.length) params.images = referenceImages.map((image) => `data:${image.contentType};base64,${image.buffer.toString('base64')}`);
  const submitted = await fetchJson(`${root}/media/generate`, {
    method: 'POST', headers: { Authorization: `Bearer ${credential.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': String(generation.id) },
    body: JSON.stringify({ model, prompt: String(generation.prompt), params }),
  }, Math.min(timeoutMs, 60_000), { source: 'image_studio', operation: 'native_image_submit', model,
    configId: credential.id, profileId: String(profile.id), referenceId: String(generation.id), apiKey: credential.apiKey });
  const taskId = getTaskId(submitted);
  if (!taskId) throw Object.assign(new Error('上游未返回异步任务 ID'), { code: 'UPSTREAM_TASK_ID_MISSING' });
  await dbPool!.query('UPDATE image_studio_generations SET upstream_task_id=? WHERE id=?', [taskId, generation.id]);
  await writeJobEvent(job, 'generation.progress', { progress: 10, phase: 'upstream-queued', generationId: generation.id });

  const pollPath = String(options.statusPath || '/media/status');
  if (!pollPath.startsWith('/') || pollPath.startsWith('//')) throw Object.assign(new Error('模型状态路径配置无效'), { code: 'IMAGE_STUDIO_MODEL_PROFILE_INVALID' });
  const deadline = Date.now() + timeoutMs; let waitMs = Math.max(1000, Number(options.pollIntervalMs || 3000)); let lastProgress = 10; let lastEventAt = 0;
  while (Date.now() < deadline) {
    const [jobState]: any = await dbPool!.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.id]);
    if (['cancelling', 'cancelled'].includes(String(jobState[0]?.status))) {
      if (options.cancelPath && String(options.cancelPath).startsWith('/') && !String(options.cancelPath).startsWith('//')) {
        await fetchAiJson(`${root}${String(options.cancelPath).replace(':taskId', encodeURIComponent(taskId))}`, {
          method: 'POST', headers: { Authorization: `Bearer ${credential.apiKey}` }, redirect: 'error',
        }, 10_000, { source: 'image_studio', operation: 'native_image_cancel', model,
          configId: credential.id, profileId: String(profile.id), referenceId: String(generation.id), apiKey: credential.apiKey }).catch(() => undefined);
      }
      throw new UnrecoverableError('JOB_CANCELLED');
    }
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    let status: any;
    try { status = await fetchJson(`${root}${pollPath}?task_id=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${credential.apiKey}` } }, Math.min(30_000, timeoutMs),
      { source: 'image_studio', operation: 'native_image_poll', model, configId: credential.id, profileId: String(profile.id), referenceId: String(generation.id), apiKey: credential.apiKey }); }
    catch (error: any) { if (error.code === 'UPSTREAM_RATE_LIMITED' || error.retryable) { waitMs = Math.min(waitMs * 2, 15_000); continue; } throw error; }
    const state = String(status.state || status.status || '').toLowerCase();
    if (state === 'failed' || status.is_final === true && state !== 'success' && state !== 'completed') throw Object.assign(new Error(String(status.error || '上游图像任务失败')), { code: 'UPSTREAM_GENERATION_FAILED' });
    const pct = Number.parseInt(String(status.progress || ''), 10);
    if (Number.isFinite(pct)) lastProgress = Math.max(lastProgress, Math.min(90, pct));
    const phase = String(status.status || state || 'generating');
    await workerJob.updateProgress({ phase, progress: lastProgress, generationId: generation.id });
    if (Date.now() - lastEventAt >= 15_000 || (Number.isFinite(pct) && pct >= 95)) {
      await writeJobEvent(job, 'generation.progress', { phase, progress: lastProgress, generationId: generation.id });
      lastEventAt = Date.now();
    }
    if (status.is_final === true || state === 'success' || state === 'completed') {
      const parsed = parseImagePayload(status);
      if (parsed.base64) return { buffer: Buffer.from(parsed.base64, 'base64'), contentType: 'image/png', model };
      const baseHost = new URL(String(credential.baseUrl)).hostname.toLowerCase();
      const hosts = [...new Set([baseHost, ...(Array.isArray(options.resultHosts) ? options.resultHosts.map((host: unknown) => String(host).toLowerCase()) : [])])];
      const download = await downloadImage(parsed.url!, hosts, timeoutMs, Number(options.maxOutputBytes || 25 * 1024 * 1024));
      return { buffer: download.buffer, contentType: download.contentType, model };
    }
    waitMs = Math.min(Math.round(waitMs * 1.25), 10_000);
  }
  throw Object.assign(new Error('上游图像任务等待超时，可在任务记录中安全重试'), { code: 'UPSTREAM_GENERATION_TIMEOUT', retryable: false });
}

async function processGenerationJob(bullJob: Job) {
  if (!dbPool) throw new Error('MySQL unavailable');
  if (!isOssConfigured) throw Object.assign(new Error('生图任务需要已配置的私有 OSS'), { code: 'OSS_UNAVAILABLE', retryable: false });
  const jobId = String(bullJob.data?.jobId || bullJob.id || '');
  const job = await loadGenerationJob(jobId);
  if (['cancelled', 'cancelling'].includes(job.status)) {
    await dbPool.query(`UPDATE image_studio_generations SET status='cancelled',completed_at=? WHERE job_id=? AND status IN ('queued','running')`, [new Date(), job.id]);
    if (job.status === 'cancelling') await writeJobEvent(job, 'job.cancelled', { status: 'cancelled', progress: 100 }, 'cancelled');
    return { status: 'cancelled' };
  }
  const profile = await loadImageStudioProfile(job.profileId);
  if (!profile) throw Object.assign(new Error('图像模型配置已停用或不存在'), { code: 'IMAGE_STUDIO_MODEL_UNAVAILABLE', retryable: false });
  const credential = await getAiConfigCredentials(String(profile.ai_config_id));
  if (!credential) throw Object.assign(new Error('关联的 AI 配置不存在'), { code: 'AI_CONFIG_NOT_FOUND', retryable: false });
  await writeJobEvent(job, 'job.running', { progress: 1, total: job.generations.length }, 'running');

  let completed = 0; const total = job.generations.length;
  for (const generation of job.generations) {
    const [currentRows]: any = await dbPool.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.id]);
    if (['cancelled', 'cancelling'].includes(String(currentRows[0]?.status))) {
      await writeJobEvent(job, 'job.cancelled', { status: 'cancelled', progress: Math.floor(completed / total * 100) }, 'cancelled');
      return { status: 'cancelled', completed };
    }
    const current = String(generation.status);
    if (current === 'completed') { completed += 1; continue; }
    const profileOptions = typeof profile.options_json === 'string' ? JSON.parse(profile.options_json || '{}') : profile.options_json || {};
    const recovered = await recoverStoredOutput(job, generation, Number(profileOptions.maxOutputBytes || 25 * 1024 * 1024));
    if (recovered) {
      completed += 1;
      await writeJobEvent(job, 'generation.completed', { generationId: generation.id, slotKey: generation.slot_key, assetId: recovered.assetId, recovered: true });
      continue;
    }
    const [beforeUpstream]: any = await dbPool.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.id]);
    if (['cancelling', 'cancelled'].includes(String(beforeUpstream[0]?.status))) continue;
    await markGenerationRunning(String(generation.id), String(profile.model_override || credential.model));
    try {
      await bullJob.updateProgress({ phase: 'starting', progress: Math.floor(completed / total * 85), generationId: generation.id, slotKey: generation.slot_key });
      const result = profile.protocol === 'native-async'
        ? await generateNativeImage(job, generation, profile, credential, bullJob)
        : await generateOpenAiImage(job, generation, profile, credential, bullJob);
      await validateImage(result.buffer, Number(profileOptions.maxOutputBytes || 25 * 1024 * 1024));
      const ext = result.contentType === 'image/jpeg' ? 'jpg' : result.contentType === 'image/webp' ? 'webp' : 'png';
      const objectKey = `private/image-studio/generated/${job.projectId}/${generation.id}.${ext}`;
      await putPrivateBufferAtOssKey(objectKey, result.buffer, result.contentType);
      await headOssObject(objectKey);
      const assetId = await saveGenerationOutput({ generationId: String(generation.id), projectId: job.projectId, ownerId: job.ownerId,
        objectKey, filename: `generation-${generation.slot_key}.${ext}`, mimeType: result.contentType, size: result.buffer.length });
      if (!assetId) continue;
      completed += 1;
      const progress = Math.floor(completed / total * 95);
      await writeJobEvent(job, 'generation.completed', { generationId: generation.id, slotKey: generation.slot_key, assetId, progress });
      await bullJob.updateProgress({ phase: 'generation-completed', progress, generationId: generation.id, assetId });
    } catch (error: any) {
      const code = String(error?.code || 'GENERATION_FAILED'); const message = safeError(error);
      await markGenerationFailed(String(generation.id), code, message);
      await writeJobEvent(job, 'generation.failed', { generationId: generation.id, slotKey: generation.slot_key, code, message });
    }
  }
  const [counts]: any = await dbPool.query(`SELECT SUM(status='completed') AS completed,SUM(status='failed') AS failed FROM image_studio_generations WHERE job_id=?`, [job.id]);
  const succeeded = Number(counts[0]?.completed || 0); const failed = Number(counts[0]?.failed || 0);
  const [finalState]: any = await dbPool.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.id]);
  if (['cancelling', 'cancelled'].includes(String(finalState[0]?.status))) {
    await dbPool.query(`UPDATE image_studio_generations SET status='cancelled',completed_at=? WHERE job_id=? AND status IN ('queued','running')`, [new Date(), job.id]);
    await writeJobEvent(job, 'job.cancelled', { status: 'cancelled', progress: Math.floor(succeeded / total * 100), completed: succeeded, failed }, 'cancelled');
    return { status: 'cancelled', completed: succeeded, failed };
  }
  const status = failed === 0 ? 'completed' : succeeded > 0 ? 'partial' : 'failed';
  await writeJobEvent(job, status === 'failed' ? 'job.failed' : 'job.completed', { status, progress: 100, completed: succeeded, failed }, status);
  if (!succeeded) {
    const [errors]: any = await dbPool.query('SELECT error_code,error_message FROM image_studio_generations WHERE job_id=? AND status=\'failed\' ORDER BY created_at LIMIT 1', [job.id]);
    const retryable = new Set(['UPSTREAM_RATE_LIMITED', 'UPSTREAM_REQUEST_FAILED', 'UPSTREAM_IMAGE_TIMEOUT', 'UPSTREAM_IMAGE_DOWNLOAD_FAILED', 'OSS_UNAVAILABLE']);
    if (!retryable.has(String(errors[0]?.error_code || ''))) throw new UnrecoverableError(String(errors[0]?.error_message || '所有图片生成均失败'));
    await writeJobEvent(job, 'job.retrying', { status: 'queued', progress: 0, code: String(errors[0]?.error_code || 'IMAGE_STUDIO_ALL_GENERATIONS_FAILED') }, 'queued');
    throw Object.assign(new Error(String(errors[0]?.error_message || '所有图片生成均失败')), { code: String(errors[0]?.error_code || 'IMAGE_STUDIO_ALL_GENERATIONS_FAILED') });
  }
  return { status, completed: succeeded, failed };
}

const textInstructions: Record<string, string> = {
  asset_annotate: '逐张分析输入商品素材。输出 JSON：{"assets":[{"assetId":"原始 assetId","what":"画面内容","spec":"可识别型号规格或空字符串","color":"可识别颜色或空字符串","use":"从 主图白底/产品正面/多角度/颜色款式/材质细节/工艺局部/使用场景/上身效果/尺寸对比/包装配件/参数信息 中选一个","confidence":0-1}]}。不得猜测图片看不出的型号参数。',
  product_analyze: '结合商品素材和项目资料识别商品并整理信息。输出 JSON：{"productInfo":{"name":"不含品牌的商品名称或空字符串","category":"品类路径或空字符串","material":"能核实的材质或空字符串","color":"颜色或空字符串","shape":"版型或形态或空字符串","craft":"看得见的工艺或空字符串","lockTerm":"8至18字的商品外观锁定词","specifications":[{"name":"参数名","value":"参数值"}],"usageScenario":"建议使用场景或空字符串","usageFunction":"用户需求线索或空字符串","audience":"目标人群线索或空字符串","occasions":["适用场合"],"copyTone":"文案调性建议或空字符串"},"sellingPoints":[...],"painPoints":[...],"mainDirection":[...],"targetAudience":[...],"usageScenarios":[...],"productIdentity":"可见商品身份总结","factsToConfirm":[...]}。只补充图片或客户资料能支持的内容：不猜品牌、售价、原价、材质成分、型号参数、认证和功效；不确定的事实放入 factsToConfirm，规格参数只记录客户资料明确提供或图片中清楚可读的内容。使用场景、人群和文案调性属于建议，不能写成商品已证实事实。候选具体、可核验，不得虚构承诺。',
  chat_intake_extract: '你在整理客服与客户的电商接单聊天截图。只提取和本次商品设计任务有关的信息，不要抄录完整聊天，不要输出或保存客户姓名、手机号、微信号、收货地址、订单号等个人信息。将截图中客户明确提出或确认的内容，与客服建议、未确认的商品功效/参数清楚区分；图片或聊天无法确认的事实放入 factsToConfirm，禁止推断成真实商品事实。保留客户提供的商品链接；链接看不清时不要补造。只输出 JSON：{"summary":"本次需求简述","productName":"商品名称或空字符串","productLinks":["客户提供的商品链接"],"platform":"销售平台或空字符串","deadline":"交期或空字符串","deliverables":["图种、数量、尺寸线索"],"customerGoals":["客户目标"],"confirmedRequirements":["客户明确提出/双方确认的要求"],"sellingPointClues":["聊天中提到的卖点线索，不代表已核验商品事实"],"customerConcerns":["客户顾虑/用户痛点线索"],"visualPreferences":["客户对风格、构图、配色的偏好"],"mustKeep":["必须保留的真实商品外观/元素"],"avoid":["明确不想出现的内容"],"factsToConfirm":["仍需客户或商品资料核实的参数、功效或说法"],"followUpQuestions":["信息缺失时客服应向客户追问的问题"]}。每项使用简洁中文；没有信息时使用空字符串或空数组，不要填猜测内容。',
  storyboard: '根据商品资料、已确认的 customerBrief 和创作方向规划电商详情图分镜。优先满足 confirmedRequirements、deliverables、visualPreferences、mustKeep 和 avoid；sellingPointClues 只作待核实线索，factsToConfirm 不可写成已证实的宣传事实。输出 JSON：{"shots":[{"title":"页标题","purpose":"页面目的","kind":"页面类型","copy":"短文案","visualDescription":"画面描述","productVariant":"对应型号或颜色","referenceAssetIds":["输入素材 assetId"],"layoutReferenceAssetId":"竞品版式 assetId 或空字符串","layoutReason":"选择该版式的理由"}]}。每一页素材要按型号/颜色/用途匹配，引用必须来自输入素材。',
  copy_generate: '根据商品身份、已确认的 customerBrief 和创作方向生成适合电商详情图的短文案。只将 confirmedRequirements 作为客户要求，sellingPointClues 和 factsToConfirm 不能当作已核实的商品事实；proof 必须来自已核实资料。输出 JSON：{"copies":[{"shotId":"对应分镜 ID 或空字符串","headline":"标题","body":"正文","proof":"可验证依据"}]}。不要杜撰认证、参数或功效。',
  prompt_generate: '将商品资料、customerBrief、分镜和参考素材档案转成单页图像生成提示词。productInfo.lockTerm 是整套商品外观锚点，需优先保留；材质、颜色、形态和规格只使用已确认资料。遵守 mustKeep、avoid 和客户已确认要求；不要把未核实卖点写成事实，也不要让客户姓名、联系方式或聊天内容出现在图片中。输出 JSON：{"prompt":"完整中文提示词","negativePrompt":"需避免内容","referenceAssetIds":["只列实际匹配且存在的商品素材 ID"]}。若提供竞品版式参考，只将其转换成中性的构图、信息层级、留白和色彩布局描述；禁止在提示词中写竞品或描述对方商品，也绝不可将竞品素材 ID 放进 referenceAssetIds。referenceAssetIds 只能包含本项目中 role 为 product 且与本页型号/颜色匹配的素材。',
};

function parseJsonText(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { return { text: cleaned }; }
}

async function callPlanAgent(profileCapability: 'text' | 'vision', systemPrompt: string, payload: unknown,
  image?: { contentType: string; buffer: Buffer } | Array<{ contentType: string; buffer: Buffer; caption?: string }>, idempotencyKey?: string, preferredProfileId?: string) {
  if (!dbPool) throw new Error('MySQL unavailable');
  const [profiles]: any = await dbPool.query(`SELECT p.* FROM image_studio_model_profiles p JOIN ai_model_configs c
    ON c.id COLLATE utf8mb4_unicode_ci=p.ai_config_id COLLATE utf8mb4_unicode_ci AND c.enabled=TRUE
    WHERE p.capability=? AND p.enabled=TRUE ${preferredProfileId ? 'AND p.id=?' : ''} ORDER BY p.updated_at DESC,p.name LIMIT 1`, preferredProfileId ? [profileCapability, preferredProfileId] : [profileCapability]);
  if (!profiles[0]) throw new UnrecoverableError(`未配置启用的${profileCapability === 'vision' ? '图生文' : '文生文'}模型，请在模型配置中启用对应模型`);
  const profile = profiles[0];
  const credential = await getAiConfigCredentials(String(profile.ai_config_id));
  if (!credential) throw new UnrecoverableError(`方案 Agent 使用的${profileCapability === 'vision' ? '图生文' : '文生文'}配置不可用`);
  const options = typeof profile.options_json === 'string' ? JSON.parse(profile.options_json || '{}') : profile.options_json || {};
  const content: any[] = [{ type: 'text', text: `依据以下结构化输入完成当前 Agent 的工作，只返回一个 JSON 对象，不要 Markdown 代码围栏。\n\n${JSON.stringify(payload)}` }];
  const images: Array<{ contentType: string; buffer: Buffer; caption?: string }> = Array.isArray(image) ? image : image ? [image] : [];
  for (const item of images) {
    if (item.caption) content.push({ type: 'text', text: item.caption });
    content.push({ type: 'image_url', image_url: { url: `data:${item.contentType};base64,${item.buffer.toString('base64')}`, detail: 'high' } });
  }
  const response = await fetchJson(`${apiRoot(String(credential.baseUrl))}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${credential.apiKey}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ model: String(profile.model_override || credential.model), messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }],
      temperature: Math.max(0, Math.min(Number(options.temperature ?? 0.2), 1)), max_tokens: Math.max(512, Math.min(Number(options.maxTokens || 8000), 16_000)) }),
  }, Math.max(30_000, Math.min(Number(options.timeoutMs || 180_000), 600_000)),
  { source: 'image_studio', operation: `plan_agent_${profileCapability}`, model: String(profile.model_override || credential.model),
    configId: credential.id, profileId: String(profile.id), referenceId: idempotencyKey, apiKey: credential.apiKey });
  const raw = response?.choices?.[0]?.message?.content;
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((part: any) => part.text || '').join('\n') : '';
  const parsed = parseJsonText(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error('Agent 未返回有效 JSON'), { code: 'IMAGE_STUDIO_AGENT_INVALID_OUTPUT' });
  return { result: parsed, profileId: String(profile.id) };
}

async function processPlanAgent(bullJob: Job, job: Awaited<ReturnType<typeof loadImageStudioTextJob>>, snapshot: Record<string, any>) {
  if (!dbPool) throw new Error('MySQL unavailable');
  await writeJobEvent(job, 'job.running', { status: 'running', progress: 5, phase: 'image-analysis' }, 'running');
  await dbPool.query(`UPDATE image_studio_plan_runs SET status='processing',updated_at=NOW(3) WHERE job_id=?`, [job.id]);
  const attachments = Array.isArray(snapshot?.dossier?.imageAttachments) ? snapshot.dossier.imageAttachments.slice(0, 12) : [];
  const screenshotIds = Array.isArray(snapshot?.dossier?.screenshotAssetIds) ? snapshot.dossier.screenshotAssetIds.slice(0, 12) : [];
  const ids = attachments.map((item: any) => String(item.assetId || '')).filter(Boolean);
  const refs = ids.length ? await readReferenceImages(job, ids) : [];
  const imageAnalyses: any[] = [];
  const usedProfileIds = new Set<string>();
  const screenshotTranscripts: any[] = [];
  if (screenshotIds.length) {
    const tiles = await readChatScreenshots(job, screenshotIds);
    for (let offset = 0; offset < tiles.length; offset += 4) {
      const batch = tiles.slice(offset, offset + 4);
      const output = await callPlanAgent('vision', '你是聊天截图识别 Agent。读取与商品设计需求相关的客户和客服对话，尽量保留原意并标出说话方；明确提取客户确认、提及、客服建议和待确认内容。忽略姓名、头像、微信号、电话、地址、订单号等个人信息。图片中如出现商品照片，可简要描述可见外观线索，但不要将整张聊天截图作为生图参考图。根据每张图片上方的 segment 标签分别归纳。只输出 JSON：{"segments":[{"segment":"原样填写标签","transcript":"相关对话摘要，避免逐字抄录","visibleProductClues":[],"uncertainties":[]}]}',
        { segments: batch.map((tile) => tile.caption) }, batch.map((tile) => ({ contentType: tile.contentType, buffer: tile.buffer, caption: tile.caption })), `${String(bullJob.id)}-screenshots-${offset}`, job.profileId);
      usedProfileIds.add(output.profileId);
      const returned = Array.isArray(output.result.segments) ? output.result.segments : [];
      screenshotTranscripts.push(...batch.map((tile) => {
        const segment = returned.find((item: any) => String(item.segment || '').includes(tile.caption));
        return { screenshotAssetId: tile.id, transcript: String(segment?.transcript || ''), visibleProductClues: Array.isArray(segment?.visibleProductClues) ? segment.visibleProductClues : [], uncertainties: Array.isArray(segment?.uncertainties) ? segment.uncertainties : [] };
      }));
      const progress = Math.round(12 + (Math.min(offset + batch.length, tiles.length) / Math.max(tiles.length, 1)) * 28);
      await bullJob.updateProgress({ phase: 'screenshot-analysis', progress, completedSegments: Math.min(offset + batch.length, tiles.length), totalSegments: tiles.length });
      await writeJobEvent(job, 'job.progress', { status: 'running', progress, phase: 'screenshot-analysis', completedSegments: Math.min(offset + batch.length, tiles.length), totalSegments: tiles.length });
    }
    if (!screenshotTranscripts.some((item) => item.transcript || item.visibleProductClues.length)) {
      throw new UnrecoverableError('未能从所选截图识别出有效沟通内容，请上传清晰完整的截图');
    }
    for (const result of screenshotTranscripts) imageAnalyses.push({ assetId: result.screenshotAssetId, description: result.visibleProductClues.join('；'), visibleFacts: result.visibleProductClues, ocrText: [], possibleUse: '聊天截图中的商品外观线索（不是生图引用）', uncertainties: result.uncertainties });
  }
  for (let offset = 0; offset < refs.length; offset += 3) {
    const batch = refs.slice(offset, offset + 3);
    const analyses = await Promise.all(batch.map(async (ref) => {
      const attachment = attachments.find((item: any) => String(item.assetId) === ref.id) || {};
      const output = await callPlanAgent('vision', '你是电商商品参考图识别 Agent。识别图片中可见商品、颜色款式、图种用途、可读文字和视觉偏好；区分确定事实与不确定猜测。不要推断功效、材质成分、规格、认证或品牌。仅输出 JSON：{"assetId":"","description":"","visibleFacts":[],"ocrText":[],"possibleUse":"","uncertainties":[]}',
        { assetId: ref.id, filename: ref.filename, attachmentContext: attachment.label || '', nearbyMessages: (snapshot.messages || []).slice(-80).map((m: any) => ({ seq: m.seq, senderRole: m.senderRole, text: m.text })).slice(-40) },
        { contentType: ref.contentType, buffer: ref.buffer }, `${String(bullJob.id)}-vision-${ref.id}`, job.profileId);
      usedProfileIds.add(output.profileId);
      return { ...output.result, assetId: ref.id, sourceMessageIds: Array.isArray(attachment.sourceMessageIds) ? attachment.sourceMessageIds : [], role: attachment.role || 'reference' };
    }));
    imageAnalyses.push(...analyses);
    const progress = Math.round(12 + (imageAnalyses.length / Math.max(refs.length, 1)) * 28);
    await bullJob.updateProgress({ phase: 'image-analysis', progress, completedImages: imageAnalyses.length, totalImages: refs.length });
    await writeJobEvent(job, 'job.progress', { status: 'running', progress, phase: 'image-analysis', completedImages: imageAnalyses.length, totalImages: refs.length });
  }
  const sourceContext = { conversation: snapshot.conversation, messages: (snapshot.messages || []).slice(-120), dossier: {
    submittedForms: snapshot?.dossier?.submittedForms || [], pendingCandidates: snapshot?.dossier?.pendingCandidates || [],
    confirmedRequirements: snapshot?.dossier?.confirmedRequirements || [], imageAttachments: attachments,
    screenshotTranscripts,
  }, imageAnalyses };
  await writeJobEvent(job, 'job.running', { status: 'running', progress: 45, phase: 'requirement-extraction' }, 'running');
  await bullJob.updateProgress({ phase: 'requirement-extraction', progress: 48 });
  const requirementsAgent = await callPlanAgent('text', '你是电商客服需求抽取 Agent。只依据会话、协作档案与图片识别结果，保留客户明确确认、提及、客服建议、待确认的区别；来源证据必须引用消息 seq 或 assetId。识别商品信息、卖点线索和痛点，不把线索夸大为事实；不要输出个人身份信息。只输出 JSON：{"summary":"","product":"","productLinks":[],"requirements":[{"id":"req-1","text":"","status":"confirmed|mentioned|suggestion|to_confirm","evidence":["message:12"]}],"openQuestions":[]}', sourceContext, undefined, `${String(bullJob.id)}-requirements`);
  await bullJob.updateProgress({ phase: 'image-planning', progress: 62 });
  const planningAgent = await callPlanAgent('text', '你是电商批量生图方案 Agent。把需求拆成可执行的图片清单，每张图写独立的中文生图提示词，包含主体、构图、场景、光线、镜头/质感、文字留白等；不得捏造商品事实。明确 referenceImages，assetId 只能来自输入的实际商品图片附件，url 使用稳定地址 /api/image-studio/assets/{assetId}/preview；聊天截图不可作为生图参考图。requirements 仅引用输入中存在的 id。按电商交稿形成合理图种与顺序，信息不足放入 openQuestions。只输出 JSON：{"images":[{"id":"image-1","title":"","type":"","sku":"","output":"","prompt":"","negativePrompt":"","constraints":[],"referenceImages":[{"assetId":"","url":"","role":"","instruction":"","sourceMessageIds":[]}],"requirementIds":[],"status":"draft","issues":[]}],"openQuestions":[]}',
    { ...requirementsAgent.result, imageAnalyses, availableReferences: attachments.map((item: any) => ({ assetId: item.assetId, filename: item.filename, role: item.role, sourceMessageIds: item.sourceMessageIds || [] })) }, undefined, `${String(bullJob.id)}-planning`);
  await bullJob.updateProgress({ phase: 'verification', progress: 82 });
  const rawPlan = { ...requirementsAgent.result, ...planningAgent.result, imageAnalyses, validation: { valid: false, issues: [] } };
  const verified = await callPlanAgent('text', '你是方案校验 Agent。只检查并修复 JSON 方案结构、引用是否在提供素材中、需求状态证据、提示词是否包含未核实商品事实、是否遗漏关键信息。不要新增商品事实。给出完整可用方案并在 validation 中如实标注校验结果与待人工确认项。只输出 JSON，包含 summary,product,productLinks,requirements,imageAnalyses,images,openQuestions,validation。',
    { plan: rawPlan, knownAssetIds: ids, knownRequirementIds: (requirementsAgent.result.requirements || []).map((item: any) => item.id) }, undefined, `${String(bullJob.id)}-verification`);
  const plan = { ...verified.result, agentProfileIds: [...usedProfileIds, requirementsAgent.profileId, planningAgent.profileId, verified.profileId] };
  const knownAssets = new Set(ids);
  plan.images = Array.isArray(plan.images) ? plan.images.slice(0, 40).map((image: any) => ({ ...image,
    referenceImages: Array.isArray(image.referenceImages) ? image.referenceImages.filter((ref: any) => knownAssets.has(String(ref.assetId))).map((ref: any) => ({ ...ref, url: `/api/image-studio/assets/${ref.assetId}/preview` })) : [],
  })) : [];
  const issues: string[] = [];
  if (!plan.images.length) issues.push('未生成图片清单');
  if (plan.images.some((item: any) => !String(item.prompt || '').trim())) issues.push('存在缺少提示词的图片项');
  if (plan.images.some((item: any) => (item.referenceImages || []).some((ref: any) => !knownAssets.has(String(ref.assetId))))) issues.push('存在无效参考图');
  plan.validation = { ...(plan.validation && typeof plan.validation === 'object' ? plan.validation : {}), valid: issues.length === 0, issues: [...new Set([...(Array.isArray(plan.validation?.issues) ? plan.validation.issues : []), ...issues])], verifiedAt: new Date().toISOString() };
  await bullJob.updateProgress({ phase: 'saving-result', progress: 92 });
  const saved = await saveImageStudioTextResult(job, plan);
  if (!saved) throw new UnrecoverableError('图片方案任务状态已变化，结果未提交');
  return { status: 'completed', agentProfiles: [...new Set([requirementsAgent.profileId, planningAgent.profileId, verified.profileId])] };
}

async function processTextJob(bullJob: Job) {
  if (!dbPool) throw new Error('MySQL unavailable');
  const job = await loadImageStudioTextJob(String(bullJob.data?.jobId || bullJob.id || ''));
  if (['completed', 'cancelled'].includes(job.status)) return { status: job.status };
  if (job.status === 'cancelling') { await writeJobEvent(job, 'job.cancelled', { status: 'cancelled', progress: 100 }, 'cancelled'); return { status: 'cancelled' }; }
  let sourceType = 'screenshots';
  let collaborationSource: Record<string, any> | null = null;
  if (job.operation === 'plan_agent') {
    const [runs]: any = await dbPool.query('SELECT source_type,source_snapshot_json FROM image_studio_plan_runs WHERE job_id=? AND owner_id=? LIMIT 1', [job.id, job.ownerId]);
    sourceType = String(runs[0]?.source_type || '');
    const raw = runs[0]?.source_snapshot_json;
    try { collaborationSource = typeof raw === 'string' ? JSON.parse(raw) : raw || null; } catch { collaborationSource = null; }
    if (!collaborationSource || !['collaboration', 'invite', 'screenshots'].includes(sourceType)) throw new UnrecoverableError('图片方案会话快照缺失，无法继续');
    return processPlanAgent(bullJob, job, collaborationSource);
  }
  if (job.operation === 'chat_intake_extract') {
    const [intakes]: any = await dbPool.query('SELECT source_type,source_data_json FROM image_studio_chat_intakes WHERE id=? AND owner_id=? LIMIT 1', [job.id, job.ownerId]);
    sourceType = String(intakes[0]?.source_type || 'screenshots');
    const raw = intakes[0]?.source_data_json;
    try { collaborationSource = typeof raw === 'string' ? JSON.parse(raw) : raw || null; } catch { collaborationSource = null; }
    if (sourceType !== 'screenshots' && !collaborationSource) throw new UnrecoverableError('会话内容缺失，无法整理需求');
  }
  let systemPrompt = textInstructions[job.operation];
  if (job.operation === 'chat_intake_extract' && sourceType !== 'screenshots') {
    systemPrompt = '你在整理客服与客户的电商设计沟通记录。输入可能包含订单聊天、邀请会话聊天、客服协作卡片、已提交的需求表单、客户选择的方案、待确认建议和正式需求版本。只提取与本次商品设计任务有关的信息，不要逐字转录完整聊天，不要输出或保存客户姓名、手机号、微信号、收货地址、订单号等身份信息。正式确认的需求版本和客户明确提交/选择的内容优先；客服建议、未填写表单、待确认选项和客户未确认的内容必须单独标明，不能写成已确认要求。准确区分客户目标、视觉偏好和交付约束；不确定的商品功效、参数、认证均放入 factsToConfirm。保留客户提供的商品链接，不得补造链接。只输出 JSON：{"summary":"本次需求简述","productName":"商品名称或空字符串","productLinks":["客户提供的商品链接"],"platform":"销售平台或空字符串","deadline":"交期或空字符串","deliverables":["图种、数量、尺寸线索"],"customerGoals":["客户目标"],"confirmedRequirements":["正式档案或客户明确确认的要求"],"sellingPointClues":["协作资料中的卖点线索，不代表已核验商品事实"],"customerConcerns":["客户顾虑/用户痛点线索"],"visualPreferences":["客户对风格、构图、配色的偏好"],"mustKeep":["必须保留的真实商品外观/元素"],"avoid":["明确不想出现的内容"],"factsToConfirm":["仍需客户或商品资料核实的参数、功效或说法"],"followUpQuestions":["信息缺失时客服应向客户追问的问题"]}。没有依据时使用空字符串或空数组，不要猜测。';
  }
  if (job.operation === 'creative_candidates') {
    const dimension = CREATIVE_DIMENSIONS.find((item) => item.key === job.context?.dimension);
    if (!dimension) throw new UnrecoverableError('创作方向维度无效');
    const guidance: Record<string, string> = {
      selling: '给出商品真实、具体、能从素材或已填写资料核验的卖点。禁止编造参数、认证、功效、排名和承诺。',
      pain: '给出目标用户可能遇到的具体问题；不能暗示商品具备未被资料证明的解决能力。',
      main_direction: '给出可执行的详情页主叙事或视觉主线，避免把未经确认的功能当作事实。',
      target_audience: '给出清晰的人群画像或需求群体；区分资料明确的人群和谨慎推断的人群，不虚构人口统计数据。',
      usage_scenario: '给出与商品形态相符的具体使用场景；避免对安全、医疗或性能作无依据推断。',
      visual_style: '根据商品定位、目标受众和销售平台提出可落地的电商视觉风格方向，说明配色、质感、构图和页面氛围；避免只给抽象形容词。',
    };
    systemPrompt = `为电商商品的「${dimension.label}」维度生成 6 到 10 条互相有区别的候选。${guidance[dimension.key]}\n只输出 JSON：{"dimension":"${dimension.key}","candidates":["候选一","候选二"]}。每条简洁、可供用户单独采纳或拒绝。资料不足时给出保守表达，不要补造事实。`;
  }
  if (!systemPrompt) throw new UnrecoverableError('不支持的 AI 操作类型');
    const needsVision = job.operation === 'chat_intake_extract' && (sourceType === 'screenshots' || job.referenceAssetIds.length > 0);
    const capabilityClause = needsVision ? "capability='vision'" : "capability IN ('text','vision')";
    const [profiles]: any = await dbPool.query(`SELECT * FROM image_studio_model_profiles WHERE id=? AND ${capabilityClause} AND enabled=1 LIMIT 1`, [job.profileId]);
    if (!profiles[0]) throw new UnrecoverableError(needsVision ? '图片需求整理需要启用的图生文模型' : '文本或视觉模型配置已停用或不存在');
  const profileRow = profiles[0];
  const credential = await getAiConfigCredentials(String(profileRow.ai_config_id));
  if (!credential) throw new UnrecoverableError('关联的 AI 配置不存在');
  const options = typeof profileRow.options_json === 'string' ? JSON.parse(profileRow.options_json || '{}') : profileRow.options_json || {};
  const context = job.operation === 'chat_intake_extract' && sourceType !== 'screenshots'
    ? { ...job.context, collaborationSource }
    : job.context;
  const contextText = JSON.stringify(context);
  if (Buffer.byteLength(contextText, 'utf8') > 300_000) throw new UnrecoverableError('AI 上下文超过限制');
  await writeJobEvent(job, 'job.running', { status: 'running', progress: 5, operation: job.operation }, 'running');
  await bullJob.updateProgress({ phase: 'loading-references', progress: 10 });
  const refs = job.operation === 'chat_intake_extract' && sourceType !== 'screenshots'
    ? await readReferenceImages(job, job.referenceAssetIds)
    : job.operation === 'chat_intake_extract'
    ? await readChatScreenshots(job, job.referenceAssetIds)
    : await readReferenceImages(job, job.referenceAssetIds);
  const userContent: any[] = [{ type: 'text', text: job.operation === 'chat_intake_extract'
    ? sourceType !== 'screenshots'
      ? `请根据本次客服协作消息及关联的协作档案，整理生图需求。以正式确认的需求版本为准，标明尚未确认的线索；不要输出原文转录或个人身份信息。\n\n会话与协作档案 JSON：\n${contextText}`
      : `请根据聊天截图整理本项目的需求线索。不要输出原文转录或个人身份信息。\n\n上下文 JSON：\n${contextText}`
    : `请按系统要求分析以下数据。\n\n上下文 JSON：\n${contextText}\n\n图片 assetId：${refs.map((ref) => ref.id).join(', ') || '无'}` }];
  for (const ref of refs) {
    if ('caption' in ref) userContent.push({ type: 'text', text: ref.caption });
    else if (sourceType !== 'screenshots') {
      const attachment = collaborationSource?.dossier?.imageAttachments?.find((item: any) => item.assetId === ref.id);
      if (attachment) userContent.push({ type: 'text', text: `协作档案图片附件：${attachment.label || '未标注用途'}；素材档案：${attachment.filename}；当前分类：${attachment.role}。请将它作为需求参考资料，不要把图片中的人物或非商品内容误判为商品事实。` });
    }
    userContent.push({ type: 'image_url', image_url: { url: `data:${ref.contentType};base64,${ref.buffer.toString('base64')}`, detail: 'high' } });
  }
  const timeoutMs = Math.max(30_000, Math.min(Number(options.timeoutMs || 180_000), 600_000));
  const body = {
    model: String(profileRow.model_override || credential.model),
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
    temperature: Math.max(0, Math.min(Number(options.temperature ?? 0.3), 1.5)),
    max_tokens: Math.max(256, Math.min(Number(options.maxTokens || 6000), 16_000)),
  };
  await bullJob.updateProgress({ phase: 'requesting-ai', progress: 20 });
  const response = await fetchJson(`${apiRoot(String(credential.baseUrl))}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${credential.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': String(job.id) },
    body: JSON.stringify(body),
  }, timeoutMs, { source: 'image_studio', operation: String(job.operation), model: String(profileRow.model_override || credential.model),
    configId: credential.id, profileId: String(profileRow.id), referenceId: String(job.id), apiKey: credential.apiKey });
  const content = response?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((item: any) => item.text || '').join('\n') : '';
  if (!text.trim()) throw Object.assign(new Error('文本模型没有返回有效内容'), { code: 'UPSTREAM_EMPTY_RESPONSE', retryable: false });
  let result = parseJsonText(text);
  if (job.operation === 'chat_intake_extract') {
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new UnrecoverableError('未能识别聊天截图内容，请上传清晰、完整的截图');
    const brief = (result as any).brief && typeof (result as any).brief === 'object' ? (result as any).brief : result;
    const hasSignals = ['summary', 'productName', 'productLinks', 'deliverables', 'confirmedRequirements', 'sellingPointClues', 'customerConcerns', 'visualPreferences', 'followUpQuestions']
      .some((key) => typeof brief[key] === 'string' && brief[key].trim() || Array.isArray(brief[key]) && brief[key].some((item: unknown) => typeof item === 'string' && item.trim()));
    if (!hasSignals) throw new UnrecoverableError(sourceType !== 'screenshots' ? '未能从所选会话整理出有效需求，请确认会话中包含需求信息' : '未能从截图整理出有效需求，请上传更清晰的聊天截图');
    result = brief;
  }
  if (job.operation === 'creative_candidates') {
    const dimension = CREATIVE_DIMENSIONS.find((item) => item.key === job.context?.dimension);
    const rawCandidates = Array.isArray((result as any)?.candidates) ? (result as any).candidates : [];
    const candidates = [...new Set(rawCandidates.filter((item: unknown): item is string => typeof item === 'string')
      .map((item: string) => item.trim().slice(0, 500)).filter(Boolean))].slice(0, 10);
    if (!dimension || !candidates.length) throw new UnrecoverableError('模型未返回有效的创作方向候选');
    result = { dimension: dimension.key, candidates };
  }
  const [state]: any = await dbPool.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.id]);
  if (['cancelling', 'cancelled'].includes(String(state[0]?.status))) {
    await writeJobEvent(job, 'job.cancelled', { status: 'cancelled', progress: 100 }, 'cancelled'); return { status: 'cancelled' };
  }
  await bullJob.updateProgress({ phase: 'saving-result', progress: 90 });
  const saved = await saveImageStudioTextResult(job, result);
  if (!saved) {
    const [state]: any = await dbPool.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.id]);
    if (['cancelling', 'cancelled'].includes(String(state[0]?.status))) {
      await writeJobEvent(job, 'job.cancelled', { status: 'cancelled', progress: 100 }, 'cancelled');
      return { status: 'cancelled' };
    }
    throw new UnrecoverableError('任务状态已变化，结果未提交');
  }
  await bullJob.updateProgress({ phase: 'completed', progress: 100, resultAvailable: true });
  return { status: 'completed' };
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zipStoredFiles(files: Array<{ name: string; content: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const checksum = crc32(file.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.content.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.content.length, 20);
    central.writeUInt32LE(file.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function processExportJob(bullJob: Job) {
  if (!dbPool) throw new Error('MySQL unavailable');
  const jobId = String(bullJob.data?.jobId || bullJob.id || '');
  const job = await loadImageStudioExport(jobId);
  if (job.status === 'completed' && job.objectKey) return { status: 'completed', exportId: job.id };
  const jobContext = { id: job.jobId, projectId: job.projectId, ownerId: job.ownerId };
  const finishCancelled = async () => {
    await dbPool!.query("UPDATE image_studio_exports SET status='cancelled',updated_at=NOW(3) WHERE id=? AND status<>'completed'", [job.id]);
    await writeJobEvent(jobContext, 'job.cancelled', { status: 'cancelled', progress: 100, exportId: job.id }, 'cancelled');
    return { status: 'cancelled', exportId: job.id };
  };
  if (job.jobStatus === 'cancelled' || job.status === 'cancelled') return { status: 'cancelled', exportId: job.id };
  if (job.jobStatus === 'cancelling') return finishCancelled();
  if (!job.manifest.length || job.manifest.length > 100) throw new UnrecoverableError('导出清单无效');
  await dbPool.query("UPDATE image_studio_exports SET status='running',error_code=NULL,error_message=NULL,updated_at=NOW(3) WHERE id=? AND status IN ('queued','running')", [job.id]);
  const isCancellationRequested = async () => {
    const [rows]: any = await dbPool!.query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [job.jobId]);
    return ['cancelling', 'cancelled'].includes(String(rows[0]?.status));
  };
  if (await isCancellationRequested()) return finishCancelled();
  await writeJobEvent(jobContext, 'job.running', { status: 'running', progress: 1, imageCount: job.manifest.length });
  const files: Array<{ name: string; content: Buffer }> = [];
  let total = 0;
  for (let index = 0; index < job.manifest.length; index++) {
    if (await isCancellationRequested()) return finishCancelled();
    const item = job.manifest[index];
    const object = await getObjectFromOss(String(item.objectKey));
    const content = Buffer.isBuffer(object.content) ? object.content : Buffer.from(object.content as any);
    total += content.length;
    if (total > 100 * 1024 * 1024) throw new UnrecoverableError('导出图片超过 100 MB 限制');
    const original = String(item.filename || 'image.png').split('/').pop()!.replace(/[\r\n"]/g, '_').replaceAll('\\', '_').slice(0, 180);
    const name = String(index + 1).padStart(2, '0') + '-' + original;
    files.push({ name, content });
    const progress = 5 + Math.floor((index + 1) / job.manifest.length * 75);
    await writeJobEvent(jobContext, 'export.progress', { progress, completed: index + 1, total: job.manifest.length });
    await bullJob.updateProgress({ phase: 'reading-assets', progress, completed: index + 1, total: job.manifest.length });
  }
  if (await isCancellationRequested()) return finishCancelled();
  const archive = zipStoredFiles(files);
  const objectKey = 'private/image-studio/exports/' + job.id + '.zip';
  await putPrivateBufferAtOssKey(objectKey, archive, 'application/zip');
  if (!await saveImageStudioExport(job.id, objectKey)) return { status: 'cancelled', exportId: job.id };
  await bullJob.updateProgress({ phase: 'completed', progress: 100, exportId: job.id });
  return { status: 'completed', exportId: job.id, imageCount: files.length };
}

let dispatchTimer: NodeJS.Timeout | null = null;
let dispatching = false;
let workers: Worker[] = [];
let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatKey = '';

async function dispatchOutboxBatch() {
  if (!dbPool || dispatching) return;
  dispatching = true;
  try {
    const connection = await dbPool.getConnection();
    let rows: any[] = [];
    try {
      await connection.beginTransaction();
      rows = await claimOutbox(connection, 25);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }

    for (const row of rows) {
      try {
        const queueName = String(row.queue_name) as ImageStudioQueueName;
        const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
        await getImageStudioQueue(queueName).add(String(row.job_name), payload, {
          jobId: String(row.job_id), attempts: Number(process.env.IMAGE_STUDIO_QUEUE_ATTEMPTS || 4),
          backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 }, removeOnFail: false,
        });
        await dbPool.query(`UPDATE image_studio_outbox SET status='dispatched',dispatched_at=NOW(3),locked_until=NULL,last_error=NULL WHERE id=?`, [row.id]);
      } catch (error) {
        const attempts = Number(row.attempts || 0) + 1;
        const delay = Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));
        await dbPool.query(`UPDATE image_studio_outbox SET status='pending',available_at=DATE_ADD(NOW(3),INTERVAL ? MICROSECOND),locked_until=NULL,last_error=? WHERE id=?`,
          [delay * 1000, safeError(error), row.id]);
        console.error('[image-studio] outbox dispatch failed', { id: row.id, attempts, error: safeError(error) });
      }
    }
  } finally { dispatching = false; }
}

export function startImageStudioOutboxDispatcher() {
  if (!dbPool || dispatchTimer) return;
  dispatchTimer = setInterval(() => { void dispatchOutboxBatch().catch((error) => console.error('[image-studio] outbox dispatcher error', error)); }, 500);
  dispatchTimer.unref();
  void dispatchOutboxBatch().catch((error) => console.error('[image-studio] outbox dispatcher startup error', error));
}

export async function startImageStudioWorkers() {
  if (!dbPool) throw new Error('Worker requires MYSQL_URL');
  const { assertImageStudioInfrastructure } = await import('./image-studio-queue.js');
  assertImageStudioInfrastructure();
  if (!isOssConfigured) throw new Error('Worker requires private OSS configuration');
  startImageStudioOutboxDispatcher();
  if (workers.length) return;
  getImageStudioQueue(IMAGE_STUDIO_QUEUES.generation);
  getImageStudioQueue(IMAGE_STUDIO_QUEUES.export);
  const workerOptions = (concurrency: number) => ({ connection: getImageStudioRedisConnection() as never,
    concurrency: Math.max(1, Math.min(16, concurrency)), lockDuration: Math.max(60_000, Number(process.env.IMAGE_STUDIO_WORKER_LOCK_MS || 600_000)) });
  const generationWorker = new Worker(IMAGE_STUDIO_QUEUES.generation, processGenerationJob, workerOptions(Number(process.env.IMAGE_STUDIO_GENERATION_CONCURRENCY || 2)));
  const textWorker = new Worker(IMAGE_STUDIO_QUEUES.text, processTextJob, workerOptions(Number(process.env.IMAGE_STUDIO_TEXT_CONCURRENCY || 4)));
  const exportWorker = new Worker(IMAGE_STUDIO_QUEUES.export, processExportJob, workerOptions(Number(process.env.IMAGE_STUDIO_EXPORT_CONCURRENCY || 1)));
  for (const worker of [generationWorker, textWorker, exportWorker]) {
    worker.on('error', (error) => console.error('[image-studio] worker error', error));
    worker.on('failed', async (job, error) => {
      console.error('[image-studio] job failed', { jobId: job?.id, error: safeError(error) });
      if (!job?.id) return;
      try { if (await job.getState() === 'failed') await persistTerminalQueueFailure(String(job.id), error); }
      catch (persistError) { console.error('[image-studio] terminal failure persistence failed', { jobId: job.id, error: safeError(persistError) }); }
    });
  }
  workers = [generationWorker, textWorker, exportWorker];
  const instance = `${process.env.HOSTNAME || 'worker'}:${process.pid}:${randomUUID()}`;
  heartbeatKey = `image-studio:worker:${instance}`;
  const heartbeat = async () => {
    try {
      const client = await generationWorker.backend.client as any;
      await client.set(heartbeatKey, JSON.stringify({ instance, queues: [IMAGE_STUDIO_QUEUES.generation, IMAGE_STUDIO_QUEUES.text, IMAGE_STUDIO_QUEUES.export], at: Date.now() }), 'PX', 15_000);
    } catch (error) { console.error('[image-studio] worker heartbeat failed', safeError(error)); }
  };
  await heartbeat();
  heartbeatTimer = setInterval(() => { void heartbeat(); }, 5000);
  heartbeatTimer.unref();
}

async function persistTerminalQueueFailure(jobId: string, error: unknown) {
  if (!dbPool) return;
  const [jobs]: any = await dbPool.query(`SELECT id,project_id,owner_id,status,job_type,request_json FROM image_studio_jobs WHERE id=? LIMIT 1`, [jobId]);
  const row = jobs[0];
  if (!row || ['completed', 'partial', 'cancelled'].includes(String(row.status))) return;
  const [generationErrors]: any = await dbPool.query(`SELECT error_code,error_message FROM image_studio_generations
    WHERE job_id=? AND status='failed' ORDER BY created_at DESC LIMIT 1`, [jobId]);
  const code = String(generationErrors[0]?.error_code || (error as any)?.code || 'IMAGE_STUDIO_WORKER_FAILED').slice(0, 64);
  const message = safeError(generationErrors[0]?.error_message || error || '后台任务失败');
  if (String(row.job_type) === 'export') { await failImageStudioExport(jobId, code, message); return; }
  const request = typeof row.request_json === 'string' ? JSON.parse(row.request_json || '{}') : row.request_json || {};
  if (request.operation === 'chat_intake_extract') {
    await dbPool.query(`UPDATE image_studio_chat_intakes SET status='failed',error_code=?,error_message=?,updated_at=?
      WHERE id=? AND status IN ('queued','processing')`, [code, message, new Date(), jobId]);
  }
  if (request.operation === 'plan_agent') {
    await dbPool.query(`UPDATE image_studio_plan_runs SET status='failed',error_code=?,error_message=?,updated_at=?,completed_at=?
      WHERE job_id=? AND status IN ('queued','processing')`, [code, message, new Date(), new Date(), jobId]);
  }
  const job = { id: String(row.id), projectId: String(row.project_id), ownerId: String(row.owner_id) };
  await writeJobEvent(job, 'job.failed', { status: 'failed', progress: 100, code, message }, 'failed');
}

export async function stopImageStudioWorkers() {
  if (dispatchTimer) clearInterval(dispatchTimer);
  dispatchTimer = null;
  await Promise.all(workers.map((worker) => worker.close()));
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (heartbeatKey && workers.length) {
    try { const client = await workers[0].backend.client as any; await client.del(heartbeatKey); }
    catch { /* The TTL removes a stale worker record after an unclean stop. */ }
  }
  heartbeatKey = '';
  workers = [];
}

export async function imageStudioWorkerHealth() {
  const configured = Boolean(process.env.REDIS_URL && dbPool && isOssConfigured);
  if (!configured) return { configured, redisHealthy: false, workerRunning: workers.length > 0 };
  try {
    const queue = getImageStudioQueue(IMAGE_STUDIO_QUEUES.generation);
    const [counts, client] = await Promise.all([
      Promise.all(Object.values(IMAGE_STUDIO_QUEUES).map((name) => getImageStudioQueue(name as ImageStudioQueueName).getJobCounts('waiting', 'active', 'delayed', 'failed'))),
      queue.backend.client as any,
    ]);
    let cursor = '0'; const keys: string[] = [];
    do { const result = await client.scan(cursor, 'MATCH', 'image-studio:worker:*', 'COUNT', 100); cursor = String(result[0]); keys.push(...result[1]); } while (cursor !== '0' && keys.length < 1000);
    const workersOnline = keys.length ? await client.mget(...keys) : [];
    const activeWorkers = workersOnline.filter(Boolean).map((value: string) => { try { return JSON.parse(value); } catch { return null; } }).filter(Boolean);
    return { configured: true, redisHealthy: true, workerRunning: activeWorkers.length > 0, activeWorkers: activeWorkers.length, queues: counts };
  } catch { return { configured: true, workerRunning: false, redisHealthy: false }; }
}
