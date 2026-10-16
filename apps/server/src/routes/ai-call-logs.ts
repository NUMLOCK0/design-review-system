import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { listAiCallLogs } from '../services/ai-call-log.js';

export const aiCallLogsRouter = Router();
aiCallLogsRouter.use(authenticate, requireRoles('admin'));

aiCallLogsRouter.get('/', async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(['success', 'error']).optional(),
      source: z.string().trim().max(48).optional(),
    }).strict().parse(req.query);
    const result = await listAiCallLogs(query);
    res.json({ code: 200, success: true, data: result.logs, total: result.total, page: query.page, pageSize: query.pageSize });
  } catch (error) { next(error); }
});
