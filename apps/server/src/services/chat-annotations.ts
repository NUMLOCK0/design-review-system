import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dbPool } from '../config/database.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { CARD_PREFIX, getChatOrder, parseCard, requireChatDatabase, type ChatMessage } from './chat.js';

const imageUrlPattern = /^\/api\/upload\/(?:assets|previews)\/asset_[a-f0-9]{32}$/;
const annotationInputSchema = z.object({
  taskId: z.string().trim().min(1).max(64),
  imageId: z.string().trim().min(1).max(64),
  imageVersion: z.number().int().min(1).max(10000),
  clientMessageId: z.string().uuid(),
  annotations: z.array(z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    comment: z.string().trim().min(1).max(200),
  }).strict()).min(1).max(12),
}).strict();

type StoredImage = { id: string; imageUrl: string; thumbnailUrl?: string; imageIndex: number; version: number; groupId?: string };
type StoredTask = { id: string; taskNo?: string; productName?: string; status?: string; submittedAt?: string; groups?: Array<{ id?: string; groupType?: string; images?: StoredImage[] }> };

function fail(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}

function parseTaskPayload(value: unknown): StoredTask | null {
  try {
    const task = (typeof value === 'string' ? JSON.parse(value) : value) as StoredTask;
    return task && typeof task === 'object' ? task : null;
  } catch { return null; }
}

function imageList(task: StoredTask) {
  return (task.groups || []).flatMap((group) => (group.images || []).map((image) => ({ group, image })));
}

export async function listOrderDeliverableImages(orderId: string, user: AuthUserPayload) {
  await getChatOrder(orderId, user);
  const [rows]: any = await requireChatDatabase().query(
    'SELECT id,task_no,product_name,status,submitted_at,payload_json FROM review_tasks WHERE order_id=? ORDER BY created_at DESC', [orderId]
  );
  const result: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const task = parseTaskPayload(row.payload_json);
    const status = String(task?.status || row.status || '');
    if (!task || !['pending', 'in_review', 'needs_revision', 'approved'].includes(status)) continue;
    for (const { group, image } of imageList(task)) {
      if (!image?.id || !imageUrlPattern.test(String(image.imageUrl || ''))) continue;
      result.push({
        taskId: String(task.id || row.id), taskNo: String(task.taskNo || row.task_no || ''),
        taskStatus: status, productName: String(task.productName || row.product_name || '交稿图片'),
        imageId: String(image.id), groupId: String(image.groupId || group.id || ''),
        groupType: String(group.groupType || ''), imageIndex: Math.max(1, Number(image.imageIndex || 1)),
        imageUrl: String(image.imageUrl), thumbnailUrl: imageUrlPattern.test(String(image.thumbnailUrl || '')) ? String(image.thumbnailUrl) : String(image.imageUrl),
        version: Number(image.version || 1), submittedAt: String(task.submittedAt || row.submitted_at || ''),
      });
    }
  }
  return result;
}

