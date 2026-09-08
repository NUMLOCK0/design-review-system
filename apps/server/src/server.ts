import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { reviewTasksRouter, tasks } from './routes/review-tasks.js';
import { reviewRulesRouter, rules } from './routes/review-rules.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/upload.js';
import { designOrders, designOrdersRouter } from './routes/design-orders.js';
import { systemConfigRouter } from './routes/system-config.js';
import { walletRouter } from './routes/wallet.js';
import { disputes, disputesRouter } from './routes/disputes.js';
import { messages, messagesRouter } from './routes/messages.js';
import { invitationsRouter } from './routes/invitations.js';
import { serviceRouter, serviceLogs } from './routes/service.js';
import { initializePersistence } from './config/persistence.js';
import { paymentsRouter } from './routes/payments.js';
import { ensureOssCors } from './config/oss-client.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件配置
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 仅公开带水印预览目录；原图统一存储在 private-uploads 或私有 OSS。
const uploadsDir = path.join(process.cwd(), 'uploads');
const previewUploadsDir = path.join(uploadsDir, 'previews');
if (!fs.existsSync(previewUploadsDir)) {
  fs.mkdirSync(previewUploadsDir, { recursive: true });
}
app.use('/uploads/previews', express.static(previewUploadsDir, { dotfiles: 'deny', index: false }));

// 健康检查路由
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'Design Review System Backend API',
    version: '1.0.0'
  });
});

// 业务路由注册
app.use('/api/auth', authRouter);
app.use('/api/review-tasks', reviewTasksRouter);
app.use('/api/review-rules', reviewRulesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/design-orders', designOrdersRouter);
app.use('/api/system-config', systemConfigRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/messages', messagesRouter);
app.use('/api', invitationsRouter);
app.use('/api/service', serviceRouter);

// 全局错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]:', err);
  res.status(err.status || 500).json({
    code: err.code || 500,
    success: false,
    message: err.message || '内部服务器错误',
    data: null,
    timestamp: Date.now()
  });
});

async function startServer() {
  await initializePersistence({ designOrders, rules, tasks, disputes, messages, serviceLogs });
  await ensureOssCors();
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` [API Server] 设计审核系统后端服务启动成功!`);
    console.log(` 访问地址: http://localhost:${PORT}`);
    console.log(` API 基础路径: http://localhost:${PORT}/api`);
    console.log(` 图片预览目录: http://localhost:${PORT}/uploads/previews`);
    console.log(`=======================================================`);
  });
}

void startServer();
