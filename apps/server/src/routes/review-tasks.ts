import { returnAssignedOrderTask } from '../services/order-applications.js';
import { syncOrderEvaluation } from '../services/order-evaluations.js';
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
reviewTasksRouter.get('/', authenticate, async (req, res) => {
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

  const p = Math.max(parseInt(String(page), 10) || 1, 1);
  const ps = Math.min(Math.max(parseInt(String(pageSize), 10) || 10, 1), 100);
  const start = (p - 1) * ps;
  const pageTasks = filtered.slice(start, start + ps);
  // 任务状态与订单状态是两套状态，列表同时返回关联订单的最新状态。
  const { designOrders } = await import('./design-orders.js');
  const list = pageTasks.map((task) => {
    const order = task.orderId ? designOrders.find((item) => item.id === task.orderId) : undefined;
    if (!order) return task;
    return { ...task, orderStatus: order.status === 'cancelled' && order.publicationStatus !== 'rejected' ? 'cancelled' : order.publicationStatus || order.status };
  });

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
reviewTasksRouter.get('/:id', authenticate, async (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ code: 404, success: false, message: '审核任务不存在' });
  }
  if (!canAccessTask(task, req.user!)) return res.status(403).json({ code: 403, success: false, message: '该任务不属于当前处理节点' });
  const { designOrders } = await import('./design-orders.js');
  const order = task.orderId ? designOrders.find((item) => item.id === task.orderId) : undefined;
  res.json({ code: 200, success: true, data: { ...task, requiresPsd: Boolean(order?.requiresPsd ?? task.requiresPsd), orderImageRequirementGroups: order?.imageRequirementGroups || [] } });
});

