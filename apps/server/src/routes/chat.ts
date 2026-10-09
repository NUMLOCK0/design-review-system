import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticate, JWT_SECRET } from '../middleware/auth.middleware.js';
import { getChatOrder, listChatConversations, listChatMessages, storeChatMessage, requireChatDatabase, getConversationAssignment, getConversationTransferHistory, getServiceAgents, transferServiceConversation } from '../services/chat.js';
import { publishChatMessage } from '../socket/chat-socket.js';

export const chatRouter = Router();
chatRouter.use(authenticate);

chatRouter.post('/socket-ticket', (req, res) => {
  const user = req.user!;
  const ticket = jwt.sign({ id: user.id, purpose: 'chat-socket' }, JWT_SECRET, { expiresIn: '60s' });
  res.json({ code: 200, success: true, data: { ticket, expiresIn: 60 } });
});

chatRouter.get('/conversations', async (req, res, next) => {
  try {
    const page = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    res.json({ code: 200, success: true, data: await listChatConversations(req.user!, page.limit, page.offset) });
  }
  catch (error) { next(error); }
});

chatRouter.get('/service-agents', async (req, res, next) => {
  try {
    if (!['customer_service', 'admin'].includes(req.user!.role)) return res.status(403).json({ code: 403, success: false, message: '只有客服可以查看接待人员' });
    res.json({ code: 200, success: true, data: await getServiceAgents() });
  } catch (error) { next(error); }
});

chatRouter.get('/orders/:orderId', async (req, res, next) => {
  try {
    const order = await getChatOrder(req.params.orderId, req.user!);
    const assignment = await getConversationAssignment('order', req.params.orderId);
    res.json({ code: 200, success: true, data: {
      orderId: req.params.orderId, orderNo: order.order_no, title: order.title,
      category: order.category, platform: order.platform, budget: Number(order.budget),
      deadline: order.deadline, requirements: order.requirements || '', status: order.status,
      requiresPsd: Boolean(order.requires_psd), creatorName: order.creator_name,
      designerName: order.claimed_by_name || '',
      ...assignment,
    } });
  } catch (error) { next(error); }
});

chatRouter.get('/orders/:orderId/transfers', async (req, res, next) => {
  try {
    if (!['customer_service', 'admin'].includes(req.user!.role)) return res.status(403).json({ code: 403, success: false, message: '只有客服可以查看转接记录' });
    await getChatOrder(req.params.orderId, req.user!);
    res.json({ code: 200, success: true, data: await getConversationTransferHistory('order', req.params.orderId) });
  } catch (error) { next(error); }
});

chatRouter.post('/orders/:orderId/transfer', async (req, res, next) => {
  try {
    if (!['customer_service', 'admin'].includes(req.user!.role)) return res.status(403).json({ code: 403, success: false, message: '只有客服可以转接会话' });
    const body = z.object({ toServiceId: z.string().min(1).max(64), note: z.string().trim().max(500).default('') }).strict().parse(req.body);
    const assignment = await transferServiceConversation('order', req.params.orderId, body.toServiceId, body.note, req.user!);
    res.json({ code: 200, success: true, data: assignment });
  } catch (error) { if (error instanceof z.ZodError) return res.status(400).json({ code: 400, success: false, message: '转接信息无效' }); next(error); }
});

chatRouter.get('/orders/:orderId/finance', async (req, res, next) => {
  try {
    await getChatOrder(req.params.orderId, req.user!);
    const [rows]: any = await requireChatDatabase().query('SELECT budget, deposit_rate, deposit_amount, payment_status FROM design_orders WHERE id=? LIMIT 1', [req.params.orderId]);
    if (!rows[0]) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
    res.json({ code: 200, success: true, data: {
      budget: Number(rows[0].budget || 0), depositRate: rows[0].deposit_rate == null ? null : Number(rows[0].deposit_rate),
      depositAmount: rows[0].deposit_amount == null ? null : Number(rows[0].deposit_amount), paymentStatus: String(rows[0].payment_status || 'unknown'),
    } });
  } catch (error) { next(error); }
});

chatRouter.get('/orders/:orderId/messages', async (req, res, next) => {
  try {
    const parsed = z.coerce.number().int().min(0).safe().safeParse(req.query.afterSeq ?? 0);
    if (!parsed.success) return res.status(400).json({ code: 400, success: false, message: 'afterSeq 必须为非负整数' });
    const afterSeq = parsed.data;
    const data = await listChatMessages(req.params.orderId, req.user!, afterSeq);
    res.json({ code: 200, success: true, data });
  } catch (error) { next(error); }
});

chatRouter.post('/orders/:orderId/messages', async (req, res, next) => {
  try {
    const result = await storeChatMessage({ ...req.body, orderId: req.params.orderId }, req.user!);
    if (!result.duplicate) publishChatMessage(result.message, result.recipients);
    res.status(result.duplicate ? 200 : 201).json({ code: 200, success: true, data: result.message });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ code: 400, success: false, message: '消息格式无效' });
    next(error);
  }
});
