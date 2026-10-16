import { Router } from 'express';
import { z } from 'zod';
import { dbPool } from '../config/database.js';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';

export const orderDraftsRouter = Router();
orderDraftsRouter.use(authenticate, requireRoles('advertiser'));
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const payloadSchema = z.object({
  step: z.number().int().min(0).max(4),
  title: z.string().max(120), category: z.string().max(80), platform: z.string().max(40),
  groupType: z.string().max(40), quantity: z.string().max(10), selectedStyles: z.array(z.string().max(80)).max(3),
  customStyle: z.string().max(300), brief: z.string().max(1000), links: z.array(z.string().max(2000)).max(5),
  days: z.string().max(3), urgency: z.enum(['normal', 'urgent', 'super_urgent']), requiresPsd: z.boolean(),
  budget: z.string().max(20), ruleId: z.string().max(100),
}).strict().refine((value) => JSON.stringify(value).length <= 20_000, '草稿内容过大');
const ok = (data: unknown) => ({ code: 200, success: true, data });

orderDraftsRouter.get('/current', async (req, res, next) => {
  try {
    if (!dbPool) fail('草稿保存需要数据库连接', 503);
    const [rows]: any = await dbPool!.query('SELECT version, payload_json, updated_at FROM order_creation_drafts WHERE user_id=? LIMIT 1', [req.user!.id]);
    const row = rows[0];
    res.json(ok(row ? { version: Number(row.version), payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json, updatedAt: row.updated_at } : null));
  } catch (error) { next(error); }
});

orderDraftsRouter.put('/current', async (req, res, next) => {
  try {
    if (!dbPool) fail('草稿保存需要数据库连接', 503);
    const body = z.object({ version: z.number().int().nonnegative(), payload: payloadSchema }).strict().parse(req.body);
    const connection = await dbPool!.getConnection();
    try {
      await connection.beginTransaction();
      const [rows]: any = await connection.query('SELECT version FROM order_creation_drafts WHERE user_id=? FOR UPDATE', [req.user!.id]);
      const currentVersion = rows[0] ? Number(rows[0].version) : 0;
      if (body.version !== currentVersion) fail('这份草稿已在其他设备更新，请重新载入后继续。', 409);
      const nextVersion = currentVersion + 1;
      await connection.query(`INSERT INTO order_creation_drafts (user_id, version, payload_json) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE version=VALUES(version), payload_json=VALUES(payload_json), updated_at=CURRENT_TIMESTAMP(3)`,
      [req.user!.id, nextVersion, JSON.stringify(body.payload)]);
      await connection.commit();
      res.json(ok({ version: nextVersion }));
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } catch (error) { next(error); }
});

orderDraftsRouter.delete('/current', async (req, res, next) => {
  try {
    if (!dbPool) fail('草稿服务需要数据库连接', 503);
    const version = z.number().int().nonnegative().parse(req.body?.version);
    const [result]: any = await dbPool!.query('DELETE FROM order_creation_drafts WHERE user_id=? AND version=?', [req.user!.id, version]);
    if (!result.affectedRows) fail('草稿版本已变化，未能清除旧草稿', 409);
    res.json(ok(null));
  } catch (error) { next(error); }
});

orderDraftsRouter.use((error: unknown, _req: any, res: any, next: (error: unknown) => void) => {
  if (error instanceof z.ZodError) return res.status(400).json({ code: 400, success: false, message: error.issues[0]?.message || '请求参数无效' });
  next(error);
});
