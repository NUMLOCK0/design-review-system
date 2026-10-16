import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbPool } from '../config/database.js';
import { getObjectFromOss, getSignedOssUrl, isOssConfigured } from '../config/oss-client.js';
import { authenticate, JWT_SECRET, requireRoles } from '../middleware/auth.middleware.js';
import { listAiConfigs } from '../services/ai-config.js';
import {
  attachImageStudioAsset, createCreativeCandidateJob, createImageStudioGenerationJob, createImageStudioProject, createImageStudioTextJob, deleteImageStudioProject,
  cancelImageStudioJob, getImageStudioEvents, getImageStudioJob, getImageStudioProject, listImageStudioAssets,
  listImageStudioJobs, listImageStudioModelProfiles, listImageStudioProjects, saveImageStudioModelProfile, updateImageStudioAsset,
  retryImageStudioJob, setImageStudioCreativeCandidate, updateImageStudioCreativeDirection, getImageStudioCreativeDirections, updateImageStudioProject,
  listImageStudioGenerationReviews, updateImageStudioGenerationReview,
  createImageStudioExport, listImageStudioExports, listImageStudioChatIntakes, reviewImageStudioChatIntake,
  createImageStudioCollaborationChatIntakeJob, listImageStudioCollaborationConversations,
  listImageStudioPlans, reviewImageStudioPlan, exportImageStudioPlan,
  createImageStudioScreenshotPlanJob,
} from '../services/image-studio.js';
import { imageStudioWorkerHealth } from '../services/image-studio-worker.js';
import { assertImageStudioInfrastructure } from '../services/image-studio-queue.js';

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
const projectSchema = z.object({ name: z.string().trim().min(1).max(160), platform: z.string().trim().max(48).nullable().optional(),
  workflow: z.record(z.unknown()).optional() }).strict();
const patchProjectSchema = z.object({ name: z.string().trim().min(1).max(160).optional(), platform: z.string().trim().max(48).nullable().optional(),
  workflow: z.unknown().optional(), version: z.number().int().min(1) }).strict();

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

imageStudioRouter.put('/projects/:projectId', async (req, res, next) => {
  try { const input = patchProjectSchema.parse(req.body); res.json({ code: 200, success: true, data: await updateImageStudioProject(projectId.parse(req.params.projectId), req.user!, input) }); }
  catch (error) { next(error); }
});

imageStudioRouter.delete('/projects/:projectId', async (req, res, next) => {
  try { await deleteImageStudioProject(projectId.parse(req.params.projectId), req.user!); res.json({ code: 200, success: true, data: { deleted: true } }); }
  catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/assets', async (req, res, next) => {
  try {
    const input = z.object({ mediaAssetId: z.string().regex(/^asset_[a-f0-9]{32}$/i), role: z.enum(['product', 'competitor', 'packaging', 'other', 'chat_screenshot']) }).strict().parse(req.body);
    const data = await attachImageStudioAsset(projectId.parse(req.params.projectId), req.user!, input.mediaAssetId, input.role);
    res.status(201).json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

imageStudioRouter.get('/projects/:projectId/assets', async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listImageStudioAssets(projectId.parse(req.params.projectId), req.user!) }); }
  catch (error) { next(error); }
});

imageStudioRouter.patch('/projects/:projectId/assets/:assetId', async (req, res, next) => {
  try {
    const input = z.object({ role: z.enum(['product', 'competitor', 'packaging', 'other', 'chat_screenshot']).optional(),
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
    const [rows]: any = await dbPool.query('SELECT object_key FROM image_studio_assets WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1', [req.params.assetId, req.user!.id]);
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
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(object.content);
  } catch (error) { next(error); }
});

imageStudioRouter.post('/projects/:projectId/jobs', async (req, res, next) => {
  try {
    assertImageStudioInfrastructure();
    if (!isOssConfigured) throw Object.assign(new Error('生图工作台要求配置私有 OSS 存储'), { status: 503, code: 'IMAGE_STUDIO_OSS_UNAVAILABLE' });
    const input = z.object({
      idempotencyKey: z.string().min(16).max(128).optional(), modelProfileId: z.string().min(1).max(64),
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
      operation: z.enum(['asset_annotate', 'product_analyze', 'chat_intake_extract', 'storyboard', 'copy_generate', 'prompt_generate']),
      context: z.record(z.unknown()).default({}), referenceAssetIds: z.array(z.string().min(1).max(64)).max(12).default([]) }).strict().parse(req.body);
    const accepted = await createImageStudioTextJob(projectId.parse(req.params.projectId), req.user!, {
      ...input, idempotencyKey: input.idempotencyKey || String(req.header('Idempotency-Key') || randomUUID()),
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

imageStudioRouter.get('/exports/:exportId/download', async (req, res, next) => {
  try {
    if (!dbPool || !isOssConfigured) return res.status(503).json({ code: 503, success: false, message: '图片存储服务不可用' });
    const [rows]: any = await dbPool.query(`SELECT object_key,status FROM image_studio_exports WHERE id=? AND owner_id=? LIMIT 1`, [req.params.exportId, req.user!.id]);
    if (!rows[0]) return res.status(404).json({ code: 404, success: false, message: '导出文件不存在或无权访问' });
    if (String(rows[0].status) !== 'completed' || !rows[0].object_key) return res.status(409).json({ code: 409, success: false, message: '导出文件仍在后台处理中' });
    const object = await getObjectFromOss(String(rows[0].object_key));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="image-studio-${req.params.exportId}.zip"`);
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
