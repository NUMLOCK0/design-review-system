import { Router } from 'express';
import type { DesignOrder, SystemConfig, ApiResponse, ReviewTask, ImageGroupType, PlatformType } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { tasks } from './review-tasks.js';
import { rules } from './review-rules.js';
import { persistDesignOrder, persistReviewTask } from '../config/persistence.js';
import { notifyUser } from './messages.js';
import { dbPool } from '../config/database.js';

export const designOrdersRouter = Router();

// 内存 Mock 接单市场数据
export let designOrders: DesignOrder[] = [
  {
    id: 'ord_001',
    orderNo: 'ORD-20260905-01',
    title: '秋冬新款羽绒服天猫首屏高定主图(5张套装)',
    category: '主图设计',
    platform: 'tmall',
    budget: 800,
    platformCommissionRate: 0.15,
    designerPayout: 680,
    deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
    urgency: 'urgent',
    requirements: '需要突出轻盈保暖与防水科技面料纹理，提供白底透气图+场景图+卖点排版图。',
    referenceImages: [
      'https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80'
    ],
    status: 'open',
    creatorId: 'u_admin_1',
    creatorName: '系统运营中心',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'ord_002',
    orderNo: 'ORD-20260905-02',
    title: '智能降噪蓝牙耳机全套商详页长图设计(含3D渲染卖点图)',
    category: '详情页设计',
    platform: 'douyin',
    budget: 1800,
    platformCommissionRate: 0.12,
    designerPayout: 1584,
    deadline: new Date(Date.now() + 86400000 * 4).toISOString(),
    urgency: 'normal',
    requirements: '抖音极简科技风，包含声学结构爆炸图拆解、佩戴舒适度对比、降噪分贝实测图。',
    referenceImages: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'
    ],
    status: 'claimed',
    creatorId: 'u_admin_1',
    creatorName: '数码运营组',
    claimedById: 'u_des_1',
    claimedByName: '李设计师',
    claimedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
  {
    id: 'ord_003',
    orderNo: 'ORD-20260905-03',
    title: '国风美妆口红新色上市促销海报',
    category: '活动海报',
    platform: 'taobao',
    budget: 450,
    platformCommissionRate: 0.15,
    designerPayout: 382.5,
    deadline: new Date(Date.now() + 86400000).toISOString(),
    urgency: 'super_urgent',
    requirements: '东方美学配色，丝绒雾面质感突出，需要附带手机淘宝首焦尺寸。',
    status: 'open',
    creatorId: 'u_admin_1',
    creatorName: '美妆运营组',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  }
];

// 50 条分页/筛选演示数据：每条订单固定包含 3-4 个图片需求组。
const mockCategories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const mockPlatforms: PlatformType[] = ['tmall', 'taobao', 'douyin', 'pinduoduo', 'universal'];
const mockGroupTemplates: { name: string; groupType: ImageGroupType; dimensions: string }[] = [
  { name: '白底产品主图', groupType: 'main_1_1', dimensions: '800x800' },
  { name: '场景氛围主图', groupType: 'main_3_4', dimensions: '750x1000' },
  { name: '卖点拆解图', groupType: 'detail', dimensions: '1920x1080' },
  { name: '详情页首屏长图', groupType: 'detail', dimensions: '750x1500' }
];

