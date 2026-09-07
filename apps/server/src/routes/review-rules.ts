import { Router } from 'express';
import type { ReviewRule, ReviewRuleLevel } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { persistReviewRule } from '../config/persistence.js';

export const reviewRulesRouter = Router();

// 预设审核员备选库
export const mockReviewers = [
  { id: 'u_adv_2', name: '张主管(美妆组)', role: 'advertiser', organizationId: 'org_demo_1', department: '品牌审核组' },
  { id: 'u_adv_3', name: '刘专家(3D质检)', role: 'advertiser', organizationId: 'org_demo_1', department: '品牌审核组' },
  { id: 'u_adv_4', name: '赵经理(品牌审核)', role: 'advertiser', organizationId: 'org_demo_1', department: '品牌营销部' },
];

export let rules: ReviewRule[] = [
  {
    id: 'rule_001',
    name: '天猫/淘宝 主图与长图三级质检审核流',
    organizationId: 'org_demo_1',
    ownerId: 'u_adv_1',
    ownerName: '陈品牌经理',
    platform: 'tmall',
    category: '服饰鞋包',
    rejectLimit: 3,
    reviewHoursLimit: 24,
    isActive: true,
    levels: [
      {
        id: 'lvl_001',
        ruleId: 'rule_001',
        level: 1,
        reviewerIds: ['u_adv_2'],
        reviewerNames: ['张主管(美妆组)'],
        approvalMode: 'any'
      },
      {
        id: 'lvl_002',
        ruleId: 'rule_001',
        level: 2,
        reviewerIds: ['u_adv_3', 'u_adv_4'],
        reviewerNames: ['张主管(美妆组)', '刘专家(3D质检)'],
        approvalMode: 'any'
      }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule_002',
    name: '拼多多/抖音 极速单级质检合规流',
    organizationId: 'org_demo_1',
    ownerId: 'u_adv_1',
    ownerName: '陈品牌经理',
    platform: 'pinduoduo',
    category: '日用百货',
    rejectLimit: 2,
    reviewHoursLimit: 12,
    isActive: true,
    levels: [
      {
        id: 'lvl_003',
        ruleId: 'rule_002',
        level: 1,
        reviewerIds: ['u_adv_2'],
        reviewerNames: ['张主管(美妆组)'],
        approvalMode: 'any'
      }
    ],
    createdAt: new Date().toISOString()
  }
];

function formatLevels(ruleId: string, levels: any): ReviewRuleLevel[] {
  return Array.isArray(levels) && levels.length > 0
    ? levels.map((level: any, index: number) => {
        const reviewerIds = Array.isArray(level.reviewerIds) && level.reviewerIds.length > 0 ? level.reviewerIds : ['u_adv_2'];
        return {
          id: `lvl_${Date.now()}_${index}`,
          ruleId,
          level: index + 1,
          reviewerIds,
          reviewerNames: reviewerIds.map((id: string) => mockReviewers.find((reviewer) => reviewer.id === id)?.name || '审核员'),
          approvalMode: level.approvalMode === 'all' ? 'all' : 'any'
        };
      })
    : [{ id: `lvl_${Date.now()}_0`, ruleId, level: 1, reviewerIds: ['u_adv_2'], reviewerNames: ['张主管(美妆组)'], approvalMode: 'any' }];
}

function scopeLevels(levels: any, organizationId?: string) {
  const allowed = mockReviewers.filter((reviewer) => !organizationId || reviewer.organizationId === organizationId).map((reviewer) => reviewer.id);
  return Array.isArray(levels)
    ? levels.map((level) => ({
        ...level,
        reviewerIds: (Array.isArray(level.reviewerIds) ? level.reviewerIds : []).filter((id: string) => allowed.includes(id))
      }))
    : levels;
}

function createRule(body: any, owner?: { id: string; name: string; organizationId?: string }): ReviewRule {
  const id = `rule_${Date.now()}`;
  return {
    id,
    name: body.name || '自定义审核流',
    organizationId: owner?.organizationId,
    ownerId: owner?.id,
    ownerName: owner?.name,
    platform: body.platform || 'universal',
    category: body.category || '全品类',
    rejectLimit: Number(body.rejectLimit) || 3,
    reviewHoursLimit: Number(body.reviewHoursLimit) || 24,
    isActive: body.isActive !== false,
    levels: formatLevels(id, scopeLevels(body.levels, owner?.organizationId)),
    createdAt: new Date().toISOString()
  };
}

// 1. 获取所有审核规则流配置
reviewRulesRouter.get('/', authenticate, requireRoles('admin'), (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: rules,
    reviewers: mockReviewers,
    timestamp: Date.now()
  });
});

