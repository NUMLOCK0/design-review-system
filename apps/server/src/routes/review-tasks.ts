import { Router } from 'express';
import type { ReviewTask, ReviewImageGroup, ReviewImage, AnnotationItem } from '@design-review/shared';
import { authenticate, requireRoles, type AuthUserPayload } from '../middleware/auth.middleware.js';
import { persistDesignOrder, persistReviewTask } from '../config/persistence.js';
import { notifyUser } from './messages.js';
import { rules } from './review-rules.js';

export const reviewTasksRouter = Router();

const syncOrderStatus = async (orderId: string | undefined, status: 'in_progress' | 'submitted' | 'completed') => {
  if (!orderId) return;
  const { designOrders } = await import('./design-orders.js');
  const order = designOrders.find((item) => item.id === orderId);
  if (!order) return;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  if (status === 'completed') order.completedAt = new Date().toISOString();
  void persistDesignOrder(order);
};

// 审核任务只来自真实接单，不再预置演示任务。
export let tasks: ReviewTask[] = [];

const isCurrentNodeReviewer = (task: ReviewTask, user: AuthUserPayload) =>
  rules.find((rule) => rule.id === task.ruleId)?.levels?.some((level) => level.level === task.currentLevel && level.reviewerIds.includes(user.id)) || false;

const canAccessTask = (task: ReviewTask, user: AuthUserPayload) => {
  if (user.role === 'admin') return true;
  // 设计师需要持续看到自己已接单、已提审、审核中及已完成的任务；只有主动退单的任务移出列表。
  if (user.role === 'designer') return task.designerId === user.id && task.status !== 'returned';
  if (user.role === 'advertiser') {
    if (['pending', 'in_review'].includes(task.status)) return isCurrentNodeReviewer(task, user);
    return ['approved', 'archived'].includes(task.status) && task.advertiserId === user.id;
  }
  return false;
};

const canReviewTask = (task: ReviewTask, user: AuthUserPayload) =>
  user.role === 'admin' || (task.designerId !== user.id && ['pending', 'in_review'].includes(task.status) && isCurrentNodeReviewer(task, user));

// 1. 获取审核任务列表 (支持分页与多条件筛选)
reviewTasksRouter.get('/', authenticate, (req, res) => {
  const { status, platform, keyword, page = '1', pageSize = '10' } = req.query;
  let filtered = tasks.filter((task) => canAccessTask(task, req.user!));

  if (status && status !== 'all') {
    filtered = filtered.filter(t => t.status === status);
  }
  if (platform && platform !== 'all') {
    filtered = filtered.filter(t => t.platform === platform);
  }
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    filtered = filtered.filter(t => 
      t.productName.toLowerCase().includes(kw) || 
      t.taskNo.toLowerCase().includes(kw) ||
      t.designerName.toLowerCase().includes(kw)
    );
  }

  const p = parseInt(String(page), 10);
  const ps = parseInt(String(pageSize), 10);
  const start = (p - 1) * ps;
  const list = filtered.slice(start, start + ps);

  res.json({
    code: 200,
    success: true,
    data: {
      list,
      total: filtered.length,
      page: p,
      pageSize: ps,
      totalPages: Math.ceil(filtered.length / ps)
    }
  });
});

// 2. 获取任务详情
reviewTasksRouter.get('/:id', authenticate, (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ code: 404, success: false, message: '审核任务不存在' });
  }
  if (!canAccessTask(task, req.user!)) return res.status(403).json({ code: 403, success: false, message: '该任务不属于当前处理节点' });
  res.json({ code: 200, success: true, data: task });
});

