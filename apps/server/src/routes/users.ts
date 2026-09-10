import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const usersRouter = Router();
const roles = ['advertiser', 'designer', 'customer_service', 'admin'] as const;

const userUpdateSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  department: z.string().max(64).optional(),
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional()
});

usersRouter.use(authenticate, requireRoles('admin'));

usersRouter.get('/', async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const keyword = String(req.query.keyword || '').trim();
    const role = String(req.query.role || 'all');
    const status = String(req.query.status || 'all');
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (keyword) {
      conditions.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.id LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (roles.includes(role as typeof roles[number])) {
      conditions.push('u.role = ?');
      params.push(role);
    }
    if (status === 'active' || status === 'inactive') {
      conditions.push('u.is_active = ?');
      params.push(status === 'active' ? 1 : 0);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countRows]: any = await dbPool.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    const total = Number(countRows?.[0]?.total || 0);
    const [rows]: any = await dbPool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.department, u.avatar_url, u.is_active, u.created_at, u.updated_at
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const ids = rows.map((row: any) => row.id);
    const roleMap = new Map<string, string[]>();
    if (ids.length) {
      const [roleRows]: any = await dbPool.query(`SELECT user_id, role FROM user_roles WHERE user_id IN (${ids.map(() => '?').join(',')})`, ids);
      for (const row of roleRows) roleMap.set(row.user_id, [...(roleMap.get(row.user_id) || []), row.role]);
    }
    const data = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone || undefined,
      role: row.role,
      roles: roleMap.get(row.id) || [row.role],
      department: row.department || undefined,
      avatarUrl: row.avatar_url || undefined,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    res.json({ code: 200, success: true, data, total, page, pageSize, hasMore: page * pageSize < total, timestamp: Date.now() });
  } catch (error) { next(error); }
});

usersRouter.patch('/:id', async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: 400, success: false, message: parsed.error.errors[0].message });
    const updates = parsed.data;
    if (req.params.id === req.user!.id && updates.isActive === false) return res.status(400).json({ code: 400, success: false, message: '不能停用当前登录的管理员账号' });
    const [existingRows]: any = await dbPool.query('SELECT id, role FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existingRows?.length) return res.status(404).json({ code: 404, success: false, message: '用户不存在' });
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.department !== undefined) { fields.push('department = ?'); values.push(updates.department); }
    if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
    if (updates.role !== undefined) {
      if (req.params.id === req.user!.id && updates.role !== 'admin') return res.status(400).json({ code: 400, success: false, message: '不能修改当前登录管理员的角色' });
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (fields.length) {
      values.push(req.params.id);
      await dbPool.query(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    }
    if (updates.role !== undefined) {
      const nextRoles = updates.role === 'advertiser' || updates.role === 'designer' ? ['advertiser', 'designer'] : [updates.role];
      await dbPool.query('DELETE FROM user_roles WHERE user_id = ?', [req.params.id]);
      for (const role of nextRoles) await dbPool.query('INSERT INTO user_roles (user_id, role, created_at) VALUES (?, ?, NOW())', [req.params.id, role]);
    }
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'users', action: updates.role !== undefined ? 'role_change' : updates.isActive !== undefined ? 'status_change' : 'update', targetType: 'user', targetId: req.params.id, summary: `${req.user!.name}更新用户「${req.params.id}」`, detail: { changedFields: Object.keys(updates), isActive: updates.isActive, role: updates.role }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 用户管理日志写入失败:', error));
    res.json({ code: 200, success: true, message: '用户信息已更新', timestamp: Date.now() });
  } catch (error) { next(error); }
});
