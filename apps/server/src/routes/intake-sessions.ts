import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate, type AuthUserPayload } from '../middleware/auth.middleware.js';
import { CARD_PREFIX, getConversationAssignment, getConversationTransferHistory, hasConversationImageAccess, parseCard, requireChatDatabase, transferServiceConversation } from '../services/chat.js';
import { isCustomerServiceOnline, publishIntakeMessage } from '../socket/chat-socket.js';
import { getDefaultEnabledAiConfig, getEnabledAiModelProfileCredentials, openAiChatCompletionsEndpoint } from '../services/ai-config.js';
import { fetchAiJson } from '../services/ai-call-log.js';

export const intakeSessionsRouter = Router();
const ok = (data: unknown) => ({ code: 200, success: true, data });
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const present = (row: any) => {
  const serviceUserId = row.assigned_service_id
    || (['customer_service', 'admin'].includes(row.creator_role) ? row.creator_id : null)
    || (['customer_service', 'admin'].includes(row.guest_role) ? row.guest_id : null);
  return {
  id: row.id, title: row.title, creatorId: row.creator_id, creatorName: row.creator_name,
  creatorRole: row.creator_role || null, guestRole: row.guest_role || null,
  guestId: row.guest_id || null, guestName: row.guest_name || null, status: row.status,
  lastSeq: Number(row.last_seq), updatedAt: row.updated_at,
  assignedServiceId: row.assigned_service_id || null, assignedServiceName: row.assigned_service_name || null,
  customerServiceOnline: isCustomerServiceOnline(serviceUserId),
  };
};
async function member(id: string, user: AuthUserPayload) {
  const serviceAccess = ['customer_service', 'admin'].includes(user.role);
  const [rows]: any = await requireChatDatabase().query(`SELECT s.*,a.assigned_service_id,a.assigned_service_name,
      creator.role AS creator_role, guest.role AS guest_role
    FROM intake_sessions s
    LEFT JOIN users creator ON creator.id=s.creator_id
    LEFT JOIN users guest ON guest.id=s.guest_id
    LEFT JOIN service_conversation_assignments a ON a.conversation_type='intake' AND a.conversation_id=s.id
    WHERE s.id=? AND (${serviceAccess ? '1=1' : '(s.creator_id=? OR s.guest_id=?)'}) LIMIT 1`, serviceAccess ? [id] : [id, user.id, user.id]);
  if (!rows[0]) fail('会话不存在或无权访问', 404);
  return rows[0];
}
function canManageInvitation(session: any, user: AuthUserPayload) {
  return session.creator_id === user.id || user.role === 'admin' || (user.role === 'customer_service' && session.assigned_service_id === user.id);
}
intakeSessionsRouter.use(authenticate);
intakeSessionsRouter.get('/', async (req, res, next) => {
  try {
    const isService = ['customer_service', 'admin'].includes(req.user!.role);
    const [rows]: any = await requireChatDatabase().query(`SELECT s.*,a.assigned_service_id,a.assigned_service_name FROM intake_sessions s
      LEFT JOIN service_conversation_assignments a ON a.conversation_type='intake' AND a.conversation_id=s.id
      ${isService ? '' : 'WHERE s.creator_id=? OR s.guest_id=?'} ORDER BY s.updated_at DESC LIMIT 100`, isService ? [] : [req.user!.id, req.user!.id]);
    res.json(ok(rows.map(present)));
  } catch (error) { next(error); }
});
intakeSessionsRouter.post('/', async (req, res, next) => {
  try {
    const { title } = z.object({ title: z.string().trim().min(2).max(120) }).strict().parse(req.body);
    const user = req.user!;
    if (!['customer_service', 'admin', 'advertiser'].includes(user.role)) fail('当前账号不能创建会话', 403);
    const id = randomUUID();
    await requireChatDatabase().query('INSERT INTO intake_sessions (id, title, creator_id, creator_name) VALUES (?,?,?,?)', [id, title, user.id, user.name]);
    if (user.role === 'customer_service') await requireChatDatabase().query(`INSERT INTO service_conversation_assignments (conversation_type,conversation_id,assigned_service_id,assigned_service_name,assigned_by_id,assigned_by_name) VALUES ('intake',?,?,?,?,?)`, [id, user.id, user.name, user.id, user.name]);
    res.status(201).json(ok(present(await member(id, user))));
  } catch (error) { next(error); }
});
intakeSessionsRouter.get('/:id', async (req, res, next) => {
  try { res.json(ok(present(await member(req.params.id, req.user!)))); } catch (error) { next(error); }
});

