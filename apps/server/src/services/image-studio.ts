import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolConnection } from 'mysql2/promise';
import { dbPool } from '../config/database.js';
import { getObjectFromOss, getSignedOssUrl, putPrivateBufferAtOssKey } from '../config/oss-client.js';
import { findMediaAsset } from '../config/persistence.js';
import { protectedAssets } from '../utils/media-protection.js';
import { isOssConfigured } from '../config/oss-client.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { getImageStudioQueue, IMAGE_STUDIO_QUEUES, type ImageStudioQueueName } from './image-studio-queue.js';
import { CARD_PREFIX, getChatOrder, getConversationAssignment, listChatConversations, parseCard, requireChatDatabase } from './chat.js';
import { getCollaborationFile, getCollaborationWorkspace } from './collaboration.js';
import { parseWorkflowMessage, WORKFLOW_MESSAGE_PREFIX } from '@design-review/shared';

const json = (value: unknown) => JSON.stringify(value ?? null);
const parse = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const now = () => new Date();
async function audit(queryable: Pick<PoolConnection, 'query'>, actorId: string, action: string, entityId: string | null, projectId: string | null, details: unknown) {
  await queryable.query(`INSERT INTO image_studio_audit_logs (id,actor_id,project_id,action,entity_id,details_json,created_at)
    VALUES (?,?,?,?,?,?,?)`, [randomUUID(), actorId, projectId, action, entityId, json(details), now()]);
}

function pool() {
  if (!dbPool) throw Object.assign(new Error('生图工作台需要可用的 MySQL 数据库'), { status: 503, code: 'IMAGE_STUDIO_DATABASE_UNAVAILABLE' });
  return dbPool;
}

function fail(message: string, status = 400, code = 'IMAGE_STUDIO_REQUEST_INVALID'): never {
  throw Object.assign(new Error(message), { status, code });
}

export type ImageStudioJobInput = {
  idempotencyKey: string;
  modelProfileId: string;
  generations: Array<{ slotKey: string; shotId?: string; prompt: string; referenceAssetIds: string[]; parameters: Record<string, unknown> }>;
};

export type ImageStudioTextInput = {
  idempotencyKey: string;
  modelProfileId: string;
  operation: 'asset_annotate' | 'product_analyze' | 'chat_intake_extract' | 'plan_agent' | 'creative_candidates' | 'storyboard' | 'copy_generate' | 'prompt_generate';
  context: Record<string, unknown>;
  referenceAssetIds: string[];
  sourceType?: 'screenshots' | 'collaboration' | 'invite';
  sourceConversationId?: string;
  sourceTitle?: string;
  sourceData?: Record<string, unknown>;
};

export type ImageStudioChatBrief = {
  summary: string; productName: string; productLinks: string[]; platform: string; deadline: string;
  deliverables: string[]; customerGoals: string[]; confirmedRequirements: string[]; sellingPointClues: string[];
  customerConcerns: string[]; visualPreferences: string[]; mustKeep: string[]; avoid: string[];
  factsToConfirm: string[]; followUpQuestions: string[];
};

function redactChatText(value: unknown, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim()
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[邮箱已隐藏]')
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]')
    .replace(/(微信号|微信 ID|手机号|联系电话|收货地址|联系人|姓名)\s*[:：]\s*[^\s，,；;。]{1,80}/gi, '$1：[隐私信息已隐藏]')
    .slice(0, maxLength);
}

function normalizeChatBrief(value: unknown): ImageStudioChatBrief {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const list = (key: keyof ImageStudioChatBrief, maxItems = 30, maxLength = 300) => {
    const raw = input[key];
    const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
    return [...new Set(values.map((item) => redactChatText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
  };
  const productLinks = list('productLinks', 20, 2048)
    .map((link) => link.replace(/[。，,；;)>\]}]+$/u, ''))
    .filter((link) => /^(https?:\/\/|www\.|m\.tb\.cn\/|item\.taobao\.com\/|detail\.tmall\.com\/)/i.test(link))
    .map((link) => /^https?:\/\//i.test(link) ? link : `https://${link}`);
  return {
    summary: redactChatText(input.summary, 1200), productName: redactChatText(input.productName, 160),
    productLinks,
    platform: redactChatText(input.platform, 120), deadline: redactChatText(input.deadline, 120),
    deliverables: list('deliverables'), customerGoals: list('customerGoals'), confirmedRequirements: list('confirmedRequirements'),
    sellingPointClues: list('sellingPointClues'), customerConcerns: list('customerConcerns'), visualPreferences: list('visualPreferences'),
    mustKeep: list('mustKeep'), avoid: list('avoid'), factsToConfirm: list('factsToConfirm'), followUpQuestions: list('followUpQuestions'),
  };
}

function chatIntakeDto(row: any) {
  const sourceData = parse<Record<string, any> | null>(row.source_data_json, null);
  return { id: String(row.id), projectId: String(row.project_id), sourceAssetIds: parse<string[]>(row.source_asset_ids, []),
    sourceType: String(row.source_type || 'screenshots'), sourceConversationId: row.source_conversation_id ? String(row.source_conversation_id) : null,
    sourceTitle: sourceData?.conversation?.title || null, sourceMessageCount: Number(sourceData?.messageCount || 0),
    sourceFormCount: Number(sourceData?.dossier?.submittedForms?.length || 0),
    sourceRequirementCount: Number(sourceData?.dossier?.confirmedRequirements?.length || 0),
    sourceImageCount: Number(sourceData?.dossier?.imageAttachments?.length || 0),
    sourceSkippedAttachmentCount: Number(sourceData?.dossier?.skippedAttachmentCount || 0),
    brief: row.brief_json ? normalizeChatBrief(parse(row.brief_json, {})) : null, status: String(row.status), version: Number(row.version),
    error: row.error_code ? { code: String(row.error_code), message: String(row.error_message || '') } : null,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null };
}

function flattenAnswer(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenAnswer).filter(Boolean).join('；');
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flattenAnswer).filter(Boolean).join('；');
  return '';
}

function safeFormFields(fields: any[], answers: Record<string, unknown>): Array<{ label: string; value: string }> {
  return fields.flatMap((field: any) => {
    const label = redactChatText(String(field?.label || ''), 100);
    const rawValue = answers?.[String(field?.key || '')];
    const serialized = flattenAnswer(rawValue);
    const isStoredAttachment = ['image', 'file'].includes(String(field?.kind)) && /\/api\/upload\/(assets|previews)\/[a-zA-Z0-9_-]+/.test(serialized);
    const value = isStoredAttachment ? '协作档案中包含附件；图片附件会导入工作台，其他格式仍保留在原协作档案。' : redactChatText(serialized, 800);
    if (!label || !value || /(姓名|电话|手机|微信|地址|邮箱|联系人|身份证|账号)/i.test(label)) return [];
    if (field.kind === 'repeat' && Array.isArray(answers?.[field.key])) {
      return (answers[field.key] as any[]).slice(0, 20).flatMap((row) => safeFormFields(field.children || [], row || {}));
    }
    return [{ label, value }];
  }).slice(0, 100);
}

function safeRequirementContent(content: any) {
  return {
    title: redactChatText(content?.title, 160), category: redactChatText(content?.category, 100),
    platform: redactChatText(content?.platform, 100), deadline: redactChatText(content?.deadline, 100),
    requiresPsd: Boolean(content?.requiresPsd),
    originalRequirements: redactChatText(content?.originalRequirements, 3000),
    sources: (Array.isArray(content?.sources) ? content.sources : []).slice(0, 30).map((source: any) => ({
      title: redactChatText(source?.title, 120), fields: safeFormFields(source?.fields || [], source?.answers || {}),
    })),
  };
}

function collaborationMessageText(body: string) {
  if (body.startsWith(WORKFLOW_MESSAGE_PREFIX)) {
    const card = parseWorkflowMessage(body);
    return card ? `${({ form: '协作表单', confirmation: '需求确认', requirement: '正式需求', execution: '执行状态' } as Record<string, string>)[card.kind]}：${card.title}。${card.description}` : '';
  }
  if (body.startsWith(CARD_PREFIX)) {
    try {
      const card = parseCard(body) as any;
      if (!card) return '';
      if (card.kind === 'work_card') return `工作档案：${card.title}。${(card.fields || []).map((field: any) => `${field.label}：${field.value}`).join('；')}`;
      if (card.kind === 'choice') return `客户选择确认：${card.title}。${card.prompt}。选项：${(card.options || []).map((item: any) => `${item.label}：${item.detail}`).join('；')}`;
      if (card.kind === 'choice_answer') return `客户选择：${card.optionLabel}${card.note ? `；补充：${card.note}` : ''}`;
      if (card.kind === 'proposal') return `方案讨论：${card.title}。方案 A：${card.optionA}，${card.detailA}。方案 B：${card.optionB}，${card.detailB}`;
      if (card.kind === 'decision') return `方案确认：选择 ${card.option}${card.note ? `；说明：${card.note}` : ''}`;
      if (card.kind === 'requirement_review') return `需求确认反馈：${card.decision === 'confirmed' ? '确认' : '需要补充'}${card.note ? `；说明：${card.note}` : ''}`;
      if (card.kind === 'snapshot_ack') return `需求快照反馈：${card.decision === 'confirmed' ? '确认' : '需要修改'}${card.note ? `；说明：${card.note}` : ''}`;
      if (card.kind === 'form_answers') return `协作表单补充：${(card.answers || []).map((item: any) => item.value).join('；')}`;
      return '';
    } catch { return ''; }
  }
  return redactChatText(body, 1000);
}

type CollaborationAttachmentReference = { mediaAssetId: string; label: string; roleHint: 'product' | 'competitor' | 'other' };
function collectCollaborationAttachmentReferences(workspace: any): CollaborationAttachmentReference[] {
  const references = new Map<string, CollaborationAttachmentReference>();
  const addFromFields = (fields: any[], answers: Record<string, unknown>, prefix: string) => {
    for (const field of fields || []) {
      if (field.kind === 'repeat' && Array.isArray(answers?.[field.key])) {
        for (const row of (answers[field.key] as Record<string, unknown>[]).slice(0, 20)) addFromFields(field.children || [], row || {}, prefix);
        continue;
      }
      if (!['image', 'file'].includes(String(field.kind))) continue;
      const label = redactChatText(`${prefix} ${String(field.label || '')}`.trim(), 160);
      const roleHint: CollaborationAttachmentReference['roleHint'] = /(竞品|对标|参考|排版|版式)/i.test(label) ? 'competitor'
        : /(商品|产品|主图|实拍|款式|型号|sku|白底|包装)/i.test(label) ? 'product' : 'other';
      const values = Array.isArray(answers?.[field.key]) ? answers[field.key] as unknown[] : [answers?.[field.key]];
      for (const value of values) {
        const match = typeof value === 'string' ? value.match(/^\/api\/upload\/(?:assets|previews)\/(asset_[a-f0-9]{32})$/i) : null;
        if (!match) continue;
        const existing = references.get(match[1]);
        if (!existing) references.set(match[1], { mediaAssetId: match[1], label, roleHint });
        else if (existing.roleHint !== roleHint) existing.roleHint = 'other';
      }
    }
  };
  for (const form of (workspace.forms || []).filter((item: any) => item.status === 'submitted').slice(-12)) {
    addFromFields(form.template?.fields || [], form.answers || {}, String(form.template?.name || '协作表单'));
  }
  for (const version of (workspace.requirements || []).slice(0, 12)) {
    for (const source of version.content?.sources || []) addFromFields(source.fields || [], source.answers || {}, String(source.title || '正式需求'));
  }
  for (const candidate of (workspace.candidates || []).filter((item: any) => item.status === 'confirming').slice(0, 8)) {
    for (const source of candidate.content?.sources || []) addFromFields(source.fields || [], source.answers || {}, String(source.title || '待确认需求'));
  }
  return [...references.values()].slice(0, 30);
}

function collectInviteAttachmentReferences(messages: any[]): CollaborationAttachmentReference[] {
  const references = new Map<string, CollaborationAttachmentReference>();
  for (const message of messages) {
    const body = String(message.body || '');
    let card: any = null;
    if (body.startsWith(CARD_PREFIX)) { try { card = parseCard(body) as any; } catch { /* Keep plain-message attachment scanning resilient. */ } }
    const cardText = card?.kind === 'work_card'
      ? `${card.title} ${(card.fields || []).map((field: any) => field.label).join(' ')}`
      : card?.kind === 'choice' ? `${card.title} ${card.prompt}` : '';
    const label = redactChatText(cardText || '邀请会话图片', 160);
    const roleHint: CollaborationAttachmentReference['roleHint'] = /(竞品|对标|参考|排版|版式)/i.test(label) ? 'competitor'
      : /(商品|产品|主图|实拍|款式|型号|sku|白底|包装)/i.test(label) ? 'product' : 'other';
    for (const match of body.matchAll(/\/api\/upload\/(?:assets|previews)\/(asset_[a-f0-9]{32})/gi)) {
      const mediaAssetId = match[1];
      const existing = references.get(mediaAssetId);
      if (!existing) references.set(mediaAssetId, { mediaAssetId, label, roleHint });
      else if (existing.roleHint !== roleHint) existing.roleHint = 'other';
    }
  }
  return [...references.values()].slice(0, 30);
}

async function getInviteSessionAccess(sessionId: string, user: AuthUserPayload) {
  if (!['customer_service', 'admin'].includes(user.role)) fail('只有客服可以整理邀请会话', 403, 'IMAGE_STUDIO_INVITE_ACCESS_DENIED');
  const [rows]: any = await requireChatDatabase().query(`SELECT s.*,a.assigned_service_id,
      creator.role AS creator_role,guest.role AS guest_role
    FROM intake_sessions s LEFT JOIN service_conversation_assignments a
      ON a.conversation_type='intake' AND a.conversation_id=s.id
    LEFT JOIN users creator ON creator.id=s.creator_id LEFT JOIN users guest ON guest.id=s.guest_id
    WHERE s.id=? LIMIT 1`, [sessionId]);
  const session = rows[0];
  if (!session) fail('邀请会话不存在', 404, 'IMAGE_STUDIO_INVITE_NOT_FOUND');
  if (user.role !== 'admin' && session.assigned_service_id && String(session.assigned_service_id) !== user.id) {
    fail('此邀请会话已转交给其他客服', 403, 'IMAGE_STUDIO_INVITE_ASSIGNED_ELSEWHERE');
  }
  return session;
}

async function getInviteSessionFile(sessionId: string, assetId: string, user: AuthUserPayload) {
  const session = await getInviteSessionAccess(sessionId, user);
  const [messages]: any = await requireChatDatabase().query(
    'SELECT body FROM intake_messages WHERE session_id=? AND body LIKE ? LIMIT 20', [sessionId, `%${assetId}%`],
  );
  if (!messages.some((row: any) => new RegExp(`/api/upload/(?:assets|previews)/${assetId}(?:\\b|$)`, 'i').test(String(row.body || '')))) {
    fail('图片未关联到此邀请会话', 404, 'IMAGE_STUDIO_INVITE_FILE_NOT_LINKED');
  }
  const asset = protectedAssets.get(assetId) || await findMediaAsset(assetId);
  const participantIds = [String(session.creator_id), session.guest_id ? String(session.guest_id) : null,
    session.assigned_service_id ? String(session.assigned_service_id) : null].filter(Boolean);
  if (!asset || asset.kind !== 'image' || !participantIds.includes(String(asset.ownerId))) fail('无权读取邀请会话中的图片', 403, 'IMAGE_STUDIO_INVITE_FILE_ACCESS_DENIED');
  return asset;
}

