import { createHash, randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { PoolConnection } from 'mysql2/promise';
import {
  buildFormSchema, prepareFormAnswers, WORKFLOW_MESSAGE_PREFIX,
  type CollaborationForm, type CollaborationWorkspace, type ConfirmationPolicy,
  type FormAnswers, type FormField, type FormTemplate, type RequirementCandidate,
  type RequirementContent, type RequirementSource, type RequirementVersion, type WorkflowMessage,
  type DesignWorkflowPlan, workflowPlanError,
  ORDER_FORM_PRESETS, createOrderPresetDraft, createFormField,
} from '@design-review/shared';
import { dbPool } from '../config/database.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { publishChatMessage } from '../socket/chat-socket.js';
import type { ChatMessage } from './chat.js';
import { findMediaAsset } from '../config/persistence.js';
import { protectedAssets } from '../utils/media-protection.js';

type Order = {
  id: string; order_no: string; title: string; category: string; platform: string;
  creator_id: string; creator_name: string; claimed_by_id: string | null; claimed_by_name: string | null;
  status: string; deadline: string | null; requirements: string | null; requires_psd: number;
};
const json = <T>(value: unknown): T => (typeof value === 'string' ? JSON.parse(value) : value) as T;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function pool() { if (!dbPool) fail('需求协作需要 MySQL 数据库，当前不可用', 503); return dbPool!; }

async function orderAccess(connection: Pick<PoolConnection, 'query'>, orderId: string, user: AuthUserPayload, lock = false): Promise<Order> {
  const [rows]: any = await connection.query(`SELECT * FROM design_orders WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [orderId]);
  const order: Order = rows[0];
  if (!order || (order.creator_id !== user.id && order.claimed_by_id !== user.id && !['admin', 'customer_service'].includes(user.role))) fail('订单不存在或无权访问', 404);
  return order;
}

async function readWorkspace(connection: Pick<PoolConnection, 'query'>, order: Order): Promise<CollaborationWorkspace> {
  const [formRows]: any = await connection.query('SELECT payload_json FROM collaboration_forms WHERE order_id=? ORDER BY created_at,id', [order.id]);
  const [candidateRows]: any = await connection.query('SELECT payload_json FROM collaboration_candidates WHERE order_id=? ORDER BY created_at DESC,id DESC', [order.id]);
  const [versionRows]: any = await connection.query('SELECT payload_json FROM requirement_versions WHERE order_id=? ORDER BY version DESC', [order.id]);
  const [executionRows]: any = await connection.query('SELECT requirement_version_id,task_id,started_at FROM collaboration_executions WHERE order_id=? ORDER BY started_at DESC LIMIT 1', [order.id]);
  return {
    orderId: order.id, title: order.title, orderNo: order.order_no, creatorId: order.creator_id,
    designerId: order.claimed_by_id, status: order.status,
    forms: formRows.map((row: any) => json<CollaborationForm>(row.payload_json)),
    candidates: candidateRows.map((row: any) => json<RequirementCandidate>(row.payload_json)),
    requirements: versionRows.map((row: any) => json<RequirementVersion>(row.payload_json)),
    execution: executionRows[0] ? { requirementVersionId: executionRows[0].requirement_version_id, taskId: executionRows[0].task_id, startedAt: executionRows[0].started_at } : null,
  };
}

export async function getCollaborationWorkspace(orderId: string, user: AuthUserPayload) {
  // A repeatable-read snapshot prevents mixing forms, candidates and requirements from different commits.
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const order = await orderAccess(connection, orderId, user);
    const result = await readWorkspace(connection, order);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

/** Only explicitly referenced form material is shared; delivery originals retain their own download rules. */
export async function getCollaborationFile(orderId: string, assetId: string, user: AuthUserPayload) {
  const workspace = await getCollaborationWorkspace(orderId, user);
  const url = `/api/upload/assets/${assetId}`;
  function references(fields: FormField[], answers: FormAnswers): boolean {
    if (!fields.length) return false;
    return fields.some(field => {
      if (field.kind === 'file' || field.kind === 'image') {
        const values = Array.isArray(answers[field.key]) ? answers[field.key] as unknown[] : [answers[field.key]];
        return values.some(value => value === url || value === `/api/upload/previews/${assetId}`);
      }
      return field.kind === 'repeat' && Array.isArray(answers[field.key])
        && (answers[field.key] as FormAnswers[]).some(row => references(field.children || [], row));
    });
  }
  const form = workspace.forms.find(item => references(item.template.fields, item.answers));
  const frozen = workspace.requirements.some(item => item.content.sources.some(source => references(source.fields, source.answers)));
  if (!form && !frozen) fail('资料未关联此订单需求', 404);
  const asset = protectedAssets.get(assetId) || await findMediaAsset(assetId);
  if (!asset || !['source-file', 'image'].includes(asset.kind)) fail('资料文件不存在', 404);
  // Frozen requirements have already passed ownership checks at submission.
  if (!frozen && ![workspace.creatorId, workspace.designerId, form?.createdBy].includes(asset.ownerId)) fail('无权读取该资料', 403);
  return asset;
}

export async function listCollaborationOrders(user: AuthUserPayload, offset = 0) {
  const [rows]: any = await pool().query(`SELECT o.id AS orderId,o.order_no AS orderNo,o.title,o.status,
    CASE WHEN o.creator_id=? THEN COALESCE(o.claimed_by_name,'等待设计师接单') ELSE o.creator_name END AS counterpartName,
    (SELECT COUNT(*) FROM collaboration_forms f WHERE f.order_id=o.id) AS formCount,
    (SELECT COUNT(*) FROM collaboration_forms f WHERE f.order_id=o.id AND JSON_UNQUOTE(JSON_EXTRACT(f.payload_json,'$.assigneeId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(f.payload_json,'$.status')) IN ('sent','filling','returned')) AS pendingForms,
    (SELECT COALESCE(MAX(v.version),0) FROM requirement_versions v WHERE v.order_id=o.id) AS requirementVersion
    FROM design_orders o WHERE (o.creator_id=? OR o.claimed_by_id=? OR ? IN ('admin','customer_service'))
    ORDER BY COALESCE(o.updated_at,o.created_at) DESC LIMIT 50 OFFSET ?`, [user.id, user.id, user.id, user.id, user.role, offset]);
  const orderIds = rows.map((row: any) => row.orderId);
  const pending = new Map<string, number>();
  if (orderIds.length) {
    const [candidates]: any = await pool().query(`SELECT order_id,payload_json FROM collaboration_candidates WHERE order_id IN (${orderIds.map(() => '?').join(',')}) AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.status'))='confirming'`, orderIds);
    for (const row of candidates) {
      const candidate = json<RequirementCandidate>(row.payload_json);
      if (candidate.approvers.some(item => item.userId === user.id && item.decision === 'pending')) pending.set(row.order_id, (pending.get(row.order_id) || 0) + 1);
    }
  }
  return rows.map((row: any) => ({ ...row, formCount: Number(row.formCount), pendingForms: Number(row.pendingForms), requirementVersion: Number(row.requirementVersion), pendingConfirmations: pending.get(row.orderId) || 0 }));
}

async function appendWorkflowMessage(connection: PoolConnection, order: Order, user: AuthUserPayload, card: WorkflowMessage) {
  await connection.query('INSERT IGNORE INTO chat_conversations (order_id,last_seq) VALUES (?,0)', [order.id]);
  const [rows]: any = await connection.query('SELECT last_seq FROM chat_conversations WHERE order_id=? FOR UPDATE', [order.id]);
  const message: ChatMessage = { id: randomUUID(), orderId: order.id, seq: Number(rows[0].last_seq) + 1,
    senderId: user.id, senderName: user.name, clientMessageId: randomUUID(), body: WORKFLOW_MESSAGE_PREFIX + JSON.stringify(card), createdAt: now() };
  await connection.query('INSERT INTO chat_messages (id,order_id,seq,sender_id,sender_name,client_message_id,body,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [message.id, order.id, message.seq, user.id, user.name, message.clientMessageId, message.body, message.createdAt]);
  await connection.query('UPDATE chat_conversations SET last_seq=? WHERE order_id=?', [message.seq, order.id]);
  const recipients = [...new Set([order.creator_id, order.claimed_by_id, 'role:service'].filter(Boolean))];
  await connection.query('INSERT INTO collaboration_outbox (id,order_id,message_json,recipients_json) VALUES (?,?,?,?)',
    [message.id, order.id, JSON.stringify(message), JSON.stringify(recipients)]);
}

export async function collaborationCommand<T>(orderId: string, user: AuthUserPayload, key: string, input: unknown,
  action: (connection: PoolConnection, order: Order) => Promise<T>): Promise<T> {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const order = await orderAccess(connection, orderId, user, true);
    const [users]: any = await connection.query('SELECT is_active,role FROM users WHERE id=?', [user.id]);
    if (!users[0]?.is_active || users[0].role !== user.role) fail('登录状态已失效', 401);
    const requestHash = hash(input);
    const [commands]: any = await connection.query('SELECT request_hash,result_json FROM collaboration_commands WHERE order_id=? AND actor_id=? AND command_key=?', [orderId, user.id, key]);
    if (commands[0]) {
      if (commands[0].request_hash !== requestHash) fail('同一操作标识已用于其他内容，请重新操作', 409);
      await connection.commit();
      return json<T>(commands[0].result_json);
    }
    if (user.role === 'customer_service') {
      const [assignments]: any = await connection.query(
        "SELECT assigned_service_id FROM service_conversation_assignments WHERE conversation_type='order' AND conversation_id=? LIMIT 1",
        [orderId],
      );
      if (assignments[0] && assignments[0].assigned_service_id !== user.id) fail('会话已转交给其他客服', 403);
    }
    if (['cancelled', 'completed'].includes(order.status)) fail('订单已结束，无法修改需求', 409);
    const result = await action(connection, order);
    await connection.query('INSERT INTO collaboration_commands (order_id,actor_id,command_key,request_hash,result_json) VALUES (?,?,?,?,?)', [orderId, user.id, key, requestHash, JSON.stringify(result)]);
    await connection.commit();
    // Polling/history is the durable fallback if broadcasting fails after commit.
    void dispatchCollaborationOutbox().catch(error => console.error('[Collaboration outbox]', error.message));
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

let dispatching = false;
export async function dispatchCollaborationOutbox() {
  if (dispatching || !dbPool) return;
  dispatching = true;
  try {
    const [rows]: any = await dbPool.query('SELECT id,message_json,recipients_json FROM collaboration_outbox WHERE dispatched_at IS NULL LIMIT 100');
    for (const row of rows) {
      publishChatMessage(json<ChatMessage>(row.message_json), json<string[]>(row.recipients_json));
      await dbPool.query('UPDATE collaboration_outbox SET dispatched_at=CURRENT_TIMESTAMP(3) WHERE id=? AND dispatched_at IS NULL', [row.id]);
    }
  } finally { dispatching = false; }
}
export function startCollaborationWorker() {
  const timer = setInterval(() => { void dispatchCollaborationOutbox().catch(error => console.error('[Collaboration outbox]', error.message)); }, 5000);
  timer.unref();
}

async function saveForm(connection: PoolConnection, form: CollaborationForm) {
  await connection.query('UPDATE collaboration_forms SET payload_json=? WHERE id=? AND order_id=?', [JSON.stringify(form), form.id, form.orderId]);
}
async function loadForm(connection: PoolConnection, orderId: string, id: string): Promise<CollaborationForm> {
  const [rows]: any = await connection.query('SELECT payload_json FROM collaboration_forms WHERE id=? AND order_id=?', [id, orderId]);
  if (!rows[0]) fail('表单不存在', 404);
  return json(rows[0].payload_json);
}
async function supersedeCandidates(connection: PoolConnection, orderId: string, formId?: string) {
  const [rows]: any = await connection.query('SELECT id,payload_json FROM collaboration_candidates WHERE order_id=?', [orderId]);
  for (const row of rows) {
    const candidate = json<RequirementCandidate>(row.payload_json);
    if (candidate.status === 'confirming' && (!formId || candidate.content.sources.some(source => source.formId === formId))) {
      candidate.status = 'superseded';
      await connection.query('UPDATE collaboration_candidates SET payload_json=? WHERE id=?', [JSON.stringify(candidate), candidate.id]);
    }
  }
}

export async function createCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload, templateId: string, templateVersion: number) {
  const [rows]: any = await connection.query('SELECT v.payload_json FROM form_template_versions v JOIN form_templates t ON t.id=v.template_id WHERE v.template_id=? AND v.version=? AND t.status<>?', [templateId, templateVersion, 'archived']);
  if (!rows[0]) fail('已发布表单版本不存在或已归档', 404);
  const template = json<FormTemplate>(rows[0].payload_json);
  return insertCollaborationForm(connection, order, user, template);
}

async function insertCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload, template: FormTemplate) {
  const stamp = now();
  const form: CollaborationForm = { id: randomUUID(), orderId: order.id, template, assigneeId: order.creator_id,
    createdBy: user.id, answers: {}, revision: 0, lockVersion: 0, status: 'sent', comment: '', submittedAt: null, createdAt: stamp, updatedAt: stamp };
  await connection.query('INSERT INTO collaboration_forms (id,order_id,payload_json,created_at) VALUES (?,?,?,?)', [form.id, order.id, JSON.stringify(form), stamp]);
  await appendWorkflowMessage(connection, order, user, { kind: 'form', entityId: form.id, title: template.name, description: '请品牌方填写需求表单，可保存草稿后继续。' });
  return form;
}

export async function createPresetCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload, presetId: string) {
  const preset = ORDER_FORM_PRESETS.find(item => item.id === presetId);
  if (!preset) fail('标准发单模板不存在', 404);
  const template = createOrderPresetDraft(preset);
  Object.assign(template, { id: `preset_${preset.id}`, version: 1, publishedVersion: 1, status: 'published' });
  return insertCollaborationForm(connection, order, user, template);
}

export async function createComposedCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload,
  selections: Array<{ presetId: string; fieldKeys: string[] }>) {
  const fields: FormField[] = [];
  const seenPresets = new Set<string>();
  for (const selection of selections) {
    if (seenPresets.has(selection.presetId)) fail('组合发单包含重复业务类别', 400);
    seenPresets.add(selection.presetId);
    const preset = ORDER_FORM_PRESETS.find(item => item.id === selection.presetId);
    if (!preset) fail('组合发单模板不存在', 404);
    const allowed = new Set(selection.fieldKeys);
    if (allowed.size !== selection.fieldKeys.length) fail('组合发单包含重复问题', 400);
    const found = new Set<string>();
    for (const section of preset.sections) {
      const selected = section.fields.filter(item => allowed.has(item.key));
      if (!selected.length) continue;
      fields.push({ ...createFormField('section', fields.length + 1), key: `section_${fields.length + 1}`, label: `${preset.name} · ${section.title}`, width: 100 });
      for (const item of selected) {
        found.add(item.key);
        fields.push({ ...createFormField(item.kind, fields.length + 1), key: `${preset.id}_${item.key}`, label: item.label,
          required: item.required, placeholder: item.placeholder, width: item.kind === 'textarea' ? 100 : 50,
          ...(item.options ? { options: item.options.map(option => ({ label: option, value: option })) } : {}),
          ...(item.presets ? { presets: item.presets } : {}) });
      }
    }
    if (found.size !== allowed.size) fail('组合发单包含无效问题', 400);
  }
  if (!fields.length || fields.length > 100) fail('请选择 1 至 100 个问题或分组', 400);
  const stamp = now();
  const template: FormTemplate = { id: `combo_${randomUUID()}`, name: '组合发单需求表', description: '从 13 类设计业务中组合的填写表单',
    target: 'order', category: '组合发单', fields, version: 1, publishedVersion: 1, status: 'published', createdAt: stamp, updatedAt: stamp };
  return insertCollaborationForm(connection, order, user, template);
}

export async function createManagedComposedCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload,
  selections: Array<{ templateId: string; templateVersion: number; fieldKeys: string[] }>) {
  const fields: FormField[] = [];
  const seenTemplates = new Set<string>();
  for (const selection of selections) {
    if (seenTemplates.has(selection.templateId)) fail('组合发单包含重复表单', 400);
    seenTemplates.add(selection.templateId);
    if (new Set(selection.fieldKeys).size !== selection.fieldKeys.length) fail('组合发单包含重复问题', 400);
    const [rows]: any = await connection.query(
      'SELECT v.payload_json FROM form_template_versions v JOIN form_templates t ON t.id=v.template_id WHERE v.template_id=? AND v.version=? AND t.target=? AND t.status<>? LIMIT 1',
      [selection.templateId, selection.templateVersion, 'order', 'archived'],
    );
    if (!rows[0]) fail('组合发单引用的表单版本不存在或已归档', 404);
    const source = json<FormTemplate>(rows[0].payload_json);
    const allowed = new Set(selection.fieldKeys);
    let currentSection = source.name;
    let sectionAdded = false;
    const found = new Set<string>();
    for (const item of source.fields) {
      if (item.kind === 'section') { currentSection = item.label; sectionAdded = false; continue; }
      if (['divider', 'paragraph'].includes(item.kind) || !allowed.has(item.key)) continue;
      if (!sectionAdded) {
        fields.push({ ...createFormField('section', fields.length + 1), key: `section_${fields.length + 1}`, label: `${source.name} · ${currentSection}`, width: 100 });
        sectionAdded = true;
      }
      found.add(item.key);
      fields.push({ ...item, id: `field_${fields.length + 1}`, key: `${source.id}_${item.key}`, width: item.kind === 'textarea' ? 100 : item.width });
    }
    if (found.size !== allowed.size) fail('组合发单包含无效问题', 400);
  }
  if (!fields.length || fields.length > 100) fail('请选择 1 至 100 个问题或分组', 400);
  const stamp = now();
  const template: FormTemplate = { id: `combo_${randomUUID()}`, name: '组合发单需求表', description: '从后台已发布表单中组合的填写表单',
    target: 'order', category: '组合发单', fields, version: 1, publishedVersion: 1, status: 'published', createdAt: stamp, updatedAt: stamp };
  return insertCollaborationForm(connection, order, user, template);
}

async function validateAssets(fields: FormField[], answers: FormAnswers, allowedOwners: string[]) {
  for (const field of fields) {
    const value = answers[field.key];
    if (field.kind === 'repeat' && Array.isArray(value)) {
      for (const item of value) await validateAssets(field.children || [], item as FormAnswers, allowedOwners);
    }
    if (['image', 'file'].includes(field.kind) && value) {
      const values = Array.isArray(value) ? value : [value];
      if (field.maxFiles !== null && values.length > (field.maxFiles ?? 1)) fail(`${field.label}：最多上传 ${field.maxFiles ?? 1} 个文件`);
      for (const item of values) {
        const match = typeof item === 'string' ? /^\/api\/upload\/(?:previews|assets)\/([a-zA-Z0-9_-]+)$/.exec(item) : null;
        if (!match) fail(`${field.label}：请通过系统上传文件`);
        const asset = protectedAssets.get(match[1]) || await findMediaAsset(match[1]);
        if (!asset || !allowedOwners.includes(asset.ownerId)) fail(`${field.label}：文件不存在或无权使用`, 403);
      }
    }
  }
}

export async function updateCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload,
  id: string, lockVersion: number, answers: FormAnswers, submit: boolean) {
  const form = await loadForm(connection, order.id, id);
  if (form.assigneeId !== user.id) fail('只有指定品牌方可以填写此表单', 403);
  if (form.lockVersion !== lockVersion) fail('表单已在其他设备更新，请重新加载后合并内容', 409);
  if (form.status === 'submitted') fail('已提交内容不可覆盖，请先发起修订', 409);
  const prepared = prepareFormAnswers(form.template.fields, answers);
  if (submit) {
    const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
    const validate = ajv.compile(buildFormSchema(form.template.fields).schema);
    if (!validate(prepared)) fail(`请检查表单：${(validate.errors || []).slice(0, 5).map(error => `${error.instancePath || '/'} ${error.message}`).join('；')}`);
    await validateAssets(form.template.fields, prepared, [order.creator_id, order.claimed_by_id || '', form.createdBy]);
  }
  form.answers = submit ? prepared : answers;
  form.lockVersion += 1; form.updatedAt = now(); form.status = submit ? 'submitted' : 'filling';
  if (submit) {
    form.revision += 1; form.submittedAt = form.updatedAt;
    const source: RequirementSource = { formId: form.id, submissionId: randomUUID(), revision: form.revision,
      templateId: form.template.id, templateVersion: form.template.publishedVersion || form.template.version,
      title: form.template.name, fields: form.template.fields, answers: prepared };
    await connection.query('INSERT INTO collaboration_submissions (id,form_id,revision,payload_json) VALUES (?,?,?,?)', [source.submissionId, form.id, source.revision, JSON.stringify(source)]);
    await supersedeCandidates(connection, order.id, form.id);
    await appendWorkflowMessage(connection, order, user, { kind: 'form', entityId: form.id, title: `${form.template.name} · 第 ${form.revision} 次提交`, description: '需求资料已提交，可汇总并发起确认。' });
  }
  await saveForm(connection, form);
  return form;
}

