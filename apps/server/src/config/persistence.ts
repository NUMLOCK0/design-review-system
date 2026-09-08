import type { DesignOrder, OrderDispute, ReviewRule, ReviewTask, ServiceActionLog, SiteMessage } from '@design-review/shared';
import type { ProtectedAsset } from '../utils/media-protection.js';
import { protectedAssets } from '../utils/media-protection.js';
import { calculateOrderSettlement } from '../utils/order-finance.js';
import { dbPool } from './database.js';

type Stores = {
  designOrders: DesignOrder[];
  rules: ReviewRule[];
  tasks: ReviewTask[];
  disputes: OrderDispute[];
  messages: SiteMessage[];
  serviceLogs: ServiceActionLog[];
};

const json = (value: unknown) => JSON.stringify(value ?? null);
const mysqlDate = (value: string | undefined) => value ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') : null;
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const dateValue = (value: unknown) => value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());

async function addColumn(table: string, column: string, definition: string) {
  try {
    await dbPool!.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureSchema() {
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS design_orders (
    id VARCHAR(64) PRIMARY KEY,
    order_no VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(256) NOT NULL,
    category VARCHAR(64) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    budget DECIMAL(12,2) NOT NULL,
    platform_commission_rate DECIMAL(8,4) NOT NULL DEFAULT 0,
    designer_payout DECIMAL(12,2) NOT NULL DEFAULT 0,
    deadline VARCHAR(64), urgency VARCHAR(20), requirements TEXT,
    image_requirement_groups JSON, reference_images JSON, attachment_url TEXT,
    status VARCHAR(32) NOT NULL, publication_status VARCHAR(32), publication_review_comment TEXT,
    publication_reviewed_at VARCHAR(64), publication_reviewer_id VARCHAR(64), publication_reviewer_name VARCHAR(64),
    creator_id VARCHAR(64) NOT NULL, creator_name VARCHAR(128) NOT NULL, organization_id VARCHAR(64),
    review_rule_id VARCHAR(64), review_rule_name VARCHAR(128), claimed_by_id VARCHAR(64), claimed_by_name VARCHAR(128),
    claimed_at VARCHAR(64), completed_at VARCHAR(64), task_id VARCHAR(64), is_disputed BOOLEAN DEFAULT FALSE,
    dispute_id VARCHAR(64), payment_status VARCHAR(32), deposit_rate DECIMAL(8,4), deposit_amount DECIMAL(12,2),
    deposit_out_trade_no VARCHAR(64), deposit_trade_no VARCHAR(128), deposit_paid_at VARCHAR(64), balance_amount DECIMAL(12,2),
    balance_out_trade_no VARCHAR(64), balance_trade_no VARCHAR(128), balance_paid_at VARCHAR(64), created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS order_disputes (
    id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, order_no VARCHAR(64) NOT NULL,
    initiator_id VARCHAR(64) NOT NULL, initiator_name VARCHAR(128) NOT NULL, initiator_role VARCHAR(32) NOT NULL,
    respondent_id VARCHAR(64), respondent_name VARCHAR(128), reason VARCHAR(256) NOT NULL, description TEXT NOT NULL,
    evidence_urls JSON, status VARCHAR(32) NOT NULL, handler_id VARCHAR(64), handler_name VARCHAR(128),
    resolution_comment TEXT, payload_json JSON, created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS service_action_logs (
    id VARCHAR(96) PRIMARY KEY, task_type VARCHAR(32) NOT NULL, task_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL, comment TEXT, operator_id VARCHAR(64) NOT NULL, operator_name VARCHAR(128) NOT NULL,
    created_at VARCHAR(64) NOT NULL, INDEX idx_service_logs_task (task_type, task_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await addColumn('design_orders', 'service_assignee_id', 'VARCHAR(64)');
  await addColumn('design_orders', 'service_assignee_name', 'VARCHAR(128)');
  await addColumn('design_orders', 'service_claimed_at', 'VARCHAR(64)');
  await addColumn('design_orders', 'service_due_at', 'VARCHAR(64)');
  await addColumn('design_orders', 'service_priority', "VARCHAR(20) NOT NULL DEFAULT 'normal'");
  await addColumn('design_orders', 'payment_status', 'VARCHAR(32)');
  await addColumn('design_orders', 'deposit_rate', 'DECIMAL(8,4)');
  await addColumn('design_orders', 'deposit_amount', 'DECIMAL(12,2)');
  await addColumn('design_orders', 'deposit_out_trade_no', 'VARCHAR(64)');
  await addColumn('design_orders', 'deposit_trade_no', 'VARCHAR(128)');
  await addColumn('design_orders', 'deposit_paid_at', 'VARCHAR(64)');
  await addColumn('design_orders', 'balance_amount', 'DECIMAL(12,2)');
  await addColumn('design_orders', 'balance_out_trade_no', 'VARCHAR(64)');
  await addColumn('design_orders', 'balance_trade_no', 'VARCHAR(128)');
  await addColumn('design_orders', 'balance_paid_at', 'VARCHAR(64)');
  await dbPool!.query(`UPDATE design_orders SET payment_status='deposit_paid', deposit_rate=0.3,
    deposit_amount=ROUND(budget * 0.3, 2), balance_amount=budget - ROUND(budget * 0.3, 2)
    WHERE id LIKE 'seed_order_%' AND payment_status IS NULL`);
  await addColumn('order_disputes', 'service_claimed_at', 'VARCHAR(64)');
  await addColumn('order_disputes', 'service_due_at', 'VARCHAR(64)');
  await addColumn('order_disputes', 'service_priority', "VARCHAR(20) NOT NULL DEFAULT 'high'");
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS media_assets (
    id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(64) NOT NULL, kind VARCHAR(20) NOT NULL,
    filename VARCHAR(512) NOT NULL, mimetype VARCHAR(128) NOT NULL, size BIGINT NOT NULL,
    local_original_path TEXT, oss_original_key VARCHAR(512), oss_preview_key VARCHAR(512),
    created_at VARCHAR(64) NOT NULL, INDEX idx_media_assets_owner (owner_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS site_messages (
    id VARCHAR(96) PRIMARY KEY, recipient_id VARCHAR(64) NOT NULL, sender_name VARCHAR(128),
    type VARCHAR(32) NOT NULL, title VARCHAR(256) NOT NULL, content TEXT NOT NULL,
    link VARCHAR(512), is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at VARCHAR(64) NOT NULL,
    read_at VARCHAR(64), INDEX idx_site_messages_recipient (recipient_id, is_read, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS designer_profiles (
    user_id VARCHAR(64) PRIMARY KEY, categories JSON NOT NULL, platforms JSON NOT NULL, styles JSON NOT NULL,
    min_budget DECIMAL(12,2), max_active_orders INT NOT NULL DEFAULT 3,
    availability_status VARCHAR(20) NOT NULL DEFAULT 'available', portfolio_urls JSON,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS order_invitations (
    id VARCHAR(96) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, inviter_id VARCHAR(64) NOT NULL,
    inviter_name VARCHAR(128) NOT NULL, designer_id VARCHAR(64) NOT NULL, designer_name VARCHAR(128) NOT NULL,
    status VARCHAR(20) NOT NULL, invite_message TEXT, recommendation_score INT,
    recommendation_reasons JSON, expires_at VARCHAR(64) NOT NULL, sent_at VARCHAR(64), responded_at VARCHAR(64), created_at VARCHAR(64) NOT NULL,
    UNIQUE KEY uk_order_designer (order_id, designer_id),
    INDEX idx_order_invitations_designer (designer_id, status, created_at),
    INDEX idx_order_invitations_order (order_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

  await addColumn('users', 'organization_id', 'VARCHAR(64)');
  await addColumn('users', 'is_organization_admin', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL,
    created_at VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, role),
    INDEX idx_user_roles_role (role, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  // 普通账号直接开放双角色；平台账号保持单一平台角色。
  await dbPool!.query(`INSERT IGNORE INTO user_roles (user_id, role, created_at)
    SELECT id, 'advertiser', COALESCE(CAST(created_at AS CHAR), NOW()) FROM users WHERE role IN ('advertiser', 'designer')`);
  await dbPool!.query(`INSERT IGNORE INTO user_roles (user_id, role, created_at)
    SELECT id, 'designer', COALESCE(CAST(created_at AS CHAR), NOW()) FROM users WHERE role IN ('advertiser', 'designer')`);
  await dbPool!.query(`INSERT IGNORE INTO user_roles (user_id, role, created_at)
    SELECT id, role, COALESCE(CAST(created_at AS CHAR), NOW()) FROM users WHERE role IN ('admin', 'customer_service', 'reviewer')`);
  await addColumn('review_rules', 'organization_id', 'VARCHAR(64)');
  await addColumn('review_rules', 'owner_id', 'VARCHAR(64)');
  await addColumn('review_rules', 'owner_name', 'VARCHAR(128)');
  await addColumn('review_rules', 'payload_json', 'JSON');
  await addColumn('review_tasks', 'order_id', 'VARCHAR(64)');
  await addColumn('review_tasks', 'payload_json', 'JSON');
  // 清理旧版本明确的测试审核流，真实用户会在首次进入审核流时获得自己的默认流。
  await dbPool!.query(`DELETE FROM review_rule_levels WHERE rule_id IN ('rule_001', 'rule_002')`);
  await dbPool!.query(`DELETE FROM review_rules WHERE id IN ('rule_001', 'rule_002')`);
  await dbPool!.query(`UPDATE users SET role = 'customer_service', department = '客服与争议处理部' WHERE role = 'reviewer'`);
  await dbPool!.query(`INSERT INTO users (id, name, email, password_hash, role, department, organization_id, is_organization_admin)
    VALUES ('u_adv_1', '陈品牌经理', 'advertiser@cozi.com', NULL, 'advertiser', '品牌营销部', 'org_demo_1', TRUE)
    ON DUPLICATE KEY UPDATE name = '陈品牌经理', role = 'advertiser', department = '品牌营销部', organization_id = 'org_demo_1', is_organization_admin = TRUE`);
  const demoDesigners = [
    ['u_des_1', '李设计师', 'designer@cozi.com', '["主图设计","详情页设计"]', '["tmall","taobao"]', '["简约","科技"]', 300, 3, 'available', '["https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800"]'],
    ['u_des_2', '周视觉', 'designer2@cozi.com', '["活动海报","主图设计"]', '["douyin","tmall"]', '["国潮","潮流"]', 200, 3, 'available', '["https://images.unsplash.com/photo-1545235617-9465d2a55698?w=800"]'],
    ['u_des_3', '林创意', 'designer3@cozi.com', '["详情页设计","精修合成"]', '["taobao","pinduoduo"]', '["轻奢","美妆"]', 400, 2, 'available', '["https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=800"]'],
    ['u_des_4', '张三维', 'designer4@cozi.com', '["3D建模与渲染","主图设计"]', '["tmall","universal"]', '["科技","写实"]', 800, 2, 'busy', '["https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800"]'],
    ['u_des_5', '许墨', 'designer5@cozi.com', '["活动海报","详情页设计"]', '["douyin","universal"]', '["极简","品牌"]', 300, 4, 'available', '["https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=800"]'],
    ['u_des_6', '韩小满', 'designer6@cozi.com', '["主图设计","精修合成"]', '["taobao","tmall"]', '["食品","清新"]', 200, 3, 'available', '["https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800"]']
  ];
  for (const [id, name, email, categories, platforms, styles, minBudget, maxActiveOrders, availabilityStatus, portfolioUrls] of demoDesigners) {
    await dbPool!.query(`INSERT INTO users (id, name, email, password_hash, role, department)
      VALUES (?, ?, ?, NULL, 'designer', '视觉设计部') ON DUPLICATE KEY UPDATE name=VALUES(name), role='designer'`, [id, name, email]);
    await dbPool!.query(`INSERT IGNORE INTO user_roles (user_id, role, created_at) VALUES (?, 'advertiser', ?), (?, 'designer', ?)`, [id, new Date().toISOString(), id, new Date().toISOString()]);
    await dbPool!.query(`INSERT INTO designer_profiles (user_id, categories, platforms, styles, min_budget, max_active_orders, availability_status, portfolio_urls, updated_at)
      VALUES (?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, CAST(? AS JSON), ?)
      ON DUPLICATE KEY UPDATE categories=VALUES(categories), platforms=VALUES(platforms), styles=VALUES(styles), min_budget=VALUES(min_budget), max_active_orders=VALUES(max_active_orders), availability_status=VALUES(availability_status), portfolio_urls=VALUES(portfolio_urls), updated_at=VALUES(updated_at)`,
      [id, categories, platforms, styles, minBudget, maxActiveOrders, availabilityStatus, portfolioUrls, new Date().toISOString()]);
  }
}

async function refreshSeedOrders(stores: Stores) {
  const seedOrders = stores.designOrders.filter((order) => order.id.startsWith('seed_order_'));
  if (seedOrders.length === 0) return;

  const legacyCondition = `(order_id LIKE 'mock_ord_%' OR order_id IN ('ord_001', 'ord_002', 'ord_003'))`;
  await dbPool!.query(`DELETE FROM order_invitations WHERE ${legacyCondition}`);
  await dbPool!.query(`DELETE FROM service_action_logs WHERE task_type = 'order_audit' AND task_id IN (SELECT id FROM design_orders WHERE id LIKE 'mock_ord_%' OR id IN ('ord_001', 'ord_002', 'ord_003'))`);
  await dbPool!.query(`DELETE FROM design_orders WHERE id LIKE 'mock_ord_%' OR id IN ('ord_001', 'ord_002', 'ord_003')`);

  const [seedCountRows]: any = await dbPool!.query("SELECT COUNT(*) AS count FROM design_orders WHERE id LIKE 'seed_order_%'");
  if (Number(seedCountRows[0]?.count) !== seedOrders.length) {
    for (const order of seedOrders) await persistDesignOrder(order);
  }
}

export async function persistMediaAsset(asset: ProtectedAsset) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO media_assets
      (id, owner_id, kind, filename, mimetype, size, local_original_path, oss_original_key, oss_preview_key, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id), kind=VALUES(kind), filename=VALUES(filename),
        mimetype=VALUES(mimetype), size=VALUES(size), local_original_path=VALUES(local_original_path),
        oss_original_key=VALUES(oss_original_key), oss_preview_key=VALUES(oss_preview_key)`, [
      asset.id, asset.ownerId, asset.kind, asset.filename, asset.mimetype, asset.size,
      asset.localOriginalPath || null, asset.ossOriginalKey || null, asset.ossPreviewKey || null, new Date().toISOString()
    ]);
  } catch (error) {
    console.error('[MySQL] 保存媒体资源失败:', error);
  }
}

export async function persistSiteMessage(message: SiteMessage) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO site_messages
      (id, recipient_id, sender_name, type, title, content, link, is_read, created_at, read_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE is_read=VALUES(is_read), read_at=VALUES(read_at)`, [
      message.id, message.recipientId, message.senderName || null, message.type, message.title,
      message.content, message.link || null, message.isRead ? 1 : 0, message.createdAt, message.readAt || null
    ]);
  } catch (error) {
    console.error('[MySQL] 保存站内信失败:', error);
  }
}

export async function findMediaAsset(assetId: string): Promise<ProtectedAsset | null> {
  if (!dbPool) return null;
  try {
    const [rows]: any = await dbPool.query('SELECT * FROM media_assets WHERE id = ? LIMIT 1', [assetId]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      kind: row.kind === 'image' ? 'image' : 'source-file',
      filename: row.filename,
      mimetype: row.mimetype,
      size: Number(row.size),
      localOriginalPath: row.local_original_path || undefined,
      ossOriginalKey: row.oss_original_key || undefined,
      ossPreviewKey: row.oss_preview_key || undefined
    };
  } catch (error) {
    console.error('[MySQL] 查询媒体资源失败:', error);
    return null;
  }
}

async function loadMediaAssets() {
  const [rows]: any = await dbPool!.query('SELECT * FROM media_assets ORDER BY created_at ASC');
  protectedAssets.clear();
  for (const row of rows) {
    protectedAssets.set(row.id, {
      id: row.id,
      ownerId: row.owner_id,
      kind: row.kind === 'image' ? 'image' : 'source-file',
      filename: row.filename,
      mimetype: row.mimetype,
      size: Number(row.size),
      localOriginalPath: row.local_original_path || undefined,
      ossOriginalKey: row.oss_original_key || undefined,
      ossPreviewKey: row.oss_preview_key || undefined
    });
  }
}

async function loadMessages(stores: Stores) {
  const [rows]: any = await dbPool!.query('SELECT * FROM site_messages ORDER BY created_at DESC');
  stores.messages.splice(0, stores.messages.length, ...rows.map((row: any) => ({
    id: row.id,
    recipientId: row.recipient_id,
    senderName: row.sender_name || undefined,
    type: row.type,
    title: row.title,
    content: row.content,
    link: row.link || undefined,
    isRead: Boolean(row.is_read),
    createdAt: dateValue(row.created_at),
    readAt: row.read_at || undefined,
  })));
}

export async function persistDesignOrder(order: DesignOrder) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO design_orders (
      id, order_no, title, category, platform, budget, platform_commission_rate, designer_payout, deadline, urgency,
      requirements, image_requirement_groups, reference_images, attachment_url, status, publication_status,
      publication_review_comment, publication_reviewed_at, publication_reviewer_id, publication_reviewer_name,
      creator_id, creator_name, organization_id, review_rule_id, review_rule_name, claimed_by_id, claimed_by_name,
      claimed_at, completed_at, task_id, is_disputed, dispute_id, service_assignee_id, service_assignee_name,
      service_claimed_at, service_due_at, service_priority, payment_status, deposit_rate, deposit_amount, deposit_out_trade_no,
      deposit_trade_no, deposit_paid_at, balance_amount, balance_out_trade_no, balance_trade_no, balance_paid_at, created_at, updated_at
    ) VALUES (${Array(49).fill('?').join(',')})
    ON DUPLICATE KEY UPDATE title=VALUES(title), category=VALUES(category), platform=VALUES(platform), budget=VALUES(budget),
      platform_commission_rate=VALUES(platform_commission_rate), designer_payout=VALUES(designer_payout), deadline=VALUES(deadline),
      urgency=VALUES(urgency), requirements=VALUES(requirements), image_requirement_groups=VALUES(image_requirement_groups),
      reference_images=VALUES(reference_images), status=VALUES(status), publication_status=VALUES(publication_status),
      publication_review_comment=VALUES(publication_review_comment), publication_reviewed_at=VALUES(publication_reviewed_at),
      publication_reviewer_id=VALUES(publication_reviewer_id), publication_reviewer_name=VALUES(publication_reviewer_name),
      claimed_by_id=VALUES(claimed_by_id), claimed_by_name=VALUES(claimed_by_name), claimed_at=VALUES(claimed_at),
      completed_at=VALUES(completed_at), task_id=VALUES(task_id), is_disputed=VALUES(is_disputed), dispute_id=VALUES(dispute_id),
      service_assignee_id=VALUES(service_assignee_id), service_assignee_name=VALUES(service_assignee_name), service_claimed_at=VALUES(service_claimed_at),
      service_due_at=VALUES(service_due_at), service_priority=VALUES(service_priority), payment_status=VALUES(payment_status), deposit_rate=VALUES(deposit_rate),
      deposit_amount=VALUES(deposit_amount), deposit_out_trade_no=VALUES(deposit_out_trade_no), deposit_trade_no=VALUES(deposit_trade_no), deposit_paid_at=VALUES(deposit_paid_at),
      balance_amount=VALUES(balance_amount), balance_out_trade_no=VALUES(balance_out_trade_no), balance_trade_no=VALUES(balance_trade_no), balance_paid_at=VALUES(balance_paid_at), updated_at=VALUES(updated_at)`, [
      order.id, order.orderNo, order.title, order.category, order.platform, order.budget, order.platformCommissionRate, order.designerPayout,
      order.deadline, order.urgency, order.requirements, json(order.imageRequirementGroups), json(order.referenceImages), order.attachmentUrl || null,
      order.status, order.publicationStatus || null, order.publicationReviewComment || null, order.publicationReviewedAt || null,
      order.publicationReviewerId || null, order.publicationReviewerName || null, order.creatorId, order.creatorName, order.organizationId || null,
      order.reviewRuleId || null, order.reviewRuleName || null, order.claimedById || null, order.claimedByName || null, order.claimedAt || null,
      order.completedAt || null, order.taskId || null, order.isDisputed ? 1 : 0, order.disputeId || null,
      order.serviceAssigneeId || null, order.serviceAssigneeName || null, order.serviceClaimedAt || null, order.serviceDueAt || null, order.servicePriority || 'normal',
      order.paymentStatus || null, order.depositRate ?? null, order.depositAmount ?? null, order.depositOutTradeNo || null, order.depositTradeNo || null,
      order.depositPaidAt || null, order.balanceAmount ?? null, order.balanceOutTradeNo || null, order.balanceTradeNo || null, order.balancePaidAt || null,
      order.createdAt, order.updatedAt || null
    ]);
  } catch (error) { console.error('[MySQL] 保存设计订单失败:', error); }
}

export async function persistReviewRule(rule: ReviewRule) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO review_rules (id, name, platform, category, reject_limit, review_hours_limit, is_active, organization_id, owner_id, owner_name, payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), platform=VALUES(platform), category=VALUES(category), reject_limit=VALUES(reject_limit), review_hours_limit=VALUES(review_hours_limit), is_active=VALUES(is_active), organization_id=VALUES(organization_id), owner_id=VALUES(owner_id), owner_name=VALUES(owner_name), payload_json=VALUES(payload_json)`, [
      rule.id, rule.name, rule.platform, rule.category || null, rule.rejectLimit, rule.reviewHoursLimit, rule.isActive ? 1 : 0,
      rule.organizationId || null, rule.ownerId || null, rule.ownerName || null, json(rule)
    ]);
    await dbPool.query('DELETE FROM review_rule_levels WHERE rule_id = ?', [rule.id]);
    for (const level of rule.levels || []) {
      await dbPool.query(`INSERT INTO review_rule_levels (id, rule_id, level, reviewer_ids, reviewer_names, approval_mode) VALUES (?,?,?,?,?,?)`, [
        level.id, rule.id, level.level, json(level.reviewerIds), json(level.reviewerNames), level.approvalMode
      ]);
    }
  } catch (error) { console.error('[MySQL] 保存审核流失败:', error); }
}

export async function persistReviewTask(task: ReviewTask) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO review_tasks (id, task_no, product_name, sku, platform, designer_id, designer_name, rule_id, status, current_level, total_images, approved_count, rejected_count, version, urgency, submitted_at, completed_at, order_id, payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status), current_level=VALUES(current_level), total_images=VALUES(total_images), approved_count=VALUES(approved_count), rejected_count=VALUES(rejected_count), version=VALUES(version), urgency=VALUES(urgency), submitted_at=VALUES(submitted_at), completed_at=VALUES(completed_at), order_id=VALUES(order_id), payload_json=VALUES(payload_json)`, [
      task.id, task.taskNo, task.productName, task.sku || null, task.platform, task.designerId, task.designerName, task.ruleId || null, task.status,
      task.currentLevel, task.totalImages, task.approvedCount, task.rejectedCount, task.version, task.urgency, mysqlDate(task.submittedAt), mysqlDate(task.completedAt),
      task.orderId || null, json(task)
    ]);
  } catch (error) { console.error('[MySQL] 保存审核任务失败:', error); }
}

export async function persistDispute(dispute: OrderDispute) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO order_disputes (id, order_id, order_no, initiator_id, initiator_name, initiator_role, respondent_id, respondent_name, reason, description, evidence_urls, status, handler_id, handler_name, service_claimed_at, service_due_at, service_priority, resolution_comment, payload_json, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?, ?,?) ON DUPLICATE KEY UPDATE status=VALUES(status), handler_id=VALUES(handler_id), handler_name=VALUES(handler_name), service_claimed_at=VALUES(service_claimed_at), service_due_at=VALUES(service_due_at), service_priority=VALUES(service_priority), resolution_comment=VALUES(resolution_comment), payload_json=VALUES(payload_json), updated_at=VALUES(updated_at)`, [
      dispute.id, dispute.orderId, dispute.orderNo, dispute.initiatorId, dispute.initiatorName, dispute.initiatorRole, dispute.respondentId || null,
      dispute.respondentName || null, dispute.reason, dispute.description, json(dispute.evidenceUrls), dispute.status, dispute.handlerId || null,
      dispute.handlerName || null, dispute.serviceClaimedAt || null, dispute.serviceDueAt || null, dispute.servicePriority || 'high', dispute.resolutionComment || null, json(dispute), dispute.createdAt, dispute.updatedAt || null
    ]);
  } catch (error) { console.error('[MySQL] 保存纠纷失败:', error); }
}

export async function persistServiceActionLog(log: ServiceActionLog) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO service_action_logs (id, task_type, task_id, action, comment, operator_id, operator_name, created_at)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE comment=VALUES(comment)`, [
      log.id, log.taskType, log.taskId, log.action, log.comment || null, log.operatorId, log.operatorName, log.createdAt
    ]);
  } catch (error) { console.error('[MySQL] 保存客服操作记录失败:', error); }
}

async function loadStores(stores: Stores) {
  const [orderRows]: any = await dbPool!.query('SELECT * FROM design_orders ORDER BY created_at DESC');
  if (orderRows.length > 0) stores.designOrders.splice(0, stores.designOrders.length, ...orderRows.map((row: any) => {
    const budget = Number(row.budget);
    const platformCommissionRate = Number(row.platform_commission_rate);
    const depositRate = row.deposit_rate === null || row.deposit_rate === undefined ? 0.3 : Number(row.deposit_rate);
    const settlement = calculateOrderSettlement(budget, platformCommissionRate, depositRate);
    return {
    id: row.id, orderNo: row.order_no, title: row.title, category: row.category, platform: row.platform,
    budget, platformCommissionRate, designerPayout: settlement.designerPayout,
    deadline: row.deadline, urgency: row.urgency, requirements: row.requirements || '', imageRequirementGroups: parseJson(row.image_requirement_groups, []),
    referenceImages: parseJson(row.reference_images, []), attachmentUrl: row.attachment_url || undefined, status: row.status,
    publicationStatus: row.publication_status || undefined, publicationReviewComment: row.publication_review_comment || undefined,
    publicationReviewedAt: row.publication_reviewed_at || undefined, publicationReviewerId: row.publication_reviewer_id || undefined,
    publicationReviewerName: row.publication_reviewer_name || undefined, serviceAssigneeId: row.service_assignee_id || undefined,
    serviceAssigneeName: row.service_assignee_name || undefined, serviceClaimedAt: row.service_claimed_at || undefined,
    serviceDueAt: row.service_due_at || undefined, servicePriority: row.service_priority || undefined, creatorId: row.creator_id, creatorName: row.creator_name,
    organizationId: row.organization_id || undefined, reviewRuleId: row.review_rule_id || undefined, reviewRuleName: row.review_rule_name || undefined,
    claimedById: row.claimed_by_id || undefined, claimedByName: row.claimed_by_name || undefined, claimedAt: row.claimed_at || undefined,
    completedAt: row.completed_at || undefined, taskId: row.task_id || undefined, isDisputed: Boolean(row.is_disputed), disputeId: row.dispute_id || undefined,
    paymentStatus: row.payment_status || (String(row.id).startsWith('seed_order_') ? 'deposit_paid' : undefined),
    depositRate,
    depositAmount: settlement.depositAmount,
    depositOutTradeNo: row.deposit_out_trade_no || undefined, depositTradeNo: row.deposit_trade_no || undefined, depositPaidAt: row.deposit_paid_at || undefined,
    balanceAmount: settlement.balanceAmount,
    balanceOutTradeNo: row.balance_out_trade_no || undefined, balanceTradeNo: row.balance_trade_no || undefined, balancePaidAt: row.balance_paid_at || undefined,
    createdAt: row.created_at, updatedAt: row.updated_at || undefined
    };
  }));

  const [ruleRows]: any = await dbPool!.query('SELECT * FROM review_rules ORDER BY created_at DESC');
  const [levelRows]: any = await dbPool!.query('SELECT * FROM review_rule_levels ORDER BY level ASC');
  const levelsByRule = new Map<string, any[]>();
  for (const row of levelRows) {
    const levels = levelsByRule.get(row.rule_id) || [];
    levels.push({ id: row.id, ruleId: row.rule_id, level: row.level, reviewerIds: parseJson(row.reviewer_ids, []), reviewerNames: parseJson(row.reviewer_names, []), approvalMode: row.approval_mode === 'all' ? 'all' : 'any' });
    levelsByRule.set(row.rule_id, levels);
  }
  if (ruleRows.length > 0) stores.rules.splice(0, stores.rules.length, ...ruleRows.map((row: any) => parseJson<ReviewRule>(row.payload_json, {
    id: row.id, name: row.name, platform: row.platform, category: row.category || undefined, rejectLimit: row.reject_limit,
    reviewHoursLimit: row.review_hours_limit, isActive: Boolean(row.is_active), levels: levelsByRule.get(row.id) || [], createdAt: dateValue(row.created_at),
    organizationId: row.organization_id || undefined, ownerId: row.owner_id || undefined, ownerName: row.owner_name || undefined
  })));

  const [taskRows]: any = await dbPool!.query('SELECT * FROM review_tasks ORDER BY created_at DESC');
  if (taskRows.length > 0) stores.tasks.splice(0, stores.tasks.length, ...taskRows.map((row: any) => parseJson<ReviewTask>(row.payload_json, {
    id: row.id, taskNo: row.task_no, productName: row.product_name, sku: row.sku || undefined, platform: row.platform,
    designerId: row.designer_id, designerName: row.designer_name, ruleId: row.rule_id || undefined, status: row.status, currentLevel: row.current_level,
    totalImages: row.total_images, approvedCount: row.approved_count, rejectedCount: row.rejected_count, version: row.version, urgency: row.urgency,
    orderId: row.order_id || undefined, createdAt: dateValue(row.created_at)
  })));

  const [disputeRows]: any = await dbPool!.query('SELECT * FROM order_disputes ORDER BY created_at DESC');
  if (disputeRows.length > 0) stores.disputes.splice(0, stores.disputes.length, ...disputeRows.map((row: any) => parseJson<OrderDispute>(row.payload_json, {
    id: row.id, orderId: row.order_id, orderNo: row.order_no, initiatorId: row.initiator_id, initiatorName: row.initiator_name,
    initiatorRole: row.initiator_role, respondentId: row.respondent_id || undefined, respondentName: row.respondent_name || undefined,
    reason: row.reason, description: row.description, evidenceUrls: parseJson(row.evidence_urls, []), status: row.status,
    handlerId: row.handler_id || undefined, handlerName: row.handler_name || undefined, serviceClaimedAt: row.service_claimed_at || undefined,
    serviceDueAt: row.service_due_at || undefined, servicePriority: row.service_priority || undefined, resolutionComment: row.resolution_comment || undefined,
    createdAt: dateValue(row.created_at), updatedAt: row.updated_at || undefined
  })));
}

async function loadServiceLogs(serviceLogs: ServiceActionLog[]) {
  const [rows]: any = await dbPool!.query('SELECT * FROM service_action_logs ORDER BY created_at DESC');
  serviceLogs.splice(0, serviceLogs.length, ...rows.map((row: any) => ({
    id: row.id, taskType: row.task_type, taskId: row.task_id, action: row.action, comment: row.comment || undefined,
    operatorId: row.operator_id, operatorName: row.operator_name, createdAt: dateValue(row.created_at)
  })));
}

export async function initializePersistence(stores: Stores) {
  if (!dbPool) return false;
  try {
    await ensureSchema();
    await refreshSeedOrders(stores);
    const [orderCount]: any = await dbPool.query('SELECT COUNT(*) AS count FROM design_orders');
    if (Number(orderCount[0].count) === 0) for (const order of stores.designOrders) await persistDesignOrder(order);
    const [ruleCount]: any = await dbPool.query('SELECT COUNT(*) AS count FROM review_rules');
    if (Number(ruleCount[0].count) === 0) for (const rule of stores.rules) await persistReviewRule(rule);
    const [taskCount]: any = await dbPool.query('SELECT COUNT(*) AS count FROM review_tasks');
    if (Number(taskCount[0].count) === 0) for (const task of stores.tasks) await persistReviewTask(task);
    const [disputeCount]: any = await dbPool.query('SELECT COUNT(*) AS count FROM order_disputes');
    if (Number(disputeCount[0].count) === 0) for (const dispute of stores.disputes) await persistDispute(dispute);
    const [messageCount]: any = await dbPool.query('SELECT COUNT(*) AS count FROM site_messages');
    if (Number(messageCount[0].count) === 0) for (const message of stores.messages) await persistSiteMessage(message);
    await loadStores(stores);
    await loadServiceLogs(stores.serviceLogs);
    await loadMediaAssets();
    await loadMessages(stores);
    console.log(`✅ MySQL 业务数据已就绪：订单 ${stores.designOrders.length} 条，审核流 ${stores.rules.length} 条，任务 ${stores.tasks.length} 条，纠纷 ${stores.disputes.length} 条，媒体 ${protectedAssets.size} 条，站内信 ${stores.messages.length} 条`);
    return true;
  } catch (error) {
    console.error('⚠️ MySQL 业务数据初始化失败，将继续使用内存数据:', error);
    return false;
  }
}
