import { Router } from 'express';
import type { CustomerServiceContact, ImageGroupType, SystemConfig } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const systemConfigRouter = Router();
const imageGroupTypes: ImageGroupType[] = ['main_1_1', 'main_3_4', 'main_4_3', 'main_16_9', 'main_9_16', 'detail'];

const sanitizeRichText = (value: string) => value
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (_tag, name) => ['p', 'br', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'ul', 'ol', 'li'].includes(String(name).toLowerCase()) ? `<${_tag.startsWith('</') ? '/' : ''}${String(name).toLowerCase()}>` : '');

// 内存 Mock 系统配置与抽成规则
let systemConfig: SystemConfig = {
  id: 'sys_config_default',
  platformName: 'Cozi 视觉设计与审核管理中台',
  defaultCommissionRate: 0.15, // 默认 15% 抽成
  urgentMarkupRate: 0.20,      // 加急单 20%
  minOrderBudget: 100, // 默认最低预算，可由管理员配置
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
  imageUnitPrice: 100,
  imageUnitPrices: { main_1_1: 100, main_3_4: 100, main_4_3: 100, main_16_9: 100, main_9_16: 100, detail: 100 },
  psdSurchargeRate: 0.2,
  customerServiceWechat: '',
  customerServiceContacts: [],
  activeCustomerServiceId: '',
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
    const savedMinimumBudget = Number(saved.minOrderBudget);
    const legacyUnitPrice = Number(saved.imageUnitPrice);
    const fallbackUnitPrice = Number.isFinite(legacyUnitPrice) && legacyUnitPrice >= 0 ? legacyUnitPrice : systemConfig.imageUnitPrice;
    const savedUnitPrices = saved.imageUnitPrices && typeof saved.imageUnitPrices === 'object' ? saved.imageUnitPrices : {};
    const imageUnitPrices = Object.fromEntries(imageGroupTypes.map((type) => {
      const price = Number(savedUnitPrices[type]);
      return [type, Number.isFinite(price) && price >= 0 ? price : fallbackUnitPrice];
    })) as Record<ImageGroupType, number>;
    const savedPsdSurchargeRate = Number(saved.psdSurchargeRate);
    systemConfig = { ...systemConfig, ...saved, imageUnitPrices, psdSurchargeRate: Number.isFinite(savedPsdSurchargeRate) && savedPsdSurchargeRate >= 0 && savedPsdSurchargeRate <= 1 ? savedPsdSurchargeRate : systemConfig.psdSurchargeRate, minOrderBudget: Number.isFinite(savedMinimumBudget) && savedMinimumBudget >= 0 ? savedMinimumBudget : systemConfig.minOrderBudget, imageTemplates: Array.isArray(saved.imageTemplates) ? saved.imageTemplates : systemConfig.imageTemplates };
  }
  if (dbPool) {
    const [contacts]: any = await dbPool.query('SELECT id, name, wechat, qr_code_url, enabled, sort_order, created_at, updated_at FROM customer_service_contacts ORDER BY enabled DESC, sort_order ASC, created_at ASC');
    if (contacts.length) {
      systemConfig.customerServiceContacts = contacts.map(toContact);
      if (!systemConfig.customerServiceContacts.some((contact) => contact.id === systemConfig.activeCustomerServiceId && contact.enabled)) systemConfig.activeCustomerServiceId = systemConfig.customerServiceContacts.find((contact) => contact.enabled)?.id || '';
    } else if (systemConfig.customerServiceWechat?.trim()) {
      const legacyContact: CustomerServiceContact = { id: 'customer_service_default', name: '客服', wechat: systemConfig.customerServiceWechat.trim(), qrCodeUrl: '', enabled: true, sortOrder: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await dbPool.query('INSERT INTO customer_service_contacts (id, name, wechat, qr_code_url, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [legacyContact.id, legacyContact.name, legacyContact.wechat, legacyContact.qrCodeUrl, 1, 0, legacyContact.createdAt, legacyContact.updatedAt]);
      systemConfig.customerServiceContacts = [legacyContact];
      systemConfig.activeCustomerServiceId = legacyContact.id;
    }
  }
  if (!dbPool) {
    systemConfig.customerServiceContacts = Array.isArray(systemConfig.customerServiceContacts) ? systemConfig.customerServiceContacts : [];
    if (!systemConfig.activeCustomerServiceId) systemConfig.activeCustomerServiceId = systemConfig.customerServiceContacts.find((contact) => contact.enabled)?.id || '';
  }
  if (!dbPool || !(await configRowExists())) {
    await persistSystemConfigSnapshot();
  }
}

function toContact(row: any): CustomerServiceContact {
  return { id: String(row.id), name: String(row.name || ''), wechat: String(row.wechat || ''), qrCodeUrl: String(row.qr_code_url || ''), enabled: Boolean(row.enabled), sortOrder: Number(row.sort_order || 0), createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined, updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined };
}

async function configRowExists() {
  if (!dbPool) return false;
  const [rows]: any = await dbPool.query('SELECT id FROM system_configs WHERE id = ? LIMIT 1', [systemConfig.id]);
  return Boolean(rows.length);
}

async function persistSystemConfigSnapshot() {
  if (!dbPool) return;
  const updatedAt = new Date().toISOString();
  systemConfig.updatedAt = updatedAt;
  await dbPool.query(`INSERT INTO system_configs (id, payload_json, updated_at) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE payload_json=VALUES(payload_json), updated_at=VALUES(updated_at)`, [systemConfig.id, JSON.stringify(systemConfig), updatedAt]);
}

function activeCustomerService() {
  return systemConfig.customerServiceContacts.find((contact) => contact.id === systemConfig.activeCustomerServiceId && contact.enabled) || systemConfig.customerServiceContacts.find((contact) => contact.enabled);
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
  const rawUpdates = req.body && typeof req.body === 'object' ? req.body : {};
  const allowedFields = [
    'platformName', 'defaultCommissionRate', 'urgentMarkupRate', 'minOrderBudget',
    'autoClaimTimeoutMinutes', 'maxRevisionLimit', 'allowDesignerBidding', 'reviewStrictLevel',
    'commissionTiers', 'announcement', 'depositRate', 'requireOrderPublicationReview', 'imageUnitPrice', 'imageUnitPrices', 'psdSurchargeRate', 'customerServiceWechat',
    'userAgreementContent', 'privacyPolicyContent', 'imageTemplates', 'customerServiceContacts', 'activeCustomerServiceId'
  ] as const;
  const unknownFields = Object.keys(rawUpdates).filter((field) => !allowedFields.includes(field as typeof allowedFields[number]));
  if (unknownFields.length) {
    return res.status(400).json({ code: 400, success: false, message: `存在不支持的配置字段：${unknownFields.join(', ')}` });
  }
  const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([field]) => allowedFields.includes(field as typeof allowedFields[number]))) as Partial<SystemConfig>;

  const rateFields = ['defaultCommissionRate', 'urgentMarkupRate', 'depositRate'] as const;
  for (const field of rateFields) {
    if (updates[field] !== undefined && (!Number.isFinite(Number(updates[field])) || Number(updates[field]) < 0 || Number(updates[field]) > 1)) {
      return res.status(400).json({ code: 400, success: false, message: `${field} 必须是 0 至 1 之间的比例` });
    }
  }
  const integerFields = ['autoClaimTimeoutMinutes', 'maxRevisionLimit'] as const;
  for (const field of integerFields) {
    if (updates[field] !== undefined && (!Number.isInteger(Number(updates[field])) || Number(updates[field]) < 0 || Number(updates[field]) > 100000)) {
      return res.status(400).json({ code: 400, success: false, message: `${field} 必须是有效的非负整数` });
    }
  }
  if (updates.minOrderBudget !== undefined && (!Number.isFinite(Number(updates.minOrderBudget)) || Number(updates.minOrderBudget) < 0)) {
    return res.status(400).json({ code: 400, success: false, message: '最低订单预算必须是有效的非负金额' });
  }
  if (updates.psdSurchargeRate !== undefined && (!Number.isFinite(Number(updates.psdSurchargeRate)) || Number(updates.psdSurchargeRate) < 0 || Number(updates.psdSurchargeRate) > 1)) {
    return res.status(400).json({ code: 400, success: false, message: 'PSD 源文件上浮比例必须在 0% 至 100% 之间' });
  }
  if (updates.imageUnitPrice !== undefined && (!Number.isFinite(Number(updates.imageUnitPrice)) || Number(updates.imageUnitPrice) < 0)) {
    return res.status(400).json({ code: 400, success: false, message: '图片推荐单价必须是有效的非负金额' });
  }
  if (updates.imageUnitPrices !== undefined) {
    const prices = updates.imageUnitPrices as Partial<Record<ImageGroupType, number>>;
    if (!prices || typeof prices !== 'object' || Array.isArray(prices) || Object.entries(prices).some(([type, price]) =>
      !imageGroupTypes.includes(type as ImageGroupType) || !Number.isFinite(Number(price)) || Number(price) < 0)) {
      return res.status(400).json({ code: 400, success: false, message: '各图片类型的最低单价必须是有效的非负金额' });
    }
    updates.imageUnitPrices = { ...systemConfig.imageUnitPrices, ...prices } as Record<ImageGroupType, number>;
  }
  if (updates.customerServiceWechat !== undefined && (typeof updates.customerServiceWechat !== 'string' || updates.customerServiceWechat.trim().length > 100)) {
    return res.status(400).json({ code: 400, success: false, message: '客服微信格式无效' });
  }
  if (updates.platformName !== undefined && (typeof updates.platformName !== 'string' || updates.platformName.trim().length > 100)) {
    return res.status(400).json({ code: 400, success: false, message: '平台名称格式无效' });
  }
  if (updates.reviewStrictLevel !== undefined && !['strict', 'standard', 'relaxed'].includes(updates.reviewStrictLevel)) {
    return res.status(400).json({ code: 400, success: false, message: '审核严格度配置无效' });
  }
  if (updates.depositRate !== undefined && (!Number.isFinite(Number(updates.depositRate)) || Number(updates.depositRate) < 0.01 || Number(updates.depositRate) > 1)) {
    return res.status(400).json({ code: 400, success: false, message: '定金比例必须在 1% 至 100% 之间' });
  }
  if (updates.requireOrderPublicationReview !== undefined && typeof updates.requireOrderPublicationReview !== 'boolean') {
    return res.status(400).json({ code: 400, success: false, message: '订单发布审核开关参数无效' });
  }
  const richTextFields = ['userAgreementContent', 'privacyPolicyContent'] as const;
  if (richTextFields.some((field) => updates[field] !== undefined && (typeof updates[field] !== 'string' || updates[field].trim().length > 50000))) {
    return res.status(400).json({ code: 400, success: false, message: '协议正文格式无效或超过 50000 字符' });
  }
  for (const field of ['userAgreementContent', 'privacyPolicyContent'] as const) {
    if (typeof updates[field] === 'string') updates[field] = sanitizeRichText(updates[field]);
  }
  if (updates.announcement !== undefined && (typeof updates.announcement !== 'string' || updates.announcement.length > 5000)) {
    return res.status(400).json({ code: 400, success: false, message: '公告内容格式无效或超过 5000 字符' });
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

systemConfigRouter.get('/customer-services', authenticate, requireRoles('admin'), (_req, res) => {
  res.json({ code: 200, success: true, data: { contacts: systemConfig.customerServiceContacts, activeCustomerServiceId: systemConfig.activeCustomerServiceId }, timestamp: Date.now() });
});

systemConfigRouter.post('/customer-services', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const wechat = typeof req.body?.wechat === 'string' ? req.body.wechat.trim() : '';
    const qrCodeUrl = typeof req.body?.qrCodeUrl === 'string' ? req.body.qrCodeUrl.trim() : '';
    if (!name || name.length > 64 || !wechat || wechat.length > 128 || qrCodeUrl.length > 2000) return res.status(400).json({ code: 400, success: false, message: '请填写有效的客服名称、微信号和二维码' });
    const now = new Date().toISOString();
    const contact: CustomerServiceContact = { id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, wechat, qrCodeUrl, enabled: req.body.enabled !== false, sortOrder: Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : systemConfig.customerServiceContacts.length, createdAt: now, updatedAt: now };
    if (dbPool) await dbPool.query('INSERT INTO customer_service_contacts (id, name, wechat, qr_code_url, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [contact.id, contact.name, contact.wechat, contact.qrCodeUrl, contact.enabled ? 1 : 0, contact.sortOrder, now, now]);
    systemConfig.customerServiceContacts = [...systemConfig.customerServiceContacts, contact];
    if (!systemConfig.activeCustomerServiceId && contact.enabled) systemConfig.activeCustomerServiceId = contact.id;
    await persistSystemConfigSnapshot();
    res.status(201).json({ code: 200, success: true, data: { contacts: systemConfig.customerServiceContacts, activeCustomerServiceId: systemConfig.activeCustomerServiceId }, timestamp: Date.now() });
  } catch (error) { next(error); }
});

