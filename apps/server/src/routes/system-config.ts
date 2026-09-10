import { Router } from 'express';
import type { SystemConfig } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const systemConfigRouter = Router();

const sanitizeRichText = (value: string) => value
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (_tag, name) => ['p', 'br', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'ul', 'ol', 'li'].includes(String(name).toLowerCase()) ? `<${_tag.startsWith('</') ? '/' : ''}${String(name).toLowerCase()}>` : '');

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
  requireOrderPublicationReview: true,
  userAgreementContent: '一、服务说明\n创赢为品牌方与设计师提供设计订单发布、协作、交付及审核服务。\n\n二、账号使用\n请使用真实、准确的信息注册并妥善保管账号。账号下的操作由账号持有人负责。\n\n三、内容与交付\n请确保上传的素材、文字和链接拥有合法使用权，并按照订单约定完成协作。\n\n四、协议更新\n产品功能或法律法规发生变化时，我们可能更新本协议，并在页面展示最新版本。',
  privacyPolicyContent: '一、信息收集\n我们仅在注册、登录、订单协作和安全验证所必需的范围内收集手机号、账号信息及业务内容。\n\n二、信息使用\n收集的信息用于身份验证、订单协作、消息通知、审核流程和服务安全。\n\n三、信息保护\n我们会采取访问控制、权限管理和传输保护等措施，防止信息被未经授权访问。\n\n四、你的权利\n你可以联系平台管理员了解、更正或删除与账号相关的个人信息。',
  imageTemplates: [
    {
      id: 'template_product_main',
      name: '商品主图套图',
      groups: [
        { id: 'template_product_main_1', name: '1:1 方形主图', groupType: 'main_1_1', quantity: 5 },
        { id: 'template_product_main_2', name: '3:4 竖版长图', groupType: 'main_3_4', quantity: 3 },
      ],
    },
  ],
  updatedAt: new Date().toISOString()
};

export const getSystemConfig = () => systemConfig;

systemConfigRouter.get('/agreements', (_req, res) => {
  res.json({ code: 200, success: true, data: { userAgreementContent: systemConfig.userAgreementContent, privacyPolicyContent: systemConfig.privacyPolicyContent, updatedAt: systemConfig.updatedAt }, timestamp: Date.now() });
});

export async function initializeSystemConfig() {
  if (!dbPool) return;
  const [rows]: any = await dbPool.query('SELECT payload_json FROM system_configs WHERE id = ? LIMIT 1', [systemConfig.id]);
  if (rows?.[0]?.payload_json) {
    const saved = typeof rows[0].payload_json === 'string' ? JSON.parse(rows[0].payload_json) : rows[0].payload_json;
    systemConfig = { ...systemConfig, ...saved, imageTemplates: Array.isArray(saved.imageTemplates) ? saved.imageTemplates : systemConfig.imageTemplates };
    return;
  }
  await dbPool.query('INSERT INTO system_configs (id, payload_json, updated_at) VALUES (?, ?, ?)', [systemConfig.id, JSON.stringify(systemConfig), systemConfig.updatedAt]);
}

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
systemConfigRouter.put('/', authenticate, requireRoles('admin'), async (req, res, next) => {
  const updates = req.body;
  if (updates.depositRate !== undefined && (!Number.isFinite(Number(updates.depositRate)) || Number(updates.depositRate) < 0.01 || Number(updates.depositRate) > 1)) {
    return res.status(400).json({ code: 400, success: false, message: '定金比例必须在 1% 至 100% 之间' });
  }
  if (updates.requireOrderPublicationReview !== undefined && typeof updates.requireOrderPublicationReview !== 'boolean') {
    return res.status(400).json({ code: 400, success: false, message: '订单发布审核开关参数无效' });
  }
  if (['userAgreementContent', 'privacyPolicyContent'].some((field) => updates[field] !== undefined && (typeof updates[field] !== 'string' || updates[field].trim().length > 50000))) {
    return res.status(400).json({ code: 400, success: false, message: '协议正文格式无效或超过 50000 字符' });
  }
  for (const field of ['userAgreementContent', 'privacyPolicyContent'] as const) {
    if (typeof updates[field] === 'string') updates[field] = sanitizeRichText(updates[field]);
  }
  if (updates.imageTemplates !== undefined) {
    const types = new Set(['main_1_1', 'main_3_4', 'main_4_3', 'main_16_9', 'main_9_16', 'detail']);
    const invalid = !Array.isArray(updates.imageTemplates) || updates.imageTemplates.length > 50 || updates.imageTemplates.some((template: any) =>
      !template || typeof template.name !== 'string' || !template.name.trim() || template.name.trim().length > 60 || !Array.isArray(template.groups) || !template.groups.length || template.groups.length > 30 || template.groups.some((group: any) =>
        !group || typeof group.name !== 'string' || !group.name.trim() || group.name.trim().length > 60 || !types.has(group.groupType) || !Number.isInteger(Number(group.quantity)) || Number(group.quantity) < 1 || Number(group.quantity) > 99));
    if (invalid) return res.status(400).json({ code: 400, success: false, message: '图片模板格式无效，请检查分组名称、比例和图片数量' });
  }
  const nextConfig: SystemConfig = {
    ...systemConfig,
    ...updates,
    updatedAt: new Date().toISOString()
  };
  try {
    if (dbPool) await dbPool.query(`INSERT INTO system_configs (id, payload_json, updated_at) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json), updated_at=VALUES(updated_at)`, [nextConfig.id, JSON.stringify(nextConfig), nextConfig.updatedAt]);
    systemConfig = nextConfig;
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'system_config', action: 'update', targetType: 'system_config', targetId: nextConfig.id, summary: `${req.user!.name}更新系统运营配置`, detail: { changedFields: Object.keys(updates) }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 系统配置日志写入失败:', error));
    res.json({
      code: 200,
      success: true,
      message: '运营与抽成配置已成功保存更新',
      data: systemConfig,
      timestamp: Date.now()
    });
  } catch (error) { next(error); }
});

systemConfigRouter.get('/image-templates', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), (_req, res) => {
  res.json({ code: 200, success: true, data: systemConfig.imageTemplates, timestamp: Date.now() });
});