designOrders.push(...Array.from({ length: 50 }, (_, index) => {
  const category = mockCategories[index % mockCategories.length];
  const platform = mockPlatforms[index % mockPlatforms.length];
  const groupCount = 3 + (index % 2);
  const rate = category === '详情页设计' ? 0.12 : category === '3D建模与渲染' ? 0.10 : 0.15;
  const budget = 500 + (index % 6) * 200;
  const imageRequirementGroups = mockGroupTemplates.slice(0, groupCount).map((template, groupIndex) => ({
    id: `mock_grp_${index + 1}_${groupIndex + 1}`,
    name: `${template.name} ${groupIndex + 1}`,
    groupType: template.groupType,
    quantity: groupIndex === 0 ? 2 : 1,
    dimensions: template.dimensions,
    description: `围绕${category}主题，突出产品核心卖点与品牌质感。`,
    referenceImages: [`https://images.unsplash.com/photo-${['1556228578-0d85b1a4d571', '1542291026-7eec264c27ff', '1495474472287-4d71bcdd2085', '1523275335684-37898b6baf30'][index % 4]}?w=800&auto=format&fit=crop&q=80`],
    referenceLinks: []
  }));

  return {
    id: `mock_ord_${String(index + 1).padStart(3, '0')}`,
    orderNo: `ORD-202609-${String(index + 10).padStart(3, '0')}`,
    title: `${['春季新品', '爆款单品', '品牌升级', '大促活动'][index % 4]}${['服饰', '数码', '美妆', '家居', '食品'][index % 5]}电商视觉设计需求 ${index + 1}`,
    category,
    platform,
    budget,
    platformCommissionRate: rate,
    designerPayout: Number((budget * (1 - rate)).toFixed(2)),
    deadline: new Date(Date.now() + (2 + index % 6) * 86400000).toISOString(),
    urgency: index % 7 === 0 ? 'super_urgent' : index % 3 === 0 ? 'urgent' : 'normal',
    requirements: `请完成${groupCount}组视觉物料，统一品牌风格并适配${platform}投放规范。`,
    imageRequirementGroups,
    referenceImages: imageRequirementGroups.map(group => group.referenceImages[0]),
    status: 'open',
    creatorId: `mock_creator_${(index % 5) + 1}`,
    creatorName: `${['品牌电商部', '市场运营组', '产品中心', '增长团队', '视觉设计部'][index % 5]}${(index % 5) + 1}`,
    createdAt: new Date(Date.now() - (index + 1) * 3600000).toISOString()
  } satisfies DesignOrder;
}));

// 让原有演示订单也具备完整的图片需求清单，详情弹窗展示保持一致。
designOrders.forEach((order, index) => {
  order.publicationStatus = order.publicationStatus || 'published';
  if ((order.imageRequirementGroups?.length || 0) >= 3) return;
  order.imageRequirementGroups = mockGroupTemplates.slice(0, 3).map((template, groupIndex) => ({
    id: `${order.id}_grp_${groupIndex + 1}`,
    name: `${template.name} ${groupIndex + 1}`,
    groupType: template.groupType,
    quantity: 1,
    dimensions: template.dimensions,
    description: `补充${order.category}图片需求，突出产品核心卖点。`,
    referenceImages: groupIndex === 0 && order.referenceImages?.length
      ? [order.referenceImages[0]]
      : [],
    referenceLinks: []
  }));
  order.referenceImages = order.imageRequirementGroups.flatMap(group => group.referenceImages);
});

// 客服订单发布审核队列：客服只审核订单是否允许进入接单大厅，不审核设计师作品。
designOrdersRouter.get('/service/pending', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const list = designOrders.filter((order) => order.publicationStatus === 'pending_service_review');
  res.json({ code: 200, success: true, data: list, timestamp: Date.now() });
});

