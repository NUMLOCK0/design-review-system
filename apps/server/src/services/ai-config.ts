import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { dbPool } from '../config/database.js';
import { JWT_SECRET } from '../middleware/auth.middleware.js';

export type AiConfigInput = { name: string; baseUrl: string; model: string; apiKey?: string };
type StoredConfig = { id: string; name: string; base_url: string; model: string; api_key_encrypted: string; enabled: boolean; created_at: string; updated_at: string };
export type AiConfigView = { id: string; name: string; baseUrl: string; model: string; keyConfigured: boolean; enabled: boolean; createdAt: string; updatedAt: string };

/** Resolves the OpenAI-compatible chat endpoint from a provider root, /v1 base URL, or explicit endpoint. */
export function openAiChatCompletionsEndpoint(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${/\/v1$/i.test(base) ? base : `${base}/v1`}/chat/completions`;
}

const memoryConfigs = new Map<string, StoredConfig>();
const encryptionKey = createHash('sha256').update(`design-review-ai-config-v1:${process.env.AI_CONFIG_ENCRYPTION_KEY || JWT_SECRET}`).digest();

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decrypt(value: string) {
  try {
    const payload = Buffer.from(value, 'base64');
    if (payload.length < 28) throw new Error('Invalid encrypted API key payload');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    throw Object.assign(new Error('已保存的模型 API Key 无法解密，请在 AI 大模型设置中重新填写并保存该配置。'), {
      status: 503,
      code: 'AI_CONFIG_KEY_UNREADABLE'
    });
  }
}

export async function ensureAiConfigSchema() {
  if (!dbPool) return;
  await dbPool.query(`CREATE TABLE IF NOT EXISTS ai_model_configs (
    id VARCHAR(64) PRIMARY KEY, name VARCHAR(80) NOT NULL, base_url VARCHAR(2048) NOT NULL,
    model VARCHAR(128) NOT NULL, api_key_encrypted TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at VARCHAR(64) NOT NULL, updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  const [tableRows]: any = await dbPool.query(`SELECT TABLE_COLLATION FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_model_configs' LIMIT 1`);
  if (tableRows[0]?.TABLE_COLLATION !== 'utf8mb4_unicode_ci') {
    await dbPool.query('ALTER TABLE ai_model_configs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  }
  const [columns]: any = await dbPool.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_model_configs' AND COLUMN_NAME='enabled' LIMIT 1`);
  if (!columns.length) await dbPool.query('ALTER TABLE ai_model_configs ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE');
  // Keep the legacy table for rollback compatibility; active_id is no longer used to select models.
  await dbPool.query(`CREATE TABLE IF NOT EXISTS ai_config_state (
    id TINYINT PRIMARY KEY, active_id VARCHAR(64) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
  await dbPool.query('INSERT IGNORE INTO ai_config_state (id, active_id) VALUES (1, NULL)');
}

function view(row: StoredConfig): AiConfigView {
  return { id: row.id, name: row.name, baseUrl: row.base_url, model: row.model,
    keyConfigured: canDecrypt(row.api_key_encrypted), enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at };
}

function canDecrypt(value: string) {
  try { return Boolean(decrypt(value)); }
  catch { return false; }
}

export async function listAiConfigs() {
  if (!dbPool) return [...memoryConfigs.values()].map(view);
  const [rows]: any = await dbPool.query('SELECT id,name,base_url,model,api_key_encrypted,enabled,created_at,updated_at FROM ai_model_configs ORDER BY created_at DESC');
  return (rows as StoredConfig[]).map(view);
}

export async function saveAiConfig(input: AiConfigInput, id?: string) {
  const now = new Date().toISOString();
  if (id) {
    if (!dbPool) {
      const existing = memoryConfigs.get(id);
      if (!existing) return null;
      memoryConfigs.set(id, { ...existing, name: input.name, base_url: input.baseUrl, model: input.model,
        api_key_encrypted: input.apiKey ? encrypt(input.apiKey) : existing.api_key_encrypted, updated_at: now });
    } else {
      const [result]: any = await dbPool.query(`UPDATE ai_model_configs SET name=?,base_url=?,model=?,
        api_key_encrypted=COALESCE(?,api_key_encrypted),updated_at=? WHERE id=?`,
        [input.name, input.baseUrl, input.model, input.apiKey ? encrypt(input.apiKey) : null, now, id]);
      if (!result.affectedRows) return null;
    }
  } else {
    id = randomUUID();
    const row: StoredConfig = { id, name: input.name, base_url: input.baseUrl, model: input.model,
      api_key_encrypted: encrypt(input.apiKey!), enabled: true, created_at: now, updated_at: now };
    if (!dbPool) memoryConfigs.set(id, row);
    else await dbPool.query('INSERT INTO ai_model_configs (id,name,base_url,model,api_key_encrypted,enabled,created_at,updated_at) VALUES (?,?,?,?,?,TRUE,?,?)',
      [row.id, row.name, row.base_url, row.model, row.api_key_encrypted, now, now]);
  }
  return (await listAiConfigs()).find((item) => item.id === id) || null;
}

export async function setAiConfigEnabled(id: string, enabled: boolean) {
  const now = new Date().toISOString();
  if (!dbPool) {
    const existing = memoryConfigs.get(id);
    if (!existing) return false;
    memoryConfigs.set(id, { ...existing, enabled, updated_at: now });
    return true;
  }
  const [result]: any = await dbPool.query('UPDATE ai_model_configs SET enabled=?,updated_at=? WHERE id=?', [enabled, now, id]);
  return Boolean(result.affectedRows);
}

export async function deleteAiConfig(id: string) {
  if (!dbPool) return memoryConfigs.delete(id) ? 'deleted' : 'missing';
  const [profiles]: any = await dbPool.query('SELECT id FROM image_studio_model_profiles WHERE ai_config_id=? LIMIT 1', [id]);
  if (profiles[0]) return 'in_use';
  const [result]: any = await dbPool.query('DELETE FROM ai_model_configs WHERE id=?', [id]);
  return result.affectedRows ? 'deleted' : 'missing';
}

/** Compatibility fallback for legacy AI endpoints that do not yet accept an explicit model selection. */
export async function getDefaultEnabledAiConfig() {
  if (!dbPool) {
    const configured = [...memoryConfigs.values()];
    const row = configured.filter((item) => item.enabled).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (row) return { id: row.id, baseUrl: row.base_url, apiKey: decrypt(row.api_key_encrypted), model: row.model };
    if (configured.length) return null;
  } else {
    const [rows]: any = await dbPool.query(`SELECT id,base_url,model,api_key_encrypted FROM ai_model_configs
      WHERE enabled=TRUE ORDER BY created_at DESC LIMIT 1`);
    if (rows[0]) return { id: String(rows[0].id), baseUrl: String(rows[0].base_url), apiKey: decrypt(String(rows[0].api_key_encrypted)), model: String(rows[0].model) };
    const [configured]: any = await dbPool.query('SELECT id FROM ai_model_configs LIMIT 1');
    if (configured.length) return null;
  }
  const baseUrl = String(process.env.AI_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.AI_API_KEY || '').trim();
  const model = String(process.env.AI_MODEL || '').trim();
  return baseUrl && apiKey && model ? { id: null, baseUrl, apiKey, model } : null;
}

/** Kept as an alias for older imports; it now resolves to an enabled config, not a globally active config. */
export const getActiveAiConfig = getDefaultEnabledAiConfig;

/** Server-only lookup used by background jobs. It deliberately permits disabled configs so queued jobs can finish. */
export async function getAiConfigCredentials(id: string) {
  if (!dbPool) {
    const row = memoryConfigs.get(id);
    return row ? { id: row.id, name: row.name, baseUrl: row.base_url, apiKey: decrypt(row.api_key_encrypted), model: row.model } : null;
  }
  const [rows]: any = await dbPool.query('SELECT id,name,base_url,model,api_key_encrypted FROM ai_model_configs WHERE id=? LIMIT 1', [id]);
  const row = rows[0];
  return row ? { id: String(row.id), name: String(row.name), baseUrl: String(row.base_url), apiKey: decrypt(String(row.api_key_encrypted)), model: String(row.model) } : null;
}

/** Explicit per-operation selection. Unlike the worker lookup, disabled configs are rejected. */
export async function getEnabledAiConfigCredentials(id: string) {
  if (!dbPool) {
    const row = memoryConfigs.get(id);
    return row?.enabled ? { id: row.id, name: row.name, baseUrl: row.base_url, apiKey: decrypt(row.api_key_encrypted), model: row.model } : null;
  }
  const [rows]: any = await dbPool.query('SELECT id,name,base_url,model,api_key_encrypted FROM ai_model_configs WHERE id=? AND enabled=TRUE LIMIT 1', [id]);
  const row = rows[0];
  return row ? { id: String(row.id), name: String(row.name), baseUrl: String(row.base_url), apiKey: decrypt(String(row.api_key_encrypted)), model: String(row.model) } : null;
}

/** Resolves an enabled model profile without exposing its underlying API credentials. */
export async function getEnabledAiModelProfileCredentials(id: string, capabilities: Array<'text' | 'vision' | 'image'>) {
  if (!dbPool || !capabilities.length) return null;
  const [rows]: any = await dbPool.query(`SELECT p.id,p.name,p.capability,p.model_override,c.base_url,c.model,c.api_key_encrypted
    FROM image_studio_model_profiles p JOIN ai_model_configs c
      ON c.id COLLATE utf8mb4_unicode_ci=p.ai_config_id COLLATE utf8mb4_unicode_ci AND c.enabled=TRUE
    WHERE p.id=? AND p.enabled=TRUE AND p.protocol='openai-chat' AND p.capability IN (${capabilities.map(() => '?').join(',')}) LIMIT 1`, [id, ...capabilities]);
  const row = rows[0];
  return row ? { id: String(row.id), name: String(row.name), capability: String(row.capability), baseUrl: String(row.base_url),
    apiKey: decrypt(String(row.api_key_encrypted)), model: String(row.model_override || row.model) } : null;
}