// 品牌方自己的审核流：规则归属于组织，不再挂在管理后台。
reviewRulesRouter.get('/mine', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const data = req.user!.role === 'admin' || !req.user!.organizationId
    ? rules
    : rules.filter((rule) => !rule.organizationId || rule.organizationId === req.user!.organizationId);
  res.json({ code: 200, success: true, data, timestamp: Date.now() });
});

reviewRulesRouter.post('/mine', authenticate, requireRoles('advertiser'), (req, res) => {
  const rule = createRule(req.body, {
    id: req.user!.id,
    name: req.user!.name,
    organizationId: req.user!.organizationId
  });
  rules.unshift(rule);
  void persistReviewRule(rule);
  res.status(201).json({ code: 201, success: true, message: '品牌方审核流已创建', data: rule, timestamp: Date.now() });
});

reviewRulesRouter.put('/mine/:id', authenticate, requireRoles('advertiser'), (req, res) => {
  const index = rules.findIndex((rule) => rule.id === req.params.id && rule.organizationId === req.user!.organizationId);
  if (index < 0) return res.status(404).json({ code: 404, success: false, message: '审核流不存在或无权修改' });
  const current = rules[index];
  rules[index] = {
    ...current,
    ...req.body,
    id: current.id,
    organizationId: current.organizationId,
    ownerId: current.ownerId,
    ownerName: current.ownerName,
    levels: req.body.levels ? formatLevels(current.id, scopeLevels(req.body.levels, req.user!.organizationId)) : current.levels,
    updatedAt: new Date().toISOString()
  };
  void persistReviewRule(rules[index]);
  res.json({ code: 200, success: true, message: '品牌方审核流已更新', data: rules[index], timestamp: Date.now() });
});

reviewRulesRouter.get('/mine/reviewers', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  const data = req.user!.role === 'admin' || !req.user!.organizationId
    ? mockReviewers
    : mockReviewers.filter((reviewer) => reviewer.organizationId === req.user!.organizationId);
  res.json({ code: 200, success: true, data, timestamp: Date.now() });
});

// 2. 获取可选审核人员列表
reviewRulesRouter.get('/reviewers', authenticate, requireRoles('admin'), (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: mockReviewers
  });
});

// 3. 新建或保存审核规则 (含自定义多级人员指派)
reviewRulesRouter.post('/', authenticate, requireRoles('admin'), (req, res) => {
  const newRule = createRule(req.body);

  rules.unshift(newRule);
  void persistReviewRule(newRule);

  res.status(201).json({
    code: 200,
    success: true,
    message: '自定义审核规则流已成功发布生效',
    data: newRule
  });
});

// 4. 更新指定规则的审核人员配置
reviewRulesRouter.put('/:id', authenticate, requireRoles('admin'), (req, res) => {
  const { id } = req.params;
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) {
    return res.status(404).json({ code: 404, success: false, message: '规则不存在' });
  }

  rules[index] = {
    ...rules[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  void persistReviewRule(rules[index]);

  res.json({
    code: 200,
    success: true,
    message: '审核人员配置已更新',
    data: rules[index]
  });
});