function safeInviteField(labelValue: unknown, valueValue: unknown) {
  const label = redactChatText(String(labelValue || ''), 100);
  if (!label || /(姓名|电话|手机|微信|地址|邮箱|联系人|身份证|账号)/i.test(label)) return null;
  const value = redactChatText(String(valueValue || ''), 800).replace(/\/api\/upload\/(?:assets|previews)\/asset_[a-f0-9]{32}/gi, '[图片附件]');
  return value ? { label, value } : null;
}

async function createInviteConversationSource(sessionId: string, user: AuthUserPayload) {
  const session = await getInviteSessionAccess(sessionId, user);
  const [rows]: any = await requireChatDatabase().query(
    'SELECT id,seq,sender_id,body,created_at FROM intake_messages WHERE session_id=? ORDER BY seq DESC LIMIT 150', [sessionId],
  );
  const messages = [...rows].reverse();
  const parsedCards = new Map<string, any>();
  for (const row of messages) {
    try { const card = parseCard(String(row.body || '')); if (card) parsedCards.set(String(row.id), card); } catch { /* Ignore malformed historical cards. */ }
  }
  const customerIds = new Set<string>();
  if (session.creator_role === 'advertiser') customerIds.add(String(session.creator_id));
  if (session.guest_role === 'advertiser' && session.guest_id) customerIds.add(String(session.guest_id));
  const submittedForms: any[] = [];
  const workCards: any[] = [];
  const pendingCandidates: any[] = [];
  const confirmedRequirements: any[] = [];
  const transcript: Array<{ seq: number; senderRole: string; text: string; createdAt: string }> = [];
  for (const row of messages) {
    const senderRole = customerIds.has(String(row.sender_id)) ? '客户' : '客服';
    const body = String(row.body || '').trim();
    const card = parsedCards.get(String(row.id));
    const createdAt = new Date(row.created_at).toISOString();
    if (!card) {
      const text = redactChatText(body, 2000).replace(/\/api\/upload\/(?:assets|previews)\/asset_[a-f0-9]{32}/gi, '[图片附件]');
      if (text) transcript.push({ seq: Number(row.seq), senderRole, text, createdAt });
      continue;
    }
    if (card.kind === 'work_card') {
      const fields = (card.fields || []).map((field: any) => safeInviteField(field.label, field.value)).filter(Boolean).slice(0, 24);
      if (card.templateId !== 'intake_checklist') workCards.push({ title: redactChatText(card.title, 120), fields, sentAt: createdAt });
      transcript.push({ seq: Number(row.seq), senderRole, text: `${senderRole}发送了「${redactChatText(card.title, 120)}」${fields.length ? `：${fields.map((field: any) => `${field.label}：${field.value}`).join('；')}` : ''}`, createdAt });
    } else if (card.kind === 'form_answers') {
      const form = parsedCards.get(String(card.formMessageId));
      const fields = form?.kind === 'work_card' ? card.answers.map((answer: any) => safeInviteField(form.fields?.[answer.fieldIndex]?.label, answer.value)).filter(Boolean) : [];
      if (fields.length) {
        const title = redactChatText(String(form?.title || '需求清单'), 120);
        submittedForms.push({ title, submittedAt: createdAt, fields });
        transcript.push({ seq: Number(row.seq), senderRole, text: `客户填写了「${title}」：${fields.map((field: any) => `${field.label}：${field.value}`).join('；')}`, createdAt });
      }
    } else if (card.kind === 'choice') {
      const content = { title: redactChatText(card.title, 120), question: redactChatText(card.prompt, 500), options: (card.options || []).map((option: any) => ({ label: redactChatText(option.label, 120), detail: redactChatText(option.detail, 300) })) };
      pendingCandidates.push({ status: '待客户选择', content });
      transcript.push({ seq: Number(row.seq), senderRole, text: `选择建议「${content.title}」：${content.question}；${content.options.map((option: any) => `${option.label}：${option.detail}`).join('；')}`, createdAt });
    } else if (card.kind === 'choice_answer') {
      const choice = parsedCards.get(String(card.choiceMessageId));
      const selected = choice?.kind === 'choice' ? choice.options?.find((option: any) => option.id === card.optionId) : null;
      const content = `客户选择「${redactChatText(String(selected?.label || card.optionLabel), 120)}」${card.note ? `；补充：${redactChatText(card.note, 500)}` : ''}`;
      if (customerIds.has(String(row.sender_id))) confirmedRequirements.push({ confirmedAt: createdAt, content: { title: '客户选择', originalRequirements: content } });
      transcript.push({ seq: Number(row.seq), senderRole, text: content, createdAt });
    } else if (card.kind === 'proposal') {
      const content = { title: redactChatText(card.title, 120), options: [
        { label: redactChatText(card.optionA, 100), detail: redactChatText(card.detailA, 500) },
        { label: redactChatText(card.optionB, 100), detail: redactChatText(card.detailB, 500) },
      ] };
      pendingCandidates.push({ status: '待客户确认', content });
      transcript.push({ seq: Number(row.seq), senderRole, text: `方案建议「${content.title}」：${content.options.map((option: any) => `${option.label}：${option.detail}`).join('；')}`, createdAt });
    } else if (card.kind === 'decision') {
      const proposal = parsedCards.get(String(card.proposalMessageId));
      const option = proposal?.kind === 'proposal' ? (card.option === 'A' ? proposal.optionA : proposal.optionB) : `方案 ${card.option}`;
      const content = `客户选择方案「${redactChatText(option, 120)}」${card.note ? `；说明：${redactChatText(card.note, 500)}` : ''}`;
      if (customerIds.has(String(row.sender_id))) confirmedRequirements.push({ confirmedAt: createdAt, content: { title: '客户确认的方案', originalRequirements: content } });
      transcript.push({ seq: Number(row.seq), senderRole, text: content, createdAt });
    }
  }
  const normalizedMessages = transcript.slice(-120);
  const snapshot = {
    conversation: { title: redactChatText(String(session.title || '邀请会话'), 160), type: 'invite', status: String(session.status || '') },
    messageCount: normalizedMessages.length,
    messages: normalizedMessages,
    dossier: { submittedForms: submittedForms.slice(-12), workCards: workCards.slice(-20), pendingCandidates: pendingCandidates.slice(0, 20),
      confirmedRequirements: confirmedRequirements.slice(-20), imageAttachments: [] as any[], skippedAttachmentCount: 0 },
  };
  return { session, messages, snapshot };
}

async function importCollaborationImages(projectId: string, user: AuthUserPayload, conversationId: string, references: CollaborationAttachmentReference[], conversationType: 'order' | 'invite' = 'order') {
  if (!references.length) return { assets: [] as Array<{ id: string; filename: string; role: string; label: string }>, skippedCount: 0 };
  if (!isOssConfigured) fail('导入协作图片需要配置私有 OSS 存储', 503, 'IMAGE_STUDIO_OSS_UNAVAILABLE');
  const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const imported: Array<{ id: string; filename: string; role: string; label: string }> = [];
  let skippedCount = Math.max(0, references.length - 12); let totalBytes = 0;
  for (const reference of references.slice(0, 12)) {
    try {
      const source = conversationType === 'invite'
        ? await getInviteSessionFile(conversationId, reference.mediaAssetId, user)
        : await getCollaborationFile(conversationId, reference.mediaAssetId, user);
      const mimeType = String(source.mimetype || '').toLowerCase();
      const extension = mimeExtensions[mimeType];
      if (!extension || source.size <= 0 || source.size > 25 * 1024 * 1024 || totalBytes + source.size > 60 * 1024 * 1024) { skippedCount += 1; continue; }
      const [existingRows]: any = await pool().query(`SELECT id,filename,role FROM image_studio_assets
        WHERE project_id=? AND owner_id=? AND media_asset_id=? AND deleted_at IS NULL LIMIT 1`, [projectId, user.id, reference.mediaAssetId]);
      if (existingRows[0]) {
        imported.push({ id: String(existingRows[0].id), filename: String(existingRows[0].filename), role: String(existingRows[0].role), label: reference.label });
        continue;
      }
      let buffer: Buffer;
      if (source.ossOriginalKey) buffer = Buffer.from((await getObjectFromOss(source.ossOriginalKey)).content as Buffer);
      else if (source.localOriginalPath) buffer = await readFile(source.localOriginalPath);
      else { skippedCount += 1; continue; }
      if (buffer.length !== source.size || buffer.length > 25 * 1024 * 1024 || totalBytes + buffer.length > 60 * 1024 * 1024) { skippedCount += 1; continue; }
      totalBytes += buffer.length;
      const assetId = randomUUID();
      const objectKey = `private/image-studio/collaboration/${projectId}/${assetId}.${extension}`;
      await putPrivateBufferAtOssKey(objectKey, buffer, mimeType);
      const timestamp = now();
      await pool().query(`INSERT INTO image_studio_assets
        (id,project_id,owner_id,media_asset_id,kind,role,object_key,filename,mime_type,size_bytes,source,created_at)
        VALUES (?,?,?,?,'image',?,?,?,?,?,'collaboration',?)`, [assetId, projectId, user.id, reference.mediaAssetId,
        reference.roleHint, objectKey, source.filename, mimeType, buffer.length, timestamp]);
      imported.push({ id: assetId, filename: String(source.filename), role: reference.roleHint, label: reference.label });
    } catch (error: any) {
      if (error?.code === 'IMAGE_STUDIO_DATABASE_UNAVAILABLE' || error?.code === 'IMAGE_STUDIO_OSS_UNAVAILABLE') throw error;
      skippedCount += 1;
    }
  }
  return { assets: imported, skippedCount };
}

export async function listImageStudioCollaborationConversations(projectId: string, user: AuthUserPayload) {
  await getImageStudioProject(projectId, user);
  const [orders, inviteRowsResult] = await Promise.all([
    listChatConversations(user, 100, 0),
    requireChatDatabase().query(`SELECT s.id,s.title,s.status,s.creator_name,creator.role AS creator_role,s.guest_name,guest.role AS guest_role,
        s.updated_at,a.assigned_service_id,a.assigned_service_name,m.created_at AS last_message_at
      FROM intake_sessions s
      LEFT JOIN users creator ON creator.id=s.creator_id
      LEFT JOIN users guest ON guest.id=s.guest_id
      LEFT JOIN service_conversation_assignments a ON a.conversation_type='intake' AND a.conversation_id=s.id
      LEFT JOIN intake_messages m ON m.session_id=s.id AND m.seq=s.last_seq
      WHERE a.assigned_service_id IS NULL OR a.assigned_service_id=?
      ORDER BY COALESCE(m.created_at,s.updated_at) DESC LIMIT 100`, [user.id]),
  ]);
  const [inviteRows]: any = inviteRowsResult;
  const orderItems = orders.filter((item: any) => !item.assignedServiceId || item.assignedServiceId === user.id).map((item: any) => ({
    id: String(item.orderId), conversationType: 'order' as const,
    title: redactChatText(String(item.title || '订单协作'), 160), orderNo: redactChatText(String(item.orderNo || ''), 80),
    status: String(item.status || ''), counterpartName: redactChatText(String(item.counterpartName || ''), 120),
    lastMessageAt: item.lastMessageAt ? new Date(item.lastMessageAt).toISOString() : null,
    assignedServiceName: item.assignedServiceName ? redactChatText(String(item.assignedServiceName), 100) : null,
  }));
  const inviteItems = inviteRows.map((item: any) => ({
    id: String(item.id), conversationType: 'invite' as const,
    title: redactChatText(String(item.title || '邀请会话'), 160), orderNo: '', status: String(item.status || ''),
    counterpartName: redactChatText(String(item.guest_name || (item.creator_role === 'advertiser' ? item.creator_name : '客户尚未加入')), 120),
    lastMessageAt: item.last_message_at || item.updated_at ? new Date(item.last_message_at || item.updated_at).toISOString() : null,
    assignedServiceName: item.assigned_service_name ? redactChatText(String(item.assigned_service_name), 100) : null,
  }));
  return [...orderItems, ...inviteItems].sort((a, b) => Date.parse(b.lastMessageAt || '') - Date.parse(a.lastMessageAt || '')).slice(0, 200);
}

export async function createImageStudioCollaborationChatIntakeJob(projectId: string, user: AuthUserPayload, input: {
  idempotencyKey: string; modelProfileId: string; conversationId: string; conversationType?: 'order' | 'invite'; operation?: 'chat_intake_extract' | 'plan_agent';
}) {
  const project = await getImageStudioProject(projectId, user);
  if (input.conversationType === 'invite') {
    const inviteSource = await createInviteConversationSource(input.conversationId, user);
    const attachmentReferences = collectInviteAttachmentReferences(inviteSource.messages);
    const importedImages = await importCollaborationImages(projectId, user, input.conversationId, attachmentReferences, 'invite');
    inviteSource.snapshot.dossier.imageAttachments = importedImages.assets;
    inviteSource.snapshot.dossier.skippedAttachmentCount = importedImages.skippedCount;
    await getInviteSessionAccess(input.conversationId, user);
    if (!inviteSource.snapshot.messages.length && !inviteSource.snapshot.dossier.submittedForms.length
      && !inviteSource.snapshot.dossier.workCards.length && !inviteSource.snapshot.dossier.pendingCandidates.length
      && !inviteSource.snapshot.dossier.confirmedRequirements.length && !importedImages.assets.length) {
      fail('这段邀请会话还没有可整理的沟通内容', 409, 'IMAGE_STUDIO_INVITE_SOURCE_EMPTY');
    }
    if (Buffer.byteLength(json(inviteSource.snapshot), 'utf8') > 240_000) fail('这段邀请会话内容较多，请先整理后再试', 413, 'IMAGE_STUDIO_INVITE_SOURCE_TOO_LARGE');
    return createImageStudioTextJob(projectId, user, {
      idempotencyKey: input.idempotencyKey, modelProfileId: input.modelProfileId, operation: input.operation || 'chat_intake_extract',
      context: { projectName: project.name, projectPlatform: project.platform || '', sourceType: 'invite', conversationTitle: inviteSource.snapshot.conversation.title },
      referenceAssetIds: importedImages.assets.map((asset) => asset.id).slice(0, 12), sourceType: 'invite', sourceConversationId: input.conversationId,
      sourceTitle: inviteSource.snapshot.conversation.title, sourceData: inviteSource.snapshot,
    });
  }
  const order = await getChatOrder(input.conversationId, user);
  const assignment = await getConversationAssignment('order', input.conversationId);
  if (assignment.assignedServiceId && assignment.assignedServiceId !== user.id) fail('此会话已转交给其他客服', 403, 'IMAGE_STUDIO_CONVERSATION_ASSIGNED_ELSEWHERE');
  const workspace = await getCollaborationWorkspace(input.conversationId, user);
  const [messageRows]: any = await pool().query(`SELECT m.id,m.seq,m.sender_id,m.body,m.created_at
    FROM chat_messages m WHERE m.order_id=? ORDER BY m.seq DESC LIMIT 150`, [input.conversationId]);
  const rows = [...messageRows].reverse();
  const recalled = new Set<string>();
  for (const row of rows) {
    if (!String(row.body).startsWith(CARD_PREFIX)) continue;
    try { const card = parseCard(String(row.body)) as any; if (card?.kind === 'recall') recalled.add(card.targetMessageId); } catch { /* Skip malformed cards when building the snapshot. */ }
  }
  const messages = rows.flatMap((row: any) => {
    if (recalled.has(String(row.id))) return [];
    const text = collaborationMessageText(String(row.body || ''));
    if (!text) return [];
    const senderId = String(row.sender_id);
    const senderRole = senderId === String((order as any).creator_id) ? '客户'
      : senderId === String((order as any).claimed_by_id || '') ? '设计师' : '客服/平台';
    return [{ seq: Number(row.seq), senderRole, text, createdAt: new Date(row.created_at).toISOString() }];
  }).slice(-120);
  const attachmentReferences = collectCollaborationAttachmentReferences(workspace);
  const importedImages = await importCollaborationImages(projectId, user, input.conversationId, attachmentReferences);
  const snapshot = {
    conversation: { title: redactChatText(String(order.title || ''), 160), category: redactChatText(String(order.category || ''), 100),
      platform: redactChatText(String(order.platform || ''), 100), status: String(order.status || '') },
    messageCount: messages.length,
    messages,
    dossier: {
      submittedForms: workspace.forms.filter((form) => form.status === 'submitted').slice(-12).map((form) => ({
        title: redactChatText(form.template?.name || '', 120), submittedAt: form.submittedAt,
        fields: safeFormFields(form.template?.fields || [], form.answers || {}),
      })),
      pendingCandidates: workspace.candidates.filter((candidate) => candidate.status === 'confirming').slice(0, 8).map((candidate) => ({
        status: '待双方确认', content: safeRequirementContent(candidate.content),
      })),
      confirmedRequirements: workspace.requirements.slice(0, 12).map((requirement) => ({
        version: Number(requirement.version),
        confirmedAt: requirement.createdAt, content: safeRequirementContent(requirement.content),
      })),
      imageAttachments: importedImages.assets,
      skippedAttachmentCount: importedImages.skippedCount,
    },
  };
  if (!snapshot.messages.length && !snapshot.dossier.submittedForms.length && !snapshot.dossier.pendingCandidates.length && !snapshot.dossier.confirmedRequirements.length) {
    fail('该协作会话还没有可用于整理需求的聊天或协作档案', 409, 'IMAGE_STUDIO_COLLABORATION_SOURCE_EMPTY');
  }
  if (Buffer.byteLength(json(snapshot), 'utf8') > 240_000) fail('协作会话档案过大，请先筛选或整理会话内容', 413, 'IMAGE_STUDIO_COLLABORATION_SOURCE_TOO_LARGE');
  return createImageStudioTextJob(projectId, user, {
    idempotencyKey: input.idempotencyKey, modelProfileId: input.modelProfileId, operation: input.operation || 'chat_intake_extract',
    context: { projectName: project.name, projectPlatform: project.platform || '', sourceType: 'collaboration', conversationTitle: snapshot.conversation.title },
    referenceAssetIds: importedImages.assets.map((asset) => asset.id).slice(0, 12), sourceType: 'collaboration', sourceConversationId: input.conversationId,
    sourceTitle: snapshot.conversation.title, sourceData: snapshot,
  });
}

