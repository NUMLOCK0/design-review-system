import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { dbPool } from '../config/database.js';
import { JWT_SECRET } from '../middleware/auth.middleware.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { storeChatMessage } from '../services/chat.js';
import type { ChatMessage } from '../services/chat.js';

let chatIo: Server | null = null;

export function publishChatMessage(message: ChatMessage, recipients: string[]) {
  for (const userId of recipients) chatIo?.to(userId === 'role:service' ? userId : `user:${userId}`).emit('chat:message', message);
}

export function attachChatSocket(httpServer: HttpServer, isAllowedOrigin: (origin: string | undefined) => boolean) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { credentials: true, origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
    allowRequest: (request, callback) => callback(null, isAllowedOrigin(request.headers.origin)),
    maxHttpBufferSize: 16 * 1024,
  });
  chatIo = io;

  io.use(async (socket, next) => {
    try {
      const ticket = socket.handshake.auth?.ticket;
      if (typeof ticket !== 'string') throw new Error('缺少聊天连接凭证');
      const payload = jwt.verify(ticket, JWT_SECRET) as { id?: string; purpose?: string };
      if (payload.purpose !== 'chat-socket' || !payload.id || !dbPool) throw new Error('无效的聊天连接凭证');
      const [rows]: any = await dbPool.query('SELECT id, email, name, role, is_active FROM users WHERE id=? LIMIT 1', [payload.id]);
      if (!rows[0]?.is_active || !['advertiser', 'designer', 'customer_service', 'admin'].includes(rows[0].role)) throw new Error('账号已失效');
      socket.data.user = { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role } as AuthUserPayload;
      next();
    } catch { next(new Error('聊天连接鉴权失败')); }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUserPayload;
    socket.join(`user:${user.id}`);
    if (user.role === 'customer_service' || user.role === 'admin') socket.join('role:service');
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
