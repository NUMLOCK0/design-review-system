/** Isolated integration fixtures; no real payments, notifications or AI calls. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import type { CollaborationForm, CollaborationWorkspace, FormTemplate, RequirementCandidate } from '../packages/shared/src/index';

dotenv.config({ path: fileURLToPath(new URL('../apps/server/.env', import.meta.url)) });
process.env.WECOM_BOT_WEBHOOK = '';
const tag = randomUUID(); const orderId = `collab_${tag}`; const templateId = `tpl_${tag}`; const taskId = `task_${tag}`;
const brand = { id: `brand_${tag}`, name: '联调品牌方', email: `brand.${tag}@example.invalid`, role: 'advertiser' as const };
const designer = { id: `designer_${tag}`, name: '联调设计师', email: `designer.${tag}@example.invalid`, role: 'designer' as const };
const service = { id: `service_${tag}`, name: '联调客服', email: `service.${tag}@example.invalid`, role: 'customer_service' as const };
const outsider = { id: `outside_${tag}`, name: '非参与者', email: `outside.${tag}@example.invalid`, role: 'advertiser' as const };
const users = [brand, designer, service, outsider];
const password = 'Cozi-Only-For-Local-QA-2026';
const stamp = new Date().toISOString();
const template: FormTemplate = { id: templateId, name: '电商主图联调表单', description: '验证资料提交、版本与双方确认。', target: 'order', version: 1, publishedVersion: 1, status: 'published', createdAt: stamp, updatedAt: stamp, fields: [
  { id: 'section', key: 'section', kind: 'section', label: '商品与画面', width: 100 },
  { id: 'product', key: 'product', kind: 'text', label: '商品名称', width: 100, required: true },
  { id: 'style', key: 'style', kind: 'select', label: '视觉风格', width: 100, required: true, options: [{ label: '自然留白', value: 'natural' }, { label: '高端质感', value: 'premium' }] },
  { id: 'count', key: 'count', kind: 'number', label: '交付数量', width: 100, required: true, min: 1, max: 10 },
  { id: 'time', key: 'time', kind: 'time', label: '沟通时间', width: 100 },
  { id: 'extra', key: 'extra', kind: 'textarea', label: '高端质感说明', width: 100, required: true, condition: { fieldKey: 'style', operator: 'equals', value: 'premium' } },
  { id: 'items', key: 'items', kind: 'repeat', label: '逐张说明', width: 100, minItems: 1, maxItems: 3, children: [{ id: 'copy', key: 'copy', kind: 'text', label: '画面文案', width: 100, required: true }] },
  { id: 'image', key: 'image', kind: 'image', label: '参考图片', width: 100 },
  { id: 'file', key: 'material', kind: 'file', label: '产品资料', width: 100 },
] };

async function main() {
  const { dbPool } = await import('../apps/server/src/config/database');
  if (!dbPool) throw new Error('缺少 MYSQL_URL，无法运行数据库集成检查');
  const { ensureChatSchema } = await import('../apps/server/src/config/chat-schema');
  const { ensureCollaborationSchema } = await import('../apps/server/src/config/collaboration-schema');
  const { collaborationRouter } = await import('../apps/server/src/routes/collaboration');
  const { authRouter } = await import('../apps/server/src/routes/auth');
  const { chatRouter } = await import('../apps/server/src/routes/chat');
  const { formTemplatesRouter } = await import('../apps/server/src/routes/form-templates');
  const { JWT_SECRET } = await import('../apps/server/src/middleware/auth.middleware');
  const { submissionRequirementVersion, getCollaborationFile } = await import('../apps/server/src/services/collaboration');
  const { protectedAssets } = await import('../apps/server/src/utils/media-protection');
  const tokens = new Map(users.map(user => [user.id, jwt.sign(user, JWT_SECRET, { expiresIn: '1h' })]));
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173'); res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
  app.use('/api/collaboration', collaborationRouter); app.use('/api/auth', authRouter); app.use('/api/chat', chatRouter); app.use('/api/form-templates', formTemplatesRouter);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = app.listen(Number(process.env.COLLAB_QA_PORT || 0), '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const path = `/collaboration/orders/${orderId}`;
  async function call(endpoint: string, user: typeof users[number] = brand, method = 'GET', body?: unknown, key = randomUUID()) {
    const response = await fetch(`${base}${endpoint}`, { method, headers: { Authorization: `Bearer ${tokens.get(user.id)}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) });
    const value = await response.json(); return { status: response.status, data: value.data, message: value.message };
  }
  async function expectStatus(promise: ReturnType<typeof call>, status = 200) { const result = await promise; assert.equal(result.status, status, result.message); return result.data; }
  const workspace = async (): Promise<CollaborationWorkspace> => expectStatus(call(path));
  const issue = async (): Promise<CollaborationForm> => expectStatus(call(`${path}/forms`, designer, 'POST', { templateId, templateVersion: 1 }));
  const answers = { material: `/api/upload/assets/asset_material_${tag.replaceAll('-', '')}`, product: '青柠气泡水', style: 'natural', count: 2, time: '09:30', items: [{ copy: '轻盈清爽，每一天' }], extra: '此字段在当前风格下隐藏' };
  const materialId = `asset_material_${tag.replaceAll('-', '')}`;
  const tempDir = mkdtempSync(nodePath.join(tmpdir(), 'cozi-collab-'));
  writeFileSync(nodePath.join(tempDir, 'material.pdf'), '%PDF-test-material');
  let fixtureCreated = false;
  try {
    await ensureChatSchema(dbPool); await ensureCollaborationSchema(dbPool);
    protectedAssets.set(materialId, { id: materialId, ownerId: brand.id, kind: 'source-file', filename: '产品资料.pdf', mimetype: 'application/pdf', size: 18, localOriginalPath: nodePath.join(tempDir, 'material.pdf') });
    const passwordHash = await bcrypt.hash(password, 4);
    fixtureCreated = true;
    for (const user of users) await dbPool.query('INSERT INTO users (id,name,email,password_hash,role,is_active) VALUES (?,?,?,?,?,1)', [user.id, user.name, user.email, passwordHash, user.role]);
    await dbPool.query("INSERT INTO design_orders (id,order_no,title,category,platform,budget,status,creator_id,creator_name,claimed_by_id,claimed_by_name,requirements,created_at) VALUES (?,?,?,'电商主图','universal',100,'claimed',?,?,?,?,?,?)", [orderId, orderId, '青柠气泡水 · 夏日主视觉', brand.id, brand.name, designer.id, designer.name, '突出产品主体、青柠与夏日清爽感。交付 2 张主图。', stamp]);
    await dbPool.query("INSERT INTO review_tasks (id,task_no,product_name,platform,designer_id,designer_name,status,order_id) VALUES (?,?,?,'universal',?,?,'draft',?)", [taskId, taskId, '青柠气泡水', designer.id, designer.name, orderId]);
    await dbPool.query('INSERT INTO form_templates (id,name,target,status,draft_json,published_json,published_version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)', [templateId, template.name, 'order', 'published', JSON.stringify(template), JSON.stringify(template), stamp, stamp]);
    await dbPool.query('INSERT INTO form_template_versions (template_id,version,payload_json,published_at) VALUES (?,1,?,?)', [templateId, JSON.stringify(template), stamp]);

    await expectStatus(call(path, outsider), 404);
    const formsKey = randomUUID();
    const form = await expectStatus(call(`${path}/forms`, designer, 'POST', { templateId, templateVersion: 1 }, formsKey)) as CollaborationForm;
    const retryForm = await expectStatus(call(`${path}/forms`, designer, 'POST', { templateId, templateVersion: 1 }, formsKey));
    assert.equal(form.id, retryForm.id); assert.equal((await workspace()).forms.length, 1);
    await expectStatus(call(`${path}/forms`, designer, 'POST', { templateId, templateVersion: 2 }, formsKey), 409);
    await expectStatus(call(`${path}/forms/${form.id}`, designer, 'PATCH', { lockVersion: 0, answers }), 403);
    await expectStatus(call(`${path}/forms/${form.id}/submit`, brand, 'POST', { lockVersion: 0, answers: { product: '缺项' } }), 400);
    const saved = await expectStatus(call(`${path}/forms/${form.id}/draft`, brand, 'POST', { lockVersion: 0, answers })) as CollaborationForm;
    await expectStatus(call(`${path}/forms/${form.id}`, brand, 'PATCH', { lockVersion: 0, answers }), 409);
    const submitted = await expectStatus(call(`${path}/forms/${form.id}/submit`, brand, 'POST', { lockVersion: saved.lockVersion, answers })) as CollaborationForm;
    assert.equal(submitted.answers.extra, undefined); assert.equal(submitted.revision, 1);
    const nextTemplate = { ...template, version: 2, publishedVersion: 2, fields: template.fields.map(field => field.key === 'product' ? { ...field, label: '新版商品名称' } : field) };
    await dbPool.query('INSERT INTO form_template_versions (template_id,version,payload_json,published_at) VALUES (?,2,?,?)', [templateId, JSON.stringify(nextTemplate), stamp]);
    await dbPool.query('UPDATE form_templates SET published_json=?,published_version=2 WHERE id=?', [JSON.stringify(nextTemplate), templateId]);
    assert.equal((await workspace()).forms[0].template.fields.find(field => field.key === 'product')?.label, '商品名称');
    assert.equal((await getCollaborationFile(orderId, materialId, designer)).ownerId, brand.id);
    const materialResponse = await fetch(`${base}${path}/files/${materialId}`, { headers: { Authorization: `Bearer ${tokens.get(designer.id)}` } });
    assert.equal(materialResponse.status, 200); assert.equal(await materialResponse.text(), '%PDF-test-material');
    await expectStatus(call(`${path}/files/${materialId}`, outsider), 404);
    await expectStatus(call(`${path}/forms/${form.id}`, brand, 'PATCH', { lockVersion: submitted.lockVersion, answers }), 409);
    await assert.rejects(() => submissionRequirementVersion(orderId), /需求确认/);
    const candidate = await expectStatus(call(`${path}/candidates`, designer, 'POST', { formIds: [form.id], policy: 'both', baseVersion: 0 })) as RequirementCandidate;
    await expectStatus(call(`${path}/candidates/${candidate.id}/decisions`, outsider, 'POST', { contentHash: candidate.contentHash, decision: 'confirmed' }), 404);
    await expectStatus(call(`${path}/candidates/${candidate.id}/decisions`, brand, 'POST', { contentHash: 'f'.repeat(64), decision: 'confirmed' }), 409);
    const decisionKey = randomUUID();
    await Promise.all([
      expectStatus(call(`${path}/candidates/${candidate.id}/decisions`, brand, 'POST', { contentHash: candidate.contentHash, decision: 'confirmed' }, decisionKey)),
      expectStatus(call(`${path}/candidates/${candidate.id}/decisions`, brand, 'POST', { contentHash: candidate.contentHash, decision: 'confirmed' }, decisionKey)),
      expectStatus(call(`${path}/candidates/${candidate.id}/decisions`, designer, 'POST', { contentHash: candidate.contentHash, decision: 'confirmed' })),
    ]);
    let current = await workspace(); assert.equal(current.requirements.length, 1); const first = current.requirements[0];
    assert.equal(first.approvers.filter(item => item.decision === 'confirmed').length, 2);
    await expectStatus(call(`${path}/requirements/${first.id}/execute`, brand, 'POST', {}), 403);
    await expectStatus(call(`${path}/requirements/${first.id}/execute`, designer, 'POST', {}));
    assert.equal(await submissionRequirementVersion(orderId), first.id);
    const ai = await expectStatus(call(`${path}/requirements/${first.id}/ai-input`)); assert.equal(ai.executionAuthorized, false);
    const emptyWorkflow = await expectStatus(call(`${path}/requirements/${first.id}/workflow`)); assert.equal(emptyWorkflow.revision, 0);
    const plan = { schemaVersion: 1, requirementVersionId: first.id, nodes: [
      { id: 'brief', kind: 'brief', title: '需求拆解', position: { x: 20, y: 40 }, config: {}, inputBindings: [{ input: 'requirement', requirementPath: '$' }] },
      { id: 'design', kind: 'compose', title: '画面设计', position: { x: 400, y: 80 }, config: {}, inputBindings: [{ input: 'brief', sourceNodeId: 'brief', output: 'items' }] },
    ], edges: [{ id: 'edge-1', source: 'brief', target: 'design' }] };
    await expectStatus(call(`${path}/requirements/${first.id}/workflow`, brand, 'POST', { revision: 0, plan }), 403);
    await expectStatus(call(`${path}/requirements/${first.id}/workflow`, designer, 'POST', { revision: 0, plan }));
    await expectStatus(call(`${path}/requirements/${first.id}/workflow`, designer, 'POST', { revision: 0, plan }), 409);
    await expectStatus(call(`${path}/requirements/${first.id}/workflow`, designer, 'POST', { revision: 1, plan: { ...plan, edges: [...plan.edges, { id: 'cycle', source: 'design', target: 'brief' }] } }), 400);

    const revised = await expectStatus(call(`${path}/forms/${form.id}/return`, designer, 'POST', { lockVersion: submitted.lockVersion, comment: '增加一张主图' })) as CollaborationForm;
    await expectStatus(call(`${path}/forms/${form.id}/submit`, brand, 'POST', { lockVersion: revised.lockVersion, answers: { ...answers, count: 3 } }));
    const oldCandidate = await expectStatus(call(`${path}/candidates`, designer, 'POST', { formIds: [form.id], policy: 'both', baseVersion: 1 })) as RequirementCandidate;
    await expectStatus(call(`${path}/candidates/${oldCandidate.id}/decisions`, brand, 'POST', { contentHash: oldCandidate.contentHash, decision: 'confirmed' }));
    const newCandidate = await expectStatus(call(`${path}/candidates`, designer, 'POST', { formIds: [form.id], policy: 'both', baseVersion: 1 })) as RequirementCandidate;
    await expectStatus(call(`${path}/candidates/${oldCandidate.id}/decisions`, designer, 'POST', { contentHash: oldCandidate.contentHash, decision: 'confirmed' }), 409);
    await assert.rejects(() => submissionRequirementVersion(orderId), /仍待确认/);
    await expectStatus(call(`${path}/candidates/${newCandidate.id}/decisions`, brand, 'POST', { contentHash: newCandidate.contentHash, decision: 'confirmed' }));
    await expectStatus(call(`${path}/candidates/${newCandidate.id}/decisions`, designer, 'POST', { contentHash: newCandidate.contentHash, decision: 'confirmed' }));
    current = await workspace(); assert.equal(current.requirements.length, 2); assert.equal(current.requirements[1].content.sources[0].answers.count, 2); assert.equal(current.requirements[0].content.sources[0].answers.count, 3);
    await assert.rejects(() => submissionRequirementVersion(orderId), /最新正式需求/);
    await expectStatus(call(`${path}/requirements/${first.id}/execute`, designer, 'POST', {}), 409);
    await expectStatus(call(`${path}/requirements/${current.requirements[0].id}/execute`, designer, 'POST', {}));

    const secondForm = await issue();
    protectedAssets.set(`asset_${tag.replaceAll('-', '')}`, { id: `asset_${tag.replaceAll('-', '')}`, ownerId: outsider.id, kind: 'image', filename: 'foreign.png', mimetype: 'image/png', size: 1 });
    await expectStatus(call(`${path}/forms/${secondForm.id}/submit`, brand, 'POST', { lockVersion: 0, answers: { ...answers, image: `/api/upload/previews/asset_${tag.replaceAll('-', '')}` } }), 403);
    await expectStatus(call(`${path}/forms/${secondForm.id}/submit`, brand, 'POST', { lockVersion: 0, answers: { ...answers, count: 7 } }));
    await expectStatus(call(`${path}/candidates`, designer, 'POST', { formIds: [form.id, secondForm.id], policy: 'both', baseVersion: 2 }), 409);
    const rejectedCandidate = await expectStatus(call(`${path}/candidates`, designer, 'POST', { formIds: [secondForm.id], policy: 'both', baseVersion: 2 })) as RequirementCandidate;
    await expectStatus(call(`${path}/candidates/${rejectedCandidate.id}/decisions`, brand, 'POST', { contentHash: rejectedCandidate.contentHash, decision: 'rejected', comment: '' }), 400);
    await expectStatus(call(`${path}/candidates/${rejectedCandidate.id}/decisions`, brand, 'POST', { contentHash: rejectedCandidate.contentHash, decision: 'rejected', comment: '数量需要调整' }));
    await expectStatus(call(`${path}/candidates/${rejectedCandidate.id}/decisions`, designer, 'POST', { contentHash: rejectedCandidate.contentHash, decision: 'confirmed' }), 409);
    assert.equal((await workspace()).requirements.length, 2);
    const [history]: any = await dbPool.query('SELECT seq,body FROM chat_messages WHERE order_id=? ORDER BY seq', [orderId]);
    assert(history.length > 6); assert(history.every((item: any, index: number) => Number(item.seq) === index + 1));
    await expectStatus(call(`/chat/orders/${orderId}/messages`, brand, 'POST', { clientMessageId: randomUUID(), body: 'COZI_WORKFLOW_V1:{}' }), 403);
    const presetForm = await expectStatus(call(`${path}/forms/preset`, service, 'POST', { presetId: 'tpl_1' })) as CollaborationForm;
    assert.equal(presetForm.template.presetId, 'tpl_1');
    const composedForm = await expectStatus(call(`${path}/forms/composed`, service, 'POST', { selections: [{ presetId: 'tpl_1', fieldKeys: ['scene', 'goal'] }, { presetId: 'tpl_2', fieldKeys: ['platform'] }] })) as CollaborationForm;
    assert(composedForm.template.fields.some(field => field.key === 'tpl_1_scene'));
    assert(composedForm.template.fields.some(field => field.key === 'tpl_2_platform'));
    await expectStatus(call(`${path}/forms/composed`, service, 'POST', { selections: [{ presetId: 'tpl_1', fieldKeys: ['missing'] }] }), 400);
    const choiceBody = `COZI_CHAT_CARD_V1:${JSON.stringify({ kind: 'choice', source: 'style', title: '风格选择', prompt: '请选择方向', options: [{ id: 'a', label: '极简', detail: '' }, { id: 'b', label: '自然', detail: '' }] })}`;
    const choice = await expectStatus(call(`/chat/orders/${orderId}/messages`, service, 'POST', { clientMessageId: randomUUID(), body: choiceBody }), 201) as { id: string };
    const answerBody = `COZI_CHAT_CARD_V1:${JSON.stringify({ kind: 'choice_answer', choiceMessageId: choice.id, optionId: 'a', optionLabel: '极简', note: '' })}`;
    await expectStatus(call(`/chat/orders/${orderId}/messages`, brand, 'POST', { clientMessageId: randomUUID(), body: answerBody }), 201);
    await expectStatus(call(`/chat/orders/${orderId}/messages`, brand, 'POST', { clientMessageId: randomUUID(), body: answerBody }), 409);
    assert.equal((await expectStatus(call(`/chat/orders/${orderId}/finance`, service)) as { budget: number }).budget, 100);
    console.log('需求协作集成检查通过：权限、模板快照、草稿冲突、提交校验、隐藏字段、附件归属、幂等、并发确认、版本修订、执行绑定、画布版本/循环依赖、聊天序号与 AI 交接。');
    if (process.argv.includes('--serve')) {
      const pendingForm = await issue();
      const dir = fileURLToPath(new URL('../.cache/', import.meta.url)); mkdirSync(dir, { recursive: true });
      writeFileSync(`${dir}collaboration-qa.json`, JSON.stringify({ apiBase: base, email: brand.email, serviceEmail: service.email, password, orderId, formId: pendingForm.id }), { mode: 0o600 });
      console.log(`本地 UI 联调 API：${base}；按 Ctrl+C 清理临时数据。`);
      await new Promise<void>(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    try {
      if (fixtureCreated) {
        const [forms]: any = await dbPool.query('SELECT id FROM collaboration_forms WHERE order_id=?', [orderId]);
        const [versions]: any = await dbPool.query('SELECT id FROM requirement_versions WHERE order_id=?', [orderId]);
        for (const form of forms) await dbPool.query('DELETE FROM collaboration_submissions WHERE form_id=?', [form.id]);
        for (const version of versions) await dbPool.query('DELETE FROM design_workflow_plans WHERE requirement_version_id=?', [version.id]);
        for (const table of ['collaboration_executions', 'collaboration_commands', 'collaboration_outbox', 'requirement_versions', 'collaboration_candidates', 'collaboration_forms', 'chat_messages', 'chat_conversations', 'review_tasks']) await dbPool.query(`DELETE FROM ${table} WHERE order_id=?`, [orderId]);
        await dbPool.query('DELETE FROM design_orders WHERE id=?', [orderId]);
        await dbPool.query('DELETE FROM form_template_versions WHERE template_id=?', [templateId]); await dbPool.query('DELETE FROM form_templates WHERE id=?', [templateId]);
        for (const user of users) await dbPool.query('DELETE FROM users WHERE id=?', [user.id]);
      }
      protectedAssets.delete(`asset_${tag.replaceAll('-', '')}`); protectedAssets.delete(materialId);
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(fileURLToPath(new URL('../.cache/collaboration-qa.json', import.meta.url)), { force: true });
    } finally { await dbPool.end(); }
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
