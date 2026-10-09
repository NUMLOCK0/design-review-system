import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  collaborationCommand, createCollaborationForm, createRequirementCandidate, decideRequirement,
  createPresetCollaborationForm, createComposedCollaborationForm,
  getCollaborationWorkspace, listCollaborationOrders, returnCollaborationForm,
  startRequirementExecution, updateCollaborationForm,
  getDesignWorkflow, saveDesignWorkflow,
  getCollaborationFile,
} from '../services/collaboration.js';
import { getObjectFromOss } from '../config/oss-client.js';

export const collaborationRouter = Router();
collaborationRouter.use(authenticate);
const uuid = z.string().uuid();
const answers = z.record(z.unknown()).refine(value => JSON.stringify(value).length <= 100_000, '表单内容过大');
const draft = z.object({ lockVersion: z.number().int().nonnegative(), answers }).strict();
const handler = (run: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await run(req, res); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, code: 400, message: error.issues[0]?.message || '请求格式无效' });
    next(error);
  }
};
const ok = (res: Response, data: unknown) => res.json({ code: 200, success: true, data });
function commandKey(req: Request) { return uuid.parse(req.header('Idempotency-Key')); }

collaborationRouter.get('/orders', handler(async (req, res) => {
  const offset = z.coerce.number().int().nonnegative().max(100000).parse(req.query.offset || 0);
  ok(res, await listCollaborationOrders(req.user!, offset));
}));
collaborationRouter.get('/orders/:orderId', handler(async (req, res) => {
  ok(res, await getCollaborationWorkspace(String(req.params.orderId), req.user!));
}));
collaborationRouter.get('/orders/:orderId/files/:assetId', handler(async (req, res) => {
  const assetId = z.string().regex(/^asset_[a-zA-Z0-9_-]+$/).max(80).parse(req.params.assetId);
  const asset = await getCollaborationFile(String(req.params.orderId), assetId, req.user!);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', asset.mimetype);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(asset.filename)}"`);
  if (asset.localOriginalPath) return res.sendFile(asset.localOriginalPath);
  if (asset.ossOriginalKey) return res.send((await getObjectFromOss(asset.ossOriginalKey)).content);
  res.status(404).json({ success: false, code: 404, message: '资料存储记录不完整' });
}));
collaborationRouter.post('/orders/:orderId/forms', handler(async (req, res) => {
  const body = z.object({ templateId: z.string().min(1).max(80), templateVersion: z.number().int().positive() }).strict().parse(req.body);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'create-form', ...body },
    (connection, order) => createCollaborationForm(connection, order, req.user!, body.templateId, body.templateVersion)));
}));
collaborationRouter.post('/orders/:orderId/forms/preset', handler(async (req, res) => {
  const body = z.object({ presetId: z.string().regex(/^tpl_(?:[1-9]|1[0-3])$/) }).strict().parse(req.body);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'create-preset-form', ...body },
    (connection, order) => createPresetCollaborationForm(connection, order, req.user!, body.presetId)));
}));
collaborationRouter.post('/orders/:orderId/forms/composed', handler(async (req, res) => {
  const body = z.object({ selections: z.array(z.object({ presetId: z.string().regex(/^tpl_(?:[1-9]|1[0-3])$/), fieldKeys: z.array(z.string().min(1).max(80)).min(1).max(30) }).strict()).min(1).max(13) }).strict().parse(req.body);
  if (new Set(body.selections.map(item => item.presetId)).size !== body.selections.length) return res.status(400).json({ success: false, code: 400, message: '业务类别不可重复' });
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'create-composed-form', ...body },
    (connection, order) => createComposedCollaborationForm(connection, order, req.user!, body.selections)));
}));
// WeChat's native request API does not support PATCH; keep POST /draft alongside the Web endpoint.
for (const route of [{ method: 'patch' as const, suffix: '', submit: false }, { method: 'post' as const, suffix: '/draft', submit: false }, { method: 'post' as const, suffix: '/submit', submit: true }]) {
  const { submit } = route;
  collaborationRouter[route.method](`/orders/:orderId/forms/:formId${route.suffix}`, handler(async (req, res) => {
    const body = draft.parse(req.body);
    const formId = uuid.parse(req.params.formId);
    ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: submit ? 'submit-form' : 'save-form', formId, ...body },
      (connection, order) => updateCollaborationForm(connection, order, req.user!, formId, body.lockVersion, body.answers, submit)));
  }));
}
collaborationRouter.post('/orders/:orderId/forms/:formId/return', handler(async (req, res) => {
  const body = z.object({ lockVersion: z.number().int().nonnegative(), comment: z.string().trim().min(1).max(1000) }).strict().parse(req.body);
  const formId = uuid.parse(req.params.formId);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'return-form', formId, ...body },
    (connection, order) => returnCollaborationForm(connection, order, req.user!, formId, body.lockVersion, body.comment)));
}));
collaborationRouter.post('/orders/:orderId/candidates', handler(async (req, res) => {
  const body = z.object({ formIds: z.array(uuid).min(1).max(20), policy: z.enum(['brand', 'both']), baseVersion: z.number().int().nonnegative() }).strict().parse(req.body);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'create-candidate', ...body },
    (connection, order) => createRequirementCandidate(connection, order, req.user!, body.formIds, body.policy, body.baseVersion)));
}));
collaborationRouter.post('/orders/:orderId/candidates/:candidateId/decisions', handler(async (req, res) => {
  const body = z.object({ contentHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['confirmed', 'rejected']), comment: z.string().trim().max(1000).default('') })
    .refine(value => value.decision !== 'rejected' || Boolean(value.comment), '请填写退回原因').parse(req.body);
  const candidateId = uuid.parse(req.params.candidateId);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'decide', candidateId, ...body },
    (connection, order) => decideRequirement(connection, order, req.user!, candidateId, body.contentHash, body.decision, body.comment)));
}));
collaborationRouter.post('/orders/:orderId/requirements/:requirementId/execute', handler(async (req, res) => {
  const requirementId = uuid.parse(req.params.requirementId);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'execute', requirementId },
    (connection, order) => startRequirementExecution(connection, order, req.user!, requirementId)));
}));
collaborationRouter.get('/orders/:orderId/requirements/:requirementId/ai-input', handler(async (req, res) => {
  const workspace = await getCollaborationWorkspace(String(req.params.orderId), req.user!);
  const requirement = workspace.requirements.find(item => item.id === req.params.requirementId);
  if (!requirement) return res.status(404).json({ code: 404, success: false, message: '正式需求版本不存在' });
  ok(res, { schemaVersion: 1, requirementVersionId: requirement.id, contentHash: requirement.contentHash,
    requirement: requirement.content, executionAuthorized: false,
    message: '这是已确认需求的结构化交接数据；尚未授权或调用生图服务。' });
}));