systemConfigRouter.put('/customer-services/active', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    if (id && !systemConfig.customerServiceContacts.some((contact) => contact.id === id && contact.enabled)) return res.status(400).json({ code: 400, success: false, message: '请选择有效且已启用的客服' });
    systemConfig.activeCustomerServiceId = id;
    await persistSystemConfigSnapshot();
    res.json({ code: 200, success: true, data: { activeCustomerServiceId: id }, timestamp: Date.now() });
  } catch (error) { next(error); }
});

systemConfigRouter.put('/customer-services/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    const index = systemConfig.customerServiceContacts.findIndex((contact) => contact.id === req.params.id);
    if (index < 0) return res.status(404).json({ code: 404, success: false, message: '客服不存在' });
    const current = systemConfig.customerServiceContacts[index];
    const contact = { ...current, name: typeof req.body?.name === 'string' ? req.body.name.trim() : current.name, wechat: typeof req.body?.wechat === 'string' ? req.body.wechat.trim() : current.wechat, qrCodeUrl: typeof req.body?.qrCodeUrl === 'string' ? req.body.qrCodeUrl.trim() : current.qrCodeUrl, enabled: req.body.enabled === undefined ? current.enabled : Boolean(req.body.enabled), sortOrder: req.body.sortOrder === undefined ? current.sortOrder : Number(req.body.sortOrder), updatedAt: new Date().toISOString() };
    if (!contact.name || contact.name.length > 64 || !contact.wechat || contact.wechat.length > 128 || contact.qrCodeUrl.length > 2000 || !Number.isFinite(contact.sortOrder)) return res.status(400).json({ code: 400, success: false, message: '客服资料格式无效' });
    if (dbPool) await dbPool.query('UPDATE customer_service_contacts SET name=?, wechat=?, qr_code_url=?, enabled=?, sort_order=?, updated_at=? WHERE id=?', [contact.name, contact.wechat, contact.qrCodeUrl, contact.enabled ? 1 : 0, contact.sortOrder, contact.updatedAt, contact.id]);
    const contacts = [...systemConfig.customerServiceContacts]; contacts[index] = contact; systemConfig.customerServiceContacts = contacts;
    if (systemConfig.activeCustomerServiceId === contact.id && !contact.enabled) systemConfig.activeCustomerServiceId = contacts.find((item) => item.enabled)?.id || '';
    await persistSystemConfigSnapshot();
    res.json({ code: 200, success: true, data: { contacts: systemConfig.customerServiceContacts, activeCustomerServiceId: systemConfig.activeCustomerServiceId }, timestamp: Date.now() });
  } catch (error) { next(error); }
});

