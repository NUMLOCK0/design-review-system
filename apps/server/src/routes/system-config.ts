import { Router } from 'express';
import type { SystemConfig } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';

export const systemConfigRouter = Router();

// 内存 Mock 系统配置与抽成规则
let systemConfig: SystemConfig = {
  id: 'sys_config_default',
  platformName: 'Cozi 视觉设计与审核管理中台',
  defaultCommissionRate: 0.15, // 默认 15% 抽成
  urgentMarkupRate: 0.20,      // 加急单 20%
  minOrderBudget: 100,         // 最低 100 元
  autoClaimTimeoutMinutes: 120, // 2小时未响应自动释放
  maxRevisionLimit: 3,         // 免费返修 3 次后进入纠纷处理
  allowDesignerBidding: true,
  reviewStrictLevel: 'strict',
  commissionTiers: [
    {
      id: 'tier_1',
      category: '主图设计',
      defaultRate: 0.15,
      minRate: 0.10,
      maxRate: 0.25,
      description: '单张或套系主图，包含白底图/卖点图'
    },
    {
      id: 'tier_2',
      category: '详情页设计',
      defaultRate: 0.12,
      minRate: 0.08,
      maxRate: 0.20,
      description: '大单包段长图设计，鼓励高客单'
    },
    {
      id: 'tier_3',
      category: '活动海报',
      defaultRate: 0.15,
      minRate: 0.10,
      maxRate: 0.30,
      description: '大促首焦、跨店满减KV'
    },
    {
      id: 'tier_4',
      category: '3D建模与渲染',
      defaultRate: 0.10,
      minRate: 0.05,
      maxRate: 0.18,
      description: '高技术门槛类目，低抽成扶持优质3D创作者'
    },
    {
      id: 'tier_5',
      category: '精修合成',
      defaultRate: 0.18,
      minRate: 0.12,
      maxRate: 0.30,
      description: '模特修图与静物抠图排版'
    }
  ],
  announcement: '📢 2026 Q3 视觉大促季接单补贴已开启，详情页设计类目抽成下调至 12%！',
  depositRate: 0.30,
  updatedAt: new Date().toISOString()
};

export const getSystemConfig = () => systemConfig;

// 1. 获取全局系统配置与抽成方案
systemConfigRouter.get('/', authenticate, requireRoles('admin'), (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: systemConfig,
    timestamp: Date.now()
  });
});

// 2. 更新全局系统配置与抽成比例（仅限 admin 管理员）
systemConfigRouter.put('/', authenticate, requireRoles('admin'), (req, res) => {
  const updates = req.body;
  if (updates.depositRate !== undefined && (!Number.isFinite(Number(updates.depositRate)) || Number(updates.depositRate) < 0.01 || Number(updates.depositRate) > 1)) {
    return res.status(400).json({ code: 400, success: false, message: '定金比例必须在 1% 至 100% 之间' });
  }
  systemConfig = {
    ...systemConfig,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  res.json({
    code: 200,
    success: true,
    message: '运营与抽成配置已成功保存更新',
    data: systemConfig,
    timestamp: Date.now()
  });
});