export async function returnCollaborationForm(connection: PoolConnection, order: Order, user: AuthUserPayload, id: string, lockVersion: number, comment: string) {
  const form = await loadForm(connection, order.id, id);
  if (form.lockVersion !== lockVersion) fail('表单已更新，请重新加载', 409);
  if (form.status !== 'submitted') fail('只有已提交表单可以退回或修订', 409);
  form.status = 'returned'; form.comment = comment; form.lockVersion += 1; form.updatedAt = now();
  await saveForm(connection, form);
  await supersedeCandidates(connection, order.id, form.id);
  await appendWorkflowMessage(connection, order, user, { kind: 'form', entityId: form.id, title: `${form.template.name} · 待补充`, description: comment });
  return form;
}

export async function createRequirementCandidate(connection: PoolConnection, order: Order, user: AuthUserPayload,
  formIds: string[], policy: ConfirmationPolicy, baseVersion: number) {
  const [versions]: any = await connection.query('SELECT COALESCE(MAX(version),0) AS version FROM requirement_versions WHERE order_id=?', [order.id]);
  if (Number(versions[0].version) !== baseVersion) fail('正式需求已有新版本，请重新加载后发起确认', 409);
  if (policy === 'both' && (!order.claimed_by_id || order.claimed_by_id === order.creator_id)) fail('双方确认需要已分配的不同设计师');
  if (policy === 'brand' && order.claimed_by_id && user.id === order.creator_id) fail('已分配设计师时，品牌方应发起双方确认', 403);
  const sources: RequirementSource[] = [];
  const values = new Map<string, string>();
  for (const id of [...new Set(formIds)].sort()) {
    const form = await loadForm(connection, order.id, id);
    if (form.status !== 'submitted') fail(`「${form.template.name}」尚未提交`, 409);
    const [rows]: any = await connection.query('SELECT payload_json FROM collaboration_submissions WHERE form_id=? AND revision=?', [id, form.revision]);
    if (!rows[0]) fail('表单提交版本缺失', 409);
    const source = json<RequirementSource>(rows[0].payload_json);
    for (const [key, value] of Object.entries(source.answers)) {
      const serialized = JSON.stringify(value);
      if (values.has(key) && values.get(key) !== serialized) fail(`多个表单的「${key}」内容冲突，请修订为一致内容或分开确认`, 409);
      values.set(key, serialized);
    }
    sources.push(source);
  }
  const content: RequirementContent = { title: order.title, orderNo: order.order_no, category: order.category,
    platform: order.platform, deadline: order.deadline, requiresPsd: Boolean(order.requires_psd), originalRequirements: order.requirements || '', sources };
  const approvers: RequirementCandidate['approvers'] = [{ userId: order.creator_id, name: order.creator_name, role: 'brand', decision: 'pending', comment: '', actedAt: null }];
  if (policy === 'both') approvers.push({ userId: order.claimed_by_id!, name: order.claimed_by_name || '设计师', role: 'designer', decision: 'pending', comment: '', actedAt: null });
  const candidate: RequirementCandidate = { id: randomUUID(), orderId: order.id, policy, content,
    contentHash: hash({ content, policy, approvers }), approvers, status: 'confirming', createdAt: now(), createdBy: user.id, requirementVersionId: null };
  await supersedeCandidates(connection, order.id);
  await connection.query('INSERT INTO collaboration_candidates (id,order_id,payload_json,created_at) VALUES (?,?,?,?)', [candidate.id, order.id, JSON.stringify(candidate), candidate.createdAt]);
  await appendWorkflowMessage(connection, order, user, { kind: 'confirmation', entityId: candidate.id, title: '需求待确认', description: `${policy === 'both' ? '品牌方与设计师' : '品牌方'}请核对同一份需求内容后明确确认。` });
  return candidate;
}

