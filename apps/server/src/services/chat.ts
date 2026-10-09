import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { WORKFLOW_MESSAGE_PREFIX } from '@design-review/shared';

export const sendMessageSchema = z.object({
  orderId: z.string().min(1).max(64),
  clientMessageId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
}).strict();

const CARD_PREFIX = 'COZI_CHAT_CARD_V1:';
const cardSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('proposal'), title: z.string().trim().min(1).max(80), optionA: z.string().trim().min(1).max(80), optionB: z.string().trim().min(1).max(80), detailA: z.string().trim().min(1).max(600), detailB: z.string().trim().min(1).max(600) }).strict(),
  z.object({ kind: z.literal('decision'), proposalMessageId: z.string().uuid(), option: z.enum(['A', 'B']), note: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('requirement_review'), decision: z.enum(['confirmed', 'needs_details']), note: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('work_card'), templateId: z.string().regex(/^[a-z0-9_-]{1,40}$/), title: z.string().trim().min(1).max(100), fields: z.array(z.object({ label: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(800) }).strict()).min(1).max(24), attachments: z.array(z.object({ name: z.string().trim().min(1).max(120), url: z.string().regex(/^\/api\/upload\/previews\/[a-zA-Z0-9_-]+$/) }).strict()).max(8).default([]), revisionOf: z.string().uuid().optional() }).strict(),
  z.object({ kind: z.literal('snapshot_ack'), snapshotMessageId: z.string().uuid(), decision: z.enum(['confirmed', 'needs_changes']), note: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('choice'), source: z.enum(['combo', 'style']), title: z.string().trim().min(1).max(100), prompt: z.string().trim().min(1).max(500), options: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), label: z.string().trim().min(1).max(100), detail: z.string().max(500) }).strict()).min(2).max(8) }).strict(),
  z.object({ kind: z.literal('choice_answer'), choiceMessageId: z.string().uuid(), optionId: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), optionLabel: z.string().trim().min(1).max(100), note: z.string().max(500) }).strict(),
  z.object({ kind: z.literal('recall'), targetMessageId: z.string().uuid() }).strict(),
]);

function parseCard(body: string) {
  if (!body.startsWith(CARD_PREFIX)) return null;
  try { return cardSchema.parse(JSON.parse(body.slice(CARD_PREFIX.length))); }
  catch { failure('协作卡片格式无效', 400); }
}

export type ChatMessage = {
  id: string;
  orderId: string;
  seq: number;
  senderId: string;
  senderName: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
};

type OrderParticipants = {
  creator_id: string; creator_name: string; claimed_by_id: string | null; claimed_by_name: string | null;
  title: string; order_no: string; category: string; platform: string; budget: number;
  deadline: string | null; requirements: string | null; status: string; requires_psd: number;
};

function failure(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}

export function requireChatDatabase() {
  if (!dbPool) failure('聊天需要数据库连接', 503);
  return dbPool!;
}

export async function getChatOrder(orderId: string, user: AuthUserPayload): Promise<OrderParticipants> {
  const pool = requireChatDatabase();
  const [rows]: any = await pool.query('SELECT creator_id, creator_name, claimed_by_id, claimed_by_name, title, order_no, category, platform, budget, deadline, requirements, status, requires_psd FROM design_orders WHERE id=? LIMIT 1', [orderId]);
  const order = rows[0] as OrderParticipants | undefined;
  // Only the actual order creator and assigned designer can read or write this conversation.
  if (!order || (!['customer_service', 'admin'].includes(user.role) && order.creator_id !== user.id && order.claimed_by_id !== user.id)) failure('会话不存在或无权访问', 404);
  return order!;
}

export async function listChatConversations(user: AuthUserPayload, limit = 100, offset = 0) {
  const [rows]: any = await requireChatDatabase().query(
    `SELECT o.id AS order_id, o.order_no, o.title, o.category, o.status,
            o.creator_name, o.claimed_by_name, o.updated_at,
            m.body AS last_body, m.created_at AS last_message_at,
            a.assigned_service_id, a.assigned_service_name
       FROM design_orders o
       LEFT JOIN chat_conversations c ON c.order_id=o.id
       LEFT JOIN chat_messages m ON m.order_id=o.id AND m.seq=c.last_seq
       LEFT JOIN service_conversation_assignments a ON a.conversation_type='order' AND a.conversation_id=o.id
      WHERE o.claimed_by_id IS NOT NULL AND (? IN ('customer_service','admin') OR o.creator_id=? OR o.claimed_by_id=?)
      ORDER BY COALESCE(m.created_at, o.updated_at, o.created_at) DESC LIMIT ? OFFSET ?`,
    [user.role, user.id, user.id, limit, offset]
  );
  return rows.map((row: any) => ({
    orderId: row.order_id, orderNo: row.order_no, title: row.title, category: row.category,
    status: row.status, counterpartName: ['customer_service', 'admin'].includes(user.role) ? `${row.creator_name} · ${row.claimed_by_name}` : user.role === 'advertiser' ? row.claimed_by_name : row.creator_name,
    lastBody: row.last_body || '', lastMessageAt: row.last_message_at || row.updated_at || null,
    assignedServiceId: row.assigned_service_id || null, assignedServiceName: row.assigned_service_name || null,
  }));
}

