import { Router } from 'express';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { authenticate } from '../middleware/auth.middleware.js';
import { persistSiteMessage } from '../config/persistence.js';
import { pushWecomMessage } from '../services/wecom-bot.js';

export const messagesRouter = Router();
export const messages: SiteMessage[] = [
  { id: 'msg_welcome_cs', recipientId: 'u_rev_1', senderName: '系统通知', type: 'system', title: '客服工作台已启用', content: '你可以处理订单发布审核和订单纠纷。', link: '/service/dashboard', isRead: false, createdAt: new Date().toISOString() },
  { id: 'msg_welcome_admin', recipientId: 'u_admin_1', senderName: '系统通知', type: 'system', title: '系统管理员工作台已启用', content: '请在管理后台维护平台配置和审核规则。', link: '/admin', isRead: false, createdAt: new Date().toISOString() },
];

type MessageUpdate = { kind: 'sync' | 'new' | 'read' | 'read-all'; unreadCount: number; type?: SiteMessageType; messageId?: string };
const messageSubscribers = new Map<string, Set<import('express').Response>>();

function getUnreadCount(recipientId: string) {
  return messages.filter((message) => message.recipientId === recipientId && !message.isRead).length;
}

function sendMessageUpdate(response: import('express').Response, update: MessageUpdate) {
  if (!response.writableEnded && !response.destroyed) response.write(`event: messages:update\ndata: ${JSON.stringify(update)}\n\n`);
}

function publishMessageUpdate(recipientId: string, update: Omit<MessageUpdate, 'unreadCount'>) {
  const subscribers = messageSubscribers.get(recipientId);
  if (!subscribers?.size) return;
  const payload: MessageUpdate = { ...update, unreadCount: getUnreadCount(recipientId) };
  for (const response of subscribers) sendMessageUpdate(response, payload);
}

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
  publishMessageUpdate(recipientId, { kind: 'new', type: message.type, messageId: message.id });
  pushWecomMessage({ type: message.type, title: message.title, content: message.content, link: message.link, createdAt: message.createdAt });
}

messagesRouter.get('/events', authenticate, (req, res) => {
  const recipientId = req.user!.id;
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const subscribers = messageSubscribers.get(recipientId) || new Set<import('express').Response>();
  subscribers.add(res);
  messageSubscribers.set(recipientId, subscribers);
  sendMessageUpdate(res, { kind: 'sync', unreadCount: getUnreadCount(recipientId) });

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': heartbeat\n\n');
  }, 25_000);
  res.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
    if (!subscribers.size) messageSubscribers.delete(recipientId);
  });
});

messagesRouter.get('/summary', authenticate, (req, res) => {
  const mine = messages.filter((message) => message.recipientId === req.user!.id);
  const types: SiteMessageType[] = ['system', 'order', 'review', 'dispute', 'announcement'];
  const categories = types.map((type) => {
    const typedMessages = mine.filter((message) => message.type === type).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const latest = typedMessages[0];
    return {
      type,
      total: typedMessages.length,
      unreadCount: typedMessages.filter((message) => !message.isRead).length,
      latest: latest ? { id: latest.id, title: latest.title, content: latest.content, createdAt: latest.createdAt } : null,
    };
  });
  res.json({ code: 200, success: true, data: { unreadCount: mine.filter((message) => !message.isRead).length, categories }, timestamp: Date.now() });
});

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
      filteredUnreadCount: filtered.filter((message) => !message.isRead).length,
      page,
      pageSize,
      hasMore: start + pageSize < filtered.length,
    },
    timestamp: Date.now(),
  });
});

messagesRouter.get('/detail/:id', authenticate, (req, res) => {
  const message = messages.find((item) => item.id === req.params.id && item.recipientId === req.user!.id);
  if (!message) return res.status(404).json({ code: 404, success: false, message: '消息不存在' });
  res.json({ code: 200, success: true, data: message, timestamp: Date.now() });
});

messagesRouter.post('/read-all', authenticate, (req, res) => {
  const type = req.body?.type as SiteMessageType | undefined;
  const allowedTypes: SiteMessageType[] = ['system', 'order', 'review', 'dispute', 'announcement'];
  if (type && !allowedTypes.includes(type)) return res.status(400).json({ code: 400, success: false, message: '无效的消息类型' });
  const now = new Date().toISOString();
  messages.filter((message) => message.recipientId === req.user!.id && !message.isRead && (!type || message.type === type)).forEach((message) => {
    message.isRead = true;
    message.readAt = now;
    void persistSiteMessage(message);
  });
  publishMessageUpdate(req.user!.id, { kind: 'read-all', type });
  res.json({ code: 200, success: true, data: { unreadCount: getUnreadCount(req.user!.id) }, message: '消息已全部读完', timestamp: Date.now() });
});

messagesRouter.post('/:id/read', authenticate, (req, res) => {
  const message = messages.find((item) => item.id === req.params.id && item.recipientId === req.user!.id);
  if (!message) return res.status(404).json({ code: 404, success: false, message: '消息不存在' });
  message.isRead = true;
  message.readAt = new Date().toISOString();
  void persistSiteMessage(message);
  publishMessageUpdate(message.recipientId, { kind: 'read', type: message.type, messageId: message.id });
  res.json({ code: 200, success: true, message: '消息已读', data: message, unreadCount: getUnreadCount(message.recipientId), timestamp: Date.now() });
});