export async function decideRequirement(connection: PoolConnection, order: Order, user: AuthUserPayload,
  id: string, contentHash: string, decision: 'confirmed' | 'rejected', comment: string) {
  const [rows]: any = await connection.query('SELECT payload_json FROM collaboration_candidates WHERE id=? AND order_id=?', [id, order.id]);
  if (!rows[0]) fail('确认请求不存在', 404);
  const candidate = json<RequirementCandidate>(rows[0].payload_json);
  const approver = candidate.approvers.find(item => item.userId === user.id);
  if (!approver || (approver.role === 'brand' ? order.creator_id !== user.id : order.claimed_by_id !== user.id)) fail('你不是当前指定确认人', 403);
  if (candidate.contentHash !== contentHash) fail('确认内容版本不一致，请重新加载', 409);
  if (approver.decision === decision && candidate.status !== 'superseded') return candidate;
  if (candidate.status !== 'confirming' || approver.decision !== 'pending') fail('此确认请求已处理或失效，请查看最新需求', 409);
  approver.decision = decision; approver.comment = comment; approver.actedAt = now();
  if (decision === 'rejected') candidate.status = 'rejected';
  if (candidate.approvers.every(item => item.decision === 'confirmed')) {
    candidate.status = 'confirmed';
    const [versions]: any = await connection.query('SELECT COALESCE(MAX(version),0) AS version FROM requirement_versions WHERE order_id=?', [order.id]);
    const requirement: RequirementVersion = { id: randomUUID(), orderId: order.id, requirementNo: `REQ-${order.order_no}`,
      version: Number(versions[0].version) + 1, candidateId: candidate.id, content: candidate.content,
      contentHash: candidate.contentHash, approvers: candidate.approvers, createdAt: now() };
    candidate.requirementVersionId = requirement.id;
    await connection.query('INSERT INTO requirement_versions (id,order_id,version,candidate_id,payload_json) VALUES (?,?,?,?,?)', [requirement.id, order.id, requirement.version, candidate.id, JSON.stringify(requirement)]);
    await appendWorkflowMessage(connection, order, user, { kind: 'requirement', entityId: requirement.id,
      title: `${requirement.requirementNo} · v${requirement.version}`, description: '确认已完成，正式需求版本已保存，设计师可查看并绑定执行。' });
  } else {
    await appendWorkflowMessage(connection, order, user, { kind: 'confirmation', entityId: candidate.id,
      title: decision === 'rejected' ? '需求已退回' : `${approver.name}已确认需求`, description: comment || '等待其他指定参与者确认。' });
  }
  await connection.query('UPDATE collaboration_candidates SET payload_json=? WHERE id=?', [JSON.stringify(candidate), id]);
  return candidate;
}