const workflowPlan = z.object({
  schemaVersion: z.literal(1), requirementVersionId: uuid,
  nodes: z.array(z.object({
    id: z.string().min(1).max(80), kind: z.enum(['brief', 'reference', 'generate', 'compose', 'review', 'delivery']), title: z.string().trim().min(1).max(120),
    position: z.object({ x: z.number().finite().min(-1000000).max(1000000), y: z.number().finite().min(-1000000).max(1000000) }).strict(),
    config: z.record(z.unknown()), inputBindings: z.array(z.object({ input: z.string().min(1).max(100), requirementPath: z.string().max(300).optional(), sourceNodeId: z.string().max(80).optional(), output: z.string().max(100).optional() }).strict()).max(50),
  }).strict()).min(1).max(100),
  edges: z.array(z.object({ id: z.string().min(1).max(80), source: z.string().min(1).max(80), target: z.string().min(1).max(80), sourcePort: z.string().max(100).optional(), targetPort: z.string().max(100).optional() }).strict()).max(500),
}).strict().refine(value => JSON.stringify(value).length <= 200000, '工作流配置过大');
collaborationRouter.get('/orders/:orderId/requirements/:requirementId/workflow', handler(async (req, res) => {
  ok(res, await getDesignWorkflow(String(req.params.orderId), uuid.parse(req.params.requirementId), req.user!));
}));
collaborationRouter.post('/orders/:orderId/requirements/:requirementId/workflow', handler(async (req, res) => {
  const requirementId = uuid.parse(req.params.requirementId);
  const body = z.object({ revision: z.number().int().nonnegative(), plan: workflowPlan }).strict().parse(req.body);
  ok(res, await collaborationCommand(String(req.params.orderId), req.user!, commandKey(req), { action: 'save-workflow', requirementId, ...body },
    (connection, order) => saveDesignWorkflow(connection, order, req.user!, requirementId, body.revision, body.plan)));
}));