systemConfigRouter.delete('/customer-services/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    const contacts = systemConfig.customerServiceContacts.filter((contact) => contact.id !== req.params.id);
    if (contacts.length === systemConfig.customerServiceContacts.length) return res.status(404).json({ code: 404, success: false, message: '客服不存在' });
    if (dbPool) await dbPool.query('DELETE FROM customer_service_contacts WHERE id=?', [req.params.id]);
    systemConfig.customerServiceContacts = contacts;
    if (!contacts.some((contact) => contact.id === systemConfig.activeCustomerServiceId && contact.enabled)) systemConfig.activeCustomerServiceId = contacts.find((contact) => contact.enabled)?.id || '';
    await persistSystemConfigSnapshot();
    res.json({ code: 200, success: true, data: { contacts, activeCustomerServiceId: systemConfig.activeCustomerServiceId }, timestamp: Date.now() });
  } catch (error) { next(error); }
});

systemConfigRouter.get('/order-pricing', authenticate, requireRoles('advertiser', 'customer_service', 'admin'), (_req, res) => {
  const contact = activeCustomerService();
  res.json({ code: 200, success: true, data: { imageUnitPrice: systemConfig.imageUnitPrice, imageUnitPrices: systemConfig.imageUnitPrices, minOrderBudget: systemConfig.minOrderBudget, psdSurchargeRate: systemConfig.psdSurchargeRate, customerService: contact ? { id: contact.id, name: contact.name, wechat: contact.wechat, qrCodeUrl: contact.qrCodeUrl } : null }, timestamp: Date.now() });
});

systemConfigRouter.get('/active-customer-service', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), (_req, res) => {
  const contact = activeCustomerService();
  res.json({ code: 200, success: true, data: contact ? { id: contact.id, name: contact.name, wechat: contact.wechat, qrCodeUrl: contact.qrCodeUrl } : null, timestamp: Date.now() });
});
