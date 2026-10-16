import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { WebSocket, WebSocketServer } from 'ws';
import { dbPool } from '../config/database.js';
import { JWT_SECRET } from '../middleware/auth.middleware.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { storeChatMessage } from '../services/chat.js';
import type { ChatMessage } from '../services/chat.js';

let chatIo: Server | null = null;
const miniSockets = new Map<string, Set<WebSocket>>();
const serviceMiniSockets = new Set<WebSocket>();
const onlineUsers = new Map<string, { connections: number; role: string }>();

function trackPresence(userId: string, role: string, connected: boolean) {
  const current = onlineUsers.get(userId);
  const connections = Math.max(0, (current?.connections || 0) + (connected ? 1 : -1));
  if (connections) onlineUsers.set(userId, { connections, role });
  else onlineUsers.delete(userId);
}

export function isCustomerServiceOnline(userId?: string | null) {
  if (userId) return onlineUsers.has(userId);
  return [...onlineUsers.values()].some((user) => user.connections > 0 && ['customer_service', 'admin'].includes(user.role));
}

type LiveMessageSignal = { type: 'chat:message'; kind: 'order' | 'intake'; conversationId: string; seq: number; message: Record<string, unknown>; orderId?: string };

function notifyMini(signal: LiveMessageSignal, recipients: string[]) {
  const targets = new Set<WebSocket>();
  for (const recipient of recipients) {
    const sockets = recipient === 'role:service' ? serviceMiniSockets : miniSockets.get(recipient);
    for (const socket of sockets || []) targets.add(socket);
  }
  const payload = JSON.stringify(signal);
  for (const socket of targets) if (socket.readyState === WebSocket.OPEN) {
    try { socket.send(payload); } catch { socket.terminate(); }
  }
}

export function publishMiniSiteMessage(recipientId: string, unreadCount: number) {
  const payload = JSON.stringify({ type: 'site:message', unreadCount });
  for (const socket of miniSockets.get(recipientId) || []) if (socket.readyState === WebSocket.OPEN) {
    try { socket.send(payload); } catch { socket.terminate(); }
  }
}

export function publishChatMessage(message: ChatMessage, recipients: string[]) {
  const signal: LiveMessageSignal = { type: 'chat:message', kind: 'order', conversationId: message.orderId,
    orderId: message.orderId, seq: message.seq, message: { ...message } };
  for (const userId of recipients) chatIo?.to(userId === 'role:service' ? userId : `user:${userId}`).emit('chat:message', signal);
  notifyMini(signal, recipients);
}

export function publishImageStudioEvent(ownerId: string, event: Record<string, unknown>) {
  chatIo?.to(`user:${ownerId}`).emit('image-studio:job:update', event);
}

export function publishIntakeMessage(message: { id: string; sessionId: string; seq: number; senderId: string; senderName: string; clientMessageId: string; body: string; createdAt: string }, recipients: string[]) {
  const signal: LiveMessageSignal = { type: 'chat:message', kind: 'intake', conversationId: message.sessionId,
    seq: message.seq, message: { ...message } };
  for (const userId of recipients) chatIo?.to(userId === 'role:service' ? userId : `user:${userId}`).emit('chat:message', signal);
  notifyMini(signal, recipients);
}

export function attachChatSocket(httpServer: HttpServer, isAllowedOrigin: (origin: string | undefined) => boolean) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { credentials: true, origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
    allowRequest: (request, callback) => callback(null, isAllowedOrigin(request.headers.origin)),
    maxHttpBufferSize: 16 * 1024,
  });
  chatIo = io;

  // uni.connectSocket speaks native WebSocket; Socket.IO's wire protocol is not compatible.
  const miniServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const isAllowedMiniOrigin = (origin: string | undefined) =>
    isAllowedOrigin(origin) || origin === 'https://servicewechat.com';
  httpServer.on('upgrade', async (request, socket, head) => {
    let url: URL;
    try { url = new URL(request.url || '', 'http://localhost'); } catch { return; }
    if (url.pathname !== '/chat/live') return;
    const reject = () => { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); };
    try {
      if (!isAllowedMiniOrigin(request.headers.origin) || !dbPool) return reject();
      const ticket = url.searchParams.get('ticket');
      if (!ticket) return reject();
      const payload = jwt.verify(ticket, JWT_SECRET) as { id?: string; purpose?: string };
      if (payload.purpose !== 'chat-socket' || !payload.id) return reject();
      const [rows]: any = await dbPool.query('SELECT id, role, is_active FROM users WHERE id=? LIMIT 1', [payload.id]);
      const user = rows[0];
      if (!user?.is_active || !['advertiser', 'designer', 'customer_service', 'admin'].includes(user.role)) return reject();
      miniServer.handleUpgrade(request, socket, head, (client) => {
        const userId = String(user.id);
        const connections = miniSockets.get(userId) || new Set<WebSocket>();
        connections.add(client); miniSockets.set(userId, connections);
        trackPresence(userId, String(user.role), true);
        if (user.role === 'customer_service' || user.role === 'admin') serviceMiniSockets.add(client);
        client.on('close', () => {
          trackPresence(userId, String(user.role), false);
          connections.delete(client);
          if (!connections.size) miniSockets.delete(userId);
          serviceMiniSockets.delete(client);
        });
        client.on('error', () => client.close());
      });
    } catch { reject(); }
  });

  io.use(async (socket, next) => {
    try {
      const ticket = socket.handshake.auth?.ticket;
      if (typeof ticket !== 'string') throw new Error('缺少聊天连接凭证');
      const payload = jwt.verify(ticket, JWT_SECRET) as { id?: string; purpose?: string };
      if (!['chat-socket', 'image-studio-socket'].includes(String(payload.purpose)) || !payload.id || !dbPool) throw new Error('无效的实时连接凭证');
      const [rows]: any = await dbPool.query('SELECT id, email, name, role, is_active FROM users WHERE id=? LIMIT 1', [payload.id]);
      if (!rows[0]?.is_active || !['advertiser', 'designer', 'customer_service', 'admin'].includes(rows[0].role)) throw new Error('账号已失效');
      if (payload.purpose === 'image-studio-socket' && rows[0].role !== 'customer_service') throw new Error('生图工作台仅对客服开放');
      socket.data.user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role } as AuthUserPayload;
      next();
    } catch { next(new Error('聊天连接鉴权失败')); }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUserPayload;
    trackPresence(user.id, user.role, true);
    socket.join(`user:${user.id}`);
    if (user.role === 'customer_service' || user.role === 'admin') socket.join('role:service');
    socket.on('disconnect', () => trackPresence(user.id, user.role, false));
    socket.on('chat:send', async (input: unknown, ack?: (result: unknown) => void) => {
      if (typeof ack !== 'function') return;
      try {
        const result = await storeChatMessage(input, user);
        // Acknowledge only after the transaction has committed. An uncertain commit is retried with the same ID.
        ack({ ok: true, message: result.message });
        if (!result.duplicate) publishChatMessage(result.message, result.recipients);
      } catch (error: any) {
        ack({ ok: false, error: error?.name === 'ZodError' ? '消息格式无效' : error?.status && error.status < 500 ? error.message : '消息暂未保存，请稍后重试' });
      }
    });
  });
  return io;
}
