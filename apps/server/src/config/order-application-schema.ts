import type { Pool } from 'mysql2/promise';

export async function ensureOrderApplicationSchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS order_applications (
    id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, designer_id VARCHAR(64) NOT NULL,
    designer_name VARCHAR(128) NOT NULL, invitation_id VARCHAR(64), original_budget DECIMAL(12,2) NOT NULL,
    extra_amount DECIMAL(12,2) NOT NULL DEFAULT 0, quoted_total DECIMAL(12,2) NOT NULL,
    message TEXT NOT NULL, portfolio_ids JSON NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
    version INT NOT NULL DEFAULT 1, reviewer_id VARCHAR(64), review_comment TEXT, reviewed_at VARCHAR(64),
    task_id VARCHAR(64), created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL,
    UNIQUE KEY uk_application_designer_order (order_id, designer_id),
    INDEX idx_application_order_status (order_id, status, created_at),
    INDEX idx_application_designer_status (designer_id, status, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const [column, definition] of [
    ['original_budget', 'DECIMAL(12,2)'], ['accepted_application_id', 'VARCHAR(64)'],
    ['agreed_extra_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0'],
  ]) {
    const [rows]: any = await pool.query('SHOW COLUMNS FROM design_orders LIKE ?', [column]);
    if (!rows.length) {
      try { await pool.query(`ALTER TABLE design_orders ADD COLUMN ${column} ${definition}`); }
      catch (error: any) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
  }
  await pool.query('UPDATE design_orders SET original_budget=budget WHERE original_budget IS NULL');
}