// 3. 创建/提审任务
reviewTasksRouter.post('/', (req, res) => {
  const body = req.body;
  const existingTask = body.orderId
    ? tasks.find((task) => task.orderId === body.orderId && task.status !== 'returned' && task.status !== 'approved')
    : undefined;
  const taskId = existingTask?.id || `task_${Date.now()}`;
  const groups = (body.groups || []).map((group: ReviewImageGroup) => ({
    ...group,
    taskId,
    images: (group.images || []).map((image: ReviewImage) => ({
      ...image,
      taskId,
      groupId: group.id
    }))
  }));
  const taskData: Partial<ReviewTask> = {
    productName: body.productName || '未命名设计任务',
    sku: body.sku || '',
    platform: body.platform || 'universal',
    designerId: body.designerId || req.user!.id,
    designerName: body.designerName || req.user!.name,
    status: body.isDraft ? 'draft' : 'pending',
    currentLevel: 1,
    totalImages: groups.reduce((acc: number, g: ReviewImageGroup) => acc + (g.images?.length || 0), 0),
    approvedCount: 0,
    rejectedCount: 0,
    version: existingTask ? existingTask.version + 1 : 1,
    urgency: body.urgency || 'medium',
    sourceFileUrl: body.sourceFileUrl,
    sourceFileName: body.sourceFileName,
    sourceFileSize: body.sourceFileSize,
    orderId: body.orderId,
    orderBudget: body.orderBudget,
    designerPayout: body.designerPayout,
    submittedAt: body.isDraft ? undefined : new Date().toISOString(),
    groups,
    updatedAt: new Date().toISOString()
  };
  if (existingTask) {
    Object.assign(existingTask, taskData);
    void persistReviewTask(existingTask);
    void syncOrderStatus(existingTask.orderId, body.isDraft ? 'in_progress' : 'submitted');
    return res.json({ code: 200, success: true, message: body.isDraft ? '草稿已更新' : '设计稿已成功提交审核', data: existingTask });
  }

  const newTask: ReviewTask = {
    id: taskId,
    taskNo: `REV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
    ...(taskData as Omit<ReviewTask, 'id' | 'taskNo' | 'createdAt'>),
    createdAt: new Date().toISOString(),
  };

  tasks.unshift(newTask);
  void persistReviewTask(newTask);
  void syncOrderStatus(newTask.orderId, body.isDraft ? 'in_progress' : 'submitted');
  res.json({ code: 200, success: true, message: '提交成功', data: newTask });
});

// 4. 审核员进入工作台，任务从待初审流转为会审中
reviewTasksRouter.post('/:id/start-review', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });
  if (!canReviewTask(task, req.user!)) return res.status(403).json({ code: 403, success: false, message: '该任务不属于当前审核节点' });
  if (task.status !== 'pending' && task.status !== 'in_review') {
    return res.status(400).json({ code: 400, success: false, message: '当前任务不可开始审核' });
  }
  task.status = 'in_review';
  task.updatedAt = new Date().toISOString();
  void persistReviewTask(task);
  res.json({ code: 200, success: true, message: '已进入审核会审', data: task });
});

// 5. 审核单张图片（通过/驳回 + 批注保存）
reviewTasksRouter.post('/:taskId/images/:imageId/review', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const { taskId, imageId } = req.params;
  const { status, rejectReasons, rejectComment, annotations, reviewerId = req.user!.id, reviewerName = req.user!.name } = req.body;

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ code: 400, success: false, message: '审核状态无效' });
  }

  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });
  if (!canReviewTask(task, req.user!)) return res.status(403).json({ code: 403, success: false, message: '该任务不属于当前审核节点' });

  let targetImg: ReviewImage | undefined;
  task.groups?.forEach(g => {
    const found = g.images.find(img => img.id === imageId);
    if (found) targetImg = found;
  });

  if (!targetImg) return res.status(404).json({ code: 404, success: false, message: '图片不存在' });

  targetImg.status = status;
  targetImg.reviewerId = reviewerId;
  targetImg.reviewerName = reviewerName;
  targetImg.reviewedAt = new Date().toISOString();
  targetImg.reviewLevel = task.currentLevel;
  if (status === 'rejected') {
    targetImg.rejectReasons = rejectReasons || [];
    targetImg.rejectComment = rejectComment || '';
  }
  if (annotations) {
    targetImg.annotations = annotations;
  }

  // 重新计算任务汇总指标
  let approved = 0;
  let rejected = 0;
  let allImages: ReviewImage[] = [];
  task.groups?.forEach(g => {
    allImages.push(...g.images);
    g.images.forEach(img => {
      if (img.status === 'approved') approved++;
      if (img.status === 'rejected') rejected++;
    });
  });

  task.approvedCount = approved;
  task.rejectedCount = rejected;
  if (rejected > 0) {
    task.status = 'needs_revision';
    task.rejectCount = (task.rejectCount || 0) + 1;
    if (task.rejectCount >= 3) {
      task.isDisputed = true;
      task.disputeReason = '该任务累计驳回次数达到 3 次上限，已触发行业返修熔断，转入客服仲裁中心。';
    }
  } else if (approved === allImages.length && allImages.length > 0) {
    task.status = 'approved';
    task.completedAt = new Date().toISOString();
  } else {
    task.status = 'in_review';
  }
  task.updatedAt = new Date().toISOString();
  void persistReviewTask(task);
  void syncOrderStatus(task.orderId, task.status === 'approved' ? 'completed' : task.status === 'needs_revision' ? 'in_progress' : 'submitted');
  notifyUser(task.designerId, {
    type: 'review',
    title: status === 'approved' ? '作品审核已通过' : '作品需要修改',
    content: status === 'approved' ? `任务「${task.productName}」已通过审核。` : `任务「${task.productName}」有图片未通过审核，请查看批注并修改。`,
    link: '/review-tasks',
  });

  res.json({ code: 200, success: true, message: '审核操作已保存', data: task });
});

// 6. 保存单张图片批注列表
reviewTasksRouter.post('/:taskId/images/:imageId/annotations', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const { taskId, imageId } = req.params;
  const { annotations } = req.body;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });
  if (!canReviewTask(task, req.user!)) return res.status(403).json({ code: 403, success: false, message: '该任务不属于当前审核节点' });

  let targetImg: ReviewImage | undefined;
  task.groups?.forEach(g => {
    const found = g.images.find(img => img.id === imageId);
    if (found) targetImg = found;
  });

  if (!targetImg) return res.status(404).json({ code: 404, success: false, message: '图片不存在' });

  targetImg.annotations = annotations || [];
  void persistReviewTask(task);
  res.json({ code: 200, success: true, message: '批注标记已更新保存', data: targetImg.annotations });
});

// 7. 设计师正式提交审核 (从 draft/needs_revision 流转至 pending 待初审)
reviewTasksRouter.post('/:id/submit', authenticate, requireRoles('designer'), (req, res) => {
  const { id } = req.params;
  const task = tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });

  task.status = 'pending';
  task.submittedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();

  // 若存在被驳回的图片，重置为待审状态
  task.groups?.forEach(g => {
    g.images.forEach(img => {
      if (img.status === 'rejected') {
        img.status = 'pending';
      }
    });
  });
  void persistReviewTask(task);
  void syncOrderStatus(task.orderId, 'submitted');
  notifyUser(task.advertiserId, {
    type: 'review',
    title: '有新的作品待审核',
    content: `设计师已提交任务「${task.productName}」，请进入审核工作台处理。`,
    link: '/review-tasks',
  });

  res.json({
    code: 200,
    success: true,
    message: '设计稿已成功提交审核，已派发至审核质检主管！',
    data: task
  });
});

// 8. 品牌方确认验收：验收后才允许下载无水印原图与源文件。
reviewTasksRouter.post('/:id/acceptance', authenticate, requireRoles('advertiser'), async (req, res) => {
  const task = tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '审核任务不存在' });
  if (task.status !== 'approved') return res.status(400).json({ code: 400, success: false, message: '仅终审通过的作品可确认验收' });
  if (!task.orderId) return res.status(400).json({ code: 400, success: false, message: '该任务未关联设计订单，无法确认验收' });

  const { designOrders } = await import('./design-orders.js');
  const order = designOrders.find((item) => item.id === task.orderId);
  if (!order || order.paymentStatus !== 'paid') return res.status(402).json({ code: 402, success: false, message: '请先支付订单尾款，支付成功后自动确认验收并开放下载' });
  if (task.designerId === req.user!.id) return res.status(403).json({ code: 403, success: false, message: '设计师角色不能验收自己交付的作品' });
  const isOrderOwner = order && (order.creatorId === req.user!.id || (Boolean(req.user!.organizationId) && order.organizationId === req.user!.organizationId));
  if (!isOrderOwner) return res.status(403).json({ code: 403, success: false, message: '无权验收该订单' });

  if (!task.acceptedAt) {
    task.acceptedAt = new Date().toISOString();
    task.acceptedById = req.user!.id;
    task.acceptedByName = req.user!.name;
    task.updatedAt = task.acceptedAt;
    void persistReviewTask(task);
    notifyUser(task.designerId, { type: 'review', title: '订单已确认验收', content: `品牌方已确认验收「${task.productName}」，原图与源文件已向品牌方开放下载。`, link: '/review-tasks' });
  }
  res.json({ code: 200, success: true, message: '验收已确认，现可下载无水印原图与源文件', data: task });
});

// 9. 设计师退回接单 (从 draft 状态放弃接单，订单重新流回接单广场)
reviewTasksRouter.post('/:id/return', authenticate, requireRoles('designer'), (req, res) => {
  const { id } = req.params;
  const taskIndex = tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });

  const task = tasks[taskIndex];
  if (task.status !== 'draft' && task.status !== 'needs_revision') {
    return res.status(400).json({ code: 400, success: false, message: '当前任务已进入不可撤销审核阶段，无法直接退单' });
  }

  // 变更任务状态为已退单
  task.status = 'returned';
  task.updatedAt = new Date().toISOString();

  // 若关联了原接单需求，将原订单重新释放回开放接单状态 open
  if (task.orderId) {
    // 动态查找并恢复订单
    try {
      import('./design-orders.js').then(({ designOrders }) => {
        const order = designOrders?.find((o: any) => o.id === task.orderId);
        if (order) {
          order.status = 'open';
          order.claimedById = undefined;
          order.claimedByName = undefined;
          order.claimedAt = undefined;
          order.taskId = undefined;
          order.updatedAt = new Date().toISOString();
          void persistDesignOrder(order);
        }
      }).catch(console.error);
    } catch {}
  }

  void persistReviewTask(task);

  res.json({
    code: 200,
    success: true,
    message: '已成功退回接单！需求已重新释放回接单大厅，任务已关闭',
    data: task
  });
});


