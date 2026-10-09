import type { Pool } from 'mysql2/promise';

export async function ensureOrderDraftSchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS order_creation_drafts (
    user_id VARCHAR(64) PRIMARY KEY, version INT NOT NULL DEFAULT 0,
    payload_json JSON NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
