import { randomUUID } from 'node:crypto';
import { dbPool } from '../config/database.js';

export type AiCallMeta = {
  source: string;
  operation: string;
  model?: string;
  configId?: string | null;
  profileId?: string | null;
  referenceId?: string | null;
  apiKey?: string;
};

type AiCallLog = {
  id: string; source: string; operation: string; model: string; configId: string | null;
  profileId: string | null; referenceId: string | null; providerHost: string; status: 'success' | 'error';
  httpStatus: number | null; durationMs: number; errorCode: string | null; errorMessage: string | null; createdAt: string;
};

const memoryLogs: AiCallLog[] = [];

export function sanitizeAiError(value: unknown, apiKey?: string): string {
  let message = typeof value === 'string' ? value : value instanceof Error ? value.message : String(value ?? '');
  if (apiKey) message = message.replaceAll(apiKey, '[已隐藏凭证]');
  return message
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [已隐藏凭证]')
    .replace(/(?:sk|key|token)[-_][A-Za-z0-9_-]{8,}/gi, '[已隐藏凭证]')
    .replace(/((?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?)[^&\s"',}]+/gi, '$1[已隐藏凭证]')
    .replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/gi, '[已隐藏图片]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[已隐藏地址]')
    .replace(/[A-Za-z0-9+/=_-]{64,}/g, '[已隐藏长文本]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

export async function ensureAiCallLogSchema() {
  if (!dbPool) return;
  await dbPool.query(`CREATE TABLE IF NOT EXISTS ai_call_logs (
    id VARCHAR(64) PRIMARY KEY, source VARCHAR(48) NOT NULL, operation VARCHAR(80) NOT NULL,
    model VARCHAR(128) NOT NULL DEFAULT '', config_id VARCHAR(64) NULL, profile_id VARCHAR(64) NULL,
    reference_id VARCHAR(96) NULL, provider_host VARCHAR(255) NOT NULL DEFAULT '',
    status VARCHAR(12) NOT NULL, http_status SMALLINT UNSIGNED NULL, duration_ms INT UNSIGNED NOT NULL,
    error_code VARCHAR(80) NULL, error_message VARCHAR(500) NULL, created_at DATETIME(3) NOT NULL,
    INDEX idx_ai_call_created (created_at), INDEX idx_ai_call_status_created (status, created_at),
    INDEX idx_ai_call_source_created (source, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function recordAiCall(log: AiCallLog) {
  if (!dbPool) { memoryLogs.unshift(log); memoryLogs.length = Math.min(memoryLogs.length, 1000); return; }
  await dbPool.query(`INSERT INTO ai_call_logs
    (id,source,operation,model,config_id,profile_id,reference_id,provider_host,status,http_status,duration_ms,error_code,error_message,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [log.id, log.source, log.operation, log.model, log.configId, log.profileId,
    log.referenceId, log.providerHost, log.status, log.httpStatus, log.durationMs, log.errorCode, log.errorMessage, new Date(log.createdAt)]);
}

function providerError(data: any): string {
  const value = data?.error?.message ?? data?.message ?? data?.msg ?? data?.error_description;
  return typeof value === 'string' ? value : typeof data?.error === 'string' ? data.error : '';
}

export function aiResponseError(httpStatus: number, data: any): { code: string; message: string } | null {
  if (httpStatus < 200 || httpStatus >= 300) return {
    code: String(data?.error?.code || `HTTP_${httpStatus}`),
    message: providerError(data) || `上游返回 HTTP ${httpStatus}`,
  };
  if (httpStatus === 204 && data === null) return null;
  if (!data || typeof data !== 'object') return { code: 'UPSTREAM_INVALID_RESPONSE', message: `上游返回格式无效（HTTP ${httpStatus}）` };
  const state = String(data.state || data.status || '').toLowerCase();
  if (data.error || data.success === false || ['failed', 'failure', 'error', 'rejected', 'cancelled', 'canceled'].includes(state)) return {
    code: String(data?.error?.code || 'UPSTREAM_REPORTED_ERROR'),
    message: providerError(data) || '上游接口返回失败状态',
  };
  return null;
}

function safeHost(url: string) { try { return new URL(url).host.slice(0, 255); } catch { return ''; } }

/** Log the upstream result without persisting request bodies, successful responses, or credentials. */
export async function fetchAiJson(url: string, init: RequestInit, timeoutMs: number, meta: AiCallMeta): Promise<{ response: Response; data: any }> {
  const started = Date.now();
  let httpStatus: number | null = null;
  let recorded = false;
  const write = async (status: 'success' | 'error', errorCode?: string, errorMessage?: unknown) => {
    if (recorded) return;
    recorded = true;
    const log: AiCallLog = { id: randomUUID(), source: meta.source.slice(0, 48), operation: meta.operation.slice(0, 80),
      model: String(meta.model || '').slice(0, 128), configId: meta.configId || null, profileId: meta.profileId || null,
      referenceId: meta.referenceId || null, providerHost: safeHost(url), status, httpStatus,
      durationMs: Math.max(0, Date.now() - started), errorCode: errorCode ? sanitizeAiError(errorCode, meta.apiKey).slice(0, 80) : null,
      errorMessage: status === 'error' ? sanitizeAiError(errorMessage || '上游请求失败', meta.apiKey) : null, createdAt: new Date().toISOString() };
    await recordAiCall(log).catch((error: any) => console.warn('[ai-call-log] write failed:', error?.code || 'unknown'));
  };
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    httpStatus = response.status;
    const text = await response.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* Invalid JSON is recorded below. */ }
    const upstreamError = aiResponseError(response.status, data);
    if (upstreamError && data === null && !response.ok && text.trim()) {
      upstreamError.message = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) || upstreamError.message;
    }
    if (upstreamError) await write('error', upstreamError.code, upstreamError.message);
    else await write('success');
    return { response, data };
  } catch (error: any) {
    await write('error', error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : error?.code || 'UPSTREAM_NETWORK_ERROR', error);
    throw error;
  }
}

export async function listAiCallLogs(input: { page: number; pageSize: number; status?: 'success' | 'error'; source?: string }) {
  const offset = (input.page - 1) * input.pageSize;
  if (!dbPool) {
    const filtered = memoryLogs.filter(log => (!input.status || log.status === input.status) && (!input.source || log.source === input.source));
    return { logs: filtered.slice(offset, offset + input.pageSize), total: filtered.length };
  }
  const where: string[] = []; const params: unknown[] = [];
  if (input.status) { where.push('status=?'); params.push(input.status); }
  if (input.source) { where.push('source=?'); params.push(input.source); }
  const condition = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const [countRows]: any = await dbPool.query(`SELECT COUNT(*) AS total FROM ai_call_logs${condition}`, params);
  const [rows]: any = await dbPool.query(`SELECT id,source,operation,model,config_id AS configId,profile_id AS profileId,
    reference_id AS referenceId,provider_host AS providerHost,status,http_status AS httpStatus,duration_ms AS durationMs,
    error_code AS errorCode,error_message AS errorMessage,created_at AS createdAt FROM ai_call_logs${condition}
    ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...params, input.pageSize, offset]);
  return { logs: rows as AiCallLog[], total: Number(countRows[0]?.total || 0) };
}
