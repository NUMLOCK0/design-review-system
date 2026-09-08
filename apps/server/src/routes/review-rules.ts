import { Router } from 'express';
import type { ReviewRule, ReviewRuleLevel } from '@design-review/shared';
import { authenticate, requireRoles, type AuthUserPayload } from '../middleware/auth.middleware.js';
import { persistReviewRule } from '../config/persistence.js';

export const reviewRulesRouter = Router();

// 审核流不再依赖预置审核员或测试规则，首次访问时为当前用户生成自己的默认审核流。
export let rules: ReviewRule[] = [];

type RuleOwner = Pick<AuthUserPayload, 'id' | 'name' | 'organizationId'>;

function currentReviewer(owner: RuleOwner) {
  return { id: owner.id, name: owner.name, role: 'advertiser', organizationId: owner.organizationId };
}

function createSelfReviewRule(owner: RuleOwner): ReviewRule {
  const id = `rule_self_${owner.id}`;
  return {
    id,
    name: '自己审核',
    organizationId: owner.organizationId,
    ownerId: owner.id,
    ownerName: owner.name,
    platform: 'universal',
    category: '全品类',
    rejectLimit: 3,
    reviewHoursLimit: 24,
    isActive: true,
    levels: [{
      id: `${id}_level_1`,
      ruleId: id,
      level: 1,
      reviewerIds: [owner.id],
      reviewerNames: [owner.name],
      approvalMode: 'any'
    }],
    createdAt: new Date().toISOString()
  };
}

function ensureSelfReviewRule(owner: RuleOwner) {
  const id = `rule_self_${owner.id}`;
  const existing = rules.find((rule) => rule.id === id);
  if (existing) return existing;
  const rule = createSelfReviewRule(owner);
  rules.unshift(rule);
  void persistReviewRule(rule);
  return rule;
}

function formatLevels(ruleId: string, levels: any, owner?: RuleOwner): ReviewRuleLevel[] {
  const fallbackReviewerIds = owner ? [owner.id] : [];
  return Array.isArray(levels) && levels.length > 0
    ? levels.map((level: any, index: number) => {
        const reviewerIds = Array.isArray(level.reviewerIds) && level.reviewerIds.length > 0 ? level.reviewerIds : fallbackReviewerIds;
        return {
          id: `lvl_${Date.now()}_${index}`,
          ruleId,
          level: index + 1,
          reviewerIds,
          reviewerNames: reviewerIds.map((id: string) => id === owner?.id ? owner.name : '审核员'),
          approvalMode: level.approvalMode === 'all' ? 'all' : 'any'
        };
      })
    : [{ id: `lvl_${Date.now()}_0`, ruleId, level: 1, reviewerIds: fallbackReviewerIds, reviewerNames: owner ? [owner.name] : [], approvalMode: 'any' }];
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
    levels: formatLevels(id, body.levels, owner),
    createdAt: new Date().toISOString()
  };
}

// 1. 获取所有审核规则流配置
reviewRulesRouter.get('/', authenticate, requireRoles('admin'), (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: rules,
    reviewers: [currentReviewer(req.user!)],
    timestamp: Date.now()
  });
});

// 品牌方自己的审核流：规则归属于组织，不再挂在管理后台。
reviewRulesRouter.get('/mine', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  ensureSelfReviewRule(req.user!);
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
    levels: req.body.levels ? formatLevels(current.id, req.body.levels, req.user!) : current.levels,
    updatedAt: new Date().toISOString()
  };
  void persistReviewRule(rules[index]);
  res.json({ code: 200, success: true, message: '品牌方审核流已更新', data: rules[index], timestamp: Date.now() });
});

reviewRulesRouter.get('/mine/reviewers', authenticate, requireRoles('advertiser', 'admin'), (req, res) => {
  res.json({ code: 200, success: true, data: [currentReviewer(req.user!)], timestamp: Date.now() });
});

// 2. 获取可选审核人员列表
reviewRulesRouter.get('/reviewers', authenticate, requireRoles('admin'), (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: [currentReviewer(req.user!)]
  });
});

// 3. 新建或保存审核规则 (含自定义多级人员指派)
reviewRulesRouter.post('/', authenticate, requireRoles('admin'), (req, res) => {
  const newRule = createRule(req.body, {
    id: req.user!.id,
    name: req.user!.name,
    organizationId: req.user!.organizationId
  });

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
