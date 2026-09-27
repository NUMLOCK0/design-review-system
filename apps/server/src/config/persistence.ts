import type { DesignOrder, DesignerWallet, OrderDispute, ReviewRule, ReviewTask, ServiceActionLog, SiteMessage, WithdrawalRequest } from '@design-review/shared';
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
  designerWallets: Record<string, DesignerWallet>;
  withdrawalRequests: WithdrawalRequest[];
};

export type PaymentEventRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  stage: 'deposit' | 'balance';
  paymentType?: string;
  outTradeNo: string;
  tradeNo?: string;
  amount: number;
  status: 'checkout_created' | 'success' | 'failed' | 'duplicate';
  rawPayload?: unknown;
  createdAt: string;
};

export type PendingOssUploadRecord = {
  assetId: string;
  ownerId: string;
  objectKey: string;
  filename: string;
  mimetype: string;
  size: number;
  expiresAt: number;
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

async function normalizeCollations() {
  const tableNames = [
    'users', 'user_roles', 'review_rules', 'review_rule_levels', 'review_tasks',
    'review_image_groups', 'review_images', 'review_annotations', 'review_history',
    'design_orders', 'order_disputes', 'service_action_logs', 'admin_audit_logs', 'system_configs',
    'media_assets', 'site_messages', 'designer_profiles', 'designer_portfolios', 'customer_service_contacts',
    'order_invitations', 'designer_wallets', 'withdrawal_requests', 'payment_events', 'pending_oss_uploads'
  ];
  const [rows]: any = await dbPool!.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tableNames.map(() => '?').join(',')})`,
    tableNames
  );
  for (const row of rows) {
    await dbPool!.query(`ALTER TABLE \`${row.TABLE_NAME}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
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
    deadline VARCHAR(64), urgency VARCHAR(20), requirements TEXT, requires_psd BOOLEAN NOT NULL DEFAULT FALSE,
    image_requirement_groups JSON, reference_images JSON, attachment_url TEXT,
    status VARCHAR(32) NOT NULL, publication_status VARCHAR(32), publication_review_comment TEXT,
    publication_reviewed_at VARCHAR(64), publication_reviewer_id VARCHAR(64), publication_reviewer_name VARCHAR(64),
    creator_id VARCHAR(64) NOT NULL, creator_name VARCHAR(128) NOT NULL, organization_id VARCHAR(64),
    review_rule_id VARCHAR(64), review_rule_name VARCHAR(128), claimed_by_id VARCHAR(64), claimed_by_name VARCHAR(128),
    claimed_at VARCHAR(64), completed_at VARCHAR(64), task_id VARCHAR(64), is_disputed BOOLEAN DEFAULT FALSE,
    dispute_id VARCHAR(64), payment_status VARCHAR(32), deposit_rate DECIMAL(8,4), deposit_amount DECIMAL(12,2),
    deposit_out_trade_no VARCHAR(64), deposit_trade_no VARCHAR(128), deposit_paid_at VARCHAR(64), balance_amount DECIMAL(12,2),
    balance_out_trade_no VARCHAR(64), balance_trade_no VARCHAR(128), balance_paid_at VARCHAR(64),
    deposit_refund_status VARCHAR(24), deposit_refund_trade_no VARCHAR(128), deposit_refunded_at VARCHAR(64),
    created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS order_disputes (
    id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, order_no VARCHAR(64) NOT NULL,
    initiator_id VARCHAR(64) NOT NULL, initiator_name VARCHAR(128) NOT NULL, initiator_role VARCHAR(32) NOT NULL,
    respondent_id VARCHAR(64), respondent_name VARCHAR(128), reason VARCHAR(256) NOT NULL, description TEXT NOT NULL,
    evidence_urls JSON, status VARCHAR(32) NOT NULL, handler_id VARCHAR(64), handler_name VARCHAR(128),
    resolution_comment TEXT, payload_json JSON, created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS payment_events (
    id VARCHAR(96) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, order_no VARCHAR(64) NOT NULL,
    stage VARCHAR(16) NOT NULL, payment_type VARCHAR(32), out_trade_no VARCHAR(128) NOT NULL,
    trade_no VARCHAR(128), amount DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL,
    raw_payload JSON, created_at VARCHAR(64) NOT NULL,
    INDEX idx_payment_events_order (order_id, created_at), INDEX idx_payment_events_out_trade (out_trade_no, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS pending_oss_uploads (
    asset_id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(64) NOT NULL, object_key VARCHAR(512) NOT NULL,
    filename VARCHAR(512) NOT NULL, mimetype VARCHAR(128) NOT NULL, size BIGINT NOT NULL,
    expires_at BIGINT NOT NULL, created_at VARCHAR(64) NOT NULL,
    INDEX idx_pending_oss_expiry (expires_at), INDEX idx_pending_oss_owner (owner_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS service_action_logs (
    id VARCHAR(96) PRIMARY KEY, task_type VARCHAR(32) NOT NULL, task_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL, comment TEXT, operator_id VARCHAR(64) NOT NULL, operator_name VARCHAR(128) NOT NULL,
    created_at VARCHAR(64) NOT NULL, INDEX idx_service_logs_task (task_type, task_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(96) PRIMARY KEY, operator_id VARCHAR(64) NOT NULL, operator_name VARCHAR(128) NOT NULL,
    module VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, target_type VARCHAR(64), target_id VARCHAR(96),
    summary VARCHAR(512) NOT NULL, detail_json JSON, ip_address VARCHAR(64), created_at VARCHAR(64) NOT NULL,
    INDEX idx_admin_audit_created (created_at), INDEX idx_admin_audit_operator (operator_id, created_at),
    INDEX idx_admin_audit_module (module, action, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS system_configs (
    id VARCHAR(64) PRIMARY KEY, payload_json JSON NOT NULL, updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS customer_service_contacts (
    id VARCHAR(64) PRIMARY KEY, name VARCHAR(64) NOT NULL, wechat VARCHAR(128) NOT NULL,
    qr_code_url TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, sort_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL,
    INDEX idx_customer_service_contacts_order (enabled, sort_order, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  await addColumn('design_orders', 'service_assignee_id', 'VARCHAR(64)');
  await addColumn('design_orders', 'service_assignee_name', 'VARCHAR(128)');
  await addColumn('design_orders', 'service_claimed_at', 'VARCHAR(64)');
  await addColumn('design_orders', 'service_due_at', 'VARCHAR(64)');
  await addColumn('design_orders', 'service_priority', "VARCHAR(20) NOT NULL DEFAULT 'normal'");
  await addColumn('design_orders', 'requires_psd', 'BOOLEAN NOT NULL DEFAULT FALSE');
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
  await addColumn('design_orders', 'deposit_refund_status', 'VARCHAR(24)');
  await addColumn('design_orders', 'deposit_refund_trade_no', 'VARCHAR(128)');
  await addColumn('design_orders', 'deposit_refunded_at', 'VARCHAR(64)');
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
    headline VARCHAR(256), bio TEXT, industries JSON, years_experience INT NOT NULL DEFAULT 0,
    public_status VARCHAR(20) NOT NULL DEFAULT 'draft', profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await addColumn('designer_profiles', 'headline', 'VARCHAR(256)');
  await addColumn('designer_profiles', 'bio', 'TEXT');
  await addColumn('designer_profiles', 'industries', 'JSON');
  await addColumn('designer_profiles', 'years_experience', 'INT NOT NULL DEFAULT 0');
  await addColumn('designer_profiles', 'public_status', "VARCHAR(20) NOT NULL DEFAULT 'draft'");
  await addColumn('designer_profiles', 'profile_completed', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS designer_portfolios (
    id VARCHAR(96) PRIMARY KEY, designer_id VARCHAR(64) NOT NULL, title VARCHAR(256) NOT NULL,
    cover_url TEXT NOT NULL, image_urls JSON NOT NULL, category VARCHAR(64), industry VARCHAR(64),
    platform VARCHAR(32), description TEXT, designer_role VARCHAR(256), tags JSON,
    sort_order INT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE, created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64),
    published_at VARCHAR(64), INDEX idx_designer_portfolios_designer (designer_id, status, sort_order)
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
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS designer_wallets (
    designer_id VARCHAR(64) PRIMARY KEY, designer_name VARCHAR(128) NOT NULL,
    available_balance DECIMAL(12,2) NOT NULL DEFAULT 0, pending_settlement DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_earned DECIMAL(12,2) NOT NULL DEFAULT 0, withdrawn_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    bank_account JSON, transactions JSON NOT NULL, updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool!.query(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id VARCHAR(96) PRIMARY KEY, designer_id VARCHAR(64) NOT NULL, designer_name VARCHAR(128) NOT NULL,
    amount DECIMAL(12,2) NOT NULL, bank_account JSON NOT NULL, status VARCHAR(32) NOT NULL,
    created_at VARCHAR(64) NOT NULL, reviewed_at VARCHAR(64), reviewer_id VARCHAR(64), reviewer_name VARCHAR(128),
    review_comment TEXT, updated_at VARCHAR(64), INDEX idx_withdrawal_requests_status (status, created_at),
    INDEX idx_withdrawal_requests_designer (designer_id, status, created_at)
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
  // 兼容旧版初始化脚本，统一字符串字段排序规则，避免 JOIN 时出现 Illegal mix of collations。
  await normalizeCollations();
  // 清理旧版本明确的测试审核流，真实用户会在首次进入审核流时获得自己的默认流。
  await dbPool!.query(`DELETE FROM review_rule_levels WHERE rule_id IN ('rule_001', 'rule_002')`);
  await dbPool!.query(`DELETE FROM review_rules WHERE id IN ('rule_001', 'rule_002')`);
  await dbPool!.query(`UPDATE users SET role = 'customer_service', department = '客服与争议处理部' WHERE role = 'reviewer'`);
  await dbPool!.query(`DELETE FROM site_messages WHERE id IN ('msg_welcome_adv', 'msg_welcome_des')`);
  // 仅清理演示账号的业务资料，账号及其角色关系必须保留。
  await dbPool!.query(`DELETE FROM designer_profiles WHERE user_id IN ('u_des_1', 'u_des_2', 'u_des_3', 'u_des_4', 'u_des_5', 'u_des_6')`);
}

async function clearTestData(stores: Stores) {
  const testOrderCondition = "id LIKE 'seed_order_%' OR id LIKE 'mock_ord_%' OR order_no LIKE 'ORD-DEMO-%' OR id IN ('ord_001', 'ord_002', 'ord_003') OR creator_id IN ('u_adv_1', 'mock_creator_2') OR organization_id = 'org_demo_1'";
  const testTaskCondition = "id = 'task_001' OR id LIKE 'mock_task_%' OR task_no = 'REV-20260905-001' OR task_no LIKE 'REV-DEMO-%' OR order_id LIKE 'seed_order_%' OR order_id LIKE 'mock_ord_%' OR order_id LIKE 'ord_demo_%' OR order_id IN ('ord_001', 'ord_002', 'ord_003') OR designer_id IN ('u_des_1', 'u_des_2', 'u_des_3', 'u_des_4', 'u_des_5', 'u_des_6')";

  stores.designOrders.splice(0, stores.designOrders.length, ...stores.designOrders.filter((order) => !(
    order.id.startsWith('seed_order_') || order.id.startsWith('mock_ord_') || order.orderNo.startsWith('ORD-DEMO-') || ['ord_001', 'ord_002', 'ord_003'].includes(order.id) || ['u_adv_1', 'mock_creator_2'].includes(order.creatorId) || order.organizationId === 'org_demo_1'
  )));
  stores.tasks.splice(0, stores.tasks.length, ...stores.tasks.filter((task) => task.id !== 'task_001' && !task.id.startsWith('mock_task_') && task.taskNo !== 'REV-20260905-001' && !task.taskNo.startsWith('REV-DEMO-') && !task.orderId?.startsWith('seed_order_') && !task.orderId?.startsWith('mock_ord_') && !task.orderId?.startsWith('ord_demo_') && !['ord_001', 'ord_002', 'ord_003'].includes(task.orderId || '') && !['u_des_1', 'u_des_2', 'u_des_3', 'u_des_4', 'u_des_5', 'u_des_6'].includes(task.designerId)));

  await dbPool!.query(`DELETE FROM order_invitations WHERE order_id IN (SELECT id FROM design_orders WHERE ${testOrderCondition})`);
  await dbPool!.query(`DELETE FROM order_disputes WHERE order_id IN (SELECT id FROM design_orders WHERE ${testOrderCondition})`);
  // 直接按测试 ID/前缀匹配，避免不同表的字符集排序规则导致清理失败。
  await dbPool!.query(`DELETE FROM service_action_logs WHERE task_id = 'task_001' OR task_id LIKE 'mock_task_%' OR (task_type = 'order_audit' AND (task_id LIKE 'seed_order_%' OR task_id LIKE 'mock_ord_%' OR task_id LIKE 'ord_demo_%' OR task_id IN ('ord_001', 'ord_002', 'ord_003')))`);
  await dbPool!.query(`DELETE FROM review_tasks WHERE ${testTaskCondition}`);
  await dbPool!.query(`DELETE FROM design_orders WHERE ${testOrderCondition}`);
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

type StoredImageAsset = { id: string; ossOriginalKey?: string };

function stableImageUrl(assetId: string) {
  return `/api/upload/previews/${assetId}`;
}

function normalizeStoredImageUrl(value: string, assetsById: Map<string, StoredImageAsset>, assets: StoredImageAsset[]) {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const protectedMatch = trimmed.match(/\/api\/upload\/(?:assets|previews)\/([^/?#]+)/i);
  if (protectedMatch) {
    const asset = assetsById.get(decodeURIComponent(protectedMatch[1]));
    return asset ? stableImageUrl(asset.id) : value;
  }

  const legacyPreviewMatch = trimmed.match(/\/uploads\/previews\/([^/?#]+)\.webp(?:[?#].*)?$/i);
  if (legacyPreviewMatch) {
    const asset = assetsById.get(decodeURIComponent(legacyPreviewMatch[1]));
    return asset ? stableImageUrl(asset.id) : value;
  }

  const embeddedAssetId = trimmed.match(/(asset_[a-z0-9]+)/i)?.[1];
  if (embeddedAssetId) {
    const asset = assetsById.get(embeddedAssetId);
    if (asset) return stableImageUrl(asset.id);
  }

  let pathname = '';
  try {
    pathname = decodeURIComponent(new URL(trimmed).pathname).replace(/^\/+/, '');
  } catch {
    return value;
  }
  const asset = assets.find((candidate) => {
    const key = candidate.ossOriginalKey?.replace(/^\/+/, '');
    return Boolean(key && (pathname === key || pathname.endsWith(`/${key}`)));
  });
  return asset ? stableImageUrl(asset.id) : value;
}

function normalizeStoredImageValue(value: unknown, assetsById: Map<string, StoredImageAsset>, assets: StoredImageAsset[]): unknown {
  if (typeof value === 'string') return normalizeStoredImageUrl(value, assetsById, assets);
  if (Array.isArray(value)) return value.map((item) => normalizeStoredImageValue(item, assetsById, assets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeStoredImageValue(item, assetsById, assets)]));
  }
  return value;
}

export async function migrateStoredImageUrls() {
  const readRows = async (sql: string) => {
    try {
      return (await dbPool!.query(sql)) as any;
    } catch (error: any) {
      if (error?.code === 'ER_NO_SUCH_TABLE') return [[]] as any;
      throw error;
    }
  };
  const [assetRows]: any = await readRows("SELECT id, kind, oss_original_key FROM media_assets WHERE kind = 'image'");
  const assets: StoredImageAsset[] = (assetRows || []).map((row: any) => ({ id: String(row.id), ossOriginalKey: row.oss_original_key || undefined }));
  if (!assets.length) return 0;
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  let changed = 0;

  const jsonColumns = [
    ['design_orders', 'id', 'image_requirement_groups'],
    ['design_orders', 'id', 'reference_images'],
    ['review_tasks', 'id', 'payload_json'],
    ['order_disputes', 'id', 'evidence_urls'],
    ['order_disputes', 'id', 'payload_json'],
    ['designer_profiles', 'user_id', 'portfolio_urls'],
    ['designer_portfolios', 'id', 'image_urls'],
    ['system_configs', 'id', 'payload_json'],
  ] as const;
  for (const [table, idColumn, column] of jsonColumns) {
    const [rows]: any = await readRows(`SELECT \`${idColumn}\`, \`${column}\` FROM \`${table}\``);
    for (const row of rows || []) {
      const original = row[column];
      if (original === null || original === undefined) continue;
      const parsed = typeof original === 'string' ? parseJson<unknown>(original, original) : original;
      const normalized = normalizeStoredImageValue(parsed, assetsById, assets);
      if (JSON.stringify(normalized) === JSON.stringify(parsed)) continue;
      await dbPool!.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${idColumn}\` = ?`, [JSON.stringify(normalized), row[idColumn]]);
      changed += 1;
    }
  }

  const textColumns = [
    ['users', 'id', 'avatar_url'],
    ['review_images', 'id', 'image_url'],
    ['review_images', 'id', 'thumbnail_url'],
    ['review_history', 'id', 'image_url'],
    ['designer_portfolios', 'id', 'cover_url'],
    ['customer_service_contacts', 'id', 'qr_code_url'],
  ] as const;
  for (const [table, idColumn, column] of textColumns) {
    const [rows]: any = await readRows(`SELECT \`${idColumn}\`, \`${column}\` FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''`);
    for (const row of rows || []) {
      const original = String(row[column]);
      const normalized = normalizeStoredImageUrl(original, assetsById, assets);
      if (normalized === original) continue;
      await dbPool!.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${idColumn}\` = ?`, [normalized, row[idColumn]]);
      changed += 1;
    }
  }

  if (changed) console.log(`✅ 已修复数据库中的 ${changed} 条历史图片地址`);
  return changed;
}