export async function createImageStudioScreenshotPlanJob(projectId: string, user: AuthUserPayload, input: {
  idempotencyKey: string; modelProfileId: string; assetIds: string[];
}) {
  const project = await getImageStudioProject(projectId, user);
  if (!input.assetIds.length || input.assetIds.length > 12 || new Set(input.assetIds).size !== input.assetIds.length) {
    fail('请选择 1 至 12 张不重复的聊天截图', 400, 'IMAGE_STUDIO_PLAN_SCREENSHOT_INVALID');
  }
  return createImageStudioTextJob(projectId, user, {
    idempotencyKey: input.idempotencyKey, modelProfileId: input.modelProfileId, operation: 'plan_agent',
    context: { projectName: project.name, projectPlatform: project.platform || '', sourceType: 'screenshots' },
    referenceAssetIds: input.assetIds, sourceType: 'screenshots', sourceConversationId: 'uploaded-screenshots',
    sourceTitle: '微信聊天截图', sourceData: { conversation: { title: '微信聊天截图', platform: project.platform || '' },
      messages: [], dossier: { imageAttachments: [], screenshotAssetIds: input.assetIds } },
  });
}

export const CREATIVE_DIMENSIONS = [
  { key: 'selling', label: '卖点', required: true },
  { key: 'pain', label: '痛点', required: false },
  { key: 'main_direction', label: '主攻方向', required: false },
  { key: 'target_audience', label: '目标人群', required: false },
  { key: 'usage_scenario', label: '使用场景', required: false },
  { key: 'visual_style', label: '视觉风格', required: false },
] as const;
export type CreativeDimensionKey = typeof CREATIVE_DIMENSIONS[number]['key'];

