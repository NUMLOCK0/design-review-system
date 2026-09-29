import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { evaluationError, evaluationFromRow, evaluationPool, evaluationSummary, EVALUATION_JOIN, EVALUATION_SELECT,
  getOrderEvaluationState, moderateEvaluation, replyEvaluation, reportEvaluation, submitOrderEvaluation } from '../services/order-evaluations.js';

export const orderEvaluationsRouter = Router();
orderEvaluationsRouter.use(authenticate);
const pagination = (query: any) => {
  const integer = (value: unknown, fallback: number, max: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(max, Math.floor(number))) : fallback;
  };
  const page = integer(query.page ?? 1, 1, 100000);
  const pageSize = integer(query.pageSize ?? 10, 10, 50);
  return { page, pageSize, offset: (page - 1) * pageSize };
};
const ok = (res: any, data: unknown, extra: object = {}) => res.json({ code: 200, success: true, data, ...extra });

orderEvaluationsRouter.get('/orders/:orderId', async (req, res, next) => {
  try { ok(res, await getOrderEvaluationState(String(req.params.orderId), req.user!)); }
  catch (error) { next(error); }
});
orderEvaluationsRouter.post('/orders/:orderId', requireRoles('advertiser', 'designer'), async (req, res, next) => {
  try { ok(res, await submitOrderEvaluation(String(req.params.orderId), req.user!, req.body), { message: '评价已提交' }); }
  catch (error) { next(error); }
});
orderEvaluationsRouter.get('/mine', requireRoles('advertiser', 'designer'), async (req, res, next) => {
  try {
    const pool = evaluationPool();
    const { page, pageSize, offset } = pagination(req.query);
    const tab = String(req.query.tab || 'pending');
    if (!['pending', 'received', 'sent'].includes(tab)) evaluationError('评价分类无效');
    if (tab === 'pending') {
      const [users]: any = await pool.query('SELECT organization_id, is_organization_admin FROM users WHERE id=?', [req.user!.id]);
      const organization = users[0]?.is_organization_admin ? users[0]?.organization_id : '';
      const brand = req.user!.role === 'advertiser';
      const where = `s.status IN ('open','paused') AND (s.status='paused' OR s.deadline_at>?)
        AND ${brand ? '(s.advertiser_id=? OR (?<>\'\' AND d.organization_id=?))' : 's.designer_id=?'}
        AND NOT EXISTS (SELECT 1 FROM order_evaluations e WHERE e.order_id=s.order_id AND e.direction=?)`;
      const args = [Date.now(), req.user!.id, ...(brand ? [organization || '', organization || ''] : []), brand ? 'advertiser_to_designer' : 'designer_to_advertiser'];
      const [count]: any = await pool.query(`SELECT COUNT(*) AS total FROM order_evaluation_sessions s JOIN design_orders d ON d.id COLLATE utf8mb4_unicode_ci=s.order_id WHERE ${where}`, args);
      const [rows]: any = await pool.query(`SELECT s.*, d.title, d.order_no, d.creator_name, d.claimed_by_name
        FROM order_evaluation_sessions s JOIN design_orders d ON d.id COLLATE utf8mb4_unicode_ci=s.order_id WHERE ${where}
        ORDER BY s.deadline_at LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
      ok(res, rows.map((row: any) => ({ orderId: row.order_id, title: row.title, targetName: brand ? row.claimed_by_name : row.creator_name,
        deadlineAt: row.status === 'paused' ? undefined : new Date(Number(row.deadline_at)).toISOString(), status: row.status })),
      { total: Number(count[0].total), page, pageSize, hasMore: page * pageSize < Number(count[0].total) });
    } else {
      const brandSent = tab === 'sent' && req.user!.role === 'advertiser';
      const where = tab === 'sent' ? brandSent ? "(e.author_id=? OR (s.advertiser_id=? AND e.direction='advertiser_to_designer'))" : 'e.author_id=?' : "e.target_id=? AND s.status='published' AND e.visibility='visible'";
      const args = brandSent ? [req.user!.id, req.user!.id] : [req.user!.id];
      const [count]: any = await pool.query(`SELECT COUNT(*) AS total ${EVALUATION_JOIN} WHERE ${where}`, args);
      const [rows]: any = await pool.query(`${EVALUATION_SELECT} WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
      ok(res, rows.map((row: any) => evaluationFromRow(row, tab === 'received')), { total: Number(count[0].total), page, pageSize, hasMore: page * pageSize < Number(count[0].total) });
    }
  } catch (error) { next(error); }
});
orderEvaluationsRouter.get('/users/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId);
    const { page, pageSize, offset } = pagination(req.query);
    const [users]: any = await evaluationPool().query("SELECT id FROM users WHERE id=? AND role IN ('advertiser','designer') AND is_active=1", [userId]);
    if (!users.length) evaluationError('用户不存在', 404);
    const summary = await evaluationSummary(userId);
    const [rows]: any = await evaluationPool().query(`${EVALUATION_SELECT}
      WHERE e.target_id=? AND s.status='published' AND s.reputation_eligible=1 AND e.visibility='visible'
      ORDER BY s.published_at DESC, e.id DESC LIMIT ? OFFSET ?`, [userId, pageSize, offset]);
    ok(res, rows.map((row: any) => evaluationFromRow(row, true)), { summary, total: summary.count, page, pageSize, hasMore: page * pageSize < summary.count });
  } catch (error) { next(error); }
});
orderEvaluationsRouter.post('/:id/reply', requireRoles('advertiser', 'designer'), async (req, res, next) => {
  try { await replyEvaluation(String(req.params.id), req.user!, req.body?.reply); ok(res, null, { message: '回复已提交' }); }
  catch (error) { next(error); }
});
orderEvaluationsRouter.post('/:id/reports', requireRoles('advertiser', 'designer'), async (req, res, next) => {
  try { await reportEvaluation(String(req.params.id), req.user!, req.body); ok(res, null, { message: '举报已提交，等待客服处理' }); }
  catch (error) { next(error); }
});
orderEvaluationsRouter.get('/management/list', requireRoles('admin', 'customer_service'), async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query);
    const visibility = String(req.query.visibility || 'all');
    if (!['all', 'visible', 'hidden'].includes(visibility)) evaluationError('评价状态无效');
    const where = visibility === 'all' ? '' : 'WHERE e.visibility=?';
    const args = visibility === 'all' ? [] : [visibility];
    const [count]: any = await evaluationPool().query(`SELECT COUNT(*) AS total FROM order_evaluations e ${where}`, args);
    const [rows]: any = await evaluationPool().query(`${EVALUATION_SELECT} ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, [...args, pageSize, offset]);
    ok(res, rows.map((row: any) => evaluationFromRow(row)), { total: Number(count[0].total), page, pageSize, hasMore: page * pageSize < Number(count[0].total) });
  } catch (error) { next(error); }
});
orderEvaluationsRouter.get('/management/reports', requireRoles('admin', 'customer_service'), async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query);
    const status = String(req.query.status || 'open');
    if (!['open', 'resolved'].includes(status)) evaluationError('举报状态无效');
    const [count]: any = await evaluationPool().query('SELECT COUNT(*) AS total FROM order_evaluation_reports WHERE status=?', [status]);
    const [rows]: any = await evaluationPool().query(`SELECT r.id AS report_id, r.reporter_name, r.reason, r.description,
      r.status AS report_status, r.decision, r.resolution, r.created_at AS report_created_at,
      e.*, s.category, s.published_at, s.reputation_eligible, u.name AS target_name
      FROM order_evaluation_reports r JOIN order_evaluations e ON e.id=r.evaluation_id
      JOIN order_evaluation_sessions s ON s.order_id=e.order_id LEFT JOIN users u ON u.id COLLATE utf8mb4_unicode_ci=e.target_id
      WHERE r.status=? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [status, pageSize, offset]);
    ok(res, rows.map((row: any) => ({ id: row.report_id, evaluationId: row.id, reporterName: row.reporter_name,
      reason: row.reason, description: row.description, status: row.report_status, decision: row.decision, resolution: row.resolution,
      createdAt: new Date(Number(row.report_created_at)).toISOString(), evaluation: evaluationFromRow(row) })),
    { total: Number(count[0].total), page, pageSize, hasMore: page * pageSize < Number(count[0].total) });
  } catch (error) { next(error); }
});
orderEvaluationsRouter.post('/management/:id', requireRoles('admin', 'customer_service'), async (req, res, next) => {
  try { await moderateEvaluation(String(req.params.id), req.user!, req.body, req.ip); ok(res, null, { message: '评价处理完成' }); }
  catch (error) { next(error); }
});