export async function startRequirementExecution(connection: PoolConnection, order: Order, user: AuthUserPayload, requirementId: string) {
  if (order.claimed_by_id !== user.id || user.role !== 'designer') fail('只有当前接单设计师可以绑定执行需求', 403);
  const [versions]: any = await connection.query('SELECT id FROM requirement_versions WHERE order_id=? ORDER BY version DESC LIMIT 1', [order.id]);
  if (versions[0]?.id !== requirementId) fail('只能开始执行最新正式需求版本', 409);
  const [existing]: any = await connection.query('SELECT task_id,started_at FROM collaboration_executions WHERE requirement_version_id=?', [requirementId]);
  if (existing[0]) return { requirementVersionId: requirementId, taskId: existing[0].task_id, startedAt: existing[0].started_at };
  const [tasks]: any = await connection.query("SELECT id,status FROM review_tasks WHERE order_id=? AND designer_id=? AND status NOT IN ('returned','archived','approved') ORDER BY created_at DESC LIMIT 1", [order.id, user.id]);
  if (!tasks[0]) fail('没有可关联的设计任务，请先完成接单流程', 409);
  if (!['draft', 'needs_revision'].includes(tasks[0].status)) fail('任务正在审核中，请先完成当前审核再切换需求', 409);
  const [pending]: any = await connection.query("SELECT id FROM collaboration_candidates WHERE order_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.status'))='confirming' LIMIT 1", [order.id]);
  if (pending[0]) fail('存在待确认需求变更，请先处理后再开始执行', 409);
  const result = { requirementVersionId: requirementId, taskId: tasks[0].id as string, startedAt: now() };
  await connection.query('INSERT INTO collaboration_executions (order_id,requirement_version_id,task_id,started_at) VALUES (?,?,?,?)', [order.id, requirementId, result.taskId, result.startedAt]);
  await appendWorkflowMessage(connection, order, user, { kind: 'execution', entityId: requirementId, title: '设计师已开始执行需求', description: '正式需求已绑定现有设计任务，成果通过原审核流程提交。' });
  return result;
}