export async function migrateReferenceLinkItems() {
  const [rows]: any = await dbPool!.query('SELECT id, image_requirement_groups FROM design_orders');
  let changed = 0;
  for (const row of rows || []) {
    const groups = parseJson<any[]>(row.image_requirement_groups, []);
    if (!Array.isArray(groups)) continue;
    const normalized = groups.map((group: any) => {
      const imageItems = Array.isArray(group.imageItems) ? group.imageItems.map((item: any, imageIndex: number) => {
        const oldItems = Array.isArray(item.referenceLinkItems) && item.referenceLinkItems.some((reference: any) => reference?.image || reference?.link || reference?.description)
          ? item.referenceLinkItems
          : Array.from({ length: Math.max(item.referenceImages?.length || 0, item.referenceLinks?.length || 0) }, (_, referenceIndex) => ({
              id: `${item.id || `${group.id || row.id}_image_${imageIndex}`}_reference_${referenceIndex}`,
              image: item.referenceImages?.[referenceIndex] || '',
              link: item.referenceLinks?.[referenceIndex] || '',
              description: referenceIndex === 0 ? item.referenceLinkDescription || '' : '',
            }));
        const referenceLinkItems = oldItems
          .map((reference: any, referenceIndex: number) => ({
            id: reference.id || `${item.id || `${group.id || row.id}_image_${imageIndex}`}_reference_${referenceIndex}`,
            image: reference.image || '',
            link: reference.link || '',
            description: reference.description || '',
          }))
          .filter((reference: any) => reference.image || reference.link || reference.description);
        return {
          ...item,
          referenceLinkItems,
          referenceImages: referenceLinkItems.map((reference: any) => reference.image).filter(Boolean),
          referenceLinks: referenceLinkItems.map((reference: any) => reference.link).filter(Boolean),
        };
      }) : [];
      return {
        ...group,
        imageItems,
        referenceImages: imageItems.flatMap((item: any) => item.referenceImages || []),
        referenceLinks: imageItems.flatMap((item: any) => item.referenceLinks || []),
      };
    });
    if (JSON.stringify(normalized) === JSON.stringify(groups)) continue;
    await dbPool!.query('UPDATE design_orders SET image_requirement_groups=? WHERE id=?', [JSON.stringify(normalized), row.id]);
    changed += 1;
  }
  return changed;
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
      requirements, requires_psd, image_requirement_groups, reference_images, attachment_url, status, publication_status,
      publication_review_comment, publication_reviewed_at, publication_reviewer_id, publication_reviewer_name,
      creator_id, creator_name, organization_id, review_rule_id, review_rule_name, claimed_by_id, claimed_by_name,
      claimed_at, completed_at, task_id, is_disputed, dispute_id, service_assignee_id, service_assignee_name,
      service_claimed_at, service_due_at, service_priority, payment_status, deposit_rate, deposit_amount, deposit_out_trade_no,
      deposit_trade_no, deposit_paid_at, balance_amount, balance_out_trade_no, balance_trade_no, balance_paid_at,
      deposit_refund_status, deposit_refund_trade_no, deposit_refunded_at, created_at, updated_at
    ) VALUES (${Array(53).fill('?').join(',')})
    ON DUPLICATE KEY UPDATE title=VALUES(title), category=VALUES(category), platform=VALUES(platform), budget=VALUES(budget),
      platform_commission_rate=VALUES(platform_commission_rate), designer_payout=VALUES(designer_payout), deadline=VALUES(deadline),
      urgency=VALUES(urgency), requirements=VALUES(requirements), requires_psd=VALUES(requires_psd), image_requirement_groups=VALUES(image_requirement_groups),
      reference_images=VALUES(reference_images), status=VALUES(status), publication_status=VALUES(publication_status),
      publication_review_comment=VALUES(publication_review_comment), publication_reviewed_at=VALUES(publication_reviewed_at),
      publication_reviewer_id=VALUES(publication_reviewer_id), publication_reviewer_name=VALUES(publication_reviewer_name),
      claimed_by_id=VALUES(claimed_by_id), claimed_by_name=VALUES(claimed_by_name), claimed_at=VALUES(claimed_at),
      completed_at=VALUES(completed_at), task_id=VALUES(task_id), is_disputed=VALUES(is_disputed), dispute_id=VALUES(dispute_id),
      service_assignee_id=VALUES(service_assignee_id), service_assignee_name=VALUES(service_assignee_name), service_claimed_at=VALUES(service_claimed_at),
      service_due_at=VALUES(service_due_at), service_priority=VALUES(service_priority), payment_status=VALUES(payment_status), deposit_rate=VALUES(deposit_rate),
      deposit_amount=VALUES(deposit_amount), deposit_out_trade_no=VALUES(deposit_out_trade_no), deposit_trade_no=VALUES(deposit_trade_no), deposit_paid_at=VALUES(deposit_paid_at),
      balance_amount=VALUES(balance_amount), balance_out_trade_no=VALUES(balance_out_trade_no), balance_trade_no=VALUES(balance_trade_no), balance_paid_at=VALUES(balance_paid_at),
      deposit_refund_status=VALUES(deposit_refund_status), deposit_refund_trade_no=VALUES(deposit_refund_trade_no), deposit_refunded_at=VALUES(deposit_refunded_at), updated_at=VALUES(updated_at)`, [
      order.id, order.orderNo, order.title, order.category, order.platform, order.budget, order.platformCommissionRate, order.designerPayout,
      order.deadline, order.urgency, order.requirements, order.requiresPsd ? 1 : 0, json(order.imageRequirementGroups), json(order.referenceImages), order.attachmentUrl || null,
      order.status, order.publicationStatus || null, order.publicationReviewComment || null, order.publicationReviewedAt || null,
      order.publicationReviewerId || null, order.publicationReviewerName || null, order.creatorId, order.creatorName, order.organizationId || null,
      order.reviewRuleId || null, order.reviewRuleName || null, order.claimedById || null, order.claimedByName || null, order.claimedAt || null,
      order.completedAt || null, order.taskId || null, order.isDisputed ? 1 : 0, order.disputeId || null,
      order.serviceAssigneeId || null, order.serviceAssigneeName || null, order.serviceClaimedAt || null, order.serviceDueAt || null, order.servicePriority || 'normal',
      order.paymentStatus || null, order.depositRate ?? null, order.depositAmount ?? null, order.depositOutTradeNo || null, order.depositTradeNo || null,
      order.depositPaidAt || null, order.balanceAmount ?? null, order.balanceOutTradeNo || null, order.balanceTradeNo || null, order.balancePaidAt || null,
      order.depositRefundStatus || null, order.depositRefundTradeNo || null, order.depositRefundedAt || null,
      order.createdAt, order.updatedAt || null
    ]);
  } catch (error) { console.error('[MySQL] 保存设计订单失败:', error); }
}

export async function persistPaymentEvent(event: PaymentEventRecord) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO payment_events
      (id, order_id, order_no, stage, payment_type, out_trade_no, trade_no, amount, status, raw_payload, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
      event.id, event.orderId, event.orderNo, event.stage, event.paymentType || null, event.outTradeNo,
      event.tradeNo || null, event.amount, event.status, json(event.rawPayload), event.createdAt
    ]);
  } catch (error) {
    console.error('[MySQL] 保存支付事件失败:', error);
  }
}

export async function persistPendingOssUpload(upload: PendingOssUploadRecord) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO pending_oss_uploads (asset_id, owner_id, object_key, filename, mimetype, size, expires_at, created_at)
      VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id), object_key=VALUES(object_key), filename=VALUES(filename), mimetype=VALUES(mimetype), size=VALUES(size), expires_at=VALUES(expires_at)`, [
      upload.assetId, upload.ownerId, upload.objectKey, upload.filename, upload.mimetype, upload.size, upload.expiresAt, new Date().toISOString()
    ]);
  } catch (error) {
    console.error('[MySQL] 保存 OSS 上传任务失败:', error);
    throw error;
  }
}

