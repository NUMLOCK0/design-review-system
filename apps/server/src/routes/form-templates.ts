import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import { buildFormSchema, createOrderPresetDraft, ORDER_FORM_PRESETS, type FormField, type FormTemplate } from '@design-review/shared';
import { dbPool } from '../config/database.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const formTemplatesRouter = Router();
const memory = new Map<string, FormTemplate>();
const publishedMemory = new Map<string, Map<number, FormTemplate>>();
type FormCategory = { id: string; name: string; description: string; sortOrder: number; isActive: boolean; updatedAt: string };
const categoryMemory = new Map<string, FormCategory>([...new Set(ORDER_FORM_PRESETS.map((item) => item.category))].map((name, index) => [`cat_${index + 1}`, { id: `cat_${index + 1}`, name, description: '', sortOrder: index, isActive: true, updatedAt: new Date().toISOString() }]));
const kinds = ['text', 'textarea', 'email', 'phone', 'url', 'number', 'select', 'radio', 'checkbox', 'switch', 'date', 'time', 'datetime', 'image', 'file', 'section', 'divider', 'paragraph', 'repeat'] as const;
const optionSchema = z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(100) });
const conditionSchema = z.object({ fieldKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/), operator: z.enum(['equals', 'notEquals', 'notEmpty']), value: z.string().max(500).optional() });
const fieldSchema: z.ZodType<FormField> = z.lazy(() => z.object({
  id: z.string().min(1).max(80), key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(80), kind: z.enum(kinds),
  label: z.string().trim().min(1).max(120), width: z.number().int().min(10).max(100),
  required: z.boolean().optional(), placeholder: z.string().max(300).optional(), help: z.string().max(1000).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  presets: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  options: z.array(optionSchema).max(100).optional(), min: z.number().finite().optional(), max: z.number().finite().optional(),
  minLength: z.number().int().min(0).max(100000).optional(), maxLength: z.number().int().min(0).max(100000).optional(),
  pattern: z.string().max(300).optional(), condition: conditionSchema.optional(), children: z.array(fieldSchema).max(50).optional(),
  minItems: z.number().int().min(0).max(100).optional(), maxItems: z.number().int().min(1).max(100).optional(),
  maxFiles: z.number().int().min(1).max(1000).nullable().optional(),
}));
const templateInput = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(1000).default(''), target: z.enum(['order', 'general']), category: z.string().trim().max(80).optional(), tag: z.string().trim().max(80).optional(), presetId: z.string().trim().max(80).optional(), mobileStyle: z.enum(['comfortable', 'compact', 'large']).default('comfortable'), fields: z.array(fieldSchema).max(100) });

function validateDefinition(input: unknown) {
  const parsed = templateInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || '表单配置无效' } as const;
  const fields = parsed.data.fields;
  const keys = new Set<string>();
  const ids = new Set<string>();
  const check = (items: FormField[], depth: number): string | null => {
    if (depth > 2) return '可增删子表单最多嵌套两层';
    const local = new Set<string>();
    for (const field of items) {
      if (ids.has(field.id)) return `字段 ID 重复：${field.id}`;
      ids.add(field.id);
      if (local.has(field.key)) return `字段标识重复：${field.key}`;
      local.add(field.key);
      if (depth === 0) keys.add(field.key);
      if (field.kind === 'repeat' && (!field.children?.length || (field.maxItems ?? 10) < (field.minItems ?? 0))) return '可增删子表单需要子字段，且最大条数不能小于最小条数';
      if (field.kind !== 'repeat' && field.children?.length) return '只有可增删子表单可以包含子字段';
      if (field.maxFiles !== undefined && !['image', 'file'].includes(field.kind)) return `${field.label}：只有上传字段可以配置文件个数`;
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) return `${field.label}：最小值不能大于最大值`;
      if (field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) return `${field.label}：最短长度不能大于最长长度`;
      if (field.pattern) { try { new RegExp(field.pattern); } catch { return `${field.label}：正则表达式无效`; } }
      if (field.presets?.length && !['text', 'textarea', 'select'].includes(field.kind)) return `${field.label}：该字段类型不支持快捷选项`;
      if (['select', 'radio', 'checkbox'].includes(field.kind)) {
        if (!field.options?.length) return `${field.label}：至少需要一个选项`;
        if (new Set(field.options.map((item) => item.value)).size !== field.options.length) return `${field.label}：选项值不能重复`;
      }
      if (field.defaultValue !== undefined) {
        if (field.kind === 'number' && typeof field.defaultValue !== 'number') return `${field.label}：默认值必须是数字`;
        if (field.kind === 'switch' && typeof field.defaultValue !== 'boolean') return `${field.label}：默认值必须是布尔值`;
        if (field.kind === 'checkbox' && (!Array.isArray(field.defaultValue) || field.defaultValue.some((value) => !field.options?.some((option) => option.value === value)))) return `${field.label}：默认选项无效`;
        if (['select', 'radio'].includes(field.kind) && !field.options?.some((option) => option.value === field.defaultValue)) return `${field.label}：默认选项无效`;
        if (!['number', 'switch', 'checkbox', 'select', 'radio'].includes(field.kind) && typeof field.defaultValue !== 'string') return `${field.label}：默认值必须是文本`;
      }
      if (field.children?.length) { const error = check(field.children, depth + 1); if (error) return error; }
    }
    return null;
  };
  const error = check(fields, 0);
  if (error) return { error } as const;
  for (const field of fields) if (field.condition && (!keys.has(field.condition.fieldKey) || field.condition.fieldKey === field.key)) return { error: `${field.label}：显示条件需要引用其他有效字段` } as const;
  try {
    const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
    ajv.compile(buildFormSchema(fields).schema);
  } catch (cause) { return { error: cause instanceof Error ? cause.message : 'JSON Schema 无效' } as const; }
  return { data: parsed.data } as const;
}

