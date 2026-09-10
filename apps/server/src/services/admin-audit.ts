import crypto from 'crypto';
import type { AdminAuditLog } from '@design-review/shared';
import { dbPool } from '../config/database.js';

const memoryAuditLogs: AdminAuditLog[] = [];
type AuditInput = Omit<AdminAuditLog, 'id' | 'createdAt'> & Partial<Pick<AdminAuditLog, 'id' | 'createdAt'>>;

export async function recordAdminAudit(input: AuditInput) {
  const log: AdminAuditLog = {
    ...input,
    id: input.id || `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    createdAt: input.createdAt || new Date().toISOString()
  };
  memoryAuditLogs.unshift(log);
  if (memoryAuditLogs.length > 500) memoryAuditLogs.pop();
  if (dbPool) {
    await dbPool.query(
      `INSERT INTO admin_audit_logs
       (id, operator_id, operator_name, module, action, target_type, target_id, summary, detail_json, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [log.id, log.operatorId, log.operatorName, log.module, log.action, log.targetType || null, log.targetId || null,
        log.summary, log.detail ? JSON.stringify(log.detail) : null, log.ipAddress || null, log.createdAt]
    );
  }
  return log;
}

export function getMemoryAuditLogs() {
  return memoryAuditLogs;
}
