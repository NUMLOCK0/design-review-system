import { Router } from 'express';
import type { DesignOrder, OrderDispute, ServiceActionLog, ServiceTaskType } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { designOrders } from './design-orders.js';
import { disputes } from './disputes.js';
import { persistDesignOrder, persistDispute, persistServiceActionLog } from '../config/persistence.js';
import { withdrawalRequests } from './wallet.js';
import { recordAdminAudit } from '../services/admin-audit.js';
import { dbPool } from '../config/database.js';

export const serviceRouter = Router();
export const serviceLogs: ServiceActionLog[] = [];

const ORDER_SLA_HOURS = 4;
const DISPUTE_SLA_HOURS = 24;
const PORTFOLIO_REVIEW_SLA_HOURS = 24;

type PortfolioReviewItem = {
  id: string;
  type: 'portfolio_review';
  title: string;
  subtitle: string;
  assigneeId?: undefined;
  assigneeName?: undefined;
  status: 'pending_review';
  statusLabel: string;
  priority: 'high';
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  completed: false;
  payload: { designerId: string; designerName: string; title: string };
};

function buildPortfolioReviewItems(rows: any[]): PortfolioReviewItem[] {
  return rows.map((row) => {
    const createdAt = new Date(row.created_at).toISOString();
    const updatedAt = new Date(row.updated_at || row.created_at).toISOString();
    return {
      id: row.id,
      type: 'portfolio_review',
      title: `作品审核：${row.title}`,
      subtitle: `${row.designer_name} · 设计师作品`,
      status: 'pending_review',
      statusLabel: '待审核',
      priority: 'high',
      dueAt: dueAt(createdAt, PORTFOLIO_REVIEW_SLA_HOURS),
      createdAt,
      updatedAt,
      completed: false,
      payload: { designerId: row.designer_id, designerName: row.designer_name, title: row.title },
    };
  });
}

