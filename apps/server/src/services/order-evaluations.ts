import crypto from 'crypto';
import type { PoolConnection } from 'mysql2/promise';
import { EVALUATION_TAGS, type EvaluationDirection, type OrderEvaluation, type OrderEvaluationState, type SiteMessage } from '@design-review/shared';
import { dbPool } from '../config/database.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { publishStoredMessage } from '../routes/messages.js';

const WINDOW_MS = 14 * 86400000;
const DAY_MS = 86400000;
const iso = (value: unknown) => value == null ? undefined : new Date(Number(value)).toISOString();
const parse = (value: any, fallback: any) => {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};
export function evaluationError(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export function evaluationPool() {
  if (!dbPool) evaluationError('数据库未连接，暂时无法处理评价', 503);
  return dbPool!;
}
export async function evaluationTransaction<T>(action: (connection: PoolConnection, notices: SiteMessage[]) => Promise<T>) {
  const connection = await evaluationPool().getConnection();
  const notices: SiteMessage[] = [];
  try {
    await connection.beginTransaction();
    const result = await action(connection, notices);
    await connection.commit();
    for (const notice of notices) {
      try { publishStoredMessage(notice); }
      catch (error) { console.error('[Evaluations] 实时通知发送失败，站内消息已保存:', error); }
    }
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function notice(connection: PoolConnection, notices: SiteMessage[], key: string, recipientId: string, title: string, content: string, link = '/evaluations') {
  const message: SiteMessage = {
    id: `evalmsg_${crypto.createHash('sha256').update(`${key}:${recipientId}`).digest('hex').slice(0, 40)}`,
    recipientId, senderName: '系统通知', type: 'order', title, content, link, isRead: false, createdAt: new Date().toISOString(),
  };
  const [insert]: any = await connection.query(`INSERT IGNORE INTO site_messages
    (id, recipient_id, sender_name, type, title, content, link, is_read, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
  [message.id, recipientId, message.senderName, message.type, title, content, link, 0, message.createdAt]);
  if (insert.affectedRows) notices.push(message);
}
async function participant(order: any, user: AuthUserPayload, connection: PoolConnection): Promise<EvaluationDirection | undefined> {
  if (user.role === 'designer' && order.claimed_by_id === user.id) return 'designer_to_advertiser';
  if (user.role !== 'advertiser') return undefined;
  if (order.creator_id === user.id) return 'advertiser_to_designer';
  const [rows]: any = await connection.query('SELECT organization_id, is_organization_admin FROM users WHERE id=?', [user.id]);
  if (rows[0]?.is_organization_admin && order.organization_id && rows[0].organization_id === order.organization_id) return 'advertiser_to_designer';
  return undefined;
}
export function evaluationFromRow(row: any, publicView = false): OrderEvaluation {
  const authorName = publicView ? `${String(row.author_name || '用户').slice(0, 1)}**` : row.author_name;
  return {
    id: row.id, orderId: row.order_id, direction: row.direction, authorId: row.author_id, authorName,
    targetId: row.target_id, targetName: publicView ? undefined : row.target_name,
    category: row.category, score: Number(row.score), tags: parse(row.tags, []), comment: row.comment,
    visibility: row.visibility, reputationEligible: Boolean(row.reputation_eligible), createdAt: iso(row.created_at)!,
    publishedAt: iso(row.published_at), reply: row.reply || undefined, repliedAt: iso(row.replied_at),
  };
}
export const EVALUATION_JOIN = `FROM order_evaluations e JOIN order_evaluation_sessions s ON s.order_id=e.order_id`;
export const EVALUATION_SELECT = `SELECT e.*, s.category, s.published_at, s.reputation_eligible, u.name AS target_name
  ${EVALUATION_JOIN} LEFT JOIN users u ON u.id COLLATE utf8mb4_unicode_ci=e.target_id`;

// All operations lock the order before its session, including the periodic worker.
async function syncSession(connection: PoolConnection, notices: SiteMessage[], orderId: string) {
  const [orders]: any = await connection.query('SELECT * FROM design_orders WHERE id=? FOR UPDATE', [orderId]);
  const order = orders[0];
  if (!order) evaluationError('订单不存在', 404);
  const [sessions]: any = await connection.query('SELECT * FROM order_evaluation_sessions WHERE order_id=? FOR UPDATE', [orderId]);
  let session = sessions[0];
  const [taskRows]: any = await connection.query(`SELECT status, designer_id, payload_json FROM review_tasks
    WHERE order_id=? OR id=? ORDER BY (id=?) DESC LIMIT 1`, [orderId, order.task_id || '', order.task_id || '']);
  const task = taskRows[0];
  const acceptedAt = parse(task?.payload_json, {}).acceptedAt;
  const [disputeRows]: any = await connection.query("SELECT id FROM order_disputes WHERE order_id=? AND status<>'resolved' LIMIT 1", [orderId]);
  const disputed = Boolean(order.is_disputed) || Boolean(disputeRows.length);
  const cancelled = order.status === 'cancelled' || order.deposit_refund_status === 'refunded';
  const accepted = task && ['approved', 'archived'].includes(task.status) && task.designer_id === order.claimed_by_id && Number.isFinite(Date.parse(acceptedAt));
  const paid = order.payment_status === 'paid' && Number.isFinite(Date.parse(order.balance_paid_at));
  const ready = Boolean(accepted && paid && order.claimed_by_id && !cancelled);
  const now = Date.now();
  let reason = cancelled ? '订单已关闭或退款' : !ready ? '支付尾款并完成验收后可评价' : disputed ? '纠纷处理中，评价已暂停' : '';
  if (!session && ready) {
    const [config]: any = await connection.query('SELECT activated_at FROM order_evaluation_config WHERE id=1');
    const start = Math.max(Date.parse(acceptedAt), Date.parse(order.balance_paid_at));
    if (start < Number(config[0]?.activated_at ?? now)) return { order, session: undefined, reason: '该历史订单不在评价开放范围' };
    const [users]: any = await connection.query('SELECT id, phone FROM users WHERE id IN (?,?)', [order.creator_id, order.claimed_by_id]);
    const brandPhone = users.find((row: any) => row.id === order.creator_id)?.phone;
    const designerPhone = users.find((row: any) => row.id === order.claimed_by_id)?.phone;
    const reputationEligible = !(brandPhone && designerPhone && String(brandPhone).trim() === String(designerPhone).trim());
    session = { order_id: orderId, advertiser_id: order.creator_id, designer_id: order.claimed_by_id, category: order.category,
      started_at: start, deadline_at: start + WINDOW_MS, status: 'open', reputation_eligible: reputationEligible };
    await connection.query(`INSERT INTO order_evaluation_sessions
      (order_id, advertiser_id, designer_id, category, started_at, deadline_at, status, reputation_eligible) VALUES (?,?,?,?,?,?,?,?)`,
    [orderId, order.creator_id, order.claimed_by_id, order.category, start, start + WINDOW_MS, 'open', reputationEligible]);
  }
  if (!session) return { order, session, reason: reason || '暂不能评价' };
  if (session.status === 'closed') return { order, session, reason: '评价已关闭' };
  if (cancelled) {
    await connection.query("UPDATE order_evaluation_sessions SET status='closed' WHERE order_id=?", [orderId]);
    session.status = 'closed';
    return { order, session, reason };
  }
  // Published feedback remains available during later disputes; staff can moderate it with an audit trail.
  if (session.status === 'published') return { order, session, reason: '' };
  if ((disputed || !ready) && session.status === 'open') {
    const [startedDisputes]: any = await connection.query("SELECT created_at FROM order_disputes WHERE order_id=? AND status<>'resolved' ORDER BY created_at ASC LIMIT 1", [orderId]);
    const disputeStart = Date.parse(startedDisputes[0]?.created_at);
    const pauseAt = Number.isFinite(disputeStart) ? Math.min(now, Math.max(Number(session.started_at), disputeStart)) : now;
    const remaining = Math.max(0, Number(session.deadline_at) - pauseAt);
    await connection.query("UPDATE order_evaluation_sessions SET status='paused', paused_at=?, remaining_ms=? WHERE order_id=?", [pauseAt, remaining, orderId]);
    Object.assign(session, { status: 'paused', paused_at: pauseAt, remaining_ms: remaining });
  } else if (!disputed && ready && session.status === 'paused') {
    session.deadline_at = now + Number(session.remaining_ms || 0);
    session.status = 'open';
    await connection.query("UPDATE order_evaluation_sessions SET status='open', deadline_at=?, paused_at=NULL, remaining_ms=NULL WHERE order_id=?", [session.deadline_at, orderId]);
  }
  if (session.status === 'open') {
    const [submitted]: any = await connection.query('SELECT direction FROM order_evaluations WHERE order_id=?', [orderId]);
    if (submitted.length === 2 || now >= Number(session.deadline_at)) {
      session.status = 'published'; session.published_at = now;
      await connection.query("UPDATE order_evaluation_sessions SET status='published', published_at=? WHERE order_id=?", [now, orderId]);
      if (submitted.length) for (const recipient of [session.advertiser_id, session.designer_id]) {
        await notice(connection, notices, `published:${orderId}`, recipient, '合作评价已公开', `订单「${order.title}」的合作评价已公开。`, '/evaluations?tab=received');
      }
    } else {
      for (const [recipient, direction] of [[session.advertiser_id, 'advertiser_to_designer'], [session.designer_id, 'designer_to_advertiser']]) {
        await notice(connection, notices, `opened:${orderId}`, recipient, '订单已验收，邀请评价', `订单「${order.title}」已完成验收，请在评价期内分享合作体验。`, `/evaluations/orders/${encodeURIComponent(orderId)}`);
        if (Number(session.deadline_at) - now <= DAY_MS && !submitted.some((row: any) => row.direction === direction)) {
          await notice(connection, notices, `reminder:${orderId}`, recipient, '合作评价即将到期', `订单「${order.title}」的评价将在一天内到期。`, `/evaluations/orders/${encodeURIComponent(orderId)}`);
        }
      }
    }
  }
  return { order, session, reason };
}
async function state(connection: PoolConnection, notices: SiteMessage[], orderId: string, user: AuthUserPayload): Promise<OrderEvaluationState> {
  const context = await syncSession(connection, notices, orderId);
  const { order, session, reason } = context;
  const direction = await participant(order, user, connection);
  if (!direction && !['admin', 'customer_service'].includes(user.role)) evaluationError('无权查看此订单评价', 403);
  const [rows]: any = session ? await connection.query(`${EVALUATION_SELECT} WHERE e.order_id=? ORDER BY e.created_at`, [orderId]) : [[]];
  const own = rows.find((row: any) => row.direction === direction);
  const visible = rows.filter((row: any) => row.direction === direction || ['admin', 'customer_service'].includes(user.role) || (session?.status === 'published' && row.visibility === 'visible'));
  return {
    orderId, title: order.title, targetName: direction === 'advertiser_to_designer' ? order.claimed_by_name || '设计师' : order.creator_name,
    direction, status: session?.status || 'unavailable', reason,
    deadlineAt: session && session.status !== 'paused' ? iso(session.deadline_at) : undefined,
    canSubmit: Boolean(direction && session?.status === 'open' && Date.now() < Number(session.deadline_at) && !own),
    submitted: Boolean(own), evaluations: visible.map((row: any) => evaluationFromRow(row, row.direction !== direction && !['admin', 'customer_service'].includes(user.role))),
  };
}
export async function getOrderEvaluationState(orderId: string, user: AuthUserPayload) {
  return evaluationTransaction((connection, notices) => state(connection, notices, orderId, user));
}
export async function syncOrderEvaluation(orderId: string) {
  if (!dbPool) return;
  try { await evaluationTransaction((connection, notices) => syncSession(connection, notices, orderId)); }
  catch (error) { console.error('[Evaluations] 订单评价同步失败:', orderId, error); }
}
export async function submitOrderEvaluation(orderId: string, user: AuthUserPayload, body: any) {
  if (!['advertiser', 'designer'].includes(user.role)) evaluationError('只有订单交易双方可以评价', 403);
  const score = body?.score;
  if (!Number.isInteger(score) || score < 1 || score > 5) evaluationError('请选择 1～5 星评分');
  if (typeof body.comment !== 'string' || body.comment.trim().length > 500) evaluationError('评价文字最多 500 字');
  if (!Array.isArray(body.tags) || body.tags.length > 3 || body.tags.some((item: unknown) => typeof item !== 'string')) evaluationError('评价标签最多选择 3 个');
  return evaluationTransaction(async (connection, notices) => {
    const current = await state(connection, notices, orderId, user);
    if (!current.direction) evaluationError('无权评价此订单', 403);
    if (!body.tags.every((tag: string) => EVALUATION_TAGS[current.direction!].includes(tag))) evaluationError('评价标签无效');
    if (current.submitted) evaluationError('该订单已评价，提交后不可修改', 409);
    if (!current.canSubmit) evaluationError(current.reason || '当前不在评价开放期', 409);
    const [sessions]: any = await connection.query('SELECT * FROM order_evaluation_sessions WHERE order_id=?', [orderId]);
    const session = sessions[0];
    await connection.query(`INSERT INTO order_evaluations
      (id, order_id, direction, author_id, author_name, target_id, score, tags, comment, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [`eval_${crypto.randomUUID()}`, orderId, current.direction, user.id, user.name,
      current.direction === 'advertiser_to_designer' ? session.designer_id : session.advertiser_id,
      score, JSON.stringify([...new Set(body.tags)]), body.comment.trim(), Date.now()]);
    return state(connection, notices, orderId, user);
  });
}
export async function evaluationSummary(userId: string) {
  const [rows]: any = await evaluationPool().query(`SELECT COUNT(*) AS count, AVG(e.score) AS average ${EVALUATION_JOIN}
    WHERE e.target_id=? AND e.visibility='visible' AND s.status='published' AND s.reputation_eligible=1`, [userId]);
  const count = Number(rows[0].count);
  return { count, average: count ? Math.round(Number(rows[0].average) * 10) / 10 : null };
}
async function lockEvaluationOrder(connection: PoolConnection, id: string) {
  const [rows]: any = await connection.query('SELECT order_id FROM order_evaluations WHERE id=?', [id]);
  if (!rows.length) evaluationError('评价不存在', 404);
  await connection.query('SELECT id FROM design_orders WHERE id=? FOR UPDATE', [rows[0].order_id]);
}
export async function replyEvaluation(id: string, user: AuthUserPayload, reply: unknown) {
  if (typeof reply !== 'string' || !reply.trim() || reply.trim().length > 500) evaluationError('回复需填写 1～500 字');
  return evaluationTransaction(async (connection, notices) => {
    await lockEvaluationOrder(connection, id);
    const [rows]: any = await connection.query(`SELECT e.*, s.status ${EVALUATION_JOIN} WHERE e.id=? FOR UPDATE`, [id]);
    const row = rows[0];
    if (!row) evaluationError('评价不存在', 404);
    if (row.target_id !== user.id || !['advertiser', 'designer'].includes(user.role)) evaluationError('只有被评价账号可以回复', 403);
    if (row.status !== 'published' || row.visibility !== 'visible') evaluationError('只能回复已公开的有效评价', 409);
    if (row.replied_at != null) evaluationError('该评价已回复，不可重复回复', 409);
    await connection.query('UPDATE order_evaluations SET reply=?, replied_at=? WHERE id=?', [reply.trim(), Date.now(), id]);
    await notice(connection, notices, `reply:${id}`, row.author_id, '合作评价收到回复', '对方已回复你的合作评价。', '/evaluations?tab=sent');
  });
}
export async function reportEvaluation(id: string, user: AuthUserPayload, body: any) {
  if (!['advertiser', 'designer'].includes(user.role)) evaluationError('当前角色不能举报评价', 403);
  if (!['与订单无关', '泄露隐私', '辱骂或不当内容', '虚假交易', '其他'].includes(body?.reason)) evaluationError('请选择举报原因');
  if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 2000) evaluationError('请填写举报说明，最多 2000 字');
  return evaluationTransaction(async (connection, notices) => {
    await lockEvaluationOrder(connection, id);
    const [rows]: any = await connection.query(`SELECT e.id ${EVALUATION_JOIN} WHERE e.id=? AND s.status='published' AND e.visibility='visible' FOR UPDATE`, [id]);
    if (!rows.length) evaluationError('评价未公开或已隐藏', 404);
    const [existing]: any = await connection.query('SELECT id FROM order_evaluation_reports WHERE evaluation_id=? AND reporter_id=?', [id, user.id]);
    if (existing.length) evaluationError('已提交举报，请等待客服处理', 409);
    await connection.query(`INSERT INTO order_evaluation_reports (id, evaluation_id, reporter_id, reporter_name, reason, description, created_at)
      VALUES (?,?,?,?,?,?,?)`, [`evalreport_${crypto.randomUUID()}`, id, user.id, user.name, body.reason, body.description.trim(), Date.now()]);
    const [staff]: any = await connection.query("SELECT id FROM users WHERE role IN ('admin','customer_service') AND is_active=1");
    for (const row of staff) await notice(connection, notices, `report:${id}:${user.id}`, row.id, '有新的评价举报', '请查看合作评价举报并处理。', '/service/evaluations');
  });
}
export async function moderateEvaluation(id: string, user: AuthUserPayload, body: any, ip?: string) {
  if (!['admin', 'customer_service'].includes(user.role)) evaluationError('无权处理评价', 403);
  if (!['keep', 'hide', 'restore'].includes(body?.action)) evaluationError('处理动作无效');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000) evaluationError('请填写处理理由，最多 1000 字');
  return evaluationTransaction(async (connection, notices) => {
    await lockEvaluationOrder(connection, id);
    const [rows]: any = await connection.query('SELECT * FROM order_evaluations WHERE id=? FOR UPDATE', [id]);
    const row = rows[0];
    if (!row) evaluationError('评价不存在', 404);
    await connection.query('UPDATE order_evaluations SET visibility=? WHERE id=?', [body.action === 'hide' ? 'hidden' : body.action === 'restore' ? 'visible' : row.visibility, id]);
    const [reports]: any = await connection.query("SELECT * FROM order_evaluation_reports WHERE evaluation_id=? AND status='open' FOR UPDATE", [id]);
    await connection.query("UPDATE order_evaluation_reports SET status='resolved', decision=?, resolution=?, handler_id=?, resolved_at=? WHERE evaluation_id=? AND status='open'", [body.action, body.reason.trim(), user.id, Date.now(), id]);
    await connection.query(`INSERT INTO admin_audit_logs (id, operator_id, operator_name, module, action, target_type, target_id, summary, detail_json, ip_address, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [`audit_${crypto.randomUUID()}`, user.id, user.name, 'order_evaluations', body.action, 'order_evaluation', id,
      `${user.name}处理合作评价：${body.action}`, JSON.stringify({ reason: body.reason.trim(), previousVisibility: row.visibility }), ip || null, new Date().toISOString()]);
    for (const recipient of new Set([row.author_id, row.target_id, ...reports.map((report: any) => report.reporter_id)])) {
      await notice(connection, notices, `moderated:${id}:${crypto.randomUUID()}`, String(recipient), '合作评价处理结果', `处理结果：${body.action === 'hide' ? '已隐藏' : body.action === 'restore' ? '已恢复' : '予以保留'}。理由：${body.reason.trim()}`);
    }
  });
}
let workerRunning = false;
export async function reconcileOrderEvaluations() {
  if (!dbPool || workerRunning) return;
  workerRunning = true;
  try {
    // ponytail: one worker scans eligible orders; switch to a shared job queue if deployment volume requires it.
    const [rows]: any = await dbPool.query(`SELECT DISTINCT d.id FROM design_orders d
      LEFT JOIN order_evaluation_sessions s ON s.order_id=d.id COLLATE utf8mb4_unicode_ci
      JOIN order_evaluation_config c ON c.id=1
      WHERE (s.status IN ('open','paused')) OR (s.status='published' AND (d.status='cancelled' OR d.deposit_refund_status='refunded'))
        OR (s.order_id IS NULL AND d.payment_status='paid' AND d.status<>'cancelled'
          AND d.balance_paid_at >= ?)
      ORDER BY d.id`, [new Date(await activationTime()).toISOString()]);
    for (const row of rows) {
      try { await evaluationTransaction((connection, notices) => syncSession(connection, notices, row.id)); }
      catch (error) { console.error('[Evaluations] 订单评价同步失败:', row.id, error); }
    }
  } finally { workerRunning = false; }
}
async function activationTime() {
  const [rows]: any = await evaluationPool().query('SELECT activated_at FROM order_evaluation_config WHERE id=1');
  return Number(rows[0]?.activated_at || Date.now());
}
export function startOrderEvaluationWorker() {
  void reconcileOrderEvaluations().catch((error) => console.error('[Evaluations] 同步失败:', error));
  const timer = setInterval(() => void reconcileOrderEvaluations().catch((error) => console.error('[Evaluations] 同步失败:', error)), 60000);
  timer.unref();
}
