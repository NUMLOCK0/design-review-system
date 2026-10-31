import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbPool } from '../config/database.js';
import { getObjectFromOss, getSignedOssUrl, isOssConfigured } from '../config/oss-client.js';
import { authenticate, JWT_SECRET, requireRoles } from '../middleware/auth.middleware.js';
import { getEnabledAiModelProfileCredentials, listAiConfigs } from '../services/ai-config.js';
import {
  attachImageStudioAsset, createCreativeCandidateJob, createImageStudioGenerationJob, createImageStudioProject, createImageStudioTextJob, deleteImageStudioProject,
  cancelImageStudioJob, getImageStudioEvents, getImageStudioJob, getImageStudioProject, listImageStudioAssets, removeImageStudioAsset,
  listImageStudioJobs, listImageStudioModelProfiles, listImageStudioProjects, saveImageStudioModelProfile, updateImageStudioAsset,
  retryImageStudioJob, setImageStudioCreativeCandidate, updateImageStudioCreativeDirection, getImageStudioCreativeDirections, updateImageStudioProject,
  listImageStudioGenerationReviews, updateImageStudioGenerationReview,
  createImageStudioExport, listImageStudioExports, listImageStudioChatIntakes, reviewImageStudioChatIntake,
  createImageStudioCollaborationChatIntakeJob, listImageStudioCollaborationConversations,
  listImageStudioPlans, reviewImageStudioPlan, exportImageStudioPlan,
  createImageStudioScreenshotPlanJob,
} from '../services/image-studio.js';
import { imageStudioWorkerHealth } from '../services/image-studio-worker.js';
import { createOrchestrationDraft, getOrchestrationDraft } from '../services/image-studio-orchestration.js';
import { orchestrationEnabled, orchestrationStartSchema, startOrchestration, controlOrchestration } from '../services/image-studio-orchestration-runtime.js';
import { layeredPsdSchema } from '../services/image-studio-layered-psd.js';
import { assertImageStudioInfrastructure } from '../services/image-studio-queue.js';
import { createCanvasProject, deleteCanvasProject, listCanvasAssets, listCanvasProjects, saveCanvasAssets, updateCanvasProject, type CanvasLibraryAsset, type CanvasProjectSnapshot } from '../services/image-studio-canvas.js';
import { generateImageStudioDesignPlan, imageStudioDesignPlanSchema, saveImageStudioDesignPlan } from '../services/image-studio-design-agent.js';
import { aiResponseError, fetchAiJson, recordAiInvocation, sanitizeAiError } from '../services/ai-call-log.js';
import { imageStudioMarketResearchInputSchema, searchImageStudioMarket } from '../services/image-studio-research.js';
import { listDesignSkills } from '../services/design-skills.js';
import { createVectorJob, latestVectorJobs, vectorizeStudioImage } from '../services/image-studio-vectorize.js';
import { composeLogoTypography } from '../services/logo-typography.js';
import { confirmProductInvestigation, generateProductInvestigation, investigationSchema } from '../services/product-investigation.js';
import { agentChatInputSchema, getAgentConversation, getAgentPlanHistory, getAgentRun, retryAgentChatMessage, sendAgentChatMessage } from '../services/image-studio-agent-chat.js';

export const imageStudioRouter = Router();
imageStudioRouter.use(authenticate);
imageStudioRouter.use((req, res, next) => {
  if (req.path.startsWith('/admin/')) return next();
  if (req.user?.role !== 'customer_service') {
    return res.status(403).json({ code: 403, success: false, message: '生图工作台仅对客服开放' });
  }
  next();
});

const projectId = z.string().min(1).max(64);
let activeProductInvestigations = 0;
imageStudioRouter.post('/projects/:projectId/product-investigation', async (req, res, next) => {
  let connection: Awaited<ReturnType<NonNullable<typeof dbPool>['getConnection']>> | undefined; let lockName = ''; let locked = false; let counted = false;
  try {
    const input = z.object({ productType: z.string().trim().min(1).max(120), modelProfileId: z.string().min(1).max(64).optional(), visionProfileId: z.string().min(1).max(64).optional(), readReports: z.boolean().default(true), searchWeb: z.boolean().default(true) }).strict().parse(req.body);
    const id = projectId.parse(req.params.projectId);
    if (!dbPool) throw Object.assign(new Error('数据库不可用'), { status: 503 });
    if (activeProductInvestigations >= 2) throw Object.assign(new Error('商品调查任务较多，请稍后重试'), { status: 429 });
    activeProductInvestigations++; counted = true;
    connection = await dbPool.getConnection();
    lockName = `product-investigation:${createHash('sha256').update(`${req.user!.id}:${id}`).digest('hex').slice(0, 32)}`;
    const [rows]: any = await connection.query('SELECT GET_LOCK(?,0) AS acquired', [lockName]);
    locked = Number(rows[0]?.acquired) === 1;
    if (!locked) throw Object.assign(new Error('商品调查正在进行，请稍后查看结果'), { status: 409 });
    res.json({ success: true, data: await generateProductInvestigation(id, req.user!, input) });
  } catch (error) { next(error); }
  finally { if (connection) { if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => undefined); connection.release(); } if (counted) activeProductInvestigations--; }
});
imageStudioRouter.post('/projects/:projectId/product-investigation/confirm', async (req, res, next) => {
  try {
    const input = z.object({ version: z.number().int().positive(), data: investigationSchema }).strict().parse(req.body);
    res.json({ success: true, data: await confirmProductInvestigation(projectId.parse(req.params.projectId), req.user!, input) });
  } catch (error) { next(error); }
});
const projectSchema = z.object({ name: z.string().trim().min(1).max(160), platform: z.string().trim().max(48).nullable().optional(),
  workflow: z.record(z.unknown()).optional() }).strict();
