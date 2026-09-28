import { Router } from 'express';
import { calculateOrderMinimumBudget } from '@design-review/shared';
import type { DesignOrder, SystemConfig, ApiResponse, ReviewTask, OrderImageRequirementItem } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { tasks } from './review-tasks.js';
import { rules } from './review-rules.js';
import { persistDesignOrder, persistReviewTask } from '../config/persistence.js';
import { notifyUser } from './messages.js';
import { dbPool } from '../config/database.js';
import { getSystemConfig } from './system-config.js';
import { calculateOrderSettlement } from '../utils/order-finance.js';
import { recordAdminAudit } from '../services/admin-audit.js';
import { getDesignerClaimEligibility } from '../services/designer-claim-eligibility.js';

export const designOrdersRouter = Router();

// 业务订单只来自真实发布，不再预置演示订单。
export let designOrders: DesignOrder[] = [];

function getMinimumOrderBudget(groups: OrderImageRequirementItem[] | undefined, config: SystemConfig, requiresPsd = false) {
  return calculateOrderMinimumBudget(groups, config.imageUnitPrices, config.minOrderBudget, requiresPsd, config.psdSurchargeRate, config.imageUnitPrice);
}

export async function activatePublishedOrder(order: DesignOrder) {
  order.publicationStatus = 'published';
  order.status = 'open';
  order.updatedAt = new Date().toISOString();
  await persistDesignOrder(order);
  if (!dbPool) return;
  const now = new Date().toISOString();
  const [rows]: any = await dbPool.query(`SELECT id, designer_id FROM order_invitations WHERE order_id=? AND status='queued' AND expires_at >= ?`, [order.id, now]);
  if (!rows.length) return;
  await dbPool.query(`UPDATE order_invitations SET status='sent', sent_at=? WHERE order_id=? AND status='queued' AND expires_at >= ?`, [now, order.id, now]);
  rows.forEach((row: any) => notifyUser(row.designer_id, { type: 'order', title: '收到设计订单邀请', content: `${order.creatorName}邀请你参与「${order.title}」。`, link: '/invitations' }));
}

// 客服订单发布审核队列：客服只审核订单是否允许进入接单大厅，不审核设计师作品。
designOrdersRouter.get('/service/pending', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const list = designOrders.filter((order) => order.status !== 'cancelled' && order.publicationStatus === 'pending_service_review');
  res.json({ code: 200, success: true, data: list, timestamp: Date.now() });
});

// 品牌方订单视图包含待客服审核、已驳回和已发布订单；接单大厅不会暴露这些内部状态。
designOrdersRouter.get('/mine', authenticate, requireRoles('advertiser', 'designer', 'admin'), (req, res) => {
  const status = String(req.query.status || 'all');
  const billingStatus = String(req.query.billingStatus || 'all');
  const keyword = String(req.query.keyword || '').trim().toLowerCase();
  const pageSize = Math.min(Math.max(Math.floor(Number(req.query.pageSize) || 10), 1), 10);
  const page = Math.max(Math.floor(Number(req.query.page) || 1), 1);
  let list = req.user!.role === 'admin'
    ? designOrders
    : req.user!.role === 'designer'
      ? designOrders.filter((order) => order.claimedById === req.user!.id)
      : designOrders.filter((order) => order.creatorId === req.user!.id || order.organizationId === req.user!.organizationId);
  const statusCounts = list.reduce<Record<string, number>>((counts, order) => {
    const currentStatus = order.status === 'cancelled' && order.publicationStatus !== 'rejected'
      ? 'cancelled'
      : order.publicationStatus || order.status;
    counts[currentStatus] = (counts[currentStatus] || 0) + 1;
    counts.all = (counts.all || 0) + 1;
    return counts;
  }, { all: 0 });
  const getBillingStatus = (order: DesignOrder) => order.status === 'cancelled' ? 'closed' : order.paymentStatus === 'paid' ? 'settled' : 'processing';
  const billingCounts = list.reduce<Record<string, number>>((counts, order) => {
    const currentStatus = getBillingStatus(order);
    counts[currentStatus] = (counts[currentStatus] || 0) + 1;
    counts.all = (counts.all || 0) + 1;
    return counts;
  }, { all: 0 });
  list = list.filter((order) => {
    const currentStatus = order.status === 'cancelled' && order.publicationStatus !== 'rejected'
      ? 'cancelled'
      : order.publicationStatus || order.status;
    const statusMatched = status === 'all' || currentStatus === status;
    const keywordMatched = !keyword || order.title.toLowerCase().includes(keyword);
    const billingStatusMatched = billingStatus === 'all' || getBillingStatus(order) === billingStatus;
    return statusMatched && keywordMatched && billingStatusMatched;
  });
  const start = (page - 1) * pageSize;
  const data = list.slice(start, start + pageSize);
  res.json({ code: 200, success: true, data, total: list.length, page, pageSize, hasMore: start + data.length < list.length, counts: statusCounts, billingCounts, timestamp: Date.now() });
});