export async function getServiceAgents() {
  const [rows]: any = await requireChatDatabase().query("SELECT id,name,department FROM users WHERE role='customer_service' AND is_active=1 ORDER BY name,id");
  return rows.map((row: any) => ({ id: String(row.id), name: String(row.name), department: row.department || '' }));
}

export async function getConversationAssignment(type: 'order' | 'intake', id: string) {
  const [rows]: any = await requireChatDatabase().query('SELECT assigned_service_id,assigned_service_name,assigned_by_id,assigned_by_name,updated_at FROM service_conversation_assignments WHERE conversation_type=? AND conversation_id=? LIMIT 1', [type, id]);
  const row = rows[0];
  return row ? { assignedServiceId: String(row.assigned_service_id), assignedServiceName: String(row.assigned_service_name), assignedById: String(row.assigned_by_id), assignedByName: String(row.assigned_by_name), updatedAt: row.updated_at } : { assignedServiceId: null, assignedServiceName: null, assignedById: null, assignedByName: null, updatedAt: null };
}

export async function getConversationTransferHistory(type: 'order' | 'intake', id: string) {
  const [rows]: any = await requireChatDatabase().query(`SELECT from_service_id AS fromServiceId,from_service_name AS fromServiceName,
      to_service_id AS toServiceId,to_service_name AS toServiceName,transferred_by_name AS transferredByName,note,created_at AS createdAt
    FROM service_conversation_transfers WHERE conversation_type=? AND conversation_id=? ORDER BY created_at DESC LIMIT 50`, [type, id]);
  return rows;
}

