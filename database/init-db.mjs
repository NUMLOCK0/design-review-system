import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../apps/server/.env') });

const mysqlUrl = process.env.MYSQL_URL;

if (!mysqlUrl) {
  console.error('未在 .env 中找到 MYSQL_URL 配置！');
  process.exit(1);
}

console.log('正在连接 MySQL 数据库...');

async function initDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection(mysqlUrl);
    console.log('数据库连接成功！开始创建表和初始化数据...');

    // 禁用外键检查以便干净建表
    await connection.query('SET FOREIGN_KEY_CHECKS = 0;');

    // 1. 用户与角色表
    console.log('- 创建 users 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. 审核规则配置表
    console.log('- 创建 review_rules 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_rules (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        platform VARCHAR(32) NOT NULL,
        category VARCHAR(64),
        reject_limit INT NOT NULL DEFAULT 3,
        review_hours_limit INT NOT NULL DEFAULT 48,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. 审核规则层级及审核人员配置
    console.log('- 创建 review_rule_levels 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_rule_levels (
        id VARCHAR(64) PRIMARY KEY,
        rule_id VARCHAR(64) NOT NULL,
        level INT NOT NULL DEFAULT 1,
        reviewer_ids JSON,
        reviewer_names JSON,
        approval_mode VARCHAR(20) NOT NULL DEFAULT 'any',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rule_id (rule_id),
        CONSTRAINT fk_rule_levels_rule FOREIGN KEY (rule_id) REFERENCES review_rules(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. 审核主任务表
    console.log('- 创建 review_tasks 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_tasks (
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
        INDEX idx_designer_id (designer_id),
        INDEX idx_status (status),
        CONSTRAINT fk_tasks_rule FOREIGN KEY (rule_id) REFERENCES review_rules(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. 审核图片分组表
    console.log('- 创建 review_image_groups 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_image_groups (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL,
        group_type VARCHAR(32) NOT NULL,
        required_count INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_id (task_id),
        CONSTRAINT fk_groups_task FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. 审核图片表
    console.log('- 创建 review_images 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_images (
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
        INDEX idx_task_id (task_id),
        INDEX idx_group_id (group_id),
        CONSTRAINT fk_images_group FOREIGN KEY (group_id) REFERENCES review_image_groups(id) ON DELETE CASCADE,
        CONSTRAINT fk_images_task FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. 图片批注与坐标打标表
    console.log('- 创建 review_annotations 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_annotations (
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
        INDEX idx_image_id (image_id),
        INDEX idx_task_id (task_id),
        CONSTRAINT fk_annotations_image FOREIGN KEY (image_id) REFERENCES review_images(id) ON DELETE CASCADE,
        CONSTRAINT fk_annotations_task FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. 审核历史版本与审计记录
    console.log('- 创建 review_history 表...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS review_history (
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
        INDEX idx_image_id (image_id),
        INDEX idx_task_id (task_id),
        CONSTRAINT fk_history_image FOREIGN KEY (image_id) REFERENCES review_images(id) ON DELETE CASCADE,
        CONSTRAINT fk_history_task FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 恢复外键检查
    await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

    // 插入初始化用户数据
    console.log('- 插入种子用户数据...');
    const users = [
      ['u_admin_1', '系统管理员', 'admin@cozi.com', 'admin', '运营管理部'],
      ['u_rev_1', '王总监', 'reviewer@cozi.com', 'reviewer', '视觉设计部'],
      ['u_des_1', '李设计师', 'designer@cozi.com', 'designer', '视觉设计部']
    ];

    for (const u of users) {
      await connection.query(`
        INSERT INTO users (id, name, email, role, department)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), department = VALUES(department);
      `, u);
    }

    console.log('>>> 数据库初始化完成！所有数据表与初始用户已就绪。');

    // 打印当前所有数据表
    const [tables] = await connection.query('SHOW TABLES;');
    console.log('数据库内现有数据表清单:', tables);

  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();
