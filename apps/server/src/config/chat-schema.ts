import type { Pool } from 'mysql2/promise';

export async function ensureChatSchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_conversations (
    order_id VARCHAR(64) PRIMARY KEY,
    last_seq BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    seq BIGINT UNSIGNED NOT NULL,
    sender_id VARCHAR(64) NOT NULL,
    sender_name VARCHAR(128) NOT NULL,
    client_message_id VARCHAR(64) NOT NULL,
    body TEXT NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    UNIQUE KEY uq_chat_order_seq (order_id, seq),
    UNIQUE KEY uq_chat_sender_client (sender_id, client_message_id),
    KEY idx_chat_order_time (order_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS service_conversation_assignments (
    conversation_type VARCHAR(16) NOT NULL, conversation_id VARCHAR(64) NOT NULL,
    assigned_service_id VARCHAR(64) NOT NULL, assigned_service_name VARCHAR(128) NOT NULL,
    assigned_by_id VARCHAR(64) NOT NULL, assigned_by_name VARCHAR(128) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (conversation_type, conversation_id),
    KEY idx_service_assignment_owner (assigned_service_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS service_conversation_transfers (
    id VARCHAR(64) PRIMARY KEY, conversation_type VARCHAR(16) NOT NULL, conversation_id VARCHAR(64) NOT NULL,
    from_service_id VARCHAR(64) NULL, from_service_name VARCHAR(128) NULL,
    to_service_id VARCHAR(64) NOT NULL, to_service_name VARCHAR(128) NOT NULL,
    transferred_by_id VARCHAR(64) NOT NULL, transferred_by_name VARCHAR(128) NOT NULL,
    note VARCHAR(500) NOT NULL DEFAULT '', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_service_transfer_history (conversation_type, conversation_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
