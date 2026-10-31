import { Router } from 'express';
import { z } from 'zod';
import type { DesignSkillInput } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { createDesignSkill, getDesignSkill, listDesignSkills, setDesignSkillEnabled, updateDesignSkill } from '../services/design-skills.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const designSkillsRouter = Router();
designSkillsRouter.use(authenticate, requireRoles('admin', 'customer_service'));

const categories = ['brand_identity', 'ecommerce', 'social_media', 'packaging', 'design_review', 'other'] as const;
const kinds = ['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date', 'image', 'file'] as const;
const questionSchema = z.object({
  id: z.string().trim().min(1).max(64), key: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, '字段 Key 需以小写字母开头，仅使用小写字母、数字和下划线'),
  label: z.string().trim().min(1).max(100), prompt: z.string().trim().max(500).default(''), kind: z.enum(kinds), required: z.boolean().default(false),
  priority: z.number().int().min(1).max(100).default(50), placeholder: z.string().trim().max(200).optional(), options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
}).strict().superRefine((question, context) => {
  if (['select', 'radio', 'checkbox'].includes(question.kind) && question.options.length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: '单选或多选题至少配置两个选项' });
  }
});

const skillSchema = z.object({
  name: z.string().trim().min(1, '请输入 Skill 名称').max(100), category: z.enum(categories),
  description: z.string().trim().min(1, '请输入用途说明').max(500), instructions: z.string().trim().max(8000).default(''),
  completionCriteria: z.string().trim().max(2000).default(''), questions: z.array(questionSchema).min(1, '至少添加一个需求问题').max(40),
}).strict().superRefine((skill, context) => {
  const keys = new Set<string>();
  for (const question of skill.questions) {
    if (keys.has(question.key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['questions'], message: `字段 Key「${question.key}」重复` });
    keys.add(question.key);
  }
});

function invalid(res: any, message: string) { return res.status(400).json({ code: 400, success: false, message }); }
function actor(req: any) { return { id: req.user.id, name: req.user.name, role: req.user.role as 'admin' | 'customer_service' }; }
function canEdit(skill: { createdById: string }, req: any) { return req.user.role === 'admin' || skill.createdById === req.user.id; }
function audit(req: any, action: string, id: string, name: string, detail?: Record<string, unknown>) {
  void recordAdminAudit({ operatorId: req.user.id, operatorName: req.user.name, module: 'design_skills', action,
    targetType: 'design_skill', targetId: id, summary: `${req.user.name}${action === 'create' ? '新增' : action === 'update' ? '更新' : '调整状态'}设计 Skill「${name}」`, detail, ipAddress: req.ip }).catch(console.error);
}

designSkillsRouter.get('/', async (req, res, next) => {
  try {
    const skills = await listDesignSkills(req.user!.role === 'admin');
    res.json({ code: 200, success: true, data: skills.map((skill) => ({ ...skill, canEdit: canEdit(skill, req) })) });
  } catch (error) { next(error); }
});

designSkillsRouter.get('/:id', async (req, res, next) => {
  try {
    const skill = await getDesignSkill(req.params.id);
    if (!skill || (!skill.isEnabled && req.user!.role !== 'admin')) return res.status(404).json({ code: 404, success: false, message: 'Skill 不存在或已停用' });
    res.json({ code: 200, success: true, data: { ...skill, canEdit: canEdit(skill, req) } });
  } catch (error) { next(error); }
});

designSkillsRouter.post('/', async (req, res, next) => {
  const parsed = skillSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.issues[0]?.message || 'Skill 配置无效');
  try {
    const skill = await createDesignSkill(parsed.data as DesignSkillInput, actor(req));
    audit(req, 'create', skill.id, skill.name, { category: skill.category, questionCount: skill.questions.length });
    res.status(201).json({ code: 200, success: true, data: { ...skill, canEdit: true } });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY' || error?.code === 'DESIGN_SKILL_DUPLICATE') return res.status(409).json({ code: 409, success: false, message: '同一设计类型下已存在同名 Skill，请更换名称' });
    next(error);
  }
});

designSkillsRouter.put('/:id', async (req, res, next) => {
  const parsed = skillSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error.issues[0]?.message || 'Skill 配置无效');
  try {
    const current = await getDesignSkill(req.params.id);
    if (!current) return res.status(404).json({ code: 404, success: false, message: 'Skill 不存在' });
    if (!canEdit(current, req)) return res.status(403).json({ code: 403, success: false, message: '客服只能修改自己创建的 Skill' });
    const skill = await updateDesignSkill(req.params.id, parsed.data as DesignSkillInput, actor(req));
    if (!skill) return res.status(404).json({ code: 404, success: false, message: 'Skill 不存在' });
    audit(req, 'update', skill.id, skill.name, { version: skill.version, questionCount: skill.questions.length });
    res.json({ code: 200, success: true, data: { ...skill, canEdit: true } });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY' || error?.code === 'DESIGN_SKILL_DUPLICATE') return res.status(409).json({ code: 409, success: false, message: '同一设计类型下已存在同名 Skill，请更换名称' });
    next(error);
  }
});

designSkillsRouter.put('/:id/enabled', requireRoles('admin'), async (req, res, next) => {
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return invalid(res, '启用状态无效');
  try {
    const skill = await getDesignSkill(String(req.params.id));
    if (!skill) return res.status(404).json({ code: 404, success: false, message: 'Skill 不存在' });
    if (!await setDesignSkillEnabled(skill.id, parsed.data.enabled)) return res.status(404).json({ code: 404, success: false, message: 'Skill 不存在' });
    audit(req, 'toggle', skill.id, skill.name, { enabled: parsed.data.enabled });
    const skills = await listDesignSkills(true);
    res.json({ code: 200, success: true, data: skills.map((item) => ({ ...item, canEdit: canEdit(item, req) })) });
  } catch (error) { next(error); }
});