export async function findPendingOssUpload(assetId: string): Promise<PendingOssUploadRecord | undefined> {
  if (!dbPool) return undefined;
  const [rows]: any = await dbPool.query('SELECT asset_id, owner_id, object_key, filename, mimetype, size, expires_at FROM pending_oss_uploads WHERE asset_id=? LIMIT 1', [assetId]);
  const row = rows?.[0];
  if (!row) return undefined;
  return { assetId: row.asset_id, ownerId: row.owner_id, objectKey: row.object_key, filename: row.filename, mimetype: row.mimetype, size: Number(row.size), expiresAt: Number(row.expires_at) };
}

export async function removePendingOssUpload(assetId: string) {
  if (!dbPool) return;
  await dbPool.query('DELETE FROM pending_oss_uploads WHERE asset_id=?', [assetId]);
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

export async function persistDesignerWallet(wallet: DesignerWallet) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO designer_wallets
      (designer_id, designer_name, available_balance, pending_settlement, total_earned, withdrawn_amount, bank_account, transactions, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE designer_name=VALUES(designer_name), available_balance=VALUES(available_balance),
      pending_settlement=VALUES(pending_settlement), total_earned=VALUES(total_earned), withdrawn_amount=VALUES(withdrawn_amount),
      bank_account=VALUES(bank_account), transactions=VALUES(transactions), updated_at=VALUES(updated_at)`, [
      wallet.designerId, wallet.designerName, wallet.availableBalance, wallet.pendingSettlement, wallet.totalEarned,
      wallet.withdrawnAmount, json(wallet.bankAccount), json(wallet.transactions || []), new Date().toISOString()
    ]);
  } catch (error) { console.error('[MySQL] 保存设计师钱包失败:', error); }
}

export async function persistWithdrawalRequest(request: WithdrawalRequest) {
  if (!dbPool) return;
  try {
    await dbPool.query(`INSERT INTO withdrawal_requests
      (id, designer_id, designer_name, amount, bank_account, status, created_at, reviewed_at, reviewer_id, reviewer_name, review_comment, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE designer_name=VALUES(designer_name), amount=VALUES(amount), bank_account=VALUES(bank_account),
      status=VALUES(status), reviewed_at=VALUES(reviewed_at), reviewer_id=VALUES(reviewer_id), reviewer_name=VALUES(reviewer_name),
      review_comment=VALUES(review_comment), updated_at=VALUES(updated_at)`, [
      request.id, request.designerId, request.designerName, request.amount, json(request.bankAccount), request.status, request.createdAt,
      request.reviewedAt || null, request.reviewerId || null, request.reviewerName || null, request.reviewComment || null, new Date().toISOString()
    ]);
  } catch (error) { console.error('[MySQL] 保存提现申请失败:', error); }
}

async function loadStores(stores: Stores) {
  const [orderRows]: any = await dbPool!.query('SELECT * FROM design_orders ORDER BY created_at DESC');
  stores.designOrders.splice(0, stores.designOrders.length, ...orderRows.map((row: any) => {
    const budget = Number(row.budget);
    const platformCommissionRate = Number(row.platform_commission_rate);
    const depositRate = row.deposit_rate === null || row.deposit_rate === undefined ? 0.3 : Number(row.deposit_rate);
    const settlement = calculateOrderSettlement(budget, platformCommissionRate, depositRate);
    return {
    id: row.id, orderNo: row.order_no, title: row.title, category: row.category, platform: row.platform,
    budget, platformCommissionRate, designerPayout: settlement.designerPayout,
    deadline: row.deadline, urgency: row.urgency, requirements: row.requirements || '', requiresPsd: Boolean(row.requires_psd), imageRequirementGroups: parseJson(row.image_requirement_groups, []),
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
    depositRefundStatus: row.deposit_refund_status || undefined, depositRefundTradeNo: row.deposit_refund_trade_no || undefined, depositRefundedAt: row.deposit_refunded_at || undefined,
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
  stores.rules.splice(0, stores.rules.length, ...ruleRows.map((row: any) => parseJson<ReviewRule>(row.payload_json, {
    id: row.id, name: row.name, platform: row.platform, category: row.category || undefined, rejectLimit: row.reject_limit,
    reviewHoursLimit: row.review_hours_limit, isActive: Boolean(row.is_active), levels: levelsByRule.get(row.id) || [], createdAt: dateValue(row.created_at),
    organizationId: row.organization_id || undefined, ownerId: row.owner_id || undefined, ownerName: row.owner_name || undefined
  })));

  const [taskRows]: any = await dbPool!.query('SELECT * FROM review_tasks ORDER BY created_at DESC');
  stores.tasks.splice(0, stores.tasks.length, ...taskRows.map((row: any) => parseJson<ReviewTask>(row.payload_json, {
    id: row.id, taskNo: row.task_no, productName: row.product_name, sku: row.sku || undefined, platform: row.platform,
    designerId: row.designer_id, designerName: row.designer_name, ruleId: row.rule_id || undefined, status: row.status, currentLevel: row.current_level,
    totalImages: row.total_images, approvedCount: row.approved_count, rejectedCount: row.rejected_count, version: row.version, urgency: row.urgency,
    orderId: row.order_id || undefined, createdAt: dateValue(row.created_at)
  })));

  const [disputeRows]: any = await dbPool!.query('SELECT * FROM order_disputes ORDER BY created_at DESC');
  stores.disputes.splice(0, stores.disputes.length, ...disputeRows.map((row: any) => parseJson<OrderDispute>(row.payload_json, {
    id: row.id, orderId: row.order_id, orderNo: row.order_no, initiatorId: row.initiator_id, initiatorName: row.initiator_name,
    initiatorRole: row.initiator_role, respondentId: row.respondent_id || undefined, respondentName: row.respondent_name || undefined,
    reason: row.reason, description: row.description, evidenceUrls: parseJson(row.evidence_urls, []), status: row.status,
    handlerId: row.handler_id || undefined, handlerName: row.handler_name || undefined, serviceClaimedAt: row.service_claimed_at || undefined,
    serviceDueAt: row.service_due_at || undefined, servicePriority: row.service_priority || undefined, resolutionComment: row.resolution_comment || undefined,
    createdAt: dateValue(row.created_at), updatedAt: row.updated_at || undefined
  })));
}

// MySQL 是生产环境的唯一数据源；路由仍复用现有数组对象，但每次请求前都会刷新其内容。
export async function refreshPersistence(stores: Stores) {
  if (!dbPool) return false;
  try {
    await loadStores(stores);
    await loadServiceLogs(stores.serviceLogs);
    await loadMediaAssets();
    await loadMessages(stores);
    await loadWallets(stores);
  } catch (error: any) {
    if (error?.code !== 'ECONNRESET') throw error;
    console.warn('[MySQL] 连接被重置，刷新业务数据将重试一次');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await loadStores(stores);
    await loadServiceLogs(stores.serviceLogs);
    await loadMediaAssets();
    await loadMessages(stores);
    await loadWallets(stores);
  }
  return true;
}

async function loadServiceLogs(serviceLogs: ServiceActionLog[]) {
  const [rows]: any = await dbPool!.query('SELECT * FROM service_action_logs ORDER BY created_at DESC');
  serviceLogs.splice(0, serviceLogs.length, ...rows.map((row: any) => ({
    id: row.id, taskType: row.task_type, taskId: row.task_id, action: row.action, comment: row.comment || undefined,
    operatorId: row.operator_id, operatorName: row.operator_name, createdAt: dateValue(row.created_at)
  })));
}

async function loadWallets(stores: Pick<Stores, 'designerWallets' | 'withdrawalRequests'>) {
  const [walletRows]: any = await dbPool!.query('SELECT * FROM designer_wallets ORDER BY updated_at DESC');
  Object.keys(stores.designerWallets).forEach((id) => delete stores.designerWallets[id]);
  for (const row of walletRows) {
    stores.designerWallets[row.designer_id] = {
      designerId: row.designer_id,
      designerName: row.designer_name,
      availableBalance: Number(row.available_balance),
      pendingSettlement: Number(row.pending_settlement),
      totalEarned: Number(row.total_earned),
      withdrawnAmount: Number(row.withdrawn_amount),
      bankAccount: parseJson(row.bank_account, undefined),
      transactions: parseJson(row.transactions, []),
      withdrawalRequests: [],
    };
  }
  const [requestRows]: any = await dbPool!.query('SELECT * FROM withdrawal_requests ORDER BY created_at DESC');
  stores.withdrawalRequests.splice(0, stores.withdrawalRequests.length, ...requestRows.map((row: any) => ({
    id: row.id,
    designerId: row.designer_id,
    designerName: row.designer_name,
    amount: Number(row.amount),
    bankAccount: parseJson(row.bank_account, { bankName: '', accountNo: '', holderName: '' }),
    status: row.status,
    createdAt: dateValue(row.created_at),
    reviewedAt: row.reviewed_at || undefined,
    reviewerId: row.reviewer_id || undefined,
    reviewerName: row.reviewer_name || undefined,
    reviewComment: row.review_comment || undefined,
  })));
  for (const request of stores.withdrawalRequests) {
    const wallet = stores.designerWallets[request.designerId];
    if (wallet) wallet.withdrawalRequests = [ ...(wallet.withdrawalRequests || []), request ];
  }
}

export async function initializePersistence(stores: Stores) {
  if (!dbPool) {
    if (process.env.NODE_ENV === 'production') throw new Error('生产环境必须配置 MYSQL_URL，禁止使用内存数据模式');
    return false;
  }
  try {
    await ensureSchema();
    await clearTestData(stores);
    await migrateStoredImageUrls();
    await migrateReferenceLinkItems();
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
    await refreshPersistence(stores);
    console.log(`✅ MySQL 业务数据已就绪：订单 ${stores.designOrders.length} 条，审核流 ${stores.rules.length} 条，任务 ${stores.tasks.length} 条，纠纷 ${stores.disputes.length} 条，媒体 ${protectedAssets.size} 条，站内信 ${stores.messages.length} 条`);
    return true;
  } catch (error) {
    console.error('⚠️ MySQL 业务数据初始化失败:', error);
    if (process.env.NODE_ENV === 'production') throw error;
    console.warn('⚠️ 当前为开发环境，将继续使用内存数据');
    return false;
  }
}
