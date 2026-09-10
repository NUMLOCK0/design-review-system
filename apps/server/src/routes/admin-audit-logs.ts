import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { getMemoryAuditLogs } from '../services/admin-audit.js';

export const adminAuditLogsRouter = Router();
adminAuditLogsRouter.use(authenticate, requireRoles('admin'));

adminAuditLogsRouter.get('/', async (req, res, next) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const module = String(req.query.module || '').trim();
    const operator = String(req.query.operator || '').trim();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 100);

    if (!dbPool) {
      const filtered = getMemoryAuditLogs().filter((log) => {
        const normalizedKeyword = keyword.toLowerCase();
        const keywordMatch = !keyword || [log.operatorName, log.operatorId, log.action, log.summary, log.targetId || '']
          .some((value) => value.toLowerCase().includes(normalizedKeyword));
        const moduleMatch = !module || log.module === module;
        const operatorMatch = !operator || log.operatorName.includes(operator) || log.operatorId.includes(operator);
        return keywordMatch && moduleMatch && operatorMatch;
      });
      const start = (page - 1) * pageSize;
      const data = filtered.slice(start, start + pageSize);
      return res.json({ code: 200, success: true, data, total: filtered.length, page, pageSize, hasMore: start + data.length < filtered.length, timestamp: Date.now() });
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (module) { conditions.push('module = ?'); params.push(module); }
    if (operator) { conditions.push('(operator_name LIKE ? OR operator_id LIKE ?)'); params.push(`%${operator}%`, `%${operator}%`); }
    if (keyword) {
      conditions.push('(operator_name LIKE ? OR operator_id LIKE ? OR action LIKE ? OR summary LIKE ? OR target_id LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows]: any = await dbPool.query(`SELECT COUNT(*) AS total FROM admin_audit_logs ${where}`, params);
    const total = Number(countRows?.[0]?.total || 0);
    const [rows]: any = await dbPool.query(
      `SELECT id, operator_id, operator_name, module, action, target_type, target_id, summary, detail_json, ip_address, created_at
       FROM admin_audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const data = rows.map((row: any) => ({
      id: row.id,
      operatorId: row.operator_id,
      operatorName: row.operator_name,
      module: row.module,
      action: row.action,
      targetType: row.target_type || undefined,
      targetId: row.target_id || undefined,
      summary: row.summary,
      detail: typeof row.detail_json === 'string' ? (() => { try { return JSON.parse(row.detail_json); } catch { return undefined; } })() : row.detail_json || undefined,
      ipAddress: row.ip_address || undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
    }));
    return res.json({ code: 200, success: true, data, total, page, pageSize, hasMore: page * pageSize < total, timestamp: Date.now() });
  } catch (error) { next(error); }
});
