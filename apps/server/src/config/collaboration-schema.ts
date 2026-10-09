import type { Pool } from 'mysql2/promise';

export async function ensureCollaborationSchema(pool: Pool) {
  const definitions = [
    `CREATE TABLE IF NOT EXISTS collaboration_forms (
      id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, payload_json JSON NOT NULL,
      created_at VARCHAR(32) NOT NULL, KEY idx_collab_forms_order (order_id)
    )`,
    `CREATE TABLE IF NOT EXISTS collaboration_submissions (
      id VARCHAR(64) PRIMARY KEY, form_id VARCHAR(64) NOT NULL, revision INT NOT NULL,
      payload_json JSON NOT NULL, UNIQUE KEY uq_collab_submission (form_id, revision)
    )`,
    `CREATE TABLE IF NOT EXISTS collaboration_candidates (
      id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, payload_json JSON NOT NULL,
      created_at VARCHAR(32) NOT NULL, KEY idx_collab_candidates_order (order_id)
    )`,
    `CREATE TABLE IF NOT EXISTS requirement_versions (
      id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, version INT NOT NULL,
      candidate_id VARCHAR(64) NOT NULL, payload_json JSON NOT NULL,
      UNIQUE KEY uq_requirement_version (order_id, version), UNIQUE KEY uq_requirement_candidate (candidate_id)
    )`,
    `CREATE TABLE IF NOT EXISTS collaboration_executions (
      requirement_version_id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL,
      task_id VARCHAR(64) NOT NULL, started_at VARCHAR(32) NOT NULL, KEY idx_collab_execution_order (order_id)
    )`,
    `CREATE TABLE IF NOT EXISTS collaboration_commands (
      order_id VARCHAR(64) NOT NULL, actor_id VARCHAR(64) NOT NULL, command_key VARCHAR(64) NOT NULL,
      request_hash VARCHAR(64) NOT NULL, result_json JSON NOT NULL,
      PRIMARY KEY (order_id, actor_id, command_key)
    )`,
    `CREATE TABLE IF NOT EXISTS design_workflow_plans (
      requirement_version_id VARCHAR(64) NOT NULL, revision INT NOT NULL,
      payload_json JSON NOT NULL, created_by VARCHAR(64) NOT NULL, created_at VARCHAR(32) NOT NULL,
      PRIMARY KEY (requirement_version_id, revision)
    )`,
    `CREATE TABLE IF NOT EXISTS collaboration_outbox (
      id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) NOT NULL, message_json JSON NOT NULL,
      recipients_json JSON NOT NULL, dispatched_at DATETIME(3) NULL,
      KEY idx_collab_outbox_pending (dispatched_at)
    )`,
  ];
  for (const sql of definitions) await pool.query(`${sql} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