/** Legacy orders remain usable; orders using structured forms must submit against an explicit confirmed baseline. */
export async function submissionRequirementVersion(orderId: string): Promise<string | undefined> {
  if (!dbPool) return undefined;
  const [forms]: any = await dbPool.query('SELECT id FROM collaboration_forms WHERE order_id=? LIMIT 1', [orderId]);
  if (!forms[0]) return undefined;
  const [versions]: any = await dbPool.query('SELECT id FROM requirement_versions WHERE order_id=? ORDER BY version DESC LIMIT 1', [orderId]);
  if (!versions[0]) fail('请先完成需求确认并生成正式需求单，再提交设计稿', 409);
  const [pending]: any = await dbPool.query("SELECT id FROM collaboration_candidates WHERE order_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.status'))='confirming' LIMIT 1", [orderId]);
  if (pending[0]) fail('需求变更仍待确认，请先处理后再提交设计稿', 409);
  const [executions]: any = await dbPool.query('SELECT requirement_version_id FROM collaboration_executions WHERE order_id=? ORDER BY started_at DESC LIMIT 1', [orderId]);
  if (executions[0]?.requirement_version_id !== versions[0].id) fail('请先在需求协作面板承接最新正式需求版本', 409);
  return versions[0].id as string;
}

export async function getDesignWorkflow(orderId: string, requirementId: string, user: AuthUserPayload) {
  const workspace = await getCollaborationWorkspace(orderId, user);
  if (!workspace.requirements.some(item => item.id === requirementId)) fail('正式需求不存在', 404);
  const [rows]: any = await pool().query('SELECT revision,payload_json FROM design_workflow_plans WHERE requirement_version_id=? ORDER BY revision DESC LIMIT 1', [requirementId]);
  return rows[0] ? { revision: Number(rows[0].revision), plan: json<DesignWorkflowPlan>(rows[0].payload_json) } : { revision: 0, plan: null };
}
export async function saveDesignWorkflow(connection: PoolConnection, order: Order, user: AuthUserPayload, requirementId: string, revision: number, plan: DesignWorkflowPlan) {
  if (user.id !== order.claimed_by_id && !['admin', 'customer_service'].includes(user.role)) fail('只有执行设计师或协作管理人员可以编排设计工作流', 403);
  const [versions]: any = await connection.query('SELECT id FROM requirement_versions WHERE order_id=? ORDER BY version DESC LIMIT 1', [order.id]);
  if (versions[0]?.id !== requirementId || plan.requirementVersionId !== requirementId) fail('工作流必须绑定当前正式需求版本', 409);
  const error = workflowPlanError(plan); if (error) fail(error);
  const [rows]: any = await connection.query('SELECT COALESCE(MAX(revision),0) AS revision FROM design_workflow_plans WHERE requirement_version_id=?', [requirementId]);
  if (Number(rows[0].revision) !== revision) fail('画布已被其他操作者更新，请重新加载', 409);
  await connection.query('INSERT INTO design_workflow_plans (requirement_version_id,revision,payload_json,created_by,created_at) VALUES (?,?,?,?,?)', [requirementId, revision + 1, JSON.stringify(plan), user.id, now()]);
  return { revision: revision + 1, plan };
}