export async function createOrderImageAnnotation(orderId: string, raw: unknown, user: AuthUserPayload) {
  const input = annotationInputSchema.parse(raw);
  if (user.role !== 'advertiser') fail('只有品牌方可以提交交稿批注', 403);
  const pool = dbPool;
  if (!pool) fail('批注需要数据库连接', 503);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users]: any = await connection.query('SELECT is_active,name,role FROM users WHERE id=? LIMIT 1', [user.id]);
    if (!users[0]?.is_active || users[0].role !== user.role) fail('登录状态已失效', 401);
    const actorName = String(users[0].name || user.name);
    const [orders]: any = await connection.query('SELECT id,creator_id,claimed_by_id FROM design_orders WHERE id=? LIMIT 1 FOR UPDATE', [orderId]);
    const order = orders[0];
    if (!order || String(order.creator_id) !== user.id) fail('订单会话不存在或无权访问', 404);

    const [duplicates]: any = await connection.query('SELECT * FROM chat_messages WHERE sender_id=? AND client_message_id=? LIMIT 1', [user.id, input.clientMessageId]);
    if (duplicates[0]) {
      if (String(duplicates[0].order_id) !== orderId) fail('消息 ID 已被其他会话使用', 409);
      const [annotationRows]: any = await connection.query('SELECT task_id,image_id,image_version,annotations_json FROM chat_image_annotations WHERE message_id=? LIMIT 1', [duplicates[0].id]);
      const record = annotationRows[0];
      const oldAnnotations = record ? (typeof record.annotations_json === 'string' ? JSON.parse(record.annotations_json) : record.annotations_json) : null;
      const same = record && String(record.task_id) === input.taskId && String(record.image_id) === input.imageId && Number(record.image_version) === input.imageVersion
        && Array.isArray(oldAnnotations) && oldAnnotations.length === input.annotations.length
        && oldAnnotations.every((item: any, index: number) => Number(item.x) === input.annotations[index].x && Number(item.y) === input.annotations[index].y && String(item.comment) === input.annotations[index].comment);
      if (!same) fail('消息 ID 已被其他内容使用', 409);
      await connection.commit();
      const message = duplicates[0];
      return { message: { id: message.id, orderId: message.order_id, seq: Number(message.seq), senderId: message.sender_id, senderName: message.sender_name, clientMessageId: message.client_message_id, body: message.body, createdAt: message.created_at } as ChatMessage, duplicate: true, recipients: [] as string[] };
    }

    const [taskRows]: any = await connection.query('SELECT id,status,task_no,product_name,submitted_at,payload_json FROM review_tasks WHERE id=? AND order_id=? LIMIT 1 FOR UPDATE', [input.taskId, orderId]);
    const taskRow = taskRows[0];
    const task = taskRow ? parseTaskPayload(taskRow.payload_json) : null;
    const taskStatus = String(task?.status || taskRow?.status || '');
    if (!task || !['pending', 'in_review', 'needs_revision', 'approved'].includes(taskStatus)) fail('这项交稿已不可批注，请刷新后选择有效图片', 409);
    const found = imageList(task).find(({ image }) => String(image.id) === input.imageId);
    if (!found || !imageUrlPattern.test(String(found.image.imageUrl || ''))) fail('交稿图片不存在或不可访问', 404);
    if (Number(found.image.version || 1) !== input.imageVersion) fail('交稿图片已更新，请重新选择后批注', 409);

    await connection.query('INSERT IGNORE INTO chat_conversations (order_id,last_seq) VALUES (?,0)', [orderId]);
    const [conversationRows]: any = await connection.query('SELECT last_seq FROM chat_conversations WHERE order_id=? FOR UPDATE', [orderId]);
    const [revisionRows]: any = await connection.query('SELECT revision FROM chat_image_annotations WHERE order_id=? AND image_id=? ORDER BY revision DESC LIMIT 1 FOR UPDATE', [orderId, input.imageId]);
    const revision = Number(revisionRows[0]?.revision || 0) + 1;
    const createdAt = new Date();
    const timestamp = createdAt.toISOString();
    const messageId = randomUUID();
    const annotationId = randomUUID();
    const annotations = input.annotations.map((item) => ({
      id: randomUUID(), type: 'pin', x: item.x, y: item.y, color: '#ef4444', comment: item.comment,
      creatorId: user.id, creatorName: actorName, createdAt: timestamp,
    }));
    const image = found.image;
    const card = {
      kind: 'annotation', annotationId, taskId: input.taskId, taskNo: String(task.taskNo || taskRow.task_no || ''),
      imageId: input.imageId, imageVersion: input.imageVersion, revision, productName: String(task.productName || taskRow.product_name || '交稿图片'),
      imageIndex: Math.max(1, Number(image.imageIndex || 1)), imageUrl: String(image.imageUrl), annotations,
    };
    const body = `${CARD_PREFIX}${JSON.stringify(card)}`;
    if (body.length > 7900 || parseCard(body)?.kind !== 'annotation') fail('批注内容过长，请精简后再发送', 400);
    const seq = Number(conversationRows[0].last_seq) + 1;
    const message: ChatMessage = { id: messageId, orderId, seq, senderId: user.id, senderName: actorName, clientMessageId: input.clientMessageId, body, createdAt: timestamp };
    await connection.query(`INSERT INTO chat_image_annotations
      (id,order_id,task_id,image_id,image_version,revision,message_id,client_message_id,creator_id,creator_name,annotations_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [annotationId, orderId, input.taskId, input.imageId, input.imageVersion, revision, messageId, input.clientMessageId, user.id, actorName, JSON.stringify(annotations), createdAt]);
    await connection.query('INSERT INTO chat_messages (id,order_id,seq,sender_id,sender_name,client_message_id,body,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [messageId, orderId, seq, user.id, actorName, input.clientMessageId, body, timestamp]);
    await connection.query('UPDATE chat_conversations SET last_seq=? WHERE order_id=?', [seq, orderId]);
    await connection.commit();
    return { message, duplicate: false, recipients: [...new Set([String(order.creator_id), order.claimed_by_id ? String(order.claimed_by_id) : null, 'role:service'].filter(Boolean))] as string[] };
  } catch (error) {
    try { await connection.rollback(); } catch { /* A lost connection may mean the commit outcome is unknown. */ }
    throw error;
  } finally { connection.release(); }
}
