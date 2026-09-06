import { Router } from 'express';
import type { ReviewTask, ReviewImageGroup, ReviewImage, AnnotationItem } from '@design-review/shared';

export const reviewTasksRouter = Router();

// 内存 Mock 数据仓库（已对标完整数据库表字段，连接数据库后无缝替换）
let tasks: ReviewTask[] = [
  {
    id: 'task_001',
    taskNo: 'REV-20260905-001',
    productName: '2026秋季新款复古工装夹克外衣',
    sku: 'JK-2026-09-A',
    platform: 'tmall',
    designerId: 'u_des_1',
    designerName: '李设计师',
    status: 'in_review',
    currentLevel: 1,
    totalImages: 3,
    approvedCount: 1,
    rejectedCount: 1,
    version: 1,
    urgency: 'high',
    submittedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    groups: [
      {
        id: 'grp_001',
        taskId: 'task_001',
        groupType: 'main_1_1',
        requiredCount: 1,
        images: [
          {
            id: 'img_001',
            taskId: 'task_001',
            groupId: 'grp_001',
            imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200&auto=format&fit=crop&q=80',
            imageIndex: 1,
            designDescription: '首屏1:1白底透气主图，突出面料微距质感',
            version: 1,
            status: 'approved',
            reviewerName: '王总监',
            reviewedAt: new Date(Date.now() - 1800 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          }
        ]
      },
      {
        id: 'grp_002',
        taskId: 'task_001',
        groupType: 'main_3_4',
        requiredCount: 1,
        images: [
          {
            id: 'img_002',
            taskId: 'task_001',
            groupId: 'grp_002',
            imageUrl: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=1200&auto=format&fit=crop&q=80',
            imageIndex: 1,
            designDescription: '3:4 模特场景图，自然采光氛围',
            version: 1,
            status: 'rejected',
            reviewerName: '王总监',
            rejectReasons: ['文案违规/极限词', '版式结构混乱'],
            rejectComment: '左上角促销文字太拥挤，缺少主副标题层级感，请重新排版。',
            reviewedAt: new Date(Date.now() - 900 * 1000).toISOString(),
            annotations: [
              {
                id: 'ann_001',
                type: 'rect',
                x: 12,
                y: 15,
                width: 35,
                height: 18,
                color: '#ef4444',
                comment: '促销文案字号过大且未对齐',
                creatorId: 'u_rev_1',
                creatorName: '王总监',
                createdAt: new Date().toISOString()
              }
            ],
            createdAt: new Date().toISOString(),
          }
        ]
      }
    ]
  }
];

// 1. 获取审核任务列表 (支持分页与多条件筛选)
reviewTasksRouter.get('/', (req, res) => {
  const { status, platform, keyword, page = '1', pageSize = '10' } = req.query;
  let filtered = [...tasks];

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
reviewTasksRouter.get('/:id', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) {
    return res.status(404).json({ code: 404, success: false, message: '审核任务不存在' });
  }
  res.json({ code: 200, success: true, data: task });
});

// 3. 创建/提审任务
reviewTasksRouter.post('/', (req, res) => {
  const body = req.body;
  const newTask: ReviewTask = {
    id: `task_${Date.now()}`,
    taskNo: `REV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`,
    productName: body.productName || '未命名设计任务',
    sku: body.sku || '',
    platform: body.platform || 'universal',
    designerId: body.designerId || 'u_des_1',
    designerName: body.designerName || '李设计师',
    status: body.isDraft ? 'draft' : 'pending',
    currentLevel: 1,
    totalImages: body.groups ? body.groups.reduce((acc: number, g: any) => acc + (g.images?.length || 0), 0) : 0,
    approvedCount: 0,
    rejectedCount: 0,
    version: 1,
    urgency: body.urgency || 'medium',
    submittedAt: body.isDraft ? undefined : new Date().toISOString(),
    groups: body.groups || [],
    createdAt: new Date().toISOString(),
  };

  tasks.unshift(newTask);
  res.json({ code: 200, success: true, message: '提交成功', data: newTask });
});

// 4. 审核单张图片（通过/驳回 + 批注保存）
reviewTasksRouter.post('/:taskId/images/:imageId/review', (req, res) => {
  const { taskId, imageId } = req.params;
  const { status, rejectReasons, rejectComment, annotations, reviewerName = '王总监' } = req.body;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });

  let targetImg: ReviewImage | undefined;
  task.groups?.forEach(g => {
    const found = g.images.find(img => img.id === imageId);
    if (found) targetImg = found;
  });

  if (!targetImg) return res.status(404).json({ code: 404, success: false, message: '图片不存在' });

  targetImg.status = status;
  targetImg.reviewerName = reviewerName;
  targetImg.reviewedAt = new Date().toISOString();
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

  res.json({ code: 200, success: true, message: '审核操作已保存', data: task });
});

// 5. 保存单张图片批注列表
reviewTasksRouter.post('/:taskId/images/:imageId/annotations', (req, res) => {
  const { taskId, imageId } = req.params;
  const { annotations } = req.body;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return res.status(404).json({ code: 404, success: false, message: '任务不存在' });

  let targetImg: ReviewImage | undefined;
  task.groups?.forEach(g => {
    const found = g.images.find(img => img.id === imageId);
    if (found) targetImg = found;
  });

  if (!targetImg) return res.status(404).json({ code: 404, success: false, message: '图片不存在' });

  targetImg.annotations = annotations || [];
  res.json({ code: 200, success: true, message: '批注标记已更新保存', data: targetImg.annotations });
});