// 3. 创建/提审任务。审核任务只能由已接单的设计师创建或更新。
reviewTasksRouter.post('/', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId) {
      return res.status(400).json({ code: 400, success: false, message: '审核任务必须关联已接取的设计订单' });
    }
    const { designOrders } = await import('./design-orders.js');
    const order = designOrders.find((item) => item.id === orderId);
    if (!order || order.claimedById !== req.user!.id) {
      return res.status(403).json({ code: 403, success: false, message: '只能为自己已接取的订单提交审核任务' });
    }

    const existingTask = orderId
      ? tasks.find((task) => task.orderId === orderId && task.designerId === req.user!.id && task.status !== 'returned' && task.status !== 'approved')
      : undefined;
    const taskId = existingTask?.id || `task_${Date.now()}`;
    const rawGroups = Array.isArray(body.groups) ? body.groups : [];
    if (rawGroups.length > 30) {
      return res.status(400).json({ code: 400, success: false, message: '图片分组数量不能超过 30 组' });
    }
    const incompleteGroup = rawGroups.find((group: any) => {
      const images = Array.isArray(group?.images) ? group.images : [];
      const requiredCount = Math.max(Number(group?.requiredCount) || 0, 0);
      return images.length > 100 || images.length < requiredCount;
    });
    if (!body.isDraft && (!rawGroups.length || incompleteGroup)) {
      return res.status(400).json({ code: 400, success: false, message: '请先完成所有图片分组后再提交审核' });
    }
    if (!body.isDraft && order.requiresPsd && !String(body.sourceFileUrl || '').trim()) {
      return res.status(400).json({ code: 400, success: false, message: '该订单要求交付 PSD 源文件，请先上传源文件再提交审核' });
    }
    if (existingTask && !body.isDraft && !['draft', 'needs_revision'].includes(existingTask.status)) {
      return res.status(400).json({ code: 400, success: false, message: '当前任务不在可提交状态' });
    }
  const groups = rawGroups.map((group: ReviewImageGroup) => ({
    ...group,
    taskId,
    images: (group.images || []).map((image: ReviewImage) => ({
      ...image,
      taskId,
      groupId: group.id
    }))
  }));
  const taskData: Partial<ReviewTask> = {
    productName: String(body.productName || '未命名设计任务').trim().slice(0, 120),
    sku: String(body.sku || '').trim().slice(0, 80),
    platform: body.platform || 'universal',
    designerId: req.user!.id,
    designerName: req.user!.name,
    status: body.isDraft ? 'draft' : 'pending',
    currentLevel: 1,
    totalImages: groups.reduce((acc: number, g: ReviewImageGroup) => acc + (g.images?.length || 0), 0),
    approvedCount: 0,
    rejectedCount: 0,
    version: existingTask ? existingTask.version + 1 : 1,
    urgency: body.urgency || 'medium',
    sourceFileUrl: body.sourceFileUrl,
    requiresPsd: Boolean(order.requiresPsd),
    sourceFileName: body.sourceFileName,
    sourceFileSize: body.sourceFileSize,
    orderId: orderId || undefined,
    orderBudget: order.budget,
    designerPayout: order.designerPayout,
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
  } catch (error) {
    next(error);
  }
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
  const { status, rejectReasons, rejectComment, annotations } = req.body;

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

  const rule = rules.find((item) => item.id === task.ruleId);
  const currentNode = rule?.levels?.find((level) => level.level === task.currentLevel);
  const nodeReviewerIds = currentNode?.reviewerIds || [req.user!.id];
  const nodeApprovalMode = currentNode?.approvalMode || 'any';
  if (targetImg.reviewHistory?.some((review) => review.level === task.currentLevel && review.version === targetImg!.version && review.reviewerId === req.user!.id)) {
    return res.status(409).json({ code: 409, success: false, message: '你已完成当前图片的本级审核' });
  }

  targetImg.status = status === 'rejected' ? 'rejected' : 'pending';
  // 审核人身份必须取自 Token，不能接受客户端传入的 reviewerId/reviewerName。
  targetImg.reviewerId = req.user!.id;
  targetImg.reviewerName = req.user!.name;
  targetImg.reviewedAt = new Date().toISOString();
  targetImg.reviewLevel = task.currentLevel;
  const reviewRecord = {
    level: task.currentLevel,
    version: targetImg.version,
    reviewerId: req.user!.id,
    reviewerName: req.user!.name,
    status,
    reviewedAt: targetImg.reviewedAt,
    ...(status === 'rejected' ? {
      rejectReasons: Array.isArray(rejectReasons) ? rejectReasons.filter((item: unknown) => typeof item === 'string').slice(0, 20) : [],
      rejectComment: String(rejectComment || '').slice(0, 2000),
    } : {}),
  } as const;
  targetImg.reviewHistory = [...(targetImg.reviewHistory || []), reviewRecord];
  if (status === 'rejected') {
    targetImg.rejectReasons = [...(reviewRecord.rejectReasons || [])];
    targetImg.rejectComment = reviewRecord.rejectComment;
  }
  if (annotations) {
    if (!Array.isArray(annotations) || annotations.length > 100) {
      return res.status(400).json({ code: 400, success: false, message: '批注数量或格式无效' });
    }
    targetImg.annotations = annotations;
  }

  const currentApprovals = targetImg.reviewHistory.filter((review) => review.level === task.currentLevel && review.version === targetImg!.version && review.status === 'approved');
  const currentImageDone = nodeApprovalMode === 'all'
    ? nodeReviewerIds.every((reviewerId) => currentApprovals.some((review) => review.reviewerId === reviewerId))
    : currentApprovals.length > 0;
  if (status === 'approved' && currentImageDone) targetImg.status = 'approved';

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
  const imageDoneAtNode = (image: ReviewImage) => {
    const approvals = (image.reviewHistory || []).filter((review) => review.level === task.currentLevel && review.version === image.version && review.status === 'approved');
    return nodeApprovalMode === 'all'
      ? nodeReviewerIds.every((reviewerId) => approvals.some((review) => review.reviewerId === reviewerId))
      : approvals.length > 0;
  };
  if (rejected > 0) {
    task.status = 'needs_revision';
    task.rejectCount = (task.rejectCount || 0) + 1;
    if (task.rejectCount >= 3) {
      task.isDisputed = true;
      task.disputeReason = '该任务累计驳回次数达到 3 次上限，已触发行业返修熔断，转入客服仲裁中心。';
    }
  } else if (allImages.length > 0 && allImages.every(imageDoneAtNode)) {
    const nextNode = rule?.levels?.find((level) => level.level === task.currentLevel + 1);
    if (nextNode) {
      task.currentLevel = nextNode.level;
      task.status = 'pending';
      task.approvedCount = 0;
      task.rejectedCount = 0;
      for (const image of allImages) {
        image.status = 'pending';
        image.reviewerId = undefined;
        image.reviewerName = undefined;
        image.reviewedAt = undefined;
        image.rejectReasons = undefined;
        image.rejectComment = undefined;
      }
      for (const reviewerId of nextNode.reviewerIds) notifyUser(reviewerId, {
        type: 'review', title: '有新的作品待审核', content: `任务「${task.productName}」已进入第 ${nextNode.level} 级审核。`, link: '/review-tasks',
      });
    } else {
      task.status = 'approved';
      task.completedAt = new Date().toISOString();
    }
  } else {
    task.status = 'in_review';
  }
  task.updatedAt = new Date().toISOString();
  void persistReviewTask(task);
  void syncOrderStatus(task.orderId, task.status === 'approved' ? 'completed' : task.status === 'needs_revision' ? 'in_progress' : 'submitted');
  if (status === 'rejected' || task.status === 'approved' || task.status === 'pending') notifyUser(task.designerId, {
    type: 'review',
    title: task.status === 'approved' ? '作品审核已通过' : status === 'rejected' ? '作品需要修改' : '审核节点已完成',
    content: task.status === 'approved' ? `任务「${task.productName}」已通过全部审核。` : status === 'rejected' ? `任务「${task.productName}」有图片未通过审核，请查看批注并修改。` : `任务「${task.productName}」已通过第 ${task.currentLevel - 1} 级审核，进入下一级审核。`,
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
  if (task.designerId !== req.user!.id) return res.status(403).json({ code: 403, success: false, message: '无权提交该审核任务' });
  if (task.status !== 'draft' && task.status !== 'needs_revision') {
    return res.status(400).json({ code: 400, success: false, message: '当前任务不在可提交状态' });
  }

  const allImages = task.groups?.flatMap((group) => group.images || []) || [];
  const incompleteGroup = task.groups?.find((group) => group.images.length < group.requiredCount);
  if (!allImages.length || incompleteGroup) {
    return res.status(400).json({ code: 400, success: false, message: '请先完成所有图片分组后再提交审核' });
  }

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
    await persistReviewTask(task);
    notifyUser(task.designerId, { type: 'review', title: '订单已确认验收', content: `品牌方已确认验收「${task.productName}」，原图与源文件已向品牌方开放下载。`, link: '/review-tasks' });
  }
  await syncOrderEvaluation(order.id);
  res.json({ code: 200, success: true, message: '验收已确认，现可下载无水印原图与源文件', data: task });
});

// 9. 设计师退回接单 (从 draft 状态放弃接单，订单重新流回接单广场)
reviewTasksRouter.post('/:id/return', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    const task = await returnAssignedOrderTask(String(req.params.id), req.user!);
    res.json({ code: 200, success: true, message: '任务已退回，订单恢复原预算并重新开放申请', data: task });
  } catch (error) { next(error); }
});