const patchProjectSchema = z.object({ name: z.string().trim().min(1).max(160).optional(), platform: z.string().trim().max(48).nullable().optional(),
  workflow: z.unknown().optional(), version: z.number().int().min(1) }).strict();

imageStudioRouter.get('/orchestration-capabilities', (_req, res) => res.json({ success: true, data: { enabled: orchestrationEnabled() } }));
imageStudioRouter.post('/projects/:projectId/vectorize', async (req, res, next) => {
  try {
    const input = z.object({ assetId: z.string().regex(/^[\w-]{1,64}$/), source: z.enum(['studio', 'workspace']), mode: z.enum(['detail', 'smooth']) }).strict().parse(req.body);
    res.json({ success: true, data: await vectorizeStudioImage(projectId.parse(req.params.projectId), req.user!, input) });
  } catch (error) { next(error); }
});
imageStudioRouter.post('/projects/:projectId/vectorize-jobs', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = z.object({ assetId: z.string().regex(/^[\w-]{1,64}$/), source: z.enum(['studio', 'workspace']), mode: z.enum(['detail', 'smooth', 'ocr']), visionProfileId: z.string().min(1).max(64).optional(), idempotencyKey: z.string().min(16).max(128) }).strict().refine((value) => value.mode === 'ocr' ? Boolean(value.visionProfileId) : !value.visionProfileId, { message: '请选择有效的图片理解模型' }).parse(req.body);
    const { idempotencyKey, ...vectorInput } = input;
    const data = await createVectorJob(projectId.parse(req.params.projectId), req.user!, vectorInput, idempotencyKey);
    res.status(data.duplicate ? 200 : 202).json({ success: true, data });
  } catch (error) { next(error); }
});
imageStudioRouter.get('/projects/:projectId/vectorize-jobs/latest', async (req, res, next) => {
  try {
    const input = z.object({ assetId: z.string().regex(/^[\w-]{1,64}$/), source: z.enum(['studio', 'workspace']) }).parse(req.query);
    res.json({ success: true, data: await latestVectorJobs(projectId.parse(req.params.projectId), req.user!, input.assetId, input.source) });
  } catch (error) { next(error); }
});
imageStudioRouter.post('/projects/:projectId/vectorize-jobs/:jobId/typography', async (req, res, next) => {
  try {
    const input = z.object({ text: z.string().trim().min(1).max(80), weight: z.union([z.literal(400), z.literal(700)]), color: z.string().regex(/^#[0-9a-f]{6}$/i), size: z.number().min(24).max(180), spacing: z.number().min(0).max(20) }).strict().parse(req.body);
    await getImageStudioProject(projectId.parse(req.params.projectId), req.user!);
    const job = await getImageStudioJob(req.params.jobId, req.user!);
    if (job.projectId !== projectId.parse(req.params.projectId) || job.type !== 'vectorize' || job.status !== 'completed' || !job.result || typeof (job.result as any).svg !== 'string')
      return res.status(404).json({ success: false, message: '矢量结果不存在或无权访问' });
    const result = job.result as { svg: string; width: number; height: number };
    res.json({ success: true, data: composeLogoTypography({ ...input, svg: result.svg, width: result.width, height: result.height }) });
  } catch (error) { next(error); }
});
imageStudioRouter.post('/projects/:projectId/orchestrations', async (req, res, next) => {
  try {
    if (!orchestrationEnabled()) return res.status(503).json({ success: false, message: '后台调度尚未启用' });
    assertImageStudioInfrastructure();
    return res.status(202).json({ success: true, data: await startOrchestration(projectId.parse(req.params.projectId), req.user!, orchestrationStartSchema.parse(req.body)) });
  } catch (e) { next(e); }
});
imageStudioRouter.get('/projects/:projectId/orchestrations', async (req, res, next) => {
  try {
    await getImageStudioProject(projectId.parse(req.params.projectId), req.user!);
    const [runs]: any = await dbPool!.query('SELECT id FROM image_studio_orchestration_runs WHERE project_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 10', [req.params.projectId, req.user!.id]);
    return res.json({ success: true, data: await Promise.all(runs.map((row: any) => getOrchestrationDraft(String(req.params.projectId), String(row.id), req.user!))) });
  } catch (e) { next(e); }
});
imageStudioRouter.get('/projects/:projectId/orchestrations/:runId/events', async (req, res, next) => {
  try {
    const pid = projectId.parse(req.params.projectId); const rid = z.string().uuid().parse(req.params.runId);
    await getOrchestrationDraft(pid, rid, req.user!);
    const after = z.coerce.number().int().min(0).default(0).parse(req.query.after);
    const [rows]: any = await dbPool!.query('SELECT event_id,event_type,task_id,payload_json,created_at FROM image_studio_orchestration_events WHERE run_id=? AND project_id=? AND owner_id=? AND event_id>? ORDER BY event_id LIMIT 200', [rid, pid, req.user!.id, after]);
    return res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});
imageStudioRouter.post('/projects/:projectId/orchestrations/:runId/control', async (req, res, next) => {
  try {
    if (!orchestrationEnabled()) return res.status(503).json({ success: false, message: '后台调度尚未启用' });
    const input = z.object({ action: z.enum(['cancel', 'approve', 'retry', 'continue_automatically']), taskId: z.string().min(1).max(64).optional() }).strict().parse(req.body);
    if (['approve', 'retry'].includes(input.action) && !input.taskId) return res.status(400).json({ success: false, message: '缺少任务 ID' });
    return res.json({ success: true, data: await controlOrchestration(projectId.parse(req.params.projectId), z.string().uuid().parse(req.params.runId), req.user!, input.action, input.taskId) });
  } catch (e) { next(e); }
});

// Draft-only API; not connected to the production execution flow until the
// dispatcher, recovery and approval workflow are ready.
imageStudioRouter.post('/projects/:projectId/orchestration-drafts', async (req, res, next) => {
  try {
    if (process.env.IMAGE_STUDIO_ORCHESTRATION_DRAFTS_ENABLED !== 'true') return res.status(503).json({ success: false, code: 'ORCHESTRATION_NOT_ENABLED', message: '调度预览尚未启用' });
    const input = z.object({ planVersion: z.number().int().positive(), idempotencyKey: z.string().min(16).max(128) }).strict().parse(req.body);
    const result = await createOrchestrationDraft(projectId.parse(req.params.projectId), req.user!, input);
    return res.status(result.duplicate ? 200 : 201).json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/orchestration-drafts/:runId', async (req, res, next) => {
  try {
    if (process.env.IMAGE_STUDIO_ORCHESTRATION_DRAFTS_ENABLED !== 'true') return res.status(503).json({ success: false, code: 'ORCHESTRATION_NOT_ENABLED', message: '调度预览尚未启用' });
    const data = await getOrchestrationDraft(projectId.parse(req.params.projectId), z.string().uuid().parse(req.params.runId), req.user!);
    return res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/health', async (_req, res) => {
  const queue = await imageStudioWorkerHealth();
  const mysql = Boolean(dbPool);
  const oss = isOssConfigured;
  const healthy = mysql && oss && queue.configured && queue.redisHealthy !== false && queue.workerRunning;
  res.status(healthy ? 200 : 503).json({ code: healthy ? 200 : 503, success: healthy,
    data: { mysql, oss, ...queue } });
});

imageStudioRouter.post('/socket-ticket', (req, res) => {
  const ticket = jwt.sign({ id: req.user!.id, purpose: 'image-studio-socket' }, JWT_SECRET, { expiresIn: '60s' });
  res.json({ code: 200, success: true, data: { ticket, expiresIn: 60 } });
});

imageStudioRouter.get('/model-profiles', async (_req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioModelProfiles() }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects', async (req, res, next) => {
  try {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().optional() }).parse(req.query);
    res.json({ code: 200, success: true, data: await listImageStudioProjects(req.user!, query.limit, query.cursor) });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects', async (req, res, next) => {
  try { const input = projectSchema.parse(req.body); res.status(201).json({ code: 200, success: true, data: await createImageStudioProject(req.user!, input) }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await getImageStudioProject(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/canvas/text', async (req, res, next) => {
  try {
    const id = projectId.parse(req.params.projectId);
    const textPart = z.object({ type: z.literal('text'), text: z.string().max(24000) }).strict();
    const imagePart = z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string().max(12_000_000).regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/) }).strict() }).strict();
    const input = z.object({ modelProfileId: z.string().min(1).max(64), messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.union([z.string().max(24000), z.array(z.union([textPart, imagePart])).max(25)]) }).strict()).min(1).max(30) }).strict().parse(req.body);
    await getImageStudioProject(id, req.user!);
    const hasImages = input.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'));
    const credential = await getEnabledAiModelProfileCredentials(input.modelProfileId, hasImages ? ['vision'] : ['text', 'vision']);
    if (!credential) throw Object.assign(new Error(hasImages ? '当前模型不支持图片理解，请选择后台启用的图片理解模型' : '所选模型已停用或不存在，请重新选择'), { status: 409 });
    const root = credential.baseUrl.replace(/\/+$/, '');
    const endpoint = `${/\/v1$/i.test(root) ? root : `${root}/v1`}/chat/completions`;
    try {
      const { response, data } = await fetchAiJson(endpoint, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${credential.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: credential.model, messages: input.messages }) }, 180_000,
        { source: 'image_studio', operation: 'canvas_text', model: credential.model, configId: credential.configId, profileId: credential.id, referenceId: id, apiKey: credential.apiKey });
      const error = aiResponseError(response.status, data);
      if (error) throw new Error(error.message);
      const content = data?.choices?.[0]?.message?.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part: any) => part.text || '').join('\n') : '';
      if (!text.trim()) throw new Error('文本模型没有返回有效内容');
      res.json({ code: 200, success: true, data: { text } });
    } catch (error) { throw Object.assign(new Error(sanitizeAiError(error, credential.apiKey)), { status: 502 }); }
  } catch (error) { next(error); }
});