export async function transferServiceConversation(type: 'order' | 'intake', conversationId: string, toServiceId: string, note: string, actor: AuthUserPayload) {
  const pool = requireChatDatabase();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (type === 'order') {
      const [rows]: any = await connection.query('SELECT id FROM design_orders WHERE id=? LIMIT 1 FOR UPDATE', [conversationId]);
      if (!rows[0]) failure('订单会话不存在', 404);
    } else {
      const [rows]: any = await connection.query("SELECT id FROM intake_sessions WHERE id=? AND status='open' LIMIT 1 FOR UPDATE", [conversationId]);
      if (!rows[0]) failure('邀请会话不存在或已关闭', 404);
    }
    const [targetRows]: any = await connection.query("SELECT id,name FROM users WHERE id=? AND role='customer_service' AND is_active=1 LIMIT 1", [toServiceId]);
    if (!targetRows[0]) failure('接待客服不存在或已停用', 404);
    const [assignmentRows]: any = await connection.query('SELECT assigned_service_id,assigned_service_name FROM service_conversation_assignments WHERE conversation_type=? AND conversation_id=? FOR UPDATE', [type, conversationId]);
    const previous = assignmentRows[0];
    if (actor.role === 'customer_service' && previous && previous.assigned_service_id !== actor.id) failure('此会话已由其他客服接待', 403);
    const target = targetRows[0];
    await connection.query(`INSERT INTO service_conversation_assignments (conversation_type,conversation_id,assigned_service_id,assigned_service_name,assigned_by_id,assigned_by_name)
      VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE assigned_service_id=VALUES(assigned_service_id),assigned_service_name=VALUES(assigned_service_name),assigned_by_id=VALUES(assigned_by_id),assigned_by_name=VALUES(assigned_by_name),updated_at=CURRENT_TIMESTAMP(3)`,
    [type, conversationId, target.id, target.name, actor.id, actor.name]);
    await connection.query(`INSERT INTO service_conversation_transfers (id,conversation_type,conversation_id,from_service_id,from_service_name,to_service_id,to_service_name,transferred_by_id,transferred_by_name,note)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [randomUUID(), type, conversationId, previous?.assigned_service_id || null, previous?.assigned_service_name || null, target.id, target.name, actor.id, actor.name, note]);
    await connection.commit();
    return { conversationType: type, conversationId, assignedServiceId: String(target.id), assignedServiceName: String(target.name), assignedById: actor.id, assignedByName: actor.name, updatedAt: new Date().toISOString() };
  } catch (error) {
    try { await connection.rollback(); } catch { /* Connection may already be lost. */ }
    throw error;
  } finally { connection.release(); }
}

function fromRow(row: any): ChatMessage {
  return {
    id: row.id, orderId: row.order_id, seq: Number(row.seq), senderId: row.sender_id,
    senderName: row.sender_name, clientMessageId: row.client_message_id,
    body: row.body, createdAt: row.created_at,
  };
}

export async function listChatMessages(orderId: string, user: AuthUserPayload, afterSeq: number) {
  await getChatOrder(orderId, user);
  const [rows]: any = await requireChatDatabase().query(
    'SELECT * FROM chat_messages WHERE order_id=? AND seq>? ORDER BY seq ASC LIMIT 101', [orderId, afterSeq]
  );
  return { messages: rows.slice(0, 100).map(fromRow) as ChatMessage[], hasMore: rows.length > 100 };
}

export async function storeChatMessage(raw: unknown, user: AuthUserPayload) {
  const input = sendMessageSchema.parse(raw);
  if (input.body.startsWith(WORKFLOW_MESSAGE_PREFIX)) failure('业务卡片必须通过需求协作接口生成', 403);
  const pool = requireChatDatabase();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users]: any = await connection.query('SELECT is_active, name, role FROM users WHERE id=? LIMIT 1', [user.id]);
    if (!users[0]?.is_active || users[0].role !== user.role) failure('登录状态已失效', 401);
    const [orders]: any = await connection.query('SELECT creator_id, claimed_by_id FROM design_orders WHERE id=? LIMIT 1 FOR UPDATE', [input.orderId]);
    const order = orders[0] as OrderParticipants | undefined;
    if (!order || (!['customer_service', 'admin'].includes(user.role) && order.creator_id !== user.id && order.claimed_by_id !== user.id)) failure('会话不存在或无权访问', 404);
    await connection.query('INSERT IGNORE INTO chat_conversations (order_id, last_seq) VALUES (?, 0)', [input.orderId]);
    const [conversations]: any = await connection.query('SELECT last_seq FROM chat_conversations WHERE order_id=? FOR UPDATE', [input.orderId]);
    const [duplicates]: any = await connection.query('SELECT * FROM chat_messages WHERE sender_id=? AND client_message_id=? LIMIT 1', [user.id, input.clientMessageId]);
    if (duplicates[0]) {
      if (duplicates[0].order_id !== input.orderId || duplicates[0].body !== input.body) failure('消息 ID 已被其他内容使用', 409);
      await connection.commit();
      return { message: fromRow(duplicates[0]), duplicate: true, recipients: [] as string[] };
    }

    if (user.role === 'customer_service') {
      const [assignments]: any = await connection.query("SELECT assigned_service_id FROM service_conversation_assignments WHERE conversation_type='order' AND conversation_id=? LIMIT 1", [input.orderId]);
      if (assignments[0] && assignments[0].assigned_service_id !== user.id) failure('会话已转交给其他客服', 403);
    }

    const card = parseCard(input.body);
    if (card?.kind === 'work_card' && card.templateId === 'contract_snapshot' && !['customer_service', 'admin'].includes(user.role)) failure('只有客服可以生成需求快照', 403);
    if (card?.kind === 'proposal' && order.claimed_by_id !== user.id && !['customer_service', 'admin'].includes(user.role)) failure('只有设计师或客服可以发送提案', 403);
    if (card?.kind === 'choice') {
      if (order.creator_id === user.id) failure('请由设计师或客服发送选择题', 403);
      if (new Set(card.options.map(option => option.id)).size !== card.options.length) failure('选择题选项编号重复', 400);
    }
    if (card?.kind === 'requirement_review' && order.claimed_by_id !== user.id) failure('只有接单设计师可以核对需求', 403);
    if (card?.kind === 'requirement_review' && card.decision === 'needs_details' && !card.note.trim()) failure('请填写需要补充的内容', 400);
    if (card?.kind === 'decision') {
      if (order.creator_id !== user.id) failure('只有订单创建者可以选择方案', 403);
      const [proposalRows]: any = await connection.query('SELECT body, sender_id FROM chat_messages WHERE id=? AND order_id=? LIMIT 1', [card.proposalMessageId, input.orderId]);
      if (!proposalRows[0] || proposalRows[0].sender_id === order.creator_id || parseCard(String(proposalRows[0].body || ''))?.kind !== 'proposal') failure('提案不存在', 404);
      const [decisions]: any = await connection.query('SELECT body FROM chat_messages WHERE order_id=? AND sender_id=? AND LEFT(body, ?)=?', [input.orderId, user.id, CARD_PREFIX.length, CARD_PREFIX]);
      if (decisions.some((row: any) => {
        const previous = parseCard(String(row.body));
        return previous?.kind === 'decision' && previous.proposalMessageId === card.proposalMessageId;
      })) failure('这份提案已经选择过方案', 409);
    }
    if (card?.kind === 'snapshot_ack') {
      if (user.id !== order.creator_id && user.id !== order.claimed_by_id) failure('只有订单双方可以确认快照', 403);
      if (card.decision === 'needs_changes' && !card.note.trim()) failure('请填写需要修改的内容', 400);
      const [snapshots]: any = await connection.query('SELECT body FROM chat_messages WHERE id=? AND order_id=? LIMIT 1', [card.snapshotMessageId, input.orderId]);
      const target = snapshots[0] ? parseCard(String(snapshots[0].body)) : null;
      if (target?.kind !== 'work_card' || target.templateId !== 'contract_snapshot') failure('需求快照不存在', 404);
      const [ackRows]: any = await connection.query('SELECT body FROM chat_messages WHERE order_id=? AND sender_id=? AND LEFT(body, ?)=?', [input.orderId, user.id, CARD_PREFIX.length, CARD_PREFIX]);
      if (ackRows.some((row: any) => { const previous = parseCard(String(row.body)); return previous?.kind === 'snapshot_ack' && previous.snapshotMessageId === card.snapshotMessageId; })) failure('这份快照已经反馈过', 409);
    }
    if (card?.kind === 'choice_answer') {
      if (order.creator_id !== user.id) failure('只有品牌方可以填写选择题', 403);
      const [choices]: any = await connection.query('SELECT body, sender_id FROM chat_messages WHERE id=? AND order_id=? LIMIT 1', [card.choiceMessageId, input.orderId]);
      const target = choices[0] ? parseCard(String(choices[0].body)) : null;
      if (target?.kind !== 'choice' || choices[0].sender_id === user.id) failure('选择题不存在', 404);
      if (!target.options.some(option => option.id === card.optionId && option.label === card.optionLabel)) failure('选项无效', 400);
      const [answers]: any = await connection.query('SELECT body FROM chat_messages WHERE order_id=? AND sender_id=? AND LEFT(body, ?)=?', [input.orderId, user.id, CARD_PREFIX.length, CARD_PREFIX]);
      if (answers.some((row: any) => { const previous = parseCard(String(row.body)); return previous?.kind === 'choice_answer' && previous.choiceMessageId === card.choiceMessageId; })) failure('这道选择题已经回答', 409);
    }
    if (card?.kind === 'recall') {
      const [targets]: any = await connection.query('SELECT body, sender_id, created_at FROM chat_messages WHERE id=? AND order_id=? LIMIT 1', [card.targetMessageId, input.orderId]);
      const target = targets[0];
      if (!target || target.sender_id !== user.id || String(target.body).startsWith(CARD_PREFIX)) failure('只能撤回自己发送的普通消息', 403);
      const sentAt = new Date(String(target.created_at)).getTime();
      if (!Number.isFinite(sentAt) || Date.now() - sentAt > 120000) failure('消息已超过两分钟撤回期限', 409);
      const [recalls]: any = await connection.query('SELECT body FROM chat_messages WHERE order_id=? AND sender_id=? AND LEFT(body, ?)=?', [input.orderId, user.id, CARD_PREFIX.length, CARD_PREFIX]);
      if (recalls.some((row: any) => { const previous = parseCard(String(row.body)); return previous?.kind === 'recall' && previous.targetMessageId === card.targetMessageId; })) failure('消息已经撤回', 409);
    }

    const seq = Number(conversations[0].last_seq) + 1;
    const message: ChatMessage = {
      id: randomUUID(), orderId: input.orderId, seq, senderId: user.id,
      senderName: String(users[0].name || user.name), clientMessageId: input.clientMessageId,
      body: input.body, createdAt: new Date().toISOString(),
    };
    await connection.query(
      'INSERT INTO chat_messages (id, order_id, seq, sender_id, sender_name, client_message_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [message.id, message.orderId, message.seq, message.senderId, message.senderName, message.clientMessageId, message.body, message.createdAt]
    );
    await connection.query('UPDATE chat_conversations SET last_seq=? WHERE order_id=?', [seq, input.orderId]);
    await connection.commit();
    return { message, duplicate: false, recipients: [...new Set([order.creator_id, order.claimed_by_id, 'role:service'].filter(Boolean))] as string[] };
  } catch (error) {
    try { await connection.rollback(); } catch { /* Lost connection may mean commit outcome is unknown; client retries by ID. */ }
    throw error;
  } finally {
    connection.release();
  }
}