function stringList(value: unknown, maxItems = 50, maxLength = 500): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
  return [...new Set(values.map((item) => String(item || '').trim().slice(0, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function candidateHash(value: string) { return createHash('sha256').update(value.trim().toLocaleLowerCase()).digest('hex'); }

function projectDto(row: any) {
  return { id: String(row.id), name: String(row.name), platform: row.platform || null, status: String(row.status),
    workflow: parse(row.workflow_json, {}), version: Number(row.version), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}

export async function createImageStudioProject(user: AuthUserPayload, input: { name: string; platform?: string | null; workflow?: Record<string, unknown> }) {
  const id = randomUUID(); const timestamp = now();
  await pool().query(`INSERT INTO image_studio_projects (id,owner_id,organization_id,name,platform,status,workflow_json,version,created_at,updated_at)
    VALUES (?,?,?,?,?,'active',?,1,?,?)`, [id, user.id, user.organizationId || null, input.name, input.platform || null, json(input.workflow || {}), timestamp, timestamp]);
  await audit(pool(), user.id, 'project.create', id, id, { name: input.name, platform: input.platform || null,
    workflowKeys: Object.keys(input.workflow || {}) });
  return { id, name: input.name, platform: input.platform || null, status: 'active', workflow: input.workflow || {}, version: 1, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
}

export async function listImageStudioProjects(user: AuthUserPayload, limit = 30, cursor?: string) {
  const [rows]: any = await pool().query(`SELECT * FROM image_studio_projects WHERE owner_id=? AND deleted_at IS NULL
    ${cursor ? 'AND updated_at < ?' : ''} ORDER BY updated_at DESC,id DESC LIMIT ?`, cursor ? [user.id, cursor, limit + 1] : [user.id, limit + 1]);
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(projectDto), nextCursor: hasMore ? new Date(rows[limit - 1].updated_at).toISOString() : null };
}

export async function getImageStudioProject(projectId: string, user: AuthUserPayload) {
  const [rows]: any = await pool().query('SELECT * FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1', [projectId, user.id]);
  if (!rows[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
  return projectDto(rows[0]);
}

export async function getImageStudioCreativeDirections(projectId: string, user: AuthUserPayload) {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query(`SELECT workflow_json FROM image_studio_projects
      WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE`, [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [rows]: any = await connection.query('SELECT dimension_key FROM image_studio_creative_directions WHERE project_id=? AND owner_id=?', [projectId, user.id]);
    const existing = new Set(rows.map((row: any) => String(row.dimension_key)));
    const workflow = parse<Record<string, any>>(projects[0].workflow_json, {});
    const analysis = workflow.productAnalysis || {};
    const legacyCustom: Partial<Record<CreativeDimensionKey, unknown>> = {
      selling: workflow.sellingPointsText,
      pain: workflow.painPointsText,
      main_direction: workflow.mainDirectionText || workflow.creativeDirection,
      target_audience: workflow.targetAudience,
      usage_scenario: workflow.usageScenariosText,
    };
    const legacyCandidates: Partial<Record<CreativeDimensionKey, unknown>> = {
      selling: analysis.sellingPoints,
      pain: analysis.painPoints,
      main_direction: analysis.mainDirection,
      target_audience: analysis.targetAudience,
      usage_scenario: analysis.usageScenarios,
      visual_style: workflow.visualStyle?.suggestions,
    };
    const timestamp = now();
    for (const dimension of CREATIVE_DIMENSIONS) {
      if (existing.has(dimension.key)) continue;
      const persisted = workflow.creativeDirections?.[dimension.key] || {};
      const selected = stringList(persisted.selectedValues);
      const custom = stringList(persisted.customValues ?? legacyCustom[dimension.key]);
      await connection.query(`INSERT INTO image_studio_creative_directions
        (id,project_id,owner_id,dimension_key,selected_json,custom_json,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,1,?,?)`, [randomUUID(), projectId, user.id, dimension.key, json(selected), json(custom), timestamp, timestamp]);
      for (const [candidateIndex, text] of stringList(legacyCandidates[dimension.key], 20).entries()) {
        await connection.query(`INSERT IGNORE INTO image_studio_creative_candidates
          (id,project_id,owner_id,dimension_key,candidate_text,candidate_hash,source_job_id,candidate_index,status,created_at)
          VALUES (?,?,?,?,?,?,?,?, 'pending',?)`, [randomUUID(), projectId, user.id, dimension.key, text, candidateHash(text), analysis.sourceJobId || null, candidateIndex, timestamp]);
      }
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }

  const [directions]: any = await pool().query(`SELECT dimension_key,selected_json,custom_json,version FROM image_studio_creative_directions
    WHERE project_id=? AND owner_id=?`, [projectId, user.id]);
  const [candidates]: any = await pool().query(`SELECT id,dimension_key,candidate_text,status,source_job_id,created_at
    FROM image_studio_creative_candidates WHERE project_id=? AND owner_id=? ORDER BY created_at DESC,candidate_index ASC,id DESC LIMIT 250`, [projectId, user.id]);
  const byKey = new Map(directions.map((row: any) => [String(row.dimension_key), row]));
  const candidateMap = new Map<string, any[]>();
  for (const row of candidates) {
    const key = String(row.dimension_key);
    const group = candidateMap.get(key) || [];
    group.push({ id: String(row.id), text: String(row.candidate_text), status: String(row.status), sourceJobId: row.source_job_id || null, createdAt: new Date(row.created_at).toISOString() });
    candidateMap.set(key, group);
  }
  return CREATIVE_DIMENSIONS.map((dimension) => {
    const row: any = byKey.get(dimension.key);
    return { ...dimension, selectedValues: parse<string[]>(row?.selected_json, []), customValues: parse<string[]>(row?.custom_json, []),
      version: Number(row?.version || 1), candidates: candidateMap.get(dimension.key) || [] };
  });
}

export async function updateImageStudioCreativeDirection(projectId: string, user: AuthUserPayload, key: CreativeDimensionKey,
  input: { selectedValues: string[]; customValues: string[]; version: number }) {
  const connection = await pool().getConnection();
  const timestamp = now();
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [rows]: any = await connection.query('SELECT version FROM image_studio_creative_directions WHERE project_id=? AND owner_id=? AND dimension_key=? FOR UPDATE', [projectId, user.id, key]);
    if (!rows[0]) fail('创作方向未初始化，请刷新页面', 409, 'IMAGE_STUDIO_DIRECTION_NOT_INITIALIZED');
    if (Number(rows[0].version) !== input.version) fail('创作方向已在其他页面更新，请刷新后再保存', 409, 'IMAGE_STUDIO_VERSION_CONFLICT');
    await connection.query(`UPDATE image_studio_creative_directions SET selected_json=?,custom_json=?,version=version+1,updated_at=?
      WHERE project_id=? AND owner_id=? AND dimension_key=?`, [json(stringList(input.selectedValues)), json(stringList(input.customValues)), timestamp, projectId, user.id, key]);
    await audit(connection, user.id, 'creative_direction.update', projectId, projectId, { dimension: key });
    const [updated]: any = await connection.query('SELECT selected_json,custom_json,version FROM image_studio_creative_directions WHERE project_id=? AND owner_id=? AND dimension_key=?', [projectId, user.id, key]);
    await connection.commit();
    return { key, selectedValues: parse<string[]>(updated[0].selected_json, []), customValues: parse<string[]>(updated[0].custom_json, []), version: Number(updated[0].version) };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function setImageStudioCreativeCandidate(projectId: string, candidateId: string, user: AuthUserPayload, status: 'accepted' | 'rejected') {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [candidates]: any = await connection.query(`SELECT id,dimension_key,candidate_text,status FROM image_studio_creative_candidates
      WHERE id=? AND project_id=? AND owner_id=? FOR UPDATE`, [candidateId, projectId, user.id]);
    const candidate = candidates[0];
    if (!candidate) fail('候选项不存在或无权访问', 404, 'IMAGE_STUDIO_CANDIDATE_NOT_FOUND');
    const previousStatus = String(candidate.status);
    if (previousStatus === status && status === 'rejected') { await connection.commit(); return { id: candidateId, status: previousStatus }; }
    if (status === 'accepted') {
      const [rows]: any = await connection.query(`SELECT selected_json FROM image_studio_creative_directions
        WHERE project_id=? AND owner_id=? AND dimension_key=? FOR UPDATE`, [projectId, user.id, candidate.dimension_key]);
      if (!rows[0]) fail('创作方向未初始化，请刷新页面', 409, 'IMAGE_STUDIO_DIRECTION_NOT_INITIALIZED');
      const selected = stringList(parse(rows[0].selected_json, []));
      if (previousStatus === 'accepted' && selected.includes(String(candidate.candidate_text))) {
        await connection.commit(); return { id: candidateId, status: previousStatus };
      }
      if (!selected.includes(String(candidate.candidate_text))) selected.push(String(candidate.candidate_text));
      await connection.query(`UPDATE image_studio_creative_directions SET selected_json=?,version=version+1,updated_at=?
        WHERE project_id=? AND owner_id=? AND dimension_key=?`, [json(selected), now(), projectId, user.id, candidate.dimension_key]);
    } else if (previousStatus === 'accepted') {
      const [sameAccepted]: any = await connection.query(`SELECT id FROM image_studio_creative_candidates
        WHERE project_id=? AND owner_id=? AND dimension_key=? AND candidate_text=? AND status='accepted' AND id<>? LIMIT 1`,
      [projectId, user.id, candidate.dimension_key, candidate.candidate_text, candidateId]);
      if (!sameAccepted[0]) {
        const [rows]: any = await connection.query(`SELECT selected_json FROM image_studio_creative_directions
          WHERE project_id=? AND owner_id=? AND dimension_key=? FOR UPDATE`, [projectId, user.id, candidate.dimension_key]);
        const selected = stringList(parse(rows[0]?.selected_json, [])).filter((value) => value !== String(candidate.candidate_text));
        await connection.query(`UPDATE image_studio_creative_directions SET selected_json=?,version=version+1,updated_at=?
          WHERE project_id=? AND owner_id=? AND dimension_key=?`, [json(selected), now(), projectId, user.id, candidate.dimension_key]);
      }
    }
    await connection.query('UPDATE image_studio_creative_candidates SET status=? WHERE id=?', [status, candidateId]);
    await audit(connection, user.id, `creative_candidate.${status}`, candidateId, projectId, { dimension: candidate.dimension_key });
    await connection.commit();
    return { id: candidateId, status };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function createCreativeCandidateJob(projectId: string, user: AuthUserPayload, dimension: CreativeDimensionKey,
  input: { modelProfileId: string; referenceAssetIds: string[]; idempotencyKey: string }) {
  const project = await getImageStudioProject(projectId, user);
  const directions = await getImageStudioCreativeDirections(projectId, user);
  const context = { dimension, dimensionLabel: CREATIVE_DIMENSIONS.find((item) => item.key === dimension)?.label,
    projectName: project.name, platform: project.platform, workflow: project.workflow,
    confirmedDirections: directions.map(({ key, label, selectedValues, customValues }) => ({ key, label, values: [...selectedValues, ...customValues] })) };
  return createImageStudioTextJob(projectId, user, { ...input, operation: 'creative_candidates', context });
}

export async function updateImageStudioProject(projectId: string, user: AuthUserPayload, input: { name?: string; platform?: string | null; workflow?: unknown; version: number }) {
  const connection = await pool().getConnection();
  try {
    const [result]: any = await connection.query(`UPDATE image_studio_projects SET
      name=COALESCE(?,name), platform=IF(?=1,?,platform), workflow_json=COALESCE(?,workflow_json),
      version=version+1,updated_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL AND version=?`,
    [input.name ?? null, input.platform === undefined ? 0 : 1, input.platform ?? null, input.workflow === undefined ? null : json(input.workflow), now(), projectId, user.id, input.version]);
    if (!result.affectedRows) {
      const [rows]: any = await connection.query('SELECT version FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL', [projectId, user.id]);
      if (!rows[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
      fail('项目已被其他页面更新，请刷新后再保存', 409, 'IMAGE_STUDIO_VERSION_CONFLICT');
    }
    const [rows]: any = await connection.query('SELECT * FROM image_studio_projects WHERE id=?', [projectId]);
    return projectDto(rows[0]);
  } finally { connection.release(); }
}

export async function deleteImageStudioProject(projectId: string, user: AuthUserPayload) {
  const connection = await pool().getConnection();
  const timestamp = now();
  let jobs: Array<{ id: string; status: string }> = [];
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query(`SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE`, [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [active]: any = await connection.query(`SELECT id,status FROM image_studio_jobs WHERE project_id=? AND owner_id=? AND status IN ('queued','running','cancelling') FOR UPDATE`, [projectId, user.id]);
    jobs = active.map((row: any) => ({ id: String(row.id), status: String(row.status) }));
    await connection.query(`UPDATE image_studio_projects SET status='deleted',deleted_at=?,updated_at=?,version=version+1 WHERE id=?`, [timestamp, timestamp, projectId]);
    await connection.query(`UPDATE image_studio_assets SET deleted_at=? WHERE project_id=? AND owner_id=? AND deleted_at IS NULL`, [timestamp, projectId, user.id]);
    for (const job of jobs) {
      const status = job.status === 'queued' ? 'cancelled' : 'cancelling';
      await connection.query('UPDATE image_studio_jobs SET status=?,updated_at=? WHERE id=?', [status, timestamp, job.id]);
      if (status === 'cancelled') await connection.query(`UPDATE image_studio_generations SET status='cancelled',completed_at=? WHERE job_id=? AND status='queued'`, [timestamp, job.id]);
      await connection.query(`UPDATE image_studio_outbox SET status='cancelled',locked_until=NULL WHERE job_id=? AND status='pending'`, [job.id]);
      await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
        VALUES (?,?,?,'job.cancel_requested',?,?)`, [job.id, projectId, user.id, json({ jobId: job.id, status, reason: 'project_deleted' }), timestamp]);
    }
    await audit(connection, user.id, 'project.delete', projectId, projectId, { cancelledJobCount: jobs.length });
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  if (jobs.some((item) => item.status === 'queued')) {
    for (const queueName of [IMAGE_STUDIO_QUEUES.generation, IMAGE_STUDIO_QUEUES.text]) {
      try {
        const queue = getImageStudioQueue(queueName);
        for (const job of jobs.filter((item) => item.status === 'queued')) {
          try { const queued = await queue.getJob(job.id); if (queued && await queued.getState() !== 'active') await queued.remove(); } catch { /* Durable cancellation state is checked by workers. */ }
        }
      } catch { /* Redis may be offline; the durable cancellation state prevents execution when it returns. */ }
    }
  }
}

export async function listImageStudioModelProfiles() {
  const [rows]: any = await pool().query(`SELECT p.id,p.name,p.capability,p.ai_config_id,p.protocol,p.model_override,p.options_json
    FROM image_studio_model_profiles p JOIN ai_model_configs c
      ON c.id COLLATE utf8mb4_unicode_ci=p.ai_config_id COLLATE utf8mb4_unicode_ci AND c.enabled=TRUE
    WHERE p.enabled=1 ORDER BY p.capability,p.name`);
  return rows.map((row: any) => ({ id: String(row.id), name: String(row.name), capability: String(row.capability),
    aiConfigId: String(row.ai_config_id), protocol: String(row.protocol), model: row.model_override || null,
    options: parse(row.options_json, {}) }));
}

export async function saveImageStudioModelProfile(user: AuthUserPayload, input: {
  id?: string; name: string; capability: 'text' | 'vision' | 'image'; aiConfigId: string;
  protocol: 'openai-chat' | 'openai-images' | 'native-async'; model?: string | null; options: Record<string, unknown>; enabled: boolean;
}) {
  const id = input.id || randomUUID(); const timestamp = now();
  if (input.id) {
    const [result]: any = await pool().query(`UPDATE image_studio_model_profiles SET name=?,capability=?,ai_config_id=?,protocol=?,
      model_override=?,options_json=?,enabled=?,updated_at=? WHERE id=?`,
    [input.name, input.capability, input.aiConfigId, input.protocol, input.model || null, json(input.options), input.enabled, timestamp, id]);
    if (!result.affectedRows) fail('模型档案不存在', 404, 'IMAGE_STUDIO_MODEL_PROFILE_NOT_FOUND');
  } else {
    await pool().query(`INSERT INTO image_studio_model_profiles
      (id,name,capability,ai_config_id,protocol,model_override,options_json,enabled,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, input.name, input.capability, input.aiConfigId, input.protocol, input.model || null, json(input.options), input.enabled, user.id, timestamp, timestamp]);
  }
  const [rows]: any = await pool().query(`SELECT id,name,capability,ai_config_id,protocol,model_override,options_json,enabled
    FROM image_studio_model_profiles WHERE id=?`, [id]);
  const row = rows[0];
  await audit(pool(), user.id, input.id ? 'model_profile.update' : 'model_profile.create', id, null, { name: input.name, capability: input.capability, aiConfigId: input.aiConfigId, enabled: input.enabled });
  return { id, name: row.name, capability: row.capability, aiConfigId: row.ai_config_id, protocol: row.protocol,
    model: row.model_override || null, options: parse(row.options_json, {}), enabled: Boolean(row.enabled) };
}

export async function createImageStudioGenerationJob(projectId: string, user: AuthUserPayload, input: ImageStudioJobInput) {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const [existing]: any = await connection.query('SELECT id,status,project_id FROM image_studio_jobs WHERE owner_id=? AND idempotency_key=? LIMIT 1', [user.id, input.idempotencyKey]);
    if (existing[0]) {
      if (String(existing[0].project_id) !== projectId) fail('幂等键已用于其他项目', 409, 'IMAGE_STUDIO_IDEMPOTENCY_CONFLICT');
      await connection.commit(); return { id: String(existing[0].id), status: String(existing[0].status), duplicate: true };
    }

    await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [user.id]);
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [activeJobs]: any = await connection.query(`SELECT COUNT(*) AS total FROM image_studio_jobs
      WHERE owner_id=? AND status IN ('queued','running','cancelling')`, [user.id]);
    if (Number(activeJobs[0]?.total || 0) >= Number(process.env.IMAGE_STUDIO_MAX_ACTIVE_JOBS_PER_USER || 5)) fail('当前后台任务较多，请等待部分任务完成后再提交', 429, 'IMAGE_STUDIO_ACTIVE_LIMIT');
    const [dailyUsage]: any = await connection.query(`SELECT COUNT(*) AS total FROM image_studio_generations g
      JOIN image_studio_jobs j ON j.id=g.job_id WHERE j.owner_id=? AND j.created_at>=UTC_DATE()`, [user.id]);
    if (Number(dailyUsage[0]?.total || 0) + input.generations.length > Number(process.env.IMAGE_STUDIO_DAILY_GENERATION_LIMIT || 200)) fail('已达到每日生图数量上限，请联系管理员调整额度', 429, 'IMAGE_STUDIO_DAILY_LIMIT');
    const [profiles]: any = await connection.query(`SELECT p.id,p.protocol,p.options_json FROM image_studio_model_profiles p
      JOIN ai_model_configs c ON c.id COLLATE utf8mb4_unicode_ci=p.ai_config_id COLLATE utf8mb4_unicode_ci AND c.enabled=TRUE
      WHERE p.id=? AND p.capability='image' AND p.enabled=1 LIMIT 1`, [input.modelProfileId]);
    if (!profiles[0]) fail('图像模型配置不可用，请联系管理员', 409, 'IMAGE_STUDIO_MODEL_UNAVAILABLE');
    const profileOptions = parse<Record<string, any>>(profiles[0].options_json, {});
    const configuredSizes = Array.isArray(profileOptions.sizes) ? profileOptions.sizes.filter((value: unknown) => typeof value === 'string') : [];
    const configuredQualities = Array.isArray(profileOptions.qualityLevels) ? profileOptions.qualityLevels.filter((value: unknown) => typeof value === 'string') : [];
    const supportedSizes = configuredSizes.length ? configuredSizes : ['1024x1024', '1536x1024', '1024x1536', 'auto'];
    const supportedQualities = configuredQualities.length ? configuredQualities : ['auto', 'low', 'medium', 'high'];
    for (const generation of input.generations) {
      if (generation.parameters.size !== undefined && !supportedSizes.includes(String(generation.parameters.size))) fail('所选尺寸不受当前图像模型支持', 400, 'IMAGE_STUDIO_SIZE_UNSUPPORTED');
      if (generation.parameters.quality !== undefined && !supportedQualities.includes(String(generation.parameters.quality))) fail('所选质量不受当前图像模型支持', 400, 'IMAGE_STUDIO_QUALITY_UNSUPPORTED');
      if (Buffer.byteLength(json(generation.parameters), 'utf8') > 16 * 1024) fail('生成参数超过限制', 400, 'IMAGE_STUDIO_PARAMETERS_TOO_LARGE');
    }

    const assetIds = [...new Set(input.generations.flatMap((item) => item.referenceAssetIds))];
    if (assetIds.length) {
      const [assets]: any = await connection.query(`SELECT id,role FROM image_studio_assets WHERE project_id=? AND owner_id=? AND deleted_at IS NULL
        AND id IN (${assetIds.map(() => '?').join(',')})`, [projectId, user.id, ...assetIds]);
      if (assets.length !== assetIds.length) fail('参考素材不存在或不属于此项目', 400, 'IMAGE_STUDIO_ASSET_INVALID');
      if (assets.some((asset: any) => String(asset.role) === 'competitor')) fail('竞品素材只能用于版式分析，不能作为生成参考图', 400, 'IMAGE_STUDIO_COMPETITOR_REFERENCE_BLOCKED');
      if (assets.some((asset: any) => String(asset.role) === 'chat_screenshot')) fail('微信聊天截图只用于需求识别，不能作为生图参考素材', 400, 'IMAGE_STUDIO_CHAT_SCREENSHOT_GENERATION_BLOCKED');
    }

    const jobId = randomUUID(); const timestamp = now();
    await connection.query(`INSERT INTO image_studio_jobs
      (id,project_id,owner_id,job_type,status,idempotency_key,request_json,model_profile_id,progress,attempt_count,created_at,updated_at)
      VALUES (?,?,?,'image_generate','queued',?,?,?,0,0,?,?)`,
    [jobId, projectId, user.id, input.idempotencyKey, json({ generations: input.generations }), input.modelProfileId, timestamp, timestamp]);
    for (const item of input.generations) {
      await connection.query(`INSERT INTO image_studio_generations
        (id,job_id,project_id,slot_key,shot_id,prompt,reference_asset_ids,model_profile_id,model_name,parameters_json,status,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'queued',?)`,
      [randomUUID(), jobId, projectId, item.slotKey, item.shotId || null, item.prompt, json(item.referenceAssetIds), input.modelProfileId, 'pending-profile-resolution', json(item.parameters), timestamp]);
    }
    const eventId = randomUUID();
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,'job.accepted',?,?)`, [jobId, projectId, user.id, json({ jobId, status: 'queued', generationCount: input.generations.length }), timestamp]);
    await connection.query(`INSERT INTO image_studio_outbox (id,job_id,queue_name,job_name,payload_json,status,attempts,available_at,created_at)
      VALUES (?,?,?,'generate-image-batch',?,'pending',0,?,?)`,
    [eventId, jobId, 'image-studio-generation', json({ jobId }), timestamp, timestamp]);
    await audit(connection, user.id, 'generation.create', jobId, projectId, { modelProfileId: input.modelProfileId, count: input.generations.length });
    await connection.commit();
    return { id: jobId, status: 'queued', duplicate: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function createImageStudioTextJob(projectId: string, user: AuthUserPayload, input: ImageStudioTextInput) {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const [existing]: any = await connection.query('SELECT id,status,project_id FROM image_studio_jobs WHERE owner_id=? AND idempotency_key=? LIMIT 1', [user.id, input.idempotencyKey]);
    if (existing[0]) {
      if (String(existing[0].project_id) !== projectId) fail('幂等键已用于其他项目', 409, 'IMAGE_STUDIO_IDEMPOTENCY_CONFLICT');
      await connection.commit(); return { id: String(existing[0].id), status: String(existing[0].status), duplicate: true };
    }
    await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [user.id]);
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const needsVision = input.operation === 'plan_agent' || input.operation === 'chat_intake_extract' && ((input.sourceType || 'screenshots') === 'screenshots' || input.referenceAssetIds.length > 0);
    const capabilityFilter = needsVision ? "p.capability='vision'" : "p.capability IN ('text','vision')";
    const [profiles]: any = await connection.query(`SELECT p.id,p.capability FROM image_studio_model_profiles p
      JOIN ai_model_configs c ON c.id COLLATE utf8mb4_unicode_ci=p.ai_config_id COLLATE utf8mb4_unicode_ci AND c.enabled=TRUE
      WHERE p.id=? AND ${capabilityFilter} AND p.enabled=1 LIMIT 1`, [input.modelProfileId]);
    if (!profiles[0]) fail(needsVision ? '图片需求整理需要启用的图生文模型' : '文本或视觉模型配置不可用，请联系管理员', 409, 'IMAGE_STUDIO_MODEL_UNAVAILABLE');
    if (input.operation === 'chat_intake_extract' || input.operation === 'plan_agent') {
      const sourceType = input.sourceType || 'screenshots';
      if (sourceType === 'screenshots') {
        if (!input.referenceAssetIds.length || input.referenceAssetIds.length > 12) fail('请选择 1 至 12 张微信聊天截图', 400, 'IMAGE_STUDIO_CHAT_SCREENSHOT_REQUIRED');
        if (new Set(input.referenceAssetIds).size !== input.referenceAssetIds.length) fail('聊天截图不能重复选择', 400, 'IMAGE_STUDIO_CHAT_SCREENSHOT_DUPLICATE');
        const [screenshots]: any = await connection.query(`SELECT id FROM image_studio_assets
          WHERE project_id=? AND owner_id=? AND role='chat_screenshot' AND deleted_at IS NULL
            AND id IN (${input.referenceAssetIds.map(() => '?').join(',')})`, [projectId, user.id, ...input.referenceAssetIds]);
        if (screenshots.length !== new Set(input.referenceAssetIds).size) fail('聊天截图素材不存在或已被移除，请重新选择', 400, 'IMAGE_STUDIO_CHAT_SCREENSHOT_INVALID');
      } else {
        if (!input.sourceConversationId || !input.sourceData || input.referenceAssetIds.length > 12) fail('协作会话来源无效，请重新选择', 400, 'IMAGE_STUDIO_COLLABORATION_SOURCE_INVALID');
        if (input.referenceAssetIds.length) {
          const references = await loadProjectAssets(projectId, user.id, input.referenceAssetIds);
          if (references.some((asset: any) => asset.kind !== 'image' && asset.kind !== 'reference' || asset.role === 'chat_screenshot')) {
            fail('协作档案图片引用无效，请刷新工作台后重试', 400, 'IMAGE_STUDIO_COLLABORATION_REFERENCE_INVALID');
          }
        }
      }
    } else if (input.referenceAssetIds.length) {
      const references = await loadProjectAssets(projectId, user.id, input.referenceAssetIds);
      if (references.some((asset: any) => String(asset.role) === 'chat_screenshot')) fail('微信聊天截图只用于需求识别，请勿混入商品素材分析', 400, 'IMAGE_STUDIO_CHAT_SCREENSHOT_REFERENCE_BLOCKED');
    }
    const [activeJobs]: any = await connection.query(`SELECT COUNT(*) AS total FROM image_studio_jobs WHERE owner_id=? AND status IN ('queued','running','cancelling')`, [user.id]);
    if (Number(activeJobs[0]?.total || 0) >= Number(process.env.IMAGE_STUDIO_MAX_ACTIVE_JOBS_PER_USER || 5)) fail('当前后台任务较多，请等待部分任务完成后再提交', 429, 'IMAGE_STUDIO_ACTIVE_LIMIT');
    const jobId = randomUUID(); const timestamp = now();
    await connection.query(`INSERT INTO image_studio_jobs
      (id,project_id,owner_id,job_type,status,idempotency_key,request_json,model_profile_id,progress,attempt_count,created_at,updated_at)
      VALUES (?,?,?,'text_task','queued',?,?,?,0,0,?,?)`,
    [jobId, projectId, user.id, input.idempotencyKey, json({ operation: input.operation, context: input.context, referenceAssetIds: input.referenceAssetIds,
      sourceType: input.sourceType || (input.operation === 'chat_intake_extract' ? 'screenshots' : undefined), sourceConversationId: input.sourceConversationId || undefined }), input.modelProfileId, timestamp, timestamp]);
    if (input.operation === 'chat_intake_extract') {
      await connection.query(`INSERT INTO image_studio_chat_intakes
        (id,project_id,owner_id,source_asset_ids,source_type,source_conversation_id,source_data_json,status,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'queued',1,?,?)`, [jobId, projectId, user.id, json(input.referenceAssetIds), input.sourceType || 'screenshots',
        input.sourceConversationId || null, input.sourceData ? json(input.sourceData) : null, timestamp, timestamp]);
    }
    if (input.operation === 'plan_agent') {
      if (!['collaboration', 'invite', 'screenshots'].includes(String(input.sourceType)) || !input.sourceData) {
        fail('图片方案来源无效，请重新选择会话或截图', 400, 'IMAGE_STUDIO_PLAN_SOURCE_INVALID');
      }
      await connection.query(`INSERT INTO image_studio_plan_runs
        (id,job_id,project_id,owner_id,source_type,source_conversation_id,source_snapshot_json,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'queued',?,?)`, [randomUUID(), jobId, projectId, user.id, input.sourceType,
        input.sourceConversationId || 'uploaded-screenshots', json(input.sourceData), timestamp, timestamp]);
    }
    const outboxId = randomUUID();
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,'job.accepted',?,?)`, [jobId, projectId, user.id, json({ jobId, status: 'queued', operation: input.operation }), timestamp]);
    await connection.query(`INSERT INTO image_studio_outbox (id,job_id,queue_name,job_name,payload_json,status,attempts,available_at,created_at)
      VALUES (?,?,?,'run-text-task',?,'pending',0,?,?)`, [outboxId, jobId, 'image-studio-text', json({ jobId }), timestamp, timestamp]);
    await audit(connection, user.id, `ai.${input.operation}`, jobId, projectId, { modelProfileId: input.modelProfileId, referenceCount: input.referenceAssetIds.length });
    await connection.commit();
    return { id: jobId, status: 'queued', duplicate: false };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function listImageStudioChatIntakes(projectId: string, user: AuthUserPayload) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT * FROM image_studio_chat_intakes
    WHERE project_id=? AND owner_id=? ORDER BY created_at DESC,id DESC LIMIT 30`, [projectId, user.id]);
  return rows.map(chatIntakeDto);
}

function planVersionDto(row: any) {
  return { id: String(row.id), runId: String(row.run_id), version: Number(row.version), status: String(row.status),
    plan: parse(row.plan_json, {}), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null };
}

export async function listImageStudioPlans(projectId: string, user: AuthUserPayload) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT r.id AS run_id,r.job_id,r.source_type,r.source_conversation_id,r.status AS run_status,
      r.error_code,r.error_message,r.created_at AS run_created_at,v.*
    FROM image_studio_plan_runs r LEFT JOIN image_studio_plan_versions v ON v.run_id=r.id AND v.version=(SELECT MAX(v2.version) FROM image_studio_plan_versions v2 WHERE v2.run_id=r.id)
    WHERE r.project_id=? AND r.owner_id=? ORDER BY r.created_at DESC,v.version DESC LIMIT 60`, [projectId, user.id]);
  return rows.map((row: any) => ({ id: String(row.run_id), jobId: String(row.job_id), sourceType: String(row.source_type),
    sourceConversationId: String(row.source_conversation_id), runStatus: String(row.run_status), error: row.error_code ? { code: String(row.error_code), message: String(row.error_message || '') } : null,
    createdAt: new Date(row.run_created_at).toISOString(), currentVersion: row.id ? planVersionDto(row) : null }));
}

export async function reviewImageStudioPlan(projectId: string, runId: string, user: AuthUserPayload, input: { versionId: string; version: number; plan: unknown; approve: boolean }) {
  const connection = await pool().getConnection(); const timestamp = now();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query(`SELECT v.*,r.source_snapshot_json FROM image_studio_plan_versions v JOIN image_studio_plan_runs r ON r.id=v.run_id
      WHERE r.id=? AND r.project_id=? AND r.owner_id=? AND v.id=? FOR UPDATE`, [runId, projectId, user.id, input.versionId]);
    if (!rows[0]) fail('图片方案不存在或无权访问', 404, 'IMAGE_STUDIO_PLAN_NOT_FOUND');
    if (Number(rows[0].version) !== input.version) fail('图片方案已在其他页面更新，请刷新后重试', 409, 'IMAGE_STUDIO_PLAN_VERSION_CONFLICT');
    const normalized = normalizeImagePlan(input.plan);
    const snapshot = parse<any>(rows[0].source_snapshot_json, {});
    const allowedReferences = new Set((snapshot?.dossier?.imageAttachments || []).map((item: any) => String(item.assetId || '')).filter(Boolean));
    const invalidReference = normalized.images.some((image: any) => image.referenceImages.some((reference: any) => !allowedReferences.has(reference.assetId)));
    if (invalidReference) fail('方案引用了本次会话以外的图片，请重新选择参考图', 400, 'IMAGE_STUDIO_PLAN_REFERENCE_INVALID');
    if (input.approve && (!normalized.images.length || normalized.images.some((image: any) => !image.title || !image.prompt))) {
      fail('确认前请补全图片标题和每张图的提示词', 400, 'IMAGE_STUDIO_PLAN_INCOMPLETE');
    }
    const nextStatus = input.approve ? 'approved' : 'needs_review';
    const nextId = randomUUID();
    await connection.query(`INSERT INTO image_studio_plan_versions
      (id,run_id,project_id,owner_id,version,plan_json,status,reviewed_by,reviewed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [nextId, rows[0].run_id, projectId, user.id, Number(rows[0].version) + 1,
      json(normalized), nextStatus, input.approve ? user.id : null, input.approve ? timestamp : null, timestamp, timestamp]);
    await connection.query(`UPDATE image_studio_plan_runs SET status=?,updated_at=? WHERE id=?`, [input.approve ? 'approved' : 'needs_review', timestamp, runId]);
    await audit(connection, user.id, input.approve ? 'image_plan.approve' : 'image_plan.edit', runId, projectId, { version: input.version });
    await connection.commit();
    return planVersionDto({ ...rows[0], id: nextId, version: Number(rows[0].version) + 1, plan_json: json(normalized), status: nextStatus, reviewed_by: input.approve ? user.id : null, reviewed_at: input.approve ? timestamp : null, created_at: timestamp, updated_at: timestamp });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

function normalizeImagePlan(value: unknown) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const strings = (values: unknown, max = 100) => Array.isArray(values) ? values.filter((item): item is string => typeof item === 'string').map((item) => redactChatText(item, 2000)).filter(Boolean).slice(0, max) : [];
  const requirements = Array.isArray(input.requirements) ? input.requirements.slice(0, 100).map((item: any, index: number) => ({
    id: String(item?.id || `req-${index + 1}`).slice(0, 64), text: redactChatText(item?.text, 500), status: ['confirmed','mentioned','suggestion','to_confirm'].includes(item?.status) ? item.status : 'to_confirm',
    evidence: strings(item?.evidence, 20),
  })).filter((item: any) => item.text) : [];
  const images = Array.isArray(input.images) ? input.images.slice(0, 40).map((item: any, index: number) => {
    const refs = Array.isArray(item?.referenceImages) ? item.referenceImages.slice(0, 12).map((ref: any) => ({
      assetId: redactChatText(ref?.assetId, 64), url: redactChatText(ref?.url, 240), role: redactChatText(ref?.role, 80), instruction: redactChatText(ref?.instruction, 300), sourceMessageIds: strings(ref?.sourceMessageIds, 20),
    })).filter((ref: any) => ref.assetId) : [];
    return { id: String(item?.id || `image-${index + 1}`).slice(0, 64), title: redactChatText(item?.title, 160), type: redactChatText(item?.type, 100), sku: redactChatText(item?.sku, 100),
      output: redactChatText(item?.output, 500), prompt: redactChatText(item?.prompt, 6000), negativePrompt: redactChatText(item?.negativePrompt, 2000),
      constraints: strings(item?.constraints, 30), referenceImages: refs, requirementIds: strings(item?.requirementIds, 50), status: item?.status === 'approved' ? 'approved' : 'draft',
      issues: strings(item?.issues, 30) };
  }).filter((item: any) => item.title || item.prompt) : [];
  const imageAnalyses = Array.isArray(input.imageAnalyses) ? input.imageAnalyses.slice(0, 12).map((item: any) => ({
    assetId: redactChatText(item?.assetId, 64), description: redactChatText(item?.description, 1000), possibleUse: redactChatText(item?.possibleUse, 160),
    visibleFacts: strings(item?.visibleFacts, 30), ocrText: strings(item?.ocrText, 30), uncertainties: strings(item?.uncertainties, 30),
    sourceMessageIds: strings(item?.sourceMessageIds, 20), role: redactChatText(item?.role, 80),
  })) : [];
  return { summary: redactChatText(input.summary, 2000), product: redactChatText(input.product, 200), productLinks: strings(input.productLinks, 20),
    requirements, imageAnalyses, images, agentProfileIds: strings(input.agentProfileIds, 10),
    openQuestions: strings(input.openQuestions, 50), validation: input.validation && typeof input.validation === 'object' ? input.validation : { valid: false, issues: ['尚未完成校验'] } };
}

export async function exportImageStudioPlan(projectId: string, runId: string, user: AuthUserPayload, format: 'json' | 'md') {
  const [rows]: any = await pool().query(`SELECT v.*,r.id AS source_run_id FROM image_studio_plan_versions v JOIN image_studio_plan_runs r ON r.id=v.run_id
    WHERE r.id=? AND r.project_id=? AND r.owner_id=? ORDER BY v.version DESC LIMIT 1`, [runId, projectId, user.id]);
  if (!rows[0]) fail('图片方案不存在或无权访问', 404, 'IMAGE_STUDIO_PLAN_NOT_FOUND');
  if (String(rows[0].status) !== 'approved') fail('请先审核并确认方案，再导出交付文件', 409, 'IMAGE_STUDIO_PLAN_NOT_APPROVED');
  const plan = parse<any>(rows[0].plan_json, {});
  const content = format === 'json' ? JSON.stringify({ schemaVersion: '1.0', planId: String(rows[0].id), version: Number(rows[0].version), ...plan }, null, 2)
    : `# ${plan.product || '商品图片方案'}\n\n${plan.summary || ''}\n\n## 需求依据\n\n${(plan.requirements || []).map((item: any) => `- [${item.status}] ${item.text}${item.evidence?.length ? `（依据：${item.evidence.join('；')}）` : ''}`).join('\n')}\n\n## 图片清单\n\n${(plan.images || []).map((item: any, index: number) => `### ${index + 1}. ${item.title}\n\n- 图种：${item.type || '未指定'}\n- SKU：${item.sku || '未指定'}\n- 交付：${item.output || '未指定'}\n- 状态：${item.status}\n- 提示词：\n\n${item.prompt}\n\n- 避免内容：${item.negativePrompt || '无'}\n- 参考图：${(item.referenceImages || []).map((ref: any) => ref.url).join('、') || '无'}\n`).join('\n')}\n## 待确认\n\n${(plan.openQuestions || []).map((item: string) => `- ${item}`).join('\n')}`;
  const objectKey = `private/image-studio/plans/${projectId}/${rows[0].id}-v${rows[0].version}.${format}`;
  const checksum = createHash('sha256').update(content).digest('hex');
  await putPrivateBufferAtOssKey(objectKey, Buffer.from(content, 'utf8'), format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8');
  await pool().query(`INSERT INTO image_studio_plan_exports (id,plan_version_id,project_id,owner_id,format,object_key,checksum_sha256,created_at)
    VALUES (?,?,?,?,?,?,?,?)`, [randomUUID(), rows[0].id, projectId, user.id, format, objectKey, checksum, now()]);
  const filenameBase = String(plan.product || 'image-plan').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 80) || 'image-plan';
  return { format, checksum, url: getSignedOssUrl(objectKey, 180), filename: `${filenameBase}-v${rows[0].version}.${format}` };
}

export async function reviewImageStudioChatIntake(projectId: string, intakeId: string, user: AuthUserPayload,
  input: { version: number; brief: unknown }) {
  const connection = await pool().getConnection();
  const timestamp = now();
  try {
    await connection.beginTransaction();
    const [intakes]: any = await connection.query(`SELECT * FROM image_studio_chat_intakes
      WHERE id=? AND project_id=? AND owner_id=? FOR UPDATE`, [intakeId, projectId, user.id]);
    if (!intakes[0]) fail('聊天需求档案不存在或无权访问', 404, 'IMAGE_STUDIO_CHAT_INTAKE_NOT_FOUND');
    const current = intakes[0];
    if (String(current.status) !== 'needs_review' && String(current.status) !== 'approved') fail('识别结果尚未准备好，暂时不能采纳', 409, 'IMAGE_STUDIO_CHAT_INTAKE_NOT_READY');
    if (Number(current.version) !== input.version) fail('聊天需求档案已在其他页面更新，请刷新后重试', 409, 'IMAGE_STUDIO_CHAT_INTAKE_VERSION_CONFLICT');
    const brief = normalizeChatBrief(input.brief);
    const [projects]: any = await connection.query(`SELECT * FROM image_studio_projects
      WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE`, [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const workflow = parse<Record<string, any>>(projects[0].workflow_json, {});
    const nextWorkflow = {
      ...workflow,
      customerBrief: brief,
      customerBriefSource: { intakeId, type: String(current.source_type || 'screenshots'), conversationId: current.source_conversation_id || null,
        sourceAssetIds: parse<string[]>(current.source_asset_ids, []), title: parse<Record<string, any> | null>(current.source_data_json, null)?.conversation?.title || null,
        confirmedAt: timestamp.toISOString() },
      productLinks: brief.productLinks,
      productName: workflow.productName || brief.productName,
      salesChannel: workflow.salesChannel || brief.platform,
      specs: { ...(workflow.specs || {}), platformTemplate: workflow.specs?.platformTemplate || brief.platform || projects[0].platform || '' },
      customerBriefUpdatedAt: timestamp.toISOString(),
    };
    await connection.query(`UPDATE image_studio_projects SET workflow_json=?,version=version+1,updated_at=? WHERE id=?`,
      [json(nextWorkflow), timestamp, projectId]);
    await connection.query(`UPDATE image_studio_chat_intakes SET brief_json=?,status='approved',version=version+1,
      error_code=NULL,error_message=NULL,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=?`,
    [json(brief), user.id, timestamp, timestamp, intakeId]);
    await audit(connection, user.id, 'chat_intake.approve', intakeId, projectId,
      { productLinkCount: brief.productLinks.length, deliverableCount: brief.deliverables.length, factCheckCount: brief.factsToConfirm.length });
    const [updatedIntakes]: any = await connection.query('SELECT * FROM image_studio_chat_intakes WHERE id=?', [intakeId]);
    const [updatedProjects]: any = await connection.query('SELECT * FROM image_studio_projects WHERE id=?', [projectId]);
    await connection.commit();
    return { intake: chatIntakeDto(updatedIntakes[0]), project: projectDto(updatedProjects[0]) };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function listImageStudioJobs(projectId: string, user: AuthUserPayload, limit = 30, before?: string) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT id,job_type,status,progress,error_code,error_message,created_at,started_at,completed_at
    FROM image_studio_jobs WHERE project_id=? AND owner_id=? ${before ? 'AND created_at < ?' : ''}
    ORDER BY created_at DESC,id DESC LIMIT ?`, before ? [projectId, user.id, before, limit] : [projectId, user.id, limit]);
  return rows.map((row: any) => ({ id: String(row.id), type: String(row.job_type), status: String(row.status), progress: Number(row.progress),
    error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    createdAt: new Date(row.created_at).toISOString(), startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null }));
}

export async function getImageStudioJob(jobId: string, user: AuthUserPayload) {
  const [rows]: any = await pool().query('SELECT * FROM image_studio_jobs WHERE id=? AND owner_id=? LIMIT 1', [jobId, user.id]);
  if (!rows[0]) fail('任务不存在或无权访问', 404, 'IMAGE_STUDIO_JOB_NOT_FOUND');
  const [generations]: any = await pool().query(`SELECT id,slot_key,shot_id,prompt,status,parameters_json,error_code,error_message,output_asset_id,created_at,completed_at
    FROM image_studio_generations WHERE job_id=? ORDER BY created_at,id`, [jobId]);
  const request = parse<Record<string, any>>(rows[0].request_json, {});
  return { id: String(rows[0].id), projectId: String(rows[0].project_id), type: String(rows[0].job_type), operation: request.operation || null, context: request.context || null, exportId: request.exportId || null, status: String(rows[0].status), progress: Number(rows[0].progress), result: parse(rows[0].result_json, null),
    error: rows[0].error_code ? { code: rows[0].error_code, message: rows[0].error_message } : null,
    generations: generations.map((row: any) => ({ id: String(row.id), slotKey: String(row.slot_key), shotId: row.shot_id || null, prompt: String(row.prompt), status: String(row.status),
      parameters: parse(row.parameters_json, {}), error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
      outputAssetId: row.output_asset_id || null, previewUrl: row.output_asset_id ? `/api/image-studio/assets/${encodeURIComponent(String(row.output_asset_id))}/preview` : null,
      createdAt: new Date(row.created_at).toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null })) };
}

export async function listImageStudioGenerationReviews(projectId: string, user: AuthUserPayload) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT g.id,g.slot_key,g.shot_id,g.prompt,g.status,g.output_asset_id,g.error_code,g.error_message,g.created_at,a.filename,
      COALESCE(r.is_selected,FALSE) AS is_selected,COALESCE(r.is_locked,FALSE) AS is_locked,COALESCE(r.version,0) AS review_version
    FROM image_studio_generations g JOIN image_studio_jobs j ON j.id=g.job_id
    LEFT JOIN image_studio_assets a ON a.id=g.output_asset_id AND a.project_id=g.project_id AND a.owner_id=j.owner_id
    LEFT JOIN image_studio_generation_reviews r ON r.generation_id=g.id AND r.project_id=g.project_id AND r.owner_id=j.owner_id
    WHERE g.project_id=? AND j.owner_id=? ORDER BY g.created_at DESC,g.id DESC LIMIT 500`, [projectId, user.id]);
  return rows.map((row: any) => ({ id: String(row.id), slotKey: String(row.slot_key), shotId: row.shot_id || null,
    prompt: String(row.prompt), status: String(row.status), outputAssetId: row.output_asset_id || null,
    filename: row.filename ? String(row.filename) : null,
    previewUrl: row.output_asset_id ? `/api/image-studio/assets/${encodeURIComponent(String(row.output_asset_id))}/preview` : null,
    downloadUrl: row.output_asset_id ? `/api/image-studio/assets/${encodeURIComponent(String(row.output_asset_id))}/download` : null,
    error: row.error_code ? { code: String(row.error_code), message: String(row.error_message || '') } : null,
    selected: Boolean(row.is_selected), locked: Boolean(row.is_locked), reviewVersion: Number(row.review_version),
    createdAt: new Date(row.created_at).toISOString() }));
}

export async function updateImageStudioGenerationReview(projectId: string, generationId: string, user: AuthUserPayload,
  input: { selected: boolean; locked: boolean; version: number }) {
  const connection = await pool().getConnection();
  const timestamp = now();
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [generations]: any = await connection.query(`SELECT id,status,output_asset_id FROM image_studio_generations
      WHERE id=? AND project_id=? FOR UPDATE`, [generationId, projectId]);
    const generation = generations[0];
    if (!generation || !generation.output_asset_id || String(generation.status) !== 'completed') fail('只有已完成并保存到 OSS 的图片可以评审', 409, 'IMAGE_STUDIO_GENERATION_NOT_REVIEWABLE');
    const [reviews]: any = await connection.query(`SELECT version FROM image_studio_generation_reviews
      WHERE generation_id=? AND project_id=? AND owner_id=? FOR UPDATE`, [generationId, projectId, user.id]);
    const currentVersion = Number(reviews[0]?.version || 0);
    if (currentVersion !== input.version) fail('图片评审状态已在其他页面更新，请刷新后再保存', 409, 'IMAGE_STUDIO_VERSION_CONFLICT');
    if (reviews[0]) {
      await connection.query(`UPDATE image_studio_generation_reviews SET is_selected=?,is_locked=?,version=version+1,reviewed_by=?,reviewed_at=?,updated_at=?
        WHERE generation_id=? AND project_id=? AND owner_id=?`, [input.selected, input.locked, user.id, timestamp, timestamp, generationId, projectId, user.id]);
    } else {
      await connection.query(`INSERT INTO image_studio_generation_reviews
        (generation_id,project_id,owner_id,is_selected,is_locked,version,reviewed_by,reviewed_at,created_at,updated_at)
        VALUES (?,?,?,?,?,1,?,?,?,?)`, [generationId, projectId, user.id, input.selected, input.locked, user.id, timestamp, timestamp, timestamp]);
    }
    await audit(connection, user.id, 'generation.review', generationId, projectId, { selected: input.selected, locked: input.locked });
    await connection.commit();
    return { id: generationId, selected: input.selected, locked: input.locked, reviewVersion: currentVersion + 1 };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function createImageStudioExport(projectId: string, user: AuthUserPayload, idempotencyKey: string = randomUUID()) {
  const connection = await pool().getConnection();
  const timestamp = now();
  try {
    await connection.beginTransaction();
    const [existing]: any = await connection.query('SELECT id,status,project_id,request_json FROM image_studio_jobs WHERE owner_id=? AND idempotency_key=? LIMIT 1', [user.id, idempotencyKey]);
    if (existing[0]) {
      if (String(existing[0].project_id) !== projectId) fail('幂等键已用于其他项目', 409, 'IMAGE_STUDIO_IDEMPOTENCY_CONFLICT');
      const request = parse<Record<string, any>>(existing[0].request_json, {});
      await connection.commit();
      return { id: String(request.exportId || ''), jobId: String(existing[0].id), status: String(existing[0].status), imageCount: Number(request.imageCount || 0), duplicate: true };
    }
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [images]: any = await connection.query(`SELECT g.id AS generation_id,g.shot_id,a.object_key,a.filename,a.size_bytes,a.mime_type
      FROM image_studio_generation_reviews r JOIN image_studio_generations g ON g.id=r.generation_id AND g.project_id=r.project_id
      JOIN image_studio_assets a ON a.id=g.output_asset_id AND a.project_id=g.project_id AND a.owner_id=r.owner_id
      WHERE r.project_id=? AND r.owner_id=? AND r.is_selected=TRUE AND g.status='completed' AND a.deleted_at IS NULL
      ORDER BY COALESCE(g.shot_id,''),g.created_at,g.id FOR UPDATE`, [projectId, user.id]);
    if (!images.length) fail('请先选择至少一张已完成的图片', 409, 'IMAGE_STUDIO_EXPORT_EMPTY');
    if (images.length > 100) fail('单次最多导出 100 张图片', 400, 'IMAGE_STUDIO_EXPORT_COUNT_LIMIT');
    const totalBytes = images.reduce((total: number, item: any) => total + Number(item.size_bytes || 0), 0);
    if (totalBytes > 100 * 1024 * 1024) fail('所选图片合计超过 100 MB，请分批导出', 413, 'IMAGE_STUDIO_EXPORT_SIZE_LIMIT');
    const manifest = images.map((item: any, index: number) => ({ generationId: String(item.generation_id), shotId: item.shot_id || null,
      objectKey: String(item.object_key), filename: String(item.filename || ('image-' + (index + 1) + '.png')), mimeType: String(item.mime_type || 'image/png'),
      size: Number(item.size_bytes || 0) }));
    const [active]: any = await connection.query(`SELECT COUNT(*) AS total FROM image_studio_jobs
      WHERE owner_id=? AND status IN ('queued','running','cancelling')`, [user.id]);
    if (Number(active[0]?.total || 0) >= Number(process.env.IMAGE_STUDIO_MAX_ACTIVE_JOBS_PER_USER || 5)) fail('当前后台任务较多，请等待部分任务完成后再提交', 429, 'IMAGE_STUDIO_ACTIVE_LIMIT');
    const jobId = randomUUID(); const exportId = randomUUID();
    await connection.query(`INSERT INTO image_studio_jobs
      (id,project_id,owner_id,job_type,status,idempotency_key,request_json,model_profile_id,progress,attempt_count,created_at,updated_at)
      VALUES (?,?,?,'export','queued',?,?,NULL,0,0,?,?)`, [jobId, projectId, user.id, idempotencyKey, json({ exportId, imageCount: images.length }), timestamp, timestamp]);
    await connection.query(`INSERT INTO image_studio_exports
      (id,job_id,project_id,owner_id,manifest_json,image_count,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'queued',?,?)`, [exportId, jobId, projectId, user.id, json(manifest), images.length, timestamp, timestamp]);
    const outboxId = randomUUID();
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,'job.accepted',?,?)`, [jobId, projectId, user.id, json({ jobId, status: 'queued', exportId, imageCount: images.length }), timestamp]);
    await connection.query(`INSERT INTO image_studio_outbox (id,job_id,queue_name,job_name,payload_json,status,attempts,available_at,created_at)
      VALUES (?,?,?,'export-selected-images',?,'pending',0,?,?)`, [outboxId, jobId, IMAGE_STUDIO_QUEUES.export, json({ jobId }), timestamp, timestamp]);
    await audit(connection, user.id, 'generation.export.create', exportId, projectId, { count: images.length, bytes: totalBytes });
    await connection.commit();
    return { id: exportId, jobId, status: 'queued', imageCount: images.length, duplicate: false };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function listImageStudioExports(projectId: string, user: AuthUserPayload) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT e.id,e.job_id,e.image_count,e.status,e.error_code,e.error_message,e.created_at,e.completed_at,j.progress
    FROM image_studio_exports e JOIN image_studio_jobs j ON j.id=e.job_id
    WHERE e.project_id=? AND e.owner_id=? ORDER BY e.created_at DESC LIMIT 100`, [projectId, user.id]);
  return rows.map((row: any) => ({ id: String(row.id), jobId: String(row.job_id), imageCount: Number(row.image_count), status: String(row.status),
    error: row.error_code ? { code: String(row.error_code), message: String(row.error_message || '') } : null,
    progress: Number(row.progress || 0), downloadUrl: row.status === 'completed' ? `/api/image-studio/exports/${encodeURIComponent(String(row.id))}/download` : null,
    createdAt: new Date(row.created_at).toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null }));
}

export async function loadImageStudioExport(jobId: string) {
  const [rows]: any = await pool().query(`SELECT e.*,j.status AS job_status FROM image_studio_exports e
    JOIN image_studio_jobs j ON j.id=e.job_id WHERE e.job_id=? LIMIT 1`, [jobId]);
  if (!rows[0]) fail('导出任务不存在', 404, 'IMAGE_STUDIO_EXPORT_NOT_FOUND');
  return { id: String(rows[0].id), jobId: String(rows[0].job_id), projectId: String(rows[0].project_id), ownerId: String(rows[0].owner_id),
    status: String(rows[0].status), jobStatus: String(rows[0].job_status), manifest: parse<Array<Record<string, any>>>(rows[0].manifest_json, []), objectKey: rows[0].object_key || null };
}

export async function saveImageStudioExport(exportId: string, objectKey: string) {
  const connection = await pool().getConnection();
  const timestamp = now();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query(`SELECT e.id,e.job_id,e.project_id,e.owner_id,e.status AS export_status,j.status AS job_status
      FROM image_studio_exports e JOIN image_studio_jobs j ON j.id=e.job_id WHERE e.id=? FOR UPDATE`, [exportId]);
    if (!rows[0]) fail('导出任务不存在', 404, 'IMAGE_STUDIO_EXPORT_NOT_FOUND');
    const row = rows[0];
    const cancelled = ['cancelling', 'cancelled'].includes(String(row.job_status));
    const status = cancelled ? 'cancelled' : 'completed';
    if (status === 'completed') {
      await connection.query(`UPDATE image_studio_exports SET object_key=?,status='completed',error_code=NULL,error_message=NULL,completed_at=?,updated_at=? WHERE id=?`, [objectKey, timestamp, timestamp, exportId]);
    } else {
      await connection.query(`UPDATE image_studio_exports SET status='cancelled',updated_at=? WHERE id=?`, [timestamp, exportId]);
    }
    const jobId = String(row.job_id);
    const projectId = String(row.project_id);
    const ownerId = String(row.owner_id);
    const eventType = cancelled ? 'job.cancelled' : 'job.completed';
    const payload = cancelled ? { jobId, status, progress: 100, exportId } : { jobId, status, progress: 100, exportId, downloadUrl: `/api/image-studio/exports/${encodeURIComponent(exportId)}/download` };
    await connection.query(`UPDATE image_studio_jobs SET status=?,progress=100,completed_at=?,updated_at=? WHERE id=?`, [status, timestamp, timestamp, jobId]);
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,?,?,?)`, [jobId, projectId, ownerId, eventType, json(payload), timestamp]);
    await connection.commit();
    return !cancelled;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function failImageStudioExport(jobId: string, code: string, message: string) {
  const clipped = message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 768);
  const [rows]: any = await pool().query(`SELECT e.id,e.project_id,e.owner_id FROM image_studio_exports e WHERE e.job_id=? LIMIT 1`, [jobId]);
  if (!rows[0]) return;
  await pool().query(`UPDATE image_studio_exports SET status='failed',error_code=?,error_message=?,updated_at=? WHERE job_id=?`, [code.slice(0, 64), clipped, now(), jobId]);
  await writeJobEvent({ id: jobId, projectId: String(rows[0].project_id), ownerId: String(rows[0].owner_id) }, 'job.failed', { status: 'failed', progress: 100, code, message: clipped }, 'failed');
}

export async function cancelImageStudioJob(jobId: string, user: AuthUserPayload) {
  const connection = await pool().getConnection();
  let projectId = '';
  let queueName: ImageStudioQueueName = IMAGE_STUDIO_QUEUES.generation;
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query('SELECT project_id,status,job_type,request_json FROM image_studio_jobs WHERE id=? AND owner_id=? FOR UPDATE', [jobId, user.id]);
    if (!rows[0]) fail('任务不存在或无权访问', 404, 'IMAGE_STUDIO_JOB_NOT_FOUND');
    projectId = String(rows[0].project_id);
    queueName = String(rows[0].job_type) === 'export' ? IMAGE_STUDIO_QUEUES.export : String(rows[0].job_type) === 'text_task' ? IMAGE_STUDIO_QUEUES.text : IMAGE_STUDIO_QUEUES.generation;
    if (!['queued', 'running'].includes(String(rows[0].status))) fail('当前任务状态不支持取消', 409, 'IMAGE_STUDIO_JOB_NOT_CANCELLABLE');
    const status = rows[0].status === 'queued' ? 'cancelled' : 'cancelling';
    await connection.query('UPDATE image_studio_jobs SET status=?,updated_at=? WHERE id=?', [status, now(), jobId]);
    if (status === 'cancelled') await connection.query(`UPDATE image_studio_generations SET status='cancelled',completed_at=? WHERE job_id=? AND status='queued'`, [now(), jobId]);
    if (String(rows[0].job_type) === 'export') await connection.query('UPDATE image_studio_exports SET status=?,updated_at=? WHERE job_id=?', [status, now(), jobId]);
    const request = parse<Record<string, any>>(rows[0].request_json, {});
    if (request.operation === 'chat_intake_extract') await connection.query('UPDATE image_studio_chat_intakes SET status=?,updated_at=? WHERE id=? AND owner_id=?', [status, now(), jobId, user.id]);
    await connection.query(`UPDATE image_studio_outbox SET status='cancelled',locked_until=NULL WHERE job_id=? AND status='pending'`, [jobId]);
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,'job.cancel_requested',?,?)`, [jobId, projectId, user.id, json({ jobId, status }), now()]);
    await audit(connection, user.id, 'job.cancel', jobId, projectId, { previousStatus: rows[0].status, status });
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  try {
    const queuedJob = await getImageStudioQueue(queueName).getJob(jobId);
    if (queuedJob && await queuedJob.getState() !== 'active') await queuedJob.remove();
  }
  catch { /* The worker checks the durable cancellation state before continuing. */ }
  const [statusRows]: any = await pool().query('SELECT status FROM image_studio_jobs WHERE id=? LIMIT 1', [jobId]);
  return { id: jobId, status: String(statusRows[0]?.status || 'cancelling') };
}

export async function retryImageStudioJob(jobId: string, user: AuthUserPayload) {
  const [jobs]: any = await pool().query('SELECT project_id,model_profile_id,job_type,request_json FROM image_studio_jobs WHERE id=? AND owner_id=? LIMIT 1', [jobId, user.id]);
  if (!jobs[0]) fail('任务不存在或无权访问', 404, 'IMAGE_STUDIO_JOB_NOT_FOUND');
  if (String(jobs[0].job_type) === 'export') {
    const connection = await pool().getConnection();
    const timestamp = now();
    try {
      await connection.beginTransaction();
      const [exports]: any = await connection.query(`SELECT e.project_id,e.manifest_json,e.image_count,e.status
        FROM image_studio_exports e JOIN image_studio_jobs j ON j.id=e.job_id
        WHERE e.job_id=? AND e.owner_id=? FOR UPDATE`, [jobId, user.id]);
      if (!exports[0] || String(exports[0].status) !== 'failed') fail('只有失败的导出任务可以重试', 409, 'IMAGE_STUDIO_EXPORT_NOT_RETRYABLE');
      const projectId = String(exports[0].project_id);
      const manifest = parse<Array<Record<string, any>>>(exports[0].manifest_json, []);
      const [active]: any = await connection.query(`SELECT COUNT(*) AS total FROM image_studio_jobs
        WHERE owner_id=? AND status IN ('queued','running','cancelling')`, [user.id]);
      if (Number(active[0]?.total || 0) >= Number(process.env.IMAGE_STUDIO_MAX_ACTIVE_JOBS_PER_USER || 5)) fail('当前后台任务较多，请等待部分任务完成后再提交', 429, 'IMAGE_STUDIO_ACTIVE_LIMIT');
      const newJobId = randomUUID();
      const exportId = randomUUID();
      const imageCount = Number(exports[0].image_count);
      await connection.query(`INSERT INTO image_studio_jobs
        (id,project_id,owner_id,job_type,status,idempotency_key,request_json,model_profile_id,progress,attempt_count,created_at,updated_at)
        VALUES (?,?,?,'export','queued',?,?,NULL,0,0,?,?)`, [newJobId, projectId, user.id, `retry:${jobId}:${randomUUID()}`, json({ exportId, imageCount, retryOf: jobId }), timestamp, timestamp]);
      await connection.query(`INSERT INTO image_studio_exports
        (id,job_id,project_id,owner_id,manifest_json,image_count,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'queued',?,?)`, [exportId, newJobId, projectId, user.id, json(manifest), imageCount, timestamp, timestamp]);
      const outboxId = randomUUID();
      await connection.query(`INSERT INTO image_studio_outbox (id,job_id,queue_name,job_name,payload_json,status,attempts,available_at,created_at)
        VALUES (?,?,?,'export-selected-images',?,'pending',0,?,?)`, [outboxId, newJobId, IMAGE_STUDIO_QUEUES.export, json({ jobId: newJobId }), timestamp, timestamp]);
      await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
        VALUES (?,?,?,'job.accepted',?,?)`, [newJobId, projectId, user.id, json({ jobId: newJobId, status: 'queued', exportId, imageCount }), timestamp]);
      await audit(connection, user.id, 'generation.export.retry', exportId, projectId, { retryOf: jobId, count: imageCount });
      await connection.commit();
      return { id: newJobId, jobId: newJobId, exportId, status: 'queued', imageCount, duplicate: false };
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  if (jobs[0].job_type === 'text_task') {
    const request = parse<Record<string, any>>(jobs[0].request_json, {});
    let sourceData: Record<string, unknown> | undefined;
    if (request.operation === 'chat_intake_extract') {
      const [intakes]: any = await pool().query('SELECT source_type,source_conversation_id,source_data_json FROM image_studio_chat_intakes WHERE id=? AND owner_id=? LIMIT 1', [jobId, user.id]);
      if (intakes[0]) sourceData = parse<Record<string, unknown> | undefined>(intakes[0].source_data_json, undefined);
      return createImageStudioTextJob(String(jobs[0].project_id), user, { ...request, operation: request.operation, context: request.context || {},
        referenceAssetIds: request.referenceAssetIds || [], sourceType: String(intakes[0]?.source_type || 'screenshots') as 'screenshots' | 'collaboration' | 'invite',
        sourceConversationId: intakes[0]?.source_conversation_id ? String(intakes[0].source_conversation_id) : undefined, sourceData,
        sourceTitle: (sourceData as any)?.conversation?.title, idempotencyKey: `retry:${jobId}:${randomUUID()}`, modelProfileId: String(jobs[0].model_profile_id) });
    }
    return createImageStudioTextJob(String(jobs[0].project_id), user, { ...request, operation: request.operation, context: request.context || {}, referenceAssetIds: request.referenceAssetIds || [], idempotencyKey: `retry:${jobId}:${randomUUID()}`, modelProfileId: String(jobs[0].model_profile_id) });
  }
  const [rows]: any = await pool().query(`SELECT slot_key,shot_id,prompt,reference_asset_ids,parameters_json FROM image_studio_generations
    WHERE job_id=? AND status='failed' ORDER BY created_at,id`, [jobId]);
  if (!rows.length) fail('当前任务没有可重试的失败项', 409, 'IMAGE_STUDIO_NOTHING_TO_RETRY');
  const generations = rows.map((row: any) => ({ slotKey: String(row.slot_key), shotId: row.shot_id || undefined, prompt: String(row.prompt),
    referenceAssetIds: parse(row.reference_asset_ids, []), parameters: parse(row.parameters_json, {}) }));
  return createImageStudioGenerationJob(String(jobs[0].project_id), user, { idempotencyKey: `retry:${jobId}:${randomUUID()}`,
    modelProfileId: String(jobs[0].model_profile_id), generations });
}

export async function getImageStudioEvents(projectId: string, user: AuthUserPayload, afterEventId: number, limit = 500) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT event_id,job_id,event_type,payload_json,created_at FROM image_studio_job_events
    WHERE project_id=? AND owner_id=? AND event_id>? ORDER BY event_id LIMIT ?`, [projectId, user.id, afterEventId, limit]);
  return rows.map((row: any) => ({ id: Number(row.event_id), jobId: String(row.job_id), type: String(row.event_type), payload: parse(row.payload_json, {}), createdAt: new Date(row.created_at).toISOString() }));
}

export async function attachImageStudioAsset(projectId: string, user: AuthUserPayload, mediaAssetId: string, role: string) {
  if (!isOssConfigured) fail('生图工作台要求配置私有 OSS 存储', 503, 'IMAGE_STUDIO_OSS_UNAVAILABLE');
  const mediaAsset = await findMediaAsset(mediaAssetId);
  if (!mediaAsset || mediaAsset.ownerId !== user.id || mediaAsset.kind !== 'image' || !mediaAsset.ossOriginalKey) {
    fail('上传图片不存在、尚未完成 OSS 登记或无权使用', 400, 'IMAGE_STUDIO_ASSET_INVALID');
  }
  const timestamp = now();
  const studioAssetId = randomUUID();
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    await connection.query(`INSERT INTO image_studio_assets
      (id,project_id,owner_id,media_asset_id,kind,role,object_key,filename,mime_type,size_bytes,source,created_at)
      VALUES (?,?,?,?,'image',?,?,?,?,?,'upload',?)
      ON DUPLICATE KEY UPDATE role=VALUES(role),deleted_at=NULL`,
    [studioAssetId, projectId, user.id, mediaAsset.id, role, mediaAsset.ossOriginalKey, mediaAsset.filename, mediaAsset.mimetype, mediaAsset.size, timestamp]);
    const [attached]: any = await connection.query('SELECT id FROM image_studio_assets WHERE project_id=? AND media_asset_id=? LIMIT 1', [projectId, mediaAsset.id]);
    const id = String(attached[0]?.id || studioAssetId);
    await audit(connection, user.id, 'asset.attach', id, projectId, { role, size: mediaAsset.size, mimeType: mediaAsset.mimetype });
    await connection.commit();
    return { id, role, filename: mediaAsset.filename, mimeType: mediaAsset.mimetype, size: mediaAsset.size,
      previewUrl: `/api/image-studio/assets/${encodeURIComponent(id)}/preview`, source: 'upload', createdAt: timestamp.toISOString() };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function listImageStudioAssets(projectId: string, user: AuthUserPayload) {
  await getImageStudioProject(projectId, user);
  const [rows]: any = await pool().query(`SELECT a.id,a.kind,a.role,a.filename,a.mime_type,a.size_bytes,a.catalog_json,a.source,a.created_at,
      n.ai_json,n.manual_json,n.source_job_id,n.version AS annotation_version
    FROM image_studio_assets a LEFT JOIN image_studio_asset_annotations n ON n.asset_id=a.id AND n.project_id=a.project_id AND n.owner_id=a.owner_id
    WHERE a.project_id=? AND a.owner_id=? AND a.deleted_at IS NULL ORDER BY a.created_at,a.id`, [projectId, user.id]);
  return rows.map((row: any) => ({ id: String(row.id), kind: String(row.kind), role: String(row.role), filename: String(row.filename),
    mimeType: String(row.mime_type), size: Number(row.size_bytes),
    catalog: { ai: parse(row.ai_json, parse(row.catalog_json, null)), manual: parse(row.manual_json, {}),
      effective: { ...(parse(row.ai_json, parse(row.catalog_json, null)) || {}), ...(parse(row.manual_json, {}) || {}) },
      sourceJobId: row.source_job_id || null, version: Number(row.annotation_version || 1) }, source: String(row.source),
    previewUrl: `/api/image-studio/assets/${encodeURIComponent(String(row.id))}/preview`, createdAt: new Date(row.created_at).toISOString() }));
}

export async function updateImageStudioAsset(projectId: string, assetId: string, user: AuthUserPayload,
  input: { role?: string; manualCatalog?: Partial<Record<'what' | 'spec' | 'color' | 'use', string>>; version?: number }) {
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const [projects]: any = await connection.query('SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'IMAGE_STUDIO_PROJECT_NOT_FOUND');
    const [assets]: any = await connection.query(`SELECT id,catalog_json FROM image_studio_assets
      WHERE id=? AND project_id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE`, [assetId, projectId, user.id]);
    if (!assets[0]) fail('素材不存在或无权访问', 404, 'IMAGE_STUDIO_ASSET_NOT_FOUND');
    if (input.role) await connection.query('UPDATE image_studio_assets SET role=? WHERE id=?', [input.role, assetId]);
    if (input.manualCatalog) {
      const [annotations]: any = await connection.query(`SELECT id,ai_json,manual_json,version FROM image_studio_asset_annotations
        WHERE asset_id=? AND project_id=? AND owner_id=? FOR UPDATE`, [assetId, projectId, user.id]);
      const current = annotations[0];
      const currentVersion = Number(current?.version || 1);
      if (input.version !== currentVersion) fail('素材档案已在其他页面更新，请刷新后再保存', 409, 'IMAGE_STUDIO_VERSION_CONFLICT');
      const manual = parse<Record<string, string>>(current?.manual_json, {});
      for (const key of ['what', 'spec', 'color', 'use'] as const) {
        if (input.manualCatalog[key] !== undefined) manual[key] = String(input.manualCatalog[key]).trim().slice(0, 500);
      }
      const timestamp = now();
      if (current) {
        await connection.query(`UPDATE image_studio_asset_annotations SET manual_json=?,version=version+1,updated_at=? WHERE id=?`, [json(manual), timestamp, current.id]);
      } else {
        await connection.query(`INSERT INTO image_studio_asset_annotations
          (id,project_id,owner_id,asset_id,ai_json,manual_json,source_job_id,version,created_at,updated_at)
          VALUES (?,?,?,?,?,?,NULL,2,?,?)`, [randomUUID(), projectId, user.id, assetId, parse(assets[0].catalog_json, null) ? json(parse(assets[0].catalog_json, null)) : null, json(manual), timestamp, timestamp]);
      }
    }
    await audit(connection, user.id, 'asset.update', assetId, projectId, { role: input.role, manualCatalogChanged: Boolean(input.manualCatalog) });
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  return (await listImageStudioAssets(projectId, user)).find((asset: any) => asset.id === assetId);
}

export async function claimOutbox(connection: PoolConnection, batchSize: number) {
  const [rows]: any = await connection.query(`SELECT * FROM image_studio_outbox
    WHERE (status='pending' AND available_at<=NOW(3)) OR (status='dispatching' AND locked_until<NOW(3))
    ORDER BY created_at LIMIT ? FOR UPDATE`, [batchSize]);
  if (!rows.length) return [];
  const ids = rows.map((row: any) => String(row.id));
  await connection.query(`UPDATE image_studio_outbox SET status='dispatching',locked_until=DATE_ADD(NOW(3),INTERVAL 60 SECOND),attempts=attempts+1
    WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return rows;
}

export async function writeJobEvent(job: any, eventType: string, payload: Record<string, unknown>, status?: string) {
  const timestamp = now();
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    if (status) {
      await connection.query(`UPDATE image_studio_jobs SET status=?,progress=?,updated_at=?,
        started_at=IF(?='running' AND started_at IS NULL,?,started_at),completed_at=IF(? IN ('completed','partial','failed','cancelled'),?,completed_at)
        WHERE id=?`, [status, Number(payload.progress ?? 0), timestamp, status, timestamp, status, timestamp, job.id]);
      if (job.operation === 'chat_intake_extract') {
        const intakeStatus = status === 'running' ? 'processing' : ['cancelled', 'failed'].includes(status) ? status : null;
        if (intakeStatus) await connection.query('UPDATE image_studio_chat_intakes SET status=?,updated_at=? WHERE id=?', [intakeStatus, timestamp, job.id]);
      }
      if (job.operation === 'plan_agent' && ['running', 'cancelled', 'failed'].includes(status)) {
        const runStatus = status === 'running' ? 'processing' : status;
        await connection.query(`UPDATE image_studio_plan_runs SET status=?,updated_at=?,completed_at=IF(? IN ('cancelled','failed'),?,completed_at)
          WHERE job_id=? AND status IN ('queued','processing')`, [runStatus, timestamp, runStatus, timestamp, job.id]);
      }
    } else if (typeof payload.progress === 'number') {
      await connection.query('UPDATE image_studio_jobs SET progress=?,updated_at=? WHERE id=?', [payload.progress, timestamp, job.id]);
    }
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,?,?,?)`, [job.id, job.projectId, job.ownerId, eventType, json({ jobId: job.id, ...payload }), timestamp]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function loadGenerationJob(jobId: string) {
  const [jobs]: any = await pool().query('SELECT * FROM image_studio_jobs WHERE id=? LIMIT 1', [jobId]);
  if (!jobs[0]) fail('后台任务记录不存在', 404, 'IMAGE_STUDIO_JOB_NOT_FOUND');
  const [generations]: any = await pool().query('SELECT * FROM image_studio_generations WHERE job_id=? ORDER BY created_at,id', [jobId]);
  return { id: String(jobs[0].id), projectId: String(jobs[0].project_id), ownerId: String(jobs[0].owner_id), status: String(jobs[0].status),
    profileId: String(jobs[0].model_profile_id), generations };
}

export async function loadImageStudioTextJob(jobId: string) {
  const [rows]: any = await pool().query('SELECT * FROM image_studio_jobs WHERE id=? LIMIT 1', [jobId]);
  if (!rows[0]) fail('后台任务记录不存在', 404, 'IMAGE_STUDIO_JOB_NOT_FOUND');
  const request = parse<Record<string, any>>(rows[0].request_json, {});
  return { id: String(rows[0].id), projectId: String(rows[0].project_id), ownerId: String(rows[0].owner_id), profileId: String(rows[0].model_profile_id),
    status: String(rows[0].status), operation: String(request.operation), context: request.context || {}, referenceAssetIds: request.referenceAssetIds || [] };
}

export async function saveImageStudioTextResult(job: { id: string; projectId: string; ownerId: string; operation?: string; context?: Record<string, any>; referenceAssetIds?: string[] }, result: unknown) {
  let agentProfileIds: string[] = [];
  let normalizedResult: any = job.operation === 'chat_intake_extract' ? normalizeChatBrief(result) : job.operation === 'plan_agent' ? normalizeImagePlan(result) : result;
  if (job.operation === 'plan_agent' && normalizedResult && typeof normalizedResult === 'object') {
    agentProfileIds = normalizedResult.agentProfileIds || [];
    const { agentProfileIds: _internalProfiles, ...publicPlan } = normalizedResult;
    normalizedResult = publicPlan;
  }
  const resultText = json(normalizedResult);
  if (Buffer.byteLength(resultText, 'utf8') > 512 * 1024) fail('AI 输出超过保存大小限制', 502, 'IMAGE_STUDIO_RESULT_TOO_LARGE');
  const connection = await pool().getConnection();
  const timestamp = now();
  try {
    await connection.beginTransaction();
    const [updated]: any = await connection.query(`UPDATE image_studio_jobs SET result_json=?,status='completed',progress=100,completed_at=?,updated_at=?
      WHERE id=? AND status IN ('queued','running')`, [resultText, timestamp, timestamp, job.id]);
    if (!updated.affectedRows) { await connection.commit(); return false; }
    if (job.operation === 'chat_intake_extract') {
      const [intakeUpdated]: any = await connection.query(`UPDATE image_studio_chat_intakes SET brief_json=?,status='needs_review',version=version+1,
        error_code=NULL,error_message=NULL,updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','processing')`,
      [resultText, timestamp, job.id, job.ownerId]);
      if (!intakeUpdated.affectedRows) fail('聊天需求档案状态已变化，识别结果未提交', 409, 'IMAGE_STUDIO_CHAT_INTAKE_STATE_CHANGED');
    }
    if (job.operation === 'plan_agent') {
      const [runs]: any = await connection.query('SELECT id FROM image_studio_plan_runs WHERE job_id=? AND owner_id=? FOR UPDATE', [job.id, job.ownerId]);
      if (!runs[0]) fail('图片方案任务档案缺失，结果未提交', 409, 'IMAGE_STUDIO_PLAN_RUN_MISSING');
      await connection.query(`INSERT INTO image_studio_plan_versions
        (id,run_id,project_id,owner_id,version,plan_json,status,created_at,updated_at)
        VALUES (?,?,?,?,1,?,'needs_review',?,?)`, [randomUUID(), runs[0].id, job.projectId, job.ownerId, resultText, timestamp, timestamp]);
      await connection.query(`UPDATE image_studio_plan_runs SET status='needs_review',updated_at=?,completed_at=? WHERE id=?`, [timestamp, timestamp, runs[0].id]);
      await connection.query(`UPDATE image_studio_plan_runs SET model_profile_ids_json=? WHERE id=?`, [json(agentProfileIds), runs[0].id]);
    }
    if (job.operation === 'creative_candidates' || job.operation === 'product_analyze') {
      const resultObject = result as Record<string, any>;
      const candidatesByDimension: Partial<Record<CreativeDimensionKey, unknown[]>> = job.operation === 'creative_candidates'
        ? { [job.context?.dimension as CreativeDimensionKey]: Array.isArray(resultObject?.candidates) ? resultObject.candidates : [] }
        : {
          selling: resultObject?.sellingPoints,
          pain: resultObject?.painPoints,
          main_direction: resultObject?.mainDirection,
          target_audience: resultObject?.targetAudience,
          usage_scenario: resultObject?.usageScenarios,
          visual_style: resultObject?.visualStyle,
        };
      let persistedCandidateCount = 0;
      for (const dimension of CREATIVE_DIMENSIONS) {
        const rawCandidates = candidatesByDimension[dimension.key];
        if (!Array.isArray(rawCandidates)) continue;
        const unique = new Set<string>();
        for (const text of rawCandidates) {
          if (typeof text !== 'string') continue;
          const normalized = text.trim().slice(0, 500);
          const hash = candidateHash(normalized);
          if (!normalized || unique.has(hash)) continue;
          unique.add(hash);
          const candidateIndex = unique.size - 1;
          if (candidateIndex >= 20) break;
          await connection.query(`INSERT INTO image_studio_creative_candidates
            (id,project_id,owner_id,dimension_key,candidate_text,candidate_hash,source_job_id,candidate_index,status,created_at)
            VALUES (?,?,?,?,?,?,?,?, 'pending',?)`, [randomUUID(), job.projectId, job.ownerId, dimension.key, normalized, hash, job.id, candidateIndex, timestamp]);
          persistedCandidateCount++;
        }
      }
      if (job.operation === 'creative_candidates' && persistedCandidateCount === 0) fail('创作方向候选结果无效', 502, 'IMAGE_STUDIO_CANDIDATES_INVALID');
    }
    if (job.operation === 'asset_annotate') {
      const requestedIds = new Set(job.referenceAssetIds || []);
      const annotations = Array.isArray((result as any)?.assets) ? (result as any).assets : [];
      const [assetRows]: any = requestedIds.size ? await connection.query(`SELECT id FROM image_studio_assets
        WHERE project_id=? AND owner_id=? AND deleted_at IS NULL AND id IN (${[...requestedIds].map(() => '?').join(',')})`,
      [job.projectId, job.ownerId, ...requestedIds]) : [[]];
      const ownedIds = new Set(assetRows.map((row: any) => String(row.id)));
      const [currentJobRows]: any = await connection.query('SELECT created_at FROM image_studio_jobs WHERE id=?', [job.id]);
      const currentJobCreatedAt = currentJobRows[0] ? new Date(currentJobRows[0].created_at).getTime() : 0;
      const seen = new Set<string>();
      for (const annotation of annotations) {
        const assetId = typeof annotation?.assetId === 'string' ? annotation.assetId : '';
        if (!assetId || !requestedIds.has(assetId) || !ownedIds.has(assetId) || seen.has(assetId)) continue;
        seen.add(assetId);
        const confidence = Number(annotation.confidence);
        const aiCatalog = {
          what: typeof annotation.what === 'string' ? annotation.what.trim().slice(0, 500) : '',
          spec: typeof annotation.spec === 'string' ? annotation.spec.trim().slice(0, 500) : '',
          color: typeof annotation.color === 'string' ? annotation.color.trim().slice(0, 500) : '',
          use: typeof annotation.use === 'string' ? annotation.use.trim().slice(0, 120) : '',
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : null,
        };
        const [existingRows]: any = await connection.query(`SELECT source_job_id FROM image_studio_asset_annotations
          WHERE asset_id=? AND project_id=? AND owner_id=? FOR UPDATE`, [assetId, job.projectId, job.ownerId]);
        const previousJobId = existingRows[0]?.source_job_id;
        if (previousJobId && String(previousJobId) !== job.id) {
          const [previousJobRows]: any = await connection.query('SELECT created_at FROM image_studio_jobs WHERE id=?', [previousJobId]);
          if (previousJobRows[0] && new Date(previousJobRows[0].created_at).getTime() > currentJobCreatedAt) continue;
        }
        await connection.query(`INSERT INTO image_studio_asset_annotations
          (id,project_id,owner_id,asset_id,ai_json,manual_json,source_job_id,version,created_at,updated_at)
          VALUES (?,?,?,?,?,'{}',?,1,?,?)
          ON DUPLICATE KEY UPDATE ai_json=VALUES(ai_json),source_job_id=VALUES(source_job_id),version=version+1,updated_at=VALUES(updated_at)`,
        [randomUUID(), job.projectId, job.ownerId, assetId, json(aiCatalog), job.id, timestamp, timestamp]);
      }
    }
    await connection.query(`INSERT INTO image_studio_job_events (job_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,'job.completed',?,?)`, [job.id, job.projectId, job.ownerId, json({ jobId: job.id, status: 'completed', progress: 100, resultAvailable: true }), timestamp]);
    await connection.commit();
    return true;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function loadImageStudioProfile(profileId: string) {
  const [rows]: any = await pool().query('SELECT * FROM image_studio_model_profiles WHERE id=? AND capability=\'image\' AND enabled=1 LIMIT 1', [profileId]);
  return rows[0] || null;
}

export async function loadImageStudioAsset(projectId: string, assetId: string, ownerId: string) {
  const [rows]: any = await pool().query(`SELECT * FROM image_studio_assets WHERE id=? AND project_id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1`, [assetId, projectId, ownerId]);
  return rows[0] || null;
}

export async function markGenerationRunning(generationId: string, modelName: string) {
  await pool().query(`UPDATE image_studio_generations SET status='running',model_name=?,started_at=COALESCE(started_at,?) WHERE id=? AND status<>'completed'`, [modelName, now(), generationId]);
}

export async function saveGenerationOutput(input: { generationId: string; projectId: string; ownerId: string; objectKey: string; filename: string; mimeType: string; size: number }) {
  const connection = await pool().getConnection();
  const assetId = randomUUID(); const timestamp = now();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query('SELECT job_id FROM image_studio_generations WHERE id=? LIMIT 1', [input.generationId]);
    if (!rows[0]) fail('生成槽位不存在', 404, 'IMAGE_STUDIO_GENERATION_NOT_FOUND');
    const [projects]: any = await connection.query('SELECT deleted_at FROM image_studio_projects WHERE id=? AND owner_id=? FOR UPDATE', [input.projectId, input.ownerId]);
    const [jobs]: any = await connection.query('SELECT status FROM image_studio_jobs WHERE id=? AND owner_id=? FOR UPDATE', [rows[0].job_id, input.ownerId]);
    if (!projects[0] || projects[0].deleted_at || !jobs[0] || ['cancelling', 'cancelled'].includes(String(jobs[0].status))) {
      await connection.query(`UPDATE image_studio_generations SET status='cancelled',completed_at=? WHERE id=? AND status<>'completed'`, [timestamp, input.generationId]);
      await connection.commit(); return null;
    }
    const [lockedGeneration]: any = await connection.query('SELECT output_asset_id FROM image_studio_generations WHERE id=? FOR UPDATE', [input.generationId]);
    if (lockedGeneration[0]?.output_asset_id) { await connection.commit(); return String(lockedGeneration[0].output_asset_id); }
    await connection.query(`INSERT INTO image_studio_assets (id,project_id,owner_id,kind,role,object_key,filename,mime_type,size_bytes,source,created_at)
      VALUES (?,?,?,'generated','generation',?,?,?,?, 'generated',?)`, [assetId, input.projectId, input.ownerId, input.objectKey, input.filename, input.mimeType, input.size, timestamp]);
    await connection.query(`UPDATE image_studio_generations SET status='completed',output_asset_id=?,output_object_key=?,completed_at=? WHERE id=?`, [assetId, input.objectKey, timestamp, input.generationId]);
    await connection.commit();
    return assetId;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function markGenerationFailed(generationId: string, code: string, message: string) {
  const clipped = message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 768);
  await pool().query(`UPDATE image_studio_generations SET status='failed',error_code=?,error_message=?,completed_at=? WHERE id=? AND status<>'completed'`, [code.slice(0, 64), clipped, now(), generationId]);
}

export async function loadProjectAssets(projectId: string, ownerId: string, assetIds: string[]) {
  if (!assetIds.length) return [];
  const [rows]: any = await pool().query(`SELECT * FROM image_studio_assets WHERE project_id=? AND owner_id=? AND deleted_at IS NULL
    AND id IN (${assetIds.map(() => '?').join(',')})`, [projectId, ownerId, ...assetIds]);
  if (rows.length !== assetIds.length) fail('参考素材不存在或无权访问', 400, 'IMAGE_STUDIO_ASSET_INVALID');
  return rows;
}