imageStudioRouter.put('/projects/:projectId', async (req, res, next) => {
  try { const input = patchProjectSchema.parse(req.body); res.json({ code: 200, success: true, data: await updateImageStudioProject(projectId.parse(req.params.projectId), req.user!, input) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/design-agent/research', async (req, res, next) => {
  try {
    const input = imageStudioMarketResearchInputSchema.parse(req.body);
    const data = await searchImageStudioMarket(projectId.parse(req.params.projectId), req.user!, input);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/design-agent/conversation', async (req, res, next) => {
  try {
    const { beforeSeq } = z.object({ beforeSeq: z.coerce.number().int().positive().optional() }).parse(req.query);
    res.json({ code: 200, success: true, data: await getAgentConversation(projectId.parse(req.params.projectId), req.user!, beforeSeq) });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/design-agent/messages', async (req, res, next) => {
  try {
    const data = await sendAgentChatMessage(projectId.parse(req.params.projectId), req.user!, agentChatInputSchema.parse(req.body));
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/design-agent/messages/:messageId/retry', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await retryAgentChatMessage(projectId.parse(req.params.projectId), projectId.parse(req.params.messageId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/design-agent/runs/:runId', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await getAgentRun(projectId.parse(req.params.projectId), projectId.parse(req.params.runId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/design-agent/revisions', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await getAgentPlanHistory(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/design-agent/plan', async (req, res, next) => {
  const startedAt = Date.now();
  const logMeta = { source: 'design_agent_api', operation: 'plan_endpoint', referenceId: String(req.params.projectId || '') };
  try {
    const input = z.object({
      brief: z.string().trim().min(8).max(6000),
      mode: z.enum(['brand', 'product']).default('product'),
      skillIds: z.array(z.string().trim().min(1).max(64)).max(5).default([]),
      answers: z.record(z.string().max(1200)).default({}),
      modelProfileId: z.string().trim().min(1).max(64).optional(),
      referenceAssetIds: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
      sourceConversation: z.object({ type: z.enum(['order', 'intake']), id: z.string().trim().min(1).max(64) }).strict().optional(),
    }).strict().parse(req.body);
    const data = await generateImageStudioDesignPlan(projectId.parse(req.params.projectId), req.user!, input);
    await recordAiInvocation(logMeta, { status: 'success', durationMs: Date.now() - startedAt });
    res.json({ code: 200, success: true, data });
  } catch (error: any) {
    await recordAiInvocation(logMeta, { status: 'error', durationMs: Date.now() - startedAt,
      httpStatus: Number.isInteger(error?.status) ? error.status : 500,
      errorCode: String(error?.code || error?.name || 'DESIGN_AGENT_REQUEST_FAILED'), errorMessage: error?.message || error });
    next(error);
  }
});

imageStudioRouter.put('/projects/:projectId/design-agent/plan', async (req, res, next) => {
  try {
    const input = z.object({
      version: z.number().int().min(1), planVersion: z.number().int().min(1),
      plan: imageStudioDesignPlanSchema, answers: z.record(z.string().max(1200)).default({}), approve: z.boolean().default(false),
    }).strict().parse(req.body);
    const data = await saveImageStudioDesignPlan(projectId.parse(req.params.projectId), req.user!, input);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.delete('/projects/:projectId', async (req, res, next) => {
  try { await deleteImageStudioProject(projectId.parse(req.params.projectId), req.user!); res.json({ code: 200, success: true, data: { deleted: true } }); }
  catch (error) { next(error); }
});

const canvasSnapshotSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
  nodes: z.array(z.unknown()).max(50000),
  connections: z.array(z.unknown()).max(100000),
}).passthrough();

imageStudioRouter.get('/canvas/projects', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listCanvasProjects(req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/canvas/projects', async (req, res, next) => {
  try {
    const { project } = z.object({ project: canvasSnapshotSchema }).strict().parse(req.body);
    res.status(201).json({ code: 200, success: true, data: await createCanvasProject(req.user!, project as CanvasProjectSnapshot) });
  } catch (error) { next(error); }
});

imageStudioRouter.put('/canvas/projects/:projectId', async (req, res, next) => {
  try {
    const input = z.object({ project: canvasSnapshotSchema, version: z.number().int().min(1) }).strict().parse(req.body);
    res.json({ code: 200, success: true, data: await updateCanvasProject(req.user!, projectId.parse(req.params.projectId), input.project as CanvasProjectSnapshot, input.version) });
  } catch (error) { next(error); }
});

imageStudioRouter.delete('/canvas/projects/:projectId', async (req, res, next) => {
  try {
    await deleteCanvasProject(req.user!, projectId.parse(req.params.projectId));
    res.json({ code: 200, success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/canvas/assets', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listCanvasAssets(req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.put('/canvas/assets', async (req, res, next) => {
  try {
    const input = z.object({ assets: z.array(z.record(z.unknown())).max(500), deletedIds: z.array(z.string().min(1).max(64)).max(500).default([]) }).strict().parse(req.body);
    res.json({ code: 200, success: true, data: await saveCanvasAssets(req.user!, input.assets as unknown as CanvasLibraryAsset[], input.deletedIds) });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/assets', async (req, res, next) => {
  try {
    const input = z.object({ mediaAssetId: z.string().regex(/^asset_[a-f0-9]{32}$/i), role: z.enum(['product', 'competitor', 'packaging', 'other', 'chat_screenshot', 'brand_logo', 'report']) }).strict().parse(req.body);
    const data = await attachImageStudioAsset(projectId.parse(req.params.projectId), req.user!, input.mediaAssetId, input.role);
    res.status(201).json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/assets', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioAssets(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.delete('/projects/:projectId/assets/:assetId', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await removeImageStudioAsset(projectId.parse(req.params.projectId), req.params.assetId, req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.patch('/projects/:projectId/assets/:assetId', async (req, res, next) => {
  try {
    const input = z.object({ role: z.enum(['product', 'competitor', 'packaging', 'other', 'chat_screenshot', 'brand_logo', 'report']).optional(),
      manualCatalog: z.object({ what: z.string().max(500).optional(), spec: z.string().max(500).optional(), color: z.string().max(500).optional(), use: z.string().max(120).optional() }).strict().optional(),
      version: z.number().int().min(1).optional() }).strict().superRefine((value, context) => {
        if (value.manualCatalog && value.version === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['version'], message: '保存素材档案时必须提供版本号' });
        if (!value.role && !value.manualCatalog) context.addIssue({ code: z.ZodIssueCode.custom, message: '请提供需要更新的素材字段' });
      }).parse(req.body);
    res.json({ code: 200, success: true, data: await updateImageStudioAsset(projectId.parse(req.params.projectId), req.params.assetId, req.user!, input) });
  } catch (error) { next(error); }
});

const creativeDimensionKey = z.enum(['selling', 'pain', 'main_direction', 'target_audience', 'usage_scenario', 'visual_style']);

imageStudioRouter.get('/projects/:projectId/chat-intakes', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioChatIntakes(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/collaboration-conversations', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioCollaborationConversations(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/plans', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioPlans(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/plans/from-collaboration', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = z.object({ idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64),
      conversationId: z.string().trim().min(1).max(64), conversationType: z.enum(['order', 'invite']).default('order') }).strict().parse(req.body);
    const accepted = await createImageStudioCollaborationChatIntakeJob(projectId.parse(req.params.projectId), req.user!, {
      ...input, operation: 'plan_agent', idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
    });
    res.status(accepted.duplicate ? 200 : 202).json({ code: 200, success: true, data: accepted });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/plans/from-screenshots', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = z.object({ idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64), assetIds: z.array(z.string().min(1).max(64)).min(1).max(12) }).strict().parse(req.body);
    const accepted = await createImageStudioScreenshotPlanJob(projectId.parse(req.params.projectId), req.user!, {
      ...input, idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
    });
    res.status(accepted.duplicate ? 200 : 202).json({ code: 200, success: true, data: accepted });
  } catch (error) { next(error); }
});

imageStudioRouter.put('/projects/:projectId/plans/:runId/review', async (req, res, next) => {
  try {
    const input = z.object({ versionId: z.string().min(1).max(64), version: z.number().int().min(1), plan: z.record(z.unknown()), approve: z.boolean() }).strict().parse(req.body);
    const data = await reviewImageStudioPlan(projectId.parse(req.params.projectId), projectId.parse(req.params.runId), req.user!, input);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/plans/:runId/export', async (req, res, next) => {
  try {
    const { format } = z.object({ format: z.enum(['json', 'md']) }).strict().parse(req.body);
    res.json({ code: 200, success: true, data: await exportImageStudioPlan(projectId.parse(req.params.projectId), projectId.parse(req.params.runId), req.user!, format) });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/chat-intakes/from-collaboration', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = z.object({ idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64),
      conversationId: z.string().trim().min(1).max(64), conversationType: z.enum(['order', 'invite']).default('order') }).strict().parse(req.body);
    const accepted = await createImageStudioCollaborationChatIntakeJob(projectId.parse(req.params.projectId), req.user!, {
      ...input, idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
    });
    res.status(accepted.duplicate ? 200 : 202).json({ code: 200, success: true, data: accepted });
  } catch (error) { next(error); }
});

imageStudioRouter.put('/projects/:projectId/chat-intakes/:intakeId/review', async (req, res, next) => {
  try {
    const input = z.object({ version: z.number().int().min(1), brief: z.record(z.unknown()) }).strict().parse(req.body);
    const data = await reviewImageStudioChatIntake(projectId.parse(req.params.projectId), projectId.parse(req.params.intakeId), req.user!, input);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/creative-directions', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await getImageStudioCreativeDirections(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.put('/projects/:projectId/creative-directions/:dimension', async (req, res, next) => {
  try {
    const input = z.object({ selectedValues: z.array(z.string().trim().min(1).max(500)).max(50),
      customValues: z.array(z.string().trim().min(1).max(500)).max(50), version: z.number().int().min(1) }).strict().parse(req.body);
    const data = await updateImageStudioCreativeDirection(projectId.parse(req.params.projectId), req.user!, creativeDimensionKey.parse(req.params.dimension), input);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/creative-directions/:dimension/candidates', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = z.object({ idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64),
      referenceAssetIds: z.array(z.string().min(1).max(64)).max(12).default([]) }).strict().parse(req.body);
    const accepted = await createCreativeCandidateJob(projectId.parse(req.params.projectId), req.user!, creativeDimensionKey.parse(req.params.dimension), {
      ...input, idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
    });
    res.status(accepted.duplicate ? 200 : 202).json({ code: 200, success: true, data: accepted });
  } catch (error) { next(error); }
});

imageStudioRouter.patch('/projects/:projectId/creative-candidates/:candidateId', async (req, res, next) => {
  try {
    const input = z.object({ status: z.enum(['accepted', 'rejected']) }).strict().parse(req.body);
    const data = await setImageStudioCreativeCandidate(projectId.parse(req.params.projectId), req.params.candidateId, req.user!, input.status);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/assets/:assetId/preview', async (req, res, next) => {
  try {
    if (!dbPool || !isOssConfigured) return res.status(503).json({ code: 503, success: false, message: '图片存储服务不可用' });
    const [rows]: any = await dbPool.query("SELECT object_key FROM image_studio_assets WHERE id=? AND owner_id=? AND mime_type LIKE 'image/%' AND deleted_at IS NULL LIMIT 1", [req.params.assetId, req.user!.id]);
    if (!rows[0]) return res.status(404).json({ code: 404, success: false, message: '图片不存在或无权访问' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.redirect(302, getSignedOssUrl(String(rows[0].object_key), 180));
  } catch (error) { next(error); }
});

imageStudioRouter.get('/assets/:assetId/download', async (req, res, next) => {
  try {
    if (!dbPool || !isOssConfigured) return res.status(503).json({ code: 503, success: false, message: '图片存储服务不可用' });
    const [rows]: any = await dbPool.query('SELECT object_key,filename,mime_type FROM image_studio_assets WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1', [req.params.assetId, req.user!.id]);
    if (!rows[0]) return res.status(404).json({ code: 404, success: false, message: '图片不存在或无权访问' });
    const object = await getObjectFromOss(String(rows[0].object_key));
    const filename = String(rows[0].filename || 'image').replace(/[\r\n"\\]/g, '_');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', String(rows[0].mime_type || 'application/octet-stream'));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(object.content);
  } catch (error) { next(error); }
});

// Same-origin image bytes for canvas processing, without exposing private OSS URLs to a canvas.
imageStudioRouter.get('/workspace-images/:assetId/content', async (req, res, next) => {
  try {
    if (!dbPool || !isOssConfigured) return res.status(503).json({ success: false, message: '图片存储服务不可用' });
    const id = z.string().regex(/^asset_[a-f0-9]{32}$/i).parse(req.params.assetId);
    const [rows]: any = await dbPool.query(`SELECT kind,mimetype,size,oss_original_key FROM media_assets
      WHERE id=? AND owner_id=? LIMIT 1`, [id, req.user!.id]);
    const asset = rows[0];
    if (!asset || asset.kind !== 'image' || !String(asset.oss_original_key || '').startsWith('private/canvas-workspace/'))
      return res.status(404).json({ success: false, message: '画布图片不存在或无权访问' });
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(String(asset.mimetype)) || Number(asset.size) > 25 * 1024 * 1024)
      return res.status(400).json({ success: false, message: '请选择 25 MB 以内的 PNG、JPEG、WebP 或 GIF 图片' });
    const object = await getObjectFromOss(String(asset.oss_original_key));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', String(asset.mimetype));
    return res.send(object.content);
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/jobs', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    if (!isOssConfigured) throw Object.assign(new Error('生图工作台要求配置私有 OSS 存储'), { status: 503, code: 'IMAGE_STUDIO_OSS_UNAVAILABLE' });
    const input = z.object({
      idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64), skillIds: z.array(z.string().min(1).max(64)).max(5).default([]),
      context: z.record(z.unknown()).default({}),
      generations: z.array(z.object({ slotKey: z.string().trim().min(1).max(128), shotId: z.string().max(64).optional(),
        prompt: z.string().trim().min(1).max(24_000), referenceAssetIds: z.array(z.string().min(1).max(64)).max(12).default([]),
        parameters: z.record(z.unknown()).default({}) }).strict()).min(1).max(20)
    }).strict().parse(req.body);
    const accepted = await createImageStudioGenerationJob(projectId.parse(req.params.projectId), req.user!, {
      ...input, idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
    });
    res.status(accepted.duplicate ? 200 : 202).json({ code: 200, success: true, data: accepted });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/ai-tasks', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = z.object({ idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64),
      operation: z.enum(['asset_annotate', 'product_analyze', 'chat_intake_extract', 'storyboard', 'copy_generate', 'prompt_generate', 'svg_generate', 'design_review']),
      context: z.record(z.unknown()).default({}), referenceAssetIds: z.array(z.string().min(1).max(64)).max(12).default([]) }).strict().parse(req.body);
    const requestedSkillIds = z.array(z.string().min(1).max(64)).max(5).safeParse(input.context.skillIds).data || [];
    const uniqueSkillIds = [...new Set(requestedSkillIds)];
    const enabledSkills = uniqueSkillIds.length ? await listDesignSkills(false) : [];
    const skillById = new Map(enabledSkills.map((skill) => [skill.id, skill]));
    if (uniqueSkillIds.some((id) => !skillById.has(id))) return res.status(409).json({ code: 409, success: false, message: '任务关联的设计 Skill 已失效，请刷新方案后重试' });
    const skillSnapshot = uniqueSkillIds.map((id) => {
      const skill = skillById.get(id)!;
      return { id: skill.id, name: skill.name, category: skill.category, version: skill.version,
        instructions: skill.instructions.slice(0, 4000), completionCriteria: skill.completionCriteria.slice(0, 1200) };
    });
    const accepted = await createImageStudioTextJob(projectId.parse(req.params.projectId), req.user!, {
      ...input, context: { ...input.context, skillIds: uniqueSkillIds, skillSnapshot },
      idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
    });
    res.status(accepted.duplicate ? 200 : 202).json({ code: 200, success: true, data: accepted });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/generation-reviews', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioGenerationReviews(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.patch('/projects/:projectId/generations/:generationId/review', async (req, res, next) => {
  try {
    const input = z.object({ selected: z.boolean(), locked: z.boolean(), version: z.number().int().min(0) }).strict().parse(req.body);
    const data = await updateImageStudioGenerationReview(projectId.parse(req.params.projectId), req.params.generationId, req.user!, input);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/exports', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioExports(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/exports', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    if (!isOssConfigured) throw Object.assign(new Error('导出功能要求配置私有 OSS 存储'), { status: 503, code: 'IMAGE_STUDIO_OSS_UNAVAILABLE' });
    const idempotencyKey = z.string().min(16).max(128).parse(String(req.header('Idempotency-Key') || randomUUID()));
    const data = await createImageStudioExport(projectId.parse(req.params.projectId), req.user!, idempotencyKey);
    res.status(202).json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/layered-exports', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    const input = layeredPsdSchema.parse(req.body);
    const key = z.string().min(16).max(128).parse(req.header('Idempotency-Key'));
    const data = await createImageStudioExport(projectId.parse(req.params.projectId), req.user!, key, input);
    return res.status(data.duplicate ? 200 : 202).json({ success: true, data });
  } catch (e) { next(e); }
});

imageStudioRouter.get('/exports/:exportId/download', async (req, res, next) => {
  try {
    if (!dbPool || !isOssConfigured) return res.status(503).json({ code: 503, success: false, message: '图片存储服务不可用' });
    const [rows]: any = await dbPool.query(`SELECT object_key,status FROM image_studio_exports WHERE id=? AND owner_id=? LIMIT 1`, [req.params.exportId, req.user!.id]);
    if (!rows[0]) return res.status(404).json({ code: 404, success: false, message: '导出文件不存在或无权访问' });
    if (String(rows[0].status) !== 'completed' || !rows[0].object_key) return res.status(409).json({ code: 409, success: false, message: '导出文件仍在后台处理中' });
    const object = await getObjectFromOss(String(rows[0].object_key));
    res.setHeader('Cache-Control', 'private, no-store');
    const psd = String(rows[0].object_key).endsWith('.psd');
    res.setHeader('Content-Type', psd ? 'image/vnd.adobe.photoshop' : 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="image-studio-${req.params.exportId}.${psd ? 'psd' : 'zip'}"`);
    return res.send(object.content);
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/jobs', async (req, res, next) => {
  try {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.string().optional() }).parse(req.query);
    res.json({ code: 200, success: true, data: await listImageStudioJobs(projectId.parse(req.params.projectId), req.user!, query.limit, query.before) });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/jobs/:jobId', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await getImageStudioJob(req.params.jobId, req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/jobs/:jobId/retry', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    res.status(202).json({ code: 200, success: true, data: await retryImageStudioJob(req.params.jobId, req.user!) });
  } catch (error) { next(error); }
});

imageStudioRouter.post('/jobs/:jobId/cancel', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await cancelImageStudioJob(req.params.jobId, req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/events', async (req, res, next) => {
  try {
    const query = z.object({ after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(200) }).parse(req.query);
    res.json({ code: 200, success: true, data: await getImageStudioEvents(projectId.parse(req.params.projectId), req.user!, query.after, query.limit) });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/admin/model-profiles', requireRoles('admin'), async (_req, res, next) => {
  try {
    if (!dbPool) throw Object.assign(new Error('生图配置需要可用数据库'), { status: 503 });
    const [rows]: any = await dbPool.query(`SELECT id,name,capability,ai_config_id,protocol,model_override,options_json,enabled,created_at,updated_at
      FROM image_studio_model_profiles ORDER BY capability,name`);
    res.json({ code: 200, success: true, data: rows.map((row: any) => ({ id: row.id, name: row.name, capability: row.capability,
      aiConfigId: row.ai_config_id, protocol: row.protocol, model: row.model_override || null,
      options: typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json,
      enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at })) });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/admin/ai-configs', requireRoles('admin'), async (_req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listAiConfigs() }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/admin/model-profiles', requireRoles('admin'), async (req, res, next) => {
  try {
    const input = z.object({ id: z.string().min(1).max(64).optional(), name: z.string().trim().min(1).max(120),
      capability: z.enum(['text', 'vision', 'image']), aiConfigId: z.string().min(1).max(64),
      protocol: z.enum(['openai-chat', 'openai-images', 'native-async']), model: z.string().trim().max(160).nullable().optional(),
      options: z.record(z.unknown()).default({}), enabled: z.boolean().default(true) }).strict().parse(req.body);
    const configs = await listAiConfigs();
    if (!configs.some((config) => config.id === input.aiConfigId && config.enabled)) return res.status(400).json({ code: 400, success: false, message: '请选择已启用的 API 配置' });
    if (input.capability !== 'image' && input.protocol !== 'openai-chat') return res.status(400).json({ code: 400, success: false, message: '文本和视觉模型当前仅支持 OpenAI 兼容 Chat Completions 协议' });
    if (input.capability === 'image' && input.protocol === 'openai-chat') return res.status(400).json({ code: 400, success: false, message: '图像模型需要图像生成协议' });
    res.status(input.id ? 200 : 201).json({ code: 200, success: true, data: await saveImageStudioModelProfile(req.user!, input) });
  } catch (error) { next(error); }
});