// 订单详情按角色限制返回，供移动端详情页直达加载，也避免在前端传递整张订单对象。
designOrdersRouter.get('/:id', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  const user = req.user!;
  const canView = user.role === 'admin'
    || (user.role === 'advertiser' && (order.creatorId === user.id || (Boolean(user.organizationId) && order.organizationId === user.organizationId)))
    || (user.role === 'designer' && (
      order.claimedById === user.id
      || (order.status === 'open' && order.publicationStatus === 'published' && order.paymentStatus !== 'deposit_pending')
    ))
    || (user.role === 'customer_service' && order.publicationStatus === 'pending_service_review');
  if (!canView) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  res.json({ code: 200, success: true, data: order, timestamp: Date.now() });
});

// 品牌方订单进度：仅返回关联任务的阶段与审核节点，不暴露审核工作台任务列表。
designOrdersRouter.get('/:id/progress', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  const isOwner = order && (req.user!.role === 'admin' || order.creatorId === req.user!.id || (Boolean(req.user!.organizationId) && order.organizationId === req.user!.organizationId));
  if (!isOwner || !order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });

  const task = tasks.find((item) => item.orderId === order.id || item.id === order.taskId);
  const rule = rules.find((item) => item.id === order.reviewRuleId);
  res.json({
    code: 200,
    success: true,
    data: {
      task: task && {
        status: task.status,
        currentLevel: task.currentLevel,
        totalImages: task.totalImages,
        approvedCount: task.approvedCount,
        rejectedCount: task.rejectedCount,
        designerName: task.designerName,
        submittedAt: task.submittedAt,
        completedAt: task.completedAt,
        updatedAt: task.updatedAt,
      },
      nodes: (rule?.levels || []).sort((a, b) => a.level - b.level).map((level) => ({ level: level.level, reviewerNames: level.reviewerNames, approvalMode: level.approvalMode })),
    },
    timestamp: Date.now()
  });
});

