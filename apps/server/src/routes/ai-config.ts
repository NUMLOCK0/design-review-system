import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { deleteAiConfig, listAiConfigs, saveAiConfig, setAiConfigEnabled } from '../services/ai-config.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const aiConfigRouter = Router();
aiConfigRouter.use(authenticate, requireRoles('admin'));

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().min(1).max(2048).transform((value) => value.replace(/\/+$/, '')).refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
        && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }, '请输入 HTTPS 中转站地址；本机开发可使用 HTTP localhost'),
  model: z.string().trim().min(1).max(128),
  apiKey: z.string().trim().max(4096).optional(),
}).strict();

function invalid(res: any, message: string) {
  return res.status(400).json({ code: 400, success: false, message });
}

aiConfigRouter.get('/', async (_req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listAiConfigs() }); }
  catch (error) { next(error); }
});

aiConfigRouter.post('/', async (req, res, next) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.issues[0]?.message || '配置格式无效');
  if (!parsed.data.apiKey) return invalid(res, '新增配置时必须填写 API Key');
  try {
    const config = await saveAiConfig(parsed.data);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'ai_config', action: 'create', targetType: 'ai_model_config', targetId: config!.id, summary: `${req.user!.name}新增 AI 模型配置`, detail: { name: config!.name, model: config!.model }, ipAddress: req.ip }).catch(console.error);
    res.status(201).json({ code: 200, success: true, data: config });
  } catch (error) { next(error); }
});

aiConfigRouter.put('/:id', async (req, res, next) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.issues[0]?.message || '配置格式无效');
  try {
    const config = await saveAiConfig(parsed.data, req.params.id);
    if (!config) return res.status(404).json({ code: 404, success: false, message: '配置不存在' });
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'ai_config', action: 'update', targetType: 'ai_model_config', targetId: config.id, summary: `${req.user!.name}更新 AI 模型配置`, detail: { name: config.name, model: config.model, keyChanged: Boolean(parsed.data.apiKey) }, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: config });
  } catch (error) { next(error); }
});

aiConfigRouter.put('/:id/enabled', async (req, res, next) => {
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return invalid(res, '启用状态无效');
  try {
    if (!await setAiConfigEnabled(req.params.id, parsed.data.enabled)) return res.status(404).json({ code: 404, success: false, message: '配置不存在' });
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'ai_config', action: parsed.data.enabled ? 'enable' : 'disable', targetType: 'ai_model_config', targetId: req.params.id, summary: `${req.user!.name}${parsed.data.enabled ? '启用' : '禁用'} AI 模型配置`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: await listAiConfigs() });
  } catch (error) { next(error); }
});

aiConfigRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteAiConfig(req.params.id);
    if (result === 'in_use') return res.status(409).json({ code: 409, success: false, message: '此配置仍被模型档案引用，请先修改或删除相关模型档案' });
    if (result === 'missing') return res.status(404).json({ code: 404, success: false, message: '配置不存在' });
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'ai_config', action: 'delete', targetType: 'ai_model_config', targetId: req.params.id, summary: `${req.user!.name}删除 AI 模型配置`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: await listAiConfigs() });
  } catch (error) { next(error); }
});
