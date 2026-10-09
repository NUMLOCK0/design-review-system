import { Router } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate, type AuthUserPayload } from '../middleware/auth.middleware.js';
import { getConversationAssignment, getConversationTransferHistory, requireChatDatabase, transferServiceConversation } from '../services/chat.js';

export const intakeSessionsRouter = Router();
const ok = (data: unknown) => ({ code: 200, success: true, data });
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const present = (row: any) => ({
  id: row.id, title: row.title, creatorId: row.creator_id, creatorName: row.creator_name,
  guestId: row.guest_id || null, guestName: row.guest_name || null, status: row.status,
  lastSeq: Number(row.last_seq), updatedAt: row.updated_at,
  assignedServiceId: row.assigned_service_id || null, assignedServiceName: row.assigned_service_name || null,
});
async function member(id: string, user: AuthUserPayload) {
  const serviceAccess = ['customer_service', 'admin'].includes(user.role);
  const [rows]: any = await requireChatDatabase().query(`SELECT s.*,a.assigned_service_id,a.assigned_service_name FROM intake_sessions s
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
intakeSessionsRouter.post('/:id/messages', async (req, res, next) => {
  try {
    const { clientMessageId, body } = z.object({ clientMessageId: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).strict().parse(req.body);
    if (body.startsWith('COZI_CHAT_CARD_V1:') || body.startsWith('COZI_WORKFLOW_V1:')) fail('此会话暂不支持业务卡片', 400);
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
      const seq = Number(session.last_seq) + 1;
      const id = randomUUID();
      await connection.query('INSERT INTO intake_messages (id, session_id, seq, sender_id, sender_name, client_message_id, body) VALUES (?,?,?,?,?,?,?)', [id, session.id, seq, req.user!.id, req.user!.name, clientMessageId, body]);
      await connection.query('UPDATE intake_sessions SET last_seq=?, updated_at=NOW(3) WHERE id=?', [seq, session.id]);
      await connection.commit();
      res.status(201).json(ok({ id, sessionId: session.id, seq, senderId: req.user!.id, senderName: req.user!.name, clientMessageId, body, createdAt: new Date().toISOString() }));
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) { next(error); }
});

intakeSessionsRouter.use((error: unknown, _req: any, res: any, next: (error: unknown) => void) => {
  if (error instanceof z.ZodError) return res.status(400).json({ code: 400, success: false, message: '请求参数无效' });
  next(error);
});
