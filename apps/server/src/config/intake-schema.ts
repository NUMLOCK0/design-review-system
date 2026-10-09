import type { Pool } from 'mysql2/promise';

export async function ensureIntakeSchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS intake_sessions (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    creator_id VARCHAR(64) NOT NULL,
    creator_name VARCHAR(128) NOT NULL,
    guest_id VARCHAR(64) NULL,
    guest_name VARCHAR(128) NULL,
    invite_hash CHAR(64) NULL,
    invite_expires_at DATETIME(3) NULL,
    last_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_intake_creator (creator_id, updated_at),
    KEY idx_intake_guest (guest_id, updated_at),
    UNIQUE KEY uk_intake_invite (invite_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS intake_messages (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    seq BIGINT UNSIGNED NOT NULL,
    sender_id VARCHAR(64) NOT NULL,
    sender_name VARCHAR(128) NOT NULL,
    client_message_id VARCHAR(64) NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_intake_seq (session_id, seq),
    UNIQUE KEY uk_intake_sender_client (sender_id, client_message_id),
    KEY idx_intake_messages_session (session_id, seq)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS wechat_mini_identities (
    app_id VARCHAR(64) NOT NULL,
    open_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (app_id, open_id),
    UNIQUE KEY uk_wechat_mini_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
