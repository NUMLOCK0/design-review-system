import { Router } from 'express';
import type { ReviewRule, ReviewRuleLevel } from '@design-review/shared';

export const reviewRulesRouter = Router();

// 预设审核员备选库
export const mockReviewers = [
  { id: 'u_rev_1', name: '王总监', role: 'reviewer', department: '视觉设计部' },
  { id: 'u_rev_2', name: '张主管(美妆组)', role: 'reviewer', department: '美妆类目组' },
  { id: 'u_rev_3', name: '刘专家(3D质检)', role: 'reviewer', department: '技术美术组' },
  { id: 'u_admin_1', name: '系统管理员', role: 'admin', department: '运营管理部' },
];

let rules: ReviewRule[] = [
  {
    id: 'rule_001',
    name: '天猫/淘宝 主图与长图三级质检审核流',
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
        reviewerIds: ['u_rev_1'],
        reviewerNames: ['王总监'],
        approvalMode: 'any'
      },
      {
        id: 'lvl_002',
        ruleId: 'rule_001',
        level: 2,
        reviewerIds: ['u_rev_2', 'u_rev_3'],
        reviewerNames: ['张主管(美妆组)', '刘专家(3D质检)'],
        approvalMode: 'any'
      }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'rule_002',
    name: '拼多多/抖音 极速单级质检合规流',
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
        reviewerIds: ['u_rev_1'],
        reviewerNames: ['王总监'],
        approvalMode: 'any'
      }
    ],
    createdAt: new Date().toISOString()
  }
];

// 1. 获取所有审核规则流配置
reviewRulesRouter.get('/', (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: rules,
    reviewers: mockReviewers,
    timestamp: Date.now()
  });
});

// 2. 获取可选审核人员列表
reviewRulesRouter.get('/reviewers', (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: mockReviewers
  });
});

// 3. 新建或保存审核规则 (含自定义多级人员指派)
reviewRulesRouter.post('/', (req, res) => {
  const { name, platform, category, rejectLimit, reviewHoursLimit, levels } = req.body;

  const ruleId = `rule_${Date.now()}`;
  const formattedLevels: ReviewRuleLevel[] = Array.isArray(levels) && levels.length > 0
    ? levels.map((lvl: any, index: number) => ({
        id: `lvl_${Date.now()}_${index}`,
        ruleId,
        level: index + 1,
        reviewerIds: lvl.reviewerIds || ['u_rev_1'],
        reviewerNames: (lvl.reviewerIds || ['u_rev_1']).map((id: string) => {
          const found = mockReviewers.find(r => r.id === id);
          return found ? found.name : '审核员';
        }),
        approvalMode: lvl.approvalMode || 'any'
      }))
    : [
        {
          id: `lvl_${Date.now()}_0`,
          ruleId,
          level: 1,
          reviewerIds: ['u_rev_1'],
          reviewerNames: ['王总监'],
          approvalMode: 'any'
        }
      ];

  const newRule: ReviewRule = {
    id: ruleId,
    name: name || '自定义审核流',
    platform: platform || 'universal',
    category: category || '全品类',
    rejectLimit: Number(rejectLimit) || 3,
    reviewHoursLimit: Number(reviewHoursLimit) || 24,
    isActive: true,
    levels: formattedLevels,
    createdAt: new Date().toISOString()
  };

  rules.unshift(newRule);

  res.status(201).json({
    code: 200,
    success: true,
    message: '自定义审核规则流已成功发布生效',
    data: newRule
  });
});

// 4. 更新指定规则的审核人员配置
reviewRulesRouter.put('/:id', (req, res) => {
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

  res.json({
    code: 200,
    success: true,
    message: '审核人员配置已更新',
    data: rules[index]
  });
});