// 品牌方订单视图包含待客服审核、已驳回和已发布订单；接单大厅不会暴露这些内部状态。
designOrdersRouter.get('/mine', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const list = req.user!.role === 'admin'
    ? designOrders
    : designOrders.filter((order) => order.creatorId === req.user!.id || order.organizationId === req.user!.organizationId);
  res.json({ code: 200, success: true, data: list, timestamp: Date.now() });
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
designOrdersRouter.get('/', (req, res) => {
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
  filtered = filtered.filter((order) => order.publicationStatus === 'published' || !order.publicationStatus);

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
designOrdersRouter.post('/', authenticate, requireRoles('advertiser'), (req, res) => {
  const {
    title,
    category,
    platform,
    budget,
    deadline,
    urgency,
    requirements,
    imageRequirementGroups,
    referenceImages,
    creatorName,
    creatorId,
    organizationId,
    reviewRuleId,
    reviewRuleName
  } = req.body;

  if (!title || !budget) {
    return res.status(400).json({ code: 400, success: false, message: '请填写需求标题与预算金额' });
  }
  if (!reviewRuleId) {
    return res.status(400).json({ code: 400, success: false, message: '请先为订单绑定品牌方作品审核流' });
  }
  const reviewRule = rules.find((rule) => rule.id === reviewRuleId && (!req.user!.organizationId || !rule.organizationId || rule.organizationId === req.user!.organizationId));
  if (!reviewRule) {
    return res.status(400).json({ code: 400, success: false, message: '审核流不存在或不属于当前品牌方组织' });
  }

  // 默认根据分类计算抽成比例
  const rate = category === '详情页设计' ? 0.12 : (category === '3D建模与渲染' ? 0.10 : 0.15);
  const numBudget = Number(budget);
  const payout = Number((numBudget * (1 - rate)).toFixed(2));

  // 收集所有组中的首图作为封面
  const allGroupImages: string[] = [];
  if (Array.isArray(imageRequirementGroups)) {
    imageRequirementGroups.forEach(g => {
      if (Array.isArray(g.referenceImages)) {
        allGroupImages.push(...g.referenceImages);
      }
    });
  }

  const newOrder: DesignOrder = {
    id: `ord_${Date.now()}`,
    orderNo: `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
    title,
    category: category || '主图设计',
    platform: platform || 'tmall',
    budget: numBudget,
    platformCommissionRate: rate,
    designerPayout: payout,
    deadline: deadline || new Date(Date.now() + 86400000 * 3).toISOString(),
    urgency: urgency || 'normal',
    requirements: requirements || '',
    imageRequirementGroups: imageRequirementGroups || [],
    referenceImages: allGroupImages.length > 0 ? allGroupImages : (referenceImages || []),
    status: 'open',
    publicationStatus: 'pending_service_review',
    creatorId: creatorId || req.user!.id,
    creatorName: creatorName || req.user!.name,
    organizationId: organizationId || req.user!.organizationId,
    reviewRuleId,
    reviewRuleName: reviewRule.name,
    createdAt: new Date().toISOString()
  };

  designOrders.unshift(newOrder);
  void persistDesignOrder(newOrder);
  notifyUser('u_rev_1', {
    type: 'order',
    title: '新的订单待审核',
    content: `${newOrder.creatorName}提交了订单「${newOrder.title}」，请完成发布审核。`,
    link: '/service/order-audits',
  });

  res.status(201).json({
    code: 200,
    success: true,
    message: '需求已提交客服审核，审核通过后进入接单大厅',
    data: newOrder,
    timestamp: Date.now()
  });
});

// 品牌方订单管理：未被接单的订单可编辑。
designOrdersRouter.patch('/:id', authenticate, requireRoles('advertiser'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  const isOwner = order && (order.creatorId === req.user!.id || (Boolean(req.user!.organizationId) && order.organizationId === req.user!.organizationId));
  if (!order || !isOwner) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  const wasPublished = order.publicationStatus === 'published' && order.status === 'open';
  if (order.status !== 'open') {
    return res.status(400).json({ code: 400, success: false, message: '当前订单不可编辑' });
  }

  const editableFields = ['title', 'category', 'platform', 'budget', 'deadline', 'urgency', 'requirements', 'imageRequirementGroups', 'referenceImages', 'reviewRuleId', 'reviewRuleName'];
  editableFields.forEach((field) => {
    if (req.body?.[field] !== undefined) (order as any)[field] = req.body[field];
  });
  if (req.body?.budget !== undefined) {
    order.budget = Number(req.body.budget);
    order.designerPayout = Number((order.budget * (1 - order.platformCommissionRate)).toFixed(2));
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
      link: '/service/order-audits',
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
  order.publicationStatus = 'pending_service_review';
  order.status = 'open';
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  notifyUser('u_rev_1', { type: 'order', title: '订单重新提交待审核', content: `${order.creatorName}重新提交了订单「${order.title}」。`, link: '/service/order-audits' });
  res.json({ code: 200, success: true, message: '订单已重新提交审核', data: order, timestamp: Date.now() });
});

designOrdersRouter.post('/:id/cancel', authenticate, requireRoles('advertiser'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id && item.creatorId === req.user!.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  if (!['open', 'pending_service_review'].includes(order.status) || order.publicationStatus === 'rejected') {
    return res.status(400).json({ code: 400, success: false, message: '当前订单不可关闭' });
  }
  order.status = 'cancelled';
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  res.json({ code: 200, success: true, message: '订单已关闭', data: order, timestamp: Date.now() });
});

// 3. 设计师抢单 / 接单 (接单后自动在审核任务中心创建关联任务)
designOrdersRouter.post('/:id/publication-review', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
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
  void persistDesignOrder(order);
  if (approved && dbPool) {
    void (async () => {
      const now = new Date().toISOString();
      const [rows]: any = await dbPool.query(`SELECT id, designer_id FROM order_invitations WHERE order_id=? AND status='queued' AND expires_at >= ?`, [order.id, now]);
      if (!rows.length) return;
      await dbPool.query(`UPDATE order_invitations SET status='sent', sent_at=? WHERE order_id=? AND status='queued' AND expires_at >= ?`, [now, order.id, now]);
      rows.forEach((row: any) => notifyUser(row.designer_id, { type: 'order', title: '收到设计订单邀请', content: `${order.creatorName}邀请你参与「${order.title}」。`, link: '/invitations' }));
    })().catch((error) => console.error('[MySQL] 激活订单邀请失败:', error));
  } else if (!approved && dbPool) {
    void dbPool.query(`UPDATE order_invitations SET status='cancelled', responded_at=? WHERE order_id=? AND status='queued'`, [new Date().toISOString(), order.id])
      .catch((error) => console.error('[MySQL] 取消待发送邀请失败:', error));
  }
  notifyUser(order.creatorId, {
    type: 'order',
    title: approved ? '订单已通过发布审核' : '订单未通过发布审核',
    content: approved ? `订单「${order.title}」已进入接单大厅。` : `订单「${order.title}」需要补充后重新提交。`,
    link: '/advertiser/orders',
  });

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
      ? order.imageRequirementGroups.reduce((acc, g) => acc + (g.quantity || 1), 0)
      : (order.referenceImages?.length || 1),
    approvedCount: 0,
    rejectedCount: 0,
    rejectCount: 0,
    version: 1,
    urgency: order.urgency === 'super_urgent' ? 'urgent' : (order.urgency === 'urgent' ? 'high' : 'medium'),
    orderId: order.id,
    orderBudget: order.budget,
    designerPayout: order.designerPayout,
    groups: (order.imageRequirementGroups && order.imageRequirementGroups.length > 0)
      ? order.imageRequirementGroups.map((grp, idx) => ({
          id: `grp_${Date.now()}_${idx}`,
          taskId,
          groupType: grp.groupType,
          requiredCount: grp.quantity || 1,
          images: (grp.referenceImages && grp.referenceImages.length > 0)
            ? grp.referenceImages.map((url, i) => ({
                id: `img_${Date.now()}_${idx}_${i}`,
                taskId,
                groupId: `grp_${Date.now()}_${idx}`,
                imageUrl: url,
                imageIndex: i + 1,
                designDescription: grp.description || grp.name,
                version: 1,
                status: 'pending' as const,
                createdAt: new Date().toISOString()
              }))
            : []
        }))
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
designOrdersRouter.post('/:id/claim', authenticate, requireRoles('designer'), (req, res) => {
  const order = designOrders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  try {
    const { order: claimedOrder, task } = claimDesignOrder(order, req.user!.id, req.user!.name);
    res.json({ code: 200, success: true, message: '接单成功！已自动同步至我的任务中心', data: { order: claimedOrder, taskId: task.id, taskNo: task.taskNo }, timestamp: Date.now() });
  } catch (error: any) {
    res.status(400).json({ code: 400, success: false, message: error.message || '接单失败' });
  }
});
