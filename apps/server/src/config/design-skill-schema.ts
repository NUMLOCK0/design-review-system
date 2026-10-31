import type { Pool } from 'mysql2/promise';

export async function ensureDesignSkillSchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS design_skills (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(32) NOT NULL,
    description VARCHAR(500) NOT NULL,
    instructions TEXT NOT NULL,
    completion_criteria TEXT NOT NULL,
    questions JSON NOT NULL,
    version INT NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id VARCHAR(64) NOT NULL,
    created_by_name VARCHAR(128) NOT NULL,
    created_by_role VARCHAR(32) NOT NULL,
    updated_by_name VARCHAR(128) NOT NULL,
    source_name VARCHAR(160) NULL,
    source_url VARCHAR(500) NULL,
    source_license VARCHAR(100) NULL,
    source_note VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_design_skills_category_name (category, name),
    KEY idx_design_skills_enabled_category (is_enabled, category, updated_at),
    KEY idx_design_skills_creator (created_by_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // These columns were added after the initial Skills release. Use information_schema
  // checks so upgrades also work on MySQL versions without ADD COLUMN IF NOT EXISTS.
  const [columns]: any = await pool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='design_skills'`);
  const existing = new Set((columns as Array<{ COLUMN_NAME: string }>).map((column) => column.COLUMN_NAME));
  const additions: Array<[string, string]> = [
    ['source_name', 'VARCHAR(160) NULL'],
    ['source_url', 'VARCHAR(500) NULL'],
    ['source_license', 'VARCHAR(100) NULL'],
    ['source_note', 'VARCHAR(500) NULL'],
  ];
  for (const [name, definition] of additions) {
    if (!existing.has(name)) await pool.query(`ALTER TABLE design_skills ADD COLUMN ${name} ${definition}`);
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS design_skill_recognition_logs (
    id VARCHAR(64) PRIMARY KEY,
    conversation_type VARCHAR(16) NOT NULL,
    conversation_id VARCHAR(64) NOT NULL,
    message_id VARCHAR(64) NOT NULL,
    sender_id VARCHAR(64) NOT NULL,
    message_excerpt VARCHAR(1200) NOT NULL DEFAULT '',
    result_json JSON NULL,
    model VARCHAR(128) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL,
    error_message VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_skill_recognition_message (conversation_type, conversation_id, message_id),
    KEY idx_skill_recognition_conversation (conversation_type, conversation_id, created_at),
    KEY idx_skill_recognition_status (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await pool.query(`CREATE TABLE IF NOT EXISTS design_skill_conversation_memory (
    conversation_type VARCHAR(16) NOT NULL,
    conversation_id VARCHAR(64) NOT NULL,
    context_summary TEXT NOT NULL,
    last_message_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (conversation_type, conversation_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