intakeSessionsRouter.get('/:id/transfers', async (req, res, next) => {
  try {
    if (!['customer_service', 'admin'].includes(req.user!.role)) return res.status(403).json({ code: 403, success: false, message: '只有客服可以查看转接记录' });
    await member(req.params.id, req.user!);
    res.json(ok(await getConversationTransferHistory('intake', req.params.id)));
  } catch (error) { next(error); }
});

intakeSessionsRouter.post('/:id/transfer', async (req, res, next) => {
  try {
    if (!['customer_service', 'admin'].includes(req.user!.role)) return res.status(403).json({ code: 403, success: false, message: '只有客服可以转接会话' });
    const body = z.object({ toServiceId: z.string().min(1).max(64), note: z.string().trim().max(500).default('') }).strict().parse(req.body);
    res.json(ok(await transferServiceConversation('intake', req.params.id, body.toServiceId, body.note, req.user!)));
  } catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ code: 400, success: false, message: '转接信息无效' }); next(error); }
});
intakeSessionsRouter.post('/:id/invite', async (req, res, next) => {
  try {
    const session = await member(req.params.id, req.user!);
    if (!canManageInvitation(session, req.user!)) fail('只有会话创建者或当前接待客服可以分享会话', 403);
    if (session.guest_id) fail('此会话已有参与者', 409);
    const token = randomBytes(12).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await requireChatDatabase().query('UPDATE intake_sessions SET invite_hash=?, invite_expires_at=? WHERE id=? AND guest_id IS NULL', [hash(token), expiresAt, session.id]);
    res.json(ok({ token, expiresAt: expiresAt.toISOString(), path: `/pages/invite/join?token=${encodeURIComponent(token)}` }));
  } catch (error) { next(error); }
});
let cachedAccessToken: { value: string; expiresAt: number } | null = null;
async function wechatAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value;
  const appId = String(process.env.WECHAT_MINI_APP_ID || '').trim();
  const secret = String(process.env.WECHAT_MINI_APP_SECRET || '').trim();
  if (!appId || !secret) fail('小程序码尚未配置微信 AppID 与 AppSecret', 503);
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential'); url.searchParams.set('appid', appId); url.searchParams.set('secret', secret);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) return fail('获取微信接口凭证失败', 502);
  cachedAccessToken = { value: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000 };
  return data.access_token;
}
intakeSessionsRouter.post('/:id/invite-code', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().length(16) }).strict().parse(req.body);
    const session = await member(req.params.id, req.user!);
    if (!canManageInvitation(session, req.user!) || session.guest_id || session.invite_hash !== hash(token) || !session.invite_expires_at || new Date(session.invite_expires_at).getTime() <= Date.now()) fail('邀请已失效，请重新生成', 410);
    const accessToken = await wechatAccessToken();
    const response = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'pages/invite/join', scene: token, check_path: false, width: 430 }),
      signal: AbortSignal.timeout(10000),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('json')) fail('生成小程序码失败，请检查小程序配置', 502);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { next(error); }
});
intakeSessionsRouter.post('/join', async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().length(16) }).strict().parse(req.body);
    const pool = requireChatDatabase(); const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows]: any = await connection.query('SELECT * FROM intake_sessions WHERE invite_hash=? FOR UPDATE', [hash(token)]);
      const session = rows[0];
      if (!session || session.status !== 'open' || !session.invite_expires_at || new Date(session.invite_expires_at).getTime() <= Date.now()) fail('邀请已失效，请联系发起人重新分享', 410);
      if (session.creator_id === req.user!.id) fail('不能加入自己创建的会话', 409);
      if (req.user!.role !== 'advertiser') fail('请使用品牌方账号加入', 403);
      if (session.guest_id && session.guest_id !== req.user!.id) fail('此会话已有参与者', 409);
      if (!session.guest_id) await connection.query('UPDATE intake_sessions SET guest_id=?, guest_name=?, updated_at=NOW(3) WHERE id=?', [req.user!.id, req.user!.name, session.id]);
      await connection.commit();
      res.json(ok({ id: session.id }));
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) { next(error); }
});
intakeSessionsRouter.get('/:id/messages', async (req, res, next) => {
  try {
    await member(req.params.id, req.user!);
    const { afterSeq } = z.object({ afterSeq: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    const [rows]: any = await requireChatDatabase().query('SELECT id, session_id AS sessionId, seq, sender_id AS senderId, sender_name AS senderName, client_message_id AS clientMessageId, body, created_at AS createdAt FROM intake_messages WHERE session_id=? AND seq>? ORDER BY seq LIMIT 101', [req.params.id, afterSeq]);
    res.json(ok({ messages: rows.slice(0, 100).map((row: any) => ({ ...row, seq: Number(row.seq) })), hasMore: rows.length > 100 }));
  } catch (error) { next(error); }
});
intakeSessionsRouter.post('/:id/summary', async (req, res, next) => {
  try {
    const { modelProfileId } = z.object({ modelProfileId: z.string().trim().min(1).max(64).optional() }).strict().parse(req.body ?? {});
    const session = await member(req.params.id, req.user!);
    const activeConfig = modelProfileId ? await getEnabledAiModelProfileCredentials(modelProfileId, ['text', 'vision']) : await getDefaultEnabledAiConfig();
    if (!activeConfig) throw Object.assign(new Error(modelProfileId ? '所选文生文模型不存在、未启用或能力不匹配' : 'AI 总结服务尚未配置，请在管理后台启用模型配置'), { status: modelProfileId ? 409 : 503 });
    const { baseUrl, apiKey, model } = activeConfig;

    const [rows]: any = await requireChatDatabase().query('SELECT id,seq,sender_id,sender_name,body,created_at FROM intake_messages WHERE session_id=? ORDER BY seq DESC LIMIT 200', [session.id]);
    const ordered = [...rows].reverse();
    const messageById = new Map(ordered.map((row: any) => [String(row.id), row]));
    const brandIds = new Set([session.creator_role === 'advertiser' ? session.creator_id : null, session.guest_role === 'advertiser' ? session.guest_id : null].filter(Boolean));
    const latestFormAnswerBySender = new Map<string, string>();
    for (const row of ordered) {
      const card = parseCard(String(row.body || ''));
      if (card?.kind === 'form_answers' && brandIds.has(row.sender_id)) latestFormAnswerBySender.set(`${row.sender_id}:${card.formMessageId}`, String(row.id));
    }
    const transcript = ordered.flatMap((row: any) => {
      const body = String(row.body || '');
      const card = parseCard(body);
      if (card?.kind === 'work_card' && card.templateId === 'intake_checklist') {
        return [`${row.sender_name} 发出表单「${card.title}」：${card.fields.map((field, index) => `${index + 1}. ${field.label}${field.options?.length ? `（可选：${field.options.join('、')}）` : ''}`).join('；')}`];
      }
      if (card?.kind === 'form_answers' && brandIds.has(row.sender_id)) {
        if (latestFormAnswerBySender.get(`${row.sender_id}:${card.formMessageId}`) !== String(row.id)) return [];
        const formRow: any = messageById.get(card.formMessageId);
        const form = formRow ? parseCard(String(formRow.body || '')) : null;
        if (form?.kind !== 'work_card' || form.templateId !== 'intake_checklist') return [];
        return [`${row.sender_name} 提交「${form.title}」：${card.answers.map((answer) => `${form.fields[answer.fieldIndex]?.label || `问题${answer.fieldIndex + 1}`}：${answer.value}`).join('；')}`];
      }
      if (card) {
        if (card.kind === 'choice_answer' || card.kind === 'decision' || card.kind === 'requirement_review') return [`${row.sender_name} 的协作反馈：${JSON.stringify(card)}`];
        return [];
      }
      const text = body.trim();
      return text ? [`${row.sender_name}：${text.slice(0, 2000)}`] : [];
    }).slice(-120).join('\n').slice(-24000);
    if (!transcript.trim()) fail('当前会话还没有可用于总结的聊天或表单内容', 400);

    const endpoint = openAiChatCompletionsEndpoint(baseUrl);
    const { response, data: result } = await fetchAiJson(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: '你是资深品牌视觉设计负责人。请基于给定的会话记录和品牌方表单答案，整理一份可执行的最终设计方案。用中文输出，包含：设计目标与受众、核心创意与视觉风格、色彩/字体/版式建议、画面内容与层级、素材与交付规范、仍需确认事项。只把记录明确表达的内容写成确定要求；你的推断和建议请标注为“建议”；缺失信息列入待确认，禁止编造品牌事实。表达简洁、具体、可直接交给设计师执行。' },
          { role: 'user', content: `会话标题：${String(session.title || '品牌设计沟通')}\n以下是按时间排序的聊天记录和品牌方表单答案：\n${transcript}` },
        ],
      }),
    }, 45000, { source: 'intake', operation: 'conversation_summary', model, configId: activeConfig.id,
      profileId: modelProfileId, referenceId: session.id, apiKey });
    const summary = String(result?.choices?.[0]?.message?.content || '').trim();
    if (!response.ok) {
      const providerMessage = String(result?.error?.message || result?.message || result?.msg || '').trim()
        .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
        .replace(/(?:sk|key|token)[-_][A-Za-z0-9_-]{12,}/gi, '[已隐藏凭证]')
        .slice(0, 240);
      fail(providerMessage ? `模型服务返回 HTTP ${response.status}：${providerMessage}` : `模型服务返回 HTTP ${response.status}，请检查接口地址、模型名称和 API Key`, 502);
    }
    if (!summary) fail('模型服务已响应，但没有返回总结内容；请检查模型配置后重试', 502);
    res.json(ok({ summary, generatedAt: new Date().toISOString(), model }));
  } catch (error) { next(error); }
});
intakeSessionsRouter.post('/:id/messages', async (req, res, next) => {
  try {
    const { clientMessageId, body } = z.object({ clientMessageId: z.string().uuid(), body: z.string().trim().min(1).max(8000) }).strict().parse(req.body);
    if (body.startsWith('COZI_WORKFLOW_V1:')) fail('业务卡片必须通过需求协作接口生成', 403);
    const card = parseCard(body);
    if (card?.kind === 'video' || /^\/api\/upload\/assets\/asset_[a-f0-9]{32}$/.test(body)) fail('当前会话不支持发送视频，请发送图片或文字', 400);
    if (card && !['image', 'work_card', 'choice', 'choice_answer', 'form_answers', 'proposal', 'decision'].includes(card.kind)) fail('此会话不支持该业务卡片', 400);
    const connection = await requireChatDatabase().getConnection();
    try {
      await connection.beginTransaction();
      const [sessions]: any = await connection.query('SELECT * FROM intake_sessions WHERE id=? FOR UPDATE', [req.params.id]);
      const session = sessions[0];
      const serviceAccess = ['customer_service', 'admin'].includes(req.user!.role);
      if (!session || session.status !== 'open' || (!serviceAccess && session.creator_id !== req.user!.id && session.guest_id !== req.user!.id)) fail('会话不存在或无权访问', 404);
      const [duplicates]: any = await connection.query('SELECT * FROM intake_messages WHERE sender_id=? AND client_message_id=? LIMIT 1', [req.user!.id, clientMessageId]);
      if (duplicates[0]) {
        if (duplicates[0].session_id !== session.id || duplicates[0].body !== body) fail('消息 ID 已被其他内容使用', 409);
        await connection.commit();
        return res.json(ok({ ...duplicates[0], sessionId: session.id, senderId: duplicates[0].sender_id, senderName: duplicates[0].sender_name, clientMessageId, createdAt: duplicates[0].created_at, seq: Number(duplicates[0].seq) }));
      }
      if (req.user!.role === 'customer_service') {
        const [assignments]: any = await connection.query("SELECT assigned_service_id FROM service_conversation_assignments WHERE conversation_type='intake' AND conversation_id=? LIMIT 1", [req.params.id]);
        if (assignments[0] && assignments[0].assigned_service_id !== req.user!.id) fail('会话已转交给其他客服', 403);
      }
      const legacyImageId = /^\/api\/upload\/previews\/(asset_[a-f0-9]{32})$/.exec(body)?.[1];
      const imageAssetIds = card?.kind === 'image' ? card.attachments.map(item => item.url.slice('/api/upload/previews/'.length)) : legacyImageId ? [legacyImageId] : [];
      if (imageAssetIds.length) {
        const [assets]: any = await connection.query(`SELECT id FROM media_assets WHERE owner_id=? AND kind='image' AND id IN (${imageAssetIds.map(() => '?').join(',')})`, [req.user!.id, ...imageAssetIds]);
        if (assets.length !== imageAssetIds.length) fail('图片不存在或无权发送，请重新选择后上传', 400);
      }
      if (card?.kind === 'work_card' && /^biz_\d+$/.test(card.templateId) && card.attachments.length) {
        const businessImageIds = card.attachments.map(item => item.url.slice('/api/upload/previews/'.length));
        if (new Set(businessImageIds).size !== businessImageIds.length) fail('业务需求卡中有重复图片，请检查后重试', 400);
        if (!await hasConversationImageAccess(connection, 'intake', session.id, req.user!.id, businessImageIds)) fail('业务需求卡图片不在当前会话中或无权使用，请重新选择', 400);
      }
      if (card?.kind === 'work_card' || card?.kind === 'choice' || card?.kind === 'proposal') {
        if (!['customer_service', 'admin'].includes(req.user!.role)) fail('只有客服可以发送协作卡片', 403);
        if (card.kind === 'work_card' && card.templateId === 'contract_snapshot') fail('需求快照仅用于订单会话', 400);
        if (card.kind === 'choice' && new Set(card.options.map(option => option.id)).size !== card.options.length) fail('选择题选项编号重复', 400);
        if (card.kind === 'work_card' && card.revisionOf) {
          const [originals]: any = await connection.query('SELECT body FROM intake_messages WHERE id=? AND session_id=? LIMIT 1', [card.revisionOf, session.id]);
          if (!originals[0] || parseCard(String(originals[0].body))?.kind !== 'work_card') fail('原始协作卡片不存在', 404);
        }
      }
      if (card?.kind === 'choice_answer') {
        if (req.user!.id !== session.creator_id && req.user!.id !== session.guest_id) fail('只有会话参与者可以回答选择题', 403);
        const [choices]: any = await connection.query('SELECT body,sender_id FROM intake_messages WHERE id=? AND session_id=? LIMIT 1', [card.choiceMessageId, session.id]);
        const target = choices[0] ? parseCard(String(choices[0].body)) : null;
        const choice = target?.kind === 'choice' ? target : fail('选择题不存在', 404);
        if (choices[0].sender_id === req.user!.id) fail('不能回答自己发送的选择题', 403);
        if (!choice.options.some(option => option.id === card.optionId && option.label === card.optionLabel)) fail('选项无效', 400);
        const [answers]: any = await connection.query('SELECT body FROM intake_messages WHERE session_id=? AND sender_id=? AND LEFT(body, ?)=?', [session.id, req.user!.id, CARD_PREFIX.length, CARD_PREFIX]);
        if (answers.some((row: any) => { const previous = parseCard(String(row.body)); return previous?.kind === 'choice_answer' && previous.choiceMessageId === card.choiceMessageId; })) fail('这道选择题已经回答', 409);
      }
      if (card?.kind === 'form_answers') {
        if (req.user!.role !== 'advertiser' || (req.user!.id !== session.creator_id && req.user!.id !== session.guest_id)) fail('只有品牌方会话参与者可以填写需求表单', 403);
        const [forms]: any = await connection.query('SELECT body,sender_id FROM intake_messages WHERE id=? AND session_id=? LIMIT 1', [card.formMessageId, session.id]);
        const target: any = forms[0] ? parseCard(String(forms[0].body)) : null;
        if (!target) fail('需求表单不存在', 404);
        if (target.kind !== 'work_card') fail('需求表单不存在', 404);
        if (target.templateId !== 'intake_checklist' || forms[0].sender_id === req.user!.id) fail('需求表单不存在', 404);
        const formFields = (target as { fields: Array<{ label: string; options?: string[]; schema?: { kind: string; required?: boolean; options?: Array<{ value: string }> } }> }).fields;
        if (card.answers.length !== formFields.length || new Set(card.answers.map((answer) => answer.fieldIndex)).size !== card.answers.length || card.answers.some((answer) => answer.fieldIndex >= formFields.length)) fail('请完整填写表单中的每一项', 400);
        for (const answer of card.answers) {
          const field = formFields[answer.fieldIndex];
          if (!answer.value.trim() && (!field.schema || field.schema.required)) fail(`请填写“${field.label}”`, 400);
          if (!answer.value) continue;
          if (!field.schema && field.options?.length && !field.options.includes(answer.value)) fail(`“${field.label}”请选择有效选项`, 400);
          if (field.schema?.kind === 'select' || field.schema?.kind === 'radio') {
            const allowed = new Set([...(field.schema.options || []).map(option => option.value), ...(field.options || [])]);
            if (!allowed.has(answer.value)) fail(`“${field.label}”请选择有效选项`, 400);
          }
          if (field.schema?.kind === 'checkbox') {
            let choices: unknown;
            try { choices = JSON.parse(answer.value); } catch { choices = answer.value; }
            const allowed = new Set([...(field.schema.options || []).map(option => option.value), ...(field.options || [])]);
            if (Array.isArray(choices) ? choices.some(choice => typeof choice !== 'string' || !allowed.has(choice)) : !allowed.has(choices as string)) fail(`“${field.label}”包含无效选项`, 400);
          }
        }
      }
      if (card?.kind === 'decision') {
        if (req.user!.id !== session.creator_id && req.user!.id !== session.guest_id) fail('只有会话参与者可以选择方案', 403);
        const [proposals]: any = await connection.query('SELECT body,sender_id FROM intake_messages WHERE id=? AND session_id=? LIMIT 1', [card.proposalMessageId, session.id]);
        const target = proposals[0] ? parseCard(String(proposals[0].body)) : null;
        if (target?.kind !== 'proposal' || proposals[0].sender_id === req.user!.id) fail('方案提案不存在', 404);
        const [decisions]: any = await connection.query('SELECT body FROM intake_messages WHERE session_id=? AND sender_id=? AND LEFT(body, ?)=?', [session.id, req.user!.id, CARD_PREFIX.length, CARD_PREFIX]);
        if (decisions.some((row: any) => { const previous = parseCard(String(row.body)); return previous?.kind === 'decision' && previous.proposalMessageId === card.proposalMessageId; })) fail('这份提案已经选择过方案', 409);
      }
      const seq = Number(session.last_seq) + 1;
      const id = randomUUID();
      await connection.query('INSERT INTO intake_messages (id, session_id, seq, sender_id, sender_name, client_message_id, body) VALUES (?,?,?,?,?,?,?)', [id, session.id, seq, req.user!.id, req.user!.name, clientMessageId, body]);
      await connection.query('UPDATE intake_sessions SET last_seq=?, updated_at=NOW(3) WHERE id=?', [seq, session.id]);
      await connection.commit();
      const message = { id, sessionId: String(session.id), seq, senderId: req.user!.id, senderName: req.user!.name,
        clientMessageId, body, createdAt: new Date().toISOString() };
      publishIntakeMessage(message, [...new Set([session.creator_id, session.guest_id, 'role:service'].filter(Boolean))] as string[]);
      res.status(201).json(ok(message));
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) { next(error); }
});

intakeSessionsRouter.use((error: unknown, _req: any, res: any, next: (error: unknown) => void) => {
  if (error instanceof z.ZodError) return res.status(400).json({ code: 400, success: false, message: '请求参数无效' });
  next(error);
});
