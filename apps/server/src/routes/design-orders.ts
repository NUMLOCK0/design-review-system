import { Router } from 'express';
import type { DesignOrder, SystemConfig, ApiResponse } from '@design-review/shared';
import { authenticate } from '../middleware/auth.middleware.js';

export const designOrdersRouter = Router();

// 内存 Mock 接单市场数据
let designOrders: DesignOrder[] = [
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

// 1. 获取接单广场列表
designOrdersRouter.get('/', (req, res) => {
  const { status, category, urgency } = req.query;
  let filtered = [...designOrders];

  if (status && status !== 'all') {
    filtered = filtered.filter(o => o.status === status);
  }
  if (category && category !== 'all') {
    filtered = filtered.filter(o => o.category === category);
  }
  if (urgency && urgency !== 'all') {
    filtered = filtered.filter(o => o.urgency === urgency);
  }

  res.json({
    code: 200,
    success: true,
    data: filtered,
    total: filtered.length,
    timestamp: Date.now()
  });
});

// 2. 前台发布新需求 / 派单
designOrdersRouter.post('/', (req, res) => {
  const {
    title,
    category,
    platform,
    budget,
    deadline,
    urgency,
    requirements,
    referenceImages,
    creatorName,
    creatorId
  } = req.body;

  if (!title || !budget) {
    return res.status(400).json({ code: 400, success: false, message: '请填写需求标题与预算金额' });
  }

  // 默认根据分类计算抽成比例
  const rate = category === '详情页设计' ? 0.12 : 0.15;
  const numBudget = Number(budget);
  const payout = Number((numBudget * (1 - rate)).toFixed(2));

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
    referenceImages: referenceImages || [],
    status: 'open',
    creatorId: creatorId || 'u_des_1',
    creatorName: creatorName || '设计师前台',
    createdAt: new Date().toISOString()
  };

  designOrders.unshift(newOrder);

  res.status(201).json({
    code: 200,
    success: true,
    message: '需求发布成功，已同步至接单大厅',
    data: newOrder,
    timestamp: Date.now()
  });
});

// 3. 设计师抢单 / 接单
designOrdersRouter.post('/:id/claim', (req, res) => {
  const { id } = req.params;
  const { designerId, designerName } = req.body;

  const order = designOrders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  }

  if (order.status !== 'open') {
    return res.status(400).json({ code: 400, success: false, message: '手慢了，该订单已被接取或已下架' });
  }

  order.status = 'claimed';
  order.claimedById = designerId || 'u_des_1';
  order.claimedByName = designerName || '李设计师';
  order.claimedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  res.json({
    code: 200,
    success: true,
    message: '接单成功！请在截止时间前完成设计并提审',
    data: order,
    timestamp: Date.now()
  });
});
