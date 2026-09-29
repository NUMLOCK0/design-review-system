import type { Pool } from 'mysql2/promise';

export async function ensureOrderEvaluationSchema(pool: Pool) {
  // Persistent activation time keeps previously accepted orders outside the new review window.
  await pool.query(`CREATE TABLE IF NOT EXISTS order_evaluation_config (
    id INT PRIMARY KEY, activated_at BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query('INSERT IGNORE INTO order_evaluation_config (id, activated_at) VALUES (1, ?)', [Date.now()]);
  await pool.query(`CREATE TABLE IF NOT EXISTS order_evaluation_sessions (
    order_id VARCHAR(64) PRIMARY KEY, advertiser_id VARCHAR(64) NOT NULL, designer_id VARCHAR(64) NOT NULL,
    category VARCHAR(64) NOT NULL, started_at BIGINT NOT NULL, deadline_at BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open', paused_at BIGINT, remaining_ms BIGINT,
    published_at BIGINT, reputation_eligible BOOLEAN NOT NULL DEFAULT TRUE,
    INDEX idx_evaluation_due (status, deadline_at), INDEX idx_evaluation_brand (advertiser_id),
    INDEX idx_evaluation_designer (designer_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS order_evaluations (
    id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, direction VARCHAR(32) NOT NULL,
    author_id VARCHAR(64) NOT NULL, author_name VARCHAR(128) NOT NULL, target_id VARCHAR(64) NOT NULL,
    score TINYINT UNSIGNED NOT NULL, tags JSON NOT NULL, comment TEXT NOT NULL,
    visibility VARCHAR(16) NOT NULL DEFAULT 'visible', created_at BIGINT NOT NULL,
    reply TEXT, replied_at BIGINT,
    UNIQUE KEY uk_evaluation_direction (order_id, direction), INDEX idx_evaluation_target (target_id, created_at),
    INDEX idx_evaluation_author (author_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS order_evaluation_reports (
    id VARCHAR(64) PRIMARY KEY, evaluation_id VARCHAR(64) NOT NULL, reporter_id VARCHAR(64) NOT NULL,
    reporter_name VARCHAR(128) NOT NULL, reason VARCHAR(128) NOT NULL, description TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'open', decision VARCHAR(16), resolution TEXT,
    handler_id VARCHAR(64), created_at BIGINT NOT NULL, resolved_at BIGINT,
    UNIQUE KEY uk_evaluation_reporter (evaluation_id, reporter_id), INDEX idx_report_status (status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const table of ['order_evaluation_sessions', 'order_evaluations', 'order_evaluation_reports']) {
    const [rows]: any = await pool.query('SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
    if (rows[0]?.TABLE_COLLATION !== 'utf8mb4_unicode_ci') {
      await pool.query(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
  }
}