function parseJson(value: unknown): FormTemplate | null {
  try { return (typeof value === 'string' ? JSON.parse(value) : value) as FormTemplate; } catch { return null; }
}

export async function initializeFormTemplates() {
  const seedTemplate = (preset: typeof ORDER_FORM_PRESETS[number], now: string): FormTemplate => ({
    ...createOrderPresetDraft(preset), id: `preset_${preset.id}`, version: 1, publishedVersion: 1,
    status: 'published', createdAt: now, updatedAt: now,
  });
  if (!dbPool) {
    for (const preset of ORDER_FORM_PRESETS) {
      const id = `preset_${preset.id}`;
      if (memory.has(id)) continue;
      const template = seedTemplate(preset, new Date().toISOString());
      memory.set(id, template); publishedMemory.set(id, new Map([[1, template]]));
    }
    return;
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS form_templates (
    id VARCHAR(80) PRIMARY KEY, name VARCHAR(120) NOT NULL, target VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', draft_json JSON NOT NULL,
    published_json JSON NULL, published_version INT NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
    INDEX idx_form_target_status (target, status)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS form_template_versions (
    template_id VARCHAR(80) NOT NULL, version INT NOT NULL, payload_json JSON NOT NULL,
    published_at VARCHAR(40) NOT NULL, PRIMARY KEY (template_id, version)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS form_categories (
    id VARCHAR(80) PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, description VARCHAR(500) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
    INDEX idx_form_categories_active_sort (is_active, sort_order)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [existingCategories]: any = await dbPool.query('SELECT name FROM form_categories');
  const knownCategories = new Set(existingCategories.map((row: any) => String(row.name)));
  const seedNames = [...new Set(ORDER_FORM_PRESETS.map((item) => item.category))];
  for (const [index, name] of seedNames.entries()) {
    if (!knownCategories.has(name)) {
      const now = new Date().toISOString();
      await dbPool.query('INSERT IGNORE INTO form_categories (id,name,description,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [`cat_${index + 1}`, name, '', index, 1, now, now]);
      knownCategories.add(name);
    }
  }
  const [templateRows]: any = await dbPool.query('SELECT draft_json FROM form_templates');
  for (const row of templateRows) {
    const template = parseJson(row.draft_json);
    const name = template?.category?.trim();
    if (name && !knownCategories.has(name)) {
      const now = new Date().toISOString();
      const id = `cat_${crypto.randomUUID()}`;
      await dbPool.query('INSERT IGNORE INTO form_categories (id,name,description,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, name, '', seedNames.length + knownCategories.size, 1, now, now]);
      knownCategories.add(name);
    }
  }
  for (const preset of ORDER_FORM_PRESETS) {
    const id = `preset_${preset.id}`;
    const [existing]: any = await dbPool.query('SELECT id FROM form_templates WHERE id=? LIMIT 1', [id]);
    if (existing.length) continue;
    const now = new Date().toISOString();
    const template = seedTemplate(preset, now);
    await dbPool.query('INSERT INTO form_templates (id,name,target,status,draft_json,published_json,published_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [template.id, template.name, template.target, template.status, JSON.stringify(template), JSON.stringify(template), template.publishedVersion, now, now]);
    await dbPool.query('INSERT INTO form_template_versions (template_id,version,payload_json,published_at) VALUES (?,?,?,?)',
      [template.id, template.publishedVersion, JSON.stringify(template), now]);
  }
}

async function listCategories(includeInactive = true): Promise<FormCategory[]> {
  if (!dbPool) return [...categoryMemory.values()].filter((item) => includeInactive || item.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const [rows]: any = await dbPool.query(`SELECT id,name,description,sort_order AS sortOrder,is_active AS isActive,updated_at AS updatedAt FROM form_categories ${includeInactive ? '' : 'WHERE is_active=1'} ORDER BY sort_order,name`);
  return rows.map((row: any) => ({ ...row, sortOrder: Number(row.sortOrder), isActive: Boolean(row.isActive) }));
}

async function allTemplates(): Promise<FormTemplate[]> {
  if (!dbPool) return [...memory.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [rows]: any = await dbPool.query('SELECT draft_json FROM form_templates ORDER BY updated_at DESC');
  return rows.map((row: any) => parseJson(row.draft_json)).filter(Boolean);
}

async function getTemplate(id: string): Promise<FormTemplate | null> {
  if (!dbPool) return memory.get(id) || null;
  const [rows]: any = await dbPool.query('SELECT draft_json FROM form_templates WHERE id=? LIMIT 1', [id]);
  return rows.length ? parseJson(rows[0].draft_json) : null;
}

async function getPublished(id: string, version?: number): Promise<FormTemplate | null> {
  if (!dbPool) {
    const versions = publishedMemory.get(id);
    const selected = version || Math.max(0, ...(versions?.keys() || []));
    return versions?.get(selected) || null;
  }
  if (version) {
    const [rows]: any = await dbPool.query('SELECT payload_json FROM form_template_versions WHERE template_id=? AND version=? LIMIT 1', [id, version]);
    return rows.length ? parseJson(rows[0].payload_json) : null;
  }
  const [rows]: any = await dbPool.query('SELECT published_json FROM form_templates WHERE id=? AND status != ? LIMIT 1', [id, 'archived']);
  return rows.length ? parseJson(rows[0].published_json) : null;
}

formTemplatesRouter.get('/published', authenticate, async (req, res, next) => {
  try {
    const target = req.query.target === 'order' ? 'order' : req.query.target === 'general' ? 'general' : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const all = await allTemplates();
    const result = await Promise.all(all.filter((item) => item.publishedVersion > 0 && item.status !== 'archived' && (!target || item.target === target) && (!category || item.category === category)).map((item) => getPublished(item.id)));
    res.json({ code: 200, success: true, data: result.filter(Boolean) });
  } catch (error) { next(error); }
});

formTemplatesRouter.get('/published/:id', authenticate, async (req, res, next) => {
  try {
    const version = req.query.version ? Number(req.query.version) : undefined;
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) return res.status(400).json({ code: 400, success: false, message: '版本号无效' });
    const result = await getPublished(String(req.params.id), version);
    if (!result) return res.status(404).json({ code: 404, success: false, message: '表单版本不存在' });
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.post('/published/:id/validate', authenticate, async (req, res, next) => {
  try {
    const version = req.body?.version === undefined ? undefined : Number(req.body.version);
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) return res.status(400).json({ code: 400, success: false, message: '版本号无效' });
    const template = await getPublished(String(req.params.id), version);
    if (!template) return res.status(404).json({ code: 404, success: false, message: '表单版本不存在' });
    const data = req.body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 100_000) return res.status(400).json({ code: 400, success: false, message: '提交数据格式无效或过大' });
    const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
    const validate = ajv.compile(buildFormSchema(template.fields).schema);
    const valid = validate(data);
    res.json({ code: 200, success: true, data: { valid: Boolean(valid), errors: valid ? [] : validate.errors || [] } });
  } catch (error) { next(error); }
});

formTemplatesRouter.use(authenticate, requireRoles('admin'));

formTemplatesRouter.get('/categories', async (_req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listCategories() }); }
  catch (error) { next(error); }
});

formTemplatesRouter.post('/categories', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(''), sortOrder: z.number().int().min(0).max(10000).default(0) }).strict().parse(req.body);
    const categories = await listCategories();
    if (categories.some((item) => item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())) return res.status(409).json({ code: 409, success: false, message: '类目名称已存在' });
    const now = new Date().toISOString();
    const result: FormCategory = { id: `cat_${crypto.randomUUID()}`, ...input, isActive: true, updatedAt: now };
    if (dbPool) await dbPool.query('INSERT INTO form_categories (id,name,description,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [result.id, result.name, result.description, result.sortOrder, 1, now, now]);
    else categoryMemory.set(result.id, result);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_categories', action: 'create', targetType: 'form_category', targetId: result.id, summary: `创建表单类目「${result.name}」`, ipAddress: req.ip }).catch(console.error);
    res.status(201).json({ code: 201, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.put('/categories/:id', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(''), sortOrder: z.number().int().min(0).max(10000).default(0), isActive: z.boolean() }).strict().parse(req.body);
    const current = (await listCategories()).find((item) => item.id === req.params.id);
    if (!current) return res.status(404).json({ code: 404, success: false, message: '类目不存在' });
    const categories = await listCategories();
    if (categories.some((item) => item.id !== current.id && item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase())) return res.status(409).json({ code: 409, success: false, message: '类目名称已存在' });
    if (input.name !== current.name && ORDER_FORM_PRESETS.some((preset) => preset.category === current.name)) {
      return res.status(409).json({ code: 409, success: false, message: '系统预置题库使用此类目，暂不支持重命名；可以调整说明、排序或启停状态' });
    }
    if (input.name !== current.name && dbPool) {
      const [rows]: any = await dbPool.query(`SELECT COUNT(*) AS count FROM form_templates WHERE JSON_UNQUOTE(JSON_EXTRACT(draft_json, '$.category'))=? OR JSON_UNQUOTE(JSON_EXTRACT(published_json, '$.category'))=?`, [current.name, current.name]);
      if (Number(rows[0]?.count) > 0) return res.status(409).json({ code: 409, success: false, message: '已有表单使用此类目，请先调整表单归属后再重命名' });
    } else if (input.name !== current.name && [...memory.values()].some((template) => template.category === current.name)) {
      return res.status(409).json({ code: 409, success: false, message: '已有表单使用此类目，请先调整表单归属后再重命名' });
    }
    const result: FormCategory = { ...current, ...input, updatedAt: new Date().toISOString() };
    if (dbPool) await dbPool.query('UPDATE form_categories SET name=?,description=?,sort_order=?,is_active=?,updated_at=? WHERE id=?', [result.name, result.description, result.sortOrder, result.isActive ? 1 : 0, result.updatedAt, result.id]);
    else categoryMemory.set(result.id, result);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_categories', action: 'update', targetType: 'form_category', targetId: result.id, summary: `更新表单类目「${result.name}」`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.delete('/categories/:id', async (req, res, next) => {
  try {
    const current = (await listCategories()).find((item) => item.id === req.params.id);
    if (!current) return res.status(404).json({ code: 404, success: false, message: '类目不存在' });
    const result = { ...current, isActive: false, updatedAt: new Date().toISOString() };
    if (dbPool) await dbPool.query('UPDATE form_categories SET is_active=0,updated_at=? WHERE id=?', [result.updatedAt, result.id]);
    else categoryMemory.set(result.id, result);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_categories', action: 'archive', targetType: 'form_category', targetId: result.id, summary: `停用表单类目「${result.name}」`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.get('/', async (_req, res, next) => {
  try { res.json({ code: 200, success: true, data: await allTemplates() }); } catch (error) { next(error); }
});

formTemplatesRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await getTemplate(req.params.id);
    if (!result) return res.status(404).json({ code: 404, success: false, message: '表单不存在' });
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.post('/', async (req, res, next) => {
  try {
    const checked = validateDefinition(req.body);
    if ('error' in checked) return res.status(400).json({ code: 400, success: false, message: checked.error });
    const now = new Date().toISOString();
    const result: FormTemplate = { ...checked.data, id: `form_${crypto.randomUUID()}`, version: 0, publishedVersion: 0, status: 'draft', createdAt: now, updatedAt: now };
    if (dbPool) await dbPool.query('INSERT INTO form_templates (id,name,target,status,draft_json,published_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', [result.id, result.name, result.target, result.status, JSON.stringify(result), 0, now, now]);
    else memory.set(result.id, result);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_templates', action: 'create', targetType: 'form_template', targetId: result.id, summary: `创建表单「${result.name}」`, ipAddress: req.ip }).catch(console.error);
    res.status(201).json({ code: 201, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.put('/:id', async (req, res, next) => {
  try {
    const current = await getTemplate(req.params.id);
    if (!current || current.status === 'archived') return res.status(404).json({ code: 404, success: false, message: '表单不存在' });
    const checked = validateDefinition(req.body);
    if ('error' in checked) return res.status(400).json({ code: 400, success: false, message: checked.error });
    const result: FormTemplate = { ...current, ...checked.data, status: 'draft', updatedAt: new Date().toISOString() };
    if (dbPool) await dbPool.query('UPDATE form_templates SET name=?,target=?,status=?,draft_json=?,updated_at=? WHERE id=?', [result.name, result.target, result.status, JSON.stringify(result), result.updatedAt, result.id]);
    else memory.set(result.id, result);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_templates', action: 'update', targetType: 'form_template', targetId: result.id, summary: `更新表单草稿「${result.name}」`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const current = await getTemplate(req.params.id);
    if (!current || current.status === 'archived') return res.status(404).json({ code: 404, success: false, message: '表单不存在' });
    const checked = validateDefinition(current);
    if ('error' in checked) return res.status(400).json({ code: 400, success: false, message: checked.error });
    const nextVersion = current.publishedVersion + 1;
    const result: FormTemplate = { ...current, version: nextVersion, publishedVersion: nextVersion, status: 'published', updatedAt: new Date().toISOString() };
    if (dbPool) {
      const connection = await dbPool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows]: any = await connection.query('SELECT published_version FROM form_templates WHERE id=? FOR UPDATE', [result.id]);
        if (!rows.length || Number(rows[0].published_version) !== current.publishedVersion) throw new Error('版本已更新，请刷新后重试');
        await connection.query('INSERT INTO form_template_versions (template_id,version,payload_json,published_at) VALUES (?,?,?,?)', [result.id, nextVersion, JSON.stringify(result), result.updatedAt]);
        await connection.query('UPDATE form_templates SET status=?,draft_json=?,published_json=?,published_version=?,updated_at=? WHERE id=?', [result.status, JSON.stringify(result), JSON.stringify(result), nextVersion, result.updatedAt, result.id]);
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    } else {
      memory.set(result.id, result);
      const versions = publishedMemory.get(result.id) || new Map<number, FormTemplate>();
      versions.set(nextVersion, structuredClone(result));
      publishedMemory.set(result.id, versions);
    }
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_templates', action: 'publish', targetType: 'form_template', targetId: result.id, summary: `发布表单「${result.name}」v${nextVersion}`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});

formTemplatesRouter.delete('/:id', async (req, res, next) => {
  try {
    const current = await getTemplate(req.params.id);
    if (!current) return res.status(404).json({ code: 404, success: false, message: '表单不存在' });
    if (current.presetId && ORDER_FORM_PRESETS.some((preset) => preset.id === current.presetId)) return res.status(409).json({ code: 409, success: false, message: '系统预制表单会保留，不能归档；可编辑并发布新版本' });
    const result: FormTemplate = { ...current, status: 'archived', updatedAt: new Date().toISOString() };
    if (dbPool) await dbPool.query('UPDATE form_templates SET status=?,draft_json=?,updated_at=? WHERE id=?', [result.status, JSON.stringify(result), result.updatedAt, result.id]);
    else memory.set(result.id, result);
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'form_templates', action: 'archive', targetType: 'form_template', targetId: result.id, summary: `归档表单「${result.name}」`, ipAddress: req.ip }).catch(console.error);
    res.json({ code: 200, success: true, data: result });
  } catch (error) { next(error); }
});