function dueAt(createdAt: string, hours: number) {
  return new Date(new Date(createdAt).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeOrder(order: DesignOrder) {
  order.servicePriority ||= order.urgency === 'super_urgent' ? 'urgent' : order.urgency === 'urgent' ? 'high' : 'normal';
  order.serviceDueAt ||= dueAt(order.createdAt, ORDER_SLA_HOURS);
}

function normalizeDispute(dispute: OrderDispute) {
  dispute.servicePriority ||= 'high';
  dispute.serviceDueAt ||= dueAt(dispute.createdAt, DISPUTE_SLA_HOURS);
}

function taskExists(type: ServiceTaskType, id: string) {
  if (type === 'order_audit') return designOrders.find((order) => order.id === id && order.status !== 'cancelled' && order.publicationStatus === 'pending_service_review');
  if (type === 'withdrawal_review') return withdrawalRequests.find((request) => request.id === id && request.status === 'pending_review');
  return disputes.find((dispute) => dispute.id === id && dispute.status !== 'resolved');
}

function isOverdue(item: { dueAt?: string }) {
  return Boolean(item.dueAt && new Date(item.dueAt).getTime() < Date.now());
}

function isCompletedToday(date?: string) {
  return Boolean(date && date.slice(0, 10) === new Date().toISOString().slice(0, 10));
}

function buildWorkItems() {
  designOrders.forEach(normalizeOrder);
  disputes.forEach(normalizeDispute);

  const orderItems = designOrders.filter((order) => order.status !== 'cancelled' || order.depositRefundStatus === 'pending').map((order) => ({
    id: order.id,
    type: 'order_audit' as const,
    title: order.title,
    subtitle: order.orderNo,
    status: order.publicationStatus || order.status,
    statusLabel: order.depositRefundStatus === 'pending' ? '待原路退款' : order.publicationStatus === 'pending_service_review' ? '待发布审核' : order.publicationStatus === 'published' ? '已通过' : '已驳回',
    priority: order.servicePriority!,
    assigneeId: order.serviceAssigneeId,
    assigneeName: order.serviceAssigneeName,
    dueAt: order.serviceDueAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt || order.createdAt,
    completed: order.depositRefundStatus !== 'pending' && order.publicationStatus !== 'pending_service_review',
    payload: order,
  }));
  const disputeItems = disputes.map((dispute) => ({
    id: dispute.id,
    type: 'dispute' as const,
    title: `订单 ${dispute.orderNo}`,
    subtitle: dispute.reason,
    status: dispute.status,
    statusLabel: dispute.status === 'open' ? '待处理' : dispute.status === 'mediation' ? '调解中' : dispute.status === 'escalated' ? '已升级' : '已结案',
    priority: dispute.servicePriority!,
    assigneeId: dispute.handlerId,
    assigneeName: dispute.handlerName,
    dueAt: dispute.serviceDueAt,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt || dispute.createdAt,
    completed: dispute.status === 'resolved',
    payload: dispute,
  }));
  const withdrawalItems = withdrawalRequests.map((request) => ({
    id: request.id,
    type: 'withdrawal_review' as const,
    title: `提现 ¥${request.amount.toFixed(2)}`,
    subtitle: `${request.designerName} · 尾号${request.bankAccount.accountNo.slice(-4)}`,
    status: request.status,
    statusLabel: request.status === 'pending_review' ? '待审核' : request.status === 'approved' ? '已通过' : '已驳回',
    priority: 'normal' as const,
    assigneeId: undefined,
    assigneeName: undefined,
    dueAt: dueAt(request.createdAt, 24),
    createdAt: request.createdAt,
    updatedAt: request.reviewedAt || request.createdAt,
    completed: request.status !== 'pending_review',
    payload: { ...request, bankAccount: { ...request.bankAccount, accountNo: `**** **** **** ${request.bankAccount.accountNo.slice(-4)}` } },
  }));
  return [...orderItems, ...disputeItems, ...withdrawalItems].sort((a, b) => {
    const overdueDiff = Number(isOverdue(b)) - Number(isOverdue(a));
    return overdueDiff || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

function filterItems(items: Array<ReturnType<typeof buildWorkItems>[number] | PortfolioReviewItem>, req: any) {
  const tab = String(req.query.tab || 'all');
  const keyword = String(req.query.keyword || '').trim().toLowerCase();
  const assignee = String(req.query.assignee || 'all');
  const userId = req.user.id;

  return items.filter((item) => {
    const searchable = `${item.title} ${item.subtitle} ${item.assigneeName || ''}`.toLowerCase();
    const keywordMatched = !keyword || searchable.includes(keyword);
    const assigneeMatched = assignee === 'all' || (assignee === 'mine' ? item.assigneeId === userId : !item.assigneeId);
    const tabMatched = tab === 'completed'
      ? item.completed
      : tab === 'mine'
        ? !item.completed && item.assigneeId === userId
        : tab === 'unassigned'
          ? !item.completed && item.type === 'dispute' && !item.assigneeId
          : tab === 'deposit_refund'
            ? !item.completed && item.type === 'order_audit' && (item.payload as DesignOrder).depositRefundStatus === 'pending'
            : tab === 'portfolio_review'
              ? !item.completed && item.type === 'portfolio_review'
              : tab === 'order_audit'
                ? !item.completed && item.type === 'order_audit' && (item.payload as DesignOrder).depositRefundStatus !== 'pending'
            : tab === 'dispute'
              ? !item.completed && item.type === 'dispute'
              : tab === 'withdrawal_review'
                ? !item.completed && item.type === 'withdrawal_review'
              : tab === 'overdue'
                ? !item.completed && isOverdue(item)
                : !item.completed;
    return keywordMatched && assigneeMatched && tabMatched;
  });
}

function getTask(type: ServiceTaskType, id: string) {
  if (type === 'order_audit') return designOrders.find((order) => order.id === id);
  if (type === 'withdrawal_review') return withdrawalRequests.find((request) => request.id === id);
  return disputes.find((dispute) => dispute.id === id);
}

function addLog(taskType: ServiceTaskType, taskId: string, action: string, comment: string, user: NonNullable<Express.Request['user']>) {
  const log: ServiceActionLog = {
    id: `service_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    taskType,
    taskId,
    action,
    comment: comment || undefined,
    operatorId: user.id,
    operatorName: user.name,
    createdAt: new Date().toISOString(),
  };
  serviceLogs.unshift(log);
  void persistServiceActionLog(log);
  void recordAdminAudit({ operatorId: user.id, operatorName: user.name, module: 'service_tasks', action, targetType: taskType, targetId: taskId, summary: `${user.name}${action === 'claim' ? '领取' : '处理'}${taskType === 'order_audit' ? '订单审核' : taskType === 'dispute' ? '订单争议' : '提现审核'}任务`, detail: { comment }, ipAddress: undefined, createdAt: log.createdAt }).catch((error) => console.error('[Audit] 客服任务日志写入失败:', error));
  return log;
}

serviceRouter.get('/dashboard', authenticate, requireRoles('customer_service', 'admin'), async (req, res, next) => {
  try {
    const items = buildWorkItems();
    let portfolioItems: PortfolioReviewItem[] = [];
    if (dbPool) {
      const [rows]: any = await dbPool.query(`SELECT dp.id, dp.title, dp.created_at, dp.updated_at, u.id AS designer_id, u.name AS designer_name
        FROM designer_portfolios dp JOIN users u ON u.id=dp.designer_id
        WHERE dp.status='pending_review' ORDER BY dp.created_at ASC LIMIT 500`);
      portfolioItems = buildPortfolioReviewItems(rows);
    }
    const allItems = [...items, ...portfolioItems].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const active = allItems.filter((item) => !item.completed);
    const filtered = filterItems(allItems, req);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 20);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);
    const completedToday = items.filter((item) => item.completed && isCompletedToday(item.updatedAt)).length;

    res.json({
      code: 200,
      success: true,
      data,
      total: filtered.length,
      page,
      pageSize,
      hasMore: start + data.length < filtered.length,
      counts: {
        all: active.length,
        mine: active.filter((item) => item.assigneeId === req.user!.id).length,
        unassigned: active.filter((item) => item.type === 'dispute' && !item.assigneeId).length,
        orderAudit: active.filter((item) => item.type === 'order_audit' && item.status === 'pending_service_review').length,
        portfolioReview: active.filter((item) => item.type === 'portfolio_review').length,
        depositRefund: active.filter((item) => item.type === 'order_audit' && (item.payload as DesignOrder).depositRefundStatus === 'pending').length,
        dispute: active.filter((item) => item.type === 'dispute').length,
        withdrawalReview: active.filter((item) => item.type === 'withdrawal_review').length,
        overdue: active.filter(isOverdue).length,
        completedToday,
      },
      timestamp: Date.now(),
    });
  } catch (error) { next(error); }
});
serviceRouter.get('/tasks/:type/:id', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const type = String(req.params.type);
  if (!['order_audit', 'dispute', 'withdrawal_review'].includes(type)) return res.status(400).json({ code: 400, success: false, message: '任务类型无效' });
  const item = buildWorkItems().find((work) => work.type === type && work.id === req.params.id);
  if (!item) return res.status(404).json({ code: 404, success: false, message: '客服任务不存在' });
  res.json({ code: 200, success: true, data: item, timestamp: Date.now() });
});

serviceRouter.get('/logs', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const taskType = String(req.query.taskType || '');
  const taskId = String(req.query.taskId || '');
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const filtered = serviceLogs.filter((log) => (!taskType || log.taskType === taskType) && (!taskId || log.taskId === taskId));
  const start = (page - 1) * pageSize;
  const data = filtered.slice(start, start + pageSize);
  res.json({ code: 200, success: true, data, total: filtered.length, page, pageSize, hasMore: start + data.length < filtered.length, timestamp: Date.now() });
});

serviceRouter.post('/logs', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const taskType = req.body?.taskType as ServiceTaskType;
  const taskId = String(req.body?.taskId || '');
  const action = String(req.body?.action || '').trim();
  const comment = String(req.body?.comment || '').trim();
  const allowedActions = ['claim', 'approve', 'reject', 'mediation', 'resolve', 'escalate', 'refund_original_channel'];
  if (!['order_audit', 'dispute', 'withdrawal_review'].includes(taskType) || !getTask(taskType, taskId) || !allowedActions.includes(action) || comment.length > 5000) {
    return res.status(400).json({ code: 400, success: false, message: '操作记录参数无效' });
  }
  const log = addLog(taskType, taskId, action, comment, req.user!);
  res.status(201).json({ code: 201, success: true, data: log, timestamp: Date.now() });
});

serviceRouter.post('/tasks/:type/:id/claim', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const type = String(req.params.type) as ServiceTaskType;
  const id = String(req.params.id);
  if (!['order_audit', 'dispute'].includes(type)) {
    return res.status(400).json({ code: 400, success: false, message: '任务类型无效' });
  }
  const task = taskExists(type, id);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在或已处理' });

  const currentAssigneeId = type === 'order_audit' ? (task as DesignOrder).serviceAssigneeId : (task as OrderDispute).handlerId;
  if (currentAssigneeId && currentAssigneeId !== req.user!.id) {
    return res.status(409).json({ code: 409, success: false, message: '任务已被其他客服领取' });
  }

  const now = new Date().toISOString();
  if (type === 'order_audit') {
    const order = task as DesignOrder;
    normalizeOrder(order);
    order.serviceAssigneeId = req.user!.id;
    order.serviceAssigneeName = req.user!.name;
    order.serviceClaimedAt ||= now;
    order.updatedAt = now;
    void persistDesignOrder(order);
  } else {
    const dispute = task as OrderDispute;
    normalizeDispute(dispute);
    dispute.handlerId = req.user!.id;
    dispute.handlerName = req.user!.name;
    dispute.serviceClaimedAt ||= now;
    dispute.updatedAt = now;
    void persistDispute(dispute);
  }
  addLog(type, id, 'claim', '领取任务', req.user!);
  res.json({ code: 200, success: true, message: '任务已领取', timestamp: Date.now() });
});
