import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const mysqlUrl = process.env.MYSQL_URL;

if (!mysqlUrl) {
  console.error('❌ 未找到 MYSQL_URL 配置，请检查 apps/server/.env 文件');
  process.exit(1);
}

console.log('🔗 正在连接 MySQL 数据库...');

const ddlStatements = [
  // 1. 用户表
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    email VARCHAR(128) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'designer',
    department VARCHAR(64),
    phone VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_users_phone_role (phone, role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 每个用户只允许一个角色，users.role 和 user_roles.role 保持一致。
  `CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    INDEX idx_user_roles_role (role, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 2. 审核规则配置表
  `CREATE TABLE IF NOT EXISTS review_rules (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    category VARCHAR(64),
    reject_limit INT NOT NULL DEFAULT 3,
    review_hours_limit INT NOT NULL DEFAULT 48,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 3. 审核规则层级配置
  `CREATE TABLE IF NOT EXISTS review_rule_levels (
    id VARCHAR(64) PRIMARY KEY,
    rule_id VARCHAR(64) NOT NULL,
    level INT NOT NULL DEFAULT 1,
    reviewer_ids JSON,
    reviewer_names JSON,
    approval_mode VARCHAR(20) NOT NULL DEFAULT 'any',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES review_rules(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 4. 审核主任务表
  `CREATE TABLE IF NOT EXISTS review_tasks (
    id VARCHAR(64) PRIMARY KEY,
    task_no VARCHAR(64) UNIQUE NOT NULL,
    product_name VARCHAR(256) NOT NULL,
    sku VARCHAR(64),
    platform VARCHAR(32) NOT NULL,
    designer_id VARCHAR(64) NOT NULL,
    designer_name VARCHAR(64) NOT NULL,
    rule_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    current_level INT NOT NULL DEFAULT 1,
    total_images INT NOT NULL DEFAULT 0,
    approved_count INT NOT NULL DEFAULT 0,
    rejected_count INT NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    urgency VARCHAR(20) NOT NULL DEFAULT 'medium',
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES review_rules(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 5. 审核图片分组表
  `CREATE TABLE IF NOT EXISTS review_image_groups (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    group_type VARCHAR(32) NOT NULL,
    required_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 6. 审核图片表
  `CREATE TABLE IF NOT EXISTS review_images (
    id VARCHAR(64) PRIMARY KEY,
    group_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    image_index INT NOT NULL DEFAULT 1,
    width INT,
    height INT,
    design_description TEXT,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    reviewer_id VARCHAR(64),
    reviewer_name VARCHAR(64),
    reject_reasons JSON,
    reject_comment TEXT,
    reviewed_at TIMESTAMP NULL DEFAULT NULL,
    review_level INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES review_image_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 7. 图片批注与坐标打标表
  `CREATE TABLE IF NOT EXISTS review_annotations (
    id VARCHAR(64) PRIMARY KEY,
    image_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'rect',
    x DECIMAL(5, 2) NOT NULL,
    y DECIMAL(5, 2) NOT NULL,
    width DECIMAL(5, 2),
    height DECIMAL(5, 2),
    color VARCHAR(20) NOT NULL DEFAULT '#ef4444',
    comment TEXT NOT NULL,
    creator_id VARCHAR(64) NOT NULL,
    creator_name VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (image_id) REFERENCES review_images(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 8. 审核历史版本与审计记录
  `CREATE TABLE IF NOT EXISTS review_history (
    id VARCHAR(64) PRIMARY KEY,
    image_id VARCHAR(64) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    image_url TEXT NOT NULL,
    design_description TEXT,
    action VARCHAR(32) NOT NULL,
    reviewer_id VARCHAR(64),
    reviewer_name VARCHAR(64),
    reject_reasons JSON,
    reject_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (image_id) REFERENCES review_images(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // 9. 客服资料与二维码配置
  `CREATE TABLE IF NOT EXISTS customer_service_contacts (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    wechat VARCHAR(128) NOT NULL,
    qr_code_url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL,
    INDEX idx_customer_service_contacts_order (enabled, sort_order, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
];

const seedUsers = [
  ['u_admin_1', '系统管理员', 'admin@cozi.com', 'admin', '运营管理部'],
  ['u_rev_1', '王总监', 'reviewer@cozi.com', 'customer_service', '客服与争议处理部']
];

async function main() {
  let connection;
  try {
    if (!mysqlUrl) throw new Error('缺少 MYSQL_URL 环境变量');
    connection = await mysql.createConnection(mysqlUrl);
    console.log('✅ 成功连接至 MySQL 服务器!');

    console.log('📦 开始创建数据表...');
    for (const sql of ddlStatements) {
      await connection.query(sql);
    }
    console.log('✅ 所有数据表已创建或已存在:');
    console.log('   - users (用户与角色表)');
    console.log('   - review_rules (审核规则表)');
    console.log('   - review_rule_levels (审核规则层级表)');
    console.log('   - review_tasks (审核主任务表)');
    console.log('   - review_image_groups (图片分组表)');
    console.log('   - review_images (审核图片表)');
    console.log('   - review_annotations (图片批注标记表)');
    console.log('   - review_history (审核历史与审计表)');

    console.log('🌱 正在插入初始种子数据...');
    for (const user of seedUsers) {
      await connection.execute(
        `INSERT INTO users (id, name, email, role, department) 
         VALUES (?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE name=VALUES(name), department=VALUES(department), role=VALUES(role);`,
        user
      );
      await connection.execute(
        `INSERT INTO user_roles (user_id, role) VALUES (?, ?) ON DUPLICATE KEY UPDATE role=VALUES(role);`,
        [user[0], user[3]]
      );
    }
    console.log('✅ 平台账号初始化完成 (admin, customer_service)');

    const [tables] = await connection.query('SHOW TABLES;');
    console.log('\n📊 数据库现有表清单:');
    console.table(tables);

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main();
