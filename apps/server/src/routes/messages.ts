import { Router } from 'express';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { persistSiteMessage } from '../config/persistence.js';

export const messagesRouter = Router();
export const messages: SiteMessage[] = [
  { id: 'msg_welcome_cs', recipientId: 'u_rev_1', senderName: '系统通知', type: 'system', title: '客服工作台已启用', content: '你可以处理订单发布审核和订单纠纷。', link: '/service/dashboard', isRead: false, createdAt: new Date().toISOString() },
  { id: 'msg_welcome_admin', recipientId: 'u_admin_1', senderName: '系统通知', type: 'system', title: '系统管理员工作台已启用', content: '请在管理后台维护平台配置和审核规则。', link: '/admin', isRead: false, createdAt: new Date().toISOString() },
];

export function notifyUser(recipientId: string | undefined, input: { type: SiteMessageType; title: string; content: string; link?: string; senderName?: string }) {
  if (!recipientId) return;
  const message: SiteMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recipientId,
    senderName: input.senderName || '系统通知',
    type: input.type,
    title: input.title,
    content: input.content,
    link: input.link,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  messages.unshift(message);
  void persistSiteMessage(message);
}

messagesRouter.get('/', authenticate, (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 50);
  const mine = messages.filter((message) => message.recipientId === req.user!.id);
  const type = String(req.query.type || 'all');
  const filtered = type === 'all' ? mine : mine.filter((message) => message.type === type);
  const start = (page - 1) * pageSize;
  res.json({
    code: 200,
    success: true,
    data: {
      list: filtered.slice(start, start + pageSize),
      total: filtered.length,
      unreadCount: mine.filter((message) => !message.isRead).length,
      page,
      pageSize,
      hasMore: start + pageSize < filtered.length,
    },
    timestamp: Date.now(),
  });
});

messagesRouter.post('/read-all', authenticate, (req, res) => {
  const now = new Date().toISOString();
  messages.filter((message) => message.recipientId === req.user!.id && !message.isRead).forEach((message) => {
    message.isRead = true;
    message.readAt = now;
    void persistSiteMessage(message);
  });
  res.json({ code: 200, success: true, message: '消息已全部读完', timestamp: Date.now() });
});

messagesRouter.post('/:id/read', authenticate, (req, res) => {
  const message = messages.find((item) => item.id === req.params.id && item.recipientId === req.user!.id);
  if (!message) return res.status(404).json({ code: 404, success: false, message: '消息不存在' });
  message.isRead = true;
  message.readAt = new Date().toISOString();
  void persistSiteMessage(message);
  res.json({ code: 200, success: true, message: '消息已读', data: message, timestamp: Date.now() });
});