// 1. 获取接单广场列表 (接单大厅默认仅展示未被接单的开放需求 open)
designOrdersRouter.get('/', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), (req, res) => {
  const {
    status = 'open',
    category,
    urgency,
    platform,
    keyword,
    page = '1',
    pageSize = '15'
  } = req.query;
  let filtered = [...designOrders];

  // 接单大厅只展示客服已审核通过的订单。
  filtered = filtered.filter((order) => order.status === 'open' && order.publicationStatus === 'published' && order.paymentStatus !== 'deposit_pending');

  // 默认过滤掉已被接单的订单，仅展示 open 待接单需求
  if (status && status !== 'all') {
    filtered = filtered.filter(o => o.status === status);
  } else if (!status) {
    filtered = filtered.filter(o => o.status === 'open');
  }
  if (category && category !== 'all') {
    filtered = filtered.filter(o => o.category === category);
  }
  if (urgency && urgency !== 'all') {
    filtered = filtered.filter(o => o.urgency === urgency);
  }
  if (platform && platform !== 'all') {
    filtered = filtered.filter(o => o.platform === platform);
  }
  if (keyword && String(keyword).trim()) {
    const query = String(keyword).trim().toLowerCase();
    filtered = filtered.filter(o =>
      [o.orderNo, o.title, o.requirements, o.creatorName].some(value =>
        value.toLowerCase().includes(query)
      )
    );
  }

  const safePageSize = Math.min(Math.max(Number(pageSize) || 15, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const total = filtered.length;
  const start = (safePage - 1) * safePageSize;
  const paged = filtered.slice(start, start + safePageSize);

  res.json({
    code: 200,
    success: true,
    data: paged,
    total,
    page: safePage,
    pageSize: safePageSize,
    hasMore: start + paged.length < total,
    timestamp: Date.now()
  });
});

// 2. 前台发布新需求 / 派单
designOrdersRouter.post('/', authenticate, requireRoles('advertiser'), async (req, res) => {
  const {
    title,
    category,
    platform,
    budget,
    deadline,
    urgency,
    requirements,
    imageRequirementGroups,
    requiresPsd,
    referenceImages,
    reviewRuleId,
    reviewRuleName
  } = req.body;

  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const numBudget = Number(budget);
  const systemConfig = getSystemConfig();
  if (!normalizedTitle || normalizedTitle.length > 120 || !Number.isFinite(numBudget) || numBudget <= 0) {
    return res.status(400).json({ code: 400, success: false, message: '请填写有效的需求标题与预算金额' });
  }
  if (imageRequirementGroups !== undefined && !Array.isArray(imageRequirementGroups)) {
    return res.status(400).json({ code: 400, success: false, message: '图片分组数据格式无效' });
  }
  if (requiresPsd !== undefined && typeof requiresPsd !== 'boolean') {
    return res.status(400).json({ code: 400, success: false, message: 'PSD 源文件选项无效' });
  }
  const minimumBudget = getMinimumOrderBudget(imageRequirementGroups || [], systemConfig, requiresPsd === true);
  if (numBudget < minimumBudget) {
    return res.status(400).json({ code: 400, success: false, message: `订单预算不能低于最低报价 ¥${minimumBudget.toFixed(2)}${requiresPsd ? '（已含 PSD 源文件上浮）' : ''}` });
  }
  if (!reviewRuleId) {
    return res.status(400).json({ code: 400, success: false, message: '请先为订单绑定品牌方作品审核流' });
  }
  const reviewRule = rules.find((rule) => rule.id === reviewRuleId && rule.ownerId === req.user!.id && rule.isActive);
  if (!reviewRule) {
    return res.status(400).json({ code: 400, success: false, message: '审核流不存在、未启用或不属于当前品牌方' });
  }

  // 费率以管理员配置为准，并把最终费率快照写入订单。
  const rate = systemConfig.commissionTiers.find((tier) => tier.category === category)?.defaultRate ?? systemConfig.defaultCommissionRate;
  const settlement = calculateOrderSettlement(numBudget, rate, systemConfig.depositRate);

  // 收集所有组中的首图作为封面
  const allGroupImages: string[] = [];
  if (Array.isArray(imageRequirementGroups)) {
    imageRequirementGroups.forEach(g => {
      if (Array.isArray(g.referenceImages)) allGroupImages.push(...g.referenceImages.filter((item: unknown): item is string => typeof item === 'string'));
      if (Array.isArray(g.imageItems)) allGroupImages.push(...g.imageItems.map((item: any) => item?.materialImage).filter((item: unknown): item is string => typeof item === 'string'));
    });
  }

  const newOrder: DesignOrder = {
    id: `ord_${Date.now()}`,
    orderNo: `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
    title: normalizedTitle,
    category: category || '主图设计',
    platform: platform || 'tmall',
    budget: numBudget,
    platformCommissionRate: rate,
    designerPayout: settlement.designerPayout,
    deadline: deadline || new Date(Date.now() + 86400000 * 3).toISOString(),
    urgency: urgency || 'normal',
    requirements: requirements || '',
    requiresPsd: requiresPsd === true,
    imageRequirementGroups: imageRequirementGroups || [],
    referenceImages: allGroupImages.length > 0 ? allGroupImages : (referenceImages || []),
    status: 'open',
    publicationStatus: 'pending_deposit',
    paymentStatus: 'deposit_pending',
    depositRate: systemConfig.depositRate,
    depositAmount: settlement.depositAmount,
    balanceAmount: settlement.balanceAmount,
    creatorId: req.user!.id,
    creatorName: req.user!.name,
    organizationId: req.user!.organizationId,
    reviewRuleId,
    reviewRuleName: reviewRule.name,
    createdAt: new Date().toISOString()
  };

  designOrders.unshift(newOrder);
  await persistDesignOrder(newOrder);
  res.status(201).json({
    code: 200,
    success: true,
    message: '订单已创建，请先支付定金',
    data: newOrder,
    timestamp: Date.now()
  });
});

// 品牌方订单管理：未被接单的订单可编辑。
designOrdersRouter.patch('/:id', authenticate, requireRoles('advertiser'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  const isOwner = order && (order.creatorId === req.user!.id || (Boolean(req.user!.isOrganizationAdmin) && Boolean(req.user!.organizationId) && order.organizationId === req.user!.organizationId));
  if (!order || !isOwner) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  const wasPublished = order.publicationStatus === 'published' && order.status === 'open';
  // 客服驳回的订单仍允许回填修改，修改完成后再点击“重新提交”；
  // 普通已关闭订单保持不可编辑，通过“重新发布”生成新订单。
  if (order.status !== 'open' && order.publicationStatus !== 'rejected') {
    return res.status(400).json({ code: 400, success: false, message: '当前订单不可编辑' });
  }

  if (['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '')) {
    return res.status(400).json({ code: 400, success: false, message: '订单已有支付记录，不能直接修改金额或需求，请联系客服处理' });
  }

  const changesPricingInputs = req.body?.budget !== undefined || req.body?.imageRequirementGroups !== undefined || req.body?.requiresPsd !== undefined;
  const nextGroups = req.body?.imageRequirementGroups !== undefined ? req.body.imageRequirementGroups : order.imageRequirementGroups;
  const nextBudget = req.body?.budget !== undefined ? Number(req.body.budget) : Number(order.budget);
  const nextRequiresPsd = req.body?.requiresPsd !== undefined ? req.body.requiresPsd : Boolean(order.requiresPsd);
  if (req.body?.imageRequirementGroups !== undefined && !Array.isArray(req.body.imageRequirementGroups)) {
    return res.status(400).json({ code: 400, success: false, message: '图片分组数据格式无效' });
  }
  if (req.body?.requiresPsd !== undefined && typeof req.body.requiresPsd !== 'boolean') {
    return res.status(400).json({ code: 400, success: false, message: 'PSD 源文件选项无效' });
  }
  if (changesPricingInputs) {
    const minimumBudget = getMinimumOrderBudget(nextGroups, getSystemConfig(), nextRequiresPsd);
    if (!Number.isFinite(nextBudget) || nextBudget < minimumBudget) {
      return res.status(400).json({ code: 400, success: false, message: `订单预算不能低于最低报价 ¥${minimumBudget.toFixed(2)}${nextRequiresPsd ? '（已含 PSD 源文件上浮）' : ''}` });
    }
  }

  const editableFields = ['title', 'category', 'platform', 'budget', 'deadline', 'urgency', 'requirements', 'imageRequirementGroups', 'requiresPsd', 'referenceImages', 'reviewRuleId', 'reviewRuleName'];
  editableFields.forEach((field) => {
    if (req.body?.[field] !== undefined && field !== 'reviewRuleName') (order as any)[field] = req.body[field];
  });
  if (req.body?.title !== undefined) {
    const nextTitle = String(req.body.title).trim();
    if (!nextTitle || nextTitle.length > 120) return res.status(400).json({ code: 400, success: false, message: '订单标题长度无效' });
    order.title = nextTitle;
  }
  if (req.body?.budget !== undefined) {
    order.budget = Number(req.body.budget);
    const settlement = calculateOrderSettlement(order.budget, order.platformCommissionRate, order.depositRate || getSystemConfig().depositRate);
    order.designerPayout = settlement.designerPayout;
    order.depositAmount = settlement.depositAmount;
    order.balanceAmount = settlement.balanceAmount;
  }
  if (req.body?.reviewRuleId !== undefined) {
    const nextRule = rules.find((rule) => rule.id === String(req.body.reviewRuleId) && rule.ownerId === req.user!.id && rule.isActive);
    if (!nextRule) return res.status(400).json({ code: 400, success: false, message: '审核流不存在、未启用或无权使用' });
    order.reviewRuleId = nextRule.id;
    order.reviewRuleName = nextRule.name;
  }
  if (wasPublished) {
    order.publicationStatus = 'pending_service_review';
    order.publicationReviewComment = '';
    order.publicationReviewedAt = undefined;
    order.publicationReviewerId = undefined;
    order.publicationReviewerName = undefined;
    notifyUser('u_rev_1', {
      type: 'order',
      title: '已发布订单修改待审核',
      content: `${order.creatorName}修改了订单「${order.title}」，请重新完成发布审核。`,
      link: '/service/dashboard?tab=order_audit',
    });
  }
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  res.json({ code: 200, success: true, message: wasPublished ? '订单已更新，已重新提交客服审核' : '订单已更新', data: order, timestamp: Date.now() });
});

designOrdersRouter.post('/:id/resubmit', authenticate, requireRoles('advertiser'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id && item.creatorId === req.user!.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (order.publicationStatus !== 'rejected') return res.status(400).json({ code: 400, success: false, message: '当前订单无需重新提交' });
  const minimumBudget = getMinimumOrderBudget(order.imageRequirementGroups, getSystemConfig(), order.requiresPsd);
  if (Number(order.budget) < minimumBudget) return res.status(400).json({ code: 400, success: false, message: `订单预算不能低于最低报价 ¥${minimumBudget.toFixed(2)}，请先修改订单` });
  order.publicationStatus = 'pending_service_review';
  order.status = 'open';
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  notifyUser('u_rev_1', { type: 'order', title: '订单重新提交待审核', content: `${order.creatorName}重新提交了订单「${order.title}」。`, link: '/service/dashboard?tab=order_audit' });
  res.json({ code: 200, success: true, message: '订单已重新提交审核', data: order, timestamp: Date.now() });
});

// 已关闭订单重新发布：保留原订单的财务与审计记录，复制一笔新的待支付订单。
designOrdersRouter.post('/:id/republish', authenticate, requireRoles('advertiser'), (req, res) => {
  const source = designOrders.find((item) => item.id === req.params.id);
  const isOwner = source && (source.creatorId === req.user!.id || (Boolean(req.user!.organizationId) && source.organizationId === req.user!.organizationId));
  if (!source || !isOwner) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (source.status !== 'cancelled' || source.publicationStatus === 'rejected') {
    return res.status(400).json({ code: 400, success: false, message: '当前订单不可重新发布，请使用重新提交或等待当前流程完成' });
  }
  const minimumBudget = getMinimumOrderBudget(source.imageRequirementGroups, getSystemConfig(), source.requiresPsd);
  if (Number(source.budget) < minimumBudget) return res.status(400).json({ code: 400, success: false, message: `订单预算不能低于最低报价 ¥${minimumBudget.toFixed(2)}，请先修改订单` });

  const now = new Date().toISOString();
  const id = `ord_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
  const orderNo = `ORD-${now.slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;
  const settlement = calculateOrderSettlement(source.budget, source.platformCommissionRate, source.depositRate || getSystemConfig().depositRate);
  const republishedOrder: DesignOrder = {
    ...source,
    id,
    orderNo,
    status: 'open',
    publicationStatus: 'pending_deposit',
    paymentStatus: 'deposit_pending',
    depositRate: source.depositRate || getSystemConfig().depositRate,
    depositAmount: settlement.depositAmount,
    balanceAmount: settlement.balanceAmount,
    designerPayout: settlement.designerPayout,
    depositOutTradeNo: undefined,
    depositTradeNo: undefined,
    depositPaidAt: undefined,
    depositRefundStatus: undefined,
    depositRefundTradeNo: undefined,
    depositRefundedAt: undefined,
    balanceOutTradeNo: undefined,
    balanceTradeNo: undefined,
    balancePaidAt: undefined,
    publicationReviewComment: undefined,
    publicationReviewedAt: undefined,
    publicationReviewerId: undefined,
    publicationReviewerName: undefined,
    claimedById: undefined,
    claimedByName: undefined,
    claimedAt: undefined,
    completedAt: undefined,
    taskId: undefined,
    isDisputed: false,
    disputeId: undefined,
    createdAt: now,
    updatedAt: now,
    imageRequirementGroups: source.imageRequirementGroups?.map((group) => ({
      ...group,
      referenceImages: [...(group.referenceImages || [])],
      referenceLinks: [...(group.referenceLinks || [])],
      referenceImageItems: group.referenceImageItems?.map((item) => ({ ...item })),
    })),
    referenceImages: source.referenceImages ? [...source.referenceImages] : undefined,
  };

  designOrders.unshift(republishedOrder);
  void persistDesignOrder(republishedOrder);
  res.status(201).json({ code: 200, success: true, message: '已生成新的发布订单，请支付定金后提交', data: republishedOrder, timestamp: Date.now() });
});

designOrdersRouter.post('/:id/cancel', authenticate, requireRoles('advertiser'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id && item.creatorId === req.user!.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (!['open', 'pending_service_review'].includes(order.status) || order.publicationStatus === 'rejected') {
    return res.status(400).json({ code: 400, success: false, message: '当前订单不可关闭' });
  }
  const paymentInProgress = order.paymentStatus === 'deposit_pending' && Boolean(order.depositOutTradeNo);
  const depositPaid = ['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '');
  const isUnclaimedAndPublishedOrAwaitingReview = ['published', 'pending_service_review'].includes(order.publicationStatus || '') && order.status === 'open' && !order.claimedById;
  if (paymentInProgress || (depositPaid && !isUnclaimedAndPublishedOrAwaitingReview)) {
    return res.status(400).json({ code: 400, success: false, message: paymentInProgress ? '订单正在支付中，请稍后再关闭' : '已接单或已进入执行流程的订单不可直接取消，请联系客服处理' });
  }
  order.status = 'cancelled';
  if (depositPaid && order.depositAmount && order.depositAmount > 0) order.depositRefundStatus = 'pending';
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  if (order.depositRefundStatus === 'pending') notifyUser('u_rev_1', { type: 'order', title: '订单定金待原路退款', content: `品牌方取消了未接单订单「${order.title}」，请按原支付渠道退还定金 ¥${Number(order.depositAmount).toFixed(2)}。`, link: '/service/dashboard?tab=deposit_refund' });
  res.json({ code: 200, success: true, message: order.depositRefundStatus === 'pending' ? '订单已取消，定金退款已提交客服按原支付渠道处理' : '订单已取消', data: order, timestamp: Date.now() });
});

designOrdersRouter.post('/:id/deposit-refund/confirm', authenticate, requireRoles('customer_service', 'admin'), async (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (order.status !== 'cancelled' || order.depositRefundStatus !== 'pending') return res.status(400).json({ code: 400, success: false, message: '该订单没有待处理的定金退款' });
  const tradeNo = String(req.body?.refundTradeNo || '').trim();
  if (!tradeNo || tradeNo.length > 128) return res.status(400).json({ code: 400, success: false, message: '请填写原支付渠道的退款流水号' });
  order.depositRefundTradeNo = tradeNo;
  order.depositRefundStatus = 'refunded';
  order.depositRefundedAt = new Date().toISOString();
  order.updatedAt = order.depositRefundedAt;
  await persistDesignOrder(order);
  notifyUser(order.creatorId, { type: 'order', title: '订单定金已退款', content: `订单「${order.title}」的定金已按原支付渠道退回。`, link: '/advertiser/orders' });
  res.json({ code: 200, success: true, message: '已记录原路退款', data: order, timestamp: Date.now() });
});

// 客服可在定金支付前修正订单价格，修改后重新计算定金、尾款与设计师收益。
designOrdersRouter.patch('/:id/service-price', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (order.publicationStatus !== 'pending_service_review' || !['deposit_pending', undefined, ''].includes(order.paymentStatus)) {
    return res.status(400).json({ code: 400, success: false, message: '只有未支付且待客服审核的订单可以修改价格' });
  }
  const budget = Number(req.body?.budget);
  const systemConfig = getSystemConfig();
  const minimumBudget = getMinimumOrderBudget(order.imageRequirementGroups, systemConfig, order.requiresPsd);
  if (!Number.isFinite(budget) || budget < minimumBudget) {
    return res.status(400).json({ code: 400, success: false, message: `订单预算不能低于最低报价 ¥${minimumBudget.toFixed(2)}${order.requiresPsd ? '（已含 PSD 源文件上浮）' : ''}` });
  }
  const settlement = calculateOrderSettlement(budget, order.platformCommissionRate, order.depositRate || getSystemConfig().depositRate);
  order.budget = budget;
  order.designerPayout = settlement.designerPayout;
  order.depositAmount = settlement.depositAmount;
  order.balanceAmount = settlement.balanceAmount;
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'order_audit', action: 'update_order_price', targetType: 'design_order', targetId: order.id, summary: `${req.user!.name}调整订单「${order.title}」价格`, detail: { orderNo: order.orderNo, budget }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 订单价格日志写入失败:', error));
  res.json({ code: 200, success: true, message: '订单价格已更新', data: order, timestamp: Date.now() });
});

// 3. 设计师抢单 / 接单 (接单后自动在审核任务中心创建关联任务)
designOrdersRouter.post('/:id/publication-review', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (order.status === 'cancelled') {
    return res.status(400).json({ code: 400, success: false, message: '已关闭订单不能继续发布审核，请等待品牌方重新发布' });
  }
  if (order.publicationStatus !== 'pending_service_review') {
    return res.status(400).json({ code: 400, success: false, message: '当前订单不在待发布审核状态' });
  }

  const approved = req.body?.action === 'approve';
  const rejected = req.body?.action === 'reject';
  if (!approved && !rejected) {
    return res.status(400).json({ code: 400, success: false, message: '审核动作必须为 approve 或 reject' });
  }

  order.publicationStatus = approved ? 'published' : 'rejected';
  order.publicationReviewComment = String(req.body?.comment || '');
  order.publicationReviewedAt = new Date().toISOString();
  order.publicationReviewerId = req.user!.id;
  order.publicationReviewerName = req.user!.name;
  order.status = approved ? 'open' : 'cancelled';
  order.updatedAt = new Date().toISOString();
  if (approved) {
    void activatePublishedOrder(order).catch((error) => console.error('[MySQL] 激活订单邀请失败:', error));
  } else {
    void persistDesignOrder(order);
  }
  if (!approved && dbPool) {
    void dbPool.query(`UPDATE order_invitations SET status='cancelled', responded_at=? WHERE order_id=? AND status='queued'`, [new Date().toISOString(), order.id])
      .catch((error) => console.error('[MySQL] 取消待发送邀请失败:', error));
  }
  notifyUser(order.creatorId, {
    type: 'order',
    title: approved ? '订单已通过发布审核' : '订单未通过发布审核',
    content: approved ? `订单「${order.title}」已进入接单大厅。` : `订单「${order.title}」需要补充后重新提交。`,
    link: '/advertiser/orders',
  });
  void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'order_audit', action: approved ? 'approve_publication' : 'reject_publication', targetType: 'design_order', targetId: order.id, summary: `${req.user!.name}${approved ? '通过' : '驳回'}订单「${order.title}」发布审核`, detail: { orderNo: order.orderNo, comment: order.publicationReviewComment }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 订单审核日志写入失败:', error));

  return res.json({
    code: 200,
    success: true,
    message: approved ? '订单已通过审核并进入接单大厅' : '订单已驳回，品牌方可修改后重新提交',
    data: order,
    timestamp: Date.now()
  });
});

// 抢单与邀请接受共用同一个任务创建入口，避免两条路径产生不同的订单状态。
export function claimDesignOrder(order: DesignOrder, designerId: string, designerName: string) {
  if (order.creatorId === designerId) {
    throw new Error('不能接取自己发布的订单');
  }
  if (order.status !== 'open' || (order.publicationStatus && order.publicationStatus !== 'published')) {
    throw new Error('手慢了，该订单已被接取或已下架');
  }

  const taskId = `task_${Date.now()}`;
  const taskNo = `REV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

  order.status = 'claimed';
  order.claimedById = designerId;
  order.claimedByName = designerName;
  order.claimedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.taskId = taskId;

  // 自动在审核任务中心创建关联任务草稿/待提交状态
  const createdTask: ReviewTask = {
    id: taskId,
    taskNo,
    productName: order.title,
    sku: `SKU-${order.orderNo.slice(-6)}`,
    platform: order.platform,
    designerId,
    designerName,
    advertiserId: order.creatorId,
    advertiserName: order.creatorName,
    organizationId: order.organizationId,
    ruleId: order.reviewRuleId,
    ruleName: order.reviewRuleName,
    status: 'draft',
    currentLevel: 1,
    totalImages: (order.imageRequirementGroups && order.imageRequirementGroups.length > 0)
      ? order.imageRequirementGroups.reduce((acc, g) => acc + (g.imageItems?.length || g.quantity || 1), 0)
      : (order.referenceImages?.length || 1),
    approvedCount: 0,
    rejectedCount: 0,
    rejectCount: 0,
    version: 1,
    urgency: order.urgency === 'super_urgent' ? 'urgent' : (order.urgency === 'urgent' ? 'high' : 'medium'),
    requiresPsd: Boolean(order.requiresPsd),
    orderId: order.id,
    orderBudget: order.budget,
    designerPayout: order.designerPayout,
    groups: (order.imageRequirementGroups && order.imageRequirementGroups.length > 0)
      ? order.imageRequirementGroups.map((grp, idx) => {
          const groupId = `grp_${Date.now()}_${idx}`;
          const itemSources = (grp.imageItems || [])
            .map((item) => ({ url: item.materialImage, description: item.description || grp.description || grp.name }))
            .filter((item): item is { url: string; description: string } => typeof item.url === 'string' && Boolean(item.url));
          const fallbackSources = (grp.referenceImages || []).map((url) => ({ url, description: grp.description || grp.name }));
          const sources = itemSources.length > 0 ? itemSources : fallbackSources;
          return {
            id: groupId,
            taskId,
            groupType: grp.groupType,
            requiredCount: grp.imageItems?.length || grp.quantity || 1,
            images: sources.map((source, i) => ({
              id: `img_${Date.now()}_${idx}_${i}`,
              taskId,
              groupId,
              imageUrl: source.url,
              imageIndex: i + 1,
              designDescription: source.description,
              version: 1,
              status: 'pending' as const,
              createdAt: new Date().toISOString()
            }))
          };
        })
      : [
          {
            id: `grp_${Date.now()}_0`,
            taskId,
            groupType: 'main_1_1',
            requiredCount: 1,
            images: (order.referenceImages && order.referenceImages.length > 0)
              ? order.referenceImages.map((url, i) => ({
                  id: `img_${Date.now()}_${i}`,
                  taskId,
                  groupId: `grp_${Date.now()}_0`,
                  imageUrl: url,
                  imageIndex: i + 1,
                  designDescription: '设计待交付切图',
                  version: 1,
                  status: 'pending' as const,
                  createdAt: new Date().toISOString()
                }))
              : []
          }
        ],
    createdAt: new Date().toISOString()
  };

  tasks.unshift(createdTask);
  void persistDesignOrder(order);
  void persistReviewTask(createdTask);
  notifyUser(order.creatorId, {
    type: 'order',
    title: '订单已被设计师接单',
    content: `${designerName}已接取订单「${order.title}」。`,
    link: '/advertiser/orders',
  });

  return { order, task: createdTask };
}

// 设计师抢单 / 接单 (接单后自动在审核任务中心创建关联任务)
designOrdersRouter.post('/:id/claim', authenticate, requireRoles('designer'), async (req, res, next) => {
  const order = designOrders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  let eligibility;
  try { eligibility = await getDesignerClaimEligibility(req.user!.id); }
  catch (error: any) {
    if (error?.message === '数据库未连接，暂时无法核验设计师接单资格') return res.status(503).json({ code: 503, success: false, message: error.message });
    return next(error);
  }
  if (!eligibility.canClaim) {
    const reasons = [!eligibility.profileCompleted ? '完善个人资料' : '', eligibility.approvedPortfolioCount === 0 ? '至少提交一件审核通过的作品' : ''].filter(Boolean);
    return res.status(403).json({ code: 403, success: false, message: '请先' + reasons.join('、') + '后再接单' });
  }
  try {
    const { order: claimedOrder, task } = claimDesignOrder(order, req.user!.id, req.user!.name);
    res.json({ code: 200, success: true, message: '接单成功！已自动同步至我的任务中心', data: { order: claimedOrder, taskId: task.id, taskNo: task.taskNo }, timestamp: Date.now() });
  } catch (error: any) {
    res.status(400).json({ code: 400, success: false, message: error.message || '接单失败' });
  }
});
